import { describe, expect, it } from "vitest";

import type { PreviewLuoguSubmission } from "@/lib/api";
import { DEFAULT_LUOGU_IMPORT_RULES, type LuoguImportRules } from "./luoguImportRules";
import { getLuoguSubmissionCandidateReason } from "./luoguImportDomain";

function submission(overrides: Partial<PreviewLuoguSubmission>): PreviewLuoguSubmission {
  return {
    submissionId: "100",
    problemId: "P1000",
    problemTitle: "A+B Problem",
    difficulty: "",
    status: "12",
    isAc: true,
    submitTime: "2026-01-01 12:00:00",
    statusLabel: "candidate",
    ...overrides,
  };
}

function rules(overrides: Partial<LuoguImportRules> = {}): LuoguImportRules {
  return {
    ...DEFAULT_LUOGU_IMPORT_RULES,
    ...overrides,
  };
}

describe("getLuoguSubmissionCandidateReason", () => {
  it("classifies imported submissions by imported policy", () => {
    const item = submission({ submissionId: "100" });
    const submissions = [item];

    expect(getLuoguSubmissionCandidateReason(item, submissions, rules({ importedProblemPolicy: "skip" }), 100, new Set())).toBe("imported");
    expect(getLuoguSubmissionCandidateReason(item, submissions, rules({ importedProblemPolicy: "showUnselected" }), 100, new Set())).toBe("importedShowUnselected");
    expect(getLuoguSubmissionCandidateReason(item, submissions, rules({ importedProblemPolicy: "regenerate" }), 100, new Set())).toBe("importedRegenerate");
  });

  it("classifies non-AC submissions before candidate selection", () => {
    const item = submission({ isAc: false, statusLabel: "non-AC" });
    const submissions = [item];

    expect(getLuoguSubmissionCandidateReason(item, submissions, rules({ requireAc: true }), null, new Set())).toBe("nonAcRequired");
    expect(getLuoguSubmissionCandidateReason(item, submissions, rules({ requireAc: false, submitFilter: "includeNonAc" }), null, new Set())).toBe("nonAcOptional");
  });

  it("classifies older AC submissions for the same problem without reading UI labels", () => {
    const oldAc = submission({ submissionId: "100", problemId: "P1000", statusLabel: "anything" });
    const latestAc = submission({ submissionId: "101", problemId: "P1000", statusLabel: "anything else" });
    const submissions = [oldAc, latestAc];

    expect(getLuoguSubmissionCandidateReason(oldAc, submissions, rules({ sameProblemStrategy: "latestAc" }), null, new Set())).toBe("sameProblemOldAcSkipped");
    expect(getLuoguSubmissionCandidateReason(oldAc, submissions, rules({ sameProblemStrategy: "manual" }), null, new Set())).toBe("sameProblemOldAcManual");
  });
});
