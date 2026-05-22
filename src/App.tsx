import { listen } from "@tauri-apps/api/event";
import { forwardRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { Bot, Check, ChevronDown, ChevronRight, Columns2, Download, ExternalLink, Eye, FilePlus, FileText, FolderPlus, FolderOpen, Loader2, Maximize2, Minimize2, Minus, PlugZap, Plus, RefreshCw, RotateCcw, Save, Search, Settings, Sparkles, Square, SquarePen, Trash2, Upload, X } from "lucide-react";
import { history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, type ViewUpdate } from "@codemirror/view";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import AiSidebar from "@/components/ai/AiSidebar";
import { CodexDiffPreview, getDiffStats } from "@/components/ai/DiffPreview";
import type { AiPolishPreview, AiSidebarNoteContext, ApplyPolishedFullNoteInput, ApplyPolishedSelectionInput } from "@/components/ai/types";
import MarkdownEditor, { MarkdownEditorToolbar, type MarkdownEditorScrollApi, type MarkdownEditorSelectionRange, type MarkdownEditorToolbarApi } from "@/components/editor/MarkdownEditor";
import MarkdownPreview, { type MarkdownPreviewScrollApi } from "@/components/editor/MarkdownPreview";
import FileTree from "@/components/file-tree/FileTree";
import OpenTabsBar, { type OpenFileTab, type OpenReviewTab, type OpenTab } from "@/components/layout/OpenTabsBar";
import SearchDiagnosticsPanel from "@/components/settings/SearchDiagnosticsPanel";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/datetime";
import { listNotes, readNote, writeNote, commitNote, commitDeletedNote, commitRenamedNote, pushGit, deleteNote, renameNote, createNoteFolder, renameNoteFolder, deleteNoteFolder, openBlog, restartBlogServer, openNotesFolder, saveNoteAsset, importLuoguInsight, prepareLuoguSubmissionNote, writeLuoguPreparedNote, getLuoguConfig, saveLuoguConfig, updateLuoguLastSubmissionId, testLuoguConnection, previewLuoguSubmissionPage, syncLuoguInsights, getAiConfig, saveAiConfig, syncAiProviderModelsDraft, testAiProviderDraft, listAiPrompts, readAiPrompt, saveAiPrompt, polishAiPromptTemplate, searchNotes, testWebSearchConnection, clearWebCache, getLocalNoteIndexStatus, rebuildLocalNoteIndex } from "@/lib/api";
import type { AiConfig, AiProvider, LocalNoteIndexStatusResult, NoteSearchResult, PrepareLuoguSubmissionNoteResult, WriteLuoguPreparedNoteResult, PreviewLuoguSubmission, PreviewLuoguSubmissionsResult, PromptTemplateSummary, SyncLuoguInsightsResult, TestLuoguConnectionResult } from "@/lib/api";
import { mergeFrontmatterFields, parseFrontmatterFields, splitFrontmatter } from "@/lib/frontmatter";
import { DEFAULT_WEB_SEARCH_CONFIG, normalizeWebSearchConfig } from "@/lib/aiWebSearch";
import type { FrontmatterFields } from "@/lib/frontmatter";
import { prewarmMarkdownRenderer } from "@/lib/markdown";
import type { NoteFileInfo } from "@/types/note";

// 欢迎内容：未选中文件时在编辑器和预览里显示
const INITIAL_MARKDOWN = `# OI Notebook

OI Notebook 是给 OIer 用的本地笔记工具，目标是把训练中遇到的 trick、题解和 AC 后的 insight 及时沉淀下来。

## 你可以用它做什么

- 写 Markdown 笔记：左边编辑，右边实时预览，支持标题、列表、代码块、表格、图片和公式。
- 打开本地博客复习：点击左侧 Activity Bar 的“博客”，用更适合阅读的页面回看自己的笔记。
- 用 AI 整理内容：配置 API 后，可以让 AI 补全标题、标签、摘要，也可以尝试润色正文。
- 同步洛谷 insight：配置洛谷 Cookie 后，可以把 AC 提交里的沉淀内容同步成笔记。

## 笔记保存在哪里

笔记默认保存在本机数据目录的 \`notes/\` 里。开发版会打开项目里的 \`notes/\`，安装版会打开系统 app data 里的 \`notes/\`。

想看真实位置，可以点设置中心的“数据与存储”。

## 推荐第一步

1. 点左侧笔记列表右上角的“+”，新建一篇 trick 或 problem 笔记。
2. 写几行 Markdown，然后点顶部“保存”。
3. 点左侧 Activity Bar 的“博客”，看看它在本地博客里的效果。

普通写笔记和本地博客不需要配置 AI 或洛谷；这些能力可以等你熟悉后再打开。
`;

const APP_ICON_URL = new URL("../src-tauri/icons/32x32.png", import.meta.url).href;
const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
const THEME_STORAGE_KEY = "oi-notebook.theme";
const CONTENT_ZOOM_STORAGE_KEY = "oi-notebook.contentZoom";
const APP_ZOOM_STORAGE_KEY = "oi-notebook.appZoom";
const APP_ZOOM_MIN = 0.8;
const APP_ZOOM_MAX = 1.6;
const APP_ZOOM_STEP = 0.1;
const APP_ZOOM_DEFAULT = 1;
const CONTENT_ZOOM_MIN = 0.8;
const CONTENT_ZOOM_MAX = 2;
const CONTENT_ZOOM_STEP = 0.1;
const CONTENT_ZOOM_DEFAULT = 1;
const UI_SCALE_STORAGE_KEY = "oi-notebook.uiScale";
const UI_SCALE_DEFAULT = 1;
const EDITOR_FONT_SIZE_STORAGE_KEY = "oi-notebook.editorFontSize";
const PREVIEW_FONT_SIZE_STORAGE_KEY = "oi-notebook.previewFontSize";
const READING_DENSITY_STORAGE_KEY = "oi-notebook.readingDensity";
const TOOLBAR_FONT_SIZE_STORAGE_KEY = "oi-notebook.toolbarFontSize";
const SETTINGS_FONT_SIZE_STORAGE_KEY = "oi-notebook.settingsFontSize";
const DEVELOPER_MODE_STORAGE_KEY = "oi-notebook.developerMode";
const FONT_SIZE_MIN = 13;
const FONT_SIZE_MAX = 20;
const EDITOR_FONT_SIZE_DEFAULT = 14;
const PREVIEW_FONT_SIZE_DEFAULT = 14;
const TOOLBAR_FONT_SIZE_MIN = 12;
const TOOLBAR_FONT_SIZE_MAX = 18;
const TOOLBAR_FONT_SIZE_DEFAULT = 12;
const SETTINGS_FONT_SIZE_MIN = 13;
const SETTINGS_FONT_SIZE_MAX = 18;
const SETTINGS_FONT_SIZE_DEFAULT = 14;
const SETTINGS_CENTER_MIN_WIDTH = 860;
const SETTINGS_CENTER_MIN_HEIGHT = 560;
const SETTINGS_CENTER_DEFAULT_WIDTH = 1180;
const SETTINGS_CENTER_DEFAULT_HEIGHT = 780;
const SETTINGS_CENTER_MAXIMIZED_MARGIN_X = 24;
const SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP = 56;
const SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM = 40;
const PROMPT_EDITOR_FONT_SIZE_MIN = 12;
const PROMPT_EDITOR_FONT_SIZE_MAX = 22;
const PROMPT_EDITOR_FONT_SIZE_DEFAULT = 14;
const PROMPT_EDITOR_FONT_SIZE_STEP = 1;
const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "oi-notebook.layout.leftSidebarWidth";
const AI_SIDEBAR_WIDTH_STORAGE_KEY = "oi-notebook.layout.aiSidebarWidth";
const EDITOR_PREVIEW_RATIO_STORAGE_KEY = "oi-notebook.layout.editorPreviewRatio";
const OPEN_TABS_STORAGE_KEY = "oi-notebook.openTabs";
const OPEN_TABS_ACTIVE_STORAGE_KEY = "oi-notebook.openTabs.activePath";
const LEFT_SIDEBAR_WIDTH_DEFAULT = 260;
const LEFT_SIDEBAR_WIDTH_MIN = 200;
const LEFT_SIDEBAR_WIDTH_MAX = 420;
const AI_SIDEBAR_WIDTH_DEFAULT = 390;
const AI_SIDEBAR_WIDTH_MIN = 320;
const ACTIVITY_BAR_BASE_WIDTH = 52;
const EDITOR_PREVIEW_RATIO_DEFAULT = 0.5;
const EDITOR_PREVIEW_RATIO_MIN = 0.2;
const EDITOR_PREVIEW_RATIO_MAX = 0.8;
const EDITOR_PREVIEW_MIN_PANE_WIDTH = 320;

type SettingsCenterRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type SettingsResizeHandle = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

function isFinitePositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clampNumber(value: number, min: number, max: number): number {
  const safeMax = Math.max(min, max);
  return Math.min(Math.max(value, min), safeMax);
}

function getSettingsViewportSize() {
  if (typeof window === "undefined") {
    return {
      width: SETTINGS_CENTER_DEFAULT_WIDTH + SETTINGS_CENTER_MAXIMIZED_MARGIN_X * 2,
      height: SETTINGS_CENTER_DEFAULT_HEIGHT + SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP + SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM,
    };
  }
  const viewportWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : SETTINGS_CENTER_DEFAULT_WIDTH + SETTINGS_CENTER_MAXIMIZED_MARGIN_X * 2;
  const viewportHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : SETTINGS_CENTER_DEFAULT_HEIGHT + SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP + SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM;
  return {
    width: Math.max(320, viewportWidth),
    height: Math.max(360, viewportHeight),
  };
}

function getSettingsCenterMaxSize() {
  const viewport = getSettingsViewportSize();
  return {
    width: Math.max(1, viewport.width - SETTINGS_CENTER_MAXIMIZED_MARGIN_X * 2),
    height: Math.max(1, viewport.height - SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP - SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM),
  };
}

function getDefaultSettingsCenterRect(): SettingsCenterRect {
  const viewport = getSettingsViewportSize();
  const maxSize = getSettingsCenterMaxSize();
  const width = Math.min(SETTINGS_CENTER_DEFAULT_WIDTH, maxSize.width);
  const height = Math.min(SETTINGS_CENTER_DEFAULT_HEIGHT, maxSize.height);
  const left = Math.max(0, Math.min(Math.max(SETTINGS_CENTER_MAXIMIZED_MARGIN_X, (viewport.width - width) / 2), viewport.width - width));
  const top = Math.max(0, Math.min(Math.max(SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP, (viewport.height - height) / 2), viewport.height - height));
  return {
    left,
    top,
    width,
    height,
  };
}

function getMaximizedSettingsCenterRect(): SettingsCenterRect {
  const maxSize = getSettingsCenterMaxSize();
  return clampSettingsCenterRect({
    left: SETTINGS_CENTER_MAXIMIZED_MARGIN_X,
    top: SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP,
    width: maxSize.width,
    height: maxSize.height,
  });
}

function clampSettingsCenterRect(rect: SettingsCenterRect): SettingsCenterRect {
  const viewport = getSettingsViewportSize();
  const maxSize = getSettingsCenterMaxSize();
  const defaultRect = getDefaultSettingsCenterRect();
  const minWidth = Math.min(SETTINGS_CENTER_MIN_WIDTH, maxSize.width);
  const minHeight = Math.min(SETTINGS_CENTER_MIN_HEIGHT, maxSize.height);
  const width = Math.min(
    Math.max(isFinitePositiveNumber(rect.width) ? rect.width : defaultRect.width, minWidth),
    maxSize.width,
  );
  const height = Math.min(
    Math.max(isFinitePositiveNumber(rect.height) ? rect.height : defaultRect.height, minHeight),
    maxSize.height,
  );
  const minLeft = Math.min(SETTINGS_CENTER_MAXIMIZED_MARGIN_X, Math.max(0, viewport.width - width));
  const maxLeft = Math.max(minLeft, viewport.width - SETTINGS_CENTER_MAXIMIZED_MARGIN_X - width);
  const minTop = Math.min(SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP, Math.max(0, viewport.height - height));
  const maxTop = Math.max(minTop, viewport.height - SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM - height);
  const safeLeft = Number.isFinite(rect.left) ? rect.left : defaultRect.left;
  const safeTop = Number.isFinite(rect.top) ? rect.top : defaultRect.top;
  return {
    left: Math.min(Math.max(safeLeft, minLeft), maxLeft),
    top: Math.min(Math.max(safeTop, minTop), maxTop),
    width,
    height,
  };
}

function isSettingsCenterRectFullyVisible(rect: SettingsCenterRect): boolean {
  const viewport = getSettingsViewportSize();
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    isFinitePositiveNumber(rect.width) &&
    isFinitePositiveNumber(rect.height) &&
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.left + rect.width <= viewport.width &&
    rect.top + rect.height <= viewport.height
  );
}

function getSafeOpenedSettingsCenterRect(rect: SettingsCenterRect): SettingsCenterRect {
  const defaultRect = getDefaultSettingsCenterRect();
  const maxSize = getSettingsCenterMaxSize();
  if (!isFinitePositiveNumber(rect.width) || !isFinitePositiveNumber(rect.height)) return defaultRect;
  const width = Math.min(Math.max(rect.width, Math.min(SETTINGS_CENTER_MIN_WIDTH, maxSize.width)), maxSize.width);
  const height = Math.min(Math.max(rect.height, Math.min(SETTINGS_CENTER_MIN_HEIGHT, maxSize.height)), maxSize.height);
  const viewport = getSettingsViewportSize();
  const centeredRect = clampSettingsCenterRect({
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height,
  });
  return isSettingsCenterRectFullyVisible(centeredRect) ? centeredRect : defaultRect;
}

function getSettingsCenterResizeCursor(handle: SettingsResizeHandle): string {
  if (handle === "left" || handle === "right") return "ew-resize";
  if (handle === "top" || handle === "bottom") return "ns-resize";
  if (handle === "top-left" || handle === "bottom-right") return "nwse-resize";
  return "nesw-resize";
}

function getLocalIndexStatusLabel(status: LocalNoteIndexStatusResult | null, isBuilding: boolean): string {
  if (isBuilding) return "正在建立本地笔记索引...";
  if (!status) return "尚未读取";
  if (status.status === "ready") return "可用";
  if (status.status === "stale") return "建议重建";
  if (status.status === "error") return "读取失败";
  if (!status.exists) return "尚未建立";
  return status.status || "未知";
}

function getLocalIndexUpdatedLabel(status: LocalNoteIndexStatusResult | null): string {
  if (!status?.updatedAt) return "尚未记录";
  return new Date(status.updatedAt * 1000).toLocaleString();
}

function getResizedSettingsCenterRect(handle: SettingsResizeHandle, startRect: SettingsCenterRect, deltaX: number, deltaY: number): SettingsCenterRect {
  const viewport = getSettingsViewportSize();
  const maxSize = getSettingsCenterMaxSize();
  const minWidth = Math.min(SETTINGS_CENTER_MIN_WIDTH, maxSize.width);
  const minHeight = Math.min(SETTINGS_CENTER_MIN_HEIGHT, maxSize.height);
  const minLeft = Math.min(SETTINGS_CENTER_MAXIMIZED_MARGIN_X, Math.max(0, viewport.width - minWidth));
  const minTop = Math.min(SETTINGS_CENTER_MAXIMIZED_MARGIN_TOP, Math.max(0, viewport.height - minHeight));
  const rightLimit = Math.max(1, viewport.width - SETTINGS_CENTER_MAXIMIZED_MARGIN_X);
  const bottomLimit = Math.max(1, viewport.height - SETTINGS_CENTER_MAXIMIZED_MARGIN_BOTTOM);
  const startRight = startRect.left + startRect.width;
  const startBottom = startRect.top + startRect.height;
  let left = startRect.left;
  let top = startRect.top;
  let right = startRight;
  let bottom = startBottom;

  if (handle.includes("left")) {
    left = clampNumber(startRect.left + deltaX, minLeft, startRight - minWidth);
  }
  if (handle.includes("right")) {
    right = clampNumber(startRight + deltaX, startRect.left + minWidth, rightLimit);
  }
  if (handle.includes("top")) {
    top = clampNumber(startRect.top + deltaY, minTop, startBottom - minHeight);
  }
  if (handle.includes("bottom")) {
    bottom = clampNumber(startBottom + deltaY, startRect.top + minHeight, bottomLimit);
  }

  return clampSettingsCenterRect({
    left,
    top,
    width: right - left,
    height: bottom - top,
  });
}

type DialogMode = "create" | "rename" | "create-folder";
type NoteLocationOptionId = "root" | "current" | "tricks" | "problems" | "custom";
type EditorViewMode = "split" | "editor" | "preview";
type LuoguImportCenterTab = "scan" | "rules" | "account" | "manual" | "advanced";
type LuoguImportStep = "scan" | "preview";
type LuoguPreviewDetailTab = "rendered" | "markdown" | "source";
type LuoguScanMode = "count" | "days";
type LuoguScanCountLimit = 20 | 50 | 100 | 200;
type LuoguScanDaysLimit = 30 | 90 | 180 | 365;
type LuoguMissingInsightStrategy = "skip" | "draft";
type LuoguPrepareItemStatus = "queued" | "running" | "stopped";
type AppTheme = "dark" | "light";
type ReadingDensity = "compact" | "standard" | "comfortable";
type SettingsCategory = "appearance" | "ai" | "luogu" | "blog" | "data" | "about" | "diagnostics" | "git" | "editor";
type SettingsSection =
  | "appearance-theme"
  | "ai-api"
  | "ai-web-search"
  | "ai-prompts"
  | "ai-local-notes"
  | "luogu-account"
  | "blog-preview"
  | "data-storage"
  | "about-version"
  | "about-markdown"
  | "about-privacy"
  | "diagnostics-search"
  | "git-sync";
type SettingsGroupId = Exclude<SettingsCategory, "editor">;
type SettingsTarget =
  | { type: "category"; category: SettingsGroupId }
  | { type: "page"; page: SettingsSection };
type SettingsView = "main" | "prompt-editor";
type ActivityBarItem = "notes" | "search" | "luogu" | "ai" | "blog" | "settings";
type ResizeHandleId = "left-sidebar" | "editor-preview" | "ai-sidebar";
type WorkspaceTabId = string;

interface PolishReviewTab {
  id: string;
  preview: AiPolishPreview;
}

interface CursorParagraphContext {
  text: string;
  isCode: boolean;
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
const THEME_OPTIONS: Array<{ id: AppTheme; label: string; description: string }> = [
  { id: "dark", label: "黑色主题", description: "保持当前深色工作台视觉，适合长时间编辑。" },
  { id: "light", label: "白色主题", description: "切换到浅色界面，适合明亮环境和投屏演示。" },
];
const APP_ZOOM_PRESETS = [0.9, 1, 1.1, 1.2, 1.3];
const CONTENT_ZOOM_PRESETS = [0.9, 1, 1.1, 1.25, 1.5];
const UI_SCALE_PRESETS = [0.9, 1, 1.1, 1.2, 1.3];
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
const SETTINGS_TREE: Array<{
  id: SettingsGroupId;
  label: string;
  developerOnly?: boolean;
  children: Array<{ id: SettingsSection; label: string }>;
}> = [
  { id: "appearance", label: "外观", children: [{ id: "appearance-theme", label: "主题与字号" }] },
  {
    id: "ai",
    label: "AI",
    children: [
      { id: "ai-api", label: "模型与 API" },
      { id: "ai-local-notes", label: "本地笔记索引" },
      { id: "ai-web-search", label: "联网搜索" },
      { id: "ai-prompts", label: "Prompt 模板" },
    ],
  },
  { id: "luogu", label: "洛谷", children: [{ id: "luogu-account", label: "账号与扫描" }] },
  { id: "blog", label: "博客", children: [{ id: "blog-preview", label: "本地预览" }] },
  { id: "data", label: "数据与存储", children: [{ id: "data-storage", label: "目录与缓存" }] },
  {
    id: "about",
    label: "关于",
    children: [
      { id: "about-version", label: "版本与说明" },
      { id: "about-markdown", label: "Markdown 支持" },
      { id: "about-privacy", label: "数据与隐私" },
    ],
  },
  { id: "diagnostics", label: "诊断", developerOnly: true, children: [{ id: "diagnostics-search", label: "搜索自检" }] },
  { id: "git", label: "Git", developerOnly: true, children: [{ id: "git-sync", label: "进阶同步入口" }] },
];
const SETTINGS_SECTION_FALLBACK: Record<SettingsCategory, SettingsSection> = {
  appearance: "appearance-theme",
  ai: "ai-api",
  luogu: "luogu-account",
  blog: "blog-preview",
  data: "data-storage",
  about: "about-version",
  diagnostics: "diagnostics-search",
  git: "git-sync",
  editor: "about-markdown",
};
const SETTINGS_SECTION_LABELS = SETTINGS_TREE.reduce((labels, group) => {
  for (const child of group.children) labels[child.id] = { group: group.label, groupId: group.id, section: child.label };
  return labels;
}, {} as Record<SettingsSection, { group: string; groupId: SettingsGroupId; section: string }>);
const SETTINGS_CATEGORY_LABELS = SETTINGS_TREE.reduce((labels, group) => {
  labels[group.id] = group.label;
  return labels;
}, {} as Record<SettingsGroupId, string>);
const MARKDOWN_CAPABILITIES = [
  "KaTeX",
  "代码高亮",
  "行高亮",
  "可选行号",
  "callout",
  "align / epigraph",
  "cute-table",
  "表格 ^ / > 合并",
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

interface LuoguImportRules {
  requireAc: boolean;
  keepLatestAcOnly: boolean;
  missingInsightStrategy: LuoguMissingInsightStrategy;
}

interface LuoguSubmissionCandidateState {
  canSelect: boolean;
  statusLabel: string;
}

const DEFAULT_LUOGU_IMPORT_RULES: LuoguImportRules = {
  requireAc: true,
  keepLatestAcOnly: true,
  missingInsightStrategy: "draft",
};

const COMMON_NOTE_TAGS = ["题解", "技巧", "复盘", "模板", "总结", "调试", "草稿"];

function cloneAiConfig(config: AiConfig): AiConfig {
  return {
    ...config,
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
    const defaultModel = provider.default_model?.trim() || models.find((model) => model.enabled)?.id || models[0]?.id || null;

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
    defaultProvider?.models.find((model) => model.enabled)?.id ??
    defaultProvider?.models[0]?.id ??
    null;

  return {
    base_url: defaultProvider?.base_url ?? config.base_url.trim(),
    api_key: defaultProvider?.api_key ?? config.api_key.trim(),
    model: defaultModel ?? config.model.trim(),
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

function getAiConfigComparable(config: AiConfig | null): string {
  if (!config) return "";
  return JSON.stringify(normalizeAiConfigDraft(config));
}

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

function extractCursorParagraph(markdownContent: string, cursorOffset: number | null): CursorParagraphContext | null {
  if (cursorOffset === null || markdownContent.trim().length === 0) return null;

  const safeOffset = Math.max(0, Math.min(markdownContent.length, cursorOffset));
  let lineStart = 0;
  let inFence = false;
  let fenceStart = 0;
  let fenceMarker = "";

  while (lineStart <= markdownContent.length) {
    const lineEnd = markdownContent.indexOf("\n", lineStart);
    const nextLineStart = lineEnd === -1 ? markdownContent.length + 1 : lineEnd + 1;
    const lineText = markdownContent.slice(lineStart, lineEnd === -1 ? markdownContent.length : lineEnd);
    const fenceMatch = lineText.match(/^\s*(`{3,}|~{3,})/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceStart = lineStart;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        if (safeOffset >= fenceStart && safeOffset <= nextLineStart) {
          return {
            text: markdownContent.slice(fenceStart, nextLineStart).trim(),
            isCode: true,
          };
        }
        inFence = false;
        fenceMarker = "";
      }
    }

    if (safeOffset < nextLineStart) break;
    lineStart = nextLineStart;
  }

  if (inFence && safeOffset >= fenceStart) {
    const closingPattern = new RegExp(`(^|\\n)\\s*${fenceMarker}{3,}[^\\n]*(\\n|$)`);
    const rest = markdownContent.slice(safeOffset);
    const closingMatch = rest.match(closingPattern);
    const fenceEnd = closingMatch?.index === undefined
      ? markdownContent.length
      : safeOffset + closingMatch.index + closingMatch[0].length;
    return {
      text: markdownContent.slice(fenceStart, fenceEnd).trim(),
      isCode: true,
    };
  }

  const beforeCursor = markdownContent.slice(0, safeOffset);
  const paragraphStartMatch = beforeCursor.match(/\n\s*\n[ \t]*[^\n]*$/);
  const paragraphStart = paragraphStartMatch?.index === undefined
    ? 0
    : paragraphStartMatch.index + paragraphStartMatch[0].match(/^\n\s*\n/)![0].length;
  const afterCursor = markdownContent.slice(safeOffset);
  const paragraphEndMatch = afterCursor.match(/\n\s*\n/);
  const paragraphEnd = paragraphEndMatch?.index === undefined ? markdownContent.length : safeOffset + paragraphEndMatch.index;
  const paragraphText = markdownContent.slice(paragraphStart, paragraphEnd).trim();

  return paragraphText ? { text: paragraphText, isCode: false } : null;
}

function buildNewNoteMarkdown(title: string, tags: string[]): string {
  const quotedTitle = quoteYamlString(title);
  const tagText = tags.length > 0 ? `[${tags.map(quoteYamlString).join(", ")}]` : "[]";
  return `---\ntitle: ${quotedTitle}\ntags: ${tagText}\ncreatedAt: ${quoteYamlString(new Date().toISOString())}\n---\n`;
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function formatWebSearchTestError(error: unknown): string {
  const message = getErrorMessage(error);
  const lower = message.toLowerCase();
  if (message.includes("429") || lower.includes("rate limit") || lower.includes("too many requests")) {
    return "搜索服务返回限流。可以稍后重试，或检查当前 Provider 的额度。";
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

function normalizeTagValue(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

function mergeTagsStable(existingTags: string[], suggestedTags: string[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const tag of [...existingTags, ...suggestedTags]) {
    const normalized = normalizeTagValue(tag);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(normalized);
  }

  return merged;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isLuoguImportCandidate(submission: PreviewLuoguSubmission): boolean {
  return submission.statusLabel === "可候选";
}

function parseLuoguSubmissionId(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLuoguLastSubmissionInput(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function getLuoguSubmissionCandidateState(
  submission: PreviewLuoguSubmission,
  submissions: PreviewLuoguSubmission[],
  rules: LuoguImportRules,
  lastSubmissionId: number | null,
  skippedIds: Set<string>,
): LuoguSubmissionCandidateState {
  if (skippedIds.has(submission.submissionId)) {
    return { canSelect: false, statusLabel: "已跳过" };
  }

  const submissionId = parseLuoguSubmissionId(submission.submissionId);
  if (lastSubmissionId !== null && submissionId !== null && submissionId <= lastSubmissionId) {
    return { canSelect: false, statusLabel: "跳过：旧提交" };
  }

  if (rules.requireAc && !submission.isAc) {
    return { canSelect: false, statusLabel: "跳过：非 AC" };
  }

  if (!submission.isAc) {
    return { canSelect: false, statusLabel: "跳过：非 AC" };
  }

  if (rules.keepLatestAcOnly) {
    const latestSameProblemAcId = submissions.reduce<number | null>((latest, item) => {
      if (!item.isAc || item.problemId !== submission.problemId) return latest;
      const itemId = parseLuoguSubmissionId(item.submissionId);
      if (itemId === null) return latest;
      return latest === null ? itemId : Math.max(latest, itemId);
    }, null);

    if (latestSameProblemAcId !== null && submissionId !== null && submissionId < latestSameProblemAcId) {
      return { canSelect: false, statusLabel: "跳过：同题旧 AC" };
    }
  }

  return {
    canSelect: isLuoguImportCandidate(submission) || submission.isAc,
    statusLabel: "可候选",
  };
}

function getLuoguImportRuleSummary(rules: LuoguImportRules): string {
  const parts = [
    rules.requireAc ? "只处理 AC" : "显示非 AC",
    rules.keepLatestAcOnly ? "同题只保留最新 AC" : "同题 AC 全部候选",
    rules.missingInsightStrategy === "draft" ? "无 insight 时生成草稿" : "无 insight 时跳过",
  ];
  return `规则：${parts.join("；")}`;
}

function getLuoguScanRangeLabel(
  mode: LuoguScanMode,
  countLimit: LuoguScanCountLimit,
  daysLimit: LuoguScanDaysLimit,
): string {
  return mode === "count" ? `最近 ${countLimit} 条` : `最近 ${daysLimit} 天`;
}

function parseLuoguSubmitTimeMs(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return null;
    const milliseconds = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    return Number.isNaN(milliseconds) ? null : milliseconds;
  }

  const normalized = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const parsed = new Date(normalized).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function getLuoguPreviewWorkflowStatusText(
  submission: PreviewLuoguSubmission,
  prepared: PrepareLuoguSubmissionNoteResult | undefined,
  prepareError: string | undefined,
  writeResult: WriteLuoguPreparedNoteResult | undefined,
  prepareStatus: LuoguPrepareItemStatus | undefined,
  currentlyPreparingId: string | null,
  currentlyWritingId: string | null,
  selectedIds: Set<string>,
  skippedIds: Set<string>,
): string {
  if (skippedIds.has(submission.submissionId)) return "已跳过";

  if (writeResult) {
    if (writeResult.skipped) return `skip: ${writeResult.skipReason ?? "no reason"}`;
    if (writeResult.failed && writeResult.relativePath && writeResult.commitStatus === "failed") {
      return `written, git commit failed: ${writeResult.error ?? "no reason"}`;
    }
    if (writeResult.failed) return `write failed: ${writeResult.error ?? "no reason"}`;
    if (writeResult.relativePath) return `written: ${writeResult.relativePath}`;
    return "written";
  }

  if (currentlyWritingId === submission.submissionId) return "writing";
  if (prepareError) return `failed: ${prepareError}`;
  if (prepared) {
    if (prepared.skipped) return `skip: ${prepared.skipReason ?? prepared.reason ?? "no reason"}`;
    if (prepared.aiStatus === "failed") return `failed: ${prepared.reason ?? "no reason"}`;
    if (prepared.existing) return "已存在：预览已生成，写入不会覆盖";
    if (prepared.draftFallback) return "draft preview ready";
    return "preview ready";
  }

  if (prepareStatus === "running") return "生成中";
  if (prepareStatus === "queued") return "等待中";
  if (prepareStatus === "stopped") return "已停止";
  if (currentlyPreparingId === submission.submissionId) return "preparing preview";
  if (selectedIds.has(submission.submissionId)) return "未生成";
  return submission.statusLabel;
}

function clampAppZoom(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  return Math.min(APP_ZOOM_MAX, Math.max(APP_ZOOM_MIN, stepped));
}

function clampContentZoom(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  return Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, stepped));
}

function clampScale(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  return Math.min(1.3, Math.max(0.9, stepped));
}

function clampFontSize(value: number): number {
  const rounded = Math.round(value);
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, rounded));
}

function clampNumberRange(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  return Math.min(max, Math.max(min, rounded));
}

function getInitialAppZoom(): number {
  const stored = window.localStorage.getItem(APP_ZOOM_STORAGE_KEY);
  if (stored === null) return APP_ZOOM_DEFAULT;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return APP_ZOOM_DEFAULT;
  return clampAppZoom(parsed);
}

function getInitialContentZoom(): number {
  const stored = window.localStorage.getItem(CONTENT_ZOOM_STORAGE_KEY);
  if (stored === null) return CONTENT_ZOOM_DEFAULT;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return CONTENT_ZOOM_DEFAULT;
  return clampContentZoom(parsed);
}

function getInitialScale(storageKey: string, fallback: number): number {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === null) return fallback;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return fallback;
  return clampScale(parsed);
}

function getInitialFontSize(storageKey: string, fallback: number): number {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === null) return fallback;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return fallback;
  return clampFontSize(parsed);
}

function getInitialNumberRange(storageKey: string, fallback: number, min: number, max: number): number {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === null) return fallback;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return fallback;
  return clampNumberRange(parsed, min, max);
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

function getInitialAiSidebarWidth(): number {
  const stored = window.localStorage.getItem(AI_SIDEBAR_WIDTH_STORAGE_KEY);
  if (stored === null) return clampAiSidebarWidth(AI_SIDEBAR_WIDTH_DEFAULT);

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return clampAiSidebarWidth(AI_SIDEBAR_WIDTH_DEFAULT);
  return clampAiSidebarWidth(parsed);
}

function clampEditorPreviewRatio(value: number, containerWidth?: number): number {
  let minRatio = EDITOR_PREVIEW_RATIO_MIN;
  let maxRatio = EDITOR_PREVIEW_RATIO_MAX;

  if (containerWidth && containerWidth > EDITOR_PREVIEW_MIN_PANE_WIDTH * 2) {
    minRatio = Math.max(minRatio, EDITOR_PREVIEW_MIN_PANE_WIDTH / containerWidth);
    maxRatio = Math.min(maxRatio, 1 - EDITOR_PREVIEW_MIN_PANE_WIDTH / containerWidth);
  }

  return Math.min(maxRatio, Math.max(minRatio, value));
}

function getInitialEditorPreviewRatio(): number {
  const stored = window.localStorage.getItem(EDITOR_PREVIEW_RATIO_STORAGE_KEY);
  if (stored === null) return EDITOR_PREVIEW_RATIO_DEFAULT;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return EDITOR_PREVIEW_RATIO_DEFAULT;
  return clampEditorPreviewRatio(parsed);
}

function isAppTheme(value: string | null): value is AppTheme {
  return value === "dark" || value === "light";
}

function getInitialAppTheme(): AppTheme {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isAppTheme(stored) ? stored : "dark";
}

function isReadingDensity(value: string | null): value is ReadingDensity {
  return value === "compact" || value === "standard" || value === "comfortable";
}

function getInitialReadingDensity(): ReadingDensity {
  const stored = window.localStorage.getItem(READING_DENSITY_STORAGE_KEY);
  return isReadingDensity(stored) ? stored : "standard";
}

function getInitialDeveloperMode(): boolean {
  return window.localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === "true";
}

function getNoteDisplayName(path: string, files: NoteFileInfo[]): string {
  const file = files.find((item) => item.path === path);
  const title = file?.displayTitle?.trim();
  if (title) return title;
  const name = file?.name ?? path.split("/").pop() ?? path;
  return name.replace(/\.md$/i, "") || path;
}

function getInitialOpenTabPaths(): string[] {
  const stored = window.localStorage.getItem(OPEN_TABS_STORAGE_KEY);
  if (stored === null) return [];

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    const paths: string[] = [];
    for (const value of parsed) {
      if (typeof value !== "string") continue;
      const path = value.trim();
      if (!path || paths.includes(path)) continue;
      paths.push(path);
    }
    return paths;
  } catch {
    return [];
  }
}

function getInitialOpenTabsActivePath(): string | null {
  const stored = window.localStorage.getItem(OPEN_TABS_ACTIVE_STORAGE_KEY);
  const path = stored?.trim();
  return path || null;
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

function SettingRow({ title, description, children, align = "center" }: { title: string; description?: ReactNode; children?: ReactNode; align?: "center" | "start" }) {
  return (
    <div className={cn(
      "grid min-w-0 gap-3 border-b border-border/60 py-3 lg:grid-cols-[minmax(220px,0.42fr)_minmax(280px,0.58fr)]",
      align === "center" ? "lg:items-center" : "lg:items-start",
    )}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description && <div className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
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

const promptEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "0",
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "var(--prompt-editor-font-size, 14px)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono)",
    lineHeight: "1.55",
    scrollbarColor: "color-mix(in oklch, var(--muted-foreground) 45%, transparent) transparent",
    scrollbarWidth: "thin",
  },
  ".cm-scroller::-webkit-scrollbar": { width: "10px", height: "10px" },
  ".cm-scroller::-webkit-scrollbar-track": { backgroundColor: "transparent" },
  ".cm-scroller::-webkit-scrollbar-thumb": {
    backgroundColor: "color-mix(in oklch, var(--muted-foreground) 30%, transparent)",
    border: "3px solid transparent",
    backgroundClip: "content-box",
  },
  ".cm-scroller::-webkit-scrollbar-thumb:hover": {
    backgroundColor: "color-mix(in oklch, var(--muted-foreground) 45%, transparent)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "1px solid color-mix(in oklch, var(--border) 28%, transparent)",
    color: "color-mix(in oklch, var(--muted-foreground) 86%, transparent)",
    fontFamily: "var(--font-mono)",
    fontSize: "calc(var(--prompt-editor-font-size, 14px) * 0.86)",
    lineHeight: "1.55",
    userSelect: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "2.35rem",
    padding: "0 0.55rem 0 0.25rem",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  ".cm-content": {
    minHeight: "100%",
    padding: "10px 14px 18px 10px",
    caretColor: "var(--foreground)",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklch, var(--muted) 18%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklch, var(--muted) 16%, transparent)",
    color: "var(--foreground)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--editor-selection-bg-unfocused, var(--muted))",
  },
  "&.cm-focused .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--editor-selection-bg, var(--accent))",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--foreground)",
  },
});

const PromptCodeEditor = forwardRef<PromptCodeEditorHandle, PromptCodeEditorProps>(function PromptCodeEditor(
  { value, fontSize, disabled = false, readOnly = false, onChange, onSave, onFontSizeChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const editableCompartmentRef = useRef(new Compartment());

  onChangeRef.current = onChange;
  onSaveRef.current = onSave;

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    hasFocus: () => viewRef.current?.hasFocus ?? false,
    insertVariable: (variableName: string) => {
      const view = viewRef.current;
      if (!view) return false;
      view.dispatch(view.state.replaceSelection(variableName));
      view.focus();
      return true;
    },
  }), []);

  useEffect(() => {
    if (!containerRef.current) return;

    const editableCompartment = editableCompartmentRef.current;
    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          markdown(),
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          EditorView.lineWrapping,
          history(),
          editableCompartment.of(EditorView.editable.of(!disabled && !readOnly)),
          Prec.highest(keymap.of([
            {
              key: "Mod-s",
              run: () => {
                onSaveRef.current();
                return true;
              },
            },
          ])),
          keymap.of(historyKeymap),
          EditorView.domEventHandlers({
            keydown(event) {
              event.stopPropagation();
              return false;
            },
          }),
          EditorView.updateListener.of((update: ViewUpdate) => {
            if (!update.docChanged) return;
            const nextValue = update.state.doc.toString();
            valueRef.current = nextValue;
            onChangeRef.current(nextValue);
          }),
          promptEditorTheme,
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: editableCompartmentRef.current.reconfigure(EditorView.editable.of(!disabled && !readOnly)),
    });
  }, [disabled, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === valueRef.current) return;
    valueRef.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

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

  return (
    <div
      ref={containerRef}
      className={cn("prompt-code-editor h-full min-h-0 w-full", (disabled || readOnly) && "opacity-70")}
      style={{ "--prompt-editor-font-size": `${fontSize}px` } as CSSProperties}
      onWheelCapture={handleWheelCapture}
    />
  );
});

function getPromptUsageInfo(fileName: string): PromptUsageInfo {
  if (fileName === "luogu-insight.md") {
    return {
      title: "洛谷 insight 整理",
      scope: "洛谷同步、洛谷导入后的 AI 整理",
      purpose: "用于把洛谷提交里的候选 insight、trick、坑点或总结整理成结构化笔记。",
      variables: [
        { name: "{{problem_id}}", meaning: "识别到的洛谷题号。", usage: "在模板中写入该变量，执行整理时会替换成题号。" },
        { name: "{{problem_title}}", meaning: "识别到的题目标题。", usage: "适合放在题目背景或输出格式要求里。" },
        { name: "{{submission_id}}", meaning: "当前洛谷提交记录 ID。", usage: "用于让 AI 知道这次整理来自哪条提交。" },
        { name: "{{candidate_comment}}", meaning: "从提交备注或上下文里提取出的候选 insight。", usage: "通常应保留在正文输入区，AI 会基于它判断是否值得导入。" },
      ],
      editable: true,
    };
  }

  if (fileName === "note-metadata.md") {
    return {
      title: "当前笔记元数据",
      scope: "AI 生成标题、标签、摘要建议",
      purpose: "用于根据当前笔记正文生成 title、tags、summary 等元信息建议。",
      variables: [
        { name: "{{note_path}}", meaning: "当前笔记的相对路径。", usage: "在模板中写入该变量，执行时会替换为 notes 内的相对路径。" },
        { name: "{{content}}", meaning: "当前笔记完整 Markdown 内容。", usage: "用于让 AI 根据正文生成标题、标签和摘要。" },
      ],
      editable: true,
    };
  }

  if (fileName === "note-polish.md") {
    return {
      title: "当前笔记全文润色",
      scope: "AI 润色正文、题解格式化审核",
      purpose: "用于润色当前笔记正文 body，并先生成可预览的润色结果。",
      variables: [
        { name: "{{note_path}}", meaning: "当前笔记的相对路径。", usage: "可用于提示 AI 保持与当前文件主题一致。" },
        { name: "{{body}}", meaning: "去掉 frontmatter 后的正文 Markdown。", usage: "用于让 AI 只润色正文，不改动 frontmatter。" },
      ],
      editable: true,
    };
  }

  return {
    title: "自定义 Prompt 模板",
    scope: "对应 AI 功能",
    purpose: "用于配置本地 AI Prompt 模板。",
    variables: [],
    editable: true,
  };
}

const PROMPT_STYLE_PLACEHOLDER: PromptUsageInfo = {
  title: "NoteX 回答风格",
  scope: "全局回答语气",
  purpose: "通用语气、报告味和回答风格后续会作为独立模板接入；不会散落到每个任务 Prompt。",
  variables: [],
  editable: false,
};

interface LoadedMarkdownParts {
  frontmatterPrefix: string;
  body: string;
  warning: string | null;
}

interface SavedNoteSnapshot {
  path: string | null;
  frontmatterPrefix: string;
  markdown: string;
}

interface SearchResultItem {
  path: string;
  title: string;
  category: string;
  modified: string;
  tags: string[];
  summary: string;
  excerpt: string;
  score: number;
  source: "backend" | "local";
}

function splitLoadedMarkdown(markdown: string): LoadedMarkdownParts {
  const split = splitFrontmatter(markdown);

  if (split.kind === "found") {
    return {
      frontmatterPrefix: markdown.slice(0, markdown.length - split.body.length),
      body: split.body,
      warning: null,
    };
  }

  if (split.kind === "unclosed") {
    return {
      frontmatterPrefix: "",
      body: markdown,
      warning: "frontmatter 缺少闭合 ---，已作为正文载入以避免丢数据",
    };
  }

  return {
    frontmatterPrefix: "",
    body: split.body,
    warning: null,
  };
}

function combineMarkdown(frontmatterPrefix: string, body: string): string {
  return `${frontmatterPrefix}${body}`;
}

function isSnapshotDirty(
  snapshot: SavedNoteSnapshot,
  path: string | null,
  nextFrontmatterPrefix: string,
  nextMarkdown: string,
): boolean {
  if (path === null) return false;
  return (
    snapshot.path !== path ||
    snapshot.frontmatterPrefix !== nextFrontmatterPrefix ||
    snapshot.markdown !== nextMarkdown
  );
}

function formatSearchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, "");
}

function splitSearchTokens(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map(normalizeSearchText)
    .filter(Boolean);
}

function scoreSubsequence(needle: string, haystack: string): number {
  if (!needle || !haystack) return 0;

  let needleIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (let haystackIndex = 0; haystackIndex < haystack.length && needleIndex < needle.length; haystackIndex += 1) {
    if (haystack[haystackIndex] !== needle[needleIndex]) continue;

    if (firstMatch === -1) firstMatch = haystackIndex;
    lastMatch = haystackIndex;
    needleIndex += 1;
  }

  if (needleIndex !== needle.length) return 0;

  const span = Math.max(lastMatch - firstMatch + 1, needle.length);
  const compactness = needle.length / span;
  const earlyBonus = firstMatch === 0 ? 0.18 : 0;
  return 0.45 + compactness * 0.35 + earlyBonus;
}

function scoreSearchField(token: string, value: string, weight: number): number {
  const normalizedValue = normalizeSearchText(value);
  if (!token || !normalizedValue) return 0;

  const index = normalizedValue.indexOf(token);
  if (index >= 0) {
    const earlyBonus = index === 0 ? 0.25 : 0;
    const coverageBonus = Math.min(token.length / normalizedValue.length, 0.35);
    return weight * (1.15 + earlyBonus + coverageBonus);
  }

  return weight * scoreSubsequence(token, normalizedValue);
}

function toSearchResultItem(result: NoteSearchResult): SearchResultItem {
  return {
    path: result.path,
    title: result.title || result.path.split("/").pop()?.replace(/\.md$/i, "") || result.path,
    category: getDashboardNoteCategory(result.path),
    modified: result.date,
    tags: result.tags,
    summary: result.summary,
    excerpt: result.excerpt,
    score: 0,
    source: "backend",
  };
}

function buildLocalSearchResults(files: NoteFileInfo[], query: string): SearchResultItem[] {
  const tokens = splitSearchTokens(query);
  const sortedByModified = [...files].sort(
    (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime(),
  );

  if (tokens.length === 0) {
    return sortedByModified.slice(0, 30).map((file) => ({
      path: file.path,
      title: file.name.replace(/\.md$/i, ""),
      category: getDashboardNoteCategory(file.path),
      modified: file.modified,
      tags: [],
      summary: "",
      excerpt: "",
      score: 0,
      source: "local",
    }));
  }

  return sortedByModified
    .map((file): SearchResultItem | null => {
      const title = file.name.replace(/\.md$/i, "");
      const category = getDashboardNoteCategory(file.path);
      const fields = [
        { value: title, weight: 120 },
        { value: file.name, weight: 95 },
        { value: category, weight: 70 },
        { value: file.path, weight: 55 },
      ];

      let score = 0;
      for (const token of tokens) {
        const tokenScore = Math.max(...fields.map((field) => scoreSearchField(token, field.value, field.weight)));
        if (tokenScore <= 0) return null;
        score += tokenScore;
      }

      return {
        path: file.path,
        title,
        category,
        modified: file.modified,
        tags: [],
        summary: "",
        excerpt: "",
        score,
        source: "local",
      } satisfies SearchResultItem;
    })
    .filter((result): result is SearchResultItem => result !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.modified).getTime() - new Date(a.modified).getTime();
    })
    .slice(0, 50);
}

function getDashboardNoteCategory(path: string): string {
  const [topLevel] = path.split("/");
  if (!topLevel || topLevel === path) return "notes";

  switch (topLevel) {
    case "tricks":
      return "tricks";
    case "problems":
      return "problems";
    case "luogu":
      return "luogu";
    case "inbox":
      return "inbox";
    default:
      return topLevel;
  }
}

export default function App() {
  const [files, setFiles] = useState<NoteFileInfo[]>([]);
  const [hasLoadedNotes, setHasLoadedNotes] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [openTabPaths, setOpenTabPaths] = useState<string[]>(getInitialOpenTabPaths);
  const [openReviewTabs, setOpenReviewTabs] = useState<PolishReviewTab[]>([]);
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState<WorkspaceTabId | null>(null);
  // null 时显示欢迎内容，选中文件后只把正文 body 放进主编辑器。
  const [markdown, setMarkdown] = useState(INITIAL_MARKDOWN);
  const [frontmatterPrefix, setFrontmatterPrefix] = useState("");
  const [isFrontmatterOpen, setIsFrontmatterOpen] = useState(false);
  const [editorViewMode, setEditorViewMode] = useState<EditorViewMode>("split");
  const [isNotesSidebarOpen, setIsNotesSidebarOpen] = useState(true);
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [isAiSidebarMaximized, setIsAiSidebarMaximized] = useState(false);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(() =>
    getInitialNumberRange(
      LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
      LEFT_SIDEBAR_WIDTH_DEFAULT,
      LEFT_SIDEBAR_WIDTH_MIN,
      LEFT_SIDEBAR_WIDTH_MAX,
    ),
  );
  const [aiSidebarWidth, setAiSidebarWidth] = useState(getInitialAiSidebarWidth);
  const [editorPreviewRatio, setEditorPreviewRatio] = useState(getInitialEditorPreviewRatio);
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandleId | null>(null);
  const [editorSelectedText, setEditorSelectedText] = useState("");
  const [editorSelectedTextLength, setEditorSelectedTextLength] = useState<number | null>(null);
  const [editorCursorOffset, setEditorCursorOffset] = useState<number | null>(null);
  const [aiContextSelectionRange, setAiContextSelectionRange] = useState<MarkdownEditorSelectionRange | null>(null);
  const [appTheme, setAppTheme] = useState<AppTheme>(getInitialAppTheme);
  const [appZoom, setAppZoom] = useState(getInitialAppZoom);
  const [contentZoom, setContentZoom] = useState(getInitialContentZoom);
  const [uiScale, setUiScale] = useState(() => getInitialScale(UI_SCALE_STORAGE_KEY, UI_SCALE_DEFAULT));
  const [editorFontSize, setEditorFontSize] = useState(() =>
    getInitialFontSize(EDITOR_FONT_SIZE_STORAGE_KEY, EDITOR_FONT_SIZE_DEFAULT),
  );
  const [previewFontSize, setPreviewFontSize] = useState(() =>
    getInitialFontSize(PREVIEW_FONT_SIZE_STORAGE_KEY, PREVIEW_FONT_SIZE_DEFAULT),
  );
  const [readingDensity, setReadingDensity] = useState<ReadingDensity>(getInitialReadingDensity);
  const [toolbarFontSize, setToolbarFontSize] = useState(() =>
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
  const [markdownToolbarApi, setMarkdownToolbarApi] = useState<MarkdownEditorToolbarApi | null>(null);
  const editorPreviewContainerRef = useRef<HTMLDivElement | null>(null);
  const editorScrollApiRef = useRef<MarkdownEditorScrollApi | null>(null);
  const previewScrollApiRef = useRef<MarkdownPreviewScrollApi | null>(null);
  const scrollSyncRafRef = useRef<number | null>(null);
  const scrollSyncSuppressRafRef = useRef<number | null>(null);
  const suppressedScrollPaneRef = useRef<"editor" | "preview" | null>(null);
  const syncEditorPreviewScroll = useCallback((source: "editor" | "preview", ratio: number) => {
    if (suppressedScrollPaneRef.current === source) return;

    if (scrollSyncRafRef.current !== null) {
      window.cancelAnimationFrame(scrollSyncRafRef.current);
    }

    scrollSyncRafRef.current = window.requestAnimationFrame(() => {
      scrollSyncRafRef.current = null;

      const targetPane = source === "editor" ? "preview" : "editor";
      const targetApi = source === "editor" ? previewScrollApiRef.current : editorScrollApiRef.current;
      if (!targetApi) return;

      suppressedScrollPaneRef.current = targetPane;
      targetApi.scrollToRatio(ratio);

      if (scrollSyncSuppressRafRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncSuppressRafRef.current);
      }
      scrollSyncSuppressRafRef.current = window.requestAnimationFrame(() => {
        scrollSyncSuppressRafRef.current = null;
        if (suppressedScrollPaneRef.current === targetPane) {
          suppressedScrollPaneRef.current = null;
        }
      });
    });
  }, []);

  useEffect(() => {
    setEditorSelectedText("");
    setEditorSelectedTextLength(null);
    setEditorCursorOffset(null);
    setAiContextSelectionRange(null);
  }, [currentFilePath]);

  const beginColumnResize = useCallback((handleId: ResizeHandleId, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    const startX = event.clientX;
    const startLeftSidebarWidth = leftSidebarWidth;
    const startAiSidebarWidth = aiSidebarWidth;
    const editorPreviewRect = editorPreviewContainerRef.current?.getBoundingClientRect() ?? null;

    setActiveResizeHandle(handleId);
    document.body.classList.add("app-column-resizing");

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
        setAiSidebarWidth(clampAiSidebarWidth(startAiSidebarWidth + startX - moveEvent.clientX));
        return;
      }

      if (!editorPreviewRect) return;
      const rawRatio = (moveEvent.clientX - editorPreviewRect.left) / editorPreviewRect.width;
      setEditorPreviewRatio(clampEditorPreviewRatio(rawRatio, editorPreviewRect.width));
    };

    const stopResize = () => {
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
  useEffect(() => {
    return () => {
      if (scrollSyncRafRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncRafRef.current);
      }
      if (scrollSyncSuppressRafRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncSuppressRafRef.current);
      }
    };
  }, []);
  const [isDirty, setIsDirty] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [newNoteLocationOption, setNewNoteLocationOption] = useState<NoteLocationOptionId>("current");
  const [newNoteCustomDirectory, setNewNoteCustomDirectory] = useState("");
  const [newNoteTags, setNewNoteTags] = useState<string[]>([]);
  const [folderParentDirectory, setFolderParentDirectory] = useState("");
  const [returnToCreateAfterFolder, setReturnToCreateAfterFolder] = useState(false);
  const [activeTreeDirectoryPath, setActiveTreeDirectoryPath] = useState<string | null>(null);
  const [activeTreeFilePath, setActiveTreeFilePath] = useState<string | null>(null);
  const [isTreeRootCollapsed, setIsTreeRootCollapsed] = useState(false);
  const [createFolderRequest, setCreateFolderRequest] = useState<{ parentPath: string; requestId: number } | null>(null);
  const [displayTitleByPath, setDisplayTitleByPath] = useState<Record<string, string>>({});
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameTargetIsDirectory, setRenameTargetIsDirectory] = useState(false);
  const [isRestartingBlog, setIsRestartingBlog] = useState(false);
  const [isPushingGit, setIsPushingGit] = useState(false);
  const [isLuoguDialogOpen, setIsLuoguDialogOpen] = useState(false);
  const [isLuoguSettingsOpen, setIsLuoguSettingsOpen] = useState(false);
  const [isLoadingLuoguConfig, setIsLoadingLuoguConfig] = useState(false);
  const [isSavingLuoguConfig, setIsSavingLuoguConfig] = useState(false);
  const [isTestingLuoguConnection, setIsTestingLuoguConnection] = useState(false);
  const [luoguConnectionResult, setLuoguConnectionResult] = useState<TestLuoguConnectionResult | null>(null);
  const [isScanningLuoguPreview, setIsScanningLuoguPreview] = useState(false);
  const [luoguPreviewResult, setLuoguPreviewResult] = useState<PreviewLuoguSubmissionsResult | null>(null);
  const [luoguScanMode, setLuoguScanMode] = useState<LuoguScanMode>("count");
  const [luoguScanCountLimit, setLuoguScanCountLimit] = useState<LuoguScanCountLimit>(20);
  const [luoguScanDaysLimit, setLuoguScanDaysLimit] = useState<LuoguScanDaysLimit>(30);
  const [luoguImportRules, setLuoguImportRules] = useState<LuoguImportRules>(DEFAULT_LUOGU_IMPORT_RULES);
  const [luoguScanProgress, setLuoguScanProgress] = useState<LuoguScanProgress | null>(null);
  const [luoguScanSummary, setLuoguScanSummary] = useState<LuoguScanSummary | null>(null);
  const [selectedLuoguSubmissionIds, setSelectedLuoguSubmissionIds] = useState<Set<string>>(() => new Set());
  const [skippedLuoguSubmissionIds, setSkippedLuoguSubmissionIds] = useState<Set<string>>(() => new Set());
  const [isPreparingSelectedLuogu, setIsPreparingSelectedLuogu] = useState(false);
  const [luoguPreparedNotesById, setLuoguPreparedNotesById] = useState<Record<string, PrepareLuoguSubmissionNoteResult>>({});
  const [luoguPrepareErrorsById, setLuoguPrepareErrorsById] = useState<Record<string, string>>({});
  const [luoguPrepareStatusesById, setLuoguPrepareStatusesById] = useState<Record<string, LuoguPrepareItemStatus>>({});
  const [currentlyPreparingLuoguId, setCurrentlyPreparingLuoguId] = useState<string | null>(null);
  const [luoguPrepareProgress, setLuoguPrepareProgress] = useState<{ current: number; total: number } | null>(null);
  const [isStoppingLuoguPrepare, setIsStoppingLuoguPrepare] = useState(false);
  const [isWritingPreparedLuogu, setIsWritingPreparedLuogu] = useState(false);
  const [luoguWriteResultsById, setLuoguWriteResultsById] = useState<Record<string, WriteLuoguPreparedNoteResult>>({});
  const [currentlyWritingLuoguId, setCurrentlyWritingLuoguId] = useState<string | null>(null);
  const [luoguWriteProgress, setLuoguWriteProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeLuoguPreparedPreviewId, setActiveLuoguPreparedPreviewId] = useState<string | null>(null);
  const [activeLuoguPreviewDetailTab, setActiveLuoguPreviewDetailTab] = useState<LuoguPreviewDetailTab>("rendered");
  const [luoguImportCenterTab, setLuoguImportCenterTab] = useState<LuoguImportCenterTab>("scan");
  const [luoguImportStep, setLuoguImportStep] = useState<LuoguImportStep>("scan");
  const [isSyncingLuogu, setIsSyncingLuogu] = useState(false);
  const [luoguSyncResult, setLuoguSyncResult] = useState<SyncLuoguInsightsResult | null>(null);
  const [luoguConfigUid, setLuoguConfigUid] = useState("");
  const [luoguConfigClientId, setLuoguConfigClientId] = useState("");
  const [luoguConfigLastSubmissionId, setLuoguConfigLastSubmissionId] = useState("");
  const [luoguConfigAiConfigured, setLuoguConfigAiConfigured] = useState(false);
  const [isUpdatingLuoguLastSubmissionId, setIsUpdatingLuoguLastSubmissionId] = useState(false);
  const [isLoadingAiConfig, setIsLoadingAiConfig] = useState(false);
  const [isSavingAiConfig, setIsSavingAiConfig] = useState(false);
  const [isTestingWebSearchConnection, setIsTestingWebSearchConnection] = useState(false);
  const [webSearchConnectionMessage, setWebSearchConnectionMessage] = useState<string | null>(null);
  const [isClearingWebCache, setIsClearingWebCache] = useState(false);
  const [webCacheMessage, setWebCacheMessage] = useState<string | null>(null);
  const [localIndexStatus, setLocalIndexStatus] = useState<LocalNoteIndexStatusResult | null>(null);
  const [isLoadingLocalIndexStatus, setIsLoadingLocalIndexStatus] = useState(false);
  const [isRebuildingLocalIndex, setIsRebuildingLocalIndex] = useState(false);
  const [localIndexMessage, setLocalIndexMessage] = useState<string | null>(null);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [aiConfigDraft, setAiConfigDraft] = useState<AiConfig | null>(null);
  const [selectedAiProviderId, setSelectedAiProviderId] = useState("");
  const [aiManualModelId, setAiManualModelId] = useState("");
  const [aiModelSearchQuery, setAiModelSearchQuery] = useState("");
  const [aiProviderBusyId, setAiProviderBusyId] = useState<string | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateSummary[]>([]);
  const [selectedPromptFileName, setSelectedPromptFileName] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAdvancedActionsOpen, setIsAdvancedActionsOpen] = useState(false);
  const [activeSettingsTarget, setActiveSettingsTarget] = useState<SettingsTarget>({ type: "category", category: "appearance" });
  const [settingsView, setSettingsView] = useState<SettingsView>("main");
  const [settingsCenterRect, setSettingsCenterRect] = useState<SettingsCenterRect>(getDefaultSettingsCenterRect);
  const [isSettingsCenterMaximized, setIsSettingsCenterMaximized] = useState(false);
  const [isPolishingPrompt, setIsPolishingPrompt] = useState(false);
  const [promptPolishMessage, setPromptPolishMessage] = useState<string | null>(null);
  const [promptEditorFontSize, setPromptEditorFontSize] = useState(PROMPT_EDITOR_FONT_SIZE_DEFAULT);
  const [promptEditorReturnTarget, setPromptEditorReturnTarget] = useState<SettingsTarget | null>(null);
  const [expandedSettingsGroups, setExpandedSettingsGroups] = useState<Record<string, boolean>>({});
  const [developerModeEnabled, setDeveloperModeEnabled] = useState(getInitialDeveloperMode);
  const [searchQuery, setSearchQuery] = useState("");
  const [backendSearchResults, setBackendSearchResults] = useState<NoteSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingFileSelection, setPendingFileSelection] = useState<{ path: string; closeSearchOnSuccess: boolean } | null>(null);
  const [isImportingLuogu, setIsImportingLuogu] = useState(false);
  const [hasLoadedAiConfigStatus, setHasLoadedAiConfigStatus] = useState(false);
  const [hasLoadedLuoguConfigStatus, setHasLoadedLuoguConfigStatus] = useState(false);
  const [luoguProblemId, setLuoguProblemId] = useState("");
  const [luoguProblemTitle, setLuoguProblemTitle] = useState("");
  const [luoguSubmissionId, setLuoguSubmissionId] = useState("");
  const [luoguSourceCode, setLuoguSourceCode] = useState("");
  const [pendingAssetsByFile, setPendingAssetsByFile] = useState<Record<string, string[]>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const settingsContentRef = useRef<HTMLDivElement>(null);
  const settingsCenterPanelRef = useRef<HTMLDivElement>(null);
  const promptEditorRef = useRef<PromptCodeEditorHandle>(null);
  const promptEditorHadFocusBeforeVariableClickRef = useRef(false);
  const settingsCenterRestoreRectRef = useRef<SettingsCenterRect | null>(null);
  const promptPolishRunRef = useRef(0);
  const searchRequestSeqRef = useRef(0);
  const luoguPrepareRunSeqRef = useRef(0);
  const luoguPrepareRunRef = useRef<{ id: number; cancelled: boolean }>({ id: 0, cancelled: false });
  const isMountedRef = useRef(true);
  const initialOpenTabsActivePathRef = useRef<string | null>(getInitialOpenTabsActivePath());
  const hasRestoredOpenTabsRef = useRef(false);
  const skipNextReadForPathRef = useRef<string | null>(null);
  const savedSnapshotRef = useRef<SavedNoteSnapshot>({
    path: null,
    frontmatterPrefix: "",
    markdown: INITIAL_MARKDOWN,
  });
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      luoguPrepareRunRef.current.cancelled = true;
    };
  }, []);
  useEffect(() => {
    setEditorSelectedTextLength(null);
  }, [currentFilePath, editorViewMode]);
  const fullMarkdown = useMemo(
    () => (currentFilePath === null ? markdown : combineMarkdown(frontmatterPrefix, markdown)),
    [currentFilePath, frontmatterPrefix, markdown],
  );
  const bodyStartLine = 1;
  const frontmatter = useMemo(() => parseFrontmatterFields(fullMarkdown), [fullMarkdown]);
  const luoguRuleSummary = useMemo(
    () => getLuoguImportRuleSummary(luoguImportRules),
    [luoguImportRules],
  );
  const luoguSubmissionCandidateStates = useMemo(() => {
    const submissions = luoguPreviewResult?.submissions ?? [];
    return Object.fromEntries(
      submissions.map((submission) => [
        submission.submissionId,
        getLuoguSubmissionCandidateState(
          submission,
          submissions,
          luoguImportRules,
          luoguPreviewResult?.lastSubmissionId ?? null,
          skippedLuoguSubmissionIds,
        ),
      ]),
    ) as Record<string, LuoguSubmissionCandidateState>;
  }, [luoguImportRules, luoguPreviewResult, skippedLuoguSubmissionIds]);
  const luoguCurrentCandidateCount = Object.values(luoguSubmissionCandidateStates).filter(
    (state) => state.canSelect,
  ).length;
  const luoguSelectableSubmissionIds = useMemo(
    () =>
      luoguPreviewResult?.submissions
        .filter((submission) => luoguSubmissionCandidateStates[submission.submissionId]?.canSelect)
        .map((submission) => submission.submissionId) ?? [],
    [luoguPreviewResult, luoguSubmissionCandidateStates],
  );
  const selectedLuoguImportCount = selectedLuoguSubmissionIds.size;
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
  const preparedLuoguNotes = Object.values(luoguPreparedNotesById).filter(
    (prepared) => !prepared.skipped && prepared.markdown.trim() !== "" && prepared.suggestedRelativePath.trim() !== "",
  );
  const writableLuoguPreparedNotes = preparedLuoguNotes.filter(
    (prepared) => selectedLuoguSubmissionIds.has(prepared.submissionId) && !luoguWriteResultsById[prepared.submissionId],
  );
  const hasReusableLuoguPreparedPreview = (submissionId: string): boolean => {
    const prepared = luoguPreparedNotesById[submissionId];
    return Boolean(prepared && !prepared.skipped && prepared.markdown.trim() !== "" && prepared.suggestedRelativePath.trim() !== "");
  };
  const luoguWorkflowStepIndex =
    luoguImportCenterTab !== "scan"
      ? 0
      : luoguImportStep === "preview"
        ? isWritingPreparedLuogu || luoguWriteProgress
          ? 4
          : 3
        : luoguPrepareProgress || preparedLuoguNotes.length > 0
          ? 2
          : selectedLuoguImportCount > 0
            ? 1
            : 0;
  const selectedLuoguPreviewSubmissions = useMemo(
    () => luoguPreviewResult?.submissions.filter((submission) => selectedLuoguSubmissionIds.has(submission.submissionId)) ?? [],
    [luoguPreviewResult, selectedLuoguSubmissionIds],
  );
  const luoguPrepareQueueSubmissions = useMemo(
    () =>
      selectedLuoguPreviewSubmissions.filter((submission) => {
        const candidateState = luoguSubmissionCandidateStates[submission.submissionId];
        return (
          candidateState?.canSelect &&
          !skippedLuoguSubmissionIds.has(submission.submissionId) &&
          !hasReusableLuoguPreparedPreview(submission.submissionId)
        );
      }),
    [selectedLuoguPreviewSubmissions, luoguSubmissionCandidateStates, skippedLuoguSubmissionIds, luoguPreparedNotesById],
  );
  const luoguReusablePreviewCount = selectedLuoguPreviewSubmissions.filter((submission) =>
    hasReusableLuoguPreparedPreview(submission.submissionId),
  ).length;
  const luoguIgnoredPreviewSubmissions = useMemo(
    () =>
      (luoguPreviewResult?.submissions ?? []).filter((submission) => {
        const isSelected = selectedLuoguSubmissionIds.has(submission.submissionId);
        const isExplicitlySkipped = skippedLuoguSubmissionIds.has(submission.submissionId);
        const candidateState = luoguSubmissionCandidateStates[submission.submissionId];
        const prepared = luoguPreparedNotesById[submission.submissionId];
        const prepareStatus = luoguPrepareStatusesById[submission.submissionId];
        return (
          (isSelected || isExplicitlySkipped || Boolean(prepared?.skipped) || prepareStatus === "stopped") &&
          (isExplicitlySkipped || prepared?.skipped || prepareStatus === "stopped" || !candidateState?.canSelect)
        );
      }),
    [
      luoguPreviewResult,
      luoguSubmissionCandidateStates,
      luoguPreparedNotesById,
      luoguPrepareStatusesById,
      selectedLuoguSubmissionIds,
      skippedLuoguSubmissionIds,
    ],
  );
  const luoguFailedPreviewSubmissions = useMemo(
    () =>
      selectedLuoguPreviewSubmissions.filter((submission) => {
        const prepared = luoguPreparedNotesById[submission.submissionId];
        return Boolean(luoguPrepareErrorsById[submission.submissionId] || prepared?.aiStatus === "failed");
      }),
    [selectedLuoguPreviewSubmissions, luoguPreparedNotesById, luoguPrepareErrorsById],
  );
  const luoguReadyPreviewSubmissions = useMemo(
    () =>
      selectedLuoguPreviewSubmissions.filter((submission) => {
        const prepared = luoguPreparedNotesById[submission.submissionId];
        return Boolean(
          prepared &&
            !prepared.skipped &&
            prepared.aiStatus !== "failed" &&
            prepared.markdown.trim() !== "" &&
            prepared.suggestedRelativePath.trim() !== "",
        );
      }),
    [selectedLuoguPreviewSubmissions, luoguPreparedNotesById],
  );
  const currentlyPreparingLuoguSubmission = useMemo(
    () => selectedLuoguPreviewSubmissions.find((submission) => submission.submissionId === currentlyPreparingLuoguId) ?? null,
    [currentlyPreparingLuoguId, selectedLuoguPreviewSubmissions],
  );
  const activeLuoguPreparedPreviewCandidate =
    activeLuoguPreparedPreviewId && luoguReadyPreviewSubmissions.some((submission) => submission.submissionId === activeLuoguPreparedPreviewId)
      ? luoguPreparedNotesById[activeLuoguPreparedPreviewId]
      : undefined;
  const activeLuoguPreparedPreview =
    activeLuoguPreparedPreviewCandidate ??
    (luoguReadyPreviewSubmissions[0] ? luoguPreparedNotesById[luoguReadyPreviewSubmissions[0].submissionId] : undefined) ??
    null;

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
  const hasAiConfigDraftChanges =
    aiConfigDraft !== null &&
    aiConfig !== null &&
    getAiConfigComparable(aiConfigDraft) !== getAiConfigComparable(aiConfig);
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
  const aiProviderBusy = aiProviderBusyId !== null;
  const luoguConfigured =
    luoguConfigUid.trim() !== "" &&
    luoguConfigClientId.trim() !== "";
  const saveStatusLabel =
    currentFilePath === null ? "未选择文件" : isSavingNote ? "保存中" : isDirty ? "未保存" : "已保存";
  const blogStatusLabel = isRestartingBlog ? "重启中" : "打开 / 重启";
  const aiStatusLabel =
    !hasLoadedAiConfigStatus || isLoadingAiConfig ? "读取中" : aiConfigured ? "已配置" : "未配置";
  const luoguStatusLabel =
    !hasLoadedLuoguConfigStatus || isLoadingLuoguConfig ? "读取中" : luoguConfigured ? "已配置" : "未配置";
  const gitStatusLabel = isPushingGit ? "同步中" : "同步入口";
  const visibleSettingsTree = useMemo(
    () => SETTINGS_TREE.filter((group) => developerModeEnabled || !group.developerOnly),
    [developerModeEnabled],
  );
  const visibleSettingsSectionIds = useMemo(
    () => new Set(visibleSettingsTree.flatMap((group) => group.children.map((child) => child.id))),
    [visibleSettingsTree],
  );
  const visibleSettingsCategoryIds = useMemo(
    () => new Set(visibleSettingsTree.map((group) => group.id)),
    [visibleSettingsTree],
  );
  const activeSettingsGroupId = useMemo<SettingsGroupId>(() => {
    return activeSettingsTarget.type === "category"
      ? activeSettingsTarget.category
      : SETTINGS_SECTION_LABELS[activeSettingsTarget.page]?.groupId ?? "appearance";
  }, [activeSettingsTarget]);
  const activeSettingsLabel = useMemo(() => {
    if (activeSettingsTarget.type === "category") {
      return { group: SETTINGS_CATEGORY_LABELS[activeSettingsTarget.category] ?? "设置", section: "" };
    }
    const label = SETTINGS_SECTION_LABELS[activeSettingsTarget.page] ?? SETTINGS_SECTION_LABELS["appearance-theme"];
    return { group: label.group, section: label.section };
  }, [activeSettingsTarget]);
  const activeSettingsPageKey = activeSettingsTarget.type === "page" ? activeSettingsTarget.page : null;
  const shouldRenderSettingsPage = (pageKey: SettingsSection): boolean => {
    if (activeSettingsTarget.type === "page") return activeSettingsTarget.page === pageKey;
    return SETTINGS_SECTION_LABELS[pageKey]?.groupId === activeSettingsTarget.category;
  };
  const settingsPageSectionClass = cn(
    "grid min-w-0 gap-0 px-6 py-5",
    activeSettingsTarget.type === "category" && "border-b border-border/70 last:border-b-0",
  );
  useEffect(() => {
    const localNotesVisible =
      activeSettingsTarget.type === "page"
        ? activeSettingsTarget.page === "ai-local-notes"
        : activeSettingsTarget.category === "ai";
    if (!localNotesVisible || localIndexStatus || isLoadingLocalIndexStatus || isRebuildingLocalIndex) return;
    void refreshLocalIndexStatus();
  }, [activeSettingsTarget, isLoadingLocalIndexStatus, isRebuildingLocalIndex, localIndexStatus]);
  const promptTemplateRows = useMemo(
    () => promptTemplates.map((prompt) => ({
      ...prompt,
      usage: getPromptUsageInfo(prompt.fileName),
    })),
    [promptTemplates],
  );
  const editorViewModeLabel =
    editorViewMode === "split" ? "双栏" : editorViewMode === "editor" ? "仅编辑" : "仅预览";
  const activeActivityItem: ActivityBarItem | null =
    isAdvancedActionsOpen
      ? "settings"
      : isLuoguDialogOpen
        ? "luogu"
        : isRestartingBlog
          ? "blog"
          : isSearchOpen
            ? "search"
            : isNotesSidebarOpen
              ? "notes"
              : null;
  const isAiActivityActive = isAiSidebarOpen || (isAdvancedActionsOpen && activeSettingsGroupId === "ai");
  const appZoomLabel = `${Math.round(appZoom * 100)}%`;
  const contentZoomLabel = `${Math.round(contentZoom * 100)}%`;
  const uiScaleLabel = `${Math.round(uiScale * 100)}%`;
  const selectedPromptUsage = useMemo(
    () => getPromptUsageInfo(selectedPromptFileName),
    [selectedPromptFileName],
  );
  const chromeZoom = 1 + (appZoom - 1) * 0.45;
  const appThemeLabel = appTheme === "dark" ? "黑色主题" : "白色主题";
  const activeReadingDensity =
    READING_DENSITY_OPTIONS.find((option) => option.id === readingDensity) ?? READING_DENSITY_OPTIONS[1];
  const appearanceStyle = {
    "--app-zoom": appZoom,
    "--chrome-zoom": chromeZoom,
    "--md-content-zoom": contentZoom,
    "--app-ui-scale": uiScale,
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
  const settingsCenterMinSize = {
    width: Math.min(SETTINGS_CENTER_MIN_WIDTH, settingsCenterMaxSize.width),
    height: Math.min(SETTINGS_CENTER_MIN_HEIGHT, settingsCenterMaxSize.height),
  };
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
  const dashboardNotes = useMemo(
    () =>
      [...files]
        .filter((file) => !file.isDirectory)
        .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
        .slice(0, 6),
    [files],
  );
  const noteFiles = useMemo(() => files.filter((file) => !file.isDirectory), [files]);
  const displayFiles = useMemo<NoteFileInfo[]>(
    () =>
      files.map((file) => ({
        ...file,
        displayTitle: file.isDirectory ? undefined : displayTitleByPath[file.path]?.trim() || undefined,
      })),
    [displayTitleByPath, files],
  );
  const activeNoteFile = useMemo(
    () => displayFiles.find((file) => !file.isDirectory && file.path === currentFilePath) ?? null,
    [displayFiles, currentFilePath],
  );
  const noteDirectories = useMemo(
    () => files.filter((file) => file.isDirectory).map((file) => file.path).sort((a, b) => a.localeCompare(b, "zh-CN", { sensitivity: "base" })),
    [files],
  );
  const currentNoteDirectory = useMemo(() => {
    if (!currentFilePath || !currentFilePath.includes("/")) return "";
    return currentFilePath.slice(0, currentFilePath.lastIndexOf("/"));
  }, [currentFilePath]);
  const openTabs = useMemo<OpenFileTab[]>(
    () =>
      openTabPaths.map((path) => ({
        kind: "file",
        path,
        displayName: getNoteDisplayName(path, displayFiles),
        dirty: path === currentFilePath && isDirty,
      })),
    [currentFilePath, displayFiles, isDirty, openTabPaths],
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
    () => currentFilePath === null ? null : extractCursorParagraph(markdown, editorCursorOffset),
    [currentFilePath, editorCursorOffset, markdown],
  );
  const aiSidebarContext = useMemo<AiSidebarNoteContext>(() => {
    const fallbackTitle = activeNoteFile?.name.replace(/\.md$/i, "") ?? currentFilePath?.split("/").pop()?.replace(/\.md$/i, "") ?? "";
    const hasOpenNote = currentFilePath !== null;
    const currentParagraphText = hasOpenNote ? currentParagraphContext?.text ?? "" : "";
    return {
      filePath: currentFilePath,
      title: hasOpenNote ? frontmatter.fields.title.trim() || fallbackTitle || "未命名笔记" : "未选择笔记",
      bodyLength: hasOpenNote ? markdown.length : 0,
      hasBody: hasOpenNote && markdown.trim().length > 0,
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
      markdownBody: hasOpenNote ? markdown : "",
      bodyStartLine: hasOpenNote ? bodyStartLine : null,
    };
  }, [activeNoteFile, aiContextSelectionRange, bodyStartLine, currentFilePath, currentParagraphContext, editorSelectedText, editorSelectedTextLength, frontmatter.fields, markdown]);
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
  const trimmedSearchQuery = searchQuery.trim();
  const searchResults = useMemo(() => {
    if (trimmedSearchQuery === "") return buildLocalSearchResults(noteFiles, "");

    if (searchError) return buildLocalSearchResults(noteFiles, searchQuery);

    return backendSearchResults.map(toSearchResultItem);
  }, [backendSearchResults, noteFiles, searchError, searchQuery, trimmedSearchQuery]);

  const updateAppZoom = (nextZoom: number | ((currentZoom: number) => number)) => {
    setAppZoom((currentZoom) => {
      const rawZoom = typeof nextZoom === "function" ? nextZoom(currentZoom) : nextZoom;
      return clampAppZoom(rawZoom);
    });
  };

  const updateContentZoom = (nextZoom: number | ((currentZoom: number) => number)) => {
    setContentZoom((currentZoom) => {
      const rawZoom = typeof nextZoom === "function" ? nextZoom(currentZoom) : nextZoom;
      return clampContentZoom(rawZoom);
    });
  };

  const updateUiScale = (nextScale: number) => {
    setUiScale(clampScale(nextScale));
  };

  const updateEditorFontSize = (nextSize: number) => {
    setEditorFontSize(clampFontSize(nextSize));
  };

  const updatePreviewFontSize = (nextSize: number) => {
    setPreviewFontSize(clampFontSize(nextSize));
  };

  const updateReadingDensity = (nextDensity: ReadingDensity) => {
    setReadingDensity(nextDensity);
  };

  const updateToolbarFontSize = (nextSize: number) => {
    setToolbarFontSize(clampNumberRange(nextSize, TOOLBAR_FONT_SIZE_MIN, TOOLBAR_FONT_SIZE_MAX));
  };

  const updateSettingsFontSize = (nextSize: number) => {
    setSettingsFontSize(clampNumberRange(nextSize, SETTINGS_FONT_SIZE_MIN, SETTINGS_FONT_SIZE_MAX));
  };

  const handleContentWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;

    event.preventDefault();
    updateContentZoom((currentZoom) =>
      currentZoom + (event.deltaY < 0 ? CONTENT_ZOOM_STEP : -CONTENT_ZOOM_STEP),
    );
  };

  const updatePromptEditorFontSize = (updater: (currentSize: number) => number) => {
    setPromptEditorFontSize((currentSize) =>
      clampNumberRange(updater(currentSize), PROMPT_EDITOR_FONT_SIZE_MIN, PROMPT_EDITOR_FONT_SIZE_MAX),
    );
  };

  const normalizeFileName = (name: string): string => {
    const trimmed = name.trim();
    return trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
  };

  const validateNamePart = (name: string, kind: "file" | "folder"): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return kind === "file" ? "文件名不能为空" : "文件夹名不能为空";
    if (/[<>:"/\\|?*]/.test(trimmed)) return "名称不能包含 Windows 非法字符 < > : \" / \\ | ? *";
    if (trimmed.includes("..")) return "名称不能包含路径穿越片段 ..";
    if (/^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) return "名称不能是绝对路径";
    return null;
  };

  const validateDirectoryPathInput = (path: string): string | null => {
    const trimmed = path.trim();
    if (!trimmed) return null;
    if (/[<>:"\\|?*]/.test(trimmed)) return "目录不能包含 Windows 非法字符 < > : \" \\ | ? *";
    if (trimmed.includes("..")) return "目录不能包含路径穿越片段 ..";
    if (/^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) return "目录不能是绝对路径";
    if (trimmed.split("/").some((part) => part.trim() === "")) return "目录不能包含空路径段";
    return null;
  };

  const joinNotePath = (directory: string, filename: string): string => {
    const normalizedDirectory = directory.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return normalizedDirectory ? `${normalizedDirectory}/${filename}` : filename;
  };

  const getResolvedNewNoteDirectory = (): string => {
    if (newNoteLocationOption === "root") return "";
    if (newNoteLocationOption === "tricks") return "tricks";
    if (newNoteLocationOption === "problems") return "problems";
    if (newNoteLocationOption === "custom") return newNoteCustomDirectory.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return currentNoteDirectory;
  };

  const findEntryCaseInsensitive = (path: string, isDirectory: boolean) => {
    const normalized = path.toLowerCase();
    return files.find((file) => Boolean(file.isDirectory) === isDirectory && file.path.toLowerCase() === normalized);
  };

  const setDisplayTitleForPath = (path: string, title: string) => {
    const trimmed = title.trim();
    setDisplayTitleByPath((current) => {
      if (trimmed) {
        if (current[path] === trimmed) return current;
        return { ...current, [path]: trimmed };
      }
      if (!(path in current)) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
  };

  const updatePathReferences = (oldPath: string, newPath: string, isDirectory: boolean) => {
    const rewritePath = (path: string) => {
      if (isDirectory) {
        return path === oldPath || path.startsWith(`${oldPath}/`)
          ? `${newPath}${path.slice(oldPath.length)}`
          : path;
      }
      return path === oldPath ? newPath : path;
    };

    setOpenTabPaths((current) => current.map(rewritePath));
    setPendingFileSelection((current) => current ? { ...current, path: rewritePath(current.path) } : current);
    setPendingAssetsByFile((current) => {
      let changed = false;
      const next: Record<string, string[]> = {};
      for (const [path, assets] of Object.entries(current)) {
        const rewritten = rewritePath(path);
        if (rewritten !== path) changed = true;
        next[rewritten] = [...(next[rewritten] ?? []), ...assets];
      }
      return changed ? next : current;
    });
    setDisplayTitleByPath((current) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [path, title] of Object.entries(current)) {
        const rewritten = rewritePath(path);
        if (rewritten !== path) changed = true;
        next[rewritten] = title;
      }
      return changed ? next : current;
    });
    setOpenReviewTabs((current) =>
      current.map((tab) => {
        const rewritten = rewritePath(tab.preview.notePath);
        return rewritten === tab.preview.notePath
          ? tab
          : { ...tab, preview: { ...tab.preview, notePath: rewritten } };
      }),
    );
    setCurrentFilePath((current) => {
      if (!current) return current;
      const rewritten = rewritePath(current);
      if (rewritten !== current) {
        skipNextReadForPathRef.current = rewritten;
      }
      return rewritten;
    });
    setActiveWorkspaceTabId((current) => {
      if (!current || current.startsWith("review:")) return current;
      return rewritePath(current);
    });
    setActiveTreeDirectoryPath((current) => current ? rewritePath(current) : current);
    setActiveTreeFilePath((current) => current ? rewritePath(current) : current);
    const savedPath = savedSnapshotRef.current.path;
    if (savedPath) {
      const rewritten = rewritePath(savedPath);
      if (rewritten !== savedPath) {
        savedSnapshotRef.current = {
          ...savedSnapshotRef.current,
          path: rewritten,
        };
      }
    }
  };

  const getDefaultTreeCreateParent = () => {
    if (activeTreeDirectoryPath !== null) return activeTreeDirectoryPath;
    if (activeTreeFilePath) {
      const slashIndex = activeTreeFilePath.lastIndexOf("/");
      return slashIndex === -1 ? "" : activeTreeFilePath.slice(0, slashIndex);
    }
    return "";
  };

  const openCreateDialog = () => {
    const parentPath = getDefaultTreeCreateParent();
    setDialogMode("create");
    setDialogValue("");
    setNewNoteLocationOption(parentPath ? "custom" : "root");
    setNewNoteCustomDirectory(parentPath);
    setNewNoteTags([]);
    setFolderParentDirectory(parentPath);
  };

  const openCreateFolderDialog = () => {
    setReturnToCreateAfterFolder(dialogMode === "create");
    setDialogMode("create-folder");
    setDialogValue("");
    setFolderParentDirectory(dialogMode === "create" ? getResolvedNewNoteDirectory() : currentNoteDirectory);
  };

  const getDefaultFolderCreateParent = () => {
    return getDefaultTreeCreateParent();
  };

  const requestInlineCreateFolder = () => {
    closeDialog();
    const parentPath = getDefaultFolderCreateParent();
    setIsTreeRootCollapsed(false);
    setCreateFolderRequest({ parentPath, requestId: Date.now() });
  };

  const handleSelectTreeDirectory = useCallback((path: string) => {
    setActiveTreeDirectoryPath(path);
    setActiveTreeFilePath(null);
  }, []);

  const handleClearTreeSelection = useCallback(() => {
    setActiveTreeDirectoryPath(null);
    setActiveTreeFilePath(null);
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
    const fileErr = validateNamePart(dialogValue, "file");
    if (fileErr) { toast.error(fileErr); return; }
    const directory = getResolvedNewNoteDirectory();
    const directoryErr = validateDirectoryPathInput(directory);
    if (directoryErr) { toast.error(directoryErr); return; }

    const filename = normalizeFileName(dialogValue);
    const newPath = joinNotePath(directory, filename);
    if (findEntryCaseInsensitive(newPath, false)) { toast.error("同目录已存在同名笔记"); return; }

    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，新建会切换走，未保存的改动将丢失。确定吗？");
      if (!ok) return;
    }

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
      setActiveWorkspaceTabId(newPath);
      setIsDirty(false);
      toast.success("已创建空白笔记");
    } catch (e) {
      toast.error(`创建失败: ${getErrorMessage(e)}`);
    }
  };

  const handleCreateFolder = async () => {
    const nameErr = validateNamePart(dialogValue, "folder");
    if (nameErr) { toast.error(nameErr); return; }
    const parentErr = validateDirectoryPathInput(folderParentDirectory);
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
    const nameErr = validateNamePart(name, "folder");
    if (nameErr) throw new Error(nameErr);
    const parentErr = validateDirectoryPathInput(parentPath);
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

  const handleRename = async () => {
    if (!renameTarget) return;
    const nameErr = validateNamePart(dialogValue, renameTargetIsDirectory ? "folder" : "file");
    if (nameErr) { toast.error(nameErr); return; }

    const lastSlashIdx = renameTarget.lastIndexOf("/");
    const dirPrefix = lastSlashIdx === -1 ? "" : renameTarget.slice(0, lastSlashIdx + 1);
    const normalizedName = renameTargetIsDirectory ? dialogValue.trim() : normalizeFileName(dialogValue);
    const newPath = `${dirPrefix}${normalizedName}`;
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
        try {
          await commitRenamedNote(renameTarget, newPath);
          toast.success("已重命名并提交");
        } catch (commitError) {
          toast.warning(`重命名成功，Git 提交失败：${getErrorMessage(commitError)}`);
        }
      }
      const updated = await listNotes();
      updatePathReferences(renameTarget, newPath, renameTargetIsDirectory);
      setFiles(updated);
      closeDialog();
      if (renameTargetIsDirectory) toast.success("已重命名文件夹");
    } catch (e) {
      toast.error(`重命名失败: ${getErrorMessage(e)}`);
    }
  };

  const handleDelete = async (path: string, isDirectory = false) => {
    const ok = window.confirm(`确定删除"${path}"吗？此操作不可撤销。`);
    if (!ok) return;
    try {
      if (isDirectory) {
        await deleteNoteFolder(path);
      } else {
        await deleteNote(path);
        try {
          const commitStatus = await commitDeletedNote(path);
          toast.success(commitStatus === "committed" ? "已删除并提交" : "已删除");
        } catch (commitError) {
          toast.warning(`删除成功，Git 提交失败：${getErrorMessage(commitError)}`);
        }
      }
      const updated = await listNotes();
      setFiles(updated);
      setOpenTabPaths((current) => current.filter((tabPath) => isDirectory ? tabPath !== path && !tabPath.startsWith(`${path}/`) : tabPath !== path));
      if (isDirectory) {
        setActiveTreeDirectoryPath((current) => current && (current === path || current.startsWith(`${path}/`)) ? null : current);
      }
      setActiveTreeFilePath((current) => current && (current === path || (isDirectory && current.startsWith(`${path}/`))) ? null : current);
      if (currentFilePath && (currentFilePath === path || (isDirectory && currentFilePath.startsWith(`${path}/`)))) {
        setCurrentFilePath(null);
        setActiveWorkspaceTabId(null);
        setIsDirty(false);
      }
      if (isDirectory) toast.success("已删除文件夹");
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

  const handlePushGit = async () => {
    setIsPushingGit(true);
    try {
      await pushGit();
      toast.success("Git 已同步");
    } catch (e) {
      toast.error(`Git 同步失败：${e}`);
    } finally {
      setIsPushingGit(false);
    }
  };

  const openLuoguSettings = async () => {
    setIsLuoguSettingsOpen(true);
    setIsLoadingLuoguConfig(true);
    try {
      const config = await getLuoguConfig();
      setLuoguConfigUid(config.luogu.uid);
      setLuoguConfigClientId(config.luogu.client_id);
      setLuoguConfigLastSubmissionId(
        config.luogu.last_submission_id === null ? "" : String(config.luogu.last_submission_id),
      );
      setLuoguConfigAiConfigured(
        config.ai.base_url.trim() !== "" &&
        config.ai.api_key.trim() !== "" &&
        config.ai.model.trim() !== "",
      );
    } catch (e) {
      toast.error(`洛谷配置读取失败：${e}`);
    } finally {
      setIsLoadingLuoguConfig(false);
    }
  };

  const closeLuoguSettings = () => {
    if (isSavingLuoguConfig || isUpdatingLuoguLastSubmissionId) return;
    setIsLuoguSettingsOpen(false);
  };

  const handleSaveLuoguConfig = async () => {
    const lastSubmissionId = luoguConfigLastSubmissionId.trim();
    const parsedLastSubmissionId =
      lastSubmissionId === "" ? null : Number(lastSubmissionId);
    if (
      parsedLastSubmissionId !== null &&
      (!Number.isInteger(parsedLastSubmissionId) || parsedLastSubmissionId < 0)
    ) {
      toast.error("last_submission_id 必须是非负整数或留空");
      return;
    }

    setIsSavingLuoguConfig(true);
    try {
      await saveLuoguConfig({
        luogu: {
          uid: luoguConfigUid.trim(),
          client_id: luoguConfigClientId.trim(),
          last_submission_id: parsedLastSubmissionId,
        },
      });
      toast.success("洛谷配置已保存");
      setIsLuoguSettingsOpen(false);
    } catch (e) {
      toast.error(`洛谷配置保存失败：${e}`);
    } finally {
      setIsSavingLuoguConfig(false);
    }
  };

  const handleTestLuoguConnection = async () => {
    setIsTestingLuoguConnection(true);
    setLuoguConnectionResult(null);
    try {
      const result = await testLuoguConnection();
      setLuoguConnectionResult(result);
      toast.success(`洛谷连接正常，拉到 ${result.fetchedCount} 条提交`);
    } catch (e) {
      toast.error(`洛谷连接测试失败：${getErrorMessage(e)}`);
    } finally {
      setIsTestingLuoguConnection(false);
    }
  };

  const handlePreviewLuoguSubmissions = async () => {
    const rangeLabel = getLuoguScanRangeLabel(luoguScanMode, luoguScanCountLimit, luoguScanDaysLimit);
    const cutoffMs =
      luoguScanMode === "days" ? Date.now() - luoguScanDaysLimit * 24 * 60 * 60 * 1000 : null;
    setIsScanningLuoguPreview(true);
    setLuoguPreviewResult(null);
    setLuoguScanProgress({ currentPage: 1, foundCount: 0, rangeLabel, waiting: false });
    setLuoguScanSummary(null);
    setSelectedLuoguSubmissionIds(new Set<string>());
    setSkippedLuoguSubmissionIds(new Set<string>());
    setLuoguPreparedNotesById({});
    setLuoguPrepareErrorsById({});
    setLuoguPrepareStatusesById({});
    setCurrentlyPreparingLuoguId(null);
    setLuoguPrepareProgress(null);
    setIsStoppingLuoguPrepare(false);
    setLuoguWriteResultsById({});
    setCurrentlyWritingLuoguId(null);
    setLuoguWriteProgress(null);
    setActiveLuoguPreparedPreviewId(null);
    setActiveLuoguPreviewDetailTab("rendered");
    setLuoguImportStep("scan");
    try {
      const submissions: PreviewLuoguSubmission[] = [];
      const seenSubmissionIds = new Set<string>();
      let latestPageResult: Awaited<ReturnType<typeof previewLuoguSubmissionPage>> | null = null;
      let scannedPages = 0;
      let shouldStop = false;

      for (let page = 1; page <= LUOGU_SCAN_MAX_PAGES; page += 1) {
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

          if (luoguScanMode === "count" && submissions.length >= luoguScanCountLimit) {
            shouldStop = true;
            break;
          }
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
      const candidateCount = result.submissions.filter((submission) =>
        getLuoguSubmissionCandidateState(
          submission,
          result.submissions,
          luoguImportRules,
          result.lastSubmissionId,
          new Set<string>(),
        ).canSelect,
      ).length;
      const skippedCount = result.submissions.length - candidateCount;

      setLuoguPreviewResult(result);
      setLuoguScanSummary({
        scannedPages,
        foundCount: result.submissions.length,
        candidateCount,
        skippedCount,
        rangeLabel,
      });
      setSelectedLuoguSubmissionIds(
        new Set(
          result.submissions
            .filter((submission) =>
              getLuoguSubmissionCandidateState(
                submission,
                result.submissions,
                luoguImportRules,
                result.lastSubmissionId,
                new Set<string>(),
              ).canSelect,
            )
            .map((submission) => submission.submissionId),
        ),
      );
      setLuoguConfigAiConfigured(result.aiConfigured);
      setLuoguConfigLastSubmissionId(
        result.lastSubmissionId === null ? "" : String(result.lastSubmissionId),
      );
      toast.success(`扫描完成：${rangeLabel}，扫描 ${scannedPages} 页，找到 ${result.submissions.length} 条，可候选 ${candidateCount} 条`);
    } catch (e) {
      toast.error(`洛谷扫描失败：${getErrorMessage(e)}`);
    } finally {
      setLuoguScanProgress(null);
      setIsScanningLuoguPreview(false);
    }
  };

  const resetLuoguPreparedWorkflow = () => {
    luoguPrepareRunRef.current.cancelled = true;
    setLuoguPreparedNotesById({});
    setLuoguPrepareErrorsById({});
    setLuoguPrepareStatusesById({});
    setCurrentlyPreparingLuoguId(null);
    setLuoguPrepareProgress(null);
    setIsStoppingLuoguPrepare(false);
    setLuoguWriteResultsById({});
    setCurrentlyWritingLuoguId(null);
    setLuoguWriteProgress(null);
    setActiveLuoguPreparedPreviewId(null);
    setActiveLuoguPreviewDetailTab("rendered");
    setLuoguImportStep("scan");
  };

  const applyLuoguLastSubmissionIdState = (lastSubmissionId: number | null) => {
    setLuoguConfigLastSubmissionId(lastSubmissionId === null ? "" : String(lastSubmissionId));
    setSkippedLuoguSubmissionIds(new Set<string>());
    setLuoguPreviewResult((current) => current ? { ...current, lastSubmissionId } : current);
    setSelectedLuoguSubmissionIds(() => {
      const submissions = luoguPreviewResult?.submissions ?? [];
      return new Set(
        submissions
          .filter((submission) =>
            getLuoguSubmissionCandidateState(
              submission,
              submissions,
              luoguImportRules,
              lastSubmissionId,
              new Set<string>(),
            ).canSelect,
          )
          .map((submission) => submission.submissionId),
      );
    });
    setLuoguScanSummary((current) => {
      const submissions = luoguPreviewResult?.submissions ?? [];
      if (!current || submissions.length === 0) return current;
      const candidateCount = submissions.filter((submission) =>
        getLuoguSubmissionCandidateState(
          submission,
          submissions,
          luoguImportRules,
          lastSubmissionId,
          new Set<string>(),
        ).canSelect,
      ).length;
      return {
        ...current,
        candidateCount,
        skippedCount: submissions.length - candidateCount,
      };
    });
    resetLuoguPreparedWorkflow();
  };

  const saveLuoguLastSubmissionId = async (lastSubmissionId: number | null, successMessage: string) => {
    setIsUpdatingLuoguLastSubmissionId(true);
    try {
      await updateLuoguLastSubmissionId(lastSubmissionId);
      applyLuoguLastSubmissionIdState(lastSubmissionId);
      toast.success(successMessage);
    } catch (e) {
      toast.error(`同步位置保存失败：${getErrorMessage(e)}`);
    } finally {
      setIsUpdatingLuoguLastSubmissionId(false);
    }
  };

  const handleSaveLuoguLastSubmissionId = async () => {
    const parsedLastSubmissionId = parseLuoguLastSubmissionInput(luoguConfigLastSubmissionId);
    if (parsedLastSubmissionId === undefined) {
      toast.error("last_submission_id 必须是非负整数，留空表示清空");
      return;
    }

    await saveLuoguLastSubmissionId(parsedLastSubmissionId, "同步位置已保存");
  };

  const handleClearLuoguLastSubmissionId = async () => {
    await saveLuoguLastSubmissionId(null, "同步位置已清空；不会删除任何笔记，之后扫描可以重新看到旧提交");
  };

  const handleUseLatestScannedLuoguSubmissionId = async () => {
    const submissions = luoguPreviewResult?.submissions ?? [];
    const latestSubmissionId = submissions.reduce<number | null>((latest, submission) => {
      const submissionId = parseLuoguSubmissionId(submission.submissionId);
      if (submissionId === null) return latest;
      return latest === null ? submissionId : Math.max(latest, submissionId);
    }, null);

    if (latestSubmissionId === null) {
      toast.error("当前扫描结果里没有可用的 submission id");
      return;
    }

    await saveLuoguLastSubmissionId(latestSubmissionId, `同步位置已设为本次扫描最新提交 ${latestSubmissionId}`);
  };

  const applyAiConfigState = (config: AiConfig) => {
    const nextConfig = cloneAiConfig(config);
    setAiConfig(nextConfig);
    setAiConfigDraft(cloneAiConfig(nextConfig));
    const defaultProvider =
      config.providers.find((provider) => provider.id === config.default_provider_id) ??
      config.providers[0] ??
      null;
    if (defaultProvider) {
      setSelectedAiProviderId(defaultProvider.id);
    } else {
      setSelectedAiProviderId("");
    }
  };

  const handleAiConfigChangeFromSidebar = (config: AiConfig) => {
    const nextConfig = cloneAiConfig(config);
    setAiConfig(nextConfig);
    setAiConfigDraft((current) => current ? {
      ...cloneAiConfig(current),
      web_search: normalizeWebSearchConfig(nextConfig.web_search),
    } : cloneAiConfig(nextConfig));
  };

  const selectAiProviderForEdit = (provider: AiProvider) => {
    setSelectedAiProviderId(provider.id);
    setAiManualModelId("");
    setAiModelSearchQuery("");
  };

  const handleCreateAiProviderDraft = () => {
    const provider = createAiProviderDraft();
    setAiConfigDraft((current) => {
      const base = current ?? aiConfig ?? {
        base_url: "",
        api_key: "",
        model: "",
        providers: [],
        default_provider_id: null,
        default_model_id: null,
        web_search: DEFAULT_WEB_SEARCH_CONFIG,
      };
      return {
        ...cloneAiConfig(base),
        providers: [...base.providers.map((item) => ({ ...item, models: item.models.map((model) => ({ ...model })) })), provider],
        default_provider_id: base.default_provider_id ?? provider.id,
      };
    });
    setSelectedAiProviderId(provider.id);
    setAiManualModelId("");
    setAiModelSearchQuery("");
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
    activateSettingsTarget(options?.target ?? { type: "category", category: "ai" });
    setSettingsView("main");
    setIsAdvancedActionsOpen(true);
    await ensureAiConfigLoadedForSettings();
  };

  const handleFillDeepSeekDefaults = () => {
    if (!selectedAiProvider) {
      const provider = {
        ...createAiProviderDraft(),
        name: "DeepSeek",
        base_url: DEEPSEEK_DEFAULT_BASE_URL,
        default_model: DEEPSEEK_DEFAULT_MODEL,
        models: [createAiModelDraft(DEEPSEEK_DEFAULT_MODEL)],
      };
      setAiConfigDraft((current) => {
        const base = current ?? aiConfig ?? {
          base_url: "",
          api_key: "",
          model: "",
          providers: [],
          default_provider_id: null,
          default_model_id: null,
          web_search: DEFAULT_WEB_SEARCH_CONFIG,
        };
        return {
          ...cloneAiConfig(base),
          providers: [...base.providers.map((item) => ({ ...item, models: item.models.map((model) => ({ ...model })) })), provider],
          default_provider_id: base.default_provider_id ?? provider.id,
          default_model_id: base.default_model_id ?? DEEPSEEK_DEFAULT_MODEL,
        };
      });
      setSelectedAiProviderId(provider.id);
      setAiModelSearchQuery("");
      return;
    }
    updateAiProviderDraft(selectedAiProvider.id, (provider) => ({
      ...provider,
      base_url: DEEPSEEK_DEFAULT_BASE_URL,
      default_model: provider.default_model || DEEPSEEK_DEFAULT_MODEL,
      models: provider.models.some((model) => model.id === DEEPSEEK_DEFAULT_MODEL)
        ? provider.models
        : [...provider.models, createAiModelDraft(DEEPSEEK_DEFAULT_MODEL)],
      updated_at: Date.now(),
    }));
    setAiConfigDraft((current) => current ? {
      ...current,
      default_provider_id: current.default_provider_id ?? selectedAiProvider.id,
      default_model_id: current.default_model_id ?? DEEPSEEK_DEFAULT_MODEL,
    } : current);
    toast.info("已填入 DeepSeek 默认 base_url 和模型，检查 API key 后保存更改");
  };

  const updateAiConfigDraft = (update: (config: AiConfig) => AiConfig) => {
    setAiConfigDraft((current) => {
      const base = current ?? aiConfig;
      if (!base) return current;
      return update(cloneAiConfig(base));
    });
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
  };

  const handleSaveAiConfigDraft = async () => {
    if (!aiConfigDraft || isSavingAiConfig) return;
    const nextConfig = normalizeAiConfigDraft(aiConfigDraft);
    setIsSavingAiConfig(true);
    try {
      await saveAiConfig(nextConfig);
      applyAiConfigState(nextConfig);
      toast.success("AI/API 设置已保存");
    } catch (e) {
      toast.error(`AI/API 设置保存失败：${getErrorMessage(e)}`);
    } finally {
      setIsSavingAiConfig(false);
    }
  };

  const handleDiscardAiConfigDraft = () => {
    if (!aiConfig) return;
    setAiConfigDraft(cloneAiConfig(aiConfig));
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
    setIsLoadingLocalIndexStatus(true);
    setLocalIndexMessage(null);
    try {
      const status = await getLocalNoteIndexStatus();
      setLocalIndexStatus(status);
      if (!status.exists) {
        setLocalIndexMessage("本地索引尚未建立，首次搜索或点击重建后会生成。");
      } else if (status.status === "stale") {
        setLocalIndexMessage("本地索引版本已更新，建议重建索引。");
      } else if (status.status === "error") {
        setLocalIndexMessage("本地索引读取失败，可尝试重建。");
      }
    } catch (e) {
      const message = getErrorMessage(e);
      setLocalIndexMessage(message);
      toast.error(`本地索引状态读取失败：${message}`);
    } finally {
      setIsLoadingLocalIndexStatus(false);
    }
  };

  const handleRebuildLocalIndex = async () => {
    setIsRebuildingLocalIndex(true);
    setLocalIndexMessage("正在建立本地笔记索引...");
    try {
      const status = await rebuildLocalNoteIndex();
      setLocalIndexStatus(status);
      setLocalIndexMessage(`重建完成：${status.noteCount} 篇笔记，${status.chunkCount} 个片段。`);
      toast.success("本地笔记索引已重建");
    } catch (e) {
      const message = getErrorMessage(e);
      setLocalIndexMessage(message);
      toast.error(`本地索引重建失败：${message}`);
    } finally {
      setIsRebuildingLocalIndex(false);
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
      toast.error(`Prompt 读取失败：${getErrorMessage(e)}`);
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
      toast.error(`Prompt 读取失败：${getErrorMessage(e)}`);
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const handleEditPrompt = (fileName: string) => {
    if (isLoadingPrompt || isSavingPrompt || isPolishingPrompt) return;
    setPromptEditorReturnTarget(activeSettingsTarget);
    setSettingsView("prompt-editor");
    void loadPromptContent(fileName);
  };

  const handleSavePrompt = async () => {
    if (!selectedPromptFileName) {
      toast.error("请先选择一个 Prompt");
      return;
    }

    setIsSavingPrompt(true);
    try {
      await saveAiPrompt(selectedPromptFileName, promptContent);
      toast.success("Prompt 已保存");
    } catch (e) {
      toast.error(`Prompt 保存失败：${getErrorMessage(e)}`);
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handlePolishPrompt = async () => {
    if (!selectedPromptFileName) {
      toast.error("请先选择一个 Prompt");
      return;
    }
    const originalContent = promptContent;
    if (!originalContent.trim()) {
      toast.error("当前 Prompt 为空");
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
      toast.success("Prompt 已润色，保存后生效");
    } catch (e) {
      if (!isMountedRef.current || promptPolishRunRef.current !== runId) return;
      setPromptPolishMessage(`润色失败：${getErrorMessage(e)}`);
      toast.error(`Prompt 润色失败：${getErrorMessage(e)}`);
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

  const handleSyncLuoguInsights = async () => {
    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，同步洛谷后可能会切换到新导入的笔记。确定继续吗？未保存的改动将丢失。");
      if (!ok) return;
    }

    setIsSyncingLuogu(true);
    setLuoguSyncResult(null);
    try {
      const result = await syncLuoguInsights();
      setLuoguSyncResult(result);

      if (result.importedCount > 0) {
        const updated = await listNotes();
        setFiles(updated);
        const lastImportedPath = result.importedPaths[result.importedPaths.length - 1];
        if (lastImportedPath) {
          setCurrentFilePath(lastImportedPath);
          setIsDirty(false);
        }
      }

      const reachedLastText = result.reachedLastSubmissionId ? "已触达 last_submission_id" : "未触达 last_submission_id";
      const aiModelText = result.aiModel ?? "未配置";
      const syncSummary = `扫描 ${result.scannedPages} 页 / ${result.scannedCount} 条，AC ${result.acCount} 条，AI 整理：是，模型：${aiModelText}，AI 导入 ${result.aiImportedCount} 篇，AI 跳过 ${result.aiSkippedCount} 条，AI 失败 ${result.aiFailedCount} 条，无 insight ${result.skippedNoInsight} 条，已存在 ${result.skippedExisting} 条，总失败 ${result.failedCount} 条，${reachedLastText}，last_submission_id ${result.updatedLastSubmissionId ?? "未更新"}`;
      if (result.failedCount > 0) {
        toast.warning(`洛谷同步完成，但有失败：${syncSummary}`);
      } else if (result.importedCount > 0) {
        toast.success(`洛谷同步完成：${syncSummary}`);
      } else {
        toast.success(`洛谷同步完成，没有新笔记：${syncSummary}`);
      }
    } catch (e) {
      toast.error(`洛谷同步失败：${getErrorMessage(e)}`);
    } finally {
      setIsSyncingLuogu(false);
    }
  };

  const openLuoguDialog = async () => {
    setIsLuoguDialogOpen(true);
    setLuoguImportCenterTab("scan");
    setLuoguImportStep("scan");
    setIsLoadingLuoguConfig(true);
    try {
      const config = await getLuoguConfig();
      setLuoguConfigUid(config.luogu.uid);
      setLuoguConfigClientId(config.luogu.client_id);
      setLuoguConfigLastSubmissionId(
        config.luogu.last_submission_id === null ? "" : String(config.luogu.last_submission_id),
      );
      setLuoguConfigAiConfigured(
        config.ai.base_url.trim() !== "" &&
        config.ai.api_key.trim() !== "" &&
        config.ai.model.trim() !== "",
      );
    } catch (e) {
      toast.error(`洛谷配置读取失败：${getErrorMessage(e)}`);
    } finally {
      setIsLoadingLuoguConfig(false);
    }
  };

  const closeLuoguDialog = () => {
    if (isImportingLuogu || isPreparingSelectedLuogu || isWritingPreparedLuogu || isScanningLuoguPreview || isSyncingLuogu) return;
    setIsLuoguDialogOpen(false);
    setLuoguPreviewResult(null);
    setLuoguScanProgress(null);
    setLuoguScanSummary(null);
    setSelectedLuoguSubmissionIds(new Set<string>());
    setSkippedLuoguSubmissionIds(new Set<string>());
    setLuoguPreparedNotesById({});
    setLuoguPrepareErrorsById({});
    setLuoguPrepareStatusesById({});
    setCurrentlyPreparingLuoguId(null);
    setLuoguPrepareProgress(null);
    setIsStoppingLuoguPrepare(false);
    setLuoguWriteResultsById({});
    setCurrentlyWritingLuoguId(null);
    setLuoguWriteProgress(null);
    setActiveLuoguPreparedPreviewId(null);
    setActiveLuoguPreviewDetailTab("rendered");
    setLuoguProblemId("");
    setLuoguProblemTitle("");
    setLuoguSubmissionId("");
    setLuoguSourceCode("");
    setLuoguImportCenterTab("scan");
    setLuoguImportStep("scan");
  };

  const updateLuoguImportRules = (patch: Partial<LuoguImportRules>) => {
    if (isPreparingSelectedLuogu || isWritingPreparedLuogu || isScanningLuoguPreview || isSyncingLuogu) return;

    setLuoguImportRules((current) => {
      const next = { ...current, ...patch };
      const submissions = luoguPreviewResult?.submissions ?? [];
      setSelectedLuoguSubmissionIds(
        new Set(
          submissions
            .filter((submission) =>
              getLuoguSubmissionCandidateState(
                submission,
                submissions,
                next,
                luoguPreviewResult?.lastSubmissionId ?? null,
                new Set<string>(),
              ).canSelect,
            )
            .map((submission) => submission.submissionId),
        ),
      );
      return next;
    });

    setSkippedLuoguSubmissionIds(new Set<string>());
    setLuoguPreparedNotesById({});
    setLuoguPrepareErrorsById({});
    setLuoguPrepareStatusesById({});
    setCurrentlyPreparingLuoguId(null);
    setLuoguPrepareProgress(null);
    setIsStoppingLuoguPrepare(false);
    setLuoguWriteResultsById({});
    setCurrentlyWritingLuoguId(null);
    setLuoguWriteProgress(null);
    setActiveLuoguPreparedPreviewId(null);
    setActiveLuoguPreviewDetailTab("rendered");
    setLuoguImportStep("scan");
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

  const handleSelectAllLuoguCandidates = () => {
    if (luoguSelectableSubmissionIds.length === 0 || isPreparingSelectedLuogu || isWritingPreparedLuogu || isScanningLuoguPreview || isSyncingLuogu) return;

    setSelectedLuoguSubmissionIds(new Set(luoguSelectableSubmissionIds));
    toast.success(`已选择 ${luoguSelectableSubmissionIds.length} 条可候选提交`);
  };

  const handleClearLuoguSelection = () => {
    if (selectedLuoguImportCount === 0 || isPreparingSelectedLuogu || isWritingPreparedLuogu || isScanningLuoguPreview || isSyncingLuogu) return;

    setSelectedLuoguSubmissionIds(new Set<string>());
    toast.success("已取消选择");
  };

  const handleSkipSelectedLuoguSubmissions = () => {
    if (!luoguPreviewResult || isPreparingSelectedLuogu || isWritingPreparedLuogu || isScanningLuoguPreview || isSyncingLuogu) return;

    const idsToSkip = luoguPreviewResult.submissions
      .filter((submission) => selectedLuoguSubmissionIds.has(submission.submissionId))
      .filter((submission) => luoguSubmissionCandidateStates[submission.submissionId]?.canSelect)
      .map((submission) => submission.submissionId);

    if (idsToSkip.length === 0) {
      toast.error("没有可跳过的选中提交");
      return;
    }

    const idsToSkipSet = new Set(idsToSkip);
    setSkippedLuoguSubmissionIds((current) => new Set([...current, ...idsToSkip]));
    setSelectedLuoguSubmissionIds((current) => {
      const next = new Set(current);
      idsToSkip.forEach((id) => next.delete(id));
      return next;
    });
    setLuoguPreparedNotesById((current) => {
      const next = { ...current };
      idsToSkip.forEach((id) => delete next[id]);
      return next;
    });
    setLuoguPrepareErrorsById((current) => {
      const next = { ...current };
      idsToSkip.forEach((id) => delete next[id]);
      return next;
    });
    setLuoguPrepareStatusesById((current) => {
      const next = { ...current };
      idsToSkip.forEach((id) => delete next[id]);
      return next;
    });
    setLuoguWriteResultsById((current) => {
      const next = { ...current };
      idsToSkip.forEach((id) => delete next[id]);
      return next;
    });
    setActiveLuoguPreparedPreviewId((current) => current && idsToSkipSet.has(current) ? null : current);
    toast.success(`已跳过 ${idsToSkip.length} 条提交；不会写 notes、调用 AI 或提交 Git`);
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

  const handleDeleteAiProvider = async (providerId: string) => {
    const provider = aiConfigDraft?.providers.find((item) => item.id === providerId);
    if (!provider) return;
    if (!window.confirm(`删除配置组「${provider.name || provider.id}」？删除后需要点击“保存更改”才会持久化。`)) return;
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
    setAiManualModelId("");
  };

  const handleTestAiProvider = async (providerId: string) => {
    const provider = aiConfigDraft?.providers.find((item) => item.id === providerId);
    if (!provider) return;
    if (!provider.base_url.trim()) {
      toast.error("请先填写 Base URL");
      return;
    }
    if (!provider.api_key.trim()) {
      toast.error("请先填写 API Key");
      return;
    }
    setAiProviderBusyId(providerId);
    try {
      const result = await testAiProviderDraft(provider);
      toast.success(`连接正常，发现 ${result.modelCount} 个模型`);
    } catch (e) {
      toast.error(`连接测试失败：${getErrorMessage(e)}`);
    } finally {
      setAiProviderBusyId(null);
    }
  };

  const handleSyncAiProviderModels = async (providerId: string) => {
    const provider = aiConfigDraft?.providers.find((item) => item.id === providerId);
    if (!provider) return;
    if (!provider.base_url.trim()) {
      toast.error("请先填写 Base URL");
      return;
    }
    if (!provider.api_key.trim()) {
      toast.error("请先填写 API Key");
      return;
    }
    setAiProviderBusyId(providerId);
    try {
      const result = await syncAiProviderModelsDraft(provider);
      updateAiProviderDraft(providerId, () => result.provider);
      toast.success(`已同步 ${result.syncedCount} 个模型`);
    } catch (e) {
      toast.error(`模型同步失败：${getErrorMessage(e)}；可以手动添加模型`);
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
    toast.success("模型已加入草稿，保存更改后生效");
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
    const selectedSubmissions = luoguPreviewResult.submissions.filter((submission) => selectedLuoguSubmissionIds.has(submission.submissionId));
    const queue = selectedSubmissions.filter((submission) => {
      const candidateState = luoguSubmissionCandidateStates[submission.submissionId];
      return (
        candidateState?.canSelect &&
        !skippedLuoguSubmissionIds.has(submission.submissionId) &&
        !hasReusableLuoguPreparedPreview(submission.submissionId)
      );
    });
    const reusablePreviewSubmissions = selectedSubmissions.filter((submission) => hasReusableLuoguPreparedPreview(submission.submissionId));
    const ignoredCount = selectedSubmissions.length - queue.length - reusablePreviewSubmissions.length;

    if (selectedSubmissions.length === 0) {
      toast.error("Please select Luogu submissions to preview");
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
        setActiveLuoguPreparedPreviewId(reusablePreviewSubmissions[0].submissionId);
        setActiveLuoguPreviewDetailTab("rendered");
        setLuoguImportStep("preview");
        toast.success(`无需重新生成：复用 ${reusablePreviewSubmissions.length} 个已有预览，忽略 ${ignoredCount} 个`);
      } else {
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
    setLuoguPrepareProgress({ current: 0, total: queue.length });
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

    try {
      for (let index = 0; index < queue.length; index += 1) {
        const submission = queue[index];
        const run = luoguPrepareRunRef.current;
        if (run.id !== runId || run.cancelled || !isMountedRef.current) {
          setLuoguPrepareStatusesById((current) => {
            const next = { ...current };
            queue.slice(index).forEach((item) => {
              if (next[item.submissionId] === "queued" || next[item.submissionId] === "running") {
                next[item.submissionId] = "stopped";
              }
            });
            return next;
          });
          break;
        }

        setCurrentlyPreparingLuoguId(submission.submissionId);
        setLuoguPrepareProgress({ current: index + 1, total: queue.length });
        setLuoguPrepareStatusesById((current) => ({
          ...current,
          [submission.submissionId]: "running",
        }));
        await sleepMs(0);

        try {
          const prepared = await prepareLuoguSubmissionNote(submission.submissionId, {
            requireAc: luoguImportRules.requireAc,
            allowRawDraftWithoutInsight: luoguImportRules.missingInsightStrategy === "draft",
          });
          const latestRun = luoguPrepareRunRef.current;
          if (latestRun.id !== runId || !isMountedRef.current) return;
          setLuoguPreparedNotesById((current) => ({
            ...current,
            [submission.submissionId]: prepared,
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
          if (prepared.skipped) {
            skippedCount += 1;
          } else if (prepared.aiStatus === "failed") {
            failedCount += 1;
          } else {
            preparedCount += 1;
            if (prepared.draftFallback) draftCount += 1;
            if (!firstPreparedId) firstPreparedId = submission.submissionId;
          }
        } catch (e) {
          const latestRun = luoguPrepareRunRef.current;
          if (latestRun.id !== runId || !isMountedRef.current) return;
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
        }

        if (luoguPrepareRunRef.current.cancelled) {
          setLuoguPrepareStatusesById((current) => {
            const next = { ...current };
            queue.slice(index + 1).forEach((item) => {
              if (next[item.submissionId] === "queued" || next[item.submissionId] === "running") {
                next[item.submissionId] = "stopped";
              }
            });
            return next;
          });
          break;
        }
      }

      if (firstPreparedId) {
        setActiveLuoguPreparedPreviewId(firstPreparedId);
        setActiveLuoguPreviewDetailTab("rendered");
      }
      setLuoguImportStep("preview");
      if (luoguPrepareRunRef.current.cancelled) {
        toast.warning(
          `已停止生成预览：${preparedCount} ready, ${draftCount} draft, ${skippedCount + ignoredCount} skipped/ignored, ${failedCount} failed`,
        );
      } else {
        toast.success(
          `Preview generated: ${preparedCount} ready, ${draftCount} draft, ${skippedCount + ignoredCount} skipped/ignored, ${failedCount} failed`,
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
      toast.error("No prepared previews to write");
      return;
    }

    setIsWritingPreparedLuogu(true);
    setLuoguWriteProgress({ current: 0, total: preparedNotesToWrite.length });
    let writtenCount = 0;
    let commitFailedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let lastWrittenPath: string | null = null;

    try {
      for (let index = 0; index < preparedNotesToWrite.length; index += 1) {
        const prepared = preparedNotesToWrite[index];
        setCurrentlyWritingLuoguId(prepared.submissionId);
        setLuoguWriteProgress({ current: index + 1, total: preparedNotesToWrite.length });

        try {
          const result = await writeLuoguPreparedNote(prepared.suggestedRelativePath, prepared.markdown, true);
          setLuoguWriteResultsById((current) => ({
            ...current,
            [prepared.submissionId]: result,
          }));
          if (result.skipped) {
            skippedCount += 1;
          } else if (result.failed && result.relativePath && result.commitStatus === "failed") {
            writtenCount += 1;
            commitFailedCount += 1;
            lastWrittenPath = result.relativePath;
          } else if (result.failed) {
            failedCount += 1;
          } else {
            writtenCount += 1;
            if (result.relativePath) lastWrittenPath = result.relativePath;
          }
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

      toast.success(`Write complete: ${writtenCount} written, ${commitFailedCount} git commit failed, ${skippedCount} skipped, ${failedCount} failed`);
    } finally {
      setCurrentlyWritingLuoguId(null);
      setLuoguWriteProgress(null);
      setIsWritingPreparedLuogu(false);
    }
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
    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，导入后会切换到新笔记。确定继续吗？未保存的改动将丢失。");
      if (!ok) return;
    }

    setIsImportingLuogu(true);
    try {
      const imported = await importLuoguInsight(
        luoguProblemId,
        luoguProblemTitle,
        luoguSubmissionId,
        luoguSourceCode,
      );

      let commitSucceeded = true;
      try {
        await commitNote(imported.relativePath);
      } catch (commitError) {
        commitSucceeded = false;
        toast.warning(`洛谷笔记已导入，AI 整理：是，模型：${imported.aiModel}，Git 提交失败：${commitError}`);
      }

      const updated = await listNotes();
      setFiles(updated);
      setCurrentFilePath(imported.relativePath);
      setIsDirty(false);
      setIsLuoguDialogOpen(false);
      setLuoguProblemId("");
      setLuoguProblemTitle("");
      setLuoguSubmissionId("");
      setLuoguSourceCode("");
      if (commitSucceeded) {
        toast.success(`洛谷笔记已导入并提交，AI 整理：是，模型：${imported.aiModel}`);
      }
    } catch (e) {
      toast.error(`洛谷导入失败：${e}`);
    } finally {
      setIsImportingLuogu(false);
    }
  };

  const handleEditorChange = (value: string) => {
    const nextDirty = isSnapshotDirty(savedSnapshotRef.current, currentFilePath, frontmatterPrefix, value);
    setMarkdown(value);
    setIsDirty(nextDirty);
  };

  const applyLoadedMarkdown = (content: string, path: string | null) => {
    const loaded = splitLoadedMarkdown(content);
    savedSnapshotRef.current = {
      path,
      frontmatterPrefix: loaded.frontmatterPrefix,
      markdown: loaded.body,
    };
    setFrontmatterPrefix(loaded.frontmatterPrefix);
    setMarkdown(loaded.body);
    if (path) {
      setDisplayTitleForPath(path, parseFrontmatterFields(content).fields.title);
    }
    setIsDirty(false);
    if (loaded.warning) {
      toast.warning(loaded.warning);
    }
  };

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

    const nextFields = { ...frontmatter.fields, ...patch };
    const nextMarkdown = mergeFrontmatterFields(fullMarkdown, nextFields);
    if (nextMarkdown === fullMarkdown) return;
    const loaded = splitLoadedMarkdown(nextMarkdown);
    const nextDirty = isSnapshotDirty(savedSnapshotRef.current, currentFilePath, loaded.frontmatterPrefix, loaded.body);
    setFrontmatterPrefix(loaded.frontmatterPrefix);
    setMarkdown(loaded.body);
    if (Object.prototype.hasOwnProperty.call(patch, "title")) {
      setDisplayTitleForPath(currentFilePath, String(patch.title ?? ""));
    }
    setIsDirty(nextDirty);
  };

  const updateTagsFromInput = (value: string) => {
    const tags = value
      .split(",")
      .map(normalizeTagValue)
      .filter(Boolean);
    updateFrontmatter({ tags });
  };

  const handleApplyAiSuggestedTags = async (notePath: string, suggestedTags: string[]) => {
    if (!currentFilePath || currentFilePath !== notePath) {
      throw new Error("当前打开的笔记已变化，请切回原笔记后再应用");
    }
    if (!frontmatter.canMerge) {
      throw new Error(frontmatter.warning ?? "当前 frontmatter 暂不能通过表单改写");
    }
    if (!frontmatter.canEditTags) {
      throw new Error(frontmatter.warning ?? "当前 tags 暂不能通过表单改写");
    }

    const nextTags = mergeTagsStable(frontmatter.fields.tags, suggestedTags);
    if (nextTags.length === frontmatter.fields.tags.length) return;
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

    let from: number | null = null;
    let to: number | null = null;
    if (
      selectionRange &&
      Number.isFinite(selectionRange.from) &&
      Number.isFinite(selectionRange.to) &&
      selectionRange.from >= 0 &&
      selectionRange.to >= selectionRange.from &&
      selectionRange.to <= markdown.length &&
      markdown.slice(selectionRange.from, selectionRange.to) === originalText
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
        currentRange.to <= markdown.length &&
        markdown.slice(currentRange.from, currentRange.to) === originalText
      ) {
        from = currentRange.from;
        to = currentRange.to;
      }
    }

    if (from === null || to === null) {
      const firstIndex = markdown.indexOf(originalText);
      const lastIndex = markdown.lastIndexOf(originalText);
      if (firstIndex >= 0 && firstIndex === lastIndex) {
        from = firstIndex;
        to = firstIndex + originalText.length;
      }
    }

    if (from === null || to === null) {
      throw new Error("原选区已经变化，请重新选择文本后再润色。");
    }

    const nextMarkdown = `${markdown.slice(0, from)}${polishedText}${markdown.slice(to)}`;
    const nextDirty = isSnapshotDirty(savedSnapshotRef.current, currentFilePath, frontmatterPrefix, nextMarkdown);
    setMarkdown(nextMarkdown);
    setIsDirty(nextDirty);
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
    if (markdown !== originalBody) {
      throw new Error("当前笔记内容已经变化，请重新执行全文润色。");
    }

    const nextDirty = isSnapshotDirty(savedSnapshotRef.current, currentFilePath, frontmatterPrefix, polishedBody);
    setMarkdown(polishedBody);
    setIsDirty(nextDirty);
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
    setActiveWorkspaceTabId(path);
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
    setActiveTreeDirectoryPath(null);
    setActiveTreeFilePath(path);
    if (path === currentFilePath) {
      setActiveWorkspaceTabId(path);
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
    if (isDirty) {
      setPendingFileSelection({ path, closeSearchOnSuccess: options?.closeSearchOnSuccess ?? false });
      return false;
    }
    finishFileSelection(path, options?.closeSearchOnSuccess ?? false);
    return true;
  };

  const handleSelectOpenTab = (tab: OpenTab) => {
    if (tab.kind === "review") {
      setActiveWorkspaceTabId(tab.id);
      return;
    }
    handleSelectFile(tab.path);
  };

  const handleCloseOpenTab = (tab: OpenTab) => {
    if (tab.kind === "review") {
      setOpenReviewTabs((current) => current.filter((item) => item.id !== tab.id));
      if (activeWorkspaceTabId === tab.id) {
        setActiveWorkspaceTabId(currentFilePath ?? openTabPaths[0] ?? null);
      }
      return;
    }

    const path = tab.path;
    const tabIndex = openTabPaths.indexOf(path);
    if (tabIndex === -1) return;

    const isClosingActiveTab = path === currentFilePath;
    if (isClosingActiveTab && isDirty) {
      const ok = window.confirm("该笔记有未保存更改，确定关闭吗？");
      if (!ok) return;
    }

    const nextTabs = openTabPaths.filter((tabPath) => tabPath !== path);
    setOpenTabPaths(nextTabs);

    if (!isClosingActiveTab) return;

    setPendingFileSelection(null);
    setIsDirty(false);

    const nextPath = nextTabs[tabIndex] ?? nextTabs[tabIndex - 1] ?? null;
    if (nextPath) {
      finishFileSelection(nextPath, false);
    } else {
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

  const handleSaveCurrentNote = async () => {
    if (currentFilePath === null) {
      toast.info("请先打开一个笔记后再保存");
      return;
    }

    setIsSavingNote(true);
    try {
      const warning = await writeNote(currentFilePath, fullMarkdown);
      try {
        const savedContent = await readNote(currentFilePath);
        applyLoadedMarkdown(savedContent, currentFilePath);
      } catch (readError) {
        console.warn("Reload saved note failed:", readError);
        savedSnapshotRef.current = {
          path: currentFilePath,
          frontmatterPrefix,
          markdown,
        };
      }
      try {
        const pendingAssets = pendingAssetsByFile[currentFilePath] ?? [];
        const commitStatus = await commitNote(currentFilePath, pendingAssets);
        if (commitStatus === "committed") {
          showSavedToast("已保存并提交", warning);
        } else {
          showSavedToast("已保存", warning);
        }
        setPendingAssetsByFile((prev) => {
          if (!prev[currentFilePath]) return prev;
          const next = { ...prev };
          delete next[currentFilePath];
          return next;
        });
      } catch (commitError) {
        const message = `已保存，Git 提交失败：${commitError}`;
        if (warning) {
          toast.warning(`${message}（${warning}）`);
        } else {
          toast.warning(message);
        }
      }
      setIsDirty(false);
    } catch (err) {
      toast.error(`保存失败: ${err}`);
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

  const handleCloseWindow = async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      toast.error(`关闭窗口失败：${getErrorMessage(e)}`);
    }
  };

  const activateSettingsTarget = (target: SettingsTarget) => {
    setActiveSettingsTarget((current) => {
      if (current.type !== target.type) return target;
      if (target.type === "category" && current.type === "category") {
        return current.category === target.category ? current : target;
      }
      if (target.type === "page" && current.type === "page") {
        return current.page === target.page ? current : target;
      }
      return target;
    });
  };

  const openSettingsSection = (target: SettingsSection | SettingsCategory) => {
    const wasSettingsOpen = isAdvancedActionsOpen;
    setSettingsCenterRect((current) => getSafeOpenedSettingsCenterRect(current));
    if (!wasSettingsOpen) setExpandedSettingsGroups({});
    if (target in SETTINGS_SECTION_FALLBACK) {
      const category = target as SettingsCategory;
      if (category === "editor") {
        activateSettingsTarget({ type: "page", page: SETTINGS_SECTION_FALLBACK.editor });
      } else if (visibleSettingsCategoryIds.has(category as SettingsGroupId)) {
        activateSettingsTarget({ type: "category", category: category as SettingsGroupId });
        if (wasSettingsOpen) {
          setExpandedSettingsGroups((current) => (
            current[category] === true ? current : { ...current, [category]: true }
          ));
        }
      } else {
        activateSettingsTarget({ type: "category", category: "appearance" });
      }
      setSettingsView("main");
      setIsAdvancedActionsOpen(true);
      if (category === "ai" && !aiConfigDraft && !isLoadingAiConfig) {
        void ensureAiConfigLoadedForSettings();
      } else if (category === "diagnostics" && !aiConfigDraft && !isLoadingAiConfig) {
        setIsLoadingAiConfig(true);
        void refreshAiConfig()
          .catch((e) => toast.error(`AI 配置读取失败：${e}`))
          .finally(() => setIsLoadingAiConfig(false));
      }
      return;
    }
    const section = target as SettingsSection;
    if (!visibleSettingsSectionIds.has(section)) {
      activateSettingsTarget({ type: "category", category: "appearance" });
      setSettingsView("main");
      setIsAdvancedActionsOpen(true);
      return;
    }
    activateSettingsTarget({ type: "page", page: section });
    if (wasSettingsOpen) {
      setExpandedSettingsGroups((current) => {
        const groupId = SETTINGS_SECTION_LABELS[section]?.groupId;
        return groupId && current[groupId] !== true ? { ...current, [groupId]: true } : current;
      });
    }
    setSettingsView("main");
    setIsAdvancedActionsOpen(true);
    if (section.startsWith("ai-") && !aiConfigDraft && !isLoadingAiConfig) {
      void ensureAiConfigLoadedForSettings();
    } else if (section === "diagnostics-search" && !aiConfigDraft && !isLoadingAiConfig) {
      setIsLoadingAiConfig(true);
      void refreshAiConfig()
        .catch((e) => toast.error(`AI 配置读取失败：${e}`))
        .finally(() => setIsLoadingAiConfig(false));
    }
  };

  const openSettingsCenter = () => {
    setSettingsCenterRect((current) => getSafeOpenedSettingsCenterRect(current));
    setExpandedSettingsGroups({});
    activateSettingsTarget({ type: "category", category: "appearance" });
    setSettingsView("main");
    setIsAdvancedActionsOpen(true);
  };

  const toggleSettingsGroup = (groupId: string) => {
    setExpandedSettingsGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
  };

  const closeSettingsCenter = () => {
    if (hasAiConfigDraftChanges && !window.confirm("AI/API 管理有未保存更改，是否放弃并关闭设置中心？")) {
      return;
    }
    promptPolishRunRef.current += 1;
    setIsPolishingPrompt(false);
    if (hasAiConfigDraftChanges && aiConfig) {
      setAiConfigDraft(cloneAiConfig(aiConfig));
    }
    setPromptEditorReturnTarget(null);
    setExpandedSettingsGroups({});
    setIsAdvancedActionsOpen(false);
  };

  const closePromptEditorToSettings = () => {
    promptPolishRunRef.current += 1;
    setIsPolishingPrompt(false);
    setPromptPolishMessage(null);
    if (promptEditorReturnTarget) {
      activateSettingsTarget(promptEditorReturnTarget);
    } else {
      activateSettingsTarget({ type: "page", page: "ai-prompts" });
    }
    setSettingsView("main");
  };

  const handleSettingsCenterCloseRequest = () => {
    if (settingsView === "prompt-editor") {
      closePromptEditorToSettings();
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
    setIsAiSidebarOpen((open) => {
      if (open) setIsAiSidebarMaximized(false);
      return !open;
    });
  };

  const handleActivityBlog = () => {
    void handleOpenBlog();
  };

  const activityButtonClass = (_item: ActivityBarItem) =>
    cn(
      "app-activity-button relative flex h-12 w-12 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60",
      "disabled:pointer-events-none disabled:opacity-40",
    );

  // Ctrl+S / Cmd+S 保存当前笔记
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === "s")) return;
      e.preventDefault();
      if (isAdvancedActionsOpen && settingsView === "prompt-editor") {
        void handleSavePrompt();
        return;
      }
      void handleSaveCurrentNote();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSaveCurrentNote, isAdvancedActionsOpen, settingsView, selectedPromptFileName, promptContent, isLoadingPrompt, isSavingPrompt, isPolishingPrompt]);

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
    const root = document.documentElement;
    root.dataset.theme = appTheme;
    root.classList.toggle("dark", appTheme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, appTheme);
  }, [appTheme]);

  useEffect(() => {
    window.localStorage.setItem(UI_SCALE_STORAGE_KEY, String(uiScale));
  }, [uiScale]);

  useEffect(() => {
    window.localStorage.setItem(CONTENT_ZOOM_STORAGE_KEY, String(contentZoom));
  }, [contentZoom]);

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
    window.localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, developerModeEnabled ? "true" : "false");
    const activeTargetVisible = activeSettingsTarget.type === "category"
      ? visibleSettingsCategoryIds.has(activeSettingsTarget.category)
      : visibleSettingsSectionIds.has(activeSettingsTarget.page);
    if (!activeTargetVisible) {
      setActiveSettingsTarget({ type: "category", category: visibleSettingsTree[0]?.id ?? "appearance" });
      setSettingsView("main");
    }
  }, [activeSettingsTarget, developerModeEnabled, visibleSettingsCategoryIds, visibleSettingsSectionIds, visibleSettingsTree]);

  useEffect(() => {
    if (!isAdvancedActionsOpen) return;
    setSettingsCenterRect((current) => getSafeOpenedSettingsCenterRect(current));
  }, [isAdvancedActionsOpen]);

  useEffect(() => {
    if (settingsView === "main") {
      const settingsContent = settingsContentRef.current;
      if (settingsContent) settingsContent.scrollTop = 0;
    }
  }, [settingsView]);

  useEffect(() => {
    if (settingsView !== "prompt-editor" || selectedPromptFileName || isLoadingPrompt) return;
    setSettingsView("main");
    setActiveSettingsTarget({ type: "page", page: "ai-prompts" });
  }, [isLoadingPrompt, selectedPromptFileName, settingsView]);

  useEffect(() => {
    window.localStorage.setItem(LEFT_SIDEBAR_WIDTH_STORAGE_KEY, String(leftSidebarWidth));
  }, [leftSidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(AI_SIDEBAR_WIDTH_STORAGE_KEY, String(aiSidebarWidth));
  }, [aiSidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(EDITOR_PREVIEW_RATIO_STORAGE_KEY, String(editorPreviewRatio));
  }, [editorPreviewRatio]);

  useEffect(() => {
    const handleResize = () => {
      setAiSidebarWidth((currentWidth) => clampAiSidebarWidth(currentWidth));
      setSettingsCenterRect((currentRect) => getSafeOpenedSettingsCenterRect(currentRect));
      const containerWidth = editorPreviewContainerRef.current?.getBoundingClientRect().width;
      setEditorPreviewRatio((currentRatio) => clampEditorPreviewRatio(currentRatio, containerWidth));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
        setLuoguConfigUid(config.luogu.uid);
        setLuoguConfigClientId(config.luogu.client_id);
        setLuoguConfigLastSubmissionId(
          config.luogu.last_submission_id === null ? "" : String(config.luogu.last_submission_id),
        );
        setLuoguConfigAiConfigured(
          config.ai.base_url.trim() !== "" &&
          config.ai.api_key.trim() !== "" &&
          config.ai.model.trim() !== "",
        );
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
    if (!isSearchOpen) return;

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isSearchOpen]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (!isSearchOpen || query === "") {
      searchRequestSeqRef.current += 1;
      setBackendSearchResults([]);
      setSearchError(null);
      setIsSearchLoading(false);
      return;
    }

    const requestId = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestId;
    setSearchError(null);
    setBackendSearchResults([]);
    setIsSearchLoading(true);

    const timer = window.setTimeout(() => {
      searchNotes(query)
        .then((results) => {
          if (searchRequestSeqRef.current !== requestId) return;
          setBackendSearchResults(results);
          setSearchError(null);
        })
        .catch((e: Error) => {
          if (searchRequestSeqRef.current !== requestId) return;
          setBackendSearchResults([]);
          setSearchError(e.message || "搜索失败");
        })
        .finally(() => {
          if (searchRequestSeqRef.current === requestId) {
            setIsSearchLoading(false);
          }
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isSearchOpen, searchQuery]);

  // 挂载时从后端加载笔记列表
  useEffect(() => {
    listNotes()
      .then((loaded) => {
        setFiles(loaded);
        setHasLoadedNotes(true);
      })
      .catch((e: Error) => console.error("加载笔记列表失败：", e.message));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen("notes-changed", () => {
      listNotes()
        .then((updated) => {
          if (!cancelled) {
            setFiles(updated);
            setHasLoadedNotes(true);
          }
        })
        .catch((e: Error) =>
          console.error("收到 notes-changed 后刷新列表失败：", e.message),
        );
    })
      .then((fn) => {
        if (cancelled) {
          // 组件已卸载，立即取消订阅
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e: Error) =>
        console.error("注册 notes-changed 监听失败：", e.message),
      );

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedNotes) return;

    const validPaths = new Set(noteFiles.map((file) => file.path));
    setOpenTabPaths((current) => current.filter((path) => validPaths.has(path)));

    if (currentFilePath && !validPaths.has(currentFilePath)) {
      setCurrentFilePath(null);
    }
  }, [currentFilePath, noteFiles, hasLoadedNotes]);

  useEffect(() => {
    if (!currentFilePath) return;

    setOpenTabPaths((current) => {
      if (current.includes(currentFilePath)) return current;
      return [...current, currentFilePath];
    });
  }, [currentFilePath]);

  useEffect(() => {
    if (!currentFilePath) return;
    const isReviewActive = openReviewTabs.some((tab) => tab.id === activeWorkspaceTabId);
    if (!activeWorkspaceTabId || (!isReviewActive && activeWorkspaceTabId !== currentFilePath)) {
      setActiveWorkspaceTabId(currentFilePath);
    }
  }, [activeWorkspaceTabId, currentFilePath, openReviewTabs]);

  useEffect(() => {
    if (!hasLoadedNotes || hasRestoredOpenTabsRef.current) return;

    const validPaths = new Set(noteFiles.map((file) => file.path));
    const restoredPaths = openTabPaths.filter((path) => validPaths.has(path));
    const storedActivePath = initialOpenTabsActivePathRef.current;
    const activePath =
      storedActivePath && validPaths.has(storedActivePath)
        ? storedActivePath
        : restoredPaths[0] ?? null;

    hasRestoredOpenTabsRef.current = true;
    if (restoredPaths.length !== openTabPaths.length) {
      setOpenTabPaths(restoredPaths);
    }
    if (!currentFilePath && activePath) {
      setCurrentFilePath(activePath);
    }
  }, [currentFilePath, noteFiles, hasLoadedNotes, openTabPaths]);

  useEffect(() => {
    window.localStorage.setItem(OPEN_TABS_STORAGE_KEY, JSON.stringify(openTabPaths));
  }, [openTabPaths]);

  useEffect(() => {
    if (currentFilePath) {
      window.localStorage.setItem(OPEN_TABS_ACTIVE_STORAGE_KEY, currentFilePath);
    } else {
      window.localStorage.removeItem(OPEN_TABS_ACTIVE_STORAGE_KEY);
    }
  }, [currentFilePath]);

  // 当选中文件变化时，从后端读取内容
  // 使用 cancelled flag 防御 race condition：
  // 快速连续点击不同文件时，后到的响应可能比先到的早 resolve，
  // cancelled 确保只有最新一次 readNote 的结果会被 setMarkdown 采用。
  useEffect(() => {
    if (currentFilePath === null) {
      // 无选中文件时恢复欢迎内容
      setFrontmatterPrefix("");
      setMarkdown(INITIAL_MARKDOWN);
      savedSnapshotRef.current = {
        path: null,
        frontmatterPrefix: "",
        markdown: INITIAL_MARKDOWN,
      };
      setIsDirty(false);
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
        }
      })
      .catch((e: Error) => {
        if (!cancelled) console.error("读取笔记失败：", e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [currentFilePath]);

  const folderNameValidationMessage =
    dialogMode === "create-folder" && dialogValue.trim()
      ? validateNamePart(dialogValue, "folder")
      : null;
  const folderParentValidationMessage =
    dialogMode === "create-folder" && folderParentDirectory.trim()
      ? validateDirectoryPathInput(folderParentDirectory)
      : null;
  const folderDialogHelpText =
    folderNameValidationMessage ??
    folderParentValidationMessage ??
    "名称不能包含路径穿越或 Windows 非法字符";
  const canConfirmFolderDialog =
    dialogMode === "create-folder" &&
    Boolean(dialogValue.trim()) &&
    !folderNameValidationMessage &&
    !folderParentValidationMessage;

  return (
    <>
    <Toaster theme={appTheme} position={isLuoguDialogOpen ? "top-right" : "bottom-right"} />
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
                    className="grid w-full min-w-0 gap-1 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/35 focus-visible:border-ring focus-visible:bg-accent/35 focus-visible:outline-none"
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
    <Dialog open={dialogMode === "create" || dialogMode === "rename"} onOpenChange={(open) => !open && closeDialog()}>
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
                        "flex min-h-16 items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40",
                        newNoteLocationOption === option.id ? "border-ring bg-accent/50" : "border-border bg-background",
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
                          "block w-full truncate px-2 py-1 text-left text-xs transition-colors hover:bg-accent/40",
                          newNoteCustomDirectory.trim() === "" && "bg-accent/45 text-accent-foreground",
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
                            "block w-full truncate px-2 py-1 text-left font-mono text-xs transition-colors hover:bg-accent/40",
                            newNoteCustomDirectory.trim() === directory && "bg-accent/45 text-accent-foreground",
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
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent/45",
                          selected ? "border-ring bg-primary text-primary-foreground" : "border-border bg-background text-foreground/90",
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
                  : "创建空白 Markdown 文件，只写入 title、tags、createdAt frontmatter"}
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
            <div>不要把 __client_id 发给别人，也不要提交到 Git。</div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="luogu-config-uid">UID</Label>
            <Input
              id="luogu-config-uid"
              value={luoguConfigUid}
              disabled={isLoadingLuoguConfig || isSavingLuoguConfig}
              placeholder="洛谷 _uid"
              onChange={(e) => setLuoguConfigUid(e.target.value)}
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
              onChange={(e) => setLuoguConfigClientId(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="luogu-config-last-submission-id">last_submission_id</Label>
            <Input
              id="luogu-config-last-submission-id"
              value={luoguConfigLastSubmissionId}
              disabled={isLoadingLuoguConfig || isSavingLuoguConfig}
              placeholder="留空表示尚未同步"
              inputMode="numeric"
              onChange={(e) => setLuoguConfigLastSubmissionId(e.target.value)}
            />
          </div>
          {luoguConnectionResult && (
            <div className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
              <div className="font-medium text-foreground">
                本次 dry run 拉到 {luoguConnectionResult.fetchedCount} 条提交
              </div>
              <div className="grid gap-1 text-muted-foreground">
                {luoguConnectionResult.submissions.length === 0 ? (
                  <div>暂无提交预览</div>
                ) : (
                  luoguConnectionResult.submissions.map((submission) => (
                    <div key={submission.submissionId} className="font-mono">
                      #{submission.submissionId} {submission.problemId} {submission.problemTitle} · {submission.status} · {submission.submitTime}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
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
                  AI 跳过 {luoguSyncResult.aiSkippedCount} 条，AI 失败 {luoguSyncResult.aiFailedCount} 条，跳过无 insight {luoguSyncResult.skippedNoInsight} 条，已存在 {luoguSyncResult.skippedExisting} 条，总失败 {luoguSyncResult.failedCount} 条
                </div>
                <div>
                  {luoguSyncResult.reachedLastSubmissionId ? "已触达 last_submission_id" : "未触达 last_submission_id"}
                </div>
                <div>
                  last_submission_id: {luoguSyncResult.updatedLastSubmissionId ?? "未更新"}
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
            variant="outline"
            onClick={() => {
              setIsLuoguSettingsOpen(false);
              void openLuoguDialog();
            }}
            disabled={isLoadingLuoguConfig || isSavingLuoguConfig || isTestingLuoguConnection || isSyncingLuogu}
          >
            打开导入中心
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-8 backdrop-blur-sm">
        <section
          className="flex overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-2xl"
          style={{
            width: "min(1280px, calc(100vw - 32px))",
            height: "min(90vh, 880px)",
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="grid shrink-0 gap-4 border-b border-border bg-muted/20 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-tight">洛谷导入中心</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    扫描提交、按规则生成预览，确认后再写入本地笔记。
                  </p>
                </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={closeLuoguDialog}
                disabled={isImportingLuogu || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isScanningLuoguPreview || isSyncingLuogu}
                aria-label="关闭洛谷导入中心"
              >
                <X className="h-4 w-4" />
              </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                {["扫描", "选择", "生成预览", "审阅", "写入"].map((label, index) => (
                  <div
                    key={label}
                    className={cn(
                      "flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-xs",
                      index <= luoguWorkflowStepIndex
                        ? "border-primary/35 bg-primary/10 text-foreground"
                        : "border-border bg-background/45 text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        index <= luoguWorkflowStepIndex
                          ? "border-primary/60 bg-primary/15 text-foreground"
                          : "border-border bg-muted/20 text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="truncate">{label}</span>
                  </div>
                ))}
              </div>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[184px_minmax(0,1fr)] overflow-hidden">
              <aside className="min-h-0 overflow-auto border-r border-border bg-muted/10 p-2.5">
                {[
                  { id: "scan" as const, label: "提交导入", description: "扫描、预览、写入" },
                  { id: "rules" as const, label: "导入规则", description: "候选、去重、草稿" },
                  { id: "account" as const, label: "账户状态", description: "Cookie、AI、进度" },
                  { id: "manual" as const, label: "手动导入", description: "粘贴源码导入" },
                  { id: "advanced" as const, label: "高级操作", description: "旧版一键同步" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={
                      luoguImportCenterTab === item.id
                        ? "mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-left shadow-sm"
                        : "mb-2 w-full rounded-md border border-transparent px-3 py-2 text-left text-muted-foreground hover:border-border/60 hover:bg-muted/30 hover:text-foreground"
                    }
                    onClick={() => setLuoguImportCenterTab(item.id)}
                    disabled={isImportingLuogu || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isScanningLuoguPreview || isSyncingLuogu}
                  >
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{item.description}</div>
                  </button>
                ))}
              </aside>

              <main className="min-h-0 min-w-0 overflow-hidden bg-background/60">
                {luoguImportCenterTab === "scan" && (
                  luoguImportStep === "scan" ? (
                  <div className="grid h-full min-h-0 gap-4 p-4 lg:grid-cols-[300px_minmax(0,1fr)]">
                    <div className="min-h-0 overflow-auto pr-1">
                      <div className="grid gap-4">
                        <section className="grid gap-3 rounded-md border border-border bg-card/70 p-4 text-xs">
                          <div>
                            <div className="text-sm font-medium text-foreground">扫描范围</div>
                            <div className="mt-1 text-muted-foreground">选择读取最近提交的方式；扫描不会写入本地笔记。</div>
                          </div>
                          <div className="grid grid-cols-2 rounded-md border border-border bg-muted/20 p-1">
                            <button
                              type="button"
                              className={luoguScanMode === "count" ? "rounded-sm bg-background px-3 py-1.5 text-foreground shadow-sm" : "px-3 py-1.5 text-muted-foreground hover:text-foreground"}
                              onClick={() => setLuoguScanMode("count")}
                              disabled={isScanningLuoguPreview}
                            >
                              按数量
                            </button>
                            <button
                              type="button"
                              className={luoguScanMode === "days" ? "rounded-sm bg-background px-3 py-1.5 text-foreground shadow-sm" : "px-3 py-1.5 text-muted-foreground hover:text-foreground"}
                              onClick={() => setLuoguScanMode("days")}
                              disabled={isScanningLuoguPreview}
                            >
                              按时间
                            </button>
                          </div>
                          {luoguScanMode === "count" ? (
                            <div className="grid grid-cols-2 gap-2">
                              {LUOGU_SCAN_COUNT_OPTIONS.map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  className={luoguScanCountLimit === option ? "rounded-md border border-primary/60 bg-primary/15 px-3 py-1.5 text-foreground" : "rounded-md border border-border bg-background/50 px-3 py-1.5 text-muted-foreground hover:text-foreground"}
                                  onClick={() => setLuoguScanCountLimit(option)}
                                  disabled={isScanningLuoguPreview}
                                >
                                  最近 {option} 条
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              {LUOGU_SCAN_DAYS_OPTIONS.map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  className={luoguScanDaysLimit === option ? "rounded-md border border-primary/60 bg-primary/15 px-3 py-1.5 text-foreground" : "rounded-md border border-border bg-background/50 px-3 py-1.5 text-muted-foreground hover:text-foreground"}
                                  onClick={() => setLuoguScanDaysLimit(option)}
                                  disabled={isScanningLuoguPreview}
                                >
                                  最近 {option} 天
                                </button>
                              ))}
                            </div>
                          )}
                        </section>

                        <section className="grid gap-3 rounded-md border border-border bg-card/70 p-4 text-xs">
                          <div className="text-sm font-medium text-foreground">账户状态</div>
                          <div className="grid gap-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">_uid</span>
                              <span className={luoguConfigUid.trim() ? "text-emerald-400" : "text-amber-400"}>
                                {isLoadingLuoguConfig ? "读取中" : luoguConfigUid.trim() ? "已配置" : "未配置"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">__client_id</span>
                              <span className={luoguConfigClientId.trim() ? "text-emerald-400" : "text-amber-400"}>
                                {isLoadingLuoguConfig ? "读取中" : luoguConfigClientId.trim() ? "已配置" : "未配置"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">AI</span>
                              <span className={luoguConfigAiConfigured ? "text-emerald-400" : "text-amber-400"}>
                                {isLoadingLuoguConfig ? "读取中" : luoguConfigAiConfigured ? "已配置" : "未配置"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">last_submission_id</span>
                              <span className="truncate font-mono text-foreground">
                                {isLoadingLuoguConfig ? "读取中" : luoguConfigLastSubmissionId.trim() || "未设置"}
                              </span>
                            </div>
                          </div>
                          <Button variant="outline" size="sm" className="justify-start" onClick={() => setLuoguImportCenterTab("account")}>
                            管理同步位置
                          </Button>
                        </section>

                        <section className="grid gap-2 rounded-md border border-border bg-card/70 p-4 text-xs">
                          <div className="text-sm font-medium text-foreground">导入规则</div>
                          <div className="leading-5 text-muted-foreground">{luoguRuleSummary}</div>
                          <Button variant="outline" size="sm" className="justify-start" onClick={() => setLuoguImportCenterTab("rules")}>
                            调整规则
                          </Button>
                        </section>

                        <section className="rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                          <div className="font-medium text-foreground">扫描是只读步骤</div>
                          <div>扫描只读取提交列表，不抓源码、不调用 AI、不写 notes、不 commit，也不会推进 last_submission_id。</div>
                          <div>多页扫描会自动放慢请求，最多扫描 {LUOGU_SCAN_MAX_PAGES} 页。</div>
                        </section>
                      </div>
                    </div>

                    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card/70">
                      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">扫描结果</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {luoguScanProgress
                              ? `正在扫描第 ${luoguScanProgress.currentPage} 页，已发现 ${luoguScanProgress.foundCount} 条提交；范围：${luoguScanProgress.rangeLabel}`
                              : luoguScanSummary
                                ? `扫描 ${luoguScanSummary.scannedPages} 页，找到 ${luoguScanSummary.foundCount} 条，可候选 ${luoguScanSummary.candidateCount} 条，非 AC / 旧提交 ${luoguScanSummary.skippedCount} 条；范围：${luoguScanSummary.rangeLabel}`
                                : luoguPreviewResult
                                  ? `本次找到 ${luoguPreviewResult.fetchedCount} 条；last_submission_id: ${luoguPreviewResult.lastSubmissionId ?? "未设置"}`
                                  : `默认最近 20 条；多页扫描每页间隔 ${LUOGU_SCAN_PAGE_DELAY_MS}ms。`}
                            {luoguScanProgress?.waiting && (
                              <span className="ml-2 text-foreground">
                                每页请求之间会短暂停顿，避免过快访问洛谷
                              </span>
                            )}
                            {luoguPrepareProgress && (
                              <span className="ml-2 text-foreground">
                                preparing preview {luoguPrepareProgress.current} / {luoguPrepareProgress.total}
                              </span>
                            )}
                            {luoguWriteProgress && (
                              <span className="ml-2 text-foreground">
                                writing {luoguWriteProgress.current} / {luoguWriteProgress.total}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          <div className="max-w-[360px] truncate" title={luoguRuleSummary}>{luoguRuleSummary}</div>
                          <div>已选 {selectedLuoguImportCount} 条</div>
                          <div>
                            需生成 {luoguPrepareQueueSubmissions.length} / 已有预览 {luoguReusablePreviewCount} / 忽略 {luoguIgnoredPreviewSubmissions.length}
                          </div>
                        </div>
                        {luoguPrepareProgress && (
                          <div className="basis-full rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium">
                                {isStoppingLuoguPrepare ? "正在停止生成" : "正在生成预览"} {luoguPrepareProgress.current} / {luoguPrepareProgress.total}
                              </span>
                              <span className="font-mono text-muted-foreground">
                                {currentlyPreparingLuoguSubmission
                                  ? `${currentlyPreparingLuoguSubmission.problemId || "未知题号"} · ${currentlyPreparingLuoguSubmission.submissionId}`
                                  : currentlyPreparingLuoguId ?? "等待下一条"}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-muted-foreground">
                                单篇串行生成；停止后会保留已完成预览，未生成项可稍后继续。
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={handleStopPreparingLuoguPreviews}
                                disabled={isStoppingLuoguPrepare}
                              >
                                {isStoppingLuoguPrepare ? "停止中..." : "停止生成"}
                              </Button>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/80">
                              <div
                                className="h-full rounded-full bg-primary transition-[width]"
                                style={{ width: `${Math.max(5, Math.round((luoguPrepareProgress.current / luoguPrepareProgress.total) * 100))}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {!luoguPreviewResult ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
                          点击底部“扫描最近提交”后，这里会显示可勾选的提交表格。
                        </div>
                      ) : luoguPreviewResult.submissions.length === 0 ? (
                        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">暂无提交预览</div>
                      ) : (
                        <div className="min-h-0 flex-1 overflow-auto">
                          <table className="w-full min-w-[920px] text-left text-xs">
                            <thead className="sticky top-0 z-10 bg-card text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border))]">
                              <tr>
                                <th className="w-12 px-4 py-3 font-medium">选</th>
                                <th className="w-40 px-3 py-3 font-medium">submission id</th>
                                <th className="min-w-64 px-3 py-3 font-medium">problem</th>
                                <th className="w-32 px-3 py-3 font-medium">status</th>
                                <th className="w-44 px-3 py-3 font-medium">time</th>
                                <th className="min-w-64 px-3 py-3 font-medium">import status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {luoguPreviewResult.submissions.map((submission) => {
                                const candidateState = luoguSubmissionCandidateStates[submission.submissionId] ?? { canSelect: false, statusLabel: submission.statusLabel };
                                const canSelect = candidateState.canSelect;
                                const prepared = luoguPreparedNotesById[submission.submissionId];
                                const prepareError = luoguPrepareErrorsById[submission.submissionId];
                                const writeResult = luoguWriteResultsById[submission.submissionId];
                                const prepareStatus = luoguPrepareStatusesById[submission.submissionId];
                                const statusText = getLuoguPreviewWorkflowStatusText(
                                  submission,
                                  prepared,
                                  prepareError,
                                  writeResult,
                                  prepareStatus,
                                  currentlyPreparingLuoguId,
                                  currentlyWritingLuoguId,
                                  selectedLuoguSubmissionIds,
                                  skippedLuoguSubmissionIds,
                                );
                                const visibleStatusText = statusText === submission.statusLabel ? candidateState.statusLabel : statusText;
                                return (
                                  <tr
                                    key={submission.submissionId}
                                    className="border-b border-border/60 last:border-0 hover:bg-muted/20"
                                    onClick={() => {
                                      if (prepared && !prepared.skipped && prepared.markdown.trim()) {
                                        setActiveLuoguPreparedPreviewId(submission.submissionId);
                                      }
                                    }}
                                  >
                                    <td className="px-4 py-3">
                                      <input
                                        type="checkbox"
                                        checked={selectedLuoguSubmissionIds.has(submission.submissionId)}
                                        disabled={!canSelect || (isPreparingSelectedLuogu || isWritingPreparedLuogu)}
                                        className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                                        aria-label={`选择提交 ${submission.submissionId}`}
                                        onChange={() => toggleLuoguSubmissionSelection(submission)}
                                      />
                                    </td>
                                    <td className="px-3 py-3 font-mono text-foreground">{submission.submissionId}</td>
                                    <td className="px-3 py-3">
                                      <div className="font-mono text-foreground">{submission.problemId || "未知题号"}</div>
                                      <div className="mt-0.5 max-w-[360px] truncate text-muted-foreground">{submission.problemTitle || "未读取到标题"}</div>
                                    </td>
                                    <td className={submission.isAc ? "px-3 py-3 text-emerald-400" : "px-3 py-3 text-muted-foreground"}>
                                      {submission.status || "unknown"}
                                    </td>
                                    <td className="px-3 py-3 font-mono text-muted-foreground">{submission.submitTime || "未知"}</td>
                                    <td className={(writeResult?.failed || prepareError || prepared?.aiStatus === "failed") ? "px-3 py-3 text-amber-400" : "px-3 py-3 text-foreground"}>
                                      <div className="max-w-[360px] truncate" title={visibleStatusText}>{visibleStatusText}</div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </div>
                  ) : (
                    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
                      <section className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card/70 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">审阅预览</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {luoguPrepareProgress
                              ? `正在生成预览 ${luoguPrepareProgress.current} / ${luoguPrepareProgress.total}`
                              : luoguWriteProgress
                                ? `正在写入 ${luoguWriteProgress.current} / ${luoguWriteProgress.total}`
                                : `已生成 ${preparedLuoguNotes.length} 个预览，可写入 ${writableLuoguPreparedNotes.length} 个。写入使用 create_new，不覆盖已有文件。`}
                          </div>
                          {luoguPrepareProgress && (
                            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-xs text-foreground">
                              <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1">
                                正在处理
                              </span>
                              <span className="min-w-0 truncate font-mono text-muted-foreground">
                                {currentlyPreparingLuoguSubmission
                                  ? `${currentlyPreparingLuoguSubmission.problemId || "未知题号"} · ${currentlyPreparingLuoguSubmission.problemTitle || "未读取到标题"} · ${currentlyPreparingLuoguSubmission.submissionId}`
                                  : currentlyPreparingLuoguId ?? "等待下一条提交"}
                              </span>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => setLuoguImportStep("scan")}
                          disabled={isPreparingSelectedLuogu || isWritingPreparedLuogu}
                        >
                          返回选择提交
                        </Button>
                      </section>

                      {selectedLuoguPreviewSubmissions.length === 0 ? (
                        <section className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-border bg-card/70 text-sm text-muted-foreground">
                          还没有生成预览。请返回选择提交后点击“生成预览”。
                        </section>
                      ) : (
                        <section className="grid min-h-0 grid-cols-[minmax(260px,320px)_minmax(0,1fr)] overflow-hidden rounded-md border border-border bg-card/70 max-lg:grid-cols-1 max-lg:grid-rows-[minmax(180px,0.34fr)_minmax(0,1fr)]">
                          <div className="min-h-0 min-w-0 overflow-auto border-r border-border bg-muted/10 max-lg:border-b max-lg:border-r-0">
                            <div className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2">
                              <div className="text-xs font-medium text-foreground">可审阅 / 可写入</div>
                              <div className="mt-0.5 text-[11px] text-muted-foreground">
                                ready {luoguReadyPreviewSubmissions.length} · failed {luoguFailedPreviewSubmissions.length} · skipped/ignored {luoguIgnoredPreviewSubmissions.length}
                              </div>
                            </div>
                            <div className="grid gap-3 p-2">
                              <div className="grid gap-1">
                                {luoguReadyPreviewSubmissions.length === 0 ? (
                                  <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs leading-5 text-muted-foreground">
                                    {isPreparingSelectedLuogu
                                      ? "正在生成第一条可审阅预览，完成后会出现在这里。"
                                      : "还没有可审阅预览。失败和跳过项会在下方单独显示。"}
                                  </div>
                                ) : (
                                  luoguReadyPreviewSubmissions.map((submission) => {
                                    const prepared = luoguPreparedNotesById[submission.submissionId];
                                    const writeResult = luoguWriteResultsById[submission.submissionId];
                                    const statusText = getLuoguPreviewWorkflowStatusText(
                                      submission,
                                      prepared,
                                      undefined,
                                      writeResult,
                                      luoguPrepareStatusesById[submission.submissionId],
                                      currentlyPreparingLuoguId,
                                      currentlyWritingLuoguId,
                                      selectedLuoguSubmissionIds,
                                      skippedLuoguSubmissionIds,
                                    );
                                    return (
                                      <button
                                        key={submission.submissionId}
                                        type="button"
                                        className={
                                          activeLuoguPreparedPreview?.submissionId === submission.submissionId
                                            ? "w-full rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-left shadow-sm"
                                            : "w-full rounded-md border border-transparent px-3 py-2 text-left hover:border-border/70 hover:bg-muted/30"
                                        }
                                        onClick={() => setActiveLuoguPreparedPreviewId(submission.submissionId)}
                                      >
                                        <div className="min-w-0">
                                          <div className="truncate text-sm font-medium text-foreground">
                                            {submission.problemId || "未知题号"} · {submission.problemTitle || "未读取到标题"}
                                          </div>
                                          <div className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs">
                                            <span className="truncate font-mono text-muted-foreground">{submission.submissionId}</span>
                                            <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-200">
                                              可写入
                                            </span>
                                          </div>
                                          <div
                                            className={prepared?.draftFallback ? "mt-1 truncate text-xs text-amber-200" : "mt-1 truncate text-xs text-muted-foreground"}
                                            title={statusText}
                                          >
                                            {statusText}
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })
                                )}
                              </div>

                              {luoguPrepareProgress && (
                                <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>正在生成</span>
                                    <span>{luoguPrepareProgress.current} / {luoguPrepareProgress.total}</span>
                                  </div>
                                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/80">
                                    <div
                                      className="h-full rounded-full bg-primary transition-[width]"
                                      style={{ width: `${Math.max(5, Math.round((luoguPrepareProgress.current / luoguPrepareProgress.total) * 100))}%` }}
                                    />
                                  </div>
                                </div>
                              )}

                              {luoguFailedPreviewSubmissions.length > 0 && (
                                <details open className="rounded-md border border-amber-500/30 bg-amber-500/10">
                                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-amber-200">
                                    失败 {luoguFailedPreviewSubmissions.length}
                                  </summary>
                                  <div className="grid gap-1 border-t border-amber-500/20 p-2">
                                    {luoguFailedPreviewSubmissions.map((submission) => {
                                      const prepared = luoguPreparedNotesById[submission.submissionId];
                                      const prepareError = luoguPrepareErrorsById[submission.submissionId];
                                      const statusText = getLuoguPreviewWorkflowStatusText(
                                        submission,
                                        prepared,
                                        prepareError,
                                        luoguWriteResultsById[submission.submissionId],
                                        luoguPrepareStatusesById[submission.submissionId],
                                        currentlyPreparingLuoguId,
                                        currentlyWritingLuoguId,
                                        selectedLuoguSubmissionIds,
                                        skippedLuoguSubmissionIds,
                                      );
                                      return (
                                        <div key={submission.submissionId} className="rounded border border-amber-500/20 bg-background/40 px-2 py-2 text-xs">
                                          <div className="truncate font-medium text-foreground">
                                            {submission.problemId || "未知题号"} · {submission.problemTitle || "未读取到标题"}
                                          </div>
                                          <div className="mt-1 truncate font-mono text-muted-foreground">{submission.submissionId}</div>
                                          <div className="mt-1 line-clamp-2 text-amber-200" title={statusText}>{statusText}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </details>
                              )}

                              {luoguIgnoredPreviewSubmissions.length > 0 && (
                                <details className="rounded-md border border-border bg-background/35">
                                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
                                    跳过 / 忽略 {luoguIgnoredPreviewSubmissions.length}
                                  </summary>
                                  <div className="grid gap-1 border-t border-border p-2">
                                    {luoguIgnoredPreviewSubmissions.map((submission) => {
                                      const candidateState = luoguSubmissionCandidateStates[submission.submissionId];
                                      const prepared = luoguPreparedNotesById[submission.submissionId];
                                      const statusText = getLuoguPreviewWorkflowStatusText(
                                        submission,
                                        prepared,
                                        undefined,
                                        luoguWriteResultsById[submission.submissionId],
                                        luoguPrepareStatusesById[submission.submissionId],
                                        currentlyPreparingLuoguId,
                                        currentlyWritingLuoguId,
                                        selectedLuoguSubmissionIds,
                                        skippedLuoguSubmissionIds,
                                      );
                                      const reason = skippedLuoguSubmissionIds.has(submission.submissionId)
                                        ? "已跳过"
                                        : prepared?.skipped
                                          ? statusText
                                          : candidateState?.statusLabel ?? "不符合当前规则";
                                      return (
                                        <div key={submission.submissionId} className="rounded border border-border/60 bg-muted/10 px-2 py-2 text-xs">
                                          <div className="truncate text-foreground">
                                            {submission.problemId || "未知题号"} · {submission.problemTitle || "未读取到标题"}
                                          </div>
                                          <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                                            <span className="truncate font-mono text-muted-foreground">{submission.submissionId}</span>
                                            <span className="shrink-0 rounded border border-border bg-muted/20 px-1.5 py-0.5 text-muted-foreground">不写入</span>
                                          </div>
                                          <div className="mt-1 line-clamp-2 text-muted-foreground" title={reason}>{reason}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </details>
                              )}
                            </div>
                          </div>

                          {activeLuoguPreparedPreview ? (
                            <div className="flex min-h-0 min-w-0 flex-col">
                              <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-xs text-muted-foreground">建议写入路径</div>
                                    <div className="mt-1 break-all font-mono text-sm text-foreground">
                                      {activeLuoguPreparedPreview.suggestedRelativePath}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 flex-wrap gap-2 text-xs">
                                    <span className={activeLuoguPreparedPreview.draftFallback ? "rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-200" : "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-200"}>
                                      {activeLuoguPreparedPreview.draftFallback ? "草稿预览" : "AI 整理预览"}
                                    </span>
                                    <span className="rounded-md border border-border bg-background/70 px-2 py-1 text-muted-foreground">
                                      {activeLuoguPreparedPreview.aiStatus}
                                    </span>
                                  </div>
                                </div>
                                {activeLuoguPreparedPreview.reason && (
                                  <div className="mt-2 line-clamp-2 text-xs text-muted-foreground" title={activeLuoguPreparedPreview.reason}>
                                    {activeLuoguPreparedPreview.reason}
                                  </div>
                                )}
                                {activeLuoguPreparedPreview.existing && (
                                  <div className="mt-2 text-xs text-amber-300">目标文件已存在；写入阶段不会覆盖。</div>
                                )}
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2 border-b border-border bg-card px-4 py-2">
                                {[
                                  { id: "rendered" as const, label: "渲染预览" },
                                  { id: "markdown" as const, label: "Markdown 源文" },
                                  { id: "source" as const, label: "提交源码" },
                                ].map((tab) => (
                                  <button
                                    key={tab.id}
                                    type="button"
                                    className={
                                      activeLuoguPreviewDetailTab === tab.id
                                        ? "rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground"
                                        : "rounded-md border border-transparent px-3 py-1.5 text-xs text-muted-foreground hover:border-border/70 hover:bg-muted/30 hover:text-foreground"
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
                                <textarea
                                  readOnly
                                  value={activeLuoguPreparedPreview.markdown}
                                  className="min-h-0 w-full flex-1 resize-none border-0 bg-background/70 p-4 font-mono text-xs leading-5 text-foreground outline-none"
                                  placeholder="Prepared Markdown will appear here. This preview is read-only."
                                />
                              )}
                              {activeLuoguPreviewDetailTab === "source" && (
                                <textarea
                                  readOnly
                                  value={activeLuoguPreparedPreview.sourceCode}
                                  className="min-h-0 w-full flex-1 resize-none border-0 bg-background/70 p-4 font-mono text-xs leading-5 text-foreground outline-none"
                                  placeholder="这条 prepare 结果没有返回提交源码。"
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

                {luoguImportCenterTab === "rules" && (
                  <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-5">
                    <section className="rounded-md border border-border bg-card/70 p-4">
                      <div className="text-sm font-medium text-foreground">导入规则</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        这些规则只在当前导入中心会话内生效，不会写入配置文件。
                      </div>
                      <div className="mt-4 grid gap-4 text-sm">
                        <label className="flex items-start gap-3 rounded-md border border-border bg-background/50 p-3">
                          <input
                            type="checkbox"
                            checked={luoguImportRules.requireAc}
                            disabled
                            className="mt-0.5 h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-60"
                            onChange={() => undefined}
                          />
                          <span>
                            <span className="block font-medium text-foreground">只处理 AC 提交</span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              当前后端仍只支持 AC 导入，因此本规则保持开启。
                            </span>
                          </span>
                        </label>

                        <label className="flex items-start gap-3 rounded-md border border-border bg-background/50 p-3">
                          <input
                            type="checkbox"
                            checked={luoguImportRules.keepLatestAcOnly}
                            disabled={isPreparingSelectedLuogu || isWritingPreparedLuogu || isScanningLuoguPreview || isSyncingLuogu}
                            className="mt-0.5 h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-60"
                            onChange={(e) => updateLuoguImportRules({ keepLatestAcOnly: e.target.checked })}
                          />
                          <span>
                            <span className="block font-medium text-foreground">同一道题只保留最新 AC 提交</span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              扫描结果中旧 AC 会保留在表格里，但不可勾选，并显示“跳过：同题旧 AC”。
                            </span>
                          </span>
                        </label>

                        <div className="rounded-md border border-border bg-background/50 p-3">
                          <div className="font-medium text-foreground">没有 insight / 启示注释时</div>
                          <div className="mt-3 grid gap-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="radio"
                                name="luogu-missing-insight-strategy"
                                checked={luoguImportRules.missingInsightStrategy === "skip"}
                                disabled={isPreparingSelectedLuogu || isWritingPreparedLuogu || isScanningLuoguPreview || isSyncingLuogu}
                                className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-60"
                                onChange={() => updateLuoguImportRules({ missingInsightStrategy: "skip" })}
                              />
                              跳过，不生成笔记
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="radio"
                                name="luogu-missing-insight-strategy"
                                checked={luoguImportRules.missingInsightStrategy === "draft"}
                                disabled={isPreparingSelectedLuogu || isWritingPreparedLuogu || isScanningLuoguPreview || isSyncingLuogu}
                                className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-60"
                                onChange={() => updateLuoguImportRules({ missingInsightStrategy: "draft" })}
                              />
                              生成待整理源码草稿
                            </label>
                          </div>
                        </div>
                      </div>
                    </section>

                    <section className="rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                      <div className="font-medium text-foreground">{luoguRuleSummary}</div>
                      <div>切换规则不会清空当前扫描列表，但会重新计算候选状态和默认勾选，并清空已生成预览与写入结果。</div>
                      {luoguPreviewResult && (
                        <div>当前扫描列表：{luoguPreviewResult.submissions.length} 条，可候选 {luoguCurrentCandidateCount} 条。</div>
                      )}
                    </section>
                  </div>
                )}

                {luoguImportCenterTab === "account" && (
                  <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-5">
                    <section className="grid shrink-0 grid-cols-2 gap-3 text-xs">
                      <div className="rounded-md border border-border bg-card/70 p-3">
                        <div className="text-muted-foreground">_uid</div>
                        <div className={luoguConfigUid.trim() ? "mt-1 font-medium text-emerald-400" : "mt-1 font-medium text-amber-400"}>
                          {isLoadingLuoguConfig ? "读取中" : luoguConfigUid.trim() ? "已配置" : "未配置"}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-card/70 p-3">
                        <div className="text-muted-foreground">__client_id</div>
                        <div className={luoguConfigClientId.trim() ? "mt-1 font-medium text-emerald-400" : "mt-1 font-medium text-amber-400"}>
                          {isLoadingLuoguConfig ? "读取中" : luoguConfigClientId.trim() ? "已配置" : "未配置"}
                        </div>
                      </div>
                      <div className="rounded-md border border-border bg-card/70 p-3">
                        <div className="text-muted-foreground">AI</div>
                        <div className={luoguConfigAiConfigured ? "mt-1 font-medium text-emerald-400" : "mt-1 font-medium text-amber-400"}>
                          {isLoadingLuoguConfig ? "读取中" : luoguConfigAiConfigured ? "已配置" : "未配置"}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">生成预览时用于整理 insight；不可用时仍可生成源码草稿。</div>
                      </div>
                      <div className="rounded-md border border-border bg-card/70 p-3">
                        <div className="text-muted-foreground">last_submission_id</div>
                        <div className="mt-1 font-mono text-foreground">
                          {isLoadingLuoguConfig ? "读取中" : luoguConfigLastSubmissionId.trim() || "未设置"}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">扫描和生成预览不会更新这个值。</div>
                      </div>
                    </section>

                    <section className="grid gap-3 rounded-md border border-border bg-card/70 p-4 text-xs">
                      <div>
                        <div className="text-sm font-medium text-foreground">同步位置</div>
                        <div className="mt-1 text-muted-foreground">
                          这里只更新 .oinb/config.json 里的 last_submission_id，不会写 notes、调用 AI 或提交 Git。
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="luogu-last-submission-id">last_submission_id</Label>
                        <Input
                          id="luogu-last-submission-id"
                          value={luoguConfigLastSubmissionId}
                          disabled={isLoadingLuoguConfig || isUpdatingLuoguLastSubmissionId}
                          placeholder="留空表示清空"
                          onChange={(e) => setLuoguConfigLastSubmissionId(e.target.value)}
                        />
                        <div className="text-[11px] text-muted-foreground">
                          当前值：{isLoadingLuoguConfig ? "读取中" : luoguConfigLastSubmissionId.trim() || "未设置"}。空值表示清空；非空必须是非负整数。
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleSaveLuoguLastSubmissionId}
                          disabled={isLoadingLuoguConfig || isUpdatingLuoguLastSubmissionId}
                        >
                          {isUpdatingLuoguLastSubmissionId ? "保存中..." : "保存同步位置"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleClearLuoguLastSubmissionId}
                          disabled={isLoadingLuoguConfig || isUpdatingLuoguLastSubmissionId}
                        >
                          清空同步位置
                        </Button>
                        {luoguPreviewResult && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleUseLatestScannedLuoguSubmissionId}
                            disabled={isLoadingLuoguConfig || isUpdatingLuoguLastSubmissionId || luoguPreviewResult.submissions.length === 0}
                          >
                            设为本次扫描最新提交
                          </Button>
                        )}
                      </div>
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-5 text-amber-100">
                        清空后不会删除任何笔记，只是让之后扫描可以重新看到旧提交。设为本次扫描最新提交会让下次默认不再显示这些提交及更早提交。
                      </div>
                    </section>

                    <section className="rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                      <div className="font-medium text-foreground">洛谷账户配置状态</div>
                      <div>需要从浏览器洛谷 Cookie 中复制 _uid 和 __client_id。</div>
                      <div>路径：F12 - Application / 应用 - Cookies - https://www.luogu.com.cn。</div>
                      <div>不要把 __client_id 发给别人，也不要提交到 Git。</div>
                    </section>

                    {luoguConnectionResult && (
                      <section className="grid gap-2 rounded-md border border-border bg-card/70 p-3 text-xs">
                        <div className="font-medium text-foreground">
                          最近一次连接测试：拉到 {luoguConnectionResult.fetchedCount} 条提交
                        </div>
                        <div className="grid gap-1 text-muted-foreground">
                          {luoguConnectionResult.submissions.length === 0 ? (
                            <div>暂无提交预览</div>
                          ) : (
                            luoguConnectionResult.submissions.map((submission) => (
                              <div key={submission.submissionId} className="font-mono">
                                #{submission.submissionId} {submission.problemId} {submission.problemTitle} · {submission.status} · {submission.submitTime}
                              </div>
                            ))
                          )}
                        </div>
                      </section>
                    )}

                    {luoguSyncResult && (
                      <section className="grid gap-2 rounded-md border border-border bg-card/70 p-3 text-xs">
                        <div className="font-medium text-foreground">
                          旧版同步结果：扫描 {luoguSyncResult.scannedPages} 页 / {luoguSyncResult.scannedCount} 条，AI 导入 {luoguSyncResult.aiImportedCount} 篇
                        </div>
                        <div className="grid gap-1 text-muted-foreground">
                          <div>AI 跳过 {luoguSyncResult.aiSkippedCount} 条，AI 失败 {luoguSyncResult.aiFailedCount} 条，总失败 {luoguSyncResult.failedCount} 条。</div>
                          <div>last_submission_id: {luoguSyncResult.updatedLastSubmissionId ?? "未更新"}</div>
                        </div>
                      </section>
                    )}
                  </div>
                )}

                {luoguImportCenterTab === "manual" && (
                  <div className="flex h-full min-h-0 flex-col gap-4 p-5">
                    <section className="shrink-0 rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                      <div className="font-medium text-foreground">手动粘贴源码导入</div>
                      <div>保留原来的手动导入入口；它会调用 AI、写入 notes/luogu，确认后仍会提交单篇笔记。</div>
                    </section>
                    <section className="grid shrink-0 grid-cols-3 gap-3">
                      <div className="grid gap-2">
                        <Label htmlFor="luogu-problem-id">problem id</Label>
                        <Input
                          id="luogu-problem-id"
                          value={luoguProblemId}
                          placeholder="P1234 或 1234"
                          disabled={isImportingLuogu}
                          onChange={(e) => setLuoguProblemId(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="luogu-submission-id">submission id</Label>
                        <Input
                          id="luogu-submission-id"
                          value={luoguSubmissionId}
                          placeholder="12345678"
                          disabled={isImportingLuogu}
                          onChange={(e) => setLuoguSubmissionId(e.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="luogu-problem-title">problem title</Label>
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
                      <Label htmlFor="luogu-source-code">source code</Label>
                      <textarea
                        id="luogu-source-code"
                        value={luoguSourceCode}
                        disabled={isImportingLuogu}
                        className="min-h-0 w-full flex-1 resize-none rounded-md border border-input bg-background/70 px-3 py-3 font-mono text-xs leading-5 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
                        placeholder={`int main() {\n  return 0;\n}\n\n/*\n启示：\n这题的关键观察是 ...\n\n坑点：\n边界需要额外处理 ...\n*/`}
                        onChange={(e) => setLuoguSourceCode(e.target.value)}
                      />
                    </section>
                  </div>
                )}

                {luoguImportCenterTab === "advanced" && (
                  <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-5">
                    <section className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
                      <div className="text-sm font-medium text-amber-200">旧版一键同步</div>
                      <div className="mt-2 text-xs leading-5 text-amber-100/80">
                        警告：旧版同步会抓源码、会调用 AI、会写入 notes/luogu，并且可能自动 commit。
                      </div>
                      <Button
                        variant="outline"
                        className="mt-4 w-fit border-amber-500/50 bg-transparent text-amber-100 hover:bg-amber-500/10 hover:text-amber-50"
                        onClick={handleSyncLuoguInsights}
                        disabled={isLoadingLuoguConfig || isScanningLuoguPreview || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isSyncingLuogu}
                      >
                        {isSyncingLuogu ? "旧版同步中..." : "高级：执行旧版一键同步"}
                      </Button>
                    </section>

                    {luoguSyncResult && (
                      <section className="grid gap-1 rounded-md border border-border bg-card/70 p-3 text-xs text-muted-foreground">
                        <div className="font-medium text-foreground">
                          旧版同步：扫描 {luoguSyncResult.scannedPages} 页 / {luoguSyncResult.scannedCount} 条，AI 导入 {luoguSyncResult.aiImportedCount} 篇
                        </div>
                        <div>
                          AI 跳过 {luoguSyncResult.aiSkippedCount} 条，AI 失败 {luoguSyncResult.aiFailedCount} 条，总失败 {luoguSyncResult.failedCount} 条，last_submission_id: {luoguSyncResult.updatedLastSubmissionId ?? "未更新"}
                        </div>
                        {luoguSyncResult.importedPaths.map((path) => (
                          <div key={path} className="font-mono">{path}</div>
                        ))}
                        {luoguSyncResult.warnings.slice(0, 3).map((warning) => (
                          <div key={warning} className="text-amber-400">{warning}</div>
                        ))}
                      </section>
                    )}
                  </div>
                )}
              </main>
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-3">
              <div className="min-w-0 truncate text-xs text-muted-foreground">
                {luoguImportCenterTab === "scan" && luoguImportStep === "preview" && luoguWriteProgress
                  ? `正在写入 ${luoguWriteProgress.current} / ${luoguWriteProgress.total}`
                  : luoguImportCenterTab === "scan" && luoguImportStep === "preview"
                    ? `已生成 ${preparedLuoguNotes.length} 个预览，可写入 ${writableLuoguPreparedNotes.length} 个`
                : luoguImportCenterTab === "scan" && luoguPrepareProgress
                  ? `正在生成预览 ${luoguPrepareProgress.current} / ${luoguPrepareProgress.total}${
                      currentlyPreparingLuoguSubmission
                        ? `：${currentlyPreparingLuoguSubmission.problemId || "未知题号"} · ${currentlyPreparingLuoguSubmission.submissionId}`
                        : ""
                    }`
                  : luoguImportCenterTab === "scan" && luoguScanProgress
                    ? `正在扫描第 ${luoguScanProgress.currentPage} 页，已发现 ${luoguScanProgress.foundCount} 条；范围：${luoguScanProgress.rangeLabel}`
                  : luoguImportCenterTab === "scan"
                    ? `已选 ${selectedLuoguImportCount} 条；需生成 ${luoguPrepareQueueSubmissions.length} 条，已有预览 ${luoguReusablePreviewCount} 条，忽略 ${luoguIgnoredPreviewSubmissions.length} 条`
                    : luoguImportCenterTab === "rules"
                      ? luoguRuleSummary
                    : luoguImportCenterTab === "account"
                      ? "账户状态只展示配置与最近结果，不扫描、不写入"
                    : luoguImportCenterTab === "manual"
                      ? "手动导入会调用 AI 并写入 notes/luogu"
                      : "旧版同步保留在高级操作中"}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {luoguImportCenterTab === "scan" && (
                  luoguImportStep === "scan" ? (
                    <>
                      <Button
                        onClick={handlePreviewLuoguSubmissions}
                        disabled={isLoadingLuoguConfig || isScanningLuoguPreview || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isSyncingLuogu}
                      >
                        {isScanningLuoguPreview
                          ? "扫描中..."
                          : `扫描${getLuoguScanRangeLabel(luoguScanMode, luoguScanCountLimit, luoguScanDaysLimit)}`}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleSelectAllLuoguCandidates}
                        disabled={
                          luoguSelectableSubmissionIds.length === 0 ||
                          isLoadingLuoguConfig ||
                          isScanningLuoguPreview ||
                          isPreparingSelectedLuogu ||
                          isWritingPreparedLuogu ||
                          isSyncingLuogu
                        }
                      >
                        全选可候选
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleClearLuoguSelection}
                        disabled={
                          selectedLuoguImportCount === 0 ||
                          isLoadingLuoguConfig ||
                          isScanningLuoguPreview ||
                          isPreparingSelectedLuogu ||
                          isWritingPreparedLuogu ||
                          isSyncingLuogu
                        }
                      >
                        取消全选
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleSkipSelectedLuoguSubmissions}
                        disabled={
                          selectedLuoguImportCount === 0 ||
                          isLoadingLuoguConfig ||
                          isScanningLuoguPreview ||
                          isPreparingSelectedLuogu ||
                          isWritingPreparedLuogu ||
                          isSyncingLuogu
                        }
                      >
                        跳过选中 {selectedLuoguImportCount}
                      </Button>
                      <Button
                        onClick={handlePrepareSelectedLuoguSubmissions}
                        disabled={
                          selectedLuoguImportCount === 0 ||
                          (luoguPrepareQueueSubmissions.length === 0 && luoguReusablePreviewCount === 0) ||
                          isLoadingLuoguConfig ||
                          isScanningLuoguPreview ||
                          isPreparingSelectedLuogu ||
                          isWritingPreparedLuogu ||
                          isSyncingLuogu
                        }
                      >
                        {isPreparingSelectedLuogu
                          ? "正在生成预览..."
                            : luoguPrepareQueueSubmissions.length > 0
                            ? `生成预览 ${luoguPrepareQueueSubmissions.length}`
                            : `查看已有预览 ${luoguReusablePreviewCount}`}
                      </Button>
                      {isPreparingSelectedLuogu && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleStopPreparingLuoguPreviews}
                          disabled={isStoppingLuoguPrepare}
                          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          {isStoppingLuoguPrepare ? "停止中..." : "停止生成"}
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setLuoguImportStep("scan")}
                        disabled={isPreparingSelectedLuogu || isWritingPreparedLuogu}
                      >
                        返回选择
                      </Button>
                      <Button
                        onClick={handleWritePreparedLuoguNotes}
                        disabled={
                          writableLuoguPreparedNotes.length === 0 ||
                          isLoadingLuoguConfig ||
                          isScanningLuoguPreview ||
                          isPreparingSelectedLuogu ||
                          isWritingPreparedLuogu ||
                          isSyncingLuogu
                        }
                      >
                        {isWritingPreparedLuogu ? "写入中..." : `写入已生成预览 ${writableLuoguPreparedNotes.length}`}
                      </Button>
                    </>
                  )
                )}
                {luoguImportCenterTab === "manual" && (
                  <Button onClick={handleImportLuogu} disabled={isImportingLuogu || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isScanningLuoguPreview || isSyncingLuogu}>
                    {isImportingLuogu ? "导入中..." : "手动导入"}
                  </Button>
                )}
                <Button variant="outline" onClick={closeLuoguDialog} disabled={isImportingLuogu || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isScanningLuoguPreview || isSyncingLuogu}>
                  关闭
                </Button>
              </div>
            </footer>
          </div>
        </section>
      </div>
    )}
    <Dialog
      open={isAdvancedActionsOpen}
      onOpenChange={(open) => {
        if (open) {
          setSettingsCenterRect((current) => getSafeOpenedSettingsCenterRect(current));
          setExpandedSettingsGroups({});
          setIsAdvancedActionsOpen(true);
          return;
        }
        handleSettingsCenterCloseRequest();
      }}
    >
      <DialogContent
        ref={settingsCenterPanelRef}
        className="settings-center fixed left-0 top-0 z-[60] flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-lg p-0 data-closed:zoom-out-100 data-open:zoom-in-100 sm:max-w-none"
        style={settingsCenterStyle}
        showCloseButton={false}
      >
        <div className="absolute right-2.5 top-2.5 z-30 flex items-center gap-1">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={handleToggleSettingsCenterMaximize}
            title={isSettingsCenterMaximized ? "还原设置中心" : "最大化设置中心"}
            aria-label={isSettingsCenterMaximized ? "还原设置中心" : "最大化设置中心"}
          >
            {isSettingsCenterMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={handleSettingsCenterCloseRequest}
            title={settingsView === "prompt-editor" ? "返回设置" : "关闭设置中心"}
            aria-label={settingsView === "prompt-editor" ? "返回设置" : "关闭设置中心"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <DialogHeader
          className={cn(
            "settings-center-drag-handle shrink-0 border-b border-border/80 bg-muted/10 px-5 pr-24 text-left",
            isSettingsCenterMaximized ? "cursor-default" : "cursor-grab active:cursor-grabbing",
            settingsView === "prompt-editor" ? "py-2" : "py-3",
          )}
          onPointerDown={beginSettingsCenterDrag}
        >
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              {settingsView === "prompt-editor" ? (
                <>
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <DialogTitle className="text-base">Prompt 编辑</DialogTitle>
                    <span className="font-mono text-xs text-muted-foreground">{selectedPromptFileName || "读取 Prompt 模板中"}</span>
                    <span className="text-xs text-muted-foreground">{promptContent.length.toLocaleString()} 字符</span>
                  </div>
                  <div className="truncate text-xs leading-4 text-muted-foreground">
                    {selectedPromptUsage.title} · {promptPolishMessage ?? selectedPromptUsage.scope}
                  </div>
                </>
              ) : (
                <>
                  <DialogTitle className="text-base">设置中心</DialogTitle>
                  <div className="text-xs leading-5 text-muted-foreground">左侧选择设置页，右侧只显示当前页。</div>
                </>
              )}
            </div>
            {settingsView === "main" && hasAiConfigDraftChanges && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 pr-1">
                <Button type="button" variant="outline" size="sm" onClick={handleDiscardAiConfigDraft} disabled={isSavingAiConfig}>
                  放弃 AI 更改
                </Button>
                <Button type="button" size="sm" onClick={() => void handleSaveAiConfigDraft()} disabled={isSavingAiConfig}>
                  <Save className="h-3.5 w-3.5" />
                  {isSavingAiConfig ? "保存中..." : "保存 AI 更改"}
                </Button>
              </div>
            )}
            {settingsView === "prompt-editor" && (
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 pr-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => void handlePolishPrompt()}
                  disabled={!selectedPromptFileName || !promptContent.trim() || isLoadingPrompt || isSavingPrompt || isPolishingPrompt}
                  title="让 AI 在不改变核心结构的前提下优化当前 Prompt 表达"
                >
                  {isPolishingPrompt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {isPolishingPrompt ? "润色中..." : "AI 润色 Prompt"}
                </Button>
                <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={() => void handleSavePrompt()} disabled={!selectedPromptFileName || isLoadingPrompt || isSavingPrompt || isPolishingPrompt}>
                  <Save className="h-3.5 w-3.5" />
                  {isSavingPrompt ? "保存中..." : "保存 Prompt"}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 overflow-hidden flex-col md:flex-row">
          {settingsView === "main" && (
            <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-border/80 bg-muted/10 md:w-[236px] md:min-w-[236px] md:border-b-0 md:border-r">
              <div className="px-4 py-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">设置</div>
              <ScrollArea className="min-h-0 flex-1 max-h-[28vh] md:max-h-none">
                <div className="grid gap-0 p-2">
                  {visibleSettingsTree.map((group) => {
                    const isExpanded = expandedSettingsGroups[group.id] === true;
                    const groupActive = activeSettingsGroupId === group.id;
                    const categoryActive = activeSettingsTarget.type === "category" && activeSettingsTarget.category === group.id;
                    return (
                      <div key={group.id} className="grid gap-0">
                        <div
                          className={cn(
                            "flex h-8 w-full items-center gap-1.5 rounded-sm px-2 text-left text-sm font-medium",
                            categoryActive ? "bg-accent text-accent-foreground" : groupActive ? "text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                          )}
                        >
                          <button
                            type="button"
                            className="flex h-6 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted/60"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSettingsGroup(group.id);
                            }}
                            aria-label={isExpanded ? `收起 ${group.label}` : `展开 ${group.label}`}
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left"
                            onClick={() => openSettingsSection(group.id)}
                          >
                            {group.label}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="grid gap-0 pl-5">
                            {group.children.map((child) => {
                              const isActive = activeSettingsPageKey === child.id;
                              return (
                                <button
                                  key={child.id}
                                  type="button"
                                  className={cn(
                                    "h-7 truncate rounded-sm px-2 text-left text-sm",
                                    isActive
                                      ? "bg-accent text-accent-foreground"
                                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                  )}
                                  onClick={() => openSettingsSection(child.id)}
                                >
                                  {child.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </aside>
          )}
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background/70">
            {settingsView === "prompt-editor" ? (
              <div className="flex h-full min-h-0 flex-col overflow-hidden">
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
                              <div className="text-sm font-medium text-foreground">正在润色 Prompt...</div>
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
                            className="grid min-w-0 max-w-full gap-1 rounded-sm border border-border/60 bg-background/35 px-2 py-1.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
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
                      <div className="text-xs leading-5 text-muted-foreground">这个模板没有登记可替换变量。</div>
                    )}
                  </aside>
                </div>
              </div>
            ) : (
              <div ref={settingsContentRef} className="h-full min-h-0 overflow-auto">
                <div className="sticky top-0 z-10 border-b border-border/80 bg-background/95 px-6 py-2 backdrop-blur">
                  <div className="text-sm font-semibold text-foreground">{activeSettingsLabel.group}</div>
                  {activeSettingsLabel.section && <div className="text-xs text-muted-foreground">{activeSettingsLabel.section}</div>}
                </div>
                <div className="grid min-w-0 gap-0 px-0 py-2">
                  {shouldRenderSettingsPage("appearance-theme") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 grid gap-1">
                        <div className="text-base font-semibold text-foreground">主题与字号</div>
                      </div>
                      <SettingRow title="主题" description={`当前使用 ${appThemeLabel}。`}>
                        <div className="flex flex-wrap gap-2">
                          {THEME_OPTIONS.map((option) => (
                            <Button key={option.id} type="button" variant={appTheme === option.id ? "default" : "outline"} size="sm" onClick={() => setAppTheme(option.id)}>
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </SettingRow>
                      <SettingRow title="界面密度" description={`当前 ${uiScaleLabel}。`}>
                        <div className="flex flex-wrap gap-2">
                          {UI_SCALE_PRESETS.map((scale) => (
                            <Button key={scale} type="button" variant={Math.round(uiScale * 100) === Math.round(scale * 100) ? "default" : "outline"} size="sm" onClick={() => updateUiScale(scale)}>
                              {Math.round(scale * 100)}%
                            </Button>
                          ))}
                        </div>
                      </SettingRow>
                      <SettingRow title="全局界面缩放" description={`当前 ${appZoomLabel}。`}>
                        <div className="flex flex-wrap gap-2">
                          {APP_ZOOM_PRESETS.map((zoom) => (
                            <Button key={zoom} type="button" variant={Math.round(appZoom * 100) === Math.round(zoom * 100) ? "default" : "outline"} size="sm" onClick={() => updateAppZoom(zoom)}>
                              {Math.round(zoom * 100)}%
                            </Button>
                          ))}
                        </div>
                      </SettingRow>
                      <SettingRow title="设置中心文字大小" description={`${settingsFontSize}px。`}>
                        <div className="flex min-w-0 items-center gap-2">
                          <input type="range" min={SETTINGS_FONT_SIZE_MIN} max={SETTINGS_FONT_SIZE_MAX} step={1} value={settingsFontSize} onChange={(event) => updateSettingsFontSize(Number(event.target.value))} className="h-2 min-w-0 flex-1 accent-primary" aria-label="设置中心文字大小" />
                          <Input type="number" min={SETTINGS_FONT_SIZE_MIN} max={SETTINGS_FONT_SIZE_MAX} value={settingsFontSize} onChange={(event) => updateSettingsFontSize(Number(event.target.value))} className="h-8 w-20" aria-label="设置中心文字大小数值" />
                        </div>
                      </SettingRow>
                      <SettingRow title="Markdown 内容缩放" description={`当前 ${contentZoomLabel}。`}>
                        <div className="flex flex-wrap gap-2">
                          {CONTENT_ZOOM_PRESETS.map((zoom) => (
                            <Button key={zoom} type="button" variant={Math.round(contentZoom * 100) === Math.round(zoom * 100) ? "default" : "outline"} size="sm" onClick={() => updateContentZoom(zoom)}>
                              {Math.round(zoom * 100)}%
                            </Button>
                          ))}
                        </div>
                      </SettingRow>
                      <SettingRow title="工具栏文字大小" description={`${toolbarFontSize}px。`}>
                        <div className="flex min-w-0 items-center gap-2">
                          <input type="range" min={TOOLBAR_FONT_SIZE_MIN} max={TOOLBAR_FONT_SIZE_MAX} step={1} value={toolbarFontSize} onChange={(event) => updateToolbarFontSize(Number(event.target.value))} className="h-2 min-w-0 flex-1 accent-primary" aria-label="工具栏文字大小" />
                          <Input type="number" min={TOOLBAR_FONT_SIZE_MIN} max={TOOLBAR_FONT_SIZE_MAX} value={toolbarFontSize} onChange={(event) => updateToolbarFontSize(Number(event.target.value))} className="h-8 w-20" aria-label="工具栏文字大小数值" />
                        </div>
                      </SettingRow>
                      <SettingRow title="编辑区字体大小" description={`${editorFontSize}px。`}>
                        <div className="flex min-w-0 items-center gap-2">
                          <input type="range" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} step={1} value={editorFontSize} onChange={(event) => updateEditorFontSize(Number(event.target.value))} className="h-2 min-w-0 flex-1 accent-primary" aria-label="编辑区字体大小" />
                          <Input type="number" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} value={editorFontSize} onChange={(event) => updateEditorFontSize(Number(event.target.value))} className="h-8 w-20" aria-label="编辑区字体大小数值" />
                        </div>
                      </SettingRow>
                      <SettingRow title="预览区字体大小" description={`${previewFontSize}px。`}>
                        <div className="flex min-w-0 items-center gap-2">
                          <input type="range" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} step={1} value={previewFontSize} onChange={(event) => updatePreviewFontSize(Number(event.target.value))} className="h-2 min-w-0 flex-1 accent-primary" aria-label="预览区字体大小" />
                          <Input type="number" min={FONT_SIZE_MIN} max={FONT_SIZE_MAX} value={previewFontSize} onChange={(event) => updatePreviewFontSize(Number(event.target.value))} className="h-8 w-20" aria-label="预览区字体大小数值" />
                        </div>
                      </SettingRow>
                      <SettingRow title="阅读密度" description={activeReadingDensity.description}>
                        <div className="flex flex-wrap gap-2">
                          {READING_DENSITY_OPTIONS.map((option) => (
                            <Button key={option.id} type="button" variant={readingDensity === option.id ? "default" : "outline"} size="sm" onClick={() => updateReadingDensity(option.id)}>
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </SettingRow>
                    </section>
                  )}

                  {shouldRenderSettingsPage("ai-api") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 grid gap-1">
                        <div className="text-base font-semibold text-foreground">模型与 API</div>
                        <div className="text-xs leading-5 text-muted-foreground">配置组、默认模型和连接测试。</div>
                      </div>
                      <SettingRow title="配置组" description="选择或新增 OpenAI-compatible API。" align="start">
                        <div className="grid gap-2">
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={handleCreateAiProviderDraft} disabled={isLoadingAiConfig || isSavingAiConfig}><Plus className="h-3.5 w-3.5" />添加配置组</Button>
                            <Button size="sm" variant="outline" onClick={handleFillDeepSeekDefaults} disabled={isSavingAiConfig}>填入 DeepSeek 默认配置</Button>
                          </div>
                          <div className="grid gap-1">
                            {(aiConfigDraft?.providers ?? []).map((provider) => (
                              <button key={provider.id} type="button" className={cn("flex min-w-0 items-center justify-between gap-2 border-b border-border/50 px-2 py-2 text-left", provider.id === selectedAiProviderId ? "bg-accent/70 text-accent-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground")} onClick={() => selectAiProviderForEdit(provider)}>
                                <span className="min-w-0 truncate text-sm font-medium">{provider.name || provider.id}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{provider.models.length} models</span>
                              </button>
                            ))}
                            {(aiConfigDraft?.providers.length ?? 0) === 0 && <div className="text-sm text-muted-foreground">还没有配置组。</div>}
                          </div>
                        </div>
                      </SettingRow>
                      {selectedAiProvider && (
                        <>
                          <SettingRow title="名称 / 默认模型" description="默认模型会作为该配置组的首选模型。" align="start">
                            <div className="grid gap-2 md:grid-cols-2">
                              <Input value={selectedAiProvider.name} placeholder="DeepSeek / OpenAI" onChange={(event) => updateAiProviderDraft(selectedAiProvider.id, (provider) => ({ ...provider, name: event.target.value, updated_at: Date.now() }))} />
                              <Input value={selectedAiProvider.default_model ?? ""} placeholder="deepseek-chat" onChange={(event) => updateAiProviderDraft(selectedAiProvider.id, (provider) => ({ ...provider, default_model: event.target.value.trim() || null, updated_at: Date.now() }))} />
                            </div>
                          </SettingRow>
                          <SettingRow title="Base URL" description="OpenAI-compatible endpoint。">
                            <Input value={selectedAiProvider.base_url} placeholder="https://api.example.com/v1" onChange={(event) => updateAiProviderDraft(selectedAiProvider.id, (provider) => ({ ...provider, base_url: event.target.value, updated_at: Date.now() }))} />
                          </SettingRow>
                          <SettingRow title="API Key" description="明文只在输入框中临时显示。">
                            <Input value={selectedAiProvider.api_key} type="password" placeholder="sk-..." onChange={(event) => updateAiProviderDraft(selectedAiProvider.id, (provider) => ({ ...provider, api_key: event.target.value, updated_at: Date.now() }))} />
                          </SettingRow>
                          <SettingRow title="连接操作" description="测试和同步都使用当前草稿。">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => updateAiConfigDraft((config) => ({ ...config, default_provider_id: selectedAiProvider.id, default_model_id: selectedAiProvider.default_model ?? selectedAiProvider.models.find((model) => model.enabled)?.id ?? selectedAiProvider.models[0]?.id ?? null }))} disabled={isSavingAiConfig}>设为默认配置组</Button>
                              <Button variant="outline" size="sm" onClick={() => void handleTestAiProvider(selectedAiProvider.id)} disabled={aiProviderBusy || isSavingAiConfig}><PlugZap className="h-3.5 w-3.5" />{aiProviderBusyId === selectedAiProvider.id ? "处理中..." : "测试连接"}</Button>
                              <Button variant="outline" size="sm" onClick={() => void handleSyncAiProviderModels(selectedAiProvider.id)} disabled={aiProviderBusy || isSavingAiConfig}><RefreshCw className="h-3.5 w-3.5" />同步模型</Button>
                              <Button variant="destructive" size="sm" onClick={() => void handleDeleteAiProvider(selectedAiProvider.id)} disabled={aiProviderBusy || isSavingAiConfig}><Trash2 className="h-3.5 w-3.5" />删除</Button>
                            </div>
                          </SettingRow>
                          <SettingRow title="模型列表" description="手动添加、删除或设为默认。" align="start">
                            <div className="grid gap-2">
                              <div className="flex min-w-0 flex-wrap gap-2">
                                <Input value={aiModelSearchQuery} placeholder="搜索模型" onChange={(event) => setAiModelSearchQuery(event.target.value)} className="min-w-[160px] flex-1" />
                                <Input value={aiManualModelId} placeholder="手动添加模型 ID" onChange={(event) => setAiManualModelId(event.target.value)} className="min-w-[180px] flex-1" />
                                <Button variant="outline" size="sm" onClick={() => void handleAddAiProviderModel()} disabled={!aiManualModelId.trim()}>添加模型</Button>
                              </div>
                              <div className="max-h-[260px] overflow-auto border-y border-border/60">
                                {filteredAiProviderModels.length > 0 ? filteredAiProviderModels.map((model) => {
                                  const isDefault = selectedAiProvider.id === aiConfigDraft?.default_provider_id && model.id === aiConfigDraft.default_model_id;
                                  return (
                                    <div key={model.id} className="flex min-w-0 items-center justify-between gap-2 border-b border-border/50 px-2 py-2 text-sm last:border-b-0">
                                      <div className="min-w-0 truncate text-foreground">{model.name || model.id}</div>
                                      <div className="flex shrink-0 gap-1">
                                        <Button size="xs" variant={isDefault ? "secondary" : "outline"} onClick={() => void handleSetDefaultAiModel(selectedAiProvider.id, model.id)}>{isDefault ? "已默认" : "设默认"}</Button>
                                        <Button size="icon-xs" variant="ghost" onClick={() => void handleDeleteAiProviderModel(selectedAiProvider.id, model.id)}><Trash2 className="h-3 w-3" /></Button>
                                      </div>
                                    </div>
                                  );
                                }) : <div className="px-2 py-6 text-center text-sm text-muted-foreground">暂无匹配模型。</div>}
                              </div>
                            </div>
                          </SettingRow>
                        </>
                      )}
                    </section>
                  )}

                  {shouldRenderSettingsPage("ai-local-notes") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 grid gap-1"><div className="text-base font-semibold text-foreground">本地笔记索引</div><div className="text-xs leading-5 text-muted-foreground">用于让 NoteX 更快、更准确地从你的 Markdown 笔记中检索相关段落，只保存在本机。</div></div>
                      <SettingRow title="本地索引状态" description="显示本地笔记是否已经建立索引；读取状态不会触发重建。" align="start">
                        <div className="grid gap-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cn(
                              "inline-flex rounded-sm border px-2 py-0.5 text-xs",
                              isRebuildingLocalIndex
                                ? "border-sky-300/60 bg-sky-500/10 text-sky-700 dark:text-sky-200"
                                : localIndexStatus?.status === "ready"
                                  ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                                  : localIndexStatus?.status === "error"
                                    ? "border-red-300/60 bg-red-500/10 text-red-700 dark:text-red-200"
                                    : "border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-200",
                            )}>{getLocalIndexStatusLabel(localIndexStatus, isRebuildingLocalIndex)}</span>
                            {isLoadingLocalIndexStatus && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />读取中</span>}
                          </div>
                          <div className="grid gap-1 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
                            <span>索引版本：{localIndexStatus?.version ?? "尚未建立"} / 当前 {localIndexStatus?.currentVersion ?? 3}</span>
                            <span>笔记数：{localIndexStatus?.noteCount ?? 0}</span>
                            <span>片段数：{localIndexStatus?.chunkCount ?? 0}</span>
                            <span>上次更新时间：{getLocalIndexUpdatedLabel(localIndexStatus)}</span>
                          </div>
                          {localIndexMessage && <div className="text-xs leading-5 text-muted-foreground">{localIndexMessage}</div>}
                          {developerModeEnabled && localIndexStatus && (
                            <div className="grid gap-1 rounded-md border border-border/70 bg-muted/15 px-2.5 py-2 font-mono text-[11px] leading-5 text-muted-foreground">
                              <span>path={localIndexStatus.pathLabel}</span>
                              <span>readable={String(localIndexStatus.readable)} writable={String(localIndexStatus.writable)} size={localIndexStatus.approxSizeBytes} bytes</span>
                              {localIndexStatus.lastError && <span>lastError={localIndexStatus.lastError}</span>}
                            </div>
                          )}
                        </div>
                      </SettingRow>
                      <SettingRow title="重建本地笔记索引" description="用于笔记较多、搜索结果不准或刚升级索引版本后。不会修改笔记正文。">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => void refreshLocalIndexStatus()} disabled={isLoadingLocalIndexStatus || isRebuildingLocalIndex}><RefreshCw className="h-3.5 w-3.5" />刷新状态</Button>
                          <Button variant="outline" size="sm" onClick={() => void handleRebuildLocalIndex()} disabled={isLoadingLocalIndexStatus || isRebuildingLocalIndex}>
                            {isRebuildingLocalIndex ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                            {isRebuildingLocalIndex ? "正在建立..." : "重建本地笔记索引"}
                          </Button>
                        </div>
                      </SettingRow>
                      <SettingRow title="检索使用方式" description="聊天中按需读取相关片段；普通模式只显示回答正文实际引用的 N# 本地来源。"><span className="text-sm text-muted-foreground">无需额外配置</span></SettingRow>
                    </section>
                  )}

                  {shouldRenderSettingsPage("ai-web-search") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 grid gap-1">
                        <div className="text-base font-semibold text-foreground">联网搜索</div>
                        <div className="text-xs leading-5 text-muted-foreground">Bing 公开搜索无需 Key；Bocha 推荐用于稳定中文搜索；Brave 适合已有配置。</div>
                      </div>
                      <SettingRow title="启用联网搜索 Provider" description="关闭后不会请求公开搜索 Provider。">
                        <button type="button" className={cn("relative h-6 w-11 shrink-0 rounded-full border transition-colors", aiConfigDraft?.web_search.enabled ? "border-primary/70 bg-primary" : "border-border bg-muted/40")} onClick={() => updateAiConfigDraft((config) => ({ ...config, web_search: { ...normalizeWebSearchConfig(config.web_search), enabled: !normalizeWebSearchConfig(config.web_search).enabled } }))} disabled={!aiConfigDraft || isSavingAiConfig} role="switch" aria-checked={aiConfigDraft?.web_search.enabled === true} aria-label="启用联网搜索 Provider"><span className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform", aiConfigDraft?.web_search.enabled && "translate-x-5")} /></button>
                      </SettingRow>
                      <SettingRow title="Provider" description="Bing 无需 Key，Bocha 推荐 / 稳定，Brave 备用。">
                        <div className="flex flex-wrap gap-2">
                          {([{ value: "bing", label: "Bing 公开搜索", badge: "无需 Key" }, { value: "bocha", label: "博查 Bocha", badge: "推荐 / 稳定" }, { value: "brave", label: "Brave Search", badge: "备用" }] as const).map((option) => (
                            <Button key={option.value} type="button" variant={normalizeWebSearchConfig(aiConfigDraft?.web_search).provider === option.value ? "default" : "outline"} size="sm" onClick={() => updateAiConfigDraft((config) => ({ ...config, web_search: { ...normalizeWebSearchConfig(config.web_search), provider: option.value } }))} disabled={!aiConfigDraft || isSavingAiConfig}>{option.label}<span className="ml-1 text-[10px] opacity-75">{option.badge}</span></Button>
                          ))}
                        </div>
                      </SettingRow>
                      <SettingRow title="Bing 公开搜索" description="无需 API Key，适合开箱即用。稳定性不如正式 API；如果遇到限流或验证页，可以稍后重试或改用 Bocha / Brave。">
                        <span className="text-xs text-muted-foreground">无需 Key，但可能被限流或返回验证页。</span>
                      </SettingRow>
                      <SettingRow title="Bocha API Key" description="推荐，适合中文搜索。"><Input type="password" value={aiConfigDraft?.web_search.bochaApiKey ?? ""} placeholder="sk-..." onChange={(event) => updateAiConfigDraft((config) => ({ ...config, web_search: { ...normalizeWebSearchConfig(config.web_search), bochaApiKey: event.target.value } }))} disabled={!aiConfigDraft || isSavingAiConfig} /></SettingRow>
                      <SettingRow title="Bocha Endpoint" description="留空使用默认地址。"><Input value={aiConfigDraft?.web_search.bochaEndpoint ?? ""} placeholder="https://api.bochaai.com/v1/web-search" onChange={(event) => updateAiConfigDraft((config) => ({ ...config, web_search: { ...normalizeWebSearchConfig(config.web_search), bochaEndpoint: event.target.value } }))} disabled={!aiConfigDraft || isSavingAiConfig} /></SettingRow>
                      <SettingRow title="Brave API Key" description="备用，适合已有配置。"><Input type="password" value={aiConfigDraft?.web_search.braveApiKey ?? ""} placeholder="BSA..." onChange={(event) => updateAiConfigDraft((config) => ({ ...config, web_search: { ...normalizeWebSearchConfig(config.web_search), braveApiKey: event.target.value } }))} disabled={!aiConfigDraft || isSavingAiConfig} /></SettingRow>
                      <SettingRow title="测试连接" description={normalizeWebSearchConfig(aiConfigDraft?.web_search).provider === "bing" ? "手动发送一个很小的 Bing 公开搜索测试 query。" : !normalizeWebSearchConfig(aiConfigDraft?.web_search).bochaApiKey && !normalizeWebSearchConfig(aiConfigDraft?.web_search).braveApiKey ? "Bing 可无需 Key 使用；Bocha / Brave 需要配置 Key。" : "发送一个小查询测试当前 Provider。"}>
                        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void handleTestWebSearchConnection()} disabled={!aiConfigDraft || isSavingAiConfig || isTestingWebSearchConnection}>{isTestingWebSearchConnection ? "测试中..." : "测试连接"}</Button>{webSearchConnectionMessage && <span className="text-xs text-muted-foreground">{webSearchConnectionMessage}</span>}</div>
                      </SettingRow>
                      <SettingRow title="清理联网缓存" description="清理搜索结果和网页摘录缓存。"><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => void handleClearWebCache()} disabled={isClearingWebCache}>{isClearingWebCache ? "清理中..." : "清理联网缓存"}</Button>{webCacheMessage && <span className="text-xs text-muted-foreground">{webCacheMessage}</span>}</div></SettingRow>
                    </section>
                  )}

                  {shouldRenderSettingsPage("ai-prompts") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 grid gap-1"><div className="text-base font-semibold text-foreground">Prompt 模板</div><div className="text-xs leading-5 text-muted-foreground">这里只列入口；编辑会打开单独视图。</div></div>
                      {promptTemplates.length === 0 ? (
                        <SettingRow title="本机模板" description="读取当前可编辑模板列表。"><Button variant="outline" onClick={() => void loadPromptTemplates()} disabled={isLoadingPrompt || isSavingPrompt}><FileText className="h-3.5 w-3.5" />读取 Prompt 模板</Button></SettingRow>
                      ) : (
                        <>
                          {promptTemplateRows.map((prompt) => {
                            return <SettingRow key={prompt.fileName} title={prompt.usage.title || prompt.displayName} description={<><span className="font-mono">{prompt.fileName}</span><span> · {prompt.usage.purpose}</span></>}><Button type="button" variant="outline" size="sm" onClick={() => handleEditPrompt(prompt.fileName)} disabled={isLoadingPrompt || isSavingPrompt}>编辑</Button></SettingRow>;
                          })}
                          <SettingRow title={PROMPT_STYLE_PLACEHOLDER.title} description={PROMPT_STYLE_PLACEHOLDER.purpose}><span className="text-xs text-muted-foreground">后续接入</span></SettingRow>
                        </>
                      )}
                    </section>
                  )}

                  {shouldRenderSettingsPage("luogu-account") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 text-base font-semibold text-foreground">账号与扫描</div>
                      <SettingRow title="洛谷设置" description={luoguConnectionResult ? `最近 dry run 拉到 ${luoguConnectionResult.fetchedCount} 条提交。` : "配置后可进入扫描和导入中心。"}><div className="flex flex-wrap gap-2"><Button onClick={() => { setIsAdvancedActionsOpen(false); void openLuoguSettings(); }} disabled={isLoadingLuoguConfig || isSavingLuoguConfig || isTestingLuoguConnection || isSyncingLuogu}><Settings className="h-3.5 w-3.5" />洛谷设置</Button><Button variant="outline" onClick={() => { setIsAdvancedActionsOpen(false); void openLuoguDialog(); }} disabled={isLoadingLuoguConfig || isTestingLuoguConnection || isScanningLuoguPreview || isPreparingSelectedLuogu || isWritingPreparedLuogu || isSyncingLuogu}><Download className="h-3.5 w-3.5" />洛谷导入中心</Button><Button variant="outline" onClick={handleTestLuoguConnection} disabled={isTestingLuoguConnection || isSyncingLuogu}><PlugZap className="h-3.5 w-3.5" />{isTestingLuoguConnection ? "测试中..." : "测试连接"}</Button></div></SettingRow>
                    </section>
                  )}

                  {shouldRenderSettingsPage("blog-preview") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 text-base font-semibold text-foreground">本地预览</div>
                      <SettingRow title="博客预览" description="打开或重启本地博客服务。"><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={handleOpenBlog}><ExternalLink className="h-3.5 w-3.5" />打开博客</Button><Button variant="outline" onClick={handleRestartBlog} disabled={isRestartingBlog}><RotateCcw className="h-3.5 w-3.5" />{isRestartingBlog ? "重启中..." : "重启博客"}</Button></div></SettingRow>
                    </section>
                  )}

                  {shouldRenderSettingsPage("data-storage") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 text-base font-semibold text-foreground">目录与缓存</div>
                      <SettingRow title="打开笔记文件夹" description="查看当前笔记目录。"><Button variant="outline" onClick={handleOpenNotesFolder}><FolderOpen className="h-3.5 w-3.5" />打开笔记文件夹</Button></SettingRow>
                      <SettingRow title="清理联网缓存" description="同联网搜索页的缓存操作。"><Button type="button" variant="outline" size="sm" onClick={() => void handleClearWebCache()} disabled={isClearingWebCache}>{isClearingWebCache ? "清理中..." : "清理联网缓存"}</Button></SettingRow>
                    </section>
                  )}

                  {shouldRenderSettingsPage("about-version") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 text-base font-semibold text-foreground">版本与说明</div>
                      <SettingRow title="OI Notebook" description="面向 OI 训练场景的本地笔记、博客、洛谷整理和 AI 辅助工作台。"><span className="text-sm text-muted-foreground">版本：0.1.0</span></SettingRow>
                      <SettingRow title="开发者模式" description="显示 Git、诊断、自检和底层调试入口。"><button type="button" className={cn("relative h-6 w-11 shrink-0 rounded-full border transition-colors", developerModeEnabled ? "border-primary/70 bg-primary" : "border-border bg-muted")} onClick={() => setDeveloperModeEnabled((enabled) => !enabled)} role="switch" aria-checked={developerModeEnabled} aria-label="启用开发者模式"><span className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform", developerModeEnabled && "translate-x-5")} /></button></SettingRow>
                    </section>
                  )}

                  {shouldRenderSettingsPage("about-markdown") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 text-base font-semibold text-foreground">Markdown 支持</div>
                      <SettingRow title="预览能力" description="主工作台负责编辑和预览。"><div className="flex flex-wrap gap-2">{MARKDOWN_CAPABILITIES.map((feature) => <span key={feature} className="inline-flex items-center border border-border/70 bg-muted/20 px-2 py-1 text-xs text-foreground">{feature}</span>)}</div></SettingRow>
                    </section>
                  )}

                  {shouldRenderSettingsPage("about-privacy") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 text-base font-semibold text-foreground">数据与隐私</div>
                      <SettingRow title="本机配置" description="配置保存在本机；API Key 不显示明文，不写入前端 localStorage。" />
                      <SettingRow title="缓存与索引" description="本地笔记索引和联网缓存保存在 .oinb/。" />
                      <SettingRow title="联网搜索" description="只向所选 Provider 发送必要查询词；网页摘录只读取公开 http/https 页面。" />
                      <SettingRow title="本地笔记" description="不会上传到搜索 Provider；不读取 Cookie、历史记录、密码或登录态。" />
                    </section>
                  )}

                  {developerModeEnabled && shouldRenderSettingsPage("diagnostics-search") && (
                    <section className={settingsPageSectionClass}>
                      <SearchDiagnosticsPanel aiConfigDraft={aiConfigDraft} />
                    </section>
                  )}

                  {developerModeEnabled && shouldRenderSettingsPage("git-sync") && (
                    <section className={settingsPageSectionClass}>
                      <div className="mb-3 text-base font-semibold text-foreground">进阶同步入口</div>
                      <SettingRow title="Git 同步" description="整理完本地改动后再使用。"><Button variant="outline" onClick={handlePushGit} disabled={isPushingGit}><Upload className="h-3.5 w-3.5" />{isPushingGit ? "同步中..." : "同步 Git"}</Button></SettingRow>
                    </section>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
        <button
          type="button"
          className="absolute bottom-0 right-0 top-0 z-20 w-2 cursor-ew-resize bg-transparent"
          onPointerDown={(event) => beginSettingsCenterResize("right", event)}
          aria-label="从右侧调整设置中心宽度"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute bottom-0 left-0 top-0 z-20 w-2 cursor-ew-resize bg-transparent"
          onPointerDown={(event) => beginSettingsCenterResize("left", event)}
          aria-label="从左侧调整设置中心宽度"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute left-0 right-0 top-0 z-20 h-2 cursor-ns-resize bg-transparent"
          onPointerDown={(event) => beginSettingsCenterResize("top", event)}
          aria-label="从顶部调整设置中心高度"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute bottom-0 left-0 right-0 z-20 h-2 cursor-ns-resize bg-transparent"
          onPointerDown={(event) => beginSettingsCenterResize("bottom", event)}
          aria-label="从底部调整设置中心高度"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute left-0 top-0 z-30 h-4 w-4 cursor-nwse-resize bg-transparent"
          onPointerDown={(event) => beginSettingsCenterResize("top-left", event)}
          aria-label="从左上角调整设置中心大小"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute right-0 top-0 z-30 h-4 w-4 cursor-nesw-resize bg-transparent"
          onPointerDown={(event) => beginSettingsCenterResize("top-right", event)}
          aria-label="从右上角调整设置中心大小"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute bottom-0 left-0 z-30 h-4 w-4 cursor-nesw-resize bg-transparent"
          onPointerDown={(event) => beginSettingsCenterResize("bottom-left", event)}
          aria-label="从左下角调整设置中心大小"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute bottom-0 right-0 z-30 h-4 w-4 cursor-nwse-resize bg-transparent"
          onPointerDown={(event) => beginSettingsCenterResize("bottom-right", event)}
          aria-label="从右下角调整设置中心大小"
          tabIndex={-1}
        />
      </DialogContent>
    </Dialog>
    <div className="app-shell flex h-screen max-h-screen flex-col overflow-hidden bg-background text-foreground" style={appearanceStyle}>
      {/* Header */}
      <header className="app-top-toolbar flex min-h-8 shrink-0 select-none items-center gap-2.5 border-b border-border bg-background px-2.5 py-0.5">
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
          <div className="flex items-center" aria-label="窗口控制">
            <button
              type="button"
              className="flex h-6 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => void handleMinimizeWindow()}
              title="最小化"
              aria-label="最小化窗口"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex h-6 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => void handleToggleMaximizeWindow()}
              title="最大化 / 还原"
              aria-label="最大化或还原窗口"
            >
              <Square className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="flex h-6 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-red-500/85 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
              onClick={() => void handleCloseWindow()}
              title="关闭"
              aria-label="关闭窗口"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main workspace */}
      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <nav
          className="app-activity-bar flex w-13 shrink-0 flex-col items-center justify-between border-r border-border/80 bg-muted/10 py-2.5"
          aria-label="主活动栏"
        >
          <div className="flex flex-col items-center gap-1.5">
            <button
              type="button"
              className={activityButtonClass("notes")}
              onClick={handleActivityNotes}
              title={isNotesSidebarOpen ? "收起笔记侧栏" : "展开笔记侧栏"}
              aria-label={isNotesSidebarOpen ? "收起笔记侧栏" : "展开笔记侧栏"}
              aria-pressed={activeActivityItem === "notes"}
            >
              <FileText size={24} strokeWidth={2.18} />
            </button>
            <button
              type="button"
              className={activityButtonClass("search")}
              onClick={handleActivitySearch}
              title="搜索笔记"
              aria-label="搜索笔记"
              aria-pressed={activeActivityItem === "search"}
            >
              <Search size={24} strokeWidth={2.18} />
            </button>
            <button
              type="button"
              className={activityButtonClass("luogu")}
              onClick={handleActivityLuogu}
              title="洛谷导入中心"
              aria-label="洛谷导入中心"
              aria-pressed={activeActivityItem === "luogu"}
              disabled={isLoadingLuoguConfig || isTestingLuoguConnection || isScanningLuoguPreview || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isSyncingLuogu}
            >
              <RefreshCw size={24} strokeWidth={2.18} />
            </button>
            <button
              type="button"
              className={activityButtonClass("ai")}
              onClick={handleActivityAi}
              title={isAiSidebarOpen ? "关闭 AI 助手" : "打开 AI 助手"}
              aria-label={isAiSidebarOpen ? "关闭 AI 助手" : "打开 AI 助手"}
              aria-pressed={isAiActivityActive}
            >
              <Bot size={24} strokeWidth={2.18} />
            </button>
            <button
              type="button"
              className={activityButtonClass("blog")}
              onClick={handleActivityBlog}
              title="打开博客"
              aria-label="打开博客"
              aria-pressed={activeActivityItem === "blog"}
            >
              <ExternalLink size={24} strokeWidth={2.18} />
            </button>
          </div>
          <button
            type="button"
            className={activityButtonClass("settings")}
            onClick={openSettingsCenter}
            title="设置中心"
            aria-label="设置中心"
            aria-pressed={activeActivityItem === "settings"}
          >
            <Settings size={24} strokeWidth={2.18} />
          </button>
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
                  onClick={() => {
                    setActiveTreeDirectoryPath("");
                    setActiveTreeFilePath(null);
                    setIsTreeRootCollapsed((current) => !current);
                  }}
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
                    onClick={openCreateDialog}
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
                  createFolderRequest={createFolderRequest}
                  onSelectFile={handleSelectFile}
                  onSelectDirectory={handleSelectTreeDirectory}
                  onClearSelection={handleClearTreeSelection}
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
          ) : !currentFilePath ? (
            <div className="flex min-h-0 flex-1 justify-center overflow-auto px-6 py-8">
              <div className="grid w-full max-w-6xl gap-5">
                <section className="rounded-lg border border-border bg-background/90 p-6 shadow-sm">
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.95fr)]">
                    <div className="grid gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-2xl font-semibold tracking-wide">欢迎回来</div>
                        <span className="rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                          OI Notebook
                        </span>
                      </div>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        本地 OI 笔记、题解复盘、洛谷导入与 AI 辅助整理工作台。第一屏先帮你继续写，而不是重新读一遍说明书。
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button className="gap-2" onClick={openCreateDialog}>
                          <Plus className="h-4 w-4" />
                          新建笔记
                        </Button>
                        <Button variant="outline" className="gap-2" onClick={() => void openLuoguDialog()}>
                          <Download className="h-4 w-4" />
                          从洛谷导入
                        </Button>
                        <Button variant="outline" className="gap-2" onClick={handleOpenBlog}>
                          <ExternalLink className="h-4 w-4" />
                          打开本地博客
                        </Button>
                        <Button
                          variant="outline"
                          className="gap-2"
                          onClick={() => void openAiSettings()}
                          disabled={isLoadingAiConfig || isSavingAiConfig}
                        >
                          <Bot className="h-4 w-4" />
                          配置 AI
                        </Button>
                        <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground" onClick={openSettingsCenter}>
                          <Settings className="h-4 w-4" />
                          打开设置
                        </Button>
                      </div>
                    </div>

                    <section className="grid gap-3 rounded-lg border border-border bg-muted/15 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            当前状态
                          </div>
                          <div className="mt-1 text-sm font-medium text-foreground">桌面工作台已就绪</div>
                        </div>
                        <span className="rounded-sm border border-border bg-background/70 px-2 py-1 text-[10px] text-muted-foreground">
                          {dashboardNotes.length} 篇可用笔记
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          className="rounded-md border border-border bg-background/70 px-3 py-3 text-left transition-colors hover:bg-accent/40"
                          onClick={() => openSettingsSection("blog")}
                        >
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Blog</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{blogStatusLabel}</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">本地博客入口和服务管理在这里汇总。</div>
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-border bg-background/70 px-3 py-3 text-left transition-colors hover:bg-accent/40"
                          onClick={() => openSettingsSection("ai")}
                        >
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">AI</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{aiStatusLabel}</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">API Key 和 Prompt 都走本地配置，不会帮你编造连接状态。</div>
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-border bg-background/70 px-3 py-3 text-left transition-colors hover:bg-accent/40"
                          onClick={() => openSettingsSection("luogu")}
                        >
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">洛谷</div>
                          <div className="mt-1 text-sm font-medium text-foreground">{luoguStatusLabel}</div>
                          <div className="mt-1 text-xs leading-5 text-muted-foreground">Cookie、扫描规则和导入入口都继续复用现有流程。</div>
                        </button>
                        <div className="rounded-md border border-border bg-background/70 px-3 py-3">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">数据与存储</div>
                          <div className="mt-1 text-sm font-medium text-foreground">notes 本地目录</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs leading-5 text-muted-foreground">
                            <span>笔记保存在本机目录里，备份或同步前可以先打开目录确认内容。</span>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={openNotesFolder}>
                              打开目录
                            </Button>
                            {developerModeEnabled && (
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void handlePushGit()}>
                                {gitStatusLabel}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
                </section>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
                  <section className="grid gap-3 rounded-lg border border-border bg-background/80 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          继续编辑
                        </div>
                        <div className="mt-1 text-base font-medium text-foreground">从现有笔记继续推进</div>
                      </div>
                      <span className="text-xs text-muted-foreground">按最近修改排序</span>
                    </div>
                    {dashboardNotes.length > 0 ? (
                      <div className="grid gap-2">
                        {dashboardNotes.map((file) => (
                          <button
                            key={file.path}
                            type="button"
                            className="grid min-w-0 gap-2 rounded-md border border-border bg-muted/10 px-3 py-3 text-left transition-colors hover:bg-accent/35"
                            onClick={() => handleSelectFile(file.path)}
                          >
                            <div className="flex min-w-0 items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-foreground">{file.name.replace(/\.md$/i, "")}</div>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span className="rounded-sm border border-border bg-background/60 px-1.5 py-0.5">
                                    {getDashboardNoteCategory(file.path)}
                                  </span>
                                  <span className="truncate">{file.path}</span>
                                </div>
                              </div>
                              <div className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(file.modified)}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                        还没有可继续的笔记。可以从左侧 Sidebar 或这里的新建入口先写第一篇。
                      </div>
                    )}
                  </section>

                  <div className="grid gap-5">
                    <section className="grid gap-3 rounded-lg border border-border bg-background/80 p-5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        快速操作
                      </div>
                      <div className="grid gap-2">
                        <button
                          type="button"
                          className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/10 px-3 py-3 text-left transition-colors hover:bg-accent/35"
                          onClick={openCreateDialog}
                        >
                          <div className="flex items-center gap-3">
                            <Plus className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-sm font-medium text-foreground">新建笔记</div>
                              <div className="text-xs text-muted-foreground">从 trick 或 problem 模板开始。</div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/10 px-3 py-3 text-left transition-colors hover:bg-accent/35"
                          onClick={() => void openLuoguDialog()}
                        >
                          <div className="flex items-center gap-3">
                            <Download className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-sm font-medium text-foreground">从洛谷导入</div>
                              <div className="text-xs text-muted-foreground">扫描、预览、确认后再写入笔记。</div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/10 px-3 py-3 text-left transition-colors hover:bg-accent/35"
                          onClick={handleOpenBlog}
                        >
                          <div className="flex items-center gap-3">
                            <ExternalLink className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-sm font-medium text-foreground">打开本地博客</div>
                              <div className="text-xs text-muted-foreground">用阅读视图回看文章效果。</div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/10 px-3 py-3 text-left transition-colors hover:bg-accent/35"
                          onClick={() => void openAiSettings()}
                          disabled={isLoadingAiConfig || isSavingAiConfig}
                        >
                          <div className="flex items-center gap-3">
                            <Bot className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-sm font-medium text-foreground">配置 AI</div>
                              <div className="text-xs text-muted-foreground">管理模型配置和 Prompt 入口。</div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          type="button"
                          className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/10 px-3 py-3 text-left transition-colors hover:bg-accent/35"
                          onClick={openSettingsCenter}
                        >
                          <div className="flex items-center gap-3">
                            <Settings className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="text-sm font-medium text-foreground">打开设置</div>
                              <div className="text-xs text-muted-foreground">外观、AI、Blog、数据目录都在这里。</div>
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    </section>

                    <section className="grid gap-3 rounded-lg border border-border bg-muted/15 p-5">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        能力速览
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1 rounded-md border border-border bg-background/70 p-3">
                          <div className="text-sm font-medium text-foreground">Markdown</div>
                          <div className="text-xs leading-5 text-muted-foreground">
                            KaTeX、代码高亮、callout、cute-table、表格合并。
                          </div>
                        </div>
                        <div className="grid gap-1 rounded-md border border-border bg-background/70 p-3">
                          <div className="text-sm font-medium text-foreground">洛谷导入</div>
                          <div className="text-xs leading-5 text-muted-foreground">
                            扫描、规则、预览、确认写入，仍是可控工作流。
                          </div>
                        </div>
                        <div className="grid gap-1 rounded-md border border-border bg-background/70 p-3">
                          <div className="text-sm font-medium text-foreground">AI</div>
                          <div className="text-xs leading-5 text-muted-foreground">
                            Prompt 可编辑，API Key 只保存在本地配置。
                          </div>
                        </div>
                        <div className="grid gap-1 rounded-md border border-border bg-background/70 p-3">
                          <div className="text-sm font-medium text-foreground">Local Blog</div>
                          <div className="text-xs leading-5 text-muted-foreground">
                            用本地博客预览文章列表、搜索、分类和阅读效果。
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>
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
                      <summary className="flex h-8 cursor-pointer list-none select-none items-center justify-between px-4 text-xs font-medium text-muted-foreground hover:bg-accent/30 [&::-webkit-details-marker]:hidden">
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
                      <div className="app-frontmatter-body grid gap-3 px-4 py-3">
                        <div className="app-frontmatter-grid grid grid-cols-1 gap-3 lg:grid-cols-2">
                          <div className="app-frontmatter-field grid gap-1.5">
                            <Label htmlFor="frontmatter-title">标题</Label>
                            <Input
                              id="frontmatter-title"
                              value={frontmatter.fields.title}
                              disabled={!frontmatter.canMerge}
                              onChange={(e) => updateFrontmatter({ title: e.target.value })}
                            />
                          </div>
                          <div className="app-frontmatter-field grid gap-1.5">
                            <Label htmlFor="frontmatter-tags">标签</Label>
                            <Input
                              id="frontmatter-tags"
                              value={frontmatter.fields.tags.join(", ")}
                              disabled={!frontmatter.canMerge || !frontmatter.canEditTags}
                              placeholder="用逗号分隔标签"
                              onChange={(e) => updateTagsFromInput(e.target.value)}
                            />
                          </div>
                          <div className="app-frontmatter-field grid gap-1.5">
                            <Label htmlFor="frontmatter-difficulty">难度</Label>
                            <Input
                              id="frontmatter-difficulty"
                              value={frontmatter.fields.difficulty}
                              disabled={!frontmatter.canMerge}
                              onChange={(e) => updateFrontmatter({ difficulty: e.target.value })}
                            />
                          </div>
                          <div className="app-frontmatter-field grid gap-1.5">
                            <Label htmlFor="frontmatter-source">来源</Label>
                            <Input
                              id="frontmatter-source"
                              value={frontmatter.fields.source}
                              disabled={!frontmatter.canMerge}
                              onChange={(e) => updateFrontmatter({ source: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="app-frontmatter-field app-frontmatter-summary grid gap-1.5">
                          <Label htmlFor="frontmatter-summary">摘要</Label>
                          <textarea
                            id="frontmatter-summary"
                            value={frontmatter.fields.summary}
                            disabled={!frontmatter.canMerge}
                            rows={2}
                            className="min-h-14 w-full resize-none rounded-none border border-input bg-transparent px-2.5 py-2 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
                            onChange={(e) => updateFrontmatter({ summary: e.target.value })}
                          />
                        </div>
                        <label className="app-frontmatter-draft flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={frontmatter.fields.draft}
                            disabled={!frontmatter.canMerge}
                            className="h-4 w-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                            onChange={(e) => updateFrontmatter({ draft: e.target.checked })}
                          />
                          草稿
                        </label>
                      </div>
                    </details>
                  )}
                  <MarkdownEditor
                    value={markdown}
                    onChange={handleEditorChange}
                    aiContextSelectionRange={aiContextSelectionRange}
                    onSelectionChange={(selectedText, range, cursorOffset) => {
                      setEditorSelectedText(selectedText);
                      setEditorSelectedTextLength(selectedText.length > 0 ? selectedText.length : null);
                      setEditorCursorOffset(cursorOffset);
                      setAiContextSelectionRange(range);
                    }}
                    onPasteImage={handlePasteImage}
                    onScroll={(r) => syncEditorPreviewScroll("editor", r)}
                    hideToolbar
                    onToolbarApiChange={setMarkdownToolbarApi}
                    onScrollApiChange={(api) => {
                      editorScrollApiRef.current = api;
                    }}
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
                    markdown={markdown}
                    noteRelativePath={currentFilePath}
                    onScroll={(r) => syncEditorPreviewScroll("preview", r)}
                    onScrollApiChange={(api) => {
                      previewScrollApiRef.current = api;
                    }}
                    className="h-full w-full min-w-0"
                  />
                </aside>
              </div>
            </>
          )}
        </section>
        {isAiSidebarOpen && !isAiSidebarMaximized && (
          <button
            type="button"
            className={cn(
              "app-column-resizer app-column-resizer-ai",
              activeResizeHandle === "ai-sidebar" && "app-column-resizer-active",
            )}
            onPointerDown={(event) => beginColumnResize("ai-sidebar", event)}
            onDoubleClick={() => resetColumnSize("ai-sidebar")}
            aria-label="调整 AI 助手宽度"
            title="拖拽调整 AI 助手宽度，双击重置"
          />
        )}
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
          developerModeEnabled={developerModeEnabled}
          onMaximizedChange={setIsAiSidebarMaximized}
          aiConfig={aiConfig}
          onAiConfigChange={handleAiConfigChangeFromSidebar}
          onOpenAiSettings={() => void openAiSettings()}
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
                isDirty && !isSavingNote
                  ? "app-status-save-dirty"
                  : "cursor-default text-muted-foreground",
                (!currentFilePath || !isDirty || isSavingNote) && "pointer-events-none",
              )}
              onClick={handleSaveCurrentNote}
              disabled={!currentFilePath || !isDirty || isSavingNote}
              title={isDirty ? "保存当前笔记" : saveStatusLabel}
              aria-label={isDirty ? "保存当前笔记" : saveStatusLabel}
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
            {developerModeEnabled && (
              <button
                type="button"
                className="app-status-item app-status-button truncate whitespace-nowrap rounded px-1.5 py-0.5 transition-colors"
                onClick={() => void handlePushGit()}
                disabled={isPushingGit}
                title="同步 Git"
              >
                Git：{gitStatusLabel}
              </button>
            )}
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

