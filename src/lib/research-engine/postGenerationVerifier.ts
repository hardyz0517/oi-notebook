import type {
  PostGenerationVerificationInput,
  PostGenerationVerificationResult,
  PostGenerationViolation,
} from "./evidenceTypes";

const normalize = (text: string): string => text.toLowerCase();

const citationIds = (text: string): string[] => {
  const ids = new Set<string>();
  const patterns = [
    /\[\[(E\d+)\]\]/gi,
    /\[(E\d+)\]/gi,
    /(?:source|evidence|citation|cite|\u6765\u6e90|\u8bc1\u636e|\u5f15\u7528)\s*:?\s*(?<id>E\d+)(?=$|[\s.,;:\uff0c\u3002\uff1b\uff1a])/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const id = (match.groups?.id ?? match[1])?.toUpperCase();
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
};

const strongAssertionPatterns = [
  "confirmed dead",
  "is dead",
  "has died",
  "death confirmed",
  "definitely dead",
  "already confirmed",
  "is guilty",
  "committed a crime",
  "\u5df2\u8bc1\u5b9e\u6b7b\u4ea1",
  "\u5df2\u7ecf\u8bc1\u5b9e\u6b7b\u4ea1",
  "\u786e\u8ba4\u6b7b\u4ea1",
  "\u786e\u5b9a\u6b7b\u4ea1",
  "\u5df2\u7ecf\u6b7b\u4ea1",
  "\u5df2\u8bc1\u5b9e\u72af\u7f6a",
  "\u786e\u8ba4\u72af\u7f6a",
  "\u786e\u5b9a\u8fdd\u6cd5",
];

export const verifyGeneratedAnswer = (input: PostGenerationVerificationInput): PostGenerationVerificationResult => {
  const text = input.generatedText;
  const lower = normalize(text);
  const citedEvidenceIds = citationIds(text);
  const allowed = new Set(input.contract.allowedEvidenceIds);
  const known = new Set(input.contract.knownEvidenceIds);
  const violations: PostGenerationViolation[] = [];
  const unknownCitationIds = citedEvidenceIds.filter((id) => !known.has(id));
  for (const id of unknownCitationIds) {
    violations.push({ kind: "unknown_citation", evidenceId: id, message: `Unknown citation ${id}.` });
  }
  for (const id of citedEvidenceIds.filter((item) => known.has(item) && !allowed.has(item))) {
    violations.push({ kind: "disallowed_citation", evidenceId: id, message: `Evidence ${id} is known but not citeable under this contract.` });
  }
  if (input.contract.mustCite && citedEvidenceIds.filter((id) => allowed.has(id)).length === 0) {
    violations.push({ kind: "missing_required_citation", message: "The answer contract requires at least one valid citation." });
  }

  const forbiddenClaimHits: string[] = [];
  for (const claim of input.contract.forbiddenClaims) {
    const hit = claim.patterns.find((pattern) => lower.includes(pattern.toLowerCase()));
    if (hit) {
      forbiddenClaimHits.push(claim.claimId);
      violations.push({ kind: "forbidden_claim", claimId: claim.claimId, message: `Forbidden claim pattern matched: ${hit}` });
    }
  }

  const strongHit = strongAssertionPatterns.find((pattern) => lower.includes(pattern));
  const highRiskUnsafeMode = input.contract.answerMode === "insufficient_evidence" || input.contract.answerMode === "refuse_current_claim";
  const uncitedStrongClaims = strongHit && highRiskUnsafeMode ? [strongHit] : [];
  if (strongHit && highRiskUnsafeMode) {
    violations.push({ kind: "unsupported_strong_claim", message: `Unsupported strong assertion matched: ${strongHit}` });
  }

  const passed = violations.length === 0;
  return {
    passed,
    violations,
    repairedByTemplate: passed ? undefined : true,
    safeFallback: passed ? undefined : input.contract.fallbackMessage,
    citedEvidenceIds,
    unknownCitationIds,
    uncitedStrongClaims,
    forbiddenClaimHits,
  };
};
