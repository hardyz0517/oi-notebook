import type { ProviderModelEvidenceRef, ProviderModelInputPart } from "./providerModelTypes";

export type ProviderContextBuildInput = {
  sessionId: string;
  turnId: string;
  workspaceId: string;
  taskIntent: "general" | "research" | "explain-code" | "debug-preview" | "write-preview";
  userText: string;
  evidenceRefs: ProviderModelEvidenceRef[];
};

export type ProviderContextBuildResult = {
  contextBuildId: string;
  sessionId: string;
  turnId: string;
  workspaceId: string;
  taskIntent: ProviderContextBuildInput["taskIntent"];
  inputParts: ProviderModelInputPart[];
  evidenceRefs: ProviderModelEvidenceRef[];
  tokenBudget: { maxInputTokens: number; maxOutputTokens: number };
  permissionNeeds: string[];
};

export function buildProviderContext(input: ProviderContextBuildInput): ProviderContextBuildResult {
  return {
    contextBuildId: `context:${input.sessionId}:${input.turnId}`,
    sessionId: input.sessionId,
    turnId: input.turnId,
    workspaceId: input.workspaceId,
    taskIntent: input.taskIntent,
    inputParts: [
      {
        partId: "part:user:1",
        kind: "user-text",
        text: input.userText,
        redaction: {
          classification: "user-input",
          visibility: "ui-visible",
          redactionStrategy: "none",
          reason: "user_text_allowed",
        },
      },
    ],
    evidenceRefs: input.evidenceRefs,
    tokenBudget: { maxInputTokens: 8000, maxOutputTokens: 1200 },
    permissionNeeds: ["provider-request"],
  };
}
