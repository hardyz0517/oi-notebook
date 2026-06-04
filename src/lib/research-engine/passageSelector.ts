import type {
  ExcerptBudget,
  ExcerptWarning,
  ExtractedContentBlock,
  PassageSelectionInput,
  PassageSelectionResult,
  SelectedPassage,
} from "./readerTypes";

const DEFAULT_BUDGET: ExcerptBudget = { maxChars: 1600, maxBlocks: 8, reserveForMetadata: 180 };
const ATOMIC_BLOCK_TYPES = new Set<ExtractedContentBlock["type"]>(["code", "math", "table"]);

const termsFromText = (text: string): string[] =>
  Array.from(new Set(text.toLowerCase().match(/[a-z0-9_#+.-]+|[\u4e00-\u9fff]{2,}/g) ?? []))
    .filter((term) => term.length >= 2);

const scoreBlock = (block: ExtractedContentBlock, terms: string[]): number => {
  const haystack = `${block.text} ${(block.headingPath ?? []).join(" ")} ${block.relevanceHint ?? ""}`.toLowerCase();
  const overlap = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
  const typeBoost = block.type === "heading" ? 2 : block.type === "metadata" ? 1.5 : ATOMIC_BLOCK_TYPES.has(block.type) ? 1 : 0;
  const hintBoost = block.relevanceHint ? 1 : 0;
  return overlap * 3 + typeBoost + hintBoost;
};

const truncateNaturalText = (text: string, maxChars: number): string | undefined => {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, Math.max(0, maxChars - 1));
  const boundary = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("\n"), slice.lastIndexOf(";"));
  if (boundary >= 120) return `${slice.slice(0, boundary + 1)}...`;
  return undefined;
};

const warningForLargeAtomic = (block: ExtractedContentBlock): ExcerptWarning | "budget_exceeded" => {
  if (block.type === "code") return "omitted_large_code_block";
  if (block.type === "math") return "omitted_large_math_block";
  return "budget_exceeded";
};

export const selectPassages = (input: PassageSelectionInput): PassageSelectionResult => {
  const budget = { ...DEFAULT_BUDGET, ...input.budget };
  const warnings = new Set<ExcerptWarning>(input.quality.warnings);
  const omitted: PassageSelectionResult["omitted"] = [];
  const selected: SelectedPassage[] = [];
  const document = input.readerResult.document;

  if (!document || !input.quality.canSupportAnswer) {
    return {
      selectedPassages: [],
      omitted,
      warnings: Array.from(warnings),
      coverage: { selectedBlockCount: 0, selectedCharCount: 0, omittedBlockCount: document?.blocks.length ?? 0, totalBlockCount: document?.blocks.length ?? 0 },
    };
  }

  const queryTerms = [
    ...termsFromText(input.request.userQuestion),
    ...input.queryPlan.focusEntities.flatMap(termsFromText),
    ...input.queryPlan.queries.flatMap((query) => termsFromText(query.query)),
  ];
  const terms = Array.from(new Set(queryTerms));
  const ranked = document.blocks
    .map((block, index) => ({ block, index, score: scoreBlock(block, terms) }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));
  const reserve = budget.reserveForMetadata ?? 0;
  const maxContentChars = Math.max(0, budget.maxChars - reserve);
  let used = 0;

  for (const item of ranked) {
    if (selected.length >= (budget.maxBlocks ?? Number.POSITIVE_INFINITY)) {
      omitted.push({ blockId: item.block.id, blockType: item.block.type, reason: "budget_exceeded" });
      continue;
    }
    if (item.score <= 0 && item.block.type !== "heading" && item.block.type !== "metadata") {
      omitted.push({ blockId: item.block.id, blockType: item.block.type, reason: "low_relevance" });
      continue;
    }
    const remaining = maxContentChars - used;
    if (remaining <= 0) {
      omitted.push({ blockId: item.block.id, blockType: item.block.type, reason: "budget_exceeded" });
      continue;
    }
    if (ATOMIC_BLOCK_TYPES.has(item.block.type)) {
      if (item.block.charLength > remaining) {
        const reason = warningForLargeAtomic(item.block);
        if (reason !== "budget_exceeded") warnings.add(reason);
        omitted.push({ blockId: item.block.id, blockType: item.block.type, reason });
        continue;
      }
      selected.push({ block: item.block, score: item.score, reason: "lexical_or_structural_match", includedText: item.block.text, truncated: false, headingPath: item.block.headingPath });
      used += item.block.charLength;
      continue;
    }
    if (item.block.charLength > remaining && ["paragraph", "list", "quote"].includes(item.block.type)) {
      const includedText = truncateNaturalText(item.block.text, remaining);
      if (!includedText) {
        omitted.push({ blockId: item.block.id, blockType: item.block.type, reason: "budget_exceeded" });
        continue;
      }
      warnings.add("truncated_paragraph");
      selected.push({ block: item.block, score: item.score, reason: "truncated_natural_text_to_budget", includedText, truncated: true, headingPath: item.block.headingPath });
      used += includedText.length;
      continue;
    }
    if (item.block.charLength > remaining) {
      omitted.push({ blockId: item.block.id, blockType: item.block.type, reason: "budget_exceeded" });
      continue;
    }
    selected.push({ block: item.block, score: item.score, reason: "lexical_or_structural_match", includedText: item.block.text, truncated: false, headingPath: item.block.headingPath });
    used += item.block.charLength;
  }

  selected.sort((a, b) => document.blocks.findIndex((block) => block.id === a.block.id) - document.blocks.findIndex((block) => block.id === b.block.id));

  return {
    selectedPassages: selected,
    omitted,
    warnings: Array.from(warnings),
    coverage: {
      selectedBlockCount: selected.length,
      selectedCharCount: used,
      omittedBlockCount: omitted.length,
      totalBlockCount: document.blocks.length,
    },
  };
};
