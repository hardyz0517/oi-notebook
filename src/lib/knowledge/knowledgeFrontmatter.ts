import type {
  KnowledgeAssetFrontmatter,
  KnowledgeAssetType,
  ReviewMastery,
  ReviewPriority,
} from "./knowledgeTypes";

const ASSET_TYPES = new Set<KnowledgeAssetType>(["fragment", "collection", "article", "legacy-note"]);
const PRIORITIES = new Set<ReviewPriority>(["low", "medium", "high", "none"]);
const MASTERY_VALUES = new Set<ReviewMastery>(["new", "learning", "familiar", "mastered"]);
const SOURCES = new Set<KnowledgeAssetFrontmatter["source"]>(["luogu", "manual", "import", "unknown"]);
const CREATED_FROM = new Set<KnowledgeAssetFrontmatter["createdFrom"]>([
  "training-center",
  "manual",
  "luogu-import-legacy",
  "unknown",
]);
const STATUSES = new Set<KnowledgeAssetFrontmatter["status"]>(["draft", "active", "archived"]);

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function normalizeType(value: unknown): KnowledgeAssetType {
  return typeof value === "string" && ASSET_TYPES.has(value as KnowledgeAssetType)
    ? (value as KnowledgeAssetType)
    : "legacy-note";
}

function normalizePriority(value: unknown): ReviewPriority {
  return typeof value === "string" && PRIORITIES.has(value as ReviewPriority)
    ? (value as ReviewPriority)
    : "medium";
}

function normalizeMastery(value: unknown): ReviewMastery {
  if (typeof value !== "string") return "new";
  if (MASTERY_VALUES.has(value as ReviewMastery)) return value as ReviewMastery;
  if (value === "unknown") return "new";
  if (value === "stable") return "familiar";
  if (value === "needs-review") return "learning";
  return "new";
}

function normalizeSource(value: unknown): KnowledgeAssetFrontmatter["source"] {
  return typeof value === "string" && SOURCES.has(value as KnowledgeAssetFrontmatter["source"])
    ? (value as KnowledgeAssetFrontmatter["source"])
    : "unknown";
}

function normalizeCreatedFrom(value: unknown): KnowledgeAssetFrontmatter["createdFrom"] {
  return typeof value === "string" && CREATED_FROM.has(value as KnowledgeAssetFrontmatter["createdFrom"])
    ? (value as KnowledgeAssetFrontmatter["createdFrom"])
    : "unknown";
}

function normalizeStatus(value: unknown): KnowledgeAssetFrontmatter["status"] {
  return typeof value === "string" && STATUSES.has(value as KnowledgeAssetFrontmatter["status"])
    ? (value as KnowledgeAssetFrontmatter["status"])
    : "active";
}

export function normalizeKnowledgeFrontmatter(input: Record<string, unknown>): KnowledgeAssetFrontmatter {
  const title = stringValue(input.title);
  const date = stringValue(input.date);
  const topics = stringList(input.topics);
  const relatedProblems = stringList(input.related_problems ?? input.relatedProblems);
  const createdFrom = normalizeCreatedFrom(input.created_from ?? input.createdFrom);

  return {
    type: normalizeType(input.type),
    kind: stringValue(input.kind) || "legacy-note",
    title,
    date,
    topics,
    relatedProblems,
    source: normalizeSource(input.source),
    createdFrom,
    reviewPriority: normalizePriority(input.review_priority ?? input.reviewPriority),
    mastery: normalizeMastery(input.mastery ?? input.mastery_status ?? input.masteryStatus),
    status: normalizeStatus(input.status),
  };
}
