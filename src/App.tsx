import { listen } from "@tauri-apps/api/event";
import { forwardRef, startTransition, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { Bot, Check, ChevronDown, ChevronRight, Columns2, ExternalLink, Eye, FilePlus, FileText, FolderPlus, FolderOpen, Keyboard, ListChecks, Loader2, Maximize2, Minimize2, Minus, Pause, Play, PlugZap, RefreshCw, Save, Search, Settings, Sparkles, Square, SquarePen, Trash2, X } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ToolbarButton } from "@/components/ui/toolbar-button";
import AppContextMenu from "@/components/common/AppContextMenu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import TagManagerWorkspace, { type TagManagerCloseReason } from "@/components/tag-manager/TagManagerWorkspace";
import type { TagManagerFilterMode } from "@/components/tag-manager/types";
import { mergeConfigWithStoredCustomCollections, writeStoredCustomCollections, type TagTaxonomyConfigImportResult } from "@/components/tag-manager/tagManagerConfig";
import { useCollectionCandidatesFromNotes } from "@/components/tag-manager/useCollectionCandidatesFromNotes";
import TagPickerDialog from "@/components/TagPickerDialog";
import AiSidebar from "@/components/ai/AiSidebar";
import { CodexDiffPreview, getDiffStats } from "@/components/ai/DiffPreview";
import type { AiPolishPreview, AiSidebarNoteContext, ApplyPolishedFullNoteInput, ApplyPolishedSelectionInput } from "@/components/ai/types";
import MarkdownEditor, { MarkdownEditorToolbar, type MarkdownEditorSelectionRange, type MarkdownEditorToolbarApi } from "@/components/editor/MarkdownEditor";
import MarkdownPreview from "@/components/editor/MarkdownPreview";
import { useEditorPreviewScrollSync } from "@/components/editor/useEditorPreviewScrollSync";
import FileTree from "@/components/file-tree/FileTree";
import OpenTabsBar, { type OpenFileTab, type OpenReviewTab, type OpenTab } from "@/components/layout/OpenTabsBar";
import { useOpenTabsController } from "@/components/layout/useOpenTabsController";
import { useDisplayNoteFiles } from "@/components/notes/useDisplayNoteFiles";
import { useNotesListController } from "@/components/notes/useNotesListController";
import { useLocalNoteSearchController } from "@/components/search/useLocalNoteSearchController";
import AiConfigManager from "@/components/settings/AiConfigManager";
import { LuoguAccountManager } from "@/components/settings/LuoguAccountManager";
import SettingsCenterHost, { type SettingsCenterHostHandle } from "@/components/settings/SettingsCenterHost";
import { SettingsPageLayout as SettingsV2PageLayout } from "@/components/settings/v2/components/SettingsPageLayout";
import { SettingsCard as SettingsV2Card, SettingsSection as SettingsV2Section } from "@/components/settings/v2/primitives/SettingsCard";
import { SettingRow as SettingsV2Row } from "@/components/settings/v2/primitives/SettingRow";
import { ReadonlyPill as SettingsV2ReadonlyPill } from "@/components/settings/v2/primitives/ReadonlyPill";
import {
  BlogPreviewSettingsPage,
  BlogTagManagerSettingsPage,
  DataStorageSettingsPage,
  SettingRow,
} from "@/components/settings/SettingsPages";
import { AboutSettingsPage } from "@/components/settings/v2/pages/AboutSettingsPage";
import { AdvancedSettingsPage } from "@/components/settings/v2/pages/AdvancedSettingsPage";
import {
  AppearanceSettingsPage,
  type DiffMarkerMode,
  type ReducedMotionMode,
  type ThemeMode,
} from "@/components/settings/v2/pages/AppearanceSettingsPage";
import { GeneralSettingsPage } from "@/components/settings/v2/pages/GeneralSettingsPage";
import { KeyboardSettingsPage } from "@/components/settings/v2/pages/KeyboardSettingsPage";
import {
  LuoguAccountSettingsPage,
  LuoguImportCenterSettingsPage,
  LuoguRulesSettingsPage,
  SettingsInlineSelect,
  type LuoguRuleSettingRow,
} from "@/components/settings/pages/LuoguSettingsPages";
import {
  getLuoguScanRangeLabel,
  getLuoguSubmissionCandidateState,
  type LuoguScanCountLimit,
  type LuoguScanDaysLimit,
  type LuoguScanMode,
} from "@/components/settings/pages/luoguImportDomain";
import {
  createEmptyLuoguPreparationWorkspace,
  deriveLuoguScanTaskState,
  formatLuoguPrepareButtonLabel,
  formatLuoguPreviewReviewSummary,
  formatLuoguScanResultSummary,
  getLuoguPrepareSelectionPlan,
  getLuoguScanCompletionSelection,
  isLuoguImportCenterBusy,
  type LuoguImportStep,
  type LuoguPreviewDetailTab,
} from "@/components/luogu/luoguImportDisplay";
import {
  formatLuoguSubmissionStatus,
  formatLuoguSubmissionTime,
  getLuoguCandidateDisplayState,
  getLuoguPreviewStatusBadgeClass,
  getLuoguPreviewStatusLabel,
  getLuoguStatusBadgeClass,
  parseLuoguSubmitTimeMs,
  type LuoguPrepareItemStatus,
} from "@/components/luogu/luoguDisplay";
import { useLuoguImportController } from "@/components/luogu/useLuoguImportController";
import {
  applyLuoguPreparedRules,
  buildLuoguImportRuleRowModels,
  getLuoguImportRuleUpdate,
  isLuoguRuleControlDisabled as getLuoguRuleControlDisabled,
  normalizeLuoguImportRules,
  readStoredLuoguImportRules,
  saveStoredLuoguImportRules,
  validateLuoguSaveDirectoryInput,
  type LuoguImportRules,
} from "@/components/settings/pages/luoguImportRules";
import { BlogTaxonomySettingsPage } from "@/components/settings/pages/BlogTaxonomySettingsPage";
import SearchDiagnosticsPanel from "@/components/settings/SearchDiagnosticsPanel";
import { SETTINGS_SECTION_FALLBACK, SETTINGS_SECTION_LABELS, SETTINGS_TREE } from "@/components/settings/settingsNavigation";
import { shouldRenderSettingsGroup, shouldRenderSettingsPage } from "@/components/settings/settingsRenderGuards";
import type { SettingsCategory, SettingsGroupId, SettingsResizeHandle, SettingsSection, SettingsTarget, SettingsView } from "@/components/settings/settingsTypes";
import {
  areSettingsCenterRectsEqual,
  clampLuoguDialogRect,
  clampSettingsCenterRect,
  getDefaultLuoguDialogRect,
  getDefaultSettingsCenterRect,
  getLuoguDialogMaxSize,
  getLuoguDialogMinSize,
  getMaximizedLuoguDialogRect,
  getMaximizedSettingsCenterRect,
  getResizedLuoguDialogRect,
  getResizedSettingsCenterRect,
  getSafeOpenedLuoguDialogRect,
  getSafeOpenedSettingsCenterRect,
  getSettingsCenterMaxSize,
  getSettingsCenterMinSize,
  getSettingsCenterResizeCursor,
  type SettingsCenterRect,
} from "@/components/settings/settingsGeometry";
import { cn } from "@/lib/utils";
import { classifyMarkdownSavePath, listNotes, readNote, writeNote, deleteNote, renameNote, createNoteFolder, renameNoteFolder, deleteNoteFolder, openBlog, restartBlogServer, openNotesFolder, getNotesRootPath, hideMainWindow, saveNoteAsset, importLuoguInsight, prepareLuoguSubmissionNote, writeLuoguPreparedNote, getLuoguConfig, saveLuoguConfig, testLuoguConnection, previewLuoguSubmissionPage, getAiConfig, saveAiConfig, syncAiProviderModelsDraft, testAiProviderDraft, listAiPrompts, readAiPrompt, saveAiPrompt, resetAiPromptToDefault, polishAiPromptTemplate, showSaveMarkdownDialog, testWebSearchConnection, clearWebCache, getLocalNoteIndexStatus, rebuildLocalNoteIndex, getTagTaxonomyConfig, saveTagTaxonomyConfig, writeExternalMarkdownFile, getBlogConfig, saveBlogConfig, type BlogConfig } from "@/lib/api";
import {
  getPreviewPerfStats,
  markCommittedMarkdownSchedule,
  markCommittedMarkdownSet,
  markDeferredMarkdownSeen,
  markPreviewMarkdownSchedule,
  markPreviewMarkdownSet,
  markPreviewScheduleCancelled,
  markPreviewEditorChange,
  markPreviewStaleRender,
} from "@/lib/previewPerf";
import { getCommittedMarkdownSyncDelayMs, getPreviewMarkdownSyncDelayMs } from "@/lib/previewSyncTiming";
import type { AiConfig, AiProvider, LocalNoteIndexStatusResult, LuoguConfig, PrepareLuoguSubmissionNoteResult, WriteLuoguPreparedNoteResult, PreviewLuoguSubmission, PreviewLuoguSubmissionsResult, PromptTemplateSummary, SyncLuoguInsightsResult, TestLuoguConnectionResult } from "@/lib/api";
import { extractCursorParagraph } from "@/lib/editorContext";
import { mergeFrontmatterFields, parseFrontmatterFields } from "@/lib/frontmatter";
import { DEFAULT_WEB_SEARCH_CONFIG, normalizeWebSearchConfig, type WebSearchConfig } from "@/lib/aiWebSearch";
import { buildLuoguConfigFormState, buildLuoguConfigSavePayload } from "@/lib/luoguConfigForm";
import {
  formatZoomLabel,
  getBlogStatusLabel,
  getEditorViewModeLabel,
  getLuoguImportCenterAccountLabel,
  getLuoguSettingsStatusDescription,
  getLuoguSettingsStatusTone,
  getLuoguStatusLabel,
  getSaveStatusLabel,
} from "@/lib/appStatusLabels";
import { getErrorMessage, runLimitedConcurrencyQueue, sleepMs, withTimeout, yieldToUi } from "@/lib/appAsync";
import {
  getActiveActivityItem,
  getActivityButtonClassName,
  isAiActivitySelected,
  type ActivityBarItem,
} from "@/lib/appShell";
import { buildBlogConfigSaveDraft, DEFAULT_BLOG_CONFIG, resolveBlogConfigDraft } from "@/lib/blogConfig";
import {
  addTagNormalizationPlanStats,
  createEmptyTagNormalizationScanStats,
  deriveTagNormalizationScanTaskState,
  formatTagNormalizationReason,
  getAllTagNormalizationScanSelection,
  getSelectedTagNormalizationScanStats,
  getTagNormalizationScanStats,
  type TagNormalizationApplyFailure,
  type TagNormalizationApplyResult,
  type TagNormalizationScanResult,
  type TagNormalizationScanStats,
} from "@/components/tag-manager/tagNormalizationScan";
import {
  COMMON_COLLECTIONS,
  buildCollectionCandidates,
  getDisplayTags,
  getEffectiveCollections,
  normalizeCollectionValues,
} from "@/lib/collectionTags";
import type { FrontmatterFields } from "@/lib/frontmatter";
import { prewarmMarkdownRenderer } from "@/lib/markdown";
import { combineMarkdown, isSnapshotDirty, splitLoadedMarkdown, type SavedNoteSnapshot } from "@/lib/markdownDocument";
import {
  ACCENT_COLOR_STORAGE_KEY,
  APP_ZOOM_DEFAULT,
  APP_ZOOM_STEP,
  APP_ZOOM_STORAGE_KEY,
  CONTENT_ZOOM_STEP,
  CONTENT_ZOOM_STORAGE_KEY,
  CONTRAST_STORAGE_KEY,
  DEVELOPER_MODE_STORAGE_KEY,
  DIFF_MARKER_MODE_STORAGE_KEY,
  EDITOR_FONT_SIZE_DEFAULT,
  EDITOR_FONT_SIZE_STORAGE_KEY,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  POINTER_CURSOR_STORAGE_KEY,
  PREVIEW_FONT_SIZE_DEFAULT,
  PREVIEW_FONT_SIZE_STORAGE_KEY,
  PROMPT_EDITOR_FONT_SIZE_DEFAULT,
  PROMPT_EDITOR_FONT_SIZE_MAX,
  PROMPT_EDITOR_FONT_SIZE_MIN,
  PROMPT_EDITOR_FONT_SIZE_STEP,
  READING_DENSITY_STORAGE_KEY,
  REDUCED_MOTION_STORAGE_KEY,
  SETTINGS_FONT_SIZE_DEFAULT,
  SETTINGS_FONT_SIZE_MAX,
  SETTINGS_FONT_SIZE_MIN,
  SETTINGS_FONT_SIZE_STORAGE_KEY,
  TOOLBAR_FONT_SIZE_DEFAULT,
  TOOLBAR_FONT_SIZE_MAX,
  TOOLBAR_FONT_SIZE_MIN,
  TOOLBAR_FONT_SIZE_STORAGE_KEY,
  TRANSLUCENT_SIDEBAR_STORAGE_KEY,
  UI_SCALE_DEFAULT,
  UI_SCALE_STORAGE_KEY,
  clampAppZoom,
  clampContentZoom,
  clampFontSize,
  clampNumberRange,
  getInitialAppZoom,
  getInitialBooleanSetting,
  getInitialContentZoom,
  getInitialDeveloperMode,
  getInitialDiffMarkerMode,
  getInitialFontSize,
  getInitialNumberRange,
  getInitialReadingDensity,
  getInitialReducedMotion,
  getInitialScale,
  type ReadingDensity,
} from "@/lib/appPreferences";
import {
  AI_SIDEBAR_WIDTH_DEFAULT,
  AI_SIDEBAR_WIDTH_MIN,
  EDITOR_PREVIEW_RATIO_DEFAULT,
  LEFT_SIDEBAR_WIDTH_DEFAULT,
  LEFT_SIDEBAR_WIDTH_MAX,
  LEFT_SIDEBAR_WIDTH_MIN,
  clampEditorPreviewRatio,
  getInitialAiSidebarWidth,
  getInitialEditorPreviewRatio,
  getInitialLeftSidebarWidth,
  writeStoredAiSidebarWidth,
  writeStoredEditorPreviewRatio,
  writeStoredLeftSidebarWidth,
} from "@/lib/layoutPreferences";
import { formatSearchDate } from "@/lib/localSearchResults";
import {
  buildLocalIndexStatusMessage,
  deriveLocalIndexTaskView,
  formatLocalIndexSize,
  getLocalIndexAccessLabel,
  getLocalIndexStatusBadgeClassName,
  getLocalIndexStatusBadgeTone,
  getLocalIndexStatusLabel,
  getLocalIndexUpdatedLabel,
} from "@/lib/localIndexStatus";
import { LUOGU_DIFFICULTY_OPTIONS, getDifficultyOptionClassName, getDifficultyOptionTextColor } from "@/lib/luoguDifficulty";
import {
  buildOpenFileTabs,
  getNoteDisplayName,
  getNextOpenTabPathAfterClose,
} from "@/lib/openTabs";
import { analyzeTagListNormalization, applyTagNormalizationPlan, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";
import {
  buildTagTaxonomyStatItems,
  buildTagTaxonomyStats,
  filterTagTaxonomyUserAliases,
  filterTagTaxonomyUserEntries,
  getDisplayedTagTaxonomyList,
  getTagManagerAvailableCandidateCount,
  getTagTaxonomyUserAliases,
  getTagTaxonomyUserEntries,
} from "@/lib/tagTaxonomySettingsModel";
import {
  addTagTaxonomyAlias,
  addTagTaxonomyEntry,
  buildTagTaxonomyConfigExport,
  deleteTagTaxonomyAlias,
  deleteTagTaxonomyEntry,
  mergeTagsStable,
  normalizeUserTagTaxonomyConfig,
  previewTagTaxonomyConfigImportJson,
} from "@/lib/tagTaxonomyUserConfig";
import { createIdleTaskState, createTaskProgress, failTaskState, finishTaskState, isTaskFailed, isTaskPaused, isTaskRunning, startTaskState, updateTaskProgressValue, type TaskProgress, type TaskState } from "@/lib/taskStatus";
import { joinNotePath, normalizeNoteFileName, validateNoteDirectoryPathInput, validateNoteNamePart } from "@/lib/notePathHelpers";
import {
  buildNewNoteMarkdown,
  buildRenameNotePath,
  findEntryCaseInsensitive as findNoteEntryCaseInsensitive,
  getCurrentNoteDirectory,
  getDefaultNewNoteCreateParent as getDefaultNewNoteCreateParentPath,
  getFolderDialogState,
  getNoteDirectories,
  getSelectedTreeCreateParent as getSelectedTreeCreateParentPath,
  getTreeSelectionAfterClear,
  getTreeSelectionAfterDirectorySelect,
  getTreeSelectionAfterFileSelect,
  getTreeSelectionAfterRootSelect,
  removeDeletedNoteWorkspaceReferences,
  rewriteNotePathReference,
  rewriteNoteWorkspaceReferences,
  resolveNewNoteDirectory,
  type NewNoteLocationOption,
} from "@/lib/noteWorkspace";
import { useThemeEngine, type SettingsThemeState } from "@/theme";
import {
  createExternalWorkingCopy,
  createNoteWorkingCopy,
  createUntitledWorkingCopy,
  getNoteWorkingCopyId,
  markWorkingCopySaved,
  updateWorkingCopyContent,
  type WorkingCopy,
} from "@/lib/workingCopies";

// 欢迎内容：未选中文件时在编辑器和预览里显示
const INITIAL_MARKDOWN = `# OI Notebook

OI Notebook 是给 OIer 用的本地笔记工具，目标是把训练中遇到的技巧、题解和 AC 后的心得及时沉淀下来。

## 你可以用它做什么

- 写 Markdown 笔记：左边编辑，右边实时预览，支持标题、列表、代码块、表格、图片和公式。
- 打开本地博客复习：点击左侧 Activity Bar 的"博客"，用更适合阅读的页面回看自己的笔记。
- 用 AI 整理内容：配置 API 后，可以让 AI 补全标题、标签、摘要，也可以尝试润色正文。
- 同步洛谷心得：配置洛谷 Cookie 后，可以把 AC 提交里的沉淀内容同步成笔记。

## 笔记保存在哪里

笔记默认保存在本机数据目录的 \`notes/\` 里。开发版会打开项目里的 \`notes/\`，安装版会打开系统 app data 里的 \`notes/\`。

想看真实位置，可以点设置中心的"数据与存储"。

## 推荐第一步

1. 点左侧笔记列表右上角的"+"，新建一篇 trick 或 problem 笔记。
2. 写几行 Markdown，然后点顶部"保存"。
3. 点左侧 Activity Bar 的"博客"，看看它在本地博客里的效果。

普通写笔记和本地博客不需要配置 AI 或洛谷；这些能力可以等你熟悉后再打开。
`;

const APP_ICON_URL = new URL("../src-tauri/icons/32x32.png", import.meta.url).href;
const APP_EMPTY_STATE_ICON_URL = new URL("../src-tauri/icons/icon.png", import.meta.url).href;
const AI_SIDEBAR_PERF_DEBUG_STORAGE_KEY = "oinb.aiSidebarPerfDebug";

function isAiPerfDebugEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(AI_SIDEBAR_PERF_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const APP_RESIZE_PERF_DEBUG = isAiPerfDebugEnabled();

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
  "aiSidebarOpenClick",
  "aiSidebarOpenStateCommit",
  "aiSidebarFirstVisible",
  "aiSidebarOpenDuration",
  "workbenchLayoutCommit",
  "aiSidebarMountRequested",
  "developerModeEnabled",
  "aiSidebarDeveloperDiagnosticsRender",
  "webSearchPlanCardRender",
  "webSearchSourcesCardRender",
  "searchDiagnosticsPanelRender",
  "researchEngineDiagnosticsSectionRender",
  "researchEngineSelfCheckRun",
  "researchEngineOfflineSampleRun",
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
  if (!APP_RESIZE_PERF_DEBUG || typeof window === "undefined") return null;
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
const ACTIVITY_BAR_BASE_WIDTH = 52;
type DialogMode = "create" | "rename" | "create-folder";
type ConfirmDialogState = {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  resolve: (confirmed: boolean) => void;
};
type NoteLocationOptionId = NewNoteLocationOption;
type EditorViewMode = "split" | "editor" | "preview";
type LuoguImportCenterTab = "scan" | "manual";
type LuoguWriteMode = "createNew" | "overwrite";
type LuoguPrepareProgress = TaskProgress;
type LuoguWriteProgress = TaskProgress;
type AppTheme = ThemeMode;
type ResizeHandleId = "left-sidebar" | "editor-preview" | "ai-sidebar";
type WorkspaceTabId = string;

const TAG_MANAGER_DEBUG_STORAGE_KEY = "oi-notebook.debugTagManager";
const TAG_MANAGER_DEBUG_LOG_STORAGE_KEY = "oi-notebook.debugTagManagerLog";
const TAG_MANAGER_DEBUG_LOG_LIMIT = 300;

function isTagManagerDebugEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(TAG_MANAGER_DEBUG_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function debugTagManager(message: string, detail?: unknown): void {
  recordTagManagerDebugEvent(message, detail);
}

function recordTagManagerDebugEvent(event: string, payload?: unknown): void {
  if (!isTagManagerDebugEnabled()) return;
  try {
    const raw = window.localStorage.getItem(TAG_MANAGER_DEBUG_LOG_STORAGE_KEY) ?? "";
    const entries = raw.split("\n").filter(Boolean);
    entries.push(JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      payload,
    }));
    window.localStorage.setItem(TAG_MANAGER_DEBUG_LOG_STORAGE_KEY, entries.slice(-TAG_MANAGER_DEBUG_LOG_LIMIT).join("\n"));
  } catch {
    // Debug logging must never affect app behavior.
  }
}

interface PolishReviewTab {
  id: string;
  preview: AiPolishPreview;
}

function getReviewStatusLabel(preview: AiPolishPreview, currentFilePath: string | null, currentMarkdown: string): string {
  if (preview.applied) return "已应用";
  if (preview.ignored) return "已取消";
  if (preview.error) return "已过期";
  if (preview.notePath === currentFilePath && preview.scope === "full-note" && currentMarkdown !== preview.originalText) {
    return "内容已变化";
  }
  return "未应用";
}

function getPolishPreviewDisplayStartLine(preview: AiPolishPreview): number {
  if (preview.scope === "full-note") return 1;
  return typeof preview.selectionStartLine === "number" &&
    Number.isFinite(preview.selectionStartLine) &&
    preview.selectionStartLine > 0
    ? Math.floor(preview.selectionStartLine)
    : 1;
}

function getReviewTitle(preview: AiPolishPreview): string {
  if (preview.previewKind === "solution-format") return "题解格式化审核";
  return preview.scope === "full-note" ? "全文润色审核" : "润色选中审核";
}

function getReviewApplyLabel(preview: AiPolishPreview): string {
  if (preview.previewKind === "solution-format") return "应用题解格式化";
  return preview.scope === "full-note" ? "应用全文润色" : "应用到选区";
}

function PolishReviewPane({
  reviewTab,
  currentFilePath,
  currentMarkdown,
  onApply,
  onIgnore,
  onBackToFile,
  onClose,
}: {
  reviewTab: PolishReviewTab;
  currentFilePath: string | null;
  currentMarkdown: string;
  onApply: () => void;
  onIgnore: () => void;
  onBackToFile: () => void;
  onClose: () => void;
}) {
  const { preview } = reviewTab;
  const title = getReviewTitle(preview);
  const applyLabel = getReviewApplyLabel(preview);
  const statusLabel = getReviewStatusLabel(preview, currentFilePath, currentMarkdown);
  const displayStartLine = getPolishPreviewDisplayStartLine(preview);
  const stats = getDiffStats(preview.originalText, preview.polishedText, displayStartLine);
  const canApply = !preview.applied && !preview.ignored && !preview.error && statusLabel !== "内容已变化" && preview.polishedText.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/80 bg-muted/15 px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-base font-semibold text-foreground">{title}</div>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[11px]",
              statusLabel === "内容已变化"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-muted text-muted-foreground",
            )}>
              {statusLabel}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate" title={preview.notePath}>{preview.notePath}</span>
            <span>1 file changed</span>
            <span className="text-emerald-700 dark:text-emerald-300">+{stats.addedRows}</span>
            <span className="text-red-700 dark:text-red-300">-{stats.deletedRows}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onBackToFile}>
            回到文件
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onClose}>
            关闭审核
          </Button>
          {!preview.applied && !preview.ignored && (
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={onIgnore}>
              取消
            </Button>
          )}
          <Button size="sm" className="h-8 px-2.5 text-xs" onClick={onApply} disabled={!canApply}>
            {preview.applied ? "已应用" : applyLabel}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <CodexDiffPreview
          title={title}
          filePath={preview.notePath}
          status={statusLabel}
          statusTone={statusLabel === "内容已变化" || preview.error ? "warning" : "neutral"}
          oldText={preview.originalText}
          newText={preview.polishedText}
          startLine={displayStartLine}
          density="review"
          maxHeightClassName="max-h-full"
        />
        {preview.error && (
          <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
            {preview.error}
          </div>
        )}
      </div>
    </div>
  );
}

const LUOGU_SCAN_PAGE_DELAY_MS = 1500;
const LUOGU_SCAN_MAX_PAGES = 50;
const LUOGU_SCAN_COUNT_OPTIONS: LuoguScanCountLimit[] = [20, 50, 100, 200];
const LUOGU_SCAN_DAYS_OPTIONS: LuoguScanDaysLimit[] = [30, 90, 180, 365];
const LUOGU_PREPARE_CONCURRENCY = 2;
const READING_DENSITY_OPTIONS: Array<{
  id: ReadingDensity;
  label: string;
  description: string;
  lineHeight: number;
  blockSpacing: string;
  listItemSpacing: string;
  calloutSpacing: string;
}> = [
  {
    id: "compact",
    label: "紧凑",
    description: "减少段落和列表间距，适合高信息密度浏览。",
    lineHeight: 1.55,
    blockSpacing: "0.55rem",
    listItemSpacing: "0.15rem",
    calloutSpacing: "0.75rem",
  },
  {
    id: "standard",
    label: "标准",
    description: "保持当前阅读节奏，适合日常编辑和预览。",
    lineHeight: 1.7,
    blockSpacing: "0.75rem",
    listItemSpacing: "0.25rem",
    calloutSpacing: "1rem",
  },
  {
    id: "comfortable",
    label: "宽松",
    description: "增加正文呼吸感，适合长文审阅。",
    lineHeight: 1.85,
    blockSpacing: "1rem",
    listItemSpacing: "0.4rem",
    calloutSpacing: "1.25rem",
  },
];
const SettingsSectionAnchor = ({ id, children }: { id: SettingsSection; children: ReactNode }) => (
  <div data-settings-section={id}>{children}</div>
);
const MARKDOWN_CAPABILITIES = [
  "数学公式",
  "代码高亮与行号",
  "表格与合并单元格",
  "引用块与常用排版组件",
];

interface LuoguScanProgress {
  currentPage: number;
  foundCount: number;
  rangeLabel: string;
  waiting: boolean;
}

interface LuoguScanSummary {
  scannedPages: number;
  foundCount: number;
  candidateCount: number;
  skippedCount: number;
  rangeLabel: string;
}

const COMMON_NOTE_TAGS = ["题解", "技巧", "复盘", "模板", "总结", "调试", "草稿"];

function cloneAiConfig(config: AiConfig): AiConfig {
  return {
    ...config,
    chat_response_style: config.chat_response_style ?? "",
    web_search: normalizeWebSearchConfig(config.web_search),
    providers: config.providers.map((provider) => ({
      ...provider,
      models: provider.models.map((model) => ({ ...model })),
    })),
  };
}

function normalizeAiConfigDraft(config: AiConfig): AiConfig {
  const providers = config.providers.map((provider) => {
    const models = provider.models
      .map((model) => ({
        ...model,
        id: model.id.trim(),
        name: model.name?.trim() || null,
        source: model.source.trim() || "manual",
        updated_at: model.updated_at ?? null,
      }))
      .filter((model, index, items) => model.id && items.findIndex((item) => item.id === model.id) === index);
    const defaultModel = provider.default_model?.trim() || null;

    return {
      ...provider,
      id: provider.id.trim(),
      name: provider.name.trim() || "OpenAI Compatible",
      kind: "openai-compatible",
      base_url: provider.base_url.trim(),
      api_key: provider.api_key.trim(),
      default_model: defaultModel,
      models,
      created_at: provider.created_at ?? Date.now(),
      updated_at: provider.updated_at ?? Date.now(),
    };
  }).filter((provider, index, items) => provider.id && items.findIndex((item) => item.id === provider.id) === index);

  const defaultProvider =
    providers.find((provider) => provider.id === config.default_provider_id) ??
    providers.find((provider) => provider.enabled) ??
    providers[0] ??
    null;
  const defaultModel =
    defaultProvider?.models.find((model) => model.id === config.default_model_id && model.enabled)?.id ??
    defaultProvider?.default_model ??
    null;

  return {
    base_url: defaultProvider?.base_url ?? config.base_url.trim(),
    api_key: defaultProvider?.api_key ?? config.api_key.trim(),
    model: defaultModel ?? config.model.trim(),
    chat_response_style: (config.chat_response_style ?? "").trim().slice(0, 2000),
    providers,
    default_provider_id: defaultProvider?.id ?? null,
    default_model_id: defaultModel,
    web_search: normalizeWebSearchConfig(config.web_search),
  };
}

function createAiProviderDraft(): AiProvider {
  const now = Date.now();
  return {
    id: `provider-${now.toString(36)}`,
    name: "新配置组",
    kind: "openai-compatible",
    base_url: "",
    api_key: "",
    enabled: true,
    default_model: null,
    models: [],
    created_at: now,
    updated_at: now,
  };
}

function createAiModelDraft(modelId: string, source: "manual" | "synced" = "manual"): AiProvider["models"][number] {
  return {
    id: modelId.trim(),
    name: null,
    enabled: true,
    supports_stream: true,
    source,
    updated_at: Date.now(),
  };
}

function formatWebSearchTestError(error: unknown): string {
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();
  if (message.includes("429") || lower.includes("rate limit") || lower.includes("too many requests")) {
    return "搜索服务返回限流。可以稍后重试，或检查当前搜索服务的额度。";
  }
  if (lower.includes("captcha") || lower.includes("blocked") || lower.includes("verify") || lower.includes("errorkind=blocked_or_captcha") || lower.includes("errorkind=blocked")) {
    return "Bing 公开搜索遇到验证页或访问限制。可以稍后重试，或改用 Bocha / Brave。";
  }
  if (lower.includes("rate_limited") || lower.includes("errorkind=rate_limited")) {
    return "Bing 公开搜索被限流。可以稍后重试，或改用 Bocha / Brave。";
  }
  if (lower.includes("parse_failed") || lower.includes("no_results")) {
    return "Bing 公开搜索没有解析到可用结果。可以稍后重试，或改用 Bocha / Brave。";
  }
  if (lower.includes("json") || message.includes("不是 JSON")) {
    return "搜索服务返回格式不符合预期，请检查 Endpoint 是否填写为 API 地址。";
  }
  if (lower.includes("timeout") || message.includes("超时")) {
    return "搜索服务测试超时。请检查 Endpoint 或稍后重试。";
  }
  if (lower.includes("network") || message.includes("网络") || message.includes("不可用") || message.includes("failed")) {
    return "搜索服务暂时不可用。测试失败不影响 AI 模型和设置保存。";
  }
  return message || "搜索测试失败。测试失败不影响设置保存，也不影响普通聊天。";
}

function getAiSidebarWidthMax(): number {
  const appZoom = Number.parseFloat(
    window.getComputedStyle(document.documentElement).getPropertyValue("--app-zoom"),
  );
  const activityBarWidth = ACTIVITY_BAR_BASE_WIDTH * (Number.isFinite(appZoom) ? appZoom : 1);
  return Math.floor(window.innerWidth - activityBarWidth);
}

function clampAiSidebarWidth(value: number): number {
  const maxWidth = Math.max(AI_SIDEBAR_WIDTH_MIN, getAiSidebarWidthMax());
  return clampNumberRange(value, AI_SIDEBAR_WIDTH_MIN, maxWidth);
}

interface PromptUsageInfo {
  title: string;
  scope: string;
  purpose: string;
  variables: PromptVariableInfo[];
  editable: boolean;
}

interface PromptVariableInfo {
  name: string;
  meaning: string;
  usage: string;
}

function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-0 py-2">
      <div className="grid gap-1 py-3">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description && <div className="max-w-4xl text-xs leading-5 text-muted-foreground">{description}</div>}
      </div>
      <div className="grid min-w-0 gap-0 border-t border-border/70">{children}</div>
    </section>
  );
}

interface PromptCodeEditorHandle {
  focus: () => void;
  hasFocus: () => boolean;
  insertVariable: (variableName: string) => boolean;
}

interface PromptCodeEditorProps {
  value: string;
  fontSize: number;
  disabled?: boolean;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onFontSizeChange: (updater: (currentSize: number) => number) => void;
}

function isPromptEditorEventTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest("[data-prompt-editor='true']");
}

const PromptCodeEditor = forwardRef<PromptCodeEditorHandle, PromptCodeEditorProps>(function PromptCodeEditor(
  { value, fontSize, disabled = false, readOnly = false, onChange, onSave, onFontSizeChange },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    hasFocus: () => document.activeElement === textareaRef.current,
    insertVariable: (variableName: string) => {
      const textarea = textareaRef.current;
      const start = textarea ? textarea.selectionStart : value.length;
      const end = textarea ? textarea.selectionEnd : value.length;
      const nextValue = value.slice(0, start) + variableName + value.slice(end);
      onChange(nextValue);
      window.requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        const cursor = start + variableName.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(cursor, cursor);
      });
      return true;
    },
  }), [onChange, value]);

  const handleWheelCapture = (event: WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    event.stopPropagation();
    onFontSizeChange((currentSize) =>
      clampNumberRange(
        currentSize + (event.deltaY < 0 ? PROMPT_EDITOR_FONT_SIZE_STEP : -PROMPT_EDITOR_FONT_SIZE_STEP),
        PROMPT_EDITOR_FONT_SIZE_MIN,
        PROMPT_EDITOR_FONT_SIZE_MAX,
      ),
    );
  };

  const promptEditorLineHeight = Math.round(fontSize * 1.55);
  const promptEditorPaddingY = Math.round(promptEditorLineHeight * 0.45);
  const lineCount = Math.max(value.split("\n").length, 1);
  const promptLineNumbers = useMemo(() => Array.from({ length: lineCount }, (_, index) => index + 1), [lineCount]);
  const maxLineNumberDigits = String(lineCount).length;
  const lineNumberDigitWidth = Math.ceil(fontSize * 0.62);
  const lineNumberLeftPadding = 25;
  const lineNumberRightPadding = 12;
  const lineNumberDigitsWidth = maxLineNumberDigits * lineNumberDigitWidth;
  const lineNumberColumnWidth = Math.min(
    96,
    Math.max(46, lineNumberLeftPadding + lineNumberDigitsWidth + lineNumberRightPadding),
  );
  const editorStyle = {
    fontSize: `${fontSize}px`,
    lineHeight: `${promptEditorLineHeight}px`,
    fontFamily: "var(--font-mono)",
  } as const;
  const editorPaddingStyle = {
    paddingTop: `${promptEditorPaddingY}px`,
    paddingBottom: `${promptEditorPaddingY}px`,
  } as const;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;

    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      event.stopPropagation();
      onSave();
      return;
    }

    if (key === "z" || key === "y" || key === "a" || key === "x" || key === "c" || key === "v") {
      event.stopPropagation();
    }
  };

  return (
    <div
      data-prompt-editor="true"
      className={cn("prompt-code-editor h-full min-h-0 w-full overflow-hidden", (disabled || readOnly) && "opacity-70")}
      onWheelCapture={handleWheelCapture}
    >
      <div className="flex h-full min-h-0 overflow-hidden border border-border/70 bg-background">
        <div
          className="shrink-0 select-none overflow-hidden border-r border-border/40 bg-muted/20 text-muted-foreground"
          style={{ ...editorStyle, width: lineNumberColumnWidth, ...editorPaddingStyle }}
          aria-hidden="true"
        >
          <div style={{ transform: `translateY(${-scrollTop}px)` }}>
            {promptLineNumbers.map((line) => (
              <div
                key={line}
                className="flex items-center tabular-nums"
                style={{
                  height: `${promptEditorLineHeight}px`,
                  lineHeight: `${promptEditorLineHeight}px`,
                  paddingLeft: `${lineNumberLeftPadding}px`,
                  paddingRight: `${lineNumberRightPadding}px`,
                }}
              >
                <span className="block text-center" style={{ width: `${lineNumberDigitsWidth}px` }}>{line}</span>
              </div>
            ))}
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          wrap="off"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          disabled={disabled}
          readOnly={readOnly}
          className="h-full min-w-0 flex-1 resize-none overflow-auto whitespace-pre bg-transparent px-3 text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          style={{ ...editorStyle, ...editorPaddingStyle, whiteSpace: "pre", overflowWrap: "normal", wordBreak: "normal" }}
          onChange={(event) => onChange(event.currentTarget.value)}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          onKeyDownCapture={handleKeyDown}
        />
      </div>
    </div>
  );
});

function getPromptUsageInfo(fileName: string): PromptUsageInfo {
  if (fileName === "luogu-insight.md") {
    return {
      title: "洛谷心得整理",
      scope: "洛谷同步、洛谷导入后的 AI 整理",
      purpose: "用于把洛谷提交中的心得、技巧、坑点整理成结构化笔记。",
      variables: [
        { name: "{{problem_id}}", meaning: "识别到的洛谷题号。", usage: "在模板中写入该变量，执行整理时会替换成题号。" },
        { name: "{{problem_title}}", meaning: "识别到的题目标题。", usage: "适合放在题目背景或输出格式要求里。" },
        { name: "{{problem_difficulty}}", meaning: "洛谷题目难度。", usage: "可选变量；未获取到对应信息时为空。" },
        { name: "{{problem_tags}}", meaning: "洛谷题目标签。", usage: "可选变量；未获取到对应信息时为空。" },
        { name: "{{submission_id}}", meaning: "当前洛谷提交记录 ID。", usage: "用于让 AI 知道这次整理来自哪条提交。" },
        { name: "{{problem_statement_excerpt}}", meaning: "题面摘要。", usage: "可选变量；未获取到对应信息时为空。" },
        { name: "{{candidate_comment}}", meaning: "从提交备注或上下文里提取出的候选心得。", usage: "通常应保留在正文输入区，AI 会基于它判断是否值得导入。" },
      ],
      editable: true,
    };
  }

  if (fileName === "note-metadata.md") {
    return {
      title: "当前笔记元数据",
      scope: "AI 生成标题、标签、摘要建议",
      purpose: "用于根据当前笔记正文生成标题、标签、摘要等元信息建议。",
      variables: [
        { name: "{{note_path}}", meaning: "当前笔记的相对路径。", usage: "在模板中写入该变量，执行时会替换为 notes 内的相对路径。" },
        { name: "{{content}}", meaning: "当前笔记的完整内容。", usage: "用于让 AI 根据正文生成标题、标签和摘要。" },
        { name: "{{tag_context}}", meaning: "根据当前笔记筛选出的标签规则和候选项。", usage: "用于引导 AI 优先使用标签体系中的规范名称。" },
      ],
      editable: true,
    };
  }

  if (fileName === "note-polish.md") {
    return {
      title: "当前笔记全文润色",
      scope: "AI 润色正文、题解格式化审核",
      purpose: "用于润色当前笔记正文，并先生成可预览的结果。",
      variables: [
        { name: "{{note_path}}", meaning: "当前笔记的相对路径。", usage: "可用于提示 AI 保持与当前文件主题一致。" },
        { name: "{{body}}", meaning: "不含笔记元信息的正文内容。", usage: "用于让 AI 只润色正文，不修改笔记元信息。" },
      ],
      editable: true,
    };
  }

  return {
    title: "自定义提示词模板",
    scope: "对应 AI 功能",
    purpose: "用于配置本地 AI 提示词模板。",
    variables: [],
    editable: true,
  };
}

export default function App() {
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [openReviewTabs, setOpenReviewTabs] = useState<PolishReviewTab[]>([]);
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState<WorkspaceTabId | null>(null);
  const [workingCopies, setWorkingCopies] = useState<Record<string, WorkingCopy>>({});
  const [activeWorkingCopyId, setActiveWorkingCopyId] = useState<string | null>(null);
  const workingCopiesRef = useRef<Record<string, WorkingCopy>>({});
  const untitledSequenceRef = useRef(0);
  const persistActiveWorkingCopyRef = useRef<() => void>(() => {});
  // null 时显示欢迎内容，选中文件后只把正文 body 放进主编辑器。
  const [committedMarkdown, setCommittedMarkdown] = useState(INITIAL_MARKDOWN);
  const markdown = committedMarkdown;
  const [frontmatterPrefix, setFrontmatterPrefix] = useState("");
  const [isFrontmatterOpen, setIsFrontmatterOpen] = useState(false);
  const [editorViewMode, setEditorViewMode] = useState<EditorViewMode>("split");
  const [isNotesSidebarOpen, setIsNotesSidebarOpen] = useState(true);
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [isAiSidebarMaximized, setIsAiSidebarMaximized] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(getInitialLeftSidebarWidth);
  const [aiSidebarWidth, setAiSidebarWidth] = useState(() => getInitialAiSidebarWidth(clampAiSidebarWidth));
  const [editorPreviewRatio, setEditorPreviewRatio] = useState(getInitialEditorPreviewRatio);
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandleId | null>(null);
  const [editorSelectedText, setEditorSelectedText] = useState("");
  const [editorSelectedTextLength, setEditorSelectedTextLength] = useState<number | null>(null);
  const [editorCursorOffset, setEditorCursorOffset] = useState<number | null>(null);
  const [aiContextSelectionRange, setAiContextSelectionRange] = useState<MarkdownEditorSelectionRange | null>(null);
  const {
    activeTheme: activeSettingsTheme,
    appTheme,
    applyThemeState,
    resolvedTheme,
    setAppTheme,
    themeState: settingsThemeState,
    themeVariables: settingsThemeVariables,
  } = useThemeEngine();
  const [appZoom, setAppZoom] = useState(getInitialAppZoom);
  const [contentZoom, setContentZoom] = useState(getInitialContentZoom);
  const contentZoomRef = useRef(contentZoom);
  const pendingContentZoomRef = useRef<number | null>(null);
  const contentZoomFrameRef = useRef<number | null>(null);
  const aiSidebarResizePerfRef = useRef({
    pointerDownAt: 0,
    pointerMoveCount: 0,
    pointerMoveSetStateCount: 0,
    rafWidthUpdateCount: 0,
    widthStateCommitCount: 0,
    localStorageWriteCount: 0,
  });
  const aiSidebarOpenPerfRef = useRef({
    openClickAt: 0,
    opening: false,
  });
  const aiSidebarWidthRef = useRef(aiSidebarWidth);
  const aiSidebarDragWidthRef = useRef(aiSidebarWidth);
  const aiSidebarResizeRafRef = useRef<number | null>(null);
  const [uiScale] = useState(() => getInitialScale(UI_SCALE_STORAGE_KEY, UI_SCALE_DEFAULT));
  const [editorFontSize, setEditorFontSize] = useState(() =>
    getInitialFontSize(EDITOR_FONT_SIZE_STORAGE_KEY, EDITOR_FONT_SIZE_DEFAULT),
  );
  const [previewFontSize, setPreviewFontSize] = useState(() =>
    getInitialFontSize(PREVIEW_FONT_SIZE_STORAGE_KEY, PREVIEW_FONT_SIZE_DEFAULT),
  );
  const [readingDensity] = useState<ReadingDensity>(getInitialReadingDensity);
  const [toolbarFontSize] = useState(() =>
    getInitialNumberRange(
      TOOLBAR_FONT_SIZE_STORAGE_KEY,
      TOOLBAR_FONT_SIZE_DEFAULT,
      TOOLBAR_FONT_SIZE_MIN,
      TOOLBAR_FONT_SIZE_MAX,
    ),
  );
  const [settingsFontSize, setSettingsFontSize] = useState(() =>
    getInitialNumberRange(
      SETTINGS_FONT_SIZE_STORAGE_KEY,
      SETTINGS_FONT_SIZE_DEFAULT,
      SETTINGS_FONT_SIZE_MIN,
      SETTINGS_FONT_SIZE_MAX,
    ),
  );
  const [accentColor, setAccentColor] = useState(() => {
    const initialTheme = settingsThemeState.mode === "light" ? settingsThemeState.light : settingsThemeState.dark;
    return initialTheme.theme.accent;
  });
  const [translucentSidebar, setTranslucentSidebar] = useState(() => {
    const initialTheme = settingsThemeState.mode === "light" ? settingsThemeState.light : settingsThemeState.dark;
    return initialTheme.theme.opaqueWindows;
  });
  const [appearanceContrast, setAppearanceContrast] = useState(() => {
    const initialTheme = settingsThemeState.mode === "light" ? settingsThemeState.light : settingsThemeState.dark;
    return initialTheme.theme.contrast;
  });
  const [pointerCursor, setPointerCursor] = useState(() =>
    getInitialBooleanSetting(POINTER_CURSOR_STORAGE_KEY, true),
  );
  const [reducedMotion, setReducedMotion] = useState<ReducedMotionMode>(getInitialReducedMotion);
  const [diffMarkerMode, setDiffMarkerMode] = useState<DiffMarkerMode>(getInitialDiffMarkerMode);
  const [tagTaxonomyConfig, setTagTaxonomyConfig] = useState<UserTagTaxonomyConfig | null>(null);
  const [tagTaxonomyConfigError, setTagTaxonomyConfigError] = useState<string | null>(null);
  const [isLoadingTagTaxonomyConfig, setIsLoadingTagTaxonomyConfig] = useState(false);
  const [isSavingTagTaxonomyConfig, setIsSavingTagTaxonomyConfig] = useState(false);
  const [tagTaxonomySaveError, setTagTaxonomySaveError] = useState<string | null>(null);
  const [blogInfoDraft, setBlogInfoDraft] = useState<BlogConfig>({
    ...DEFAULT_BLOG_CONFIG,
  });
  const [blogConfigError, setBlogConfigError] = useState<string | null>(null);
  const [isLoadingBlogConfig, setIsLoadingBlogConfig] = useState(false);
  const [isSavingBlogConfig, setIsSavingBlogConfig] = useState(false);
  const [tagTaxonomyEntryPathInput, setTagTaxonomyEntryPathInput] = useState("");
  const [tagTaxonomyEntryAliasesInput, setTagTaxonomyEntryAliasesInput] = useState("");
  const [tagTaxonomyAliasNameInput, setTagTaxonomyAliasNameInput] = useState("");
  const [tagTaxonomyAliasTargetInput, setTagTaxonomyAliasTargetInput] = useState("");
  const [tagTaxonomyImportJsonInput, setTagTaxonomyImportJsonInput] = useState("");
  const [tagTaxonomyImportPreview, setTagTaxonomyImportPreview] = useState<TagTaxonomyConfigImportResult | null>(null);
  const [tagTaxonomyImportError, setTagTaxonomyImportError] = useState<string | null>(null);
  const [tagTaxonomyImportMessage, setTagTaxonomyImportMessage] = useState<string | null>(null);
  const tagTaxonomyImportFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isTagTaxonomyEntryListExpanded, setIsTagTaxonomyEntryListExpanded] = useState(false);
  const [isTagTaxonomyAliasListExpanded, setIsTagTaxonomyAliasListExpanded] = useState(false);
  const [tagTaxonomyEntryListQuery, setTagTaxonomyEntryListQuery] = useState("");
  const [tagTaxonomyAliasListQuery, setTagTaxonomyAliasListQuery] = useState("");
  const [tagManagerSession, setTagManagerSession] = useState<{ initialConfig: UserTagTaxonomyConfig; returnTarget: SettingsTarget; initialFilterMode?: TagManagerFilterMode } | null>(null);
  const [isScanningTagNormalization, setIsScanningTagNormalization] = useState(false);
  const [tagNormalizationScanResults, setTagNormalizationScanResults] = useState<TagNormalizationScanResult[] | null>(null);
  const [tagNormalizationScanAllStats, setTagNormalizationScanAllStats] = useState<TagNormalizationScanStats | null>(null);
  const [tagNormalizationScanError, setTagNormalizationScanError] = useState<string | null>(null);
  const [tagNormalizationScanIssueCount, setTagNormalizationScanIssueCount] = useState(0);
  const [selectedTagNormalizationScanPaths, setSelectedTagNormalizationScanPaths] = useState<Set<string>>(() => new Set());
  const [isApplyingTagNormalizationScan, setIsApplyingTagNormalizationScan] = useState(false);
  const [tagNormalizationApplyResult, setTagNormalizationApplyResult] = useState<TagNormalizationApplyResult | null>(null);
  const tagTaxonomyUserConfig = tagTaxonomyConfigError ? null : tagTaxonomyConfig;
  const tagManagerSessionRef = useRef(tagManagerSession);
  const currentFilePathRef = useRef(currentFilePath);
  const [markdownToolbarApi, setMarkdownToolbarApi] = useState<MarkdownEditorToolbarApi | null>(null);
  const editorPreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const {
    handleEditorScroll,
    handlePreviewScroll,
    handleEditorScrollApiChange,
    handlePreviewScrollApiChange,
    requestEditorMeasure,
  } = useEditorPreviewScrollSync();

  useEffect(() => {
    tagManagerSessionRef.current = tagManagerSession;
  }, [tagManagerSession]);

  useEffect(() => {
    currentFilePathRef.current = currentFilePath;
    activeFileKeyRef.current = currentFilePath;
  }, [currentFilePath]);

  const handleNotesChangedForList = useCallback(() => {
    debugTagManager("notes.changed", {
      hasTagManagerSession: Boolean(tagManagerSessionRef.current),
      currentFilePath: currentFilePathRef.current,
      refreshList: true,
    });
  }, []);
  const { files, setFiles, hasLoadedNotes } = useNotesListController({
    onNotesChanged: handleNotesChangedForList,
  });

  useEffect(() => {
    workingCopiesRef.current = workingCopies;
  }, [workingCopies]);

  useEffect(() => {
    contentZoomRef.current = contentZoom;
  }, [contentZoom]);

  useEffect(() => {
    aiSidebarWidthRef.current = aiSidebarWidth;
    aiSidebarDragWidthRef.current = aiSidebarWidth;
  }, [aiSidebarWidth]);

  const loadTagTaxonomyConfig = useCallback(async () => {
    setIsLoadingTagTaxonomyConfig(true);
    try {
      const config = await getTagTaxonomyConfig();
      setTagTaxonomyConfig(mergeConfigWithStoredCustomCollections(config));
      setTagTaxonomyConfigError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Failed to load tag taxonomy config; using builtin taxonomy.", message);
      setTagTaxonomyConfig(mergeConfigWithStoredCustomCollections(null));
      setTagTaxonomyConfigError(message);
    } finally {
      setIsLoadingTagTaxonomyConfig(false);
    }
  }, []);

  useEffect(() => {
    void loadTagTaxonomyConfig();
  }, [loadTagTaxonomyConfig]);

  const loadBlogConfig = useCallback(async () => {
    setIsLoadingBlogConfig(true);
    try {
      const config = await getBlogConfig();
      setBlogInfoDraft(resolveBlogConfigDraft(config));
      setBlogConfigError(null);
    } catch (error) {
      const message = getErrorMessage(error);
      console.warn("Failed to load blog config; using defaults.", message);
      setBlogInfoDraft(resolveBlogConfigDraft(null));
      setBlogConfigError(message);
    } finally {
      setIsLoadingBlogConfig(false);
    }
  }, []);

  useEffect(() => {
    void loadBlogConfig();
  }, [loadBlogConfig]);

  useEffect(() => {
    setEditorSelectedText("");
    setEditorSelectedTextLength(null);
    setEditorCursorOffset(null);
    setAiContextSelectionRange(null);
  }, [currentFilePath]);

  const beginColumnResize = useCallback((handleId: ResizeHandleId, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    if (APP_RESIZE_PERF_DEBUG && handleId === "ai-sidebar") {
      aiSidebarResizePerfRef.current = {
        pointerDownAt: performance.now(),
        pointerMoveCount: 0,
        pointerMoveSetStateCount: 0,
        rafWidthUpdateCount: 0,
        widthStateCommitCount: aiSidebarResizePerfRef.current.widthStateCommitCount,
        localStorageWriteCount: aiSidebarResizePerfRef.current.localStorageWriteCount,
      };
      incrementNoteXAiPerfCounter("appResizePointerDown");
      setNoteXAiPerfEvent("appResizeLastPointerDown", {
        startWidth: aiSidebarWidth,
        at: aiSidebarResizePerfRef.current.pointerDownAt,
      });
    }
    const startX = event.clientX;
    const startLeftSidebarWidth = leftSidebarWidth;
    const startAiSidebarWidth = aiSidebarWidthRef.current;
    const aiSidebarElement = handleId === "ai-sidebar"
      ? event.currentTarget.closest<HTMLElement>(".notex-workbench.ai-sidebar-shell")
      : null;
    const editorPreviewRect = editorPreviewContainerRef.current?.getBoundingClientRect() ?? null;

    setActiveResizeHandle(handleId);
    document.body.classList.add("app-column-resizing");

    if (handleId === "ai-sidebar") {
      aiSidebarDragWidthRef.current = startAiSidebarWidth;
    }

    const applyAiSidebarDragWidth = (nextWidth: number) => {
      if (!aiSidebarElement) return;
      aiSidebarElement.style.width = `${nextWidth}px`;
      aiSidebarElement.style.flexBasis = `${nextWidth}px`;
      aiSidebarElement.style.maxWidth = "100%";
    };

    const scheduleAiSidebarDragWidth = (nextWidth: number) => {
      aiSidebarDragWidthRef.current = nextWidth;
      if (APP_RESIZE_PERF_DEBUG) {
        aiSidebarResizePerfRef.current.pointerMoveCount += 1;
        incrementNoteXAiPerfCounter("appResizePointerMove");
      }
      if (aiSidebarResizeRafRef.current !== null) return;
      aiSidebarResizeRafRef.current = window.requestAnimationFrame(() => {
        aiSidebarResizeRafRef.current = null;
        if (APP_RESIZE_PERF_DEBUG) {
          aiSidebarResizePerfRef.current.rafWidthUpdateCount += 1;
          incrementNoteXAiPerfCounter("appResizeRafCommit");
        }
        applyAiSidebarDragWidth(aiSidebarDragWidthRef.current);
      });
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (handleId === "left-sidebar") {
        setLeftSidebarWidth(
          clampNumberRange(
            startLeftSidebarWidth + moveEvent.clientX - startX,
            LEFT_SIDEBAR_WIDTH_MIN,
            LEFT_SIDEBAR_WIDTH_MAX,
          ),
        );
        return;
      }

      if (handleId === "ai-sidebar") {
        scheduleAiSidebarDragWidth(clampAiSidebarWidth(startAiSidebarWidth + startX - moveEvent.clientX));
        return;
      }

      if (!editorPreviewRect) return;
      const rawRatio = (moveEvent.clientX - editorPreviewRect.left) / editorPreviewRect.width;
      setEditorPreviewRatio(clampEditorPreviewRatio(rawRatio, editorPreviewRect.width));
    };

    const stopResize = () => {
      if (handleId === "ai-sidebar") {
        if (aiSidebarResizeRafRef.current !== null) {
          window.cancelAnimationFrame(aiSidebarResizeRafRef.current);
          aiSidebarResizeRafRef.current = null;
        }
        const finalWidth = aiSidebarDragWidthRef.current;
        applyAiSidebarDragWidth(finalWidth);
        setAiSidebarWidth(finalWidth);
        aiSidebarWidthRef.current = finalWidth;
      }
      if (APP_RESIZE_PERF_DEBUG && handleId === "ai-sidebar") {
        incrementNoteXAiPerfCounter("appResizePointerUp");
        const summary = {
          ...aiSidebarResizePerfRef.current,
          pointerMoveTriggersSetAiSidebarWidth: aiSidebarResizePerfRef.current.pointerMoveSetStateCount > 0,
          durationMs: performance.now() - aiSidebarResizePerfRef.current.pointerDownAt,
        };
        setNoteXAiPerfEvent("appResizeLastSummary", summary);
        console.info("[NoteX Perf] app resize summary", summary);
      }
      setActiveResizeHandle(null);
      document.body.classList.remove("app-column-resizing");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }, [aiSidebarWidth, leftSidebarWidth]);

  const resetColumnSize = useCallback((handleId: ResizeHandleId) => {
    if (handleId === "left-sidebar") {
      setLeftSidebarWidth(LEFT_SIDEBAR_WIDTH_DEFAULT);
      return;
    }

    if (handleId === "ai-sidebar") {
      setAiSidebarWidth(clampAiSidebarWidth(AI_SIDEBAR_WIDTH_DEFAULT));
      return;
    }

    setEditorPreviewRatio(EDITOR_PREVIEW_RATIO_DEFAULT);
  }, []);
  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [newNoteLocationOption, setNewNoteLocationOption] = useState<NoteLocationOptionId>("current");
  const [newNoteCustomDirectory, setNewNoteCustomDirectory] = useState("");
  const [newNoteTags, setNewNoteTags] = useState<string[]>([]);
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [isTagNormalizationDetailsOpen, setIsTagNormalizationDetailsOpen] = useState(false);
  const [folderParentDirectory, setFolderParentDirectory] = useState("");
  const [returnToCreateAfterFolder, setReturnToCreateAfterFolder] = useState(false);
  const [activeTreeDirectoryPath, setActiveTreeDirectoryPath] = useState<string | null>(null);
  const [activeTreeFilePath, setActiveTreeFilePath] = useState<string | null>(null);
  const [isTreeRootCollapsed, setIsTreeRootCollapsed] = useState(false);
  const [createFileRequest, setCreateFileRequest] = useState<{ parentPath: string; requestId: number } | null>(null);
  const [createFolderRequest, setCreateFolderRequest] = useState<{ parentPath: string; requestId: number } | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameTargetIsDirectory, setRenameTargetIsDirectory] = useState(false);
  const [isRestartingBlog, setIsRestartingBlog] = useState(false);
  const [isLuoguDialogOpen, setIsLuoguDialogOpen] = useState(false);
  const [isLuoguSettingsOpen, setIsLuoguSettingsOpen] = useState(false);
  const [isLoadingLuoguConfig, setIsLoadingLuoguConfig] = useState(false);
  const [isSavingLuoguConfig, setIsSavingLuoguConfig] = useState(false);
  const [isTestingLuoguConnection, setIsTestingLuoguConnection] = useState(false);
  const [luoguConnectionResult, setLuoguConnectionResult] = useState<TestLuoguConnectionResult | null>(null);
  const [luoguConnectionError, setLuoguConnectionError] = useState<string | null>(null);
  const [isScanningLuoguPreview, setIsScanningLuoguPreview] = useState(false);
  const [isLuoguScanPaused, setIsLuoguScanPaused] = useState(false);
  const luoguScanPauseFlagRef = useRef(false);
  const luoguScanResumeRef = useRef<{
    submissions: PreviewLuoguSubmission[];
    seenSubmissionIds: Set<string>;
    nextPage: number;
    latestPageResult: Awaited<ReturnType<typeof previewLuoguSubmissionPage>> | null;
    scannedPages: number;
    cutoffMs: number | null;
    rangeLabel: string;
  } | null>(null);
  const [luoguPreviewResult, setLuoguPreviewResult] = useState<PreviewLuoguSubmissionsResult | null>(null);
  const [luoguScanError, setLuoguScanError] = useState<string | null>(null);
  const [luoguScanMode, setLuoguScanMode] = useState<LuoguScanMode>("count");
  const [luoguScanCountLimit, setLuoguScanCountLimit] = useState<LuoguScanCountLimit>(20);
  const [luoguScanDaysLimit, setLuoguScanDaysLimit] = useState<LuoguScanDaysLimit>(30);
  const [luoguImportRules, setLuoguImportRules] = useState<LuoguImportRules>(readStoredLuoguImportRules);
  const [expandedLuoguRuleId, setExpandedLuoguRuleId] = useState<string | null>(null);
  const [expandedWebSearchSelectId, setExpandedWebSearchSelectId] = useState<string | null>(null);
  const [luoguScanProgress, setLuoguScanProgress] = useState<LuoguScanProgress | null>(null);
  const [luoguScanSummary, setLuoguScanSummary] = useState<LuoguScanSummary | null>(null);
  const [selectedLuoguSubmissionIds, setSelectedLuoguSubmissionIds] = useState<Set<string>>(() => new Set());
  const [skippedLuoguSubmissionIds, setSkippedLuoguSubmissionIds] = useState<Set<string>>(() => new Set());
  const [isPreparingSelectedLuogu, setIsPreparingSelectedLuogu] = useState(false);
  const [luoguPreparedNotesById, setLuoguPreparedNotesById] = useState<Record<string, PrepareLuoguSubmissionNoteResult>>({});
  const [luoguPrepareErrorsById, setLuoguPrepareErrorsById] = useState<Record<string, string>>({});
  const [luoguPrepareStatusesById, setLuoguPrepareStatusesById] = useState<Record<string, LuoguPrepareItemStatus>>({});
  const [currentlyPreparingLuoguId, setCurrentlyPreparingLuoguId] = useState<string | null>(null);
  const [luoguPrepareProgress, setLuoguPrepareProgress] = useState<LuoguPrepareProgress | null>(null);
  const [isStoppingLuoguPrepare, setIsStoppingLuoguPrepare] = useState(false);
  const [isWritingPreparedLuogu, setIsWritingPreparedLuogu] = useState(false);
  const [luoguWriteResultsById, setLuoguWriteResultsById] = useState<Record<string, WriteLuoguPreparedNoteResult>>({});
  const [currentlyWritingLuoguId, setCurrentlyWritingLuoguId] = useState<string | null>(null);
  const [luoguWriteProgress, setLuoguWriteProgress] = useState<LuoguWriteProgress | null>(null);
  const [activeLuoguPreparedPreviewId, setActiveLuoguPreparedPreviewId] = useState<string | null>(null);
  const [activeLuoguPreviewDetailTab, setActiveLuoguPreviewDetailTab] = useState<LuoguPreviewDetailTab>("rendered");
  const [editedLuoguPreparedMarkdownIds, setEditedLuoguPreparedMarkdownIds] = useState<Set<string>>(() => new Set());
  const [reviewSelectedLuoguSubmissionIds, setReviewSelectedLuoguSubmissionIds] = useState<Set<string>>(() => new Set());
  const [luoguImportCenterTab, setLuoguImportCenterTab] = useState<LuoguImportCenterTab>("scan");
  const [luoguImportStep, setLuoguImportStep] = useState<LuoguImportStep>("scan");
  const isSyncingLuogu = false;
  const [luoguSyncResult] = useState<SyncLuoguInsightsResult | null>(null);
  const [luoguConfigUid, setLuoguConfigUid] = useState("");
  const [luoguConfigClientId, setLuoguConfigClientId] = useState("");
  const [luoguConfigLastSubmissionId, setLuoguConfigLastSubmissionId] = useState("");
  const [luoguConfigAiConfigured, setLuoguConfigAiConfigured] = useState(false);
  const resetLuoguPreparationWorkspace = useCallback(() => {
    const workspace = createEmptyLuoguPreparationWorkspace<PrepareLuoguSubmissionNoteResult, WriteLuoguPreparedNoteResult>();
    setSkippedLuoguSubmissionIds(workspace.skippedSubmissionIds);
    setLuoguPreparedNotesById(workspace.preparedNotesById);
    setLuoguPrepareErrorsById(workspace.prepareErrorsById);
    setLuoguPrepareStatusesById(workspace.prepareStatusesById);
    setEditedLuoguPreparedMarkdownIds(workspace.editedPreparedMarkdownIds);
    setReviewSelectedLuoguSubmissionIds(workspace.reviewSelectedSubmissionIds);
    setCurrentlyPreparingLuoguId(workspace.currentlyPreparingId);
    setLuoguPrepareProgress(workspace.prepareProgress);
    setIsStoppingLuoguPrepare(workspace.isStoppingPrepare);
    setLuoguWriteResultsById(workspace.writeResultsById);
    setCurrentlyWritingLuoguId(workspace.currentlyWritingId);
    setLuoguWriteProgress(workspace.writeProgress);
    setActiveLuoguPreparedPreviewId(workspace.activePreparedPreviewId);
    setActiveLuoguPreviewDetailTab(workspace.activePreviewDetailTab);
    setLuoguImportStep(workspace.importStep);
  }, []);
  const applyLuoguConfigFormState = useCallback((config: LuoguConfig) => {
    const formState = buildLuoguConfigFormState(config);
    setLuoguConfigUid(formState.uid);
    setLuoguConfigClientId(formState.clientId);
    setLuoguConfigLastSubmissionId(formState.lastSubmissionId);
    setLuoguConfigAiConfigured(formState.aiConfigured);
  }, []);
  const isUpdatingLuoguLastSubmissionId = false;
  const [isLoadingAiConfig, setIsLoadingAiConfig] = useState(false);
  const [isSavingAiConfig, setIsSavingAiConfig] = useState(false);
  const [isTestingWebSearchConnection, setIsTestingWebSearchConnection] = useState(false);
  const [webSearchConnectionMessage, setWebSearchConnectionMessage] = useState<string | null>(null);
  const [isClearingWebCache, setIsClearingWebCache] = useState(false);
  const [webCacheMessage, setWebCacheMessage] = useState<string | null>(null);
  const [localIndexStatus, setLocalIndexStatus] = useState<LocalNoteIndexStatusResult | null>(null);
  const [localIndexLoadTask, setLocalIndexLoadTask] = useState<TaskState>(createIdleTaskState);
  const [localIndexRebuildTask, setLocalIndexRebuildTask] = useState<TaskState>(createIdleTaskState);
  const [localIndexMessage, setLocalIndexMessage] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [aiConfigDraft, setAiConfigDraft] = useState<AiConfig | null>(null);
  const [chatResponseStyleDraft, setChatResponseStyleDraft] = useState("");
  const [selectedAiProviderId, setSelectedAiProviderId] = useState("");
  const [aiManualModelId, setAiManualModelId] = useState("");
  const [aiModelSearchQuery, setAiModelSearchQuery] = useState("");
  const [aiProviderBusyId, setAiProviderBusyId] = useState<string | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateSummary[]>([]);
  const [selectedPromptFileName, setSelectedPromptFileName] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [settingsCenterRect, setSettingsCenterRect] = useState<SettingsCenterRect>(getDefaultSettingsCenterRect);
  const [isSettingsCenterMaximized, setIsSettingsCenterMaximized] = useState(false);
  const [luoguDialogRect, setLuoguDialogRect] = useState<SettingsCenterRect>(getDefaultLuoguDialogRect);
  const [isLuoguDialogMaximized, setIsLuoguDialogMaximized] = useState(false);
  const [luoguDialogReturnTarget, setLuoguDialogReturnTarget] = useState<SettingsTarget | null>(null);
  const [isPolishingPrompt, setIsPolishingPrompt] = useState(false);
  const [promptPolishMessage, setPromptPolishMessage] = useState<string | null>(null);
  const [promptEditorFontSize, setPromptEditorFontSize] = useState(PROMPT_EDITOR_FONT_SIZE_DEFAULT);
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(getInitialDeveloperMode);
  const [pendingFileSelection, setPendingFileSelection] = useState<{ path: string; closeSearchOnSuccess: boolean } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [isImportingLuogu, setIsImportingLuogu] = useState(false);
  const [hasLoadedAiConfigStatus, setHasLoadedAiConfigStatus] = useState(false);
  const [hasLoadedLuoguConfigStatus, setHasLoadedLuoguConfigStatus] = useState(false);
  const [luoguProblemId, setLuoguProblemId] = useState("");
  const [luoguProblemTitle, setLuoguProblemTitle] = useState("");
  const [luoguSubmissionId, setLuoguSubmissionId] = useState("");
  const [luoguSourceCode, setLuoguSourceCode] = useState("");
  const [, setPendingAssetsByFile] = useState<Record<string, string[]>>({});
  const [previewMarkdown, setPreviewMarkdown] = useState(INITIAL_MARKDOWN);
  const settingsCenterHostRef = useRef<SettingsCenterHostHandle>(null);
  const settingsCenterOpenRef = useRef(false);
  const settingsCenterMaximizedRef = useRef(false);
  const aiSidebarOpenRef = useRef(false);
  const settingsCenterActivePageRef = useRef<SettingsSection>(SETTINGS_SECTION_FALLBACK.general);
  const settingsCenterViewRef = useRef<SettingsView>("main");
  const settingsContentRef = useRef<HTMLDivElement>(null);
  const hasRequestedPromptTemplatesRef = useRef(false);
  const settingsCenterPanelRef = useRef<HTMLDivElement>(null);
  const luoguDialogPanelRef = useRef<HTMLElement>(null);
  const promptEditorRef = useRef<PromptCodeEditorHandle>(null);
  const promptEditorHadFocusBeforeVariableClickRef = useRef(false);
  const settingsCenterRestoreRectRef = useRef<SettingsCenterRect | null>(null);
  const luoguDialogRestoreRectRef = useRef<SettingsCenterRect | null>(null);
  const luoguSelectAllCheckboxRef = useRef<HTMLInputElement>(null);
  const promptPolishRunRef = useRef(0);
  const settingsCloseCleanupRafRef = useRef<number | null>(null);
  const settingsCloseCleanupTimeoutRef = useRef<number | null>(null);
  const luoguPrepareRunSeqRef = useRef(0);
  const luoguPrepareRunRef = useRef<{ id: number; cancelled: boolean }>({ id: 0, cancelled: false });
  const isMountedRef = useRef(true);
  const pendingAutoSaveDraftRef = useRef<AiConfig | null>(null);
  const requestConfirm = useCallback((options: Omit<ConfirmDialogState, "resolve">) => {
    return new Promise<boolean>((resolve) => {
      setConfirmDialog({ ...options, resolve });
    });
  }, []);
  const handleConfirmDialogCancel = useCallback(() => {
    setConfirmDialog((current) => {
      current?.resolve(false);
      return null;
    });
  }, []);
  const handleConfirmDialogConfirm = useCallback(() => {
    setConfirmDialog((current) => {
      current?.resolve(true);
      return null;
    });
  }, []);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingAiConfigRef = useRef(false);
  const aiConfigRef = useRef<AiConfig | null>(null);
  const aiConfigDraftRef = useRef<AiConfig | null>(null);
  const pendingChatResponseStyleRef = useRef<string | null>(null);
  const chatResponseStyleAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingChatResponseStyleRef = useRef(false);
  const skipNextReadForPathRef = useRef<string | null>(null);
  const savedSnapshotRef = useRef<SavedNoteSnapshot>({
    path: null,
    frontmatterPrefix: "",
    markdown: INITIAL_MARKDOWN,
  });
  const markdownLiveRef = useRef(INITIAL_MARKDOWN);
  const activeFileKeyRef = useRef<string | null>(null);
  const externalDocVersionRef = useRef(0);
  const editorDocVersionRef = useRef(0);
  const lastCommittedVersionRef = useRef(0);
  const pendingCommitTimerRef = useRef<number | null>(null);
  const pendingCommitRafRef = useRef<number | null>(null);
  const pendingCommitVersionRef = useRef<number | null>(null);
  const pendingPreviewTimerRef = useRef<number | null>(null);
  const pendingPreviewRafRef = useRef<number | null>(null);
  const pendingPreviewVersionRef = useRef<number | null>(null);
  const lastPreviewMarkdownRef = useRef(INITIAL_MARKDOWN);
  const lastPreviewVersionRef = useRef(0);
  const pendingChangeQueueRef = useRef<Array<{ version: number; length: number }>>([]);
  const [externalDocVersion, setExternalDocVersion] = useState(0);
  useEffect(() => {
    aiConfigRef.current = aiConfig;
  }, [aiConfig]);

  useEffect(() => {
    aiConfigDraftRef.current = aiConfigDraft;
  }, [aiConfigDraft]);

  const cancelPendingSettingsCenterCloseCleanup = () => {
    if (settingsCloseCleanupRafRef.current !== null) {
      window.cancelAnimationFrame(settingsCloseCleanupRafRef.current);
      settingsCloseCleanupRafRef.current = null;
    }
    if (settingsCloseCleanupTimeoutRef.current !== null) {
      window.clearTimeout(settingsCloseCleanupTimeoutRef.current);
      settingsCloseCleanupTimeoutRef.current = null;
    }
  };
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      luoguPrepareRunRef.current.cancelled = true;
      cancelPendingSettingsCenterCloseCleanup();
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
      if (chatResponseStyleAutoSaveTimerRef.current) {
        window.clearTimeout(chatResponseStyleAutoSaveTimerRef.current);
      }
      if (pendingCommitRafRef.current !== null) {
        window.cancelAnimationFrame(pendingCommitRafRef.current);
      }
      if (pendingCommitTimerRef.current !== null) {
        window.clearTimeout(pendingCommitTimerRef.current);
      }
      if (pendingPreviewRafRef.current !== null) {
        window.cancelAnimationFrame(pendingPreviewRafRef.current);
      }
      if (pendingPreviewTimerRef.current !== null) {
        window.clearTimeout(pendingPreviewTimerRef.current);
      }
    };
  }, []);

  const cancelPendingPreviewSync = useCallback((markStale = false) => {
    let cancelledPendingPreview = false;
    if (pendingPreviewRafRef.current !== null) {
      window.cancelAnimationFrame(pendingPreviewRafRef.current);
      pendingPreviewRafRef.current = null;
      cancelledPendingPreview = true;
    }
    if (pendingPreviewTimerRef.current !== null) {
      window.clearTimeout(pendingPreviewTimerRef.current);
      pendingPreviewTimerRef.current = null;
      cancelledPendingPreview = true;
    }
    if (cancelledPendingPreview) {
      pendingPreviewVersionRef.current = null;
      markPreviewScheduleCancelled();
      if (markStale) {
        markPreviewStaleRender();
      }
    }
  }, []);

  const setPreviewMarkdownSnapshot = useCallback((nextMarkdown: string, version: number) => {
    lastPreviewVersionRef.current = version;
    if (lastPreviewMarkdownRef.current === nextMarkdown) {
      return;
    }
    lastPreviewMarkdownRef.current = nextMarkdown;
    markPreviewMarkdownSet(nextMarkdown.length);
    setPreviewMarkdown(nextMarkdown);
  }, []);

  const schedulePreviewMarkdownSync = useCallback((nextMarkdown: string, version: number) => {
    if (lastPreviewVersionRef.current === version && lastPreviewMarkdownRef.current === nextMarkdown) return;
    if (pendingPreviewRafRef.current !== null || pendingPreviewTimerRef.current !== null) {
      cancelPendingPreviewSync(true);
    }

    markPreviewMarkdownSchedule(nextMarkdown.length);
    pendingPreviewVersionRef.current = version;
    const scheduledVersion = pendingPreviewVersionRef.current;
    const delayMs = getPreviewMarkdownSyncDelayMs(nextMarkdown.length, getPreviewPerfStats()?.lastParseMs ?? 0);
    pendingPreviewTimerRef.current = window.setTimeout(() => {
      pendingPreviewTimerRef.current = null;
      pendingPreviewVersionRef.current = null;
      if (scheduledVersion !== editorDocVersionRef.current || scheduledVersion !== version) {
        markPreviewStaleRender();
        return;
      }
      setPreviewMarkdownSnapshot(nextMarkdown, version);
    }, delayMs);
  }, [cancelPendingPreviewSync, setPreviewMarkdownSnapshot]);

  const cancelPendingCommittedSync = useCallback((markStale = false) => {
    let cancelledPendingCommit = false;
    if (pendingCommitRafRef.current !== null) {
      window.cancelAnimationFrame(pendingCommitRafRef.current);
      pendingCommitRafRef.current = null;
      cancelledPendingCommit = true;
    }
    if (pendingCommitTimerRef.current !== null) {
      window.clearTimeout(pendingCommitTimerRef.current);
      pendingCommitTimerRef.current = null;
      cancelledPendingCommit = true;
    }
    if (cancelledPendingCommit) {
      pendingCommitVersionRef.current = null;
      if (markStale) {
        markPreviewStaleRender();
      }
    }
  }, []);

  const commitMarkdownSnapshot = useCallback((nextMarkdown: string, version: number) => {
    lastCommittedVersionRef.current = version;
    pendingChangeQueueRef.current = [];
    if (committedMarkdown === nextMarkdown) {
      return;
    }
    setCommittedMarkdown(nextMarkdown);
    markCommittedMarkdownSet(nextMarkdown.length);
  }, [committedMarkdown]);

  const flushCommittedMarkdownSync = useCallback(() => {
    cancelPendingCommittedSync();
    commitMarkdownSnapshot(markdownLiveRef.current, editorDocVersionRef.current);
  }, [cancelPendingCommittedSync, commitMarkdownSnapshot]);

  const scheduleCommittedMarkdownSync = useCallback(() => {
    if (lastCommittedVersionRef.current === editorDocVersionRef.current) return;
    if (pendingCommitRafRef.current !== null || pendingCommitTimerRef.current !== null) {
      cancelPendingCommittedSync(true);
    }

    markCommittedMarkdownSchedule(markdownLiveRef.current.length);
    pendingCommitVersionRef.current = editorDocVersionRef.current;
    pendingCommitRafRef.current = window.requestAnimationFrame(() => {
      pendingCommitRafRef.current = null;
      if (pendingCommitTimerRef.current !== null) {
        window.clearTimeout(pendingCommitTimerRef.current);
        markPreviewStaleRender();
      }
      const scheduledVersion = pendingCommitVersionRef.current;
      const delayMs = getCommittedMarkdownSyncDelayMs(markdownLiveRef.current.length, getPreviewPerfStats()?.lastParseMs ?? 0);
      pendingCommitTimerRef.current = window.setTimeout(() => {
        pendingCommitTimerRef.current = null;
        pendingCommitVersionRef.current = null;
        if (scheduledVersion !== editorDocVersionRef.current) {
          markPreviewStaleRender();
          return;
        }
        if (lastCommittedVersionRef.current === editorDocVersionRef.current) return;
        commitMarkdownSnapshot(markdownLiveRef.current, editorDocVersionRef.current);
      }, delayMs);
    });
  }, [cancelPendingCommittedSync, commitMarkdownSnapshot]);

  const replaceEditorDocument = useCallback((nextMarkdown: string, path: string | null, nextFrontmatterPrefix: string) => {
    cancelPendingCommittedSync();
    cancelPendingPreviewSync();
    activeFileKeyRef.current = path;
    markdownLiveRef.current = nextMarkdown;
    editorDocVersionRef.current += 1;
    externalDocVersionRef.current += 1;
    pendingChangeQueueRef.current = [];
    lastCommittedVersionRef.current = editorDocVersionRef.current;
    setFrontmatterPrefix(nextFrontmatterPrefix);
    markCommittedMarkdownSet(nextMarkdown.length);
    setCommittedMarkdown(nextMarkdown);
    setPreviewMarkdownSnapshot(nextMarkdown, editorDocVersionRef.current);
    setExternalDocVersion(externalDocVersionRef.current);
  }, [cancelPendingCommittedSync, cancelPendingPreviewSync, setPreviewMarkdownSnapshot]);

  const getLiveFullMarkdown = useCallback(() => (
    currentFilePathRef.current === null
      ? markdownLiveRef.current
      : combineMarkdown(frontmatterPrefix, markdownLiveRef.current)
  ), [frontmatterPrefix]);
  const getLiveWorkingCopyContent = useCallback(() => ({
    frontmatterPrefix,
    markdown: markdownLiveRef.current,
  }), [frontmatterPrefix]);

  useEffect(() => {
    setEditorSelectedTextLength(null);
  }, [currentFilePath, editorViewMode]);
  const noteFiles = useMemo(() => files.filter((file) => !file.isDirectory), [files]);
  const collectionCandidatesFromNotes = useCollectionCandidatesFromNotes(noteFiles);
  const deferredFullMarkdown = useMemo(
    () => (currentFilePath === null ? previewMarkdown : combineMarkdown(frontmatterPrefix, previewMarkdown)),
    [currentFilePath, previewMarkdown, frontmatterPrefix],
  );
  const bodyStartLine = 1;
  const frontmatter = useMemo(() => parseFrontmatterFields(deferredFullMarkdown), [deferredFullMarkdown]);
  const frontmatterDisplayTags = useMemo(() => getDisplayTags(frontmatter.fields.tags), [frontmatter.fields.tags]);
  const effectiveCollections = useMemo(() => getEffectiveCollections(frontmatter.fields), [frontmatter.fields]);
  const collectionCandidates = useMemo(
    () => buildCollectionCandidates(frontmatter.fields, tagTaxonomyConfig?.customCollections ?? [], collectionCandidatesFromNotes),
    [collectionCandidatesFromNotes, frontmatter.fields, tagTaxonomyConfig?.customCollections],
  );
  const tagNormalizationPlan = useMemo(
    () => analyzeTagListNormalization(frontmatterDisplayTags, { userConfig: tagTaxonomyUserConfig }),
    [frontmatterDisplayTags, tagTaxonomyUserConfig],
  );
  const tagNormalizationSuggestions = tagNormalizationPlan.suggestions;
  useEffect(() => {
    if (tagNormalizationSuggestions.length === 0) {
      setIsTagNormalizationDetailsOpen(false);
    }
  }, [tagNormalizationSuggestions.length]);
  const {
    luoguSubmissionCandidateStates,
    luoguCurrentCandidateCount,
    luoguScanResultStats,
    luoguSelectableSubmissionIds,
    displayedLuoguPreviewSubmissions,
    areAllLuoguSelectableSubmissionsSelected,
    isLuoguSelectableSelectionMixed,
    selectedLuoguImportCount,
    preparedLuoguNotes,
    writableLuoguPreparedNotes,
    hasReusableLuoguPreparedPreview,
    selectedLuoguPreviewSubmissions,
    luoguPrepareQueueSubmissions,
    luoguReusablePreviewCount,
    currentlyPreparingLuoguSubmission,
    activeLuoguPreparedPreview,
  } = useLuoguImportController({
    luoguPreviewResult,
    luoguImportRules,
    selectedLuoguSubmissionIds,
    skippedLuoguSubmissionIds,
    luoguPreparedNotesById,
    luoguWriteResultsById,
    reviewSelectedLuoguSubmissionIds,
    currentlyPreparingLuoguId,
    activeLuoguPreparedPreviewId,
  });
  const luoguScanResultSummaryLabel = formatLuoguScanResultSummary({
    isPaused: isLuoguScanPaused,
    progress: luoguScanProgress,
    summary: luoguScanSummary,
    hasPreviewResult: Boolean(luoguPreviewResult),
    stats: luoguScanResultStats,
  });
  const luoguScanTaskState = deriveLuoguScanTaskState({
    isScanning: isScanningLuoguPreview,
    isPaused: isLuoguScanPaused,
    progress: luoguScanProgress,
    summary: luoguScanSummary,
    error: luoguScanError,
  });
  const isLuoguScanTaskRunning = isTaskRunning(luoguScanTaskState);
  const isLuoguScanTaskPaused = isTaskPaused(luoguScanTaskState);
  const isLuoguScanTaskFailed = isTaskFailed(luoguScanTaskState);
  const luoguPrepareButtonLabel = formatLuoguPrepareButtonLabel({
    isPreparing: isPreparingSelectedLuogu,
    progress: luoguPrepareProgress,
    prepareQueueCount: luoguPrepareQueueSubmissions.length,
    reusablePreviewCount: luoguReusablePreviewCount,
  });
  const luoguPreviewReviewSummaryLabel = formatLuoguPreviewReviewSummary({
    prepareProgress: luoguPrepareProgress,
    writeProgress: luoguWriteProgress,
    preparedCount: preparedLuoguNotes.length,
    writableCount: writableLuoguPreparedNotes.length,
  });
  const isLuoguImportCenterBusyNow = isLuoguImportCenterBusy({
    isImporting: isImportingLuogu,
    isPreparing: isPreparingSelectedLuogu,
    isWriting: isWritingPreparedLuogu,
    isScanning: isScanningLuoguPreview,
    isSyncing: isSyncingLuogu,
  });
  useEffect(() => {
    if (luoguSelectAllCheckboxRef.current) {
      luoguSelectAllCheckboxRef.current.indeterminate = isLuoguSelectableSelectionMixed;
    }
  }, [isLuoguSelectableSelectionMixed]);
  const showEditorPane = editorViewMode !== "preview";
  const showPreviewPane = editorViewMode !== "editor";
  const editorViewModeButtons: Array<{
    id: EditorViewMode;
    label: string;
    icon: typeof Columns2;
  }> = [
    { id: "split", label: "双栏", icon: Columns2 },
    { id: "editor", label: "仅编辑", icon: SquarePen },
    { id: "preview", label: "仅预览", icon: Eye },
  ];
  const editorViewModeSwitcher = (
    <div className="editor-view-mode-switcher flex items-center gap-1" aria-label="编辑器视图模式">
      {editorViewModeButtons.map((mode) => {
        const Icon = mode.icon;
        const isActive = editorViewMode === mode.id;

        return (
          <Button
            key={mode.id}
            type="button"
            variant={isActive ? "secondary" : "ghost"}
            size="icon"
            className={cn(
              "editor-view-mode-button h-7 w-7 text-muted-foreground",
              isActive && "editor-view-mode-button-active text-foreground",
            )}
            onClick={() => setEditorViewMode(mode.id)}
            aria-pressed={isActive}
            aria-label={mode.label}
            title={mode.label}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
  const aiConfigured =
    aiConfig?.providers.some((provider) => (
      provider.enabled &&
      provider.base_url.trim() !== "" &&
      provider.api_key.trim() !== "" &&
      (provider.default_model?.trim() || provider.models.some((model) => model.enabled && model.id.trim() !== ""))
    )) ??
    Boolean(aiConfig?.base_url.trim() && aiConfig?.api_key.trim() && aiConfig?.model.trim());
  const selectedAiProvider =
    aiConfigDraft?.providers.find((provider) => provider.id === selectedAiProviderId) ?? null;
  const webSearchDraft = useMemo(
    () => normalizeWebSearchConfig(aiConfigDraft?.web_search),
    [aiConfigDraft?.web_search],
  );
  const filteredAiProviderModels = useMemo(() => {
    if (!selectedAiProvider) return [];
    const query = aiModelSearchQuery.trim().toLowerCase();
    if (!query) return selectedAiProvider.models;
    return selectedAiProvider.models.filter((model) =>
      model.id.toLowerCase().includes(query) ||
      (model.name?.toLowerCase().includes(query) ?? false) ||
      model.source.toLowerCase().includes(query),
    );
  }, [aiModelSearchQuery, selectedAiProvider]);
  const luoguConfigured =
    luoguConfigUid.trim() !== "" &&
    luoguConfigClientId.trim() !== "";
  const activeWorkingCopy = activeWorkingCopyId ? workingCopies[activeWorkingCopyId] ?? null : null;
  const hasActiveEditorDocument = Boolean(currentFilePath || activeWorkingCopy);
  const activeEditorDirty = activeWorkingCopy?.dirty ?? isDirty;
  const saveStatusLabel = getSaveStatusLabel({
    hasActiveEditorDocument,
    isSavingNote,
    isDirty: activeEditorDirty,
  });
  const blogStatusLabel = getBlogStatusLabel(isRestartingBlog);
  const aiStatusLabel =
    !hasLoadedAiConfigStatus || isLoadingAiConfig ? "读取中" : aiConfigured ? "已配置" : "未配置";
  const tagTaxonomyStats = useMemo(
    () => buildTagTaxonomyStats({
      config: tagTaxonomyConfig,
      userConfig: tagTaxonomyUserConfig,
      isLoading: isLoadingTagTaxonomyConfig,
      loadError: tagTaxonomyConfigError,
    }),
    [isLoadingTagTaxonomyConfig, tagTaxonomyConfig, tagTaxonomyConfigError, tagTaxonomyUserConfig],
  );
  const tagTaxonomyStatItems = useMemo(
    () => buildTagTaxonomyStatItems(tagTaxonomyStats),
    [tagTaxonomyStats],
  );
  const tagNormalizationScanStats = useMemo(
    () => getTagNormalizationScanStats(tagNormalizationScanAllStats, tagNormalizationScanResults),
    [tagNormalizationScanAllStats, tagNormalizationScanResults],
  );
  const tagNormalizationScanTaskState = deriveTagNormalizationScanTaskState({
    isScanning: isScanningTagNormalization,
    error: tagNormalizationScanError,
    results: tagNormalizationScanResults,
    stats: tagNormalizationScanStats,
  });
  const isTagNormalizationScanTaskRunning = isTaskRunning(tagNormalizationScanTaskState);
  const selectedTagNormalizationScanStats = useMemo(
    () => getSelectedTagNormalizationScanStats(tagNormalizationScanResults, selectedTagNormalizationScanPaths),
    [selectedTagNormalizationScanPaths, tagNormalizationScanResults],
  );
  const tagTaxonomyUserEntries = useMemo(
    () => getTagTaxonomyUserEntries(tagTaxonomyConfig),
    [tagTaxonomyConfig],
  );
  const tagTaxonomyUserAliases = useMemo(
    () => getTagTaxonomyUserAliases(tagTaxonomyConfig),
    [tagTaxonomyConfig],
  );
  const filteredTagTaxonomyUserEntries = useMemo(
    () => filterTagTaxonomyUserEntries(tagTaxonomyUserEntries, tagTaxonomyEntryListQuery),
    [tagTaxonomyEntryListQuery, tagTaxonomyUserEntries],
  );
  const displayedTagTaxonomyUserEntries = useMemo(() => {
    return getDisplayedTagTaxonomyList(filteredTagTaxonomyUserEntries, tagTaxonomyEntryListQuery, isTagTaxonomyEntryListExpanded);
  }, [filteredTagTaxonomyUserEntries, isTagTaxonomyEntryListExpanded, tagTaxonomyEntryListQuery]);
  const filteredTagTaxonomyUserAliases = useMemo(
    () => filterTagTaxonomyUserAliases(tagTaxonomyUserAliases, tagTaxonomyAliasListQuery),
    [tagTaxonomyAliasListQuery, tagTaxonomyUserAliases],
  );
  const displayedTagTaxonomyUserAliases = useMemo(() => {
    return getDisplayedTagTaxonomyList(filteredTagTaxonomyUserAliases, tagTaxonomyAliasListQuery, isTagTaxonomyAliasListExpanded);
  }, [filteredTagTaxonomyUserAliases, isTagTaxonomyAliasListExpanded, tagTaxonomyAliasListQuery]);
  const tagManagerAvailableCandidateCount = useMemo(
    () => getTagManagerAvailableCandidateCount(tagTaxonomyUserConfig),
    [tagTaxonomyUserConfig],
  );
  const localIndexTaskView = deriveLocalIndexTaskView({
    loadTask: localIndexLoadTask,
    rebuildTask: localIndexRebuildTask,
    fallbackMessage: localIndexMessage,
  });
  const isLoadingLocalIndexStatus = localIndexTaskView.isLoading;
  const isRebuildingLocalIndex = localIndexTaskView.isRebuilding;
  const localIndexStatusBadgeTone = getLocalIndexStatusBadgeTone(localIndexStatus, isRebuildingLocalIndex);
  const localIndexActionDisabled = localIndexTaskView.actionDisabled;
  const localIndexRebuildButtonLabel = localIndexTaskView.rebuildButtonLabel;
  const localIndexDisplayMessage = localIndexTaskView.message;
  const openTagManagerWorkspace = useCallback((initialFilterMode: TagManagerFilterMode = "all") => {
    const returnTarget: SettingsTarget = { type: "page", page: "blog-tag-manager" };
    debugTagManager("app.openTagManager.request", {
      returnTarget,
      initialFilterMode,
      hasConfig: Boolean(tagTaxonomyConfig),
      settingsOpen: settingsCenterOpenRef.current,
      activeSettingsPage: settingsCenterActivePageRef.current,
      currentFilePath,
    });
    setTagManagerSession({
      initialConfig: normalizeUserTagTaxonomyConfig(tagTaxonomyConfig),
      returnTarget,
      initialFilterMode,
    });
    debugTagManager("app.tagManagerSession.set", {
      returnTarget,
      settingsOpen: settingsCenterOpenRef.current,
      activeSettingsPage: settingsCenterActivePageRef.current,
      currentFilePath,
    });
    settingsCenterHostRef.current?.openTarget(returnTarget);
  }, [currentFilePath, tagTaxonomyConfig]);
  const requestCloseTagManager = useCallback((reason: TagManagerCloseReason, finalConfig?: UserTagTaxonomyConfig) => {
    debugTagManager("app.requestCloseTagManager", {
      reason,
      hasSession: Boolean(tagManagerSession),
      settingsOpen: settingsCenterOpenRef.current,
      activeSettingsPage: settingsCenterActivePageRef.current,
      currentFilePath,
    });
    const session = tagManagerSession;
    if (!session) return;

    const returnTarget = session.returnTarget ?? { type: "page", page: "blog-tag-manager" };
    debugTagManager("app.tagManagerSession.clear", {
      returnTarget,
      settingsOpen: settingsCenterOpenRef.current,
      currentFilePath,
    });
    setTagTaxonomyConfig(normalizeUserTagTaxonomyConfig(finalConfig ?? session.initialConfig));
    setTagTaxonomyConfigError(null);
    setTagManagerSession(null);
    settingsCenterHostRef.current?.openTarget(returnTarget);
  }, [currentFilePath, tagManagerSession]);
  const saveUserTagTaxonomyConfig = useCallback(async (nextConfig: UserTagTaxonomyConfig): Promise<boolean> => {
    const normalizedConfig = normalizeUserTagTaxonomyConfig(nextConfig);
    setIsSavingTagTaxonomyConfig(true);
    setTagTaxonomySaveError(null);
    try {
      await saveTagTaxonomyConfig(normalizedConfig);
      writeStoredCustomCollections(normalizedConfig.customCollections ?? []);
      setTagTaxonomyConfig(normalizedConfig);
      setTagTaxonomyConfigError(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setTagTaxonomySaveError(message);
      return false;
    } finally {
      setIsSavingTagTaxonomyConfig(false);
    }
  }, []);
  const handleExportTagTaxonomyConfig = useCallback(async () => {
    const exportPayload = buildTagTaxonomyConfigExport(tagTaxonomyConfig);
    setTagTaxonomyImportError(null);

    try {
      const blob = new Blob([exportPayload.json], { type: "application/json;charset=utf-8" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportPayload.fileName;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setTagTaxonomyImportMessage("已导出标签配置 JSON");
    } catch {
      try {
        await navigator.clipboard.writeText(exportPayload.json);
        setTagTaxonomyImportMessage("已复制标签配置 JSON");
      } catch (clipboardError) {
        setTagTaxonomyImportMessage(null);
        setTagTaxonomyImportError(`导出失败：${getErrorMessage(clipboardError)}`);
      }
    }
  }, [tagTaxonomyConfig]);
  const previewTagTaxonomyImport = useCallback((jsonText: string) => {
    const preview = previewTagTaxonomyConfigImportJson(jsonText);
    if (!preview.ok) {
      setTagTaxonomyImportPreview(null);
      setTagTaxonomyImportError(preview.error);
      return null;
    }

    setTagTaxonomyImportPreview(preview.result);
    setTagTaxonomyImportError(null);
    setTagTaxonomyImportMessage(null);
    return preview.result;
  }, []);
  const handleTagTaxonomyImportInputChange = useCallback((value: string) => {
    setTagTaxonomyImportJsonInput(value);
    setTagTaxonomyImportPreview(null);
    setTagTaxonomyImportError(null);
    setTagTaxonomyImportMessage(null);
  }, []);
  const handleSelectTagTaxonomyImportFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const text = await file.text();
      setTagTaxonomyImportJsonInput(text);
      const result = previewTagTaxonomyImport(text);
      if (result) {
        setTagTaxonomyImportMessage(`已读取 JSON 文件：${file.name}`);
      }
    } catch (error) {
      setTagTaxonomyImportPreview(null);
      setTagTaxonomyImportError(`读取文件失败：${getErrorMessage(error)}`);
    }
  }, [previewTagTaxonomyImport]);
  const handleConfirmTagTaxonomyImport = useCallback(async () => {
    const result = previewTagTaxonomyImport(tagTaxonomyImportJsonInput);
    if (!result) return;

    const ok = await requestConfirm({
      title: "导入标签配置？",
      description: [
        `自定义标签：${result.preview.entriesCount}`,
        `自定义别名：${result.preview.aliasesCount}`,
        `隐藏标签：${result.preview.hiddenIdsCount}`,
        `排序覆盖：${result.preview.orderOverridesCount}`,
        `合并规则：${result.preview.mergesCount}`,
        `自定义文集：${result.preview.customCollectionsCount}`,
        "导入会覆盖当前用户标签配置，但不会修改 notes/**。",
      ].join("\n"),
      confirmText: "导入",
      danger: true,
    });
    if (!ok) return;

    const saved = await saveUserTagTaxonomyConfig(result.config);
    if (!saved) {
      setTagTaxonomyImportError("导入保存失败，请查看保存失败提示。");
      return;
    }

    setTagTaxonomyImportJsonInput("");
    setTagTaxonomyImportPreview(null);
    setTagTaxonomyImportError(null);
    setTagTaxonomyImportMessage("已导入标签配置");
  }, [previewTagTaxonomyImport, requestConfirm, saveUserTagTaxonomyConfig, tagTaxonomyImportJsonInput]);
  const handleAddTagTaxonomyEntry = useCallback(async () => {
    const result = addTagTaxonomyEntry(tagTaxonomyConfig, tagTaxonomyEntryPathInput, tagTaxonomyEntryAliasesInput);
    if (!result.ok) {
      setTagTaxonomySaveError(result.error);
      return;
    }

    const saved = await saveUserTagTaxonomyConfig(result.config);
    if (!saved) return;

    setTagTaxonomyEntryPathInput("");
    setTagTaxonomyEntryAliasesInput("");
  }, [saveUserTagTaxonomyConfig, tagTaxonomyConfig, tagTaxonomyEntryAliasesInput, tagTaxonomyEntryPathInput]);
  const handleDeleteTagTaxonomyEntry = useCallback(async (entryId: string) => {
    await saveUserTagTaxonomyConfig(deleteTagTaxonomyEntry(tagTaxonomyConfig, entryId));
  }, [saveUserTagTaxonomyConfig, tagTaxonomyConfig]);
  const handleAddTagTaxonomyAlias = useCallback(async () => {
    const result = addTagTaxonomyAlias(tagTaxonomyConfig, tagTaxonomyAliasNameInput, tagTaxonomyAliasTargetInput);
    if (!result.ok) {
      setTagTaxonomySaveError(result.error);
      return;
    }

    const saved = await saveUserTagTaxonomyConfig(result.config);
    if (!saved) return;

    setTagTaxonomyAliasNameInput("");
    setTagTaxonomyAliasTargetInput("");
  }, [saveUserTagTaxonomyConfig, tagTaxonomyAliasNameInput, tagTaxonomyAliasTargetInput, tagTaxonomyConfig]);
  const handleDeleteTagTaxonomyAlias = useCallback(async (aliasName: string) => {
    await saveUserTagTaxonomyConfig(deleteTagTaxonomyAlias(tagTaxonomyConfig, aliasName));
  }, [saveUserTagTaxonomyConfig, tagTaxonomyConfig]);
  const luoguStatusInput = {
    hasLoadedLuoguConfigStatus,
    isLoadingLuoguConfig,
    isConfigured: luoguConfigured,
    hasConnectionError: Boolean(luoguConnectionError),
  };
  const luoguStatusLabel = getLuoguStatusLabel(luoguStatusInput);
  const luoguSettingsStatusTone = getLuoguSettingsStatusTone(luoguStatusInput);
  const luoguSettingsStatusDescription = getLuoguSettingsStatusDescription({
    ...luoguStatusInput,
    hasConnectionResult: Boolean(luoguConnectionResult),
  });
  const isLuoguRuleControlDisabled = getLuoguRuleControlDisabled({
    isLoadingConfig: isLoadingLuoguConfig,
    isTestingConnection: isTestingLuoguConnection,
    isScanningPreview: isScanningLuoguPreview,
    isPreparingSelected: isPreparingSelectedLuogu,
    isWritingPrepared: isWritingPreparedLuogu,
    isSyncing: isSyncingLuogu,
  });
  const luoguRuleSettingRows: LuoguRuleSettingRow[] = buildLuoguImportRuleRowModels(luoguImportRules).map((row) => ({
    ...row,
    onChange: (value: string) => updateLuoguImportRules(getLuoguImportRuleUpdate(row.id, value)),
  }));
  const luoguImportCenterAccountLabel = getLuoguImportCenterAccountLabel(isLoadingLuoguConfig, luoguConfigured);
  const luoguImportCenterAiLabel =
    isLoadingLuoguConfig ? "读取中" : luoguConfigAiConfigured ? "已配置" : "未配置";
  const luoguImportCenterRangeLabel = getLuoguScanRangeLabel(luoguScanMode, luoguScanCountLimit, luoguScanDaysLimit);
  const visibleSettingsTree = useMemo(
    () => SETTINGS_TREE.filter((group) => developerModeEnabled || !group.developerOnly),
    [developerModeEnabled],
  );
  const shouldRenderSettingsPageForTarget = (pageKey: SettingsSection, activePageKey: SettingsSection, activeTarget: SettingsTarget): boolean =>
    shouldRenderSettingsPage(pageKey, activePageKey, activeTarget, SETTINGS_SECTION_LABELS);
  const shouldRenderSettingsGroupForTarget = (groupId: SettingsGroupId, activePageKey: SettingsSection, activeTarget: SettingsTarget): boolean =>
    shouldRenderSettingsGroup(groupId, activePageKey, activeTarget, SETTINGS_SECTION_LABELS);
  const settingsPageSectionClass = "settings-v2-legacy-page grid min-w-0 gap-0";
  const promptTemplateRows = useMemo(
    () => promptTemplates.map((prompt) => ({
      ...prompt,
      usage: getPromptUsageInfo(prompt.fileName),
    })),
    [promptTemplates],
  );
  const { openTabPaths, setOpenTabPaths } = useOpenTabsController({
    currentFilePath,
    setCurrentFilePath,
    noteFiles,
    hasLoadedNotes,
  });
  const {
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    setSearchQuery,
    trimmedSearchQuery,
    searchResults,
    isSearchLoading,
    searchError,
    searchInputRef,
  } = useLocalNoteSearchController(noteFiles);
  const isSettingsCenterOpenForRender = settingsCenterOpenRef.current;
  const editorViewModeLabel = getEditorViewModeLabel(editorViewMode);
  const activeActivityItem: ActivityBarItem | null = getActiveActivityItem({
    isSettingsCenterOpen: isSettingsCenterOpenForRender,
    isLuoguDialogOpen,
    isRestartingBlog,
    isSearchOpen,
    isNotesSidebarOpen,
  });
  const isAiActivityActive = isAiActivitySelected({
    isAiSidebarOpen,
    isSettingsCenterOpen: isSettingsCenterOpenForRender,
    activeSettingsGroupId: SETTINGS_SECTION_LABELS[settingsCenterActivePageRef.current]?.groupId,
  });
  const appZoomLabel = formatZoomLabel(appZoom);
  const contentZoomLabel = formatZoomLabel(contentZoom);
  const selectedPromptUsage = useMemo(
    () => getPromptUsageInfo(selectedPromptFileName),
    [selectedPromptFileName],
  );
  const chromeZoom = 1 + (appZoom - 1) * 0.45;
  const appearanceBackgroundColor = activeSettingsTheme.theme.surface;
  const appearanceForegroundColor = activeSettingsTheme.theme.ink;
  const activeReadingDensity =
    READING_DENSITY_OPTIONS.find((option) => option.id === readingDensity) ?? READING_DENSITY_OPTIONS[1];
  const appearanceStyle = {
    "--app-zoom": appZoom,
    "--chrome-zoom": chromeZoom,
    "--md-content-zoom": contentZoom,
    "--app-ui-scale": uiScale,
    ...settingsThemeVariables,
    "--settings-accent-color": accentColor,
    "--settings-surface-color": appearanceBackgroundColor,
    "--settings-ink-color": appearanceForegroundColor,
    "--settings-diff-added-color": activeSettingsTheme.theme.semanticColors.diffAdded,
    "--settings-diff-removed-color": activeSettingsTheme.theme.semanticColors.diffRemoved,
    "--settings-skill-color": activeSettingsTheme.theme.semanticColors.skill,
    "--settings-contrast": activeSettingsTheme.theme.contrast,
    "--primary": accentColor,
    "--ring": accentColor,
    "--editor-font-size": `${editorFontSize * appZoom}px`,
    "--preview-font-size": `${previewFontSize * appZoom}px`,
    "--toolbar-font-size": `${toolbarFontSize * appZoom}px`,
    "--settings-font-size": `${settingsFontSize * appZoom}px`,
    "--content-line-height": activeReadingDensity.lineHeight,
    "--content-block-spacing": activeReadingDensity.blockSpacing,
    "--content-list-item-spacing": activeReadingDensity.listItemSpacing,
    "--content-callout-spacing": activeReadingDensity.calloutSpacing,
  } as CSSProperties;
  const settingsAppearanceStyle = {
    ...appearanceStyle,
    fontSize: "var(--settings-font-size)",
  } as CSSProperties;
  const settingsCenterMaxSize = getSettingsCenterMaxSize();
  const settingsCenterMinSize = getSettingsCenterMinSize();
  const effectiveSettingsCenterRect = isSettingsCenterMaximized ? getMaximizedSettingsCenterRect() : clampSettingsCenterRect(settingsCenterRect);
  const settingsCenterStyle = {
    ...settingsAppearanceStyle,
    left: `${effectiveSettingsCenterRect.left}px`,
    top: `${effectiveSettingsCenterRect.top}px`,
    width: `${effectiveSettingsCenterRect.width}px`,
    height: `${effectiveSettingsCenterRect.height}px`,
    minWidth: `${settingsCenterMinSize.width}px`,
    minHeight: `${settingsCenterMinSize.height}px`,
    maxWidth: `${settingsCenterMaxSize.width}px`,
    maxHeight: `${settingsCenterMaxSize.height}px`,
    transform: "none",
    transition: "none",
    animation: "none",
  } as CSSProperties;
  const luoguDialogMaxSize = getLuoguDialogMaxSize();
  const luoguDialogMinSize = getLuoguDialogMinSize();
  const effectiveLuoguDialogRect = isLuoguDialogMaximized ? getMaximizedLuoguDialogRect() : clampLuoguDialogRect(luoguDialogRect);
  const luoguDialogStyle = {
    ...settingsAppearanceStyle,
    left: `${effectiveLuoguDialogRect.left}px`,
    top: `${effectiveLuoguDialogRect.top}px`,
    width: `${effectiveLuoguDialogRect.width}px`,
    height: `${effectiveLuoguDialogRect.height}px`,
    minWidth: `${luoguDialogMinSize.width}px`,
    minHeight: `${luoguDialogMinSize.height}px`,
    maxWidth: `${luoguDialogMaxSize.width}px`,
    maxHeight: `${luoguDialogMaxSize.height}px`,
    transform: "none",
    transition: "none",
    animation: "none",
  } as CSSProperties;
  const {
    displayFiles,
    activeNoteFile,
    setDisplayTitleForPath,
    rewriteDisplayTitlePaths,
  } = useDisplayNoteFiles(files, currentFilePath);
  const noteDirectories = useMemo(
    () => getNoteDirectories(files),
    [files],
  );
  const currentNoteDirectory = useMemo(() => getCurrentNoteDirectory(currentFilePath), [currentFilePath]);
  const openTabs = useMemo<OpenFileTab[]>(
    () => buildOpenFileTabs(workingCopies, openTabPaths, displayFiles),
    [displayFiles, openTabPaths, workingCopies],
  );
  const reviewTabs = useMemo<OpenReviewTab[]>(
    () =>
      openReviewTabs.map(({ id, preview }) => {
        const isStale = preview.notePath === currentFilePath && preview.scope === "full-note" && markdown !== preview.originalText;
        return {
          kind: "review",
          id,
          sourcePath: preview.notePath,
          title: preview.scope === "full-note" ? "全文润色审核" : "润色选中审核",
          displayName: preview.scope === "full-note" ? "全文润色审核" : "润色选中审核",
          status: preview.applied ? "applied" : preview.ignored ? "cancelled" : isStale ? "stale" : "pending",
        };
      }),
    [currentFilePath, markdown, openReviewTabs],
  );
  const workspaceTabs = useMemo<OpenTab[]>(
    () => [...openTabs, ...reviewTabs],
    [openTabs, reviewTabs],
  );
  const activeReviewTab = useMemo(
    () => openReviewTabs.find((tab) => tab.id === activeWorkspaceTabId) ?? null,
    [activeWorkspaceTabId, openReviewTabs],
  );
  const currentParagraphContext = useMemo(
    () => currentFilePath === null ? null : extractCursorParagraph(committedMarkdown, editorCursorOffset),
    [currentFilePath, committedMarkdown, editorCursorOffset],
  );
  const aiSidebarContext = useMemo<AiSidebarNoteContext>(() => {
    const fallbackTitle = activeNoteFile?.name.replace(/\.md$/i, "") ?? currentFilePath?.split("/").pop()?.replace(/\.md$/i, "") ?? "";
    const hasOpenNote = currentFilePath !== null;
    const currentParagraphText = hasOpenNote ? currentParagraphContext?.text ?? "" : "";
    return {
      filePath: currentFilePath,
      title: hasOpenNote ? frontmatter.fields.title.trim() || fallbackTitle || "未命名笔记" : "未选择笔记",
      bodyLength: hasOpenNote ? committedMarkdown.length : 0,
      hasBody: hasOpenNote && committedMarkdown.trim().length > 0,
      tags: hasOpenNote ? frontmatter.fields.tags : [],
      summary: hasOpenNote ? frontmatter.fields.summary : "",
      selectedText: hasOpenNote ? editorSelectedText : "",
      selectedTextLength: hasOpenNote ? editorSelectedTextLength : null,
      selectedTextRange: hasOpenNote ? aiContextSelectionRange : null,
      selectionStatus: hasOpenNote
        ? editorSelectedTextLength && editorSelectedTextLength > 0
          ? "available"
          : "empty"
        : "unavailable",
      currentParagraphText,
      currentParagraphLength: currentParagraphText ? currentParagraphText.length : null,
      currentParagraphStatus: hasOpenNote ? currentParagraphText ? "available" : "empty" : "unavailable",
      currentParagraphIsCode: currentParagraphContext?.isCode ?? false,
      markdownBody: hasOpenNote ? committedMarkdown : "",
      bodyStartLine: hasOpenNote ? bodyStartLine : null,
    };
  }, [activeNoteFile, aiContextSelectionRange, bodyStartLine, currentFilePath, currentParagraphContext, committedMarkdown, editorSelectedText, editorSelectedTextLength, frontmatter.fields]);
  const isEditorPreviewSplit = showEditorPane && showPreviewPane;
  const leftSidebarStyle = {
    width: leftSidebarWidth,
    flexBasis: leftSidebarWidth,
  } as CSSProperties;
  const editorPaneStyle = {
    ...appearanceStyle,
    ...(isEditorPreviewSplit ? { flex: `0 0 ${editorPreviewRatio * 100}%` } : {}),
  } as CSSProperties;
  const previewPaneStyle = {
    ...appearanceStyle,
    ...(isEditorPreviewSplit ? { flex: `0 0 ${(1 - editorPreviewRatio) * 100}%` } : {}),
  } as CSSProperties;
  const updateAppZoom = (nextZoom: number | ((currentZoom: number) => number)) => {
    setAppZoom((currentZoom) => {
      const rawZoom = typeof nextZoom === "function" ? nextZoom(currentZoom) : nextZoom;
      return clampAppZoom(rawZoom);
    });
  };

  const updateContentZoom = (nextZoom: number | ((currentZoom: number) => number)) => {
    setContentZoom((currentZoom) => {
      const rawZoom = typeof nextZoom === "function" ? nextZoom(currentZoom) : nextZoom;
      const clampedZoom = clampContentZoom(rawZoom);
      contentZoomRef.current = clampedZoom;
      return clampedZoom;
    });
  };

  const scheduleContentZoom = (nextZoom: number | ((currentZoom: number) => number)) => {
    const currentZoom = pendingContentZoomRef.current ?? contentZoomRef.current;
    const rawZoom = typeof nextZoom === "function" ? nextZoom(currentZoom) : nextZoom;
    pendingContentZoomRef.current = clampContentZoom(rawZoom);

    if (contentZoomFrameRef.current !== null) return;

    contentZoomFrameRef.current = window.requestAnimationFrame(() => {
      contentZoomFrameRef.current = null;
      const zoom = pendingContentZoomRef.current;
      pendingContentZoomRef.current = null;
      if (zoom === null) return;

      updateContentZoom(zoom);
    });
  };

  const updateSettingsFontSize = (nextSize: number) => {
    setSettingsFontSize(clampNumberRange(nextSize, SETTINGS_FONT_SIZE_MIN, SETTINGS_FONT_SIZE_MAX));
  };

  const applySettingsThemeState = (nextThemeState: SettingsThemeState) => {
    applyThemeState(nextThemeState);
  };

  const updateAppTheme = (nextTheme: AppTheme) => {
    setAppTheme(nextTheme);
  };

  const updateCodeFontSize = (nextSize: number) => {
    const clampedSize = clampFontSize(nextSize);
    setEditorFontSize(clampedSize);
    setPreviewFontSize(clampedSize);
  };

  const handleContentWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;

    event.preventDefault();
    scheduleContentZoom((currentZoom) =>
      currentZoom + (event.deltaY < 0 ? CONTENT_ZOOM_STEP : -CONTENT_ZOOM_STEP),
    );
  };

  const updatePromptEditorFontSize = (updater: (currentSize: number) => number) => {
    setPromptEditorFontSize((currentSize) =>
      clampNumberRange(updater(currentSize), PROMPT_EDITOR_FONT_SIZE_MIN, PROMPT_EDITOR_FONT_SIZE_MAX),
    );
  };

  const getResolvedNewNoteDirectory = (): string => {
    return resolveNewNoteDirectory(newNoteLocationOption, newNoteCustomDirectory, currentNoteDirectory);
  };

  const findEntryCaseInsensitive = (path: string, isDirectory: boolean) => {
    return findNoteEntryCaseInsensitive(files, path, isDirectory);
  };

  const updatePathReferences = (oldPath: string, newPath: string, isDirectory: boolean) => {
    const rewritePath = (path: string) => {
      return rewriteNotePathReference(path, oldPath, newPath, isDirectory);
    };
    const rewrittenReferences = rewriteNoteWorkspaceReferences(
      {
        openTabPaths,
        pendingFileSelection,
        pendingAssetsByFile: {},
        openReviewTabs: openReviewTabs.map((tab) => ({ id: tab.id, notePath: tab.preview.notePath })),
        currentFilePath,
        activeWorkspaceTabId,
        activeWorkingCopyId,
        activeTreeDirectoryPath,
        activeTreeFilePath,
        savedSnapshotPath: savedSnapshotRef.current.path,
      },
      oldPath,
      newPath,
      isDirectory,
    );

    setOpenTabPaths(rewrittenReferences.openTabPaths);
    setPendingFileSelection(rewrittenReferences.pendingFileSelection as { path: string; closeSearchOnSuccess: boolean } | null);
    setPendingAssetsByFile((current) =>
      rewriteNoteWorkspaceReferences(
        {
          openTabPaths: [],
          pendingFileSelection: null,
          pendingAssetsByFile: current,
          openReviewTabs: [],
          currentFilePath: null,
          activeWorkspaceTabId: null,
          activeWorkingCopyId: null,
          activeTreeDirectoryPath: null,
          activeTreeFilePath: null,
          savedSnapshotPath: null,
        },
        oldPath,
        newPath,
        isDirectory,
      ).pendingAssetsByFile,
    );
    rewriteDisplayTitlePaths(rewritePath);
    setOpenReviewTabs((current) =>
      current.map((tab) => {
        const rewritten = rewritePath(tab.preview.notePath);
        return rewritten === tab.preview.notePath
          ? tab
          : { ...tab, preview: { ...tab.preview, notePath: rewritten } };
      }),
    );
    if (rewrittenReferences.currentFilePath !== currentFilePath && rewrittenReferences.currentFilePath) {
      skipNextReadForPathRef.current = rewrittenReferences.currentFilePath;
    }
    setCurrentFilePath(rewrittenReferences.currentFilePath);
    setActiveWorkspaceTabId(rewrittenReferences.activeWorkspaceTabId);
    setActiveWorkingCopyId(rewrittenReferences.activeWorkingCopyId);
    setWorkingCopies((current) => {
      let changed = false;
      const next: Record<string, WorkingCopy> = {};
      for (const copy of Object.values(current)) {
        if (copy.kind !== "note" || !copy.path) {
          next[copy.id] = copy;
          continue;
        }
        const rewrittenPath = rewritePath(copy.path);
        if (rewrittenPath === copy.path) {
          next[copy.id] = copy;
          continue;
        }
        changed = true;
        const rewrittenCopy = createNoteWorkingCopy(rewrittenPath, getNoteDisplayName(rewrittenPath, files), {
          frontmatterPrefix: copy.frontmatterPrefix,
          markdown: copy.markdown,
        });
        next[rewrittenCopy.id] = {
          ...rewrittenCopy,
          savedSnapshot: copy.savedSnapshot,
          dirty: copy.dirty,
        };
      }
      return changed ? next : current;
    });
    setActiveTreeDirectoryPath(rewrittenReferences.activeTreeDirectoryPath);
    setActiveTreeFilePath(rewrittenReferences.activeTreeFilePath);
    if (rewrittenReferences.savedSnapshotPath !== savedSnapshotRef.current.path) {
      savedSnapshotRef.current = {
        ...savedSnapshotRef.current,
        path: rewrittenReferences.savedSnapshotPath,
      };
    }
  };

  const getSelectedTreeCreateParent = () => {
    return getSelectedTreeCreateParentPath(activeTreeDirectoryPath, activeTreeFilePath);
  };

  const getDefaultNewNoteCreateParent = () => {
    return getDefaultNewNoteCreateParentPath(activeTreeDirectoryPath, activeTreeFilePath, currentNoteDirectory);
  };

  const openCreateFolderDialog = () => {
    setReturnToCreateAfterFolder(dialogMode === "create");
    setDialogMode("create-folder");
    setDialogValue("");
    setFolderParentDirectory(dialogMode === "create" ? getResolvedNewNoteDirectory() : currentNoteDirectory);
  };

  const getDefaultFolderCreateParent = () => {
    return getSelectedTreeCreateParent();
  };

  const requestInlineCreateFolderAt = (parentPath: string) => {
    closeDialog();
    setIsTreeRootCollapsed(false);
    setCreateFolderRequest({ parentPath, requestId: Date.now() });
  };

  const requestInlineCreateFileAt = (parentPath: string) => {
    closeDialog();
    setIsTreeRootCollapsed(false);
    setCreateFileRequest({ parentPath, requestId: Date.now() });
  };

  const requestInlineCreateFolder = () => {
    requestInlineCreateFolderAt(getDefaultFolderCreateParent());
  };

  const requestInlineCreateFile = () => {
    requestInlineCreateFileAt(getDefaultNewNoteCreateParent());
  };

  const handleSelectTreeDirectory = useCallback((path: string) => {
    const selection = getTreeSelectionAfterDirectorySelect(path);
    setActiveTreeDirectoryPath(selection.activeTreeDirectoryPath);
    setActiveTreeFilePath(selection.activeTreeFilePath);
  }, []);

  const handleClearTreeSelection = useCallback(() => {
    const selection = getTreeSelectionAfterClear();
    setActiveTreeDirectoryPath(selection.activeTreeDirectoryPath);
    setActiveTreeFilePath(selection.activeTreeFilePath);
  }, []);

  const handleSelectTreeRoot = useCallback(() => {
    const selection = getTreeSelectionAfterRootSelect();
    setActiveTreeDirectoryPath(selection.activeTreeDirectoryPath);
    setActiveTreeFilePath(selection.activeTreeFilePath);
    setIsTreeRootCollapsed((current) => !current);
  }, []);

  const openRenameDialog = (path: string, isDirectory = false) => {
    const filename = path.split("/").pop() ?? path;
    const baseName = isDirectory ? filename : filename.replace(/\.md$/i, "");
    setDialogMode("rename");
    setDialogValue(baseName);
    setRenameTarget(path);
    setRenameTargetIsDirectory(isDirectory);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setDialogValue("");
    setNewNoteLocationOption("current");
    setNewNoteCustomDirectory("");
    setNewNoteTags([]);
    setFolderParentDirectory("");
    setReturnToCreateAfterFolder(false);
    setRenameTarget(null);
    setRenameTargetIsDirectory(false);
  };

  const toggleNewNoteTag = (tag: string) => {
    setNewNoteTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  };

  const handleCreate = async () => {
    const fileErr = validateNoteNamePart(dialogValue, "file");
    if (fileErr) { toast.error(fileErr); return; }
    const directory = getResolvedNewNoteDirectory();
    const directoryErr = validateNoteDirectoryPathInput(directory);
    if (directoryErr) { toast.error(directoryErr); return; }

    const filename = normalizeNoteFileName(dialogValue);
    const newPath = joinNotePath(directory, filename);
    if (findEntryCaseInsensitive(newPath, false)) { toast.error("同目录已存在同名笔记"); return; }

    persistActiveWorkingCopyRef.current();

    try {
      if (directory && !findEntryCaseInsensitive(directory, true)) {
        await createNoteFolder(directory);
      }
      await writeNote(newPath, buildNewNoteMarkdown(dialogValue.trim().replace(/\.md$/i, ""), newNoteTags));
      const updated = await listNotes();
      setFiles(updated);
      closeDialog();
      setDisplayTitleForPath(newPath, dialogValue.trim().replace(/\.md$/i, ""));
      setCurrentFilePath(newPath);
      setActiveWorkingCopyId(getNoteWorkingCopyId(newPath));
      setActiveWorkspaceTabId(getNoteWorkingCopyId(newPath));
      setIsDirty(false);
      toast.success("已创建空白笔记");
    } catch (e) {
      toast.error(`创建失败: ${getErrorMessage(e)}`);
    }
  };

  const handleCreateFolder = async () => {
    const nameErr = validateNoteNamePart(dialogValue, "folder");
    if (nameErr) { toast.error(nameErr); return; }
    const parentErr = validateNoteDirectoryPathInput(folderParentDirectory);
    if (parentErr) { toast.error(parentErr); return; }

    const newPath = joinNotePath(folderParentDirectory, dialogValue.trim());
    if (findEntryCaseInsensitive(newPath, true)) { toast.error("同目录已存在同名文件夹"); return; }
    if (findEntryCaseInsensitive(`${newPath}.md`, false)) { toast.error("同目录已存在同名笔记"); return; }

    try {
      await createNoteFolder(newPath);
      const updated = await listNotes();
      setFiles(updated);
      setNewNoteCustomDirectory(newPath);
      setNewNoteLocationOption("custom");
      if (returnToCreateAfterFolder) {
        setDialogMode("create");
        setDialogValue("");
        setFolderParentDirectory("");
        setReturnToCreateAfterFolder(false);
      } else {
        closeDialog();
      }
      toast.success("已创建文件夹");
    } catch (e) {
      toast.error(`创建文件夹失败: ${getErrorMessage(e)}`);
    }
  };

  const handleCreateFolderAt = useCallback(async (parentPath: string, name: string) => {
    const nameErr = validateNoteNamePart(name, "folder");
    if (nameErr) throw new Error(nameErr);
    const parentErr = validateNoteDirectoryPathInput(parentPath);
    if (parentErr) throw new Error(parentErr);

    const newPath = joinNotePath(parentPath, name.trim());
    if (findEntryCaseInsensitive(newPath, true)) throw new Error("同目录已存在同名文件夹");
    if (findEntryCaseInsensitive(`${newPath}.md`, false)) throw new Error("同目录已存在同名笔记");

    await createNoteFolder(newPath);
    const updated = await listNotes();
    setFiles(updated);
    setActiveTreeDirectoryPath(newPath);
    toast.success("已创建文件夹");
    return newPath;
  }, [files]);

  const handleCreateFileAt = useCallback(async (parentPath: string, name: string) => {
    const nameErr = validateNoteNamePart(name, "file");
    if (nameErr) throw new Error(nameErr);
    const parentErr = validateNoteDirectoryPathInput(parentPath);
    if (parentErr) throw new Error(parentErr);

    const filename = normalizeNoteFileName(name);
    const newPath = joinNotePath(parentPath, filename);
    if (findEntryCaseInsensitive(newPath, false)) throw new Error("同目录已存在同名笔记");

    persistActiveWorkingCopyRef.current();

    await writeNote(newPath, buildNewNoteMarkdown(name.trim().replace(/\.md$/i, ""), []));
    const updated = await listNotes();
    setFiles(updated);
    setDisplayTitleForPath(newPath, name.trim().replace(/\.md$/i, ""));
    setCurrentFilePath(newPath);
    setActiveWorkingCopyId(getNoteWorkingCopyId(newPath));
    setActiveWorkspaceTabId(getNoteWorkingCopyId(newPath));
    setActiveTreeDirectoryPath(null);
    setActiveTreeFilePath(newPath);
    setIsDirty(false);
    toast.success("已创建空白笔记");
    return newPath;
  }, [files]);

  const handleRename = async () => {
    if (!renameTarget) return;
    const nameErr = validateNoteNamePart(dialogValue, renameTargetIsDirectory ? "folder" : "file");
    if (nameErr) { toast.error(nameErr); return; }

    const newPath = buildRenameNotePath(renameTarget, dialogValue, renameTargetIsDirectory);
    if (newPath === renameTarget) { closeDialog(); return; }

    const existing = findEntryCaseInsensitive(newPath, renameTargetIsDirectory);
    if (existing && existing.path.toLowerCase() !== renameTarget.toLowerCase()) {
      toast.error(renameTargetIsDirectory ? "同目录已存在同名文件夹" : "同目录已存在同名笔记");
      return;
    }

    try {
      if (renameTargetIsDirectory) {
        await renameNoteFolder(renameTarget, newPath);
      } else {
        await renameNote(renameTarget, newPath);
      }
      const updated = await listNotes();
      updatePathReferences(renameTarget, newPath, renameTargetIsDirectory);
      setFiles(updated);
      closeDialog();
      toast.success(renameTargetIsDirectory ? "已重命名文件夹" : "已重命名笔记");
    } catch (e) {
      toast.error(`重命名失败: ${getErrorMessage(e)}`);
    }
  };

  const handleDelete = async (path: string, isDirectory = false) => {
    const ok = await requestConfirm({
      title: `删除${isDirectory ? "文件夹" : "笔记"}？`,
      description: `确定删除“${path}”吗？此操作不可撤销。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    try {
      if (isDirectory) {
        await deleteNoteFolder(path);
      } else {
        await deleteNote(path);
      }
      const updated = await listNotes();
      setFiles(updated);
      const references = removeDeletedNoteWorkspaceReferences(
        {
          openTabPaths,
          currentFilePath,
          activeWorkspaceTabId,
          activeTreeDirectoryPath,
          activeTreeFilePath,
        },
        path,
        isDirectory,
      );
      setOpenTabPaths(references.openTabPaths);
      setCurrentFilePath(references.currentFilePath);
      setActiveWorkspaceTabId(references.activeWorkspaceTabId);
      setActiveTreeDirectoryPath(references.activeTreeDirectoryPath);
      setActiveTreeFilePath(references.activeTreeFilePath);
      if (references.shouldClearDirty) {
        setIsDirty(false);
      }
      toast.success(isDirectory ? "已删除文件夹" : "已删除笔记");
    } catch (e) {
      toast.error(`删除失败: ${getErrorMessage(e)}`);
    }
  };

  const handleDialogConfirm = () => {
    if (dialogMode === "create") void handleCreate();
    else if (dialogMode === "rename") void handleRename();
    else if (dialogMode === "create-folder") void handleCreateFolder();
  };
  const handleOpenBlog = async () => {
    try {
      await openBlog();
    } catch (e) {
      toast.error(`打开博客失败: ${e}`);
    }
  };

  const handleRestartBlog = async () => {
    setIsRestartingBlog(true);
    try {
      await restartBlogServer();
      toast.success("博客已重启");
    } catch (e) {
      toast.error(`重启博客失败: ${e}`);
    } finally {
      setIsRestartingBlog(false);
    }
  };

  const handleSaveBlogInfo = async () => {
    const saveDraft = buildBlogConfigSaveDraft(blogInfoDraft);
    if (!saveDraft.ok) {
      setBlogConfigError(saveDraft.error);
      toast.error(saveDraft.error);
      return;
    }
    setIsSavingBlogConfig(true);
    setBlogConfigError(null);
    try {
      await saveBlogConfig(saveDraft.config);
      setBlogInfoDraft(saveDraft.config);
      toast.success("博客信息已保存");
    } catch (error) {
      const message = getErrorMessage(error);
      setBlogConfigError(message);
      toast.error(`博客信息保存失败：${message}`);
    } finally {
      setIsSavingBlogConfig(false);
    }
  };

  const loadLuoguSettingsConfig = async () => {
    setIsLoadingLuoguConfig(true);
    try {
      const config = await getLuoguConfig();
      applyLuoguConfigFormState(config);
    } catch (e) {
      toast.error(`洛谷配置读取失败：${e}`);
    } finally {
      setIsLoadingLuoguConfig(false);
    }
  };

  const openLuoguAccountSettingsFromDialog = async () => {
    setIsLuoguDialogOpen(false);
    setLuoguDialogReturnTarget(null);
    openSettingsSection("luogu-account");
    await loadLuoguSettingsConfig();
  };

  const openLuoguAccountManager = async () => {
    settingsCenterHostRef.current?.openLuoguAccountManager();
    await loadLuoguSettingsConfig();
  };

  const returnFromLuoguSettings = () => {
    setIsLuoguSettingsOpen(false);
    if (settingsCenterViewRef.current === "luogu-account-manager") {
      settingsCenterHostRef.current?.closeLuoguAccountManager();
    }
  };

  const closeLuoguSettings = () => {
    if (isSavingLuoguConfig || isUpdatingLuoguLastSubmissionId) return;
    returnFromLuoguSettings();
  };

  const handleSaveLuoguConfig = async () => {
    const payload = buildLuoguConfigSavePayload({
      uid: luoguConfigUid,
      clientId: luoguConfigClientId,
      lastSubmissionId: luoguConfigLastSubmissionId,
    });
    if (!payload.ok) {
      toast.error(payload.error);
      return;
    }

    setIsSavingLuoguConfig(true);
    try {
      await saveLuoguConfig(payload.config);
      setLuoguConnectionError(null);
      toast.success("洛谷配置已保存");
      returnFromLuoguSettings();
    } catch (e) {
      toast.error(`洛谷配置保存失败：${e}`);
    } finally {
      setIsSavingLuoguConfig(false);
    }
  };

  const handleTestLuoguConnection = async () => {
    setIsTestingLuoguConnection(true);
    setLuoguConnectionResult(null);
    setLuoguConnectionError(null);
    try {
      const result = await testLuoguConnection();
      setLuoguConnectionResult(result);
      toast.success("连接成功");
    } catch (e) {
      const message = getErrorMessage(e);
      setLuoguConnectionError(message);
      toast.error(`连接失败：${message}`);
    } finally {
      setIsTestingLuoguConnection(false);
    }
  };

  const buildLuoguPreviewResult = (
    submissions: PreviewLuoguSubmission[],
    latestPageResult: Awaited<ReturnType<typeof previewLuoguSubmissionPage>> | null,
  ): PreviewLuoguSubmissionsResult => ({
    fetchedCount: submissions.length,
    limit: luoguScanMode === "count" ? luoguScanCountLimit : submissions.length,
    uidConfigured: latestPageResult?.uidConfigured ?? false,
    clientIdConfigured: latestPageResult?.clientIdConfigured ?? false,
    aiConfigured: latestPageResult?.aiConfigured ?? false,
    lastSubmissionId: latestPageResult?.lastSubmissionId ?? null,
    submissions: [...submissions],
  });

  const handlePreviewLuoguSubmissions = async () => {
    const saved = luoguScanResumeRef.current;
    const isResume = saved !== null;
    luoguScanResumeRef.current = null;

    const rangeLabel = isResume ? saved.rangeLabel : getLuoguScanRangeLabel(luoguScanMode, luoguScanCountLimit, luoguScanDaysLimit);
    const cutoffMs = isResume ? saved.cutoffMs : (luoguScanMode === "days" ? Date.now() - luoguScanDaysLimit * 24 * 60 * 60 * 1000 : null);

    setIsScanningLuoguPreview(true);
    setIsLuoguScanPaused(false);
    luoguScanPauseFlagRef.current = false;

    if (!isResume) {
      setLuoguPreviewResult(null);
      setLuoguScanError(null);
      setLuoguScanProgress({ currentPage: 1, foundCount: 0, rangeLabel, waiting: false });
      setLuoguScanSummary(null);
      setSelectedLuoguSubmissionIds(new Set<string>());
      resetLuoguPreparationWorkspace();
    }

    try {
      const submissions: PreviewLuoguSubmission[] = isResume ? [...saved.submissions] : [];
      const seenSubmissionIds = isResume ? new Set(saved.seenSubmissionIds) : new Set<string>();
      let latestPageResult: Awaited<ReturnType<typeof previewLuoguSubmissionPage>> | null = isResume ? saved.latestPageResult : null;
      let scannedPages = isResume ? saved.scannedPages : 0;
      let shouldStop = false;

      const startPage = isResume ? saved.nextPage : 1;
      for (let page = startPage; page <= LUOGU_SCAN_MAX_PAGES; page += 1) {
        if (luoguScanPauseFlagRef.current) {
          luoguScanResumeRef.current = {
            submissions: [...submissions],
            seenSubmissionIds: new Set(seenSubmissionIds),
            nextPage: page,
            latestPageResult,
            scannedPages,
            cutoffMs,
            rangeLabel,
          };

          setLuoguPreviewResult(buildLuoguPreviewResult(submissions, latestPageResult));
          setLuoguScanSummary(null);
          setIsLuoguScanPaused(true);
          return;
        }

        setLuoguScanProgress({
          currentPage: page,
          foundCount: submissions.length,
          rangeLabel,
          waiting: false,
        });

        const pageResult = await previewLuoguSubmissionPage(page);
        latestPageResult = pageResult;
        scannedPages = page;

        if (pageResult.submissions.length === 0) {
          shouldStop = true;
        }

        const newInThisPage: PreviewLuoguSubmission[] = [];
        for (const submission of pageResult.submissions) {
          if (seenSubmissionIds.has(submission.submissionId)) continue;

          if (cutoffMs !== null) {
            const submitTimeMs = parseLuoguSubmitTimeMs(submission.submitTime);
            if (submitTimeMs !== null && submitTimeMs < cutoffMs) {
              shouldStop = true;
              continue;
            }
          }

          seenSubmissionIds.add(submission.submissionId);
          submissions.push(submission);
          newInThisPage.push(submission);

          if (luoguScanMode === "count" && submissions.length >= luoguScanCountLimit) {
            shouldStop = true;
            break;
          }
        }

        if (newInThisPage.length > 0) {
          const incrementalResult = buildLuoguPreviewResult(submissions, latestPageResult);
          setLuoguPreviewResult(incrementalResult);
          setSelectedLuoguSubmissionIds((prev) => {
            const next = new Set(prev);
            for (const submission of newInThisPage) {
              const state = getLuoguSubmissionCandidateState(
                submission,
                submissions,
                luoguImportRules,
                latestPageResult?.lastSubmissionId ?? null,
                new Set<string>(),
              );
              if (state.defaultSelected) {
                next.add(submission.submissionId);
              }
            }
            return next;
          });
        }

        setLuoguScanProgress({
          currentPage: page,
          foundCount: submissions.length,
          rangeLabel,
          waiting: !shouldStop && pageResult.hasMore && page < LUOGU_SCAN_MAX_PAGES,
        });

        if (shouldStop || !pageResult.hasMore || page >= LUOGU_SCAN_MAX_PAGES) {
          break;
        }

        await sleepMs(LUOGU_SCAN_PAGE_DELAY_MS);
      }

      if (!latestPageResult) {
        throw new Error("洛谷扫描没有返回任何页面");
      }

      const limitedSubmissions =
        luoguScanMode === "count" ? submissions.slice(0, luoguScanCountLimit) : submissions;
      const result: PreviewLuoguSubmissionsResult = {
        fetchedCount: limitedSubmissions.length,
        limit: luoguScanMode === "count" ? luoguScanCountLimit : limitedSubmissions.length,
        uidConfigured: latestPageResult.uidConfigured,
        clientIdConfigured: latestPageResult.clientIdConfigured,
        aiConfigured: latestPageResult.aiConfigured,
        lastSubmissionId: latestPageResult.lastSubmissionId,
        submissions: limitedSubmissions,
      };
      const scanCompletionSelection = getLuoguScanCompletionSelection({
        submissions: result.submissions,
        rules: luoguImportRules,
        lastSubmissionId: result.lastSubmissionId,
        skippedSubmissionIds: new Set<string>(),
      });

      setLuoguPreviewResult(result);
      setLuoguScanSummary({
        scannedPages,
        foundCount: result.submissions.length,
        candidateCount: scanCompletionSelection.candidateCount,
        skippedCount: scanCompletionSelection.skippedCount,
        rangeLabel,
      });
      setSelectedLuoguSubmissionIds(scanCompletionSelection.defaultSelectedSubmissionIds);
      setLuoguConfigAiConfigured(result.aiConfigured);
      setLuoguConfigLastSubmissionId(
        result.lastSubmissionId === null ? "" : String(result.lastSubmissionId),
      );
      toast.success(`扫描完成：${rangeLabel}，扫描 ${scannedPages} 页，找到 ${result.submissions.length} 条，可候选 ${scanCompletionSelection.candidateCount} 条`);
    } catch (e) {
      const message = getErrorMessage(e);
      setLuoguScanError(message);
      toast.error(`洛谷扫描失败：${message}`);
    } finally {
      if (!luoguScanPauseFlagRef.current) {
        setLuoguScanProgress(null);
      }
      setIsScanningLuoguPreview(false);
    }
  };

  const handlePauseLuoguScan = () => {
    if (!isScanningLuoguPreview || luoguScanPauseFlagRef.current) return;
    luoguScanPauseFlagRef.current = true;
  };

  const handleResumeLuoguScan = () => {
    if (isScanningLuoguPreview || !isLuoguScanPaused || !luoguScanResumeRef.current) return;
    handlePreviewLuoguSubmissions();
  };

  const handleRestartLuoguScan = () => {
    luoguScanResumeRef.current = null;
    luoguScanPauseFlagRef.current = false;
    setIsLuoguScanPaused(false);
    setLuoguPreviewResult(null);
    setLuoguScanError(null);
    setLuoguScanSummary(null);
    handlePreviewLuoguSubmissions();
  };

  const applyAiConfigState = (config: AiConfig) => {
    const nextConfig = cloneAiConfig(config);
    setAiConfig(nextConfig);
    setAiConfigDraft(cloneAiConfig(nextConfig));
    if (pendingChatResponseStyleRef.current === null) {
      setChatResponseStyleDraft(nextConfig.chat_response_style ?? "");
    }
    const defaultProvider =
      config.providers.find((provider) => provider.id === config.default_provider_id) ??
      config.providers[0] ??
      null;
    setSelectedAiProviderId((currentProviderId) => {
      if (config.providers.some((provider) => provider.id === currentProviderId)) {
        return currentProviderId;
      }
      return defaultProvider?.id ?? "";
    });
  };

  const handleAiConfigChangeFromSidebar = (config: AiConfig) => {
    const nextConfig = cloneAiConfig(config);
    setAiConfig(nextConfig);
    setAiConfigDraft((current) => current ? {
      ...cloneAiConfig(current),
      web_search: normalizeWebSearchConfig(nextConfig.web_search),
      chat_response_style: current.chat_response_style ?? nextConfig.chat_response_style ?? "",
    } : cloneAiConfig(nextConfig));
    if (pendingChatResponseStyleRef.current === null) {
      setChatResponseStyleDraft(nextConfig.chat_response_style ?? "");
    }
  };

  const selectAiProviderForEdit = (provider: AiProvider) => {
    setSelectedAiProviderId(provider.id);
    setAiManualModelId("");
    setAiModelSearchQuery("");
  };

  const createAiProviderFromDraft = (draft: { name: string; baseUrl: string; apiKey: string; defaultModel: string; models: string[] }): AiProvider => {
    const modelIds = [...new Set(draft.models.map((modelId) => modelId.trim()).filter(Boolean))];
    const defaultModel = draft.defaultModel.trim() || null;
    return {
      ...createAiProviderDraft(),
      name: draft.name.trim(),
      base_url: draft.baseUrl.trim(),
      api_key: draft.apiKey.trim(),
      default_model: defaultModel,
      models: modelIds.map((modelId) => createAiModelDraft(modelId)),
    };
  };

  const handleCreateAiProviderDraft = (draft: { name: string; baseUrl: string; apiKey: string; defaultModel: string; models: string[] }): AiProvider | null => {
    const provider = createAiProviderFromDraft(draft);
    setAiConfigDraft((current) => {
      const base = current ?? aiConfig ?? {
        base_url: "",
        api_key: "",
        model: "",
        chat_response_style: "",
        providers: [],
        default_provider_id: null,
        default_model_id: null,
        web_search: DEFAULT_WEB_SEARCH_CONFIG,
      };
      const next = {
        ...cloneAiConfig(base),
        providers: [...base.providers.map((item) => ({ ...item, models: item.models.map((model) => ({ ...model })) })), provider],
        default_provider_id: base.providers.length === 0 ? provider.id : base.default_provider_id,
        default_model_id: base.providers.length === 0 ? provider.default_model : base.default_model_id,
      };
      pendingAutoSaveDraftRef.current = next;
      return next;
    });
    setAiManualModelId("");
    setAiModelSearchQuery("");
    scheduleAutoSave();
    return provider;
  };

  const handleTestCreateAiProviderDraft = async (draft: { name: string; baseUrl: string; apiKey: string; defaultModel: string; models: string[] }): Promise<{ ok: boolean; message: string }> => {
    const provider = createAiProviderFromDraft(draft);
    if (!provider.base_url.trim()) return { ok: false, message: "请先填写 Base URL" };
    if (!provider.api_key.trim()) return { ok: false, message: "请先填写 API Key" };
    try {
      const result = await testAiProviderDraft(provider);
      return { ok: true, message: `连接正常，发现 ${result.modelCount} 个模型` };
    } catch (e) {
      return { ok: false, message: `连接测试失败：${getErrorMessage(e)}` };
    }
  };

  const handleSyncCreateAiProviderModels = async (draft: { name: string; baseUrl: string; apiKey: string; defaultModel: string; models: string[] }): Promise<{ ok: boolean; models: string[]; message: string }> => {
    const provider = createAiProviderFromDraft(draft);
    if (!provider.base_url.trim()) return { ok: false, models: draft.models, message: "请先填写 Base URL" };
    if (!provider.api_key.trim()) return { ok: false, models: draft.models, message: "请先填写 API Key" };
    try {
      const result = await syncAiProviderModelsDraft(provider);
      const models = result.provider.models.map((model) => model.id).filter(Boolean);
      return { ok: true, models, message: `已获取 ${result.syncedCount} 个模型` };
    } catch (e) {
      return { ok: false, models: draft.models, message: `模型获取失败：${getErrorMessage(e)}；可以手动填写默认模型` };
    }
  };

  const refreshAiConfig = async () => {
    const config = await getAiConfig();
    applyAiConfigState(config);
    return config;
  };

  const ensureAiConfigLoadedForSettings = async () => {
    if (aiConfigDraft || isLoadingAiConfig) return;
    setIsLoadingAiConfig(true);
    try {
      await refreshAiConfig();
    } catch (e) {
      toast.error(`AI 配置读取失败：${e}`);
    } finally {
      setIsLoadingAiConfig(false);
    }
  };

  const openAiSettings = async (options?: { target?: SettingsTarget }) => {
    cancelPendingSettingsCenterCloseCleanup();
    const requestedTarget = options?.target ?? { type: "page", page: SETTINGS_SECTION_FALLBACK.ai };
    settingsCenterHostRef.current?.openTarget(requestedTarget);
    await ensureAiConfigLoadedForSettings();
  };

  const updateAiConfigDraft = (update: (config: AiConfig) => AiConfig) => {
    setAiConfigDraft((current) => {
      const base = current ?? aiConfig;
      if (!base) return current;
      const next = update(cloneAiConfig(base));
      pendingAutoSaveDraftRef.current = next;
      return next;
    });
  };

  const savePendingAiConfigDraft = async () => {
    if (isSavingAiConfigRef.current) return;
    const draft = pendingAutoSaveDraftRef.current;
    if (!draft) return;
    const nextConfig = normalizeAiConfigDraft(draft);
    isSavingAiConfigRef.current = true;
    setIsSavingAiConfig(true);
    try {
      await saveAiConfig(nextConfig);
      if (pendingAutoSaveDraftRef.current === draft) {
        pendingAutoSaveDraftRef.current = null;
      }
      applyAiConfigState(nextConfig);
      if (pendingAutoSaveDraftRef.current) {
        setAiConfigDraft(cloneAiConfig(pendingAutoSaveDraftRef.current));
      }
      toast.success("AI 配置已自动保存", { id: "ai-config-auto-save" });
    } catch (e) {
      toast.error(`AI 配置保存失败：${getErrorMessage(e)}`, { id: "ai-config-auto-save" });
    } finally {
      isSavingAiConfigRef.current = false;
      setIsSavingAiConfig(false);
      if (pendingAutoSaveDraftRef.current) scheduleAutoSave();
    }
  };

  const scheduleAutoSave = (delay = 250) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void savePendingAiConfigDraft();
    }, delay);
  };

  const saveChatResponseStyleNow = async (style: string) => {
    if (isSavingChatResponseStyleRef.current) return;
    if (isSavingAiConfigRef.current) {
      if (chatResponseStyleAutoSaveTimerRef.current) clearTimeout(chatResponseStyleAutoSaveTimerRef.current);
      chatResponseStyleAutoSaveTimerRef.current = setTimeout(() => {
        chatResponseStyleAutoSaveTimerRef.current = null;
        const pending = pendingChatResponseStyleRef.current;
        if (pending !== null) void saveChatResponseStyleNow(pending);
      }, 500);
      return;
    }
    const sourceConfig = aiConfigRef.current;
    const sourceDraft = aiConfigDraftRef.current;
    if (!sourceConfig && !sourceDraft) return;
    const styleToSave = style.slice(0, 2000);
    const nextConfig = normalizeAiConfigDraft({
      ...(sourceDraft ?? sourceConfig!),
      web_search: normalizeWebSearchConfig(sourceConfig?.web_search ?? sourceDraft?.web_search),
      chat_response_style: styleToSave,
    });
    isSavingChatResponseStyleRef.current = true;
    try {
      await saveAiConfig(nextConfig);
      setAiConfig(cloneAiConfig(nextConfig));
      setAiConfigDraft((current) => current ? {
        ...cloneAiConfig(current),
        chat_response_style: styleToSave,
      } : cloneAiConfig(nextConfig));
      if (pendingChatResponseStyleRef.current === styleToSave) {
        pendingChatResponseStyleRef.current = null;
      }
    } catch (e) {
      console.error("NoteX answer style auto-save failed:", e);
    } finally {
      isSavingChatResponseStyleRef.current = false;
      const pending = pendingChatResponseStyleRef.current;
      if (pending !== null && pending !== styleToSave) {
        if (chatResponseStyleAutoSaveTimerRef.current) clearTimeout(chatResponseStyleAutoSaveTimerRef.current);
        chatResponseStyleAutoSaveTimerRef.current = setTimeout(() => {
          chatResponseStyleAutoSaveTimerRef.current = null;
          const latest = pendingChatResponseStyleRef.current;
          if (latest !== null) void saveChatResponseStyleNow(latest);
        }, 350);
      }
    }
  };

  const scheduleChatResponseStyleAutoSave = (style: string) => {
    pendingChatResponseStyleRef.current = style.slice(0, 2000);
    if (chatResponseStyleAutoSaveTimerRef.current) clearTimeout(chatResponseStyleAutoSaveTimerRef.current);
    chatResponseStyleAutoSaveTimerRef.current = setTimeout(() => {
      chatResponseStyleAutoSaveTimerRef.current = null;
      const pending = pendingChatResponseStyleRef.current;
      if (pending !== null) void saveChatResponseStyleNow(pending);
    }, 500);
  };

  const flushChatResponseStyleAutoSave = () => {
    if (chatResponseStyleAutoSaveTimerRef.current) {
      clearTimeout(chatResponseStyleAutoSaveTimerRef.current);
      chatResponseStyleAutoSaveTimerRef.current = null;
    }
    const pending = pendingChatResponseStyleRef.current;
    if (pending !== null) void saveChatResponseStyleNow(pending);
  };

  const handleChatResponseStyleChange = (value: string) => {
    const nextValue = value.slice(0, 2000);
    setChatResponseStyleDraft(nextValue);
    setAiConfigDraft((current) => current ? {
      ...current,
      chat_response_style: nextValue,
    } : current);
    scheduleChatResponseStyleAutoSave(nextValue);
  };

  const updateAiProviderDraft = (providerId: string, update: (provider: AiProvider) => AiProvider) => {
    updateAiConfigDraft((config) => ({
      ...config,
      providers: config.providers.map((provider) =>
        provider.id === providerId
          ? update({
              ...provider,
              models: provider.models.map((model) => ({ ...model })),
            })
          : provider,
      ),
    }));
    scheduleAutoSave();
  };

  const patchAiProviderDraft = (providerId: string, patch: Partial<AiProvider>) => {
    updateAiProviderDraft(providerId, (provider) => {
      const nextProvider = { ...provider, ...patch };
      return {
        ...nextProvider,
        models: patch.models ?? provider.models,
      };
    });
    if (Object.prototype.hasOwnProperty.call(patch, "default_model")) {
      setAiConfigDraft((current) => {
        if (!current || current.default_provider_id !== providerId) return current;
        const next = {
          ...current,
          default_model_id: patch.default_model ?? null,
        };
        pendingAutoSaveDraftRef.current = next;
        return next;
      });
    }
  };

  const handleSetDefaultAiProvider = (providerId: string) => {
    updateAiConfigDraft((config) => {
      const provider = config.providers.find((item) => item.id === providerId);
      if (!provider) return config;
      return {
        ...config,
        default_provider_id: providerId,
        default_model_id: provider.default_model ?? provider.models.find((model) => model.enabled)?.id ?? provider.models[0]?.id ?? null,
      };
    });
    scheduleAutoSave();
  };

  const handleReorderAiProviders = (sourceId: string, targetId: string) => {
    updateAiConfigDraft((config) => {
      const sourceIndex = config.providers.findIndex((provider) => provider.id === sourceId);
      const targetIndex = config.providers.findIndex((provider) => provider.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return config;
      const providers = [...config.providers];
      const [movedProvider] = providers.splice(sourceIndex, 1);
      providers.splice(targetIndex, 0, movedProvider);
      return { ...config, providers };
    });
    scheduleAutoSave();
  };

  const updateWebSearchDraft = (patch: Partial<WebSearchConfig>) => {
    updateAiConfigDraft((config) => ({
      ...config,
      web_search: normalizeWebSearchConfig({ ...webSearchDraft, ...patch }),
    }));
    const shouldSaveImmediately =
      Object.prototype.hasOwnProperty.call(patch, "enabled") ||
      Object.prototype.hasOwnProperty.call(patch, "provider") ||
      Object.prototype.hasOwnProperty.call(patch, "publicSearchConsent");
    scheduleAutoSave(shouldSaveImmediately ? 0 : 500);
    setWebSearchConnectionMessage(null);
  };

  const handleTestWebSearchConnection = async () => {
    const webSearchConfig = normalizeWebSearchConfig(aiConfigDraft?.web_search);
    if (webSearchConfig.provider === "bing") {
      setIsTestingWebSearchConnection(true);
      setWebSearchConnectionMessage(null);
      try {
        const result = await withTimeout(
          testWebSearchConnection({
            provider: "bing",
          }),
          5000,
          "搜索测试超时",
        );
        setWebSearchConnectionMessage(`连接成功：Bing 公开搜索，Endpoint ${result.endpoint}`);
      } catch (e) {
        setWebSearchConnectionMessage(formatWebSearchTestError(e));
      } finally {
        setIsTestingWebSearchConnection(false);
      }
      return;
    }
    if (webSearchConfig.provider === "bocha" && !webSearchConfig.bochaApiKey.trim()) {
      setWebSearchConnectionMessage("需要先填写博查 API Key。");
      return;
    }
    if (webSearchConfig.provider === "brave" && !webSearchConfig.braveApiKey.trim()) {
      setWebSearchConnectionMessage("需要先填写 Brave Search API Key。");
      return;
    }

    setIsTestingWebSearchConnection(true);
    setWebSearchConnectionMessage(null);
    try {
      const result = await withTimeout(
        testWebSearchConnection({
          provider: webSearchConfig.provider,
          apiKey: webSearchConfig.provider === "bocha" ? webSearchConfig.bochaApiKey : webSearchConfig.braveApiKey,
          endpoint: webSearchConfig.provider === "bocha" ? webSearchConfig.bochaEndpoint : undefined,
        }),
        5000,
        "搜索测试超时",
      );
      setWebSearchConnectionMessage(
        result.endpoint
          ? `连接成功：${result.provider === "bocha" ? "Bocha" : result.provider === "bing" ? "Bing 公开搜索" : "Brave Search"}，Endpoint ${result.endpoint}`
          : "连接成功",
      );
    } catch (e) {
      setWebSearchConnectionMessage(formatWebSearchTestError(e));
    } finally {
      setIsTestingWebSearchConnection(false);
    }
  };

  const handleClearWebCache = async () => {
    setIsClearingWebCache(true);
    setWebCacheMessage(null);
    try {
      await clearWebCache();
      setWebCacheMessage("联网缓存已清理");
      toast.success("联网缓存已清理");
    } catch (e) {
      const message = getErrorMessage(e);
      setWebCacheMessage(message);
      toast.error(message);
    } finally {
      setIsClearingWebCache(false);
    }
  };

  const refreshLocalIndexStatus = async () => {
    setLocalIndexLoadTask(startTaskState());
    setLocalIndexMessage(null);
    try {
      const status = await getLocalNoteIndexStatus();
      setLocalIndexStatus(status);
      setLocalIndexMessage(buildLocalIndexStatusMessage(status));
      setLocalIndexLoadTask((task) => finishTaskState(task));
    } catch (e) {
      const message = getErrorMessage(e);
      setLocalIndexMessage(message);
      setLocalIndexLoadTask((task) => failTaskState(task, message));
      toast.error(`本地索引状态读取失败：${message}`);
    } finally {
    }
  };

  const handleRebuildLocalIndex = async () => {
    setLocalIndexRebuildTask(startTaskState());
    setLocalIndexMessage("正在建立本地笔记索引...");
    try {
      const status = await rebuildLocalNoteIndex();
      setLocalIndexStatus(status);
      setLocalIndexMessage(`重建完成：${status.noteCount} 篇笔记，${status.chunkCount} 个片段。`);
      setLocalIndexRebuildTask((task) => finishTaskState(task));
      toast.success("本地笔记索引已重建");
    } catch (e) {
      const message = getErrorMessage(e);
      setLocalIndexMessage(message);
      setLocalIndexRebuildTask((task) => failTaskState(task, message));
      toast.error(`本地索引重建失败：${message}`);
    } finally {
    }
  };

  const loadPromptContent = async (fileName: string) => {
    setIsLoadingPrompt(true);
    setPromptPolishMessage(null);
    try {
      const prompt = await readAiPrompt(fileName);
      setSelectedPromptFileName(prompt.fileName);
      setPromptContent(prompt.content);
    } catch (e) {
      toast.error(`提示词读取失败：${getErrorMessage(e)}`);
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const loadPromptTemplates = async () => {
    setIsLoadingPrompt(true);
    try {
      const prompts = await listAiPrompts();
      setPromptTemplates(prompts);
      if (!prompts.some((prompt) => prompt.fileName === selectedPromptFileName)) {
        setSelectedPromptFileName("");
        setPromptContent("");
      }
    } catch (e) {
      toast.error(`提示词读取失败：${getErrorMessage(e)}`);
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const ActiveSettingsPageEffects = ({ activePageKey, activeTarget }: { activePageKey: SettingsSection; activeTarget: SettingsTarget }) => {
    useEffect(() => {
      const localNotesVisible = shouldRenderSettingsPageForTarget("ai-local-notes", activePageKey, activeTarget);
      if (!localNotesVisible || localIndexStatus || isLoadingLocalIndexStatus || isRebuildingLocalIndex) return;
      void refreshLocalIndexStatus();
    }, [activePageKey, activeTarget]);

    useEffect(() => {
      if (!shouldRenderSettingsPageForTarget("ai-prompts", activePageKey, activeTarget) || hasRequestedPromptTemplatesRef.current || isLoadingPrompt) return;
      hasRequestedPromptTemplatesRef.current = true;
      void loadPromptTemplates();
    }, [activePageKey, activeTarget]);

    return null;
  };

  const handleEditPrompt = (fileName: string) => {
    if (isLoadingPrompt || isSavingPrompt || isPolishingPrompt) return;
    settingsCenterHostRef.current?.openPromptEditor(fileName, settingsCenterActivePageRef.current);
    void loadPromptContent(fileName);
  };

  const handleSavePrompt = async () => {
    if (!selectedPromptFileName) {
      toast.error("请先选择一个提示词");
      return;
    }

    setIsSavingPrompt(true);
    try {
      await saveAiPrompt(selectedPromptFileName, promptContent);
      toast.success("提示词已保存");
    } catch (e) {
      toast.error(`提示词保存失败：${getErrorMessage(e)}`);
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleResetPromptToDefault = async () => {
    if (!selectedPromptFileName) {
      toast.error("请先选择一个提示词");
      return;
    }

    const confirmed = await requestConfirm({
      title: "重置为默认模板？",
      description: "这会用内置默认模板覆盖当前编辑内容。已经保存的自定义内容也会在确认后被替换。",
      confirmText: "重置",
      cancelText: "取消",
      danger: true,
    });
    if (!confirmed) return;

    setIsSavingPrompt(true);
    try {
      const prompt = await resetAiPromptToDefault(selectedPromptFileName);
      setSelectedPromptFileName(prompt.fileName);
      setPromptContent(prompt.content);
      setPromptPolishMessage(null);
      toast.success("已重置为默认模板");
    } catch (e) {
      toast.error(`提示词重置失败：${getErrorMessage(e)}`);
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handlePolishPrompt = async () => {
    if (!selectedPromptFileName) {
      toast.error("请先选择一个提示词");
      return;
    }
    const originalContent = promptContent;
    if (!originalContent.trim()) {
      toast.error("当前提示词为空");
      return;
    }

    const runId = promptPolishRunRef.current + 1;
    promptPolishRunRef.current = runId;
    setIsPolishingPrompt(true);
    setPromptPolishMessage(null);
    try {
      const result = await polishAiPromptTemplate(selectedPromptFileName, originalContent);
      if (!isMountedRef.current || promptPolishRunRef.current !== runId) return;
      setPromptContent(result.polishedPrompt);
      setPromptPolishMessage("已覆盖编辑区，保存后生效。");
      toast.success("提示词已润色，保存后生效");
    } catch (e) {
      if (!isMountedRef.current || promptPolishRunRef.current !== runId) return;
      setPromptPolishMessage(`润色失败：${getErrorMessage(e)}`);
      toast.error(`提示词润色失败：${getErrorMessage(e)}`);
    } finally {
      if (isMountedRef.current && promptPolishRunRef.current === runId) {
        setIsPolishingPrompt(false);
      }
    }
  };

  const handleCopyPromptVariable = async (variableName: string) => {
    const editor = promptEditorRef.current;
    const shouldInsert = editor?.hasFocus() || promptEditorHadFocusBeforeVariableClickRef.current;
    promptEditorHadFocusBeforeVariableClickRef.current = false;
    if (shouldInsert && editor?.insertVariable(variableName)) {
      toast.success(`已插入变量 ${variableName}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(variableName);
      toast.success(`已复制变量 ${variableName}`);
    } catch (e) {
      toast.error(`复制变量失败：${getErrorMessage(e)}`);
    }
  };

  const openLuoguDialog = async (options?: { tab?: LuoguImportCenterTab; returnTarget?: SettingsTarget | null }) => {
    setLuoguDialogRect((current) => getSafeOpenedLuoguDialogRect(current));
    setLuoguDialogReturnTarget(options?.returnTarget ?? null);
    setIsLuoguDialogOpen(true);
    setLuoguImportCenterTab(options?.tab ?? "scan");
    setLuoguImportStep("scan");
    setIsLoadingLuoguConfig(true);
    try {
      const config = await getLuoguConfig();
      applyLuoguConfigFormState(config);
    } catch (e) {
      toast.error(`洛谷配置读取失败：${getErrorMessage(e)}`);
    } finally {
      setIsLoadingLuoguConfig(false);
    }
  };

  const closeLuoguDialog = () => {
    if (isLuoguImportCenterBusyNow) return;
    const returnTarget = luoguDialogReturnTarget;
    setIsLuoguDialogOpen(false);
    setLuoguDialogReturnTarget(null);
    setIsLuoguScanPaused(false);
    luoguScanResumeRef.current = null;
    luoguScanPauseFlagRef.current = false;
    setLuoguPreviewResult(null);
    setLuoguScanError(null);
    setLuoguScanProgress(null);
    setLuoguScanSummary(null);
    setSelectedLuoguSubmissionIds(new Set<string>());
    resetLuoguPreparationWorkspace();
    setLuoguProblemId("");
    setLuoguProblemTitle("");
    setLuoguSubmissionId("");
    setLuoguSourceCode("");
    setLuoguImportCenterTab("scan");
    if (returnTarget) {
      openSettingsSection(returnTarget.type === "category" ? returnTarget.category : returnTarget.page);
    }
  };

  const openLuoguRulesSettingsFromDialog = () => {
    if (isLuoguImportCenterBusyNow) return;
    closeLuoguDialog();
    openSettingsSection("luogu-rules");
  };

  useEffect(() => {
    if (!isLuoguDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeLuoguDialog();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const updateLuoguImportRules = (patch: Partial<LuoguImportRules>) => {
    if (isPreparingSelectedLuogu || isWritingPreparedLuogu || isScanningLuoguPreview || isSyncingLuogu) return;

    let didSave = false;
    let saveError: unknown = null;

    setLuoguImportRules((current) => {
      const next = normalizeLuoguImportRules({ ...current, ...patch });
      try {
        saveStoredLuoguImportRules(next);
        didSave = true;
      } catch (error) {
        saveError = error;
        return current;
      }

      const submissions = luoguPreviewResult?.submissions ?? [];
      const nextSelection = getLuoguScanCompletionSelection({
        submissions,
        rules: next,
        lastSubmissionId: luoguPreviewResult?.lastSubmissionId ?? null,
        skippedSubmissionIds: new Set<string>(),
      });
      setSelectedLuoguSubmissionIds(nextSelection.defaultSelectedSubmissionIds);
      return next;
    });

    if (saveError) {
      toast.error(`导入规则保存失败：${getErrorMessage(saveError)}`);
      return;
    }
    if (didSave) {
      toast.success("导入规则已保存");
    }

    resetLuoguPreparationWorkspace();
  };

  const toggleLuoguSubmissionSelection = (submission: PreviewLuoguSubmission) => {
    const candidateState = luoguSubmissionCandidateStates[submission.submissionId];
    if (!candidateState?.canSelect || isPreparingSelectedLuogu || isWritingPreparedLuogu) return;
    setSelectedLuoguSubmissionIds((current) => {
      const next = new Set(current);
      if (next.has(submission.submissionId)) {
        next.delete(submission.submissionId);
      } else {
        next.add(submission.submissionId);
      }
      return next;
    });
  };

  const handleToggleAllLuoguSelectableSubmissions = () => {
    if (luoguSelectableSubmissionIds.length === 0 || isPreparingSelectedLuogu || isWritingPreparedLuogu || isScanningLuoguPreview || isSyncingLuogu) return;

    const selectableIds = new Set(luoguSelectableSubmissionIds);
    setSelectedLuoguSubmissionIds((current) => {
      if (areAllLuoguSelectableSubmissionsSelected) {
        const next = new Set(current);
        selectableIds.forEach((submissionId) => next.delete(submissionId));
        return next;
      }
      const next = new Set(current);
      selectableIds.forEach((submissionId) => next.add(submissionId));
      return next;
    });
  };

  const handleStopPreparingLuoguPreviews = () => {
    if (!isPreparingSelectedLuogu) return;

    luoguPrepareRunRef.current.cancelled = true;
    setIsStoppingLuoguPrepare(true);
    setLuoguPrepareStatusesById((current) =>
      Object.fromEntries(
        Object.entries(current).map(([submissionId, status]) => [
          submissionId,
          status === "queued" ? "stopped" : status,
        ]),
      ) as Record<string, LuoguPrepareItemStatus>,
    );
    toast.info("已请求停止生成预览；当前请求返回后会停止队列");
  };

  const handleDeleteAiProvider = async (providerId: string, options?: { skipConfirm?: boolean }) => {
    const provider = aiConfigDraft?.providers.find((item) => item.id === providerId);
    if (!provider) return;
    if (!options?.skipConfirm) {
      const ok = await requestConfirm({
        title: `删除供应商「${provider.name || provider.id}」？`,
        description: "此操作会立即生效。",
        confirmText: "删除",
        danger: true,
      });
      if (!ok) return;
    }
    updateAiConfigDraft((config) => {
      const providers = config.providers.filter((item) => item.id !== providerId);
      const nextSelected = providers.find((item) => item.id === config.default_provider_id) ?? providers[0] ?? null;
      if (selectedAiProviderId === providerId) {
        setSelectedAiProviderId(nextSelected?.id ?? "");
      }
      return {
        ...config,
        providers,
        default_provider_id: config.default_provider_id === providerId ? nextSelected?.id ?? null : config.default_provider_id,
        default_model_id: config.default_provider_id === providerId ? nextSelected?.default_model ?? nextSelected?.models[0]?.id ?? null : config.default_model_id,
      };
    });
    scheduleAutoSave();
    setAiManualModelId("");
  };

  const handleTestAiProvider = async (providerId: string): Promise<boolean> => {
    const provider = aiConfigDraft?.providers.find((item) => item.id === providerId);
    if (!provider) return false;
    if (!provider.base_url.trim()) {
      toast.error("请先填写 Base URL");
      return false;
    }
    if (!provider.api_key.trim()) {
      toast.error("请先填写 API Key");
      return false;
    }
    setAiProviderBusyId(providerId);
    try {
      const result = await testAiProviderDraft(provider);
      toast.success(`连接正常，发现 ${result.modelCount} 个模型`);
      return true;
    } catch (e) {
      toast.error(`连接测试失败：${getErrorMessage(e)}`);
      return false;
    } finally {
      setAiProviderBusyId(null);
    }
  };

  const handleSyncAiProviderModels = async (providerId: string): Promise<boolean> => {
    const provider = aiConfigDraft?.providers.find((item) => item.id === providerId);
    if (!provider) return false;
    if (!provider.base_url.trim()) {
      toast.error("请先填写 Base URL");
      return false;
    }
    if (!provider.api_key.trim()) {
      toast.error("请先填写 API Key");
      return false;
    }
    setAiProviderBusyId(providerId);
    try {
      const result = await syncAiProviderModelsDraft(provider);
      const targetProviderId = providerId;
      updateAiProviderDraft(targetProviderId, (currentProvider) => ({
        ...result.provider,
        id: targetProviderId,
        created_at: result.provider.created_at ?? currentProvider.created_at,
        updated_at: result.provider.updated_at ?? Date.now(),
      }));
      toast.success(`已同步 ${result.syncedCount} 个模型`);
      return true;
    } catch (e) {
      toast.error(`模型同步失败：${getErrorMessage(e)}；可以手动添加模型`);
      return false;
    } finally {
      setAiProviderBusyId(null);
    }
  };

  const handleAddAiProviderModel = async () => {
    const modelId = aiManualModelId.trim();
    if (!selectedAiProviderId || !modelId) {
      toast.error("请先选择 Provider 并填写模型 ID");
      return;
    }
    updateAiProviderDraft(selectedAiProviderId, (provider) => {
      if (provider.models.some((model) => model.id === modelId)) return provider;
      return {
        ...provider,
        default_model: provider.default_model ?? modelId,
        models: [...provider.models, createAiModelDraft(modelId)],
        updated_at: Date.now(),
      };
    });
    setAiManualModelId("");
    toast.success("模型已添加");
  };

  const handleDeleteAiProviderModel = async (providerId: string, modelId: string) => {
    updateAiProviderDraft(providerId, (provider) => {
      const models = provider.models.filter((model) => model.id !== modelId);
      const nextDefault = provider.default_model === modelId ? models.find((model) => model.enabled)?.id ?? models[0]?.id ?? null : provider.default_model;
      return {
        ...provider,
        default_model: nextDefault,
        models,
        updated_at: Date.now(),
      };
    });
    updateAiConfigDraft((config) => ({
      ...config,
      default_model_id:
        config.default_provider_id === providerId && config.default_model_id === modelId
          ? config.providers.find((provider) => provider.id === providerId)?.models.find((model) => model.id !== modelId && model.enabled)?.id ?? null
          : config.default_model_id,
    }));
  };

  const handleSetDefaultAiModel = async (providerId: string, modelId: string) => {
    updateAiProviderDraft(providerId, (provider) => ({
      ...provider,
      default_model: modelId,
      updated_at: Date.now(),
    }));
    updateAiConfigDraft((config) => ({
      ...config,
      default_provider_id: providerId,
      default_model_id: modelId,
    }));
  };

  const handlePrepareSelectedLuoguSubmissions = async () => {
    if (!luoguPreviewResult) return;
    if (luoguImportRules.defaultSaveLocation === "custom") {
      const customDirError = validateLuoguSaveDirectoryInput(luoguImportRules.customSaveDirectory);
      if (customDirError) {
        toast.error(`自定义目录无效：${customDirError}`);
        return;
      }
    }
    const prepareSelectionPlan = getLuoguPrepareSelectionPlan({
      submissions: luoguPreviewResult.submissions,
      selectedSubmissionIds: selectedLuoguSubmissionIds,
      candidateStates: luoguSubmissionCandidateStates,
      skippedSubmissionIds: skippedLuoguSubmissionIds,
      prepareStatusesById: luoguPrepareStatusesById,
      hasReusablePreview: hasReusableLuoguPreparedPreview,
    });
    const { selectedSubmissions, queue, reusablePreviewSubmissions, ignoredCount } = prepareSelectionPlan;

    if (selectedSubmissions.length === 0) {
      toast.error("请选择要生成预览的洛谷提交");
      return;
    }

    if (queue.length === 0) {
      luoguPrepareRunRef.current.cancelled = true;
      setIsPreparingSelectedLuogu(false);
      setIsStoppingLuoguPrepare(false);
      setCurrentlyPreparingLuoguId(null);
      setLuoguPrepareProgress(null);
      setLuoguPrepareStatusesById({});
      if (reusablePreviewSubmissions.length > 0) {
        setReviewSelectedLuoguSubmissionIds(new Set(reusablePreviewSubmissions.map((submission) => submission.submissionId)));
        setActiveLuoguPreparedPreviewId(reusablePreviewSubmissions[0].submissionId);
        setActiveLuoguPreviewDetailTab("rendered");
        setLuoguImportStep("preview");
        toast.success(`无需重新生成：复用 ${reusablePreviewSubmissions.length} 个已有预览，忽略 ${ignoredCount} 个`);
      } else {
        setReviewSelectedLuoguSubmissionIds(new Set<string>());
        setActiveLuoguPreparedPreviewId(null);
        setActiveLuoguPreviewDetailTab("rendered");
        setLuoguImportStep("preview");
        toast.info(`没有需要生成的预览；跳过 / 忽略 ${ignoredCount} 个`);
      }
      return;
    }

    const runId = luoguPrepareRunSeqRef.current + 1;
    luoguPrepareRunSeqRef.current = runId;
    luoguPrepareRunRef.current = { id: runId, cancelled: false };
    setIsPreparingSelectedLuogu(true);
    setIsStoppingLuoguPrepare(false);
    setLuoguPrepareProgress({
      current: 0,
      total: queue.length,
      succeeded: reusablePreviewSubmissions.length,
      failed: 0,
      skipped: ignoredCount,
    });
    setLuoguPrepareErrorsById({});
    setLuoguPrepareStatusesById(
      Object.fromEntries(
        queue.map((submission) => [submission.submissionId, "queued"]),
      ) as Record<string, LuoguPrepareItemStatus>,
    );
    setLuoguWriteResultsById({});
    let preparedCount = reusablePreviewSubmissions.length;
    let draftCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let firstPreparedId: string | null = reusablePreviewSubmissions[0]?.submissionId ?? null;
    let completedCount = 0;
    const runningIds = new Set<string>();
    const reviewSelectionIds = new Set(reusablePreviewSubmissions.map((submission) => submission.submissionId));

    const refreshProgress = () => {
      setLuoguPrepareProgress({
        current: completedCount,
        total: queue.length,
        succeeded: preparedCount,
        failed: failedCount,
        skipped: skippedCount + ignoredCount,
      });
    };

    const syncCurrentlyPreparingId = () => {
      setCurrentlyPreparingLuoguId(runningIds.values().next().value ?? null);
    };

    try {
      await runLimitedConcurrencyQueue(
        queue,
        LUOGU_PREPARE_CONCURRENCY,
        () => {
          const run = luoguPrepareRunRef.current;
          return run.id === runId && !run.cancelled && isMountedRef.current;
        },
        async (submission) => {
          const run = luoguPrepareRunRef.current;
          if (run.id !== runId || run.cancelled || !isMountedRef.current) return;

        runningIds.add(submission.submissionId);
        syncCurrentlyPreparingId();
        setLuoguPrepareStatusesById((current) => ({
          ...current,
          [submission.submissionId]: "running",
        }));
        await yieldToUi();

        try {
          const prepared = await prepareLuoguSubmissionNote(submission.submissionId, {
            requireAc: luoguImportRules.requireAc,
            allowRawDraftWithoutInsight: luoguImportRules.missingInsightStrategy !== "skip",
            includeSourceCode: luoguImportRules.includeSourceCode,
          });
          const preparedWithRules = applyLuoguPreparedRules(prepared, luoguImportRules);
          const latestRun = luoguPrepareRunRef.current;
          if (latestRun.id !== runId || !isMountedRef.current) return;
          completedCount += 1;
          setLuoguPreparedNotesById((current) => ({
            ...current,
            [submission.submissionId]: preparedWithRules,
          }));
          setLuoguPrepareErrorsById((current) => {
            const next = { ...current };
            delete next[submission.submissionId];
            return next;
          });
          setLuoguPrepareStatusesById((current) => {
            const next = { ...current };
            delete next[submission.submissionId];
            return next;
          });
          if (preparedWithRules.skipped) {
            skippedCount += 1;
          } else if (preparedWithRules.aiStatus === "failed") {
            failedCount += 1;
          } else {
            preparedCount += 1;
            if (preparedWithRules.draftFallback) draftCount += 1;
            if (!firstPreparedId) firstPreparedId = submission.submissionId;
            reviewSelectionIds.add(submission.submissionId);
          }
          refreshProgress();
        } catch (e) {
          const latestRun = luoguPrepareRunRef.current;
          if (latestRun.id !== runId || !isMountedRef.current) return;
          completedCount += 1;
          failedCount += 1;
          setLuoguPrepareErrorsById((current) => ({
            ...current,
            [submission.submissionId]: getErrorMessage(e),
          }));
          setLuoguPrepareStatusesById((current) => {
            const next = { ...current };
            delete next[submission.submissionId];
            return next;
          });
          refreshProgress();
        } finally {
          runningIds.delete(submission.submissionId);
          syncCurrentlyPreparingId();
        }
        },
      );

      if (luoguPrepareRunRef.current.cancelled) {
        setLuoguPrepareStatusesById((current) => {
          const next = { ...current };
          queue.forEach((item) => {
            if (next[item.submissionId] === "queued" || next[item.submissionId] === "running") {
              next[item.submissionId] = "stopped";
            }
          });
          return next;
        });
      }

      if (firstPreparedId) {
        setActiveLuoguPreparedPreviewId(firstPreparedId);
        setActiveLuoguPreviewDetailTab("rendered");
      }
      setReviewSelectedLuoguSubmissionIds(reviewSelectionIds);
      setLuoguImportStep("preview");
      if (luoguPrepareRunRef.current.cancelled) {
        toast.warning(
          `已停止生成预览：预览就绪 ${preparedCount}，草稿 ${draftCount}，跳过/忽略 ${skippedCount + ignoredCount}，失败 ${failedCount}`,
        );
      } else {
        toast.success(
          `预览生成完成：预览就绪 ${preparedCount}，草稿 ${draftCount}，跳过/忽略 ${skippedCount + ignoredCount}，失败 ${failedCount}`,
        );
      }
    } finally {
      if (luoguPrepareRunRef.current.id === runId && isMountedRef.current) {
        setLuoguPrepareStatusesById((current) => {
          const next = { ...current };
          Object.entries(next).forEach(([submissionId, status]) => {
            if (status === "queued" || status === "running") {
              next[submissionId] = luoguPrepareRunRef.current.cancelled ? "stopped" : status;
            }
          });
          return next;
        });
        setCurrentlyPreparingLuoguId(null);
        setLuoguPrepareProgress(null);
        setIsPreparingSelectedLuogu(false);
        setIsStoppingLuoguPrepare(false);
      }
    }
  };

  const handleWritePreparedLuoguNotes = async () => {
    const preparedNotesToWrite = writableLuoguPreparedNotes;
    if (preparedNotesToWrite.length === 0) {
      toast.error("没有可写入的预览");
      return;
    }

    setIsWritingPreparedLuogu(true);
    setLuoguWriteProgress(createTaskProgress(preparedNotesToWrite.length));
    let writtenCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let lastWrittenPath: string | null = null;

    try {
      for (let index = 0; index < preparedNotesToWrite.length; index += 1) {
        const prepared = preparedNotesToWrite[index];
        setCurrentlyWritingLuoguId(prepared.submissionId);
        setLuoguWriteProgress((current) =>
          updateTaskProgressValue(current ?? createTaskProgress(preparedNotesToWrite.length), { current: index + 1 }),
        );

        try {
          const initialWriteMode: LuoguWriteMode = luoguImportRules.writeStrategy === "overwrite" ? "overwrite" : "createNew";
          let result = await writeLuoguPreparedNote(prepared.suggestedRelativePath, prepared.markdown, false, initialWriteMode);
          if (
            luoguImportRules.writeStrategy === "askOnConflict" &&
            result.skipped &&
            result.relativePath
          ) {
            const shouldOverwrite = await requestConfirm({
              title: "覆盖已有文件？",
              description: `目标文件已存在：${result.relativePath}\n是否覆盖写入？`,
              confirmText: "覆盖写入",
              danger: true,
            });
            if (shouldOverwrite) {
              result = await writeLuoguPreparedNote(prepared.suggestedRelativePath, prepared.markdown, false, "overwrite");
            }
          }
          setLuoguWriteResultsById((current) => ({
            ...current,
            [prepared.submissionId]: result,
          }));
          if (result.skipped) {
            skippedCount += 1;
          } else if (result.failed) {
            failedCount += 1;
          } else {
            writtenCount += 1;
            if (result.relativePath) lastWrittenPath = result.relativePath;
          }
          setLuoguWriteProgress((current) =>
            updateTaskProgressValue(current ?? createTaskProgress(preparedNotesToWrite.length), {
              succeeded: writtenCount,
              failed: failedCount,
              skipped: skippedCount,
            }),
          );
        } catch (e) {
          failedCount += 1;
          setLuoguWriteResultsById((current) => ({
            ...current,
            [prepared.submissionId]: {
              relativePath: null,
              skipped: false,
              skipReason: null,
              failed: true,
              error: getErrorMessage(e),
              committed: false,
              commitStatus: "failed",
            },
          }));
          setLuoguWriteProgress((current) =>
            updateTaskProgressValue(current ?? createTaskProgress(preparedNotesToWrite.length), {
              succeeded: writtenCount,
              failed: failedCount,
              skipped: skippedCount,
            }),
          );
        }
      }

      if (writtenCount > 0) {
        const updated = await listNotes();
        setFiles(updated);
        if (lastWrittenPath) {
          setCurrentFilePath(lastWrittenPath);
          setIsDirty(false);
        }
      }

      toast.success(`写入完成：成功 ${writtenCount}，跳过 ${skippedCount}，失败 ${failedCount}`);
    } finally {
      setCurrentlyWritingLuoguId(null);
      setLuoguWriteProgress(null);
      setIsWritingPreparedLuogu(false);
    }
  };

  const handleUpdateActiveLuoguPreparedMarkdown = (markdown: string) => {
    const submissionId = activeLuoguPreparedPreview?.submissionId;
    if (!submissionId) return;

    setLuoguPreparedNotesById((current) => {
      const prepared = current[submissionId];
      if (!prepared || prepared.markdown === markdown) return current;
      return {
        ...current,
        [submissionId]: {
          ...prepared,
          markdown,
        },
      };
    });
    setEditedLuoguPreparedMarkdownIds((current) => {
      if (current.has(submissionId)) return current;
      return new Set([...current, submissionId]);
    });
  };

  const toggleLuoguReviewSelection = (submissionId: string) => {
    if (isPreparingSelectedLuogu || isWritingPreparedLuogu) return;
    const prepared = luoguPreparedNotesById[submissionId];
    if (!prepared || prepared.skipped || prepared.aiStatus === "failed" || !prepared.markdown.trim() || luoguWriteResultsById[submissionId]) return;

    setReviewSelectedLuoguSubmissionIds((current) => {
      const next = new Set(current);
      if (next.has(submissionId)) {
        next.delete(submissionId);
      } else {
        next.add(submissionId);
      }
      return next;
    });
  };

  const handleImportLuogu = async () => {
    if (!luoguProblemId.trim()) {
      toast.error("题号不能为空");
      return;
    }
    if (!luoguProblemTitle.trim()) {
      toast.error("题目标题不能为空");
      return;
    }
    if (!luoguSubmissionId.trim()) {
      toast.error("提交 ID 不能为空");
      return;
    }
    if (!luoguSourceCode.trim()) {
      toast.error("源码不能为空");
      return;
    }
    persistActiveWorkingCopyRef.current();

    setIsImportingLuogu(true);
    try {
      const imported = await importLuoguInsight(
        luoguProblemId,
        luoguProblemTitle,
        luoguSubmissionId,
        luoguSourceCode,
      );

      const updated = await listNotes();
      setFiles(updated);
      setCurrentFilePath(imported.relativePath);
      setIsDirty(false);
      setIsLuoguDialogOpen(false);
      setLuoguProblemId("");
      setLuoguProblemTitle("");
      setLuoguSubmissionId("");
      setLuoguSourceCode("");
      toast.success(`洛谷笔记已导入，AI 整理：是，模型：${imported.aiModel}`);
    } catch (e) {
      toast.error(`洛谷导入失败：${e}`);
    } finally {
      setIsImportingLuogu(false);
    }
  };

  const handleEditorChange = useCallback((value: string) => {
    markPreviewEditorChange(value.length);
    markdownLiveRef.current = value;
    editorDocVersionRef.current += 1;
    pendingChangeQueueRef.current.push({
      version: editorDocVersionRef.current,
      length: value.length,
    });
    if (pendingChangeQueueRef.current.length > 64) {
      pendingChangeQueueRef.current.splice(0, pendingChangeQueueRef.current.length - 64);
    }
    schedulePreviewMarkdownSync(value, editorDocVersionRef.current);

    if (activeWorkingCopyId) {
      setWorkingCopies((current) => {
        const active = current[activeWorkingCopyId];
        if (!active) return current;
        return {
          ...current,
          [activeWorkingCopyId]: updateWorkingCopyContent(active, {
            frontmatterPrefix,
            markdown: value,
          }),
        };
      });
    }

    const nextDirty = isSnapshotDirty(savedSnapshotRef.current, currentFilePath, frontmatterPrefix, value);
    if (isDirtyRef.current !== nextDirty) {
      isDirtyRef.current = nextDirty;
      setIsDirty(nextDirty);
    }
    scheduleCommittedMarkdownSync();
  }, [activeWorkingCopyId, currentFilePath, frontmatterPrefix, scheduleCommittedMarkdownSync, schedulePreviewMarkdownSync]);

  useEffect(() => {
    markDeferredMarkdownSeen(previewMarkdown.length);
  }, [previewMarkdown]);

  const handleEditorSelectionChange = useCallback((selectedText: string, range: MarkdownEditorSelectionRange | null, cursorOffset: number | null) => {
    startTransition(() => {
      setEditorSelectedText(selectedText);
      setEditorSelectedTextLength(selectedText.length > 0 ? selectedText.length : null);
      setEditorCursorOffset(cursorOffset);
      setAiContextSelectionRange(range);
    });
  }, []);

  const applyLoadedMarkdown = useCallback((content: string, path: string | null) => {
    const loaded = splitLoadedMarkdown(content);
    savedSnapshotRef.current = {
      path,
      frontmatterPrefix: loaded.frontmatterPrefix,
      markdown: loaded.body,
    };
    replaceEditorDocument(loaded.body, path, loaded.frontmatterPrefix);
    if (path) {
      setDisplayTitleForPath(path, parseFrontmatterFields(content).fields.title);
    }
    setIsDirty(false);
    isDirtyRef.current = false;
    if (loaded.warning) {
      toast.warning(loaded.warning);
    }
  }, [replaceEditorDocument]);

  const persistActiveWorkingCopy = useCallback(() => {
    if (!activeWorkingCopyId) return;
    const content = getLiveWorkingCopyContent();
    setWorkingCopies((current) => {
      const active = current[activeWorkingCopyId];
      if (!active) return current;
      return {
        ...current,
        [activeWorkingCopyId]: updateWorkingCopyContent(active, content),
      };
    });
  }, [activeWorkingCopyId, getLiveWorkingCopyContent]);

  useEffect(() => {
    persistActiveWorkingCopyRef.current = persistActiveWorkingCopy;
  }, [persistActiveWorkingCopy]);

  const createUntitledEditor = useCallback(() => {
    persistActiveWorkingCopy();
    untitledSequenceRef.current += 1;
    const copy = createUntitledWorkingCopy(untitledSequenceRef.current);
    setWorkingCopies((current) => ({
      ...current,
      [copy.id]: copy,
    }));
    setActiveWorkingCopyId(copy.id);
    setCurrentFilePath(null);
    setActiveTreeDirectoryPath(null);
    setActiveTreeFilePath(null);
    setActiveWorkspaceTabId(copy.id);
    replaceEditorDocument("", null, "");
    savedSnapshotRef.current = {
      path: null,
      frontmatterPrefix: "",
      markdown: "",
    };
    setIsDirty(false);
    isDirtyRef.current = false;
  }, [persistActiveWorkingCopy, replaceEditorDocument]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    listen("main-close-requested", async () => {
      if (disposed) return;
      persistActiveWorkingCopy();
      const copies = workingCopiesRef.current;
      const activeCopy = activeWorkingCopyId ? copies[activeWorkingCopyId] : null;
      const liveContent = getLiveWorkingCopyContent();
      const activeCopyIsDirty = activeCopy ? updateWorkingCopyContent(activeCopy, liveContent).dirty : false;
      const hasDirtyCopies = activeCopyIsDirty || Object.values(copies).some((copy) => copy.dirty);
      if (hasDirtyCopies) {
        const ok = await requestConfirm({
          title: "关闭未保存文件？",
          description: "仍有未保存的编辑内容。关闭窗口会把应用收进托盘，但这些未保存内容只保存在当前会话中。",
          confirmText: "关闭窗口",
          danger: true,
        });
        if (!ok) return;
      }
      try {
        await hideMainWindow();
      } catch (error) {
        toast.error(`关闭窗口失败: ${getErrorMessage(error)}`);
      }
    })
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })
      .catch((error: Error) => console.error("注册关闭监听失败：", error.message));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [activeWorkingCopyId, getLiveWorkingCopyContent, persistActiveWorkingCopy, requestConfirm]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.isComposing || event.key === "Process" || event.key === "Unidentified") return;
      if (event.key.toLowerCase() !== "n" || (!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      createUntitledEditor();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createUntitledEditor]);

  const handlePasteImage = async (file: File) => {
    if (!currentFilePath) {
      const message = "请先打开一个笔记后再粘贴图片";
      toast.error(message);
      throw new Error(message);
    }

    try {
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      const saved = await saveNoteAsset(currentFilePath, bytes, file.type);

      setPendingAssetsByFile((prev) => {
        const current = prev[currentFilePath] ?? [];
        if (current.includes(saved.assetRelativePath)) return prev;
        return {
          ...prev,
          [currentFilePath]: [...current, saved.assetRelativePath],
        };
      });

      toast.success("图片已插入，保存后提交");
      return `![image](${saved.markdownPath})`;
    } catch (e) {
      toast.error(`图片粘贴失败：${e}`);
      throw e;
    }
  };

  const updateFrontmatter = (patch: Partial<FrontmatterFields>) => {
    if (!currentFilePath) return;
    if (!frontmatter.canMerge) {
      toast.warning(frontmatter.warning ?? "当前 frontmatter 暂不能通过表单改写");
      return;
    }

    const currentFullMarkdown = getLiveFullMarkdown();
    const nextFields = { ...frontmatter.fields, ...patch };
    const nextMarkdown = mergeFrontmatterFields(currentFullMarkdown, nextFields);
    if (nextMarkdown === currentFullMarkdown) return;
    const loaded = splitLoadedMarkdown(nextMarkdown);
    const nextDirty = isSnapshotDirty(savedSnapshotRef.current, currentFilePath, loaded.frontmatterPrefix, loaded.body);
    replaceEditorDocument(loaded.body, currentFilePath, loaded.frontmatterPrefix);
    if (Object.prototype.hasOwnProperty.call(patch, "title")) {
      setDisplayTitleForPath(currentFilePath, String(patch.title ?? ""));
    }
    if (isDirtyRef.current !== nextDirty) {
      isDirtyRef.current = nextDirty;
      setIsDirty(nextDirty);
    }
  };

  const openTagPicker = useCallback(() => {
    if (!frontmatter.canMerge || !frontmatter.canEditTags) return;
    setIsTagPickerOpen(true);
  }, [frontmatter.canEditTags, frontmatter.canMerge]);
  const closeTagPicker = useCallback(() => {
    setIsTagPickerOpen(false);
  }, []);
  const confirmTagPicker = useCallback((tags: string[], collections: string[]) => {
    if (!frontmatter.canMerge || !frontmatter.canEditTags) return;
    updateFrontmatter({ tags, collection: normalizeCollectionValues(collections) });
    setIsTagPickerOpen(false);
  }, [frontmatter.canEditTags, frontmatter.canMerge, updateFrontmatter]);
  const applyTagNormalizationSuggestions = useCallback(() => {
    if (!frontmatter.canMerge || !frontmatter.canEditTags || tagNormalizationSuggestions.length === 0) return;

    const nextTags = applyTagNormalizationPlan(frontmatterDisplayTags, tagNormalizationPlan);
    updateFrontmatter({ tags: nextTags });
    setIsTagNormalizationDetailsOpen(false);
  }, [frontmatter.canEditTags, frontmatter.canMerge, frontmatterDisplayTags, tagNormalizationPlan, tagNormalizationSuggestions.length, updateFrontmatter]);
  const handleScanLegacyTags = useCallback(async () => {
    if (isTagNormalizationScanTaskRunning) return;

    setIsScanningTagNormalization(true);
    setTagNormalizationScanError(null);
    setTagNormalizationScanIssueCount(0);
    setTagNormalizationScanAllStats(null);
    setSelectedTagNormalizationScanPaths(new Set());

    const results: TagNormalizationScanResult[] = [];
    let scanStats = createEmptyTagNormalizationScanStats();
    let issueCount = 0;

    try {
      for (const file of noteFiles) {
        try {
          const content = await readNote(file.path);
          const parsed = parseFrontmatterFields(content);

          if (parsed.warning && !parsed.canEditTags) {
            issueCount += 1;
          }

          if (parsed.fields.tags.length === 0) continue;

          const plan = analyzeTagListNormalization(parsed.fields.tags, {
            userConfig: tagTaxonomyUserConfig,
          });
          scanStats = addTagNormalizationPlanStats(scanStats, plan);

          if (plan.suggestions.length > 0) {
            results.push({
              path: file.path,
              title: parsed.fields.title.trim() || file.displayTitle?.trim() || file.name.replace(/\.md$/i, ""),
              plan,
              suggestions: plan.suggestions,
            });
          }
        } catch {
          issueCount += 1;
        }
      }

      setTagNormalizationScanResults(results);
      setTagNormalizationScanAllStats(scanStats);
      setTagNormalizationScanIssueCount(issueCount);
    } catch (error) {
      setTagNormalizationScanError(getErrorMessage(error));
      setTagNormalizationScanResults(null);
      setTagNormalizationScanAllStats(null);
    } finally {
      setIsScanningTagNormalization(false);
    }
  }, [isTagNormalizationScanTaskRunning, noteFiles, tagTaxonomyUserConfig]);
  const toggleTagNormalizationScanSelection = useCallback((path: string) => {
    setSelectedTagNormalizationScanPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);
  const selectAllTagNormalizationScanResults = useCallback(() => {
    setSelectedTagNormalizationScanPaths(getAllTagNormalizationScanSelection(tagNormalizationScanResults));
  }, [tagNormalizationScanResults]);
  const clearTagNormalizationScanSelection = useCallback(() => {
    setSelectedTagNormalizationScanPaths(new Set());
  }, []);
  const applySelectedTagNormalizationScanResults = useCallback(async () => {
    if (!tagNormalizationScanResults || selectedTagNormalizationScanStats.noteCount === 0 || isApplyingTagNormalizationScan) return;

    const selectedPaths = new Set(selectedTagNormalizationScanPaths);
    const confirmMessage = [
      `将修改 ${selectedTagNormalizationScanStats.noteCount} 篇笔记。`,
      `将改写 ${selectedTagNormalizationScanStats.rewriteCount} 个标签。`,
      `将合并 ${selectedTagNormalizationScanStats.duplicateCount} 个重复标签。`,
      `unknown/free-form 标签不会被改写。`,
      "只修改 frontmatter.tags，不会改正文。",
      "建议在批量应用前确认改动范围，便于回滚。",
      "",
      "确认应用所选规范化？",
    ].join("\n");

    const confirmed = await requestConfirm({
      title: "应用标签规范化？",
      description: confirmMessage,
      confirmText: "应用",
      danger: true,
    });
    if (!confirmed) return;

    setIsApplyingTagNormalizationScan(true);
    const failures: TagNormalizationApplyFailure[] = [];
    let successCount = 0;
    let normalizedTagCount = 0;
    let duplicateTagCount = 0;
    let skippedCount = 0;

    for (const result of tagNormalizationScanResults) {
      if (!selectedPaths.has(result.path)) continue;

      try {
        if (result.path === currentFilePath && isDirty) {
          skippedCount += 1;
          continue;
        }

        const content = await readNote(result.path);
        const parsed = parseFrontmatterFields(content);

        if (!parsed.canMerge || !parsed.canEditTags) {
          throw new Error(parsed.warning ?? "当前 frontmatter 暂不能安全改写 tags");
        }

        const plan = analyzeTagListNormalization(parsed.fields.tags, {
          userConfig: tagTaxonomyUserConfig,
        });
        if (plan.suggestions.length === 0) {
          skippedCount += 1;
          continue;
        }

        const nextTags = applyTagNormalizationPlan(parsed.fields.tags, plan);
        const nextMarkdown = mergeFrontmatterFields(content, {
          ...parsed.fields,
          tags: nextTags,
        });

        if (nextMarkdown === content) {
          skippedCount += 1;
          continue;
        }

        await writeNote(result.path, nextMarkdown);
        successCount += 1;
        normalizedTagCount += plan.stats.rewriteCount;
        duplicateTagCount += plan.stats.duplicateCount;

        if (result.path === currentFilePath) {
          applyLoadedMarkdown(nextMarkdown, currentFilePath);
        }
      } catch (error) {
        failures.push({
          path: result.path,
          error: getErrorMessage(error),
        });
      }
    }

    setTagNormalizationApplyResult({
      successCount,
      normalizedTagCount,
      duplicateTagCount,
      skippedCount,
      failures,
    });
    setSelectedTagNormalizationScanPaths(new Set());
    setIsApplyingTagNormalizationScan(false);
    void handleScanLegacyTags();
  }, [
    applyLoadedMarkdown,
    currentFilePath,
    handleScanLegacyTags,
    isApplyingTagNormalizationScan,
    isDirty,
    requestConfirm,
    selectedTagNormalizationScanPaths,
    selectedTagNormalizationScanStats.noteCount,
    selectedTagNormalizationScanStats.duplicateCount,
    selectedTagNormalizationScanStats.rewriteCount,
    selectedTagNormalizationScanStats.suggestionCount,
    tagNormalizationScanResults,
    tagTaxonomyUserConfig,
  ]);
  const handleApplyAiSuggestedTags = async (notePath: string, suggestedTags: string[]) => {
    if (!currentFilePath || currentFilePath !== notePath) {
      throw new Error("当前打开的笔记已变化，请切回原笔记后再应用");
    }
    if (!frontmatter.canMerge) {
      throw new Error(frontmatter.warning ?? "当前 frontmatter 暂不能通过表单改写");
    }
    if (!frontmatter.canEditTags) {
      throw new Error(frontmatter.warning ?? "当前标签暂不能通过表单改写");
    }

    const currentTags = getDisplayTags(frontmatter.fields.tags);
    const nextTags = mergeTagsStable(currentTags, suggestedTags, tagTaxonomyUserConfig);
    if (nextTags.length === currentTags.length) return;
    updateFrontmatter({ tags: nextTags });
  };

  const handleApplyPolishedSelection = async ({
    notePath,
    originalText,
    polishedText,
    selectionRange,
  }: ApplyPolishedSelectionInput) => {
    if (!currentFilePath || currentFilePath !== notePath) {
      throw new Error("原选区已经变化，请重新选择文本后再润色。");
    }
    if (!originalText || !polishedText) {
      throw new Error("原选区已经变化，请重新选择文本后再润色。");
    }

    const liveMarkdown = markdownLiveRef.current;
    let from: number | null = null;
    let to: number | null = null;
    if (
      selectionRange &&
      Number.isFinite(selectionRange.from) &&
      Number.isFinite(selectionRange.to) &&
      selectionRange.from >= 0 &&
      selectionRange.to >= selectionRange.from &&
      selectionRange.to <= liveMarkdown.length &&
      liveMarkdown.slice(selectionRange.from, selectionRange.to) === originalText
    ) {
      from = selectionRange.from;
      to = selectionRange.to;
    }

    if (from === null || to === null) {
      const currentRange = aiContextSelectionRange;
      if (
        currentRange &&
        currentRange.from >= 0 &&
        currentRange.to >= currentRange.from &&
        currentRange.to <= liveMarkdown.length &&
        liveMarkdown.slice(currentRange.from, currentRange.to) === originalText
      ) {
        from = currentRange.from;
        to = currentRange.to;
      }
    }

    if (from === null || to === null) {
      const firstIndex = liveMarkdown.indexOf(originalText);
      const lastIndex = liveMarkdown.lastIndexOf(originalText);
      if (firstIndex >= 0 && firstIndex === lastIndex) {
        from = firstIndex;
        to = firstIndex + originalText.length;
      }
    }

    if (from === null || to === null) {
      throw new Error("原选区已经变化，请重新选择文本后再润色。");
    }

    const nextMarkdown = `${liveMarkdown.slice(0, from)}${polishedText}${liveMarkdown.slice(to)}`;
    const nextDirty = isSnapshotDirty(savedSnapshotRef.current, currentFilePath, frontmatterPrefix, nextMarkdown);
    replaceEditorDocument(nextMarkdown, currentFilePath, frontmatterPrefix);
    if (isDirtyRef.current !== nextDirty) {
      isDirtyRef.current = nextDirty;
      setIsDirty(nextDirty);
    }
    toast.success("润色内容已应用到选区，请确认后保存");
  };

  const handleApplyPolishedFullNote = async ({
    notePath,
    originalBody,
    polishedBody,
    applyKind,
  }: ApplyPolishedFullNoteInput) => {
    if (!currentFilePath || currentFilePath !== notePath) {
      throw new Error("当前打开的笔记已变化，无法应用这次全文润色。");
    }
    if (!originalBody || !polishedBody) {
      throw new Error("当前笔记内容已经变化，请重新执行全文润色。");
    }
    if (markdownLiveRef.current !== originalBody) {
      throw new Error("当前笔记内容已经变化，请重新执行全文润色。");
    }

    const nextDirty = isSnapshotDirty(savedSnapshotRef.current, currentFilePath, frontmatterPrefix, polishedBody);
    replaceEditorDocument(polishedBody, currentFilePath, frontmatterPrefix);
    if (isDirtyRef.current !== nextDirty) {
      isDirtyRef.current = nextDirty;
      setIsDirty(nextDirty);
    }
    toast.success(applyKind === "solution-format"
      ? "题解格式化已应用到正文，请确认后保存"
      : "全文润色已应用到正文，请确认后保存");
  };

  const getPolishReviewTabId = (previewId: string) => `review:${previewId}`;

  const handleOpenPolishReview = (preview: AiPolishPreview) => {
    const id = getPolishReviewTabId(preview.previewId);
    setOpenReviewTabs((current) => {
      const nextTab = { id, preview };
      const index = current.findIndex((item) => item.id === id);
      if (index === -1) return [...current, nextTab];
      return current.map((item) => (item.id === id ? nextTab : item));
    });
    setActiveWorkspaceTabId(id);
  };

  const handlePolishReviewChange = (preview: AiPolishPreview) => {
    const id = getPolishReviewTabId(preview.previewId);
    setOpenReviewTabs((current) =>
      current.map((item) => (item.id === id ? { ...item, preview } : item)),
    );
  };

  const applyPolishReview = async (reviewTab: PolishReviewTab) => {
    const { preview } = reviewTab;
    if (preview.applied || preview.ignored) return;

    try {
      if (preview.scope === "full-note") {
        await handleApplyPolishedFullNote({
          notePath: preview.notePath,
          originalBody: preview.originalText,
          polishedBody: preview.polishedText,
          applyKind: preview.previewKind,
        });
      } else {
        await handleApplyPolishedSelection({
          notePath: preview.notePath,
          originalText: preview.originalText,
          polishedText: preview.polishedText,
          selectionRange: preview.selectionRange,
        });
      }
      handlePolishReviewChange({
        ...preview,
        applied: true,
        ignored: false,
        error: undefined,
      });
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      handlePolishReviewChange({
        ...preview,
        error: errorText,
      });
      toast.error(errorText);
    }
  };

  const ignorePolishReview = (reviewTab: PolishReviewTab) => {
    handlePolishReviewChange({
      ...reviewTab.preview,
      ignored: true,
      error: undefined,
    });
  };

  const finishFileSelection = (path: string, closeSearchOnSuccess: boolean) => {
    setCurrentFilePath(path);
    const id = getNoteWorkingCopyId(path);
    setActiveWorkingCopyId(id);
    setActiveWorkspaceTabId(id);
    if (closeSearchOnSuccess) {
      setIsSearchOpen(false);
      setSearchQuery("");
    }
  };

  const confirmPendingFileSelection = () => {
    if (!pendingFileSelection) return;
    const { path, closeSearchOnSuccess } = pendingFileSelection;
    setPendingFileSelection(null);
    finishFileSelection(path, closeSearchOnSuccess);
  };

  const cancelPendingFileSelection = () => {
    setPendingFileSelection(null);
  };

  const handleSelectFile = (path: string, options?: { closeSearchOnSuccess?: boolean }): boolean => {
    const selection = getTreeSelectionAfterFileSelect(path);
    setActiveTreeDirectoryPath(selection.activeTreeDirectoryPath);
    setActiveTreeFilePath(selection.activeTreeFilePath);
    if (path === currentFilePath) {
      setActiveWorkingCopyId(getNoteWorkingCopyId(path));
      setActiveWorkspaceTabId(getNoteWorkingCopyId(path));
      if (options?.closeSearchOnSuccess) {
        setIsSearchOpen(false);
        setSearchQuery("");
      }
      return true;
    }
    if (isSavingNote) {
      toast.info("当前笔记正在保存，请稍候再切换");
      return false;
    }
    persistActiveWorkingCopy();
    finishFileSelection(path, options?.closeSearchOnSuccess ?? false);
    return true;
  };

  const handleSelectOpenTab = (tab: OpenTab) => {
    if (tab.kind === "review") {
      setActiveWorkspaceTabId(tab.id);
      return;
    }
    if (tab.path) {
      handleSelectFile(tab.path);
      return;
    }
    const copy = workingCopies[tab.id];
    if (!copy) return;
    persistActiveWorkingCopy();
    setActiveWorkingCopyId(copy.id);
    setCurrentFilePath(copy.path);
    replaceEditorDocument(copy.markdown, copy.path, copy.frontmatterPrefix);
    savedSnapshotRef.current = {
      path: copy.path,
      frontmatterPrefix: copy.savedSnapshot.frontmatterPrefix,
      markdown: copy.savedSnapshot.markdown,
    };
    setIsDirty(copy.dirty);
    isDirtyRef.current = copy.dirty;
    setActiveWorkspaceTabId(copy.id);
  };

  const handleCloseOpenTab = async (tab: OpenTab) => {
    if (tab.kind === "review") {
      setOpenReviewTabs((current) => current.filter((item) => item.id !== tab.id));
      if (activeWorkspaceTabId === tab.id) {
        setActiveWorkspaceTabId(currentFilePath ?? openTabPaths[0] ?? null);
      }
      return;
    }

    const path = tab.path;
    if (!path) {
      const isClosingActiveUntitled = tab.id === activeWorkingCopyId;
      setWorkingCopies((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
      if (isClosingActiveUntitled) {
        setActiveWorkingCopyId(null);
        setCurrentFilePath(null);
        setActiveWorkspaceTabId(openReviewTabs[0]?.id ?? null);
        replaceEditorDocument("", null, "");
        setIsDirty(false);
        isDirtyRef.current = false;
      }
      return;
    }
    const tabIndex = openTabPaths.indexOf(path);
    if (tabIndex === -1) return;

    const noteWorkingCopyId = getNoteWorkingCopyId(path);
    const isClosingActiveTab = currentFilePath === path || activeWorkspaceTabId === noteWorkingCopyId;
    const nextPathAfterClose = getNextOpenTabPathAfterClose(openTabs, path);

    const nextTabs = openTabPaths.filter((tabPath) => tabPath !== path);
    setOpenTabPaths(nextPathAfterClose === null ? [] : nextTabs);
    setWorkingCopies((current) => {
      const next = { ...current };
      delete next[noteWorkingCopyId];
      return next;
    });

    if (!isClosingActiveTab) return;

    setPendingFileSelection(null);
    setIsDirty(false);

    if (nextPathAfterClose) {
      finishFileSelection(nextPathAfterClose, false);
    } else {
      setActiveWorkingCopyId(null);
      setCurrentFilePath(null);
      setActiveWorkspaceTabId(openReviewTabs[0]?.id ?? null);
    }
  };

  const handleSearchResultSelect = (path: string) => {
    handleSelectFile(path, { closeSearchOnSuccess: true });
  };

  const handleOpenLocalNoteFromAi = (relativePath: string, lineStart?: number | null): boolean => {
    const normalizedPath = relativePath.trim().replace(/\\/g, "/");
    if (!normalizedPath || normalizedPath.startsWith("/") || normalizedPath.split("/").includes("..")) {
      toast.error("本地笔记路径无效");
      return false;
    }
    if (!noteFiles.some((file) => file.path === normalizedPath)) {
      toast.warning("这条本地笔记可能已被移动或删除");
      return false;
    }
    const opened = handleSelectFile(normalizedPath);
    if (opened) {
      toast.success(lineStart ? `已打开笔记，相关片段约在 L${lineStart}` : "已打开笔记");
    }
    return opened;
  };

  const showSavedToast = (message: string, warning: string | null) => {
    if (warning) {
      toast.warning(`${message}（${warning}）`);
    } else {
      toast.success(message);
    }
  };

  const getUntitledSaveDefaultName = (copy: WorkingCopy): string => {
    const base = copy.displayName.trim() || "Untitled";
    return base.toLowerCase().endsWith(".md") ? base : `${base}.md`;
  };

  const handleSaveCurrentNote = async () => {
    const activeCopy = activeWorkingCopyId ? workingCopiesRef.current[activeWorkingCopyId] : null;
    if (!activeCopy && currentFilePath === null) {
      toast.info("请先打开一个笔记后再保存");
      return;
    }

    const liveMarkdown = markdownLiveRef.current;
    const liveFullMarkdown = getLiveFullMarkdown();
    flushCommittedMarkdownSync();
    setIsSavingNote(true);
    try {
      if (activeCopy?.kind === "untitled") {
        let defaultSaveDirectory: string | undefined;
        try {
          defaultSaveDirectory = await getNotesRootPath();
        } catch (error) {
          console.warn("Failed to resolve notes root for Save As dialog:", error);
        }
        const selectedPath = await showSaveMarkdownDialog(getUntitledSaveDefaultName(activeCopy), defaultSaveDirectory);
        if (!selectedPath) return;
        const classification = await classifyMarkdownSavePath(selectedPath);

        if (classification.kind === "note" && classification.relativePath) {
          const warning = await writeNote(classification.relativePath, liveFullMarkdown);
          const updated = await listNotes();
          const savedContent = await readNote(classification.relativePath);
          const loaded = splitLoadedMarkdown(savedContent);
          const nextCopy = markWorkingCopySaved(
            createNoteWorkingCopy(classification.relativePath, getNoteDisplayName(classification.relativePath, updated), {
              frontmatterPrefix: loaded.frontmatterPrefix,
              markdown: loaded.body,
            }),
            {
              frontmatterPrefix: loaded.frontmatterPrefix,
              markdown: loaded.body,
            },
          );
          setFiles(updated);
          setWorkingCopies((current) => {
            const next = { ...current };
            delete next[activeCopy.id];
            next[nextCopy.id] = nextCopy;
            return next;
          });
          setActiveWorkingCopyId(nextCopy.id);
          setCurrentFilePath(classification.relativePath);
          setActiveWorkspaceTabId(nextCopy.id);
          setActiveTreeDirectoryPath(null);
          setActiveTreeFilePath(classification.relativePath);
          applyLoadedMarkdown(savedContent, classification.relativePath);
          showSavedToast("已保存", warning);
          setIsDirty(false);
          isDirtyRef.current = false;
          return;
        }

        await writeExternalMarkdownFile(classification.absolutePath, liveFullMarkdown);
        const displayName = classification.absolutePath.replace(/\\/g, "/").split("/").pop() ?? activeCopy.displayName;
        const nextCopy = markWorkingCopySaved(
          createExternalWorkingCopy(classification.absolutePath, displayName, {
            frontmatterPrefix,
            markdown: liveMarkdown,
          }),
          { frontmatterPrefix, markdown: liveMarkdown },
        );
        setWorkingCopies((current) => {
          const next = { ...current };
          delete next[activeCopy.id];
          next[nextCopy.id] = nextCopy;
          return next;
        });
        setActiveWorkingCopyId(nextCopy.id);
        setActiveWorkspaceTabId(nextCopy.id);
        setIsDirty(false);
        isDirtyRef.current = false;
        toast.success("已保存");
        return;
      }

      if (activeCopy?.kind === "external" && activeCopy.absolutePath) {
        await writeExternalMarkdownFile(activeCopy.absolutePath, liveFullMarkdown);
        const savedCopy = markWorkingCopySaved(activeCopy, { frontmatterPrefix, markdown: liveMarkdown });
        setWorkingCopies((current) => ({ ...current, [savedCopy.id]: savedCopy }));
        setIsDirty(false);
        isDirtyRef.current = false;
        toast.success("已保存");
        return;
      }

      if (currentFilePath === null) {
        toast.info("请先打开一个笔记后再保存");
        return;
      }

      const warning = await writeNote(currentFilePath, liveFullMarkdown);
      try {
        const savedContent = await readNote(currentFilePath);
        applyLoadedMarkdown(savedContent, currentFilePath);
        const loaded = splitLoadedMarkdown(savedContent);
        const id = getNoteWorkingCopyId(currentFilePath);
        setWorkingCopies((current) => {
          const existing = current[id] ?? createNoteWorkingCopy(currentFilePath, getNoteDisplayName(currentFilePath, displayFiles), {
            frontmatterPrefix: loaded.frontmatterPrefix,
            markdown: loaded.body,
          });
          return {
            ...current,
            [id]: markWorkingCopySaved(existing, {
              frontmatterPrefix: loaded.frontmatterPrefix,
              markdown: loaded.body,
            }),
          };
        });
        setActiveWorkingCopyId(id);
        setActiveWorkspaceTabId(id);
      } catch (readError) {
        console.warn("Reload saved note failed:", readError);
        savedSnapshotRef.current = {
          path: currentFilePath,
          frontmatterPrefix,
          markdown: liveMarkdown,
        };
        const id = getNoteWorkingCopyId(currentFilePath);
        setWorkingCopies((current) => {
          const existing = current[id] ?? createNoteWorkingCopy(currentFilePath, getNoteDisplayName(currentFilePath, displayFiles), {
            frontmatterPrefix,
            markdown: liveMarkdown,
          });
          return {
            ...current,
            [id]: markWorkingCopySaved(existing, { frontmatterPrefix, markdown: liveMarkdown }),
          };
        });
      }
      showSavedToast("已保存", warning);
      setPendingAssetsByFile((prev) => {
        if (!prev[currentFilePath]) return prev;
        const next = { ...prev };
        delete next[currentFilePath];
        return next;
      });
      setIsDirty(false);
      isDirtyRef.current = false;
    } catch (err) {
      toast.error(`保存失败: ${getErrorMessage(err)}`);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleOpenNotesFolder = async () => {
    try {
      await openNotesFolder();
    } catch (e) {
      toast.error(`打开笔记文件夹失败：${getErrorMessage(e)}`);
    }
  };

  const handleMinimizeWindow = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      toast.error(`最小化窗口失败：${getErrorMessage(e)}`);
    }
  };

  const handleToggleMaximizeWindow = async () => {
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      toast.error(`最大化窗口失败：${getErrorMessage(e)}`);
    }
  };

  const handleMaximizeWindow = async () => {
    try {
      await getCurrentWindow().maximize();
    } catch (e) {
      toast.error(`最大化窗口失败：${getErrorMessage(e)}`);
    }
  };

  const handleRestoreWindow = async () => {
    try {
      await getCurrentWindow().unmaximize();
    } catch (e) {
      toast.error(`还原窗口失败：${getErrorMessage(e)}`);
    }
  };

  const handleToggleSettingsCenterMaximize = () => {
    if (isSettingsCenterMaximized) {
      const restoreRect = settingsCenterRestoreRectRef.current;
      setSettingsCenterRect(restoreRect ? getSafeOpenedSettingsCenterRect(restoreRect) : getDefaultSettingsCenterRect());
      setIsSettingsCenterMaximized(false);
      return;
    }
    settingsCenterRestoreRectRef.current = clampSettingsCenterRect(settingsCenterRect);
    setIsSettingsCenterMaximized(true);
  };

  const handleToggleLuoguDialogMaximize = () => {
    if (isLuoguDialogMaximized) {
      const restoreRect = luoguDialogRestoreRectRef.current;
      setLuoguDialogRect(restoreRect ? getSafeOpenedLuoguDialogRect(restoreRect) : getDefaultLuoguDialogRect());
      setIsLuoguDialogMaximized(false);
      return;
    }
    luoguDialogRestoreRectRef.current = clampLuoguDialogRect(luoguDialogRect);
    setIsLuoguDialogMaximized(true);
  };

  const beginSettingsCenterResize = (handle: SettingsResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = clampSettingsCenterRect(isSettingsCenterMaximized ? getMaximizedSettingsCenterRect() : settingsCenterRect);
    const panel = settingsCenterPanelRef.current;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    const previousPanelWillChange = panel?.style.willChange ?? "";
    const cursor = getSettingsCenterResizeCursor(handle);
    let latestRect = startRect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = cursor;
    if (panel) {
      panel.style.transition = "none";
      panel.style.animation = "none";
      panel.style.willChange = "left, top, width, height";
    }
    if (isSettingsCenterMaximized) setSettingsCenterRect(startRect);
    setIsSettingsCenterMaximized(false);

    const applyRectToPanel = (rect: SettingsCenterRect) => {
      if (!panel) return;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${rect.height}px`;
      panel.style.transform = "none";
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const nextRect = getResizedSettingsCenterRect(handle, startRect, moveEvent.clientX - startX, moveEvent.clientY - startY);
      latestRect = nextRect;
      applyRectToPanel(latestRect);
    };

    const handlePointerUp = () => {
      const finalRect = clampSettingsCenterRect(latestRect);
      latestRect = finalRect;
      applyRectToPanel(finalRect);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      if (panel) {
        panel.style.willChange = previousPanelWillChange;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      setSettingsCenterRect(finalRect);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const beginLuoguDialogResize = (handle: SettingsResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = clampLuoguDialogRect(isLuoguDialogMaximized ? getMaximizedLuoguDialogRect() : luoguDialogRect);
    const panel = luoguDialogPanelRef.current;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    const previousPanelWillChange = panel?.style.willChange ?? "";
    const cursor = getSettingsCenterResizeCursor(handle);
    let latestRect = startRect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = cursor;
    if (panel) {
      panel.style.transition = "none";
      panel.style.animation = "none";
      panel.style.willChange = "left, top, width, height";
    }
    if (isLuoguDialogMaximized) setLuoguDialogRect(startRect);
    setIsLuoguDialogMaximized(false);

    const applyRectToPanel = (rect: SettingsCenterRect) => {
      if (!panel) return;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.width = `${rect.width}px`;
      panel.style.height = `${rect.height}px`;
      panel.style.transform = "none";
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const nextRect = getResizedLuoguDialogRect(handle, startRect, moveEvent.clientX - startX, moveEvent.clientY - startY);
      latestRect = nextRect;
      applyRectToPanel(latestRect);
    };

    const handlePointerUp = () => {
      const finalRect = clampLuoguDialogRect(latestRect);
      latestRect = finalRect;
      applyRectToPanel(finalRect);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      if (panel) {
        panel.style.willChange = previousPanelWillChange;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      setLuoguDialogRect(finalRect);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const beginSettingsCenterDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, [role='button'], [data-no-window-drag='true']")) return;
    if (isSettingsCenterMaximized) return;

    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = clampSettingsCenterRect(settingsCenterRect);
    const panel = settingsCenterPanelRef.current;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    const previousPanelWillChange = panel?.style.willChange ?? "";
    let latestRect = startRect;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    if (panel) {
      panel.style.transition = "none";
      panel.style.animation = "none";
      panel.style.willChange = "left, top";
    }

    const applyRectToPanel = (rect: SettingsCenterRect) => {
      if (!panel) return;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.transform = "none";
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      latestRect = clampSettingsCenterRect({
        ...startRect,
        left: startRect.left + moveEvent.clientX - startX,
        top: startRect.top + moveEvent.clientY - startY,
      });
      applyRectToPanel(latestRect);
    };

    const handlePointerUp = () => {
      const finalRect = clampSettingsCenterRect(latestRect);
      applyRectToPanel(finalRect);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      if (panel) {
        panel.style.willChange = previousPanelWillChange;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      setSettingsCenterRect(finalRect);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const beginLuoguDialogDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, [role='button'], [data-no-window-drag='true']")) return;
    if (isLuoguDialogMaximized) return;

    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = clampLuoguDialogRect(luoguDialogRect);
    const panel = luoguDialogPanelRef.current;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    const previousPanelWillChange = panel?.style.willChange ?? "";
    let latestRect = startRect;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    if (panel) {
      panel.style.transition = "none";
      panel.style.animation = "none";
      panel.style.willChange = "left, top";
    }

    const applyRectToPanel = (rect: SettingsCenterRect) => {
      if (!panel) return;
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;
      panel.style.transform = "none";
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      latestRect = clampLuoguDialogRect({
        ...startRect,
        left: startRect.left + moveEvent.clientX - startX,
        top: startRect.top + moveEvent.clientY - startY,
      });
      applyRectToPanel(latestRect);
    };

    const handlePointerUp = () => {
      const finalRect = clampLuoguDialogRect(latestRect);
      applyRectToPanel(finalRect);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      if (panel) {
        panel.style.willChange = previousPanelWillChange;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      setLuoguDialogRect(finalRect);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const handleCloseWindow = async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      toast.error(`关闭窗口失败：${getErrorMessage(e)}`);
    }
  };

  const openSettingsSection = (target: SettingsSection | SettingsCategory) => {
    cancelPendingSettingsCenterCloseCleanup();
    const nextPage =
      target in SETTINGS_SECTION_FALLBACK
        ? settingsCenterHostRef.current?.openSection(target as SettingsCategory)
        : settingsCenterHostRef.current?.openPage(target as SettingsSection);
    if (!nextPage) return;
    if (nextPage.startsWith("ai-") && !aiConfigDraft && !isLoadingAiConfig) {
      void ensureAiConfigLoadedForSettings();
    } else if (nextPage === "diagnostics-search" && !aiConfigDraft && !isLoadingAiConfig) {
      setIsLoadingAiConfig(true);
      void refreshAiConfig()
        .catch((e) => toast.error(`AI 配置读取失败：${e}`))
        .finally(() => setIsLoadingAiConfig(false));
    }
  };

  const openSettingsCenter = () => {
    cancelPendingSettingsCenterCloseCleanup();
    settingsCenterHostRef.current?.open();
  };
  const scheduleSettingsCenterCloseCleanup = () => {
    cancelPendingSettingsCenterCloseCleanup();
    settingsCloseCleanupRafRef.current = window.requestAnimationFrame(() => {
      settingsCloseCleanupRafRef.current = null;
      settingsCloseCleanupTimeoutRef.current = window.setTimeout(() => {
        settingsCloseCleanupTimeoutRef.current = null;
        promptPolishRunRef.current += 1;
        setIsPolishingPrompt(false);
        setPromptPolishMessage(null);
        settingsCenterHostRef.current?.resetUiAfterClose();
      }, 0);
    });
  };

  const closeSettingsCenter = async () => {
    debugTagManager("settings.close", {
      hasTagManagerSession: Boolean(tagManagerSession),
      activeSettingsPage: settingsCenterActivePageRef.current,
      settingsView: settingsCenterViewRef.current,
      currentFilePath,
    });
    if (tagManagerSession) {
      debugTagManager("settings.close.ignoredForTagManager");
      return;
    }
    flushChatResponseStyleAutoSave();
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    void savePendingAiConfigDraft();
    settingsCenterHostRef.current?.close();
    scheduleSettingsCenterCloseCleanup();
  };

  const closePromptEditorToSettings = () => {
    promptPolishRunRef.current += 1;
    setIsPolishingPrompt(false);
    setPromptPolishMessage(null);
    settingsCenterHostRef.current?.closePromptEditor();
  };

  const handleSettingsCenterCloseRequest = () => {
    debugTagManager("settings.closeRequest", {
      hasTagManagerSession: Boolean(tagManagerSession),
      activeSettingsPage: settingsCenterActivePageRef.current,
      settingsView: settingsCenterViewRef.current,
      currentFilePath,
    });
    if (tagManagerSession) {
      debugTagManager("settings.closeRequest.ignoredForTagManager");
      return;
    }
    if (settingsCenterViewRef.current === "prompt-editor") {
      closePromptEditorToSettings();
      return;
    }
    if (settingsCenterViewRef.current === "ai-config-manager") {
      settingsCenterHostRef.current?.closeAiConfigManager();
      return;
    }
    if (settingsCenterViewRef.current === "luogu-account-manager") {
      settingsCenterHostRef.current?.closeLuoguAccountManager();
      return;
    }
    closeSettingsCenter();
  };

  const handleActivityNotes = () => {
    setIsNotesSidebarOpen((open) => (open && activeActivityItem === "notes" ? false : true));
  };

  const handleActivitySearch = () => {
    setIsSearchOpen(true);
  };

  const handleActivityLuogu = () => {
    void openLuoguDialog();
  };

  const handleActivityAi = () => {
    if (APP_RESIZE_PERF_DEBUG) {
      const opening = !isAiSidebarOpen;
      aiSidebarOpenPerfRef.current = {
        openClickAt: performance.now(),
        opening,
      };
      incrementNoteXAiPerfCounter("aiSidebarOpenClick");
      setNoteXAiPerfEvent("aiSidebarLastOpenClick", {
        opening,
        wasOpen: isAiSidebarOpen,
        at: aiSidebarOpenPerfRef.current.openClickAt,
      });
    }
    setIsAiSidebarOpen((open) => {
      if (open) setIsAiSidebarMaximized(false);
      return !open;
    });
  };

  const handleActivityBlog = () => {
    void handleOpenBlog();
  };

  const activityButtonClass = (_item: ActivityBarItem) => getActivityButtonClassName();

  // Ctrl+S / Cmd+S 保存当前笔记
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === "s")) return;
      if (isPromptEditorEventTarget(e.target)) return;
      e.preventDefault();
      if (settingsCenterOpenRef.current && settingsCenterViewRef.current === "prompt-editor") {
        void handleSavePrompt();
        return;
      }
      void handleSaveCurrentNote();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSaveCurrentNote, selectedPromptFileName, promptContent, isLoadingPrompt, isSavingPrompt, isPolishingPrompt]);

  // Ctrl+K / Cmd+K 打开当前窗口内搜索面板
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) return;
      e.preventDefault();
      setIsSearchOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${16 * appZoom}px`;
    root.style.setProperty("--app-zoom", String(appZoom));
    window.localStorage.setItem(APP_ZOOM_STORAGE_KEY, String(appZoom));

    return () => {
      root.style.fontSize = "";
      root.style.removeProperty("--app-zoom");
    };
  }, [appZoom]);

  useEffect(() => {
    window.localStorage.setItem(UI_SCALE_STORAGE_KEY, String(uiScale));
  }, [uiScale]);

  useEffect(() => {
    window.localStorage.setItem(CONTENT_ZOOM_STORAGE_KEY, String(contentZoom));
  }, [contentZoom]);

  useLayoutEffect(() => {
    requestEditorMeasure();
  }, [appZoom, contentZoom, editorFontSize, readingDensity, requestEditorMeasure]);

  useEffect(() => {
    return () => {
      if (contentZoomFrameRef.current !== null) {
        window.cancelAnimationFrame(contentZoomFrameRef.current);
        contentZoomFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_FONT_SIZE_STORAGE_KEY, String(editorFontSize));
  }, [editorFontSize]);

  useEffect(() => {
    window.localStorage.setItem(PREVIEW_FONT_SIZE_STORAGE_KEY, String(previewFontSize));
  }, [previewFontSize]);

  useEffect(() => {
    window.localStorage.setItem(READING_DENSITY_STORAGE_KEY, readingDensity);
  }, [readingDensity]);

  useEffect(() => {
    window.localStorage.setItem(TOOLBAR_FONT_SIZE_STORAGE_KEY, String(toolbarFontSize));
  }, [toolbarFontSize]);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_FONT_SIZE_STORAGE_KEY, String(settingsFontSize));
  }, [settingsFontSize]);

  useEffect(() => {
    window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, accentColor);
  }, [accentColor]);

  useEffect(() => {
    setAccentColor(activeSettingsTheme.theme.accent);
    setAppearanceContrast(activeSettingsTheme.theme.contrast);
    setTranslucentSidebar(activeSettingsTheme.theme.opaqueWindows);
  }, [activeSettingsTheme]);

  useEffect(() => {
    document.documentElement.classList.toggle("app-translucent-sidebar", translucentSidebar);
    window.localStorage.setItem(TRANSLUCENT_SIDEBAR_STORAGE_KEY, String(translucentSidebar));
  }, [translucentSidebar]);

  useEffect(() => {
    window.localStorage.setItem(CONTRAST_STORAGE_KEY, String(appearanceContrast));
  }, [appearanceContrast]);

  useEffect(() => {
    document.documentElement.classList.toggle("app-pointer-cursor", pointerCursor);
    window.localStorage.setItem(POINTER_CURSOR_STORAGE_KEY, String(pointerCursor));
  }, [pointerCursor]);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updateReducedMotionClass = () => {
      const shouldReduceMotion = reducedMotion === "on" || (reducedMotion === "system" && Boolean(mediaQuery?.matches));
      root.classList.toggle("app-reduced-motion", shouldReduceMotion);
    };

    updateReducedMotionClass();
    mediaQuery?.addEventListener?.("change", updateReducedMotionClass);
    window.localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, reducedMotion);
    return () => mediaQuery?.removeEventListener?.("change", updateReducedMotionClass);
  }, [reducedMotion]);

  useEffect(() => {
    window.localStorage.setItem(DIFF_MARKER_MODE_STORAGE_KEY, diffMarkerMode);
  }, [diffMarkerMode]);

  useEffect(() => {
    window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, developerModeEnabled ? "true" : "false");
  }, [developerModeEnabled]);

  useEffect(() => {
    if (settingsCenterViewRef.current !== "prompt-editor" || selectedPromptFileName || isLoadingPrompt) return;
    settingsCenterHostRef.current?.closePromptEditor();
  }, [isLoadingPrompt, selectedPromptFileName]);

  useEffect(() => {
    writeStoredLeftSidebarWidth(leftSidebarWidth);
  }, [leftSidebarWidth]);

  useEffect(() => {
    if (APP_RESIZE_PERF_DEBUG) {
      aiSidebarResizePerfRef.current.widthStateCommitCount += 1;
      incrementNoteXAiPerfCounter("appResizeStateCommit");
    }
    writeStoredAiSidebarWidth(aiSidebarWidth);
    if (APP_RESIZE_PERF_DEBUG) {
      aiSidebarResizePerfRef.current.localStorageWriteCount += 1;
      incrementNoteXAiPerfCounter("appResizeLocalStorageWrite");
    }
  }, [aiSidebarWidth]);

  useEffect(() => {
    writeStoredEditorPreviewRatio(editorPreviewRatio);
  }, [editorPreviewRatio]);

  useEffect(() => {
    settingsCenterMaximizedRef.current = isSettingsCenterMaximized;
  }, [isSettingsCenterMaximized]);

  useEffect(() => {
    aiSidebarOpenRef.current = isAiSidebarOpen;
    if (!APP_RESIZE_PERF_DEBUG) return;
    incrementNoteXAiPerfCounter("aiSidebarOpenStateCommit");
    setNoteXAiPerfEvent("aiSidebarLastOpenStateCommit", {
      isOpen: isAiSidebarOpen,
      at: performance.now(),
    });
    if (!isAiSidebarOpen || !aiSidebarOpenPerfRef.current.opening) return;
    const openClickAt = aiSidebarOpenPerfRef.current.openClickAt;
    window.requestAnimationFrame(() => {
      incrementNoteXAiPerfCounter("aiSidebarFirstVisible");
      incrementNoteXAiPerfCounter("aiSidebarOpenDuration");
      incrementNoteXAiPerfCounter("workbenchLayoutCommit");
      const summary = {
        openClickAt,
        firstVisibleAt: performance.now(),
        durationMs: performance.now() - openClickAt,
        isOpen: isAiSidebarOpen,
      };
      setNoteXAiPerfEvent("aiSidebarLastOpenSummary", summary);
      console.info("[NoteX Perf] ai sidebar open summary", summary);
    });
  }, [isAiSidebarOpen]);

  useEffect(() => {
    let resizeFrameId: number | null = null;

    const handleResize = () => {
      if (resizeFrameId !== null) return;
      resizeFrameId = window.requestAnimationFrame(() => {
        resizeFrameId = null;
        if (aiSidebarOpenRef.current) {
          setAiSidebarWidth((currentWidth) => clampAiSidebarWidth(currentWidth));
        }
        if (settingsCenterOpenRef.current && !settingsCenterMaximizedRef.current) {
          setSettingsCenterRect((currentRect) => {
            const nextRect = getSafeOpenedSettingsCenterRect(currentRect);
            return areSettingsCenterRectsEqual(currentRect, nextRect) ? currentRect : nextRect;
          });
        }
        const containerWidth = editorPreviewContainerRef.current?.getBoundingClientRect().width;
        setEditorPreviewRatio((currentRatio) => clampEditorPreviewRatio(currentRatio, containerWidth));
      });
    };

    window.addEventListener("resize", handleResize);
    return () => {
      if (resizeFrameId !== null) {
        window.cancelAnimationFrame(resizeFrameId);
      }
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    return () => document.body.classList.remove("app-column-resizing");
  }, []);

  useEffect(() => {
    let cancelled = false;

    getAiConfig()
      .then((config) => {
        if (cancelled) return;
        applyAiConfigState(config);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          console.error("读取 AI 配置状态失败：", e.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHasLoadedAiConfigStatus(true);
        }
      });

    getLuoguConfig()
      .then((config) => {
        if (cancelled) return;
        applyLuoguConfigFormState(config);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          console.error("读取洛谷配置状态失败：", e.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setHasLoadedLuoguConfigStatus(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let timeoutId: number | undefined;
    let idleCallbackId: number | undefined;

    const runPrewarm = () => {
      void prewarmMarkdownRenderer();
    };

    if (typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(runPrewarm, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(runPrewarm, 1000);
    }

    return () => {
      if (idleCallbackId !== undefined && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  // Ctrl/Cmd + Plus/Minus/0 缩放整个应用界面，不拦截 Ctrl+S 保存；内容缩放由 Ctrl+滚轮处理。
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      const key = e.key.toLowerCase();
      if (key === "+" || key === "=") {
        e.preventDefault();
        updateAppZoom((currentZoom) => currentZoom + APP_ZOOM_STEP);
      } else if (key === "-" || key === "_") {
        e.preventDefault();
        updateAppZoom((currentZoom) => currentZoom - APP_ZOOM_STEP);
      } else if (key === "0") {
        e.preventDefault();
        updateAppZoom(APP_ZOOM_DEFAULT);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!currentFilePath) return;
    const isReviewActive = openReviewTabs.some((tab) => tab.id === activeWorkspaceTabId);
    const noteWorkingCopyId = getNoteWorkingCopyId(currentFilePath);
    if (!activeWorkspaceTabId || (!isReviewActive && activeWorkspaceTabId !== noteWorkingCopyId)) {
      setActiveWorkspaceTabId(noteWorkingCopyId);
    }
  }, [activeWorkspaceTabId, currentFilePath, openReviewTabs]);

  // 当选中文件变化时，从后端读取内容
  // 使用 cancelled flag 防御 race condition：
  // 快速连续点击不同文件时，后到的响应可能比先到的早 resolve，
  // cancelled 确保只有最新一次 readNote 的结果会被 setMarkdown 采用。
  useEffect(() => {
    if (currentFilePath === null) {
      if (activeWorkingCopyId) return;
      // No active editor document: keep the editor model empty and show the empty workbench.
      replaceEditorDocument("", null, "");
      savedSnapshotRef.current = {
        path: null,
        frontmatterPrefix: "",
        markdown: "",
      };
      setIsDirty(false);
      isDirtyRef.current = false;
      return;
    }

    const cached = workingCopiesRef.current[getNoteWorkingCopyId(currentFilePath)];
    if (cached) {
      replaceEditorDocument(cached.markdown, cached.path, cached.frontmatterPrefix);
      savedSnapshotRef.current = {
        path: cached.path,
        frontmatterPrefix: cached.savedSnapshot.frontmatterPrefix,
        markdown: cached.savedSnapshot.markdown,
      };
      setIsDirty(cached.dirty);
      isDirtyRef.current = cached.dirty;
      setActiveWorkingCopyId(cached.id);
      return;
    }

    if (skipNextReadForPathRef.current === currentFilePath) {
      skipNextReadForPathRef.current = null;
      return;
    }

    let cancelled = false;

    readNote(currentFilePath)
      .then((content) => {
        if (!cancelled) {
          applyLoadedMarkdown(content, currentFilePath);
          const loaded = splitLoadedMarkdown(content);
          const id = getNoteWorkingCopyId(currentFilePath);
          setWorkingCopies((current) => ({
            ...current,
            [id]: createNoteWorkingCopy(currentFilePath, getNoteDisplayName(currentFilePath, displayFiles), {
              frontmatterPrefix: loaded.frontmatterPrefix,
              markdown: loaded.body,
            }),
          }));
          setActiveWorkingCopyId(id);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) console.error("读取笔记失败：", e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [activeWorkingCopyId, applyLoadedMarkdown, currentFilePath, displayFiles, replaceEditorDocument]);

  const folderDialogState = getFolderDialogState(dialogMode, dialogValue, folderParentDirectory);
  const folderNameValidationMessage = folderDialogState.nameValidationMessage;
  const folderParentValidationMessage = folderDialogState.parentValidationMessage;
  const folderDialogHelpText = folderDialogState.helpText;
  const canConfirmFolderDialog = folderDialogState.canConfirm;

  void luoguSettingsStatusTone;

  return (
    <>
    <Toaster theme={resolvedTheme} position="bottom-right" />
    <AppContextMenu
      developerModeEnabled={developerModeEnabled}
      actions={{
        createNote: (parentPath) => parentPath === undefined ? requestInlineCreateFile() : requestInlineCreateFileAt(parentPath),
        createFolder: (parentPath) => parentPath === undefined ? requestInlineCreateFolder() : requestInlineCreateFolderAt(parentPath),
        openFile: (path) => { handleSelectFile(path); },
        renameTreeItem: openRenameDialog,
        deleteTreeItem: (path, isDirectory) => { void handleDelete(path, isDirectory); },
        openLuoguImport: () => { void openLuoguDialog(); },
        openBlog: () => { void handleOpenBlog(); },
        openSettings: openSettingsCenter,
        minimizeWindow: handleMinimizeWindow,
        maximizeWindow: handleMaximizeWindow,
        restoreWindow: handleRestoreWindow,
        closeWindow: handleCloseWindow,
        isWindowMaximized: () => getCurrentWindow().isMaximized(),
      }}
    />
    <ConfirmDialog
      open={Boolean(confirmDialog)}
      title={confirmDialog?.title ?? ""}
      description={confirmDialog?.description}
      confirmText={confirmDialog?.confirmText}
      cancelText={confirmDialog?.cancelText}
      danger={confirmDialog?.danger}
      onConfirm={handleConfirmDialogConfirm}
      onCancel={handleConfirmDialogCancel}
    />
    <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
      <DialogContent className="flex h-[min(72vh,680px)] w-[min(760px,calc(100vw-48px))] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4" />
            搜索笔记
          </DialogTitle>
        </DialogHeader>
        <div className="shrink-0 border-b border-border p-4">
          <Input
            ref={searchInputRef}
            value={searchQuery}
            placeholder="搜索标题、路径、标签、摘要或正文"
            className="h-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults[0]) {
                e.preventDefault();
                handleSearchResultSelect(searchResults[0].path);
              }
            }}
          />
          <div className="mt-2 text-[11px] text-muted-foreground">
            {trimmedSearchQuery === "" ? "显示最近修改的笔记" : "支持标题、路径、标签、摘要和正文搜索"}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
          {isSearchLoading && (
            <div className="mb-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
              正在搜索本地笔记...
            </div>
          )}
          {searchError && trimmedSearchQuery !== "" && (
            <div className="mb-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
              后端搜索暂时失败，已显示本地标题和路径的兜底结果：{searchError}
            </div>
          )}
          {searchResults.length === 0 && !isSearchLoading ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              没有找到匹配的笔记
            </div>
          ) : (
            <div className="grid gap-1">
              {searchResults.map((result) => {
                return (
                  <button
                    key={result.path}
                    type="button"
                    className="grid w-full min-w-0 gap-1 rounded-[var(--ui-radius-item)] border border-transparent px-3 py-2.5 text-left outline-none transition-[background-color,border-color,box-shadow] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:border-[var(--ui-border-control)] hover:bg-[var(--ui-state-hover)] focus-visible:border-[var(--ui-focus-ring)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)]"
                    onClick={() => handleSearchResultSelect(result.path)}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">
                        {result.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatSearchDate(result.modified)}
                      </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="shrink-0 rounded-sm border border-border/70 px-1.5 py-0.5 font-medium">
                        {result.category}
                      </span>
                      <span className="min-w-0 truncate font-mono">
                        {result.path}
                      </span>
                    </div>
                    {result.tags.length > 0 && (
                      <div className="flex min-w-0 flex-wrap gap-1">
                        {result.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="max-w-32 truncate rounded-sm bg-muted/45 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {(result.summary || result.excerpt) && (
                      <div className="line-clamp-2 text-[11px] leading-5 text-muted-foreground/85">
                        {result.summary || result.excerpt}
                      </div>
                    )}
                    {trimmedSearchQuery !== "" && result.source === "local" && (
                      <div className="text-[11px] text-muted-foreground/80">
                        本地兜底相关度 {Math.round(result.score)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t border-border px-5 py-2 text-[11px] text-muted-foreground">
          Enter 打开第一条结果，点击结果后会关闭搜索。
        </div>
      </DialogContent>
    </Dialog>
    <TagPickerDialog
      open={isTagPickerOpen}
      selectedTags={frontmatterDisplayTags}
      selectedCollections={effectiveCollections}
      collectionCandidates={collectionCandidates}
      userConfig={tagTaxonomyUserConfig}
      onOpenChange={(open) => {
        if (!open) closeTagPicker();
      }}
      onConfirm={confirmTagPicker}
    />    <Dialog open={dialogMode === "create" || dialogMode === "rename"} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="flex max-h-[min(86vh,760px)] w-[min(720px,calc(100vw-48px))] max-w-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle>
            {dialogMode === "create" ? "新建笔记" : renameTargetIsDirectory ? "重命名文件夹" : "重命名笔记"}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="grid gap-5">
            {dialogMode === "create" && (
              <section className="grid gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <Label>保存位置</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={openCreateFolderDialog}>
                    <FolderPlus className="h-3.5 w-3.5" />新建文件夹
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { id: "root" as const, title: "笔记根目录", description: "直接创建在 notes 根目录" },
                    { id: "current" as const, title: currentNoteDirectory ? `当前：${currentNoteDirectory}/` : "当前：根目录", description: "沿用当前打开笔记所在文件夹" },
                    { id: "tricks" as const, title: "tricks/", description: "技巧、模板、结论整理" },
                    { id: "problems" as const, title: "problems/", description: "题解与训练记录" },
                    { id: "custom" as const, title: "自定义文件夹", description: "选择已有目录或输入新目录" },
                  ].map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={cn(
                        "flex min-h-16 items-start gap-2 rounded-[var(--ui-radius-item)] border px-3 py-2 text-left text-sm outline-none transition-[background-color,border-color,box-shadow] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)]",
                        newNoteLocationOption === option.id ? "border-[var(--ui-focus-ring)] bg-[var(--ui-state-selected)] text-[var(--ui-state-selected-foreground)]" : "border-[var(--ui-border-control)] bg-background",
                      )}
                      onClick={() => setNewNoteLocationOption(option.id)}
                    >
                      <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", newNoteLocationOption === option.id ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {newNoteLocationOption === option.id && <Check className="h-3 w-3" />}
                      </span>
                      <span className="grid min-w-0 gap-1">
                        <span className="truncate font-medium text-foreground">{option.title}</span>
                        <span className="text-xs leading-4 text-muted-foreground">{option.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {newNoteLocationOption === "custom" && (
                  <div className="grid gap-2 rounded-md border border-border bg-muted/15 p-3">
                    <Label htmlFor="custom-directory">自定义文件夹</Label>
                    <Input
                      id="custom-directory"
                      value={newNoteCustomDirectory}
                      onChange={(e) => setNewNoteCustomDirectory(e.target.value)}
                      placeholder="例如 review/2026，不需要前后斜杠"
                      list="note-directory-options"
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-36 overflow-y-auto rounded-sm border border-border/70 bg-background/60 py-1">
                      <button
                        type="button"
                        className={cn(
                          "block w-full truncate rounded-[var(--ui-radius-item)] px-2 py-1 text-left text-xs outline-none transition-[background-color,color,box-shadow] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)]",
                          newNoteCustomDirectory.trim() === "" && "bg-[var(--ui-state-selected)] text-[var(--ui-state-selected-foreground)]",
                        )}
                        onClick={() => setNewNoteCustomDirectory("")}
                      >
                        笔记根目录
                      </button>
                      {noteDirectories.map((directory) => (
                        <button
                          key={directory}
                          type="button"
                          className={cn(
                            "block w-full truncate rounded-[var(--ui-radius-item)] px-2 py-1 text-left font-mono text-xs outline-none transition-[background-color,color,box-shadow] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)]",
                            newNoteCustomDirectory.trim() === directory && "bg-[var(--ui-state-selected)] text-[var(--ui-state-selected-foreground)]",
                          )}
                          style={{ paddingLeft: `${8 + directory.split("/").length * 10}px` }}
                          onClick={() => setNewNoteCustomDirectory(directory)}
                          title={directory}
                        >
                          {directory}/
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {dialogMode === "create" && (
              <section className="grid gap-2.5">
                <Label>标签</Label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_NOTE_TAGS.map((tag) => {
                    const selected = newNoteTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium outline-none transition-[background-color,border-color,box-shadow] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)]",
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-[var(--ui-border-control)] bg-background text-foreground/90",
                        )}
                        aria-pressed={selected}
                        onClick={() => toggleNewNoteTag(tag)}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="grid gap-2.5">
              <Label htmlFor="filename">文件名</Label>
              <Input
                id="filename"
                value={dialogValue}
                onChange={(e) => setDialogValue(e.target.value)}
                placeholder={renameTargetIsDirectory ? "输入文件夹名" : "不需要输入 .md"}
                autoFocus
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleDialogConfirm();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeDialog();
                  }
                }}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {dialogMode === "rename" && renameTarget
                  ? renameTargetIsDirectory
                    ? "只会修改当前文件夹名称，子文件路径会同步更新"
                    : "可以输入 abc 或 abc.md，保存时不会丢失或重复 .md 后缀"
                  : "创建空白 Markdown 文件，只写入标题、标签和创建时间 frontmatter"}
              </p>
              <datalist id="note-directory-options">
                {noteDirectories.map((directory) => (
                  <option key={directory} value={directory} />
                ))}
              </datalist>
            </section>
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t border-border bg-background px-6 py-4">
          <Button variant="outline" onClick={closeDialog}>取消</Button>
          <Button onClick={handleDialogConfirm} disabled={!dialogValue.trim()}>
            {dialogMode === "create" ? "创建" : "重命名"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={dialogMode === "create-folder"} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent className="w-[min(400px,calc(100vw-32px))] max-w-none gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-sm">新建文件夹</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 px-4 py-3">
          <div className="grid gap-1.5">
            <Label htmlFor="compact-folder-parent" className="text-xs">父级目录</Label>
            <Input
              id="compact-folder-parent"
              className="h-8 text-xs"
              value={folderParentDirectory}
              onChange={(e) => setFolderParentDirectory(e.target.value)}
              placeholder="根目录"
              list="compact-note-directory-options"
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeDialog();
                }
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="compact-folder-name" className="text-xs">文件夹名</Label>
            <Input
              id="compact-folder-name"
              className="h-8 text-sm"
              value={dialogValue}
              onChange={(e) => setDialogValue(e.target.value)}
              placeholder="输入文件夹名"
              autoFocus
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter" && canConfirmFolderDialog) {
                  e.preventDefault();
                  handleDialogConfirm();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  closeDialog();
                }
              }}
            />
            <p className={cn("min-h-4 text-[11px] leading-4", folderNameValidationMessage || folderParentValidationMessage ? "text-destructive" : "text-muted-foreground")}>
              {folderDialogHelpText}
            </p>
          </div>
          <datalist id="compact-note-directory-options">
            {noteDirectories.map((directory) => (
              <option key={directory} value={directory} />
            ))}
          </datalist>
        </div>
        <DialogFooter className="border-t border-border bg-background px-4 py-3">
          <Button variant="outline" size="sm" onClick={closeDialog}>取消</Button>
          <Button size="sm" onClick={handleDialogConfirm} disabled={!canConfirmFolderDialog}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={pendingFileSelection !== null} onOpenChange={(open) => !open && cancelPendingFileSelection()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>有未保存的更改</DialogTitle>
        </DialogHeader>
        <p className="text-sm leading-6 text-muted-foreground">
          当前笔记还没有保存，切换后未保存内容会丢失。
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={cancelPendingFileSelection}>
            取消
          </Button>
          <Button type="button" variant="destructive" onClick={confirmPendingFileSelection}>
            放弃更改并切换
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={isLuoguSettingsOpen} onOpenChange={(open) => !open && closeLuoguSettings()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>洛谷设置</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            <div>需要从浏览器洛谷 Cookie 中复制 _uid 和 __client_id。</div>
            <div>路径：F12 - Application/应用 - Cookies - https://www.luogu.com.cn。</div>
            <div>不要把 __client_id 发给别人，也不要上传到公共位置。</div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="luogu-config-uid">UID</Label>
            <Input
              id="luogu-config-uid"
              value={luoguConfigUid}
              disabled={isLoadingLuoguConfig || isSavingLuoguConfig}
              placeholder="洛谷 _uid"
              onChange={(e) => {
                setLuoguConfigUid(e.target.value);
                setLuoguConnectionResult(null);
                setLuoguConnectionError(null);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="luogu-config-client-id">__client_id</Label>
            <Input
              id="luogu-config-client-id"
              value={luoguConfigClientId}
              disabled={isLoadingLuoguConfig || isSavingLuoguConfig}
              placeholder="洛谷 __client_id"
              type="password"
              onChange={(e) => {
                setLuoguConfigClientId(e.target.value);
                setLuoguConnectionResult(null);
                setLuoguConnectionError(null);
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="luogu-config-last-submission-id">最后同步提交 ID</Label>
            <Input
              id="luogu-config-last-submission-id"
              value={luoguConfigLastSubmissionId}
              disabled={isLoadingLuoguConfig || isSavingLuoguConfig}
              placeholder="留空表示尚未同步"
              inputMode="numeric"
              onChange={(e) => setLuoguConfigLastSubmissionId(e.target.value)}
            />
          </div>
          {luoguSyncResult && (
            <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
              <div className="font-medium text-foreground">
                洛谷同步：扫描 {luoguSyncResult.scannedPages} 页 / {luoguSyncResult.scannedCount} 条，AC {luoguSyncResult.acCount} 条，AI 导入 {luoguSyncResult.aiImportedCount} 篇
              </div>
              <div className="grid gap-1 text-muted-foreground">
                <div>
                  AI 整理：是，模型：{luoguSyncResult.aiModel ?? "未配置"}
                </div>
                <div>
                  AI 跳过 {luoguSyncResult.aiSkippedCount} 条，AI 失败 {luoguSyncResult.aiFailedCount} 条，跳过无心得 {luoguSyncResult.skippedNoInsight} 条，已存在 {luoguSyncResult.skippedExisting} 条，总失败 {luoguSyncResult.failedCount} 条
                </div>
                <div>
                  {luoguSyncResult.reachedLastSubmissionId ? "已触达最后同步提交 ID" : "未触达最后同步提交 ID"}
                </div>
                <div>
                  最后同步提交 ID：{luoguSyncResult.updatedLastSubmissionId ?? "未更新"}
                </div>
                {luoguSyncResult.importedPaths.map((path) => (
                  <div key={path} className="font-mono">{path}</div>
                ))}
                {luoguSyncResult.warnings.slice(0, 3).map((warning) => (
                  <div key={warning} className="text-amber-400">{warning}</div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeLuoguSettings} disabled={isSavingLuoguConfig || isSyncingLuogu}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={handleTestLuoguConnection}
            disabled={isLoadingLuoguConfig || isSavingLuoguConfig || isTestingLuoguConnection || isSyncingLuogu}
          >
            测试连接
          </Button>
          <Button
            onClick={handleSaveLuoguConfig}
            disabled={isLoadingLuoguConfig || isSavingLuoguConfig || isTestingLuoguConnection || isSyncingLuogu}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {isLuoguDialogOpen && (
      <div className="fixed inset-0 z-[70] bg-slate-950/18 backdrop-blur-[1px] dark:bg-black/55 dark:backdrop-blur-sm">
        <section
          ref={luoguDialogPanelRef}
          className="fixed left-0 top-0 flex max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-2xl"
          style={luoguDialogStyle}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="shrink-0 border-b border-border bg-muted/10">
              <div
                className={cn(
                  "flex items-start justify-between gap-4 px-4 py-2.5 pr-44",
                  isLuoguDialogMaximized ? "cursor-default" : "cursor-grab active:cursor-grabbing",
                )}
                onPointerDown={beginLuoguDialogDrag}
              >
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold tracking-tight">洛谷导入中心</h2>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>扫描提交、选择候选、生成预览、确认写入</span>
                    <span>路</span>
                    <span>洛谷账号：<span className={luoguConfigured ? "text-emerald-300" : "text-amber-300"}>{luoguImportCenterAccountLabel}</span></span>
                    <span>路</span>
                    <span>AI：<span className={luoguConfigAiConfigured ? "text-emerald-300" : "text-amber-300"}>{luoguImportCenterAiLabel}</span></span>
                    <span>路</span>
                    <button
                      type="button"
                      className="text-foreground underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
                      onClick={openLuoguRulesSettingsFromDialog}
                      disabled={isLuoguImportCenterBusyNow}
                      data-no-window-drag="true"
                    >
                      规则设置
                    </button>
                  </div>
                </div>
              </div>
              <div className="absolute right-2.5 top-2.5 z-30 flex items-center gap-1">
                {[
                  { id: "scan" as const, label: "提交扫描", icon: ListChecks },
                  { id: "manual" as const, label: "手动导入", icon: Keyboard },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = luoguImportCenterTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50",
                        active
                          ? "border-primary/45 bg-primary/15 text-foreground"
                          : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                      )}
                      onClick={() => setLuoguImportCenterTab(tab.id)}
                      disabled={isLuoguImportCenterBusyNow}
                      title={tab.label}
                      aria-label={tab.label}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  onClick={handleToggleLuoguDialogMaximize}
                  title={isLuoguDialogMaximized ? "还原洛谷导入中心" : "最大化洛谷导入中心"}
                  aria-label={isLuoguDialogMaximized ? "还原洛谷导入中心" : "最大化洛谷导入中心"}
                >
                  {isLuoguDialogMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50"
                    onClick={closeLuoguDialog}
                    disabled={isLuoguImportCenterBusyNow}
                  title={luoguDialogReturnTarget ? "返回设置中心" : "关闭洛谷导入中心"}
                    aria-label="关闭洛谷导入中心"
                  >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {!luoguConfigured && !isLoadingLuoguConfig && (
                <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-1.5 text-xs text-amber-300" data-no-window-drag="true">
                  <span>洛谷账号未配置，无法扫描提交记录。</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-amber-500/50 bg-transparent px-2 text-xs text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                    onClick={() => void openLuoguAccountSettingsFromDialog()}
                  >
                    去设置
                  </Button>
                </div>
              )}
            </header>

            <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background/60">
                {luoguImportCenterTab === "scan" && (
                  luoguImportStep === "scan" ? (
                  <div className="grid h-full min-h-0 grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)]">
                    <aside className="min-h-0 border-r border-border bg-background/45">
                      <div className="grid gap-2 p-2.5">
                        <section className="grid gap-1.5">
                          <div>
                            <div className="text-sm font-medium text-foreground">扫描范围</div>
                          </div>
                          <div className="grid gap-1.5 text-sm">
                            {LUOGU_SCAN_COUNT_OPTIONS.map((count) => ({
                              label: count === 200 ? "自定义" : `最近 ${count}`,
                              mode: "count" as const,
                              count,
                            })).map((option) => (
                              <button
                                key={option.label}
                                type="button"
                                className={luoguScanMode === option.mode && luoguScanCountLimit === option.count ? "rounded-md border border-primary/60 bg-primary/15 px-3 py-2 text-left font-medium text-foreground" : "rounded-md border border-border bg-background/50 px-3 py-2 text-left text-muted-foreground hover:text-foreground"}
                                onClick={() => {
                                  setLuoguScanMode(option.mode);
                                  setLuoguScanCountLimit(option.count);
                                }}
                                disabled={isScanningLuoguPreview}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          {isLuoguScanTaskRunning ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="mt-1 h-10 w-full text-base font-semibold"
                              onClick={handlePauseLuoguScan}
                            >
                              <Pause className="mr-1.5 h-4 w-4" />
                              暂停扫描
                            </Button>
                          ) : isLuoguScanTaskPaused ? (
                            <div className="mt-1 grid gap-1.5">
                              <Button
                                size="sm"
                                className="h-10 w-full text-base font-semibold"
                                onClick={handleResumeLuoguScan}
                              >
                                <Play className="mr-1.5 h-4 w-4" />
                                继续扫描
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-full text-xs"
                                onClick={handleRestartLuoguScan}
                              >
                                重新扫描
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              className="mt-1 h-10 w-full text-base font-semibold"
                              onClick={handlePreviewLuoguSubmissions}
                              disabled={!luoguConfigured || isLoadingLuoguConfig || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isSyncingLuogu}
                            >
                              开始扫描
                            </Button>
                          )}
                          {(luoguScanCountLimit === 200 || luoguScanMode === "days") && (
                            <div className="grid gap-1.5 border-t border-border pt-2 text-sm">
                              <div className="text-xs text-muted-foreground">自定义范围</div>
                              <div className="grid gap-1.5">
                                <button
                                  type="button"
                                  className={luoguScanMode === "count" && luoguScanCountLimit === 200 ? "rounded-md border border-primary/60 bg-primary/15 px-3 py-1.5 text-left text-foreground" : "rounded-md border border-border bg-background/50 px-3 py-1.5 text-left text-muted-foreground hover:text-foreground"}
                                  onClick={() => {
                                    setLuoguScanMode("count");
                                    setLuoguScanCountLimit(200);
                                  }}
                                  disabled={isScanningLuoguPreview}
                                >
                                  最近 200 条
                                </button>
                                {LUOGU_SCAN_DAYS_OPTIONS.map((option) => (
                                  <button
                                    key={option}
                                    type="button"
                                    className={luoguScanMode === "days" && luoguScanDaysLimit === option ? "rounded-md border border-primary/60 bg-primary/15 px-3 py-1.5 text-left text-foreground" : "rounded-md border border-border bg-background/50 px-3 py-1.5 text-left text-muted-foreground hover:text-foreground"}
                                    onClick={() => {
                                      setLuoguScanMode("days");
                                      setLuoguScanDaysLimit(option);
                                    }}
                                    disabled={isScanningLuoguPreview}
                                  >
                                    {option} 天
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </section>
                      </div>
                    </aside>

                    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background/70">
                      <div className="shrink-0 border-b border-border bg-muted/15">
                        <div className="flex min-w-0 items-center justify-between gap-3 px-3 py-1.5">
                          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                            <div className="shrink-0 text-base font-medium text-foreground">扫描结果</div>
                            <div className="min-w-0 truncate text-sm text-muted-foreground">
                              {luoguScanResultSummaryLabel}
                              {!isLuoguScanTaskPaused && luoguScanProgress?.waiting && <span className="ml-2 text-foreground">等待下一页...</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center justify-end gap-2">
                            <div className="text-xs text-muted-foreground">{luoguImportCenterRangeLabel}</div>
                            {luoguPreviewResult && displayedLuoguPreviewSubmissions.length > 0 && (
                              <>
                                <div className="text-sm text-muted-foreground">
                                  已选 <span className="font-medium text-foreground">{selectedLuoguImportCount}</span>
                                </div>
                              <Button
                                size="sm"
                                className="h-8 px-3 text-xs"
                                onClick={handlePrepareSelectedLuoguSubmissions}
                                disabled={
                                  selectedLuoguImportCount === 0 ||
                                  (luoguPrepareQueueSubmissions.length === 0 && luoguReusablePreviewCount === 0) ||
                                  isPreparingSelectedLuogu ||
                                  isWritingPreparedLuogu ||
                                  isSyncingLuogu
                                }
                              >
                                {luoguPrepareButtonLabel}
                              </Button>
                              {isPreparingSelectedLuogu && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={handleStopPreparingLuoguPreviews}
                                  disabled={isStoppingLuoguPrepare}
                                >
                                  {isStoppingLuoguPrepare ? "停止中..." : "停止生成"}
                                </Button>
                              )}
                              </>
                            )}
                          </div>
                        </div>
                        {luoguPreviewResult && displayedLuoguPreviewSubmissions.length > 0 && luoguPrepareProgress && (
                          <div className="border-t border-border/70 px-3 py-1 text-xs text-muted-foreground">
                            {isStoppingLuoguPrepare ? "正在停止生成" : "正在生成预览"} {luoguPrepareProgress.current} / {luoguPrepareProgress.total}
                            <span className="ml-2">成功 {luoguPrepareProgress.succeeded} 路 失败 {luoguPrepareProgress.failed} 路 跳过 {luoguPrepareProgress.skipped}</span>
                            {currentlyPreparingLuoguSubmission && (
                              <span className="ml-2 font-mono">{currentlyPreparingLuoguSubmission.problemId || "未知题号"} 路 {currentlyPreparingLuoguSubmission.submissionId}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {isLuoguScanTaskRunning && !luoguPreviewResult ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
                          <div>
                            <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
                            <div className="mt-3 text-sm font-medium text-foreground">正在扫描{luoguImportCenterRangeLabel}提交……</div>
                            <div className="mt-1 text-xs text-muted-foreground">请稍候，结果会自动出现在右侧表格。</div>
                          </div>
                        </div>
                      ) : isLuoguScanTaskPaused && !luoguPreviewResult ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
                          <div>
                            <Pause className="mx-auto h-7 w-7 text-muted-foreground" />
                            <div className="mt-3 text-sm font-medium text-foreground">扫描已暂停</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              点击「继续扫描」从断点继续。
                            </div>
                          </div>
                        </div>
                      ) : isLuoguScanTaskFailed && !luoguPreviewResult ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
                          <div>
                            <div className="text-sm font-medium text-destructive">扫描失败，请检查洛谷连接或稍后重试。</div>
                            <div className="mt-2 text-xs leading-5 text-muted-foreground">
                              可以先回设置页测试连接。
                            </div>
                          </div>
                        </div>
                      ) : !luoguPreviewResult ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
                          <div>
                            <div className="text-sm font-medium text-foreground">还没有扫描结果。</div>
                            <div className="mt-2 text-xs leading-5 text-muted-foreground">
                              选择扫描范围后，点击"开始扫描"。
                            </div>
                          </div>
                        </div>
                      ) : displayedLuoguPreviewSubmissions.length === 0 ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
                          <div>
                            <div className="text-sm font-medium text-foreground">扫描完成，但没有找到可导入提交。</div>
                            <div className="mt-2 text-xs leading-5 text-muted-foreground">可以调整扫描范围后重试。</div>
                          </div>
                        </div>
                      ) : (
                        <>
                          {luoguCurrentCandidateCount === 0 && (
                            <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
                              <span className="font-medium text-foreground">扫描完成，但没有找到可导入提交。</span>
                            </div>
                          )}
                          <div className="min-h-0 flex-1 overflow-auto dark:bg-[#242424]">
                            <div className="min-w-0">
                              <div className="sticky top-0 z-10 grid min-w-0 grid-cols-[42px_minmax(240px,1fr)_104px_86px_136px_132px] gap-2 border-b border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">
                                <div className="flex items-center" onClick={(event) => event.stopPropagation()}>
                                  <input
                                    ref={luoguSelectAllCheckboxRef}
                                    type="checkbox"
                                    checked={areAllLuoguSelectableSubmissionsSelected}
                                    disabled={luoguSelectableSubmissionIds.length === 0 || isPreparingSelectedLuogu || isWritingPreparedLuogu || isSyncingLuogu}
                                    className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                                    aria-label={areAllLuoguSelectableSubmissionsSelected ? "取消选择当前可选提交" : "选择当前可选提交"}
                                    onChange={handleToggleAllLuoguSelectableSubmissions}
                                  />
                                </div>
                                <div>题目</div>
                                <div>难度</div>
                                <div>状态</div>
                                <div>提交时间</div>
                                <div>处理建议</div>
                              </div>
                              {displayedLuoguPreviewSubmissions.map((submission) => {
                                const candidateState = luoguSubmissionCandidateStates[submission.submissionId] ?? { canSelect: false, defaultSelected: false, statusLabel: submission.statusLabel };
                                const canSelect = candidateState.canSelect;
                                const prepared = luoguPreparedNotesById[submission.submissionId];
                                const prepareError = luoguPrepareErrorsById[submission.submissionId];
                                const writeResult = luoguWriteResultsById[submission.submissionId];
                                const prepareStatus = luoguPrepareStatusesById[submission.submissionId];
                                const displayState = getLuoguCandidateDisplayState({
                                  submission,
                                  candidateState,
                                  prepared,
                                  prepareError,
                                  writeResult,
                                  prepareStatus,
                                  currentlyPreparingId: currentlyPreparingLuoguId,
                                  currentlyWritingId: currentlyWritingLuoguId,
                                  selectedIds: selectedLuoguSubmissionIds,
                                  skippedIds: skippedLuoguSubmissionIds,
                                });
                                const submitTime = formatLuoguSubmissionTime(submission.submitTime);
                                const canOpenPreview = Boolean(prepared && !prepared.skipped && prepared.markdown.trim());
                                const suggestionTitle = [displayState.detail, displayState.output !== "—" ? displayState.output : ""].filter(Boolean).join(" 路 ");
                                return (
                                  <div
                                    key={submission.submissionId}
                                    className={cn(
                                      "grid min-w-0 grid-cols-[42px_minmax(240px,1fr)_104px_86px_136px_132px] gap-2 border-b border-border/60 px-3 py-1.5 text-sm transition-colors last:border-0 hover:bg-muted/20",
                                      selectedLuoguSubmissionIds.has(submission.submissionId) && "bg-primary/5",
                                      canOpenPreview && "cursor-pointer",
                                    )}
                                    onClick={() => {
                                      if (canOpenPreview) {
                                        setActiveLuoguPreparedPreviewId(submission.submissionId);
                                      }
                                    }}
                                  >
                                    <div className="flex items-start pt-1" onClick={(event) => event.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={selectedLuoguSubmissionIds.has(submission.submissionId)}
                                        disabled={!canSelect || (isPreparingSelectedLuogu || isWritingPreparedLuogu)}
                                        className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label={`选择提交 ${submission.submissionId}`}
                                        onChange={() => toggleLuoguSubmissionSelection(submission)}
                                      />
                                    </div>

                                    <div className="min-w-0 truncate text-xs leading-5 text-muted-foreground" title={`难度：${submission.difficulty || "未获取"}`}>
                                      难度：<span className="text-foreground">{submission.difficulty || "未获取"}</span>
                                    </div>

                                    <div className="min-w-0">
                                      <div className="flex min-w-0 items-baseline gap-2">
                                        <span className="shrink-0 font-mono text-base font-semibold text-foreground">{submission.problemId || "未知题号"}</span>
                                        <span
                                          className="min-w-0 truncate text-base font-medium leading-5 text-foreground"
                                          title={submission.problemTitle || "未读取到标题"}
                                        >
                                          {submission.problemTitle || "未读取到标题"}
                                        </span>
                                        <span className="shrink-0 font-mono text-xs text-muted-foreground opacity-80">{`(#${submission.submissionId})`}</span>
                                      </div>
                                    </div>

                                    <div className="min-w-0">
                                      <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", getLuoguStatusBadgeClass(submission.isAc ? "success" : "warning"))}>
                                        {formatLuoguSubmissionStatus(submission.status)}
                                      </span>
                                    </div>

                                    <div className="min-w-0 truncate text-xs leading-5 text-muted-foreground" title={submitTime.absolute}>
                                      <span className="text-foreground">{submitTime.compact}</span>
                                      {submitTime.relative && <span className="ml-1">路 {submitTime.relative}</span>}
                                    </div>

                                    <div className="min-w-0" title={suggestionTitle}>
                                      <span className={cn("inline-flex max-w-full rounded-full border px-2 py-0.5 text-xs font-medium leading-4", getLuoguStatusBadgeClass(displayState.tone))}>
                                        <span className="truncate">{displayState.label}</span>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </section>
                  </div>
                  ) : (
                    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                      <section className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/15 px-3 py-2">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <div className="shrink-0 text-base font-medium text-foreground">审阅预览</div>
                            <div className="min-w-0 truncate text-sm text-muted-foreground">
                            {luoguPreviewReviewSummaryLabel}
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-3 text-sm"
                            onClick={() => setLuoguImportStep("scan")}
                            disabled={isPreparingSelectedLuogu || isWritingPreparedLuogu}
                          >
                            返回选择
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 px-3 text-sm"
                            onClick={handleWritePreparedLuoguNotes}
                            disabled={
                              writableLuoguPreparedNotes.length === 0 ||
                              isLoadingLuoguConfig ||
                              isScanningLuoguPreview ||
                              isPreparingSelectedLuogu ||
                              isWritingPreparedLuogu ||
                              isSyncingLuogu
                            }
                            title="写入时仅新建文件，不覆盖已有文件"
                          >
                            {isWritingPreparedLuogu ? "写入中..." : `写入选中 ${writableLuoguPreparedNotes.length}`}
                          </Button>
                        </div>
                      </section>

                      {selectedLuoguPreviewSubmissions.length === 0 ? (
                        <section className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                          还没有生成预览。请返回选择提交后点击"生成预览"。
                        </section>
                      ) : (
                        <section className="grid min-h-0 grid-cols-[minmax(260px,300px)_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1 max-lg:grid-rows-[minmax(170px,0.32fr)_minmax(0,1fr)]">
                          <div className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden border-r border-border bg-muted/10 max-lg:border-b max-lg:border-r-0">
                            <div className="grid gap-1 p-2">
                              {selectedLuoguPreviewSubmissions.map((submission) => {
                                const prepared = luoguPreparedNotesById[submission.submissionId];
                                const prepareError = luoguPrepareErrorsById[submission.submissionId];
                                const writeResult = luoguWriteResultsById[submission.submissionId];
                                const statusLabel = getLuoguPreviewStatusLabel({
                                  prepared,
                                  prepareError,
                                  writeResult,
                                  edited: editedLuoguPreparedMarkdownIds.has(submission.submissionId),
                                });
                                const hasPreview = Boolean(prepared && !prepared.skipped && prepared.markdown.trim());
                                const isActive = activeLuoguPreparedPreview?.submissionId === submission.submissionId;
                                const isReviewSelected = reviewSelectedLuoguSubmissionIds.has(submission.submissionId);
                                const canReviewSelect = Boolean(hasPreview && !writeResult);
                                return (
                                  <div
                                    key={submission.submissionId}
                                    className={cn(
                                      "grid w-full min-w-0 grid-cols-[24px_minmax(0,1fr)] items-start gap-2 rounded-sm border px-2.5 py-2 text-left transition-colors",
                                      isActive
                                        ? "border-primary/50 bg-primary/10"
                                        : "border-transparent hover:border-border/70 hover:bg-muted/30",
                                      !hasPreview && "opacity-75",
                                    )}
                                  >
                                    <div className="flex pt-0.5" onClick={(event) => event.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={isReviewSelected}
                                        disabled={!canReviewSelect || isPreparingSelectedLuogu || isWritingPreparedLuogu}
                                        className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label={`选择写入 ${submission.submissionId}`}
                                        onChange={() => toggleLuoguReviewSelection(submission.submissionId)}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      className="min-w-0 text-left disabled:cursor-default"
                                      onClick={() => {
                                        if (hasPreview) setActiveLuoguPreparedPreviewId(submission.submissionId);
                                      }}
                                      disabled={!hasPreview}
                                    >
                                      <div className="min-w-0 text-sm font-medium leading-5 text-foreground line-clamp-2">
                                        <span className="font-mono">{submission.problemId || "未知题号"}</span>
                                        <span> 路 {submission.problemTitle || "未读取到标题"}</span>
                                      </div>
                                      <div className="mt-1 flex min-w-0 items-center gap-2 text-xs">
                                        <span className={cn("shrink-0 rounded-sm border px-1.5 py-0.5", getLuoguPreviewStatusBadgeClass(statusLabel))}>
                                          {statusLabel}
                                        </span>
                                        <span className="min-w-0 truncate font-mono text-muted-foreground">#{submission.submissionId}</span>
                                      </div>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {activeLuoguPreparedPreview ? (
                            <div className="flex min-h-0 min-w-0 flex-col">
                              <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-2">
                                <div className="flex min-w-0 items-center justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="min-w-0 truncate text-base font-medium text-foreground" title={`${activeLuoguPreparedPreview.problemId} 路 ${activeLuoguPreparedPreview.problemTitle} 路 ${activeLuoguPreparedPreview.suggestedRelativePath}`}>
                                      <span className="font-mono">{activeLuoguPreparedPreview.problemId || "未知题号"}</span>
                                      <span> 路 {activeLuoguPreparedPreview.problemTitle || "未读取到标题"}</span>
                                    </div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">难度：{activeLuoguPreparedPreview.difficulty || "未获取"}</div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span className={cn(
                                      "rounded-sm border px-2 py-1 text-xs",
                                      getLuoguPreviewStatusBadgeClass(getLuoguPreviewStatusLabel({
                                        prepared: activeLuoguPreparedPreview,
                                        writeResult: luoguWriteResultsById[activeLuoguPreparedPreview.submissionId],
                                        edited: editedLuoguPreparedMarkdownIds.has(activeLuoguPreparedPreview.submissionId),
                                      })),
                                    )}>
                                      {getLuoguPreviewStatusLabel({
                                        prepared: activeLuoguPreparedPreview,
                                        writeResult: luoguWriteResultsById[activeLuoguPreparedPreview.submissionId],
                                        edited: editedLuoguPreparedMarkdownIds.has(activeLuoguPreparedPreview.submissionId),
                                      })}
                                    </span>
                                    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                      <input
                                        type="checkbox"
                                        checked={reviewSelectedLuoguSubmissionIds.has(activeLuoguPreparedPreview.submissionId)}
                                        disabled={Boolean(luoguWriteResultsById[activeLuoguPreparedPreview.submissionId]) || isPreparingSelectedLuogu || isWritingPreparedLuogu}
                                        className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                                        onChange={() => toggleLuoguReviewSelection(activeLuoguPreparedPreview.submissionId)}
                                      />
                                      <span>选中写入</span>
                                    </label>
                                  </div>
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-1 border-b border-border bg-card px-3 py-1.5">
                                {[
                                  { id: "rendered" as const, label: "预览" },
                                  { id: "markdown" as const, label: "Markdown" },
                                  { id: "source" as const, label: "提交原文" },
                                ].map((tab) => (
                                  <button
                                    key={tab.id}
                                    type="button"
                                    className={
                                      activeLuoguPreviewDetailTab === tab.id
                                        ? "rounded-sm border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground"
                                        : "rounded-sm border border-transparent px-3 py-1 text-xs text-muted-foreground hover:border-border/70 hover:bg-muted/30 hover:text-foreground"
                                    }
                                    onClick={() => setActiveLuoguPreviewDetailTab(tab.id)}
                                  >
                                    {tab.label}
                                  </button>
                                ))}
                              </div>
                              {activeLuoguPreviewDetailTab === "rendered" && (
                                <MarkdownPreview
                                  markdown={activeLuoguPreparedPreview.markdown}
                                  noteRelativePath={activeLuoguPreparedPreview.suggestedRelativePath}
                                  className="min-h-0 flex-1 bg-background/70"
                                />
                              )}
                              {activeLuoguPreviewDetailTab === "markdown" && (
                                <MarkdownEditor
                                  key={activeLuoguPreparedPreview.submissionId}
                                  value={activeLuoguPreparedPreview.markdown}
                                  onChange={handleUpdateActiveLuoguPreparedMarkdown}
                                  hideToolbar
                                  className="min-h-0 flex-1 bg-background/70"
                                />
                              )}
                              {activeLuoguPreviewDetailTab === "source" && (
                                <textarea
                                  readOnly
                                  value={activeLuoguPreparedPreview.sourceCode}
                                  autoComplete="off"
                                  autoCorrect="off"
                                  autoCapitalize="none"
                                  spellCheck={false}
                                  className="min-h-0 w-full flex-1 resize-none border-0 bg-background/70 p-4 font-mono text-xs leading-5 text-foreground outline-none"
                                  placeholder="这条预览没有返回提交原文。"
                                />
                              )}
                            </div>
                          ) : (
                            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                              这次生成没有可预览的 Markdown。左侧会把失败和跳过原因单独列出。
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  )
                )}

                {luoguImportCenterTab === "manual" && (
                  <div className="flex h-full min-h-0 flex-col gap-4 p-5">
                    <section className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border pb-3 text-xs leading-5 text-muted-foreground">
                      <div>
                        <div className="font-medium text-foreground">手动粘贴源码导入</div>
                        <div>填写题号、提交 ID 和源码后生成单篇笔记。</div>
                      </div>
                      <Button onClick={handleImportLuogu} disabled={isImportingLuogu || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isScanningLuoguPreview || isSyncingLuogu}>
                        {isImportingLuogu ? "导入中..." : "手动导入"}
                      </Button>
                    </section>
                    <section className="grid shrink-0 grid-cols-3 gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="luogu-problem-id">题号</Label>
                        <Input
                          id="luogu-problem-id"
                          value={luoguProblemId}
                          placeholder="P1234 或 1234"
                          disabled={isImportingLuogu}
                          onChange={(e) => setLuoguProblemId(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="luogu-submission-id">提交记录 ID</Label>
                        <Input
                          id="luogu-submission-id"
                          value={luoguSubmissionId}
                          placeholder="12345678"
                          disabled={isImportingLuogu}
                          onChange={(e) => setLuoguSubmissionId(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="luogu-problem-title">题目标题</Label>
                        <Input
                          id="luogu-problem-title"
                          value={luoguProblemTitle}
                          placeholder="题目标题"
                          disabled={isImportingLuogu}
                          onChange={(e) => setLuoguProblemTitle(e.target.value)}
                        />
                      </div>
                    </section>
                    <section className="grid min-h-0 flex-1 gap-2">
                      <Label htmlFor="luogu-source-code">提交源码</Label>
                      <textarea
                        id="luogu-source-code"
                        value={luoguSourceCode}
                        disabled={isImportingLuogu}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        className="min-h-0 w-full flex-1 resize-none rounded-md border border-input bg-background/70 px-3 py-3 font-mono text-xs leading-5 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
                        placeholder={`int main() {\n  return 0;\n}\n\n/*\n启示：\n这题的关键观察是 ...\n\n坑点：\n边界需要额外处理 ...\n*/`}
                        onChange={(e) => setLuoguSourceCode(e.target.value)}
                      />
                    </section>
                  </div>
                )}

            </main>
          </div>
          <button
            type="button"
            className="absolute bottom-0 right-0 top-0 z-20 w-2 cursor-ew-resize bg-transparent"
            onPointerDown={(event) => beginLuoguDialogResize("right", event)}
            aria-label="调整洛谷导入中心右边界"
            data-no-window-drag="true"
          />
          <button
            type="button"
            className="absolute bottom-0 left-0 top-0 z-20 w-2 cursor-ew-resize bg-transparent"
            onPointerDown={(event) => beginLuoguDialogResize("left", event)}
            aria-label="调整洛谷导入中心左边界"
            data-no-window-drag="true"
          />
          <button
            type="button"
            className="absolute left-0 right-0 top-0 z-20 h-2 cursor-ns-resize bg-transparent"
            onPointerDown={(event) => beginLuoguDialogResize("top", event)}
            aria-label="调整洛谷导入中心上边界"
            data-no-window-drag="true"
          />
          <button
            type="button"
            className="absolute bottom-0 left-0 right-0 z-20 h-2 cursor-ns-resize bg-transparent"
            onPointerDown={(event) => beginLuoguDialogResize("bottom", event)}
            aria-label="调整洛谷导入中心下边界"
            data-no-window-drag="true"
          />
          <button
            type="button"
            className="absolute left-0 top-0 z-30 h-4 w-4 cursor-nwse-resize bg-transparent"
            onPointerDown={(event) => beginLuoguDialogResize("top-left", event)}
            aria-label="调整洛谷导入中心左上角"
            data-no-window-drag="true"
          />
          <button
            type="button"
            className="absolute right-0 top-0 z-30 h-4 w-4 cursor-nesw-resize bg-transparent"
            onPointerDown={(event) => beginLuoguDialogResize("top-right", event)}
            aria-label="调整洛谷导入中心右上角"
            data-no-window-drag="true"
          />
          <button
            type="button"
            className="absolute bottom-0 left-0 z-30 h-4 w-4 cursor-nesw-resize bg-transparent"
            onPointerDown={(event) => beginLuoguDialogResize("bottom-left", event)}
            aria-label="调整洛谷导入中心左下角"
            data-no-window-drag="true"
          />
          <button
            type="button"
            className="absolute bottom-0 right-0 z-30 h-4 w-4 cursor-nwse-resize bg-transparent"
            onPointerDown={(event) => beginLuoguDialogResize("bottom-right", event)}
            aria-label="调整洛谷导入中心右下角"
            data-no-window-drag="true"
          />
        </section>
      </div>
    )}
    <SettingsCenterHost
      ref={settingsCenterHostRef}
      disabled={tagManagerSession !== null}
      panelRef={settingsCenterPanelRef}
      contentRef={settingsContentRef}
      style={settingsCenterStyle}
      isMaximized={isSettingsCenterMaximized}
      defaultPage={SETTINGS_SECTION_FALLBACK.general}
      sectionFallback={SETTINGS_SECTION_FALLBACK}
      sectionLabels={SETTINGS_SECTION_LABELS}
      visibleSettingsTree={visibleSettingsTree}
      onOpenStateChange={(open) => {
        settingsCenterOpenRef.current = open;
      }}
      onActivePageChange={(page) => {
        settingsCenterActivePageRef.current = page;
      }}
      onSettingsViewChange={(view) => {
        settingsCenterViewRef.current = view;
      }}
      onBeforeOpen={() => {
        cancelPendingSettingsCenterCloseCleanup();
        setSettingsCenterRect((current) => {
          const nextRect = getSafeOpenedSettingsCenterRect(current);
          return areSettingsCenterRectsEqual(current, nextRect) ? current : nextRect;
        });
      }}
      onToggleMaximize={handleToggleSettingsCenterMaximize}
      onCloseRequest={handleSettingsCenterCloseRequest}
      onBeginDrag={beginSettingsCenterDrag}
      onBeginResize={beginSettingsCenterResize}
      promptHeaderContent={(
        <>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <DialogTitle className="text-base">提示词编辑</DialogTitle>
            <span className="font-mono text-xs text-muted-foreground">{selectedPromptFileName || "读取提示词模板中"}</span>
            <span className="text-xs text-muted-foreground">{promptContent.length.toLocaleString()} 字符</span>
          </div>
          <div className="truncate text-xs leading-4 text-muted-foreground">
            {selectedPromptUsage.title} · {promptPolishMessage ?? selectedPromptUsage.scope}
          </div>
        </>
      )}
      promptHeaderActions={
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 pr-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => void handleResetPromptToDefault()}
              disabled={!selectedPromptFileName || isLoadingPrompt || isSavingPrompt || isPolishingPrompt}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              重置为默认模板
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => void handlePolishPrompt()}
              disabled={!selectedPromptFileName || !promptContent.trim() || isLoadingPrompt || isSavingPrompt || isPolishingPrompt}
              title="让 AI 在不改变核心结构的前提下优化当前提示词表达"
            >
              {isPolishingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isPolishingPrompt ? "润色中..." : "AI 润色提示词"}
            </Button>
            <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={() => void handleSavePrompt()} disabled={!selectedPromptFileName || isLoadingPrompt || isSavingPrompt || isPolishingPrompt}>
              <Save className="h-3.5 w-3.5" />
              {isSavingPrompt ? "保存中..." : "保存提示词"}
            </Button>
        </div>
      }
      renderPromptEditor={() => (
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(120px,28vh)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_260px] lg:grid-rows-[minmax(0,1fr)] 2xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="relative min-h-0 min-w-0 overflow-hidden bg-background">
            <div className="h-full min-h-[320px]">
              <PromptCodeEditor
                ref={promptEditorRef}
                value={promptContent}
                fontSize={promptEditorFontSize}
                onChange={setPromptContent}
                onSave={() => void handleSavePrompt()}
                onFontSizeChange={updatePromptEditorFontSize}
                disabled={!selectedPromptFileName || isLoadingPrompt || isSavingPrompt}
                readOnly={isPolishingPrompt}
              />
              {isPolishingPrompt && (
                <div className="absolute inset-0 z-20 grid place-items-center bg-background/72 backdrop-blur-[1px]">
                  <div className="grid justify-items-center gap-3 rounded-sm border border-border/80 bg-background px-5 py-4 text-center shadow-lg">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <div className="grid gap-1">
                      <div className="text-sm font-medium text-foreground">正在润色提示词...</div>
                      <div className="text-xs leading-5 text-muted-foreground">保留变量和结构要求，请稍候</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <aside className="prompt-variable-panel min-h-0 min-w-0 overflow-y-auto overflow-x-hidden border-t border-border/70 bg-muted/10 p-3 lg:border-l lg:border-t-0">
            <div className="mb-2 grid gap-0.5">
              <div className="text-sm font-semibold text-foreground">可用变量</div>
              <div className="text-xs leading-4 text-muted-foreground">编辑器聚焦时点击插入；否则复制变量名。</div>
            </div>
            {selectedPromptUsage.variables.length > 0 ? (
              <div className="grid gap-1.5">
                {selectedPromptUsage.variables.map((variable) => (
                  <button
                    key={variable.name}
                    type="button"
                    className="grid min-w-0 max-w-full gap-1 rounded-[var(--ui-radius-item)] border border-[var(--ui-border-subtle)] bg-background/35 px-2 py-1.5 text-left outline-none transition-[background-color,border-color,box-shadow] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:border-[var(--ui-border-control)] hover:bg-[var(--ui-state-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)]"
                    onMouseDown={() => {
                      promptEditorHadFocusBeforeVariableClickRef.current = promptEditorRef.current?.hasFocus() ?? false;
                    }}
                    onClick={() => void handleCopyPromptVariable(variable.name)}
                  >
                    <span className="min-w-0 whitespace-normal break-words font-mono text-xs font-semibold leading-4 text-foreground [overflow-wrap:anywhere]">{variable.name}</span>
                    <span className="min-w-0 whitespace-normal break-words text-xs leading-4 text-muted-foreground [overflow-wrap:anywhere]">{variable.meaning}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-xs leading-5 text-muted-foreground">暂无可用变量。</div>
            )}
          </aside>
        </div>
      )}
      renderAiConfigManager={() => (
        <AiConfigManager
          mode="page"
          config={aiConfigDraft}
          selectedProvider={selectedAiProvider}
          isLoading={isLoadingAiConfig}
          isSaving={isSavingAiConfig}
          busyProviderId={aiProviderBusyId}
          modelSearchQuery={aiModelSearchQuery}
          manualModelId={aiManualModelId}
          filteredModels={filteredAiProviderModels}
          onSelectProvider={selectAiProviderForEdit}
          onCreateProvider={handleCreateAiProviderDraft}
          onUpdateProvider={patchAiProviderDraft}
          onSetDefaultProvider={handleSetDefaultAiProvider}
          onSetDefaultModel={handleSetDefaultAiModel}
          onDeleteProvider={handleDeleteAiProvider}
          onTestProvider={handleTestAiProvider}
          onSyncProviderModels={handleSyncAiProviderModels}
          onTestCreateProvider={handleTestCreateAiProviderDraft}
          onSyncCreateProviderModels={handleSyncCreateAiProviderModels}
          onModelSearchChange={setAiModelSearchQuery}
          onManualModelIdChange={setAiManualModelId}
          onAddModel={handleAddAiProviderModel}
          onDeleteModel={handleDeleteAiProviderModel}
          onReorderProviders={handleReorderAiProviders}
        />
      )}
      renderLuoguAccountManager={() => (
        <LuoguAccountManager
          mode="dialog"
          uid={luoguConfigUid}
          clientId={luoguConfigClientId}
          lastSubmissionId={luoguConfigLastSubmissionId}
          isLoading={isLoadingLuoguConfig}
          isSaving={isSavingLuoguConfig}
          isTestingConnection={isTestingLuoguConnection}
          isSyncing={isSyncingLuogu}
          syncResult={luoguSyncResult}
          onUidChange={(value) => {
            setLuoguConfigUid(value);
            setLuoguConnectionResult(null);
            setLuoguConnectionError(null);
          }}
          onClientIdChange={(value) => {
            setLuoguConfigClientId(value);
            setLuoguConnectionResult(null);
            setLuoguConnectionError(null);
          }}
          onLastSubmissionIdChange={setLuoguConfigLastSubmissionId}
          onClose={closeLuoguSettings}
          onTestConnection={() => void handleTestLuoguConnection()}
          onSave={() => void handleSaveLuoguConfig()}
        />
      )}
      renderActivePage={(activePageKey, activeTarget) => (
        <>
                  <ActiveSettingsPageEffects activePageKey={activePageKey} activeTarget={activeTarget} />
                  {shouldRenderSettingsPageForTarget("general-basics", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="general-basics">
                      <GeneralSettingsPage />
                    </SettingsSectionAnchor>
                  )}

                  {shouldRenderSettingsPageForTarget("appearance-theme", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="appearance-theme">
                      <AppearanceSettingsPage
                        appTheme={appTheme}
                        resolvedTheme={resolvedTheme}
                        themeState={settingsThemeState}
                        uiFontSize={settingsFontSize}
                        uiFontSizeMin={SETTINGS_FONT_SIZE_MIN}
                        uiFontSizeMax={SETTINGS_FONT_SIZE_MAX}
                        codeFontSize={editorFontSize}
                        codeFontSizeMin={FONT_SIZE_MIN}
                        codeFontSizeMax={FONT_SIZE_MAX}
                        pointerCursor={pointerCursor}
                        reducedMotion={reducedMotion}
                        diffMarkerMode={diffMarkerMode}
                        onThemeChange={updateAppTheme}
                        onThemeStateChange={applySettingsThemeState}
                        onUiFontSizeChange={updateSettingsFontSize}
                        onCodeFontSizeChange={updateCodeFontSize}
                        onPointerCursorChange={setPointerCursor}
                        onReducedMotionChange={setReducedMotion}
                        onDiffMarkerModeChange={setDiffMarkerMode}
                      />
                    </SettingsSectionAnchor>
                  )}

                  {shouldRenderSettingsGroupForTarget("ai", activePageKey, activeTarget) && (
                    <SettingsV2PageLayout title="AI">
                  {shouldRenderSettingsPageForTarget("ai-api", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="ai-api">
                        <SettingsV2Section title="模型与 API">
                          <SettingsV2Card>
                            <SettingsV2Row title="当前供应商" description="当前 NoteX 使用的供应商与可用模型。">
                              <SettingsV2ReadonlyPill>
                                {isLoadingAiConfig
                                  ? "读取中"
                                  : selectedAiProvider
                                    ? `${selectedAiProvider.name || selectedAiProvider.id} · ${selectedAiProvider.models.length} 个模型`
                                    : "未配置"}
                              </SettingsV2ReadonlyPill>
                            </SettingsV2Row>
                            <SettingsV2Row title="供应商" description="已配置的供应商数量。">
                              <SettingsV2ReadonlyPill>
                                {isLoadingAiConfig ? "读取中" : `${aiConfigDraft?.providers.length ?? 0} 个供应商`}
                              </SettingsV2ReadonlyPill>
                            </SettingsV2Row>
                            <SettingsV2Row title={aiConfigDraft?.providers.length ? "供应商管理" : "新建供应商"} description="管理供应商、模型和 API Key。">
                              <Button type="button" variant="secondary" size="compact" onClick={() => settingsCenterHostRef.current?.openAiConfigManager()}>
                                {aiConfigDraft?.providers.length ? "打开管理中心" : "新建供应商"}
                              </Button>
                            </SettingsV2Row>
                          </SettingsV2Card>
                        </SettingsV2Section>
                    </SettingsSectionAnchor>
                  )}

                  {shouldRenderSettingsPageForTarget("ai-local-notes", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="ai-local-notes">
                        <SettingsV2Section title="索引">
                          <SettingsV2Card>
                            <SettingsV2Row title="状态" description="本地笔记索引当前是否可用。">
                              <span className={cn(
                                "settings-v2-status-badge",
                                getLocalIndexStatusBadgeClassName(localIndexStatusBadgeTone),
                              )}>
                                {getLocalIndexStatusLabel(localIndexStatus, isRebuildingLocalIndex)}
                              </span>
                            </SettingsV2Row>
                            <SettingsV2Row title="笔记数量" description="已纳入索引的 Markdown 笔记数量。">
                              <SettingsV2ReadonlyPill>{localIndexStatus ? localIndexStatus.noteCount.toLocaleString() : "未获取"}</SettingsV2ReadonlyPill>
                            </SettingsV2Row>
                            <SettingsV2Row title="片段数量" description="可供检索的文本片段数量。">
                              <SettingsV2ReadonlyPill>{localIndexStatus ? localIndexStatus.chunkCount.toLocaleString() : "未获取"}</SettingsV2ReadonlyPill>
                            </SettingsV2Row>
                            <SettingsV2Row title="上次更新" description="索引最近一次刷新时间。">
                              <SettingsV2ReadonlyPill>{getLocalIndexUpdatedLabel(localIndexStatus)}</SettingsV2ReadonlyPill>
                            </SettingsV2Row>
                          </SettingsV2Card>
                        </SettingsV2Section>

                        <SettingsV2Section title="高级信息">
                          <SettingsV2Card>
                            <SettingsV2Row title="索引版本">
                              <SettingsV2ReadonlyPill>{localIndexStatus ? `${localIndexStatus.version ?? "尚未建立"} / 当前 ${localIndexStatus.currentVersion ?? 3}` : "未获取"}</SettingsV2ReadonlyPill>
                            </SettingsV2Row>
                            {localIndexStatus && (
                              <>
                                <SettingsV2Row title="存储位置">
                                  <SettingsV2ReadonlyPill title={localIndexStatus.pathLabel}>{localIndexStatus.pathLabel}</SettingsV2ReadonlyPill>
                                </SettingsV2Row>
                                <SettingsV2Row title="索引大小">
                                  <SettingsV2ReadonlyPill>{formatLocalIndexSize(localIndexStatus.approxSizeBytes)}</SettingsV2ReadonlyPill>
                                </SettingsV2Row>
                                <SettingsV2Row title="权限">
                                  <SettingsV2ReadonlyPill>{getLocalIndexAccessLabel(localIndexStatus)}</SettingsV2ReadonlyPill>
                                </SettingsV2Row>
                              </>
                            )}
                            {localIndexDisplayMessage && (
                              <SettingsV2Row title="消息">
                                <span className="settings-v2-readonly-value">{localIndexDisplayMessage}</span>
                              </SettingsV2Row>
                            )}
                          </SettingsV2Card>
                        </SettingsV2Section>

                        <SettingsV2Section title="维护">
                          <SettingsV2Card>
                            <SettingsV2Row title="刷新状态" description="重新读取当前本地索引状态。">
                              <Button type="button" variant="secondary" size="compact" onClick={() => void refreshLocalIndexStatus()} disabled={localIndexActionDisabled}>
                                {isLoadingLocalIndexStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                刷新状态
                              </Button>
                            </SettingsV2Row>
                            <SettingsV2Row title="重建本地笔记索引" description="当搜索不准确或索引版本更新时重建。不会修改笔记正文。">
                              <Button type="button" variant="secondary" size="compact" onClick={() => void handleRebuildLocalIndex()} disabled={localIndexActionDisabled}>
                                {isRebuildingLocalIndex ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                {localIndexRebuildButtonLabel}
                              </Button>
                            </SettingsV2Row>
                          </SettingsV2Card>
                        </SettingsV2Section>
                    </SettingsSectionAnchor>
                  )}

                  {shouldRenderSettingsPageForTarget("ai-web-search", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="ai-web-search">
                    <section className={settingsPageSectionClass}>
                      <div className="settings-v2-legacy-section-header">
                        <div className="settings-v2-legacy-section-title">联网搜索</div>
                        <div className="settings-v2-legacy-section-description">配置 NoteX 的搜索服务、网页读取授权和缓存。</div>
                      </div>
                      <SettingRow title="启用联网搜索" description="关闭后 NoteX 不会主动发起公开网页检索。">
                        <Switch
                          checked={webSearchDraft.enabled}
                          onCheckedChange={(enabled) => updateWebSearchDraft({ enabled })}
                          aria-label="启用联网搜索"
                          disabled={isSavingAiConfig || isLoadingAiConfig}
                        />
                      </SettingRow>
                      <SettingRow title="搜索服务" description="Bing 使用公开搜索；Bocha / Brave 需要填写对应 API Key。" layout="stacked">
                        <SettingsInlineSelect
                          id="web-search-provider"
                          value={webSearchDraft.provider}
                          options={[
                            { value: "bing", label: "Bing 公开搜索" },
                            { value: "bocha", label: "Bocha" },
                            { value: "brave", label: "Brave Search" },
                          ]}
                          onChange={(provider) => updateWebSearchDraft({ provider: provider as WebSearchConfig["provider"] })}
                          disabled={isSavingAiConfig || isLoadingAiConfig}
                          ariaLabel="搜索服务"
                          expandedRuleId={expandedWebSearchSelectId}
                          onExpandedRuleChange={setExpandedWebSearchSelectId}
                          themed
                        />
                      </SettingRow>
                      <SettingRow title="Bocha 配置" description="仅在选择 Bocha 时使用。" layout="stacked">
                        <div className="grid max-w-2xl gap-3">
                          <label className="grid gap-1.5 text-xs font-medium text-foreground">
                            API Key
                            <Input
                              value={webSearchDraft.bochaApiKey}
                              type="password"
                              placeholder="Bocha API Key"
                              onChange={(event) => updateWebSearchDraft({ bochaApiKey: event.target.value })}
                              disabled={isSavingAiConfig || isLoadingAiConfig}
                            />
                          </label>
                          <label className="grid gap-1.5 text-xs font-medium text-foreground">
                            Endpoint
                            <Input
                              value={webSearchDraft.bochaEndpoint}
                              placeholder={DEFAULT_WEB_SEARCH_CONFIG.bochaEndpoint}
                              onChange={(event) => updateWebSearchDraft({ bochaEndpoint: event.target.value })}
                              disabled={isSavingAiConfig || isLoadingAiConfig}
                            />
                          </label>
                        </div>
                      </SettingRow>
                      <SettingRow title="Brave 配置" description="仅在选择 Brave Search 时使用。" layout="stacked">
                        <label className="grid max-w-2xl gap-1.5 text-xs font-medium text-foreground">
                          Brave Search API Key
                          <Input
                            value={webSearchDraft.braveApiKey}
                            type="password"
                            placeholder="Brave Search API Key"
                            onChange={(event) => updateWebSearchDraft({ braveApiKey: event.target.value })}
                            disabled={isSavingAiConfig || isLoadingAiConfig}
                          />
                        </label>
                      </SettingRow>
                      <SettingRow title="公开网页授权" description="开启后才允许 NoteX 为回答读取公开 http/https 网页摘录。">
                        <Switch
                          checked={webSearchDraft.publicSearchConsent}
                          onCheckedChange={(publicSearchConsent) => updateWebSearchDraft({ publicSearchConsent })}
                          aria-label="允许公开网页检索"
                          disabled={isSavingAiConfig || isLoadingAiConfig}
                        />
                      </SettingRow>
                      <SettingRow title="测试与缓存" description="测试当前搜索服务，或删除已保存的搜索结果和网页摘要缓存。">
                        <div className="grid gap-2">
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => void handleTestWebSearchConnection()} disabled={isTestingWebSearchConnection || isSavingAiConfig || isLoadingAiConfig}>
                              {isTestingWebSearchConnection ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                              {isTestingWebSearchConnection ? "测试中..." : "测试连接"}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void handleClearWebCache()} disabled={isClearingWebCache}>
                              {isClearingWebCache ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                              {isClearingWebCache ? "清理中..." : "清理搜索缓存"}
                            </Button>
                          </div>
                          {(webSearchConnectionMessage || webCacheMessage) && (
                            <div className="text-xs leading-5 text-muted-foreground">
                              {webSearchConnectionMessage ?? webCacheMessage}
                            </div>
                          )}
                        </div>
                      </SettingRow>
                    </section>
                    </SettingsSectionAnchor>
                  )}

                  {shouldRenderSettingsPageForTarget("ai-prompts", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="ai-prompts">
                    <section className={settingsPageSectionClass}>
                      <div className="settings-v2-legacy-section-header">
                        <div className="settings-v2-legacy-section-title">提示词模板</div>
                        <div className="settings-v2-legacy-section-description">管理本地 AI 提示词模板。打开编辑器后可保存、润色并查看变量说明。</div>
                      </div>
                      <div className="grid gap-4 border-b border-border/60 py-4">
                        <div className="grid gap-1">
                          <h3 className="text-sm font-medium text-foreground">NoteX 回答风格</h3>
                          <p className="text-xs leading-5 text-muted-foreground">
                            只影响会话中的回答风格，不影响润色、总结、生成笔记等文件编辑类任务。
                          </p>
                        </div>
                        <div className="grid w-full gap-2">
                          <textarea
                            value={chatResponseStyleDraft}
                            placeholder="例如：回答尽量自然一点，少用列表；解释算法时更注重直觉；不需要太官方的语气。"
                            onChange={(event) => handleChatResponseStyleChange(event.target.value)}
                            disabled={isLoadingAiConfig || !aiConfigDraft}
                            className="min-h-32 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </div>
                      </div>
                      <div className="grid min-w-0 gap-3 border-b border-border/60 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <h3 className="text-sm font-medium text-foreground">模板列表</h3>
                            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">编辑 NoteX 和笔记整理使用的默认提示词。</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 px-2.5 text-xs"
                            onClick={() => void loadPromptTemplates()}
                            disabled={isLoadingPrompt || isSavingPrompt || isPolishingPrompt}
                          >
                            {isLoadingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            {isLoadingPrompt ? "读取中..." : "刷新模板"}
                          </Button>
                        </div>
                        {promptTemplateRows.length > 0 ? (
                          <div className="w-full border-y border-border/50">
                            {promptTemplateRows.map((prompt) => (
                              <button
                                key={prompt.fileName}
                                type="button"
                                className="group flex w-full min-w-0 cursor-pointer items-start justify-between gap-6 border-b border-[var(--ui-border-subtle)] px-0 py-4 text-left outline-none transition-[background-color,box-shadow,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] last:border-b-0 hover:bg-[var(--ui-state-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:cursor-not-allowed disabled:opacity-[var(--ui-disabled-opacity)]"
                                onClick={() => handleEditPrompt(prompt.fileName)}
                                disabled={isLoadingPrompt || isSavingPrompt || isPolishingPrompt}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <h4 className="min-w-0 truncate text-sm font-medium text-foreground">{prompt.usage.title}</h4>
                                    <code className="max-w-full shrink-0 truncate font-mono text-xs text-muted-foreground">{prompt.fileName}</code>
                                  </div>
                                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{prompt.usage.purpose}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="w-full border-y border-border/50 px-0 py-4 text-sm leading-6 text-muted-foreground">
                            {isLoadingPrompt ? "正在读取提示词模板..." : "尚未加载到提示词模板。点击刷新模板重试。"}
                          </div>
                        )}
                      </div>
                    </section>
                    </SettingsSectionAnchor>
                  )}
                    </SettingsV2PageLayout>
                  )}

                  {shouldRenderSettingsGroupForTarget("luogu", activePageKey, activeTarget) && (
                    <SettingsV2PageLayout title="洛谷">
                  {shouldRenderSettingsPageForTarget("luogu-account", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="luogu-account">
                    <LuoguAccountSettingsPage
                      className={settingsPageSectionClass}
                      embedded
                      configured={luoguConfigured}
                      statusLabel={luoguStatusLabel}
                      statusDescription={luoguSettingsStatusDescription}
                      uid={luoguConfigUid}
                      lastSubmissionId={luoguConfigLastSubmissionId}
                      aiConfigured={luoguConfigAiConfigured}
                      isLoadingConfig={isLoadingLuoguConfig}
                      isSavingConfig={isSavingLuoguConfig}
                      isTestingConnection={isTestingLuoguConnection}
                      onOpenSettings={() => void openLuoguAccountManager()}
                    />
                    </SettingsSectionAnchor>
                  )}

                  {shouldRenderSettingsPageForTarget("luogu-rules", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="luogu-rules">
                    <LuoguRulesSettingsPage
                      className={settingsPageSectionClass}
                      embedded
                      rows={luoguRuleSettingRows}
                      expandedRuleId={expandedLuoguRuleId}
                      onExpandedRuleChange={setExpandedLuoguRuleId}
                      disabled={isLuoguRuleControlDisabled}
                      showCustomSaveDirectory={luoguImportRules.defaultSaveLocation === "custom"}
                      customSaveDirectory={luoguImportRules.customSaveDirectory}
                      onCustomSaveDirectoryChange={(value) => updateLuoguImportRules({ customSaveDirectory: value })}
                    />
                    </SettingsSectionAnchor>
                  )}

                  {shouldRenderSettingsPageForTarget("luogu-import-center", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="luogu-import-center">
                    <LuoguImportCenterSettingsPage
                      className={settingsPageSectionClass}
                      embedded
                      accountLabel={luoguImportCenterAccountLabel}
                      aiLabel={luoguImportCenterAiLabel}
                      rangeLabel={luoguImportCenterRangeLabel}
                      disabled={isLoadingLuoguConfig || isScanningLuoguPreview || isPreparingSelectedLuogu || isWritingPreparedLuogu}
                      onOpenImportCenter={() => void openLuoguDialog({ returnTarget: { type: "page", page: "luogu-import-center" } })}
                    />
                    </SettingsSectionAnchor>
                  )}
                    </SettingsV2PageLayout>
                  )}

                  {shouldRenderSettingsGroupForTarget("blog", activePageKey, activeTarget) && (
                    <SettingsV2PageLayout title="博客">
                  {(shouldRenderSettingsPageForTarget("blog-info", activePageKey, activeTarget) || shouldRenderSettingsPageForTarget("blog-preview", activePageKey, activeTarget)) && (
                    <BlogPreviewSettingsPage
                      className={settingsPageSectionClass}
                      embedded
                      blogTitle={blogInfoDraft.title}
                      blogSubtitle={blogInfoDraft.subtitle}
                      blogConfigError={blogConfigError}
                      isLoadingBlogConfig={isLoadingBlogConfig}
                      isSavingBlogConfig={isSavingBlogConfig}
                      onBlogTitleChange={(value) => setBlogInfoDraft((current) => ({ ...current, title: value }))}
                      onBlogSubtitleChange={(value) => setBlogInfoDraft((current) => ({ ...current, subtitle: value }))}
                      onSaveBlogInfo={() => void handleSaveBlogInfo()}
                      isRestartingBlog={isRestartingBlog}
                      onOpenBlog={handleOpenBlog}
                      onRestartBlog={handleRestartBlog}
                    />
                  )}

                  {shouldRenderSettingsPageForTarget("blog-tag-taxonomy", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="blog-tag-taxonomy">
                    <BlogTaxonomySettingsPage
                      className={settingsPageSectionClass}
                      embedded
                      isLoadingTagTaxonomyConfig={isLoadingTagTaxonomyConfig}
                      tagTaxonomyConfigError={tagTaxonomyConfigError}
                      tagTaxonomyStats={tagTaxonomyStats}
                      tagTaxonomyStatItems={tagTaxonomyStatItems}
                      tagTaxonomyImportFileInputRef={tagTaxonomyImportFileInputRef}
                      tagTaxonomyImportMessage={tagTaxonomyImportMessage}
                      tagTaxonomyImportJsonInput={tagTaxonomyImportJsonInput}
                      tagTaxonomyImportPreview={tagTaxonomyImportPreview}
                      tagTaxonomyImportError={tagTaxonomyImportError}
                      isSavingTagTaxonomyConfig={isSavingTagTaxonomyConfig}
                      tagTaxonomyUserEntries={tagTaxonomyUserEntries}
                      displayedTagTaxonomyUserEntries={displayedTagTaxonomyUserEntries}
                      isTagTaxonomyEntryListExpanded={isTagTaxonomyEntryListExpanded}
                      tagTaxonomyEntryPathInput={tagTaxonomyEntryPathInput}
                      tagTaxonomyEntryAliasesInput={tagTaxonomyEntryAliasesInput}
                      tagTaxonomyEntryListQuery={tagTaxonomyEntryListQuery}
                      tagTaxonomyUserAliases={tagTaxonomyUserAliases}
                      displayedTagTaxonomyUserAliases={displayedTagTaxonomyUserAliases}
                      isTagTaxonomyAliasListExpanded={isTagTaxonomyAliasListExpanded}
                      tagTaxonomyAliasNameInput={tagTaxonomyAliasNameInput}
                      tagTaxonomyAliasTargetInput={tagTaxonomyAliasTargetInput}
                      tagTaxonomyAliasListQuery={tagTaxonomyAliasListQuery}
                      tagTaxonomySaveError={tagTaxonomySaveError}
                      isScanningTagNormalization={isScanningTagNormalization}
                      tagNormalizationScanError={tagNormalizationScanError}
                      tagNormalizationApplyResult={tagNormalizationApplyResult}
                      tagNormalizationScanResults={tagNormalizationScanResults}
                      tagNormalizationScanIssueCount={tagNormalizationScanIssueCount}
                      tagNormalizationScanStats={tagNormalizationScanStats}
                      isApplyingTagNormalizationScan={isApplyingTagNormalizationScan}
                      selectedTagNormalizationScanStats={selectedTagNormalizationScanStats}
                      selectedTagNormalizationScanPaths={selectedTagNormalizationScanPaths}
                      loadTagTaxonomyConfig={loadTagTaxonomyConfig}
                      handleExportTagTaxonomyConfig={handleExportTagTaxonomyConfig}
                      handleSelectTagTaxonomyImportFile={handleSelectTagTaxonomyImportFile}
                      handleTagTaxonomyImportInputChange={handleTagTaxonomyImportInputChange}
                      previewTagTaxonomyImport={previewTagTaxonomyImport}
                      handleConfirmTagTaxonomyImport={handleConfirmTagTaxonomyImport}
                      openTagManagerWorkspace={openTagManagerWorkspace}
                      setIsTagTaxonomyEntryListExpanded={setIsTagTaxonomyEntryListExpanded}
                      setTagTaxonomyEntryPathInput={setTagTaxonomyEntryPathInput}
                      setTagTaxonomyEntryAliasesInput={setTagTaxonomyEntryAliasesInput}
                      handleAddTagTaxonomyEntry={handleAddTagTaxonomyEntry}
                      setTagTaxonomyEntryListQuery={setTagTaxonomyEntryListQuery}
                      handleDeleteTagTaxonomyEntry={handleDeleteTagTaxonomyEntry}
                      setIsTagTaxonomyAliasListExpanded={setIsTagTaxonomyAliasListExpanded}
                      setTagTaxonomyAliasNameInput={setTagTaxonomyAliasNameInput}
                      setTagTaxonomyAliasTargetInput={setTagTaxonomyAliasTargetInput}
                      handleAddTagTaxonomyAlias={handleAddTagTaxonomyAlias}
                      setTagTaxonomyAliasListQuery={setTagTaxonomyAliasListQuery}
                      handleDeleteTagTaxonomyAlias={handleDeleteTagTaxonomyAlias}
                      handleScanLegacyTags={handleScanLegacyTags}
                      selectAllTagNormalizationScanResults={selectAllTagNormalizationScanResults}
                      clearTagNormalizationScanSelection={clearTagNormalizationScanSelection}
                      applySelectedTagNormalizationScanResults={applySelectedTagNormalizationScanResults}
                      toggleTagNormalizationScanSelection={toggleTagNormalizationScanSelection}
                      formatTagNormalizationReason={formatTagNormalizationReason}
                    />
                    </SettingsSectionAnchor>
                  )}

                  {shouldRenderSettingsPageForTarget("blog-tag-manager", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="blog-tag-manager">
                    <BlogTagManagerSettingsPage
                      className={settingsPageSectionClass}
                      embedded
                      availableCandidateCount={tagManagerAvailableCandidateCount}
                      entriesCount={tagTaxonomyStats.entriesCount}
                      aliasesCount={tagTaxonomyStats.aliasesCount}
                      hiddenIdsCount={tagTaxonomyStats.hiddenIdsCount}
                      onOpenTagManager={() => openTagManagerWorkspace()}
                    />
                    </SettingsSectionAnchor>
                  )}
                    </SettingsV2PageLayout>
                  )}

                  {shouldRenderSettingsPageForTarget("data-storage", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="data-storage">
                    <DataStorageSettingsPage
                      className={settingsPageSectionClass}
                      isClearingWebCache={isClearingWebCache}
                      onOpenNotesFolder={handleOpenNotesFolder}
                      onClearWebCache={() => void handleClearWebCache()}
                    />
                    </SettingsSectionAnchor>
                  )}

                  {shouldRenderSettingsPageForTarget("keyboard-shortcuts", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="keyboard-shortcuts">
                      <KeyboardSettingsPage />
                    </SettingsSectionAnchor>
                  )}

                  {shouldRenderSettingsGroupForTarget("advanced", activePageKey, activeTarget) && (
                    <SettingsV2PageLayout title="高级 / 开发者">
                  {shouldRenderSettingsPageForTarget("advanced-developer", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="advanced-developer">
                      <AdvancedSettingsPage
                        embedded
                        developerModeEnabled={developerModeEnabled}
                        onToggleDeveloperMode={() => setDeveloperModeEnabled((enabled) => !enabled)}
                        onOpenSearchDiagnostics={() => settingsCenterHostRef.current?.openPage("diagnostics-search")}
                      />
                    </SettingsSectionAnchor>
                  )}
                  {shouldRenderSettingsPageForTarget("diagnostics-search", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="diagnostics-search">
                    <section className={settingsPageSectionClass}>
                      <SearchDiagnosticsPanel aiConfigDraft={aiConfigDraft} />
                    </section>
                    </SettingsSectionAnchor>
                  )}
                    </SettingsV2PageLayout>
                  )}

                  {shouldRenderSettingsPageForTarget("about-version", activePageKey, activeTarget) && (
                    <SettingsSectionAnchor id="about-version">
                      <AboutSettingsPage capabilities={MARKDOWN_CAPABILITIES} />
                    </SettingsSectionAnchor>
                  )}

        </>
      )}
    />
    {tagManagerSession && (
      <TagManagerWorkspace
        initialConfig={tagManagerSession.initialConfig}
        initialFilterMode={tagManagerSession.initialFilterMode}
        builtinCollections={COMMON_COLLECTIONS}
        noteCollections={collectionCandidatesFromNotes}
        developerModeEnabled={developerModeEnabled}
        onRequestClose={requestCloseTagManager}
      />
    )}
    <div className="app-shell flex h-screen max-h-screen flex-col overflow-hidden bg-background text-foreground" style={appearanceStyle}>
      {/* Header */}
      <header data-app-context-menu="titlebar" className="app-top-toolbar flex min-h-8 shrink-0 select-none items-center gap-2.5 border-b border-border bg-background px-2.5 py-0.5">
        <div className="flex min-w-0 items-center gap-2.5" data-tauri-drag-region>
          <div className="flex h-8 min-w-0 items-center">
            <span className="app-brand-mark grid h-8 w-8 shrink-0 place-items-center">
              <img
                src={APP_ICON_URL}
                alt=""
                className="h-5 w-5 object-contain"
                draggable={false}
                aria-hidden="true"
              />
            </span>
          </div>
        </div>
        <div className="min-w-4 flex-1 self-stretch" data-tauri-drag-region />
        <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          <div className="flex items-center" aria-label="Window controls">
            <ToolbarButton
              type="button"
              size="compact"
              className="h-6 w-8"
              onClick={() => void handleMinimizeWindow()}
              title="Minimize"
              aria-label="Minimize window"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              type="button"
              size="compact"
              className="h-6 w-8"
              onClick={() => void handleToggleMaximizeWindow()}
              title="Maximize / Restore"
              aria-label="Maximize or restore window"
            >
              <Square className="h-3 w-3" aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              type="button"
              size="compact"
              className="h-6 w-8 hover:bg-red-500/85 hover:text-white focus-visible:ring-red-400/70"
              onClick={() => void handleCloseWindow()}
              title="Close"
              aria-label="Close window"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </ToolbarButton>
          </div>
        </div>
      </header>
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div id="settings-center-content-root" className="pointer-events-none absolute inset-0 z-[60]" />
        <nav
          className="app-activity-bar flex w-13 shrink-0 flex-col items-center justify-between border-r border-border/80 bg-muted/10 py-2.5"
          aria-label="主活动栏"
        >
          <div className="flex flex-col items-center gap-1.5">
            <ToolbarButton
              type="button"
              className={activityButtonClass("notes")}
              onClick={handleActivityNotes}
              title={isNotesSidebarOpen ? "收起笔记侧栏" : "展开笔记侧栏"}
              aria-label={isNotesSidebarOpen ? "收起笔记侧栏" : "展开笔记侧栏"}
              selected={activeActivityItem === "notes"}
            >
              <FileText size={24} strokeWidth={2.18} />
            </ToolbarButton>
            <ToolbarButton
              type="button"
              className={activityButtonClass("search")}
              onClick={handleActivitySearch}
              title="搜索笔记"
              aria-label="搜索笔记"
              selected={activeActivityItem === "search"}
            >
              <Search size={24} strokeWidth={2.18} />
            </ToolbarButton>
            <ToolbarButton
              type="button"
              className={activityButtonClass("luogu")}
              onClick={handleActivityLuogu}
              title="洛谷导入中心"
              aria-label="洛谷导入中心"
              selected={activeActivityItem === "luogu"}
              disabled={isLoadingLuoguConfig || isTestingLuoguConnection || isScanningLuoguPreview || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isSyncingLuogu}
            >
              <RefreshCw size={24} strokeWidth={2.18} />
            </ToolbarButton>
            <ToolbarButton
              type="button"
              className={activityButtonClass("ai")}
              onClick={handleActivityAi}
              title={isAiSidebarOpen ? "关闭 AI 助手" : "打开 AI 助手"}
              aria-label={isAiSidebarOpen ? "关闭 AI 助手" : "打开 AI 助手"}
              selected={isAiActivityActive}
            >
              <Bot size={24} strokeWidth={2.18} />
            </ToolbarButton>
            <ToolbarButton
              type="button"
              className={activityButtonClass("blog")}
              onClick={handleActivityBlog}
              title="打开博客"
              aria-label="打开博客"
              selected={activeActivityItem === "blog"}
            >
              <ExternalLink size={24} strokeWidth={2.18} />
            </ToolbarButton>
          </div>
          <ToolbarButton
            type="button"
            className={activityButtonClass("settings")}
            onClick={openSettingsCenter}
            title="设置中心"
            aria-label="设置中心"
            selected={activeActivityItem === "settings"}
          >
            <Settings size={24} strokeWidth={2.18} />
          </ToolbarButton>
        </nav>

        {isNotesSidebarOpen && (
          <>
            <aside
              className="app-notes-sidebar flex shrink-0 flex-col overflow-hidden bg-background/70"
              style={leftSidebarStyle}
            >
              <div className="app-notes-sidebar-header group flex h-8 shrink-0 items-center justify-between border-b border-border/70 px-1">
                <button
                  type="button"
                  className={cn(
                    "app-file-row app-file-root-row flex min-w-0 flex-1 items-center border border-transparent pr-1 text-left transition-colors duration-100",
                    activeTreeDirectoryPath === "" || activeTreeFilePath ? "text-accent-foreground" : "text-foreground/92",
                  )}
                  style={{ paddingLeft: "1px" }}
                  data-active={activeTreeDirectoryPath === "" ? "true" : "false"}
                  data-app-context-menu="file-tree-folder"
                  data-app-context-path=""
                  onClick={handleSelectTreeRoot}
                  aria-expanded={!isTreeRootCollapsed}
                  title="notes"
                >
                  <ChevronRight
                    className={cn("mr-0.5 shrink-0 transition-transform", !isTreeRootCollapsed && "rotate-90")}
                    size={14}
                    strokeWidth={2.15}
                  />
                  <FolderOpen className="mr-1 shrink-0 text-muted-foreground/95" size={16} strokeWidth={2} />
                  <span className="min-w-0 truncate text-[14.5px] font-semibold leading-[27px]">notes</span>
                </button>
                <div className="app-notes-sidebar-actions flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="app-notes-sidebar-action h-6 w-6"
                    onClick={requestInlineCreateFile}
                    title="新建笔记"
                    aria-label="新建笔记"
                  >
                    <FilePlus size={15} strokeWidth={1.85} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="app-notes-sidebar-action h-6 w-6"
                    onClick={requestInlineCreateFolder}
                    title="新建文件夹"
                    aria-label="新建文件夹"
                  >
                    <FolderPlus size={15} strokeWidth={1.85} />
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <FileTree
                  files={displayFiles}
                  activeFilePath={activeTreeFilePath}
                  activeDirectoryPath={activeTreeDirectoryPath}
                  rootCollapsed={isTreeRootCollapsed}
                  createFileRequest={createFileRequest}
                  createFolderRequest={createFolderRequest}
                  onSelectFile={handleSelectFile}
                  onSelectDirectory={handleSelectTreeDirectory}
                  onClearSelection={handleClearTreeSelection}
                  onCreateFile={handleCreateFileAt}
                  onCreateFolder={handleCreateFolderAt}
                  onDeleteItem={handleDelete}
                  onRenameItem={openRenameDialog}
                />
              </div>
            </aside>

            <button
              type="button"
              className={cn(
                "app-column-resizer app-column-resizer-left",
                activeResizeHandle === "left-sidebar" && "app-column-resizer-active",
              )}
              onPointerDown={(event) => beginColumnResize("left-sidebar", event)}
              onDoubleClick={() => resetColumnSize("left-sidebar")}
              aria-label="调整笔记侧栏宽度"
              title="拖拽调整笔记侧栏宽度，双击重置"
            />
          </>
        )}

        <div className="relative flex min-w-0 flex-1 overflow-hidden">
        <section className="app-editor-workspace flex min-w-0 flex-1 flex-col overflow-hidden">
          <OpenTabsBar
            tabs={workspaceTabs}
            activeTabId={activeWorkspaceTabId ?? currentFilePath}
            onSelect={handleSelectOpenTab}
            onClose={handleCloseOpenTab}
          />
          {activeReviewTab ? (
            <PolishReviewPane
              reviewTab={activeReviewTab}
              currentFilePath={currentFilePath}
              currentMarkdown={markdown}
              onApply={() => void applyPolishReview(activeReviewTab)}
              onIgnore={() => ignorePolishReview(activeReviewTab)}
              onBackToFile={() => {
                if (activeReviewTab.preview.notePath) {
                  handleSelectFile(activeReviewTab.preview.notePath);
                }
              }}
              onClose={() => handleCloseOpenTab({
                kind: "review",
                id: activeReviewTab.id,
                sourcePath: activeReviewTab.preview.notePath,
                title: getReviewTitle(activeReviewTab.preview),
                displayName: getReviewTitle(activeReviewTab.preview),
                status: activeReviewTab.preview.applied ? "applied" : activeReviewTab.preview.ignored ? "cancelled" : "pending",
              })}
            />
          ) : !hasActiveEditorDocument ? (
            <div
              data-app-context-menu="empty-editor"
              className="app-empty-editor flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background px-6 py-8 text-muted-foreground"
            >
              <div className="grid w-full max-w-[360px] justify-items-center gap-6">
                <img
                  src={APP_EMPTY_STATE_ICON_URL}
                  alt=""
                  aria-hidden="true"
                  className="h-44 w-44 select-none object-contain opacity-[0.085] dark:opacity-[0.075]"
                  draggable={false}
                />
                <div className="grid w-full gap-2 text-[13px]">
                  <button
                    type="button"
                    className="group grid h-7 cursor-pointer grid-cols-[1fr_auto] items-center gap-4 rounded-sm px-1 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                    onClick={createUntitledEditor}
                  >
                    <span>新建文件</span>
                    <span className="inline-flex gap-1 text-[11px] text-muted-foreground/80 group-hover:text-muted-foreground">
                      <kbd className="rounded-sm bg-muted px-1.5 py-0.5 font-mono">Ctrl</kbd>
                      <kbd className="rounded-sm bg-muted px-1.5 py-0.5 font-mono">N</kbd>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="group grid h-7 cursor-pointer grid-cols-[1fr_auto] items-center gap-4 rounded-sm px-1 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                    onClick={() => setIsSearchOpen(true)}
                  >
                    <span>搜索笔记</span>
                    <span className="inline-flex gap-1 text-[11px] text-muted-foreground/80 group-hover:text-muted-foreground">
                      <kbd className="rounded-sm bg-muted px-1.5 py-0.5 font-mono">Ctrl</kbd>
                      <kbd className="rounded-sm bg-muted px-1.5 py-0.5 font-mono">K</kbd>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="group grid h-7 cursor-pointer grid-cols-[1fr_auto] items-center gap-4 rounded-sm px-1 text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                    onClick={openNotesFolder}
                  >
                    <span>打开笔记文件夹</span>
                    <span className="inline-flex gap-1 text-[11px] text-muted-foreground/80 group-hover:text-muted-foreground">
                      <FolderOpen className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <MarkdownEditorToolbar
                disabled={!showEditorPane || !markdownToolbarApi?.hasEditor()}
                zoomLabel={showEditorPane ? contentZoomLabel : undefined}
                trailingContent={editorViewModeSwitcher}
                onAction={(actionId) => {
                  markdownToolbarApi?.executeAction(actionId);
                }}
              />

              <div ref={editorPreviewContainerRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                {/* Center: Markdown editor */}
                <main
                  className={cn(
                    "app-editor-pane flex min-w-0 flex-1 flex-col overflow-hidden",
                    !showEditorPane && "hidden",
                  )}
                  style={editorPaneStyle}
                  onWheelCapture={handleContentWheel}
                >
                  {editorViewMode !== "preview" && (
                    <details
                      open={isFrontmatterOpen}
                      onToggle={(event) => setIsFrontmatterOpen(event.currentTarget.open)}
                      className="app-frontmatter-panel shrink-0 border-b border-border bg-background/95"
                    >
                      <summary className="flex h-7 cursor-pointer list-none select-none items-center justify-between px-4 text-xs font-medium text-muted-foreground transition-colors duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] [&::-webkit-details-marker]:hidden">
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 transition-transform",
                              isFrontmatterOpen && "rotate-90",
                            )}
                            aria-hidden="true"
                          />
                          <span>文章信息</span>
                        </span>
                        {frontmatter.warning && (
                          <span className="normal-case tracking-normal text-amber-400">
                            {frontmatter.warning}
                          </span>
                        )}
                      </summary>
                      <div className="app-frontmatter-body grid gap-2 px-4 py-2">
                        <div className="app-frontmatter-grid grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                          <div className="app-frontmatter-field grid gap-1">
                            <Label htmlFor="frontmatter-title">标题</Label>
                            <Input
                              id="frontmatter-title"
                              value={frontmatter.fields.title}
                              disabled={!frontmatter.canMerge}
                              className="h-9 px-2.5 text-xs"
                              autoComplete="off"
                              onChange={(e) => updateFrontmatter({ title: e.target.value })}
                            />
                          </div>
                          <div className="app-frontmatter-field grid gap-1">
                            <Label htmlFor="frontmatter-tags">标签</Label>
                            <div
                              id="frontmatter-tags"
                              role="button"
                              tabIndex={!frontmatter.canMerge || !frontmatter.canEditTags ? -1 : 0}
                              className={cn(
                                "h-9 w-full cursor-pointer rounded-sm border border-border/80 bg-muted/20 px-2.5 text-left text-xs outline-none transition-colors hover:border-border hover:bg-muted/35 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50",
                                (!frontmatter.canMerge || !frontmatter.canEditTags) && "cursor-not-allowed bg-input/50 opacity-50 dark:bg-input/80",
                              )}
                              onClick={openTagPicker}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openTagPicker();
                                }
                              }}
                            >
                              <span className="flex h-full min-w-0 items-center justify-between gap-3 overflow-hidden">
                                <span className="truncate text-muted-foreground">选择标签</span>
                                <span className="shrink-0 text-[11px] text-muted-foreground">
                                  已选 {frontmatterDisplayTags.length} 个
                                </span>
                              </span>
                            </div>
                            {tagNormalizationSuggestions.length > 0 && (
                              <div className="rounded-sm border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] text-amber-100/90">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span>有 {tagNormalizationSuggestions.length} 个标签可规范化为当前标签体系。</span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      className="text-amber-100 underline-offset-2 hover:underline"
                                      onClick={() => setIsTagNormalizationDetailsOpen((open) => !open)}
                                    >
                                      {isTagNormalizationDetailsOpen ? "收起" : "查看"}
                                    </button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[11px] text-amber-50 hover:bg-amber-400/10 hover:text-amber-50"
                                      onClick={applyTagNormalizationSuggestions}
                                    >
                                      一键应用
                                    </Button>
                                  </span>
                                </div>
                                {isTagNormalizationDetailsOpen && (
                                  <div className="mt-1.5 grid gap-1 text-amber-50/80">
                                    {tagNormalizationSuggestions.map((suggestion) => (
                                      <div key={`${suggestion.original}->${suggestion.normalized}`} className="min-w-0 truncate" title={`${suggestion.original} -> ${suggestion.pathText}`}>
                                        <span className="text-amber-100/60">{formatTagNormalizationReason(suggestion.reason)}</span>
                                        <span className="mx-1">·</span>
                                        {suggestion.original} <span className="text-amber-100/50">-&gt;</span> {suggestion.pathText}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="app-frontmatter-field grid gap-1">
                            <Label htmlFor="frontmatter-difficulty">难度</Label>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild disabled={!frontmatter.canMerge}>
                                <button
                                  id="frontmatter-difficulty"
                                  type="button"
                                  className={cn(
                                    "group flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-control)] bg-background px-2.5 text-left text-xs outline-none transition-[background-color,border-color,box-shadow,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:border-[var(--ui-border-strong)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-[var(--ui-disabled-opacity)] dark:bg-input/30 dark:disabled:bg-input/80",
                                    getDifficultyOptionClassName(frontmatter.fields.difficulty),
                                  )}
                                  aria-label="选择难度"
                                >
                                  <span
                                    className="min-w-0 truncate"
                                    style={{ color: getDifficultyOptionTextColor(frontmatter.fields.difficulty, resolvedTheme) }}
                                  >
                                    {frontmatter.fields.difficulty.trim() || "无"}
                                  </span>
                                  <ChevronDown
                                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] group-data-[state=open]:rotate-180"
                                    aria-hidden="true"
                                  />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[var(--radix-dropdown-menu-trigger-width)]">
                                {!LUOGU_DIFFICULTY_OPTIONS.some((option) => option.value === frontmatter.fields.difficulty) && frontmatter.fields.difficulty.trim() && (
                                  <DropdownMenuItem className="justify-between">
                                    <span className="min-w-0 truncate">当前：{frontmatter.fields.difficulty}</span>
                                    <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                  </DropdownMenuItem>
                                )}
                                {LUOGU_DIFFICULTY_OPTIONS.map((option) => {
                                  const selected = frontmatter.fields.difficulty === option.value;
                                  return (
                                    <DropdownMenuItem
                                      key={option.value || "none"}
                                      className={cn(
                                        "justify-between",
                                        selected && "bg-[var(--ui-state-selected)] text-[var(--ui-state-selected-foreground)]",
                                        option.className,
                                      )}
                                      onSelect={() => updateFrontmatter({ difficulty: option.value })}
                                    >
                                      <span
                                        className="min-w-0 truncate"
                                        style={{ color: getDifficultyOptionTextColor(option.value, resolvedTheme) }}
                                      >
                                        {option.label}
                                      </span>
                                      {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div className="app-frontmatter-field grid gap-1">
                            <Label htmlFor="frontmatter-source">来源</Label>
                            <Input
                              id="frontmatter-source"
                              value={frontmatter.fields.source}
                              disabled={!frontmatter.canMerge}
                              className="h-9 px-2.5 text-xs"
                              autoComplete="off"
                              onChange={(e) => updateFrontmatter({ source: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="app-frontmatter-field app-frontmatter-summary grid gap-1">
                          <Label htmlFor="frontmatter-summary">摘要</Label>
                          <textarea
                            id="frontmatter-summary"
                            value={frontmatter.fields.summary}
                            disabled={!frontmatter.canMerge}
                            rows={2}
                            className="min-h-[76px] w-full resize-none rounded-none border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            onChange={(e) => updateFrontmatter({ summary: e.target.value })}
                          />
                        </div>
                        <label className="app-frontmatter-draft flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={frontmatter.fields.draft}
                            disabled={!frontmatter.canMerge}
                            className="h-3.5 w-3.5 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                            onChange={(e) => updateFrontmatter({ draft: e.target.checked })}
                          />
                          草稿
                        </label>
                      </div>
                    </details>
                  )}
                  <MarkdownEditor
                    value={committedMarkdown}
                    documentKey={activeWorkingCopyId ?? currentFilePath ?? "__welcome__"}
                    externalDocVersion={externalDocVersion}
                    onChange={handleEditorChange}
                    aiContextSelectionRange={aiContextSelectionRange}
                    onSelectionChange={handleEditorSelectionChange}
                    onPasteImage={handlePasteImage}
                    onScroll={handleEditorScroll}
                    hideToolbar
                    onToolbarApiChange={setMarkdownToolbarApi}
                    onScrollApiChange={handleEditorScrollApiChange}
                    className="min-h-0 min-w-0 flex-1"
                  />
                </main>

                {isEditorPreviewSplit && (
                  <button
                    type="button"
                    className={cn(
                      "app-column-resizer app-column-resizer-editor",
                      activeResizeHandle === "editor-preview" && "app-column-resizer-active",
                    )}
                    onPointerDown={(event) => beginColumnResize("editor-preview", event)}
                    onDoubleClick={() => resetColumnSize("editor-preview")}
                    aria-label="调整编辑区和预览区比例"
                    title="拖拽调整编辑区和预览区比例，双击重置"
                  />
                )}

                {/* Right: Live preview */}
                <aside
                  className={cn(
                    "app-preview-pane min-w-0 overflow-hidden",
                    showPreviewPane ? "flex" : "hidden",
                    showEditorPane ? "flex-1" : "flex-[1_1_100%]",
                  )}
                  style={previewPaneStyle}
                  onWheelCapture={handleContentWheel}
                >
                  <MarkdownPreview
                    markdown={previewMarkdown}
                    noteRelativePath={currentFilePath}
                    onScroll={handlePreviewScroll}
                    onScrollApiChange={handlePreviewScrollApiChange}
                    className="h-full w-full min-w-0"
                  />
                </aside>
              </div>
            </>
          )}
        </section>
        <AiSidebar
          context={aiSidebarContext}
          isAiConfigured={aiConfigured}
          isOpen={isAiSidebarOpen}
          onClose={() => {
            setIsAiSidebarMaximized(false);
            setIsAiSidebarOpen(false);
          }}
          width={aiSidebarWidth}
          isMaximized={isAiSidebarMaximized}
          isResizing={activeResizeHandle === "ai-sidebar"}
          onResizePointerDown={(event) => beginColumnResize("ai-sidebar", event)}
          onResizeDoubleClick={() => resetColumnSize("ai-sidebar")}
          developerModeEnabled={developerModeEnabled}
          onMaximizedChange={setIsAiSidebarMaximized}
          aiConfig={aiConfig}
          onAiConfigChange={handleAiConfigChangeFromSidebar}
          onOpenAiSettings={() => void openAiSettings()}
          tagTaxonomyConfig={tagTaxonomyUserConfig}
          onApplySuggestedTags={handleApplyAiSuggestedTags}
          onApplyPolishedSelection={handleApplyPolishedSelection}
          onApplyPolishedFullNote={handleApplyPolishedFullNote}
          onOpenPolishReview={handleOpenPolishReview}
          onPolishReviewChange={handlePolishReviewChange}
          onOpenLocalNote={handleOpenLocalNoteFromAi}
        />
        </div>
      </div>
      <footer className="app-status-bar shrink-0 border-t border-border/80 bg-muted/15 px-3 py-0.5 text-[11px] text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <div className="app-status-group flex min-w-0 flex-wrap items-center gap-y-1">
            <button
              type="button"
              className={cn(
                "app-status-item app-status-button inline-flex h-5 items-center gap-1 rounded px-1.5 transition-colors",
                activeEditorDirty && !isSavingNote
                  ? "app-status-save-dirty"
                  : "cursor-default text-muted-foreground",
                (!hasActiveEditorDocument || isSavingNote) && "pointer-events-none",
              )}
              onClick={handleSaveCurrentNote}
              disabled={!hasActiveEditorDocument || isSavingNote}
              title={activeEditorDirty || activeWorkingCopy?.kind === "untitled" ? "保存当前笔记" : saveStatusLabel}
              aria-label={activeEditorDirty || activeWorkingCopy?.kind === "untitled" ? "保存当前笔记" : saveStatusLabel}
            >
              <Save className="h-3 w-3" aria-hidden="true" />
              保存：{saveStatusLabel}
            </button>
            <span className="app-status-item whitespace-nowrap">类型：Markdown</span>
          </div>
          <div className="app-status-group flex min-w-0 flex-wrap items-center gap-y-1">
            <button
              type="button"
              className="app-status-item app-status-button truncate whitespace-nowrap rounded px-1.5 py-0.5 transition-colors"
              onClick={() => openSettingsSection("blog")}
              title="打开博客相关工具"
            >
              Blog：{blogStatusLabel}
            </button>
            <button
              type="button"
              className="app-status-item app-status-button truncate whitespace-nowrap rounded px-1.5 py-0.5 transition-colors"
              onClick={() => openSettingsSection("ai")}
              title="打开 AI 分类"
            >
              AI：{aiStatusLabel}
            </button>
            <button
              type="button"
              className="app-status-item app-status-button truncate whitespace-nowrap rounded px-1.5 py-0.5 transition-colors"
              onClick={() => openSettingsSection("luogu")}
              title="打开洛谷分类"
            >
              洛谷：{luoguStatusLabel}
            </button>
          </div>
          <div className="app-status-group flex min-w-0 flex-wrap items-center justify-end gap-y-1">
            <span className="app-status-item whitespace-nowrap">视图：{editorViewModeLabel}</span>
            <span className="app-status-item whitespace-nowrap">界面：{appZoomLabel}</span>
            <span className="app-status-item whitespace-nowrap">内容：{contentZoomLabel}</span>
          </div>
        </div>
      </footer>
    </div>
    </>
  );
}

