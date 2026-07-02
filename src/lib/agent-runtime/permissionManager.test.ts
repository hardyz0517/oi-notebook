import { describe, expect, it } from "vitest";

import { createPermissionManager } from "./permissionManager";

describe("permission manager", () => {
  it("allows read tools and blocks patch tools by default", () => {
    const manager = createPermissionManager();

    expect(manager.canAutoRunTool("read_current_file", "read")).toBe(true);
    expect(manager.canAutoRunTool("apply_patch", "write")).toBe(false);
    expect(manager.shouldPromptForPermission("apply_patch", "write")).toBe(true);
  });
});
