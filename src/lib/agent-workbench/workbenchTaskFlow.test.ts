import { describe, expect, it } from "vitest";
import {
  runMultiStepModelLoop,
  type MultiStepModelLoopProvider,
  type MultiStepToolTransport,
} from "@/lib/agent-runtime/multiStepModelLoop";
import { runManualWorkbenchTask, runWorkbenchTask } from "./workbenchTaskFlow";

const reservedModelEventType = ["model", "delta"].join(".");

async function createP11LoopResult() {
  const provider: MultiStepModelLoopProvider = async ({ stepNumber }) => {
    if (stepNumber === 1) {
      return {
        status: "tool-call",
        content: "Need explicit context.",
        toolCall: {
          toolCallId: "tool-call:p11:flow",
          toolName: "read-current-context.preview",
          argumentsJson: JSON.stringify({ contextRef: "fixture:flow" }),
          stepId: "step:1",
          sequence: 1,
        },
      };
    }

    return {
      status: "completed",
      content: "P11 continuation finished.",
    };
  };
  const transport: MultiStepToolTransport = async () => ({
    status: "completed",
    rawOutput: {
      summary: "Flow observation.",
      content: "Read-only projected content.",
    },
  });

  return runMultiStepModelLoop({
    turnId: "turn:p11:flow",
    maxSteps: 3,
    providerContinue: provider,
    toolTransport: transport,
    now: () => "2026-07-07T00:00:00.000Z",
  });
}

describe("runManualWorkbenchTask", () => {
  it("runs a manual URL through runtime events, workspace state, evidence, and separated caches", async () => {
    const result = await runManualWorkbenchTask({
      problem: {
        title: "Manual LCA Problem",
        problemId: "manual-lca",
        problemUrl: "https://example.com/lca",
      },
      manualSource: {
        url: "https://example.com/lca",
        title: "Lowest Common Ancestor Notes",
        text: [
          "Lowest common ancestor can be solved with binary lifting after a DFS preprocessing pass.",
          "For each vertex, up[v][k] stores the 2^k-th ancestor of v, and depths are used to lift the deeper node first.",
          "The query then lifts both nodes from high powers down until their parents match.",
        ].join("\n\n"),
      },
    });

    expect(result.workspace.evidenceIds).toEqual([result.evidenceRecords[0]?.packetId]);
    expect(result.workspace.traceEventIds.length).toBe(result.events.length);
    expect(result.events.map((event) => event.type)).toEqual([
      "agent.started",
      "tool.requested",
      "permission.resolved",
      "tool.started",
      "tool.output",
      "evidence.added",
      "workspace.updated",
      "agent.completed",
    ]);
    expect(result.evidenceRecords).toHaveLength(1);
    expect(result.evidenceRecords[0]?.packet.evidenceItems[0]).toMatchObject({
      url: "https://example.com/lca",
      title: "Lowest Common Ancestor Notes",
      canCite: true,
    });
    expect(result.cacheSnapshot.namespaces).toMatchObject({
      search: 1,
      read: 1,
      extract: 1,
      evidence: 1,
      workspace: 1,
    });
    expect(result.permissionRequests).toEqual([
      expect.objectContaining({
        id: "tavily_search:prompt-required",
        toolName: "tavily_search",
        permission: "public-network",
        status: "pending",
        reason: "public_network_requires_user_permission",
      }),
      expect.objectContaining({
        id: "luogu_cookie_reader:unavailable",
        toolName: "luogu_cookie_reader",
        permission: "cookie-network",
        status: "blocked",
        reason: "cookie_network_unavailable_in_preview",
      }),
    ]);
    expect(result.permissionRequests.map((request) => request.permission)).not.toContain("network");
    expect(result.permissionRequests.map((request) => request.status)).toEqual(["pending", "blocked"]);
    expect(result.oiSkillPreview.invocation.skillId).toBe("research-problem");
    expect(result.oiSkillPreview.status).toBe("completed");
    expect(result.oiSkillPreview.solutionOutline?.status).toBe("preview");
    expect(result.oiSkillPreview.permissionRequests).toEqual(result.permissionRequests);
    expect(result.oiSkillPreview.limitations).toContain("deterministic_preview_only");
    expect(result.sessionReplay.outputState).toBe("Agent Session/Replay Contract Preview");
    expect(result.sessionReplayViewModel.title).toBe("Agent Session/Replay Contract Preview");
    expect(result.sessionReplay.capabilityStatuses.providerRequest.status).toBe("unavailable");
    expect(result.modelLoopPreview).toBeNull();
    expect(result.providerModelPreview.title).toBe("Provider/Model Adapter Contract Preview");
    expect(result.providerModelPreview.providerRequestStatus.status).toBe("unavailable");
    expect(result.providerModelPreview.limitations).toContain("no_live_provider_request");
    expect(result.events.map((event) => event.type)).not.toEqual(expect.arrayContaining([
      reservedModelEventType,
      "patch.generated",
      "patch.applied",
    ]));
  });

  it("passes through a P10 provider model preview when live read model exists", async () => {
    const result = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "Live Provider Projection",
        problemId: "live-provider-projection",
        problemUrl: "https://example.test/live-provider",
      },
      manualSource: {
        url: "https://example.test/live-provider",
        title: "Live Provider Projection",
        text: "Projection fixture.",
      },
      providerModelPreview: {
        requestId: "request:p10:workbench",
        providerProfileId: "provider:openai-compatible",
        modelProfileId: "model:gated",
        outputState: "Live Provider Request / One-Turn Model Step Contract Preview",
        events: [
          {
            type: "model.delta.live",
            requestId: "request:p10:workbench",
            sequence: 1,
            at: "2026-07-07T00:00:01.000Z",
            text: "Live projection.",
          },
        ],
        capabilities: {
          providerRequest: { status: "preview", reason: "p10_live_gate" },
          streaming: { status: "preview", reason: "p10_live_gate" },
          toolCalling: { status: "reserved", reason: "future_phase" },
        },
        limitations: ["one_turn_only", "no_patch_apply"],
      },
    });

    expect(result.providerModelPreview.title).toMatch(/Provider Request|Provider\/Model Adapter/);
    expect(result.providerModelPreview.previewText).toBe("Live projection.");
    expect(result.providerModelPreview.limitations).toContain("no_patch_apply");
    expect(result.modelLoopPreview).toBeNull();
  });

  it("attaches a P11 model loop projection only when a runtime loop result exists", async () => {
    const result = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "P11 Loop Projection",
        problemId: "p11-loop-projection",
        problemUrl: "https://example.test/p11-loop",
      },
      manualSource: {
        url: "https://example.test/p11-loop",
        title: "P11 Loop Projection",
        text: "Projection fixture.",
      },
      modelLoopPreview: await createP11LoopResult(),
      providerModelPreview: {
        requestId: "request:p10:still-present",
        providerProfileId: "provider:mock",
        modelProfileId: "model:mock",
        outputState: "Live Provider Request / One-Turn Model Step Contract Preview",
        events: [],
        capabilities: {
          providerRequest: { status: "preview", reason: "p10_passthrough" },
          streaming: { status: "reserved", reason: "p10_passthrough" },
          toolCalling: { status: "reserved", reason: "future_phase" },
        },
        limitations: ["one_turn_only"],
      },
    });

    expect(result.modelLoopPreview?.title).toBe("Multi-Step Model Loop / Tool-Call Continuation Contract Preview");
    expect(result.modelLoopPreview?.timeline.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "tool-call",
      "permission",
      "observation",
      "terminal",
    ]));
    expect(result.providerModelPreview.title).toMatch(/Provider Request|Provider\/Model Adapter/);
    expect(result.providerModelPreview.limitations).toContain("one_turn_only");
  });

  it("initializes a Luogu workspace for the Luogu problem mode", async () => {
    const result = await runWorkbenchTask({
      mode: "luogu_problem",
      problem: {
        title: "P3379 LCA",
        problemId: "P3379",
        problemUrl: "https://www.luogu.com.cn/problem/P3379",
      },
    });

    expect(result.workspace.source).toBe("luogu");
    expect(result.workspace.problemUrl).toBe("https://www.luogu.com.cn/problem/P3379");
    expect(result.events[0]?.type).toBe("agent.started");
  });

  it("initializes a current research workspace for the current research mode", async () => {
    const result = await runWorkbenchTask({
      mode: "current_research",
      problem: {
        title: "Current Research Task",
        problemId: "research-1",
      },
      manualSource: {
        url: "https://example.com/research",
        title: "Research Notes",
        text: "Current research task notes.",
      },
    });

    expect(result.workspace.source).toBe("manual");
    expect(result.workspace.title).toBe("Current Research Task");
    expect(result.evidenceRecords).toHaveLength(1);
  });

  it("returns the preview loop contract with unavailable mature capabilities", async () => {
    const result = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "Two Sum",
        problemId: "two-sum",
        problemUrl: "https://example.test/problem",
      },
      manualSource: {
        url: "https://example.test/editorial",
        title: "Editorial",
        text: "Use hashing.",
      },
    });

    expect(result.loopContract.mode).toBe("preview_one_shot");
    expect(result.loopContract.modelStep.status).toBe("unavailable");
    expect(result.loopContract.patchApply.status).toBe("unavailable");
    expect(result.loopContract.continuation.status).toBe("reserved");
  });

  it("exposes the registered preview read tool with P6 contract metadata", async () => {
    const result = await runWorkbenchTask({
      mode: "manual_url",
      problem: {
        title: "Segment Tree",
        problemId: "segment-tree",
        problemUrl: "https://example.test/segment-tree",
      },
      manualSource: {
        url: "https://example.test/segment-tree/editorial",
        title: "Segment Tree Editorial",
        text: "Maintain intervals in a tree.",
      },
    });

    expect(result.toolDefinitions).toEqual([
      expect.objectContaining({
        name: "read_manual_url",
        permission: "read",
        inputSchema: { type: "object", required: ["url"] },
        outputSchema: { type: "object", required: ["evidencePacketId", "sourceUrl"] },
        exposure: "workbench-preview",
        timeoutMs: 5000,
        lifecycle: {
          emits: ["tool.requested", "permission.resolved", "tool.started", "tool.output"],
        },
        failurePolicy: {
          unsupported: "structured-failure",
          timeout: "structured-failure",
          permissionDenied: "blocked-result",
        },
      }),
    ]);
  });

  it("keeps mature capabilities unavailable in UI-facing results", async () => {
    const result = await runWorkbenchTask({
      mode: "current_research",
      problem: {
        title: "Current context",
        problemId: "current-context",
      },
    });

    expect(result.loopContract.modelStep.reason).toBe("model_loop_unavailable");
    expect(result.loopContract.patchGeneration.reason).toBe("patch_generation_unavailable");
    expect(result.loopContract.sessionPersistence.reason).toBe("session_persistence_unavailable");
  });
});
