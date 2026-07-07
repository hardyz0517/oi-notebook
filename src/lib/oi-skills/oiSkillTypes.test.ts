import { describe, expect, it } from "vitest";

import type {
  OiSkillDefinition,
  OiSkillInvocation,
  OiSkillReadModel,
  OiSkillSessionLinkage,
  OiSolutionOutline,
} from "./oiSkillTypes";
import * as oiSkillTypesModule from "./oiSkillTypes";

describe("P7 OI skill contract", () => {
  it("resolves the contract module", () => {
    expect(oiSkillTypesModule).toBeDefined();
  });

  it("defines research-problem as a preview skill with explicit evidence policy", () => {
    const skill = {
      skillId: "research-problem",
      label: "Research problem",
      description: "Build a cited research read model for an OI problem.",
      inputSchema: { type: "object", required: ["problemRef"] },
      outputSchema: { type: "object", required: ["status", "problemRef", "evidence"] },
      requiredPermissions: ["read", "public-network"],
      sourceRoles: ["problem-statement", "official-editorial", "community-solution", "algorithm-reference"],
      evidencePolicy: {
        minCitations: 1,
        requireSourceRoles: ["problem-statement"],
        forbidCopyingSourceText: true,
      },
      resultStatuses: ["preview", "blocked", "degraded", "unavailable", "completed"],
      failureReasons: ["insufficient-evidence", "permission-required", "source-unavailable"],
      traceEvents: ["skill.requested", "skill.evidence.mapped", "skill.completed"],
    } satisfies OiSkillDefinition;

    expect(skill.skillId).toBe("research-problem");
    expect(skill.requiredPermissions).toContain("public-network");
    expect(skill.evidencePolicy.forbidCopyingSourceText).toBe(true);
  });

  it("represents solution outline as cited preview data, not a final answer", () => {
    const outline = {
      status: "preview",
      algorithm: "Binary lifting on a rooted tree.",
      proofSketch: "Each jump halves the remaining distance to the ancestor.",
      complexity: { time: "O((n + q) log n)", memory: "O(n log n)" },
      implementationNotes: ["Precompute up[v][k] during DFS."],
      pitfalls: ["Remember to normalize depths before lifting both nodes."],
      citationIds: ["E1"],
      limitations: ["Generated from deterministic preview data only."],
    } satisfies OiSolutionOutline;

    expect(outline.status).toBe("preview");
    expect(outline.citationIds).toEqual(["E1"]);
  });

  it("requires read models to expose limitations when evidence is missing", () => {
    const invocation = {
      invocationId: "skill:research-problem:P3379",
      skillId: "research-problem",
      problemRef: { platform: "luogu", problemId: "P3379", title: "LCA" },
      mode: "preview",
    } satisfies OiSkillInvocation;

    const readModel = {
      invocation,
      status: "degraded",
      problemRef: invocation.problemRef,
      sources: [],
      evidence: [],
      solutionOutline: null,
      permissionRequests: [],
      traceEvents: [],
      limitations: ["no_evidence"],
    } satisfies OiSkillReadModel;

    expect(readModel.status).toBe("degraded");
    expect(readModel.limitations).toContain("no_evidence");
  });

  it("lets P7 skill read models reference P8 sessions without changing skill capability", () => {
    const sessionLinkage = {
      sessionId: "session:p8",
      replayCheckpointIds: ["checkpoint:p8:1"],
      traceEventIds: ["event:1"],
    } satisfies OiSkillSessionLinkage;

    const readModel = {
      invocation: {
        invocationId: "skill:research-problem:P3379",
        skillId: "research-problem",
        problemRef: { platform: "luogu", problemId: "P3379", title: "LCA" },
        mode: "preview",
      },
      status: "completed",
      problemRef: { platform: "luogu", problemId: "P3379", title: "LCA" },
      sources: [],
      evidence: [],
      solutionOutline: null,
      permissionRequests: [],
      traceEvents: [],
      limitations: ["deterministic_preview_only"],
      sessionLinkage,
    } satisfies OiSkillReadModel;

    expect(readModel.sessionLinkage?.sessionId).toBe("session:p8");
    expect(readModel.sessionLinkage?.replayCheckpointIds).toEqual(["checkpoint:p8:1"]);
    expect(readModel.sessionLinkage?.traceEventIds).toEqual(["event:1"]);
    expect(readModel.limitations).toContain("deterministic_preview_only");
    expect(readModel.invocation.mode).toBe("preview");
    expect(readModel.status).toBe("completed");
  });
});
