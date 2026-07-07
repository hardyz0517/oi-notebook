import { describe, expect, it, vi } from "vitest";

import {
  MODEL_LOOP_OUTPUT_STATE,
  runMultiStepModelLoop,
  type MultiStepModelLoopProvider,
  type MultiStepToolTransport,
} from "@/lib/agent-runtime/multiStepModelLoop";
import { createModelLoopViewModel } from "./modelLoopViewModel";

const toolCall = () => ({
  toolCallId: "tool-call:p11:context",
  toolName: "read-current-context.preview",
  argumentsJson: JSON.stringify({ contextRef: "fixture:current" }),
  stepId: "step:1",
  sequence: 1,
});

async function createTwoStepLoop() {
  const provider: MultiStepModelLoopProvider = vi
    .fn()
    .mockResolvedValueOnce({
      status: "tool-call",
      content: "Need explicit context.",
      toolCall: toolCall(),
    })
    .mockResolvedValueOnce({
      status: "completed",
      content: "Final continuation answer from the runtime loop.",
    });
  const transport: MultiStepToolTransport = vi.fn().mockResolvedValue({
    status: "completed",
    rawOutput: {
      summary: "Explicit context observation.",
      content: "Safe bounded context.",
      Authorization: "Bearer sk-test-hidden",
      rawProviderPayload: "vendor payload must not be projected",
    },
    evidenceRefs: ["evidence:p11:1"],
    workspaceRefs: ["workspace:p11"],
  });

  return runMultiStepModelLoop({
    turnId: "turn:p11:workbench",
    maxSteps: 3,
    providerContinue: provider,
    toolTransport: transport,
    now: () => "2026-07-07T00:00:00.000Z",
  });
}

describe("createModelLoopViewModel", () => {
  it("projects a P11 read-only timeline with turn, step, model delta, tool-call, permission, lifecycle, observation and terminal status", async () => {
    const loop = await createTwoStepLoop();
    const viewModel = createModelLoopViewModel(loop);

    expect(viewModel.title).toBe(MODEL_LOOP_OUTPUT_STATE);
    expect(viewModel.outputState).toBe(MODEL_LOOP_OUTPUT_STATE);
    expect(viewModel.turn).toMatchObject({
      turnId: "turn:p11:workbench",
      maxSteps: 3,
      currentStep: 2,
      terminalStatus: "completed",
    });
    expect(viewModel.timeline.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "turn",
      "step",
      "model-delta",
      "tool-call",
      "permission",
      "lifecycle",
      "observation",
      "terminal",
    ]));
    expect(viewModel.timeline.find((item) => item.kind === "model-delta")).toMatchObject({
      title: "Model delta",
      detail: "Final continuation answer from the runtime loop.",
      stepId: "step:2",
    });
    expect(viewModel.timeline.find((item) => item.kind === "permission")).toMatchObject({
      toolCallId: "tool-call:p11:context",
      title: "Permission resolved",
    });
    expect(viewModel.timeline.find((item) => item.kind === "observation")).toMatchObject({
      observationId: "observation:tool-call:p11:context",
      title: "Observation redacted",
      detail: "Explicit context observation.",
    });
    expect(viewModel.terminalStatus).toBe("completed");
  });

  it("redacts secret-like text and never exposes raw provider payload fields", async () => {
    const loop = {
      ...(await createTwoStepLoop()),
      rawProviderPayload: {
        Authorization: "Bearer sk-provider-hidden",
        vendor: "opaque",
      },
    };

    const viewModel = createModelLoopViewModel(loop);
    const serialized = JSON.stringify(viewModel);

    expect(viewModel.observations[0]).toMatchObject({
      redactionStatus: "redacted",
      droppedFields: ["Authorization"],
      boundedContent: expect.not.stringContaining("sk-test-hidden"),
    });
    expect(serialized).not.toContain("sk-test-hidden");
    expect(serialized).not.toContain("sk-provider-hidden");
    expect(serialized).not.toContain("rawProviderPayload");
    expect(serialized).not.toContain("vendor payload must not be projected");
  });

  it("labels the Workbench output state exactly as the P11 contract preview", async () => {
    const viewModel = createModelLoopViewModel(await createTwoStepLoop());

    expect(viewModel.title).toBe("Multi-Step Model Loop / Tool-Call Continuation Contract Preview");
  });
});
