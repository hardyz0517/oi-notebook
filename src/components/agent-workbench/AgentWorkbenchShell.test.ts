import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const shellSourcePath = path.resolve(__dirname, "AgentWorkbenchShell.tsx");

describe("AgentWorkbenchShell", () => {
  it("runs Workbench tasks from a direct button click handler", () => {
    const shellSource = readFileSync(shellSourcePath, "utf8");

    expect(shellSource).toContain("const runCurrentTask = async (): Promise<void>");
    expect(shellSource).toContain('type="button"');
    expect(shellSource).toContain("onClick={() => void runCurrentTask()}");
  });
});
