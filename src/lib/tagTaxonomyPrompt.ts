import {
  buildAiTagRecommendationCandidates,
  type AiTagRecommendationCandidate,
  type TagSuggestion,
  type UserTagTaxonomyConfig,
} from "@/lib/tagTaxonomy";

export const TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT = 30;

const TAG_CONTEXT_CONTENT_CHAR_LIMIT = 4000;
const TAG_ALIAS_DISPLAY_LIMIT = 4;

export interface TagTaxonomyPromptInput {
  title?: string | null;
  notePath?: string | null;
  summary?: string | null;
  content?: string | null;
  existingTags?: string[];
  limit?: number;
  userConfig?: UserTagTaxonomyConfig | null;
}

export interface TagTaxonomyPromptContext {
  text: string;
  suggestions: TagSuggestion[];
}

export interface TagTaxonomyPromptSelfCheckResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    expected: string | number | boolean;
    actual: string | number | boolean;
  }>;
}

function normalizePromptTag(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function truncatePromptContent(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (text.length <= TAG_CONTEXT_CONTENT_CHAR_LIMIT) {
    return text;
  }
  return text.slice(0, TAG_CONTEXT_CONTENT_CHAR_LIMIT);
}

function formatTagCandidate(candidate: AiTagRecommendationCandidate) {
  const aliases = candidate.aliases
    .map(normalizePromptTag)
    .filter(Boolean)
    .filter((alias) => alias !== candidate.name && alias !== candidate.pathText)
    .slice(0, TAG_ALIAS_DISPLAY_LIMIT);

  if (aliases.length === 0) {
    return `- ${candidate.pathText}`;
  }

  return `- ${candidate.pathText}（别名：${aliases.join(", ")}）`;
}

export function buildTagTaxonomyPromptContext(input: TagTaxonomyPromptInput): TagTaxonomyPromptContext {
  const limit = Math.max(1, Math.min(input.limit ?? TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT, TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT));
  const candidates = buildAiTagRecommendationCandidates(
    {
      title: input.title,
      notePath: input.notePath,
      summary: input.summary,
      content: truncatePromptContent(input.content),
      existingTags: input.existingTags ?? [],
    },
    {
      limit,
      aliasLimit: TAG_ALIAS_DISPLAY_LIMIT,
      contentCharLimit: TAG_CONTEXT_CONTENT_CHAR_LIMIT,
      userConfig: input.userConfig,
    },
  );
  const candidateText = candidates.length > 0
    ? [
        "可选标签候选（输出 tags 时只能使用下面的 canonical path；别名只作为理解线索）：",
        ...candidates.map(formatTagCandidate),
      ].join("\n")
    : "当前笔记没有命中明确的可见标签候选；不要为了凑数编造自由标签。";

  return {
    suggestions: candidates.map((candidate) => ({
      id: candidate.id,
      path: candidate.pathText.split("/"),
      pathText: candidate.pathText,
      name: candidate.name,
      aliases: candidate.aliases,
      searchText: [candidate.id, candidate.pathText, candidate.name, ...candidate.aliases].join(" "),
      source: candidate.source,
      hidden: false,
      deprecated: false,
    })),
    text: [
      "标签体系规则：",
      "- tags 表示知识点、训练用途、来源、阶段、项目等维度。",
      "- tags 优先使用当前候选中的 taxonomy canonical path，尽量使用路径式标签。",
      "- hidden 标签、deprecated 标签、merge source 不应直接输出。",
      "- 如果理解到别名或 merge source，只输出对应 canonical target。",
      "- 不要输出不存在于候选中的自由标签。",
      candidateText,
    ].join("\n"),
  };
}

function addSelfCheck(
  checks: TagTaxonomyPromptSelfCheckResult["checks"],
  name: string,
  actual: string | number | boolean,
  expected: string | number | boolean,
) {
  checks.push({
    name,
    actual,
    expected,
    passed: actual === expected,
  });
}

function hasSuggestion(context: TagTaxonomyPromptContext, pathText: string) {
  return context.suggestions.some((suggestion) => suggestion.pathText === pathText);
}

function getDisplayedAliasCount(text: string, pathText: string) {
  const line = text.split("\n").find((item) => item.startsWith(`- ${pathText}（别名：`));
  if (!line) {
    return 0;
  }

  const match = line.match(/（别名：(.+)）/);
  if (!match) {
    return 0;
  }

  return match[1].split(",").filter(Boolean).length;
}

export function runTagTaxonomyPromptSelfCheck(): TagTaxonomyPromptSelfCheckResult {
  const checks: TagTaxonomyPromptSelfCheckResult["checks"] = [];
  const zFunctionPath = "算法/字符串/Z 函数";
  const liChaoPath = "算法/树形数据结构/李超线段树";
  const kmpContext = buildTagTaxonomyPromptContext({ title: "拓展 KMP 模板" });
  const liChaoContext = buildTagTaxonomyPromptContext({ content: "李超树维护直线最值" });
  const emptyContext = buildTagTaxonomyPromptContext({});
  const userContext = buildTagTaxonomyPromptContext({
    title: "自定义后缀自动机",
    userConfig: {
      entries: [{
        id: "user.prompt.selfcheck",
        path: ["自定义标签", "字符串", "自定义后缀自动机"],
        source: "user",
      }],
    },
  });
  const filteredContext = buildTagTaxonomyPromptContext({
    title: "KMP Z 函数",
    userConfig: {
      hiddenIds: ["algorithm.string.z-function"],
      merges: {
        "algorithm.string.kmp": "algorithm.string.z-function",
      },
    },
  });
  const mergedContext = buildTagTaxonomyPromptContext({
    title: "KMP",
    userConfig: {
      merges: {
        "algorithm.string.kmp": "algorithm.string.z-function",
      },
    },
  });

  addSelfCheck(checks, "title 拓展 KMP includes Z 函数 candidate", hasSuggestion(kmpContext, zFunctionPath), true);
  addSelfCheck(checks, "content 李超树 includes 李超线段树 candidate", hasSuggestion(liChaoContext, liChaoPath), true);
  addSelfCheck(checks, "candidate count does not exceed limit", kmpContext.suggestions.length <= TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT, true);
  addSelfCheck(checks, "displayed aliases do not exceed limit", getDisplayedAliasCount(kmpContext.text, zFunctionPath) <= TAG_ALIAS_DISPLAY_LIMIT, true);
  addSelfCheck(checks, "empty input has no candidates", emptyContext.suggestions.length, 0);
  addSelfCheck(checks, "empty input still returns rules", emptyContext.text.includes("标签体系规则"), true);
  addSelfCheck(checks, "user custom candidate can appear in prompt context", hasSuggestion(userContext, "自定义标签/字符串/自定义后缀自动机"), true);
  addSelfCheck(checks, "hidden target stays out of prompt context", hasSuggestion(filteredContext, zFunctionPath), false);
  addSelfCheck(checks, "merged source leads prompt context to target", hasSuggestion(mergedContext, zFunctionPath), true);
  addSelfCheck(checks, "deprecated merge source stays out of prompt context", hasSuggestion(mergedContext, "算法/字符串/KMP"), false);
  addSelfCheck(
    checks,
    "prompt text has no unsafe placeholder artifacts",
    /undefined|null|\[object Object\]/.test([kmpContext.text, liChaoContext.text, emptyContext.text].join("\n")),
    false,
  );

  return {
    checks,
    passed: checks.every((check) => check.passed),
  };
}
