import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Bot,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  History,
  Loader2,
  MessageCircle,
  PenLine,
  Plus,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { CodexDiffPreview, getDiffStats } from "@/components/ai/DiffPreview";
import { renderMarkdownForTheme } from "@/lib/markdown";
import { formatLuoguSolution, type SolutionFormatChange } from "@/lib/solutionFormatter";
import { cn } from "@/lib/utils";
import type { AiPolishPreview, AiSidebarNoteContext, AiSidebarProps } from "@/components/ai/types";
import {
  openExternalUrl,
  polishFullNote,
  polishSelectedText,
  suggestNoteTags,
  startCurrentNoteChatStream,
  type AiConfig,
  type AiModel,
  type AiProvider,
  type NoteChatContextPayload,
  type NoteChatHistoryMessage,
  type NoteChatStreamChunkEvent,
  type NoteChatStreamDoneEvent,
  type NoteChatStreamErrorEvent,
} from "@/lib/api";

type AiChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  kind?: "text" | "tag-suggestion" | "polish-preview";
  commandId?: string;
  tagSuggestion?: TagSuggestionResult;
  polishPreview?: PolishPreviewResult;
  state?: "done" | "loading" | "streaming" | "error";
  retryText?: string;
  retryDisplayText?: string;
  retryCommandId?: string;
  requestId?: number;
  streamId?: string;
  retryContext?: NoteChatContextPayload;
  retrySelectionRange?: TextRange | null;
  retrySelectionStartLine?: number | null;
  retryInstruction?: string;
  startedAt?: number;
  finishedAt?: number;
  elapsedMs?: number;
};

type TagSuggestionResult = {
  notePath: string;
  existingTags: string[];
  suggestedTags: string[];
  reason?: string;
  applied?: boolean;
  ignored?: boolean;
  error?: string;
};

type TextRange = {
  from: number;
  to: number;
};

type PolishPreviewResult = AiPolishPreview;

type AiConversation = {
  id: string;
  title: string;
  messages: AiChatMessage[];
  providerId?: string;
  modelId?: string;
  createdAt: number;
  updatedAt: number;
};

type AiConversationStorage = {
  conversations: AiConversation[];
  activeConversationId: string;
};

type StreamTarget = {
  conversationId: string;
  messageId: string;
  requestId: number;
};

type SlashCommand = {
  id: string;
  trigger?: string;
  label: string;
  description: string;
  category: "文档" | "上下文";
  icon: ComponentType<{ className?: string }>;
  requiresNote?: boolean;
  requiresBody?: boolean;
  requiresSelection?: boolean;
  requiresSelectionOrCursor?: boolean;
  mode: "readonly" | "preview" | "diff";
  implemented?: boolean;
};

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "polish-all",
    trigger: "全文润色",
    label: "全文润色",
    description: "为当前笔记准备润色建议。",
    category: "文档",
    icon: Sparkles,
    requiresNote: true,
    requiresBody: true,
    mode: "preview",
    implemented: true,
  },
  {
    id: "solution-format",
    trigger: "题解格式化",
    label: "题解格式化（仅格式）",
    description: "按洛谷题解规范整理空格、标点、数学符号和 Markdown 排版，不改原文意思。",
    category: "文档",
    icon: Sparkles,
    requiresNote: true,
    requiresBody: true,
    mode: "diff",
    implemented: true,
  },
  {
    id: "polish-selection",
    trigger: "润色选中",
    label: "润色选中",
    description: "只处理当前选中的文本。",
    category: "文档",
    icon: PenLine,
    requiresNote: true,
    requiresSelection: true,
    mode: "preview",
    implemented: true,
  },
  {
    id: "complete-tags",
    trigger: "补全标签",
    label: "补全标签",
    description: "根据笔记正文建议标签。",
    category: "文档",
    icon: Tag,
    requiresNote: true,
    mode: "preview",
    implemented: true,
  },
  {
    id: "summarize",
    trigger: "总结本文",
    label: "总结本文",
    description: "为当前笔记生成摘要。",
    category: "文档",
    icon: FileText,
    requiresNote: true,
    requiresBody: true,
    mode: "readonly",
    implemented: true,
  },
  {
    id: "explain-paragraph",
    trigger: "解释当前段落",
    label: "解释当前段落",
    description: "解释光标附近的上下文。",
    category: "上下文",
    icon: BookOpen,
    requiresNote: true,
    requiresSelectionOrCursor: true,
    mode: "readonly",
    implemented: true,
  },
  {
    id: "compress-context",
    trigger: "压缩上下文",
    label: "压缩上下文",
    description: "准备更紧凑的对话上下文。",
    category: "上下文",
    icon: Archive,
    mode: "readonly",
  },
  {
    id: "retrospective",
    trigger: "生成复盘",
    label: "生成复盘",
    description: "准备 OI 题解复盘建议。",
    category: "上下文",
    icon: ClipboardList,
    requiresNote: true,
    mode: "readonly",
  },
];

const COMMAND_CATEGORIES: SlashCommand["category"][] = ["文档", "上下文"];
const NOTE_CHAT_MAX_MARKDOWN_CHARS = 16000;
const NOTE_CHAT_MAX_SELECTION_CHARS = 4000;
const NOTE_CHAT_MAX_PARAGRAPH_CHARS = 4000;
const AI_CONVERSATIONS_STORAGE_KEY = "oi-notebook.aiConversations";
const AI_INCLUDE_NOTE_CONTEXT_STORAGE_KEY = "oi-notebook.ai.includeCurrentNoteContext";
const AI_CONVERSATION_LIMIT = 20;
const AI_CONVERSATION_MESSAGE_LIMIT = 100;
const AI_REQUEST_HISTORY_LIMIT = 8;
const AI_REQUEST_HISTORY_MESSAGE_MAX_CHARS = 1200;
const AI_SCROLL_BOTTOM_THRESHOLD = 64;
const UNTITLED_CONVERSATION_TITLE = "New chat";
const SOLUTION_RULE_IDS = new Set<SolutionFormatChange["ruleId"]>([
  "cjk_spacing",
  "punctuation_normalize",
  "inline_math_wrap",
  "math_symbol_latex",
  "math_spacing",
  "heading_marker_spacing",
  "blank_lines_around_headings",
  "blank_lines_around_code_fences",
  "blank_lines_around_lists",
  "normalize_code_fence_lang",
]);

const readIncludeCurrentNoteContextPreference = (): boolean => {
  try {
    return window.localStorage.getItem(AI_INCLUDE_NOTE_CONTEXT_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
};

const getCommandDisabledReason = (command: SlashCommand, context: AiSidebarNoteContext): string | null => {
  if (command.requiresNote && !context.filePath) return "需要先打开笔记";
  if (command.requiresBody && !context.hasBody) return "当前笔记还没有正文";
  if (command.requiresSelection && context.selectionStatus !== "available") {
    return "需要先选中文本";
  }
  if (
    command.requiresSelectionOrCursor &&
    context.selectionStatus !== "available" &&
    context.currentParagraphStatus !== "available"
  ) {
    return "需要先选中文本，或把光标放在段落中";
  }
  return null;
};

const getCommandByInput = (value: string): SlashCommand | undefined => {
  const commandText = value.trim().replace(/^\/+/, "").trim();
  if (!commandText) return undefined;

  return SLASH_COMMANDS.find((command) => (
    commandText === command.label ||
    commandText === command.trigger ||
    commandText === command.id ||
    commandText.startsWith(`${command.label} `) ||
    (!!command.trigger && commandText.startsWith(`${command.trigger} `))
  ));
};

const getCommandDisplayText = (command: SlashCommand, rawInput?: string): string => {
  const value = rawInput?.trim();
  return value?.startsWith("/") ? value : `/${command.trigger ?? command.label}`;
};

const getCommandArgument = (command: SlashCommand, rawInput?: string): string => {
  const value = rawInput?.trim().replace(/^\/+/, "").trim();
  if (!value) return "";
  if (value === command.label || value === command.trigger || value === command.id) return "";

  for (const prefix of [command.label, command.trigger, command.id]) {
    if (!prefix) continue;
    if (value.startsWith(`${prefix} `)) {
      return value.slice(prefix.length).trim();
    }
  }

  return "";
};

const getSelectionLabel = (context: AiSidebarNoteContext): string => {
  if (context.selectionStatus === "available") return `selected ${context.selectedTextLength ?? 0} chars`;
  if (context.selectionStatus === "empty") return "no selection";
  return "selection unavailable";
};

const getCompactPath = (path: string): string => path.replace(/\\/g, "/");

const getFileNameFromPath = (path: string): string => {
  const normalized = getCompactPath(path);
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || normalized || "未命名文件";
};

const truncateText = (text: string, maxChars: number): { text: string; truncated: boolean } => {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
};

const getLineNumberAtOffset = (text: string, offset: number | null | undefined): number | null => {
  if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0 || offset > text.length) return null;
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
};

const getPolishPreviewDisplayStartLine = (preview: Pick<PolishPreviewResult, "scope" | "selectionStartLine">): number => {
  if (preview.scope === "full-note") return 1;
  return typeof preview.selectionStartLine === "number" &&
    Number.isFinite(preview.selectionStartLine) &&
    preview.selectionStartLine > 0
    ? Math.floor(preview.selectionStartLine)
    : 1;
};

const normalizeTagValue = (tag: string): string => tag.trim().replace(/\s+/g, " ");

const normalizeTags = (tags: string[]): string[] => {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const value = normalizeTagValue(tag);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
};

const filterNewTags = (existingTags: string[], suggestedTags: string[]): string[] => {
  const existing = new Set(normalizeTags(existingTags));
  return normalizeTags(suggestedTags).filter((tag) => !existing.has(tag));
};

const toTagSuggestionResult = (
  suggestion: { suggestedTags: string[]; reason?: string },
  notePath: string,
  existingTags: string[],
): TagSuggestionResult => ({
  notePath,
  existingTags: normalizeTags(existingTags),
  suggestedTags: filterNewTags(existingTags, suggestion.suggestedTags),
  reason: suggestion.reason?.trim() || undefined,
});

const getChatErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const detailStart = message.indexOf("; debug=");
  const scopedMessage = detailStart >= 0 ? message.slice(0, detailStart) : message;
  const normalized = scopedMessage.replace(/^AI chat(?: stream)? failed:\s*/i, "").trim();

  if (
    message.includes("base_url is missing") ||
    message.includes("api_key is missing") ||
    message.includes("model is missing")
  ) {
    return "AI is not configured. Open settings and fill base_url / api_key / model.";
  }
  if (message.includes("request timed out")) return "The request timed out. Please retry.";
  if (message.includes("network error")) return "Could not connect to the AI service.";
  if (normalized.includes("empty stream")) return "The AI service returned an empty stream. Please retry.";
  if (normalized.includes("non JSON stream chunk") || normalized.includes("unreadable stream chunk")) {
    return "The AI service returned an unreadable stream chunk. Please retry.";
  }
  if (normalized.includes("stream interrupted")) return "The AI response was interrupted. Please retry.";
  if (normalized.includes("HTTP ")) return "The AI service returned an error response. Check settings and retry.";
  if (normalized.startsWith("AI ")) return normalized;
  return "AI chat failed. Please retry.";
};

const getTagSuggestionErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const detailStart = message.indexOf("; debug=");
  const scopedMessage = detailStart >= 0 ? message.slice(0, detailStart) : message;
  const normalized = scopedMessage.replace(/^AI tag suggestion failed:\s*/i, "").trim();

  if (
    message.includes("base_url is missing") ||
    message.includes("api_key is missing") ||
    message.includes("model is missing")
  ) {
    return "AI 还没有配置完整，请先在设置里填写 base_url / api_key / model。";
  }
  if (message.includes("selected provider does not exist") || message.includes("selected provider is disabled")) {
    return "当前配置组不可用，请重新选择模型。";
  }
  if (message.includes("selected model does not exist")) {
    return "当前模型不可用，请重新选择模型。";
  }
  if (message.includes("request timed out")) return "标签建议请求超时，请重试。";
  if (message.includes("network error")) return "无法连接 AI 服务，请检查配置和网络。";
  if (normalized.includes("response JSON parse failed")) return "标签建议解析失败，请重试。";
  if (normalized.includes("suggestedTags")) return "标签建议格式不正确，请重试。";
  if (normalized.includes("HTTP ")) return "AI 服务返回错误响应，请检查配置后重试。";
  if (normalized) return normalized;
  return "标签建议生成失败，请重试。";
};

const getPolishSelectionErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const detailStart = message.indexOf("; debug=");
  const scopedMessage = detailStart >= 0 ? message.slice(0, detailStart) : message;
  const normalized = scopedMessage.replace(/^AI selection polish failed:\s*/i, "").trim();

  if (
    message.includes("base_url is missing") ||
    message.includes("api_key is missing") ||
    message.includes("model is missing")
  ) {
    return "AI 还没有配置完整，请先在设置里填写 base_url / api_key / model。";
  }
  if (message.includes("selected provider does not exist") || message.includes("selected provider is disabled")) {
    return "当前配置组不可用，请重新选择模型。";
  }
  if (message.includes("selected model does not exist")) {
    return "当前模型不可用，请重新选择模型。";
  }
  if (message.includes("request timed out")) return "润色请求超时，请重试。";
  if (message.includes("network error")) return "无法连接 AI 服务，请检查配置和网络。";
  if (normalized.includes("response JSON parse failed") || normalized.includes("polishedText")) {
    return "润色结果解析失败，请重试。";
  }
  if (normalized.includes("selected text is empty")) return "请先在编辑器中选中一段需要润色的文字。";
  if (normalized.includes("HTTP ")) return "AI 服务返回错误响应，请检查配置后重试。";
  if (normalized) return normalized;
  return "润色选中内容失败，请重试。";
};

const getPolishFullNoteErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const detailStart = message.indexOf("; debug=");
  const scopedMessage = detailStart >= 0 ? message.slice(0, detailStart) : message;
  const normalized = scopedMessage.replace(/^AI full note polish failed:\s*/i, "").trim();

  if (
    message.includes("base_url is missing") ||
    message.includes("api_key is missing") ||
    message.includes("model is missing")
  ) {
    return "AI 还没有配置完整，请先在设置里填写 base_url / api_key / model。";
  }
  if (message.includes("selected provider does not exist") || message.includes("selected provider is disabled")) {
    return "当前配置组不可用，请重新选择模型。";
  }
  if (message.includes("selected model does not exist")) {
    return "当前模型不可用，请重新选择模型。";
  }
  if (message.includes("request timed out")) return "全文润色请求超时，请重试。";
  if (message.includes("network error")) return "无法连接 AI 服务，请检查配置和网络。";
  if (message.includes("read_error=") && message.toLowerCase().includes("timed out")) {
    return "全文润色响应读取超时，可能是正文较长或服务端生成太慢，请稍后重试。";
  }
  if (message.includes("read_error=")) {
    return "全文润色响应体读取失败，可能是服务端中途断开连接，请稍后重试。";
  }
  if (normalized.includes("response JSON parse failed") || normalized.includes("polishedBody")) {
    return "全文润色结果解析失败，请重试。";
  }
  if (normalized.includes("note body is empty")) return "当前笔记正文为空，无法全文润色。";
  if (normalized.includes("HTTP ")) return "AI 服务返回错误响应，请检查配置后重试。";
  if (normalized) return normalized;
  return "全文润色失败，请重试。";
};

const createConversationId = (): string =>
  `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const createMessageId = (sequence: number): string => `msg-${Date.now().toString(36)}-${sequence}`;

const createEmptyConversation = (now = Date.now()): AiConversation => ({
  id: createConversationId(),
  title: UNTITLED_CONVERSATION_TITLE,
  messages: [],
  createdAt: now,
  updatedAt: now,
});

const getEnabledProviderModels = (provider: AiProvider | undefined): AiModel[] =>
  provider?.models.filter((model) => model.enabled) ?? [];

const getPreferredModelForProvider = (provider: AiProvider | undefined, config: AiConfig | null): AiModel | undefined => {
  if (!provider) return undefined;
  const enabledModels = getEnabledProviderModels(provider);
  return (
    enabledModels.find((model) => model.id === provider.default_model) ??
    enabledModels.find((model) => model.id === config?.default_model_id) ??
    enabledModels[0]
  );
};

const getDefaultConversationModel = (config: AiConfig | null): Pick<AiConversation, "providerId" | "modelId"> => ({
  providerId: config?.default_provider_id ?? config?.providers.find((provider) => provider.enabled)?.id,
  modelId: (config?.default_model_id ?? config?.model) || undefined,
});

const getConversationTitleFromQuestion = (question: string): string => {
  const compact = question.replace(/\s+/g, " ").trim();
  if (!compact) return UNTITLED_CONVERSATION_TITLE;
  return compact.length <= 28 ? compact : `${compact.slice(0, 28)}...`;
};

const isAiChatMessage = (value: unknown): value is AiChatMessage => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AiChatMessage>;
  return typeof item.id === "string" && typeof item.text === "string" && (
    item.role === "user" || item.role === "assistant" || item.role === "system"
  );
};

const sanitizeTagSuggestionForStorage = (value: unknown): TagSuggestionResult | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<TagSuggestionResult>;
  if (typeof item.notePath !== "string") return undefined;
  if (!Array.isArray(item.existingTags) || !Array.isArray(item.suggestedTags)) return undefined;

  return {
    notePath: item.notePath,
    existingTags: normalizeTags(item.existingTags.filter((tag): tag is string => typeof tag === "string")),
    suggestedTags: normalizeTags(item.suggestedTags.filter((tag): tag is string => typeof tag === "string")),
    reason: typeof item.reason === "string" ? item.reason : undefined,
    applied: item.applied === true,
    ignored: item.ignored === true,
    error: typeof item.error === "string" ? item.error : undefined,
  };
};

const sanitizeTextRangeForStorage = (value: unknown): TextRange | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<TextRange>;
  if (typeof item.from !== "number" || typeof item.to !== "number") return null;
  if (!Number.isFinite(item.from) || !Number.isFinite(item.to)) return null;
  return { from: item.from, to: item.to };
};

const sanitizePolishPreviewForStorage = (value: unknown): PolishPreviewResult | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<PolishPreviewResult>;
  if (typeof item.previewId !== "string") return undefined;
  if (typeof item.notePath !== "string") return undefined;
  if (typeof item.originalText !== "string") return undefined;
  if (typeof item.polishedText !== "string") return undefined;
  const scope = item.scope === "full-note" ? "full-note" : "selection";
  const selectionStartLine = typeof item.selectionStartLine === "number" &&
    Number.isFinite(item.selectionStartLine) &&
    item.selectionStartLine > 0
    ? Math.floor(item.selectionStartLine)
    : null;

  return {
    previewId: item.previewId,
    previewKind: item.previewKind === "solution-format" ? "solution-format" : "ai-polish",
    scope,
    notePath: item.notePath,
    originalText: item.originalText,
    polishedText: item.polishedText,
    selectionRange: sanitizeTextRangeForStorage(item.selectionRange),
    selectionStartLine: scope === "full-note" ? 1 : selectionStartLine,
    instruction: typeof item.instruction === "string" ? item.instruction : undefined,
    changes: Array.isArray(item.changes)
      ? item.changes.flatMap((change) => {
        if (!change || typeof change !== "object") return [];
        const candidate = change as Partial<SolutionFormatChange>;
        if (
          typeof candidate.ruleId !== "string" ||
          !SOLUTION_RULE_IDS.has(candidate.ruleId as SolutionFormatChange["ruleId"]) ||
          typeof candidate.message !== "string" ||
          typeof candidate.count !== "number" ||
          !Number.isFinite(candidate.count)
        ) {
          return [];
        }
        return [{
          ruleId: candidate.ruleId as SolutionFormatChange["ruleId"],
          message: candidate.message,
          count: Math.max(0, Math.floor(candidate.count)),
        }];
      })
      : undefined,
    applied: item.applied === true,
    ignored: item.ignored === true,
    error: typeof item.error === "string" ? item.error : undefined,
  };
};

const getPreviewTitle = (preview: PolishPreviewResult): string => {
  if (preview.previewKind === "solution-format") return "题解格式化预览";
  return preview.scope === "full-note" ? "全文润色预览" : "润色预览";
};

const getPreviewApplyLabel = (preview: PolishPreviewResult): string => {
  if (preview.previewKind === "solution-format") return "应用题解格式化";
  return preview.scope === "full-note" ? "应用全文润色" : "应用到选区";
};

const sanitizeMessagesForStorage = (messages: AiChatMessage[]): AiChatMessage[] =>
  messages.slice(-AI_CONVERSATION_MESSAGE_LIMIT).map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    kind: message.kind,
    commandId: message.commandId,
    tagSuggestion: sanitizeTagSuggestionForStorage(message.tagSuggestion),
    polishPreview: sanitizePolishPreviewForStorage(message.polishPreview),
    state: message.state === "error" ? "error" : "done",
    retryText: message.retryText,
    retryDisplayText: message.retryDisplayText,
    retryCommandId: message.retryCommandId,
    requestId: message.requestId,
    retrySelectionRange: sanitizeTextRangeForStorage(message.retrySelectionRange),
    retrySelectionStartLine: typeof message.retrySelectionStartLine === "number" &&
      Number.isFinite(message.retrySelectionStartLine) &&
      message.retrySelectionStartLine > 0
      ? Math.floor(message.retrySelectionStartLine)
      : null,
    retryInstruction: message.retryInstruction,
    startedAt: message.startedAt,
    finishedAt: message.finishedAt,
    elapsedMs: message.elapsedMs,
  }));

const hasConversationContent = (conversation: AiConversation): boolean =>
  conversation.messages.some((message) => (
    (message.role === "user" || message.role === "assistant") && message.text.trim().length > 0
  ));

const sanitizeConversation = (value: unknown): AiConversation | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<AiConversation>;
  if (typeof item.id !== "string" || typeof item.title !== "string") return null;
  if (!Array.isArray(item.messages)) return null;

  const createdAt = typeof item.createdAt === "number" ? item.createdAt : Date.now();
  const updatedAt = typeof item.updatedAt === "number" ? item.updatedAt : createdAt;
  return {
    id: item.id,
    title: item.title.trim() || UNTITLED_CONVERSATION_TITLE,
    messages: sanitizeMessagesForStorage(item.messages.filter(isAiChatMessage)),
    providerId: typeof item.providerId === "string" ? item.providerId : undefined,
    modelId: typeof item.modelId === "string" ? item.modelId : undefined,
    createdAt,
    updatedAt,
  };
};

const limitConversations = (conversations: AiConversation[]): AiConversation[] =>
  [...conversations]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, AI_CONVERSATION_LIMIT);

const pruneBlankConversations = (conversations: AiConversation[], activeConversationId: string): AiConversation[] => {
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);
  const keepBlankConversationId = activeConversation && !hasConversationContent(activeConversation)
    ? activeConversation.id
    : conversations.find((conversation) => !hasConversationContent(conversation))?.id;

  return conversations.filter((conversation) => (
    hasConversationContent(conversation) || conversation.id === keepBlankConversationId
  ));
};

const loadConversationState = (): AiConversationStorage => {
  const fallback = createEmptyConversation();

  try {
    const raw = window.localStorage.getItem(AI_CONVERSATIONS_STORAGE_KEY);
    if (!raw) {
      return { conversations: [fallback], activeConversationId: fallback.id };
    }

    const parsed = JSON.parse(raw) as Partial<AiConversationStorage>;
    const conversations = limitConversations(
      Array.isArray(parsed.conversations)
        ? parsed.conversations.map(sanitizeConversation).filter((item): item is AiConversation => item !== null)
        : [],
    );
    if (conversations.length === 0) {
      return { conversations: [fallback], activeConversationId: fallback.id };
    }

    const activeConversationId =
      typeof parsed.activeConversationId === "string" &&
      conversations.some((conversation) => conversation.id === parsed.activeConversationId)
        ? parsed.activeConversationId
        : conversations[0].id;

    const prunedConversations = limitConversations(pruneBlankConversations(conversations, activeConversationId));
    return {
      conversations: prunedConversations,
      activeConversationId: prunedConversations.some((conversation) => conversation.id === activeConversationId)
        ? activeConversationId
        : prunedConversations[0].id,
    };
  } catch (error) {
    console.warn("Load AI conversations failed:", error);
    return { conversations: [fallback], activeConversationId: fallback.id };
  }
};

const getTheme = (): "dark" | "light" =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

const hasLatexCommand = (content: string): boolean => /\\{1,2}[A-Za-z]+/.test(content);

const normalizeLatexCommands = (content: string): string =>
  content.trim().replace(/\\\\([A-Za-z]+)/g, "\\$1");

const inlineMath = (content: string): string => `$${normalizeLatexCommands(content)}$`;

const displayMath = (content: string): string => `$$\n${normalizeLatexCommands(content)}\n$$`;

const normalizeDollarMath = (segment: string): string =>
  segment.replace(/\$\$([\s\S]*?)\$\$|\$([^\n$]*?)\$/g, (match: string, displayContent?: string, inlineContent?: string) => {
    if (typeof displayContent === "string") return displayMath(displayContent);
    if (typeof inlineContent === "string") return inlineMath(inlineContent);
    return match;
  });

const normalizeEscapedMathDelimiters = (segment: string): string =>
  segment
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, content: string) => inlineMath(content))
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, content: string) => displayMath(content));

const looksLikeStandaloneMath = (content: string): boolean => {
  const trimmed = content.trim();
  if (!trimmed || /^[xX]\s*$/.test(trimmed)) return false;
  return hasLatexCommand(trimmed) || /[_^=<>+\-*/]/.test(trimmed);
};

const normalizeStandaloneBracketDisplayMath = (segment: string): string =>
  segment.replace(/^([ \t]*)\[\s*([^\]\n]+?)\s*\]([ \t]*)$/gm, (match: string, leading: string, content: string, trailing: string) =>
    looksLikeStandaloneMath(content) ? `${leading}${displayMath(content)}${trailing}` : match,
  );

const normalizeBareParenMath = (segment: string): string =>
  segment.replace(/\(\s*([^()\n]*?\\{1,2}[A-Za-z][^()\n]*?)\s*\)/g, (match: string, content: string) =>
    hasLatexCommand(content) ? inlineMath(content) : match,
  );

const mapOutsideDollarMath = (segment: string, transformOutside: (outside: string) => string): string => {
  const matches = Array.from(segment.matchAll(/\$\$[\s\S]*?\$\$|\$[^\n$]*?\$/g));
  if (matches.length === 0) return transformOutside(segment);

  let output = "";
  let cursor = 0;

  for (const match of matches) {
    const index = match.index ?? 0;
    output += transformOutside(segment.slice(cursor, index));
    output += normalizeDollarMath(match[0]);
    cursor = index + match[0].length;
  }

  output += transformOutside(segment.slice(cursor));
  return output;
};

const normalizeMathInSegment = (segment: string): string => {
  const withEscapedDelimiters = normalizeEscapedMathDelimiters(segment);
  return mapOutsideDollarMath(withEscapedDelimiters, (outside) =>
    normalizeBareParenMath(normalizeStandaloneBracketDisplayMath(outside)),
  );
};

const splitMarkdownByFencedCode = (markdown: string): Array<{ text: string; isCode: boolean }> => {
  const lines = markdown.match(/.*(?:\r\n|\n|$)/g) ?? [];
  const chunks: Array<{ text: string; isCode: boolean }> = [];
  let buffer = "";
  let inFence = false;
  let fenceMarker = "";

  const pushBuffer = (isCode: boolean) => {
    if (!buffer) return;
    chunks.push({ text: buffer, isCode });
    buffer = "";
  };

  for (const line of lines) {
    if (!line) continue;

    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (!inFence && fenceMatch) {
      pushBuffer(false);
      inFence = true;
      fenceMarker = fenceMatch[1][0];
      buffer += line;
      continue;
    }

    if (inFence) {
      buffer += line;
      if (fenceMatch && fenceMatch[1][0] === fenceMarker) {
        inFence = false;
        fenceMarker = "";
        pushBuffer(true);
      }
      continue;
    }

    buffer += line;
  }

  pushBuffer(inFence);
  return chunks;
};

const normalizeAiMathDelimiters = (markdown: string): string =>
  splitMarkdownByFencedCode(markdown)
    .map((chunk) => (chunk.isCode ? chunk.text : normalizeMathInSegment(chunk.text)))
    .join("");

const finishAssistantTiming = (message: AiChatMessage, now = Date.now()): Pick<AiChatMessage, "finishedAt" | "elapsedMs"> => {
  const startedAt = message.startedAt ?? now;
  return {
    finishedAt: now,
    elapsedMs: Math.max(0, now - startedAt),
  };
};

const getAssistantElapsedMs = (message: AiChatMessage, now: number): number | null => {
  if (typeof message.elapsedMs === "number") return message.elapsedMs;
  if (typeof message.startedAt !== "number") return null;
  const end = typeof message.finishedAt === "number" ? message.finishedAt : now;
  return Math.max(0, end - message.startedAt);
};

const formatElapsed = (elapsedMs: number): string => {
  if (elapsedMs < 1000) return `${Math.max(0.1, elapsedMs / 1000).toFixed(1)}s`;
  if (elapsedMs < 10000) return `${(elapsedMs / 1000).toFixed(1)}s`;
  return `${Math.round(elapsedMs / 1000)}s`;
};

const getAssistantTimingLabel = (message: AiChatMessage, elapsedMs: number | null): string | null => {
  if (elapsedMs === null) {
    return message.state === "streaming" || message.state === "loading" ? "正在思考" : null;
  }

  const elapsed = formatElapsed(elapsedMs);
  if (message.state === "streaming" || message.state === "loading") return `正在思考 ${elapsed}`;
  if (message.state === "error") return `思考 ${elapsed} 后失败`;
  return `思考 ${elapsed}`;
};

const createAiCodeCopyIcon = (icon: "copy" | "check"): SVGSVGElement => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "h-3.5 w-3.5");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.25");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  if (icon === "check") {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M20 6 9 17l-5-5");
    svg.append(path);
    return svg;
  }

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "14");
  rect.setAttribute("height", "14");
  rect.setAttribute("x", "8");
  rect.setAttribute("y", "8");
  rect.setAttribute("rx", "2");
  rect.setAttribute("ry", "2");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2");

  svg.append(rect, path);
  return svg;
};

const setAiCodeCopyButtonStatus = (button: HTMLButtonElement, status: "copy" | "copied" | "failed") => {
  const label = document.createElement("span");
  label.className = "ai-code-copy-label";
  label.textContent = status === "copied" ? "已复制" : status === "failed" ? "复制失败" : "复制";
  button.replaceChildren(createAiCodeCopyIcon(status === "copied" ? "check" : "copy"), label);
  button.title = label.textContent;
  button.setAttribute("aria-label", button.title);
};

const getAiCodeBlockText = (code: HTMLElement): string => {
  const lines = Array.from(code.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("line"),
  );
  if (lines.length > 0) {
    return lines.map((line) => line.textContent ?? "").join("\n");
  }
  return code.textContent ?? "";
};

const decorateAiCodeBlocks = (html: string): string => {
  const template = document.createElement("template");
  template.innerHTML = html;

  for (const code of Array.from(template.content.querySelectorAll<HTMLElement>("pre > code"))) {
    const pre = code.parentElement;
    if (!(pre instanceof HTMLPreElement)) continue;

    const existingShell = pre.closest<HTMLDivElement>(".ai-code-block-shell");
    if (existingShell) {
      if (!existingShell.querySelector("button[data-ai-code-copy-button='true']")) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.aiCodeCopyButton = "true";
        button.className = "ai-code-copy-button";
        setAiCodeCopyButtonStatus(button, "copy");
        existingShell.append(button);
      }
      continue;
    }

    pre.dataset.aiCodeBlock = "true";
    const shell = document.createElement("div");
    shell.className = "ai-code-block-shell";
    pre.replaceWith(shell);
    shell.append(pre);

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.aiCodeCopyButton = "true";
    button.className = "ai-code-copy-button";
    setAiCodeCopyButtonStatus(button, "copy");
    shell.append(button);
  }

  return template.innerHTML;
};

const isHttpUrl = (href: string): boolean => /^https?:\/\//i.test(href);

function AiMarkdownMessage({ markdown }: { markdown: string }) {
  const [renderedHtml, setRenderedHtml] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const normalizedMarkdown = useMemo(() => normalizeAiMathDelimiters(markdown), [markdown]);

  useEffect(() => {
    let cancelled = false;
    const theme = getTheme();

    renderMarkdownForTheme(normalizedMarkdown, theme)
      .then((html) => {
        if (!cancelled) setRenderedHtml(decorateAiCodeBlocks(html));
      })
      .catch((error) => {
        console.warn("Render AI markdown message failed:", error);
        if (!cancelled) setRenderedHtml("");
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedMarkdown]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !renderedHtml) return;

    const timeoutIds = new Set<number>();

    const handleClick = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest<HTMLButtonElement>("button[data-ai-code-copy-button='true']");
      if (button && root.contains(button)) {
        const code = button.closest(".ai-code-block-shell")?.querySelector<HTMLElement>("pre > code");
        const text = code ? getAiCodeBlockText(code) : "";

        try {
          await navigator.clipboard.writeText(text);
          setAiCodeCopyButtonStatus(button, "copied");
        } catch (error) {
          console.warn("Copy AI code block failed:", error);
          setAiCodeCopyButtonStatus(button, "failed");
        }

        const timeoutId = window.setTimeout(() => {
          setAiCodeCopyButtonStatus(button, "copy");
          timeoutIds.delete(timeoutId);
        }, 1400);
        timeoutIds.add(timeoutId);
        return;
      }

      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !root.contains(anchor)) return;

      const rawHref = anchor.getAttribute("href")?.trim();
      if (!rawHref || !isHttpUrl(rawHref)) return;

      event.preventDefault();
      try {
        await openExternalUrl(rawHref);
      } catch (error) {
        console.warn("Open AI message link failed:", error);
      }
    };

    root.addEventListener("click", handleClick);

    return () => {
      root.removeEventListener("click", handleClick);
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [renderedHtml]);

  if (!renderedHtml) {
    return <div className="whitespace-pre-wrap break-words">{markdown}</div>;
  }

  return (
    <div
      ref={containerRef}
      data-ai-markdown-message="true"
      className={cn(
        "ai-message-preview min-w-0 max-w-full overflow-hidden break-words text-sm leading-6 text-foreground",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:leading-snug",
        "[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:leading-snug",
        "[&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold",
        "[&_p]:mb-2 [&_p]:leading-6",
        "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:mb-1",
        "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.88em]",
        "[&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border/70",
        "[&_pre_code]:inline-block [&_pre_code]:min-w-max [&_pre_code]:bg-transparent [&_pre_code]:p-3 [&_pre_code]:text-inherit",
        "[&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse",
        "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_strong]:font-semibold [&_em]:italic",
        "[&_.katex-display]:my-2 [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden",
      )}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}

function TagSuggestionCard({
  suggestion,
  isApplying,
  onApply,
  onIgnore,
}: {
  suggestion: TagSuggestionResult;
  isApplying: boolean;
  onApply: () => void;
  onIgnore: () => void;
}) {
  const hasSuggestions = suggestion.suggestedTags.length > 0;
  const statusText = suggestion.applied
    ? "已应用"
    : suggestion.ignored
      ? "已忽略"
      : suggestion.error;

  const renderTags = (tags: string[], emptyText: string) => (
    tags.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] leading-5 text-foreground dark:bg-white/[0.04]"
          >
            {tag}
          </span>
        ))}
      </div>
    ) : (
      <div className="text-xs leading-5 text-muted-foreground">{emptyText}</div>
    )
  );

  return (
    <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium leading-5 text-foreground">建议标签预览</div>
          <div className="truncate text-[11px] leading-4 text-muted-foreground" title={suggestion.notePath}>
            {getCompactPath(suggestion.notePath)}
          </div>
        </div>
        {statusText && (
          <span className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-5",
            suggestion.error
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "bg-muted text-muted-foreground dark:bg-white/[0.08]",
          )}>
            {statusText}
          </span>
        )}
      </div>

      <div className="grid gap-1.5">
        <div className="text-[11px] font-medium leading-4 text-muted-foreground">当前已有 tags</div>
        {renderTags(suggestion.existingTags, "当前没有已有标签")}
      </div>

      <div className="grid gap-1.5">
        <div className="text-[11px] font-medium leading-4 text-muted-foreground">建议新增 tags</div>
        {hasSuggestions ? renderTags(suggestion.suggestedTags, "") : (
          <div className="text-xs leading-5 text-muted-foreground">没有发现需要新增的标签</div>
        )}
      </div>

      {suggestion.reason && (
        <div className="rounded-md bg-background/65 px-2.5 py-2 text-xs leading-5 text-muted-foreground dark:bg-black/10">
          {suggestion.reason}
        </div>
      )}

      {!suggestion.applied && !suggestion.ignored && (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md border border-border/70 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-55"
            onClick={onIgnore}
            disabled={isApplying}
          >
            取消 / 忽略
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-55"
            onClick={onApply}
            disabled={!hasSuggestions || isApplying}
          >
            {isApplying ? "应用中..." : "应用标签"}
          </button>
        </div>
      )}
    </div>
  );
}

function PolishPreviewCard({
  preview,
  isApplying,
  onApply,
  onIgnore,
  onOpenReview,
}: {
  preview: PolishPreviewResult;
  isApplying: boolean;
  onApply: () => void;
  onIgnore: () => void;
  onOpenReview: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isFullNotePreview = preview.scope === "full-note";
  const statusText = preview.applied
    ? "\u5df2\u5e94\u7528"
    : preview.ignored
      ? "\u5df2\u53d6\u6d88"
      : preview.error
        ? "\u5df2\u8fc7\u671f"
        : "\u672a\u5e94\u7528";
  const title = getPreviewTitle(preview);
  const applyLabel = getPreviewApplyLabel(preview);
  const canApply = !preview.applied && !preview.ignored && !preview.error && preview.polishedText.trim().length > 0;
  const displayStartLine = getPolishPreviewDisplayStartLine(preview);
  const summaryItems = (preview.changes ?? []).filter((change) => change.count > 0);

  const stats = useMemo(
    () => getDiffStats(preview.originalText, preview.polishedText, displayStartLine),
    [displayStartLine, preview.originalText, preview.polishedText],
  );

  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-background shadow-sm dark:border-white/10 dark:bg-zinc-950/80">
      <div className="grid min-w-0 gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 truncate text-sm font-medium leading-5 text-foreground">{title}</div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] leading-4",
                preview.error
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "bg-muted text-muted-foreground dark:bg-white/[0.08]",
              )}
            >
              {statusText}
            </span>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setIsExpanded((value) => !value)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "收起预览" : "展开预览"}
              title={isExpanded ? "收起预览" : "展开预览"}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-muted-foreground">
          <span className="truncate" title={preview.notePath}>{getFileNameFromPath(preview.notePath)}</span>
          <span>1 file changed</span>
          <span className="shrink-0 text-emerald-700 dark:text-emerald-300">+{stats.addedRows}</span>
          <span className="shrink-0 text-red-700 dark:text-red-300">-{stats.deletedRows}</span>
        </div>

        {summaryItems.length > 0 && (
          <div className="grid gap-1 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-[11px] leading-4 text-muted-foreground dark:border-white/10">
            {summaryItems.map((change) => (
              <div key={change.ruleId} className="flex items-center justify-between gap-3">
                <span className="truncate">{change.message}</span>
                <span className="shrink-0">{change.count} 处</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background transition-opacity hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-950"
            onClick={onOpenReview}
          >
            审核
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md border border-emerald-500/45 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 disabled:pointer-events-none disabled:opacity-50 dark:text-emerald-300"
            onClick={onApply}
            disabled={isApplying || !canApply}
          >
            {isApplying ? "\u5e94\u7528\u4e2d..." : applyLabel}
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
            onClick={onIgnore}
            disabled={isApplying || preview.applied || preview.ignored}
          >
            取消
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border/60 dark:border-white/10">
          <CodexDiffPreview
            title={title}
            filePath={preview.notePath}
            status={statusText}
            statusTone={preview.error ? "warning" : "neutral"}
            oldText={preview.originalText}
            newText={preview.polishedText}
            startLine={displayStartLine}
            maxHeightClassName={isFullNotePreview ? "max-h-96" : "max-h-72"}
            showHeader={false}
          />
        </div>
      )}
    </div>
  );
}

export default function AiSidebar({
  context,
  isAiConfigured,
  isOpen,
  onClose,
  width,
  aiConfig,
  onOpenAiSettings,
  onApplySuggestedTags,
  onApplyPolishedSelection,
  onApplyPolishedFullNote,
  onOpenPolishReview,
  onPolishReviewChange,
}: AiSidebarProps) {
  const initialConversationStateRef = useRef<AiConversationStorage | null>(null);
  if (initialConversationStateRef.current === null) {
    initialConversationStateRef.current = loadConversationState();
  }

  const [inputValue, setInputValue] = useState("");
  const [conversations, setConversations] = useState<AiConversation[]>(
    initialConversationStateRef.current.conversations,
  );
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversationStateRef.current.activeConversationId,
  );
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [isCommandPanelDismissed, setIsCommandPanelDismissed] = useState(false);
  const [isContextExpanded, setIsContextExpanded] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [includeCurrentNoteContext, setIncludeCurrentNoteContext] = useState(
    readIncludeCurrentNoteContextPreference,
  );
  const [isResponding, setIsResponding] = useState(false);
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const [applyingTagMessageId, setApplyingTagMessageId] = useState<string | null>(null);
  const [applyingPolishMessageId, setApplyingPolishMessageId] = useState<string | null>(null);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingConversationTitle, setEditingConversationTitle] = useState("");
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const messageSeqRef = useRef(0);
  const requestSeqRef = useRef(0);
  const streamTargetsRef = useRef<Map<string, StreamTarget>>(new Map());
  const activeStreamsRef = useRef<Set<string>>(new Set());
  const commandRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0];
  const messages = activeConversation?.messages ?? [];
  const enabledProviders = aiConfig?.providers.filter((provider) => provider.enabled) ?? [];
  const fallbackProvider = enabledProviders.find((provider) => provider.id === aiConfig?.default_provider_id) ?? enabledProviders[0];
  const activeProvider =
    enabledProviders.find((provider) => provider.id === activeConversation?.providerId) ?? fallbackProvider;
  const activeProviderModels = getEnabledProviderModels(activeProvider);
  const activeModel =
    activeProvider?.models.find((model) => model.enabled && model.id === activeConversation?.modelId) ??
    getPreferredModelForProvider(activeProvider, aiConfig);
  const selectedProviderId = activeProvider?.id;
  const selectedModelId = activeModel?.id;
  const selectedProviderLabel = activeProvider
    ? activeProvider.name || activeProvider.id
    : aiConfig && enabledProviders.length > 0
      ? "配置组不可用"
      : "未配置 API";
  const selectedModelLabel = activeModel
    ? activeModel.name || activeModel.id
    : aiConfig && enabledProviders.length > 0
      ? "模型不可用"
      : "未配置模型";
  const modelQuery = modelSearch.trim().toLocaleLowerCase();
  const selectableProviders = enabledProviders
    .map((provider) => ({
      provider,
      models: provider.models.filter((model) => {
        if (!model.enabled) return false;
        if (!modelQuery) return true;
        return `${provider.name} ${provider.id} ${model.id} ${model.name ?? ""}`.toLocaleLowerCase().includes(modelQuery);
      }),
    }))
    .filter((group) => group.models.length > 0);
  const selectableModels = activeProviderModels.filter((model) => {
    if (!modelQuery) return true;
    return `${model.id} ${model.name ?? ""}`.toLocaleLowerCase().includes(modelQuery);
  });

  const commandQuery = inputValue.startsWith("/") ? inputValue.slice(1).trim() : "";
  const visibleCommands = useMemo(() => {
    if (!inputValue.startsWith("/")) return [];
    if (!commandQuery) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((command) =>
      `${command.label} ${command.description} ${command.category}`.toLocaleLowerCase().includes(commandQuery.toLocaleLowerCase()),
    );
  }, [commandQuery, inputValue]);
  const isCommandPanelOpen = inputValue.startsWith("/") && !isCommandPanelDismissed;
  const groupedVisibleCommands = COMMAND_CATEGORIES.map((category) => ({
    category,
    commands: visibleCommands.filter((command) => command.category === category),
  })).filter((group) => group.commands.length > 0);

  useEffect(() => {
    if (!activeConversation) {
      const nextConversation = {
        ...createEmptyConversation(),
        ...getDefaultConversationModel(aiConfig),
      };
      setConversations([nextConversation]);
      setActiveConversationId(nextConversation.id);
    }
  }, [activeConversation, aiConfig]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        AI_INCLUDE_NOTE_CONTEXT_STORAGE_KEY,
        includeCurrentNoteContext ? "true" : "false",
      );
    } catch {
      // Ignore localStorage failures; the toggle still works for this session.
    }
  }, [includeCurrentNoteContext]);

  useEffect(() => {
    const persistedConversations = limitConversations(pruneBlankConversations(conversations, activeConversationId)).map((conversation) => ({
      ...conversation,
      messages: sanitizeMessagesForStorage(conversation.messages),
    }));
    const nextActiveConversationId = persistedConversations.some((conversation) => conversation.id === activeConversationId)
      ? activeConversationId
      : persistedConversations[0]?.id;

    if (!nextActiveConversationId) return;

    try {
      window.localStorage.setItem(
        AI_CONVERSATIONS_STORAGE_KEY,
        JSON.stringify({
          conversations: persistedConversations,
          activeConversationId: nextActiveConversationId,
        }),
      );
    } catch (error) {
      console.warn("Persist AI conversations failed:", error);
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    setActiveCommandIndex(0);
  }, [commandQuery]);

  useEffect(() => {
    if (!isResponding) return;
    setElapsedNow(Date.now());
    const timer = window.setInterval(() => setElapsedNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [isResponding]);

  useEffect(() => {
    if (!isCommandPanelOpen || visibleCommands.length === 0) return;
    const activeCommand = visibleCommands[activeCommandIndex];
    if (!activeCommand) return;
    commandRowRefs.current[activeCommand.id]?.scrollIntoView({ block: "nearest" });
  }, [activeCommandIndex, isCommandPanelOpen, visibleCommands]);

  const updateRespondingState = () => {
    setIsResponding(activeStreamsRef.current.size > 0);
  };

  const isMessagesNearBottom = () => {
    const element = messagesScrollRef.current;
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight <= AI_SCROLL_BOTTOM_THRESHOLD;
  };

  const scrollMessagesToBottom = (behavior: ScrollBehavior = "auto") => {
    const element = messagesScrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    setShowScrollToBottom(false);
  };

  const handleMessagesScroll = () => {
    const isNearBottom = isMessagesNearBottom();
    shouldAutoScrollRef.current = isNearBottom;
    setShowScrollToBottom(!isNearBottom);
  };

  const createMessage = (message: Omit<AiChatMessage, "id">): AiChatMessage => {
    messageSeqRef.current += 1;
    return { ...message, id: createMessageId(messageSeqRef.current) };
  };

  const updateConversationMessages = (
    conversationId: string,
    updater: (conversation: AiConversation) => AiConversation,
  ) => {
    setConversations((current) => {
      const now = Date.now();
      const next = current.map((conversation) => {
        if (conversation.id !== conversationId) return conversation;
        const updated = updater(conversation);
        return {
          ...updated,
          messages: updated.messages.slice(-AI_CONVERSATION_MESSAGE_LIMIT),
          updatedAt: now,
        };
      });
      return limitConversations(next);
    });
  };

  const appendMessages = (conversationId: string, ...nextMessages: AiChatMessage[]) => {
    updateConversationMessages(conversationId, (conversation) => {
      const firstUserMessage = nextMessages.find((message) => message.role === "user");
      const shouldRetitle =
        conversation.title === UNTITLED_CONVERSATION_TITLE &&
        conversation.messages.every((message) => message.role !== "user");
      return {
        ...conversation,
        title: shouldRetitle && firstUserMessage ? getConversationTitleFromQuestion(firstUserMessage.text) : conversation.title,
        messages: [...conversation.messages, ...nextMessages],
      };
    });
  };

  const replaceMessage = (
    conversationId: string,
    messageId: string,
    updater: (message: AiChatMessage) => AiChatMessage,
  ) => {
    updateConversationMessages(conversationId, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => (message.id === messageId ? updater(message) : message)),
    }));
  };

  const createNewConversation = () => {
    if (activeConversation && !hasConversationContent(activeConversation)) {
      setActiveConversationId(activeConversation.id);
      setIsHistoryOpen(false);
      setIsProviderPickerOpen(false);
      setIsModelPickerOpen(false);
      setActiveCommandIndex(0);
      setIsCommandPanelDismissed(false);
      return;
    }

    const conversation = {
      ...createEmptyConversation(),
      ...getDefaultConversationModel(aiConfig),
    };
    setConversations((current) => limitConversations(pruneBlankConversations([conversation, ...current], conversation.id)));
    setActiveConversationId(conversation.id);
    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    cancelRenameConversation();
    setIsHistoryOpen(false);
    setIsProviderPickerOpen(false);
    setIsModelPickerOpen(false);
    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  const selectConversationProvider = (provider: AiProvider) => {
    if (!activeConversation) return;
    const preferredModel = getPreferredModelForProvider(provider, aiConfig);
    updateConversationMessages(activeConversation.id, (conversation) => ({
      ...conversation,
      providerId: provider.id,
      modelId: preferredModel?.id,
    }));
    setIsProviderPickerOpen(false);
    setIsModelPickerOpen(false);
    setModelSearch("");
  };

  const selectConversationModel = (modelOrProvider: AiModel | AiProvider, maybeModel?: AiModel) => {
    if (!activeConversation) return;
    const provider = maybeModel ? modelOrProvider as AiProvider : activeProvider;
    const model = maybeModel ?? modelOrProvider as AiModel;
    if (!provider) return;
    updateConversationMessages(activeConversation.id, (conversation) => ({
      ...conversation,
      providerId: provider.id,
      modelId: model.id,
    }));
    setIsModelPickerOpen(false);
    setModelSearch("");
  };

  const selectConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    setIsHistoryOpen(false);
    setIsProviderPickerOpen(false);
    setIsModelPickerOpen(false);
    setModelSearch("");
    setEditingConversationId(null);
    setEditingConversationTitle("");
    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  const startRenameConversation = (conversation: AiConversation) => {
    setEditingConversationId(conversation.id);
    setEditingConversationTitle(conversation.title);
  };

  const cancelRenameConversation = () => {
    setEditingConversationId(null);
    setEditingConversationTitle("");
  };

  const saveRenameConversation = (conversationId: string) => {
    const title = editingConversationTitle.replace(/\s+/g, " ").trim();
    if (!title) {
      cancelRenameConversation();
      return;
    }

    setConversations((current) => limitConversations(current.map((conversation) => (
      conversation.id === conversationId
        ? { ...conversation, title, updatedAt: Date.now() }
        : conversation
    ))));
    cancelRenameConversation();
  };

  const deleteConversation = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    const confirmed = window.confirm(`Delete chat "${conversation.title}"?`);
    if (!confirmed) return;

    for (const [streamId, target] of Array.from(streamTargetsRef.current.entries())) {
      if (target.conversationId !== conversationId) continue;
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
    }
    updateRespondingState();

    const remaining = limitConversations(conversations.filter((item) => item.id !== conversationId));
    if (remaining.length === 0) {
      const fallback = createEmptyConversation();
      setConversations([fallback]);
      setActiveConversationId(fallback.id);
    } else {
      setConversations(remaining);
      if (conversationId === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }
    }

    cancelRenameConversation();
    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void listen<NoteChatStreamChunkEvent>("ai-chat-stream-chunk", (event) => {
      const { streamId, delta } = event.payload;
      const target = streamTargetsRef.current.get(streamId);
      if (disposed || !target || !delta) return;

      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.state === "streaming" ? `${message.text}${delta}` : message.text,
      }));
    }).then((unlisten) => unlisteners.push(unlisten));

    void listen<NoteChatStreamDoneEvent>("ai-chat-stream-done", (event) => {
      const { streamId } = event.payload;
      const target = streamTargetsRef.current.get(streamId);
      if (disposed || !target) return;

      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.text.trim().length > 0 ? message.text : "The AI service returned no content. Please retry.",
        state: "done",
        ...finishAssistantTiming(message),
      }));
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      updateRespondingState();
    }).then((unlisten) => unlisteners.push(unlisten));

    void listen<NoteChatStreamErrorEvent>("ai-chat-stream-error", (event) => {
      const { streamId, message, detail } = event.payload;
      const target = streamTargetsRef.current.get(streamId);
      if (disposed || !target) return;
      if (detail) {
        console.warn("AI sidebar stream failed", { streamId, detail });
      }

      replaceMessage(target.conversationId, target.messageId, (currentMessage) => ({
        ...currentMessage,
        text: getChatErrorMessage(message),
        state: "error",
        ...finishAssistantTiming(currentMessage),
      }));
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      updateRespondingState();
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    window.requestAnimationFrame(() => scrollMessagesToBottom("auto"));
  }, [activeConversationId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (shouldAutoScrollRef.current || isMessagesNearBottom()) {
      window.requestAnimationFrame(() => scrollMessagesToBottom("auto"));
      return;
    }
    setShowScrollToBottom(true);
  }, [isOpen, messages]);

  const buildChatContext = (
    options: { includeNoteContext?: boolean } = {},
  ): NoteChatContextPayload => {
    const includeNoteContext = options.includeNoteContext ?? includeCurrentNoteContext;
    const truncatedSelection = truncateText(context.selectedText.trim(), NOTE_CHAT_MAX_SELECTION_CHARS);
    if (!includeNoteContext) {
      return {
        noteTitle: "",
        notePath: "",
        tags: [],
        summary: "",
        selectedText: truncatedSelection.text,
        markdown: "",
        markdownTruncated: false,
      };
    }

    const truncatedMarkdown = truncateText(context.markdownBody, NOTE_CHAT_MAX_MARKDOWN_CHARS);

    return {
      noteTitle: context.filePath ? context.title : "",
      notePath: context.filePath ?? "",
      tags: context.tags,
      summary: context.summary.trim(),
      selectedText: truncatedSelection.text,
      markdown: truncatedMarkdown.text,
      markdownTruncated: truncatedMarkdown.truncated,
    };
  };

  const buildRequestHistory = (conversationId: string): NoteChatHistoryMessage[] => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return [];

    return conversation.messages
      .filter((message) => {
        if (message.role !== "user" && message.role !== "assistant") return false;
        if (message.state === "loading" || message.state === "streaming" || message.state === "error") return false;
        return message.text.trim().length > 0;
      })
      .slice(-AI_REQUEST_HISTORY_LIMIT)
      .map((message) => ({
        role: message.role as "user" | "assistant",
        text: truncateText(message.text.trim(), AI_REQUEST_HISTORY_MESSAGE_MAX_CHARS).text,
      }));
  };

  const appendCommandNotice = (conversationId: string, commandText: string, notice: string) => {
    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(
      conversationId,
      createMessage({ role: "user", text: commandText, state: "done" }),
      createMessage({ role: "assistant", text: notice, state: "done" }),
    );
    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  const updateTagSuggestionMessage = (
    conversationId: string,
    messageId: string,
    updater: (suggestion: TagSuggestionResult) => TagSuggestionResult,
  ) => {
    replaceMessage(conversationId, messageId, (message) => {
      if (!message.tagSuggestion) return message;
      return {
        ...message,
        tagSuggestion: updater(message.tagSuggestion),
      };
    });
  };

  const updatePolishPreviewMessage = (
    conversationId: string,
    messageId: string,
    updater: (preview: PolishPreviewResult) => PolishPreviewResult,
  ) => {
    replaceMessage(conversationId, messageId, (message) => {
      if (!message.polishPreview) return message;
      return {
        ...message,
        polishPreview: updater(message.polishPreview),
      };
    });
  };

  const buildSummarizePrompt = (): string => [
    "请执行只读 slash command：/总结本文。",
    "",
    "任务：只总结当前打开的这一篇笔记，回答只显示在 AI Sidebar 聊天区。",
    "硬性要求：",
    "- 不要修改原文。",
    "- 不要输出 frontmatter。",
    "- 不要声称已经写入文件。",
    "- 使用清晰 Markdown。",
    "- 面向 OI / 算法学习笔记场景，优先提炼算法思想、复杂度、代码细节和易错点。",
    "",
    "建议结构：",
    "## 核心内容",
    "## 关键知识点",
    "## 代码/公式/注意事项",
    "## 可以改进的地方",
  ].join("\n");

  const buildExplainParagraphPrompt = (targetText: string, isCode: boolean, sourceLabel: string): string => [
    "请执行只读 slash command：/解释当前段落。",
    "",
    `解释对象来源：${sourceLabel}${isCode ? "，当前光标位于代码块中" : ""}。`,
    "只解释下面这段内容，不要展开成与当前段落无关的大段泛泛内容。",
    "不要修改原文，不要声称已经写入文件。",
    "",
    "回答要求：",
    "1. 先用一句话概括这段在讲什么。",
    "2. 再分点解释关键概念。",
    "3. 如果涉及算法、代码或公式，说明含义、复杂度相关信息和可能坑点。",
    "4. 如果这段表达不清楚，可以给改进建议，但不要直接改写原文。",
    "",
    "当前段落：",
    targetText,
  ].join("\n");

  const submitTagSuggestionCommand = async (
    snapshot?: NoteChatContextPayload,
    displayText = "/补全标签",
  ) => {
    if (isResponding) return;

    const conversationId = activeConversation?.id;
    if (!conversationId) return;

    const chatContext = snapshot ?? buildChatContext();
    if (!chatContext.notePath) {
      appendCommandNotice(conversationId, displayText, "请先打开一篇笔记。");
      return;
    }

    if (!isAiConfigured) {
      shouldAutoScrollRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: displayText, state: "done" }),
        createMessage({ role: "system", text: "AI is not configured. Open settings first.", state: "done" }),
      );
      setInputValue("");
      return;
    }
    if (!selectedProviderId || !selectedModelId) {
      shouldAutoScrollRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: displayText, state: "done" }),
        createMessage({
          role: "system",
          text: "当前对话使用的模型不可用，请在顶部模型选择器里重新选择模型。",
          state: "done",
        }),
      );
      setInputValue("");
      return;
    }

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const startedAt = Date.now();
    const userMessage = createMessage({ role: "user", text: displayText, state: "done" });
    const assistantMessage = createMessage({
      role: "assistant",
      text: "正在生成标签建议...",
      kind: "tag-suggestion",
      commandId: "complete-tags",
      state: "loading",
      retryText: "suggest-note-tags",
      retryDisplayText: displayText,
      retryCommandId: "complete-tags",
      retryContext: chatContext,
      requestId,
      startedAt,
    });

    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);
    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
    setIsResponding(true);

    try {
      const suggestion = await suggestNoteTags(
        chatContext,
        selectedProviderId,
        selectedModelId,
      );
      const parsed = toTagSuggestionResult(suggestion, chatContext.notePath, chatContext.tags);

      replaceMessage(conversationId, assistantMessage.id, (message) => ({
        ...message,
        text: "标签建议已生成。",
        kind: "tag-suggestion",
        tagSuggestion: parsed,
        state: "done",
        retryText: undefined,
        retryDisplayText: undefined,
        retryCommandId: undefined,
        retryContext: undefined,
        ...finishAssistantTiming(message),
      }));
    } catch (error) {
      console.warn("AI tag suggestion request failed", {
        requestId,
        notePath: chatContext.notePath,
        error,
      });
      replaceMessage(conversationId, assistantMessage.id, (message) => ({
        ...message,
        text: getTagSuggestionErrorMessage(error),
        kind: "text",
        state: "error",
        ...finishAssistantTiming(message),
      }));
    } finally {
      setIsResponding(false);
    }
  };

  const submitPolishSelectionCommand = async (
    originalText: string,
    selectionRange: TextRange | null,
    displayText = "/润色选中",
    selectionStartLine?: number | null,
  ) => {
    if (isResponding) return;

    const conversationId = activeConversation?.id;
    if (!conversationId) return;

    if (!context.filePath) {
      appendCommandNotice(conversationId, displayText, "请先打开一篇笔记。");
      return;
    }

    if (!originalText.trim()) {
      appendCommandNotice(conversationId, displayText, "请先在编辑器中选中一段需要润色的文字。");
      return;
    }

    if (!isAiConfigured) {
      shouldAutoScrollRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: displayText, state: "done" }),
        createMessage({ role: "system", text: "AI is not configured. Open settings first.", state: "done" }),
      );
      setInputValue("");
      return;
    }
    if (!selectedProviderId || !selectedModelId) {
      shouldAutoScrollRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: displayText, state: "done" }),
        createMessage({
          role: "system",
          text: "当前对话使用的模型不可用，请在顶部模型选择器里重新选择模型。",
          state: "done",
        }),
      );
      setInputValue("");
      return;
    }

    const chatContext: NoteChatContextPayload = {
      noteTitle: context.title,
      notePath: context.filePath,
      tags: context.tags,
      summary: context.summary.trim(),
      selectedText: originalText,
      markdown: "",
      markdownTruncated: false,
    };

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const startedAt = Date.now();
    const previewId = `polish-${Date.now().toString(36)}-${requestId}`;
    const previewStartLine = selectionStartLine ?? getLineNumberAtOffset(context.markdownBody, selectionRange?.from);
    const userMessage = createMessage({ role: "user", text: displayText, state: "done" });
    const assistantMessage = createMessage({
      role: "assistant",
      text: "正在生成润色预览...",
      kind: "polish-preview",
      commandId: "polish-selection",
      state: "loading",
      retryText: "polish-selection",
      retryDisplayText: displayText,
      retryCommandId: "polish-selection",
      retryContext: chatContext,
      retrySelectionRange: selectionRange,
      retrySelectionStartLine: previewStartLine,
      requestId,
      startedAt,
    });

    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);
    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
    setIsResponding(true);

    try {
      const result = await polishSelectedText(chatContext, selectedProviderId, selectedModelId);
      const polishedText = result.polishedText;
      if (!polishedText.trim()) {
        throw new Error("AI selection polish failed: polishedText was empty");
      }

      replaceMessage(conversationId, assistantMessage.id, (message) => ({
        ...message,
        text: "润色预览已生成。",
        kind: "polish-preview",
        polishPreview: {
          previewId,
          previewKind: "ai-polish",
          scope: "selection",
          notePath: context.filePath ?? chatContext.notePath,
          originalText,
          polishedText,
          selectionRange,
          selectionStartLine: previewStartLine,
        },
        state: "done",
        retryText: undefined,
        retryDisplayText: undefined,
        retryCommandId: undefined,
        retryContext: undefined,
        retrySelectionRange: undefined,
        retrySelectionStartLine: undefined,
        ...finishAssistantTiming(message),
      }));
    } catch (error) {
      console.warn("AI selection polish request failed", {
        requestId,
        notePath: chatContext.notePath,
        error,
      });
      replaceMessage(conversationId, assistantMessage.id, (message) => ({
        ...message,
        text: getPolishSelectionErrorMessage(error),
        kind: "text",
        state: "error",
        ...finishAssistantTiming(message),
      }));
    } finally {
      setIsResponding(false);
    }
  };

  const submitPolishFullNoteCommand = async (
    snapshot: NoteChatContextPayload,
    displayText = "/全文润色",
    instruction = "",
  ) => {
    if (isResponding) return;

    const conversationId = activeConversation?.id;
    if (!conversationId) return;

    if (!snapshot.notePath) {
      appendCommandNotice(conversationId, displayText, "请先打开一篇笔记后再使用全文润色。");
      return;
    }

    if (!snapshot.markdown.trim()) {
      appendCommandNotice(conversationId, displayText, "当前笔记正文为空，无法全文润色。");
      return;
    }

    if (!isAiConfigured) {
      shouldAutoScrollRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: displayText, state: "done" }),
        createMessage({ role: "system", text: "AI is not configured. Open settings first.", state: "done" }),
      );
      setInputValue("");
      return;
    }
    if (!selectedProviderId || !selectedModelId) {
      shouldAutoScrollRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: displayText, state: "done" }),
        createMessage({
          role: "system",
          text: "当前对话使用的模型不可用，请在顶部模型选择器里重新选择模型。",
          state: "done",
        }),
      );
      setInputValue("");
      return;
    }

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const startedAt = Date.now();
    const previewId = `full-polish-${Date.now().toString(36)}-${requestId}`;
    const previewStartLine = 1;
    const userMessage = createMessage({ role: "user", text: displayText, state: "done" });
    const assistantMessage = createMessage({
      role: "assistant",
      text: "正在润色全文...",
      kind: "polish-preview",
      commandId: "polish-all",
      state: "loading",
      retryText: "polish-full-note",
      retryDisplayText: displayText,
      retryCommandId: "polish-all",
      retryContext: snapshot,
      retrySelectionRange: null,
      retrySelectionStartLine: previewStartLine,
      retryInstruction: instruction,
      requestId,
      startedAt,
    });

    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);
    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
    setIsResponding(true);

    try {
      const result = await polishFullNote(snapshot, instruction, selectedProviderId, selectedModelId);
      const polishedText = result.polishedBody;
      if (!polishedText.trim()) {
        throw new Error("AI full note polish failed: polishedBody was empty");
      }

      replaceMessage(conversationId, assistantMessage.id, (message) => ({
        ...message,
        text: "全文润色预览已生成。",
        kind: "polish-preview",
        polishPreview: {
          previewId,
          previewKind: "ai-polish",
          scope: "full-note",
          notePath: snapshot.notePath,
          originalText: snapshot.markdown,
          polishedText,
          selectionRange: null,
          selectionStartLine: previewStartLine,
          instruction: instruction.trim() || undefined,
        },
        state: "done",
        retryText: undefined,
        retryDisplayText: undefined,
        retryCommandId: undefined,
        retryContext: undefined,
        retrySelectionRange: undefined,
        retrySelectionStartLine: undefined,
        retryInstruction: undefined,
        ...finishAssistantTiming(message),
      }));
    } catch (error) {
      console.warn("AI full note polish request failed", {
        requestId,
        notePath: snapshot.notePath,
        error,
      });
      replaceMessage(conversationId, assistantMessage.id, (message) => ({
        ...message,
        text: getPolishFullNoteErrorMessage(error),
        kind: "text",
        state: "error",
        ...finishAssistantTiming(message),
      }));
    } finally {
      setIsResponding(false);
    }
  };

  const submitSolutionFormatCommand = (
    displayText = "/题解格式化",
  ) => {
    const conversationId = activeConversation?.id;
    if (!conversationId) return;

    if (!context.filePath) {
      appendCommandNotice(conversationId, displayText, "请先打开一篇笔记后再使用题解格式化。");
      return;
    }

    if (!context.markdownBody.trim()) {
      appendCommandNotice(conversationId, displayText, "当前笔记正文为空，无法执行题解格式化。");
      return;
    }

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const previewId = `solution-format-${Date.now().toString(36)}-${requestId}`;
    const result = formatLuoguSolution(context.markdownBody);

    if (result.formattedBody === context.markdownBody) {
      appendCommandNotice(conversationId, displayText, "未发现需要格式化的内容。");
      setInputValue("");
      setActiveCommandIndex(0);
      setIsCommandPanelDismissed(false);
      return;
    }

    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(
      conversationId,
      createMessage({ role: "user", text: displayText, state: "done" }),
      createMessage({
        role: "assistant",
        text: "题解格式化预览已生成。",
        kind: "polish-preview",
        commandId: "solution-format",
        polishPreview: {
          previewId,
          previewKind: "solution-format",
          scope: "full-note",
          notePath: context.filePath,
          originalText: context.markdownBody,
          polishedText: result.formattedBody,
          selectionRange: null,
          selectionStartLine: 1,
          changes: result.changes,
        },
        state: "done",
      }),
    );
    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  const executeSlashCommand = (command: SlashCommand, rawInput?: string) => {
    const conversationId = activeConversation?.id;
    if (!conversationId) return;

    const commandText = getCommandDisplayText(command, rawInput);
    const commandArgument = getCommandArgument(command, rawInput);

    if (command.id === "complete-tags") {
      if (!context.filePath) {
        appendCommandNotice(conversationId, commandText, "请先打开一篇笔记。");
        return;
      }
      if (!includeCurrentNoteContext) {
        appendCommandNotice(conversationId, commandText, "此命令需要读取当前笔记，请先开启“包含当前笔记信息”。");
        return;
      }
      const chatContext = buildChatContext({ includeNoteContext: true });
      void submitTagSuggestionCommand(chatContext, commandText);
      return;
    }

    if (command.id === "polish-all") {
      if (!context.filePath) {
        appendCommandNotice(conversationId, commandText, "请先打开一篇笔记后再使用全文润色。");
        return;
      }
      if (!includeCurrentNoteContext) {
        appendCommandNotice(conversationId, commandText, "全文润色需要包含当前笔记信息，请先打开该开关。");
        return;
      }
      if (!context.markdownBody.trim()) {
        appendCommandNotice(conversationId, commandText, "当前笔记正文为空，无法全文润色。");
        return;
      }
      if (context.markdownBody.replace(/\s+/g, "").length < 20) {
        appendCommandNotice(conversationId, commandText, "当前笔记正文较短，更适合使用 /润色选中。");
        return;
      }

      const chatContext: NoteChatContextPayload = {
        noteTitle: context.title,
        notePath: context.filePath,
        tags: context.tags,
        summary: context.summary.trim(),
        selectedText: "",
        markdown: context.markdownBody,
        markdownTruncated: false,
      };
      void submitPolishFullNoteCommand(chatContext, commandText, commandArgument);
      return;
    }

    if (command.id === "solution-format") {
      submitSolutionFormatCommand(commandText);
      return;
    }

    if (command.id === "polish-selection") {
      if (!context.filePath) {
        appendCommandNotice(conversationId, commandText, "请先打开一篇笔记。");
        return;
      }
      if (context.selectionStatus !== "available" || !context.selectedText.trim()) {
        appendCommandNotice(conversationId, commandText, "请先在编辑器中选中一段需要润色的文字。");
        return;
      }
      void submitPolishSelectionCommand(
        context.selectedText,
        context.selectedTextRange,
        commandText,
        getLineNumberAtOffset(context.markdownBody, context.selectedTextRange?.from),
      );
      return;
    }

    if (!command.implemented || command.mode !== "readonly") {
      appendCommandNotice(conversationId, commandText, "这个命令稍后接入。");
      return;
    }

    if (command.id === "summarize") {
      if (!context.filePath) {
        appendCommandNotice(conversationId, commandText, "请先打开一篇笔记。");
        return;
      }
      if (!context.hasBody) {
        appendCommandNotice(conversationId, commandText, "当前笔记没有可总结的正文。");
        return;
      }
      if (!includeCurrentNoteContext) {
        appendCommandNotice(conversationId, commandText, "此命令需要读取当前笔记，请先开启“包含当前笔记信息”。");
        return;
      }
      const chatContext = buildChatContext({ includeNoteContext: true });
      void submitQuestion(buildSummarizePrompt(), chatContext, commandText);
      return;
    }

    if (command.id === "explain-paragraph") {
      if (!context.filePath) {
        appendCommandNotice(conversationId, commandText, "请先打开一篇笔记。");
        return;
      }

      const selectedText = context.selectedText.trim();
      const paragraphText = context.currentParagraphText.trim();
      const target = selectedText || paragraphText;
      if (!target) {
        appendCommandNotice(conversationId, commandText, "请先选中一段文字，或把光标放在要解释的段落中。");
        return;
      }

      const truncatedTarget = truncateText(target, NOTE_CHAT_MAX_PARAGRAPH_CHARS);
      const sourceLabel = selectedText ? "当前选中文本" : "当前光标所在段落";
      const prompt = buildExplainParagraphPrompt(
        truncatedTarget.truncated ? `${truncatedTarget.text}\n\n（以上内容已截断）` : truncatedTarget.text,
        !selectedText && context.currentParagraphIsCode,
        sourceLabel,
      );
      const chatContext = buildChatContext();
      const commandContext = {
        ...chatContext,
        selectedText: truncatedTarget.text,
      };
      void submitQuestion(prompt, commandContext, commandText);
    }
  };

  const submitQuestion = async (
    questionText: string,
    snapshot?: NoteChatContextPayload,
    displayText = questionText,
  ) => {
    if (isResponding) return;

    const conversationId = activeConversation?.id;
    const question = questionText.trim();
    if (!conversationId || !question) return;
    const userFacingText = displayText.trim() || question;

    if (!isAiConfigured) {
      shouldAutoScrollRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: userFacingText, state: "done" }),
        createMessage({ role: "system", text: "AI is not configured. Open settings first.", state: "done" }),
      );
      setInputValue("");
      return;
    }
    if (!selectedProviderId || !selectedModelId) {
      shouldAutoScrollRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: userFacingText, state: "done" }),
        createMessage({
          role: "system",
          text: "当前对话使用的模型不可用，请在顶部模型选择器里重新选择模型。",
          state: "done",
        }),
      );
      setInputValue("");
      return;
    }

    const chatContext = snapshot ?? buildChatContext();

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const startedAt = Date.now();
    const streamId = `${Date.now()}-${requestId}`;
    const chatHistory = buildRequestHistory(conversationId);
    const userMessage = createMessage({ role: "user", text: userFacingText, state: "done" });
    const assistantMessage = createMessage({
      role: "assistant",
      text: "",
      state: "streaming",
      retryText: question,
      retryDisplayText: userFacingText,
      requestId,
      streamId,
      retryContext: chatContext,
      startedAt,
    });

    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);

    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
    streamTargetsRef.current.set(streamId, {
      conversationId,
      messageId: assistantMessage.id,
      requestId,
    });
    activeStreamsRef.current.add(streamId);
    updateRespondingState();

    void startCurrentNoteChatStream({
      streamId,
      question,
      context: chatContext,
      chatHistory,
      providerId: selectedProviderId,
      modelId: selectedModelId,
    }).catch((error) => {
      console.warn("AI sidebar chat request failed", {
        requestId,
        streamId,
        notePath: chatContext.notePath,
        error,
      });
      const target = streamTargetsRef.current.get(streamId);
      if (!target) return;
      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.state === "error" ? message.text : getChatErrorMessage(error),
        state: "error",
        ...finishAssistantTiming(message),
      }));
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      updateRespondingState();
    });
  };

  const applyTagSuggestion = async (message: AiChatMessage) => {
    const conversationId = activeConversation?.id;
    const suggestion = message.tagSuggestion;
    if (!conversationId || !suggestion || applyingTagMessageId) return;

    setApplyingTagMessageId(message.id);
    updateTagSuggestionMessage(conversationId, message.id, (current) => ({ ...current, error: undefined }));
    try {
      await onApplySuggestedTags(suggestion.notePath, suggestion.suggestedTags);
      updateTagSuggestionMessage(conversationId, message.id, (current) => ({
        ...current,
        applied: true,
        ignored: false,
        error: undefined,
      }));
    } catch (error) {
      updateTagSuggestionMessage(conversationId, message.id, (current) => ({
        ...current,
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setApplyingTagMessageId(null);
    }
  };

  const ignoreTagSuggestion = (message: AiChatMessage) => {
    const conversationId = activeConversation?.id;
    if (!conversationId || !message.tagSuggestion) return;
    updateTagSuggestionMessage(conversationId, message.id, (current) => ({
      ...current,
      ignored: true,
      error: undefined,
    }));
  };

  const applyPolishPreview = async (message: AiChatMessage) => {
    const conversationId = activeConversation?.id;
    const preview = message.polishPreview;
    if (!conversationId || !preview || applyingPolishMessageId) return;

    setApplyingPolishMessageId(message.id);
    updatePolishPreviewMessage(conversationId, message.id, (current) => ({ ...current, error: undefined }));
    try {
      if (preview.scope === "full-note") {
        await onApplyPolishedFullNote({
          notePath: preview.notePath,
          originalBody: preview.originalText,
          polishedBody: preview.polishedText,
          applyKind: preview.previewKind,
        });
      } else {
        await onApplyPolishedSelection({
          notePath: preview.notePath,
          originalText: preview.originalText,
          polishedText: preview.polishedText,
          selectionRange: preview.selectionRange,
        });
      }
      updatePolishPreviewMessage(conversationId, message.id, (current) => ({
        ...current,
        applied: true,
        ignored: false,
        error: undefined,
      }));
      onPolishReviewChange({
        ...preview,
        applied: true,
        ignored: false,
        error: undefined,
      });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      updatePolishPreviewMessage(conversationId, message.id, (current) => ({
        ...current,
        error: errorText,
      }));
      onPolishReviewChange({
        ...preview,
        error: errorText,
      });
    } finally {
      setApplyingPolishMessageId(null);
    }
  };

  const ignorePolishPreview = (message: AiChatMessage) => {
    const conversationId = activeConversation?.id;
    if (!conversationId || !message.polishPreview) return;
    updatePolishPreviewMessage(conversationId, message.id, (current) => ({
      ...current,
      ignored: true,
      error: undefined,
    }));
    onPolishReviewChange({
      ...message.polishPreview,
      ignored: true,
      error: undefined,
    });
  };

  const selectCommand = (command: SlashCommand) => {
    setInputValue("");
    setIsCommandPanelDismissed(true);
    setActiveCommandIndex(0);
    executeSlashCommand(command);
  };

  const submitInput = () => {
    const conversationId = activeConversation?.id;
    const value = inputValue.trim();
    if (!conversationId || !value || isResponding) return;

    if (value.startsWith("/")) {
      const command = getCommandByInput(value);
      if (command) {
        executeSlashCommand(command, value);
      } else {
        appendCommandNotice(conversationId, value, "这个命令稍后接入。");
      }
      return;
    }

    void submitQuestion(value);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isCommandPanelOpen && visibleCommands.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveCommandIndex((current) => (current + 1) % visibleCommands.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveCommandIndex((current) => (current - 1 + visibleCommands.length) % visibleCommands.length);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        selectCommand(visibleCommands[activeCommandIndex] ?? visibleCommands[0]);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (isCommandPanelOpen && visibleCommands.length > 0) {
        selectCommand(visibleCommands[activeCommandIndex] ?? visibleCommands[0]);
        return;
      }
      submitInput();
    }
  };

  const contextMeta = context.filePath
    ? `${getSelectionLabel(context)} - ${context.tags.length} tags`
    : "no note selected";
  const composerHint = inputValue.startsWith("/")
    ? "选择命令"
    : includeCurrentNoteContext && context.filePath
      ? "已包含当前笔记信息"
      : "未包含当前笔记信息";
  const sortedConversations = useMemo(
    () => limitConversations(pruneBlankConversations(conversations, activeConversationId)),
    [activeConversationId, conversations],
  );
  let commandOrdinal = 0;

  return (
    <aside
      className={cn(
        "relative z-20 shrink-0 flex-col overflow-hidden border-l border-border/80 bg-background/95 text-foreground",
        isOpen ? "flex" : "hidden",
      )}
      style={width ? { width, flexBasis: width, maxWidth: width } : undefined}
      aria-hidden={!isOpen}
    >
      <div className="relative flex h-11 shrink-0 items-center justify-between border-b border-border/70 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="truncate text-sm font-semibold">AI Assistant</div>
        </div>
        <button
          type="button"
          className={cn(
            "mx-2 inline-flex h-7 min-w-0 flex-1 items-center justify-between gap-1 rounded-md border border-border/70 bg-muted/15 px-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            isProviderPickerOpen && "bg-accent text-accent-foreground",
          )}
          onClick={() => {
            setIsProviderPickerOpen((open) => !open);
            setIsHistoryOpen(false);
            setIsModelPickerOpen(false);
          }}
          title={selectedProviderLabel}
          aria-label="选择 AI 模型"
          aria-expanded={isProviderPickerOpen}
        >
          <span className="truncate">配置组：{selectedProviderLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={createNewConversation}
            title="New chat"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              isHistoryOpen && "bg-accent text-accent-foreground",
            )}
            onClick={() => {
              setIsHistoryOpen((open) => !open);
              setIsProviderPickerOpen(false);
              setIsModelPickerOpen(false);
            }}
            title="Chat history"
            aria-label="Chat history"
            aria-pressed={isHistoryOpen}
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onClose}
            title="Close AI Assistant"
            aria-label="Close AI Assistant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isProviderPickerOpen && (
          <div className="absolute left-3 right-3 top-10 z-40 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
              <span className="text-xs font-medium text-foreground">选择配置组</span>
              <button
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => {
                  setIsProviderPickerOpen(false);
                  onOpenAiSettings();
                }}
              >
                <Settings className="h-3 w-3" />
                API 管理
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {enabledProviders.length > 0 ? (
                enabledProviders.map((provider) => {
                  const isSelected = provider.id === selectedProviderId;
                  const modelCount = getEnabledProviderModels(provider).length;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      className={cn(
                        "grid w-full min-w-0 gap-1 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
                        isSelected && "bg-accent text-accent-foreground",
                      )}
                      onClick={() => selectConversationProvider(provider)}
                    >
                      <span className="truncate text-sm font-medium">{provider.name || provider.id}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {modelCount > 0 ? `${modelCount} models` : "无可用模型"}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="grid gap-2 px-3 py-8 text-center text-sm text-muted-foreground">
                  <div>还没有可用配置组</div>
                  <button
                    type="button"
                    className="mx-auto inline-flex h-7 items-center rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent"
                    onClick={() => {
                      setIsProviderPickerOpen(false);
                      onOpenAiSettings();
                    }}
                  >
                    打开 API 管理
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {false && isModelPickerOpen && (
          <div className="absolute left-3 right-3 top-10 z-40 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
            <div className="grid gap-2 border-b border-border/70 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">选择模型</span>
                <button
                  type="button"
                  className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => {
                    setIsModelPickerOpen(false);
                    onOpenAiSettings();
                  }}
                >
                  <Settings className="h-3 w-3" />
                  API 管理
                </button>
              </div>
              <input
                value={modelSearch}
                onChange={(event) => setModelSearch(event.target.value)}
                placeholder="搜索 provider / model"
                className="h-7 rounded-md border border-input bg-background/80 px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {selectableProviders.length > 0 ? (
                selectableProviders.map(({ provider, models }) => (
                  <div key={provider.id} className="py-1">
                    <div className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
                      {provider.name || provider.id}
                    </div>
                    <div className="grid gap-0.5">
                      {models.map((model) => {
                        const isSelected = provider.id === selectedProviderId && model.id === selectedModelId;
                        return (
                          <button
                            key={`${provider.id}:${model.id}`}
                            type="button"
                            className={cn(
                              "grid min-w-0 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
                              isSelected && "bg-accent text-accent-foreground",
                            )}
                            onClick={() => selectConversationModel(provider, model)}
                          >
                            <span className="truncate text-sm font-medium">{model.name || model.id}</span>
                            <span className="truncate text-[11px] text-muted-foreground">
                              {model.id} · {model.source === "manual" ? "手动" : "同步"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid gap-2 px-3 py-8 text-center text-sm text-muted-foreground">
                  <div>还没有可用模型</div>
                  <button
                    type="button"
                    className="mx-auto inline-flex h-7 items-center rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent"
                    onClick={() => {
                      setIsModelPickerOpen(false);
                      onOpenAiSettings();
                    }}
                  >
                    打开 API 管理
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {isHistoryOpen && (
          <div className="absolute right-3 top-10 z-30 w-[340px] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <span className="text-xs font-medium text-foreground">Chat history</span>
              <span className="text-[11px] text-muted-foreground">max {AI_CONVERSATION_LIMIT}</span>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {sortedConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex w-full min-w-0 items-center gap-1 rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
                    conversation.id === activeConversationId && "bg-accent text-accent-foreground",
                  )}
                >
                  {editingConversationId === conversation.id ? (
                    <div className="grid min-w-0 flex-1 gap-1 px-2.5 py-1.5">
                      <input
                        autoFocus
                        className="h-7 min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                        value={editingConversationTitle}
                        onChange={(event) => setEditingConversationTitle(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onBlur={() => saveRenameConversation(conversation.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveRenameConversation(conversation.id);
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelRenameConversation();
                          }
                        }}
                      />
                      <span className="truncate text-[11px] text-muted-foreground">Enter 保存，Esc 取消</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="grid min-w-0 flex-1 gap-1 px-2.5 py-2 text-left"
                      onClick={() => selectConversation(conversation.id)}
                    >
                      <span className="truncate text-sm font-medium">{conversation.title}</span>
                      <span className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>{conversation.messages.length} messages</span>
                        <span className="shrink-0 tabular-nums">{new Date(conversation.updatedAt).toLocaleString()}</span>
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      startRenameConversation(conversation);
                    }}
                    title="Rename chat"
                    aria-label={`Rename chat ${conversation.title}`}
                  >
                    <PenLine className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-75 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteConversation(conversation.id);
                    }}
                    title="Delete chat"
                    aria-label={`Delete chat ${conversation.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 border-b border-border/60 px-3 py-1.5">
        <div className="mb-1.5 flex min-w-0 items-center justify-between gap-3">
          <span className="truncate text-[12px] font-medium leading-5 text-foreground" title={activeConversation?.title}>
            Chat: {activeConversation?.title ?? UNTITLED_CONVERSATION_TITLE}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{messages.length} msg</span>
        </div>
        {context.filePath && includeCurrentNoteContext ? (
          <div className="grid gap-0.5">
            <div className="flex min-w-0 items-center justify-between gap-3 leading-4">
              <span className="text-[11px] font-medium text-muted-foreground">当前笔记上下文</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{context.bodyLength} chars</span>
            </div>
            <div className="truncate text-[13px] font-medium leading-5 text-foreground" title={context.title}>
              {context.title}
            </div>
            <div className="truncate text-[11px] leading-4 text-muted-foreground/85" title={context.filePath}>
              {getCompactPath(context.filePath)}
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 text-[11px] leading-4 text-muted-foreground">
              <span className="truncate">{contextMeta}</span>
              <button
                type="button"
                className="shrink-0 rounded-sm text-[11px] text-muted-foreground/90 underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => setIsContextExpanded((expanded) => !expanded)}
              >
                {isContextExpanded ? "Hide context" : "Show context"}
              </button>
            </div>
            {isContextExpanded && (
              <div className="mt-0.5 grid gap-0.5 rounded-md bg-muted/20 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">
                <div className="truncate" title={context.tags.join(", ") || undefined}>
                  tags: {context.tags.length > 0 ? context.tags.join(", ") : "empty"}
                </div>
                <div className="line-clamp-2" title={context.summary || undefined}>
                  summary: {context.summary || "empty"}
                </div>
              </div>
            )}
          </div>
        ) : context.filePath ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/15 px-2.5 py-1.5">
            <div className="min-w-0">
              <div className="text-[13px] font-medium leading-5 text-foreground">当前笔记信息未包含</div>
              <div className="truncate text-[11px] leading-4 text-muted-foreground">
                {context.selectedTextLength ? `已选中文段 ${context.selectedTextLength} 字，解释命令仍可使用。` : "普通聊天不会读取当前笔记全文、标题或标签。"}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/15 px-2.5 py-1.5">
            <div className="min-w-0">
              <div className="text-[13px] font-medium leading-5 text-foreground">No note selected</div>
              <div className="text-[11px] leading-4 text-muted-foreground">Open a note to attach title, path, body and selection.</div>
            </div>
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={messagesScrollRef}
          className="h-full overflow-y-auto px-3 py-3 [scrollbar-width:thin]"
          onScroll={handleMessagesScroll}
        >
          {messages.length === 0 ? (
            <div className="flex h-full min-h-44 items-center justify-center px-5 text-center">
            <div className="grid max-w-72 gap-3">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted/20 text-muted-foreground">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium text-foreground">Independent chat</div>
              <div className="text-sm leading-6 text-muted-foreground">
                Switching notes changes only the next request context. This chat stays active.
              </div>
            </div>
            </div>
          ) : (
            <div className="grid gap-3">
            {messages.map((message) => {
              if (message.role === "assistant") {
                const elapsedMs = getAssistantElapsedMs(message, elapsedNow);
                const timingLabel = getAssistantTimingLabel(message, elapsedMs);
                return (
                  <div key={message.id} className="mr-auto grid w-full max-w-[94%] gap-1.5 py-1 text-sm leading-6 text-foreground">
                    {timingLabel && (
                      <div className={cn(
                        "text-[11px] leading-4 text-muted-foreground/75",
                        message.state === "error" && "text-amber-600/80 dark:text-amber-300/80",
                      )}>
                        {timingLabel}
                      </div>
                    )}
                    <div className={cn(
                      "min-w-0",
                      message.state === "error" && "rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-2",
                    )}>
                      {message.kind === "tag-suggestion" && message.tagSuggestion ? (
                        <TagSuggestionCard
                          suggestion={message.tagSuggestion}
                          isApplying={applyingTagMessageId === message.id}
                          onApply={() => void applyTagSuggestion(message)}
                          onIgnore={() => ignoreTagSuggestion(message)}
                        />
                      ) : message.kind === "polish-preview" && message.polishPreview ? (
                        <PolishPreviewCard
                          preview={message.polishPreview}
                          isApplying={applyingPolishMessageId === message.id}
                          onApply={() => void applyPolishPreview(message)}
                          onIgnore={() => ignorePolishPreview(message)}
                          onOpenReview={() => onOpenPolishReview(message.polishPreview!)}
                        />
                      ) : (
                        <AiMarkdownMessage markdown={message.text || (message.state === "streaming" ? "Generating..." : "")} />
                      )}
                      {message.state === "error" && message.retryText && (
                        <button
                          type="button"
                          className="mt-2 inline-flex h-7 items-center rounded-md border border-border/70 px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          onClick={() => {
                            if (isResponding) return;
                            if (message.retryCommandId === "complete-tags") {
                              void submitTagSuggestionCommand(message.retryContext, message.retryDisplayText);
                              return;
                            }
                            if (message.retryCommandId === "polish-all" && message.retryContext) {
                              void submitPolishFullNoteCommand(
                                message.retryContext,
                                message.retryDisplayText,
                                message.retryInstruction ?? "",
                              );
                              return;
                            }
                            if (message.retryCommandId === "polish-selection" && message.retryContext) {
                              void submitPolishSelectionCommand(
                                message.retryContext.selectedText,
                                message.retrySelectionRange ?? null,
                                message.retryDisplayText,
                                message.retrySelectionStartLine ?? null,
                              );
                              return;
                            }
                            void submitQuestion(message.retryText ?? "", message.retryContext, message.retryDisplayText);
                          }}
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              if (message.role === "user") {
                return (
                  <div key={message.id} className="ai-chat-user-bubble ml-auto max-w-[92%] rounded-lg border border-transparent bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground shadow-sm">
                    <div className="whitespace-pre-wrap break-words">{message.text}</div>
                  </div>
                );
              }

              return (
                <div
                  key={message.id}
                  className="mx-auto flex max-w-[92%] items-start gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-sm leading-6 text-muted-foreground shadow-sm"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 whitespace-pre-wrap break-words">{message.text}</div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        {showScrollToBottom && (
          <button
            type="button"
            className="absolute bottom-3 left-1/2 z-20 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/15 dark:bg-[#2f3134]/95"
            onClick={() => {
              shouldAutoScrollRef.current = true;
              scrollMessagesToBottom("smooth");
            }}
            title="回到底部"
            aria-label="回到底部"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="relative z-30 shrink-0 px-3 pb-3 pt-2">
        {isCommandPanelOpen && (
          <div className="absolute bottom-[calc(100%-0.45rem)] left-3 right-3 z-20 overflow-hidden rounded-2xl border border-[#dcdfe6] bg-white text-popover-foreground shadow-[0_18px_48px_rgb(15_23_42/0.16)] dark:border-white/10 dark:bg-[#2f3134] dark:shadow-[0_18px_52px_rgb(0_0_0/0.42)]">
            <div className="flex items-center justify-between px-3 py-2 text-[11px] text-muted-foreground">
              <div className="font-medium">选择命令</div>
              <div>上下键 - 回车</div>
            </div>
            {visibleCommands.length > 0 ? (
              <div className="max-h-72 overflow-y-auto px-1.5 pb-1.5 [scrollbar-width:thin] [scrollbar-color:color-mix(in_oklch,var(--muted-foreground)_30%,transparent)_transparent]">
                {groupedVisibleCommands.map(({ category, commands }) => (
                  <div key={category} className="py-0.5">
                    <div className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/75">
                      {category}
                    </div>
                    <div className="grid gap-0.5">
                      {commands.map((command) => {
                        const itemIndex = commandOrdinal;
                        commandOrdinal += 1;
                        const Icon = command.icon;
                        const disabledReason = getCommandDisabledReason(command, context);
                        const isActive = itemIndex === activeCommandIndex;
                        return (
                          <button
                            key={command.id}
                            ref={(element) => {
                              commandRowRefs.current[command.id] = element;
                            }}
                            type="button"
                            className={cn(
                              "flex h-11 w-full items-center gap-2 rounded-lg px-2 text-left transition-[background-color,color,box-shadow]",
                              isActive
                                ? "bg-[#eef3f8] text-foreground shadow-[inset_0_0_0_1px_rgb(15_23_42/0.03)] dark:bg-white/10"
                                : "text-foreground hover:bg-[#f5f7fa] dark:hover:bg-white/[0.07]",
                            )}
                            onMouseEnter={() => setActiveCommandIndex(itemIndex)}
                            onClick={() => selectCommand(command)}
                            data-active={isActive ? "true" : undefined}
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-baseline gap-2">
                                <span className="shrink-0 text-sm font-medium text-foreground">{command.label}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {disabledReason ? `${command.description} ${disabledReason}` : command.description}
                                </span>
                              </span>
                            </span>
                            {disabledReason && (
                              <span className="shrink-0 rounded-full bg-muted/70 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground dark:bg-white/[0.08]">
                                占位
                              </span>
                            )}
                            {!disabledReason && !command.implemented && (
                              <span className="shrink-0 rounded-full bg-muted/70 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground dark:bg-white/[0.08]">
                                即将支持
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">没有匹配命令</div>
            )}
          </div>
        )}

        <div className="ai-composer rounded-2xl border border-[#dcdfe6] bg-[#fafafa] p-2.5 shadow-[0_10px_26px_rgb(15_23_42/0.06)] transition-[border-color,box-shadow,background-color] focus-within:border-[#b8c0cc] focus-within:shadow-[0_12px_32px_rgb(15_23_42/0.10)] dark:border-white/10 dark:bg-[#2b2d2f] dark:shadow-[0_12px_34px_rgb(0_0_0/0.24)] dark:focus-within:border-white/20 dark:focus-within:shadow-[0_14px_38px_rgb(0_0_0/0.34)]">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              setActiveCommandIndex(0);
              setIsCommandPanelDismissed(false);
            }}
            onPointerDownCapture={(event) => {
              event.stopPropagation();
              event.currentTarget.focus();
            }}
            onMouseDownCapture={(event) => {
              event.stopPropagation();
              event.currentTarget.focus();
            }}
            onKeyDown={handleInputKeyDown}
            rows={3}
            placeholder="Ask a question, or type /"
            className="max-h-36 min-h-20 w-full resize-none border-0 !bg-transparent px-2 py-1.5 text-sm leading-6 text-foreground !shadow-none outline-none placeholder:text-muted-foreground/75 focus:!shadow-none"
          />
          <div className="flex items-center justify-between gap-2 px-1.5 pt-2 text-[11px] text-muted-foreground">
            <div className="relative flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 max-w-[55%] items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2.5 text-left text-[11px] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-white/[0.04]",
                  isModelPickerOpen && "bg-accent text-accent-foreground",
                )}
                onClick={() => {
                  setIsModelPickerOpen((open) => !open);
                  setIsProviderPickerOpen(false);
                  setIsHistoryOpen(false);
                }}
                title={selectedModelLabel}
                aria-label="选择当前模型"
                aria-expanded={isModelPickerOpen}
              >
                <span className="truncate">模型：{selectedModelLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={includeCurrentNoteContext}
                className={cn(
                  "inline-flex h-7 min-w-0 shrink items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2 text-[11px] transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:bg-white/[0.04]",
                  includeCurrentNoteContext && "border-primary/40 bg-primary/10 text-foreground",
                )}
                onClick={() => setIncludeCurrentNoteContext((enabled) => !enabled)}
                title={includeCurrentNoteContext ? "普通聊天会包含当前笔记信息" : "普通聊天不会包含当前笔记信息"}
              >
                <span
                  className={cn(
                    "relative h-3.5 w-6 shrink-0 rounded-full bg-muted-foreground/30 transition-colors",
                    includeCurrentNoteContext && "bg-primary/70",
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-background shadow-sm transition-transform",
                      includeCurrentNoteContext && "translate-x-2.5",
                    )}
                  />
                </span>
                <span className="truncate">包含当前笔记信息</span>
              </button>

              {isModelPickerOpen && (
                <div className="absolute bottom-9 left-0 z-40 w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
                  <div className="grid gap-2 border-b border-border/70 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {activeProvider ? activeProvider.name || activeProvider.id : "未选择配置组"}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={() => {
                          setIsModelPickerOpen(false);
                          onOpenAiSettings();
                        }}
                      >
                        <Settings className="h-3 w-3" />
                        API 管理
                      </button>
                    </div>
                    {activeProviderModels.length > 6 && (
                      <input
                        value={modelSearch}
                        onChange={(event) => setModelSearch(event.target.value)}
                        placeholder="搜索模型"
                        className="h-7 rounded-md border border-input bg-background/80 px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1.5 [scrollbar-width:thin]">
                    {selectableModels.length > 0 ? (
                      <div className="grid gap-0.5">
                        {selectableModels.map((model) => {
                          const isSelected = model.id === selectedModelId;
                          return (
                            <button
                              key={model.id}
                              type="button"
                              className={cn(
                                "grid min-w-0 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
                                isSelected && "bg-accent text-accent-foreground",
                              )}
                              onClick={() => selectConversationModel(model)}
                            >
                              <span className="truncate text-sm font-medium">{model.name || model.id}</span>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {model.id} · {model.source === "manual" ? "手动" : "同步"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="grid gap-2 px-3 py-7 text-center text-sm text-muted-foreground">
                        <div>{activeProvider ? "当前配置组没有可用模型" : "未选择配置组"}</div>
                        <button
                          type="button"
                          className="mx-auto inline-flex h-7 items-center rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent"
                          onClick={() => {
                            setIsModelPickerOpen(false);
                            onOpenAiSettings();
                          }}
                        >
                          去设置中心同步或手动添加
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <span className="truncate">{inputValue.startsWith("/") ? "选择命令" : composerHint}</span>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#202124] text-white shadow-sm transition-[background-color,color,opacity,transform,box-shadow] hover:bg-[#111827] hover:shadow disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:opacity-55 dark:bg-[#f3f4f6] dark:text-[#202124] dark:hover:bg-white dark:disabled:bg-white/12 dark:disabled:text-muted-foreground"
              onClick={submitInput}
              disabled={inputValue.trim().length === 0 || isResponding}
              title={isResponding ? "Thinking" : "Send"}
              aria-label={isResponding ? "Thinking" : "Send"}
            >
              {isResponding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
