import type { NormalizedToolCallIntent } from "./toolCallNormalizer";
import type {
  ToolContinuationDefinition,
  ToolContinuationObservationPolicy,
  ToolContinuationPermission,
  ToolContinuationRegistry,
  ToolContinuationTransport,
} from "./toolContinuationRegistry";

export type ToolContinuationRouteResult =
  | {
      status: "routed";
      toolCallId: string;
      toolName: string;
      stepId: string;
      sequence: number;
      transport: ToolContinuationTransport;
      permission: ToolContinuationPermission;
      exposure: ToolContinuationDefinition["exposure"];
      observationPolicy: ToolContinuationObservationPolicy;
      execution: "not-executed";
    }
  | {
      status: "terminal";
      terminalReason: "unsupported-tool";
      toolCallId: string;
      toolName: string | null;
      safeDetail: string;
    };

export function routeToolContinuation(
  intent: NormalizedToolCallIntent,
  registry: ToolContinuationRegistry,
): ToolContinuationRouteResult {
  if (!intent.toolName) {
    return {
      status: "terminal",
      terminalReason: "unsupported-tool",
      toolCallId: intent.toolCallId,
      toolName: null,
      safeDetail: "Tool call did not include a tool name.",
    };
  }

  const resolved = registry.resolve(intent.toolName);
  if (resolved.status === "unsupported") {
    return {
      status: "terminal",
      terminalReason: resolved.terminalReason,
      toolCallId: intent.toolCallId,
      toolName: resolved.toolName,
      safeDetail: resolved.safeDetail,
    };
  }

  return {
    status: "routed",
    toolCallId: intent.toolCallId,
    toolName: resolved.tool.name,
    stepId: intent.stepId,
    sequence: intent.sequence,
    transport: resolved.tool.transport,
    permission: resolved.tool.permission,
    exposure: resolved.tool.exposure,
    observationPolicy: resolved.tool.observationPolicy,
    execution: "not-executed",
  };
}
