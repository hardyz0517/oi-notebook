import type { AgentEvent, AgentSessionMetadata, AgentSessionState, AgentSessionStatus } from "./agentTypes";

let sessionCounter = 0;

const createSessionId = (): string => {
  sessionCounter += 1;
  return `session:${sessionCounter}`;
};

export function createAgentSession(input: { workspaceId: string; context?: Record<string, unknown> }): AgentSessionState {
  return {
    id: createSessionId(),
    workspaceId: input.workspaceId,
    status: "idle",
    plan: [],
    context: input.context ?? {},
    events: [],
  };
}

export function appendSessionEvent(session: AgentSessionState, event: AgentEvent): AgentSessionState {
  return {
    ...session,
    events: [...session.events, event],
  };
}

export function markSessionStatus(session: AgentSessionState, status: AgentSessionStatus): AgentSessionState {
  return {
    ...session,
    status,
  };
}

export function createAgentSessionMetadata(input: {
  sessionId: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  privacyPolicyId: string;
}): AgentSessionMetadata {
  return {
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    phase: "P8 Agent Session / Replay Contract Freeze",
    inputState: "OI Research/Solution Skill Contract Preview",
    outputState: "Agent Session/Replay Contract Preview",
    status: "replayable",
    privacyPolicyId: input.privacyPolicyId,
    replaySource: "fixture",
    capabilities: {
      sessionReplay: { status: "preview", reason: "p8_contract_preview" },
      modelLoop: { status: "unavailable", reason: "model_loop_not_in_p8" },
      providerRequest: { status: "unavailable", reason: "provider_request_not_in_p8" },
      patchApply: { status: "unavailable", reason: "patch_apply_not_in_p8" },
      execute: { status: "unavailable", reason: "execute_not_in_p8" },
      cookieReader: { status: "unavailable", reason: "cookie_reader_not_in_p8" },
      persistence: { status: "unavailable", reason: "persistence_not_in_p8" },
    },
  };
}
