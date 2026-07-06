import { describe, expect, it } from "vitest";

import type { OiSkillPermissionRequest } from "@/lib/oi-skills";
import type { EvidenceStoreRecord } from "@/lib/research-engine";
import { createOiSkillPreviewReadModel } from "./oiSkillPreviewAdapter";

const createEvidenceRecord = (
  overrides: Partial<EvidenceStoreRecord["packet"]["evidenceItems"][number]> = {},
): EvidenceStoreRecord => ({
  packetId: "packet:P3379",
  scope: "workspace",
  savedAt: 0,
  packet: {
    packetId: "packet:P3379",
    request: {} as EvidenceStoreRecord["packet"]["request"],
    policy: {} as EvidenceStoreRecord["packet"]["policy"],
    queryPlan: {} as EvidenceStoreRecord["packet"]["queryPlan"],
    evidenceItems: [{
      evidenceId: "E1",
      candidateId: "C1",
      url: "https://www.luogu.com.cn/problem/P3379",
      title: "Luogu P3379",
      host: "www.luogu.com.cn",
      sourceType: "official",
      reliability: "high",
      excerptMarkdown: "Lowest common ancestor statement excerpt.",
      readerQuality: "strong",
      evidenceStrength: "strong",
      relation: "supports",
      claimType: "oi_algorithm",
      warnings: [],
      canCite: true,
      canSupportStrongClaim: true,
      status: "usable",
      ...overrides,
    }],
    conflicts: [],
    status: "ready",
    evidenceSummary: {
      strongCount: 1,
      mediumCount: 0,
      weakCount: 0,
      noneCount: 0,
      supportsCount: 1,
      refutesCount: 0,
      conflictCount: 0,
      reliableSourceCount: 1,
      citeableCount: 1,
    },
    allowedClaims: [],
    forbiddenClaims: [],
    missingEvidenceReasons: [],
    citationMap: {},
  },
});

const permissionRequests: OiSkillPermissionRequest[] = [{
  id: "tavily_search:prompt-required",
  toolName: "tavily_search",
  permission: "public-network",
  status: "pending",
  reason: "public_network_requires_user_permission",
}];

describe("createOiSkillPreviewReadModel", () => {
  it("returns degraded read model without a solution outline when evidence is missing", () => {
    const model = createOiSkillPreviewReadModel({
      problem: { title: "Unknown", problemId: "manual" },
      evidenceRecords: [],
      permissionRequests,
    });

    expect(model.status).toBe("degraded");
    expect(model.solutionOutline).toBeNull();
    expect(model.limitations).toContain("no_evidence");
    expect(model.permissionRequests).toBe(permissionRequests);
  });

  it("maps citeable evidence into a deterministic research-problem preview read model", () => {
    const model = createOiSkillPreviewReadModel({
      problem: {
        title: "LCA",
        problemId: "P3379",
        problemUrl: "https://www.luogu.com.cn/problem/P3379",
      },
      evidenceRecords: [createEvidenceRecord()],
      permissionRequests,
    });

    expect(model.status).toBe("completed");
    expect(model.invocation.skillId).toBe("research-problem");
    expect(model.problemRef.platform).toBe("luogu");
    expect(model.sources[0]).toMatchObject({
      role: "problem-statement",
      title: "Luogu P3379",
      url: "https://www.luogu.com.cn/problem/P3379",
    });
    expect(model.evidence[0]).toMatchObject({
      citationId: "E1",
      excerpt: "Lowest common ancestor statement excerpt.",
    });
    expect(model.solutionOutline?.status).toBe("preview");
    expect(model.solutionOutline?.citationIds).toEqual(["E1"]);
    expect(model.limitations).toContain("deterministic_preview_only");
  });

  it("marks community solution evidence with a no-copy limitation", () => {
    const model = createOiSkillPreviewReadModel({
      problem: { title: "LCA", problemId: "manual-lca" },
      evidenceRecords: [createEvidenceRecord({
        evidenceId: "E2",
        candidateId: "C2",
        url: "https://example.com/solution/lca",
        title: "Community solution for LCA",
        sourceType: "community",
      })],
      permissionRequests: [],
    });

    expect(model.sources[0]).toMatchObject({
      role: "community-solution",
      warning: "do_not_copy_source_text",
    });
    expect(model.evidence[0]?.limitations).toContain("do_not_copy_source_text");
    expect(model.solutionOutline?.limitations).toContain("do_not_copy_source_text");
  });
});
