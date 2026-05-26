import type { NoteChatContextPayload, NoteTagSuggestion } from "@/lib/api";
import {
  buildTagTaxonomyPromptContext,
  TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT,
} from "@/lib/tagTaxonomyPrompt";
import {
  buildAiTagRecommendationCandidates,
  parseAiTagRecommendationJson,
  postprocessAiTagRecommendations,
  type AiTagRecommendationCandidate,
  type AiTagRecommendationIgnored,
  type AiTagRecommendationRawSuggestion,
  type AiTagRecommendationSuggestion,
  type UserTagTaxonomyConfig,
} from "@/lib/tagTaxonomy";

export type RawAiTagSuggestion = AiTagRecommendationRawSuggestion;
export type AiTagRecommendation = AiTagRecommendationSuggestion;
export type AiTagRecommendationIgnoredReason = AiTagRecommendationIgnored["reason"];

export interface AiTagRecommendationInput {
  title?: string | null;
  notePath?: string | null;
  summary?: string | null;
  body?: string | null;
  existingTags?: string[];
  userConfig?: UserTagTaxonomyConfig | null;
  candidateLimit?: number;
  bodyCharLimit?: number;
}

export interface BuiltAiTagRecommendationInput {
  title: string;
  notePath: string;
  summary: string;
  bodyExcerpt: string;
  bodyTruncated: boolean;
  existingTags: string[];
  candidates: AiTagRecommendationCandidate[];
  tagTaxonomyContext: string;
}

export interface AiTagRecommendationResult {
  notePath: string;
  existingTags: string[];
  suggestedTags: string[];
  suggestions: AiTagRecommendation[];
  selectedTags: string[];
  ignoredCount: number;
  reason?: string;
}

export interface AiTagRecommendationSelfCheckResult {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    expected: string | number | boolean | null;
    actual: string | number | boolean | null;
  }>;
}

const DEFAULT_BODY_CHAR_LIMIT = 4000;
const DEFAULT_SELECTED_CONFIDENCE_THRESHOLD = 0.65;

export const normalizeAiTagValue = (tag: string): string => tag.trim().replace(/\s+/g, " ");

export const normalizeAiTags = (tags: string[]): string[] => {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const value = normalizeAiTagValue(tag);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
};

function truncateBodyExcerpt(body: string, limit: number) {
  const normalizedLimit = Math.max(500, Math.min(limit, 12000));
  const text = body.trim();
  return {
    text: text.length > normalizedLimit ? text.slice(0, normalizedLimit) : text,
    truncated: text.length > normalizedLimit,
  };
}

export function buildAiTagRecommendationInput(input: AiTagRecommendationInput): BuiltAiTagRecommendationInput {
  const body = input.body ?? "";
  const bodyExcerpt = truncateBodyExcerpt(body, input.bodyCharLimit ?? DEFAULT_BODY_CHAR_LIMIT);
  const existingTags = normalizeAiTags(input.existingTags ?? []);
  const limit = Math.max(1, Math.min(input.candidateLimit ?? TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT, TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT));
  const promptContext = buildTagTaxonomyPromptContext({
    title: input.title,
    notePath: input.notePath,
    summary: input.summary,
    content: bodyExcerpt.text,
    existingTags,
    limit,
    userConfig: input.userConfig,
  });
  const candidates = buildAiTagRecommendationCandidates(
    {
      title: input.title,
      notePath: input.notePath,
      summary: input.summary,
      content: bodyExcerpt.text,
      existingTags,
    },
    {
      limit,
      contentCharLimit: DEFAULT_BODY_CHAR_LIMIT,
      userConfig: input.userConfig,
    },
  );

  return {
    title: normalizeAiTagValue(input.title ?? ""),
    notePath: normalizeAiTagValue(input.notePath ?? ""),
    summary: normalizeAiTagValue(input.summary ?? ""),
    bodyExcerpt: bodyExcerpt.text,
    bodyTruncated: bodyExcerpt.truncated,
    existingTags,
    candidates,
    tagTaxonomyContext: promptContext.text,
  };
}

export function parseAiTagRecommendationResponse(content: string) {
  return parseAiTagRecommendationJson(content);
}

export function normalizeAiTagRecommendationItems(
  rawSuggestions: RawAiTagSuggestion[],
  input: AiTagRecommendationInput,
) {
  const recommendationInput = buildAiTagRecommendationInput(input);
  return postprocessAiTagRecommendations(rawSuggestions, {
    candidates: recommendationInput.candidates,
    existingTags: recommendationInput.existingTags,
    userConfig: input.userConfig,
  });
}

export function buildAiTagSuggestionMessagePayload(
  response: NoteTagSuggestion,
  context: NoteChatContextPayload,
  userConfig?: UserTagTaxonomyConfig | null,
): AiTagRecommendationResult {
  const rawSuggestions = response.suggestions?.length
    ? response.suggestions
    : response.suggestedTags.map((tag) => ({ tag }));
  const processed = normalizeAiTagRecommendationItems(rawSuggestions, {
    title: context.noteTitle,
    notePath: context.notePath,
    summary: context.summary,
    body: context.markdown,
    existingTags: context.tags,
    userConfig,
  });
  const suggestedTags = processed.suggestions.map((item) => item.tag);
  const selectedTags = processed.suggestions
    .filter((item) => item.confidence >= DEFAULT_SELECTED_CONFIDENCE_THRESHOLD)
    .map((item) => item.tag);

  return {
    notePath: context.notePath,
    existingTags: normalizeAiTags(context.tags),
    suggestedTags,
    suggestions: processed.suggestions,
    selectedTags,
    ignoredCount: processed.ignored.length + (response.ignored?.length ?? 0),
    reason: response.reason?.trim() || undefined,
  };
}

export function createAiTagRecommendationFailureMessage(error: unknown): string {
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
  if (normalized.includes("suggestions") || normalized.includes("suggestedTags")) return "标签建议格式不正确，请重试。";
  if (normalized.includes("HTTP ")) return "AI 服务返回错误响应，请检查配置后重试。";
  if (normalized) return normalized;
  return "标签建议生成失败，请重试。";
}

function addSelfCheck(
  checks: AiTagRecommendationSelfCheckResult["checks"],
  name: string,
  actual: string | number | boolean | null,
  expected: string | number | boolean | null,
) {
  checks.push({
    name,
    actual,
    expected,
    passed: actual === expected,
  });
}

export function runAiTagRecommendationSelfCheck(): AiTagRecommendationSelfCheckResult {
  const checks: AiTagRecommendationSelfCheckResult["checks"] = [];
  const zFunctionPath = "算法/字符串/Z 函数";
  const longText = "过长说明".repeat(80);
  const mergeConfig: UserTagTaxonomyConfig = {
    merges: {
      "algorithm.string.kmp": "algorithm.string.z-function",
    },
  };
  const aliasToMergeConfig: UserTagTaxonomyConfig = {
    aliases: {
      "旧 KMP 入口": "algorithm.string.kmp",
    },
    merges: {
      "algorithm.string.kmp": "algorithm.string.z-function",
    },
  };
  const hiddenConfig: UserTagTaxonomyConfig = {
    hiddenIds: ["algorithm.string.z-function"],
  };
  const deprecatedConfig: UserTagTaxonomyConfig = {
    entries: [{
      id: "user.ai.deprecated",
      path: ["自定义标签", "废弃", "旧入口"],
      deprecated: true,
      source: "user",
    }],
  };
  const userConfig: UserTagTaxonomyConfig = {
    entries: [{
      id: "user.ai.custom",
      path: ["自定义标签", "字符串", "自定义模式匹配"],
      aliases: ["自定义匹配入口"],
      source: "user",
    }],
  };

  const pureJson = parseAiTagRecommendationResponse("{\"suggestions\":[{\"tag\":\"exKMP\",\"confidence\":0.8}]}");
  const fencedJson = parseAiTagRecommendationResponse("```json\n{\"suggestions\":[{\"tag\":\"exKMP\"}]}\n```");
  const embeddedJson = parseAiTagRecommendationResponse("解释 {\"suggestions\":[{\"tag\":\"exKMP\"}]} 结束");
  const invalidJson = parseAiTagRecommendationResponse("not json");
  const nonArrayJson = parseAiTagRecommendationResponse("{\"suggestions\":\"exKMP\"}");
  const missingTagJson = parseAiTagRecommendationResponse("{\"suggestions\":[{\"confidence\":0.7},{\"tag\":\"exKMP\"}]}");
  const clampAndTruncate = parseAiTagRecommendationResponse(JSON.stringify({
    suggestions: [
      { tag: "exKMP", confidence: -0.5, reason: longText, evidence: longText },
      { tag: zFunctionPath, confidence: 1.5, reason: longText, evidence: longText },
    ],
  }));
  const aliasResult = normalizeAiTagRecommendationItems([{ tag: "exKMP", confidence: 0.8 }], { title: "exKMP", body: "Z 函数" });
  const mergeResult = normalizeAiTagRecommendationItems([{ tag: "KMP", confidence: 0.8 }], { title: "KMP", body: "KMP", userConfig: mergeConfig });
  const aliasToMergeResult = normalizeAiTagRecommendationItems([{ tag: "旧 KMP 入口", confidence: 0.8 }], { title: "KMP", body: "KMP", userConfig: aliasToMergeConfig });
  const hiddenResult = normalizeAiTagRecommendationItems([{ tag: zFunctionPath, confidence: 0.8 }], { title: "exKMP", body: "Z 函数", userConfig: hiddenConfig });
  const deprecatedResult = normalizeAiTagRecommendationItems([{ tag: "自定义标签/废弃/旧入口", confidence: 0.8 }], { title: "旧入口", body: "旧入口", userConfig: deprecatedConfig });
  const unknownResult = normalizeAiTagRecommendationItems([{ tag: "不存在的自由标签", confidence: 0.8 }], { title: "exKMP", body: "Z 函数" });
  const existingAliasResult = normalizeAiTagRecommendationItems([{ tag: zFunctionPath, confidence: 0.8 }], { title: "exKMP", body: "Z 函数", existingTags: ["exKMP"] });
  const duplicateResult = normalizeAiTagRecommendationItems(
    [{ tag: "exKMP", confidence: 0.4 }, { tag: zFunctionPath, confidence: 0.9 }],
    { title: "exKMP", body: "Z 函数" },
  );
  const userResult = normalizeAiTagRecommendationItems(
    [{ tag: "自定义标签/字符串/自定义模式匹配", confidence: 0.8 }],
    { title: "自定义匹配入口", body: "自定义匹配入口", userConfig },
  );
  const recommendationInput = buildAiTagRecommendationInput({ title: "exKMP", body: "Z 函数".repeat(2000) });

  addSelfCheck(checks, "pure JSON parses", pureJson.suggestions[0]?.tag ?? null, "exKMP");
  addSelfCheck(checks, "code fence JSON parses", fencedJson.suggestions[0]?.tag ?? null, "exKMP");
  addSelfCheck(checks, "embedded JSON parses", embeddedJson.suggestions[0]?.tag ?? null, "exKMP");
  addSelfCheck(checks, "non JSON fails", invalidJson.error ?? null, "invalid_json");
  addSelfCheck(checks, "suggestions non array fails", nonArrayJson.error ?? null, "invalid_json");
  addSelfCheck(checks, "missing tag item is ignored", missingTagJson.ignored[0]?.reason ?? null, "missing_tag");
  addSelfCheck(checks, "confidence below zero is clamped", clampAndTruncate.suggestions[0]?.confidence ?? null, 0);
  addSelfCheck(checks, "confidence above one is clamped", clampAndTruncate.suggestions[1]?.confidence ?? null, 1);
  addSelfCheck(checks, "reason is truncated before UI", (clampAndTruncate.suggestions[0]?.reason?.length ?? 0) <= 93, true);
  addSelfCheck(checks, "evidence is truncated before UI", (clampAndTruncate.suggestions[0]?.evidence?.length ?? 0) <= 123, true);
  addSelfCheck(checks, "alias normalizes to canonical", aliasResult.suggestions[0]?.tag ?? null, zFunctionPath);
  addSelfCheck(checks, "merge source normalizes to target", mergeResult.suggestions[0]?.tag ?? null, zFunctionPath);
  addSelfCheck(checks, "alias to merge source normalizes to target", aliasToMergeResult.suggestions[0]?.tag ?? null, zFunctionPath);
  addSelfCheck(checks, "hidden output is dropped", hiddenResult.ignored[0]?.reason ?? null, "hidden");
  addSelfCheck(checks, "deprecated output is dropped", deprecatedResult.ignored[0]?.reason ?? null, "deprecated");
  addSelfCheck(checks, "unknown free-form output is dropped", unknownResult.ignored[0]?.reason ?? null, "unknown_tag");
  addSelfCheck(checks, "existing alias deduplicates canonical", existingAliasResult.ignored[0]?.reason ?? null, "duplicate_existing");
  addSelfCheck(checks, "duplicate target keeps higher confidence", duplicateResult.suggestions[0]?.confidence ?? null, 0.9);
  addSelfCheck(checks, "user custom tag can pass", userResult.suggestions[0]?.tag ?? null, "自定义标签/字符串/自定义模式匹配");
  addSelfCheck(checks, "candidate count is capped", recommendationInput.candidates.length <= TAG_TAXONOMY_PROMPT_SUGGESTION_LIMIT, true);
  addSelfCheck(checks, "prompt context does not include full taxonomy", recommendationInput.tagTaxonomyContext.includes("快速傅里叶变换 FFT"), false);

  return {
    passed: checks.every((check) => check.passed),
    checks,
  };
}
