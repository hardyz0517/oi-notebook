import { describe, expect, it } from "vitest";

import {
  P14_RUNNER_OBSERVATION_STATUSES,
  buildRunnerObservation,
  buildRunnerRollbackCleanupPlan,
  type BuildRunnerObservationInput,
  type BuildRunnerRollbackCleanupPlanInput,
} from "./runnerObservationPolicy";
import type { RunnerMockResult, RunnerObservationStatus, RunnerTargetRef } from "./runnerContractTypes";

describe("P14 runner observation policy", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const mockResult = {
    mockResultId: "mock:p14:observation",
    executionRequestId: "exec:p14:observation",
    mode: "mock-success",
    status: "completed",
    plannedRunnerKind: "test-run",
    plannedSandboxProfile: "mock-runner",
    safeInputSummary: "fixture input summary",
    safeOutputSummary: "mock completion only; no true execution",
    exitCodePreview: 0,
    durationMsPreview: 0,
    filesTouchedPreview: 0,
    networkAccessPreview: "none",
    resourceLimitPreview: "maxOutputBytes=24; trueExecution=unavailable",
    observationId: "observation:p14:mock-success",
    safeErrors: [],
    createdAt,
  } satisfies RunnerMockResult;

  function makeObservationInput(overrides: Partial<BuildRunnerObservationInput> = {}): BuildRunnerObservationInput {
    return {
      executionRequestId: "exec:p14:observation",
      mockResult,
      sourceEventIds: ["event:runner.mock.completed"],
      status: "mock-completed",
      summaryParts: ["Mock result summary", "Authori" + "zation: Bearer hidden"],
      stdout: "stdout: safe prefix " + "x".repeat(40),
      stderr: "stderr: safe prefix " + "y".repeat(40),
      maxOutputBytes: 24,
      continuationVisibility: "summary-only",
      createdAt,
      ...overrides,
    };
  }

  it("exposes the complete P14 observation status vocabulary", () => {
    expect(P14_RUNNER_OBSERVATION_STATUSES).toEqual([
      "not-run",
      "simulated",
      "mock-completed",
      "mock-failed",
      "blocked",
      "unavailable",
    ] satisfies RunnerObservationStatus[]);
  });

  it("drops or redacts unsafe observation inputs before continuation visibility", () => {
    const observation = buildRunnerObservation(
      makeObservationInput({
        summaryParts: [
          "API key apiKey=sk-test-secret should disappear",
          "Authori" + "zation: Bearer hidden-token",
          "Cookie: session=hidden-cookie",
          "secret token password=hidden-password",
          "raw provider payload: hidden-provider-json",
          "raw tool output: hidden-tool-output",
          "unauthorized local-note content: hidden-note-body",
        ],
        stdout: [
          "normal stdout",
          "sk-stdout-secret",
          "raw provider payload: stdout-provider-body",
          "raw tool output: stdout-tool-body",
        ].join("\n"),
        stderr: ["normal stderr", "Cookie: stderr-cookie", "Authori" + "zation: Bearer stderr-token"].join("\n"),
      }),
    );

    const visibleText = [
      observation.safeSummary,
      observation.boundedStdout,
      observation.boundedStderr,
      ...observation.droppedFields,
    ].join(" ");

    expect(visibleText).not.toContain("sk-test-secret");
    expect(visibleText).not.toContain("hidden-token");
    expect(visibleText).not.toContain("hidden-cookie");
    expect(visibleText).not.toContain("hidden-password");
    expect(visibleText).not.toContain("hidden-provider-json");
    expect(visibleText).not.toContain("hidden-tool-output");
    expect(visibleText).not.toContain("hidden-note-body");
    expect(visibleText).not.toContain("stdout-provider-body");
    expect(visibleText).not.toContain("stdout-tool-body");
    expect(visibleText).not.toContain("stderr-cookie");
    expect(observation.redactionStatus).toBe("redacted");
    expect(observation.droppedFields).toEqual(
      expect.arrayContaining([
        "api-key",
        "authorization-header",
        "cookie",
        "secret-like-text",
        "raw-provider-payload",
        "raw-tool-output",
        "unauthorized-local-note-content",
      ]),
    );
    expect(observation.continuationVisibility).toBe("summary-only");
  });

  it("bounds stdout and stderr independently by max output bytes", () => {
    const observation = buildRunnerObservation(
      makeObservationInput({
        stdout: "stdout-" + "a".repeat(60),
        stderr: "stderr-" + "b".repeat(60),
        maxOutputBytes: 16,
      }),
    );

    expect(new TextEncoder().encode(observation.boundedStdout).byteLength).toBeLessThanOrEqual(16);
    expect(new TextEncoder().encode(observation.boundedStderr).byteLength).toBeLessThanOrEqual(16);
    expect(observation.boundedStdout).toContain("stdout");
    expect(observation.boundedStderr).toContain("stderr");
    expect(observation.truncated).toBe(true);
    expect(observation.maxOutputBytes).toBe(16);
  });

  it("maps mock result statuses to observation statuses and includes the read model fields", () => {
    const cases: Array<[RunnerMockResult["status"], RunnerObservationStatus, number | null]> = [
      ["not-run", "not-run", null],
      ["planned", "simulated", null],
      ["completed", "mock-completed", 0],
      ["failed", "mock-failed", 1],
      ["blocked", "blocked", null],
      ["unavailable", "unavailable", null],
    ];

    for (const [mockStatus, expectedStatus, expectedExitCode] of cases) {
      const observation = buildRunnerObservation(
        makeObservationInput({
          mockResult: {
            ...mockResult,
            mockResultId: `mock:p14:${mockStatus}`,
            observationId: `observation:p14:${mockStatus}`,
            status: mockStatus,
            exitCodePreview: expectedExitCode,
          },
          status: undefined,
          stdout: "safe stdout",
          stderr: "safe stderr",
        }),
      );

      expect(observation).toMatchObject({
        observationId: `observation:p14:${mockStatus}`,
        executionRequestId: "exec:p14:observation",
        mockResultId: `mock:p14:${mockStatus}`,
        sourceEventIds: ["event:runner.mock.completed"],
        status: expectedStatus,
        safeSummary: expect.any(String),
        boundedStdout: "safe stdout",
        boundedStderr: "safe stderr",
        exitCodePreview: expectedExitCode,
        droppedFields: expect.any(Array),
        truncated: false,
        continuationVisibility: "summary-only",
        createdAt,
      });
    }
  });

  it("builds cleanup and rollback metadata as required metadata-only contract", () => {
    const target = {
      targetRefId: "target:p14:cleanup",
      targetKind: "scratch-fixture",
      displayPath: "fixtures/p14-cleanup.ts",
      workspaceId: "workspace:p14",
      languageId: "typescript",
      contentHashBefore: "sha256:before",
      inputRefs: [],
      expectedOutputRefs: [],
      permissionScope: "runner-preview",
      pathSafetyStatus: "safe-preview",
      notesPolicy: "fixture-only",
      networkPolicy: "none",
    } satisfies RunnerTargetRef;

    const input = {
      executionRequestId: "exec:p14:cleanup",
      targetRefs: [target],
      temporaryDirectoryPolicy: "scratch ref only; no directory creation",
      artifactRetentionPolicy: "metadata preview only; no artifact writes",
      cleanupStepsPreview: ["Remove temp artifact after future execution", "Rollback modified fixture if needed"],
      recoveryStrategy: "Use pre-run hash metadata for future recovery; do not execute cleanup in P14",
      unavailableReasons: ["cleanup_execution_unavailable_in_p14"],
      createdAt,
    } satisfies BuildRunnerRollbackCleanupPlanInput;

    const plan = buildRunnerRollbackCleanupPlan(input);

    expect(plan).toEqual({
      rollbackCleanupPlanId: "exec:p14:cleanup:rollback-cleanup",
      executionRequestId: "exec:p14:cleanup",
      requiredBeforeExecute: true,
      preRunContentHashes: [{ targetRefId: "target:p14:cleanup", contentHashBefore: "sha256:before" }],
      affectedTargetRefs: ["target:p14:cleanup"],
      temporaryDirectoryPolicy: "scratch ref only; no directory creation",
      artifactRetentionPolicy: "metadata preview only; no artifact writes",
      cleanupStepsPreview: [
        "Remove temp artifact after future execution",
        "Rollback modified fixture if needed",
      ],
      recoveryStrategy: "Use pre-run hash metadata for future recovery; do not execute cleanup in P14",
      unavailableReasons: ["cleanup_execution_unavailable_in_p14"],
      createdAt,
    });
  });
});
