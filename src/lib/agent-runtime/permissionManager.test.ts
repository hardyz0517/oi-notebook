import { describe, expect, it } from "vitest";

import { createPermissionManager } from "./permissionManager";

describe("permission manager", () => {
  it("allows read tools and blocks patch tools by default", () => {
    const manager = createPermissionManager();

    expect(manager.canAutoRunTool("read_current_file", "read")).toBe(true);
    expect(manager.canAutoRunTool("apply_patch", "write")).toBe(false);
    expect(manager.shouldPromptForPermission("apply_patch", "write")).toBe(true);
  });

  it("returns structured permission decisions for each preview policy kind", () => {
    const manager = createPermissionManager();

    expect(manager.decideToolPermission("read_current_file", "read")).toMatchObject({
      toolName: "read_current_file",
      permission: "read",
      status: "auto-allowed",
      reason: "read_tools_are_preview_safe",
    });

    expect(manager.decideToolPermission("search_local_notes", "local-note-search")).toMatchObject({
      toolName: "search_local_notes",
      permission: "local-note-search",
      status: "prompt-required",
      reason: "local_note_search_requires_user_permission",
    });

    expect(manager.decideToolPermission("search_public_web", "public-network")).toMatchObject({
      toolName: "search_public_web",
      permission: "public-network",
      status: "prompt-required",
      reason: "public_network_requires_user_permission",
    });

    expect(manager.decideToolPermission("read_luogu_cookie_page", "cookie-network")).toMatchObject({
      toolName: "read_luogu_cookie_page",
      permission: "cookie-network",
      status: "unavailable",
      reason: "cookie_network_unavailable_in_preview",
    });

    expect(manager.decideToolPermission("write_note", "write")).toMatchObject({
      toolName: "write_note",
      permission: "write",
      status: "prompt-required",
      reason: "write_requires_user_permission",
    });

    expect(manager.decideToolPermission("apply_patch", "patch-apply")).toMatchObject({
      toolName: "apply_patch",
      permission: "patch-apply",
      status: "unavailable",
      reason: "patch_apply_unavailable_in_preview",
    });

    expect(manager.decideToolPermission("run_code", "execute")).toMatchObject({
      toolName: "run_code",
      permission: "execute",
      status: "unavailable",
      reason: "execute_unavailable_in_preview",
    });

    expect(manager.decideToolPermission("delete_note", "destructive")).toMatchObject({
      toolName: "delete_note",
      permission: "destructive",
      status: "blocked-by-configuration",
      reason: "destructive_tools_blocked_by_configuration",
    });

    expect(manager.decideToolPermission("legacy_web_search", "network")).toMatchObject({
      toolName: "legacy_web_search",
      permission: "network",
      status: "prompt-required",
      reason: "legacy_network_permission_requires_user_permission",
    });
  });

  it("derives compatibility wrappers from structured permission decisions", () => {
    const manager = createPermissionManager();

    expect(manager.canAutoRunTool("read_current_file", "read")).toBe(true);
    expect(manager.canAutoRunTool("search_public_web", "public-network")).toBe(false);
    expect(manager.canAutoRunTool("apply_patch", "patch-apply")).toBe(false);

    expect(manager.shouldPromptForPermission("search_local_notes", "local-note-search")).toBe(true);
    expect(manager.shouldPromptForPermission("search_public_web", "public-network")).toBe(true);
    expect(manager.shouldPromptForPermission("legacy_web_search", "network")).toBe(true);
    expect(manager.shouldPromptForPermission("apply_patch", "patch-apply")).toBe(false);
    expect(manager.shouldPromptForPermission("run_code", "execute")).toBe(false);
    expect(manager.shouldPromptForPermission("delete_note", "destructive")).toBe(false);
  });
});
