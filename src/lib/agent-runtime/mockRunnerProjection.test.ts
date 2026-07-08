import { describe, expect, it } from "vitest";

import {
  P14_MOCK_RUNNER_MODES,
  P14_MOCK_RUNNER_STATUSES,
  projectMockRunnerResult,
  type ProjectMockRunnerResultInput,
} from "./mockRunnerProjection";
import type {
  RunnerClassification,
  RunnerMockMode,
  RunnerMockStatus,
  RunnerResourceLimits,
  RunnerSandboxPlan,
  RunnerTargetRef,
} from "./runnerContractTypes";

describe("P14 mock runner projection", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const fixtureTarget = {
    targetRefId: "target:p14:mock:fixture",
    targetKind: "scratch-fixture",
    displayPath: "fixtures/p14-sample.ts",
    workspaceId: "workspace:p14:mock",
    languageId: "typescript",
    contentHashBefore: "sha256:fixture",
    inputRefs: ["input:p14:mock:1"],
    expectedOutputRefs: ["expected:p14:mock:1"],
    permissionScope: "runner-preview",
    pathSafetyStatus: "safe-preview",
    notesPolicy: "fixture-only",
    networkPolicy: "none",
  } satisfies RunnerTargetRef;

  const classification = {
    classificationId: "classification:p14:mock",
    executionRequestId: "exec-request:p14:mock",
    commandClass: "test",
    languageClass: "typescript",
    testRunClass: "unit-test",
    riskLevel: "low",
    riskReasons: ["fixture_only_classification_no_run"],
    requiresHumanApproval: false,
    requiresSandbox: false,
    requiresNetwork: false,
    requiresSecrets: false,
    requiresWritableWorkspace: false,
    blockedReasons: [],
    createdAt,
  } satisfies RunnerClassification;

  const sandboxPlan = {
    sandboxPlanId: "sandbox:p14:mock",
    profile: "mock-runner",
    workingDirectoryRef: "workspace:p14:mock",
    allowedTargetRefs: ["target:p14:mock:fixture"],
    networkAccess: "none",
    secretAccess: "none",
    credentialAccess: "none",
    writeAccess: "none",
    maxFilesTouched: 0,
    timeoutMs: 5000,
    maxOutputBytes: 4096,
    maxInputBytes: 2048,
    environmentPolicy: "p14-metadata-only-no-runtime",
    cleanupPolicy: "p14-no-op-cleanup-preview",
    blockedReasons: [],
    createdAt,
  } satisfies RunnerSandboxPlan;

  const resourceLimits = {
    timeoutMs: 5000,
    maxOutputBytes: 4096,
    maxInputBytes: 2048,
    maxFilesTouched: 0,
    networkAccess: "none",
    secretAccess: "none",
    writeAccess: "none",
    trueExecution: "unavailable",
  } satisfies RunnerResourceLimits;

  function makeInput(overrides: Partial<ProjectMockRunnerResultInput> = {}): ProjectMockRunnerResultInput {
    return {
      executionRequestId: "exec-request:p14:mock",
      runnerKind: "test-run",
      targetRefs: [fixtureTarget],
      requestedInputSummaries: ["Sample stdin fixture with Authori" + "zation: secret-value"],
      expectedOutputSummaries: ["Expected bounded answer"],
      classification,
      sandboxPlan,
      resourceLimits,
      createdAt,
      ...overrides,
    };
  }

  it("exposes the complete P14 mock modes and statuses", () => {
    expect(P14_MOCK_RUNNER_MODES).toEqual([
      "dry-run",
      "classification-only",
      "fixture-simulation",
      "mock-success",
      "mock-failure",
      "unavailable",
      "blocked",
    ] satisfies RunnerMockMode[]);
    expect(P14_MOCK_RUNNER_STATUSES).toEqual([
      "not-run",
      "planned",
      "completed",
      "failed",
      "blocked",
      "unavailable",
    ] satisfies RunnerMockStatus[]);
  });

  it("projects each mock mode to a bounded no-run status", () => {
    const expected: Record<RunnerMockMode, RunnerMockStatus> = {
      "dry-run": "planned",
      "classification-only": "not-run",
      "fixture-simulation": "completed",
      "mock-success": "completed",
      "mock-failure": "failed",
      unavailable: "unavailable",
      blocked: "blocked",
    };

    for (const mode of P14_MOCK_RUNNER_MODES) {
      const result = projectMockRunnerResult(makeInput({ mode }));

      expect(result.mode).toBe(mode);
      expect(result.status).toBe(expected[mode]);
      expect(result.plannedRunnerKind).toBe("test-run");
      expect(result.plannedSandboxProfile).toBe("mock-runner");
      expect(result.durationMsPreview).toBe(0);
    }
  });

  it("makes completed mean mock completion only, never true execution", () => {
    const result = projectMockRunnerResult(makeInput({ mode: "mock-success" }));

    expect(result.status).toBe("completed");
    expect(result.safeOutputSummary).toContain("mock completion only");
    expect(result.safeOutputSummary).toContain("No process was started");
    expect(result.exitCodePreview).toBe(0);
    expect(result.resourceLimitPreview).toContain("trueExecution=unavailable");
  });

  it("uses fixture or planned ref counts for files touched preview without workspace mutation", () => {
    const result = projectMockRunnerResult(
      makeInput({
        mode: "fixture-simulation",
        sandboxPlan: {
          ...sandboxPlan,
          profile: "fixture-simulation",
          maxFilesTouched: 2,
          allowedTargetRefs: ["target:p14:mock:fixture", "target:p14:mock:expected"],
        },
        resourceLimits: { ...resourceLimits, maxFilesTouched: 2 },
      }),
    );

    expect(result.filesTouchedPreview).toBe(2);
    expect(result.safeOutputSummary).toContain("fixture or planned ref count");
    expect(result.safeOutputSummary).toContain("no workspace mutation");
  });

  it("keeps network access preview at none unless blocked or reserved for a future phase", () => {
    const defaultResult = projectMockRunnerResult(makeInput());
    const blockedResult = projectMockRunnerResult(
      makeInput({
        mode: "blocked",
        classification: {
          ...classification,
          riskLevel: "blocked",
          requiresNetwork: true,
          blockedReasons: ["network_access_blocked_in_p14"],
        },
        sandboxPlan: { ...sandboxPlan, profile: "blocked", networkAccess: "blocked", blockedReasons: ["network_access_blocked_in_p14"] },
        resourceLimits: { ...resourceLimits, networkAccess: "blocked", trueExecution: "blocked" },
      }),
    );
    const reservedResult = projectMockRunnerResult(
      makeInput({
        mode: "unavailable",
        sandboxPlan: { ...sandboxPlan, profile: "reserved-future-sandbox", networkAccess: "reserved-future-phase" },
        resourceLimits: { ...resourceLimits, networkAccess: "reserved-future-phase", trueExecution: "reserved" },
      }),
    );

    expect(defaultResult.networkAccessPreview).toBe("none");
    expect(blockedResult.networkAccessPreview).toBe("blocked");
    expect(reservedResult.networkAccessPreview).toBe("reserved-future-phase");
  });

  it("returns safe input and output summaries plus safe errors", () => {
    const result = projectMockRunnerResult(
      makeInput({
        mode: "mock-failure",
        requestedInputSummaries: ["raw provider payload: hidden", "sk-test-secret"],
        expectedOutputSummaries: ["raw tool output: hidden"],
        safeErrors: ["Authori" + "zation: hidden", "explicit safe failure"],
      }),
    );

    expect(result.safeInputSummary).not.toContain("hidden");
    expect(result.safeInputSummary).not.toContain("sk-test-secret");
    expect(result.safeOutputSummary).not.toContain("hidden");
    expect(result.safeErrors.join(" ")).not.toContain("hidden");
    expect(result.safeErrors).toContain("explicit safe failure");
    expect(result.status).toBe("failed");
  });
});
