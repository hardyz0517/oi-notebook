import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const libSource = readFileSync(path.resolve(process.cwd(), "src-tauri", "src", "lib.rs"), "utf8");

function readRustFunction(source: string, name: string): string {
  const signatureIndex = source.indexOf(`fn ${name}`);
  if (signatureIndex === -1) return "";

  const openBraceIndex = source.indexOf("{", signatureIndex);
  if (openBraceIndex === -1) return "";

  let depth = 0;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(signatureIndex, index + 1);
      }
    }
  }

  return "";
}

describe("blog server boundary", () => {
  it("uses the Rust local blog server without stale Astro child-process code", () => {
    expect(libSource).not.toContain("Command::new(\"pnpm.cmd\")");
    expect(libSource).not.toContain("Astro dev server");
    expect(libSource).not.toContain("site_dir");
    expect(libSource).toMatch(/fn start_blog_server[\s\S]*production_server\.ensure_running\(\)/);
  });

  it("ensures the local blog server before opening and reports an honest restart status", () => {
    const openBlogBody = readRustFunction(libSource, "open_blog");
    const restartBlogBody = readRustFunction(libSource, "restart_blog_server");

    expect(openBlogBody).toContain("start_blog_server(&state)?");
    expect(openBlogBody).toContain("http://127.0.0.1:4321/local-blog/");
    expect(restartBlogBody).toContain("start_blog_server(&state)?");
    expect(restartBlogBody).toContain("Local blog server is running");
    expect(restartBlogBody).not.toContain("Astro");
  });
});
