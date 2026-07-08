import { describe, expect, it } from "vitest";

import {
  normalizePatchProposal,
  validatePatchProposalEnvelope,
  type NormalizePatchProposalInput,
} from "./patchProposalPolicy";
import type { PatchTargetRef } from "./patchWorkflowTypes";

describe("P13 patch proposal normalizer and validator", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const safeTarget = {
    targetRefId: "target:p13:workspace",
    targetKind: "workspace-file",
    displayPath: "src/lib/example.ts",
    workspaceId: "workspace:general:1",
    contentHashBefore: "sha256:before",
    lineRange: { startLine: 1, endLine: 4 },
    permissionScope: "patch-preview",
    pathSafetyStatus: "safe-preview",
    notesPolicy: "not-read",
  } satisfies PatchTargetRef;

  function makeInput(overrides: Partial<NormalizePatchProposalInput> = {}): NormalizePatchProposalInput {
    return {
      proposalId: "proposal:p13:1",
      sessionId: "session:p13:1",
      turnId: "turn:p13:1",
      stepId: "step:p13:1",
      sourceKind: "model-output",
      sourceEventIds: ["event:p13:model-output"],
      workspaceRefs: ["workspace:general:1"],
      evidenceRefs: ["evidence:p13:bounded"],
      targetRefs: [safeTarget],
      patchFormat: "unified-diff",
      proposedOperation: "patch-preview",
      proposalSummary:
        "Apply this patch.\nAuthorization: Bearer should-not-survive\nCookie: session=also-dropped\n" +
        "raw provider payload: {\"secret\":\"drop-me\"}",
      contentHashSnapshot: { "target:p13:workspace": "sha256:before" },
      rawProviderPayload: { choices: [{ message: { content: "do not preserve this" } }] },
      rawToolOutput: "raw tool output with API key sk-should-not-survive",
      createdAt,
      ...overrides,
    };
  }

  it("normalizes model or tool output into a proposal envelope without preserving raw provider payload", () => {
    const envelope = normalizePatchProposal(makeInput({ sourceKind: "tool-observation" }));

    expect(envelope.sourceKind).toBe("tool-observation");
    expect(envelope.outputState).toBe("Patch / Write Workflow Contract Preview");
    expect(envelope.capabilityStatus).toBe("preview");
    expect(envelope.patchFormat).toBe("unified-diff");
    expect(envelope.targetRefs).toEqual([safeTarget]);
    expect(JSON.stringify(envelope)).not.toContain("choices");
    expect(JSON.stringify(envelope)).not.toContain("do not preserve this");
    expect(JSON.stringify(envelope)).not.toContain("raw tool output with API key");
  });

  it("rejects missing target refs, unsupported formats, stale hashes, blocked paths and notes mutation", () => {
    const envelope = normalizePatchProposal(
      makeInput({
        targetRefs: [
          {
            ...safeTarget,
            targetRefId: "target:p13:blocked-note",
            targetKind: "note-ref",
            displayPath: "notes/private.md",
            pathSafetyStatus: "blocked",
            notesPolicy: "blocked",
          },
        ],
        patchFormat: "unsupported",
        contentHashSnapshot: { "target:p13:blocked-note": "sha256:stale" },
      }),
    );

    expect(envelope.validationResult.status).toBe("blocked");
    expect(envelope.capabilityStatus).toBe("blocked");
    expect(envelope.validationResult.safeErrors).toEqual(
      expect.arrayContaining([
        "unsupported_patch_format",
        "stale_content_hash_before:target:p13:blocked-note",
        "blocked_path_safety:target:p13:blocked-note",
        "notes_mutation_requires_explicit_future_approval:target:p13:blocked-note",
      ]),
    );

    const missingTarget = validatePatchProposalEnvelope(normalizePatchProposal(makeInput({ targetRefs: [] })));
    expect(missingTarget.status).toBe("blocked");
    expect(missingTarget.safeErrors).toContain("missing_target_refs");
  });

  it("blocks delete, rollback execution, command execution and direct filesystem mutation operations", () => {
    for (const proposedOperation of [
      "delete",
      "rollback-execution",
      "command-execution",
      "direct-filesystem-mutation",
    ] as const) {
      const envelope = normalizePatchProposal(makeInput({ proposedOperation }));

      expect(envelope.validationResult.status).toBe("blocked");
      expect(envelope.capabilityStatus).toBe("blocked");
      expect(envelope.validationResult.safeErrors).toContain(`blocked_operation:${proposedOperation}`);
      expect(envelope.dryRunResult.status).toBe("blocked");
    }
  });

  it("keeps proposalSummary safe and bounded", () => {
    const envelope = normalizePatchProposal(
      makeInput({
        proposalSummary: `${"safe ".repeat(80)}Authorization: Bearer secret Cookie: session=secret sk-live-secret`,
      }),
    );

    expect(envelope.proposalSummary.length).toBeLessThanOrEqual(160);
    expect(envelope.proposalSummary).not.toContain("Authorization");
    expect(envelope.proposalSummary).not.toContain("Cookie");
    expect(envelope.proposalSummary).not.toContain("sk-live-secret");
    expect(envelope.redactionResult.redactionStatus).toBe("redacted");
  });

  it("validation is a pure projection that does not require filesystem, Tauri, network, providers, tools or real notes", () => {
    const envelope = normalizePatchProposal(
      makeInput({
        targetRefs: [
          {
            ...safeTarget,
            targetKind: "scratch-fixture",
            displayPath: "fixtures/notes-sample.md",
            notesPolicy: "fixture-only",
          },
        ],
      }),
    );

    expect(envelope.validationResult.status).toBe("passed");
    expect(envelope.dryRunResult.targetCompatibility).toBe("pure-preview-projection");
    expect(envelope.targetRefs[0]?.displayPath).toBe("fixtures/notes-sample.md");
    expect(JSON.stringify(envelope)).not.toContain("notes content");
    expect(JSON.stringify(envelope)).not.toContain("@tauri-apps/api/core");
    expect(JSON.stringify(envelope)).not.toContain("fetch(");
  });
});
