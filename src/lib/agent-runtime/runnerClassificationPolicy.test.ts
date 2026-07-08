import { describe, expect, it } from "vitest";

import {
  classifyRunnerCommand,
  classifyRunnerLanguage,
  classifyRunnerRequest,
  classifyRunnerTestRun,
  type ClassifyRunnerRequestInput,
} from "./runnerClassificationPolicy";
import type { RunnerTargetRef } from "./runnerContractTypes";

describe("P14 runner classification policy", () => {
  const createdAt = "2026-07-08T00:00:00.000Z";

  const scratchTarget = {
    targetRefId: "target:p14:scratch",
    targetKind: "scratch-fixture",
    displayPath: "fixtures/main.cpp",
    workspaceId: "workspace:p14:fixture",
    languageId: "cpp",
    contentHashBefore: "sha256:fixture",
    inputRefs: ["input:p14:sample"],
    expectedOutputRefs: ["expected:p14:sample"],
    permissionScope: "runner-preview",
    pathSafetyStatus: "safe-preview",
    notesPolicy: "fixture-only",
    networkPolicy: "none",
  } satisfies RunnerTargetRef;

  function makeInput(overrides: Partial<ClassifyRunnerRequestInput> = {}): ClassifyRunnerRequestInput {
    return {
      executionRequestId: "exec-request:p14:classify",
      runnerKind: "test-run",
      command: "vitest run src/lib/example.test.ts",
      languageId: "typescript",
      testIntent: "unit",
      workspaceRefs: ["workspace:p14:fixture"],
      workingDirectoryRef: "workspace:p14:fixture",
      targetRefs: [scratchTarget],
      maxOutputBytes: 4096,
      requestedCapabilities: [],
      createdAt,
      ...overrides,
    };
  }

  it("classifies supported command classes without executing anything", () => {
    const cases = [
      ["rg -n runner src/lib", "read-only-inspection"],
      ["pnpm build", "build"],
      ["vitest run src/lib/example.test.ts", "test"],
      ["g++ main.cpp -std=c++20", "compile"],
      ["prettier --write src/lib/example.ts", "format"],
      ["eslint src/lib", "lint"],
      ["run stress test for random inputs", "stress-test"],
      ["curl https://example.com", "networked"],
      ["node script-that-writes-file.js", "mutating"],
      ["rm -rf dist", "destructive"],
      ["", "unknown"],
    ] as const;

    for (const [command, expected] of cases) {
      expect(classifyRunnerCommand({ command, runnerKind: "shell-command" })).toBe(expected);
    }

    expect(classifyRunnerCommand({ command: "whatever", runnerKind: "unsupported" })).toBe("unsupported");
  });

  it("classifies supported language classes from ids, filenames and commands", () => {
    const cases = [
      ["main.cpp", "cpp"],
      ["python3 solution.py", "python"],
      ["node index.js", "javascript"],
      ["src/lib/example.ts", "typescript"],
      ["cargo test", "rust"],
      ["pwsh ./script.ps1", "shell"],
      ["README.md", "markdown"],
      ["plain text note", "text"],
      ["", "unknown"],
      ["unsupported", "unsupported"],
    ] as const;

    for (const [languageHint, expected] of cases) {
      expect(classifyRunnerLanguage(languageHint)).toBe(expected);
    }
  });

  it("classifies supported test-run classes without spawning runners", () => {
    const cases = [
      [{ command: "vitest run example.test.ts", runnerKind: "test-run", testIntent: "unit" }, "unit-test"],
      [{ command: "run sample input against fixture", runnerKind: "test-run", testIntent: "sample" }, "sample-test"],
      [{ command: "tsc --noEmit", runnerKind: "compile-run", testIntent: "compile" }, "compile-check"],
      [{ command: "stress tester random cases", runnerKind: "stress-test", testIntent: "stress" }, "stress-test"],
      [{ command: "hyperfine node index.js", runnerKind: "test-run", testIntent: "benchmark" }, "benchmark"],
      [{ command: "eslint src/lib", runnerKind: "linter", testIntent: "lint" }, "lint-check"],
      [{ command: "prettier --check src/lib", runnerKind: "formatter", testIntent: "format" }, "format-check"],
      [{ command: "rg -n runner src/lib", runnerKind: "shell-command", testIntent: "inspect" }, "not-a-test"],
      [{ command: "whatever", runnerKind: "unsupported", testIntent: "unit" }, "unsupported"],
    ] as const;

    for (const [input, expected] of cases) {
      expect(classifyRunnerTestRun(input)).toBe(expected);
    }
  });

  it("blocks network, Cookie, secret, write, delete, rollback, patch, Tauri bypass and true execution requests", () => {
    const classification = classifyRunnerRequest(
      makeInput({
        command: "curl https://example.com && invoke('run_code')",
        requestedCapabilities: [
          "network",
          "cookie",
          "secret",
          "filesystem-mutation",
          "delete",
          "rollback-execution",
          "patch-apply",
          "direct-tauri-bypass",
          "true-execution",
        ],
        requestedTrueExecution: true,
      }),
    );

    expect(classification.riskLevel).toBe("blocked");
    expect(classification.requiresHumanApproval).toBe(true);
    expect(classification.requiresNetwork).toBe(true);
    expect(classification.requiresSecrets).toBe(true);
    expect(classification.requiresWritableWorkspace).toBe(true);
    expect(classification.blockedReasons).toEqual(
      expect.arrayContaining([
        "network_access_blocked_in_p14",
        "cookie_access_blocked_in_p14",
        "secret_access_blocked_in_p14",
        "direct_filesystem_mutation_blocked_in_p14",
        "delete_blocked_in_p14",
        "rollback_execution_blocked_in_p14",
        "patch_apply_blocked_in_p14",
        "direct_tauri_bypass_blocked_in_p14",
        "requested_true_execution_unavailable_in_p14",
      ]),
    );
  });

  it("marks fixture-only plans low risk and workspace execution plans high risk without running them", () => {
    const lowRisk = classifyRunnerRequest(makeInput({ runnerKind: "shell-command", command: "rg -n foo fixtures" }));
    expect(lowRisk.riskLevel).toBe("low");
    expect(lowRisk.requiresSandbox).toBe(false);
    expect(lowRisk.blockedReasons).toEqual([]);

    const highRisk = classifyRunnerRequest(
      makeInput({
        targetRefs: [
          {
            ...scratchTarget,
            targetRefId: "target:p14:workspace",
            targetKind: "workspace-file",
            displayPath: "src/lib/example.ts",
            workspaceId: "workspace:p14:repo",
            notesPolicy: "not-read",
          },
        ],
        workspaceRefs: ["workspace:p14:repo"],
        workingDirectoryRef: "workspace:p14:repo",
      }),
    );

    expect(highRisk.riskLevel).toBe("high");
    expect(highRisk.requiresHumanApproval).toBe(true);
    expect(highRisk.requiresSandbox).toBe(true);
    expect(highRisk.blockedReasons).toEqual([]);
  });
});
