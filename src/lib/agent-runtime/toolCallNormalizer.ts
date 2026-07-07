import type { InvalidProviderToolCallIntent, ParsedProviderToolCallIntent, ProviderToolCallIntent } from "./toolCallParser";

export type NormalizedToolCallIntent = {
  status: "normalized";
  eventType: "tool_call.normalized";
  toolCallId: string;
  toolName: string | null;
  arguments: unknown;
  stepId: string;
  sequence: number;
  registryStatus: "not-checked";
  toolNameStatus: "provided" | "missing";
};

export type ToolCallNormalizationResult = NormalizedToolCallIntent | InvalidProviderToolCallIntent;

export function normalizeToolCallIntent(intent: ParsedProviderToolCallIntent): NormalizedToolCallIntent;
export function normalizeToolCallIntent(intent: InvalidProviderToolCallIntent): InvalidProviderToolCallIntent;
export function normalizeToolCallIntent(intent: ProviderToolCallIntent): ToolCallNormalizationResult;
export function normalizeToolCallIntent(intent: ProviderToolCallIntent): ToolCallNormalizationResult {
  if (intent.status === "invalid") {
    return intent;
  }

  const toolName = intent.toolName.trim();

  return {
    status: "normalized",
    eventType: "tool_call.normalized",
    toolCallId: intent.toolCallId,
    toolName: toolName.length > 0 ? toolName : null,
    arguments: intent.arguments,
    stepId: intent.stepId,
    sequence: intent.sequence,
    registryStatus: "not-checked",
    toolNameStatus: toolName.length > 0 ? "provided" : "missing",
  };
}

export function normalizeToolCallIntents(intents: ProviderToolCallIntent[]): ToolCallNormalizationResult[] {
  return intents.map((intent) => normalizeToolCallIntent(intent));
}
