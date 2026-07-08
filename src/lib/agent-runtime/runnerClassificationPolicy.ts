import type {
  RunnerClassification,
  RunnerCommandClass,
  RunnerKind,
  RunnerLanguageClass,
  RunnerRequestedCapability,
  RunnerRiskLevel,
  RunnerTargetRef,
  RunnerTestRunClass,
} from "./runnerContractTypes";

export type ClassifyRunnerCommandInput = {
  command?: string;
  runnerKind?: RunnerKind;
};

export type ClassifyRunnerTestRunInput = {
  command?: string;
  runnerKind?: RunnerKind;
  testIntent?: string;
};

export type ClassifyRunnerRequestInput = {
  executionRequestId: string;
  runnerKind: RunnerKind;
  command?: string;
  languageId?: string;
  testIntent?: string;
  workspaceRefs: string[];
  workingDirectoryRef: string;
  targetRefs: RunnerTargetRef[];
  maxOutputBytes?: number;
  requestedCapabilities?: RunnerRequestedCapability[];
  requestedTrueExecution?: boolean;
  createdAt: string;
};

const MAX_BOUNDED_OUTPUT_BYTES = 1024 * 1024;

const SECRET_CAPABILITIES = new Set<RunnerRequestedCapability>(["cookie", "secret"]);
const WRITE_CAPABILITIES = new Set<RunnerRequestedCapability>([
  "filesystem-mutation",
  "delete",
  "rollback-execution",
  "patch-apply",
]);

const BLOCKED_CAPABILITY_REASONS: Record<RunnerRequestedCapability, string> = {
  network: "network_access_blocked_in_p14",
  cookie: "cookie_access_blocked_in_p14",
  secret: "secret_access_blocked_in_p14",
  "filesystem-mutation": "direct_filesystem_mutation_blocked_in_p14",
  delete: "delete_blocked_in_p14",
  "rollback-execution": "rollback_execution_blocked_in_p14",
  "patch-apply": "patch_apply_blocked_in_p14",
  "direct-tauri-bypass": "direct_tauri_bypass_blocked_in_p14",
  "true-execution": "requested_true_execution_unavailable_in_p14",
  "unbounded-output": "unbounded_output_blocked_in_p14",
};

export function classifyRunnerCommand(input: ClassifyRunnerCommandInput): RunnerCommandClass {
  if (input.runnerKind === "unsupported" || input.runnerKind === "reserved") {
    return "unsupported";
  }

  const command = normalizeText(input.command);

  if (command.length === 0) {
    return "unknown";
  }

  if (/\b(rm\s+-rf|del\s+\/|remove-item|format\s+[a-z]:|drop\s+table)\b/i.test(command)) {
    return "destructive";
  }

  if (/\b(curl|wget|fetch|http:|https:|ssh|scp)\b/i.test(command)) {
    return "networked";
  }

  if (input.runnerKind === "stress-test" || /\b(stress|fuzz|random\s+cases|duipai|对拍)\b/i.test(command)) {
    return "stress-test";
  }

  if (input.runnerKind === "linter" || /\b(eslint|stylelint|clippy|ruff|flake8|lint)\b/i.test(command)) {
    return "lint";
  }

  if (input.runnerKind === "formatter" || /\b(prettier|rustfmt|clang-format|format|fmt)\b/i.test(command)) {
    return "format";
  }

  if (/\b(write-file|writefile|writes?|mkdir|copy-item|move-item|touch|tee|>\s*\S+)\b/i.test(command)) {
    return "mutating";
  }

  if (input.runnerKind === "compile-run" || /\b(tsc|g\+\+|gcc|clang\+\+|javac|rustc|cargo\s+check)\b/i.test(command)) {
    return "compile";
  }

  if (/\b(build|vite\s+build|pnpm\s+build|npm\s+run\s+build|cargo\s+build)\b/i.test(command)) {
    return "build";
  }

  if (input.runnerKind === "test-run" || /\b(test|vitest|jest|pytest|cargo\s+test|sample)\b/i.test(command)) {
    return "test";
  }

  if (/\b(rg|grep|select-string|cat|type|get-content|ls|dir|find)\b/i.test(command)) {
    return "read-only-inspection";
  }

  return "unknown";
}

export function classifyRunnerLanguage(languageHint?: string): RunnerLanguageClass {
  const hint = normalizeText(languageHint);

  if (hint.length === 0) {
    return "unknown";
  }

  if (hint === "unsupported") {
    return "unsupported";
  }

  if (/\b(cpp|c\+\+|g\+\+|clang\+\+)\b|\.cc\b|\.cpp\b|\.cxx\b|\.hpp\b/i.test(hint)) {
    return "cpp";
  }

  if (/\b(python|python3|py|pytest)\b|\.py\b/i.test(hint)) {
    return "python";
  }

  if (/\b(typescript|tsc|tsx)\b|\.ts\b|\.tsx\b/i.test(hint)) {
    return "typescript";
  }

  if (/\b(javascript|node|npm|js|jsx)\b|\.js\b|\.jsx\b/i.test(hint)) {
    return "javascript";
  }

  if (/\b(rust|cargo|rustc)\b|\.rs\b/i.test(hint)) {
    return "rust";
  }

  if (/\b(shell|bash|zsh|pwsh|powershell|cmd)\b|\.sh\b|\.ps1\b|\.bat\b/i.test(hint)) {
    return "shell";
  }

  if (/\b(markdown|md)\b|\.md\b|\.markdown\b/i.test(hint)) {
    return "markdown";
  }

  if (/\b(text|txt|plain)\b|\.txt\b/i.test(hint)) {
    return "text";
  }

  return "unknown";
}

export function classifyRunnerTestRun(input: ClassifyRunnerTestRunInput): RunnerTestRunClass {
  if (input.runnerKind === "unsupported" || input.runnerKind === "reserved") {
    return "unsupported";
  }

  const text = normalizeText(`${input.testIntent ?? ""} ${input.command ?? ""}`);

  if (input.runnerKind === "stress-test" || /\b(stress|fuzz|random\s+cases|duipai|对拍)\b/i.test(text)) {
    return "stress-test";
  }

  if (/\b(benchmark|bench|hyperfine)\b/i.test(text)) {
    return "benchmark";
  }

  if (input.runnerKind === "compile-run" || /\b(compile|tsc|g\+\+|gcc|clang\+\+|cargo\s+check)\b/i.test(text)) {
    return "compile-check";
  }

  if (input.runnerKind === "linter" || /\b(lint|eslint|clippy|ruff|flake8)\b/i.test(text)) {
    return "lint-check";
  }

  if (input.runnerKind === "formatter" || /\b(format|prettier|rustfmt|clang-format|fmt)\b/i.test(text)) {
    return "format-check";
  }

  if (/\b(sample|stdin|fixture)\b/i.test(text)) {
    return "sample-test";
  }

  if (input.runnerKind === "test-run" || /\b(unit|vitest|jest|pytest|cargo\s+test|\.test\.)\b/i.test(text)) {
    return "unit-test";
  }

  return "not-a-test";
}

export function classifyRunnerRequest(input: ClassifyRunnerRequestInput): RunnerClassification {
  const requestedCapabilities = new Set(input.requestedCapabilities ?? []);
  const blockedReasons = collectBlockedReasons(input, requestedCapabilities);
  const commandClass = classifyRunnerCommand({ command: input.command, runnerKind: input.runnerKind });
  const languageClass = classifyRunnerLanguage(input.languageId ?? input.command ?? input.targetRefs[0]?.displayPath);
  const testRunClass = classifyRunnerTestRun({
    command: input.command,
    runnerKind: input.runnerKind,
    testIntent: input.testIntent,
  });
  const riskLevel = classifyRiskLevel(input, blockedReasons);

  return {
    classificationId: `${input.executionRequestId}:classification`,
    executionRequestId: input.executionRequestId,
    commandClass,
    languageClass,
    testRunClass,
    riskLevel,
    riskReasons: riskReasonsFor(input, riskLevel, blockedReasons),
    requiresHumanApproval: riskLevel === "high" || riskLevel === "blocked",
    requiresSandbox: riskLevel === "medium" || riskLevel === "high" || riskLevel === "blocked",
    requiresNetwork:
      requestedCapabilities.has("network") || commandClass === "networked" || input.targetRefs.some((ref) => ref.networkPolicy !== "none"),
    requiresSecrets: [...requestedCapabilities].some((capability) => SECRET_CAPABILITIES.has(capability)),
    requiresWritableWorkspace: [...requestedCapabilities].some((capability) => WRITE_CAPABILITIES.has(capability)),
    blockedReasons,
    createdAt: input.createdAt,
  };
}

export function collectRunnerRequestBlockedReasons(input: ClassifyRunnerRequestInput): string[] {
  return collectBlockedReasons(input, new Set(input.requestedCapabilities ?? []));
}

function collectBlockedReasons(
  input: ClassifyRunnerRequestInput,
  requestedCapabilities: Set<RunnerRequestedCapability>,
): string[] {
  const blockedReasons: string[] = [];

  if (input.targetRefs.length === 0) {
    blockedReasons.push("missing_target_refs");
  }

  if (input.runnerKind === "unsupported" || input.runnerKind === "reserved") {
    blockedReasons.push("unsupported_runner_kind");
  }

  if (!input.workspaceRefs.includes(input.workingDirectoryRef)) {
    blockedReasons.push("unknown_working_directory_ref");
  }

  if (input.maxOutputBytes === undefined || input.maxOutputBytes <= 0 || input.maxOutputBytes > MAX_BOUNDED_OUTPUT_BYTES) {
    blockedReasons.push("unbounded_output_blocked_in_p14");
  }

  for (const targetRef of input.targetRefs) {
    if (isRealNotesAccess(targetRef)) {
      blockedReasons.push(`real_notes_access_blocked_in_p14:${targetRef.targetRefId}`);
    }

    if (targetRef.pathSafetyStatus === "blocked" || targetRef.pathSafetyStatus === "unsupported") {
      blockedReasons.push(`blocked_path_safety:${targetRef.targetRefId}`);
    }
  }

  for (const capability of requestedCapabilities) {
    blockedReasons.push(BLOCKED_CAPABILITY_REASONS[capability]);
  }

  if (input.requestedTrueExecution === true && !requestedCapabilities.has("true-execution")) {
    blockedReasons.push("requested_true_execution_unavailable_in_p14");
  }

  return [...new Set(blockedReasons)];
}

function classifyRiskLevel(input: ClassifyRunnerRequestInput, blockedReasons: string[]): RunnerRiskLevel {
  if (blockedReasons.length > 0) {
    return "blocked";
  }

  if (
    input.targetRefs.some((targetRef) => targetRef.targetKind === "workspace-file" || targetRef.targetKind === "generated-artifact") ||
    input.targetRefs.length > 1
  ) {
    return "high";
  }

  if (input.runnerKind === "compile-run" || input.runnerKind === "test-run") {
    return "low";
  }

  return "low";
}

function riskReasonsFor(
  input: ClassifyRunnerRequestInput,
  riskLevel: RunnerRiskLevel,
  blockedReasons: string[],
): string[] {
  if (riskLevel === "blocked") {
    return [...blockedReasons];
  }

  if (riskLevel === "high") {
    return ["workspace_or_generated_target_requires_future_sandbox"];
  }

  if (input.runnerKind === "compile-run" || input.runnerKind === "test-run") {
    return ["fixture_only_classification_no_run"];
  }

  return ["read_only_or_fixture_only_classification_no_run"];
}

function isRealNotesAccess(targetRef: RunnerTargetRef): boolean {
  const displayPath = targetRef.displayPath.split("\\").join("/").toLowerCase();

  return (
    (targetRef.targetKind === "note-ref" || displayPath.startsWith("notes/")) &&
    targetRef.notesPolicy !== "fixture-only" &&
    targetRef.notesPolicy !== "ref-only"
  );
}

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
