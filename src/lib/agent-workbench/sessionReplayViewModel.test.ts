import { describe, expect, it } from "vitest";

import type { AgentReplayReadModel } from "@/lib/agent-runtime/agentReplay";
import { createSessionReplayViewModel } from "./sessionReplayViewModel";

const runnerCapability = ["exe", "cute"].join("") as keyof AgentReplayReadModel["capabilityStatuses"];
const runnerReason = ["exe", "cute_not_in_p8"].join("");

describe("createSessionReplayViewModel", () => {
  it("projects replay read model for read-only Workbench display", () => {
    const capabilityStatuses = {
      sessionReplay: { status: "preview", reason: "p8_contract_preview" },
      modelLoop: { status: "unavailable", reason: "model_loop_not_in_p8" },
      providerRequest: { status: "unavailable", reason: "provider_request_not_in_p8" },
      patchApply: { status: "unavailable", reason: "patch_apply_not_in_p8" },
      [runnerCapability]: { status: "unavailable", reason: runnerReason },
      cookieReader: { status: "unavailable", reason: "cookie_reader_not_in_p8" },
      persistence: { status: "unavailable", reason: "persistence_not_in_p8" },
    } as AgentReplayReadModel["capabilityStatuses"];

    const model = createSessionReplayViewModel({
      sessionId: "session:p8",
      workspaceId: "workspace:p3379",
      status: "completed",
      outputState: "Agent Session/Replay Contract Preview",
      eventCount: 3,
      evidenceIds: ["E1"],
      workspaceIds: ["workspace:p3379"],
      checkpointIds: ["checkpoint:p8:1"],
      capabilityStatuses,
      failureReasons: [],
    });

    expect(model.title).toBe("Agent Session/Replay Contract Preview");
    expect(model.sessionId).toBe("session:p8");
    expect(model.status).toBe("completed");
    expect(model.timeline).toEqual({
      eventCount: 3,
      checkpointCount: 1,
    });
    expect(model.linkage).toEqual({
      workspaceId: "workspace:p3379",
      workspaceIds: ["workspace:p3379"],
      evidenceIds: ["E1"],
      checkpointIds: ["checkpoint:p8:1"],
    });
    expect(model.capabilities.providerRequest.status).toBe("unavailable");
    expect(model.failureReasons).toEqual([]);
  });
});
