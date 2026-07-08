import { describe, expect, it } from "vitest";

import {
  P14_APPROVAL_DECISION_STATUSES,
  P14_PERMISSION_DECISION_STATUSES,
  P14_PERMISSION_KINDS,
  P14_SANDBOX_PROFILES,
  buildRunnerApprovalDecisionReadModel,
  buildRunnerPermissionRequest,
  buildRunnerPermissionSandboxReadModel,
  buildRunnerSandboxPlan,
  type BuildRunnerPermissionSandboxInput,
} from "./runnerPermissionSandboxPolicy";
import type {
  RunnerApprovalDecisionStatus,
  RunnerPermissionDecisionStatus,
  RunnerPermissionKind,
  RunnerSandboxProfile,
  RunnerTargetRef,
} from "./runnerContractTypes";

describe("P14 runner permission and sandbox read model policy", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const fixtureTarget = {
    targetRefId: "target:p14:fixture",
    targetKind: "scratch-fixture",
    displayPath: "fixtures/solution.ts",
    workspaceId: "workspace:p14:fixture",
    languageId: "typescript",
    contentHashBefore: "sha256:fixture",
    inputRefs: ["input:p14:sample"],
    expectedOutputRefs: ["expected:p14:sample"],
    permissionScope: "runner-preview",
    pathSafetyStatus: "safe-preview",
    notesPolicy: "fixture-only",
    networkPolicy: "none",
  } satisfies RunnerTargetRef;

  function makeInput(overrides: Partial<BuildRunnerPermissionSandboxInput> = {}): BuildRunnerPermissionSandboxInput {
    return {
      executionRequestId: "exec-request:p14:permission",
      permissionKind: "execute",
      riskLevel: "high",
      targetRefs: [fixtureTarget],
      requestedByEventId: "event:p14:runner-requested",
      workingDirectoryRef: "workspace:p14:fixture",
      createdAt,
      ...overrides,
    };
  }

  it("exposes the complete P14 permission, decision, approval and sandbox vocabularies", () => {
    expect(P14_PERMISSION_KINDS).toEqual([
      "execute",
      "public-network",
      "write",
      "patch-apply",
      "delete",
      "rollback",
      "destructive",
    ] satisfies RunnerPermissionKind[]);
    expect(P14_PERMISSION_DECISION_STATUSES).toEqual([
      "prompt-required",
      "denied",
      "blocked-by-configuration",
      "unavailable",
      "reserved",
    ] satisfies RunnerPermissionDecisionStatus[]);
    expect(P14_APPROVAL_DECISION_STATUSES).toEqual([
      "pending",
      "approved-for-future-execute",
      "denied",
      "blocked",
      "expired",
      "unavailable",
    ] satisfies RunnerApprovalDecisionStatus[]);
    expect(P14_SANDBOX_PROFILES).toEqual([
      "preview-no-op",
      "mock-runner",
      "read-only-classification",
      "fixture-simulation",
      "reserved-future-sandbox",
      "blocked",
    ] satisfies RunnerSandboxProfile[]);
  });

  it("keeps every P14 permission kind out of any auto-allowed state", () => {
    for (const permissionKind of P14_PERMISSION_KINDS) {
      const request = buildRunnerPermissionRequest(makeInput({ permissionKind }));

      expect(request.permissionKind).toBe(permissionKind);
      expect(request.decisionStatus).not.toBe("auto-allowed");
      expect(P14_PERMISSION_DECISION_STATUSES).toContain(request.decisionStatus);
      expect(request.reason).toContain("P14");
      expect(request.approvalSurface).toBe("workbench-read-only");
    }
  });

  it("builds each allowed permission decision status as read-model metadata only", () => {
    for (const decisionStatus of P14_PERMISSION_DECISION_STATUSES) {
      const request = buildRunnerPermissionRequest(makeInput({ decisionStatus }));

      expect(request.decisionStatus).toBe(decisionStatus);
      expect(request.targetRefs).toEqual(["target:p14:fixture"]);
      expect(request.sandboxPlanId).toBe("exec-request:p14:permission:sandbox");
    }
  });

  it("builds each approval read status without turning future approval into execution", () => {
    const permissionRequest = buildRunnerPermissionRequest(makeInput());

    for (const approvalStatus of P14_APPROVAL_DECISION_STATUSES) {
      const approval = buildRunnerApprovalDecisionReadModel(makeInput({ approvalStatus }), permissionRequest);

      expect(approval.status).toBe(approvalStatus);
      expect(approval.safeReason).toContain("P14");
      expect(approval.visibleConsequences).toContain("No process is started and no workspace mutation is performed in P14.");
      expect(approval.blockedCapabilities).toEqual(expect.arrayContaining(["true-execution", "workspace-mutation"]));
    }
  });

  it("builds each sandbox profile with bounded no-op access defaults", () => {
    for (const sandboxProfile of P14_SANDBOX_PROFILES) {
      const sandbox = buildRunnerSandboxPlan(makeInput({ sandboxProfile }));

      expect(sandbox.profile).toBe(sandboxProfile);
      expect(sandbox.networkAccess).toBe(sandboxProfile === "reserved-future-sandbox" ? "reserved-future-phase" : "none");
      expect(sandbox.secretAccess).toBe("none");
      expect(sandbox.credentialAccess).toBe("none");
      expect(sandbox.writeAccess).toBe("none");
      expect(sandbox.timeoutMs).toBeGreaterThan(0);
      expect(sandbox.maxOutputBytes).toBeGreaterThan(0);
      expect(sandbox.maxInputBytes).toBeGreaterThan(0);
      expect(sandbox.environmentPolicy).toContain("metadata-only");
      expect(sandbox.cleanupPolicy).toContain("no-op");
    }
  });

  it("defaults to no network, no Cookie, no secret exposure, no write, no patch, no delete or rollback", () => {
    const readModel = buildRunnerPermissionSandboxReadModel(makeInput());

    expect(readModel.sandboxPlan).toMatchObject({
      profile: "read-only-classification",
      networkAccess: "none",
      secretAccess: "none",
      credentialAccess: "none",
      writeAccess: "none",
      maxFilesTouched: 0,
      timeoutMs: 5000,
      maxOutputBytes: 4096,
      maxInputBytes: 2048,
    });
    expect(readModel.resourceLimits).toMatchObject({
      networkAccess: "none",
      secretAccess: "none",
      writeAccess: "none",
      trueExecution: "unavailable",
      maxFilesTouched: 0,
    });
    expect(readModel.deniedCapabilities).toEqual(
      expect.arrayContaining(["browser-credential", "secret", "write", "patch-apply", "delete", "rollback"]),
    );
  });

  it("blocks unsafe access requests and records safe reasons instead of granting capabilities", () => {
    const readModel = buildRunnerPermissionSandboxReadModel(
      makeInput({
        permissionKind: "delete",
        requestedNetwork: true,
        requestedSecrets: true,
        requestedCookie: true,
        requestedWrite: true,
        requestedPatchApply: true,
        requestedDelete: true,
        requestedRollback: true,
      }),
    );

    expect(readModel.permissionRequest.decisionStatus).toBe("blocked-by-configuration");
    expect(readModel.approvalDecision.status).toBe("blocked");
    expect(readModel.sandboxPlan.profile).toBe("blocked");
    expect(readModel.sandboxPlan.networkAccess).toBe("blocked");
    expect(readModel.sandboxPlan.secretAccess).toBe("blocked");
    expect(readModel.sandboxPlan.credentialAccess).toBe("blocked");
    expect(readModel.sandboxPlan.writeAccess).toBe("blocked");
    expect(readModel.resourceLimits.trueExecution).toBe("blocked");
    expect(readModel.sandboxPlan.blockedReasons).toEqual(
      expect.arrayContaining([
        "network_access_blocked_in_p14",
        "cookie_access_blocked_in_p14",
        "secret_access_blocked_in_p14",
        "write_access_blocked_in_p14",
        "patch_apply_blocked_in_p14",
        "delete_blocked_in_p14",
        "rollback_blocked_in_p14",
      ]),
    );
  });

  it("keeps max files touched at zero except fixture simulation planned refs", () => {
    const defaultPlan = buildRunnerSandboxPlan(makeInput({ targetRefs: [fixtureTarget, { ...fixtureTarget, targetRefId: "target:p14:fixture:2" }] }));
    const fixtureSimulation = buildRunnerSandboxPlan(
      makeInput({
        sandboxProfile: "fixture-simulation",
        fixtureSimulationPlannedRefCount: 2,
        targetRefs: [fixtureTarget, { ...fixtureTarget, targetRefId: "target:p14:fixture:2" }],
      }),
    );

    expect(defaultPlan.maxFilesTouched).toBe(0);
    expect(fixtureSimulation.maxFilesTouched).toBe(2);
  });
});
