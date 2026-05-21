import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Copy,
  FileText,
  History,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  MessageCircle,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { CodexDiffPreview, getDiffStats } from "@/components/ai/DiffPreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { renderMarkdownForTheme } from "@/lib/markdown";
import { applyAiSearchQueryPlan, applySourceStrategyPlan, buildExplicitUrlReadPlan, buildSearchDecision, evaluateWebSourceEvidence, getWebReadBudgetPlan, limitWebSearchQueriesForProvider, markAiQueryPlannerFallback, normalizeWebSearchConfig, prepareWebSourcesForDecision, PUBLIC_WEB_REQUEST_POLICY, rankPreparedWebSources, shouldUseAiQueryPlanner, validateAiSearchQueryPlan, WEB_CACHE_STATUSES, WEB_CONTENT_STATUSES, WEB_DISCOVERY_METHODS, WEB_EVIDENCE_STATUSES, WEB_PAGE_TYPES, WEB_SOURCE_EXCERPT_STATUSES, WEB_SOURCE_KINDS, WEB_SOURCE_RELIABILITIES, WEB_SOURCE_STRENGTHS, type AiSearchPlannerContext, type AiSearchPlannerState, type ExplicitUrlReadPlan, type SearchDecision, type WebSearchMode, type WebSearchProvider, type WebSource } from "@/lib/aiWebSearch";
import { findCitationMarkerMatches, getUsedCitationIdList, possibleCitationMarkerPattern } from "@/lib/citations";
import { createSearchPreparationDiagnostics, encodeDebugValue, formatBingDiagnostics, formatDirectDiscoveryDiagnostics, formatNewsReadDiagnostics, formatSearchPreparationDiagnostics, formatSearchPreparationDiagnosticsForDisplay, getDebugReasonLabel, getSearchStageDebugLabel, mergeSearchDebug } from "@/lib/searchDiagnostics";
import { formatLuoguSolution, type SolutionFormatChange } from "@/lib/solutionFormatter";
import { cn } from "@/lib/utils";
import type { AiPolishPreview, AiSidebarNoteContext, AiSidebarProps } from "@/components/ai/types";
import {
  openExternalUrl,
  fetchWebSourceExcerpts,
  planSearchQueries,
  polishFullNote,
  polishSelectedText,
  saveAiConfig,
  searchLocalNotes,
  searchWebSources,
  suggestNoteTags,
  startCurrentNoteChatStream,
  type AiConfig,
  type AiModel,
  type AiProvider,
  type LocalNoteSearchResult,
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
  kind?: "text" | "tag-suggestion" | "polish-preview" | "compression-result";
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
  sources?: WebSource[];
  searchError?: string;
  searchErrorDebug?: string;
  searchDecision?: SearchDecision;
  webSearchFilteredCount?: number;
  webSearchFilterReason?: string;
  webSearchStatus?: "planning" | "searching" | "filtering" | "fetching_excerpts" | "answering" | "failed" | "done";
  webSearchStatusText?: string;
  localNoteSources?: LocalNoteSearchResult[];
  localNoteSearchStatus?: "searching" | "failed" | "done";
  localNoteSearchError?: string;
  startedAt?: number;
  finishedAt?: number;
  elapsedMs?: number;
  compressionResult?: CompressionResult;
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
  compressedContextSummary?: string;
  compressedContextUpdatedAt?: number;
  compressedContextSourceChars?: number;
  compressedContextModel?: string;
  compressedContextProvider?: string;
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
  mode?: "chat" | "compress-context";
  compressionSourceChars?: number;
  compressionStartedAt?: number;
};

type AiStatusSnapshot = {
  modelLabel: string;
  notePath: string | null;
  noteChars: number;
  totalContextChars: number;
  includeCurrentNoteContext: boolean;
};

type CompressionResult = {
  sourceChars: number;
  compressedChars: number;
  ratio: number;
  modelLabel: string;
  providerLabel: string;
  elapsedMs: number | null;
  summary: string;
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
    id: "explain-selection",
    trigger: "解释选中部分",
    label: "解释选中部分",
    description: "解释当前选中的文本。",
    category: "文档",
    icon: BookOpen,
    requiresNote: true,
    requiresSelection: true,
    mode: "readonly",
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
    id: "compress-context",
    trigger: "压缩上下文",
    label: "压缩上下文",
    description: "准备更紧凑的对话上下文。",
    category: "上下文",
    icon: Archive,
    mode: "readonly",
    implemented: true,
  },
  {
    id: "status",
    trigger: "状态",
    label: "状态",
    description: "查看当前会话、模型和上下文状态。",
    category: "上下文",
    icon: Info,
    mode: "readonly",
    implemented: true,
  },
];

const COMMAND_CATEGORIES: SlashCommand["category"][] = ["文档", "上下文"];
const NOTE_CHAT_MAX_MARKDOWN_CHARS = 16000;
const NOTE_CHAT_MAX_SELECTION_CHARS = 4000;
const NOTE_CHAT_MAX_PARAGRAPH_CHARS = 4000;
const AI_CONVERSATIONS_STORAGE_KEY = "oi-notebook.aiConversations";
const AI_INCLUDE_NOTE_CONTEXT_STORAGE_KEY = "oi-notebook.ai.includeCurrentNoteContext";
const AI_WEB_SEARCH_MODE_STORAGE_KEY = "oi-notebook.ai.webSearchMode";
const AI_CONVERSATION_LIMIT = 20;
const AI_CONVERSATION_MESSAGE_LIMIT = 100;
const AI_QUERY_PLANNER_TIMEOUT_MS = 5000;
const LOCAL_NOTE_SEARCH_TIMEOUT_MS = 5000;
const COMPOSER_TEXTAREA_MIN_HEIGHT = 56;
const COMPOSER_TEXTAREA_MAX_HEIGHT = 180;

const waitForNextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};
const AI_REQUEST_HISTORY_LIMIT = 8;
const AI_REQUEST_HISTORY_MESSAGE_MAX_CHARS = 1200;
const AI_RECENT_HISTORY_AFTER_COMPRESSION_LIMIT = 4;
const AI_COMPRESSED_CONTEXT_MAX_CHARS = 4000;
const AI_COMPRESSION_INPUT_MAX_CHARS = 18000;
const AI_COMPRESSION_MESSAGE_MAX_CHARS = 1400;
const AI_SCROLL_BOTTOM_THRESHOLD = 64;
const LEGACY_UNTITLED_CONVERSATION_TITLE = "New chat";
const UNTITLED_CONVERSATION_TITLE = "新对话";
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

const readWebSearchModePreference = (): WebSearchMode => {
  try {
    return window.localStorage.getItem(AI_WEB_SEARCH_MODE_STORAGE_KEY) === "auto" ? "auto" : "off";
  } catch {
    return "off";
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

const getCommandDescriptionText = (command: SlashCommand, disabledReason: string | null): string => {
  if (!disabledReason) return command.description;
  return command.description.includes(disabledReason)
    ? command.description
    : `${command.description}${command.description.endsWith("。") ? "" : "。"}${disabledReason}`;
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

const getWebSearchErrorMessage = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const detailStart = message.indexOf("; debug=");
  const scopedMessage = detailStart >= 0 ? message.slice(0, detailStart) : message;
  if (/task panicked|start byte index|parser_panic_caught|parser-panic-caught/i.test(message)) {
    return "Bing 页面解析时发生内部错误，已拦截。请查看 Developer Mode 诊断。";
  }
  if (message.includes("provider=bing")) {
    const directAttempted = message.includes("directDiscoveryAttempted=yes");
    const directCandidatesFound = Number(message.match(/directDiscoveryCandidatesFound=(\d+)/)?.[1] ?? "0");
    const directCandidatesKept = Number(message.match(/directDiscoveryCandidatesKept=(\d+)/)?.[1] ?? "0");
    if (message.includes("errorKind=rate_limited") || message.includes("429")) {
      return "Bing 公开搜索被限制了，稍后可以重试，或切换 Bocha / Brave。";
    }
    if (message.includes("errorKind=blocked_or_captcha") || /captcha|verify/i.test(message)) {
      return "Bing 公开搜索被验证页拦截了，稍后可以重试，或切换 Bocha / Brave。";
    }
    if (message.includes("errorKind=timeout")) return "Bing 公开搜索超时了，可以稍后重试。";
    if (message.includes("finalFailureReason=all_filtered") || message.includes("fallback_web_filtered_all")) {
      if (directAttempted && directCandidatesKept > 0) {
        return "找到了一些公开候选，但它们不是可引用的近期新闻正文，因此没有注入回答。";
      }
      if (directAttempted) {
        return "公开来源直连和 Bing 都没有成功读取到可引用的近期新闻正文，因此我不能可靠总结最新动态。";
      }
      return "Bing 返回的结果都不像相关新闻，因此没有注入回答。";
    }
    if (message.includes("errorKind=parse_failed") || message.includes("finalFailureReason=no_candidates") || message.includes("errorKind=no_results")) {
      if (directAttempted && directCandidatesFound > 0) {
        return "找到了一些公开候选，但它们不是可引用的近期新闻正文，因此没有注入回答。";
      }
      if (directAttempted) {
        return "公开来源直连和 Bing 都没有成功读取到可引用的近期新闻正文，因此我不能可靠总结最新动态。";
      }
      return "Bing 返回了页面，但暂时没有解析到可用新闻结果。";
    }
    return (scopedMessage.trim() || "Bing 公开搜索暂时不可用。").slice(0, 300);
  }
  return (scopedMessage.trim() || "联网搜索失败，请稍后重试。").slice(0, 300);
};

const getWebSearchDebugMessage = (error: unknown): string | undefined => {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!message.includes("provider=bing") && !message.includes("debug=") && !message.includes("searchPreparationStarted=")) return undefined;
  return message.slice(0, 1800);
};

const getEffectiveSearchTopicKeywords = (decision: SearchDecision): string[] | undefined => {
  const plannerKeywords = decision.aiPlanner?.topicKeywords?.filter((keyword) => keyword.trim().length > 0) ?? [];
  const ruleKeywords = decision.topicKeywords?.filter((keyword) => keyword.trim().length > 0) ?? [];
  const merged = Array.from(new Set([...plannerKeywords, ...ruleKeywords]));
  const keywordText = `${decision.rawQuestion} ${decision.queries.join(" ")}`;
  const looksLikeAiNews =
    (decision.newsIntent === true || decision.vertical === "news" || decision.aiPlanner?.freshness === "news") &&
    /\bai\b|人工智能|大模型|openai|chatgpt|anthropic|google|deepmind|gemini/i.test(keywordText);
  if (looksLikeAiNews) {
    for (const keyword of ["AI", "人工智能", "OpenAI", "Anthropic", "Google", "DeepMind", "Gemini", "ChatGPT", "大模型"]) {
      if (!merged.includes(keyword)) merged.push(keyword);
    }
  }
  return merged.length > 0 ? merged.slice(0, 10) : undefined;
};

const isNewsRoundupDecision = (decision: SearchDecision): boolean =>
  decision.newsIntent === true ||
  decision.vertical === "news" ||
  decision.aiPlanner?.freshness === "news";

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

const isUntitledConversationTitle = (title: string): boolean => {
  const normalized = title.trim();
  return normalized.length === 0 ||
    normalized === UNTITLED_CONVERSATION_TITLE ||
    normalized === LEGACY_UNTITLED_CONVERSATION_TITLE;
};

const getConversationDisplayTitle = (conversation: AiConversation | undefined): string => {
  if (!conversation) return UNTITLED_CONVERSATION_TITLE;
  const title = conversation.title.trim();
  if (!isUntitledConversationTitle(title)) return title;
  const latestUserMessage = [...conversation.messages].reverse().find((message) => (
    message.role === "user" && message.text.trim().length > 0
  ));
  return latestUserMessage ? getConversationTitleFromQuestion(latestUserMessage.text) : UNTITLED_CONVERSATION_TITLE;
};

const formatConversationRelativeTime = (updatedAt: number): string => {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return "刚刚";
  const diffMs = Date.now() - updatedAt;
  if (diffMs < 60_000) return "刚刚";

  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMinutes < 60) return `${diffMinutes}分`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 365) return `${diffDays}天`;

  return `${Math.floor(diffDays / 365)}年`;
};

const isAiChatMessage = (value: unknown): value is AiChatMessage => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AiChatMessage>;
  return typeof item.id === "string" && typeof item.text === "string" && (
    item.role === "user" || item.role === "assistant" || item.role === "system"
  );
};

const isLegacyStatusMessage = (message: AiChatMessage): boolean => (
  (message as { kind?: string }).kind === "status" ||
  (message.role === "user" && /^\/状态(?:\s|$)/.test(message.text.trim()))
);

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

const sanitizeCompressionResultForStorage = (value: unknown): CompressionResult | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<CompressionResult>;
  if (typeof item.summary !== "string" || !item.summary.trim()) return undefined;
  return {
    sourceChars: typeof item.sourceChars === "number" && Number.isFinite(item.sourceChars) ? Math.max(0, item.sourceChars) : 0,
    compressedChars:
      typeof item.compressedChars === "number" && Number.isFinite(item.compressedChars) ? Math.max(0, item.compressedChars) : item.summary.length,
    ratio: typeof item.ratio === "number" && Number.isFinite(item.ratio) ? Math.max(0, item.ratio) : 0,
    modelLabel: typeof item.modelLabel === "string" ? item.modelLabel : "未知模型",
    providerLabel: typeof item.providerLabel === "string" ? item.providerLabel : "未知配置组",
    elapsedMs: typeof item.elapsedMs === "number" && Number.isFinite(item.elapsedMs) ? Math.max(0, item.elapsedMs) : null,
    summary: item.summary.trim(),
  };
};

const sanitizeAiPlannerStateForStorage = (value: unknown): AiSearchPlannerState | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<AiSearchPlannerState>;
  const triggers = new Set<AiSearchPlannerState["trigger"]>(["initial", "off_topic_retry", "disabled", "fallback"]);
  const stringList = (items: unknown, max = 10): string[] | undefined => Array.isArray(items)
    ? items.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).slice(0, max)
    : undefined;
  const freshnessValues = new Set(["none", "recent", "latest", "news"]);
  const verticalValues = new Set(["news", "oi", "algorithm", "general_web", "product", "docs", "explicit_url", "no_search"]);
  const depthValues = new Set(["quick", "normal", "deep", "news", "oi_research"]);
  const plannerContext = item.plannerContext && typeof item.plannerContext === "object"
    ? item.plannerContext as Partial<AiSearchPlannerContext>
    : undefined;
  return {
    enabled: item.enabled === true,
    used: item.used === true,
    trigger: item.trigger && triggers.has(item.trigger) ? item.trigger : "fallback",
    ruleBasedQueries: stringList(item.ruleBasedQueries, 8) ?? [],
    searchGoal: typeof item.searchGoal === "string" && item.searchGoal.trim() ? item.searchGoal.trim() : undefined,
    vertical: typeof item.vertical === "string" && verticalValues.has(item.vertical) ? item.vertical : undefined,
    generatedQueries: stringList(item.generatedQueries, 3),
    rewrittenIntent: typeof item.rewrittenIntent === "string" && item.rewrittenIntent.trim() ? item.rewrittenIntent.trim() : undefined,
    topicKeywords: stringList(item.topicKeywords, 10),
    requiredKeywords: stringList(item.requiredKeywords, 10),
    negativeKeywords: stringList(item.negativeKeywords, 12),
    freshness: typeof item.freshness === "string" && freshnessValues.has(item.freshness) ? item.freshness : undefined,
    plannerContext: plannerContext &&
      typeof plannerContext.currentDate === "string" &&
      typeof plannerContext.currentDateText === "string" &&
      typeof plannerContext.currentTimeZone === "string" &&
      typeof plannerContext.locale === "string" &&
      typeof plannerContext.recencyWindowHint === "string"
      ? {
        currentDate: plannerContext.currentDate.slice(0, 32),
        currentDateText: plannerContext.currentDateText.slice(0, 48),
        currentTimeZone: plannerContext.currentTimeZone.slice(0, 64),
        locale: plannerContext.locale.slice(0, 24),
        recencyWindowHint: plannerContext.recencyWindowHint.slice(0, 80),
      }
      : undefined,
    depth: typeof item.depth === "string" && depthValues.has(item.depth) ? item.depth : undefined,
    readBudget: typeof item.readBudget === "number" && Number.isFinite(item.readBudget) ? Math.max(1, Math.min(12, Math.round(item.readBudget))) : undefined,
    preferredSourceTypes: stringList(item.preferredSourceTypes, 8),
    preferredDomains: stringList(item.preferredDomains, 8),
    avoidSourceTypes: stringList(item.avoidSourceTypes, 8),
    reason: typeof item.reason === "string" && item.reason.trim() ? item.reason.trim() : undefined,
    confidence: typeof item.confidence === "number" && Number.isFinite(item.confidence)
      ? Math.max(0, Math.min(1, item.confidence))
      : undefined,
    fallbackReason: typeof item.fallbackReason === "string" && item.fallbackReason.trim() ? item.fallbackReason.trim() : undefined,
    retried: item.retried === true,
  };
};

const sanitizeSearchDecisionForStorage = (value: unknown): SearchDecision | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<SearchDecision>;
  const intents = new Set<SearchDecision["intent"]>([
    "no_search",
    "oi_problem",
    "oi_discussion",
    "algorithm_reference",
    "debug_issue",
    "general_web",
  ]);
  if (!item.intent || !intents.has(item.intent)) return undefined;
  return {
    shouldSearch: item.shouldSearch === true,
    intent: item.intent,
    rawQuestion: typeof item.rawQuestion === "string" && item.rawQuestion.trim() ? item.rawQuestion.trim() : undefined,
    problemId: typeof item.problemId === "string" && item.problemId.trim() ? item.problemId.trim() : undefined,
    problemTitle: typeof item.problemTitle === "string" && item.problemTitle.trim() ? item.problemTitle.trim() : undefined,
    algorithmKeywords: Array.isArray(item.algorithmKeywords)
      ? item.algorithmKeywords.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0).slice(0, 8)
      : undefined,
    errorKeywords: Array.isArray(item.errorKeywords)
      ? item.errorKeywords.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0).slice(0, 8)
      : undefined,
    topicKeywords: Array.isArray(item.topicKeywords)
      ? item.topicKeywords.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0).slice(0, 8)
      : undefined,
    newsIntent: item.newsIntent === true,
    recencyIntent: item.recencyIntent === true,
    vertical: item.vertical,
    sourceStrategy: item.sourceStrategy,
    queries: Array.isArray(item.queries)
      ? item.queries.filter((query): query is string => typeof query === "string" && query.trim().length > 0).slice(0, 8)
      : [],
    aiPlanner: sanitizeAiPlannerStateForStorage(item.aiPlanner),
    confidence: typeof item.confidence === "number" && Number.isFinite(item.confidence)
      ? Math.max(0, Math.min(1, item.confidence))
      : undefined,
    reason: typeof item.reason === "string" && item.reason.trim() ? item.reason.trim() : undefined,
  };
};

const isKnownStringValue = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (values as readonly string[]).includes(value);

const sanitizeSourcesForStorage = (value: unknown): WebSource[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const sourceTypes = new Set<NonNullable<WebSource["sourceType"]>>([
    "problem",
    "solution",
    "discussion",
    "wiki",
    "blog",
    "official",
    "unknown",
  ]);
  const sources = value.flatMap((item): WebSource[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<WebSource>;
    if (typeof source.id !== "string" || typeof source.title !== "string" || typeof source.url !== "string") return [];
    const title = source.title.trim();
    const url = source.url.trim();
    if (!title || !url) return [];
    return [{
      id: source.id.trim() || url,
      title,
      url,
      finalUrl: typeof source.finalUrl === "string" && source.finalUrl.trim() ? source.finalUrl.trim() : undefined,
      site: typeof source.site === "string" && source.site.trim() ? source.site.trim() : undefined,
      snippet: typeof source.snippet === "string" && source.snippet.trim() ? source.snippet.trim() : undefined,
      sourceKind: isKnownStringValue(WEB_SOURCE_KINDS, source.sourceKind) ? source.sourceKind : undefined,
      discoveryMethod: isKnownStringValue(WEB_DISCOVERY_METHODS, source.discoveryMethod) ? source.discoveryMethod : undefined,
      sourceReliability: typeof source.sourceReliability === "string" && source.sourceReliability.trim()
        ? source.sourceReliability.trim() as WebSource["sourceReliability"]
        : undefined,
      discoveredBy: typeof source.discoveredBy === "string" && source.discoveredBy.trim()
        ? source.discoveredBy.trim()
        : undefined,
      feedUrl: typeof source.feedUrl === "string" && source.feedUrl.trim()
        ? source.feedUrl.trim()
        : undefined,
      sourceHome: typeof source.sourceHome === "string" && source.sourceHome.trim()
        ? source.sourceHome.trim()
        : undefined,
      directDiscoveryReason: typeof source.directDiscoveryReason === "string" && source.directDiscoveryReason.trim()
        ? source.directDiscoveryReason.trim()
        : undefined,
      sourceType: source.sourceType && sourceTypes.has(source.sourceType) ? source.sourceType : "unknown",
      dateHint: typeof source.dateHint === "string" && source.dateHint.trim()
        ? source.dateHint.trim()
        : undefined,
      freshnessScore: typeof source.freshnessScore === "number" && Number.isFinite(source.freshnessScore)
        ? source.freshnessScore
        : undefined,
      searchDiagnostics: typeof source.searchDiagnostics === "string" && source.searchDiagnostics.trim()
        ? source.searchDiagnostics.trim()
        : undefined,
      newsLike: source.newsLike === true ? true : source.newsLike === false ? false : undefined,
      filteredReason: typeof source.filteredReason === "string" && source.filteredReason.trim()
        ? source.filteredReason.trim()
        : undefined,
      finalIncludedInPrompt: source.finalIncludedInPrompt === true ? true : source.finalIncludedInPrompt === false ? false : undefined,
      evidenceStatus: isKnownStringValue(WEB_EVIDENCE_STATUSES, source.evidenceStatus) ? source.evidenceStatus : undefined,
      usableEvidence: source.usableEvidence === true ? true : source.usableEvidence === false ? false : undefined,
      injectedIntoAnswer: source.injectedIntoAnswer === true ? true : source.injectedIntoAnswer === false ? false : undefined,
      evidenceReason: typeof source.evidenceReason === "string" && source.evidenceReason.trim()
        ? source.evidenceReason.trim()
        : undefined,
      rejectedReason: typeof source.rejectedReason === "string" && source.rejectedReason.trim()
        ? source.rejectedReason.trim()
        : undefined,
      pageType: isKnownStringValue(WEB_PAGE_TYPES, source.pageType) ? source.pageType : undefined,
      contentStatus: isKnownStringValue(WEB_CONTENT_STATUSES, source.contentStatus) ? source.contentStatus : undefined,
      sourceStrength: isKnownStringValue(WEB_SOURCE_STRENGTHS, source.sourceStrength) ? source.sourceStrength : undefined,
      reliability: isKnownStringValue(WEB_SOURCE_RELIABILITIES, source.reliability) ? source.reliability : "unknown",
      reliabilityLabel: typeof source.reliabilityLabel === "string" && source.reliabilityLabel.trim()
        ? source.reliabilityLabel.trim()
        : undefined,
      reliabilityReason: typeof source.reliabilityReason === "string" && source.reliabilityReason.trim()
        ? source.reliabilityReason.trim()
        : undefined,
      selected: source.selected === true,
      relevance:
        source.relevance === "strong" || source.relevance === "candidate" || source.relevance === "unrelated"
          ? source.relevance
          : undefined,
      relevanceLabel: typeof source.relevanceLabel === "string" && source.relevanceLabel.trim()
        ? source.relevanceLabel.trim()
        : undefined,
      relevanceReason: typeof source.relevanceReason === "string" && source.relevanceReason.trim()
        ? source.relevanceReason.trim()
        : undefined,
      excerptStatus: isKnownStringValue(WEB_SOURCE_EXCERPT_STATUSES, source.excerptStatus) ? source.excerptStatus : undefined,
      excerpt: typeof source.excerpt === "string" && source.excerpt.trim()
        ? source.excerpt.trim().slice(0, 5000)
        : undefined,
      excerptError: typeof source.excerptError === "string" && source.excerptError.trim()
        ? source.excerptError.trim()
        : undefined,
      contentType: typeof source.contentType === "string" && source.contentType.trim()
        ? source.contentType.trim()
        : undefined,
      bodyBytes: typeof source.bodyBytes === "number" && Number.isFinite(source.bodyBytes)
        ? source.bodyBytes
        : undefined,
      extractedTextChars: typeof source.extractedTextChars === "number" && Number.isFinite(source.extractedTextChars)
        ? source.extractedTextChars
        : undefined,
      excerptChars: typeof source.excerptChars === "number" && Number.isFinite(source.excerptChars)
        ? source.excerptChars
        : undefined,
      publishedAt: typeof source.publishedAt === "string" && source.publishedAt.trim()
        ? source.publishedAt.trim()
        : undefined,
      finalUrlHost: typeof source.finalUrlHost === "string" && source.finalUrlHost.trim()
        ? source.finalUrlHost.trim()
        : undefined,
      fetchedAt: typeof source.fetchedAt === "number" && Number.isFinite(source.fetchedAt)
        ? source.fetchedAt
        : undefined,
      cacheStatus: isKnownStringValue(WEB_CACHE_STATUSES, source.cacheStatus) ? source.cacheStatus : undefined,
      readStatus:
        source.readStatus === "fetched" ||
        source.readStatus === "partial" ||
        source.readStatus === "blocked" ||
        source.readStatus === "failed" ||
        source.readStatus === "cached" ||
        source.readStatus === "stale"
          ? source.readStatus
          : undefined,
      errorKind: typeof source.errorKind === "string" ? source.errorKind : undefined,
      cachedAt: typeof source.cachedAt === "string" && source.cachedAt.trim()
        ? source.cachedAt.trim()
        : undefined,
      cacheTtlSeconds: typeof source.cacheTtlSeconds === "number" && Number.isFinite(source.cacheTtlSeconds)
        ? source.cacheTtlSeconds
        : undefined,
      excerptQuality:
        source.excerptQuality === "high" ||
        source.excerptQuality === "medium" ||
        source.excerptQuality === "low" ||
        source.excerptQuality === "snippet_only" ||
        source.excerptQuality === "title_only" ||
        source.excerptQuality === "unavailable" ||
        source.excerptQuality === "too_short" ||
        source.excerptQuality === "good" ||
        source.excerptQuality === "partial" ||
        source.excerptQuality === "empty" ||
        source.excerptQuality === "blocked" ||
        source.excerptQuality === "failed"
          ? source.excerptQuality
          : undefined,
      extractor:
        source.extractor === "oi_wiki" ||
        source.extractor === "cp_algorithms" ||
        source.extractor === "luogu" ||
        source.extractor === "generic" ||
        source.extractor === "none"
          ? source.extractor
          : undefined,
      excerptReason: typeof source.excerptReason === "string" && source.excerptReason.trim()
        ? source.excerptReason.trim()
        : undefined,
      blockedReason: typeof source.blockedReason === "string" && source.blockedReason.trim()
        ? source.blockedReason.trim()
        : undefined,
      needsJsReason: typeof source.needsJsReason === "string" && source.needsJsReason.trim()
        ? source.needsJsReason.trim()
        : undefined,
      extractionFailureReason: typeof source.extractionFailureReason === "string" && source.extractionFailureReason.trim()
        ? source.extractionFailureReason.trim()
        : undefined,
      codeBlocksTruncated: source.codeBlocksTruncated === true,
      rankScore: typeof source.rankScore === "number" && Number.isFinite(source.rankScore)
        ? source.rankScore
        : undefined,
      rankReason: typeof source.rankReason === "string" && source.rankReason.trim()
        ? source.rankReason.trim()
        : undefined,
      sourceRegistryBoost: typeof source.sourceRegistryBoost === "number" && Number.isFinite(source.sourceRegistryBoost)
        ? source.sourceRegistryBoost
        : undefined,
      sourceRegistryLabel: typeof source.sourceRegistryLabel === "string" && source.sourceRegistryLabel.trim()
        ? source.sourceRegistryLabel.trim()
        : undefined,
      sourceRegistryReason: typeof source.sourceRegistryReason === "string" && source.sourceRegistryReason.trim()
        ? source.sourceRegistryReason.trim()
        : undefined,
      readPriority: typeof source.readPriority === "number" && Number.isFinite(source.readPriority)
        ? source.readPriority
        : undefined,
      isConstructed: source.isConstructed === true,
      constructedReason: typeof source.constructedReason === "string" && source.constructedReason.trim()
        ? source.constructedReason.trim()
        : undefined,
      citationId: typeof source.citationId === "string" && /^S\d{1,2}$/.test(source.citationId.trim())
        ? source.citationId.trim()
        : undefined,
      eventCluster: typeof source.eventCluster === "string" && source.eventCluster.trim()
        ? source.eventCluster.trim()
        : undefined,
      clusterLabel: typeof source.clusterLabel === "string" && source.clusterLabel.trim()
        ? source.clusterLabel.trim()
        : undefined,
      clusterReason: typeof source.clusterReason === "string" && source.clusterReason.trim()
        ? source.clusterReason.trim()
        : undefined,
      clusterSize: typeof source.clusterSize === "number" && Number.isFinite(source.clusterSize)
        ? source.clusterSize
        : undefined,
      selectedForRoundup: source.selectedForRoundup === true,
      droppedAsDuplicateCluster: source.droppedAsDuplicateCluster === true,
      queryFocusEntities: Array.isArray(source.queryFocusEntities)
        ? source.queryFocusEntities.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 5)
        : undefined,
      companySpecificNews: source.companySpecificNews === true,
      focusEntitySource: source.focusEntitySource,
      candidatePrimaryEntities: Array.isArray(source.candidatePrimaryEntities)
        ? source.candidatePrimaryEntities.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 5)
        : undefined,
      entityMatchStrength: typeof source.entityMatchStrength === "string"
        ? source.entityMatchStrength
        : undefined,
      entityFilterApplied: source.entityFilterApplied === true,
      rejectedWrongEntityReason: typeof source.rejectedWrongEntityReason === "string" && source.rejectedWrongEntityReason.trim()
        ? source.rejectedWrongEntityReason.trim()
        : undefined,
    }];
  });
  return sources.length > 0 ? sources.slice(0, 24) : undefined;
};

const sanitizeLocalNoteSourcesForStorage = (value: unknown): LocalNoteSearchResult[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const sources = value.flatMap((item): LocalNoteSearchResult[] => {
    if (!item || typeof item !== "object") return [];
    const source = item as Partial<LocalNoteSearchResult>;
    if (
      typeof source.id !== "string" ||
      typeof source.title !== "string" ||
      typeof source.relativePath !== "string" ||
      typeof source.snippet !== "string"
    ) {
      return [];
    }
    const title = source.title.trim();
    const relativePath = source.relativePath.trim();
    const snippet = source.snippet.trim();
    if (!title || !relativePath || !snippet) return [];
    return [{
      id: source.id.trim() || relativePath,
      title,
      path: typeof source.path === "string" && source.path.trim() ? source.path.trim() : relativePath,
      relativePath,
      snippet: snippet.slice(0, 1200),
      score: typeof source.score === "number" && Number.isFinite(source.score) ? source.score : 0,
      reason: typeof source.reason === "string" && source.reason.trim() ? source.reason.trim() : "matched local note content",
      lineStart: typeof source.lineStart === "number" && Number.isFinite(source.lineStart) ? Math.max(1, Math.floor(source.lineStart)) : undefined,
      lineEnd: typeof source.lineEnd === "number" && Number.isFinite(source.lineEnd) ? Math.max(1, Math.floor(source.lineEnd)) : undefined,
      isCurrentNote: source.isCurrentNote === true,
      headingPath: Array.isArray(source.headingPath)
        ? source.headingPath.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 6)
        : undefined,
      chunkIndex: typeof source.chunkIndex === "number" && Number.isFinite(source.chunkIndex) ? Math.max(0, Math.floor(source.chunkIndex)) : undefined,
      matchedTerms: Array.isArray(source.matchedTerms)
        ? source.matchedTerms.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 16)
        : undefined,
      detectedProblemIds: Array.isArray(source.detectedProblemIds)
        ? source.detectedProblemIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 12)
        : undefined,
      detectedAlgorithmTerms: Array.isArray(source.detectedAlgorithmTerms)
        ? source.detectedAlgorithmTerms.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 16)
        : undefined,
      diagnostics: typeof source.diagnostics === "string" && source.diagnostics.trim() ? source.diagnostics.trim().slice(0, 1000) : undefined,
      localCitationId: typeof source.localCitationId === "string" && /^N\d{1,2}$/.test(source.localCitationId.trim())
        ? source.localCitationId.trim()
        : undefined,
    }];
  });
  return sources.length > 0 ? sources.slice(0, 5) : undefined;
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
  messages.filter((message) => !isLegacyStatusMessage(message)).slice(-AI_CONVERSATION_MESSAGE_LIMIT).map((message) => ({
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
    compressionResult: sanitizeCompressionResultForStorage(message.compressionResult),
    searchDecision: sanitizeSearchDecisionForStorage(message.searchDecision),
    sources: sanitizeSourcesForStorage(message.sources),
    searchError: typeof message.searchError === "string" && message.searchError.trim()
      ? message.searchError.trim()
      : undefined,
    searchErrorDebug: typeof message.searchErrorDebug === "string" && message.searchErrorDebug.trim()
      ? message.searchErrorDebug.trim()
      : undefined,
    webSearchFilteredCount: typeof message.webSearchFilteredCount === "number" && Number.isFinite(message.webSearchFilteredCount)
      ? Math.max(0, Math.floor(message.webSearchFilteredCount))
      : undefined,
    webSearchFilterReason: typeof message.webSearchFilterReason === "string" && message.webSearchFilterReason.trim()
      ? message.webSearchFilterReason.trim()
      : undefined,
    localNoteSources: sanitizeLocalNoteSourcesForStorage(message.localNoteSources),
    localNoteSearchStatus: message.localNoteSearchStatus === "done" || message.localNoteSearchStatus === "failed"
      ? message.localNoteSearchStatus
      : undefined,
    localNoteSearchError: typeof message.localNoteSearchError === "string" && message.localNoteSearchError.trim()
      ? message.localNoteSearchError.trim()
      : undefined,
    webSearchStatus: message.webSearchStatus === "done" || message.webSearchStatus === "failed"
      ? message.webSearchStatus
      : undefined,
    webSearchStatusText: typeof message.webSearchStatusText === "string" && message.webSearchStatusText.trim()
      ? message.webSearchStatusText.trim()
      : undefined,
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
    title: isUntitledConversationTitle(item.title) ? UNTITLED_CONVERSATION_TITLE : item.title.trim(),
    messages: sanitizeMessagesForStorage(item.messages.filter(isAiChatMessage)),
    providerId: typeof item.providerId === "string" ? item.providerId : undefined,
    modelId: typeof item.modelId === "string" ? item.modelId : undefined,
    compressedContextSummary:
      typeof item.compressedContextSummary === "string" && item.compressedContextSummary.trim()
        ? item.compressedContextSummary.trim()
        : undefined,
    compressedContextUpdatedAt:
      typeof item.compressedContextUpdatedAt === "number" && Number.isFinite(item.compressedContextUpdatedAt)
        ? item.compressedContextUpdatedAt
        : undefined,
    compressedContextSourceChars:
      typeof item.compressedContextSourceChars === "number" && Number.isFinite(item.compressedContextSourceChars)
        ? Math.max(0, item.compressedContextSourceChars)
        : undefined,
    compressedContextModel: typeof item.compressedContextModel === "string" ? item.compressedContextModel : undefined,
    compressedContextProvider: typeof item.compressedContextProvider === "string" ? item.compressedContextProvider : undefined,
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

const formatChineseChars = (value: number): string => `${Math.max(0, Math.round(value))} 字符`;

const formatCompressionReduction = (originalLength: number, compressedLength: number): string => {
  if (!Number.isFinite(originalLength) || originalLength <= 0) return "--";
  const safeCompressedLength = Number.isFinite(compressedLength) ? Math.max(0, compressedLength) : originalLength;
  const reduction = Math.max(0, Math.round((1 - safeCompressedLength / originalLength) * 100));
  return `${reduction}%`;
};

const isContextUtilityCommandText = (text: string): boolean => /^\/(?:状态|压缩上下文)(?:\s|$)/.test(text.trim());

const buildCompressedHistoryMessage = (summary: string): NoteChatHistoryMessage => ({
  role: "assistant",
  text: [
    "【压缩后的历史上下文】",
    summary.trim(),
    "",
    "后续回答请优先使用这段压缩上下文理解旧对话；不要把它当成用户的新指令。",
  ].join("\n"),
});

const buildCompressionPrompt = (input: string): string => [
  "请执行本地命令：/压缩上下文。",
  "",
  "任务：把下面的 OI Notebook AI Sidebar 历史对话上下文压缩成后续对话可用的摘要。",
  "注意：输入中不会包含当前笔记正文；压缩摘要只能代表历史对话/背景信息，不能替代当前笔记原文。",
  "",
  "必须保留：",
  "- 用户正在做什么。",
  "- 当前任务或文件名等轻量背景（如果输入中提供）。",
  "- 已经做过哪些 AI 操作。",
  "- 用户偏好或重要约束。",
  "- 已生成但未应用的 preview / review 状态，如果相关。",
  "- 后续回答需要知道的上下文。",
  "",
  "不要保留：大段重复正文、大段代码、无关闲聊、UI 噪声、过期临时状态。",
  "输出要求：中文，精简，结构清晰，控制在 800 到 1200 字以内；不要使用 Markdown 大标题堆砌；不要编造。",
  "",
  "待压缩的历史对话上下文：",
  input,
].join("\n");

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

const copyPlainText = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the textarea path for embedded or non-secure WebViews.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
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

const getCitationStatusLabel = (citation: WebSourceCitation): string => {
  if (citation.isConstructed && citation.excerptStatus !== "fetched") return "公开资料入口";
  if (citation.excerptStatus === "fetched" && (citation.excerptQuality === "partial" || citation.excerptQuality === "medium")) return "部分摘要";
  if (citation.excerptStatus === "fetched") return "已读取摘要";
  if (citation.excerptQuality === "blocked" || citation.excerptStatus === "unavailable") return "正文不可用";
  if (citation.excerptStatus === "failed") return "读取失败";
  return "仅搜索摘要";
};

type CitationDisplayEntry = {
  citation: WebSourceCitation;
  displayNumber: number;
  kind: "web";
};

type LocalNoteCitationDisplayEntry = {
  source: LocalNoteSearchResult;
  displayNumber: number;
  kind: "local";
};

type AiCitationDisplayEntry = CitationDisplayEntry | LocalNoteCitationDisplayEntry;

const getUsedSourceCitationIdList = (text: string, citations: WebSourceCitation[]): string[] =>
  getUsedCitationIdList(text, citations.map((citation) => citation.citationId));

const getUsedCitationIds = (text: string, citations: WebSourceCitation[]): Set<string> =>
  new Set(getUsedSourceCitationIdList(text, citations));

const getDisplayedSourceCitations = (text: string, citations: WebSourceCitation[]): DisplayedSourceCitation[] => {
  if (citations.length === 0) return [];
  const citationById = new Map(citations.map((citation) => [citation.citationId, citation]));
  const usedIds = getUsedSourceCitationIdList(text, citations);
  const displayed = usedIds.length > 0
    ? usedIds.map((citationId) => citationById.get(citationId)).filter((citation): citation is WebSourceCitation => Boolean(citation))
    : citations;
  return displayed.map((citation, index) => ({ ...citation, displayNumber: index + 1 }));
};

const getCitationDisplayMap = (text: string, citations: WebSourceCitation[]): Map<string, CitationDisplayEntry> =>
  new Map(
    getDisplayedSourceCitations(text, citations).map((citation) => [
      citation.citationId,
      { citation, displayNumber: citation.displayNumber, kind: "web" },
    ]),
  );

const getLocalNoteCitationId = (source: LocalNoteSearchResult): string | undefined =>
  typeof source.localCitationId === "string" && /^N\d{1,2}$/.test(source.localCitationId.trim())
    ? source.localCitationId.trim()
    : undefined;

const getLocalNoteCitationDisplayMap = (sources: LocalNoteSearchResult[] | undefined): Map<string, LocalNoteCitationDisplayEntry> =>
  new Map(
    (sources ?? []).slice(0, 5).flatMap((source, index) => {
      const localCitationId = getLocalNoteCitationId(source);
      return localCitationId
        ? [[localCitationId, { source, displayNumber: index + 1, kind: "local" as const }]]
        : [];
    }),
  );

const getDisplayedLocalNoteSources = (text: string, sources: LocalNoteSearchResult[] | undefined): LocalNoteSearchResult[] => {
  const validSources = (sources ?? []).filter((source) => isValidLocalCitationId(source.localCitationId));
  if (validSources.length === 0) return [];
  const sourceByCitationId = new Map(validSources.map((source) => [source.localCitationId!, source]));
  return getUsedCitationIdList(text, validSources.map((source) => source.localCitationId!))
    .map((citationId) => sourceByCitationId.get(citationId))
    .filter((source): source is LocalNoteSearchResult => Boolean(source));
};

const getAiCitationDisplayMap = (
  text: string,
  citations: WebSourceCitation[],
  localNoteSources?: LocalNoteSearchResult[],
): Map<string, AiCitationDisplayEntry> =>
  new Map<string, AiCitationDisplayEntry>([
    ...getCitationDisplayMap(text, citations).entries(),
    ...getLocalNoteCitationDisplayMap(localNoteSources).entries(),
  ]);

const decorateAiCitationMarkers = (html: string, citations: Map<string, AiCitationDisplayEntry>): string => {
  if (citations.size === 0 || !possibleCitationMarkerPattern.test(html)) return html;

  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Text)) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest("pre, code, kbd, samp, button, a")) continue;
    if (possibleCitationMarkerPattern.test(node.data)) textNodes.push(node);
  }

  for (const node of textNodes) {
    const fragment = document.createDocumentFragment();
    const text = node.data;
    let lastIndex = 0;

    for (const match of findCitationMarkerMatches(text)) {
      const { rawMarker } = match;
      if (match.index > lastIndex) {
        fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      const normalizedCitationId = match.citationId;
      const displayEntry = citations.get(normalizedCitationId);
      if (!displayEntry) {
        fragment.append(document.createTextNode(rawMarker));
      } else {
        const { displayNumber } = displayEntry;
        const sup = document.createElement("sup");
        sup.className = "not-prose";
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.aiCitationId = normalizedCitationId;
        if (displayEntry.kind === "local") {
          button.dataset.aiCitationKind = "local";
          button.className = "ml-1 inline align-super text-[9px] font-semibold leading-none text-amber-700/80 opacity-80 transition-opacity hover:text-amber-700 hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:text-amber-300/80 dark:hover:text-amber-200";
          button.textContent = `N${displayNumber}`;
          button.title = [
            `本地笔记 ${displayNumber}：${displayEntry.source.title}`,
            displayEntry.source.relativePath,
            displayEntry.source.reason,
          ].filter(Boolean).join(" · ");
          button.setAttribute("aria-label", `定位本地笔记 ${displayNumber}`);
        } else {
          const { citation } = displayEntry;
          button.dataset.aiCitationKind = "web";
          button.className = "ml-0.5 inline align-super text-[10px] font-semibold leading-none text-primary/70 opacity-75 transition-opacity hover:text-primary hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
          button.textContent = String(displayNumber);
          button.title = [
            `来源 ${displayNumber}：${citation.site ?? citation.reliabilityLabel ?? "来源"}`,
            citation.title,
            citation.site,
            citation.reliabilityLabel,
            getCitationStatusLabel(citation),
          ].filter(Boolean).join(" · ");
          button.setAttribute("aria-label", `定位来源 ${displayNumber}`);
        }
        sup.append(button);
        fragment.append(sup);
      }

      lastIndex = match.index + rawMarker.length;
    }

    if (lastIndex < text.length) {
      fragment.append(document.createTextNode(text.slice(lastIndex)));
    }
    node.replaceWith(fragment);
  }

  return template.innerHTML;
};

function AiMarkdownMessage({
  markdown,
  citations,
  localNoteSources,
  onCitationClick,
}: {
  markdown: string;
  citations?: WebSourceCitation[];
  localNoteSources?: LocalNoteSearchResult[];
  onCitationClick?: (citationId: string) => void;
}) {
  const [renderedHtml, setRenderedHtml] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const normalizedMarkdown = useMemo(() => normalizeAiMathDelimiters(markdown), [markdown]);
  const citationMap = useMemo(
    () => getAiCitationDisplayMap(markdown, citations ?? [], localNoteSources),
    [citations, localNoteSources, markdown],
  );

  useEffect(() => {
    let cancelled = false;
    const theme = getTheme();

    renderMarkdownForTheme(normalizedMarkdown, theme)
      .then((html) => {
        if (!cancelled) setRenderedHtml(decorateAiCitationMarkers(decorateAiCodeBlocks(html), citationMap));
      })
      .catch((error) => {
        console.warn("Render AI markdown message failed:", error);
        if (!cancelled) setRenderedHtml("");
      });

    return () => {
      cancelled = true;
    };
  }, [citationMap, normalizedMarkdown]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !renderedHtml) return;

    const timeoutIds = new Set<number>();

    const handleClick = async (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const citationButton = target.closest<HTMLButtonElement>("button[data-ai-citation-id]");
      if (citationButton && root.contains(citationButton)) {
        const citationId = citationButton.dataset.aiCitationId;
        if (isValidCitationId(citationId) || isValidLocalCitationId(citationId)) {
          event.preventDefault();
          onCitationClick?.(citationId);
        }
        return;
      }

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
  }, [onCitationClick, renderedHtml]);

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

const SEARCH_PLAN_QUERY_LIMIT = 6;
const SEARCH_SOURCE_PREVIEW_LIMIT = 8;
const WEB_SOURCE_CITATION_LIMIT = 8;

type WebSourceCitation = {
  id: string;
  citationId: string;
  title: string;
  url?: string;
  site?: string;
  reliabilityLabel?: string;
  excerptStatus?: WebSource["excerptStatus"];
  excerptQuality?: WebSource["excerptQuality"];
  isConstructed?: boolean;
};

type DisplayedSourceCitation = WebSourceCitation & {
  displayNumber: number;
};

const getSearchConfidenceLabel = (confidence: number | undefined): string => {
  if (typeof confidence !== "number") return "按需判断";
  if (confidence >= 0.85) return "高";
  if (confidence >= 0.65) return "较高";
  if (confidence >= 0.45) return "一般";
  return "较低";
};

const getSearchIntentLabel = (intent: SearchDecision["intent"]): string => {
  switch (intent) {
    case "oi_problem":
      return "题目 / 题解相关";
    case "oi_discussion":
      return "讨论 / 常见坑";
    case "algorithm_reference":
      return "算法资料";
    case "debug_issue":
      return "调试 / 错误排查";
    case "general_web":
      return "普通联网搜索";
    case "no_search":
    default:
      return "无需联网";
  }
};

const getSearchPlanChips = (decision: SearchDecision): string[] => [
  decision.problemId ? `题号：${decision.problemId}` : "",
  ...(decision.algorithmKeywords ?? []).map((keyword) => `算法：${keyword}`),
  ...(decision.errorKeywords ?? []).map((keyword) => `错误：${keyword}`),
].filter(Boolean);

const getWebSearchProviderLabel = (provider: WebSearchProvider): string => {
  switch (provider) {
    case "bing":
      return "Bing 公开搜索";
    case "bocha":
      return "博查 Bocha";
    case "brave":
      return "Brave Search";
    default:
      return provider;
  }
};

const formatLocalDateParts = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getPlannerLocale = (userInput: string): string => {
  if (/[\u4e00-\u9fff]/.test(userInput)) return "zh-CN";
  return navigator.language || "en-US";
};

const getRecencyWindowHint = (userInput: string): string => {
  const text = userInput.toLocaleLowerCase();
  if (/(今天|今日|刚刚|now|today)/i.test(text)) return "近 24 小时";
  if (/(最新|latest|breaking)/i.test(text)) return "近 24-48 小时";
  if (/(本周|这周|this week)/i.test(text)) return "本周";
  if (/(本月|这个月|this month)/i.test(text)) return "本月";
  if (/(今年|2026|this year)/i.test(text)) return "今年";
  if (/(新闻|最近|近期|动态|进展|recent|news|updates?)/i.test(text)) return "近 7 天";
  return "无明确时效窗口";
};

const buildAiSearchPlannerContext = (userInput: string): AiSearchPlannerContext => {
  const now = new Date();
  const locale = getPlannerLocale(userInput);
  return {
    currentDate: formatLocalDateParts(now),
    currentDateText: new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(now),
    currentTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Local",
    locale,
    recencyWindowHint: getRecencyWindowHint(userInput),
  };
};

const getSearchVerticalLabel = (vertical?: string): string => {
  switch (vertical) {
    case "news":
      return "新闻";
    case "oi":
      return "OI";
    case "algorithm":
      return "算法";
    case "general_web":
      return "普通网页";
    case "product":
      return "产品 / 服务";
    case "docs":
      return "技术文档";
    case "explicit_url":
      return "用户链接";
    case "no_search":
      return "不搜索";
    default:
      return "未识别";
  }
};

const getSearchDepthLabel = (depth?: string): string => {
  switch (depth) {
    case "quick":
      return "快速";
    case "normal":
      return "常规";
    case "deep":
      return "深入";
    case "news":
      return "新闻";
    case "oi_research":
      return "OI 调研";
    default:
      return "未指定";
  }
};

const getFreshnessLabel = (freshness?: string): string => {
  switch (freshness) {
    case "news":
      return "新闻";
    case "latest":
      return "最新";
    case "recent":
      return "近期";
    case "none":
      return "不限时效";
    default:
      return "未指定";
  }
};

const getPlannerTriggerLabel = (trigger?: string): string => {
  switch (trigger) {
    case "initial":
      return "首次规划";
    case "off_topic_retry":
      return "跑偏后重搜";
    case "fallback":
      return "规则兜底";
    case "disabled":
      return "未启用";
    default:
      return trigger ?? "未知";
  }
};

const getBooleanLabel = (value: boolean | undefined): string =>
  value === true ? "是" : value === false ? "否" : "未记录";

function WebSearchPlanCard({
  decision,
  provider,
  filteredCount,
  filterReason,
}: {
  decision: SearchDecision;
  provider: WebSearchProvider;
  filteredCount?: number;
  filterReason?: string;
}) {
  if (!decision.shouldSearch) return null;

  const chips = getSearchPlanChips(decision);
  const visibleQueries = decision.queries.slice(0, SEARCH_PLAN_QUERY_LIMIT);
  const hiddenQueryCount = Math.max(0, decision.queries.length - visibleQueries.length);
  const aiPlanner = decision.aiPlanner;
  const sourceStrategy = decision.sourceStrategy;
  const readBudget = sourceStrategy?.readBudget ?? getWebReadBudgetPlan(decision);

  return (
    <div className="mb-2 grid gap-3 rounded-xl border border-sky-200/70 bg-sky-50/65 px-3.5 py-3 text-[13px] leading-6 text-slate-700 shadow-[0_8px_20px_rgb(15_23_42/0.05)] dark:border-sky-400/20 dark:bg-sky-400/[0.08] dark:text-slate-200">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">联网搜索计划</span>
        <span className="rounded-full border border-sky-200/80 bg-white/70 px-1.5 py-0.5 text-[10px] leading-4 text-sky-700 dark:border-sky-300/20 dark:bg-white/[0.05] dark:text-sky-200">
          按需公开搜索
        </span>
      </div>
      <div className="grid gap-1.5">
        {decision.rawQuestion && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">原始问题</span>
            <div className="min-w-0 break-words rounded-md bg-background/70 px-2.5 py-1 text-[13px] leading-6 text-foreground dark:bg-white/[0.05]">
              {decision.rawQuestion}
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">当前搜索源</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            {getWebSearchProviderLabel(provider)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">意图</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-foreground dark:bg-white/[0.05]">
            {getSearchIntentLabel(decision.intent)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">搜索必要性</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-foreground dark:bg-white/[0.05]">
            {getSearchConfidenceLabel(decision.confidence)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">时效 / 新闻</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            近期：{getBooleanLabel(decision.recencyIntent)}
          </span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            新闻：{getBooleanLabel(decision.newsIntent)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-muted-foreground">搜索类型 / 阅读预算</span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            类型：{getSearchVerticalLabel(decision.vertical ?? aiPlanner?.vertical)}
          </span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            深度：{getSearchDepthLabel(readBudget.depth)}
          </span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            计划读取：{readBudget.targetReadSuccesses}/{readBudget.maxReadAttempts}
          </span>
          <span className="rounded-full bg-background/80 px-2 py-0.5 text-[12px] text-foreground dark:bg-white/[0.05]">
            并发：{readBudget.maxConcurrentReads}
          </span>
        </div>
        {decision.topicKeywords && decision.topicKeywords.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">主题词</span>
            {decision.topicKeywords.slice(0, 8).map((keyword) => (
              <span
                key={keyword}
                className="max-w-full rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-foreground dark:bg-white/[0.05]"
              >
                {keyword}
              </span>
            ))}
          </div>
        )}
        {decision.reason && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">判断原因</span>
            <div className="min-w-0 break-words rounded-md bg-background/70 px-2 py-1 text-[11px] leading-5 text-foreground dark:bg-white/[0.05]">
              {decision.reason}
            </div>
          </div>
        )}
        {chips.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="shrink-0 text-muted-foreground">识别信息</span>
            {chips.map((chip) => (
              <span
                key={chip}
                className="max-w-full rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-foreground dark:bg-white/[0.05]"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        {visibleQueries.length > 0 && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">计划搜索</span>
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {visibleQueries.map((query) => (
                <span
                  key={query}
                  className="min-w-0 max-w-full rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[11px] leading-5 text-foreground break-words dark:border-white/10 dark:bg-white/[0.05]"
                >
                  {query}
                </span>
              ))}
              {hiddenQueryCount > 0 && (
                <span className="rounded-md bg-background/60 px-2 py-1 text-[11px] text-muted-foreground dark:bg-white/[0.04]">
                  还有 {hiddenQueryCount} 条
                </span>
              )}
            </div>
          </div>
        )}
        {aiPlanner && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">AI 搜索规划</span>
            <div className="grid min-w-0 gap-1.5 rounded-md bg-background/70 px-2.5 py-2 text-[13px] leading-6 text-foreground dark:bg-white/[0.05]">
              <div className="flex min-w-0 flex-wrap gap-1.5">
                <span className="rounded-full bg-background/80 px-2 py-0.5 dark:bg-white/[0.05]">
                  状态：{aiPlanner.enabled ? "已启用" : "未启用"}
                </span>
                <span className="rounded-full bg-background/80 px-2 py-0.5 dark:bg-white/[0.05]">
                  本轮使用：{aiPlanner.used ? "是" : "否"}
                </span>
                <span className="rounded-full bg-background/80 px-2 py-0.5 dark:bg-white/[0.05]">
                  触发：{getPlannerTriggerLabel(aiPlanner.trigger)}
                </span>
                {aiPlanner.freshness && (
                  <span className="rounded-full bg-background/80 px-2 py-0.5 dark:bg-white/[0.05]">
                    时效：{getFreshnessLabel(aiPlanner.freshness)}
                  </span>
                )}
                {aiPlanner.retried && (
                  <span className="rounded-full bg-background/80 px-2 py-0.5 dark:bg-white/[0.05]">
                    已重搜
                  </span>
                )}
              </div>
              {aiPlanner.plannerContext && (
                <div className="min-w-0 break-words text-muted-foreground">
                  当前时间：{aiPlanner.plannerContext.currentDateText}（{aiPlanner.plannerContext.currentTimeZone}） · 时效窗口：{aiPlanner.plannerContext.recencyWindowHint} · 语言：{aiPlanner.plannerContext.locale}
                </div>
              )}
              {aiPlanner.ruleBasedQueries.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  规则搜索词：{aiPlanner.ruleBasedQueries.join(" | ")}
                </div>
              )}
              {aiPlanner.generatedQueries && aiPlanner.generatedQueries.length > 0 && (
                <div className="min-w-0 break-words">
                  AI 生成搜索词：{aiPlanner.generatedQueries.join(" | ")}
                </div>
              )}
              {aiPlanner.topicKeywords && aiPlanner.topicKeywords.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  主题词：{aiPlanner.topicKeywords.join(" / ")}
                </div>
              )}
              {aiPlanner.negativeKeywords && aiPlanner.negativeKeywords.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  排除词：{aiPlanner.negativeKeywords.join(" / ")}
                </div>
              )}
              {aiPlanner.fallbackReason && (
                <div className="min-w-0 break-words text-amber-700 dark:text-amber-200">
                  兜底原因：{getDebugReasonLabel(aiPlanner.fallbackReason)}
                </div>
              )}
            </div>
          </div>
        )}
        {sourceStrategy && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">来源策略</span>
            <div className="grid min-w-0 gap-1.5 rounded-md bg-background/70 px-2.5 py-2 text-[13px] leading-6 text-foreground dark:bg-white/[0.05]">
              <div className="min-w-0 break-words">
                搜索类型：{getSearchVerticalLabel(sourceStrategy.vertical)}；候选上限：{sourceStrategy.candidateLimit}；{sourceStrategy.reason}
              </div>
              {sourceStrategy.targetedQueries.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  定向搜索词：{sourceStrategy.targetedQueries.join(" | ")}
                </div>
              )}
              {sourceStrategy.droppedTargetedQueries && sourceStrategy.droppedTargetedQueries.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  Dropped query diversification：{sourceStrategy.droppedTargetedQueries.map((item) => `${item.query} (${item.reason})`).join(" | ")}
                </div>
              )}
              {sourceStrategy.preferredDomains.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  优先站点：{sourceStrategy.preferredDomains.slice(0, 8).join(" / ")}
                </div>
              )}
              {sourceStrategy.registryBoosts.length > 0 && (
                <div className="min-w-0 break-words text-muted-foreground">
                  站点加权：{sourceStrategy.registryBoosts.slice(0, 6).map((boost) => `${boost.label}+${boost.weight}`).join(" / ")}
                </div>
              )}
            </div>
          </div>
        )}
        {typeof filteredCount === "number" && filteredCount > 0 && (
          <div className="grid min-w-0 gap-1">
            <span className="text-muted-foreground">低相关结果过滤</span>
            <div className="min-w-0 break-words rounded-md bg-background/70 px-2.5 py-1.5 text-[13px] leading-6 text-foreground dark:bg-white/[0.05]">
              已过滤 {filteredCount} 条低相关结果{filterReason ? `：${getDebugReasonLabel(filterReason)}` : "，原因：搜索词或主题不匹配"}
            </div>
          </div>
        )}
      </div>
      <div className="text-[12px] leading-5 text-muted-foreground">
        当前阶段会先生成搜索计划，再按授权和配置决定是否执行公开搜索。
      </div>
    </div>
  );
}

const getSourceTypeLabel = (sourceType: WebSource["sourceType"]): string => {
  switch (sourceType) {
    case "problem":
      return "题面";
    case "solution":
      return "题解";
    case "discussion":
      return "讨论";
    case "wiki":
      return "Wiki";
    case "blog":
      return "博客";
    case "official":
      return "官方";
    case "unknown":
    default:
      return "来源";
  }
};

const getReliabilityLabel = (source: WebSource): string => source.reliabilityLabel || (
  source.reliability === "official" ? "官方" :
  source.reliability === "wiki" ? "知识库" :
  source.reliability === "community_solution" ? "社区题解" :
  source.reliability === "discussion" ? "讨论" :
  source.reliability === "blog" ? "博客" :
  "未知"
);

const getSourceRelevanceLabel = (source: WebSource): string =>
  source.relevanceLabel || (source.relevance === "candidate" ? "相关资料" : "强相关");

const isValidCitationId = (citationId: string | undefined): citationId is string =>
  typeof citationId === "string" && /^S\d{1,2}$/.test(citationId);

const isValidLocalCitationId = (citationId: string | undefined): citationId is string =>
  typeof citationId === "string" && /^N\d{1,2}$/.test(citationId);

const getPromptCitationCandidates = (sources: WebSource[]): WebSource[] => {
  const evidenceSources = sources.filter((source) => source.usableEvidence === true && source.evidenceStatus === "usable");
  const selectedSources = evidenceSources.filter((source) => source.selected === true && source.relevance !== "unrelated");
  const candidates = selectedSources.length > 0
    ? selectedSources
    : evidenceSources.filter((source) => source.relevance !== "unrelated");
  return candidates.slice(0, WEB_SOURCE_CITATION_LIMIT);
};

const assignWebSourceCitationIds = (sources: WebSource[] | undefined): WebSource[] | undefined => {
  if (!sources || sources.length === 0) return sources;
  const targetKeys = new Set(getPromptCitationCandidates(sources).map((source) => source.id || source.url));
  let citationIndex = 0;
  return sources.map((source) => {
    const key = source.id || source.url;
    if (!targetKeys.has(key)) return { ...source, citationId: undefined };
    citationIndex += 1;
    return { ...source, citationId: `S${citationIndex}` };
  });
};

const assignLocalNoteCitationIds = (sources: LocalNoteSearchResult[] | undefined): LocalNoteSearchResult[] | undefined =>
  sources?.slice(0, 5).map((source, index) => ({
    ...source,
    localCitationId: `N${index + 1}`,
  }));

const getSourceCitations = (sources: WebSource[] | undefined): WebSourceCitation[] =>
  (sources ?? [])
    .filter((source) => isValidCitationId(source.citationId))
    .map((source) => ({
      id: source.id || source.url,
      citationId: source.citationId!,
      title: source.title,
      url: source.url,
      site: source.site,
      reliabilityLabel: getReliabilityLabel(source),
      excerptStatus: source.excerptStatus,
      excerptQuality: source.excerptQuality,
      isConstructed: source.isConstructed,
    }));

const getSourceExcerptStatusLabel = (source: WebSource): string => {
  const rawExcerptStatus = source.excerptStatus as string | undefined;
  if (source.excerptStatus === "fetched" && (source.excerptQuality === "partial" || source.excerptQuality === "medium")) return "部分摘要";
  if (source.excerptStatus === "fetched" && source.cacheStatus === "hit") return "已读取缓存摘要";
  if (source.excerptStatus === "fetched" && source.cacheStatus === "stale") return "已读取过期摘要";
  if (source.excerptStatus === "fetched") return "已读取摘要";
  if (rawExcerptStatus === "blocked" || source.excerptQuality === "blocked") return "需要页面渲染";
  if (source.excerptQuality === "snippet_only" || source.excerptQuality === "title_only" || source.excerptQuality === "too_short") return "正文过短";
  if (source.excerptStatus === "unavailable") return "正文不可用";
  if (source.excerptStatus === "failed") return "读取失败";
  if (source.isConstructed) return "未读取正文";
  return "仅搜索摘要";
};

const getSourceOriginLabel = (source: WebSource): string =>
  source.discoveryMethod === "direct_rss" ? "Direct RSS" :
    source.discoveryMethod === "direct_site" ? "Direct Site" :
      source.discoveryMethod === "constructed_source" || source.isConstructed ? "公开资料入口" :
        source.sourceKind === "explicit_url" ? "用户链接" : "搜索结果";

const getSourceDebugKindLabel = (source: WebSource): string => {
  if (source.sourceKind === "explicit_url") return "用户提供 URL";
  if (source.sourceKind === "rss_item") return "RSS/Atom 条目";
  if (source.sourceKind === "official_news") return "官方新闻候选";
  if (source.sourceKind === "official_blog") return "官方博客候选";
  if (source.sourceKind === "docs_page") return "技术文档候选";
  if (source.sourceKind === "oi_reference") return "OI 资料候选";
  if (source.sourceKind === "constructed_source" || source.isConstructed) return "公开资料入口";
  return "搜索结果";
};

const getSourceDebugReadMethodLabel = (source: WebSource): string => {
  if (source.sourceKind === "explicit_url") return "本地公开网页读取";
  if (source.discoveryMethod === "direct_rss") return "Direct RSS 候选 + 本地公开网页读取";
  if (source.discoveryMethod === "direct_site") return "Direct Site 候选 + 本地公开网页读取";
  if (source.sourceKind === "constructed_source" || source.isConstructed) {
    return source.excerptStatus === "fetched" ? "构造入口 + 本地公开网页读取" : "构造入口；尚未读取正文";
  }
  return "搜索结果 + 本地公开网页摘录";
};

const getSourceDebugCacheLabel = (source: WebSource): string => {
  if (source.excerptStatus === "failed" || source.excerptQuality === "failed") return "读取失败";
  if (source.excerptStatus === "unavailable" || source.excerptQuality === "blocked" || source.excerptQuality === "unavailable" || source.excerptQuality === "snippet_only" || source.excerptQuality === "title_only" || source.excerptQuality === "too_short" || (source.excerptStatus as string | undefined) === "blocked") return "读取失败";
  if (!source.excerptStatus || source.excerptStatus === "not_requested") return "未读取正文";
  if (source.cacheStatus === "hit") return "缓存命中";
  if (source.cacheStatus === "stale") return "缓存过期";
  if (source.cacheStatus === "miss") return "缓存未命中";
  if (source.cacheStatus === "disabled") return "缓存未使用";
  return source.excerptStatus === "fetched" ? "缓存未命中" : "未读取正文";
};

const getProviderDebugLabel = (source: WebSource, provider: WebSearchProvider): string => {
  if (source.discoveryMethod === "direct_rss" || source.discoveryMethod === "direct_site") {
    return "Provider 未使用：No-Key Direct Discovery";
  }
  if (source.sourceKind === "explicit_url" || source.sourceKind === "constructed_source" || source.isConstructed) {
    return "Provider 未使用";
  }
  const sourceProvider = source.searchProvider ?? provider;
  return `当前搜索源：${getWebSearchProviderLabel(sourceProvider)}`;
};

const getSourceCardDescription = (source: WebSource): string | undefined => {
  const rawExcerptStatus = source.excerptStatus as string | undefined;
  if (source.excerptStatus === "fetched") {
    const excerptPreview = source.excerpt?.replace(/\s+/g, " ").trim();
    if (excerptPreview) {
      const preview = excerptPreview.length > 120 ? `${excerptPreview.slice(0, 120)}...` : excerptPreview;
      return `${source.excerptQuality === "partial" || source.excerptQuality === "medium" ? "已提取部分相关片段" : "已提取相关片段"}：${preview}`;
    }
    return source.excerptQuality === "partial" || source.excerptQuality === "medium" ? "已从公开页面提取部分网页摘录。" : "已从公开页面提取网页摘录。";
  }
  if (rawExcerptStatus === "blocked" || source.excerptQuality === "blocked" || source.excerptStatus === "unavailable") {
    return "正文不可用或需要页面渲染。";
  }
  if (source.excerptStatus === "failed") {
    return "读取失败。";
  }
  if (source.isConstructed) {
    return "公开资料入口，尚未读取网页正文。";
  }
  return source.snippet;
};

const getWebSearchStageText = (status?: AiChatMessage["webSearchStatus"], fallback?: string): string => {
  if (fallback?.trim()) return fallback.trim();
  if (status === "planning") return "正在准备搜索计划...";
  if (status === "searching") return "正在搜索公开网页...";
  if (status === "filtering") return "正在筛选相关来源...";
  if (status === "fetching_excerpts") return "正在读取网页摘录...";
  if (status === "answering") return "正在生成回答...";
  if (status === "failed") return "联网搜索失败，正在降级回答";
  return "";
};

function WebSearchProgressCard({ status, text }: { status?: AiChatMessage["webSearchStatus"]; text?: string }) {
  const stageText = getWebSearchStageText(status, text);
  if (!stageText || status === "done") return null;
  return (
    <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-2.5 py-1 text-[11px] leading-5 text-emerald-800 dark:border-emerald-300/20 dark:bg-emerald-400/[0.08] dark:text-emerald-100">
      {status === "failed" ? <Info className="h-3.5 w-3.5 shrink-0" /> : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
      <span className="min-w-0 truncate">{stageText}</span>
    </div>
  );
}

function LocalNoteSearchProgressCard({
  status,
  error,
}: {
  status?: AiChatMessage["localNoteSearchStatus"];
  error?: string;
}) {
  if (!status || status === "done") return null;
  const text = status === "failed"
    ? error || "本地笔记检索失败，已继续生成回答"
    : "正在检索本地笔记...";
  return (
    <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full border border-sky-200/70 bg-sky-50/70 px-2.5 py-1 text-[11px] leading-5 text-sky-800 dark:border-sky-300/20 dark:bg-sky-400/[0.08] dark:text-sky-100">
      {status === "failed" ? <Info className="h-3.5 w-3.5 shrink-0" /> : <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
      <span className="min-w-0 truncate">{text}</span>
    </div>
  );
}

function AssistantCollapsibleHeader({
  label,
  count,
  isExpanded,
  onToggle,
}: {
  label: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[11px] leading-5 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={onToggle}
      aria-expanded={isExpanded}
    >
      <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", !isExpanded && "-rotate-90")} />
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground/80">· {count}</span>
    </button>
  );
}

function LocalNoteSourcesCard({
  sources,
  messageId,
  developerModeEnabled,
  isExpanded,
  highlightedLocalCitationId,
  onToggle,
  onOpenLocalNote,
}: {
  sources?: LocalNoteSearchResult[];
  messageId: string;
  developerModeEnabled: boolean;
  isExpanded: boolean;
  highlightedLocalCitationId?: string | null;
  onToggle: () => void;
  onOpenLocalNote?: (relativePath: string, lineStart?: number | null) => boolean | Promise<boolean>;
}) {
  const visibleSources = (sources ?? []).slice(0, 5);
  if (visibleSources.length === 0) return null;

  return (
    <div className="mt-2 border-t border-border/60 pt-1.5 text-[11px] leading-5 text-muted-foreground dark:border-white/10">
      <AssistantCollapsibleHeader
        label="本地笔记"
        count={visibleSources.length}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="mt-1.5 grid gap-1.5">
          {visibleSources.map((source, index) => {
            const localCitationId = getLocalNoteCitationId(source);
            const lineLabel = source.lineStart
              ? source.lineEnd && source.lineEnd !== source.lineStart
                ? `L${source.lineStart}-${source.lineEnd}`
                : `L${source.lineStart}`
              : null;
            const headingLabel = source.headingPath?.length ? source.headingPath.join(" / ") : null;
            const developerDetails = [
              typeof source.chunkIndex === "number" ? `chunk=${source.chunkIndex}` : undefined,
              lineLabel ? `lines=${lineLabel}` : undefined,
              `score=${source.score}`,
              source.matchedTerms?.length ? `matched=${source.matchedTerms.slice(0, 6).join("|")}` : undefined,
              source.detectedProblemIds?.length ? `problems=${source.detectedProblemIds.join("|")}` : undefined,
              source.detectedAlgorithmTerms?.length ? `algorithms=${source.detectedAlgorithmTerms.slice(0, 6).join("|")}` : undefined,
              source.reason ? `reason=${source.reason}` : undefined,
              source.diagnostics ? `diagnostics=${source.diagnostics}` : undefined,
            ].filter((item): item is string => Boolean(item));
            const openSource = () => {
              void onOpenLocalNote?.(source.relativePath, source.lineStart ?? null);
            };
            return (
              <button
                key={source.id || source.relativePath}
                type="button"
                data-local-note-message-id={messageId}
                data-local-note-id={source.id}
                data-local-note-citation-id={localCitationId}
                className={cn(
                  "grid gap-0.5 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-accent/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
                  highlightedLocalCitationId && localCitationId === highlightedLocalCitationId && "border-primary/60 bg-primary/10 ring-1 ring-primary/25 dark:bg-primary/15",
                )}
                onClick={openSource}
                disabled={!onOpenLocalNote}
                title={onOpenLocalNote ? `打开本地笔记：${source.relativePath}` : source.relativePath}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-[10px] text-muted-foreground/80">{index + 1}.</span>
                  <span className="min-w-0 truncate font-medium text-foreground">{source.title}</span>
                  {source.isCurrentNote && (
                    <span className="shrink-0 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-200">
                      当前笔记
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/85">
                  <span className="min-w-0 truncate">{source.relativePath}</span>
                  {headingLabel && <span className="max-w-full truncate" title={headingLabel}>{headingLabel}</span>}
                  {lineLabel && <span>{lineLabel}</span>}
                </div>
                <div className="line-clamp-3 min-w-0 whitespace-pre-wrap break-words text-[11px] leading-5 text-muted-foreground">
                  {source.snippet}
                </div>
                {developerModeEnabled && developerDetails.length > 0 && (
                  <div className="grid gap-0.5 border-t border-border/50 pt-1 font-mono text-[10px] leading-4 text-muted-foreground/80 dark:border-white/10">
                    {developerDetails.slice(0, 8).map((detail) => <div key={detail} className="truncate" title={detail}>{detail}</div>)}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const shouldFetchWebSourceExcerpt = (source: WebSource, strongCount: number): boolean => {
  if (source.relevance === "unrelated") return false;
  if (source.sourceKind === "explicit_url") return true;
  if (source.relevance === "strong") return true;
  if (source.selected === true && (source.rankScore ?? 0) >= 30) return true;
  if (strongCount >= 2) return false;
  return source.reliability === "wiki" || source.reliability === "official";
};

const getNewsEventClusterCount = (sources: WebSource[]): number => {
  const keys = new Set<string>();
  sources
    .filter((source) => source.usableEvidence === true && source.evidenceStatus === "usable")
    .forEach((source) => {
      if (source.eventCluster) {
        keys.add(source.eventCluster);
        return;
      }
      const text = `${source.title} ${source.snippet ?? ""} ${source.excerpt ?? ""}`.toLocaleLowerCase();
      const signals = [
        /google|gemini|deepmind/.test(text) ? "google-gemini" : "",
        /openai|chatgpt|gpt-/.test(text) ? "openai-chatgpt" : "",
        /anthropic|claude/.test(text) ? "anthropic-claude" : "",
        /deepseek/.test(text) ? "deepseek" : "",
        /regulat|policy|法案|监管|政策/.test(text) ? "regulation" : "",
        /funding|融资|投资|acquire|收购/.test(text) ? "funding" : "",
        /chip|gpu|nvidia|算力|infra|infrastructure/.test(text) ? "infra" : "",
        /model|release|launch|发布|推出|升级/.test(text) ? "model-release" : "",
      ].filter(Boolean);
      keys.add(signals.slice(0, 2).join("+") || source.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).slice(0, 5).join("-"));
    });
  return keys.size;
};

const getWebSearchProviderMissingKeyMessage = (provider: WebSearchProvider): string => {
  if (provider === "bing") return "Bing 公开搜索暂时不可用，可以稍后重试，或在设置中配置 Bocha / Brave。";
  return provider === "bocha"
    ? "需要在 AI 设置中配置博查 API Key"
    : "需要在 AI 设置中配置 Brave Search API Key";
};

const NEWS_SEARCH_NO_SOURCE_MESSAGE = "当前没有成功完成联网搜索，因此我不能可靠总结最新动态。";

const getNewsSearchNoSourceMessage = (searchError?: string): string =>
  searchError?.includes("公开来源直连和 Bing")
    ? searchError
    : searchError?.includes("公开候选")
      ? searchError
      : NEWS_SEARCH_NO_SOURCE_MESSAGE;

const hasUsableRecentNewsSource = (sources: WebSource[] | undefined): boolean =>
  (sources ?? []).some((source) =>
    source.usableEvidence === true &&
    source.evidenceStatus === "usable" &&
    source.injectedIntoAnswer !== false &&
    source.newsLike !== false &&
    (source.excerptStatus === "fetched" || Boolean(source.excerpt?.trim())),
  );

const shouldStopRecentNewsWithoutSources = (
  decision: SearchDecision,
  sources: WebSource[] | undefined,
  searchError?: string,
  explicitSourceCount = 0,
): boolean => {
  if (explicitSourceCount > 0) return false;
  if (!(decision.newsIntent === true || decision.vertical === "news" || decision.aiPlanner?.freshness === "news")) return false;
  if (hasUsableRecentNewsSource(sources)) return false;
  return Boolean(searchError) || (sources ?? []).length === 0 || (sources ?? []).every((source) =>
    source.usableEvidence !== true ||
    source.evidenceStatus !== "usable" ||
    source.finalIncludedInPrompt === false ||
    source.newsLike === false ||
    source.excerptStatus === "failed" ||
    source.excerptStatus === "blocked" ||
    source.excerptStatus === "unavailable" ||
    source.filteredReason === "not_news_like" ||
    source.filteredReason === "topic_mismatch" ||
    source.filteredReason === "docs_or_homepage" ||
    source.filteredReason === "wiki_or_reference",
  );
};

const buildWebContextDecision = (
  question: string,
  context: NoteChatContextPayload,
  requestWebSearchEnabled: boolean,
  explicitPlan: ExplicitUrlReadPlan,
): SearchDecision => {
  if (!requestWebSearchEnabled) {
    return explicitPlan.shouldRead || explicitPlan.blockedUrls.length > 0
      ? {
        shouldSearch: true,
        intent: "general_web",
        queries: [],
        confidence: 1,
        reason: "Explicit URL reading was requested, but online public web reading is disabled.",
      }
      : buildSearchDecision("");
  }
  const decision = buildSearchDecision(question, context);
  if (explicitPlan.shouldRead || explicitPlan.blockedUrls.length > 0) {
    return {
      ...decision,
      shouldSearch: true,
      intent: decision.intent === "no_search" ? "general_web" : decision.intent,
      confidence: Math.max(decision.confidence ?? 0, 0.95),
      reason: [decision.reason, "User explicitly provided URL reading context."].filter(Boolean).join("；"),
    };
  }
  return decision;
};

const getExplicitUrlPlanNotice = (plan: ExplicitUrlReadPlan, requestWebSearchEnabled: boolean): string | undefined => {
  const notes: string[] = [];
  if (plan.omittedCount > 0) notes.push("只读取前 3 个链接");
  if (!requestWebSearchEnabled && plan.shouldRead) notes.push("需要开启联网/网页读取后才能读取链接");
  if (plan.blockedUrls.some((item) => item.reason === "private_network")) {
    notes.push("为安全起见，NoteX 不访问 localhost 或内网地址");
  } else if (plan.blockedUrls.some((item) => item.reason === "unsupported_scheme")) {
    notes.push("该链接不是公开 http/https 页面");
  } else if (plan.blockedUrls.length > 0 || plan.invalidUrls.length > 0) {
    notes.push("部分链接无法读取公开正文");
  }
  return notes.length > 0 ? Array.from(new Set(notes)).join("；") : undefined;
};

function WebSearchSourcesCard({
  sources,
  error,
  searchDebug,
  messageId,
  highlightedCitationId,
  provider,
}: {
  sources?: WebSource[];
  error?: string;
  searchDebug?: string;
  messageId?: string;
  highlightedCitationId?: string | null;
  provider: WebSearchProvider;
}) {
  const visibleSources = (sources ?? []).slice(0, SEARCH_SOURCE_PREVIEW_LIMIT);
  const hiddenCount = Math.max(0, (sources?.length ?? 0) - visibleSources.length);
  const strongCount = (sources ?? []).filter((source) => source.relevance !== "candidate").length;
  const candidateCount = (sources ?? []).filter((source) => source.relevance === "candidate").length;
  const usableCount = (sources ?? []).filter((source) => source.usableEvidence === true && source.evidenceStatus === "usable").length;
  const rejectedCount = (sources ?? []).filter((source) => source.evidenceStatus === "rejected").length;
  const directSources = (sources ?? []).filter((source) =>
    source.discoveryMethod === "direct_rss" ||
    source.discoveryMethod === "direct_site" ||
    source.discoveryMethod === "constructed_source",
  );

  if (visibleSources.length === 0 && !error && !searchDebug) return null;
  const diagnosticsText = searchDebug ?? visibleSources.find((source) => source.searchDiagnostics)?.searchDiagnostics;
  const bingDiagnosticsLines = diagnosticsText && (diagnosticsText.includes("provider=bing") || diagnosticsText.includes("attemptedStages="))
    ? formatBingDiagnostics(diagnosticsText)
    : [];
  const preparationDiagnosticsLines = diagnosticsText ? formatSearchPreparationDiagnosticsForDisplay(diagnosticsText) : [];
  const directDiagnosticsLines = diagnosticsText ? formatDirectDiscoveryDiagnostics(diagnosticsText) : [];
  const newsReadDiagnosticsLines = diagnosticsText ? formatNewsReadDiagnostics(diagnosticsText) : [];

  return (
    <div className="mb-2 grid gap-2.5 rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-3.5 py-3 text-[13px] leading-6 text-slate-700 shadow-[0_8px_20px_rgb(15_23_42/0.05)] dark:border-emerald-400/20 dark:bg-emerald-400/[0.07] dark:text-slate-200">
      {visibleSources.length > 0 ? (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {usableCount > 0 ? `可引用来源 ${usableCount} 个` : "找到候选，但没有成功读取到可引用正文"}
            </span>
            <span className="rounded-full border border-emerald-200/80 bg-white/70 px-1.5 py-0.5 text-[10px] leading-4 text-emerald-700 dark:border-emerald-300/20 dark:bg-white/[0.05] dark:text-emerald-200">
              {visibleSources.some((source) => source.sourceKind === "explicit_url") ? "含用户链接" : "仅搜索结果"}
            </span>
            {visibleSources.length > 0 && (
              <span className="text-[12px] text-muted-foreground">
                强相关 {strongCount} 个 · 候选 {candidateCount} 个 · 拒绝 {rejectedCount} 个
              </span>
            )}
          </div>
          <div className="grid gap-2">
            {visibleSources.map((source) => {
              const description = getSourceCardDescription(source);
              const clusterDebugItems = [
                source.eventCluster ? `Event cluster：${source.eventCluster}` : undefined,
                source.clusterLabel ? `Cluster label：${source.clusterLabel}` : undefined,
                source.clusterReason ? `Cluster reason：${source.clusterReason}` : undefined,
                typeof source.clusterSize === "number" ? `Cluster size：${source.clusterSize}` : undefined,
                source.queryFocusEntities?.length ? `Query focus：${source.queryFocusEntities.join(", ")}` : undefined,
                source.companySpecificNews !== undefined ? `Company-specific news：${source.companySpecificNews === true ? "yes" : "no"}` : undefined,
                source.focusEntitySource ? `Focus entity source：${source.focusEntitySource}` : undefined,
                source.candidatePrimaryEntities?.length ? `Candidate entities：${source.candidatePrimaryEntities.join(", ")}` : undefined,
                source.entityMatchStrength ? `Entity match：${source.entityMatchStrength}` : undefined,
                source.entityFilterApplied !== undefined ? `Entity filter：${source.entityFilterApplied === true ? "yes" : "no"}` : undefined,
                source.rejectedWrongEntityReason ? `Wrong entity reason：${source.rejectedWrongEntityReason}` : undefined,
                source.selectedForRoundup !== undefined ? `Selected for roundup：${source.selectedForRoundup === true ? "yes" : "no"}` : undefined,
                source.droppedAsDuplicateCluster === true ? "Dropped：duplicate event cluster" : undefined,
              ].filter((item): item is string => Boolean(item));
              const debugItems = [
                ...clusterDebugItems,
                `来源类型：${getSourceDebugKindLabel(source)}`,
                `读取方式：${getSourceDebugReadMethodLabel(source)}`,
                getProviderDebugLabel(source, provider),
                getSearchStageDebugLabel(source),
                source.discoveryMethod ? `Discovery：${source.discoveryMethod}` : undefined,
                source.sourceKind ? `SourceKind：${source.sourceKind}` : undefined,
                source.discoveredBy ? `DiscoveredBy：${source.discoveredBy}` : undefined,
                source.feedUrl ? `Feed：${source.feedUrl}` : undefined,
                source.sourceHome ? `SourceHome：${source.sourceHome}` : undefined,
                source.directDiscoveryReason ? `Direct：${source.directDiscoveryReason}` : undefined,
                source.newsLike === true ? "新闻判断：像新闻" : source.newsLike === false ? "新闻判断：不像新闻" : undefined,
                `Evidence：${source.evidenceStatus ?? "candidate"}`,
                `Page：${source.pageType ?? "unknown"}`,
                `Content：${source.contentStatus ?? "not_fetched"}`,
                source.finalUrlHost ? `Final host：${source.finalUrlHost}` : undefined,
                source.contentType ? `Content-Type：${source.contentType}` : undefined,
                typeof source.bodyBytes === "number" ? `Body bytes：${source.bodyBytes}` : undefined,
                typeof source.extractedTextChars === "number" ? `Extracted chars：${source.extractedTextChars}` : undefined,
                typeof source.excerptChars === "number" ? `Excerpt chars：${source.excerptChars}` : undefined,
                source.publishedAt ? `Published：${source.publishedAt}` : undefined,
                `Strength：${source.sourceStrength ?? "rejected"}`,
                `Usable：${source.usableEvidence === true ? "是" : "否"}`,
                source.rejectedReason ? `拒绝原因：${source.rejectedReason}` : undefined,
                source.evidenceReason ? `准入原因：${source.evidenceReason}` : undefined,
                source.needsJsReason ? `needs_js：${source.needsJsReason}` : undefined,
                source.blockedReason ? `blocked：${source.blockedReason}` : undefined,
                source.extractionFailureReason ? `extractor failure：${source.extractionFailureReason}` : undefined,
                source.filteredReason ? `过滤原因：${getDebugReasonLabel(source.filteredReason)}` : undefined,
                source.dateHint ? `发布时间：${source.dateHint}` : undefined,
                typeof source.freshnessScore === "number" ? `时效评分：${source.freshnessScore}` : undefined,
                `已注入回答上下文：${source.injectedIntoAnswer === true ? "是" : "否"}`,
                source.sourceRegistryBoost ? `站点加权：${source.sourceRegistryLabel ?? "命中"} (${source.sourceRegistryBoost > 0 ? "+" : ""}${source.sourceRegistryBoost})` : undefined,
                `缓存：${getSourceDebugCacheLabel(source)}`,
              ].filter((item): item is string => Boolean(item));
              return (
              <div
                key={source.id || source.url}
                data-source-message-id={messageId}
                data-source-citation-id={source.citationId}
                className={cn(
                  "grid min-w-0 gap-1 rounded-lg border border-border/60 bg-background/75 px-2.5 py-2 transition-colors dark:border-white/10 dark:bg-white/[0.04]",
                  highlightedCitationId && source.citationId === highlightedCitationId && "border-primary/60 bg-primary/10 ring-1 ring-primary/30 dark:bg-primary/15",
                )}
              >
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {source.citationId && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                      {source.citationId}
                    </span>
                  )}
                  <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-200">
                    {getSourceTypeLabel(source.sourceType)}
                  </span>
                  <span
                    className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-700 dark:text-sky-200"
                    title={[source.relevanceReason, source.rankReason].filter(Boolean).join(" · ") || undefined}
                  >
                    {getSourceRelevanceLabel(source)}
                  </span>
                  <span
                    className="rounded-full bg-background/80 px-1.5 py-0.5 text-[11px] text-foreground dark:bg-white/[0.05]"
                    title={source.reliabilityReason}
                  >
                    {getReliabilityLabel(source)}
                  </span>
                  <span
                    className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-200"
                    title={[
                      source.excerptError,
                      source.cacheStatus === "hit" ? "来自本地联网缓存" : undefined,
                      source.cacheStatus === "stale" ? "Provider 失败，使用过期本地缓存" : undefined,
                    ].filter(Boolean).join("；") || undefined}
                  >
                    {getSourceExcerptStatusLabel(source)}
                  </span>
                  <span
                    className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-violet-700 dark:text-violet-200"
                    title={source.constructedReason}
                  >
                    {getSourceOriginLabel(source)}
                  </span>
                  <span className="truncate text-[12px] text-muted-foreground">
                    {source.site ?? source.url}
                  </span>
                </div>
                <a
                  href={source.url}
                  className="min-w-0 break-words text-sm font-medium leading-5 text-foreground underline decoration-transparent underline-offset-4 transition-colors hover:text-primary hover:decoration-current"
                  title={source.url}
                  onClick={(event) => {
                    event.preventDefault();
                    void openExternalUrl(source.url);
                  }}
                >
                  {source.title}
                </a>
                {description && (
                  <div className="line-clamp-2 min-w-0 break-words text-[12px] leading-5 text-muted-foreground">
                    {description}
                  </div>
                )}
                <div className="min-w-0 break-all text-[11px] leading-5 text-muted-foreground/80">
                  {source.url}
                </div>
                <div className="flex min-w-0 flex-wrap gap-x-2.5 gap-y-1 text-[12px] leading-5 text-muted-foreground/80">
                  {debugItems.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <div className="text-[11px] text-muted-foreground">还有 {hiddenCount} 个来源未展开。</div>
          )}
          {error && (
            <div className="text-[11px] leading-5 text-muted-foreground">{error}</div>
          )}
          {bingDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-amber-200/60 bg-amber-50/70 px-2.5 py-2 text-[12px] leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-400/[0.08] dark:text-amber-100">
              <div className="font-medium">Bing 阶段诊断</div>
              {bingDiagnosticsLines.map((line) => (
                <div key={line} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {preparationDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 text-[12px] leading-5 text-slate-800 dark:border-slate-300/20 dark:bg-white/[0.06] dark:text-slate-100">
              <div className="font-medium">搜索准备诊断</div>
              {preparationDiagnosticsLines.map((line) => (
                <div key={line} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {directDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-cyan-200/60 bg-cyan-50/70 px-2.5 py-2 text-[12px] leading-5 text-cyan-950 dark:border-cyan-300/20 dark:bg-cyan-400/[0.08] dark:text-cyan-100">
              <div className="font-medium">Direct Discovery 诊断</div>
              {directDiagnosticsLines.map((line) => (
                <div key={line} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {newsReadDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-emerald-200/70 bg-emerald-50/70 px-2.5 py-2 text-[12px] leading-5 text-emerald-950 dark:border-emerald-300/20 dark:bg-emerald-400/[0.08] dark:text-emerald-100">
              <div className="font-medium">News Read Budget</div>
              {newsReadDiagnosticsLines.map((line) => (
                <div key={line} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {directSources.length > 0 && (
            <div className="grid gap-1 rounded-md border border-cyan-200/60 bg-cyan-50/70 px-2.5 py-2 text-[12px] leading-5 text-cyan-950 dark:border-cyan-300/20 dark:bg-cyan-400/[0.08] dark:text-cyan-100">
              <div className="font-medium">Direct Discovery</div>
              {directSources.slice(0, 6).map((source) => (
                <div key={`direct-${source.id || source.url}`} className="break-words">
                  {source.title} · {source.discoveryMethod ?? "unknown"} · {source.sourceKind ?? "unknown"}
                  {source.dateHint ? ` · ${source.dateHint}` : ""}
                  {source.evidenceStatus ? ` · ${source.evidenceStatus}` : ""}
                  {source.directDiscoveryReason ? ` · ${source.directDiscoveryReason}` : ""}
                </div>
              ))}
              {directSources.length > 6 && (
                <div className="text-cyan-800/80 dark:text-cyan-100/80">还有 {directSources.length - 6} 个 Direct Discovery 候选。</div>
              )}
            </div>
          )}
          {candidateCount > 0 && (
            <div className="text-[11px] leading-5 text-muted-foreground">
              部分相关资料仅作为算法背景，回答时不会当作目标题目的直接依据。
            </div>
          )}
          <div className="text-[11px] leading-5 text-muted-foreground">
            仅少量强相关公开网页会尝试提取正文摘录；不会读取登录态、Cookie 或浏览器数据。
          </div>
        </>
      ) : (
        <div className="grid gap-1.5">
          <div className="text-[12px] leading-5 text-muted-foreground">{error}</div>
          {bingDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-amber-200/60 bg-amber-50/70 px-2.5 py-2 text-[12px] leading-5 text-amber-900 dark:border-amber-300/20 dark:bg-amber-400/[0.08] dark:text-amber-100">
              <div className="font-medium">Bing 阶段诊断</div>
              {bingDiagnosticsLines.map((line) => (
                <div key={line} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {preparationDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-slate-200/80 bg-slate-50/80 px-2.5 py-2 text-[12px] leading-5 text-slate-800 dark:border-slate-300/20 dark:bg-white/[0.06] dark:text-slate-100">
              <div className="font-medium">搜索准备诊断</div>
              {preparationDiagnosticsLines.map((line) => (
                <div key={line} className="break-words">{line}</div>
              ))}
            </div>
          )}
          {directDiagnosticsLines.length > 0 && (
            <div className="grid gap-1 rounded-md border border-cyan-200/60 bg-cyan-50/70 px-2.5 py-2 text-[12px] leading-5 text-cyan-950 dark:border-cyan-300/20 dark:bg-cyan-400/[0.08] dark:text-cyan-100">
              <div className="font-medium">Direct Discovery 诊断</div>
              {directDiagnosticsLines.map((line) => (
                <div key={line} className="break-words">{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AssistantCitationList({
  citations,
  messageId,
  isExpanded,
  hasUsedCitations,
  highlightedCitationId,
  onToggle,
}: {
  citations: DisplayedSourceCitation[];
  messageId: string;
  isExpanded: boolean;
  hasUsedCitations: boolean;
  highlightedCitationId?: string | null;
  onToggle: () => void;
}) {
  if (citations.length === 0) return null;
  const title = hasUsedCitations ? "引用来源" : "参考来源";

  return (
    <div className="mt-2 border-t border-border/60 pt-1.5 text-[11px] leading-5 text-muted-foreground">
      <AssistantCollapsibleHeader
        label={title}
        count={citations.length}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
      <div className="mt-1 grid gap-1">
        {citations.map((citation) => {
          const statusLabel = getCitationStatusLabel(citation);
          const meta = Array.from(new Set([citation.site, citation.reliabilityLabel].filter(Boolean)));
          return (
            <button
              key={citation.citationId}
              type="button"
              data-citation-list-message-id={messageId}
              data-citation-list-id={citation.citationId}
              className={cn(
                "flex min-w-0 items-start gap-1.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                highlightedCitationId === citation.citationId && "bg-primary/10 text-foreground ring-1 ring-primary/25",
              )}
              title={citation.url}
              onClick={() => {
                if (citation.url) void openExternalUrl(citation.url);
              }}
            >
              <span className="mt-px w-4 shrink-0 text-right font-semibold tabular-nums text-foreground/70">
                {citation.displayNumber}.
              </span>
              <span className="min-w-0 flex-1">
                <span className="min-w-0 break-words text-foreground/90">
                  {meta.length > 0 ? `${meta.join(" · ")} · ` : ""}
                  {citation.title}
                </span>
                <span className="ml-1 whitespace-nowrap text-muted-foreground/80">· {statusLabel}</span>
              </span>
            </button>
          );
        })}
      </div>
      )}
    </div>
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

function StatusPanel({ snapshot, onClose }: { snapshot: AiStatusSnapshot; onClose: () => void }) {
  const noteLabel = snapshot.notePath
    ? `${getFileNameFromPath(snapshot.notePath)}（${snapshot.includeCurrentNoteContext ? formatChineseChars(snapshot.noteChars) : "未包含"}）`
    : "无";
  const rows: Array<[string, string, string?]> = [
    ["模型", snapshot.modelLabel],
    ["当前笔记", noteLabel, snapshot.notePath ?? undefined],
    ["当前上下文", `约 ${formatChineseChars(snapshot.totalContextChars)}`],
  ];

  return (
    <div className="ai-status-panel mb-2 grid min-w-0 gap-2.5 overflow-hidden rounded-lg border border-border/70 bg-background/95 px-3.5 py-3 shadow-xl backdrop-blur dark:border-white/15 dark:bg-[#202124]/96">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Info className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          <div className="text-[17px] font-semibold leading-6 text-foreground">状态</div>
        </div>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onClose}
          title="关闭状态面板"
          aria-label="关闭状态面板"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid min-w-0 gap-1.5 overflow-x-hidden">
        {rows.map(([label, value, title]) => (
          <div key={label} className="grid min-w-0 grid-cols-[5.25rem_minmax(0,1fr)] items-baseline gap-3 text-[13px] leading-6">
            <div className="text-muted-foreground dark:text-white/60">{label}</div>
            <div className="min-w-0 truncate text-right text-[14.5px] font-medium tabular-nums text-foreground" title={title ?? value}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompressionResultCard({ result }: { result: CompressionResult }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="ai-compression-card grid min-w-0 gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="text-sm font-semibold leading-5 text-foreground">历史上下文已压缩</div>
        <button
          type="button"
          className="shrink-0 rounded-sm text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          onClick={() => setIsExpanded((value) => !value)}
        >
          {isExpanded ? "收起摘要" : "查看摘要"}
        </button>
      </div>
      <div className="grid min-w-0 gap-1">
        <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-2 text-[11px] leading-4">
          <span className="text-muted-foreground">压缩前</span>
          <span className="truncate text-right tabular-nums text-foreground">{formatChineseChars(result.sourceChars)}</span>
        </div>
        <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-2 text-[11px] leading-4">
          <span className="text-muted-foreground">压缩后</span>
          <span className="truncate text-right tabular-nums text-foreground">{formatChineseChars(result.compressedChars)}</span>
        </div>
        <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-2 text-[11px] leading-4">
          <span className="text-muted-foreground">减少</span>
          <span className="truncate text-right tabular-nums text-foreground">{formatCompressionReduction(result.sourceChars, result.compressedChars)}</span>
        </div>
        <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-2 text-[11px] leading-4">
          <span className="text-muted-foreground">模型</span>
          <span className="truncate text-right text-foreground" title={`${result.providerLabel} / ${result.modelLabel}`}>
            {result.modelLabel}
          </span>
        </div>
        <div className="grid grid-cols-[6.25rem_minmax(0,1fr)] gap-2 text-[11px] leading-4">
          <span className="text-muted-foreground">时间</span>
          <span className="truncate text-right tabular-nums text-foreground">
            {result.elapsedMs === null ? "n/a" : formatElapsed(result.elapsedMs)}
          </span>
        </div>
      </div>
      {isExpanded && (
        <div className="max-h-56 min-w-0 overflow-y-auto overflow-x-hidden rounded-md border border-border/60 bg-background/65 px-2.5 py-2 text-xs leading-5 text-muted-foreground [scrollbar-width:thin] dark:border-white/10 dark:bg-black/10">
          <div className="whitespace-pre-wrap break-words">{result.summary}</div>
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
  isMaximized = false,
  developerModeEnabled = false,
  onMaximizedChange,
  aiConfig,
  onAiConfigChange,
  onOpenAiSettings,
  onApplySuggestedTags,
  onApplyPolishedSelection,
  onApplyPolishedFullNote,
  onOpenPolishReview,
  onPolishReviewChange,
  onOpenLocalNote,
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"chat" | "conversations">("chat");
  const [isAllConversationsOpen, setIsAllConversationsOpen] = useState(false);
  const [conversationSearch, setConversationSearch] = useState("");
  const [isProviderPickerOpen, setIsProviderPickerOpen] = useState(false);
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [includeCurrentNoteContext, setIncludeCurrentNoteContext] = useState(
    readIncludeCurrentNoteContextPreference,
  );
  const [webSearchMode, setWebSearchMode] = useState<WebSearchMode>(readWebSearchModePreference);
  const [isWebSearchConsentDialogOpen, setIsWebSearchConsentDialogOpen] = useState(false);
  const [isSavingWebSearchConsent, setIsSavingWebSearchConsent] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const [applyingTagMessageId, setApplyingTagMessageId] = useState<string | null>(null);
  const [applyingPolishMessageId, setApplyingPolishMessageId] = useState<string | null>(null);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingConversationTitle, setEditingConversationTitle] = useState("");
  const [pendingDeleteConversationId, setPendingDeleteConversationId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [statusPanelOpen, setStatusPanelOpen] = useState(false);
  const [highlightedCitationId, setHighlightedCitationId] = useState<string | null>(null);
  const [highlightedLocalCitationId, setHighlightedLocalCitationId] = useState<string | null>(null);
  const [expandedCitationMessageIds, setExpandedCitationMessageIds] = useState<Record<string, boolean>>({});
  const [expandedLocalNoteMessageIds, setExpandedLocalNoteMessageIds] = useState<Record<string, boolean>>({});
  const [messageCopyFeedback, setMessageCopyFeedback] = useState<{
    messageId: string;
    status: "copied" | "failed";
  } | null>(null);
  const messageSeqRef = useRef(0);
  const requestSeqRef = useRef(0);
  const streamTargetsRef = useRef<Map<string, StreamTarget>>(new Map());
  const streamTextBufferRef = useRef<Map<string, string>>(new Map());
  const activeStreamsRef = useRef<Set<string>>(new Set());
  const webSearchPrepTokensRef = useRef<Map<string, number>>(new Map());
  const messageCopyFeedbackTimerRef = useRef<number | null>(null);
  const citationHighlightTimerRef = useRef<number | null>(null);
  const localCitationHighlightTimerRef = useRef<number | null>(null);
  const commandRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const selectedProviderLabelRef = useRef("");
  const selectedModelLabelRef = useRef("");

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0];
  const messages = (activeConversation?.messages ?? []).filter((message) => !isLegacyStatusMessage(message));
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
  selectedProviderLabelRef.current = selectedProviderLabel;
  selectedModelLabelRef.current = selectedModelLabel;
  const compressedContextSummary = activeConversation?.compressedContextSummary?.trim() ?? "";
  const compressedContextLength = compressedContextSummary.length;
  const webSearchConfig = normalizeWebSearchConfig(aiConfig?.web_search);
  const activeWebSearchProvider = webSearchConfig.provider;
  const hasPublicWebSearchConsent = webSearchConfig.publicSearchConsent;
  const webSearchEnabled = webSearchMode === "auto" && hasPublicWebSearchConsent;
  const canUseWebSearchProvider =
    hasPublicWebSearchConsent &&
    webSearchConfig.enabled === true &&
    (
      activeWebSearchProvider === "bing" ||
      (activeWebSearchProvider === "bocha" && webSearchConfig.bochaApiKey.trim().length > 0) ||
      (activeWebSearchProvider === "brave" && webSearchConfig.braveApiKey.trim().length > 0)
    );
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

  const statusPanelSnapshot = useMemo<AiStatusSnapshot>(() => {
    const noteChars = includeCurrentNoteContext && context.filePath ? context.markdownBody.length : 0;
    const compressedChars = compressedContextSummary
      ? truncateText(compressedContextSummary, AI_COMPRESSED_CONTEXT_MAX_CHARS).text.length
      : 0;
    const recentHistoryLimit = compressedContextSummary
      ? AI_RECENT_HISTORY_AFTER_COMPRESSION_LIMIT
      : AI_REQUEST_HISTORY_LIMIT;
    const recentMessagesChars = (activeConversation?.messages ?? [])
      .filter((message) => {
        if (message.role !== "user" && message.role !== "assistant") return false;
        if (message.kind === "compression-result") return false;
        if (message.role === "user" && isContextUtilityCommandText(message.text)) return false;
        if (message.state === "loading" || message.state === "streaming" || message.state === "error") return false;
        return message.text.trim().length > 0;
      })
      .slice(-recentHistoryLimit)
      .reduce((total, message) => (
        total + truncateText(message.text.trim(), AI_REQUEST_HISTORY_MESSAGE_MAX_CHARS).text.length
      ), 0);

    return {
      modelLabel: selectedModelLabel,
      notePath: context.filePath,
      noteChars,
      totalContextChars: noteChars + compressedChars + recentMessagesChars,
      includeCurrentNoteContext,
    };
  }, [
    activeConversation?.messages,
    compressedContextSummary,
    context.filePath,
    context.markdownBody,
    includeCurrentNoteContext,
    selectedModelLabel,
  ]);

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
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    const nextHeight = Math.min(
      Math.max(input.scrollHeight, COMPOSER_TEXTAREA_MIN_HEIGHT),
      COMPOSER_TEXTAREA_MAX_HEIGHT,
    );
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > COMPOSER_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }, [inputValue]);

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
    try {
      window.localStorage.setItem(AI_WEB_SEARCH_MODE_STORAGE_KEY, webSearchMode);
    } catch {
      // Ignore localStorage failures; the toggle still works for this session.
    }
  }, [webSearchMode]);

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

  useEffect(() => () => {
    if (messageCopyFeedbackTimerRef.current !== null) {
      window.clearTimeout(messageCopyFeedbackTimerRef.current);
    }
    if (citationHighlightTimerRef.current !== null) {
      window.clearTimeout(citationHighlightTimerRef.current);
    }
    if (localCitationHighlightTimerRef.current !== null) {
      window.clearTimeout(localCitationHighlightTimerRef.current);
    }
  }, []);

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

  const toggleCitationList = useCallback((messageId: string) => {
    setExpandedCitationMessageIds((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  }, []);

  const toggleLocalNoteList = useCallback((messageId: string) => {
    setExpandedLocalNoteMessageIds((current) => ({
      ...current,
      [messageId]: !current[messageId],
    }));
  }, []);

  const handleSourceCitationClick = useCallback((messageId: string, citationId: string) => {
    const container = messagesScrollRef.current;
    if (!container || !isValidCitationId(citationId)) return;

    setExpandedCitationMessageIds((current) => ({ ...current, [messageId]: true }));
    window.setTimeout(() => {
      const latestContainer = messagesScrollRef.current;
      if (!latestContainer) return;
      const target =
        latestContainer.querySelector<HTMLElement>(
          `[data-citation-list-message-id="${messageId}"][data-citation-list-id="${citationId}"]`,
        ) ??
        latestContainer.querySelector<HTMLElement>(
          `[data-source-message-id="${messageId}"][data-source-citation-id="${citationId}"]`,
        );
      if (!target) return;

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      const highlightKey = `${messageId}:${citationId}`;
      setHighlightedCitationId(highlightKey);
      if (citationHighlightTimerRef.current !== null) {
        window.clearTimeout(citationHighlightTimerRef.current);
      }
      citationHighlightTimerRef.current = window.setTimeout(() => {
        setHighlightedCitationId((current) => (current === highlightKey ? null : current));
        citationHighlightTimerRef.current = null;
      }, 1800);
    }, 0);
  }, []);

  const handleLocalNoteCitationClick = useCallback((messageId: string, citationId: string) => {
    const container = messagesScrollRef.current;
    if (!container || !isValidLocalCitationId(citationId)) return;

    setExpandedLocalNoteMessageIds((current) => ({ ...current, [messageId]: true }));
    window.setTimeout(() => {
      const latestContainer = messagesScrollRef.current;
      if (!latestContainer) return;
      const target = latestContainer.querySelector<HTMLElement>(
        `[data-local-note-message-id="${messageId}"][data-local-note-citation-id="${citationId}"]`,
      );
      if (!target) return;

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      const highlightKey = `${messageId}:${citationId}`;
      setHighlightedLocalCitationId(highlightKey);
      if (localCitationHighlightTimerRef.current !== null) {
        window.clearTimeout(localCitationHighlightTimerRef.current);
      }
      localCitationHighlightTimerRef.current = window.setTimeout(() => {
        setHighlightedLocalCitationId((current) => (current === highlightKey ? null : current));
        localCitationHighlightTimerRef.current = null;
      }, 1800);
    }, 0);
  }, []);

  const createMessage = (message: Omit<AiChatMessage, "id">): AiChatMessage => {
    messageSeqRef.current += 1;
    return { ...message, id: createMessageId(messageSeqRef.current) };
  };

  const persistWebSearchConsent = async (consent: boolean): Promise<void> => {
    if (!aiConfig) return;
    const nextConfig = {
      ...aiConfig,
      web_search: {
        ...normalizeWebSearchConfig(aiConfig.web_search),
        publicSearchConsent: consent,
      },
    };
    setIsSavingWebSearchConsent(true);
    try {
      await saveAiConfig(nextConfig);
      onAiConfigChange(nextConfig);
    } finally {
      setIsSavingWebSearchConsent(false);
    }
  };

  const handleWebSearchToggle = () => {
    if (webSearchEnabled) {
      setWebSearchMode("off");
      return;
    }
    if (!hasPublicWebSearchConsent) {
      setIsWebSearchConsentDialogOpen(true);
      return;
    }
    setWebSearchMode("auto");
  };

  const fetchWebSourcesForDecision = async (
    decision: SearchDecision,
    options?: {
      conversationId?: string;
      messageId?: string;
      streamId?: string;
      token?: number;
      userInput?: string;
      context?: NoteChatContextPayload;
      explicitSources?: WebSource[];
      onStatus?: (status: NonNullable<AiChatMessage["webSearchStatus"]>, text?: string) => void;
    },
  ): Promise<{ sources?: WebSource[]; error?: string; searchDebug?: string; filteredCount?: number; filterReason?: string; decision?: SearchDecision }> => {
    if (!decision.shouldSearch) return {};
    const isCurrent = () => !options?.streamId || (
      streamTargetsRef.current.get(options.streamId)?.messageId === options.messageId &&
      (options.token === undefined || webSearchPrepTokensRef.current.get(options.streamId) === options.token)
    );
    const setStatus = (status: NonNullable<AiChatMessage["webSearchStatus"]>, text?: string) => {
      if (!isCurrent()) return;
      options?.onStatus?.(status, text);
    };
    const explicitSources = options?.explicitSources ?? [];
    const preparationDiagnostics = createSearchPreparationDiagnostics(decision);
    const updateDecision = (nextDecision: SearchDecision) => {
      if (!isCurrent() || !options?.conversationId || !options.messageId) return;
      replaceMessage(options.conversationId, options.messageId, (message) => ({
        ...message,
        searchDecision: nextDecision,
      }));
    };
    const planDecisionWithAi = async (
      baseDecision: SearchDecision,
      trigger: AiSearchPlannerState["trigger"],
    ): Promise<SearchDecision> => {
      const shouldPlan = shouldUseAiQueryPlanner(baseDecision, options?.userInput ?? baseDecision.rawQuestion ?? "", {
        provider: activeWebSearchProvider,
        explicitUrlRead: explicitSources.length > 0,
        aiAvailable: isAiConfigured && !!selectedProviderId && !!selectedModelId,
        offTopicRetry: trigger === "off_topic_retry",
      });
      if (!shouldPlan) return baseDecision;
      const plannerContext = buildAiSearchPlannerContext(options?.userInput ?? baseDecision.rawQuestion ?? "");
      preparationDiagnostics.plannerStarted = true;
      try {
        setStatus("planning", trigger === "off_topic_retry" ? "正在重写搜索词..." : "正在生成搜索词...");
        const rawPlan = await withTimeout(
          planSearchQueries({
            userInput: options?.userInput ?? baseDecision.rawQuestion ?? "",
            intent: baseDecision.intent,
            provider: activeWebSearchProvider,
            maxQueries: activeWebSearchProvider === "bing" ? 2 : 3,
            ruleBasedQueries: baseDecision.aiPlanner?.ruleBasedQueries ?? baseDecision.queries,
            topicKeywords: baseDecision.topicKeywords,
            newsIntent: baseDecision.newsIntent,
            recencyIntent: baseDecision.recencyIntent,
            currentDate: plannerContext.currentDate,
            currentDateText: plannerContext.currentDateText,
            currentTimeZone: plannerContext.currentTimeZone,
            locale: plannerContext.locale,
            recencyWindowHint: plannerContext.recencyWindowHint,
            providerId: selectedProviderId,
            modelId: selectedModelId,
          }),
          AI_QUERY_PLANNER_TIMEOUT_MS,
          "AI query planner timeout",
        );
        const validated = validateAiSearchQueryPlan(rawPlan, baseDecision, activeWebSearchProvider);
        if (!validated.plan) throw new Error(validated.error ?? "AI query planner returned invalid plan");
        const plannedDecision = {
          ...applyAiSearchQueryPlan(baseDecision, validated.plan, trigger),
        };
        if (plannedDecision.aiPlanner) {
          plannedDecision.aiPlanner = {
            ...plannedDecision.aiPlanner,
            plannerContext,
          };
        }
        updateDecision(plannedDecision);
        return plannedDecision;
      } catch (error) {
        const fallbackReason = error instanceof Error ? error.message : String(error);
        preparationDiagnostics.ruleFallbackUsed = true;
        if (/timeout/i.test(fallbackReason)) {
          preparationDiagnostics.plannerTimedOut = true;
          preparationDiagnostics.timedOutStage = "planner";
        } else {
          preparationDiagnostics.plannerFailedReason = fallbackReason;
        }
        const fallbackDecision = markAiQueryPlannerFallback(baseDecision, fallbackReason, "fallback");
        if (fallbackDecision.aiPlanner) {
          fallbackDecision.aiPlanner = {
            ...fallbackDecision.aiPlanner,
            plannerContext,
          };
        }
        updateDecision(fallbackDecision);
        return fallbackDecision;
      }
    };
    const mergeSources = (rawSources: WebSource[]): WebSource[] => {
      const seen = new Set<string>();
      return [...explicitSources, ...rawSources].filter((source) => {
        const key = source.url.trim().toLocaleLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const prepareSourcesWithExcerpts = async (rawSources: WebSource[], activeDecision: SearchDecision) => {
      if (!isCurrent()) return { prepared: prepareWebSourcesForDecision([], activeDecision, options?.userInput, options?.context), sources: [] as WebSource[], readDebug: undefined as string | undefined };
      setStatus("filtering", "正在筛选相关来源...");
      const prepared = prepareWebSourcesForDecision(mergeSources(rawSources), activeDecision, options?.userInput, options?.context);
      const strongCount = prepared.sources.filter((source) => source.relevance === "strong").length;
      const readBudget = activeDecision.sourceStrategy?.readBudget ?? getWebReadBudgetPlan(activeDecision);
      const newsRoundup = isNewsRoundupDecision(activeDecision);
      const excerptCandidates = prepared.sources
        .filter((source) => shouldFetchWebSourceExcerpt(source, strongCount))
        .slice(0, readBudget.maxReadAttempts);
      setStatus(
        excerptCandidates.length > 0 ? "fetching_excerpts" : "answering",
        excerptCandidates.length > 0 ? `正在阅读 ${Math.min(readBudget.targetReadSuccesses, excerptCandidates.length)} 个网页摘录...` : "正在生成回答...",
      );
      const excerptResults = [] as Awaited<ReturnType<typeof fetchWebSourceExcerpts>>;
      let fetchedCount = 0;
      for (let offset = 0; offset < excerptCandidates.length && fetchedCount < readBudget.targetReadSuccesses; offset += readBudget.maxConcurrentReads) {
        const batch = excerptCandidates.slice(offset, offset + readBudget.maxConcurrentReads);
        if (batch.length === 0) break;
        setStatus("fetching_excerpts", `正在阅读 ${Math.min(readBudget.targetReadSuccesses, excerptCandidates.length)} 个网页摘录...`);
        const batchResults = await fetchWebSourceExcerpts({
          sources: batch,
          maxSources: batch.length,
          maxCharsPerSource: newsRoundup ? 7000 : 5000,
          userInput: options?.userInput,
          intent: activeDecision.intent,
          problemId: activeDecision.problemId,
          problemTitle: activeDecision.problemTitle,
          algorithmKeywords: activeDecision.algorithmKeywords,
          errorKeywords: activeDecision.errorKeywords,
          queries: activeDecision.queries,
        });
        excerptResults.push(...batchResults);
        fetchedCount = excerptResults.filter((result) => result.fetched).length;
        if (!isCurrent()) return { prepared, sources: [] as WebSource[], readDebug: undefined as string | undefined };
      }
      if (!isCurrent()) return { prepared, sources: [] as WebSource[], readDebug: undefined as string | undefined };
      const excerptByUrl = new Map(excerptResults.map((result) => [result.url, result]));
      const sourcesWithExcerpts = prepared.sources.map((source) => {
        const result = excerptByUrl.get(source.url);
        if (!result) {
          return evaluateWebSourceEvidence({
            ...source,
            excerptStatus: source.excerptStatus ?? "not_requested" as const,
          }, activeDecision, source.excerpt, options?.userInput);
        }
        const sourceWithExcerpt = {
          ...source,
          title: result.title?.trim() || source.title,
          finalUrl: result.finalUrl,
          finalUrlHost: result.finalUrlHost,
          contentStatus: result.contentStatus,
          excerptStatus: result.fetched ? "fetched" as const : (
            result.errorKind === "private_network" ||
            result.errorKind === "unsupported_scheme" ||
            result.errorKind === "redirect_blocked" ||
            result.errorKind === "content_type_unsupported" ||
            result.errorKind === "too_large" ? "blocked" as const :
              result.error?.includes("不可用") || result.error?.includes("登录") ? "unavailable" as const : "failed" as const
          ),
          readStatus: result.status,
          excerpt: result.excerpt,
          excerptError: result.error,
          errorKind: result.errorKind,
          contentType: result.contentType,
          bodyBytes: result.bodyBytes,
          extractedTextChars: result.extractedTextChars,
          excerptChars: result.excerptChars,
          publishedAt: result.publishedAt,
          fetchedAt: result.fetchedAt,
          cacheStatus: result.cacheStatus,
          cachedAt: result.cachedAt,
          cacheTtlSeconds: result.cacheTtlSeconds,
          excerptQuality: result.excerptQuality,
          extractor: result.extractor,
          excerptReason: result.excerptReason,
          blockedReason: result.blockedReason,
          needsJsReason: result.needsJsReason,
          extractionFailureReason: result.extractionFailureReason,
          codeBlocksTruncated: result.codeBlocksTruncated,
        };
        return evaluateWebSourceEvidence(sourceWithExcerpt, activeDecision, result.excerpt, options?.userInput);
      });
      const rankedSources = rankPreparedWebSources(sourcesWithExcerpts, activeDecision, options?.userInput, options?.context);
      const selectedRoundupSources = rankedSources.filter((source) => source.selectedForRoundup === true);
      const duplicateClusterDrops = rankedSources.filter((source) => source.droppedAsDuplicateCluster === true).length;
      const roundupClusterSummary = Array.from(new Set(selectedRoundupSources.map((source) => source.eventCluster).filter(Boolean))).join(",");
      const newsClusteredSources = rankedSources.filter((source) => source.eventCluster);
      const newsClusterIds = Array.from(new Set(newsClusteredSources.map((source) => source.eventCluster).filter(Boolean)));
      const selectedClusterIds = Array.from(new Set(rankedSources
        .filter((source) => source.selected === true && source.eventCluster)
        .map((source) => source.eventCluster)
        .filter(Boolean)));
      const summarizeCounts = (values: Array<string | undefined>): string => {
        const counts = new Map<string, number>();
        values.filter((value): value is string => Boolean(value)).forEach((value) => {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        });
        return Array.from(counts.entries()).map(([key, count]) => `${key}:${count}`).join(",") || "none";
      };
      const clusterSummary = newsClusterIds.slice(0, 8).map((clusterId) => {
        const clusterSources = rankedSources.filter((source) => source.eventCluster === clusterId);
        const representative = clusterSources.find((source) => source.selected === true) ?? clusterSources[0];
        return [
          clusterId,
          representative?.clusterLabel,
          representative?.title,
          `sources=${clusterSources.length}`,
          `dropped=${clusterSources.filter((source) => source.droppedAsDuplicateCluster === true).length}`,
        ].filter(Boolean).join(",");
      }).join(" | ");
      const readDebug = newsRoundup
        ? [
          "debug=newsRead",
          `newsReadAttempts=${excerptResults.length}`,
          `newsReadSuccesses=${excerptResults.filter((result) => result.fetched).length}`,
          `usableEvidenceCount=${rankedSources.filter((source) => source.usableEvidence === true && source.evidenceStatus === "usable").length}`,
          `rejectedCount=${rankedSources.filter((source) => source.evidenceStatus === "rejected").length}`,
          `excerptChars=${excerptResults.reduce((sum, result) => sum + (result.excerpt?.length ?? 0), 0)}`,
          `contentStatusMix=${encodeDebugValue(summarizeCounts(rankedSources.map((source) => source.contentStatus)))}`,
          `excerptQualityMix=${encodeDebugValue(summarizeCounts(rankedSources.map((source) => source.excerptQuality)))}`,
          `urlReaderFailures=${encodeDebugValue(rankedSources.filter((source) => source.rejectedReason || source.extractionFailureReason || source.needsJsReason || source.blockedReason).slice(0, 4).map((source) => `${source.title}:${source.rejectedReason ?? source.extractionFailureReason ?? source.needsJsReason ?? source.blockedReason}`).join(" | ") || "none")}`,
          `queryDiversification=${encodeDebugValue(activeDecision.queries.length > 1 ? activeDecision.queries.join(" / ") : "single")}`,
          activeDecision.sourceStrategy?.droppedTargetedQueries && activeDecision.sourceStrategy.droppedTargetedQueries.length > 0
            ? `droppedQueryDiversification=${encodeDebugValue(activeDecision.sourceStrategy.droppedTargetedQueries.map((item) => item.query).join(" / "))}`
            : undefined,
          activeDecision.sourceStrategy?.droppedTargetedQueries && activeDecision.sourceStrategy.droppedTargetedQueries.length > 0
            ? `droppedQueryReason=${encodeDebugValue(Array.from(new Set(activeDecision.sourceStrategy.droppedTargetedQueries.map((item) => item.reason))).join(","))}`
            : undefined,
          `eventClusterCount=${getNewsEventClusterCount(rankedSources)}`,
          `selectedRoundupSources=${selectedRoundupSources.length}`,
          `duplicateClusterDrops=${duplicateClusterDrops}`,
          `roundupClusters=${encodeDebugValue(roundupClusterSummary || "none")}`,
          `newsClusteringEnabled=${newsClusteredSources.length > 0 ? "yes" : "no"}`,
          `candidateCountBeforeClustering=${sourcesWithExcerpts.length}`,
          `clusterCount=${newsClusterIds.length}`,
          `selectedClusterCount=${selectedClusterIds.length}`,
          `diversityApplied=${duplicateClusterDrops > 0 || selectedClusterIds.length > 1 ? "yes" : "no"}`,
          `singleClusterWarning=${newsClusterIds.length === 1 ? "yes" : "no"}`,
          `clusters=${encodeDebugValue(clusterSummary || "none")}`,
        ].join("; ")
        : undefined;
      return {
        prepared,
        sources: rankedSources,
        readDebug,
      };
    };
    if (!canUseWebSearchProvider) {
      const { prepared, sources } = await prepareSourcesWithExcerpts([], decision);
      const hasExplicitSources = explicitSources.length > 0;
      preparationDiagnostics.providerSearchScheduled = false;
      return {
        sources: sources.length > 0 ? sources : prepared.sources.length > 0 ? prepared.sources : undefined,
        error: hasExplicitSources
          ? undefined
          : hasPublicWebSearchConsent
            ? getWebSearchProviderMissingKeyMessage(activeWebSearchProvider)
            : "需要先授权公开网页搜索",
        searchDebug: formatSearchPreparationDiagnostics(preparationDiagnostics),
      };
    }

    try {
      const initialPlannerPromise = planDecisionWithAi(decision, "initial");
      preparationDiagnostics.ruleFallbackUsed = preparationDiagnostics.plannerStarted;
      let activeDecision = applySourceStrategyPlan(decision, activeWebSearchProvider);
      let latestSearchDiagnostics: string | undefined;
      let latestReadDiagnostics: string | undefined;
      updateDecision(activeDecision);
      const runSearchRound = async (roundDecision: SearchDecision) => {
        setStatus("searching", "正在搜索公开网页...");
        const readBudget = roundDecision.sourceStrategy?.readBudget ?? getWebReadBudgetPlan(roundDecision);
        const roundFreshness = roundDecision.aiPlanner?.freshness ?? (roundDecision.newsIntent ? "news" : roundDecision.recencyIntent ? "recent" : undefined);
        const roundVertical = roundDecision.vertical ?? roundDecision.aiPlanner?.vertical ?? (roundFreshness === "news" ? "news" : undefined);
        const limitedQueries = limitWebSearchQueriesForProvider(roundDecision.queries, activeWebSearchProvider, roundDecision.intent);
        const searchQueries = limitedQueries.length > 0
          ? limitedQueries
          : [roundDecision.rawQuestion, options?.userInput]
            .map((value) => value?.trim())
            .filter((value): value is string => Boolean(value))
            .slice(0, 1);
        preparationDiagnostics.providerSearchAttempted = true;
        const roundSources = await searchWebSources({
          provider: activeWebSearchProvider,
          rawUserQuery: options?.userInput ?? roundDecision.rawQuestion,
          queries: searchQueries,
          intent: roundDecision.intent,
          vertical: roundVertical,
          freshness: roundFreshness,
          problemId: roundDecision.problemId,
          algorithmKeywords: roundDecision.algorithmKeywords,
          topicKeywords: getEffectiveSearchTopicKeywords(roundDecision),
          maxResults: activeWebSearchProvider === "bing" ? Math.min(24, readBudget.maxCandidates) : Math.min(40, readBudget.maxCandidates),
        });
        latestSearchDiagnostics = roundSources.find((source) => source.searchDiagnostics)?.searchDiagnostics ?? latestSearchDiagnostics;
        if (roundSources.some((source) => source.searchDiagnostics?.includes("directDiscoveryAttempted=yes"))) {
          preparationDiagnostics.directDiscoveryAttempted = true;
        }
        if (!isCurrent()) return { prepared: prepareWebSourcesForDecision([], roundDecision, options?.userInput, options?.context), sources: [] as WebSource[], readDebug: undefined as string | undefined };
        const preparedRound = await prepareSourcesWithExcerpts(roundSources, roundDecision);
        latestReadDiagnostics = preparedRound.readDebug ?? latestReadDiagnostics;
        return preparedRound;
      };
      let { prepared, sources: sourcesWithExcerpts } = await runSearchRound(activeDecision);
      let usableEvidenceCount = sourcesWithExcerpts.filter((source) => source.usableEvidence === true && source.evidenceStatus === "usable").length;
      const plannedDecision = usableEvidenceCount === 0 ? await initialPlannerPromise : undefined;
      const shouldRunPlannedRound =
        usableEvidenceCount === 0 &&
        plannedDecision?.aiPlanner?.used === true &&
        JSON.stringify(plannedDecision.queries) !== JSON.stringify(activeDecision.queries);
      if (shouldRunPlannedRound && plannedDecision) {
        setStatus("searching", "规则搜索没有可引用来源，正在使用规划搜索词补查...");
        activeDecision = applySourceStrategyPlan(plannedDecision, activeWebSearchProvider);
        updateDecision(activeDecision);
        ({ prepared, sources: sourcesWithExcerpts } = await runSearchRound(activeDecision));
        usableEvidenceCount = sourcesWithExcerpts.filter((source) => source.usableEvidence === true && source.evidenceStatus === "usable").length;
      } else if (plannedDecision?.aiPlanner && plannedDecision.aiPlanner.used !== true) {
        activeDecision = {
          ...activeDecision,
          aiPlanner: plannedDecision.aiPlanner,
        };
        updateDecision(activeDecision);
      }
      const shouldRetryNewsExecution =
        (activeDecision.vertical === "news" || activeDecision.newsIntent === true) &&
        usableEvidenceCount === 0 &&
        (sourcesWithExcerpts.length > 0 || prepared.filteredCount > 0) &&
        activeDecision.aiPlanner?.retried !== true;
      if (shouldRetryNewsExecution) {
        setStatus("searching", "首轮结果偏向资料页，正在改用新闻搜索...");
        const generatedAlternates = activeDecision.aiPlanner?.generatedQueries?.slice(1) ?? [];
        const topicText = [...(activeDecision.topicKeywords ?? []), options?.userInput ?? ""].join(" ");
        const fallbackQueries = /openai/i.test(topicText)
          ? ["OpenAI latest news product model partnership", "OpenAI announces launches model latest"]
          : ["latest AI model news OpenAI Anthropic Google DeepMind", "AI model news launches funding regulation latest"];
        activeDecision = applySourceStrategyPlan({
          ...activeDecision,
          queries: Array.from(new Set([...generatedAlternates, ...fallbackQueries, ...activeDecision.queries])).slice(0, 2),
          aiPlanner: activeDecision.aiPlanner
            ? {
              ...activeDecision.aiPlanner,
              retried: true,
              fallbackReason: [activeDecision.aiPlanner.fallbackReason, "news_results_were_reference_pages; retry_with_news_endpoint; retry_with_alternate_query"].filter(Boolean).join("; "),
            }
            : {
              enabled: false,
              used: false,
              trigger: "fallback",
              ruleBasedQueries: activeDecision.queries,
              vertical: "news",
              retried: true,
              fallbackReason: "news_results_were_reference_pages; retry_with_news_endpoint; retry_with_alternate_query",
            },
        }, activeWebSearchProvider);
        updateDecision(activeDecision);
        ({ prepared, sources: sourcesWithExcerpts } = await runSearchRound(activeDecision));
        usableEvidenceCount = sourcesWithExcerpts.filter((source) => source.usableEvidence === true && source.evidenceStatus === "usable").length;
      }
      if (
        usableEvidenceCount === 0 &&
        prepared.filteredCount > 0 &&
        !activeDecision.aiPlanner?.used &&
        !activeDecision.aiPlanner?.fallbackReason &&
        shouldUseAiQueryPlanner(activeDecision, options?.userInput ?? activeDecision.rawQuestion ?? "", {
          provider: activeWebSearchProvider,
          explicitUrlRead: explicitSources.length > 0,
          aiAvailable: isAiConfigured && !!selectedProviderId && !!selectedModelId,
          offTopicRetry: true,
        })
      ) {
        setStatus("planning", "首轮结果跑偏，正在重写搜索词...");
        activeDecision = applySourceStrategyPlan(await planDecisionWithAi(activeDecision, "off_topic_retry"), activeWebSearchProvider);
        updateDecision(activeDecision);
        if (activeDecision.aiPlanner?.used) {
          ({ prepared, sources: sourcesWithExcerpts } = await runSearchRound(activeDecision));
          usableEvidenceCount = sourcesWithExcerpts.filter((source) => source.usableEvidence === true && source.evidenceStatus === "usable").length;
        }
      }
      if (!isCurrent()) return {};
      const filterNote = prepared.filteredCount > 0
        ? `已过滤 ${prepared.filteredCount} 条低相关结果，原因：${prepared.filterReason || "query/topic mismatch"}`
        : undefined;
      const searchNote = [filterNote].filter(Boolean).join(" ");
      const sourceDiagnostics = sourcesWithExcerpts.find((source) => source.searchDiagnostics)?.searchDiagnostics ?? latestSearchDiagnostics;
      const combinedSearchDebug = mergeSearchDebug(formatSearchPreparationDiagnostics(preparationDiagnostics), sourceDiagnostics, latestReadDiagnostics);
      return sourcesWithExcerpts.length > 0
        ? {
          sources: sourcesWithExcerpts,
          error: usableEvidenceCount === 0 ? "找到候选，但没有成功读取到可引用正文。" : undefined,
          searchDebug: combinedSearchDebug,
          filteredCount: prepared.filteredCount,
          filterReason: filterNote,
          decision: activeDecision,
        }
        : {
          error: activeDecision.newsIntent || activeDecision.vertical === "news"
            ? "当前没有找到足够相关的近期新闻结果。"
            : searchNote || "联网搜索没有返回可展示的来源",
          searchDebug: combinedSearchDebug,
          filteredCount: prepared.filteredCount,
          filterReason: filterNote,
          decision: activeDecision,
        };
    } catch (error) {
      const errorMessage = getWebSearchErrorMessage(error);
      const searchDebug = getWebSearchDebugMessage(error);
      if (searchDebug?.includes("directDiscoveryAttempted=yes")) {
        preparationDiagnostics.directDiscoveryAttempted = true;
      }
      const { prepared, sources } = await prepareSourcesWithExcerpts([], decision);
      return {
        sources: sources.length > 0 ? sources : prepared.sources.length > 0 ? prepared.sources : undefined,
        error: errorMessage,
        searchDebug: mergeSearchDebug(formatSearchPreparationDiagnostics(preparationDiagnostics), searchDebug),
        decision,
      };
    }
  };

  const fetchLocalNotesForMessage = async (
    question: string,
    decision: SearchDecision,
    chatContext: NoteChatContextPayload,
    options: {
      conversationId: string;
      messageId: string;
      onStatus?: (status: NonNullable<AiChatMessage["localNoteSearchStatus"]>, error?: string) => void;
    },
  ): Promise<{ localNoteSources?: LocalNoteSearchResult[]; error?: string }> => {
    options.onStatus?.("searching");
    try {
      const results = await searchLocalNotes({
        query: question,
        problemId: decision.problemId,
        problemTitle: decision.problemTitle,
        algorithmKeywords: decision.algorithmKeywords,
        currentNotePath: chatContext.notePath,
        maxResults: 5,
        maxCharsPerResult: 1000,
      });
      options.onStatus?.("done");
      const sourcesWithCitations = assignLocalNoteCitationIds(results);
      return sourcesWithCitations && sourcesWithCitations.length > 0 ? { localNoteSources: sourcesWithCitations } : {};
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Local note search failed", {
        conversationId: options.conversationId,
        messageId: options.messageId,
        notePath: chatContext.notePath,
        error,
      });
      options.onStatus?.("failed", message);
      return { error: message };
    }
  };

  const resolveWebSourcesForMessage = async (
    conversationId: string,
    messageId: string,
    decision: SearchDecision,
  ): Promise<void> => {
    if (!decision.shouldSearch) return;
    if (!canUseWebSearchProvider) {
      replaceMessage(conversationId, messageId, (message) => ({
        ...message,
        sources: undefined,
        searchError: hasPublicWebSearchConsent
          ? getWebSearchProviderMissingKeyMessage(activeWebSearchProvider)
          : "需要先授权公开网页搜索",
      }));
      return;
    }

    try {
      const decisionFreshness = decision.aiPlanner?.freshness ?? (decision.newsIntent ? "news" : decision.recencyIntent ? "recent" : undefined);
      const decisionVertical = decision.vertical ?? decision.aiPlanner?.vertical ?? (decisionFreshness === "news" ? "news" : undefined);
      const sources = await searchWebSources({
        provider: activeWebSearchProvider,
        rawUserQuery: decision.rawQuestion,
        queries: limitWebSearchQueriesForProvider(decision.queries, activeWebSearchProvider, decision.intent),
        intent: decision.intent,
        vertical: decisionVertical,
        freshness: decisionFreshness,
        problemId: decision.problemId,
        algorithmKeywords: decision.algorithmKeywords,
        topicKeywords: decision.aiPlanner?.topicKeywords ?? decision.topicKeywords,
        maxResults: activeWebSearchProvider === "bing" ? 8 : 32,
      });
      const prepared = prepareWebSourcesForDecision(sources, decision);
      replaceMessage(conversationId, messageId, (message) => ({
        ...message,
        sources: prepared.sources.length > 0 ? prepared.sources : undefined,
        searchError: prepared.sources.length > 0
          ? undefined
          : "联网搜索没有返回可展示的来源",
      }));
    } catch (error) {
      const errorMessage = getWebSearchErrorMessage(error);
      const searchDebug = getWebSearchDebugMessage(error);
      const prepared = prepareWebSourcesForDecision([], decision);
      replaceMessage(conversationId, messageId, (message) => ({
        ...message,
        sources: prepared.sources.length > 0 ? prepared.sources : undefined,
        searchError: errorMessage,
        searchErrorDebug: searchDebug,
      }));
    }
  };
  void resolveWebSourcesForMessage;

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
        isUntitledConversationTitle(conversation.title) &&
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
    if (viewMode === "conversations") {
      setIsHistoryOpen(false);
      setIsProviderPickerOpen(false);
      setIsModelPickerOpen(false);
      return;
    }

    if (activeConversation && !hasConversationContent(activeConversation)) {
      setActiveConversationId(activeConversation.id);
      setIsHistoryOpen(false);
      setViewMode("chat");
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
    setViewMode("chat");
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
    setViewMode("chat");
    setIsAllConversationsOpen(false);
    setConversationSearch("");
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

  const requestDeleteConversation = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    setPendingDeleteConversationId(conversation.id);
  };

  const cancelDeleteConversation = () => {
    setPendingDeleteConversationId(null);
  };

  const deleteConversation = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      setPendingDeleteConversationId(null);
      return;
    }

    for (const [streamId, target] of Array.from(streamTargetsRef.current.entries())) {
      if (target.conversationId !== conversationId) continue;
      streamTextBufferRef.current.delete(streamId);
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      webSearchPrepTokensRef.current.delete(streamId);
    }
    updateRespondingState();

    const remaining = limitConversations(conversations.filter((item) => item.id !== conversationId));
    if (remaining.length === 0) {
      const fallback = createEmptyConversation();
      setConversations([fallback]);
      setActiveConversationId(fallback.id);
      setViewMode("conversations");
    } else {
      setConversations(remaining);
      if (conversationId === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }
    }

    setPendingDeleteConversationId(null);
    cancelRenameConversation();
    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  useEffect(() => {
    if (!pendingDeleteConversationId) return;
    if (conversations.some((conversation) => conversation.id === pendingDeleteConversationId)) return;
    setPendingDeleteConversationId(null);
  }, [conversations, pendingDeleteConversationId]);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void listen<NoteChatStreamChunkEvent>("ai-chat-stream-chunk", (event) => {
      const { streamId, delta } = event.payload;
      const target = streamTargetsRef.current.get(streamId);
      if (disposed || !target || !delta) return;

      streamTextBufferRef.current.set(streamId, `${streamTextBufferRef.current.get(streamId) ?? ""}${delta}`);
      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.state === "streaming" ? `${message.text}${delta}` : message.text,
      }));
    }).then((unlisten) => unlisteners.push(unlisten));

    void listen<NoteChatStreamDoneEvent>("ai-chat-stream-done", (event) => {
      const { streamId } = event.payload;
      const target = streamTargetsRef.current.get(streamId);
      if (disposed || !target) return;

      if (target.mode === "compress-context") {
        const rawSummary = (streamTextBufferRef.current.get(streamId) ?? "").trim();
        if (!rawSummary) {
          replaceMessage(target.conversationId, target.messageId, (message) => ({
            ...message,
            text: "AI 服务返回为空，请重试。",
            kind: "text",
            state: "error",
            ...finishAssistantTiming(message),
          }));
        } else {
          const summary =
            rawSummary.length > AI_COMPRESSED_CONTEXT_MAX_CHARS
              ? `${rawSummary.slice(0, AI_COMPRESSED_CONTEXT_MAX_CHARS).trim()}\n[summary truncated]`
              : rawSummary;
          const now = Date.now();
          const sourceChars = target.compressionSourceChars ?? 0;
          const result: CompressionResult = {
            sourceChars,
            compressedChars: summary.length,
            ratio: sourceChars > 0 ? summary.length / sourceChars : 0,
            modelLabel: selectedModelLabelRef.current || "未知模型",
            providerLabel: selectedProviderLabelRef.current || "未知配置组",
            elapsedMs: target.compressionStartedAt ? Math.max(0, now - target.compressionStartedAt) : null,
            summary,
          };
          updateConversationMessages(target.conversationId, (conversation) => ({
            ...conversation,
            compressedContextSummary: summary,
            compressedContextUpdatedAt: now,
            compressedContextSourceChars: sourceChars,
            compressedContextModel: result.modelLabel,
            compressedContextProvider: result.providerLabel,
            messages: conversation.messages.map((message) => (
              message.id === target.messageId
                ? {
                    ...message,
                    text: "历史上下文已压缩",
                    kind: "compression-result",
                    compressionResult: result,
                    state: "done",
                    finishedAt: now,
                    elapsedMs: result.elapsedMs ?? undefined,
                  }
                : message
            )),
          }));
        }
        streamTextBufferRef.current.delete(streamId);
        streamTargetsRef.current.delete(streamId);
        activeStreamsRef.current.delete(streamId);
        webSearchPrepTokensRef.current.delete(streamId);
        updateRespondingState();
        return;
      }

      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.text.trim().length > 0 ? message.text : "The AI service returned no content. Please retry.",
        state: "done",
        webSearchStatus: message.webSearchStatus ? "done" : undefined,
        webSearchStatusText: undefined,
        ...finishAssistantTiming(message),
      }));
      streamTextBufferRef.current.delete(streamId);
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      webSearchPrepTokensRef.current.delete(streamId);
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
        kind: currentMessage.kind === "compression-result" ? "text" : currentMessage.kind,
        state: "error",
        webSearchStatus: currentMessage.webSearchStatus ? "failed" : undefined,
        webSearchStatusText: currentMessage.webSearchStatus ? "生成回答失败" : undefined,
        ...finishAssistantTiming(currentMessage),
      }));
      streamTextBufferRef.current.delete(streamId);
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      webSearchPrepTokensRef.current.delete(streamId);
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

  const buildRequestHistoryFromMessages = (
    conversation: AiConversation,
    sourceMessages: AiChatMessage[],
  ): NoteChatHistoryMessage[] => {
    const compressedSummary = conversation.compressedContextSummary?.trim();
    const historyLimit = compressedSummary ? AI_RECENT_HISTORY_AFTER_COMPRESSION_LIMIT : AI_REQUEST_HISTORY_LIMIT;
    const recentHistory = sourceMessages
      .filter((message) => {
        if (message.role !== "user" && message.role !== "assistant") return false;
        if (message.kind === "compression-result") return false;
        if (message.role === "user" && isContextUtilityCommandText(message.text)) return false;
        if (message.state === "loading" || message.state === "streaming" || message.state === "error") return false;
        return message.text.trim().length > 0;
      })
      .slice(-historyLimit)
      .map((message) => ({
        role: message.role as "user" | "assistant",
        text: truncateText(message.text.trim(), AI_REQUEST_HISTORY_MESSAGE_MAX_CHARS).text,
      }));

    if (!compressedSummary) return recentHistory;

    return [
      buildCompressedHistoryMessage(truncateText(compressedSummary, AI_COMPRESSED_CONTEXT_MAX_CHARS).text),
      ...recentHistory,
    ];
  };

  const buildRequestHistory = (conversationId: string): NoteChatHistoryMessage[] => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return [];
    return buildRequestHistoryFromMessages(conversation, conversation.messages);
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

  const openStatusPanel = () => {
    setStatusPanelOpen(true);
    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  const buildCompressionInput = (conversation: AiConversation): { text: string; sourceChars: number } => {
    const sections: string[] = [];
    const previousSummary = conversation.compressedContextSummary?.trim();

    if (previousSummary) {
      sections.push([
        "【已有压缩的历史上下文】",
        truncateText(previousSummary, AI_COMPRESSED_CONTEXT_MAX_CHARS).text,
      ].join("\n"));
    }

    const messageLines = conversation.messages
      .filter((message) => {
        if (message.role !== "user" && message.role !== "assistant") return false;
        if (message.state === "loading" || message.state === "streaming") return false;
        if (message.kind === "compression-result") return false;
        if (message.role === "user" && isContextUtilityCommandText(message.text)) return false;
        return message.text.trim().length > 0;
      })
      .slice(-24)
      .map((message) => {
        const role = message.role === "user" ? "用户" : "助手";
        const body = truncateText(message.text.trim(), AI_COMPRESSION_MESSAGE_MAX_CHARS);
        return `【${role}】\n${body.truncated ? `${body.text}\n[truncated]` : body.text}`;
      });

    if (!previousSummary && messageLines.length === 0) {
      return { text: "", sourceChars: 0 };
    }

    if (context.filePath) {
      sections.push([
        "【当前工作对象】",
        "仅记录文件名和路径，未包含当前笔记正文、选区正文或 Markdown body。",
        `文件名：${getFileNameFromPath(context.filePath)}`,
        `路径：${getCompactPath(context.filePath)}`,
      ].join("\n"));
    }

    if (messageLines.length > 0) {
      sections.push(["【历史对话】", ...messageLines].join("\n\n"));
    }

    const rawText = sections.join("\n\n").trim();
    const truncated = truncateText(rawText, AI_COMPRESSION_INPUT_MAX_CHARS);
    const historySourceText = [
      previousSummary ? truncateText(previousSummary, AI_COMPRESSED_CONTEXT_MAX_CHARS).text : "",
      ...messageLines,
    ].filter((item) => item.trim().length > 0).join("\n\n");
    return { text: truncated.text, sourceChars: historySourceText.length };
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

const buildExplainSelectionPrompt = (targetText: string): string => [
    "请执行只读 slash command：/解释选中部分。",
    "",
    "只解释下面这段当前选中的内容，不要展开成与当前选区无关的大段泛泛内容。",
    "不要修改原文，不要声称已经写入文件。",
    "",
    "回答要求：",
    "1. 先用一句话概括这段在讲什么。",
    "2. 分点解释它的含义、上下文和关键点。",
    "3. 如果涉及算法、代码或公式，说明关键概念、作用，以及需要注意的细节或坑点。",
    "4. 如果这段表达不清楚，可以补充帮助理解的解释，但不要直接改写原文。",
    "",
    "当前选中内容：",
    targetText,
  ].join("\n");

  const submitCompressContextCommand = (displayText = "/压缩上下文") => {
    if (isResponding) return;

    const conversationId = activeConversation?.id;
    if (!conversationId || !activeConversation) return;

    const compressionInput = buildCompressionInput(activeConversation);
    if (!compressionInput.text.trim()) {
      appendCommandNotice(conversationId, displayText, "暂无可压缩的上下文。");
      return;
    }

    if (!isAiConfigured) {
      appendCommandNotice(conversationId, displayText, "AI is not configured. Open settings first.");
      return;
    }

    if (!selectedProviderId || !selectedModelId) {
      appendCommandNotice(conversationId, displayText, "当前对话使用的模型不可用，请在顶部模型选择器里重新选择模型。");
      return;
    }

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const startedAt = Date.now();
    const streamId = `${Date.now()}-${requestId}`;
    const prompt = buildCompressionPrompt(compressionInput.text);
    const chatContext = buildChatContext({ includeNoteContext: false });
    const userMessage = createMessage({ role: "user", text: displayText, state: "done" });
    const assistantMessage = createMessage({
      role: "assistant",
      text: "",
      kind: "compression-result",
      commandId: "compress-context",
      state: "streaming",
      requestId,
      streamId,
      startedAt,
    });

    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);
    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
    streamTextBufferRef.current.set(streamId, "");
    streamTargetsRef.current.set(streamId, {
      conversationId,
      messageId: assistantMessage.id,
      requestId,
      mode: "compress-context",
      compressionSourceChars: compressionInput.sourceChars,
      compressionStartedAt: startedAt,
    });
    activeStreamsRef.current.add(streamId);
    updateRespondingState();

    void startCurrentNoteChatStream({
      streamId,
      question: prompt,
      context: chatContext,
      chatHistory: [],
      providerId: selectedProviderId,
      modelId: selectedModelId,
    }).catch((error) => {
      console.warn("AI context compression request failed", {
        requestId,
        streamId,
        error,
      });
      const target = streamTargetsRef.current.get(streamId);
      if (!target) return;
      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.state === "error" ? message.text : getChatErrorMessage(error),
        kind: "text",
        state: "error",
        ...finishAssistantTiming(message),
      }));
      streamTextBufferRef.current.delete(streamId);
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      webSearchPrepTokensRef.current.delete(streamId);
      updateRespondingState();
    });
  };

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

    if (command.id === "status") {
      openStatusPanel();
      return;
    }

    if (command.id === "compress-context") {
      submitCompressContextCommand(commandText);
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

    if (command.id === "explain-selection") {
      if (!context.filePath) {
        appendCommandNotice(conversationId, commandText, "请先打开一篇笔记。");
        return;
      }
      if (context.selectionStatus !== "available" || !context.selectedText.trim()) {
        appendCommandNotice(conversationId, commandText, "请先在编辑器中选中一段需要解释的文字。");
        return;
      }

      const selectedText = context.selectedText.trim();
      const truncatedTarget = truncateText(selectedText, NOTE_CHAT_MAX_PARAGRAPH_CHARS);
      const prompt = buildExplainSelectionPrompt(
        truncatedTarget.truncated ? `${truncatedTarget.text}\n\n（以上内容已截断）` : truncatedTarget.text,
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
    targetConversation?: AiConversation,
  ) => {
    if (isResponding) return;

    const requestConversation = targetConversation ?? activeConversation;
    const conversationId = requestConversation?.id;
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
    const requestWebSearchEnabled = webSearchEnabled && !userFacingText.startsWith("/");
    const requestLocalNoteSearchEnabled = includeCurrentNoteContext && !userFacingText.startsWith("/");
    const explicitUrlPlan = buildExplicitUrlReadPlan(question);
    const explicitUrlNotice = getExplicitUrlPlanNotice(explicitUrlPlan, requestWebSearchEnabled);
    const searchDecision = buildWebContextDecision(question, chatContext, requestWebSearchEnabled, explicitUrlPlan);

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const startedAt = Date.now();
    const streamId = `${Date.now()}-${requestId}`;
    const chatHistory = targetConversation
      ? buildRequestHistoryFromMessages(targetConversation, targetConversation.messages)
      : buildRequestHistory(conversationId);
    const userMessage = createMessage({ role: "user", text: userFacingText, state: "done" });
    const assistantMessage = createMessage({
      role: "assistant",
      text: "",
      state: "loading",
      retryText: question,
      retryDisplayText: userFacingText,
      requestId,
      streamId,
      retryContext: chatContext,
      searchDecision,
      webSearchStatus: searchDecision.shouldSearch ? "planning" : undefined,
      webSearchStatusText: searchDecision.shouldSearch ? "正在准备搜索计划..." : undefined,
      localNoteSearchStatus: requestLocalNoteSearchEnabled ? "searching" : undefined,
      startedAt,
    });

    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);

    setInputValue("");
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
    streamTextBufferRef.current.set(streamId, "");
    streamTargetsRef.current.set(streamId, {
      conversationId,
      messageId: assistantMessage.id,
      requestId,
      mode: "chat",
    });
    activeStreamsRef.current.add(streamId);
    const webSearchPrepToken = requestId;
    webSearchPrepTokensRef.current.set(streamId, webSearchPrepToken);
    updateRespondingState();

    await waitForNextFrame();
    const updateWebSearchStatus = (status: NonNullable<AiChatMessage["webSearchStatus"]>, text?: string) => {
      replaceMessage(conversationId, assistantMessage.id, (message) => ({
        ...message,
        webSearchStatus: status,
        webSearchStatusText: text ?? getWebSearchStageText(status),
      }));
    };
    const updateLocalNoteSearchStatus = (status: NonNullable<AiChatMessage["localNoteSearchStatus"]>, error?: string) => {
      replaceMessage(conversationId, assistantMessage.id, (message) => ({
        ...message,
        localNoteSearchStatus: status,
        localNoteSearchError: error,
      }));
    };
    const webSearchPromise: Promise<{ sources?: WebSource[]; error?: string; searchDebug?: string; filteredCount?: number; filterReason?: string; decision?: SearchDecision }> = !requestWebSearchEnabled && explicitUrlPlan.shouldRead
      ? Promise.resolve({ error: explicitUrlNotice ?? "需要开启联网/网页读取后才能读取链接" })
      : requestWebSearchEnabled && explicitUrlPlan.sources.length === 0 && explicitUrlPlan.blockedUrls.length > 0 && searchDecision.queries.length === 0
      ? Promise.resolve({ error: explicitUrlNotice ?? "需要开启联网/网页读取后才能读取链接" })
      : requestWebSearchEnabled && searchDecision.shouldSearch
      ? fetchWebSourcesForDecision(searchDecision, {
          conversationId,
          messageId: assistantMessage.id,
          streamId,
          token: webSearchPrepToken,
          userInput: question,
          context: chatContext,
          explicitSources: explicitUrlPlan.sources,
          onStatus: updateWebSearchStatus,
        }).catch((error) => {
        const errorMessage = getWebSearchErrorMessage(error);
        updateWebSearchStatus("failed", errorMessage);
        return { error: errorMessage, searchDebug: getWebSearchDebugMessage(error) };
      })
      : Promise.resolve({});
    const localNoteSearchPromise: Promise<{ localNoteSources?: LocalNoteSearchResult[]; error?: string }> = requestLocalNoteSearchEnabled
      ? withTimeout(
        fetchLocalNotesForMessage(question, searchDecision, chatContext, {
          conversationId,
          messageId: assistantMessage.id,
          onStatus: updateLocalNoteSearchStatus,
        }),
        LOCAL_NOTE_SEARCH_TIMEOUT_MS,
        "本地笔记检索超时，已继续生成回答",
      ).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        updateLocalNoteSearchStatus("failed", message);
        return { error: message };
      })
      : Promise.resolve({});
    const [searchResult, localNoteSearchResult] = await Promise.all([webSearchPromise, localNoteSearchPromise]);
    if (
      streamTargetsRef.current.get(streamId)?.messageId !== assistantMessage.id ||
      webSearchPrepTokensRef.current.get(streamId) !== webSearchPrepToken
    ) return;
    webSearchPrepTokensRef.current.delete(streamId);
    const effectiveSearchDecision = searchResult.decision ?? searchDecision;
    const searchError = [explicitUrlNotice, searchResult.error].filter(Boolean).join("；") || undefined;
    const sourcesWithCitations = assignWebSourceCitationIds(searchResult.sources);
    if (shouldStopRecentNewsWithoutSources(effectiveSearchDecision, sourcesWithCitations, searchError, explicitUrlPlan.sources.length)) {
        replaceMessage(conversationId, assistantMessage.id, (message) => ({
          ...message,
          text: getNewsSearchNoSourceMessage(searchError),
        state: "done",
        searchDecision: effectiveSearchDecision,
        sources: sourcesWithCitations,
        searchError,
        searchErrorDebug: searchResult.searchDebug,
        webSearchFilteredCount: searchResult.filteredCount,
        webSearchFilterReason: searchResult.filterReason,
        localNoteSources: localNoteSearchResult.localNoteSources,
        localNoteSearchStatus: requestLocalNoteSearchEnabled
          ? localNoteSearchResult.error ? "failed" : "done"
          : undefined,
        localNoteSearchError: localNoteSearchResult.error,
        webSearchStatus: "failed",
        webSearchStatusText: searchError ?? "没有成功读取到足够相关的近期新闻来源",
        ...finishAssistantTiming(message),
      }));
      streamTextBufferRef.current.delete(streamId);
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      webSearchPrepTokensRef.current.delete(streamId);
      updateRespondingState();
      return;
    }
    replaceMessage(conversationId, assistantMessage.id, (message) => ({
      ...message,
      state: "streaming",
      searchDecision: effectiveSearchDecision,
      sources: sourcesWithCitations,
      searchError,
      searchErrorDebug: searchResult.searchDebug,
      webSearchFilteredCount: searchResult.filteredCount,
      webSearchFilterReason: searchResult.filterReason,
      localNoteSources: localNoteSearchResult.localNoteSources,
      localNoteSearchStatus: requestLocalNoteSearchEnabled
        ? localNoteSearchResult.error ? "failed" : "done"
        : undefined,
      localNoteSearchError: localNoteSearchResult.error,
      webSearchStatus: effectiveSearchDecision.shouldSearch ? "answering" : undefined,
      webSearchStatusText: effectiveSearchDecision.shouldSearch ? "正在生成回答..." : undefined,
    }));

    void startCurrentNoteChatStream({
      streamId,
      question,
      context: chatContext,
      chatHistory,
      providerId: selectedProviderId,
      modelId: selectedModelId,
      webSearchMode: requestWebSearchEnabled ? "auto" : "off",
      webSearchEnabled: requestWebSearchEnabled && effectiveSearchDecision.shouldSearch,
      searchDecision: effectiveSearchDecision,
      searchSources: sourcesWithCitations,
      localNoteSources: localNoteSearchResult.localNoteSources,
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
      streamTextBufferRef.current.delete(streamId);
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      webSearchPrepTokensRef.current.delete(streamId);
      updateRespondingState();
    });
  };

  const canRetryAssistantMessage = (message: AiChatMessage): boolean => {
    const displayText = message.retryDisplayText?.trim() ?? "";
    return (
      message.role === "assistant" &&
      (message.kind === undefined || message.kind === "text") &&
      message.state !== "loading" &&
      message.state !== "streaming" &&
      Boolean(message.retryText?.trim()) &&
      !message.commandId &&
      !message.retryCommandId &&
      !displayText.startsWith("/")
    );
  };

  const showMessageCopyFeedback = (messageId: string, status: "copied" | "failed") => {
    if (messageCopyFeedbackTimerRef.current !== null) {
      window.clearTimeout(messageCopyFeedbackTimerRef.current);
    }
    setMessageCopyFeedback({ messageId, status });
    messageCopyFeedbackTimerRef.current = window.setTimeout(() => {
      setMessageCopyFeedback(null);
      messageCopyFeedbackTimerRef.current = null;
    }, 1600);
  };

  const copyAssistantMessage = async (message: AiChatMessage) => {
    const text = message.text.trim();
    if (!text) return;
    try {
      await copyPlainText(text);
      showMessageCopyFeedback(message.id, "copied");
    } catch (error) {
      console.warn("Copy AI message failed:", error);
      showMessageCopyFeedback(message.id, "failed");
    }
  };

  const retryAssistantMessage = (message: AiChatMessage) => {
    if (isResponding || !canRetryAssistantMessage(message)) return;

    const conversation = conversations.find((item) => item.id === activeConversation?.id);
    const conversationId = conversation?.id;
    const question = message.retryText?.trim() ?? "";
    if (!conversation || !conversationId || !question) return;

    const messageIndex = conversation.messages.findIndex((item) => item.id === message.id);
    if (messageIndex === -1) return;

    const userMessageIndex = [...conversation.messages.slice(0, messageIndex)]
      .reverse()
      .findIndex((item) => item.role === "user" && item.text.trim().length > 0 && !isContextUtilityCommandText(item.text));
    if (userMessageIndex === -1) return;
    const previousUserIndex = messageIndex - userMessageIndex - 1;

    if (!isAiConfigured || !selectedProviderId || !selectedModelId) {
      replaceMessage(conversationId, message.id, (current) => ({
        ...current,
        text: !isAiConfigured
          ? "AI is not configured. Open settings first."
          : "The selected model is unavailable. Choose another model in NoteX settings.",
        state: "error",
        ...finishAssistantTiming(current),
      }));
      return;
    }

    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const startedAt = Date.now();
    const streamId = `${Date.now()}-${requestId}`;
    const chatContext = buildChatContext();
    const requestWebSearchEnabled = webSearchEnabled && !(message.retryDisplayText?.trim() ?? "").startsWith("/");
    const requestLocalNoteSearchEnabled = includeCurrentNoteContext && !(message.retryDisplayText?.trim() ?? "").startsWith("/");
    const explicitUrlPlan = buildExplicitUrlReadPlan(question);
    const explicitUrlNotice = getExplicitUrlPlanNotice(explicitUrlPlan, requestWebSearchEnabled);
    const searchDecision = buildWebContextDecision(question, chatContext, requestWebSearchEnabled, explicitUrlPlan);
    const chatHistory = buildRequestHistoryFromMessages(
      conversation,
      conversation.messages.slice(0, previousUserIndex),
    );
    const assistantMessage = createMessage({
      role: "assistant",
      text: "",
      state: "loading",
      retryText: question,
      retryDisplayText: message.retryDisplayText,
      requestId,
      streamId,
      retryContext: chatContext,
      searchDecision,
      webSearchStatus: searchDecision.shouldSearch ? "planning" : undefined,
      webSearchStatusText: searchDecision.shouldSearch ? "正在准备搜索计划..." : undefined,
      localNoteSearchStatus: requestLocalNoteSearchEnabled ? "searching" : undefined,
      startedAt,
    });

    shouldAutoScrollRef.current = true;
    setShowScrollToBottom(false);
    updateConversationMessages(conversationId, (currentConversation) => ({
      ...currentConversation,
      messages: currentConversation.messages.map((item) => (item.id === message.id ? assistantMessage : item)),
    }));

    streamTextBufferRef.current.set(streamId, "");
    streamTargetsRef.current.set(streamId, {
      conversationId,
      messageId: assistantMessage.id,
      requestId,
      mode: "chat",
    });
    activeStreamsRef.current.add(streamId);
    const webSearchPrepToken = requestId;
    webSearchPrepTokensRef.current.set(streamId, webSearchPrepToken);
    updateRespondingState();

    void (async () => {
      await waitForNextFrame();
      const updateWebSearchStatus = (status: NonNullable<AiChatMessage["webSearchStatus"]>, text?: string) => {
        replaceMessage(conversationId, assistantMessage.id, (current) => ({
          ...current,
          webSearchStatus: status,
          webSearchStatusText: text ?? getWebSearchStageText(status),
        }));
      };
      const updateLocalNoteSearchStatus = (status: NonNullable<AiChatMessage["localNoteSearchStatus"]>, error?: string) => {
        replaceMessage(conversationId, assistantMessage.id, (current) => ({
          ...current,
          localNoteSearchStatus: status,
          localNoteSearchError: error,
        }));
      };
      const webSearchPromise: Promise<{ sources?: WebSource[]; error?: string; searchDebug?: string; filteredCount?: number; filterReason?: string; decision?: SearchDecision }> = !requestWebSearchEnabled && explicitUrlPlan.shouldRead
        ? Promise.resolve({ error: explicitUrlNotice ?? "需要开启联网/网页读取后才能读取链接" })
        : requestWebSearchEnabled && explicitUrlPlan.sources.length === 0 && explicitUrlPlan.blockedUrls.length > 0 && searchDecision.queries.length === 0
        ? Promise.resolve({ error: explicitUrlNotice ?? "需要开启联网/网页读取后才能读取链接" })
        : requestWebSearchEnabled && searchDecision.shouldSearch
        ? fetchWebSourcesForDecision(searchDecision, {
            conversationId,
            messageId: assistantMessage.id,
            streamId,
            token: webSearchPrepToken,
            userInput: question,
            context: chatContext,
            explicitSources: explicitUrlPlan.sources,
            onStatus: updateWebSearchStatus,
          }).catch((error) => {
          const errorMessage = getWebSearchErrorMessage(error);
          updateWebSearchStatus("failed", errorMessage);
          return { error: errorMessage, searchDebug: getWebSearchDebugMessage(error) };
        })
        : Promise.resolve({});
      const localNoteSearchPromise: Promise<{ localNoteSources?: LocalNoteSearchResult[]; error?: string }> = requestLocalNoteSearchEnabled
        ? withTimeout(
          fetchLocalNotesForMessage(question, searchDecision, chatContext, {
            conversationId,
            messageId: assistantMessage.id,
            onStatus: updateLocalNoteSearchStatus,
          }),
          LOCAL_NOTE_SEARCH_TIMEOUT_MS,
          "本地笔记检索超时，已继续生成回答",
        ).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          updateLocalNoteSearchStatus("failed", message);
          return { error: message };
        })
        : Promise.resolve({});
      const [searchResult, localNoteSearchResult] = await Promise.all([webSearchPromise, localNoteSearchPromise]);
      if (
        streamTargetsRef.current.get(streamId)?.messageId !== assistantMessage.id ||
        webSearchPrepTokensRef.current.get(streamId) !== webSearchPrepToken
      ) return;
      webSearchPrepTokensRef.current.delete(streamId);
      const effectiveSearchDecision = searchResult.decision ?? searchDecision;
      const searchError = [explicitUrlNotice, searchResult.error].filter(Boolean).join("；") || undefined;
      const sourcesWithCitations = assignWebSourceCitationIds(searchResult.sources);
      if (shouldStopRecentNewsWithoutSources(effectiveSearchDecision, sourcesWithCitations, searchError, explicitUrlPlan.sources.length)) {
        replaceMessage(conversationId, assistantMessage.id, (current) => ({
          ...current,
          text: getNewsSearchNoSourceMessage(searchError),
          state: "done",
          searchDecision: effectiveSearchDecision,
          sources: sourcesWithCitations,
          searchError,
          searchErrorDebug: searchResult.searchDebug,
          webSearchFilteredCount: searchResult.filteredCount,
          webSearchFilterReason: searchResult.filterReason,
          localNoteSources: localNoteSearchResult.localNoteSources,
          localNoteSearchStatus: requestLocalNoteSearchEnabled
            ? localNoteSearchResult.error ? "failed" : "done"
            : undefined,
          localNoteSearchError: localNoteSearchResult.error,
          webSearchStatus: "failed",
          webSearchStatusText: searchError ?? "没有成功读取到足够相关的近期新闻来源",
          ...finishAssistantTiming(current),
        }));
        streamTextBufferRef.current.delete(streamId);
        streamTargetsRef.current.delete(streamId);
        activeStreamsRef.current.delete(streamId);
        webSearchPrepTokensRef.current.delete(streamId);
        updateRespondingState();
        return;
      }
      replaceMessage(conversationId, assistantMessage.id, (current) => ({
        ...current,
        state: "streaming",
        searchDecision: effectiveSearchDecision,
        sources: sourcesWithCitations,
        searchError,
        searchErrorDebug: searchResult.searchDebug,
        webSearchFilteredCount: searchResult.filteredCount,
        webSearchFilterReason: searchResult.filterReason,
        localNoteSources: localNoteSearchResult.localNoteSources,
        localNoteSearchStatus: requestLocalNoteSearchEnabled
          ? localNoteSearchResult.error ? "failed" : "done"
          : undefined,
        localNoteSearchError: localNoteSearchResult.error,
        webSearchStatus: effectiveSearchDecision.shouldSearch ? "answering" : undefined,
        webSearchStatusText: effectiveSearchDecision.shouldSearch ? "正在生成回答..." : undefined,
      }));

      await startCurrentNoteChatStream({
        streamId,
        question,
        context: chatContext,
        chatHistory,
        providerId: selectedProviderId,
        modelId: selectedModelId,
        webSearchMode: requestWebSearchEnabled ? "auto" : "off",
        webSearchEnabled: requestWebSearchEnabled && effectiveSearchDecision.shouldSearch,
        searchDecision: effectiveSearchDecision,
        searchSources: sourcesWithCitations,
        localNoteSources: localNoteSearchResult.localNoteSources,
      });
    })().catch((error) => {
      console.warn("AI sidebar retry request failed", {
        requestId,
        streamId,
        notePath: chatContext.notePath,
        error,
      });
      const target = streamTargetsRef.current.get(streamId);
      if (!target) return;
      replaceMessage(target.conversationId, target.messageId, (current) => ({
        ...current,
        text: current.state === "error" ? current.text : getChatErrorMessage(error),
        state: "error",
        ...finishAssistantTiming(current),
      }));
      streamTextBufferRef.current.delete(streamId);
      streamTargetsRef.current.delete(streamId);
      activeStreamsRef.current.delete(streamId);
      webSearchPrepTokensRef.current.delete(streamId);
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
    if (getCommandDisabledReason(command, context)) return;
    setInputValue("");
    setIsCommandPanelDismissed(true);
    setActiveCommandIndex(0);
    setViewMode("chat");
    executeSlashCommand(command);
  };

  const submitInput = () => {
    const conversationId = activeConversation?.id;
    const value = inputValue.trim();
    if (!conversationId || !value || isResponding) return;
    const shouldCreateConversationFromList = viewMode === "conversations" && !value.startsWith("/");
    const listConversation = shouldCreateConversationFromList
      ? {
          ...createEmptyConversation(),
          ...getDefaultConversationModel(aiConfig),
        }
      : undefined;

    if (listConversation) {
      setConversations((current) => limitConversations(pruneBlankConversations([listConversation, ...current], listConversation.id)));
      setActiveConversationId(listConversation.id);
    }
    setViewMode("chat");
    setIsAllConversationsOpen(false);
    setConversationSearch("");

    if (value.startsWith("/")) {
      const command = getCommandByInput(value);
      if (command) {
        executeSlashCommand(command, value);
      } else {
        appendCommandNotice(conversationId, value, "这个命令稍后接入。");
      }
      return;
    }

    void submitQuestion(value, undefined, value, listConversation);
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
    ? `${context.selectionStatus === "available" ? `已选择 ${context.selectedTextLength ?? 0} 字符` : "未选择"} · ${context.tags.length} 个标签`
    : "no note selected";
  const topContextSummary = context.filePath
    ? includeCurrentNoteContext
      ? `当前：${getFileNameFromPath(context.filePath)} · ${context.bodyLength} 字符`
      : `当前：${getFileNameFromPath(context.filePath)} · 未包含`
    : "当前：无笔记";
  const sortedConversations = useMemo(
    () => limitConversations(pruneBlankConversations(conversations, activeConversationId)),
    [activeConversationId, conversations],
  );
  const visibleConversations = useMemo(
    () => sortedConversations.filter(hasConversationContent),
    [sortedConversations],
  );
  const recentConversations = visibleConversations.slice(0, 3);
  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLocaleLowerCase();
    if (!query) return visibleConversations;
    return visibleConversations.filter((conversation) =>
      getConversationDisplayTitle(conversation).toLocaleLowerCase().includes(query),
    );
  }, [conversationSearch, visibleConversations]);
  const activeConversationTitle = getConversationDisplayTitle(activeConversation);
  const pendingDeleteConversation =
    conversations.find((conversation) => conversation.id === pendingDeleteConversationId) ?? null;
  const pendingDeleteConversationTitle = pendingDeleteConversation
    ? getConversationDisplayTitle(pendingDeleteConversation)
    : "";
  const sidebarStyle = isMaximized
    ? undefined
    : width
      ? { width, flexBasis: width, maxWidth: "100%" }
      : undefined;
  const contentColumnClass = isMaximized ? "w-full max-w-none" : "mx-auto w-full max-w-3xl";
  const renderConversationItem = (conversation: AiConversation, variant: "panel" | "overlay" = "panel") => {
    const title = getConversationDisplayTitle(conversation);
    const timeLabel = formatConversationRelativeTime(conversation.updatedAt);
    const hoverClass = variant === "overlay" ? "hover:bg-white/10" : "hover:bg-accent/70";
    const actionHoverClass = variant === "overlay" ? "hover:bg-white/10" : "hover:bg-accent";

    if (editingConversationId === conversation.id) {
      return (
        <div
          key={conversation.id}
          className={cn(
            "grid min-w-0 gap-1 rounded-md px-2.5 py-1.5",
            variant === "overlay" ? "bg-white/5" : "bg-muted/30",
          )}
        >
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
      );
    }

    return (
      <div
        key={conversation.id}
        className={cn(
          "group flex h-9 w-full min-w-0 items-center gap-1 rounded-md px-1 transition-colors",
          hoverClass,
        )}
      >
        <button
          type="button"
          className="min-w-0 flex-1 truncate px-1.5 text-left text-sm font-medium text-foreground"
          onClick={() => selectConversation(conversation.id)}
          title={title}
        >
          {title}
        </button>
        <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground group-hover:hidden">
          {timeLabel}
        </span>
        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            type="button"
            className={cn(
              "inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              actionHoverClass,
            )}
            onClick={(event) => {
              event.stopPropagation();
              startRenameConversation(conversation);
            }}
            title="重命名会话"
            aria-label="重命名会话"
          >
            <PenLine className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={(event) => {
              event.stopPropagation();
              requestDeleteConversation(conversation.id);
            }}
            title="删除会话"
            aria-label="删除会话"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };
  let commandOrdinal = 0;

  return (
    <aside
      className={cn(
        "relative z-20 shrink-0 flex-col overflow-hidden border-l border-border/80 bg-background/95 text-foreground",
        isOpen ? "flex" : "hidden",
        isMaximized && "absolute inset-0 z-40 border-l border-border/80 shadow-2xl",
      )}
      style={isMaximized ? undefined : sidebarStyle}
      aria-hidden={!isOpen}
    >
      <div className="relative shrink-0">
        <div className="flex h-11 items-center justify-between px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 items-center border-b border-primary/70 pb-1 text-sm font-semibold tracking-[0.08em] text-foreground">
            <div className="truncate">NoteX</div>
          </div>
        </div>
        <button
          type="button"
          className={cn(
            "mx-2 inline-flex h-7 min-w-0 max-w-[12rem] flex-1 items-center justify-between gap-1 rounded-sm px-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            isProviderPickerOpen && "bg-accent text-accent-foreground",
          )}
            onClick={() => {
              setIsProviderPickerOpen((open) => !open);
              setIsAllConversationsOpen(false);
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
            onClick={() => onMaximizedChange?.(!isMaximized)}
            title={isMaximized ? "Exit maximized NoteX" : "Maximize NoteX"}
            aria-label={isMaximized ? "Exit maximized NoteX" : "Maximize NoteX"}
            aria-pressed={isMaximized}
          >
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onClose}
            title="Hide NoteX"
            aria-label="Hide NoteX"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        </div>

        <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-1">
          {viewMode === "conversations" ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="min-w-0 truncate text-sm font-medium text-foreground" title="会话">
                会话
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => {
                  setViewMode("conversations");
                  setIsAllConversationsOpen(false);
                  setConversationSearch("");
                  setIsHistoryOpen(false);
                  setIsProviderPickerOpen(false);
                  setIsModelPickerOpen(false);
                }}
                title="会话"
                aria-label="会话"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span
                className="min-w-0 truncate text-sm font-medium text-foreground"
                title={activeConversationTitle}
              >
                {activeConversationTitle}
              </span>
            </div>
          )}
          <button
            type="button"
            className={cn(
              "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              isHistoryOpen && "bg-accent text-accent-foreground",
            )}
            onClick={() => {
              setIsHistoryOpen((open) => !open);
              setIsAllConversationsOpen(false);
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
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={createNewConversation}
            title="新聊天"
            aria-label="新聊天"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => {
              setIsHistoryOpen(false);
              setIsAllConversationsOpen(false);
              setIsProviderPickerOpen(false);
              setIsModelPickerOpen(false);
              onOpenAiSettings();
            }}
            title="AI settings"
            aria-label="AI settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        {isProviderPickerOpen && (
          <div className="absolute left-3 right-3 top-[calc(100%-0.15rem)] z-40 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
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
          <div className="absolute right-3 top-[4.75rem] z-30 w-[340px] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <span className="text-xs font-medium text-foreground">会话</span>
              <span className="text-[11px] text-muted-foreground">{visibleConversations.length} 个</span>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              <div className="grid gap-1">
                {visibleConversations.map((conversation) => renderConversationItem(conversation))}
              </div>
              {false && visibleConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="group flex w-full min-w-0 items-center gap-1 rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"
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
                      requestDeleteConversation(conversation.id);
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

      <div className="hidden shrink-0 border-b border-border/60 px-3 py-1.5">
        <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-muted/15 px-2.5 py-1.5 text-[11px] leading-4 text-muted-foreground">
          <span className="min-w-0 truncate" title={context.filePath ? `${getCompactPath(context.filePath)} · ${contextMeta}` : undefined}>
            {topContextSummary}
          </span>
          <span className="shrink-0 truncate">
            {compressedContextLength > 0 ? `已压缩 ${compressedContextLength} 字符` : "/状态 查看详情"}
          </span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={messagesScrollRef}
          className="h-full overflow-y-auto px-3 py-3 [scrollbar-width:thin]"
          onScroll={handleMessagesScroll}
        >
          {viewMode === "conversations" ? (
            <div className={cn(contentColumnClass, "grid gap-2")}>
              <div className="hidden">
                <span />
                <span>{visibleConversations.length}</span>
              </div>
              {recentConversations.length > 0 ? (
                <div className="grid gap-1">
                  {recentConversations.map((conversation) => renderConversationItem(conversation))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
                  还没有会话。直接在下方输入第一句话即可开始。
                </div>
              )}
              {visibleConversations.length > 3 && (
                <button
                  type="button"
                  className="mt-1 inline-flex h-8 items-center justify-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => {
                    setConversationSearch("");
                    setIsAllConversationsOpen(true);
                    setIsHistoryOpen(false);
                    setIsProviderPickerOpen(false);
                    setIsModelPickerOpen(false);
                  }}
                >
                  查看全部（{visibleConversations.length} 个）
                </button>
              )}
            </div>
          ) : messages.length === 0 ? (
            <div className={cn(contentColumnClass, "flex h-full min-h-44 items-center justify-center px-5 text-center")}>
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
            <div className={cn(contentColumnClass, "grid gap-3")}>
            {messages.map((message) => {
              if (message.role === "assistant") {
                const elapsedMs = getAssistantElapsedMs(message, elapsedNow);
                const timingLabel = getAssistantTimingLabel(message, elapsedMs);
                const isAssistantBusy = message.state === "loading" || message.state === "streaming";
                const copyFeedback = messageCopyFeedback?.messageId === message.id ? messageCopyFeedback.status : null;
                const canCopyAssistantMessage = message.text.trim().length > 0;
                const canRetryMessage = canRetryAssistantMessage(message);
                const sourceCitations = getSourceCitations(message.sources);
                const displayedSourceCitations = getDisplayedSourceCitations(message.text, sourceCitations);
                const hasUsedSourceCitations = getUsedCitationIds(message.text, sourceCitations).size > 0;
                const displayedLocalNoteSources = getDisplayedLocalNoteSources(message.text, message.localNoteSources);
                const isCitationListExpanded = expandedCitationMessageIds[message.id] === true;
                const isLocalNoteListExpanded = expandedLocalNoteMessageIds[message.id] === true;
                const activeHighlightedCitationId = highlightedCitationId?.startsWith(`${message.id}:`)
                  ? highlightedCitationId.slice(message.id.length + 1)
                  : null;
                const activeHighlightedLocalCitationId = highlightedLocalCitationId?.startsWith(`${message.id}:`)
                  ? highlightedLocalCitationId.slice(message.id.length + 1)
                  : null;
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
                      {developerModeEnabled && message.searchDecision?.shouldSearch && (
                        <WebSearchPlanCard
                          decision={message.searchDecision}
                          provider={activeWebSearchProvider}
                          filteredCount={message.webSearchFilteredCount}
                          filterReason={message.webSearchFilterReason}
                        />
                      )}
                      {message.searchDecision?.shouldSearch && (
                        <WebSearchProgressCard status={message.webSearchStatus} text={message.webSearchStatusText} />
                      )}
                      <LocalNoteSearchProgressCard
                        status={message.localNoteSearchStatus}
                        error={message.localNoteSearchError}
                      />
                      {!developerModeEnabled && message.searchDecision?.shouldSearch && message.searchError && (
                        <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full border border-amber-200/70 bg-amber-50/70 px-2.5 py-1 text-[11px] leading-5 text-amber-800 dark:border-amber-300/20 dark:bg-amber-400/[0.08] dark:text-amber-100">
                          <Info className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 truncate">{message.searchError}</span>
                        </div>
                      )}
                      {developerModeEnabled && message.searchDecision?.shouldSearch && (
                        <WebSearchSourcesCard
                          sources={message.sources}
                          error={message.searchError}
                          searchDebug={message.searchErrorDebug}
                          messageId={message.id}
                          highlightedCitationId={activeHighlightedCitationId}
                          provider={activeWebSearchProvider}
                        />
                      )}
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
                      ) : message.kind === "compression-result" && message.compressionResult ? (
                        <CompressionResultCard result={message.compressionResult} />
                      ) : message.kind === "compression-result" && message.state === "streaming" ? (
                        <div className="grid gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
                          <div className="flex items-center gap-2 text-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            正在压缩上下文...
                          </div>
                          <div className="line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5">{message.text || "准备摘要"}</div>
                        </div>
                      ) : (
                        <>
                          <AiMarkdownMessage
                            markdown={message.text || (message.state === "streaming" ? "Generating..." : "")}
                            citations={sourceCitations}
                            localNoteSources={message.localNoteSources}
                            onCitationClick={(citationId) => {
                              if (isValidLocalCitationId(citationId)) {
                                handleLocalNoteCitationClick(message.id, citationId);
                                return;
                              }
                              handleSourceCitationClick(message.id, citationId);
                            }}
                          />
                          <AssistantCitationList
                            citations={displayedSourceCitations}
                            messageId={message.id}
                            isExpanded={isCitationListExpanded}
                            hasUsedCitations={hasUsedSourceCitations}
                            highlightedCitationId={activeHighlightedCitationId}
                            onToggle={() => toggleCitationList(message.id)}
                          />
                          <LocalNoteSourcesCard
                            sources={displayedLocalNoteSources}
                            messageId={message.id}
                            developerModeEnabled={developerModeEnabled}
                            isExpanded={isLocalNoteListExpanded}
                            highlightedLocalCitationId={activeHighlightedLocalCitationId}
                            onToggle={() => toggleLocalNoteList(message.id)}
                            onOpenLocalNote={onOpenLocalNote}
                          />
                        </>
                      )}
                      {!isAssistantBusy && (canCopyAssistantMessage || canRetryMessage) && (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {canCopyAssistantMessage && (
                            <button
                              type="button"
                              className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-accent/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => void copyAssistantMessage(message)}
                              title="复制这条 AI 回复"
                              aria-label="复制这条 AI 回复"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              <span>{copyFeedback === "copied" ? "已复制" : copyFeedback === "failed" ? "复制失败" : "复制"}</span>
                            </button>
                          )}
                          {canRetryMessage && (
                            <button
                              type="button"
                              className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-accent/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => retryAssistantMessage(message)}
                              disabled={isResponding}
                              title="重新生成这条 AI 回复"
                              aria-label="重新生成这条 AI 回复"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>重试</span>
                            </button>
                          )}
                        </div>
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
        {isAllConversationsOpen && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/30 px-4 py-6 backdrop-blur-[2px]">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              onClick={() => {
                setIsAllConversationsOpen(false);
                setConversationSearch("");
              }}
              aria-label="关闭会话列表"
            />
            <div className="relative z-10 grid max-h-full w-full max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-2xl border border-border/70 bg-[#2b2d2f]/95 p-4 text-foreground shadow-[0_24px_80px_rgb(0_0_0/0.42)] dark:border-white/10">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  <div className="text-base font-semibold text-foreground">会话</div>
                  <div className="text-xs text-muted-foreground">选择最近会话，或用标题过滤。</div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={() => {
                    setIsAllConversationsOpen(false);
                    setConversationSearch("");
                  }}
                  title="关闭"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="搜索最近会话"
                className="h-9 min-w-0 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
              />
              <div className="min-h-0 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-width:thin]">
                <div className="hidden">
                  <span>所有会话</span>
                  <span>{filteredConversations.length}</span>
                </div>
                {filteredConversations.length > 0 ? (
                  <div className="grid gap-1">
                    {filteredConversations.map((conversation) => renderConversationItem(conversation, "overlay"))}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-white/10 px-3 py-8 text-center text-sm text-muted-foreground">
                    没有匹配的会话。
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {viewMode === "chat" && showScrollToBottom && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20">
            <div className={cn(contentColumnClass, "relative h-9")}>
            <button
              type="button"
              className="pointer-events-auto absolute left-1/2 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/15 dark:bg-[#2f3134]/95"
              onClick={() => {
                shouldAutoScrollRef.current = true;
                scrollMessagesToBottom("smooth");
              }}
              title="回到底部"
              aria-label="回到底部"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-30 shrink-0 px-3 pb-3 pt-2">
        <div className={cn(contentColumnClass, "relative")}>
        {isCommandPanelOpen && (
          <div className="ai-command-panel absolute bottom-[calc(100%-0.45rem)] left-5 right-5 z-20 overflow-hidden rounded-xl border border-[#dcdfe6] bg-white text-popover-foreground shadow-[0_18px_48px_rgb(15_23_42/0.16)] dark:border-white/10 dark:bg-[#2f3134] dark:shadow-[0_18px_52px_rgb(0_0_0/0.42)]">
            <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground">
              <div className="font-medium">选择命令</div>
              <div>上下键 - 回车</div>
            </div>
            {visibleCommands.length > 0 ? (
              <div className="ai-command-list max-h-72 overflow-y-auto overflow-x-hidden px-1.5 pb-1.5 [scrollbar-width:thin] [scrollbar-color:color-mix(in_oklch,var(--muted-foreground)_30%,transparent)_transparent]">
                {groupedVisibleCommands.map(({ category, commands }) => (
                  <div key={category} className="py-0.5">
                    <div className="px-1.5 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/75">
                      {category}
                    </div>
                    <div className="grid gap-0.5">
                      {commands.map((command) => {
                        const itemIndex = commandOrdinal;
                        commandOrdinal += 1;
                        const Icon = command.icon;
                        const disabledReason = getCommandDisabledReason(command, context);
                        const isDisabled = !!disabledReason;
                        const isActive = itemIndex === activeCommandIndex;
                        return (
                          <button
                            key={command.id}
                            ref={(element) => {
                              commandRowRefs.current[command.id] = element;
                            }}
                            type="button"
                            className={cn(
                              "ai-command-item flex h-10 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-left transition-[background-color,color,box-shadow,opacity]",
                              isDisabled
                                ? "cursor-not-allowed opacity-50"
                                : "text-foreground hover:bg-[#f5f7fa] dark:hover:bg-white/[0.07]",
                              isActive && !isDisabled
                                ? "bg-[#eef3f8] text-foreground shadow-[inset_0_0_0_1px_rgb(15_23_42/0.03)] dark:bg-white/10"
                                : isActive
                                  ? "bg-[#f3f4f6] text-foreground dark:bg-white/[0.05]"
                                  : undefined,
                            )}
                            onMouseEnter={() => setActiveCommandIndex(itemIndex)}
                            onClick={() => selectCommand(command)}
                            data-active={isActive ? "true" : undefined}
                            disabled={isDisabled}
                            aria-disabled={isDisabled}
                          >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground">
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-baseline gap-2 overflow-hidden">
                                <span className="max-w-[7.5rem] shrink truncate text-sm font-medium text-foreground">{command.label}</span>
                                <span className="truncate text-xs text-muted-foreground">
                                  {getCommandDescriptionText(command, disabledReason)}
                                </span>
                              </span>
                            </span>
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

        {statusPanelOpen && !isCommandPanelOpen && (
          <StatusPanel
            snapshot={statusPanelSnapshot}
            onClose={() => setStatusPanelOpen(false)}
          />
        )}

        <div className="ai-composer relative rounded-2xl border border-[#dcdfe6] bg-[#fafafa] p-2 shadow-[0_10px_26px_rgb(15_23_42/0.06)] transition-[border-color,box-shadow,background-color] focus-within:border-[#b8c0cc] focus-within:shadow-[0_12px_32px_rgb(15_23_42/0.10)] dark:border-white/10 dark:bg-[#2b2d2f] dark:shadow-[0_12px_34px_rgb(0_0_0/0.24)] dark:focus-within:border-white/20 dark:focus-within:shadow-[0_14px_38px_rgb(0_0_0/0.34)]">
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
            rows={2}
            placeholder="Ask a question, or type /"
            className="max-h-[180px] min-h-14 w-full resize-none border-0 !bg-transparent px-2 py-1 text-sm leading-5 text-foreground !shadow-none outline-none placeholder:text-muted-foreground/75 focus:!shadow-none"
          />
          <div className="flex min-w-0 items-center gap-1 overflow-hidden px-1.5 pt-1.5 text-[11px] text-muted-foreground">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 min-w-[3.75rem] max-w-[10rem] flex-[1_1_7rem] items-center gap-1 overflow-hidden rounded-full border border-border/70 bg-background/70 px-1.5 text-left text-[11px] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-[420px]:px-2 dark:bg-white/[0.04]",
                  isModelPickerOpen && "bg-accent text-accent-foreground",
                )}
                onClick={() => {
                  setIsModelPickerOpen((open) => !open);
                  setIsProviderPickerOpen(false);
                  setIsHistoryOpen(false);
                }}
                title={`选择模型：${selectedModelLabel}`}
                aria-label={`选择模型：${selectedModelLabel}`}
                aria-expanded={isModelPickerOpen}
              >
                <span className="min-w-0 truncate">{selectedModelLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={includeCurrentNoteContext}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border/70 bg-background/70 px-1 text-[11px] transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-[420px]:gap-1.5 min-[420px]:px-2 dark:bg-white/[0.04]",
                  includeCurrentNoteContext && "border-primary/45 bg-primary/10 text-foreground shadow-[inset_0_0_0_1px_rgb(59_130_246/0.08)]",
                )}
                onClick={() => setIncludeCurrentNoteContext((enabled) => !enabled)}
                title={includeCurrentNoteContext ? "包含当前笔记信息" : "不包含当前笔记信息"}
                aria-label={includeCurrentNoteContext ? "包含当前笔记信息" : "不包含当前笔记信息"}
              >
                <span
                  className={cn(
                    "relative h-3.5 w-6 shrink-0 rounded-full bg-muted-foreground/25 transition-colors",
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
                <span className="hidden truncate min-[420px]:inline">笔记</span>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={webSearchEnabled}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-border/70 bg-background/70 px-1.5 text-[11px] transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-[420px]:gap-1.5 min-[420px]:px-2 dark:bg-white/[0.04]",
                  webSearchEnabled && "border-primary/45 bg-primary/10 text-foreground shadow-[inset_0_0_0_1px_rgb(59_130_246/0.08)]",
                )}
                onClick={handleWebSearchToggle}
                title={webSearchEnabled ? "联网搜索已开启" : "联网搜索已关闭"}
                aria-label={webSearchEnabled ? "联网搜索已开启" : "联网搜索已关闭"}
              >
                <Search className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden truncate min-[420px]:inline">联网</span>
              </button>

              {false && isModelPickerOpen && (
                <div className="absolute bottom-9 left-0 z-50 w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
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
          {isModelPickerOpen && (
            <div className="absolute bottom-12 left-4 z-50 w-[300px] max-w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
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
        </div>
      </div>
      <Dialog
        open={!!pendingDeleteConversation}
        onOpenChange={(open) => {
          if (!open) cancelDeleteConversation();
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] border-border/70 bg-background/95 text-foreground shadow-[0_24px_80px_rgb(0_0_0/0.35)] backdrop-blur sm:max-w-sm dark:border-white/10 dark:bg-[#2b2d2f]/95">
          <DialogHeader>
            <DialogTitle>删除会话</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            确定要删除“{pendingDeleteConversationTitle}”吗？此操作无法撤销。
          </p>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={cancelDeleteConversation}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (!pendingDeleteConversation) {
                  cancelDeleteConversation();
                  return;
                }
                deleteConversation(pendingDeleteConversation.id);
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isWebSearchConsentDialogOpen} onOpenChange={(open) => !isSavingWebSearchConsent && setIsWebSearchConsentDialogOpen(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>启用公开网页搜索</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 text-sm leading-6 text-muted-foreground">
            <p>NoteX 可以使用公开网页搜索来辅助回答，例如查找题解、讨论、算法资料和常见错误。</p>
            <p>本功能不会读取你的浏览器 Cookie、历史记录、密码、登录状态或本地隐私数据。</p>
            <p>搜索只会发送题号、算法名、错误关键词等必要查询词。</p>
            <p>NoteX 只访问公开网页；如果网站拒绝访问，将自动降级，不会尝试绕过登录、验证码或反爬限制。</p>
            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs leading-5">
              公开搜索边界：Cookie `{String(PUBLIC_WEB_REQUEST_POLICY.useCookies)}`，历史记录 `{String(PUBLIC_WEB_REQUEST_POLICY.useBrowserHistory)}`，登录态 `{String(PUBLIC_WEB_REQUEST_POLICY.useLoginState)}`，最小查询词 `{String(PUBLIC_WEB_REQUEST_POLICY.sendMinimalQueryOnly)}`。
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsWebSearchConsentDialogOpen(false);
                setWebSearchMode("off");
              }}
              disabled={isSavingWebSearchConsent}
            >
              暂不启用
            </Button>
            <Button
              type="button"
              onClick={() => {
                void persistWebSearchConsent(true).then(() => {
                  setWebSearchMode("auto");
                  setIsWebSearchConsentDialogOpen(false);
                }).catch(() => {
                  // keep dialog open if save fails
                });
              }}
              disabled={isSavingWebSearchConsent}
            >
              {isSavingWebSearchConsent ? "保存中..." : "启用公开搜索"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
