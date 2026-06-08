import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
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
import { WebSearchPlanCard } from "@/components/ai/diagnostics/WebSearchPlanCard";
import { WebSearchSourcesCard } from "@/components/ai/diagnostics/WebSearchSourcesCard";
import { applyAiSearchQueryPlan, applySourceStrategyPlan, buildExplicitUrlReadPlan, buildSearchDecision, evaluateWebSourceEvidence, getNewsFreshnessPolicy, getWebReadBudgetPlan, limitWebSearchQueriesForProvider, markAiQueryPlannerFallback, normalizeWebSearchConfig, prepareWebSourcesForDecision, PUBLIC_WEB_REQUEST_POLICY, rankPreparedWebSources, shouldUseAiQueryPlanner, validateAiSearchQueryPlan, WEB_CACHE_STATUSES, WEB_CONTENT_STATUSES, WEB_DISCOVERY_METHODS, WEB_EVIDENCE_STATUSES, WEB_PAGE_TYPES, WEB_SOURCE_EXCERPT_STATUSES, WEB_SOURCE_KINDS, WEB_SOURCE_RELIABILITIES, WEB_SOURCE_STRENGTHS, type AiSearchPlannerContext, type AiSearchPlannerState, type ExplicitUrlReadPlan, type SearchDecision, type WebSearchMode, type WebSearchProvider, type WebSource } from "@/lib/aiWebSearch";
import { findCitationMarkerMatches, getUsedCitationIdList, possibleCitationMarkerPattern } from "@/lib/citations";
import { createSearchPreparationDiagnostics, encodeDebugValue, formatSearchPreparationDiagnostics, mergeSearchDebug } from "@/lib/searchDiagnostics";
import { runResearchEngineRealShadowRun, type ResearchEngineRealShadowRunReadAttempt, type ResearchEngineRealShadowRunResult } from "@/lib/research-engine";
import { formatLuoguSolution, type SolutionFormatChange } from "@/lib/solutionFormatter";
import { buildAiTagRecommendationInput, buildAiTagSuggestionMessagePayload, createAiTagRecommendationFailureMessage, normalizeAiTags, normalizeAiTagValue, type AiTagRecommendation, type AiTagRecommendationResult } from "@/lib/aiTagRecommendations";
import { cn } from "@/lib/utils";
import type { AiPolishPreview, AiSidebarNoteContext, AiSidebarProps } from "@/components/ai/types";
import { getMarkdownRenderCacheKey, readMarkdownRenderCache, writeMarkdownRenderCache } from "@/components/ai/markdownCache";
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
import "./notexWorkbench.css";

function MenuCheckIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6.7 12.8L10.0 15.95L17.4 5.85"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

type TagSuggestionResult = AiTagRecommendationResult & {
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
    trigger: "推荐标签",
    label: "推荐标签",
    description: "基于当前笔记内容和标签体系推荐标签。",
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
const COMPOSER_TEXTAREA_MIN_HEIGHT = 104;
const COMPOSER_TEXTAREA_MAX_HEIGHT = 220;

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
const AI_SCROLL_BOTTOM_THRESHOLD = 24;
const AI_CONVERSATION_PERSIST_DEBOUNCE_MS = 500;
const AI_HYDRATION_CHUNK_BUDGET_MS = 7;
const AI_SIDEBAR_PERF_DEBUG_STORAGE_KEY = "oinb.aiSidebarPerfDebug";

function isAiPerfDebugEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(AI_SIDEBAR_PERF_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const AI_SIDEBAR_PERF_DEBUG = isAiPerfDebugEnabled();

type NoteXAiPerfGlobal = {
  counters: Record<string, number>;
  lastEvents: Record<string, unknown>;
  dump: () => void;
  reset: () => void;
  getSnapshot: () => {
    counters: Record<string, number>;
    lastEvents: Record<string, unknown>;
  };
};

const NOTEX_AI_PERF_COUNTER_NAMES = [
  "appResizePointerDown",
  "appResizePointerMove",
  "appResizeRafCommit",
  "appResizeStateCommit",
  "appResizeLocalStorageWrite",
  "appResizePointerUp",
  "aiSidebarRender",
  "selectConversation",
  "activeConversationChange",
  "viewModeChange",
  "prepareHit",
  "messageListRender",
  "messageResizeObserver",
  "composerResizeObserver",
  "scrollEvent",
  "setShowScrollToBottom",
  "scheduleScrollToBottom",
  "scrollToBottom",
  "composerInputChange",
  "parentInputStateCommit",
  "aiSidebarMount",
  "aiSidebarHydrateStart",
  "aiSidebarHydrateEnd",
  "aiSidebarHydrateDuration",
  "conversationsLocalStorageRead",
  "conversationsJsonParse",
  "conversationsSanitize",
  "conversationsSetState",
  "aiSidebarInitialEffectsRun",
  "aiSidebarInitialScrollToBottom",
  "aiSidebarPrepareHit",
  "developerModeEnabled",
  "aiSidebarDeveloperDiagnosticsRender",
  "webSearchPlanCardRender",
  "webSearchSourcesCardRender",
  "diagnosticsMarkdownFormatCount",
  "directSourceCardRender",
  "duplicateKeyGuardCount",
];

const createNoteXAiPerfCounters = () => (
  NOTEX_AI_PERF_COUNTER_NAMES.reduce<Record<string, number>>((counters, name) => {
    counters[name] = 0;
    return counters;
  }, {})
);

const getNoteXAiPerfGlobal = (): NoteXAiPerfGlobal | null => {
  if (!AI_SIDEBAR_PERF_DEBUG || typeof window === "undefined") return null;
  const perfWindow = window as typeof window & {
    __OINB_AI_PERF__?: NoteXAiPerfGlobal;
    __OINB_AI_PERF_ENABLED_LOGGED__?: boolean;
  };
  if (!perfWindow.__OINB_AI_PERF__) {
    const perf: NoteXAiPerfGlobal = {
      counters: createNoteXAiPerfCounters(),
      lastEvents: {},
      dump: () => {
        console.info("[NoteX Perf] snapshot", perf.getSnapshot());
        console.table(perf.counters);
      },
      reset: () => {
        perf.counters = createNoteXAiPerfCounters();
        perf.lastEvents = {};
        console.info("[NoteX Perf] reset");
      },
      getSnapshot: () => ({
        counters: { ...perf.counters },
        lastEvents: { ...perf.lastEvents },
      }),
    };
    perfWindow.__OINB_AI_PERF__ = perf;
  }
  if (!perfWindow.__OINB_AI_PERF_ENABLED_LOGGED__) {
    perfWindow.__OINB_AI_PERF_ENABLED_LOGGED__ = true;
    console.info("[NoteX Perf] enabled", {
      dump: "window.__OINB_AI_PERF__.dump()",
      reset: "window.__OINB_AI_PERF__.reset()",
      getSnapshot: "window.__OINB_AI_PERF__.getSnapshot()",
    });
  }
  return perfWindow.__OINB_AI_PERF__;
};

const incrementNoteXAiPerfCounter = (name: string, amount = 1) => {
  const perf = getNoteXAiPerfGlobal();
  if (!perf) return;
  perf.counters[name] = (perf.counters[name] ?? 0) + amount;
};

const setNoteXAiPerfEvent = (name: string, value: unknown) => {
  const perf = getNoteXAiPerfGlobal();
  if (!perf) return;
  perf.lastEvents[name] = value;
};
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

const RESEARCH_ENGINE_PROMPT_EXCERPT_LIMIT = 1800;
const RESEARCH_ENGINE_SOURCE_PREVIEW_LIMIT = 320;

const getResearchEngineHost = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};

const compactResearchEngineText = (value: string | undefined, maxChars: number): string | undefined => {
  const compact = value?.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  const truncated = truncateText(compact, maxChars);
  return truncated.truncated ? `${truncated.text}...` : truncated.text;
};

const isResearchEngineReadSuccess = (attempt: ResearchEngineRealShadowRunReadAttempt): boolean =>
  attempt.status === "fetched" || attempt.status === "partial" || attempt.status === "body_too_large";

const getResearchEngineSourceType = (candidateType: ResearchEngineRealShadowRunReadAttempt["candidate"]["sourceType"]): WebSource["sourceType"] => {
  if (candidateType === "official" || candidateType === "documentation") return "official";
  if (candidateType === "technical_blog") return "blog";
  if (candidateType === "community_solution" || candidateType === "forum") return "discussion";
  return "unknown";
};

const getResearchEngineSourceKind = (candidateType: ResearchEngineRealShadowRunReadAttempt["candidate"]["sourceType"]): WebSource["sourceKind"] => {
  if (candidateType === "documentation") return "docs_page";
  if (candidateType === "mainstream_news") return "media_article";
  if (candidateType === "seo_aggregator") return "aggregator_item";
  return "search_result";
};

const getResearchEngineExcerptStatus = (attempt: ResearchEngineRealShadowRunReadAttempt): WebSource["excerptStatus"] => {
  if (isResearchEngineReadSuccess(attempt)) return "fetched";
  if (attempt.status === "validation_failed" || attempt.status === "unsupported_content_type" || attempt.status === "body_too_large") return "blocked";
  if (attempt.status === "needs_js" || attempt.status === "empty_body") return "unavailable";
  return "failed";
};

const getResearchEngineExcerptQuality = (attempt: ResearchEngineRealShadowRunReadAttempt): WebSource["excerptQuality"] => {
  if (!isResearchEngineReadSuccess(attempt)) {
    if (attempt.status === "needs_js" || attempt.status === "empty_body") return "unavailable";
    if (attempt.status === "validation_failed" || attempt.status === "unsupported_content_type") return "blocked";
    return "failed";
  }
  if (attempt.readerQuality?.quality === "strong") return "high";
  if (attempt.readerQuality?.quality === "medium") return "medium";
  return attempt.status === "partial" || attempt.status === "body_too_large" ? "partial" : "low";
};

const getResearchEngineReadStatus = (attempt: ResearchEngineRealShadowRunReadAttempt): WebSource["readStatus"] => {
  if (attempt.status === "fetched") return "fetched";
  if (attempt.status === "partial" || attempt.status === "body_too_large") return "partial";
  if (attempt.status === "validation_failed" || attempt.status === "unsupported_content_type") return "blocked";
  return "failed";
};

const getResearchEngineWebSearchProvider = (providerName: ResearchEngineRealShadowRunResult["providerName"]): WebSearchProvider | undefined =>
  providerName === "bing" || providerName === "bocha" || providerName === "brave" ? providerName : undefined;

const getResearchEngineProviderLabel = (providerName: ResearchEngineRealShadowRunResult["providerName"] | WebSearchProvider | string | undefined): string => {
  if (providerName === "bing") return "Bing 公共搜索";
  if (providerName === "bocha") return "Bocha 搜索";
  if (providerName === "brave") return "Brave Search";
  if (providerName === "none" || !providerName) return "未配置搜索 provider";
  return providerName;
};

const buildResearchEngineTakeoverFailureText = (
  reason: string,
  providerName: ResearchEngineRealShadowRunResult["providerName"] | WebSearchProvider | string | undefined,
): string =>
  {
    const providerLabel = getResearchEngineProviderLabel(providerName);
    const providerLine = providerName === "bing"
      ? `当前使用的是无 key 公共搜索 provider：${providerLabel}。`
      : providerName === "bocha" || providerName === "brave"
        ? `当前使用的是可选 API provider：${providerLabel}。`
        : `当前搜索配置：${providerLabel}。`;
    return [
      "Research Engine 搜索失败",
      "",
      "当前处于开发者模式，联网搜索已由 Research Engine 接管。",
      providerLine,
      `搜索失败原因：${reason}`,
      "",
      "旧 NoteX 搜索不会自动回退；请根据诊断继续修复 Research Engine。",
    ].join("\n");
  };

const getResearchEngineFailureMessage = (result: ResearchEngineRealShadowRunResult): string | undefined => {
  if (result.successfulReads > 0 && result.ok) return undefined;
  const primaryError = result.errors[0] ?? result.warnings[0];
  if (result.providerStatus === "source_diversity_failed" || result.providerStatus === "insufficient_evidence") {
    const selectedHosts = Array.isArray(result.diagnosticsSnapshot.selectedEvidenceHosts)
      ? result.diagnosticsSnapshot.selectedEvidenceHosts.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const hostText = selectedHosts.length > 0 ? selectedHosts.join(", ") : "none";
    const gateReason = typeof result.diagnosticsSnapshot.evidenceGateReason === "string"
      ? result.diagnosticsSnapshot.evidenceGateReason
      : result.providerStatus;
    return buildResearchEngineTakeoverFailureText(
      `已找到新闻候选，但未读取到足够多的独立来源。当前可用来源：${hostText}。新闻类问题需要多个独立来源交叉验证，Research Engine 拒绝用单一网站生成完整总结。gate=${gateReason}`,
      result.providerName,
    );
  }
  if (result.providerStatus === "not_configured") {
    if (result.providerName === "bocha" || result.providerName === "brave") {
      return buildResearchEngineTakeoverFailureText("当前 API provider 缺少 key；但主线将优先维护无 key 公共搜索 provider。", result.providerName);
    }
    return buildResearchEngineTakeoverFailureText("Research Engine 暂未配置或暂不支持该 provider。", result.providerName);
  }
  if (result.providerStatus === "unsupported_provider") {
    return buildResearchEngineTakeoverFailureText("Research Engine 暂不支持该 provider。", result.providerName);
  }
  if (result.providerStatus === "blocked_or_captcha") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `Bing 公共搜索被限制或验证页拦截；${primaryError}` : "Bing 公共搜索被限制或验证页拦截。", result.providerName);
  }
  if (result.providerStatus === "tauri_bridge_unavailable") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `Tauri 搜索 bridge 不可用；${primaryError}` : "Tauri 搜索 bridge 不可用。", result.providerName);
  }
  if (result.providerStatus === "rate_limited") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `Bing 公共搜索被限流；${primaryError}` : "Bing 公共搜索被限流。", result.providerName);
  }
  if (result.providerStatus === "timeout") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `Bing 公共搜索超时；${primaryError}` : "Bing 公共搜索超时。", result.providerName);
  }
  if (result.providerStatus === "network_error") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `Bing 公共搜索网络请求失败；${primaryError}` : "Bing 公共搜索网络请求失败。", result.providerName);
  }
  if (result.providerStatus === "parse_failed") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `Bing 公共搜索返回内容解析失败；${primaryError}` : "Bing 公共搜索返回内容解析失败。", result.providerName);
  }
  if (result.providerStatus === "invalid_response" || result.providerStatus === "malformed_response") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `搜索 bridge 返回格式不符合预期；${primaryError}` : "搜索 bridge 返回格式不符合预期。", result.providerName);
  }
  if (result.providerStatus === "empty_result") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `Bing 公共搜索没有返回可用结果；${primaryError}` : "Bing 公共搜索没有返回可用结果。", result.providerName);
  }
  if (result.providerStatus === "unsupported_environment") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `当前运行环境暂不支持 Bing 公共搜索；${primaryError}` : "当前运行环境暂不支持 Bing 公共搜索。", result.providerName);
  }
  if (result.providerStatus === "aborted") {
    return buildResearchEngineTakeoverFailureText("搜索在获得可用证据前已中止。", result.providerName);
  }
  if (result.providerStatus === "no_candidate_url") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `没有可读取的候选 URL；${primaryError}` : "没有可读取的候选 URL。", result.providerName);
  }
  if (result.providerStatus === "cors_or_reader_network_error") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `URL reader 受 CORS 或网络错误影响，未读到可用证据；${primaryError}` : "URL reader 受 CORS 或网络错误影响，未读到可用证据。", result.providerName);
  }
  if (result.providerStatus === "all_reader_failed") {
    return buildResearchEngineTakeoverFailureText(primaryError ? `所有候选 URL reader 都失败；${primaryError}` : "所有候选 URL reader 都失败。", result.providerName);
  }
  if (result.candidateCount === 0) {
    return buildResearchEngineTakeoverFailureText(primaryError ? `没有可读取的候选 URL；${primaryError}` : "没有可读取的候选 URL。", result.providerName);
  }
  return buildResearchEngineTakeoverFailureText(primaryError ? `没有产出可用证据；${primaryError}` : "没有产出可用证据。", result.providerName);
};

const getResearchEngineDebugProvider = (result: ResearchEngineRealShadowRunResult): string => {
  const keyless = result.diagnosticsSnapshot.keylessProviderDiagnostics;
  return keyless && typeof keyless === "object" ? "keyless_bing" : result.providerName;
};

const getResearchEngineApiKeyRequired = (result: ResearchEngineRealShadowRunResult): string => {
  const keyless = result.diagnosticsSnapshot.keylessProviderDiagnostics;
  return keyless && typeof keyless === "object" ? "no" : result.providerName === "bocha" || result.providerName === "brave" ? "yes" : "unknown";
};

const formatResearchEngineSearchDebug = (result: ResearchEngineRealShadowRunResult): string => {
  const readStatuses = result.readAttempts.map((attempt, index) => `${index + 1}:${attempt.candidate.host || getResearchEngineHost(attempt.candidate.url)}:${attempt.status}`);
  return [
    "debug=researchEnginePhase17",
    "engine=research_engine",
    "phase=17",
    "forcedTakeover=yes",
    "legacySearchExecuted=no",
    "fallback=no",
    "developerModeOnly=yes",
    `provider=${encodeDebugValue(getResearchEngineDebugProvider(result))}`,
    `configuredProvider=${encodeDebugValue(result.providerName)}`,
    `apiKeyRequired=${getResearchEngineApiKeyRequired(result)}`,
    `providerLabel=${encodeDebugValue(getResearchEngineProviderLabel(result.providerName))}`,
    `providerStatus=${encodeDebugValue(result.providerStatus)}`,
    `rawResultCount=${result.rawResultCount}`,
    `normalizedResultCount=${result.normalizedResultCount}`,
    `candidateCount=${result.candidateCount}`,
    `selectedCandidateCount=${result.selectedCandidates.length}`,
    `readAttempts=${result.readAttempts.length}`,
    `successfulReads=${result.successfulReads}`,
    `failedReads=${result.failedReads}`,
    `sourcePortfolioEnabled=${encodeDebugValue(String(result.diagnosticsSnapshot.sourcePortfolioEnabled ?? false))}`,
    `targetDistinctHosts=${encodeDebugValue(String(result.diagnosticsSnapshot.targetDistinctHosts ?? "none"))}`,
    `usableEvidenceHostCount=${encodeDebugValue(String(result.diagnosticsSnapshot.usableEvidenceHostCount ?? "none"))}`,
    `evidenceGateStatus=${encodeDebugValue(String(result.diagnosticsSnapshot.evidenceGateStatus ?? "none"))}`,
    `evidenceGateReason=${encodeDebugValue(String(result.diagnosticsSnapshot.evidenceGateReason ?? "none"))}`,
    `sourceDiversitySatisfied=${encodeDebugValue(String(result.diagnosticsSnapshot.sourceDiversitySatisfied ?? "unknown"))}`,
    `answerContractMode=${encodeDebugValue(result.answerContractMode ?? "none")}`,
    `warnings=${encodeDebugValue(result.warnings.slice(0, 8).join(" | ") || "none")}`,
    `errors=${encodeDebugValue(result.errors.slice(0, 8).join(" | ") || "none")}`,
    `readStatuses=${encodeDebugValue(readStatuses.join(" | ") || "none")}`,
  ].join("; ");
};

const mapResearchEngineShadowRunToSources = (result: ResearchEngineRealShadowRunResult): WebSource[] | undefined => {
  const evidenceGateStatus = typeof result.diagnosticsSnapshot.evidenceGateStatus === "string"
    ? result.diagnosticsSnapshot.evidenceGateStatus
    : "not_applicable";
  const gateAllowsPromptEvidence = evidenceGateStatus !== "failed";
  const evidenceGateReason = typeof result.diagnosticsSnapshot.evidenceGateReason === "string"
    ? result.diagnosticsSnapshot.evidenceGateReason
    : undefined;
  const sources = result.readAttempts.map((attempt, index): WebSource => {
    const evidenceId = `E${index + 1}`;
    const host = attempt.candidate.host || getResearchEngineHost(attempt.candidate.url);
    const excerpt = compactResearchEngineText(attempt.excerptPreview, RESEARCH_ENGINE_PROMPT_EXCERPT_LIMIT);
    const snippet = compactResearchEngineText(attempt.excerptPreview, RESEARCH_ENGINE_SOURCE_PREVIEW_LIMIT) ?? [
      attempt.warnings[0],
      attempt.errors[0],
      attempt.status,
    ].filter(Boolean).join(" ");
    const readerUsable = isResearchEngineReadSuccess(attempt) && Boolean(excerpt);
    const usable = readerUsable && gateAllowsPromptEvidence;
    const excerptStatus = getResearchEngineExcerptStatus(attempt);
    const searchDiagnostics = formatResearchEngineSearchDebug(result);
    return {
      id: `research-engine-${evidenceId.toLowerCase()}`,
      title: attempt.candidate.title || attempt.candidate.url,
      url: attempt.candidate.url,
      finalUrl: attempt.candidate.url,
      site: host,
      snippet,
      sourceKind: getResearchEngineSourceKind(attempt.candidate.sourceType),
      discoveryMethod: "search_provider",
      sourceReliability: "unknown",
      searchProvider: getResearchEngineWebSearchProvider(result.providerName),
      searchStage: "research-engine-shadow-run",
      searchDiagnostics,
      finalIncludedInPrompt: usable,
      evidenceStatus: usable ? "usable" : "rejected",
      usableEvidence: usable,
      injectedIntoAnswer: usable,
      evidenceReason: usable
        ? `${evidenceId}: Research Engine Shadow Run selected this public URL and built an excerpt preview. Use only the excerpt as web evidence. Evidence gate=${evidenceGateStatus}.`
        : gateAllowsPromptEvidence
          ? `${evidenceId}: Research Engine Shadow Run could not produce usable excerpt evidence for this URL.`
          : `${evidenceId}: Research Engine read this URL, but the news evidence gate rejected prompt injection because independent source coverage is insufficient.`,
      rejectedReason: usable ? undefined : [
        gateAllowsPromptEvidence ? undefined : `evidence_gate_${evidenceGateStatus}:${evidenceGateReason ?? "insufficient_evidence"}`,
        attempt.status,
        ...attempt.errors,
        ...attempt.warnings,
      ].filter(Boolean).join("; "),
      pageType: attempt.candidate.sourceType === "mainstream_news" ? "news_article" : "unknown",
      contentStatus: usable ? (attempt.status === "partial" || attempt.status === "body_too_large" ? "partial" : "fetched") : attempt.status === "needs_js" ? "needs_js" : "failed",
      sourceStrength: usable ? "strong" : "rejected",
      sourceType: getResearchEngineSourceType(attempt.candidate.sourceType),
      reliability: "unknown",
      reliabilityLabel: "Research Engine evidence",
      reliabilityReason: "Developer Mode Research Engine Shadow Run; provider secrets and raw bodies are redacted.",
      relevance: usable ? "strong" : "candidate",
      relevanceLabel: usable ? "usable Research Engine evidence" : "candidate read failed",
      relevanceReason: `Research Engine selected candidate ${attempt.candidate.id}; reader status=${attempt.status}.`,
      excerptStatus,
      excerpt,
      excerptError: usable ? undefined : [attempt.errors[0], attempt.warnings[0]].filter(Boolean).join("; ") || attempt.status,
      contentType: attempt.contentType,
      bodyBytes: undefined,
      extractedTextChars: excerpt?.length,
      excerptChars: excerpt?.length,
      fetchedAt: Date.now(),
      cacheStatus: "miss",
      readStatus: getResearchEngineReadStatus(attempt),
      errorKind: attempt.status === "timeout" ? "timeout" : attempt.status === "validation_failed" ? "invalid_url" : attempt.status === "unsupported_content_type" ? "content_type_unsupported" : attempt.status === "body_too_large" ? "too_large" : attempt.status === "network_error" ? "unknown" : undefined,
      excerptQuality: getResearchEngineExcerptQuality(attempt),
      extractor: "generic",
      excerptReason: `Research Engine excerpt preview only; selected passages=${attempt.selectedPassageCount}.`,
      blockedReason: excerptStatus === "blocked" ? [attempt.status, ...attempt.warnings].filter(Boolean).join("; ") : undefined,
      needsJsReason: attempt.status === "needs_js" ? [attempt.warnings[0], attempt.errors[0]].filter(Boolean).join("; ") || "needs_js" : undefined,
      extractionFailureReason: usable ? undefined : [attempt.errors[0], attempt.warnings[0]].filter(Boolean).join("; "),
      rankScore: typeof attempt.candidate.score === "number" ? Math.round(attempt.candidate.score) : undefined,
      rankReason: `Research Engine candidate pool score=${attempt.candidate.score ?? "unknown"}.`,
      selected: usable,
      isConstructed: false,
    };
  });
  return sources.length > 0 ? sources : undefined;
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
      return "Bing 公开搜索被限制了，稍后可以重试；Research Engine 主线会继续维护无 key 公共搜索 provider。";
    }
    if (message.includes("errorKind=blocked_or_captcha") || /captcha|verify/i.test(message)) {
      return "Bing 公开搜索被验证页拦截了，稍后可以重试；Research Engine 不会绕过验证码或登录限制。";
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
  const suggestedTags = normalizeAiTags(item.suggestedTags.filter((tag): tag is string => typeof tag === "string"));
  const suggestions = Array.isArray(item.suggestions)
    ? item.suggestions.flatMap((suggestion) => {
      if (!suggestion || typeof suggestion !== "object") return [];
      const candidate = suggestion as Partial<AiTagRecommendation>;
      if (typeof candidate.tag !== "string" || !candidate.tag.trim()) return [];
      return [{
        tag: normalizeAiTagValue(candidate.tag),
        confidence: typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
          ? Math.max(0, Math.min(1, candidate.confidence))
          : 0.6,
        reason: typeof candidate.reason === "string" ? candidate.reason : "",
        evidence: typeof candidate.evidence === "string" ? candidate.evidence : "",
        normalizedFrom: typeof candidate.normalizedFrom === "string" ? candidate.normalizedFrom : undefined,
      }];
    })
    : suggestedTags.map((tag) => ({
      tag,
      confidence: 0.6,
      reason: "",
      evidence: "",
    }));
  const selectedTags = Array.isArray(item.selectedTags)
    ? normalizeAiTags(item.selectedTags.filter((tag): tag is string => typeof tag === "string"))
      .filter((tag) => suggestedTags.includes(tag))
    : suggestedTags;

  return {
    notePath: item.notePath,
    existingTags: normalizeAiTags(item.existingTags.filter((tag): tag is string => typeof tag === "string")),
    suggestedTags,
    suggestions,
    selectedTags,
    ignoredCount: typeof item.ignoredCount === "number" && Number.isFinite(item.ignoredCount)
      ? Math.max(0, Math.floor(item.ignoredCount))
      : 0,
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
      sourcePublishedAt: typeof source.sourcePublishedAt === "string" && source.sourcePublishedAt.trim()
        ? source.sourcePublishedAt.trim()
        : undefined,
      sourceAgeHours: typeof source.sourceAgeHours === "number" && Number.isFinite(source.sourceAgeHours)
        ? source.sourceAgeHours
        : undefined,
      sourceAgeDays: typeof source.sourceAgeDays === "number" && Number.isFinite(source.sourceAgeDays)
        ? source.sourceAgeDays
        : undefined,
      freshnessStatus: typeof source.freshnessStatus === "string" && source.freshnessStatus.trim()
        ? source.freshnessStatus.trim() as WebSource["freshnessStatus"]
        : undefined,
      staleReason: typeof source.staleReason === "string" && source.staleReason.trim()
        ? source.staleReason.trim()
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

const mergeHydratedConversations = (
  hydratedConversations: AiConversation[],
  currentConversations: AiConversation[],
  activeConversationId: string,
): AiConversation[] => {
  const byId = new Map(hydratedConversations.map((conversation) => [conversation.id, conversation]));

  currentConversations.forEach((conversation) => {
    if (!hasConversationContent(conversation)) return;
    const hydrated = byId.get(conversation.id);
    if (!hydrated || conversation.updatedAt >= hydrated.updatedAt || conversation.messages.length >= hydrated.messages.length) {
      byId.set(conversation.id, conversation);
    }
  });

  return limitConversations(pruneBlankConversations(Array.from(byId.values()), activeConversationId));
};

type ChatHydrationPhase = "shell" | "metadata-ready" | "viewport-ready" | "hydrated";

type DeferredHydrationTask = {
  cancel: () => void;
};

const scheduleIdleWork = (callback: () => void): DeferredHydrationTask => {
  let cancelled = false;
  let timeoutId: number | null = null;
  let idleId: number | null = null;

  const run = () => {
    if (!cancelled) callback();
  };

  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleWindow.requestIdleCallback === "function") {
    idleId = idleWindow.requestIdleCallback(run, { timeout: 120 });
  } else {
    timeoutId = window.setTimeout(run, 0);
  }

  return {
    cancel: () => {
      cancelled = true;
      if (idleId !== null && typeof idleWindow.cancelIdleCallback === "function") idleWindow.cancelIdleCallback(idleId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    },
  };
};

const hydrateConversationStateInChunks = ({
  fallback,
  onPhase,
  onHydrated,
}: {
  fallback: AiConversation;
  onPhase: (phase: ChatHydrationPhase) => void;
  onHydrated: (state: AiConversationStorage) => void;
}): DeferredHydrationTask => {
  let cancelled = false;
  let task: DeferredHydrationTask | null = null;
  let parsedConversations: unknown[] = [];
  let parsedActiveConversationId: unknown;
  const conversations: AiConversation[] = [];
  let cursor = 0;

  const schedule = (callback: () => void) => {
    task = scheduleIdleWork(callback);
  };

  const finish = () => {
    if (cancelled) return;
    const limited = limitConversations(conversations);
    const available = limited.length > 0 ? limited : [fallback];
    const activeConversationId =
      typeof parsedActiveConversationId === "string" &&
      available.some((conversation) => conversation.id === parsedActiveConversationId)
        ? parsedActiveConversationId
        : available[0].id;
    const pruned = limitConversations(pruneBlankConversations(available, activeConversationId));
    onPhase("hydrated");
    onHydrated({
      conversations: pruned,
      activeConversationId: pruned.some((conversation) => conversation.id === activeConversationId)
        ? activeConversationId
        : pruned[0].id,
    });
  };

  const processChunk = () => {
    if (cancelled) return;
    if (AI_SIDEBAR_PERF_DEBUG) {
      incrementNoteXAiPerfCounter("conversationsSanitize");
    }
    const startedAt = performance.now();
    while (cursor < parsedConversations.length && performance.now() - startedAt < AI_HYDRATION_CHUNK_BUDGET_MS) {
      const conversation = sanitizeConversation(parsedConversations[cursor]);
      if (conversation) conversations.push(conversation);
      cursor += 1;
    }
    onPhase(cursor === 0 ? "metadata-ready" : "viewport-ready");
    if (cursor < parsedConversations.length) {
      schedule(processChunk);
      return;
    }
    finish();
  };

  schedule(() => {
    if (cancelled) return;
    try {
      if (AI_SIDEBAR_PERF_DEBUG) {
        incrementNoteXAiPerfCounter("conversationsLocalStorageRead");
      }
      const raw = window.localStorage.getItem(AI_CONVERSATIONS_STORAGE_KEY);
      if (!raw) {
        onPhase("hydrated");
        onHydrated({ conversations: [fallback], activeConversationId: fallback.id });
        return;
      }
      if (AI_SIDEBAR_PERF_DEBUG) {
        incrementNoteXAiPerfCounter("conversationsJsonParse");
      }
      const parsed = JSON.parse(raw) as Partial<AiConversationStorage>;
      parsedConversations = Array.isArray(parsed.conversations) ? parsed.conversations : [];
      parsedActiveConversationId = parsed.activeConversationId;
      onPhase("metadata-ready");
      schedule(processChunk);
    } catch (error) {
      console.warn("Load AI conversations failed:", error);
      onPhase("hydrated");
      onHydrated({ conversations: [fallback], activeConversationId: fallback.id });
    }
  });

  return {
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
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

const mapOutsideInlineCode = (segment: string, transformOutside: (outside: string) => string): string => {
  let output = "";
  let cursor = 0;

  while (cursor < segment.length) {
    const markerStart = segment.indexOf("`", cursor);
    if (markerStart === -1) {
      output += transformOutside(segment.slice(cursor));
      break;
    }

    output += transformOutside(segment.slice(cursor, markerStart));
    let markerEnd = markerStart + 1;
    while (segment[markerEnd] === "`") markerEnd += 1;
    const marker = segment.slice(markerStart, markerEnd);
    const closingStart = segment.indexOf(marker, markerEnd);
    if (closingStart === -1) {
      output += segment.slice(markerStart);
      break;
    }

    const closingEnd = closingStart + marker.length;
    output += segment.slice(markerStart, closingEnd);
    cursor = closingEnd;
  }

  return output;
};

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
  return mapOutsideInlineCode(segment, (outsideInlineCode) =>
    mapOutsideDollarMath(normalizeEscapedMathDelimiters(outsideInlineCode), (outsideDollarMath) =>
      normalizeBareParenMath(normalizeStandaloneBracketDisplayMath(outsideDollarMath)),
    ),
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

const isEscapedAt = (value: string, index: number): boolean => {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
};

const escapeLastUnclosedDollarDelimiter = (segment: string): string => {
  const openDelimiters: Array<{ index: number; length: number }> = [];

  for (let cursor = 0; cursor < segment.length;) {
    if (segment[cursor] === "`") {
      let markerEnd = cursor + 1;
      while (segment[markerEnd] === "`") markerEnd += 1;
      const marker = segment.slice(cursor, markerEnd);
      const closingStart = segment.indexOf(marker, markerEnd);
      if (closingStart === -1) break;
      cursor = closingStart + marker.length;
      continue;
    }

    if (segment[cursor] !== "$" || isEscapedAt(segment, cursor)) {
      cursor += 1;
      continue;
    }

    const length = segment[cursor + 1] === "$" && !isEscapedAt(segment, cursor + 1) ? 2 : 1;
    const current = openDelimiters[openDelimiters.length - 1];
    if (current?.length === length) {
      openDelimiters.pop();
    } else {
      openDelimiters.push({ index: cursor, length });
    }
    cursor += length;
  }

  const unclosed = openDelimiters[openDelimiters.length - 1];
  if (!unclosed) return segment;
  const escaped = unclosed.length === 2 ? "\\$\\$" : "\\$";
  return `${segment.slice(0, unclosed.index)}${escaped}${segment.slice(unclosed.index + unclosed.length)}`;
};

const escapeStreamingUnclosedMathDelimiter = (markdown: string): string =>
  splitMarkdownByFencedCode(markdown)
    .map((chunk) => (chunk.isCode ? chunk.text : escapeLastUnclosedDollarDelimiter(chunk.text)))
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
  if (citation.excerptStatus === "fetched" && (citation.excerptQuality === "partial" || citation.excerptQuality === "medium")) return "已读取部分正文";
  if (citation.excerptStatus === "fetched") return "已读取正文";
  if (citation.excerptQuality === "blocked" || citation.excerptStatus === "unavailable") return "正文不可用";
  if (citation.excerptStatus === "failed") return "读取失败";
  return "已作为来源使用";
};

const getCitationSourceTypeLabel = (citation: WebSourceCitation): string => {
  if (citation.sourceKind === "explicit_url") return "用户提供的网页";
  if (citation.sourceKind === "docs_page") return "官方文档";
  if (citation.sourceKind === "official_news" || citation.sourceType === "official") return "官方来源";
  if (citation.sourceKind === "official_blog" || citation.sourceType === "blog") return "博客";
  if (citation.sourceKind === "rss_item" || citation.sourceKind === "media_article") return "新闻";
  return "网页";
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
  messageId,
  markdown,
  citations,
  localNoteSources,
  isStreaming = false,
  onCitationClick,
}: {
  messageId: string;
  markdown: string;
  citations?: WebSourceCitation[];
  localNoteSources?: LocalNoteSearchResult[];
  isStreaming?: boolean;
  onCitationClick?: (citationId: string) => void;
}) {
  const [renderedHtml, setRenderedHtml] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const normalizedMarkdown = useMemo(
    () => normalizeAiMathDelimiters(isStreaming ? escapeStreamingUnclosedMathDelimiter(markdown) : markdown),
    [isStreaming, markdown],
  );
  const citationSignature = useMemo(() => [
    ...(citations ?? []).map((citation) => `${citation.citationId}:${citation.id}:${citation.url ?? ""}`),
    ...(localNoteSources ?? []).map((source) => `${source.localCitationId ?? ""}:${source.id}:${source.relativePath}`),
  ].join("|"), [citations, localNoteSources]);
  const citationMap = useMemo(
    () => getAiCitationDisplayMap(markdown, citations ?? [], localNoteSources),
    [citations, localNoteSources, markdown],
  );

  useEffect(() => {
    let cancelled = false;
    const theme = getTheme();
    const cacheKey = getMarkdownRenderCacheKey({
      messageId,
      content: normalizedMarkdown,
      theme,
      citationSignature,
    });
    if (isStreaming) {
      setRenderedHtml("");
      return () => {
        cancelled = true;
      };
    }

    const cachedHtml = readMarkdownRenderCache(cacheKey);
    if (cachedHtml !== null) {
      setRenderedHtml(cachedHtml);
      return () => {
        cancelled = true;
      };
    }

    const render = () => {
      renderMarkdownForTheme(normalizedMarkdown, theme)
        .then((html) => {
          if (cancelled) return;
          const decoratedHtml = decorateAiCitationMarkers(decorateAiCodeBlocks(html), citationMap);
          writeMarkdownRenderCache(cacheKey, decoratedHtml);
          setRenderedHtml(decoratedHtml);
        })
        .catch((error) => {
          console.warn("Render AI markdown message failed:", error);
          if (!cancelled) setRenderedHtml("");
        });
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [citationMap, citationSignature, isStreaming, messageId, normalizedMarkdown]);

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
    return <div data-ai-markdown-message="true" className="notex-assistant-markdown whitespace-pre-wrap break-words">{markdown}</div>;
  }

  return (
    <div
      ref={containerRef}
      data-ai-markdown-message="true"
      className={cn(
        "notex-assistant-markdown ai-message-preview min-w-0 max-w-full overflow-hidden break-words text-foreground",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:font-semibold",
        "[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:font-semibold",
        "[&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:font-semibold",
        "[&_p]:mb-2",
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

const WEB_SOURCE_CITATION_LIMIT = 8;

type WebSourceCitation = {
  id: string;
  citationId: string;
  title: string;
  url?: string;
  site?: string;
  reliabilityLabel?: string;
  sourceType?: WebSource["sourceType"];
  sourceKind?: WebSource["sourceKind"];
  excerptStatus?: WebSource["excerptStatus"];
  excerptQuality?: WebSource["excerptQuality"];
  isConstructed?: boolean;
};

type DisplayedSourceCitation = WebSourceCitation & {
  displayNumber: number;
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

const getReliabilityLabel = (source: WebSource): string => source.reliabilityLabel || (
  source.reliability === "official" ? "官方" :
  source.reliability === "wiki" ? "知识库" :
  source.reliability === "community_solution" ? "社区题解" :
  source.reliability === "discussion" ? "讨论" :
  source.reliability === "blog" ? "博客" :
  "未知"
);

const isValidCitationId = (citationId: string | undefined): citationId is string =>
  typeof citationId === "string" && /^S\d{1,2}$/.test(citationId);

const isValidLocalCitationId = (citationId: string | undefined): citationId is string =>
  typeof citationId === "string" && /^N\d{1,2}$/.test(citationId);

const getPromptCitationCandidates = (sources: WebSource[]): WebSource[] => {
  const evidenceSources = sources.filter((source) =>
    source.usableEvidence === true &&
    source.evidenceStatus === "usable" &&
    source.injectedIntoAnswer !== false &&
    source.finalIncludedInPrompt !== false,
  );
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
      sourceType: source.sourceType,
      sourceKind: source.sourceKind,
      excerptStatus: source.excerptStatus,
      excerptQuality: source.excerptQuality,
      isConstructed: source.isConstructed,
    }));

const getSearchModeForDisplay = (decision?: SearchDecision): string =>
  decision?.searchModeDecision?.mode ?? decision?.searchMode ?? (
    decision?.vertical === "news" ? "news_recent" :
      decision?.vertical === "docs" ? "docs_technical" :
        decision?.vertical === "oi" || decision?.vertical === "algorithm" ? "oi_algorithm" :
          decision?.vertical === "explicit_url" ? "explicit_url" :
            decision?.intent === "no_search" ? "no_search" : "general_web"
  );

const getUserFacingSearchError = (message: string | undefined, decision?: SearchDecision): string => {
  const text = message?.trim() ?? "";
  const mode = getSearchModeForDisplay(decision);
  if (mode === "no_search") return "";
  if (mode === "news_recent") {
    return "当前没有读取到足够可靠的近期新闻来源，因此不能可靠总结最新动态。";
  }
  if (mode === "explicit_url") {
    if (/needs_js|browser|render|渲染/i.test(text)) return "这个页面可能需要浏览器渲染，当前无法读取正文。";
    if (/blocked|403|401|auth|授权|限制|拦截/i.test(text)) return "这个页面暂时无法公开读取。";
    return "找到了这个页面，但没有成功读取到可引用的正文。";
  }
  if (/needs_js|render|渲染/i.test(text)) return "这个页面可能需要浏览器渲染，当前无法读取正文。";
  if (/blocked|403|401|auth|授权|限制|拦截/i.test(text)) return "这个页面暂时无法公开读取。";
  if (/候选|正文|usable|evidence|not_fetched|too_short|snippet_only|title_only/i.test(text)) {
    return "找到了相关页面，但没有成功读取到可引用的正文。";
  }
  if (mode === "docs_technical") return "没有找到足够可靠的公开资料。";
  if (mode === "general_web") return "没有找到可引用的公开资料。";
  return text || "没有找到可引用来源。";
};

const getWebSearchStageText = (
  status?: AiChatMessage["webSearchStatus"],
  fallback?: string,
  decision?: SearchDecision,
): string => {
  const mode = getSearchModeForDisplay(decision);
  if (mode === "no_search") return "";
  if (status === "failed") return getUserFacingSearchError(fallback, decision);
  if (status === "planning" || status === "searching") {
    if (mode === "news_recent") return "正在检索近期公开新闻...";
    if (mode === "explicit_url") return "正在读取你提供的网页...";
    if (mode === "docs_technical") return "正在查找官方文档或可靠资料...";
    if (mode === "oi_algorithm" || mode === "local_first") return "正在查找相关本地笔记和资料...";
    return "正在查找公开资料...";
  }
  if (status === "filtering") return "正在整理可引用来源...";
  if (status === "fetching_excerpts") {
    if (mode === "news_recent") return "正在读取新闻正文...";
    if (mode === "explicit_url") return "正在读取你提供的网页...";
    if (mode === "docs_technical") return "正在读取相关文档...";
    return "正在读取网页正文...";
  }
  if (status === "answering") return "正在基于已读来源生成回答...";
  return "";
};

function WebSearchProgressCard({ status, text, decision }: { status?: AiChatMessage["webSearchStatus"]; text?: string; decision?: SearchDecision }) {
  const stageText = getWebSearchStageText(status, text, decision);
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
  if (provider === "bing") return "Bing 公开搜索暂时不可用；Research Engine 主线会优先维护无 key 公共搜索 provider。";
  return provider === "bocha"
    ? "当前 API provider 缺少 Bocha API Key；但主线将优先维护无 key 公共搜索 provider。"
    : "当前 API provider 缺少 Brave Search API Key；但主线将优先维护无 key 公共搜索 provider。";
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

const shouldStopResearchEngineWithoutSources = (
  sources: WebSource[] | undefined,
  searchError?: string,
  searchDebug?: string,
): boolean => {
  if (!searchDebug?.includes("debug=researchEnginePhase17")) return false;
  const usableSources = getPromptCitationCandidates(sources ?? []);
  return Boolean(searchError) && usableSources.length === 0;
};

const getResearchEngineNoSourceMessage = (searchError?: string): string =>
  searchError?.trim().startsWith("Research Engine 搜索失败")
    ? searchError.trim()
    : [
      "Research Engine 搜索失败",
      "",
      "当前处于开发者模式，联网搜索已由 Research Engine 接管。",
      searchError?.trim() ? `失败原因：${searchError.trim()}` : "失败原因：没有可用证据。",
      "",
      "旧 NoteX 搜索不会自动回退。关闭开发者模式后可使用旧搜索链路。",
    ].join("\n");

const buildWebContextDecision = (
  question: string,
  context: NoteChatContextPayload,
  requestWebSearchEnabled: boolean,
  explicitPlan: ExplicitUrlReadPlan,
): SearchDecision => {
  if (!requestWebSearchEnabled) {
    return explicitPlan.shouldRead || explicitPlan.blockedUrls.length > 0
      ? {
        ...buildSearchDecision(question, context),
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
          const meta = Array.from(new Set([citation.site, getCitationSourceTypeLabel(citation)].filter(Boolean)));
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
  onToggleTag,
  onSelectAll,
}: {
  suggestion: TagSuggestionResult;
  isApplying: boolean;
  onApply: () => void;
  onIgnore: () => void;
  onToggleTag: (tag: string) => void;
  onSelectAll: () => void;
}) {
  const hasSuggestions = suggestion.suggestedTags.length > 0;
  const selectedTags = suggestion.selectedTags ?? suggestion.suggestedTags;
  const selectedSet = new Set(selectedTags);
  const hasSelectedSuggestions = selectedTags.length > 0;
  const detailedSuggestions: AiTagRecommendation[] = (suggestion.suggestions?.length
    ? suggestion.suggestions
    : suggestion.suggestedTags.map((tag) => ({
      tag,
      confidence: 0.6,
      reason: "",
      evidence: "",
    }))).filter((item) => suggestion.suggestedTags.includes(item.tag));
  const statusText = suggestion.applied
    ? "已应用"
    : suggestion.ignored
      ? "已忽略"
      : suggestion.error;

  const renderTags = (tags: string[], emptyText: string) => (
    tags.length > 0 ? (
      <div className="notex-tag-chip-list flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="notex-tag-chip rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] leading-5 text-foreground dark:bg-white/[0.04]"
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
    <div className="notex-tag-output grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="notex-tag-output-header flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="notex-tag-output-title text-sm font-medium leading-5 text-foreground">建议标签预览</div>
          <div className="notex-tag-output-path truncate text-[11px] leading-4 text-muted-foreground" title={suggestion.notePath}>
            {getCompactPath(suggestion.notePath)}
          </div>
        </div>
        {statusText && (
          <span className={cn(
            "notex-tag-output-status shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-5",
            suggestion.error
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "bg-muted text-muted-foreground dark:bg-white/[0.08]",
          )}>
            {statusText}
          </span>
        )}
      </div>

      <div className="notex-tag-output-section grid gap-1.5">
        <div className="notex-tag-output-label text-[11px] font-medium leading-4 text-muted-foreground">当前已有 tags</div>
        {renderTags(suggestion.existingTags, "当前没有已有标签")}
      </div>

      <div className="notex-tag-output-section grid gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="notex-tag-output-label text-[11px] font-medium leading-4 text-muted-foreground">建议新增 tags</div>
          {hasSuggestions && !suggestion.applied && !suggestion.ignored && (
            <button
              type="button"
              className="notex-tag-link text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-55"
              onClick={onSelectAll}
              disabled={isApplying}
            >
              全选
            </button>
          )}
        </div>
        {hasSuggestions ? (
          <div className="notex-tag-candidate-list grid gap-1.5">
            {detailedSuggestions.map((item) => (
              <label key={item.tag} className="notex-tag-candidate flex min-w-0 items-start gap-2 rounded-md border border-border/50 bg-background/55 px-2.5 py-2 dark:bg-black/10">
                <input
                  type="checkbox"
                  className="notex-tag-checkbox mt-1"
                  checked={selectedSet.has(item.tag)}
                  disabled={isApplying || suggestion.applied || suggestion.ignored}
                  onChange={() => onToggleTag(item.tag)}
                />
                <span className="notex-tag-candidate-body grid min-w-0 gap-1">
                  <span className="notex-tag-candidate-name font-medium leading-5 text-foreground">
                    {item.tag}
                    <span className="notex-tag-confidence ml-2 text-[11px] font-normal text-muted-foreground">
                      {Math.round(item.confidence * 100)}%
                    </span>
                  </span>
                  {(item.reason || item.evidence || item.normalizedFrom) && (
                    <span className="notex-tag-candidate-reason text-[11px] leading-5 text-muted-foreground">
                      {item.reason || "匹配当前笔记内容和候选标签。"}
                      {item.evidence ? `；${item.evidence}` : ""}
                      {item.normalizedFrom ? `；已规范化自 ${item.normalizedFrom}` : ""}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {suggestion.ignoredCount ? (
              <div className="text-[11px] leading-5 text-muted-foreground">
                已忽略 {suggestion.ignoredCount} 个不合法或重复的模型输出。
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-xs leading-5 text-muted-foreground">没有发现需要新增的标签</div>
        )}
      </div>

      {suggestion.reason && (
        <div className="notex-tag-output-reason rounded-md bg-background/65 px-2.5 py-2 text-xs leading-5 text-muted-foreground dark:bg-black/10">
          {suggestion.reason}
        </div>
      )}

      {!suggestion.applied && !suggestion.ignored && (
        <div className="notex-tag-actions flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="notex-tag-action-secondary inline-flex h-7 items-center rounded-md border border-border/70 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-55"
            onClick={onIgnore}
            disabled={isApplying}
          >
            取消 / 忽略
          </button>
          <button
            type="button"
            className="notex-tag-action-primary inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-55"
            onClick={onApply}
            disabled={!hasSuggestions || !hasSelectedSuggestions || isApplying}
          >
            {isApplying ? "应用中..." : "应用所选"}
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
    <div
      className={cn(
        "notex-polish-preview-card overflow-hidden rounded-md border border-border/70 bg-background shadow-sm dark:border-white/10 dark:bg-zinc-950/80",
        preview.previewKind === "solution-format" && "notex-solution-format-preview-card",
      )}
      data-preview-kind={preview.previewKind}
    >
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

        <div className="notex-preview-actions flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="notex-preview-action notex-preview-action-review inline-flex h-7 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background transition-opacity hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-950"
            onClick={onOpenReview}
          >
            审核
          </button>
          <button
            type="button"
            className="notex-preview-action notex-preview-action-apply inline-flex h-7 items-center rounded-md border border-emerald-500/45 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 disabled:pointer-events-none disabled:opacity-50 dark:text-emerald-300"
            onClick={onApply}
            disabled={isApplying || !canApply}
          >
            {isApplying ? "\u5e94\u7528\u4e2d..." : applyLabel}
          </button>
          <button
            type="button"
            className="notex-preview-action notex-preview-action-cancel inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
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
  isResizing = false,
  onResizePointerDown,
  onResizeDoubleClick,
  developerModeEnabled = false,
  onMaximizedChange,
  aiConfig,
  onAiConfigChange,
  onOpenAiSettings,
  tagTaxonomyConfig,
  onApplySuggestedTags,
  onApplyPolishedSelection,
  onApplyPolishedFullNote,
  onOpenPolishReview,
  onPolishReviewChange,
  onOpenLocalNote,
}: AiSidebarProps & {
  isResizing?: boolean;
  onResizePointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeDoubleClick?: () => void;
}) {
  const initialConversationRef = useRef<AiConversation | null>(null);
  if (initialConversationRef.current === null) {
    initialConversationRef.current = {
      ...createEmptyConversation(),
      ...getDefaultConversationModel(aiConfig),
    };
  }

  const [inputUiState, setInputUiState] = useState({
    value: "",
    isEmpty: true,
    isSlash: false,
  });
  const [conversations, setConversations] = useState<AiConversation[]>(
    [initialConversationRef.current],
  );
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversationRef.current.id,
  );
  const [chatHydrationPhase, setChatHydrationPhase] = useState<ChatHydrationPhase>("shell");
  const [isConversationHydrated, setIsConversationHydrated] = useState(false);
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [isCommandPanelDismissed, setIsCommandPanelDismissed] = useState(false);
  const [viewMode, setViewMode] = useState<"chat" | "conversations">("chat");
  const [isAllConversationsOpen, setIsAllConversationsOpen] = useState(false);
  const [showConversationPopoverFade, setShowConversationPopoverFade] = useState(false);
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
  const [isOpenShellSettled, setIsOpenShellSettled] = useState(false);
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const [applyingTagMessageId, setApplyingTagMessageId] = useState<string | null>(null);
  const [applyingPolishMessageId, setApplyingPolishMessageId] = useState<string | null>(null);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingConversationTitle, setEditingConversationTitle] = useState("");
  const [pendingDeleteConversationId, setPendingDeleteConversationId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottomState] = useState(false);
  const [statusPanelOpen, setStatusPanelOpen] = useState(false);
  const [highlightedCitationId, setHighlightedCitationId] = useState<string | null>(null);
  const [highlightedLocalCitationId, setHighlightedLocalCitationId] = useState<string | null>(null);
  const [expandedCitationMessageIds, setExpandedCitationMessageIds] = useState<Record<string, boolean>>({});
  const [expandedLocalNoteMessageIds, setExpandedLocalNoteMessageIds] = useState<Record<string, boolean>>({});
  const [messageCopyFeedback, setMessageCopyFeedback] = useState<{
    messageId: string;
    status: "copied" | "failed";
  } | null>(null);
  const [composerFlowHeight, setComposerFlowHeight] = useState(210);
  const messageSeqRef = useRef(0);
  const requestSeqRef = useRef(0);
  const streamTargetsRef = useRef<Map<string, StreamTarget>>(new Map());
  const streamTextBufferRef = useRef<Map<string, string>>(new Map());
  const streamPendingTextRef = useRef<Map<string, string>>(new Map());
  const streamFlushFrameRef = useRef<Map<string, number>>(new Map());
  const conversationPopoverListRef = useRef<HTMLDivElement | null>(null);
  const activeStreamsRef = useRef<Set<string>>(new Set());
  const webSearchPrepTokensRef = useRef<Map<string, number>>(new Map());
  const hydrationTaskRef = useRef<DeferredHydrationTask | null>(null);
  const hasPersistableConversationStateRef = useRef(false);
  const hasLoadedConversationStateRef = useRef(false);
  const hydrationGenerationRef = useRef(0);
  const conversationMutationVersionRef = useRef(0);
  const conversationPersistTimerRef = useRef<number | null>(null);
  const messageCopyFeedbackTimerRef = useRef<number | null>(null);
  const citationHighlightTimerRef = useRef<number | null>(null);
  const localCitationHighlightTimerRef = useRef<number | null>(null);
  const commandRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const inputDraftRef = useRef("");
  const inputUiStateRef = useRef(inputUiState);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const composerWrapRef = useRef<HTMLDivElement | null>(null);
  const providerPickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const providerPickerMenuRef = useRef<HTMLDivElement | null>(null);
  const modelPickerTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modelPickerMenuRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const userPinnedToBottomRef = useRef(true);
  const pendingMessagesScrollFrameRef = useRef<number | null>(null);
  const pendingResizeScrollStateRef = useRef(false);
  const resizeStartedPinnedToBottomRef = useRef(true);
  const selectedProviderLabelRef = useRef("");
  const selectedModelLabelRef = useRef("");
  const perfDebugRef = useRef({
    renderCount: 0,
    messageListRenderCount: 0,
    resizeObserverCallbackCount: 0,
    composerResizeObserverCallbackCount: 0,
    scrollEventCount: 0,
    setShowScrollToBottomCount: 0,
    scheduleScrollToBottomCount: 0,
    scrollToBottomCount: 0,
    activeConversationChangeCount: 0,
    viewModeChangeCount: 0,
    selectConversationStartAt: 0,
    selectConversationEndAt: 0,
    lastSelectedConversationId: null as string | null,
    lastPrepareStateKey: "",
    mountAt: AI_SIDEBAR_PERF_DEBUG ? performance.now() : 0,
    hydrateStartAt: 0,
  });

  if (AI_SIDEBAR_PERF_DEBUG) {
    perfDebugRef.current.renderCount += 1;
    incrementNoteXAiPerfCounter("aiSidebarRender");
    if (developerModeEnabled) {
      incrementNoteXAiPerfCounter("developerModeEnabled");
      incrementNoteXAiPerfCounter("aiSidebarDeveloperDiagnosticsRender");
    }
  }
  inputUiStateRef.current = inputUiState;

  useEffect(() => {
    if (!AI_SIDEBAR_PERF_DEBUG) return;
    incrementNoteXAiPerfCounter("aiSidebarMount");
    setNoteXAiPerfEvent("aiSidebarMount", {
      at: perfDebugRef.current.mountAt,
      isOpen,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsOpenShellSettled(false);
      return undefined;
    }
    let frameId: number | null = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        setIsOpenShellSettled(true);
      });
    });
    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [isOpen]);
  const setShowScrollToBottom = useCallback((value: boolean | ((current: boolean) => boolean)) => {
    if (AI_SIDEBAR_PERF_DEBUG) {
      perfDebugRef.current.setShowScrollToBottomCount += 1;
      incrementNoteXAiPerfCounter("setShowScrollToBottom");
    }
    setShowScrollToBottomState(value);
  }, []);

  useEffect(() => {
    if (AI_SIDEBAR_PERF_DEBUG && isOpen) {
      incrementNoteXAiPerfCounter("aiSidebarInitialEffectsRun");
    }
    hydrationTaskRef.current?.cancel();
    hydrationTaskRef.current = null;

    if (!isOpen) {
      if (!hasLoadedConversationStateRef.current) {
        setChatHydrationPhase("shell");
        setIsConversationHydrated(false);
        hasPersistableConversationStateRef.current = false;
      }
      return undefined;
    }

    if (hasLoadedConversationStateRef.current) {
      setChatHydrationPhase("hydrated");
      setIsConversationHydrated(true);
      hasPersistableConversationStateRef.current = true;
      return undefined;
    }

    const fallback = initialConversationRef.current ?? createEmptyConversation();
    const hydrationGeneration = hydrationGenerationRef.current + 1;
    const mutationVersionAtStart = conversationMutationVersionRef.current;
    hydrationGenerationRef.current = hydrationGeneration;
    setChatHydrationPhase("shell");
    setIsConversationHydrated(false);
    hasPersistableConversationStateRef.current = false;

    let cancelled = false;
    let frameId: number | null = window.requestAnimationFrame(() => {
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        if (cancelled) return;
        if (AI_SIDEBAR_PERF_DEBUG) {
          perfDebugRef.current.hydrateStartAt = performance.now();
          incrementNoteXAiPerfCounter("aiSidebarHydrateStart");
          setNoteXAiPerfEvent("aiSidebarLastHydrateStart", {
            at: perfDebugRef.current.hydrateStartAt,
            activeConversationId,
          });
        }
        hydrationTaskRef.current = hydrateConversationStateInChunks({
          fallback,
          onPhase: setChatHydrationPhase,
          onHydrated: (state) => {
            if (hydrationGenerationRef.current !== hydrationGeneration) return;
            const shouldPreserveRuntimeConversations = conversationMutationVersionRef.current !== mutationVersionAtStart;
            startTransition(() => {
              if (AI_SIDEBAR_PERF_DEBUG) {
                incrementNoteXAiPerfCounter("conversationsSetState");
              }
              setConversations((current) => (
                shouldPreserveRuntimeConversations
                  ? mergeHydratedConversations(state.conversations, current, activeConversationId)
                  : state.conversations
              ));
              setActiveConversationId((currentActiveConversationId) => (
                shouldPreserveRuntimeConversations && currentActiveConversationId
                  ? currentActiveConversationId
                  : state.activeConversationId
              ));
              hasLoadedConversationStateRef.current = true;
              setIsConversationHydrated(true);
            });
            hasPersistableConversationStateRef.current = true;
            if (AI_SIDEBAR_PERF_DEBUG) {
              const endedAt = performance.now();
              const durationMs = endedAt - perfDebugRef.current.hydrateStartAt;
              incrementNoteXAiPerfCounter("aiSidebarHydrateEnd");
              incrementNoteXAiPerfCounter("aiSidebarHydrateDuration");
              setNoteXAiPerfEvent("aiSidebarLastHydrateSummary", {
                startedAt: perfDebugRef.current.hydrateStartAt,
                endedAt,
                durationMs,
                conversationCount: state.conversations.length,
                activeConversationId: state.activeConversationId,
              });
              console.info("[NoteX Perf] ai sidebar hydrate summary", {
                durationMs,
                conversationCount: state.conversations.length,
                activeConversationId: state.activeConversationId,
              });
            }
          },
        });
      });
    });

    return () => {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      hydrationTaskRef.current?.cancel();
      hydrationTaskRef.current = null;
    };
  }, [isOpen]);

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0];
  const activeConversationMessages = activeConversation?.messages;
  const messages = useMemo(
    () => (activeConversationMessages ?? []).filter((message) => !isLegacyStatusMessage(message)),
    [activeConversationMessages],
  );
  const shouldShowPrepareState =
    !hasLoadedConversationStateRef.current &&
    chatHydrationPhase !== "hydrated" &&
    !activeConversation &&
    !isConversationHydrated &&
    messages.length === 0;
  if (AI_SIDEBAR_PERF_DEBUG && shouldShowPrepareState) {
    const prepareStateKey = [
      activeConversationId,
      chatHydrationPhase,
      String(isConversationHydrated),
      String(Boolean(activeConversation)),
      String(messages.length),
      viewMode,
    ].join("|");
    if (perfDebugRef.current.lastPrepareStateKey !== prepareStateKey) {
      perfDebugRef.current.lastPrepareStateKey = prepareStateKey;
      incrementNoteXAiPerfCounter("prepareHit");
      incrementNoteXAiPerfCounter("aiSidebarPrepareHit");
      const prepareSnapshot = {
        activeConversationId,
        chatHydrationPhase,
        isConversationHydrated,
        currentConversationExists: Boolean(activeConversation),
        currentMessagesLength: messages.length,
        viewMode,
        at: performance.now(),
      };
      setNoteXAiPerfEvent("aiSidebarLastPrepare", prepareSnapshot);
      console.warn("[NoteX Perf] prepare state", prepareSnapshot);
    }
  }
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

  useEffect(() => {
    if (!AI_SIDEBAR_PERF_DEBUG) return;
    perfDebugRef.current.activeConversationChangeCount += 1;
    incrementNoteXAiPerfCounter("activeConversationChange");
    setNoteXAiPerfEvent("aiSidebarLastActiveConversationChange", {
      activeConversationId,
      currentConversationExists: Boolean(activeConversation),
      currentMessagesLength: messages.length,
      isConversationHydrated,
      chatHydrationPhase,
      viewMode,
      at: performance.now(),
    });
  }, [activeConversation, activeConversationId, chatHydrationPhase, isConversationHydrated, messages.length, viewMode]);

  useEffect(() => {
    if (!AI_SIDEBAR_PERF_DEBUG) return;
    perfDebugRef.current.viewModeChangeCount += 1;
    incrementNoteXAiPerfCounter("viewModeChange");
    setNoteXAiPerfEvent("aiSidebarLastViewModeChange", {
      activeConversationId,
      viewMode,
      at: performance.now(),
    });
  }, [activeConversationId, viewMode]);

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

  const resizeComposerInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    const nextHeight = Math.min(
      Math.max(input.scrollHeight, COMPOSER_TEXTAREA_MIN_HEIGHT),
      COMPOSER_TEXTAREA_MAX_HEIGHT,
    );
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > COMPOSER_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
  }, []);

  const clearComposerInput = useCallback(() => {
    inputDraftRef.current = "";
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    const nextState = { value: "", isEmpty: true, isSlash: false };
    if (
      inputUiStateRef.current.value !== nextState.value ||
      inputUiStateRef.current.isEmpty !== nextState.isEmpty ||
      inputUiStateRef.current.isSlash !== nextState.isSlash
    ) {
      inputUiStateRef.current = nextState;
      setInputUiState(nextState);
    }
    resizeComposerInput();
  }, [resizeComposerInput]);

  const syncComposerInputState = useCallback((nextValue: string) => {
    if (AI_SIDEBAR_PERF_DEBUG) {
      incrementNoteXAiPerfCounter("composerInputChange");
    }
    inputDraftRef.current = nextValue;
    const nextIsEmpty = nextValue.trim().length === 0;
    const nextIsSlash = nextValue.startsWith("/");
    const nextState = {
      value: nextIsSlash ? nextValue : "",
      isEmpty: nextIsEmpty,
      isSlash: nextIsSlash,
    };
    if (
      inputUiStateRef.current.value !== nextState.value ||
      inputUiStateRef.current.isEmpty !== nextState.isEmpty ||
      inputUiStateRef.current.isSlash !== nextState.isSlash
    ) {
      inputUiStateRef.current = nextState;
      if (AI_SIDEBAR_PERF_DEBUG) {
        incrementNoteXAiPerfCounter("parentInputStateCommit");
      }
      setInputUiState(nextState);
    }
    resizeComposerInput();
  }, [resizeComposerInput]);

  const commandQuery = inputUiState.isSlash ? inputUiState.value.slice(1).trim() : "";
  const visibleCommands = useMemo(() => {
    if (!inputUiState.isSlash) return [];
    if (!commandQuery) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((command) =>
      `${command.label} ${command.description} ${command.category}`.toLocaleLowerCase().includes(commandQuery.toLocaleLowerCase()),
    );
  }, [commandQuery, inputUiState.isSlash]);
  const isCommandPanelOpen = inputUiState.isSlash && !isCommandPanelDismissed;
  const groupedVisibleCommands = COMMAND_CATEGORIES.map((category) => ({
    category,
    commands: visibleCommands.filter((command) => command.category === category),
  })).filter((group) => group.commands.length > 0);

  useEffect(() => {
    if (!isProviderPickerOpen && !isModelPickerOpen) return;

    const dropdownRefs = [
      providerPickerTriggerRef,
      providerPickerMenuRef,
      modelPickerTriggerRef,
      modelPickerMenuRef,
    ];
    const closeDropdowns = () => {
      setIsProviderPickerOpen(false);
      setIsModelPickerOpen(false);
    };

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const isInsideDropdown = dropdownRefs.some((ref) => ref.current?.contains(target));
      if (isInsideDropdown) return;
      closeDropdowns();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeDropdowns();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isProviderPickerOpen, isModelPickerOpen]);

  useEffect(() => {
    resizeComposerInput();
  }, [resizeComposerInput]);

  useEffect(() => {
    if (!activeConversation) {
      const nextConversation = {
        ...createEmptyConversation(),
        ...getDefaultConversationModel(aiConfig),
      };
      conversationMutationVersionRef.current += 1;
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
    if (!hasPersistableConversationStateRef.current) return undefined;

    if (conversationPersistTimerRef.current !== null) {
      window.clearTimeout(conversationPersistTimerRef.current);
    }

    conversationPersistTimerRef.current = window.setTimeout(() => {
      conversationPersistTimerRef.current = null;
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
    }, AI_CONVERSATION_PERSIST_DEBOUNCE_MS);

    return () => {
      if (conversationPersistTimerRef.current === null) return;
      window.clearTimeout(conversationPersistTimerRef.current);
      conversationPersistTimerRef.current = null;
    };
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
    if (!isOpen) return undefined;
    const element = composerWrapRef.current;
    if (!element) return undefined;

    let frameId: number | null = null;
    const measureComposer = () => {
      frameId = null;
      if (AI_SIDEBAR_PERF_DEBUG) {
        perfDebugRef.current.composerResizeObserverCallbackCount += 1;
        incrementNoteXAiPerfCounter("composerResizeObserver");
      }
      if (isResizing) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const nextHeight = Math.ceil(rect.height);
      if (Number.isFinite(nextHeight) && nextHeight > 0) {
        setComposerFlowHeight((current) => (Math.abs(current - nextHeight) <= 1 ? current : nextHeight));
      }
    };
    const scheduleMeasure = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(measureComposer);
    };

    scheduleMeasure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [isOpen, isResizing]);

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
    if (isResizing) return;
    if (AI_SIDEBAR_PERF_DEBUG) {
      perfDebugRef.current.scrollToBottomCount += 1;
      incrementNoteXAiPerfCounter("scrollToBottom");
    }
    element.scrollTo({ top: element.scrollHeight, behavior });
    setShowScrollToBottom(false);
  };

  const cancelScheduledMessagesScroll = () => {
    if (pendingMessagesScrollFrameRef.current === null) return;
    window.cancelAnimationFrame(pendingMessagesScrollFrameRef.current);
    pendingMessagesScrollFrameRef.current = null;
  };

  const scheduleMessagesScrollToBottom = () => {
    if (isResizing) {
      pendingResizeScrollStateRef.current = true;
      return;
    }
    if (!userPinnedToBottomRef.current || pendingMessagesScrollFrameRef.current !== null) return;
    if (AI_SIDEBAR_PERF_DEBUG) {
      perfDebugRef.current.scheduleScrollToBottomCount += 1;
      incrementNoteXAiPerfCounter("scheduleScrollToBottom");
    }
    pendingMessagesScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingMessagesScrollFrameRef.current = null;
      if (userPinnedToBottomRef.current) {
        scrollMessagesToBottom("auto");
      }
    });
  };

  const handleMessagesScroll = () => {
    if (AI_SIDEBAR_PERF_DEBUG) {
      perfDebugRef.current.scrollEventCount += 1;
      incrementNoteXAiPerfCounter("scrollEvent");
    }
    if (isResizing) {
      pendingResizeScrollStateRef.current = true;
      return;
    }
    const isNearBottom = isMessagesNearBottom();
    isAtBottomRef.current = isNearBottom;
    userPinnedToBottomRef.current = isNearBottom;
    if (!isNearBottom) {
      cancelScheduledMessagesScroll();
    }
    setShowScrollToBottom(!isNearBottom);
  };

  const closeSidebar = useCallback(() => {
    onMaximizedChange?.(false);
    onClose();
  }, [onClose, onMaximizedChange]);

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
    if (developerModeEnabled) {
      try {
        setStatus("searching", "Research Engine is running Developer Mode web search...");
        const result = await runResearchEngineRealShadowRun({
          query: options?.userInput ?? decision.rawQuestion ?? decision.queries[0] ?? "",
          webSearchConfig,
          maxCandidates: 8,
          readTopN: 2,
          providerTimeoutMs: 8000,
          readerTimeoutMs: 10000,
        });
        if (!isCurrent()) return {};
        const sources = mapResearchEngineShadowRunToSources(result);
        const searchDebug = mergeSearchDebug(formatSearchPreparationDiagnostics(preparationDiagnostics), formatResearchEngineSearchDebug(result));
        const hasUsableResearchEngineSources = getPromptCitationCandidates(sources ?? []).length > 0;
        const error = getResearchEngineFailureMessage(result) ?? (
          hasUsableResearchEngineSources ? undefined : "Research Engine search did not produce usable excerpt evidence."
        );
        setStatus(error ? "failed" : "answering", error ?? "Research Engine evidence is ready; generating answer...");
        return {
          sources,
          error,
          searchDebug,
          filteredCount: Math.max(0, result.selectedCandidates.length - result.readAttempts.length),
          filterReason: result.warnings.length > 0 ? result.warnings.slice(0, 3).join("; ") : undefined,
          decision,
        };
      } catch (error) {
        if (!isCurrent()) return {};
        const message = error instanceof Error ? error.message : String(error);
        const searchDebug = mergeSearchDebug(
          formatSearchPreparationDiagnostics(preparationDiagnostics),
          [
            "debug=researchEnginePhase17",
            "engine=research_engine",
            "phase=17",
            "forcedTakeover=yes",
            "legacySearchExecuted=no",
            "fallback=no",
            "developerModeOnly=yes",
            `provider=${encodeDebugValue(activeWebSearchProvider)}`,
            `providerLabel=${encodeDebugValue(getResearchEngineProviderLabel(activeWebSearchProvider))}`,
            `exception=${encodeDebugValue(message)}`,
          ].join("; "),
        );
        const errorMessage = buildResearchEngineTakeoverFailureText(`运行失败：${message}`, activeWebSearchProvider);
        setStatus("failed", errorMessage);
        return {
          error: errorMessage,
          searchDebug,
          decision,
        };
      }
    }
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
      const freshnessPolicy = newsRoundup ? getNewsFreshnessPolicy(options?.userInput || activeDecision.rawQuestion || "") : undefined;
      const staleSources = rankedSources.filter((source) => source.freshnessStatus === "stale");
      const undatedSources = rankedSources.filter((source) => source.freshnessStatus === "undated");
      const freshSources = rankedSources.filter((source) => source.freshnessStatus && source.freshnessStatus !== "stale" && source.freshnessStatus !== "undated");
      const freshUsableSources = rankedSources.filter((source) =>
        source.usableEvidence === true &&
        source.evidenceStatus === "usable" &&
        source.injectedIntoAnswer === true &&
        source.freshnessStatus &&
        source.freshnessStatus !== "stale" &&
        source.freshnessStatus !== "undated",
      );
      const oldestIncludedPublishedAt = freshUsableSources
        .map((source) => source.sourcePublishedAt)
        .filter((value): value is string => Boolean(value))
        .sort()[0];
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
          `vertical=${activeDecision.vertical ?? activeDecision.aiPlanner?.vertical ?? "none"}`,
          `queries=${encodeDebugValue(activeDecision.queries.join(" / ") || "none")}`,
          `selectedNewsSources=${encodeDebugValue(selectedRoundupSources.map((source) => source.site ?? source.url).join(" / ") || "none")}`,
          `candidateCount=${sourcesWithExcerpts.length}`,
          `freshCandidateCount=${freshSources.length}`,
          `filteredOldNewsCount=${staleSources.filter((source) => source.injectedIntoAnswer === false || source.finalIncludedInPrompt === false).length}`,
          `evidenceSourceCount=${freshUsableSources.length}`,
          `newsReadAttempts=${excerptResults.length}`,
          `newsReadSuccesses=${excerptResults.filter((result) => result.fetched).length}`,
          `usableEvidenceCount=${rankedSources.filter((source) => source.usableEvidence === true && source.evidenceStatus === "usable").length}`,
          `rejectedCount=${rankedSources.filter((source) => source.evidenceStatus === "rejected").length}`,
          `excerptChars=${excerptResults.reduce((sum, result) => sum + (result.excerpt?.length ?? 0), 0)}`,
          `contentStatusMix=${encodeDebugValue(summarizeCounts(rankedSources.map((source) => source.contentStatus)))}`,
          `excerptQualityMix=${encodeDebugValue(summarizeCounts(rankedSources.map((source) => source.excerptQuality)))}`,
          freshnessPolicy ? `currentDate=${freshnessPolicy.currentDate}` : undefined,
          freshnessPolicy ? `newsFreshnessPolicy=${freshnessPolicy.requestedFreshness}` : undefined,
          freshnessPolicy ? `strictWindowHours=${freshnessPolicy.strictWindowHours}` : undefined,
          freshnessPolicy ? `fallbackWindowDays=${freshnessPolicy.fallbackWindowDays}` : undefined,
          freshnessPolicy ? `maxNewsAgeDays=${freshnessPolicy.maxNewsAgeDays}` : undefined,
          freshnessPolicy ? `freshnessWindowLabel=${encodeDebugValue(freshnessPolicy.freshnessWindowLabel)}` : undefined,
          "freshnessFilterApplied=yes",
          `freshSourceCount=${freshSources.length}`,
          `staleSourceCount=${staleSources.length}`,
          `undatedSourceCount=${undatedSources.length}`,
          `staleRejectedCount=${staleSources.filter((source) => source.injectedIntoAnswer === false || source.finalIncludedInPrompt === false).length}`,
          `freshUsableEvidenceCount=${freshUsableSources.length}`,
          `oldestIncludedPublishedAt=${oldestIncludedPublishedAt ?? "none"}`,
          `staleRejectedSamples=${encodeDebugValue(staleSources.slice(0, 4).map((source) => `${source.title}:${source.sourcePublishedAt ?? source.dateHint ?? "unknown"}`).join(" | ") || "none")}`,
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
    conversationMutationVersionRef.current += 1;
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

  const clearStreamFlushFrame = (streamId: string) => {
    const frameId = streamFlushFrameRef.current.get(streamId);
    if (frameId === undefined) return;
    window.cancelAnimationFrame(frameId);
    streamFlushFrameRef.current.delete(streamId);
  };

  const appendStreamText = (streamId: string, chunk: string) => {
    const target = streamTargetsRef.current.get(streamId);
    if (!target || !chunk) return;
    replaceMessage(target.conversationId, target.messageId, (message) => ({
      ...message,
      text: message.state === "streaming" ? `${message.text}${chunk}` : message.text,
    }));
  };

  const flushQueuedStreamText = (streamId: string) => {
    streamFlushFrameRef.current.delete(streamId);
    if (!streamTargetsRef.current.has(streamId)) return;
    const pendingText = streamPendingTextRef.current.get(streamId) ?? "";
    if (!pendingText) return;
    streamPendingTextRef.current.delete(streamId);
    appendStreamText(streamId, pendingText);
  };

  const scheduleStreamTextFlush = (streamId: string) => {
    if (streamFlushFrameRef.current.has(streamId)) return;
    const frameId = window.requestAnimationFrame(() => flushQueuedStreamText(streamId));
    streamFlushFrameRef.current.set(streamId, frameId);
  };

  const queueStreamRevealText = (streamId: string, delta: string) => {
    if (!streamTargetsRef.current.has(streamId) || !delta) return;
    streamPendingTextRef.current.set(streamId, `${streamPendingTextRef.current.get(streamId) ?? ""}${delta}`);
    scheduleStreamTextFlush(streamId);
  };

  const flushStreamRevealText = (streamId: string) => {
    clearStreamFlushFrame(streamId);
    flushQueuedStreamText(streamId);
  };

  const initializeStreamRevealState = (streamId: string) => {
    clearStreamFlushFrame(streamId);
    streamPendingTextRef.current.set(streamId, "");
  };

  const clearStreamRuntime = (streamId: string) => {
    clearStreamFlushFrame(streamId);
    streamPendingTextRef.current.delete(streamId);
    streamTextBufferRef.current.delete(streamId);
    streamTargetsRef.current.delete(streamId);
    activeStreamsRef.current.delete(streamId);
    webSearchPrepTokensRef.current.delete(streamId);
  };

  const stopActiveStream = () => {
    const activeTargets = Array.from(streamTargetsRef.current.entries());
    if (activeTargets.length === 0) return;

    for (const [streamId, target] of activeTargets) {
      flushStreamRevealText(streamId);
      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.text.trim().length > 0 ? message.text : "Stopped.",
        kind: message.kind === "compression-result" ? "text" : message.kind,
        state: "done",
        webSearchStatus: message.webSearchStatus ? "done" : undefined,
        webSearchStatusText: undefined,
        ...finishAssistantTiming(message),
      }));
      clearStreamRuntime(streamId);
    }

    updateRespondingState();
  };

  const createNewConversation = () => {
    if (viewMode === "conversations") {
      setIsAllConversationsOpen(false);
      setIsProviderPickerOpen(false);
      setIsModelPickerOpen(false);
      return;
    }

    if (activeConversation && !hasConversationContent(activeConversation)) {
      setActiveConversationId(activeConversation.id);
      setIsAllConversationsOpen(false);
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
    conversationMutationVersionRef.current += 1;
    setConversations((current) => limitConversations(pruneBlankConversations([conversation, ...current], conversation.id)));
    setActiveConversationId(conversation.id);
    setViewMode("chat");
    userPinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    cancelRenameConversation();
    setIsAllConversationsOpen(false);
    setIsProviderPickerOpen(false);
    setIsModelPickerOpen(false);
    clearComposerInput();
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
    if (AI_SIDEBAR_PERF_DEBUG) {
      perfDebugRef.current.lastSelectedConversationId = conversationId;
      perfDebugRef.current.selectConversationStartAt = performance.now();
      incrementNoteXAiPerfCounter("selectConversation");
      setNoteXAiPerfEvent("aiSidebarLastSelectConversationStart", {
        conversationId,
        conversationExists: conversations.some((conversation) => conversation.id === conversationId),
        messageCount: conversations.find((conversation) => conversation.id === conversationId)?.messages.length ?? 0,
        activeConversationId,
      });
    }
    setActiveConversationId(conversationId);
    setViewMode("chat");
    setIsAllConversationsOpen(false);
    setConversationSearch("");
    setIsProviderPickerOpen(false);
    setIsModelPickerOpen(false);
    setModelSearch("");
    setEditingConversationId(null);
    setEditingConversationTitle("");
    userPinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
    if (AI_SIDEBAR_PERF_DEBUG) {
      perfDebugRef.current.selectConversationEndAt = performance.now();
      const selectSummary = {
        conversationId,
        durationMs: perfDebugRef.current.selectConversationEndAt - perfDebugRef.current.selectConversationStartAt,
        counters: {
          renderCount: perfDebugRef.current.renderCount,
          messageListRenderCount: perfDebugRef.current.messageListRenderCount,
          resizeObserverCallbackCount: perfDebugRef.current.resizeObserverCallbackCount,
          composerResizeObserverCallbackCount: perfDebugRef.current.composerResizeObserverCallbackCount,
          scrollEventCount: perfDebugRef.current.scrollEventCount,
          setShowScrollToBottomCount: perfDebugRef.current.setShowScrollToBottomCount,
          scheduleScrollToBottomCount: perfDebugRef.current.scheduleScrollToBottomCount,
          scrollToBottomCount: perfDebugRef.current.scrollToBottomCount,
        },
      };
      setNoteXAiPerfEvent("aiSidebarLastSelectConversationSummary", selectSummary);
      console.groupCollapsed("[NoteX Perf] select conversation", conversationId);
      console.info(selectSummary);
      console.groupEnd();
    }
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

    conversationMutationVersionRef.current += 1;
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
      clearStreamRuntime(streamId);
    }
    updateRespondingState();

    const remaining = limitConversations(conversations.filter((item) => item.id !== conversationId));
    if (remaining.length === 0) {
      const fallback = createEmptyConversation();
      conversationMutationVersionRef.current += 1;
      setConversations([fallback]);
      setActiveConversationId(fallback.id);
      setViewMode("conversations");
    } else {
      conversationMutationVersionRef.current += 1;
      setConversations(remaining);
      if (conversationId === activeConversationId) {
        setActiveConversationId(remaining[0].id);
      }
    }

    setPendingDeleteConversationId(null);
    cancelRenameConversation();
    userPinnedToBottomRef.current = true;
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
      queueStreamRevealText(streamId, delta);
    }).then((unlisten) => unlisteners.push(unlisten));

    void listen<NoteChatStreamDoneEvent>("ai-chat-stream-done", (event) => {
      const { streamId } = event.payload;
      const target = streamTargetsRef.current.get(streamId);
      if (disposed || !target) return;
      flushStreamRevealText(streamId);

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
        clearStreamRuntime(streamId);
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
      clearStreamRuntime(streamId);
      updateRespondingState();
    }).then((unlisten) => unlisteners.push(unlisten));

    void listen<NoteChatStreamErrorEvent>("ai-chat-stream-error", (event) => {
      const { streamId, message, detail } = event.payload;
      const target = streamTargetsRef.current.get(streamId);
      if (disposed || !target) return;
      flushStreamRevealText(streamId);
      if (detail) {
        console.warn("AI sidebar stream failed", { streamId, detail });
      }

      replaceMessage(target.conversationId, target.messageId, (currentMessage) => ({
        ...currentMessage,
        text: currentMessage.text.trim().length > 0 ? currentMessage.text : getChatErrorMessage(message),
        kind: currentMessage.kind === "compression-result" ? "text" : currentMessage.kind,
        state: "error",
        webSearchStatus: currentMessage.webSearchStatus ? "failed" : undefined,
        webSearchStatusText: currentMessage.webSearchStatus ? "生成回答失败" : undefined,
        ...finishAssistantTiming(currentMessage),
      }));
      clearStreamRuntime(streamId);
      updateRespondingState();
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
      streamFlushFrameRef.current.forEach((frameId) => window.cancelAnimationFrame(frameId));
      streamFlushFrameRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!isOpenShellSettled && !hasLoadedConversationStateRef.current) return;
    isAtBottomRef.current = true;
    userPinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    if (AI_SIDEBAR_PERF_DEBUG) {
      incrementNoteXAiPerfCounter("aiSidebarInitialScrollToBottom");
    }
    scheduleMessagesScrollToBottom();
  }, [activeConversationId, isOpen, isOpenShellSettled]);

  useEffect(() => {
    if (!isOpenShellSettled && !hasLoadedConversationStateRef.current) return;
    if (!isOpen) return;
    if (userPinnedToBottomRef.current) {
      scheduleMessagesScrollToBottom();
      return;
    }
    setShowScrollToBottom(true);
  }, [isOpen, isOpenShellSettled, messages]);

  useEffect(() => {
    if (!isOpen || viewMode !== "chat") return undefined;
    const messagesList = messagesScrollRef.current?.querySelector<HTMLElement>("[data-notex-message-list=\"true\"]");
    if (!messagesList) return undefined;

    let lastHeight = messagesList.getBoundingClientRect().height;
    const observer = new ResizeObserver((entries) => {
      if (AI_SIDEBAR_PERF_DEBUG) {
        perfDebugRef.current.resizeObserverCallbackCount += 1;
        incrementNoteXAiPerfCounter("messageResizeObserver");
      }
      if (isResizing) {
        pendingResizeScrollStateRef.current = true;
        return;
      }
      const entry = entries[0];
      const nextHeight = entry ? entry.contentRect.height : messagesList.getBoundingClientRect().height;
      if (Math.abs(nextHeight - lastHeight) <= 1) {
        return;
      }
      lastHeight = nextHeight;
      if (userPinnedToBottomRef.current) {
        scheduleMessagesScrollToBottom();
      }
    });
    observer.observe(messagesList);

    return () => {
      observer.disconnect();
    };
  }, [activeConversationId, isOpen, isResizing, messages.length, viewMode]);

  useEffect(() => {
    if (isResizing) {
      resizeStartedPinnedToBottomRef.current = userPinnedToBottomRef.current;
      return;
    }
    if (!pendingResizeScrollStateRef.current) return;
    pendingResizeScrollStateRef.current = false;
    if (resizeStartedPinnedToBottomRef.current) {
      userPinnedToBottomRef.current = true;
      isAtBottomRef.current = true;
      scheduleMessagesScrollToBottom();
      return;
    }
    const isNearBottom = isMessagesNearBottom();
    isAtBottomRef.current = isNearBottom;
    userPinnedToBottomRef.current = isNearBottom;
    setShowScrollToBottom(!isNearBottom);
  }, [isResizing]);

  useEffect(() => () => {
    cancelScheduledMessagesScroll();
  }, []);

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
        tagTaxonomyContext: "",
      };
    }

    const truncatedMarkdown = truncateText(context.markdownBody, NOTE_CHAT_MAX_MARKDOWN_CHARS);
    const tagRecommendationInput = buildAiTagRecommendationInput({
      title: context.title,
      notePath: context.filePath,
      summary: context.summary,
      body: context.markdownBody,
      existingTags: context.tags,
      userConfig: tagTaxonomyConfig,
    });

    return {
      noteTitle: context.filePath ? context.title : "",
      notePath: context.filePath ?? "",
      tags: context.tags,
      summary: context.summary.trim(),
      selectedText: truncatedSelection.text,
      markdown: truncatedMarkdown.text,
      markdownTruncated: truncatedMarkdown.truncated,
      tagTaxonomyContext: tagRecommendationInput.tagTaxonomyContext,
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
    userPinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(
      conversationId,
      createMessage({ role: "user", text: commandText, state: "done" }),
      createMessage({ role: "assistant", text: notice, state: "done" }),
    );
    clearComposerInput();
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
  };

  const openStatusPanel = () => {
    setStatusPanelOpen(true);
    clearComposerInput();
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

    userPinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);
    clearComposerInput();
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
    initializeStreamRevealState(streamId);
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
      flushStreamRevealText(streamId);
      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.text.trim().length > 0 ? message.text : getChatErrorMessage(error),
        kind: "text",
        state: "error",
        ...finishAssistantTiming(message),
      }));
      clearStreamRuntime(streamId);
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
      userPinnedToBottomRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: displayText, state: "done" }),
        createMessage({ role: "system", text: "请先配置 AI 模型后再使用推荐标签。", state: "done" }),
      );
      clearComposerInput();
      return;
    }
    if (!selectedProviderId || !selectedModelId) {
      userPinnedToBottomRef.current = true;
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
      clearComposerInput();
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

    userPinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);
    clearComposerInput();
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
    setIsResponding(true);

    try {
      const suggestion = await suggestNoteTags(
        chatContext,
        selectedProviderId,
        selectedModelId,
      );
      const parsed = buildAiTagSuggestionMessagePayload(suggestion, chatContext, tagTaxonomyConfig);

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
        text: createAiTagRecommendationFailureMessage(error),
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
      userPinnedToBottomRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: displayText, state: "done" }),
        createMessage({ role: "system", text: "AI is not configured. Open settings first.", state: "done" }),
      );
      clearComposerInput();
      return;
    }
    if (!selectedProviderId || !selectedModelId) {
      userPinnedToBottomRef.current = true;
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
      clearComposerInput();
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

    userPinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);
    clearComposerInput();
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
      userPinnedToBottomRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: displayText, state: "done" }),
        createMessage({ role: "system", text: "AI is not configured. Open settings first.", state: "done" }),
      );
      clearComposerInput();
      return;
    }
    if (!selectedProviderId || !selectedModelId) {
      userPinnedToBottomRef.current = true;
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
      clearComposerInput();
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

    userPinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);
    clearComposerInput();
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
      clearComposerInput();
      setActiveCommandIndex(0);
      setIsCommandPanelDismissed(false);
      return;
    }

    userPinnedToBottomRef.current = true;
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
    clearComposerInput();
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

      const tagRecommendationInput = buildAiTagRecommendationInput({
        title: context.title,
        notePath: context.filePath,
        summary: context.summary,
        body: context.markdownBody,
        existingTags: context.tags,
        userConfig: tagTaxonomyConfig,
      });
      const chatContext: NoteChatContextPayload = {
        noteTitle: context.title,
        notePath: context.filePath,
        tags: context.tags,
        summary: context.summary.trim(),
        selectedText: "",
        markdown: context.markdownBody,
        markdownTruncated: false,
        tagTaxonomyContext: tagRecommendationInput.tagTaxonomyContext,
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
      userPinnedToBottomRef.current = true;
      setShowScrollToBottom(false);
      appendMessages(
        conversationId,
        createMessage({ role: "user", text: userFacingText, state: "done" }),
        createMessage({ role: "system", text: "AI is not configured. Open settings first.", state: "done" }),
      );
      clearComposerInput();
      return;
    }
    if (!selectedProviderId || !selectedModelId) {
      userPinnedToBottomRef.current = true;
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
      clearComposerInput();
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

    userPinnedToBottomRef.current = true;
    setShowScrollToBottom(false);
    appendMessages(conversationId, userMessage, assistantMessage);

    clearComposerInput();
    setActiveCommandIndex(0);
    setIsCommandPanelDismissed(false);
    streamTextBufferRef.current.set(streamId, "");
    streamTargetsRef.current.set(streamId, {
      conversationId,
      messageId: assistantMessage.id,
      requestId,
      mode: "chat",
    });
    initializeStreamRevealState(streamId);
    activeStreamsRef.current.add(streamId);
    const webSearchPrepToken = requestId;
    webSearchPrepTokensRef.current.set(streamId, webSearchPrepToken);
    updateRespondingState();

    await waitForNextFrame();
    const updateWebSearchStatus = (status: NonNullable<AiChatMessage["webSearchStatus"]>, text?: string) => {
      replaceMessage(conversationId, assistantMessage.id, (message) => ({
        ...message,
        webSearchStatus: status,
        webSearchStatusText: text ?? getWebSearchStageText(status, undefined, searchDecision),
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
    if (shouldStopResearchEngineWithoutSources(sourcesWithCitations, searchError, searchResult.searchDebug)) {
      replaceMessage(conversationId, assistantMessage.id, (message) => ({
        ...message,
        text: getResearchEngineNoSourceMessage(searchError),
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
        webSearchStatusText: getResearchEngineNoSourceMessage(searchError),
        ...finishAssistantTiming(message),
      }));
      clearStreamRuntime(streamId);
      updateRespondingState();
      return;
    }
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
        webSearchStatusText: getUserFacingSearchError(searchError, effectiveSearchDecision),
        ...finishAssistantTiming(message),
      }));
      clearStreamRuntime(streamId);
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
      flushStreamRevealText(streamId);
      replaceMessage(target.conversationId, target.messageId, (message) => ({
        ...message,
        text: message.text.trim().length > 0 ? message.text : getChatErrorMessage(error),
        state: "error",
        ...finishAssistantTiming(message),
      }));
      clearStreamRuntime(streamId);
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

    userPinnedToBottomRef.current = true;
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
    initializeStreamRevealState(streamId);
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
          webSearchStatusText: text ?? getWebSearchStageText(status, undefined, searchDecision),
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
      if (shouldStopResearchEngineWithoutSources(sourcesWithCitations, searchError, searchResult.searchDebug)) {
        replaceMessage(conversationId, assistantMessage.id, (current) => ({
          ...current,
          text: getResearchEngineNoSourceMessage(searchError),
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
          webSearchStatusText: getResearchEngineNoSourceMessage(searchError),
          ...finishAssistantTiming(current),
        }));
        clearStreamRuntime(streamId);
        updateRespondingState();
        return;
      }
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
        webSearchStatusText: getUserFacingSearchError(searchError, effectiveSearchDecision),
          ...finishAssistantTiming(current),
        }));
        clearStreamRuntime(streamId);
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
      flushStreamRevealText(streamId);
      replaceMessage(target.conversationId, target.messageId, (current) => ({
        ...current,
        text: current.text.trim().length > 0 ? current.text : getChatErrorMessage(error),
        state: "error",
        ...finishAssistantTiming(current),
      }));
      clearStreamRuntime(streamId);
      updateRespondingState();
    });
  };

  const applyTagSuggestion = async (message: AiChatMessage) => {
    const conversationId = activeConversation?.id;
    const suggestion = message.tagSuggestion;
    if (!conversationId || !suggestion || applyingTagMessageId) return;
    const selectedTags = suggestion.selectedTags ?? suggestion.suggestedTags;
    if (selectedTags.length === 0) return;

    setApplyingTagMessageId(message.id);
    updateTagSuggestionMessage(conversationId, message.id, (current) => ({ ...current, error: undefined }));
    try {
      await onApplySuggestedTags(suggestion.notePath, selectedTags);
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

  const toggleTagSuggestionSelection = (message: AiChatMessage, tag: string) => {
    const conversationId = activeConversation?.id;
    if (!conversationId || !message.tagSuggestion || message.tagSuggestion.applied || message.tagSuggestion.ignored) return;
    updateTagSuggestionMessage(conversationId, message.id, (current) => {
      const currentSelected = current.selectedTags ?? current.suggestedTags;
      const selected = new Set(currentSelected);
      if (selected.has(tag)) {
        selected.delete(tag);
      } else {
        selected.add(tag);
      }
      return {
        ...current,
        selectedTags: current.suggestedTags.filter((suggestedTag) => selected.has(suggestedTag)),
      };
    });
  };

  const selectAllTagSuggestions = (message: AiChatMessage) => {
    const conversationId = activeConversation?.id;
    if (!conversationId || !message.tagSuggestion || message.tagSuggestion.applied || message.tagSuggestion.ignored) return;
    updateTagSuggestionMessage(conversationId, message.id, (current) => ({
      ...current,
      selectedTags: current.suggestedTags,
    }));
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
    clearComposerInput();
    setIsCommandPanelDismissed(true);
    setActiveCommandIndex(0);
    setViewMode("chat");
    executeSlashCommand(command);
  };

  const submitInput = () => {
    const conversationId = activeConversation?.id;
    const value = (inputRef.current?.value ?? inputDraftRef.current).trim();
    if (!conversationId || !value || isResponding) return;
    const shouldCreateConversationFromList = viewMode === "conversations" && !value.startsWith("/");
    const listConversation = shouldCreateConversationFromList
      ? {
          ...createEmptyConversation(),
          ...getDefaultConversationModel(aiConfig),
        }
      : undefined;

    if (listConversation) {
      conversationMutationVersionRef.current += 1;
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
  const allConversations = sortedConversations;
  const recentConversations = allConversations.slice(0, 3);
  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLocaleLowerCase();
    if (!query) return allConversations;
    return allConversations.filter((conversation) =>
      getConversationDisplayTitle(conversation).toLocaleLowerCase().includes(query),
    );
  }, [allConversations, conversationSearch]);
  const shouldShowViewAllConversations = allConversations.length > recentConversations.length;
  const updateConversationPopoverFade = useCallback(() => {
    const list = conversationPopoverListRef.current;
    if (!list) {
      setShowConversationPopoverFade(false);
      return;
    }
    const distanceToBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    setShowConversationPopoverFade(distanceToBottom > 1);
  }, []);
  useEffect(() => {
    if (!isAllConversationsOpen) {
      setShowConversationPopoverFade(false);
      return;
    }
    const list = conversationPopoverListRef.current;
    if (!list) return;
    updateConversationPopoverFade();
    const observer = new ResizeObserver(updateConversationPopoverFade);
    observer.observe(list);
    return () => observer.disconnect();
  }, [filteredConversations, isAllConversationsOpen, updateConversationPopoverFade]);
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
  const workbenchStyle = {
    ...sidebarStyle,
    "--notex-composer-avoid-height": `${composerFlowHeight}px`,
  } as CSSProperties;
  const contentColumnClass = isMaximized ? "w-full max-w-none" : "mx-auto w-full max-w-3xl";
  const shouldRenderOpenShellOnly = isOpen && !isOpenShellSettled && !hasLoadedConversationStateRef.current;
  const renderConversationItem = (conversation: AiConversation, variant: "panel" | "overlay" = "panel") => {
    const title = getConversationDisplayTitle(conversation);
    const timeLabel = formatConversationRelativeTime(conversation.updatedAt);
    const isSelected = conversation.id === activeConversationId;

    if (editingConversationId === conversation.id) {
      return (
        <div
          key={conversation.id}
          className={cn(
            "notex-session-edit grid min-w-0 gap-1",
            variant === "overlay" && "notex-session-popover-row",
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
          "notex-session-item notex-session-row group flex w-full min-w-0 items-center transition-colors",
          variant === "overlay" && "notex-session-popover-row",
        )}
        data-selected={isSelected ? "true" : undefined}
      >
        <button
          type="button"
          className={cn(
            "notex-session-row-title min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[16px] font-normal leading-[21px] text-foreground",
            !isSelected && "transition-[font-weight] group-hover:font-medium group-focus-within:font-medium",
          )}
          onClick={() => selectConversation(conversation.id)}
          title={title}
        >
          {title}
        </button>
        <span className="notex-session-time notex-session-row-meta shrink-0 text-right tabular-nums group-hover:hidden">
          {timeLabel}
        </span>
        <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={(event) => {
              event.stopPropagation();
              startRenameConversation(conversation);
            }}
            title="重命名会话"
            aria-label="重命名会话"
          >
            <PenLine className="h-[15px] w-[15px]" />
          </button>
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-accent/35 hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={(event) => {
              event.stopPropagation();
              requestDeleteConversation(conversation.id);
            }}
            title="删除会话"
            aria-label="删除会话"
          >
            <Trash2 className="h-[15px] w-[15px]" />
          </button>
        </div>
      </div>
    );
  };
  let commandOrdinal = 0;

  if (!isOpen) {
    return null;
  }

  return (
    <aside
      className={cn(
        "notex-workbench ai-sidebar-shell relative shrink-0 flex-col overflow-hidden border-l border-border/80 text-foreground",
        "flex",
        isMaximized && "absolute inset-0 z-40 border-l border-border/80 shadow-2xl",
      )}
      style={workbenchStyle}
      aria-hidden={!isOpen}
    >
      {isOpen && !isMaximized && onResizePointerDown && (
        <button
          type="button"
          className={cn("notex-resize-rail", isResizing && "notex-resize-rail-active")}
          onPointerDown={onResizePointerDown}
          onDoubleClick={onResizeDoubleClick}
          aria-label="Resize AI assistant"
          title="Drag to resize AI assistant"
        />
      )}
      <div className="notex-top relative shrink-0">
        <div className="notex-header flex h-11 items-center justify-between gap-1.5 border-b border-border/40 px-3">
        <div className="notex-brand grid min-w-0 flex-1 gap-px">
          <div className="notex-title truncate text-[16px] font-semibold leading-5 text-foreground">NoteX</div>
          <div className="notex-model-status truncate text-[11px] leading-3 text-muted-foreground/75">
            {isAiConfigured ? selectedProviderLabel : "请先配置 AI 模型"}
          </div>
        </div>
        <button
          ref={providerPickerTriggerRef}
          type="button"
          className={cn(
            "notex-config-trigger notex-provider-button inline-flex h-7 min-w-0 max-w-[7.5rem] items-center justify-between gap-1 rounded-md border border-border/45 bg-background/25 px-1.5 text-left text-[11px] text-muted-foreground transition-colors hover:border-border/70 hover:bg-accent/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            isProviderPickerOpen && "bg-accent/35 text-foreground",
          )}
            onClick={() => {
              setIsProviderPickerOpen((open) => !open);
              setIsAllConversationsOpen(false);
              setIsModelPickerOpen(false);
            }}
          title={selectedProviderLabel}
          aria-label="选择 AI 模型"
          aria-expanded={isProviderPickerOpen}
        >
          <span className="truncate">{selectedProviderLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
        <div className="notex-header-actions flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="notex-icon-button inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => onMaximizedChange?.(!isMaximized)}
            title={isMaximized ? "Exit maximized NoteX" : "Maximize NoteX"}
            aria-label={isMaximized ? "Exit maximized NoteX" : "Maximize NoteX"}
            aria-pressed={isMaximized}
          >
            {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="notex-icon-button inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onPointerDownCapture={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeSidebar();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeSidebar();
            }}
            title="Hide NoteX"
            aria-label="Hide NoteX"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        </div>

        <div className="notex-modebar flex h-10 min-w-0 items-center justify-between gap-2 border-b border-border/30 px-3">
          {viewMode === "conversations" ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="notex-mode-title min-w-0 truncate text-[15px] font-medium leading-5 text-foreground" title="会话">
                会话
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                className="notex-icon-button inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={() => {
                  setViewMode("conversations");
                  setIsAllConversationsOpen(false);
                  setConversationSearch("");
                  setIsProviderPickerOpen(false);
                  setIsModelPickerOpen(false);
                }}
                title="会话"
                aria-label="会话"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span
                className="notex-mode-title min-w-0 truncate text-[15px] font-medium leading-5 text-foreground"
                title={activeConversationTitle}
              >
                {activeConversationTitle}
              </span>
            </div>
          )}
          <div className="notex-mode-actions flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={cn(
              "notex-icon-button inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              isAllConversationsOpen && "bg-accent/35 text-foreground",
            )}
            onClick={() => {
              setConversationSearch("");
              setIsAllConversationsOpen((open) => !open);
              setIsProviderPickerOpen(false);
              setIsModelPickerOpen(false);
            }}
            title="Chat history"
            aria-label="Chat history"
            aria-pressed={isAllConversationsOpen}
          >
            <History className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="notex-icon-button inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={createNewConversation}
            title="新聊天"
            aria-label="新聊天"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="notex-icon-button inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/35 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onClick={() => {
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
        </div>

        {isProviderPickerOpen && (
          <div
            ref={providerPickerMenuRef}
            className="notex-config-menu absolute z-40 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl"
            style={{
              top: "48px",
              left: "50%",
              right: "auto",
              width: "min(240px, calc(100% - 36px))",
              maxWidth: "min(240px, calc(100% - 36px))",
              transform: "translateX(-50%)",
            }}
          >
            <div className="hidden">
              <span className="text-xs font-medium text-foreground">选择配置组</span>
              <button
                type="button"
                className="notex-config-menu-action inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => {
                  setIsProviderPickerOpen(false);
                  onOpenAiSettings();
                }}
              >
                <Settings className="h-3 w-3" />
                API 管理
              </button>
            </div>
            <div className="notex-config-menu-list max-h-72 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              {enabledProviders.length > 0 ? (
                enabledProviders.map((provider) => {
                  const isSelected = provider.id === selectedProviderId;
                  const modelCount = getEnabledProviderModels(provider).length;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      className={cn(
                        "notex-config-menu-item flex w-full min-w-0 items-center rounded-md text-left transition-colors hover:bg-accent hover:text-accent-foreground",
                        isSelected && "is-selected",
                      )}
                      data-selected={isSelected ? "true" : undefined}
                      onClick={() => selectConversationProvider(provider)}
                    >
                      <span className="notex-config-menu-name truncate text-sm font-medium">{provider.name || provider.id}</span>
                      <span className="hidden">
                        {modelCount > 0 ? `${modelCount} models` : "无可用模型"}
                      </span>
                      <span className="ml-4 inline-flex h-8 w-8 shrink-0 items-center justify-center text-foreground" aria-hidden="true">
                        {isSelected && <MenuCheckIcon />}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="notex-config-menu-empty grid gap-2 px-3 py-8 text-center text-sm text-muted-foreground">
                  <div>还没有可用配置组</div>
                  <button
                    type="button"
                    className="hidden"
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

        {false && (
          <div className="absolute right-3 top-[4.75rem] z-30 w-[340px] max-w-[calc(100%-1.5rem)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <span className="text-xs font-medium text-foreground">会话</span>
              <span className="text-[11px] text-muted-foreground">{allConversations.length} 个</span>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5 [scrollbar-width:thin]">
              <div className="grid gap-1">
                {recentConversations.map((conversation) => renderConversationItem(conversation))}
              </div>
              {false && allConversations.map((conversation) => (
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
                    title="重命名对话"
                    aria-label={`重命名对话 ${conversation.title}`}
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
                    title="删除对话"
                    aria-label={`删除对话 ${conversation.title}`}
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

      <div className="notex-messages-region relative flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={messagesScrollRef}
          className="notex-scroll notex-messages min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin]"
          onScroll={handleMessagesScroll}
        >
          {shouldRenderOpenShellOnly ? (
            <div className={cn(contentColumnClass, "flex h-full min-h-44 items-center justify-center px-5 text-center text-sm text-muted-foreground")}>
              Loading NoteX...
            </div>
          ) : viewMode === "conversations" ? (
            <div className={cn(contentColumnClass, "notex-session-view grid gap-2")}>
              <div className="hidden">
                <span />
                <span>{allConversations.length}</span>
              </div>
              {recentConversations.length > 0 ? (
                <div className="notex-session-list grid">
                  {recentConversations.map((conversation) => renderConversationItem(conversation))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border/70 px-3 py-8 text-center text-sm text-muted-foreground">
                  还没有会话。直接在下方输入第一句话即可开始。
                </div>
              )}
              {shouldShowViewAllConversations && (
                <button
                  type="button"
                  className="notex-session-view-all mt-1"
                  onClick={() => {
                    setConversationSearch("");
                    setIsAllConversationsOpen((open) => !open);
                    setIsProviderPickerOpen(false);
                    setIsModelPickerOpen(false);
                  }}
                  aria-expanded={isAllConversationsOpen}
                >
                  查看全部（{allConversations.length} 个）
                </button>
              )}
              <div className="notex-bottom-spacer" aria-hidden="true" />
            </div>
          ) : shouldShowPrepareState ? (
            <div className={cn(contentColumnClass, "flex h-full min-h-44 items-center justify-center px-5 text-center text-sm text-muted-foreground")}>
              {chatHydrationPhase === "shell" ? "Loading recent messages..." : "Preparing recent messages..."}
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
            <div
              className={cn("notex-message-list", contentColumnClass, "grid gap-3")}
              data-notex-message-list="true"
            >
              {(() => {
                const visibleMessages = messages.slice(-AI_CONVERSATION_MESSAGE_LIMIT);
                if (AI_SIDEBAR_PERF_DEBUG) {
                  perfDebugRef.current.messageListRenderCount += 1;
                  incrementNoteXAiPerfCounter("messageListRender");
                  setNoteXAiPerfEvent("aiSidebarLastMessageListRender", {
                    renderedMessageCount: visibleMessages.length,
                    totalMessageCount: messages.length,
                    activeConversationId,
                    at: performance.now(),
                  });
                }
                return visibleMessages.map((message) => {
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
                  <div key={message.id} className="notex-message notex-message-assistant mr-auto grid w-full max-w-[94%] gap-2 py-1.5 text-foreground">
                    {timingLabel && (
                      <div className={cn(
                        "notex-message-meta text-muted-foreground/75",
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
                          onPerfCounter={AI_SIDEBAR_PERF_DEBUG ? incrementNoteXAiPerfCounter : undefined}
                        />
                      )}
                      {message.searchDecision?.shouldSearch && (
                        <WebSearchProgressCard status={message.webSearchStatus} text={message.webSearchStatusText} decision={message.searchDecision} />
                      )}
                      <LocalNoteSearchProgressCard
                        status={message.localNoteSearchStatus}
                        error={message.localNoteSearchError}
                      />
                      {!developerModeEnabled && message.searchDecision?.shouldSearch && message.searchError && (
                        <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full border border-amber-200/70 bg-amber-50/70 px-2.5 py-1 text-[11px] leading-5 text-amber-800 dark:border-amber-300/20 dark:bg-amber-400/[0.08] dark:text-amber-100">
                          <Info className="h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0 truncate">{getUserFacingSearchError(message.searchError, message.searchDecision)}</span>
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
                          onOpenExternalUrl={openExternalUrl}
                          onPerfCounter={AI_SIDEBAR_PERF_DEBUG ? incrementNoteXAiPerfCounter : undefined}
                        />
                      )}
                      {message.kind === "tag-suggestion" && message.tagSuggestion ? (
                        <TagSuggestionCard
                          suggestion={message.tagSuggestion}
                          isApplying={applyingTagMessageId === message.id}
                          onApply={() => void applyTagSuggestion(message)}
                          onIgnore={() => ignoreTagSuggestion(message)}
                          onToggleTag={(tag) => toggleTagSuggestionSelection(message, tag)}
                          onSelectAll={() => selectAllTagSuggestions(message)}
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
                            messageId={message.id}
                            markdown={message.text || (message.state === "streaming" ? "Generating..." : "")}
                            citations={sourceCitations}
                            localNoteSources={message.localNoteSources}
                            isStreaming={message.state === "streaming"}
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
                        <div className="notex-message-actions mt-2 flex items-center gap-1.5 text-muted-foreground">
                          {canCopyAssistantMessage && (
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => void copyAssistantMessage(message)}
                              title={copyFeedback === "copied" ? "已复制" : copyFeedback === "failed" ? "复制失败" : "复制"}
                              aria-label={copyFeedback === "copied" ? "已复制回答" : copyFeedback === "failed" ? "复制回答失败" : "复制回答"}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canRetryMessage && (
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => retryAssistantMessage(message)}
                              disabled={isResponding}
                              title="重试"
                              aria-label="重试回答"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
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
                  <div key={message.id} className="notex-message notex-message-user notex-user-message ml-auto">
                    <div data-app-context-menu-text="true" className="notex-user-bubble whitespace-pre-wrap break-words">
                      {message.text}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={message.id}
                  className="notex-message notex-message-system mx-auto flex max-w-[92%] items-start gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-muted-foreground"
                >
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div data-app-context-menu-text="true" className="min-w-0 whitespace-pre-wrap break-words">{message.text}</div>
                </div>
              );
              });
              })()}
            </div>
          )}
          {viewMode === "chat" && <div className="notex-bottom-spacer" aria-hidden="true" />}
        </div>
        {viewMode === "chat" && showScrollToBottom && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20">
            <div className={cn(contentColumnClass, "relative h-9")}>
            <button
              type="button"
              className="pointer-events-auto absolute left-1/2 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border/70 bg-background/95 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/15 dark:bg-[#2f3134]/95"
              onClick={() => {
                isAtBottomRef.current = true;
                userPinnedToBottomRef.current = true;
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

      {isAllConversationsOpen && (
        <div className="notex-session-popover-layer absolute inset-0">
          <button
            type="button"
            className="notex-session-popover-backdrop absolute inset-0 cursor-default"
            onClick={() => {
              setIsAllConversationsOpen(false);
              setConversationSearch("");
            }}
            aria-label="关闭会话列表"
          />
          <div className="notex-session-popover absolute grid text-foreground">
            <div className="notex-session-popover-search">
              <Search className="notex-session-search-icon" aria-hidden="true" />
              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="搜索最近会话"
                className="notex-session-search"
              />
            </div>
            <div
              ref={conversationPopoverListRef}
              className="notex-session-popover-list min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]"
              onScroll={updateConversationPopoverFade}
            >
              {filteredConversations.length > 0 ? (
                <div className="notex-session-list grid">
                  {filteredConversations.map((conversation) => renderConversationItem(conversation, "overlay"))}
                </div>
              ) : (
                <div className="notex-session-empty px-3 py-5 text-center text-sm">
                  没有匹配的会话。
                </div>
              )}
            </div>
            {showConversationPopoverFade && <div className="notex-session-popover-fade" aria-hidden="true" />}
          </div>
        </div>
      )}

      <div ref={composerWrapRef} className={cn("notex-composer-wrap shrink-0", contentColumnClass)}>
        {isCommandPanelOpen && (
          <div className="notex-command-panel ai-command-panel absolute bottom-[calc(100%+0.4rem)] left-0 right-0 z-20 overflow-hidden rounded-[10px] border border-border/50 bg-popover/95 text-popover-foreground dark:border-white/10 dark:bg-[#2b2d2f]/96">
            <div className="notex-command-header hidden">
              <div className="font-medium text-muted-foreground">选择命令</div>
              <div className="text-[10px] text-muted-foreground/55">↑↓ 选择 · Enter</div>
            </div>
            {visibleCommands.length > 0 ? (
              <div className="notex-command-list ai-command-list max-h-72 overflow-y-auto overflow-x-hidden px-1 py-1 [scrollbar-width:thin] [scrollbar-color:color-mix(in_oklch,var(--muted-foreground)_18%,transparent)_transparent]">
                {groupedVisibleCommands.map(({ category, commands }) => (
                  <div key={category} className="py-0.5">
                    <div className="hidden">
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
                              "notex-command-item ai-command-item flex h-10 w-full min-w-0 items-center gap-2 rounded-md px-2.5 py-1 text-left transition-[background-color,color,opacity]",
                              isDisabled
                                ? "cursor-not-allowed"
                                : "cursor-pointer text-foreground hover:bg-accent/18 hover:text-foreground dark:hover:bg-white/[0.04]",
                              isActive && !isDisabled
                                ? "bg-accent/28 text-foreground dark:bg-white/[0.06]"
                                : isActive
                                  ? "bg-accent/16 text-foreground dark:bg-white/[0.04]"
                                  : undefined,
                            )}
                            onMouseEnter={() => setActiveCommandIndex(itemIndex)}
                            onClick={() => selectCommand(command)}
                            data-active={isActive ? "true" : undefined}
                            aria-disabled={isDisabled}
                            tabIndex={isDisabled ? -1 : 0}
                          >
                            <span className="notex-command-icon flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm text-muted-foreground">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="notex-command-content min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-3 overflow-hidden">
                                <span className="notex-command-name truncate text-[13.5px] font-medium leading-4 text-foreground">{command.label}</span>
                                <span className="notex-command-description truncate text-[12px] leading-[14px] text-muted-foreground">
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

        <div className={cn("notex-composer-card", isModelPickerOpen && "notex-composer-card-menu-open")}>
          <textarea
            ref={inputRef}
            onChange={(event) => {
              const nextValue = event.target.value;
              syncComposerInputState(nextValue);
              if (nextValue.startsWith("/")) {
                setActiveCommandIndex(0);
                setIsCommandPanelDismissed(false);
              }
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
            rows={1}
            placeholder="输入问题，或输入 /"
            className="notex-composer-input w-full resize-none outline-none"
          />
          <div className="notex-composer-toolbar flex min-w-0 items-center gap-1 overflow-hidden">
            <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
              <button
                ref={modelPickerTriggerRef}
                type="button"
                className={cn(
                  "notex-model-trigger notex-composer-control inline-flex min-w-[3.25rem] max-w-[7.5rem] flex-[1_1_6rem] cursor-pointer items-center gap-1 overflow-hidden text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isModelPickerOpen && "notex-composer-control-active",
                )}
                onClick={() => {
                  setIsModelPickerOpen((open) => !open);
                  setIsProviderPickerOpen(false);
                  setIsAllConversationsOpen(false);
                }}
                title={`选择模型：${selectedModelLabel}`}
                aria-label={`选择模型：${selectedModelLabel}`}
                aria-expanded={isModelPickerOpen}
              >
                <span className="min-w-0 truncate">{selectedModelLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={includeCurrentNoteContext}
                className={cn(
                  "notex-tool-pill notex-composer-control notex-composer-switch inline-flex shrink-0 cursor-pointer items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-[420px]:gap-1",
                  includeCurrentNoteContext && "notex-composer-control-active",
                )}
                onClick={() => setIncludeCurrentNoteContext((enabled) => !enabled)}
                title={includeCurrentNoteContext ? "包含当前笔记信息" : "不包含当前笔记信息"}
                aria-label={includeCurrentNoteContext ? "包含当前笔记信息" : "不包含当前笔记信息"}
              >
                <span
                  className={cn(
                    "notex-switch-track relative h-3 w-5 shrink-0 rounded-full bg-muted-foreground/20 transition-colors",
                    includeCurrentNoteContext && "bg-primary/62",
                  )}
                >
                  <span
                    className={cn(
                      "notex-switch-thumb absolute left-0.5 top-0.5 h-2 w-2 rounded-full transition-transform",
                      includeCurrentNoteContext && "translate-x-2",
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
                  "notex-tool-pill notex-composer-control notex-composer-switch inline-flex shrink-0 cursor-pointer items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-[420px]:gap-1",
                  webSearchEnabled && "notex-composer-control-active",
                )}
                onClick={handleWebSearchToggle}
                title={developerModeEnabled && webSearchEnabled ? "Web search is on: Developer Mode will use Research Engine, with no legacy fallback." : webSearchEnabled ? "联网搜索已开启" : "联网搜索已关闭"}
                aria-label={developerModeEnabled && webSearchEnabled ? "Web search is on. Developer Mode will use Research Engine with no legacy fallback." : webSearchEnabled ? "联网搜索已开启" : "联网搜索已关闭"}
              >
                <Search className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden truncate min-[420px]:inline">联网</span>
              </button>

              {false && isModelPickerOpen && (
                <div className="absolute bottom-9 left-0 z-50 w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground">
                  <div className="grid gap-2 border-b border-border/70 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-foreground">
                        {activeProvider ? activeProvider.name || activeProvider.id : "未选择配置组"}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
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
                        className="h-7 rounded-md border border-input bg-[#2e2e2e] px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                              "grid min-w-0 cursor-pointer rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
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
                          className="mx-auto inline-flex h-7 cursor-pointer items-center rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent"
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
              className={cn(
                "notex-composer-send ai-composer-send inline-flex shrink-0 items-center justify-center transition-[background-color,color,opacity]",
                isResponding || !inputUiState.isEmpty ? "cursor-pointer" : "cursor-default disabled:cursor-default",
              )}
              onClick={isResponding ? stopActiveStream : submitInput}
              disabled={!isResponding && inputUiState.isEmpty}
              title={isResponding ? "停止生成" : "Send"}
              aria-label={isResponding ? "停止生成" : "Send"}
            >
              {isResponding ? <span className="h-2.5 w-2.5 rounded-[2px] bg-[var(--notex-send-fg)]" aria-hidden="true" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </div>
          {isModelPickerOpen && (
            <div
              ref={modelPickerMenuRef}
              className="notex-model-menu absolute bottom-12 left-4 z-50 w-[300px] max-w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground"
            >
              <div className="hidden">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    {activeProvider ? activeProvider.name || activeProvider.id : "未选择配置组"}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
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
                    className="notex-model-menu-search h-7 rounded-md border border-input bg-[#2e2e2e] px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                )}
              </div>
              <div className="notex-model-menu-list max-h-64 overflow-y-auto p-1.5 [scrollbar-width:thin]">
                {selectableModels.length > 0 ? (
                  <div className="grid gap-0.5">
                    {selectableModels.map((model) => {
                      const isSelected = model.id === selectedModelId;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          className={cn(
                            "notex-model-menu-item flex min-w-0 cursor-pointer items-center rounded-md text-left transition-colors hover:bg-accent hover:text-accent-foreground",
                            isSelected && "is-selected",
                          )}
                          data-selected={isSelected ? "true" : undefined}
                          onClick={() => selectConversationModel(model)}
                        >
                          <span className="notex-model-menu-name truncate text-sm font-medium">{model.name || model.id}</span>
                          <span className="hidden">
                            {model.id} · {model.source === "manual" ? "手动" : "同步"}
                          </span>
                          <span className="ml-4 inline-flex h-8 w-8 shrink-0 items-center justify-center text-foreground" aria-hidden="true">
                            {isSelected && <MenuCheckIcon />}
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
                      className="mx-auto inline-flex h-7 cursor-pointer items-center rounded-md border border-border px-2 text-xs text-foreground hover:bg-accent"
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
        <div className="notex-composer-bottom-fill" aria-hidden="true" />
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
