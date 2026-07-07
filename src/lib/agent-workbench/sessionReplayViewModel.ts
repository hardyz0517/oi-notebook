import type { AgentReplayReadModel } from "@/lib/agent-runtime/agentReplay";

export type SessionReplayViewModel = {
  title: "Agent Session/Replay Contract Preview";
  sessionId: string;
  status: AgentReplayReadModel["status"];
  timeline: {
    eventCount: number;
    checkpointCount: number;
  };
  linkage: {
    workspaceId: string;
    workspaceIds: string[];
    evidenceIds: string[];
    checkpointIds: string[];
  };
  capabilities: AgentReplayReadModel["capabilityStatuses"];
  failureReasons: AgentReplayReadModel["failureReasons"];
};

export function createSessionReplayViewModel(readModel: AgentReplayReadModel): SessionReplayViewModel {
  return {
    title: "Agent Session/Replay Contract Preview",
    sessionId: readModel.sessionId,
    status: readModel.status,
    timeline: {
      eventCount: readModel.eventCount,
      checkpointCount: readModel.checkpointIds.length,
    },
    linkage: {
      workspaceId: readModel.workspaceId,
      workspaceIds: readModel.workspaceIds,
      evidenceIds: readModel.evidenceIds,
      checkpointIds: readModel.checkpointIds,
    },
    capabilities: readModel.capabilityStatuses,
    failureReasons: readModel.failureReasons,
  };
}
