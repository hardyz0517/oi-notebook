import { describe, expect, it } from "vitest";

import { normalizeRunnerRequest, validateRunnerRequestEnvelope, type NormalizeRunnerRequestInput } from "./runnerRequestPolicy";
import type { RunnerTargetRef } from "./runnerContractTypes";

describe("P14 runner request normalizer", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const safeTarget = {
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

  function makeInput(overrides: Partial<NormalizeRunnerRequestInput> = {}): NormalizeRunnerRequestInput {
    return {
      executionRequestId: "exec-request:p14:1",
      sessionId: "session:p14:1",
      turnId: "turn:p14:1",
      stepId: "step:p14:1",
      sourceKind: "model-output",
      sourceEventIds: ["event:p14:model-output"],
      workspaceRefs: ["workspace:p14:fixture"],
      evidenceRefs: ["evidence:p14:bounded"],
      targetRefs: [safeTarget],
      runnerKind: "test-run",
      command: "vitest run fixtures/solution.test.ts",
      languageId: "typescript",
      testIntent: "unit",
      requestedInputSummaries: ["sample input fixture"],
      expectedOutputSummaries: ["sample output fixture"],
      workingDirectoryRef: "workspace:p14:fixture",
      timeoutMs: 1000,
      maxOutputBytes: 4096,
      maxInputBytes: 2048,
      requestedCapabilities: [],
      rawProviderPayload: { choices: [{ message: { content: "raw provider payload should not survive" } }] },
      rawToolOutput: "raw tool output should not survive",
      requestSummary:
        "Run unit preview. Authorization: Bearer should-not-survive Cookie: session=drop sk-live-secret raw provider payload: drop",
      createdAt,
      ...overrides,
    };
  }

  it("normalizes model, tool and user inputs into a P14 execution request intent without retaining raw payloads", () => {
    for (const sourceKind of ["model-output", "tool-observation", "user-request"] as const) {
      const envelope = normalizeRunnerRequest(makeInput({ sourceKind }));
      const serialized = JSON.stringify(envelope);

      expect(envelope.sourceKind).toBe(sourceKind);
      expect(envelope.outputState).toBe("Execute / Code Runner Contract Preview");
      expect(envelope.capabilityStatus).toBe("preview");
      expect(envelope.runnerIntent).toMatchObject({
        commandClass: "test",
        languageClass: "typescript",
        testRunClass: "unit-test",
      });
      expect(envelope.requestedInputs).toEqual([
        { inputRefId: "exec-request:p14:1:input:1", inputKind: "stdin-fixture", safeSummary: "sample input fixture" },
      ]);
      expect(envelope.expectedOutputs).toEqual([
        {
          outputRefId: "exec-request:p14:1:expected-output:1",
          outputKind: "expected-output-fixture",
          safeSummary: "sample output fixture",
        },
      ]);
      expect(serialized).not.toContain("choices");
      expect(serialized).not.toContain("raw provider payload should not survive");
      expect(serialized).not.toContain("raw tool output should not survive");
      expect(serialized).not.toContain("Bearer should-not-survive");
      expect(serialized).not.toContain("Cookie: session=drop");
      expect(serialized).not.toContain("sk-live-secret");
    }
  });

  it("rejects missing targets, unsupported runner kinds, unknown working directories and unbounded output", () => {
    const blocked = normalizeRunnerRequest(
      makeInput({
        targetRefs: [],
        runnerKind: "unsupported",
        workingDirectoryRef: "workspace:p14:unknown",
        maxOutputBytes: undefined,
      }),
    );

    expect(blocked.capabilityStatus).toBe("blocked");
    expect(blocked.classification.riskLevel).toBe("blocked");
    expect(blocked.classification.blockedReasons).toEqual(
      expect.arrayContaining([
        "missing_target_refs",
        "unsupported_runner_kind",
        "unknown_working_directory_ref",
        "unbounded_output_blocked_in_p14",
      ]),
    );
    expect(blocked.sandboxPlan.profile).toBe("blocked");
    expect(blocked.permissionRequest.decisionStatus).toBe("blocked-by-configuration");
    expect(validateRunnerRequestEnvelope(blocked).safeErrors).toEqual(expect.arrayContaining(["missing_target_refs"]));
  });

  it("blocks real notes access while allowing fixture-only notes-shaped paths", () => {
    const blockedNote = normalizeRunnerRequest(
      makeInput({
        targetRefs: [
          {
            ...safeTarget,
            targetRefId: "target:p14:note",
            targetKind: "note-ref",
            displayPath: "notes/private.md",
            notesPolicy: "blocked",
            pathSafetyStatus: "blocked",
          },
        ],
      }),
    );

    expect(blockedNote.capabilityStatus).toBe("blocked");
    expect(blockedNote.classification.blockedReasons).toContain("real_notes_access_blocked_in_p14:target:p14:note");

    const fixtureNote = normalizeRunnerRequest(
      makeInput({
        targetRefs: [{ ...safeTarget, displayPath: "fixtures/notes-sample.md", notesPolicy: "fixture-only" }],
      }),
    );

    expect(fixtureNote.capabilityStatus).toBe("preview");
    expect(fixtureNote.classification.blockedReasons).toEqual([]);
  });

  it("keeps blocked execute, network, write, patch, delete and rollback requests as preview metadata only", () => {
    const envelope = normalizeRunnerRequest(
      makeInput({
        command: "node mutate.js && apply patch",
        requestedCapabilities: [
          "true-execution",
          "network",
          "filesystem-mutation",
          "patch-apply",
          "delete",
          "rollback-execution",
        ],
        requestedTrueExecution: true,
      }),
    );

    expect(envelope.capabilityStatus).toBe("blocked");
    expect(envelope.resourceLimits.trueExecution).toBe("blocked");
    expect(envelope.resourceLimits.networkAccess).toBe("blocked");
    expect(envelope.resourceLimits.writeAccess).toBe("blocked");
    expect(envelope.permissionRequest.permissionKind).toBe("execute");
    expect(envelope.approvalDecision.status).toBe("blocked");
    expect(envelope.mockResult.status).toBe("blocked");
    expect(envelope.observationPolicy.status).toBe("blocked");
    expect(envelope.rollbackCleanupPlan.cleanupStepsPreview).toEqual(["No cleanup is executed in P14."]);
  });

  it("normalization is pure and does not expose filesystem, Tauri, network, provider, tool transport or real notes content", () => {
    const envelope = normalizeRunnerRequest(makeInput());
    const serialized = JSON.stringify(envelope);

    expect(envelope.mockResult.mode).toBe("classification-only");
    expect(envelope.mockResult.filesTouchedPreview).toBe(0);
    expect(envelope.observationPolicy.boundedStdout).toBe("");
    expect(envelope.observationPolicy.boundedStderr).toBe("");
    expect(serialized).not.toContain("notes content");
    expect(serialized).not.toContain("@tauri-apps/api/core");
    expect(serialized).not.toContain("fetch(");
    expect(serialized).not.toContain("child_process");
  });
});
