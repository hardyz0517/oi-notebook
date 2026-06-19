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
