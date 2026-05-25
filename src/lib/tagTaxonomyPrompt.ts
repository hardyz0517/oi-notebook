import {
  findTagSuggestionsByQuery,
  suggestTagsFromArticleText,
  type TagSuggestion,
  type UserTagTaxonomyConfig,
} from "@/lib/tagTaxonomy";

export const TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT = 20;

const TAG_CONTEXT_CONTENT_CHAR_LIMIT = 12000;
const TAG_ALIAS_DISPLAY_LIMIT = 5;

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

function formatTagSuggestion(suggestion: TagSuggestion) {
  const aliases = suggestion.aliases
    .map(normalizePromptTag)
    .filter(Boolean)
    .filter((alias) => alias !== suggestion.name && alias !== suggestion.pathText)
    .slice(0, TAG_ALIAS_DISPLAY_LIMIT);

  if (aliases.length === 0) {
    return `- ${suggestion.pathText}`;
  }

  return `- ${suggestion.pathText}（别名：${aliases.join(", ")}）`;
}

function getQuerySeeds(input: TagTaxonomyPromptInput) {
  return [
    input.title ?? "",
    input.notePath ?? "",
    input.summary ?? "",
    ...(input.existingTags ?? []),
  ]
    .map(normalizePromptTag)
    .filter(Boolean);
}

export function buildTagTaxonomyPromptContext(input: TagTaxonomyPromptInput): TagTaxonomyPromptContext {
  const limit = Math.max(1, Math.min(input.limit ?? TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT, TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT));
  const suggestions = new Map<string, TagSuggestion>();
  const addSuggestion = (suggestion: TagSuggestion) => {
    if (suggestions.size >= limit || suggestions.has(suggestion.id)) {
      return;
    }
    suggestions.set(suggestion.id, suggestion);
  };

  for (const item of suggestTagsFromArticleText(
    {
      title: input.title,
      summary: input.summary,
      content: truncatePromptContent(input.content),
      existingTags: input.existingTags ?? [],
    },
    { includeExistingTags: true, limit, userConfig: input.userConfig },
  )) {
    addSuggestion(item.tag);
  }

  for (const seed of getQuerySeeds(input)) {
    if (suggestions.size >= limit) {
      break;
    }
    for (const suggestion of findTagSuggestionsByQuery(seed, { limit: 3, userConfig: input.userConfig })) {
      addSuggestion(suggestion);
    }
  }

  const selectedSuggestions = Array.from(suggestions.values()).slice(0, limit);
  const candidateText = selectedSuggestions.length > 0
    ? [
        "可选标签候选（输出 tags 时优先使用下面的 canonical path，不要输出别名）：",
        ...selectedSuggestions.map(formatTagSuggestion),
      ].join("\n")
    : "当前笔记没有命中明确的预设标签候选；仍需遵守规则，少量输出确定的标签，不要为了凑数编造。";

  return {
    suggestions: selectedSuggestions,
    text: [
      "标签体系规则：",
      "- category 表示文章性质，例如：题解、技巧、学习、杂谈、项目日志。",
      "- tags 表示知识点、训练用途、来源、阶段、项目等维度。",
      "- tags 优先使用预设标签体系中的 canonical path，尽量使用路径式标签。",
      "- 同义词必须归到 canonical path，例如：拓展 KMP / exKMP -> 算法/字符串/Z 函数；李超树 -> 算法/树形数据结构/李超线段树。",
      "- 如果没有合适标签，可以保留用户原 tag 或建议少量新 tag，但不要编造大量标签。",
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

  const match = line.match(/（别名：(.+)）$/);
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
