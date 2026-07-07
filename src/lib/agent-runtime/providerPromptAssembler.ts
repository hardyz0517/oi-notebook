import type { ProviderModelInputPart } from "./providerModelTypes";

export type ProviderPayloadAssemblyInput = {
  contextBuildId: string;
  modelProfileId: string;
  inputParts: ProviderModelInputPart[];
  stream: boolean;
};

export type ProviderPayloadAssembly = {
  contextBuildId: string;
  providerPayloadShape: "openai-compatible-chat";
  messagesOrInput: Array<{ role: "user"; content: string }>;
  modelProfileId: string;
  toolExposure: string[];
  responseFormat: "text";
  streamOptions: { stream: boolean };
  stream: boolean;
  safePromptSummary: string;
};

export function assembleProviderPayload(input: ProviderPayloadAssemblyInput): ProviderPayloadAssembly {
  const blocked = input.inputParts.filter(
    (part) => part.redaction.visibility === "forbidden-for-model" || part.redaction.visibility === "forbidden-for-third-party",
  );
  if (blocked.length > 0) {
    throw new Error("provider_payload_redaction_blocked");
  }

  return {
    contextBuildId: input.contextBuildId,
    providerPayloadShape: "openai-compatible-chat",
    messagesOrInput: input.inputParts
      .filter((part) => part.text)
      .map((part) => ({ role: "user", content: part.text ?? "" })),
    modelProfileId: input.modelProfileId,
    toolExposure: [],
    responseFormat: "text",
    streamOptions: { stream: input.stream },
    stream: input.stream,
    safePromptSummary: `${input.inputParts.length} input parts, ${blocked.length} blocked parts`,
  };
}
