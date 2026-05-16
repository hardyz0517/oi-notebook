import { listen } from "@tauri-apps/api/event";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { Bot, ChevronRight, Columns2, Download, ExternalLink, Eye, FileText, FolderOpen, Minus, PlugZap, Plus, RefreshCw, RotateCcw, Save, Search, Settings, Sparkles, Square, SquarePen, Trash2, Upload, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/datetime";
import { listNotes, readNote, writeNote, commitNote, commitDeletedNote, commitRenamedNote, pushGit, deleteNote, renameNote, openBlog, restartBlogServer, openNotesFolder, saveNoteAsset, importLuoguInsight, prepareLuoguSubmissionNote, writeLuoguPreparedNote, getLuoguConfig, saveLuoguConfig, updateLuoguLastSubmissionId, testLuoguConnection, previewLuoguSubmissionPage, syncLuoguInsights, getAiConfig, saveAiConfig, syncAiProviderModelsDraft, testAiProviderDraft, generateNoteMetadata, polishNoteBody, listAiPrompts, readAiPrompt, saveAiPrompt, searchNotes, testWebSearchConnection } from "@/lib/api";
import type { AiConfig, AiProvider, NoteSearchResult, PrepareLuoguSubmissionNoteResult, WriteLuoguPreparedNoteResult, PreviewLuoguSubmission, PreviewLuoguSubmissionsResult, PromptTemplateSummary, SyncLuoguInsightsResult, TestLuoguConnectionResult } from "@/lib/api";
import { mergeFrontmatterFields, mergeFrontmatterMetadata, parseFrontmatterFields, splitFrontmatter } from "@/lib/frontmatter";
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
const AI_CONFIG_MISSING_MESSAGE =
  "AI 还没有配置：当前版本的 AI 配置保存在本机数据目录的 .oinb/config.json。release/安装版需要重新配置，请到 AI 设置填写 base_url / api_key / model。";
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

type NewNoteDirectory = "tricks" | "problems";
type NoteTemplateId = "blank" | "trick" | "solution";
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
type SettingsSection = "general" | "appearance" | "editor" | "ai" | "luogu" | "blog" | "git" | "data" | "about";
type AiSettingsTab = "api" | "web-search" | "prompts";
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
const SETTINGS_SECTIONS: Array<{ id: SettingsSection; label: string; blurb: string }> = [
  { id: "general", label: "常规", blurb: "基础设置" },
  { id: "appearance", label: "外观", blurb: "主题与字号" },
  { id: "editor", label: "编辑器", blurb: "编辑体验" },
  { id: "ai", label: "AI", blurb: "模型、API 与 Prompt" },
  { id: "luogu", label: "洛谷", blurb: "导入与扫描" },
  { id: "blog", label: "博客", blurb: "本地预览" },
  { id: "git", label: "Git", blurb: "同步入口" },
  { id: "data", label: "数据与存储", blurb: "目录与说明" },
  { id: "about", label: "关于", blurb: "版本与说明" },
];
const AI_SETTINGS_TABS: Array<{ id: AiSettingsTab; label: string; description: string }> = [
  { id: "api", label: "模型与 API", description: "配置 OpenAI-compatible API、模型和默认项" },
  { id: "web-search", label: "联网搜索", description: "配置真实搜索 Provider" },
  { id: "prompts", label: "Prompt 模板", description: "编辑本地 AI Prompt 模板" },
];
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

function getDefaultTemplateForDirectory(directory: NewNoteDirectory): NoteTemplateId {
  return directory === "tricks" ? "trick" : "solution";
}

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

function buildNoteTemplate(templateId: NoteTemplateId, title: string): string {
  if (templateId === "blank") return "";

  const quotedTitle = quoteYamlString(title);
  const frontmatter = `---\ntitle: ${quotedTitle}\ntags: []\ndifficulty: ""\nsource: ""\nsummary: ""\ndraft: false\n---`;

  if (templateId === "trick") {
    return `${frontmatter}\n\n## 结论\n\n\n## 适用条件\n\n\n## 例子\n\n\n## 代码\n\n\`\`\`cpp\n\n\`\`\`\n`;
  }

  return `${frontmatter}\n\n## 题意\n\n\n## 思路\n\n\n## 证明\n\n\n## 代码\n\n\`\`\`cpp\n\n\`\`\`\n\n## 复杂度\n\n\n`;
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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

function getNoteDisplayName(path: string, files: NoteFileInfo[]): string {
  const file = files.find((item) => item.path === path);
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

function isAiConfigMissingError(message: string): boolean {
  return (
    message.includes("base_url is missing") ||
    message.includes("api_key is missing") ||
    message.includes("model is missing")
  );
}

interface PromptUsageInfo {
  purpose: string;
  variables: string[];
  notes: string[];
}

function getPromptUsageInfo(fileName: string): PromptUsageInfo {
  if (fileName === "luogu-insight.md") {
    return {
      purpose: "用于把洛谷提交里的候选 insight、trick、坑点或总结整理成结构化笔记。",
      variables: ["{{problem_id}}", "{{problem_title}}", "{{submission_id}}", "{{candidate_comment}}"],
      notes: [
        "只编辑 Prompt 文本本身，不要写入 API Key、Base URL、Cookie 等密钥。",
        "这个模板会参与洛谷 insight 整理流程，返回格式要求请保留在 Prompt 内容里。",
      ],
    };
  }

  if (fileName === "note-metadata.md") {
    return {
      purpose: "用于根据当前笔记正文生成 title、tags、summary 等元信息建议。",
      variables: ["{{note_path}}", "{{content}}"],
      notes: [
        "这个模板只负责元数据补全，不应该要求 AI 改写正文。",
        "保存后会影响后续 AI 元数据整理请求，但不会自动改动当前笔记。",
      ],
    };
  }

  if (fileName === "note-polish.md") {
    return {
      purpose: "用于润色当前笔记正文 body，并先生成可预览的润色结果。",
      variables: ["{{note_path}}", "{{body}}"],
      notes: [
        "这个模板面向正文润色，不处理 frontmatter。",
        "建议保留代码块、公式、链接和表格的保护约束，避免 AI 误改关键内容。",
      ],
    };
  }

  return {
    purpose: "用于配置本地 AI Prompt 模板。",
    variables: [],
    notes: [
      "Prompt 保存在本地 .oinb/prompts/，不会提交到 Git。",
      "不要把 API Key、Base URL、Cookie 或其它密钥写进 Prompt。",
    ],
  };
}

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
  const [dialogMode, setDialogMode] = useState<null | "create" | "rename">(null);
  const [dialogValue, setDialogValue] = useState("");
  const [newNoteDirectory, setNewNoteDirectory] = useState<NewNoteDirectory>("tricks");
  const [newNoteTemplate, setNewNoteTemplate] = useState<NoteTemplateId>("trick");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
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
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [aiConfigDraft, setAiConfigDraft] = useState<AiConfig | null>(null);
  const [selectedAiProviderId, setSelectedAiProviderId] = useState("");
  const [aiManualModelId, setAiManualModelId] = useState("");
  const [aiModelSearchQuery, setAiModelSearchQuery] = useState("");
  const [aiSettingsTab, setAiSettingsTab] = useState<AiSettingsTab>("api");
  const [aiProviderBusyId, setAiProviderBusyId] = useState<string | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateSummary[]>([]);
  const [selectedPromptFileName, setSelectedPromptFileName] = useState("");
  const [promptContent, setPromptContent] = useState("");
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isGeneratingNoteMetadata, setIsGeneratingNoteMetadata] = useState(false);
  const [isPolishingNoteBody, setIsPolishingNoteBody] = useState(false);
  const [polishedBodyPreview, setPolishedBodyPreview] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAdvancedActionsOpen, setIsAdvancedActionsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
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
  const searchRequestSeqRef = useRef(0);
  const luoguPrepareRunSeqRef = useRef(0);
  const luoguPrepareRunRef = useRef<{ id: number; cancelled: boolean }>({ id: 0, cancelled: false });
  const isMountedRef = useRef(true);
  const initialOpenTabsActivePathRef = useRef<string | null>(getInitialOpenTabsActivePath());
  const hasRestoredOpenTabsRef = useRef(false);
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
  const savedAiProviderById = useMemo(
    () => new Map((aiConfig?.providers ?? []).map((provider) => [provider.id, getAiConfigComparable({
      base_url: "",
      api_key: "",
      model: "",
      providers: [provider],
      default_provider_id: provider.id,
      default_model_id: provider.default_model,
      web_search: DEFAULT_WEB_SEARCH_CONFIG,
    })])),
    [aiConfig],
  );
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
  const isAiActivityActive = isAiSidebarOpen || (isAdvancedActionsOpen && settingsSection === "ai");
  const appZoomLabel = `${Math.round(appZoom * 100)}%`;
  const contentZoomLabel = `${Math.round(contentZoom * 100)}%`;
  const uiScaleLabel = `${Math.round(uiScale * 100)}%`;
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
  const dashboardNotes = useMemo(
    () =>
      [...files]
        .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
        .slice(0, 6),
    [files],
  );
  const activeNoteFile = useMemo(
    () => files.find((file) => file.path === currentFilePath) ?? null,
    [files, currentFilePath],
  );
  const openTabs = useMemo<OpenFileTab[]>(
    () =>
      openTabPaths.map((path) => ({
        kind: "file",
        path,
        displayName: getNoteDisplayName(path, files),
        title:
          path === currentFilePath && frontmatter.fields.title.trim()
            ? frontmatter.fields.title.trim()
            : undefined,
        dirty: path === currentFilePath && isDirty,
      })),
    [currentFilePath, files, frontmatter.fields.title, isDirty, openTabPaths],
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
    if (trimmedSearchQuery === "") return buildLocalSearchResults(files, "");

    if (searchError) return buildLocalSearchResults(files, searchQuery);

    return backendSearchResults.map(toSearchResultItem);
  }, [backendSearchResults, files, searchError, searchQuery, trimmedSearchQuery]);

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

  function validateFilename(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return "文件名不能为空";
    // TODO(后续 Phase): 支持跨目录重命名（拖拽或对话框选目标目录）
    if (trimmed.includes("/") || trimmed.includes("\\")) return "文件名不能包含路径分隔符";
    if (trimmed.includes("..")) return "文件名不能包含 ..";
    if (trimmed.toLowerCase().endsWith(".md")) return "不需要输入 .md 后缀";
    return null;
  }

  const openCreateDialog = () => {
    setDialogMode("create");
    setDialogValue("");
    setNewNoteDirectory("tricks");
    setNewNoteTemplate(getDefaultTemplateForDirectory("tricks"));
  };

  const openRenameDialog = (path: string) => {
    // 提取纯文件名（不含目录前缀），如 "inbox/quick-xxx.md" → "quick-xxx"
    const filename = path.split("/").pop() ?? path;
    const baseName = filename.replace(/\.md$/i, "");
    setDialogMode("rename");
    setDialogValue(baseName);
    setRenameTarget(path);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setDialogValue("");
    setNewNoteDirectory("tricks");
    setNewNoteTemplate(getDefaultTemplateForDirectory("tricks"));
    setRenameTarget(null);
  };

  const updateNewNoteDirectory = (directory: NewNoteDirectory) => {
    setNewNoteDirectory(directory);
    setNewNoteTemplate(getDefaultTemplateForDirectory(directory));
  };

  const handleCreate = async () => {
    const err = validateFilename(dialogValue);
    if (err) { toast.error(err); return; }
    const newPath = `${newNoteDirectory}/${dialogValue.trim()}.md`;
    if (files.some((f) => f.path === newPath)) { toast.error("文件名已存在"); return; }
    // dirty 检查必须在创建文件之前——避免用户取消后留下孤儿文件
    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，新建会切换走，未保存的改动将丢失。确定吗？");
      if (!ok) return;
    }
    try {
      const templateMarkdown = buildNoteTemplate(newNoteTemplate, dialogValue.trim());
      await writeNote(newPath, templateMarkdown);
      const updated = await listNotes();
      setFiles(updated);
      closeDialog();
      setCurrentFilePath(newPath);
      toast.success("已创建");
    } catch (e) {
      toast.error(`创建失败: ${e}`);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const err = validateFilename(dialogValue);
    if (err) { toast.error(err); return; }
    // 保留原目录前缀，如 "inbox/quick-xxx.md" → "inbox/new-name.md"
    const lastSlashIdx = renameTarget.lastIndexOf("/");
    const dirPrefix = lastSlashIdx === -1 ? "" : renameTarget.slice(0, lastSlashIdx + 1);
    const newPath = `${dirPrefix}${dialogValue.trim()}.md`;
    if (newPath === renameTarget) { closeDialog(); return; }
    if (files.some((f) => f.path === newPath)) { toast.error("文件名已存在"); return; }
    if (renameTarget === currentFilePath && isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，重命名前请先保存。确定继续吗？未保存的改动将丢失。");
      if (!ok) return;
    }
    try {
      await renameNote(renameTarget, newPath);
      try {
        await commitRenamedNote(renameTarget, newPath);
        toast.success("已重命名并提交");
      } catch (commitError) {
        toast.warning(`重命名成功，Git 提交失败：${commitError}`);
      }
      const updated = await listNotes();
      setFiles(updated);
      setOpenTabPaths((current) => current.map((path) => (path === renameTarget ? newPath : path)));
      if (renameTarget === currentFilePath) {
        setCurrentFilePath(newPath);
        setIsDirty(false);
      }
      closeDialog();
    } catch (e) {
      toast.error(`重命名失败: ${e}`);
    }
  };

  const handleDelete = async (path: string) => {
    const ok = window.confirm(`确定删除"${path}"吗？此操作不可撤销。`);
    if (!ok) return;
    try {
      await deleteNote(path);
      try {
        const commitStatus = await commitDeletedNote(path);
        if (commitStatus === "committed") {
          toast.success("已删除并提交");
        } else {
          toast.success("已删除");
        }
      } catch (commitError) {
        toast.warning(`删除成功，Git 提交失败：${commitError}`);
      }
      const updated = await listNotes();
      setFiles(updated);
      setOpenTabPaths((current) => current.filter((tabPath) => tabPath !== path));
      if (path === currentFilePath) {
        setCurrentFilePath(null);
        setIsDirty(false);
      }
    } catch (e) {
      toast.error(`删除失败: ${e}`);
    }
  };

  const handleDialogConfirm = () => {
    if (dialogMode === "create") handleCreate();
    else if (dialogMode === "rename") handleRename();
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

  const openAiSettings = async () => {
    setSettingsSection("ai");
    setAiSettingsTab("api");
    setIsAdvancedActionsOpen(true);
    setIsLoadingAiConfig(true);
    try {
      await refreshAiConfig();
    } catch (e) {
      toast.error(`AI 配置读取失败：${e}`);
    } finally {
      setIsLoadingAiConfig(false);
    }
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

  const handleSaveAiConfig = async () => {
    if (!aiConfigDraft) {
      toast.error("AI 配置还没有读取完成");
      return;
    }
    setIsSavingAiConfig(true);
    try {
      await saveAiConfig(normalizeAiConfigDraft(aiConfigDraft));
      const config = await refreshAiConfig();
      setAiConfigDraft(cloneAiConfig(config));
      toast.success("AI 配置已保存");
    } catch (e) {
      toast.error(`AI 配置保存失败：${getErrorMessage(e)}`);
    } finally {
      setIsSavingAiConfig(false);
    }
  };

  const handleTestWebSearchConnection = async () => {
    const webSearchConfig = normalizeWebSearchConfig(aiConfigDraft?.web_search);
    if (webSearchConfig.provider !== "bocha") {
      setWebSearchConnectionMessage("当前测试连接仅支持博查 Bocha。");
      return;
    }
    if (!webSearchConfig.bochaApiKey.trim()) {
      setWebSearchConnectionMessage("需要先填写博查 API Key。");
      return;
    }

    setIsTestingWebSearchConnection(true);
    setWebSearchConnectionMessage(null);
    try {
      await testWebSearchConnection({
        provider: "bocha",
        apiKey: webSearchConfig.bochaApiKey,
        endpoint: webSearchConfig.bochaEndpoint,
      });
      setWebSearchConnectionMessage("连接成功");
    } catch (e) {
      setWebSearchConnectionMessage(getErrorMessage(e));
    } finally {
      setIsTestingWebSearchConnection(false);
    }
  };

  const handleCancelAiConfigDraft = () => {
    if (!aiConfig) return;
    const resetConfig = cloneAiConfig(aiConfig);
    setAiConfigDraft(resetConfig);
    setSelectedAiProviderId(
      resetConfig.providers.find((provider) => provider.id === resetConfig.default_provider_id)?.id ??
      resetConfig.providers[0]?.id ??
      "",
    );
    setAiManualModelId("");
    setAiModelSearchQuery("");
    toast.info("已放弃未保存的 API 管理改动");
  };

  const loadPromptContent = async (fileName: string) => {
    setIsLoadingPrompt(true);
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
      const currentPrompt =
        prompts.find((prompt) => prompt.fileName === selectedPromptFileName) ??
        prompts[0] ??
        null;
      if (currentPrompt) {
        const prompt = await readAiPrompt(currentPrompt.fileName);
        setSelectedPromptFileName(prompt.fileName);
        setPromptContent(prompt.content);
      } else {
        setSelectedPromptFileName("");
        setPromptContent("");
      }
    } catch (e) {
      toast.error(`Prompt 读取失败：${getErrorMessage(e)}`);
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const handleSelectPrompt = (fileName: string) => {
    if (fileName === selectedPromptFileName || isLoadingPrompt || isSavingPrompt) return;
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

  const handleGenerateNoteMetadata = async () => {
    if (!currentFilePath) {
      toast.info("请先打开一个笔记");
      return;
    }
    if (!frontmatter.canMerge) {
      toast.warning(frontmatter.warning ?? "当前 frontmatter 暂不能改写");
      return;
    }
    if (!frontmatter.canEditTags) {
      toast.warning(frontmatter.warning ?? "当前 tags 暂不能通过表单改写");
      return;
    }

    setIsGeneratingNoteMetadata(true);
    try {
      const metadata = await generateNoteMetadata(currentFilePath, markdown);
      const nextMarkdown = mergeFrontmatterMetadata(fullMarkdown, metadata);
      if (nextMarkdown !== fullMarkdown) {
        const loaded = splitLoadedMarkdown(nextMarkdown);
        const nextDirty = isSnapshotDirty(savedSnapshotRef.current, currentFilePath, loaded.frontmatterPrefix, loaded.body);
        setFrontmatterPrefix(loaded.frontmatterPrefix);
        setMarkdown(loaded.body);
        setIsDirty(nextDirty);
      }
      toast.success("AI 元数据已生成，请确认后保存");
    } catch (e) {
      const message = getErrorMessage(e);
      if (isAiConfigMissingError(message)) {
        toast.error(AI_CONFIG_MISSING_MESSAGE);
      } else {
        toast.error(`AI 元数据生成失败：${message}`);
      }
    } finally {
      setIsGeneratingNoteMetadata(false);
    }
  };

  const handlePolishNoteBody = async () => {
    if (!currentFilePath) {
      toast.info("请先打开一个笔记");
      return;
    }

    if (!markdown.trim()) {
      toast.warning("当前笔记正文为空，无法润色");
      return;
    }

    setIsPolishingNoteBody(true);
    try {
      const result = await polishNoteBody(currentFilePath, markdown);
      setPolishedBodyPreview(result.polished_body);
    } catch (e) {
      const message = getErrorMessage(e);
      if (isAiConfigMissingError(message)) {
        toast.error(AI_CONFIG_MISSING_MESSAGE);
      } else {
        toast.error(`AI 全文润色失败：${message}`);
      }
    } finally {
      setIsPolishingNoteBody(false);
    }
  };

  const handleApplyPolishedBody = () => {
    if (polishedBodyPreview === null) return;

    const nextDirty = isSnapshotDirty(savedSnapshotRef.current, currentFilePath, frontmatterPrefix, polishedBodyPreview);
    setMarkdown(polishedBodyPreview);
    setIsDirty(nextDirty);
    setPolishedBodyPreview(null);
    toast.success("润色稿已应用，请确认后保存");
  };

  const handleCancelPolishedBody = () => {
    setPolishedBodyPreview(null);
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
    setPolishedBodyPreview(null);
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

  const handleCloseWindow = async () => {
    try {
      await getCurrentWindow().close();
    } catch (e) {
      toast.error(`关闭窗口失败：${getErrorMessage(e)}`);
    }
  };

  const openSettingsSection = (section: SettingsSection) => {
    setSettingsSection(section);
    setIsAdvancedActionsOpen(true);
    if (section === "ai" && !aiConfigDraft && !isLoadingAiConfig) {
      void openAiSettings();
    }
  };

  const openSettingsCenter = () => {
    openSettingsSection("general");
  };

  const closeSettingsCenter = () => {
    if (hasAiConfigDraftChanges && !window.confirm("AI/API 管理有未保存更改，是否放弃并关闭设置中心？")) {
      return;
    }
    if (hasAiConfigDraftChanges && aiConfig) {
      setAiConfigDraft(cloneAiConfig(aiConfig));
    }
    setIsAdvancedActionsOpen(false);
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
      void handleSaveCurrentNote();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSaveCurrentNote]);

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

    const validPaths = new Set(files.map((file) => file.path));
    setOpenTabPaths((current) => current.filter((path) => validPaths.has(path)));

    if (currentFilePath && !validPaths.has(currentFilePath)) {
      setCurrentFilePath(null);
    }
  }, [currentFilePath, files, hasLoadedNotes]);

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

    const validPaths = new Set(files.map((file) => file.path));
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
  }, [currentFilePath, files, hasLoadedNotes, openTabPaths]);

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
    <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {dialogMode === "create" ? "新建笔记" : "重命名笔记"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {dialogMode === "create" && (
            <div className="grid gap-2">
              <Label>保存位置</Label>
              <div className="grid gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteDirectory === "tricks"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-directory"
                    value="tricks"
                    checked={newNoteDirectory === "tricks"}
                    onChange={() => updateNewNoteDirectory("tricks")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">tricks/</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      技巧笔记：算法 trick、模板、结论整理
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteDirectory === "problems"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-directory"
                    value="problems"
                    checked={newNoteDirectory === "problems"}
                    onChange={() => updateNewNoteDirectory("problems")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">problems/</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      题解笔记：题目分析、解法记录
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}
          {dialogMode === "create" && (
            <div className="grid gap-2">
              <Label>模板</Label>
              <div className="grid gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteTemplate === "blank"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-template"
                    value="blank"
                    checked={newNoteTemplate === "blank"}
                    onChange={() => setNewNoteTemplate("blank")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">空白</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      创建空 Markdown，由保存流程补全基础 frontmatter
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteTemplate === "trick"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-template"
                    value="trick"
                    checked={newNoteTemplate === "trick"}
                    onChange={() => setNewNoteTemplate("trick")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">Trick 模板</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      结论、适用条件、例子、代码
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteTemplate === "solution"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-template"
                    value="solution"
                    checked={newNoteTemplate === "solution"}
                    onChange={() => setNewNoteTemplate("solution")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">题解模板</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      题意、思路、证明、代码、复杂度
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="filename">文件名</Label>
            <Input
              id="filename"
              value={dialogValue}
              onChange={(e) => setDialogValue(e.target.value)}
              placeholder="不需要输入 .md"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleDialogConfirm();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {dialogMode === "rename" && renameTarget && renameTarget.includes("/")
                ? `当前位于 ${renameTarget.slice(0, renameTarget.lastIndexOf("/"))}/，目录会保留`
                : "系统会自动加上 .md 后缀"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>取消</Button>
          <Button onClick={handleDialogConfirm}>
            {dialogMode === "create" ? "创建" : "重命名"}
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
    <Dialog open={polishedBodyPreview !== null} onOpenChange={(open) => !open && handleCancelPolishedBody()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>AI 全文润色预览</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <textarea
            value={polishedBodyPreview ?? ""}
            readOnly
            rows={18}
            className="min-h-[28rem] w-full resize-none rounded-none border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancelPolishedBody}>
            取消
          </Button>
          <Button onClick={handleApplyPolishedBody}>
            应用到正文
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={isAdvancedActionsOpen} onOpenChange={(open) => open ? setIsAdvancedActionsOpen(true) : closeSettingsCenter()}>
      <DialogContent
        className="settings-center flex h-[min(960px,calc(100vh-48px))] w-[min(1480px,calc(100vw-48px))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        style={settingsAppearanceStyle}
      >
        <DialogHeader className="shrink-0 border-b border-border/80 bg-muted/10 px-6 py-4 text-left">
          <DialogTitle className="text-base">设置中心</DialogTitle>
          <div className="text-sm text-muted-foreground">
            管理 OI Notebook 的常用设置、工具入口和桌面工作流。
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 overflow-hidden flex-col md:flex-row">
          <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-border/80 bg-muted/10 md:w-[240px] md:min-w-[240px] md:border-b-0 md:border-r">
            <div className="px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Sections
            </div>
            <ScrollArea className="min-h-0 flex-1 max-h-[24vh] md:max-h-none">
              <div className="grid gap-1 p-3">
                {SETTINGS_SECTIONS.map((section) => {
                  const isActive = settingsSection === section.id;
                  return (
                    <Button
                      key={section.id}
                      variant="ghost"
                      className={cn(
                        "h-auto w-full justify-start rounded-md px-3 py-2 text-left",
                        isActive
                          ? "bg-accent text-accent-foreground hover:bg-accent"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                      onClick={() => openSettingsSection(section.id)}
                    >
                      <div className="grid w-full min-w-0 gap-0.5">
                        <div className="text-sm font-medium">{section.label}</div>
                        <div className={cn("text-xs leading-5", isActive ? "text-accent-foreground/80" : "text-muted-foreground")}>
                          {section.blurb}
                        </div>
                      </div>
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          </aside>
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background/70">
            <ScrollArea className="h-full min-h-0">
              <div className="grid min-w-0 gap-4 p-6">
                {settingsSection === "general" && (
                  <>
                    <section className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid gap-1">
                        <div className="text-base font-semibold text-foreground">常规</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          集中查看常用设置、工具入口和桌面工作流，方便从一个位置进入常用操作。
                        </div>
                      </div>
                      <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                        外观、编辑器、AI、洛谷、博客、Git 和数据目录设置都可以在这里统一管理。
                      </div>
                    </section>
                    <section className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="text-sm font-medium text-foreground">当前可直接前往</div>
                      <div className="grid gap-2 text-sm leading-6 text-muted-foreground">
                        <div>AI：模型配置、Prompt 编辑、连接测试</div>
                        <div>洛谷：账号配置、扫描规则、预览与确认写入入口</div>
                        <div>博客 / Git / 数据：本地博客、同步工具和 notes 目录入口</div>
                      </div>
                    </section>
                  </>
                )}

                {settingsSection === "appearance" && (
                  <>
                    <section className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid gap-1">
                        <div className="text-base font-semibold text-foreground">外观</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          分开调整主题、软件界面、工具栏文字、设置中心文字，以及 Markdown 编辑和预览内容。设置会立即生效并保存在本机。
                        </div>
                      </div>
                    </section>

                    <section className="grid min-w-0 gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid min-w-0 gap-1">
                        <div className="text-sm font-medium text-foreground">主题</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          当前使用 {appThemeLabel}。切换后会立即影响主界面、编辑区、预览区、设置中心和弹窗。
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {THEME_OPTIONS.map((option) => {
                          const isActive = appTheme === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setAppTheme(option.id)}
                              className={cn(
                                "grid min-w-0 gap-1 rounded-md border px-4 py-3 text-left transition-colors",
                                isActive
                                  ? "border-primary/50 bg-primary/10 text-foreground"
                                  : "border-border/80 bg-muted/15 text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                              )}
                            >
                              <span className="text-sm font-medium">{option.label}</span>
                              <span className={cn("text-xs leading-5", isActive ? "text-foreground/75" : "text-muted-foreground")}>
                                {option.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section className="grid min-w-0 gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="grid min-w-0 gap-1">
                          <div className="text-sm font-medium text-foreground">界面密度</div>
                          <div className="text-sm leading-6 text-muted-foreground">
                            微调软件界面控件、间距和面板密度；全局缩放由下方“全局界面缩放”和快捷键控制。当前界面密度为 {uiScaleLabel}。
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {UI_SCALE_PRESETS.map((scale) => {
                            const isActive = Math.round(uiScale * 100) === Math.round(scale * 100);
                            return (
                              <Button
                                key={scale}
                                type="button"
                                variant={isActive ? "default" : "outline"}
                                size="sm"
                                className="h-8 min-w-14 px-3"
                                onClick={() => updateUiScale(scale)}
                              >
                                {Math.round(scale * 100)}%
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    </section>

                    <section className="grid min-w-0 gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="grid min-w-0 gap-1">
                          <div className="text-sm font-medium text-foreground">全局界面缩放</div>
                          <div className="text-sm leading-6 text-muted-foreground">
                            影响整个应用界面，包括侧栏、标签页、工具栏、编辑区、预览区和 AI Sidebar；状态栏“界面：{appZoomLabel}”显示同一数值。
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {APP_ZOOM_PRESETS.map((zoom) => {
                            const isActive = Math.round(appZoom * 100) === Math.round(zoom * 100);
                            return (
                              <Button
                                key={zoom}
                                type="button"
                                variant={isActive ? "default" : "outline"}
                                size="sm"
                                className="h-8 min-w-14 px-3"
                                onClick={() => updateAppZoom(zoom)}
                              >
                                {Math.round(zoom * 100)}%
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    </section>

                    <section className="grid min-w-0 gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="grid min-w-0 gap-1">
                          <div className="text-sm font-medium text-foreground">Markdown 内容缩放</div>
                          <div className="text-sm leading-6 text-muted-foreground">
                            只影响 Markdown 编辑正文和预览正文；Ctrl + 鼠标滚轮会调整这个值，状态栏“内容：{contentZoomLabel}”显示同一数值。
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {CONTENT_ZOOM_PRESETS.map((zoom) => {
                            const isActive = Math.round(contentZoom * 100) === Math.round(zoom * 100);
                            return (
                              <Button
                                key={zoom}
                                type="button"
                                variant={isActive ? "default" : "outline"}
                                size="sm"
                                className="h-8 min-w-14 px-3"
                                onClick={() => updateContentZoom(zoom)}
                              >
                                {Math.round(zoom * 100)}%
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    </section>

                    <section className="grid min-w-0 gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid min-w-0 gap-1">
                        <div className="text-sm font-medium text-foreground">工具栏 / 顶部操作区文字大小</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          影响顶部文件状态、主要操作按钮和 Markdown 工具栏文字，不改变 Markdown 正文内容字号。
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                        <input
                          type="range"
                          min={TOOLBAR_FONT_SIZE_MIN}
                          max={TOOLBAR_FONT_SIZE_MAX}
                          step={1}
                          value={toolbarFontSize}
                          onChange={(event) => updateToolbarFontSize(Number(event.target.value))}
                          className="h-2 min-w-0 flex-1 accent-primary"
                          aria-label="工具栏文字大小"
                        />
                        <div className="flex shrink-0 items-center gap-2">
                          <Input
                            type="number"
                            min={TOOLBAR_FONT_SIZE_MIN}
                            max={TOOLBAR_FONT_SIZE_MAX}
                            value={toolbarFontSize}
                            onChange={(event) => updateToolbarFontSize(Number(event.target.value))}
                            className="h-9 w-20"
                            aria-label="工具栏文字大小数值"
                          />
                          <span className="text-sm text-muted-foreground">px</span>
                        </div>
                      </div>
                    </section>

                    <section className="grid min-w-0 gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid min-w-0 gap-1">
                        <div className="text-sm font-medium text-foreground">设置中心文字大小</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          影响设置中心标题、说明、设置项和表单文字，帮助长中文说明保持可读。
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                        <input
                          type="range"
                          min={SETTINGS_FONT_SIZE_MIN}
                          max={SETTINGS_FONT_SIZE_MAX}
                          step={1}
                          value={settingsFontSize}
                          onChange={(event) => updateSettingsFontSize(Number(event.target.value))}
                          className="h-2 min-w-0 flex-1 accent-primary"
                          aria-label="设置中心文字大小"
                        />
                        <div className="flex shrink-0 items-center gap-2">
                          <Input
                            type="number"
                            min={SETTINGS_FONT_SIZE_MIN}
                            max={SETTINGS_FONT_SIZE_MAX}
                            value={settingsFontSize}
                            onChange={(event) => updateSettingsFontSize(Number(event.target.value))}
                            className="h-9 w-20"
                            aria-label="设置中心文字大小数值"
                          />
                          <span className="text-sm text-muted-foreground">px</span>
                        </div>
                      </div>
                    </section>

                    <section className="grid min-w-0 gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid min-w-0 gap-1">
                        <div className="text-sm font-medium text-foreground">编辑区字体大小</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          影响 Markdown 编辑区正文，不改变工具栏和设置中心文字。
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                        <input
                          type="range"
                          min={FONT_SIZE_MIN}
                          max={FONT_SIZE_MAX}
                          step={1}
                          value={editorFontSize}
                          onChange={(event) => updateEditorFontSize(Number(event.target.value))}
                          className="h-2 min-w-0 flex-1 accent-primary"
                          aria-label="编辑区字体大小"
                        />
                        <div className="flex shrink-0 items-center gap-2">
                          <Input
                            type="number"
                            min={FONT_SIZE_MIN}
                            max={FONT_SIZE_MAX}
                            value={editorFontSize}
                            onChange={(event) => updateEditorFontSize(Number(event.target.value))}
                            className="h-9 w-20"
                            aria-label="编辑区字体大小数值"
                          />
                          <span className="text-sm text-muted-foreground">px</span>
                        </div>
                      </div>
                    </section>

                    <section className="grid min-w-0 gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid min-w-0 gap-1">
                        <div className="text-sm font-medium text-foreground">预览区字体大小</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          影响 Markdown 预览正文和标题比例，代码块、公式、表格和 callout 保持原有渲染结构。
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                        <input
                          type="range"
                          min={FONT_SIZE_MIN}
                          max={FONT_SIZE_MAX}
                          step={1}
                          value={previewFontSize}
                          onChange={(event) => updatePreviewFontSize(Number(event.target.value))}
                          className="h-2 min-w-0 flex-1 accent-primary"
                          aria-label="预览区字体大小"
                        />
                        <div className="flex shrink-0 items-center gap-2">
                          <Input
                            type="number"
                            min={FONT_SIZE_MIN}
                            max={FONT_SIZE_MAX}
                            value={previewFontSize}
                            onChange={(event) => updatePreviewFontSize(Number(event.target.value))}
                            className="h-9 w-20"
                            aria-label="预览区字体大小数值"
                          />
                          <span className="text-sm text-muted-foreground">px</span>
                        </div>
                      </div>
                    </section>

                    <section className="grid min-w-0 gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid min-w-0 gap-1">
                        <div className="text-sm font-medium text-foreground">阅读密度</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          调整预览正文的行高、段落间距、列表间距和 callout 外间距。默认使用标准。
                        </div>
                      </div>
                      <div className="grid gap-2 lg:grid-cols-3">
                        {READING_DENSITY_OPTIONS.map((option) => {
                          const isActive = readingDensity === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setReadingDensity(option.id)}
                              className={cn(
                                "grid min-w-0 gap-1 rounded-md border px-4 py-3 text-left transition-colors",
                                isActive
                                  ? "border-primary/50 bg-primary/10 text-foreground"
                                  : "border-border/80 bg-muted/15 text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                              )}
                            >
                              <span className="text-sm font-medium">{option.label}</span>
                              <span className={cn("text-xs leading-5", isActive ? "text-foreground/75" : "text-muted-foreground")}>
                                {option.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </>
                )}

                {settingsSection === "editor" && (
                  <section className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                    <div className="text-base font-semibold text-foreground">编辑器</div>
                    <div className="text-sm leading-6 text-muted-foreground">
                      当前已经支持双栏、仅编辑、仅预览三种工作模式。视图切换和缩放控制仍保留在 Markdown toolbar 右侧，本刀不新增状态。
                    </div>
                    <div className="grid gap-2 rounded-md border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                      <div>双栏：同时查看编辑区和预览区</div>
                      <div>仅编辑：更专注地处理 Markdown 正文</div>
                      <div>仅预览：快速检查渲染效果</div>
                    </div>
                  </section>
                )}

                {settingsSection === "ai" && (
                  <section className="flex min-h-[620px] min-w-0 flex-col gap-4">
                    <div className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid min-w-0 gap-1">
                        <div className="text-base font-semibold text-foreground">AI 设置</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          管理模型配置与本地 Prompt 模板。API Key 只通过后端配置保存，不写入 localStorage。
                        </div>
                      </div>
                      <div className="flex min-w-0 gap-1 border-b border-border/80">
                        {AI_SETTINGS_TABS.map((tab) => {
                          const isActive = aiSettingsTab === tab.id;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              className={cn(
                                "-mb-px min-w-0 border-b-2 px-3 py-2 text-left text-sm transition-colors",
                                isActive
                                  ? "border-primary text-foreground"
                                  : "border-transparent text-muted-foreground hover:text-foreground",
                              )}
                              onClick={() => setAiSettingsTab(tab.id)}
                              title={tab.description}
                            >
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {aiSettingsTab === "api" && (
                      <div className="grid min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-border/80 bg-card/70 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <aside className="flex min-h-0 flex-col border-b border-border/80 bg-muted/10 p-3 lg:border-b-0 lg:border-r">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">配置组</div>
                            <Button size="xs" variant="outline" onClick={handleCreateAiProviderDraft} disabled={isLoadingAiConfig || isSavingAiConfig}>
                              <Plus className="h-3 w-3" />
                              添加配置组
                            </Button>
                          </div>
                          <div className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                            {(aiConfigDraft?.providers ?? []).map((provider) => {
                              const isActive = provider.id === selectedAiProviderId;
                              const isDefault = provider.id === aiConfigDraft?.default_provider_id;
                              const providerComparable = getAiConfigComparable({
                                base_url: "",
                                api_key: "",
                                model: "",
                                providers: [provider],
                                default_provider_id: provider.id,
                                default_model_id: provider.default_model,
                                web_search: DEFAULT_WEB_SEARCH_CONFIG,
                              });
                              const isProviderDirty = savedAiProviderById.get(provider.id) !== providerComparable;
                              return (
                                <button
                                  key={provider.id}
                                  type="button"
                                  className={cn(
                                    "grid min-w-0 gap-1 rounded-md border px-3 py-2.5 text-left transition-colors",
                                    isActive
                                      ? "border-primary/50 bg-primary/10 text-foreground"
                                      : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-muted/50 hover:text-foreground",
                                  )}
                                  onClick={() => selectAiProviderForEdit(provider)}
                                >
                                  <span className="flex min-w-0 items-center justify-between gap-2">
                                    <span className="truncate text-sm font-medium">{provider.name || provider.id}</span>
                                    <span className="flex shrink-0 items-center gap-1">
                                      {isDefault && <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">默认</span>}
                                      {isProviderDirty && <span className="rounded-sm border border-border bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">未保存</span>}
                                    </span>
                                  </span>
                                  <span className="truncate text-[11px] text-muted-foreground">{provider.base_url || "未填写 Base URL"}</span>
                                  <span className="text-[11px] text-muted-foreground">{provider.models.length} models</span>
                                </button>
                              );
                            })}
                            {(aiConfigDraft?.providers.length ?? 0) === 0 && (
                              <div className="rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
                                还没有配置组。点击上方添加一个 OpenAI-compatible API。
                              </div>
                            )}
                          </div>
                        </aside>

                        <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden p-4">
                          {isLoadingAiConfig ? (
                            <div className="rounded-md border border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                              正在读取 AI 配置...
                            </div>
                          ) : selectedAiProvider ? (
                            <>
                              <section className="grid min-w-0 gap-3 rounded-md border border-border/70 bg-background/50 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="grid gap-1">
                                    <div className="text-sm font-semibold text-foreground">连接配置</div>
                                    <div className="text-xs leading-5 text-muted-foreground">
                                      测试连接和同步模型会使用当前草稿内容；同步结果也先进入草稿，保存后才持久化。
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => updateAiConfigDraft((config) => ({
                                        ...config,
                                        default_provider_id: selectedAiProvider.id,
                                        default_model_id: selectedAiProvider.default_model ?? selectedAiProvider.models.find((model) => model.enabled)?.id ?? selectedAiProvider.models[0]?.id ?? null,
                                      }))}
                                      disabled={isSavingAiConfig}
                                    >
                                      设为默认配置组
                                    </Button>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => void handleDeleteAiProvider(selectedAiProvider.id)}
                                      disabled={aiProviderBusy || isSavingAiConfig}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      删除配置组
                                    </Button>
                                  </div>
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="grid gap-2">
                                    <Label htmlFor="ai-provider-name">名称</Label>
                                    <Input
                                      id="ai-provider-name"
                                      value={selectedAiProvider.name}
                                      placeholder="DeepSeek / OpenAI / 中转站"
                                      onChange={(event) => updateAiProviderDraft(selectedAiProvider.id, (provider) => ({ ...provider, name: event.target.value, updated_at: Date.now() }))}
                                    />
                                  </div>
                                  <div className="grid gap-2">
                                    <Label htmlFor="ai-provider-default-model">默认模型</Label>
                                    <Input
                                      id="ai-provider-default-model"
                                      value={selectedAiProvider.default_model ?? ""}
                                      placeholder="deepseek-chat"
                                      onChange={(event) => updateAiProviderDraft(selectedAiProvider.id, (provider) => ({ ...provider, default_model: event.target.value.trim() || null, updated_at: Date.now() }))}
                                    />
                                  </div>
                                  <div className="grid gap-2 md:col-span-2">
                                    <Label htmlFor="ai-provider-base-url">Base URL</Label>
                                    <Input
                                      id="ai-provider-base-url"
                                      value={selectedAiProvider.base_url}
                                      placeholder="https://api.example.com/v1"
                                      onChange={(event) => updateAiProviderDraft(selectedAiProvider.id, (provider) => ({ ...provider, base_url: event.target.value, updated_at: Date.now() }))}
                                    />
                                  </div>
                                  <div className="grid gap-2 md:col-span-2">
                                    <Label htmlFor="ai-provider-api-key">API Key</Label>
                                    <Input
                                      id="ai-provider-api-key"
                                      value={selectedAiProvider.api_key}
                                      placeholder="sk-..."
                                      type="password"
                                      onChange={(event) => updateAiProviderDraft(selectedAiProvider.id, (provider) => ({ ...provider, api_key: event.target.value, updated_at: Date.now() }))}
                                    />
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <Button variant="outline" onClick={() => void handleTestAiProvider(selectedAiProvider.id)} disabled={aiProviderBusy || isSavingAiConfig}>
                                    <PlugZap className="h-3.5 w-3.5" />
                                    {aiProviderBusyId === selectedAiProvider.id ? "处理中..." : "测试连接"}
                                  </Button>
                                  <Button variant="outline" onClick={() => void handleSyncAiProviderModels(selectedAiProvider.id)} disabled={aiProviderBusy || isSavingAiConfig}>
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    同步模型
                                  </Button>
                                  <Button variant="ghost" onClick={handleFillDeepSeekDefaults} disabled={isSavingAiConfig}>
                                    填入 DeepSeek 默认配置
                                  </Button>
                                </div>
                              </section>

                              <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 rounded-md border border-border/70 bg-background/50 p-4">
                                <div className="grid gap-3">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-semibold text-foreground">模型列表</div>
                                      <div className="text-xs text-muted-foreground">手动添加、同步、删除和设为默认都先进入草稿。</div>
                                    </div>
                                    <div className="flex min-w-0 flex-wrap gap-2">
                                      <div className="relative min-w-[180px] flex-1">
                                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                          value={aiModelSearchQuery}
                                          placeholder="搜索模型"
                                          onChange={(event) => setAiModelSearchQuery(event.target.value)}
                                          className="pl-8"
                                        />
                                      </div>
                                      <Input
                                        value={aiManualModelId}
                                        placeholder="手动添加模型 ID"
                                        onChange={(event) => setAiManualModelId(event.target.value)}
                                        className="min-w-[220px] flex-1"
                                      />
                                      <Button variant="outline" onClick={() => void handleAddAiProviderModel()} disabled={!aiManualModelId.trim()}>
                                        添加模型
                                      </Button>
                                    </div>
                                  </div>
                                </div>

                                <div className="min-h-0 overflow-hidden rounded-md border border-border/70">
                                  {selectedAiProvider.models.length > 0 ? (
                                    <div className="h-full min-h-[260px] max-h-[360px] overflow-auto [scrollbar-width:thin]">
                                      <div className="grid min-w-[720px] grid-cols-[minmax(260px,1fr)_96px_92px_92px_120px] items-center gap-3 border-b border-border/70 bg-muted/20 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                        <div>模型 ID</div>
                                        <div>来源</div>
                                        <div>Stream</div>
                                        <div>默认</div>
                                        <div className="text-right">操作</div>
                                      </div>
                                      <div className="divide-y divide-border/60">
                                        {filteredAiProviderModels.length > 0 ? filteredAiProviderModels.map((model) => {
                                          const isDefault = selectedAiProvider.id === aiConfigDraft?.default_provider_id && model.id === aiConfigDraft.default_model_id;
                                          return (
                                            <div key={model.id} className="grid min-w-[720px] grid-cols-[minmax(260px,1fr)_96px_92px_92px_120px] items-center gap-3 px-3 py-2 text-sm">
                                              <div className="min-w-0">
                                                <div className="truncate font-medium text-foreground">{model.name || model.id}</div>
                                                {model.name && <div className="truncate text-[11px] text-muted-foreground">{model.id}</div>}
                                              </div>
                                              <div className="text-xs text-muted-foreground">{model.source === "manual" ? "手动" : "同步"}</div>
                                              <div className="text-xs text-muted-foreground">{model.supports_stream ? "yes" : "unknown"}</div>
                                              <div>{isDefault ? <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary">默认</span> : <span className="text-xs text-muted-foreground">-</span>}</div>
                                              <div className="flex justify-end gap-1">
                                                <Button size="xs" variant={isDefault ? "secondary" : "outline"} onClick={() => void handleSetDefaultAiModel(selectedAiProvider.id, model.id)}>
                                                  {isDefault ? "已默认" : "设默认"}
                                                </Button>
                                                <Button size="icon-xs" variant="ghost" onClick={() => void handleDeleteAiProviderModel(selectedAiProvider.id, model.id)}>
                                                  <Trash2 className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            </div>
                                          );
                                        }) : (
                                          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                                            没有匹配的模型。
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                                      暂无模型，可以同步 /models，或手动添加模型 ID。
                                    </div>
                                  )}
                                </div>
                              </section>
                            </>
                          ) : (
                            <div className="rounded-md border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                              选择左侧配置组，或添加一个新的 OpenAI-compatible API。
                            </div>
                          )}
                        </main>
                      </div>
                    )}

                    {aiSettingsTab === "web-search" && (
                      <section className="grid min-w-0 gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                        <div className="grid gap-1">
                          <div className="text-base font-semibold text-foreground">联网搜索 Provider</div>
                          <div className="text-sm leading-6 text-muted-foreground">
                            仅用于 NoteX 的联网搜索来源卡片。当前阶段只读取搜索结果标题、摘要和 URL，不抓取网页正文。
                          </div>
                        </div>

                        <div className="grid gap-4 rounded-md border border-border/70 bg-background/50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="grid gap-1">
                              <div className="text-sm font-semibold text-foreground">启用真实搜索服务</div>
                              <div className="text-xs leading-5 text-muted-foreground">
                                composer 里的“联网搜索”仍然只是允许按需搜索；这里决定是否真的调用 Provider。
                              </div>
                            </div>
                            <button
                              type="button"
                              className={cn(
                                "inline-flex h-8 items-center rounded-full border px-1 text-xs font-medium transition-colors",
                                aiConfigDraft?.web_search.enabled
                                  ? "border-primary/60 bg-primary/15 text-primary"
                                  : "border-border bg-muted/30 text-muted-foreground hover:text-foreground",
                              )}
                              onClick={() => updateAiConfigDraft((config) => ({
                                ...config,
                                web_search: {
                                  ...normalizeWebSearchConfig(config.web_search),
                                  enabled: !normalizeWebSearchConfig(config.web_search).enabled,
                                },
                              }))}
                              disabled={!aiConfigDraft || isSavingAiConfig}
                              aria-pressed={aiConfigDraft?.web_search.enabled === true}
                            >
                              <span className={cn(
                                "mr-2 h-5 w-5 rounded-full bg-current opacity-80 transition-transform",
                                aiConfigDraft?.web_search.enabled && "translate-x-5",
                              )} />
                              <span className="min-w-[3.5rem]">
                                {aiConfigDraft?.web_search.enabled ? "已启用" : "未启用"}
                              </span>
                            </button>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-2">
                              <Label htmlFor="web-search-provider">Provider</Label>
                              <div
                                id="web-search-provider"
                                className="grid gap-2 rounded-md border border-border/70 bg-muted/20 p-2"
                              >
                                {([
                                  { value: "bocha", label: "博查 Bocha", description: "适合中文搜索和 AI 应用联网搜索。" },
                                  { value: "brave", label: "Brave Search", description: "保留现有 Brave 配置，适合继续兼容旧设置。" },
                                ] as const).map((option) => {
                                  const currentProvider = normalizeWebSearchConfig(aiConfigDraft?.web_search).provider;
                                  const isSelected = currentProvider === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      className={cn(
                                        "grid gap-1 rounded-md border px-3 py-2 text-left transition-colors",
                                        isSelected
                                          ? "border-primary/60 bg-primary/10 text-foreground"
                                          : "border-border/70 bg-background/70 text-muted-foreground hover:text-foreground",
                                      )}
                                      onClick={() => updateAiConfigDraft((config) => ({
                                        ...config,
                                        web_search: {
                                          ...normalizeWebSearchConfig(config.web_search),
                                          provider: option.value,
                                        },
                                      }))}
                                      disabled={!aiConfigDraft || isSavingAiConfig}
                                      aria-pressed={isSelected}
                                    >
                                      <span className="text-sm font-medium">{option.label}</span>
                                      <span className="text-xs leading-5">{option.description}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="grid gap-2">
                              {normalizeWebSearchConfig(aiConfigDraft?.web_search).provider === "bocha" ? (
                                <>
                                  <Label htmlFor="web-search-bocha-api-key">Bocha API Key</Label>
                                  <Input
                                    id="web-search-bocha-api-key"
                                    type="password"
                                    value={aiConfigDraft?.web_search.bochaApiKey ?? ""}
                                    placeholder="sk-..."
                                    onChange={(event) => updateAiConfigDraft((config) => ({
                                      ...config,
                                      web_search: {
                                        ...normalizeWebSearchConfig(config.web_search),
                                        provider: "bocha",
                                        bochaApiKey: event.target.value,
                                      },
                                    }))}
                                    disabled={!aiConfigDraft || isSavingAiConfig}
                                  />
                                  <Label htmlFor="web-search-bocha-endpoint">Bocha API Endpoint</Label>
                                  <Input
                                    id="web-search-bocha-endpoint"
                                    value={aiConfigDraft?.web_search.bochaEndpoint ?? ""}
                                    placeholder="https://api.bochaai.com/v1/web-search"
                                    onChange={(event) => updateAiConfigDraft((config) => ({
                                      ...config,
                                      web_search: {
                                        ...normalizeWebSearchConfig(config.web_search),
                                        provider: "bocha",
                                        bochaEndpoint: event.target.value,
                                      },
                                    }))}
                                    disabled={!aiConfigDraft || isSavingAiConfig}
                                  />
                                  <div className="text-xs leading-5 text-muted-foreground">
                                    适合中文搜索和 AI 应用联网搜索。留空时使用默认地址；若默认地址不可达，可改成控制台或文档实际提供的接口地址。
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => void handleTestWebSearchConnection()}
                                      disabled={!aiConfigDraft || isSavingAiConfig || isTestingWebSearchConnection}
                                    >
                                      {isTestingWebSearchConnection ? "测试中..." : "测试连接"}
                                    </Button>
                                    {webSearchConnectionMessage && (
                                      <span className="text-xs leading-5 text-muted-foreground">
                                        {webSearchConnectionMessage}
                                      </span>
                                    )}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <Label htmlFor="web-search-brave-api-key">Brave Search API Key</Label>
                                  <Input
                                    id="web-search-brave-api-key"
                                    type="password"
                                    value={aiConfigDraft?.web_search.braveApiKey ?? ""}
                                    placeholder="BSA..."
                                    onChange={(event) => updateAiConfigDraft((config) => ({
                                      ...config,
                                      web_search: {
                                        ...normalizeWebSearchConfig(config.web_search),
                                        provider: "brave",
                                        braveApiKey: event.target.value,
                                      },
                                    }))}
                                    disabled={!aiConfigDraft || isSavingAiConfig}
                                  />
                                </>
                              )}
                            </div>
                          </div>

                          <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
                            API Key 随 AI 配置保存在本机 `.oinb/config.json`，不会写进源码，也不会进入前端 localStorage。未配置时，NoteX 只展示搜索计划并提示需要配置搜索服务。
                          </div>
                          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/70 bg-muted/10 px-3 py-2.5">
                            <div className="grid gap-1">
                              <div className="text-sm font-medium text-foreground">
                                公开网页搜索授权：{aiConfigDraft?.web_search.publicSearchConsent ? "已启用" : "未启用"}
                              </div>
                              <div className="text-xs leading-5 text-muted-foreground">
                                首次打开 NoteX 的“联网搜索”开关时会要求确认：只访问公开网页，不读取 Cookie、历史记录、密码、登录状态或本地隐私数据。
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => updateAiConfigDraft((config) => ({
                                ...config,
                                web_search: {
                                  ...normalizeWebSearchConfig(config.web_search),
                                  publicSearchConsent: false,
                                },
                              }))}
                              disabled={!aiConfigDraft || isSavingAiConfig}
                            >
                              重新查看授权说明
                            </Button>
                          </div>
                        </div>
                      </section>
                    )}

                    {aiSettingsTab === "prompts" && (
                      <section className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 rounded-lg border border-border/80 bg-card/70 p-5">
                        <div className="grid gap-1">
                          <div className="text-base font-semibold text-foreground">Prompt 模板</div>
                          <div className="text-sm leading-6 text-muted-foreground">
                            Prompt 模板保存在本地 `.oinb/prompts/`，可单独编辑，不和 API 配置的保存草稿混在一起。
                          </div>
                        </div>
                        {promptTemplates.length === 0 && !selectedPromptFileName ? (
                          <div className="flex flex-wrap items-start gap-2 rounded-md border border-dashed border-border px-4 py-8">
                            <Button
                              variant="outline"
                              onClick={() => void loadPromptTemplates()}
                              disabled={isLoadingPrompt || isSavingPrompt}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              读取 Prompt 模板
                            </Button>
                            <span className="pt-2 text-xs text-muted-foreground">在设置中心内直接编辑，不再打开二级大窗口。</span>
                          </div>
                        ) : (
                          <div className="grid min-h-0 min-w-0 overflow-hidden rounded-md border border-border/70 md:grid-cols-[240px_minmax(0,1fr)]">
                            <aside className="min-h-0 border-b border-border/70 bg-muted/10 p-2 md:border-b-0 md:border-r">
                              <div className="grid max-h-[420px] gap-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
                                {promptTemplates.map((prompt) => {
                                  const isActive = prompt.fileName === selectedPromptFileName;
                                  const promptUsage = getPromptUsageInfo(prompt.fileName);
                                  return (
                                    <button
                                      key={prompt.fileName}
                                      type="button"
                                      className={cn(
                                        "grid min-w-0 gap-1 rounded-md px-2.5 py-2 text-left transition-colors",
                                        isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                                      )}
                                      onClick={() => handleSelectPrompt(prompt.fileName)}
                                      disabled={isLoadingPrompt || isSavingPrompt}
                                    >
                                      <span className="truncate text-sm font-medium">{prompt.displayName}</span>
                                      <span className={cn("truncate text-[11px]", isActive ? "text-accent-foreground/75" : "text-muted-foreground")}>{prompt.fileName}</span>
                                      <span className={cn("truncate text-[11px]", isActive ? "text-accent-foreground/70" : "text-muted-foreground")}>{promptUsage.purpose}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </aside>
                            <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 p-3">
                              <div className="flex min-w-0 items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-medium text-foreground">{selectedPromptFileName || "未选择 Prompt"}</div>
                                  <div className="text-xs text-muted-foreground">保存 Prompt 会立即写入本地模板文件。</div>
                                </div>
                                <Button size="sm" onClick={() => void handleSavePrompt()} disabled={!selectedPromptFileName || isLoadingPrompt || isSavingPrompt}>
                                  {isSavingPrompt ? "保存中..." : "保存 Prompt"}
                                </Button>
                              </div>
                              <textarea
                                value={promptContent}
                                onChange={(event) => setPromptContent(event.target.value)}
                                disabled={!selectedPromptFileName || isLoadingPrompt || isSavingPrompt}
                                className="min-h-[320px] resize-none rounded-md border border-border bg-background px-3 py-2 font-mono text-sm leading-6 text-foreground outline-none focus:border-primary"
                              />
                            </main>
                          </div>
                        )}
                      </section>
                    )}
                  </section>
                )}

                {settingsSection === "luogu" && (
                  <>
                    <section className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid gap-1">
                        <div className="text-base font-semibold text-foreground">洛谷配置</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          管理 Cookie 相关配置，并进入洛谷导入中心。扫描、规则、预览、确认写入仍复用现有流程。
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => {
                            setIsAdvancedActionsOpen(false);
                            void openLuoguSettings();
                          }}
                          disabled={isLoadingLuoguConfig || isSavingLuoguConfig || isTestingLuoguConnection || isSyncingLuogu}
                        >
                          <Settings className="h-3.5 w-3.5" />
                          洛谷设置
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsAdvancedActionsOpen(false);
                            void openLuoguDialog();
                          }}
                          disabled={isLoadingLuoguConfig || isTestingLuoguConnection || isScanningLuoguPreview || isPreparingSelectedLuogu || isWritingPreparedLuogu || isSyncingLuogu}
                        >
                          <Download className="h-3.5 w-3.5" />
                          洛谷导入中心
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleTestLuoguConnection}
                          disabled={isTestingLuoguConnection || isSyncingLuogu}
                        >
                          <PlugZap className="h-3.5 w-3.5" />
                          {isTestingLuoguConnection ? "测试中..." : "测试连接"}
                        </Button>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {luoguConnectionResult
                          ? `最近一次 dry run 拉到 ${luoguConnectionResult.fetchedCount} 条提交。`
                          : "先配置 `_uid` 和 `__client_id`，再进入扫描、规则、预览和确认写入流程。"}
                      </div>
                    </section>
                  </>
                )}

                {settingsSection === "blog" && (
                  <section className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                    <div className="grid gap-1">
                      <div className="text-base font-semibold text-foreground">博客</div>
                      <div className="text-sm leading-6 text-muted-foreground">
                        设置本地博客预览入口，管理阅读视图和服务状态。
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={handleOpenBlog}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        打开博客
                      </Button>
                      <Button variant="outline" onClick={handleRestartBlog} disabled={isRestartingBlog}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        {isRestartingBlog ? "重启中..." : "重启博客"}
                      </Button>
                    </div>
                  </section>
                )}

                {settingsSection === "git" && (
                  <section className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                    <div className="grid gap-1">
                      <div className="text-base font-semibold text-foreground">Git</div>
                      <div className="text-sm leading-6 text-muted-foreground">
                        这是进阶能力入口，适合在整理完本地改动后再使用，不作为主编辑流里的高频操作。
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={handlePushGit} disabled={isPushingGit}>
                        <Upload className="h-3.5 w-3.5" />
                        {isPushingGit ? "同步中..." : "同步 Git"}
                      </Button>
                    </div>
                  </section>
                )}

                {settingsSection === "data" && (
                  <section className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                    <div className="grid gap-1">
                      <div className="text-base font-semibold text-foreground">数据与存储</div>
                      <div className="text-sm leading-6 text-muted-foreground">
                        `notes` 是本地笔记目录。可以通过“打开笔记文件夹”查看实际位置；备份或迁移时，优先备份
                        `notes` 目录。AI API Key、洛谷 Cookie / client_id 等敏感配置保存在本地配置文件中，不要随意打包分享整个数据目录。
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={handleOpenNotesFolder}>
                        <FolderOpen className="h-3.5 w-3.5" />
                        打开笔记文件夹
                      </Button>
                    </div>
                  </section>
                )}

                {settingsSection === "about" && (
                  <div className="grid min-w-0 gap-4">
                    <section className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="text-base font-semibold text-foreground">关于</div>
                      <div className="text-sm leading-6 text-muted-foreground">
                        OI Notebook 是面向 OI 训练场景的笔记编辑器，同时也是本地博客、洛谷整理和 AI 辅助沉淀的桌面工作台。
                      </div>
                    </section>

                    <section className="grid min-w-0 gap-3 rounded-lg border border-border/80 bg-card/70 p-5">
                      <div className="grid gap-1">
                        <div className="text-base font-semibold text-foreground">Markdown 支持</div>
                        <div className="text-sm leading-6 text-muted-foreground">
                          Markdown 预览支持常用题解写作格式和本地博客展示效果。
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {MARKDOWN_CAPABILITIES.map((feature) => (
                          <span
                            key={feature}
                            className="inline-flex items-center rounded-md border border-border/70 bg-muted/20 px-2.5 py-1 text-xs text-foreground"
                          >
                            {feature}
                          </span>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </div>
            </ScrollArea>
          </main>
        </div>
        <DialogFooter className="shrink-0 border-t border-border/80 bg-background/95 px-6 py-3 sm:items-center sm:justify-between">
          {hasAiConfigDraftChanges ? (
            <>
              <div className="min-w-0 text-sm font-medium text-muted-foreground">有未保存的更改</div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" onClick={handleCancelAiConfigDraft} disabled={isSavingAiConfig || aiProviderBusy}>
                  取消
                </Button>
                <Button onClick={() => void handleSaveAiConfig()} disabled={isSavingAiConfig || aiProviderBusy}>
                  {isSavingAiConfig ? "保存中..." : "保存更改"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="min-w-0 text-sm leading-6 text-muted-foreground">
                设置保存在本地，仅影响当前设备。
              </div>
              <Button variant="outline" className="shrink-0" onClick={closeSettingsCenter}>
                关闭
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="app-shell flex h-screen max-h-screen flex-col overflow-hidden bg-background text-foreground" style={appearanceStyle}>
      {/* Header */}
      <header className="app-top-toolbar flex min-h-9 shrink-0 select-none items-center gap-2.5 border-b border-border bg-background px-2.5 py-1">
        <div className="flex min-w-0 items-center gap-2.5" data-tauri-drag-region>
          <div className="flex h-9 min-w-0 items-center">
            <span className="app-brand-mark grid h-9 w-9 shrink-0 place-items-center">
              <img
                src={APP_ICON_URL}
                alt=""
                className="h-6 w-6 object-contain"
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
              className="flex h-7 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => void handleMinimizeWindow()}
              title="最小化"
              aria-label="最小化窗口"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="flex h-7 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => void handleToggleMaximizeWindow()}
              title="最大化 / 还原"
              aria-label="最大化或还原窗口"
            >
              <Square className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="flex h-7 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-red-500/85 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/70"
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
              <div className="app-notes-sidebar-header flex h-9 shrink-0 items-center justify-between border-b border-border/70 px-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  笔记
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="app-notes-sidebar-action h-[30px] w-[30px]"
                    onClick={() => setIsSearchOpen(true)}
                    title="搜索笔记 Ctrl+K"
                    aria-label="搜索笔记"
                  >
                    <Search size={18} strokeWidth={2.2} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="app-notes-sidebar-action h-[30px] w-[30px]"
                    onClick={openCreateDialog}
                    title="新建笔记"
                    aria-label="新建笔记"
                  >
                    <Plus size={18} strokeWidth={2.2} />
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <FileTree
                  files={files}
                  activeFilePath={currentFilePath}
                  onSelectFile={handleSelectFile}
                  onDeleteFile={handleDelete}
                  onRenameFile={openRenameDialog}
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
                          onClick={openAiSettings}
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
                            <span>笔记保存在本机目录里，Git 同步仍是进阶能力。</span>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={openNotesFolder}>
                              打开目录
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void handlePushGit()}>
                              {gitStatusLabel}
                            </Button>
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
                          onClick={openAiSettings}
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
                              <div className="text-xs text-muted-foreground">外观、AI、Blog、Git、数据目录都在这里。</div>
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
                        <div className="app-frontmatter-actions flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs"
                            onClick={handlePolishNoteBody}
                            disabled={!currentFilePath || isPolishingNoteBody}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            AI 全文润色
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs"
                            onClick={handleGenerateNoteMetadata}
                            disabled={
                              !currentFilePath ||
                              !frontmatter.canMerge ||
                              !frontmatter.canEditTags ||
                              isGeneratingNoteMetadata
                            }
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            AI 补全元数据
                          </Button>
                        </div>
                        <div className="app-frontmatter-grid grid grid-cols-1 gap-3 lg:grid-cols-2">
                          <div className="app-frontmatter-field grid gap-1.5">
                            <Label htmlFor="frontmatter-title">title</Label>
                            <Input
                              id="frontmatter-title"
                              value={frontmatter.fields.title}
                              disabled={!frontmatter.canMerge}
                              onChange={(e) => updateFrontmatter({ title: e.target.value })}
                            />
                          </div>
                          <div className="app-frontmatter-field grid gap-1.5">
                            <Label htmlFor="frontmatter-tags">tags</Label>
                            <Input
                              id="frontmatter-tags"
                              value={frontmatter.fields.tags.join(", ")}
                              disabled={!frontmatter.canMerge || !frontmatter.canEditTags}
                              placeholder="DP, 线段树, trick"
                              onChange={(e) => updateTagsFromInput(e.target.value)}
                            />
                          </div>
                          <div className="app-frontmatter-field grid gap-1.5">
                            <Label htmlFor="frontmatter-difficulty">difficulty</Label>
                            <Input
                              id="frontmatter-difficulty"
                              value={frontmatter.fields.difficulty}
                              disabled={!frontmatter.canMerge}
                              onChange={(e) => updateFrontmatter({ difficulty: e.target.value })}
                            />
                          </div>
                          <div className="app-frontmatter-field grid gap-1.5">
                            <Label htmlFor="frontmatter-source">source</Label>
                            <Input
                              id="frontmatter-source"
                              value={frontmatter.fields.source}
                              disabled={!frontmatter.canMerge}
                              onChange={(e) => updateFrontmatter({ source: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="app-frontmatter-field app-frontmatter-summary grid gap-1.5">
                          <Label htmlFor="frontmatter-summary">summary</Label>
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
                          draft
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
          onMaximizedChange={setIsAiSidebarMaximized}
          aiConfig={aiConfig}
          onAiConfigChange={handleAiConfigChangeFromSidebar}
          onOpenAiSettings={() => void openAiSettings()}
          onApplySuggestedTags={handleApplyAiSuggestedTags}
          onApplyPolishedSelection={handleApplyPolishedSelection}
          onApplyPolishedFullNote={handleApplyPolishedFullNote}
          onOpenPolishReview={handleOpenPolishReview}
          onPolishReviewChange={handlePolishReviewChange}
        />
      </div>
      <footer className="app-status-bar shrink-0 border-t border-border/80 bg-muted/15 px-3 py-1.5 text-[11px] text-muted-foreground">
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
            <button
              type="button"
              className="app-status-item app-status-button truncate whitespace-nowrap rounded px-1.5 py-0.5 transition-colors"
              onClick={() => void handlePushGit()}
              disabled={isPushingGit}
              title="同步 Git"
            >
              Git：{gitStatusLabel}
            </button>
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
