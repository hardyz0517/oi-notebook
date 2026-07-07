import { describe, expect, it } from "vitest";

import { assembleProviderPayload } from "./providerPromptAssembler";

describe("assembleProviderPayload", () => {
  it("assembles a safe provider payload summary without secrets", () => {
    const payload = assembleProviderPayload({
      contextBuildId: "context:p10:1",
      modelProfileId: "model:gated",
      inputParts: [
        {
          partId: "part:user:1",
          kind: "user-text",
          text: "Explain this.",
          redaction: {
            classification: "user-input",
            visibility: "ui-visible",
            redactionStrategy: "none",
            reason: "allowed",
          },
        },
      ],
      stream: true,
    });

    expect(payload.providerPayloadShape).toBe("openai-compatible-chat");
    expect(payload.safePromptSummary).toBe("1 input parts, 0 blocked parts");
    expect(JSON.stringify(payload)).not.toContain("sk-");
  });

  it("blocks forbidden model parts before transport", () => {
    expect(() =>
      assembleProviderPayload({
        contextBuildId: "context:p10:blocked",
        modelProfileId: "model:gated",
        inputParts: [
          {
            partId: "part:secret",
            kind: "user-text",
            text: "secret text",
            redaction: {
              classification: "secret",
              visibility: "forbidden-for-model",
              redactionStrategy: "drop",
              reason: "secret_blocked",
            },
          },
        ],
        stream: true,
      }),
    ).toThrow("provider_payload_redaction_blocked");
  });
});
