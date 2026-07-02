import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { API_COMMAND_CONTRACTS } from "./apiContract";

const sourceRoot = path.resolve(process.cwd(), "src");
const sourceExtensions = new Set([".ts", ".tsx"]);
const tauriInvokeCallPattern = new RegExp(`\\b${"invoke"}\\s*\\(`);

function listSourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(absolutePath));
      continue;
    }
    if (sourceExtensions.has(path.extname(entry))) {
      files.push(absolutePath);
    }
  }
  return files;
}

function toProjectPath(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");
}

function isAllowedApiBoundaryFile(projectPath: string): boolean {
  return (
    projectPath === "src/lib/api.ts" ||
    projectPath === "src/lib/aiWebSearch.ts" ||
    projectPath.startsWith("src/components/ai/") ||
    /\.test\.tsx?$/.test(projectPath)
  );
}

interface ParsedApiWrapper {
  functionName: string;
  commandName: string;
  argKeys: string[];
}

function readBalancedBlock(source: string, openBraceIndex: number): string {
  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBraceIndex + 1, index);
      }
    }
  }
  throw new Error("Unable to parse exported async function body.");
}

function findFunctionBodyOpenBrace(source: string, startIndex: number): number {
  let parenDepth = 0;
  let angleDepth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    else if (char === ")") parenDepth -= 1;
    else if (char === "<") angleDepth += 1;
    else if (char === ">") angleDepth = Math.max(0, angleDepth - 1);
    else if (char === "{" && parenDepth === 0 && angleDepth === 0) {
      return index;
    }
  }
  throw new Error("Unable to locate exported async function body.");
}

function parseInvokeArgKeys(argSource: string | undefined): string[] {
  if (!argSource?.trim()) return [];
  return Array.from(argSource.matchAll(/(?:^|,)\s*(\w+)\s*(?=\s*(?::|,|$))/g), (match) => match[1]);
}

function parseApiWrappers(): ParsedApiWrapper[] {
  const source = readFileSync(path.join(sourceRoot, "lib", "api.ts"), "utf8");
  const functionPattern = /export\s+async\s+function\s+(\w+)\s*\(/g;
  const wrappers: ParsedApiWrapper[] = [];

  for (const match of source.matchAll(functionPattern)) {
    const functionName = match[1];
    const openBraceIndex = findFunctionBodyOpenBrace(source, match.index ?? 0);
    const body = readBalancedBlock(source, openBraceIndex);
    const invokeMatch = body.match(
      new RegExp(`${"invoke"}(?:<[^>]+>)?\\(\\s*["']([^"']+)["']\\s*(?:,\\s*\\{([\\s\\S]*?)\\})?\\s*\\)`),
    );
    if (!invokeMatch) continue;
    wrappers.push({
      functionName,
      commandName: invokeMatch[1],
      argKeys: parseInvokeArgKeys(invokeMatch[2]),
    });
  }

  return wrappers;
}

describe("api boundary", () => {
  it("keeps Tauri core invoke calls behind src/lib/api.ts outside frozen AI code", () => {
    const violations = listSourceFiles(sourceRoot)
      .map((absolutePath) => {
        const projectPath = toProjectPath(absolutePath);
        return { projectPath, source: readFileSync(absolutePath, "utf8") };
      })
      .filter(({ projectPath }) => !isAllowedApiBoundaryFile(projectPath))
      .filter(({ source }) => (
        tauriInvokeCallPattern.test(source) ||
        /@tauri-apps\/api\/core/.test(source)
      ))
      .map(({ projectPath }) => projectPath);

    expect(violations).toEqual([]);
  });

  it("keeps every Tauri command wrapper registered in the API contract", () => {
    const wrappers = parseApiWrappers();
    const contractRows = API_COMMAND_CONTRACTS.map((contract) => ({
      functionName: contract.functionName,
      commandName: contract.commandName,
      argKeys: contract.argKeys,
    }));

    expect(contractRows).toEqual(wrappers);
  });

  it("keeps API command names unique in the contract", () => {
    const commandNames = API_COMMAND_CONTRACTS.map((contract) => contract.commandName);
    expect(new Set(commandNames).size).toBe(commandNames.length);
  });

  it("registers the agent workbench preview command in the API contract", () => {
    expect(API_COMMAND_CONTRACTS).toContainEqual({
      functionName: "getAgentWorkbenchPreview",
      commandName: "get_agent_workbench_preview",
      argKeys: [],
    });
  });
});
