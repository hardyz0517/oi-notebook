import { createAgentRuntime } from "@/lib/agent-runtime/agentRuntime";
import { createPreviewAgentLoopContract } from "@/lib/agent-runtime/agentLoopContract";
import { createMockProviderModelAdapter } from "@/lib/agent-runtime/providerModelAdapter";
import type { ProviderModelRequestEnvelope } from "@/lib/agent-runtime/providerModelTypes";
import { replayAgentSession, type AgentReplayReadModel } from "@/lib/agent-runtime/agentReplay";
import { createAgentSession, createAgentSessionMetadata } from "@/lib/agent-runtime/agentSession";
import type {
  AgentEvent,
  AgentLoopContract,
  AgentPermissionDecision,
  AgentToolDefinition,
} from "@/lib/agent-runtime/agentTypes";
import { snapshotEventsWithSequence } from "@/lib/agent-runtime/eventStream";
import type { OiSkillPermissionRequest, OiSkillReadModel } from "@/lib/oi-skills";
import { createPermissionManager } from "@/lib/agent-runtime/permissionManager";
import { createToolRegistry } from "@/lib/agent-runtime/toolRegistry";
import { createProblemWorkspaceStore } from "@/lib/problem-workspace/problemWorkspaceStore";
import type { ProblemWorkspace } from "@/lib/problem-workspace/problemWorkspaceTypes";
import {
  buildEvidencePacket,
  buildExcerpt,
  createInMemoryEvidenceStore,
  createInMemoryResearchCacheManager,
  deriveResearchCacheKey,
  createManualExtractor,
  createManualReaderProvider,
  createManualSearchProvider,
  evaluateEvidencePacket,
  evaluateReaderQuality,
  selectPassages,
  type CandidateSource,
  type EvidenceStoreRecord,
  type QueryPlan,
  type ResearchCacheManager,
  type ResearchSearchRequest,
  type SearchPolicyDecision,
} from "@/lib/research-engine";
import { createOiSkillPreviewReadModel } from "./oiSkillPreviewAdapter";
import {
  createProviderModelViewModel,
  type ProviderModelProjectionInput,
  type ProviderModelViewModel,
} from "./providerModelViewModel";
import { createSessionReplayViewModel, type SessionReplayViewModel } from "./sessionReplayViewModel";

export type WorkbenchTaskPermissionStatus = "blocked" | "pending" | "granted";

export type WorkbenchTaskPermissionRequest = OiSkillPermissionRequest;

export type WorkbenchPreviewToolDefinition = Omit<AgentToolDefinition, "run">;

export type ManualWorkbenchSource = {
  url: string;
  title: string;
  text: string;
};

export type ManualWorkbenchTaskInput = {
  problem: {
    title: string;
    problemId: string;
    problemUrl?: string;
  };
  manualSource: ManualWorkbenchSource;
};

export type WorkbenchTaskMode = "manual_url" | "luogu_problem" | "current_research";

export type WorkbenchTaskInput = {
  mode: WorkbenchTaskMode;
  problem: ManualWorkbenchTaskInput["problem"];
  manualSource?: ManualWorkbenchSource;
  providerModelPreview?: ProviderModelProjectionInput;
};

export type ManualWorkbenchTaskResult = {
  workspace: ProblemWorkspace;
  events: AgentEvent[];
  evidenceRecords: EvidenceStoreRecord[];
  permissionRequests: WorkbenchTaskPermissionRequest[];
  oiSkillPreview: OiSkillReadModel;
  toolDefinitions: WorkbenchPreviewToolDefinition[];
  cacheSnapshot: ReturnType<ResearchCacheManager["snapshot"]>;
  loopContract: AgentLoopContract;
  sessionReplay: AgentReplayReadModel;
  sessionReplayViewModel: SessionReplayViewModel;
  providerModelPreview: ProviderModelViewModel;
};

export type WorkbenchTaskResult = ManualWorkbenchTaskResult;

const hostFromUrl = (url: string): string => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "unknown";
  }
};

const createRequest = (input: ManualWorkbenchTaskInput): ResearchSearchRequest => ({
  requestId: `workbench:${input.problem.problemId}`,
  userQuestion: input.problem.title,
  locale: "auto",
  options: {
    allowPublicWeb: true,
  },
});

const createPolicy = (): SearchPolicyDecision => ({
  needSearch: true,
  mode: "explicit_url",
  risk: "low",
  freshness: "stable",
  vertical: "explicit_url",
  reason: "Manual URL supplied by the Workbench task.",
  guards: ["manual_url_only"],
  confidence: 1,
  focusEntities: [],
  locale: "mixed",
  mixedLanguage: true,
  mustUseEvidence: true,
  evidenceRequirement: "medium",
  future: {},
});

const createQueryPlan = (request: ResearchSearchRequest, input: ManualWorkbenchTaskInput): QueryPlan => ({
  requestId: request.requestId,
  userQuestion: request.userQuestion,
  needSearch: true,
  mode: "explicit_url",
  risk: "low",
  freshness: "stable",
  vertical: "explicit_url",
  locale: "mixed",
  focusEntities: [input.problem.title],
  maxQueries: 1,
  queries: [{
    query: input.manualSource.url,
    language: "mixed",
    purpose: "official",
    priority: 1,
    expectedSourceTypes: ["explicit_url"],
    preferredDomains: [hostFromUrl(input.manualSource.url)],
  }],
  reason: "Manual URL reader task.",
  future: {},
});

const createCandidate = (input: ManualWorkbenchTaskInput): CandidateSource => ({
  id: `candidate:${input.problem.problemId}:manual`,
  jobId: `job:${input.problem.problemId}`,
  url: input.manualSource.url,
  title: input.manualSource.title,
  snippet: input.manualSource.text.slice(0, 180),
  sourceType: "explicit_url",
  priority: "core",
  host: hostFromUrl(input.manualSource.url),
  language: "mixed",
  queryPurpose: "official",
  status: "finished",
  readState: "finished",
  evidence: {
    level: "none",
    reliable: false,
    fresh: false,
  },
  discoveredAt: Date.now(),
  finishedAt: Date.now(),
});

const permissionStatusFromDecision = (
  decision: AgentPermissionDecision,
): WorkbenchTaskPermissionStatus => {
  if (decision.status === "auto-allowed") {
    return "granted";
  }
  if (decision.status === "prompt-required" || decision.status === "degraded-fallback") {
    return "pending";
  }
  return "blocked";
};

const permissionRequestFromDecision = (
  decision: AgentPermissionDecision,
): WorkbenchTaskPermissionRequest => ({
  id: `${decision.toolName}:${decision.status}`,
  toolName: decision.toolName,
  permission: decision.permission,
  status: permissionStatusFromDecision(decision),
  reason: decision.reason,
});

const createWorkbenchPermissionRequests = (
  permissionManager: ReturnType<typeof createPermissionManager>,
): WorkbenchTaskPermissionRequest[] => [
  permissionRequestFromDecision(permissionManager.decideToolPermission("tavily_search", "public-network")),
  permissionRequestFromDecision(permissionManager.decideToolPermission("luogu_cookie_reader", "cookie-network")),
];

const previewToolDefinition = (tool: AgentToolDefinition): WorkbenchPreviewToolDefinition => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema,
  permission: tool.permission,
  exposure: tool.exposure,
  timeoutMs: tool.timeoutMs,
  lifecycle: tool.lifecycle,
  failurePolicy: tool.failurePolicy,
});

export async function runWorkbenchTask(input: WorkbenchTaskInput): Promise<WorkbenchTaskResult> {
  const workspaceStore = createProblemWorkspaceStore();
  const evidenceStore = createInMemoryEvidenceStore();
  const cacheManager = createInMemoryResearchCacheManager();
  const workspace = workspaceStore.create({
    title: input.problem.title,
    problemId: input.problem.problemId,
    problemUrl: input.problem.problemUrl,
    source: input.mode === "luogu_problem" ? "luogu" : "manual",
    entryMode: input.mode === "luogu_problem" ? "luogu" : input.mode === "current_research" ? "current_research" : "manual",
  });
  const manualSource = input.manualSource ?? {
    url: input.problem.problemUrl ?? `https://www.luogu.com.cn/problem/${input.problem.problemId}`,
    title: input.problem.title,
    text: input.problem.title,
  };
  const request = createRequest({ problem: input.problem, manualSource });
  const policy = createPolicy();
  const queryPlan = createQueryPlan(request, { problem: input.problem, manualSource });
  const candidate = createCandidate({ problem: input.problem, manualSource });
  const registry = createToolRegistry();
  const toolName = input.mode === "luogu_problem" ? "read_luogu_problem" : input.mode === "current_research" ? "read_current_research" : "read_manual_url";

  registry.register({
    name: toolName,
    description: "Read a Workbench source and turn it into citation-ready evidence.",
    inputSchema: { type: "object", required: ["url"] },
    outputSchema: { type: "object", required: ["evidencePacketId", "sourceUrl"] },
    permission: "read",
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
    run: async () => {
      const searchProvider = createManualSearchProvider({
        sources: [{
          url: manualSource.url,
          title: manualSource.title,
          snippet: manualSource.text.slice(0, 180),
        }],
      });
      const readerProvider = createManualReaderProvider({
        fixtures: {
          [manualSource.url]: {
            title: manualSource.title,
            text: manualSource.text,
          },
        },
      });
      const manualSearch = await searchProvider.search({
        request,
        policy,
        queryPlan,
        queryText: manualSource.url,
        allowPublicWeb: false,
      });
      const readerResult = await readerProvider.read({
        request,
        policy,
        queryPlan,
        candidate,
      });
      const quality = evaluateReaderQuality(readerResult);
      const extractor = createManualExtractor();
      const extraction = extractor.extract({ readerResult, quality });
      const selection = selectPassages({ request, policy, queryPlan, readerResult: extraction.extractedDocument ? { ...readerResult, document: extraction.extractedDocument } : readerResult, quality });
      const excerpt = buildExcerpt({ selection, quality, readerResult: extraction.extractedDocument ? { ...readerResult, document: extraction.extractedDocument } : readerResult });
      const packet = buildEvidencePacket({
        packetId: `${workspace.id}:manual-url-evidence`,
        request,
        policy,
        queryPlan,
        items: [{ readerResult: extraction.extractedDocument ? { ...readerResult, document: extraction.extractedDocument } : readerResult, readerQuality: quality, excerpt, candidate }],
      });
      const evaluation = evaluateEvidencePacket({ packet });
      const evidenceRecord = evidenceStore.save({ packet, evaluation, scope: "workspace" });
      const nextWorkspace = workspaceStore.update(workspace.id, {
        evidenceIds: [evidenceRecord.packetId],
      });

      cacheManager.set({
        namespace: "search",
        key: deriveResearchCacheKey("search", [request.requestId ?? workspace.id, candidate.url]),
        value: manualSearch.rawResults,
      });
      cacheManager.set({
        namespace: "read",
        key: deriveResearchCacheKey("read", [candidate.url]),
        value: readerResult,
      });
      cacheManager.set({
        namespace: "extract",
        key: deriveResearchCacheKey("extract", [candidate.url]),
        value: excerpt,
      });
      cacheManager.set({
        namespace: "evidence",
        key: deriveResearchCacheKey("evidence", [packet.packetId]),
        value: evidenceRecord,
      });
      cacheManager.set({
        namespace: "workspace",
        key: deriveResearchCacheKey("workspace", [workspace.id]),
        value: nextWorkspace,
      });

      return {
        output: {
          evidencePacketId: evidenceRecord.packetId,
          evidenceIds: packet.evidenceItems.map((item) => item.evidenceId),
          sourceUrl: candidate.url,
        },
        events: [
          {
            type: "evidence.added",
            payload: {
              packetId: evidenceRecord.packetId,
              evidenceIds: packet.evidenceItems.map((item) => item.evidenceId),
              sourceUrl: candidate.url,
              status: packet.status,
            },
          },
          {
            type: "workspace.updated",
            payload: {
              workspaceId: workspace.id,
              evidenceIds: nextWorkspace?.evidenceIds ?? [],
            },
          },
        ],
      };
    },
  });

  const permissionManager = createPermissionManager();
  const runtime = createAgentRuntime({
    session: createAgentSession({ workspaceId: workspace.id }),
    toolRegistry: registry,
    permissionManager,
  });

  await runtime.runTool(toolName, { url: manualSource.url });
  const events = runtime.events.snapshot();
  const currentWorkspace = workspaceStore.get(workspace.id) ?? workspace;
  const finalWorkspace = workspaceStore.update(workspace.id, {
    traceEventIds: events.map((event) => event.id),
    evidenceIds: currentWorkspace.evidenceIds,
  }) ?? currentWorkspace;
  const evidenceRecords = evidenceStore.list("workspace");
  const permissionRequests = createWorkbenchPermissionRequests(permissionManager);
  const oiSkillPreview = createOiSkillPreviewReadModel({
    problem: input.problem,
    evidenceRecords,
    permissionRequests,
  });
  const sessionMetadata = createAgentSessionMetadata({
    sessionId: events[0]?.sessionId ?? `session:${workspace.id}:p8`,
    workspaceId: workspace.id,
    createdAt: events[0]?.at ?? "2026-07-06T00:00:00.000Z",
    updatedAt: events[events.length - 1]?.at ?? events[0]?.at ?? "2026-07-06T00:00:00.000Z",
    privacyPolicyId: "privacy:p8-preview",
  });
  const sessionReplay = replayAgentSession({
    metadata: sessionMetadata,
    events: snapshotEventsWithSequence(events).map((event) => ({
      id: event.id,
      type: event.type,
      sessionId: event.sessionId,
      at: event.at,
      sequence: event.sequence,
      source: "runtime",
      payload: event.payload,
      redaction: {
        classification: "runtime-metadata",
        visibility: "ui-visible",
        redactionStrategy: "none",
        reason: "workbench_preview_event",
      },
    })),
    checkpoints: [],
  });
  const sessionReplayViewModel = createSessionReplayViewModel(sessionReplay);
  const providerModelRequest: ProviderModelRequestEnvelope = {
    requestId: `request:${workspace.id}:p9`,
    sessionId: sessionMetadata.sessionId,
    turnId: `turn:${workspace.id}:p9`,
    workspaceId: workspace.id,
    providerProfileId: "provider:mock",
    modelProfileId: "model:mock-reasoner",
    intent: "general",
    inputParts: [],
    toolExposure: [],
    evidenceRefs: evidenceRecords.flatMap((record) => record.packet.evidenceItems.map((item) => ({
      evidenceId: item.evidenceId,
      role: "derived-evidence" as const,
    }))),
    privacyPolicyId: "privacy:p9-preview",
    permissionDecision: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
    capabilitySnapshot: {
      providerRequest: { status: "unavailable", reason: "provider_request_not_enabled_in_p9" },
      streaming: { status: "unavailable", reason: "streaming_not_enabled_in_p9" },
      toolCalling: { status: "reserved", reason: "tool_calling_contract_only" },
    },
    idempotencyKey: `idem:${workspace.id}:p9`,
    createdAt: "2026-07-07T00:00:00.000Z",
  };
  const providerModelAdapter = createMockProviderModelAdapter({
    adapterId: "adapter:p9-mock",
    events: [
      {
        type: "model.delta.preview",
        requestId: providerModelRequest.requestId,
        sequence: 1,
        at: "2026-07-07T00:00:01.000Z",
        text: "Provider/model adapter preview uses deterministic mock events only.",
      },
    ],
  });
  const providerModelEvents = providerModelAdapter.createMockTurn(providerModelRequest);
  const providerModelPreview = createProviderModelViewModel(input.providerModelPreview ?? {
    requestId: providerModelRequest.requestId,
    providerProfileId: providerModelRequest.providerProfileId,
    modelProfileId: providerModelRequest.modelProfileId,
    outputState: "Provider/Model Adapter Contract Preview",
    events: providerModelEvents,
    capabilities: providerModelAdapter.describeCapabilities(),
    limitations: ["mock_adapter_only", "no_live_provider_request", "no_prompt_construction"],
  });

  return {
    workspace: finalWorkspace,
    events,
    evidenceRecords,
    permissionRequests,
    oiSkillPreview,
    toolDefinitions: registry.list().map(previewToolDefinition),
    cacheSnapshot: cacheManager.snapshot(),
    loopContract: createPreviewAgentLoopContract(),
    sessionReplay,
    sessionReplayViewModel,
    providerModelPreview,
  };
}

export async function runManualWorkbenchTask(input: ManualWorkbenchTaskInput): Promise<ManualWorkbenchTaskResult> {
  return runWorkbenchTask({
    mode: "manual_url",
    problem: input.problem,
    manualSource: input.manualSource,
  });
}
