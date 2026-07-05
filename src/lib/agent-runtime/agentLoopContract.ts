import type { AgentLoopCapability, AgentLoopContract } from "./agentTypes";

const preview = (reason: string): AgentLoopCapability => ({ status: "preview", reason });
const reserved = (reason: string): AgentLoopCapability => ({ status: "reserved", reason });
const unavailable = (reason: string): AgentLoopCapability => ({ status: "unavailable", reason });

export function createPreviewAgentLoopContract(): AgentLoopContract {
  return {
    mode: "preview_one_shot",
    modelStep: unavailable("model_loop_unavailable"),
    toolRequest: preview("one_shot_tool_request_preview"),
    permissionDecision: preview("permission_policy_preview"),
    toolExecution: preview("one_shot_tool_execution_preview"),
    observation: reserved("observation_protocol_reserved"),
    continuation: reserved("continuation_reserved"),
    interruption: reserved("interruption_reserved"),
    compaction: reserved("compaction_reserved"),
    patchGeneration: unavailable("patch_generation_unavailable"),
    patchApply: unavailable("patch_apply_unavailable"),
    sessionPersistence: unavailable("session_persistence_unavailable"),
  };
}
