import { describe, expect, it } from "vitest";

import { buildProviderContext } from "./providerContextBuilder";

describe("buildProviderContext", () => {
  it("builds general-purpose context parts without making the provider layer OI-only", () => {
    const context = buildProviderContext({
      sessionId: "session:p10:1",
      turnId: "turn:p10:1",
      workspaceId: "workspace:p10:1",
      taskIntent: "general",
      userText: "Explain this note.",
      evidenceRefs: [{ evidenceId: "E1", role: "derived-evidence" }],
    });

    expect(context.contextBuildId).toContain("context:");
    expect(context.taskIntent).toBe("general");
    expect(context.inputParts[0]?.kind).toBe("user-text");
    expect(context.evidenceRefs).toHaveLength(1);
    expect(context.permissionNeeds).toEqual(["provider-request"]);
  });
});
