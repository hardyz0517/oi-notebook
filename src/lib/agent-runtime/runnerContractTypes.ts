export const P14_RUNNER_SCHEMA_VERSION = 1 as const;
export const SUPPORTED_P14_RUNNER_SCHEMA_VERSIONS = [P14_RUNNER_SCHEMA_VERSION] as const;

export const P14_RUNNER_PHASE_NAME = "P14 Execute / Code Runner Contract Freeze" as const;
export const P14_RUNNER_INPUT_STATE = "Patch / Write Workflow Contract Preview" as const;
export const P14_RUNNER_OUTPUT_STATE = "Execute / Code Runner Contract Preview" as const;

export type P14RunnerSchemaVersion = typeof P14_RUNNER_SCHEMA_VERSION;
export type P14RunnerPhaseName = typeof P14_RUNNER_PHASE_NAME;
export type P14RunnerInputState = typeof P14_RUNNER_INPUT_STATE;
export type P14RunnerOutputState = typeof P14_RUNNER_OUTPUT_STATE;

export type RunnerCapabilityStatus = "preview" | "reserved" | "unavailable" | "denied" | "blocked";

export const P14_RUNNER_CAPABILITY_STATUSES: RunnerCapabilityStatus[] = [
  "preview",
  "reserved",
  "unavailable",
  "denied",
  "blocked",
];

export type RunnerRequestSourceKind =
  | "model-output"
  | "tool-observation"
  | "user-request"
  | "fixture"
  | "manual-import"
  | "replay-preview";

export type RunnerKind =
  | "shell-command"
  | "language-runtime"
  | "test-run"
  | "compile-run"
  | "stress-test"
  | "formatter"
  | "linter"
  | "unsupported"
  | "reserved";

export type RunnerCommandClass =
  | "read-only-inspection"
  | "build"
  | "test"
  | "compile"
  | "format"
  | "lint"
  | "stress-test"
  | "networked"
  | "mutating"
  | "destructive"
  | "unknown"
  | "unsupported";

export type RunnerLanguageClass =
  | "cpp"
  | "python"
  | "javascript"
  | "typescript"
  | "rust"
  | "shell"
  | "markdown"
  | "text"
  | "unknown"
  | "unsupported";

export type RunnerTestRunClass =
  | "unit-test"
  | "sample-test"
  | "compile-check"
  | "stress-test"
  | "benchmark"
  | "lint-check"
  | "format-check"
  | "not-a-test"
  | "unsupported";

export type RunnerRiskLevel = "low" | "medium" | "high" | "blocked";

export type RunnerIntent = {
  summary: string;
  commandClass: RunnerCommandClass;
  languageClass: RunnerLanguageClass;
  testRunClass: RunnerTestRunClass;
};

export type RunnerTargetKind =
  | "workspace-file"
  | "generated-artifact"
  | "scratch-fixture"
  | "note-ref"
  | "stdin-fixture"
  | "expected-output-fixture"
  | "unsupported";

export type RunnerPathSafetyStatus = "safe-preview" | "requires-review" | "blocked" | "unsupported" | "unknown";

export type RunnerNotesPolicy =
  | "not-read"
  | "fixture-only"
  | "ref-only"
  | "blocked"
  | "explicitly-approved-future-phase";

export type RunnerNetworkPolicy = "none" | "blocked" | "reserved-future-phase" | "requires-review";

export type RunnerTargetRef = {
  targetRefId: string;
  targetKind: RunnerTargetKind;
  displayPath: string;
  workspaceId: string;
  languageId: RunnerLanguageClass;
  contentHashBefore: string;
  inputRefs: string[];
  expectedOutputRefs: string[];
  permissionScope: string;
  pathSafetyStatus: RunnerPathSafetyStatus;
  notesPolicy: RunnerNotesPolicy;
  networkPolicy: RunnerNetworkPolicy;
};

export type RunnerClassification = {
  classificationId: string;
  executionRequestId: string;
  commandClass: RunnerCommandClass;
  languageClass: RunnerLanguageClass;
  testRunClass: RunnerTestRunClass;
  riskLevel: RunnerRiskLevel;
  riskReasons: string[];
  requiresHumanApproval: boolean;
  requiresSandbox: boolean;
  requiresNetwork: boolean;
  requiresSecrets: boolean;
  requiresWritableWorkspace: boolean;
  blockedReasons: string[];
  createdAt: string;
};

export type RunnerInputRef = {
  inputRefId: string;
  inputKind: "stdin-fixture" | "workspace-ref" | "generated-artifact" | "manual-entry" | "unsupported";
  safeSummary: string;
};

export type RunnerExpectedOutputRef = {
  outputRefId: string;
  outputKind: "expected-output-fixture" | "generated-artifact" | "manual-entry" | "unsupported";
  safeSummary: string;
};

export type RunnerSandboxProfile =
  | "preview-no-op"
  | "mock-runner"
  | "read-only-classification"
  | "fixture-simulation"
  | "reserved-future-sandbox"
  | "blocked";

export type RunnerAccessPolicy = "none" | "blocked" | "reserved-future-phase" | "requires-review";

export type RunnerSandboxPlan = {
  sandboxPlanId: string;
  profile: RunnerSandboxProfile;
  workingDirectoryRef: string;
  allowedTargetRefs: string[];
  networkAccess: RunnerAccessPolicy;
  secretAccess: RunnerAccessPolicy;
  credentialAccess: RunnerAccessPolicy;
  writeAccess: RunnerAccessPolicy;
  maxFilesTouched: number;
  timeoutMs: number;
  maxOutputBytes: number;
  maxInputBytes: number;
  environmentPolicy: string;
  cleanupPolicy: string;
  blockedReasons: string[];
  createdAt: string;
};

export type RunnerResourceLimits = {
  timeoutMs: number;
  maxOutputBytes: number;
  maxInputBytes: number;
  maxFilesTouched: number;
  networkAccess: RunnerAccessPolicy;
  secretAccess: RunnerAccessPolicy;
  writeAccess: RunnerAccessPolicy;
  trueExecution: "unavailable" | "reserved" | "blocked";
};

export type RunnerPermissionKind =
  | "execute"
  | "public-network"
  | "write"
  | "patch-apply"
  | "delete"
  | "rollback"
  | "destructive";

export type RunnerPermissionDecisionStatus =
  | "prompt-required"
  | "denied"
  | "blocked-by-configuration"
  | "unavailable"
  | "reserved";

export type RunnerPermissionRequest = {
  permissionRequestId: string;
  executionRequestId: string;
  permissionKind: RunnerPermissionKind;
  decisionStatus: RunnerPermissionDecisionStatus;
  riskLevel: RunnerRiskLevel;
  reason: string;
  requestedByEventId: string;
  targetRefs: string[];
  sandboxPlanId: string;
  approvalSurface: string;
  expiresAt?: string;
  createdAt: string;
};

export type RunnerApprovalDecisionStatus =
  | "pending"
  | "approved-for-future-execute"
  | "denied"
  | "blocked"
  | "expired"
  | "unavailable";

export type RunnerApprovalDecisionReadModel = {
  approvalDecisionId: string;
  permissionRequestId: string;
  executionRequestId: string;
  status: RunnerApprovalDecisionStatus;
  decidedBy: string;
  safeReason: string;
  visibleConsequences: string[];
  blockedCapabilities: string[];
  eventIds: string[];
  createdAt: string;
};

export type RunnerMockMode =
  | "dry-run"
  | "classification-only"
  | "fixture-simulation"
  | "mock-success"
  | "mock-failure"
  | "unavailable"
  | "blocked";

export type RunnerMockStatus = "not-run" | "planned" | "completed" | "failed" | "blocked" | "unavailable";

export type RunnerMockResult = {
  mockResultId: string;
  executionRequestId: string;
  mode: RunnerMockMode;
  status: RunnerMockStatus;
  plannedRunnerKind: RunnerKind;
  plannedSandboxProfile: RunnerSandboxProfile;
  safeInputSummary: string;
  safeOutputSummary: string;
  exitCodePreview: number | null;
  durationMsPreview: number;
  filesTouchedPreview: number;
  networkAccessPreview: RunnerAccessPolicy;
  resourceLimitPreview: string;
  observationId: string;
  safeErrors: string[];
  createdAt: string;
};

export type RunnerRedactionStatus = "not-needed" | "redacted" | "blocked" | "unavailable";

export type RunnerObservationStatus =
  | "not-run"
  | "simulated"
  | "mock-completed"
  | "mock-failed"
  | "blocked"
  | "unavailable";

export type RunnerContinuationVisibility =
  | "timeline-visible"
  | "summary-only"
  | "redacted"
  | "runtime-only"
  | "quarantined";

export type RunnerObservationPolicy = {
  observationId: string;
  executionRequestId: string;
  mockResultId: string;
  sourceEventIds: string[];
  status: RunnerObservationStatus;
  safeSummary: string;
  boundedStdout: string;
  boundedStderr: string;
  exitCodePreview: number | null;
  redactionStatus: RunnerRedactionStatus;
  droppedFields: string[];
  truncated: boolean;
  maxOutputBytes: number;
  continuationVisibility: RunnerContinuationVisibility;
  createdAt: string;
};

export type RunnerRollbackCleanupPlan = {
  rollbackCleanupPlanId: string;
  executionRequestId: string;
  requiredBeforeExecute: boolean;
  preRunContentHashes: Array<{
    targetRefId: string;
    contentHashBefore: string;
  }>;
  affectedTargetRefs: string[];
  temporaryDirectoryPolicy: string;
  artifactRetentionPolicy: string;
  cleanupStepsPreview: string[];
  recoveryStrategy: string;
  unavailableReasons: string[];
  createdAt: string;
};

export type RunnerRedactionResult = {
  redactionStatus: RunnerRedactionStatus;
  redactedClasses: string[];
  safeSummary: string;
};

export type RunnerExecutionRequestEnvelope = {
  executionRequestId: string;
  sessionId: string;
  turnId: string;
  stepId: string;
  sourceKind: RunnerRequestSourceKind;
  sourceEventIds: string[];
  workspaceRefs: string[];
  evidenceRefs: string[];
  targetRefs: RunnerTargetRef[];
  runnerKind: RunnerKind;
  runnerIntent: RunnerIntent;
  classification: RunnerClassification;
  requestedInputs: RunnerInputRef[];
  expectedOutputs: RunnerExpectedOutputRef[];
  sandboxPlan: RunnerSandboxPlan;
  resourceLimits: RunnerResourceLimits;
  permissionRequest: RunnerPermissionRequest;
  approvalDecision: RunnerApprovalDecisionReadModel;
  mockResult: RunnerMockResult;
  observationPolicy: RunnerObservationPolicy;
  rollbackCleanupPlan: RunnerRollbackCleanupPlan;
  redactionResult: RunnerRedactionResult;
  createdAt: string;
  schemaVersion: P14RunnerSchemaVersion;
  outputState: P14RunnerOutputState;
  capabilityStatus: RunnerCapabilityStatus;
};

export type CreateRunnerExecutionRequestEnvelopeInput = Omit<
  RunnerExecutionRequestEnvelope,
  "schemaVersion" | "outputState"
> & {
  schemaVersion?: P14RunnerSchemaVersion;
};

export type SuccessfulP14RunnerEventType =
  | "runner.requested"
  | "runner.classified"
  | "runner.permission.required"
  | "runner.permission.resolved"
  | "runner.sandbox.planned"
  | "runner.mock.started"
  | "runner.mock.completed"
  | "runner.mock.failed"
  | "runner.observation.added"
  | "runner.blocked"
  | "runner.unavailable";

export type ReservedP14RunnerEventType =
  | "runner.started"
  | "runner.completed"
  | "runner.failed"
  | "runner.cancelled"
  | "command.executed"
  | "process.started"
  | "process.completed"
  | "test-run.executed"
  | "stress-test.executed"
  | "artifact.written"
  | "cleanup.executed"
  | "rollback.executed";

export type P14RunnerEventType = SuccessfulP14RunnerEventType | ReservedP14RunnerEventType;

export const P14_SUCCESSFUL_RUNNER_EVENT_TYPES: SuccessfulP14RunnerEventType[] = [
  "runner.requested",
  "runner.classified",
  "runner.permission.required",
  "runner.permission.resolved",
  "runner.sandbox.planned",
  "runner.mock.started",
  "runner.mock.completed",
  "runner.mock.failed",
  "runner.observation.added",
  "runner.blocked",
  "runner.unavailable",
];

export const P14_RESERVED_TRUE_EXECUTION_EVENT_TYPES: ReservedP14RunnerEventType[] = [
  "runner.started",
  "runner.completed",
  "runner.failed",
  "runner.cancelled",
  "command.executed",
  "process.started",
  "process.completed",
  "test-run.executed",
  "stress-test.executed",
  "artifact.written",
  "cleanup.executed",
  "rollback.executed",
];

export function createRunnerExecutionRequestEnvelope(
  input: CreateRunnerExecutionRequestEnvelopeInput,
): RunnerExecutionRequestEnvelope {
  return {
    ...input,
    schemaVersion: input.schemaVersion ?? P14_RUNNER_SCHEMA_VERSION,
    outputState: P14_RUNNER_OUTPUT_STATE,
  };
}

export function isSuccessfulP14RunnerEventType(eventType: string): eventType is SuccessfulP14RunnerEventType {
  return P14_SUCCESSFUL_RUNNER_EVENT_TYPES.includes(eventType as SuccessfulP14RunnerEventType);
}

export function isReservedP14RunnerEventType(eventType: string): eventType is ReservedP14RunnerEventType {
  return P14_RESERVED_TRUE_EXECUTION_EVENT_TYPES.includes(eventType as ReservedP14RunnerEventType);
}
