export type RawProviderToolCallIntent = {
  toolCallId?: unknown;
  toolName?: unknown;
  argumentsJson?: unknown;
  stepId?: unknown;
  sequence?: unknown;
  [vendorField: string]: unknown;
};

export type ParsedProviderToolCallIntent = {
  status: "parsed";
  eventType: "model.tool_call.requested";
  toolCallId: string;
  toolName: string;
  argumentsJson: string;
  arguments: unknown;
  stepId: string;
  sequence: number;
};

export type InvalidProviderToolCallIntent = {
  status: "invalid";
  eventType: "tool_call.invalid";
  toolCallId: string | null;
  stepId: string | null;
  sequence: number | null;
  reason: "missing-arguments-json" | "malformed-json";
  safeDetail: string;
};

export type ProviderToolCallIntent = ParsedProviderToolCallIntent | InvalidProviderToolCallIntent;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseProviderToolCallIntent(rawIntent: RawProviderToolCallIntent): ProviderToolCallIntent {
  const toolCallId = asString(rawIntent.toolCallId);
  const stepId = asString(rawIntent.stepId);
  const sequence = asNumber(rawIntent.sequence);

  if (typeof rawIntent.argumentsJson !== "string") {
    return {
      status: "invalid",
      eventType: "tool_call.invalid",
      toolCallId: asNullableString(rawIntent.toolCallId),
      stepId: asNullableString(rawIntent.stepId),
      sequence,
      reason: "missing-arguments-json",
      safeDetail: "Tool call arguments JSON was not provided as a string.",
    };
  }

  try {
    return {
      status: "parsed",
      eventType: "model.tool_call.requested",
      toolCallId,
      toolName: asString(rawIntent.toolName),
      argumentsJson: rawIntent.argumentsJson,
      arguments: JSON.parse(rawIntent.argumentsJson),
      stepId,
      sequence: sequence ?? 0,
    };
  } catch {
    return {
      status: "invalid",
      eventType: "tool_call.invalid",
      toolCallId: asNullableString(rawIntent.toolCallId),
      stepId: asNullableString(rawIntent.stepId),
      sequence,
      reason: "malformed-json",
      safeDetail: "Tool call arguments JSON could not be parsed.",
    };
  }
}

export function parseProviderToolCallIntents(rawIntents: RawProviderToolCallIntent[]): ProviderToolCallIntent[] {
  return rawIntents.map((rawIntent) => parseProviderToolCallIntent(rawIntent));
}
