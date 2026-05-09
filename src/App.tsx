import { listen } from "@tauri-apps/api/event";
import { type CSSProperties, type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Bot, ChevronRight, Download, ExternalLink, FileText, FolderOpen, MoreHorizontal, PlugZap, Plus, RefreshCw, RotateCcw, Save, Search, Settings, Sparkles, Upload, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MarkdownEditor, { MarkdownEditorToolbar, type MarkdownEditorToolbarApi } from "@/components/editor/MarkdownEditor";
import MarkdownPreview from "@/components/editor/MarkdownPreview";
import FileTree from "@/components/file-tree/FileTree";
import { cn } from "@/lib/utils";
import { listNotes, readNote, writeNote, commitNote, commitDeletedNote, commitRenamedNote, pushGit, deleteNote, renameNote, openBlog, restartBlogServer, openNotesFolder, saveNoteAsset, importLuoguInsight, prepareLuoguSubmissionNote, writeLuoguPreparedNote, getLuoguConfig, saveLuoguConfig, updateLuoguLastSubmissionId, testLuoguConnection, previewLuoguSubmissionPage, syncLuoguInsights, getAiConfig, saveAiConfig, testAiConnection, generateNoteMetadata, polishNoteBody, searchNotes, listAiPrompts, readAiPrompt, saveAiPrompt } from "@/lib/api";
import type { PrepareLuoguSubmissionNoteResult, WriteLuoguPreparedNoteResult, NoteSearchResult, PreviewLuoguSubmission, PreviewLuoguSubmissionsResult, PromptTemplateSummary, SyncLuoguInsightsResult, TestAiConnectionResult, TestLuoguConnectionResult } from "@/lib/api";
import { mergeFrontmatterFields, mergeFrontmatterMetadata, parseFrontmatterFields, splitFrontmatter } from "@/lib/frontmatter";
import type { FrontmatterFields } from "@/lib/frontmatter";
import { prewarmMarkdownRenderer } from "@/lib/markdown";
import type { NoteFileInfo } from "@/types/note";

// 欢迎内容：未选中文件时在编辑器和预览里显示
const INITIAL_MARKDOWN = `# OI Notebook

OI Notebook 是给 OIer 用的本地笔记工具，目标是把训练中遇到的 trick、题解和 AC 后的 insight 及时沉淀下来。

## 你可以用它做什么

- 写 Markdown 笔记：左边编辑，右边实时预览，支持标题、列表、代码块、表格、图片和公式。
- 打开本地博客复习：点击顶部“打开博客”，用更适合阅读的页面回看自己的笔记。
- 用 AI 整理内容：配置 API 后，可以让 AI 补全标题、标签、摘要，也可以尝试润色正文。
- 同步洛谷 insight：配置洛谷 Cookie 后，可以把 AC 提交里的沉淀内容同步成笔记。

## 笔记保存在哪里

笔记默认保存在本机数据目录的 \`notes/\` 里。开发版会打开项目里的 \`notes/\`，安装版会打开系统 app data 里的 \`notes/\`。

想看真实位置，可以点顶部“打开笔记文件夹”。

## 推荐第一步

1. 点左侧笔记列表右上角的“+”，新建一篇 trick 或 problem 笔记。
2. 写几行 Markdown，然后点顶部“保存”。
3. 点“打开博客”，看看它在本地博客里的效果。

普通写笔记和本地博客不需要配置 AI 或洛谷；这些能力可以等你熟悉后再打开。
`;

const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-flash";
const CONTENT_ZOOM_STORAGE_KEY = "oi-notebook.contentZoom";
const CONTENT_ZOOM_MIN = 0.8;
const CONTENT_ZOOM_MAX = 1.6;
const CONTENT_ZOOM_STEP = 0.1;
const CONTENT_ZOOM_DEFAULT = 1;
const AI_CONFIG_MISSING_MESSAGE =
  "AI 还没有配置：当前版本的 AI 配置保存在本机数据目录的 .oinb/config.json。release/安装版需要重新配置，请到 AI 设置填写 base_url / api_key / model。";

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

const LUOGU_SCAN_PAGE_DELAY_MS = 1500;
const LUOGU_SCAN_MAX_PAGES = 50;
const LUOGU_SCAN_COUNT_OPTIONS: LuoguScanCountLimit[] = [20, 50, 100, 200];
const LUOGU_SCAN_DAYS_OPTIONS: LuoguScanDaysLimit[] = [30, 90, 180, 365];

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

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
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

  if (currentlyPreparingId === submission.submissionId) return "preparing preview";
  if (selectedIds.has(submission.submissionId)) return "waiting for preview";
  return submission.statusLabel;
}

function clampContentZoom(value: number): number {
  const stepped = Math.round(value * 10) / 10;
  return Math.min(CONTENT_ZOOM_MAX, Math.max(CONTENT_ZOOM_MIN, stepped));
}

function getInitialContentZoom(): number {
  const stored = window.localStorage.getItem(CONTENT_ZOOM_STORAGE_KEY);
  if (stored === null) return CONTENT_ZOOM_DEFAULT;

  const parsed = Number(stored);
  if (!Number.isFinite(parsed)) return CONTENT_ZOOM_DEFAULT;
  return clampContentZoom(parsed);
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

function formatSearchDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}

export default function App() {
  const [files, setFiles] = useState<NoteFileInfo[]>([]);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  // null 时显示欢迎内容，选中文件后只把正文 body 放进主编辑器。
  const [markdown, setMarkdown] = useState(INITIAL_MARKDOWN);
  const [frontmatterPrefix, setFrontmatterPrefix] = useState("");
  const [isFrontmatterOpen, setIsFrontmatterOpen] = useState(false);
  // undefined 表示未发生过滚动（初次挂载跳过预览同步）
  const [scrollRatio, setScrollRatio] = useState<number | undefined>(undefined);
  const [editorViewMode, setEditorViewMode] = useState<EditorViewMode>("split");
  const [contentZoom, setContentZoom] = useState(getInitialContentZoom);
  const [markdownToolbarApi, setMarkdownToolbarApi] = useState<MarkdownEditorToolbarApi | null>(null);
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
  const [currentlyPreparingLuoguId, setCurrentlyPreparingLuoguId] = useState<string | null>(null);
  const [luoguPrepareProgress, setLuoguPrepareProgress] = useState<{ current: number; total: number } | null>(null);
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
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isLoadingAiConfig, setIsLoadingAiConfig] = useState(false);
  const [isSavingAiConfig, setIsSavingAiConfig] = useState(false);
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [aiConnectionResult, setAiConnectionResult] = useState<TestAiConnectionResult | null>(null);
  const [aiConfigBaseUrl, setAiConfigBaseUrl] = useState("");
  const [aiConfigApiKey, setAiConfigApiKey] = useState("");
  const [aiConfigModel, setAiConfigModel] = useState("");
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NoteSearchResult[]>([]);
  const [isSearchingNotes, setIsSearchingNotes] = useState(false);
  const [isImportingLuogu, setIsImportingLuogu] = useState(false);
  const [luoguProblemId, setLuoguProblemId] = useState("");
  const [luoguProblemTitle, setLuoguProblemTitle] = useState("");
  const [luoguSubmissionId, setLuoguSubmissionId] = useState("");
  const [luoguSourceCode, setLuoguSourceCode] = useState("");
  const [pendingAssetsByFile, setPendingAssetsByFile] = useState<Record<string, string[]>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fullMarkdown = useMemo(
    () => (currentFilePath === null ? markdown : combineMarkdown(frontmatterPrefix, markdown)),
    [currentFilePath, frontmatterPrefix, markdown],
  );
  const frontmatter = useMemo(() => parseFrontmatterFields(fullMarkdown), [fullMarkdown]);
  const selectedPrompt = useMemo(
    () => promptTemplates.find((prompt) => prompt.fileName === selectedPromptFileName) ?? null,
    [promptTemplates, selectedPromptFileName],
  );
  const selectedPromptUsage = useMemo(
    () => getPromptUsageInfo(selectedPromptFileName),
    [selectedPromptFileName],
  );
  const saveStatusLabel = currentFilePath === null ? "未选择文件" : isDirty ? "未保存" : "已保存";
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
  const editorViewModeSwitcher = (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant={editorViewMode === "split" ? "secondary" : "ghost"}
        size="sm"
        className="h-6 px-2 text-[10px] font-medium text-muted-foreground"
        onClick={() => setEditorViewMode("split")}
        aria-pressed={editorViewMode === "split"}
      >
        双栏
      </Button>
      <Button
        type="button"
        variant={editorViewMode === "editor" ? "secondary" : "ghost"}
        size="sm"
        className="h-6 px-2 text-[10px] font-medium text-muted-foreground"
        onClick={() => setEditorViewMode("editor")}
        aria-pressed={editorViewMode === "editor"}
      >
        仅编辑
      </Button>
      <Button
        type="button"
        variant={editorViewMode === "preview" ? "secondary" : "ghost"}
        size="sm"
        className="h-6 px-2 text-[10px] font-medium text-muted-foreground"
        onClick={() => setEditorViewMode("preview")}
        aria-pressed={editorViewMode === "preview"}
      >
        仅预览
      </Button>
    </div>
  );
  const preparedLuoguNotes = Object.values(luoguPreparedNotesById).filter(
    (prepared) => !prepared.skipped && prepared.markdown.trim() !== "" && prepared.suggestedRelativePath.trim() !== "",
  );
  const writableLuoguPreparedNotes = preparedLuoguNotes.filter(
    (prepared) => !luoguWriteResultsById[prepared.submissionId],
  );
  const selectedLuoguPreviewSubmissions = useMemo(
    () => luoguPreviewResult?.submissions.filter((submission) => selectedLuoguSubmissionIds.has(submission.submissionId)) ?? [],
    [luoguPreviewResult, selectedLuoguSubmissionIds],
  );
  const activeLuoguPreparedPreview =
    (activeLuoguPreparedPreviewId ? luoguPreparedNotesById[activeLuoguPreparedPreviewId] : undefined) ??
    preparedLuoguNotes[0] ??
    null;

  const contentZoomLabel = `${Math.round(contentZoom * 100)}%`;
  const zoomStyle = { "--content-zoom": contentZoom } as CSSProperties;

  const updateContentZoom = (nextZoom: number | ((currentZoom: number) => number)) => {
    setContentZoom((currentZoom) => {
      const rawZoom = typeof nextZoom === "function" ? nextZoom(currentZoom) : nextZoom;
      return clampContentZoom(rawZoom);
    });
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
    setCurrentlyPreparingLuoguId(null);
    setLuoguPrepareProgress(null);
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
    setLuoguPreparedNotesById({});
    setLuoguPrepareErrorsById({});
    setCurrentlyPreparingLuoguId(null);
    setLuoguPrepareProgress(null);
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

  const openAiSettings = async () => {
    setIsAiSettingsOpen(true);
    setIsLoadingAiConfig(true);
    setAiConnectionResult(null);
    try {
      const config = await getAiConfig();
      setAiConfigBaseUrl(config.base_url);
      setAiConfigApiKey(config.api_key);
      setAiConfigModel(config.model);
    } catch (e) {
      toast.error(`AI 配置读取失败：${e}`);
    } finally {
      setIsLoadingAiConfig(false);
    }
  };

  const closeAiSettings = () => {
    if (isSavingAiConfig || isTestingAiConnection) return;
    setIsAiSettingsOpen(false);
  };

  const handleFillDeepSeekDefaults = () => {
    setAiConfigBaseUrl(DEEPSEEK_DEFAULT_BASE_URL);
    setAiConfigModel(DEEPSEEK_DEFAULT_MODEL);
    setAiConnectionResult(null);
    toast.info("已填入 DeepSeek 默认 base_url 和 model，请继续填写 API key 后保存");
  };

  const handleSaveAiConfig = async () => {
    setIsSavingAiConfig(true);
    try {
      await saveAiConfig({
        base_url: aiConfigBaseUrl.trim(),
        api_key: aiConfigApiKey.trim(),
        model: aiConfigModel.trim(),
      });
      toast.success("AI 配置已保存");
      setIsAiSettingsOpen(false);
    } catch (e) {
      toast.error(`AI 配置保存失败：${getErrorMessage(e)}`);
    } finally {
      setIsSavingAiConfig(false);
    }
  };

  const handleTestAiConnection = async () => {
    setIsTestingAiConnection(true);
    setAiConnectionResult(null);
    try {
      const result = await testAiConnection();
      setAiConnectionResult(result);
      toast.success(`AI 连接正常：${result.model}`);
    } catch (e) {
      toast.error(`AI 连接测试失败：${getErrorMessage(e)}`);
    } finally {
      setIsTestingAiConnection(false);
    }
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

  const openPromptDialog = async () => {
    setIsPromptDialogOpen(true);
    setIsLoadingPrompt(true);
    try {
      const prompts = await listAiPrompts();
      setPromptTemplates(prompts);
      const firstPrompt = prompts[0];
      if (firstPrompt) {
        const prompt = await readAiPrompt(firstPrompt.fileName);
        setSelectedPromptFileName(prompt.fileName);
        setPromptContent(prompt.content);
      }
    } catch (e) {
      toast.error(`Prompt 读取失败：${getErrorMessage(e)}`);
    } finally {
      setIsLoadingPrompt(false);
    }
  };

  const closePromptDialog = () => {
    if (isLoadingPrompt || isSavingPrompt) return;
    setIsPromptDialogOpen(false);
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
    setCurrentlyPreparingLuoguId(null);
    setLuoguPrepareProgress(null);
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
    setCurrentlyPreparingLuoguId(null);
    setLuoguPrepareProgress(null);
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
    setLuoguWriteResultsById((current) => {
      const next = { ...current };
      idsToSkip.forEach((id) => delete next[id]);
      return next;
    });
    setActiveLuoguPreparedPreviewId((current) => current && idsToSkipSet.has(current) ? null : current);
    toast.success(`已跳过 ${idsToSkip.length} 条提交；不会写 notes、调用 AI 或提交 Git`);
  };

  const handlePrepareSelectedLuoguSubmissions = async () => {
    if (!luoguPreviewResult) return;
    const selectedSubmissions = luoguPreviewResult.submissions.filter((submission) =>
      selectedLuoguSubmissionIds.has(submission.submissionId) &&
      !skippedLuoguSubmissionIds.has(submission.submissionId),
    );
    if (selectedSubmissions.length === 0) {
      toast.error("Please select Luogu submissions to preview");
      return;
    }

    setIsPreparingSelectedLuogu(true);
    setLuoguPrepareProgress({ current: 0, total: selectedSubmissions.length });
    setLuoguPrepareErrorsById({});
    setLuoguWriteResultsById({});
    let preparedCount = 0;
    let draftCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let firstPreparedId: string | null = null;

    try {
      for (let index = 0; index < selectedSubmissions.length; index += 1) {
        const submission = selectedSubmissions[index];
        setCurrentlyPreparingLuoguId(submission.submissionId);
        setLuoguPrepareProgress({ current: index + 1, total: selectedSubmissions.length });

        try {
          const prepared = await prepareLuoguSubmissionNote(submission.submissionId, {
            requireAc: luoguImportRules.requireAc,
            allowRawDraftWithoutInsight: luoguImportRules.missingInsightStrategy === "draft",
          });
          setLuoguPreparedNotesById((current) => ({
            ...current,
            [submission.submissionId]: prepared,
          }));
          setLuoguPrepareErrorsById((current) => {
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
          failedCount += 1;
          setLuoguPrepareErrorsById((current) => ({
            ...current,
            [submission.submissionId]: getErrorMessage(e),
          }));
        }
      }

      if (firstPreparedId) {
        setActiveLuoguPreparedPreviewId(firstPreparedId);
        setActiveLuoguPreviewDetailTab("rendered");
      }
      setLuoguImportStep("preview");
      toast.success(`Preview generated: ${preparedCount} ready, ${draftCount} draft, ${skippedCount} skipped, ${failedCount} failed`);
    } finally {
      setCurrentlyPreparingLuoguId(null);
      setLuoguPrepareProgress(null);
      setIsPreparingSelectedLuogu(false);
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
    setMarkdown(value);
    setIsDirty(true);
  };

  const applyLoadedMarkdown = (content: string) => {
    const loaded = splitLoadedMarkdown(content);
    setFrontmatterPrefix(loaded.frontmatterPrefix);
    setMarkdown(loaded.body);
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
    setFrontmatterPrefix(loaded.frontmatterPrefix);
    setMarkdown(loaded.body);
    setIsDirty(true);
  };

  const updateTagsFromInput = (value: string) => {
    const tags = value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    updateFrontmatter({ tags });
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
        setFrontmatterPrefix(loaded.frontmatterPrefix);
        setMarkdown(loaded.body);
        setIsDirty(true);
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

    setMarkdown(polishedBodyPreview);
    setIsDirty(true);
    setPolishedBodyPreview(null);
    toast.success("润色稿已应用，请确认后保存");
  };

  const handleCancelPolishedBody = () => {
    setPolishedBodyPreview(null);
  };

  const handleSelectFile = (path: string): boolean => {
    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，切换将会丢失。确定切换吗？");
      if (!ok) return false;
    }
    setCurrentFilePath(path);
    return true;
  };

  const handleSearchResultSelect = (path: string) => {
    const didSelect = handleSelectFile(path);
    if (didSelect) {
      setIsSearchOpen(false);
      setSearchQuery("");
    }
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
        applyLoadedMarkdown(savedContent);
      } catch (readError) {
        console.warn("Reload saved note failed:", readError);
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
    window.localStorage.setItem(CONTENT_ZOOM_STORAGE_KEY, String(contentZoom));
  }, [contentZoom]);

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

  // Ctrl/Cmd + Plus/Minus/0 缩放编辑器正文和右侧预览正文，不拦截 Ctrl+S 保存。
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;

      const key = e.key.toLowerCase();
      if (key === "+" || key === "=") {
        e.preventDefault();
        updateContentZoom((currentZoom) => currentZoom + CONTENT_ZOOM_STEP);
      } else if (key === "-" || key === "_") {
        e.preventDefault();
        updateContentZoom((currentZoom) => currentZoom - CONTENT_ZOOM_STEP);
      } else if (key === "0") {
        e.preventDefault();
        updateContentZoom(CONTENT_ZOOM_DEFAULT);
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
    if (!isSearchOpen) return;

    let cancelled = false;
    setIsSearchingNotes(true);

    const timer = window.setTimeout(() => {
      searchNotes(searchQuery)
        .then((results) => {
          if (!cancelled) setSearchResults(results);
        })
        .catch((e: Error) => {
          if (!cancelled) {
            setSearchResults([]);
            toast.error(`搜索失败：${e.message}`);
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearchingNotes(false);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isSearchOpen, searchQuery]);

  // 挂载时从后端加载笔记列表
  useEffect(() => {
    listNotes()
      .then(setFiles)
      .catch((e: Error) => console.error("加载笔记列表失败：", e.message));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen("notes-changed", () => {
      listNotes()
        .then((updated) => {
          if (!cancelled) setFiles(updated);
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

  // 当选中文件变化时，从后端读取内容
  // 使用 cancelled flag 防御 race condition：
  // 快速连续点击不同文件时，后到的响应可能比先到的早 resolve，
  // cancelled 确保只有最新一次 readNote 的结果会被 setMarkdown 采用。
  useEffect(() => {
    if (currentFilePath === null) {
      // 无选中文件时恢复欢迎内容
      setFrontmatterPrefix("");
      setMarkdown(INITIAL_MARKDOWN);
      setIsDirty(false);
      return;
    }

    let cancelled = false;

    readNote(currentFilePath)
      .then((content) => {
        if (!cancelled) {
          applyLoadedMarkdown(content);
          setIsDirty(false);
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
    <Toaster />
    <Dialog open={isSearchOpen} onOpenChange={setIsSearchOpen}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4" />
            搜索笔记
          </DialogTitle>
        </DialogHeader>
        <div className="border-b border-border p-3">
          <Input
            ref={searchInputRef}
            value={searchQuery}
            placeholder="搜索标题、正文、tags、source、summary、路径；支持 tag:DP source:luogu @recent"
            className="h-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults[0]) {
                e.preventDefault();
                handleSearchResultSelect(searchResults[0].path);
              }
            }}
          />
        </div>
        <div className="max-h-[28rem] overflow-y-auto p-2">
          {isSearchingNotes ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              搜索中...
            </div>
          ) : searchResults.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              没有找到匹配的笔记
            </div>
          ) : (
            <div className="grid gap-1">
              {searchResults.map((result) => {
                const preview = result.summary || result.excerpt;

                return (
                  <button
                    key={result.path}
                    type="button"
                    className="grid gap-1 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none"
                    onClick={() => handleSearchResultSelect(result.path)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-medium text-foreground">
                        {result.title}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatSearchDate(result.date)}
                      </span>
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted-foreground">
                      {result.path}
                    </div>
                    {result.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {preview && (
                      <div className="max-h-10 overflow-hidden text-xs leading-5 text-muted-foreground">
                        {preview}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
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
    <Dialog open={isAiSettingsOpen} onOpenChange={(open) => !open && closeAiSettings()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI 设置</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            <div>使用 OpenAI-compatible Chat Completions 接口。</div>
            <div>API Key 会保存在本地 .oinb/config.json，不要提交到 Git。</div>
            <div>测试连接会请求模型返回 {"{\"ok\": true}"}。</div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/10 p-3">
            <div className="text-xs leading-5 text-muted-foreground">
              <div className="font-medium text-foreground">DeepSeek 默认配置捷径</div>
              <div>只填入 base_url 和 model，不会填写 API key，也不会自动保存。</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={handleFillDeepSeekDefaults}
              disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
            >
              填入 DeepSeek 默认配置
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-config-base-url">Base URL</Label>
            <Input
              id="ai-config-base-url"
              value={aiConfigBaseUrl}
              disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
              placeholder="https://api.example.com/v1"
              onChange={(e) => setAiConfigBaseUrl(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-config-model">Model</Label>
            <Input
              id="ai-config-model"
              value={aiConfigModel}
              disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
              placeholder="deepseek-chat"
              onChange={(e) => setAiConfigModel(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ai-config-api-key">API Key</Label>
            <Input
              id="ai-config-api-key"
              value={aiConfigApiKey}
              disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
              placeholder="sk-..."
              type="password"
              onChange={(e) => setAiConfigApiKey(e.target.value)}
            />
          </div>
          {aiConnectionResult && (
            <div className="grid gap-1 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">AI 连接正常</div>
              <div>model: {aiConnectionResult.model}</div>
              <div>ok: {String(aiConnectionResult.ok)}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeAiSettings} disabled={isSavingAiConfig || isTestingAiConnection}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={handleTestAiConnection}
            disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
          >
            测试连接
          </Button>
          <Button
            onClick={handleSaveAiConfig}
            disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {isPromptDialogOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-8">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-prompt-editor-title"
          className="grid overflow-hidden border border-border bg-popover text-popover-foreground shadow-2xl"
          style={{
            width: "min(1280px, calc(100vw - 64px))",
            maxWidth: "1280px",
            height: "min(86vh, 860px)",
            maxHeight: "860px",
            gridTemplateColumns: "clamp(220px, 22vw, 280px) minmax(0, 1fr)",
          }}
        >
          <aside className="flex min-h-0 min-w-0 flex-col border-r border-border bg-muted/10">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Prompt 模板
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                选择要编辑的本地模板
              </div>
            </div>
            <div className="grid min-h-0 content-start gap-2 overflow-y-auto p-3">
              {promptTemplates.map((prompt) => {
                const isSelected = prompt.fileName === selectedPromptFileName;
                const promptUsage = getPromptUsageInfo(prompt.fileName);
                return (
                  <Button
                    key={prompt.fileName}
                    variant="ghost"
                    className={`h-auto min-w-0 justify-start rounded-none border px-3 py-2.5 text-left text-xs ${
                      isSelected
                        ? "border-primary/70 bg-primary/15 text-foreground shadow-[inset_3px_0_0_hsl(var(--primary))]"
                        : "border-border bg-background/40 hover:bg-accent/50"
                    }`}
                    disabled={isLoadingPrompt || isSavingPrompt}
                    onClick={() => handleSelectPrompt(prompt.fileName)}
                  >
                    <span className="grid min-w-0 gap-1">
                      <span className="truncate font-medium">{prompt.displayName}</span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">{prompt.fileName}</span>
                      <span className="truncate text-[10px] font-normal text-muted-foreground">
                        {promptUsage.purpose}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </aside>

          <section className="grid min-h-0 min-w-0 grid-rows-[64px_auto_minmax(0,1fr)_56px]">
            <header className="flex min-h-0 items-center justify-between gap-4 border-b border-border px-5">
              <div className="grid min-w-0 gap-0.5">
                <h2 id="ai-prompt-editor-title" className="text-base font-semibold">
                  编辑 AI Prompt
                </h2>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {selectedPrompt ? selectedPrompt.fileName : "请选择一个 Prompt 模板"}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isLoadingPrompt || isSavingPrompt}
                aria-label="关闭 AI Prompt 编辑器"
                onClick={closePromptDialog}
              >
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div className="max-h-[108px] min-w-0 overflow-hidden border-b border-border bg-muted/10 px-5 py-3">
              <div className="grid gap-2 text-xs leading-5">
                <div className="min-w-0 truncate text-foreground">{selectedPromptUsage.purpose}</div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    变量
                  </span>
                  <div className="flex min-w-0 flex-wrap gap-1.5 overflow-hidden">
                    {selectedPromptUsage.variables.length > 0 ? (
                      selectedPromptUsage.variables.map((variable) => (
                        <code
                          key={variable}
                          className="shrink-0 border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]"
                        >
                          {variable}
                        </code>
                      ))
                    ) : (
                      <span className="text-muted-foreground">暂无可展示变量</span>
                    )}
                  </div>
                </div>
                <div className="truncate text-muted-foreground">
                  {selectedPromptUsage.notes[0]}
                </div>
              </div>
            </div>

            <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2 p-5">
              <Label htmlFor="ai-prompt-content" className="flex items-center justify-between gap-3">
                <span>Prompt 内容</span>
                {selectedPrompt && (
                  <span className="truncate font-mono text-[10px] font-normal text-muted-foreground">
                    {selectedPrompt.fileName}
                  </span>
                )}
              </Label>
              <textarea
                id="ai-prompt-content"
                value={promptContent}
                disabled={isLoadingPrompt || isSavingPrompt || !selectedPromptFileName}
                rows={30}
                className="h-full min-h-[460px] w-full min-w-0 resize-none overflow-auto rounded-none border border-input bg-background px-4 py-3 font-mono text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
                style={{
                  width: "100%",
                  minWidth: 0,
                }}
                onChange={(e) => setPromptContent(e.target.value)}
              />
            </div>

            <footer className="flex min-w-0 items-center justify-between gap-3 border-t border-border px-5">
              <div className="min-w-0 truncate text-[11px] text-muted-foreground">
                本地路径：.oinb/prompts/{selectedPromptFileName || "*.md"}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="outline" onClick={closePromptDialog} disabled={isLoadingPrompt || isSavingPrompt}>
                  取消
                </Button>
                <Button onClick={handleSavePrompt} disabled={isLoadingPrompt || isSavingPrompt || !selectedPromptFileName}>
                  保存
                </Button>
              </div>
            </footer>
          </section>
        </div>
      </div>
    )}
    {isLuoguDialogOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-8 backdrop-blur-sm">
        <section
          className="flex overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-2xl"
          style={{
            width: "min(1280px, calc(100vw - 64px))",
            height: "min(88vh, 900px)",
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border bg-muted/20 px-6 py-5">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-tight">洛谷导入中心</h2>
                <p className="mt-1 text-sm text-muted-foreground">从洛谷提交中选择记录，预览后再导入为本地笔记</p>
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
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)]">
              <aside className="border-r border-border bg-muted/10 p-3">
                {[
                  { id: "scan" as const, label: "提交导入", description: "扫描、预览、写入" },                  { id: "rules" as const, label: "导入规则", description: "候选、去重、草稿" },

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
                  <div className="flex h-full min-h-0 flex-col gap-4 p-5">
                    <section className="grid shrink-0 gap-3 rounded-md border border-border bg-card/70 p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">扫描范围</div>
                          <div className="mt-1 text-muted-foreground">默认最近 20 条；按时间扫描最长只允许最近一年。</div>
                        </div>
                        <div className="flex rounded-md border border-border bg-muted/20 p-1">
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
                      </div>
                      {luoguScanMode === "count" ? (
                        <div className="flex flex-wrap gap-2">
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
                        <div className="flex flex-wrap gap-2">
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

                    <section className="shrink-0 rounded-md border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                      <div className="font-medium text-foreground">扫描最近提交前先预览。</div>
                      <div>扫描只读取最近提交列表，不抓源码，不调用 AI，不写 notes，不 commit，也不会推进 last_submission_id。</div>
                      <div>多页扫描会自动放慢请求，每页之间短暂停顿；前端最多扫描 {LUOGU_SCAN_MAX_PAGES} 页，避免无限爬取。</div>
                    </section>

                    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card/70">
                      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
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
                        <div className="text-right text-xs text-muted-foreground"><div>{luoguRuleSummary}</div><div>已选 {selectedLuoguImportCount} 条</div></div>
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
                                const statusText = getLuoguPreviewWorkflowStatusText(
                                  submission,
                                  prepared,
                                  prepareError,
                                  writeResult,
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
                    <div className="flex h-full min-h-0 flex-col gap-4 p-5">
                      <section className="flex shrink-0 items-center justify-between gap-3 rounded-md border border-border bg-card/70 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground">预览生成结果</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {luoguPrepareProgress
                              ? `正在生成预览 ${luoguPrepareProgress.current} / ${luoguPrepareProgress.total}`
                              : luoguWriteProgress
                                ? `正在写入 ${luoguWriteProgress.current} / ${luoguWriteProgress.total}`
                                : `已生成 ${preparedLuoguNotes.length} 个预览，可写入 ${writableLuoguPreparedNotes.length} 个`}
                          </div>
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
                        <section className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] overflow-hidden rounded-md border border-border bg-card/70">
                          <div className="min-h-0 overflow-auto border-r border-border bg-muted/10">
                            <div className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
                              已生成预览的提交
                            </div>
                            <div className="grid gap-1 p-2">
                              {selectedLuoguPreviewSubmissions.map((submission) => {
                                const prepared = luoguPreparedNotesById[submission.submissionId];
                                const prepareError = luoguPrepareErrorsById[submission.submissionId];
                                const writeResult = luoguWriteResultsById[submission.submissionId];
                                const statusText = getLuoguPreviewWorkflowStatusText(
                                  submission,
                                  prepared,
                                  prepareError,
                                  writeResult,
                                  currentlyPreparingLuoguId,
                                  currentlyWritingLuoguId,
                                  selectedLuoguSubmissionIds,
                                  skippedLuoguSubmissionIds,
                                );
                                const canPreview = prepared && !prepared.skipped && prepared.markdown.trim();
                                return (
                                  <button
                                    key={submission.submissionId}
                                    type="button"
                                    className={
                                      activeLuoguPreparedPreviewId === submission.submissionId
                                        ? "w-full rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-left shadow-sm"
                                        : "w-full rounded-md border border-transparent px-3 py-2 text-left hover:border-border/70 hover:bg-muted/30"
                                    }
                                    onClick={() => {
                                      if (canPreview) setActiveLuoguPreparedPreviewId(submission.submissionId);
                                    }}
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-medium text-foreground">
                                        {submission.problemId || "未知题号"} · {submission.problemTitle || "未读取到标题"}
                                      </div>
                                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                                        {submission.submissionId}
                                      </div>
                                      <div
                                        className={
                                          writeResult?.failed || prepareError || prepared?.aiStatus === "failed" || prepared?.existing
                                            ? "mt-1 truncate text-xs text-amber-300"
                                            : prepared?.draftFallback
                                              ? "mt-1 truncate text-xs text-amber-200"
                                              : "mt-1 truncate text-xs text-muted-foreground"
                                        }
                                        title={statusText}
                                      >
                                        {statusText}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {activeLuoguPreparedPreview ? (
                            <div className="flex min-h-0 min-w-0 flex-col">
                              <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-xs text-muted-foreground">suggested path</div>
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
                              <div className="flex shrink-0 gap-2 border-b border-border bg-card px-4 py-2">
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
                              这次生成没有可预览的 Markdown。请查看左侧每条提交的失败或跳过原因。
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

            <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-3">
              <div className="min-w-0 truncate text-xs text-muted-foreground">
                {luoguImportCenterTab === "scan" && luoguImportStep === "preview" && luoguWriteProgress
                  ? `正在写入 ${luoguWriteProgress.current} / ${luoguWriteProgress.total}`
                  : luoguImportCenterTab === "scan" && luoguImportStep === "preview"
                    ? `已生成 ${preparedLuoguNotes.length} 个预览，可写入 ${writableLuoguPreparedNotes.length} 个`
                : luoguImportCenterTab === "scan" && luoguPrepareProgress
                  ? `preparing preview ${luoguPrepareProgress.current} / ${luoguPrepareProgress.total}`
                  : luoguImportCenterTab === "scan" && luoguScanProgress
                    ? `正在扫描第 ${luoguScanProgress.currentPage} 页，已发现 ${luoguScanProgress.foundCount} 条；范围：${luoguScanProgress.rangeLabel}`
                  : luoguImportCenterTab === "scan"
                    ? `已选 ${selectedLuoguImportCount} 条，生成预览后进入下一步`
                    : luoguImportCenterTab === "rules"
                      ? luoguRuleSummary
                    : luoguImportCenterTab === "account"
                      ? "账户状态只展示配置与最近结果，不扫描、不写入"
                    : luoguImportCenterTab === "manual"
                      ? "手动导入会调用 AI 并写入 notes/luogu"
                      : "旧版同步保留在高级操作中"}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {luoguImportCenterTab === "scan" && (
                  luoguImportStep === "scan" ? (
                    <>
                      <Button
                        variant="outline"
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
                          isLoadingLuoguConfig ||
                          isScanningLuoguPreview ||
                          isPreparingSelectedLuogu ||
                          isWritingPreparedLuogu ||
                          isSyncingLuogu
                        }
                      >
                        {isPreparingSelectedLuogu ? "生成预览中..." : `生成预览 ${selectedLuoguImportCount}`}
                      </Button>
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
    <Dialog open={isAdvancedActionsOpen} onOpenChange={setIsAdvancedActionsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>高级与维护</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={() => {
              setIsAdvancedActionsOpen(false);
              void openLuoguDialog();
            }}
          >
            <Download className="h-3.5 w-3.5" />
            洛谷导入中心
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={() => {
              setIsAdvancedActionsOpen(false);
              openLuoguSettings();
            }}
            disabled={isLoadingLuoguConfig || isSavingLuoguConfig || isTestingLuoguConnection || isSyncingLuogu}
          >
            <Settings className="h-3.5 w-3.5" />
            洛谷设置
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={handleTestLuoguConnection}
            disabled={isTestingLuoguConnection}
          >
            <PlugZap className="h-3.5 w-3.5" />
            测试连接
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={() => {
              setIsAdvancedActionsOpen(false);
              openPromptDialog();
            }}
            disabled={isLoadingPrompt || isSavingPrompt}
          >
            <FileText className="h-3.5 w-3.5" />
            AI Prompt
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={handleRestartBlog}
            disabled={isRestartingBlog}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重启博客
          </Button>
          <Button
            variant="outline"
            className="justify-start gap-2"
            onClick={handlePushGit}
            disabled={isPushingGit}
          >
            <Upload className="h-3.5 w-3.5" />
            同步 Git
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-sm font-semibold tracking-wide">OI Notebook</span>
          <div className="flex min-w-0 max-w-80 items-center gap-2 truncate text-xs text-muted-foreground">
            <span className="truncate">{currentFilePath ?? "未选择文件"}</span>
            <span
              className={isDirty ? "shrink-0 text-amber-300" : "shrink-0 text-muted-foreground"}
              title={saveStatusLabel}
            >
              {saveStatusLabel}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">主操作</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={openCreateDialog}
            >
              <Plus className="h-3.5 w-3.5" />
              新建
            </Button>
            <Button
              variant={isDirty ? "default" : "outline"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={handleSaveCurrentNote}
              disabled={!currentFilePath || !isDirty || isSavingNote}
            >
              <Save className="h-3.5 w-3.5" />
              {isDirty ? "保存" : "已保存"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={handleOpenBlog}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              打开博客
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={handleOpenNotesFolder}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              笔记文件夹
            </Button>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">核心能力</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={openAiSettings}
              disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
            >
              <Bot className="h-3.5 w-3.5" />
              AI 设置
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => void openLuoguDialog()}
              disabled={isLoadingLuoguConfig || isTestingLuoguConnection || isScanningLuoguPreview || (isPreparingSelectedLuogu || isWritingPreparedLuogu) || isSyncingLuogu}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              洛谷
            </Button>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setIsAdvancedActionsOpen(true)}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            更多
          </Button>
        </div>
      </header>

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: File tree (fixed 240px) */}
        <aside className="flex w-60 shrink-0 flex-col overflow-hidden">
          <div className="flex h-8 shrink-0 items-center justify-between px-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              笔记列表
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsSearchOpen(true)}
                title="搜索笔记 Ctrl+K"
                aria-label="搜索笔记"
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={openCreateDialog}
                title="新建笔记"
                aria-label="新建笔记"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FileTree
              files={files}
              activeFilePath={currentFilePath}
              onSelectFile={handleSelectFile}
              onDeleteFile={handleDelete}
              onRenameFile={openRenameDialog}
            />
          </div>
        </aside>

        <Separator orientation="vertical" />

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!currentFilePath ? (
            <div className="flex min-h-0 flex-1 justify-center overflow-auto px-6 py-8">
              <div className="grid w-full max-w-6xl gap-5">
                <section className="rounded-lg border border-border bg-background/90 p-6 shadow-sm">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-2xl font-semibold tracking-wide">OI Notebook</div>
                        <span className="rounded-sm border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                          OI 笔记编辑器 + 本地博客 + 洛谷 / AI 辅助
                        </span>
                      </div>
                      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                        用一个本地工作台把题解、trick、复盘、博客预览，以及洛谷导入和 AI 整理串起来。第一次打开时，可以先从一篇普通笔记开始。
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button className="gap-2" onClick={openCreateDialog}>
                        <Plus className="h-4 w-4" />
                        新建笔记
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={handleOpenBlog}>
                        <ExternalLink className="h-4 w-4" />
                        打开博客
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={openAiSettings}
                        disabled={isLoadingAiConfig || isSavingAiConfig || isTestingAiConnection}
                      >
                        <Bot className="h-4 w-4" />
                        配置 AI
                      </Button>
                      <Button variant="outline" className="gap-2" onClick={openNotesFolder}>
                        <FolderOpen className="h-4 w-4" />
                        笔记目录
                      </Button>
                    </div>
                  </div>
                </section>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <section className="grid gap-2 rounded-lg border border-border bg-muted/15 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Plus className="h-4 w-4" />
                      快速开始
                    </div>
                    <div className="text-xs leading-6 text-muted-foreground">
                      <div>左侧文件树管理 notes，中间写 Markdown，选中文件后右侧实时预览。</div>
                      <div>保存后可以直接去 Local Blog v2 看文章效果。</div>
                    </div>
                  </section>

                  <section className="grid gap-2 rounded-lg border border-border bg-muted/15 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Sparkles className="h-4 w-4" />
                      Markdown 能力
                    </div>
                    <div className="text-xs leading-6 text-muted-foreground">
                      <div>支持 KaTeX 数学公式、代码高亮、行高亮和可选行号。</div>
                      <div>也支持洛谷风格 callout、align、epigraph、cute-table 和表格合并。</div>
                    </div>
                  </section>

                  <section className="grid gap-2 rounded-lg border border-border bg-muted/15 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <RefreshCw className="h-4 w-4" />
                      洛谷导入
                    </div>
                    <div className="text-xs leading-6 text-muted-foreground">
                      <div>现在是可控流程：先扫描提交，再选择规则。</div>
                      <div>生成预览后可查看渲染预览、Markdown 源文和提交源码，确认后再写入。</div>
                    </div>
                  </section>

                  <section className="grid gap-2 rounded-lg border border-border bg-muted/15 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Bot className="h-4 w-4" />
                      AI 辅助
                    </div>
                    <div className="text-xs leading-6 text-muted-foreground">
                      <div>可配置 DeepSeek 或 OpenAI compatible API。</div>
                      <div>支持编辑 AI Prompt，导入洛谷时也能让 AI 整理 insight 或生成草稿。</div>
                    </div>
                  </section>

                  <section className="grid gap-2 rounded-lg border border-border bg-muted/15 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <ExternalLink className="h-4 w-4" />
                      Local Blog
                    </div>
                    <div className="text-xs leading-6 text-muted-foreground">
                      <div>一键打开本地博客预览，支持文章列表、搜索、分类和标签。</div>
                      <div>当前主力体验是 Local Blog v2，适合拿来复习和回看自己的积累。</div>
                    </div>
                  </section>

                  <section className="grid gap-2 rounded-lg border border-border bg-muted/15 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <FileText className="h-4 w-4" />
                      注意事项
                    </div>
                    <div className="text-xs leading-6 text-muted-foreground">
                      <div>API Key 只保存在本地配置。</div>
                      <div>普通同学使用安装版时，不需要自己安装 Node 或 pnpm；Git 也可以后面再学。</div>
                    </div>
                  </section>
                </div>

                <section className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      笔记目录
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={openNotesFolder}>
                      打开目录
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-md border border-border bg-background/70 p-3">
                      <div className="text-sm font-medium">tricks</div>
                      <div className="mt-1 text-xs text-muted-foreground">算法结论、模板和常见套路。</div>
                    </div>
                    <div className="rounded-md border border-border bg-background/70 p-3">
                      <div className="text-sm font-medium">problems</div>
                      <div className="mt-1 text-xs text-muted-foreground">题解、证明、踩坑和复盘。</div>
                    </div>
                    <div className="rounded-md border border-border bg-background/70 p-3">
                      <div className="text-sm font-medium">luogu</div>
                      <div className="mt-1 text-xs text-muted-foreground">洛谷导入后沉淀下来的笔记。</div>
                    </div>
                    <div className="rounded-md border border-border bg-background/70 p-3">
                      <div className="text-sm font-medium">inbox</div>
                      <div className="mt-1 text-xs text-muted-foreground">速记、草稿和暂存想法。</div>
                    </div>
                  </div>
                </section>
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

              <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                {/* Center: Markdown editor */}
                <main
                  className={cn(
                    "flex min-w-0 flex-1 flex-col overflow-hidden",
                    !showEditorPane && "hidden",
                  )}
                  style={zoomStyle}
                  onWheelCapture={handleContentWheel}
                >
                  {editorViewMode !== "preview" && (
                    <details
                      open={isFrontmatterOpen}
                      onToggle={(event) => setIsFrontmatterOpen(event.currentTarget.open)}
                      className="shrink-0 border-b border-border bg-background/95"
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
                      <div className="grid gap-3 px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
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
                        <div className="grid grid-cols-2 gap-3">
                          <div className="grid gap-1.5">
                            <Label htmlFor="frontmatter-title">title</Label>
                            <Input
                              id="frontmatter-title"
                              value={frontmatter.fields.title}
                              disabled={!frontmatter.canMerge}
                              onChange={(e) => updateFrontmatter({ title: e.target.value })}
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="frontmatter-tags">tags</Label>
                            <Input
                              id="frontmatter-tags"
                              value={frontmatter.fields.tags.join(", ")}
                              disabled={!frontmatter.canMerge || !frontmatter.canEditTags}
                              placeholder="DP, 线段树, trick"
                              onChange={(e) => updateTagsFromInput(e.target.value)}
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="frontmatter-difficulty">difficulty</Label>
                            <Input
                              id="frontmatter-difficulty"
                              value={frontmatter.fields.difficulty}
                              disabled={!frontmatter.canMerge}
                              onChange={(e) => updateFrontmatter({ difficulty: e.target.value })}
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="frontmatter-source">source</Label>
                            <Input
                              id="frontmatter-source"
                              value={frontmatter.fields.source}
                              disabled={!frontmatter.canMerge}
                              onChange={(e) => updateFrontmatter({ source: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="grid gap-1.5">
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
                        <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
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
                    onPasteImage={handlePasteImage}
                    onScroll={(r) => setScrollRatio(r)}
                    hideToolbar
                    onToolbarApiChange={setMarkdownToolbarApi}
                    className="min-h-0 min-w-0 flex-1"
                  />
                </main>

                {showEditorPane && showPreviewPane && <Separator orientation="vertical" />}

                {/* Right: Live preview */}
                <aside
                  className={cn(
                    "min-w-0 overflow-hidden",
                    showPreviewPane ? "flex" : "hidden",
                    showEditorPane ? "flex-1" : "flex-[1_1_100%]",
                  )}
                  style={zoomStyle}
                  onWheelCapture={handleContentWheel}
                >
                  <MarkdownPreview
                    markdown={markdown}
                    noteRelativePath={currentFilePath}
                    scrollRatio={scrollRatio}
                    className="h-full w-full min-w-0"
                  />
                </aside>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
    </>
  );
}
