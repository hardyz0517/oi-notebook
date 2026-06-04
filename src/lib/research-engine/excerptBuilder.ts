import type {
  ExcerptBuildInput,
  ExcerptBuildResult,
  ExcerptBudget,
  ExcerptWarning,
  SelectedPassage,
} from "./readerTypes";

const DEFAULT_BUDGET: ExcerptBudget = { maxChars: 1800, maxBlocks: 8, reserveForMetadata: 220 };

const headingLevel = (passage: SelectedPassage): number => {
  const depth = passage.headingPath?.length ?? 1;
  return Math.min(6, Math.max(1, depth));
};

const renderPassage = (passage: SelectedPassage): string => {
  const text = passage.includedText.trim();
  if (!text) return "";
  const context = passage.block.type !== "heading" && passage.headingPath?.length
    ? `Context: ${passage.headingPath.join(" > ")}\n\n`
    : "";
  if (passage.block.type === "heading") return `${"#".repeat(headingLevel(passage))} ${text}`;
  if (passage.block.type === "code") {
    const language = typeof passage.block.language === "string" && !["zh", "en", "mixed"].includes(passage.block.language) ? passage.block.language : "";
    return `${context}\`\`\`${language}\n${text}\n\`\`\``;
  }
  if (passage.block.type === "math") {
    if (text.trimStart().startsWith("$$") && text.trimEnd().endsWith("$$")) return `${context}${text}`;
    return `${context}$$\n${text}\n$$`;
  }
  if (passage.block.type === "quote") return `${context}${text.split(/\r?\n/).map((line) => `> ${line}`).join("\n")}`;
  if (passage.block.type === "metadata") return `_${text}_`;
  return `${context}${text}`;
};

const addWarning = (warnings: Set<ExcerptWarning>, warning: ExcerptWarning | "low_relevance" | "budget_exceeded"): void => {
  if (warning !== "low_relevance" && warning !== "budget_exceeded") warnings.add(warning);
};

export const buildExcerpt = (input: ExcerptBuildInput): ExcerptBuildResult => {
  const budget = { ...DEFAULT_BUDGET, ...input.budget };
  const warnings = new Set<ExcerptWarning>([...input.selection.warnings, ...input.quality.warnings]);
  const document = input.readerResult.document;
  const metadataLines = document
    ? [
        `# ${document.metadata.title}`,
        `Source: ${document.metadata.canonicalUrl}`,
        document.metadata.publishedAt ? `Published: ${document.metadata.publishedAt}` : "",
        `Reliability: ${document.metadata.reliability}`,
      ].filter(Boolean)
    : [`# ${input.readerResult.candidate.title}`, `Source: ${input.readerResult.candidate.url}`];

  for (const item of input.selection.omitted) addWarning(warnings, item.reason);
  if (!input.quality.canSupportAnswer) warnings.add(input.readerResult.status === "needs_js" ? "needs_js" : "blocked_or_unreadable");

  const rendered: string[] = [];
  let used = metadataLines.join("\n").length + 2;
  for (const passage of input.selection.selectedPassages.slice(0, budget.maxBlocks ?? Number.POSITIVE_INFINITY)) {
    const markdown = renderPassage(passage);
    const nextLength = used + markdown.length + 2;
    if (nextLength > budget.maxChars) {
      addWarning(warnings, passage.block.type === "code" ? "omitted_large_code_block" : passage.block.type === "math" ? "omitted_large_math_block" : "budget_exceeded");
      continue;
    }
    rendered.push(markdown);
    used = nextLength;
  }

  const excerptMarkdown = [...metadataLines, ...rendered].join("\n\n").trim();
  const hasTruncatedCodeBlock = input.selection.selectedPassages.some((passage) => passage.block.type === "code" && passage.truncated);
  const hasTruncatedMathBlock = input.selection.selectedPassages.some((passage) => passage.block.type === "math" && passage.truncated);

  return {
    excerptMarkdown,
    selectedPassages: input.selection.selectedPassages,
    omittedBlockCount: input.selection.omitted.length,
    warnings: Array.from(warnings),
    budgetUsed: excerptMarkdown.length,
    hasTruncatedCodeBlock,
    hasTruncatedMathBlock,
  };
};
