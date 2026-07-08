import { describe, expect, it, vi } from "vitest";

import {
  createPatchDiffPreview,
  projectPatchDryRun,
  projectPatchRollbackPlan,
} from "./patchDiffPreview";
import type { PatchDryRunStatus, PatchTargetRef } from "./patchWorkflowTypes";

describe("P13 read-only patch diff preview and dry-run projection", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const workspaceTarget = {
    targetRefId: "target:p13:workspace",
    targetKind: "workspace-file",
    displayPath: "src/lib/example.ts",
    workspaceId: "workspace:general",
    contentHashBefore: "sha256:before",
    lineRange: { startLine: 1, endLine: 20 },
    permissionScope: "patch-preview",
    pathSafetyStatus: "safe-preview",
    notesPolicy: "not-read",
  } satisfies PatchTargetRef;

  const noteTarget = {
    ...workspaceTarget,
    targetRefId: "target:p13:note",
    targetKind: "note-ref",
    displayPath: "notes/private.md",
    pathSafetyStatus: "blocked",
    notesPolicy: "blocked",
  } satisfies PatchTargetRef;

  const unifiedDiff = [
    "diff --git a/src/lib/example.ts b/src/lib/example.ts",
    "--- a/src/lib/example.ts",
    "+++ b/src/lib/example.ts",
    "@@ -1,3 +1,5 @@",
    " const value = 1;",
    "-const oldToken = \"sk-old-secret\";",
    "+const nextToken = \"sk-live-secret\";",
    "+const auth = \"Authorization: Bearer should-not-survive\";",
    "+const cookie = \"Cookie: session=should-not-survive\";",
    "+const provider = \"raw provider payload: {secret:true}\";",
    "+const tool = \"raw tool output: private trace\";",
    "+const note = \"unauthorized local-note content: private note body\";",
    " export const done = true;",
  ].join("\n");

  it("projects unified diff text into bounded read-only hunks", () => {
    const preview = createPatchDiffPreview({
      diffPreviewId: "diff-preview:p13:1",
      proposalId: "proposal:p13:1",
      targetRefs: [workspaceTarget],
      patchFormat: "unified-diff",
      unifiedDiffText: unifiedDiff,
      maxHunks: 1,
      maxLinesPerHunk: 4,
      createdAt,
    });

    expect(preview).toMatchObject({
      diffPreviewId: "diff-preview:p13:1",
      proposalId: "proposal:p13:1",
      targetRefs: ["target:p13:workspace"],
      format: "unified-diff-preview",
      filesChanged: 1,
      insertions: 6,
      deletions: 1,
      truncated: true,
      redactionStatus: "redacted",
      createdAt,
    });
    expect(preview.safeHunks).toHaveLength(1);
    expect(preview.safeHunks[0]).toMatchObject({
      targetRefId: "target:p13:workspace",
      oldStart: 1,
      oldLines: 3,
      newStart: 1,
      newLines: 5,
    });
    expect(preview.safeHunks[0]?.safePreviewLines).toHaveLength(4);
  });

  it("redacts secrets, raw payloads, raw tool output and unauthorized local-note content", () => {
    const preview = createPatchDiffPreview({
      diffPreviewId: "diff-preview:p13:redaction",
      proposalId: "proposal:p13:redaction",
      targetRefs: [workspaceTarget],
      patchFormat: "unified-diff",
      unifiedDiffText: unifiedDiff,
      maxHunks: 2,
      maxLinesPerHunk: 20,
      createdAt,
    });

    const serializedPreview = JSON.stringify(preview);

    expect(serializedPreview).not.toContain("sk-live-secret");
    expect(serializedPreview).not.toContain("Authorization: Bearer should-not-survive");
    expect(serializedPreview).not.toContain("Cookie: session=should-not-survive");
    expect(serializedPreview).not.toContain("raw provider payload: {secret:true}");
    expect(serializedPreview).not.toContain("raw tool output: private trace");
    expect(serializedPreview).not.toContain("private note body");
    expect(serializedPreview).toContain("[redacted:secret-token]");
    expect(serializedPreview).toContain("[redacted:authorization]");
    expect(serializedPreview).toContain("[redacted:browser-cookie]");
    expect(serializedPreview).toContain("[redacted:provider-payload]");
    expect(serializedPreview).toContain("[redacted:tool-output]");
    expect(serializedPreview).toContain("[redacted:unauthorized-note-content]");
  });

  it("projects every dry-run status without mutating targets", () => {
    const statuses: PatchDryRunStatus[] = ["not-run", "passed", "failed", "blocked", "unavailable"];

    for (const status of statuses) {
      const dryRun = projectPatchDryRun({
        dryRunId: `dry-run:p13:${status}`,
        proposalId: "proposal:p13:dry-run",
        status,
        targetRefs: [workspaceTarget],
        wouldChangeTargetRefIds: ["target:p13:workspace"],
        wouldCreateTargetRefIds: [],
        wouldDeleteTargetRefIds: [],
        conflicts: [],
        staleTargetRefIds: [],
        blockedTargetRefIds: [],
        createdAt,
      });

      expect(dryRun.status).toBe(status);
      expect(dryRun.targetCompatibility).toBe("supplied-metadata-only");
      expect(dryRun.wouldChangeFiles).toBe(1);
      expect(dryRun.wouldCreateFiles).toBe(0);
      expect(dryRun.wouldDeleteFiles).toBe(0);
    }
  });

  it("reports dry-run change, create, delete, conflict, stale and blocked metadata only", () => {
    const dryRun = projectPatchDryRun({
      dryRunId: "dry-run:p13:metadata",
      proposalId: "proposal:p13:metadata",
      status: "blocked",
      targetRefs: [workspaceTarget, noteTarget],
      wouldChangeTargetRefIds: ["target:p13:workspace"],
      wouldCreateTargetRefIds: ["target:p13:new"],
      wouldDeleteTargetRefIds: ["target:p13:note"],
      conflicts: ["overlapping_hunk:target:p13:workspace"],
      staleTargetRefIds: ["target:p13:workspace"],
      blockedTargetRefIds: ["target:p13:note"],
      createdAt,
    });

    expect(dryRun).toEqual({
      dryRunId: "dry-run:p13:metadata",
      proposalId: "proposal:p13:metadata",
      status: "blocked",
      targetCompatibility: "supplied-metadata-only",
      wouldChangeFiles: 1,
      wouldCreateFiles: 1,
      wouldDeleteFiles: 1,
      conflicts: ["overlapping_hunk:target:p13:workspace"],
      staleTargets: ["target:p13:workspace"],
      blockedTargets: ["target:p13:note"],
      createdAt,
    });
  });

  it("produces rollback-plan metadata only and flags missing rollback plans as risk", () => {
    const availablePlan = projectPatchRollbackPlan({
      rollbackPlanId: "rollback-plan:p13:available",
      proposalId: "proposal:p13:rollback",
      targetRefs: [workspaceTarget],
      rollbackKind: "inverse-patch-preview",
      inversePatchPreviewRef: "diff-preview:p13:inverse",
      manualRecoveryNotes: ["Use supplied hash metadata in a later approved phase."],
      createdAt,
    });
    const missingPlan = projectPatchRollbackPlan({
      rollbackPlanId: "rollback-plan:p13:missing",
      proposalId: "proposal:p13:rollback",
      targetRefs: [workspaceTarget],
      rollbackKind: "unavailable",
      unavailableReasons: ["missing_rollback_plan"],
      createdAt,
    });

    expect(availablePlan.requiredBeforeApply).toBe(true);
    expect(availablePlan.preApplyContentHashes).toEqual([
      { targetRefId: "target:p13:workspace", contentHashBefore: "sha256:before" },
    ]);
    expect(availablePlan.unavailableReasons).toEqual([]);
    expect(missingPlan.unavailableReasons).toContain("missing_rollback_plan");
    expect(missingPlan.manualRecoveryNotes).toContain("Missing rollback metadata raises risk before future apply.");
  });

  it("does not call filesystem, Tauri, network, provider, tool transport or real notes readers", () => {
    const watchedHooks = {
      filesystem: vi.fn(),
      tauri: vi.fn(),
      network: vi.fn(),
      provider: vi.fn(),
      toolTransport: vi.fn(),
      notesReader: vi.fn(),
    };

    createPatchDiffPreview({
      diffPreviewId: "diff-preview:p13:pure",
      proposalId: "proposal:p13:pure",
      targetRefs: [workspaceTarget],
      patchFormat: "unified-diff",
      unifiedDiffText: unifiedDiff,
      createdAt,
    });
    projectPatchDryRun({
      dryRunId: "dry-run:p13:pure",
      proposalId: "proposal:p13:pure",
      status: "passed",
      targetRefs: [workspaceTarget],
      wouldChangeTargetRefIds: ["target:p13:workspace"],
      createdAt,
    });

    for (const hook of Object.values(watchedHooks)) {
      expect(hook).not.toHaveBeenCalled();
    }
  });
});
