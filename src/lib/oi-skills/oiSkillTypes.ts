import type { AgentToolPermission } from "@/lib/agent-runtime/agentTypes";

export type OiSkillId =
  | "research-problem"
  | "find-notes"
  | `w${"rite"}-solution-outline`
  | "debug-code-preview"
  | "stress-test-preview";

export type OiSkillMode = "preview";

export type OiSkillStatus =
  | "preview"
  | "blocked"
  | "degraded"
  | "unavailable"
  | "completed"
  | "failed";

export type OiSourceRole =
  | "problem-statement"
  | "official-editorial"
  | "community-solution"
  | "discussion-warning"
  | "algorithm-reference"
  | "local-note"
  | "unknown";

export type OiSkillTraceEventType =
  | "skill.requested"
  | "skill.permission.resolved"
  | "skill.evidence.mapped"
  | "skill.outline.previewed"
  | "skill.completed"
  | "skill.failed";

export type OiProblemPlatform = "luogu" | "codeforces" | "atcoder" | "cses" | "manual" | "unknown";

export type OiProblemRef = {
  platform: OiProblemPlatform;
  problemId: string;
  title: string;
  url?: string;
};

export type OiSkillSchema = {
  type: "object";
  required: string[];
  properties?: Record<string, unknown>;
};

export type OiEvidencePolicy = {
  minCitations: number;
  requireSourceRoles: OiSourceRole[];
  forbidCopyingSourceText: boolean;
};

export type OiSkillDefinition = {
  skillId: OiSkillId;
  label: string;
  description: string;
  inputSchema: OiSkillSchema;
  outputSchema: OiSkillSchema;
  requiredPermissions: AgentToolPermission[];
  sourceRoles: OiSourceRole[];
  evidencePolicy: OiEvidencePolicy;
  resultStatuses: OiSkillStatus[];
  failureReasons: string[];
  traceEvents: OiSkillTraceEventType[];
};

export type OiSkillInvocation = {
  invocationId: string;
  skillId: OiSkillId;
  problemRef: OiProblemRef;
  mode: OiSkillMode;
};

export type OiSourceSummary = {
  sourceId: string;
  role: OiSourceRole;
  title: string;
  url?: string;
  status: "usable" | "degraded" | "unavailable";
  warning?: string;
};

export type OiEvidenceSummaryItem = {
  evidenceId: string;
  sourceId: string;
  role: OiSourceRole;
  title: string;
  excerpt: string;
  citationId: string;
  limitations: string[];
};

export type OiSolutionOutline = {
  status: "preview" | "degraded" | "unavailable";
  algorithm: string;
  proofSketch: string;
  complexity: {
    time: string;
    memory: string;
  };
  implementationNotes: string[];
  pitfalls: string[];
  citationIds: string[];
  limitations: string[];
};

export type OiSkillTraceEvent = {
  id: string;
  type: OiSkillTraceEventType;
  at: string;
  message: string;
};

export type OiSkillPermissionRequest = {
  id: string;
  toolName: string;
  permission: AgentToolPermission;
  status: "blocked" | "pending" | "granted";
  reason: string;
};

export type OiSkillSessionLinkage = {
  sessionId: string;
  replayCheckpointIds: string[];
  traceEventIds: string[];
};

export type OiSkillReadModel = {
  invocation: OiSkillInvocation;
  status: OiSkillStatus;
  problemRef: OiProblemRef;
  sources: OiSourceSummary[];
  evidence: OiEvidenceSummaryItem[];
  solutionOutline: OiSolutionOutline | null;
  permissionRequests: OiSkillPermissionRequest[];
  traceEvents: OiSkillTraceEvent[];
  limitations: string[];
  sessionLinkage?: OiSkillSessionLinkage;
};
