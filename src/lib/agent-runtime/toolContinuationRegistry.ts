export type ToolContinuationSchema = {
  type: "object" | "string" | "number" | "boolean" | "array" | "unknown";
  required?: string[];
  properties?: Record<string, ToolContinuationSchema>;
  items?: ToolContinuationSchema;
  description?: string;
};

export type ToolContinuationPermissionKind =
  | "read"
  | "local-note-search"
  | "public-network"
  | "cookie-network"
  | "write"
  | "patch-apply"
  | "execute"
  | "delete"
  | "rollback"
  | "destructive";

export type ToolContinuationPermissionDecision =
  | "auto-allowed"
  | "prompt-required"
  | "denied"
  | "blocked-by-configuration"
  | "unavailable"
  | "reserved"
  | "degraded-fallback";

export type ToolContinuationPermission = {
  kind: ToolContinuationPermissionKind;
  decision: ToolContinuationPermissionDecision;
  reason: string;
};

export type ToolContinuationExposure = "runtime-preview" | "workbench-preview";

export type ToolContinuationTransport = "mock-preview" | "read-only-preview";

export type ToolContinuationLifecycleEventType =
  | "tool.lifecycle.started"
  | "tool.lifecycle.completed"
  | "tool.lifecycle.failed"
  | "tool.lifecycle.unavailable"
  | "observation.added";

export type ToolContinuationLifecyclePolicy = {
  emits: ToolContinuationLifecycleEventType[];
};

export type ToolContinuationObservationPolicy = {
  redaction: "required";
  continuationVisibility: "summary-only" | "workbench-only";
  maxBytes: number;
};

export type ToolContinuationDefinition = {
  name: string;
  description: string;
  inputSchema: ToolContinuationSchema;
  outputSchema: ToolContinuationSchema;
  permission: ToolContinuationPermission;
  exposure: ToolContinuationExposure;
  transport: ToolContinuationTransport;
  lifecycle: ToolContinuationLifecyclePolicy;
  observationPolicy: ToolContinuationObservationPolicy;
  profile?: "general" | "oi";
};

export type ToolContinuationRegisterResult =
  | {
      status: "registered";
      toolName: string;
    }
  | {
      status: "failed";
      reason: "duplicate-tool";
      toolName: string;
    };

export type ToolContinuationResolveResult =
  | {
      status: "found";
      tool: ToolContinuationDefinition;
    }
  | {
      status: "unsupported";
      toolName: string;
      terminalReason: "unsupported-tool";
      safeDetail: string;
    };

export type ToolContinuationRegistry = {
  register(tool: ToolContinuationDefinition): ToolContinuationRegisterResult;
  resolve(toolName: string): ToolContinuationResolveResult;
  list(): ToolContinuationDefinition[];
};

const DEFAULT_LIFECYCLE: ToolContinuationLifecyclePolicy = {
  emits: ["tool.lifecycle.started", "tool.lifecycle.completed", "observation.added"],
};

const DEFAULT_OBSERVATION_POLICY: ToolContinuationObservationPolicy = {
  redaction: "required",
  continuationVisibility: "summary-only",
  maxBytes: 2048,
};

export function definePreviewTool(definition: ToolContinuationDefinition): ToolContinuationDefinition {
  return definition;
}

export function createToolContinuationRegistry(initialTools: ToolContinuationDefinition[] = []): ToolContinuationRegistry {
  const tools = new Map<string, ToolContinuationDefinition>();

  const registry: ToolContinuationRegistry = {
    register(tool: ToolContinuationDefinition): ToolContinuationRegisterResult {
      if (tools.has(tool.name)) {
        return {
          status: "failed",
          reason: "duplicate-tool",
          toolName: tool.name,
        };
      }

      tools.set(tool.name, tool);
      return {
        status: "registered",
        toolName: tool.name,
      };
    },
    resolve(toolName: string): ToolContinuationResolveResult {
      const tool = tools.get(toolName);
      if (!tool) {
        return {
          status: "unsupported",
          toolName,
          terminalReason: "unsupported-tool",
          safeDetail: "Tool is not registered for P11 preview continuation.",
        };
      }

      return {
        status: "found",
        tool,
      };
    },
    list(): ToolContinuationDefinition[] {
      return Array.from(tools.values());
    },
  };

  for (const tool of initialTools) {
    registry.register(tool);
  }

  return registry;
}

export function createDefaultToolContinuationRegistry(): ToolContinuationRegistry {
  return createToolContinuationRegistry([
    definePreviewTool({
      name: "read-current-context.preview",
      description: "Reads only explicit in-memory runtime context already provided to the preview loop.",
      inputSchema: {
        type: "object",
        properties: {
          contextRef: { type: "string" },
        },
        required: ["contextRef"],
      },
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
        },
        required: ["summary"],
      },
      permission: {
        kind: "read",
        decision: "auto-allowed",
        reason: "explicit_runtime_context_only",
      },
      exposure: "workbench-preview",
      transport: "read-only-preview",
      lifecycle: DEFAULT_LIFECYCLE,
      observationPolicy: DEFAULT_OBSERVATION_POLICY,
      profile: "general",
    }),
    definePreviewTool({
      name: "search-evidence.preview",
      description: "Searches only synthetic or already-attached evidence in the preview runtime.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
      outputSchema: {
        type: "object",
        properties: {
          evidenceRefs: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        },
        required: ["summary"],
      },
      permission: {
        kind: "local-note-search",
        decision: "prompt-required",
        reason: "preview_evidence_search_requires_visible_policy",
      },
      exposure: "workbench-preview",
      transport: "read-only-preview",
      lifecycle: DEFAULT_LIFECYCLE,
      observationPolicy: DEFAULT_OBSERVATION_POLICY,
      profile: "general",
    }),
    definePreviewTool({
      name: "oi-problem-context.preview",
      description: "Reads an OI ProblemWorkspace projection without executing code or using cookie-backed readers.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRef: { type: "string" },
        },
        required: ["workspaceRef"],
      },
      outputSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          workspaceRefs: { type: "array", items: { type: "string" } },
        },
        required: ["summary"],
      },
      permission: {
        kind: "read",
        decision: "auto-allowed",
        reason: "problem_workspace_projection_only",
      },
      exposure: "workbench-preview",
      transport: "read-only-preview",
      lifecycle: DEFAULT_LIFECYCLE,
      observationPolicy: DEFAULT_OBSERVATION_POLICY,
      profile: "oi",
    }),
    definePreviewTool({
      name: "write-solution-outline.preview",
      description: "Creates a read-only outline observation and never writes a file.",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string" },
        },
        required: ["topic"],
      },
      outputSchema: {
        type: "object",
        properties: {
          outline: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
        },
        required: ["summary"],
      },
      permission: {
        kind: "read",
        decision: "auto-allowed",
        reason: "outline_observation_only_no_file_write",
      },
      exposure: "workbench-preview",
      transport: "mock-preview",
      lifecycle: DEFAULT_LIFECYCLE,
      observationPolicy: DEFAULT_OBSERVATION_POLICY,
      profile: "oi",
    }),
  ]);
}
