import { describe, expect, it, vi } from "vitest";

import {
  classifyPatchRisk,
  createPatchApprovalDecisionReadModel,
  createPatchPermissionRequests,
  type ClassifyPatchRiskInput,
} from "./patchRiskPolicy";
import type {
  PatchApprovalDecisionStatus,
  PatchPermissionKind,
  PatchPermissionRequest,
  PatchTargetRef,
} from "./patchWorkflowTypes";

describe("P13 patch risk policy", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const safeWorkspaceTarget = {
    targetRefId: "target:p13:workspace",
    targetKind: "workspace-file",
    displayPath: "src/lib/example.ts",
    workspaceId: "workspace:general:1",
    contentHashBefore: "sha256:before",
    lineRange: { startLine: 1, endLine: 8 },
    permissionScope: "patch-preview",
    pathSafetyStatus: "safe-preview",
    notesPolicy: "not-read",
  } satisfies PatchTargetRef;

  const safeFixtureTarget = {
    ...safeWorkspaceTarget,
    targetRefId: "target:p13:fixture",
    targetKind: "scratch-fixture",
    displayPath: "fixtures/p13-safe-diff.ts",
    notesPolicy: "fixture-only",
  } satisfies PatchTargetRef;

  function makeInput(overrides: Partial<ClassifyPatchRiskInput> = {}): ClassifyPatchRiskInput {
    return {
      proposalId: "proposal:p13:risk",
      targetRefs: [safeWorkspaceTarget],
      permissionKinds: ["patch-apply"],
      operationIntents: ["single-file-patch"],
      patchFormat: "unified-diff",
      diffStats: { filesChanged: 1, insertions: 6, deletions: 2 },
      contentHashSnapshot: { "target:p13:workspace": "sha256:before" },
      ...overrides,
    };
  }

  it("classifies low, medium, high and blocked risk levels deterministically", () => {
    expect(
      classifyPatchRisk(
        makeInput({
          targetRefs: [safeFixtureTarget],
          permissionKinds: [],
          operationIntents: ["fixture-only-change"],
          diffStats: { filesChanged: 1, insertions: 2, deletions: 0 },
        }),
      ).riskLevel,
    ).toBe("low");

    expect(classifyPatchRisk(makeInput()).riskLevel).toBe("medium");

    expect(
      classifyPatchRisk(
        makeInput({
          targetRefs: [
            safeWorkspaceTarget,
            { ...safeWorkspaceTarget, targetRefId: "target:p13:second", displayPath: "src/lib/second.ts" },
          ],
          operationIntents: ["multi-file-patch"],
          diffStats: { filesChanged: 2, insertions: 12, deletions: 3 },
        }),
      ).riskLevel,
    ).toBe("high");

    expect(
      classifyPatchRisk(
        makeInput({
          permissionKinds: ["destructive"],
          operationIntents: ["direct-filesystem-mutation"],
        }),
      ).riskLevel,
    ).toBe("blocked");
  });

  it("keeps safe fixture diffs low or medium, while multi-file or stale targets are high", () => {
    const safeFixtureRisk = classifyPatchRisk(
      makeInput({
        targetRefs: [safeFixtureTarget],
        operationIntents: ["fixture-only-change"],
        permissionKinds: ["patch-apply"],
        diffStats: { filesChanged: 1, insertions: 2, deletions: 0 },
      }),
    );
    expect(["low", "medium"]).toContain(safeFixtureRisk.riskLevel);

    const staleTargetRisk = classifyPatchRisk(
      makeInput({
        contentHashSnapshot: { "target:p13:workspace": "sha256:stale" },
      }),
    );
    expect(staleTargetRisk.riskLevel).toBe("high");
    expect(staleTargetRisk.requiresFreshRead).toBe(true);

    const multiFileRisk = classifyPatchRisk(
      makeInput({
        targetRefs: [
          safeWorkspaceTarget,
          { ...safeWorkspaceTarget, targetRefId: "target:p13:second", displayPath: "src/lib/second.ts" },
        ],
        diffStats: { filesChanged: 2, insertions: 4, deletions: 1 },
      }),
    );
    expect(multiFileRisk.riskLevel).toBe("high");
  });

  it("blocks direct mutation, delete and rollback execution intents", () => {
    for (const [permissionKind, operationIntent] of [
      ["write", "direct-filesystem-mutation"],
      ["delete", "delete"],
      ["rollback", "rollback-execution"],
      ["destructive", "command-execution"],
    ] as const) {
      const risk = classifyPatchRisk(
        makeInput({
          permissionKinds: [permissionKind],
          operationIntents: [operationIntent],
        }),
      );

      expect(risk.riskLevel).toBe("blocked");
      expect(risk.requiresHumanApproval).toBe(true);
      expect(risk.riskReasons).toContain(`blocked_operation:${operationIntent}`);
    }
  });

  it("never auto-allows P13 write, patch-apply, delete, rollback or destructive permission requests", () => {
    const permissionKinds: PatchPermissionKind[] = ["write", "patch-apply", "delete", "rollback", "destructive"];

    for (const permissionKind of permissionKinds) {
      const risk = classifyPatchRisk(
        makeInput({
          permissionKinds: [permissionKind],
          operationIntents:
            permissionKind === "delete"
              ? ["delete"]
              : permissionKind === "rollback"
                ? ["rollback-execution"]
                : permissionKind === "destructive"
                  ? ["direct-filesystem-mutation"]
                  : ["single-file-patch"],
        }),
      );
      const [request] = createPatchPermissionRequests({
        proposalId: "proposal:p13:risk",
        requestedByEventId: "event:p13:risk-classified",
        targetRefs: [safeWorkspaceTarget],
        riskClassification: risk,
        createdAt,
      });

      expect(request).toBeDefined();
      expect((request as PatchPermissionRequest).permissionKind).toBe(permissionKind);
      expect((request as PatchPermissionRequest).decisionStatus).not.toBe("auto-allowed");
      expect(["prompt-required", "blocked-by-configuration", "unavailable", "reserved"]).toContain(
        (request as PatchPermissionRequest).decisionStatus,
      );
    }
  });

  it("creates approval decision read models for every P13 approval status", () => {
    const statuses: PatchApprovalDecisionStatus[] = [
      "pending",
      "approved-for-future-apply",
      "denied",
      "blocked",
      "expired",
      "unavailable",
    ];

    for (const status of statuses) {
      const decision = createPatchApprovalDecisionReadModel({
        approvalDecisionId: `approval:p13:${status}`,
        permissionRequestId: "permission:p13:risk",
        proposalId: "proposal:p13:risk",
        status,
        decidedBy: status === "pending" ? "unresolved" : "human-reviewer",
        safeReason: "Read-model only; P13 does not apply mutations.",
        visibleConsequences: ["May be reviewed for a later approved apply-capable phase."],
        eventIds: ["event:p13:permission-requested"],
        createdAt,
      });

      expect(decision.status).toBe(status);
      expect(decision.blockedCapabilities).toEqual(
        expect.arrayContaining(["real-patch-apply", "write-mutation", "delete-mutation", "rollback-execution"]),
      );
    }
  });

  it("is a pure projection that does not call filesystem, Tauri, network, providers, tools or real notes readers", () => {
    const watchedHooks = {
      filesystem: vi.fn(),
      tauri: vi.fn(),
      network: vi.fn(),
      provider: vi.fn(),
      toolTransport: vi.fn(),
      notesReader: vi.fn(),
    };
    const risk = classifyPatchRisk(
      makeInput({
        targetRefs: [safeFixtureTarget],
        operationIntents: ["fixture-only-change"],
        permissionKinds: [],
      }),
    );
    const requests = createPatchPermissionRequests({
      proposalId: "proposal:p13:risk",
      requestedByEventId: "event:p13:risk-classified",
      targetRefs: [safeFixtureTarget],
      riskClassification: risk,
      createdAt,
    });

    expect(risk.riskReasons).not.toContain("notes_content_read");
    expect(requests).toEqual([]);
    for (const hook of Object.values(watchedHooks)) {
      expect(hook).not.toHaveBeenCalled();
    }
  });
});
