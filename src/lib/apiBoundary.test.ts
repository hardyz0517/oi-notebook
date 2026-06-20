import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(process.cwd(), "src");
const sourceExtensions = new Set([".ts", ".tsx"]);

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

describe("api boundary", () => {
  it("keeps Tauri core invoke calls behind src/lib/api.ts outside frozen AI code", () => {
    const violations = listSourceFiles(sourceRoot)
      .map((absolutePath) => {
        const projectPath = toProjectPath(absolutePath);
        return { projectPath, source: readFileSync(absolutePath, "utf8") };
      })
      .filter(({ projectPath }) => !isAllowedApiBoundaryFile(projectPath))
      .filter(({ source }) => (
        /\binvoke\s*\(/.test(source) ||
        /@tauri-apps\/api\/core/.test(source)
      ))
      .map(({ projectPath }) => projectPath);

    expect(violations).toEqual([]);
  });
});
