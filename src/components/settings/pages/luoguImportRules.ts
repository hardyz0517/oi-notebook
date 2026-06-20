import type { PrepareLuoguSubmissionNoteResult } from "@/lib/api";

export type LuoguSubmitFilter = "acOnly" | "includeNonAc";
export type LuoguProblemIdFilter = "all" | "onlyP";
export type LuoguSameProblemStrategy = "latestAc" | "allAc" | "manual";
export type LuoguImportedProblemPolicy = "skip" | "showUnselected" | "regenerate";
export type LuoguMissingInsightStrategy = "skip" | "draft" | "review";
export type LuoguScanResultVisibility = "hideSkipped" | "showAll";
export type LuoguDefaultSaveLocation = "luogu" | "problems" | "custom";
export type LuoguWriteStrategy = "createNew" | "askOnConflict" | "overwrite";
export type LuoguDefaultDraftStatus = "draft" | "published";
export type LuoguIncludeSourceCode = "no" | "yes";

export interface LuoguImportRules {
  requireAc: boolean;
  submitFilter: LuoguSubmitFilter;
  problemIdFilter: LuoguProblemIdFilter;
  sameProblemStrategy: LuoguSameProblemStrategy;
  keepLatestAcOnly: boolean;
  importedProblemPolicy: LuoguImportedProblemPolicy;
  missingInsightStrategy: LuoguMissingInsightStrategy;
  scanResultVisibility: LuoguScanResultVisibility;
  defaultSaveLocation: LuoguDefaultSaveLocation;
  customSaveDirectory: string;
  writeStrategy: LuoguWriteStrategy;
  defaultDraftStatus: LuoguDefaultDraftStatus;
  includeSourceCode: boolean;
}

export type LuoguImportRuleId =
  | "submitFilter"
  | "problemIdFilter"
  | "sameProblemStrategy"
  | "importedProblemPolicy"
  | "missingInsightStrategy"
  | "scanResultVisibility"
  | "defaultSaveLocation"
  | "writeStrategy"
  | "defaultDraftStatus"
  | "includeSourceCode";

export interface LuoguImportRuleOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface LuoguImportRuleRowModel {
  id: LuoguImportRuleId;
  title: string;
  description: string;
  value: string;
  options: LuoguImportRuleOption[];
}

export interface LuoguImportRuleBusyState {
  isLoadingConfig: boolean;
  isTestingConnection: boolean;
  isScanningPreview: boolean;
  isPreparingSelected: boolean;
  isWritingPrepared: boolean;
  isSyncing: boolean;
}

const LUOGU_IMPORT_RULES_STORAGE_KEY = "oi-notebook.luoguImportRules";

export const DEFAULT_LUOGU_IMPORT_RULES: LuoguImportRules = {
  requireAc: true,
  submitFilter: "acOnly",
  problemIdFilter: "all",
  sameProblemStrategy: "latestAc",
  keepLatestAcOnly: true,
  importedProblemPolicy: "skip",
  missingInsightStrategy: "draft",
  scanResultVisibility: "showAll",
  defaultSaveLocation: "luogu",
  customSaveDirectory: "",
  writeStrategy: "createNew",
  defaultDraftStatus: "draft",
  includeSourceCode: false,
};

export function normalizeLuoguImportRules(value: Partial<LuoguImportRules> | null | undefined): LuoguImportRules {
  const sameProblemStrategy =
    value?.sameProblemStrategy ??
    (value?.keepLatestAcOnly === false ? "allAc" : DEFAULT_LUOGU_IMPORT_RULES.sameProblemStrategy);
  const submitFilter = value?.submitFilter ?? (value?.requireAc === false ? "includeNonAc" : "acOnly");

  return {
    ...DEFAULT_LUOGU_IMPORT_RULES,
    ...value,
    submitFilter,
    requireAc: submitFilter === "acOnly",
    problemIdFilter: value?.problemIdFilter === "onlyP" ? "onlyP" : DEFAULT_LUOGU_IMPORT_RULES.problemIdFilter,
    sameProblemStrategy,
    keepLatestAcOnly: sameProblemStrategy === "latestAc",
    missingInsightStrategy: value?.missingInsightStrategy ?? DEFAULT_LUOGU_IMPORT_RULES.missingInsightStrategy,
    customSaveDirectory: typeof value?.customSaveDirectory === "string" ? value.customSaveDirectory : DEFAULT_LUOGU_IMPORT_RULES.customSaveDirectory,
    includeSourceCode: value?.includeSourceCode === true,
  };
}

export function readStoredLuoguImportRules(): LuoguImportRules {
  if (typeof window === "undefined") return DEFAULT_LUOGU_IMPORT_RULES;

  try {
    const stored = window.localStorage.getItem(LUOGU_IMPORT_RULES_STORAGE_KEY);
    if (!stored) return DEFAULT_LUOGU_IMPORT_RULES;
    return normalizeLuoguImportRules(JSON.parse(stored) as Partial<LuoguImportRules>);
  } catch {
    return DEFAULT_LUOGU_IMPORT_RULES;
  }
}

export function saveStoredLuoguImportRules(rules: LuoguImportRules): void {
  window.localStorage.setItem(LUOGU_IMPORT_RULES_STORAGE_KEY, JSON.stringify(rules));
}

export function isLuoguRuleControlDisabled(state: LuoguImportRuleBusyState): boolean {
  return (
    state.isLoadingConfig ||
    state.isTestingConnection ||
    state.isScanningPreview ||
    state.isPreparingSelected ||
    state.isWritingPrepared ||
    state.isSyncing
  );
}

export function buildLuoguImportRuleRowModels(rules: LuoguImportRules): LuoguImportRuleRowModel[] {
  return [
    {
      id: "submitFilter",
      title: "提交筛选",
      description: "控制扫描时哪些提交会进入候选。",
      value: rules.submitFilter,
      options: [
        { value: "acOnly", label: "只处理 AC" },
        { value: "includeNonAc", label: "包含非 AC" },
      ],
    },
    {
      id: "problemIdFilter",
      title: "题号类型筛选",
      description: "只保留 P 开头的公开题库题目，过滤 U / T 等题号。",
      value: rules.problemIdFilter,
      options: [
        { value: "all", label: "全部题号" },
        { value: "onlyP", label: "仅保留 P 题" },
      ],
    },
    {
      id: "sameProblemStrategy",
      title: "同题策略",
      description: "同一道题有多次提交时如何处理。",
      value: rules.sameProblemStrategy,
      options: [
        { value: "latestAc", label: "同题保留最新 AC" },
        { value: "allAc", label: "保留全部 AC" },
        { value: "manual", label: "手动选择" },
      ],
    },
    {
      id: "importedProblemPolicy",
      title: "已导入题目",
      description: "本地已有记录时如何处理。",
      value: rules.importedProblemPolicy,
      options: [
        { value: "skip", label: "跳过" },
        { value: "showUnselected", label: "显示但默认不选" },
        { value: "regenerate", label: "允许重新生成" },
      ],
    },
    {
      id: "missingInsightStrategy",
      title: "无心得时",
      description: "没有找到文末启示或可整理心得时如何处理。",
      value: rules.missingInsightStrategy,
      options: [
        { value: "draft", label: "生成草稿" },
        { value: "skip", label: "跳过" },
        { value: "review", label: "进入手动审阅" },
      ],
    },
    {
      id: "scanResultVisibility",
      title: "扫描结果显示",
      description: "扫描界面是否显示被规则跳过的提交。",
      value: rules.scanResultVisibility,
      options: [
        { value: "showAll", label: "显示全部" },
        { value: "hideSkipped", label: "隐藏跳过项" },
      ],
    },
    {
      id: "defaultSaveLocation",
      title: "默认保存位置",
      description: "生成笔记默认写入目录。",
      value: rules.defaultSaveLocation,
      options: [
        { value: "luogu", label: "luogu/" },
        { value: "problems", label: "problems/" },
        { value: "custom", label: "自定义目录" },
      ],
    },
    {
      id: "writeStrategy",
      title: "写入策略",
      description: "目标文件已存在时如何处理。",
      value: rules.writeStrategy,
      options: [
        { value: "createNew", label: "仅新建，不覆盖" },
        { value: "askOnConflict", label: "冲突时询问" },
        { value: "overwrite", label: "允许覆盖" },
      ],
    },
    {
      id: "defaultDraftStatus",
      title: "默认草稿状态",
      description: "写入后的 frontmatter 草稿状态默认值。",
      value: rules.defaultDraftStatus,
      options: [
        { value: "draft", label: "写入为草稿" },
        { value: "published", label: "写入为正式笔记" },
      ],
    },
    {
      id: "includeSourceCode",
      title: "导入时包含源代码",
      description: "默认只生成复盘笔记；开启后在文末附上完整提交代码。",
      value: rules.includeSourceCode ? "yes" : "no",
      options: [
        { value: "no", label: "不包含" },
        { value: "yes", label: "包含源代码" },
      ],
    },
  ];
}

export function validateLuoguSaveDirectoryInput(value: string): string | null {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalized) return "目录不能为空";
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return "不能使用绝对路径";
  if (normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) return "不能包含空段或 ..";
  if (/[<>:"|?*]/.test(normalized)) return "不能包含 Windows 非法字符";
  return null;
}

export function normalizeLuoguSaveDirectory(rules: LuoguImportRules): string {
  if (rules.defaultSaveLocation === "problems") return "problems";
  if (rules.defaultSaveLocation === "custom") {
    const custom = rules.customSaveDirectory.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    return validateLuoguSaveDirectoryInput(custom) ? "luogu" : custom;
  }
  return "luogu";
}

export function rewriteLuoguPreparedRelativePath(relativePath: string, rules: LuoguImportRules): string {
  const targetDir = normalizeLuoguSaveDirectory(rules);
  const fileName = relativePath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
  if (!fileName) return relativePath;
  return `${targetDir}/${fileName}`;
}

function setMarkdownDraftValue(markdown: string, draftValue: boolean): string {
  const nextDraft = `draft: ${draftValue ? "true" : "false"}`;
  if (markdown.startsWith("---")) {
    const end = markdown.indexOf("\n---", 3);
    if (end > 0) {
      const frontmatter = markdown.slice(0, end);
      if (/^draft:\s*(true|false)\s*$/m.test(frontmatter)) {
        return markdown.replace(/^draft:\s*(true|false)\s*$/m, nextDraft);
      }
      return `${frontmatter}\n${nextDraft}${markdown.slice(end)}`;
    }
  }
  return markdown;
}

export function applyLuoguPreparedRules(
  prepared: PrepareLuoguSubmissionNoteResult,
  rules: LuoguImportRules,
): PrepareLuoguSubmissionNoteResult {
  if (prepared.skipped || prepared.aiStatus === "failed" || !prepared.markdown.trim() || !prepared.suggestedRelativePath.trim()) return prepared;
  return {
    ...prepared,
    suggestedRelativePath: rewriteLuoguPreparedRelativePath(prepared.suggestedRelativePath, rules),
    markdown: setMarkdownDraftValue(prepared.markdown, rules.defaultDraftStatus === "draft"),
  };
}
