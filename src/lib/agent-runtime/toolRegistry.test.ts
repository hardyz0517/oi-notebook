import { describe, expect, it } from "vitest";

import { createToolRegistry } from "./toolRegistry";

describe("tool registry", () => {
  it("registers and resolves a tool by name", () => {
    const registry = createToolRegistry();
    registry.register({
      name: "read_current_file",
      description: "Read the current file",
      permission: "read",
      run: async () => "ok",
    });

    expect(registry.has("read_current_file")).toBe(true);
    expect(registry.get("read_current_file")?.permission).toBe("read");
    expect(registry.list().map((tool) => tool.name)).toEqual(["read_current_file"]);
  });
});
