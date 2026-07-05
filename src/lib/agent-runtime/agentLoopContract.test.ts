import { describe, expect, it } from "vitest";

import { createPreviewAgentLoopContract } from "./agentLoopContract";

describe("createPreviewAgentLoopContract", () => {
  it("marks preview loop capabilities without mature execution", () => {
    const contract = createPreviewAgentLoopContract();

    expect(contract.mode).toBe("preview_one_shot");
    expect(contract.toolRequest.status).toBe("preview");
    expect(contract.permissionDecision.status).toBe("preview");
    expect(contract.toolExecution.status).toBe("preview");
    expect(contract.modelStep.status).toBe("unavailable");
    expect(contract.patchApply.status).toBe("unavailable");
    expect(contract.sessionPersistence.status).toBe("unavailable");
    expect(contract.continuation.status).toBe("reserved");
    expect(contract.compaction.status).toBe("reserved");
  });

  it("keeps unavailable and reserved capabilities from claiming ready status", () => {
    const contract = createPreviewAgentLoopContract();
    const capabilityStatuses = [
      contract.modelStep.status,
      contract.toolRequest.status,
      contract.permissionDecision.status,
      contract.toolExecution.status,
      contract.observation.status,
      contract.continuation.status,
      contract.interruption.status,
      contract.compaction.status,
      contract.patchGeneration.status,
      contract.patchApply.status,
      contract.sessionPersistence.status,
    ];

    expect(capabilityStatuses).not.toContain("ready");
    expect(contract.modelStep.reason).toBe("model_loop_unavailable");
    expect(contract.patchApply.reason).toBe("patch_apply_unavailable");
    expect(contract.sessionPersistence.reason).toBe("session_persistence_unavailable");
    expect(contract.continuation.reason).toBe("continuation_reserved");
    expect(contract.compaction.reason).toBe("compaction_reserved");
  });
});
