import { createAgentRuntime } from "@/lib/agent-runtime/agentRuntime";
import { createAgentSession } from "@/lib/agent-runtime/agentSession";
import type { AgentEvent, AgentToolPermission } from "@/lib/agent-runtime/agentTypes";
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

export type WorkbenchTaskPermissionStatus = "blocked" | "pending" | "granted";

export type WorkbenchTaskPermissionRequest = {
  id: string;
  toolName: string;
  permission: AgentToolPermission;
  status: WorkbenchTaskPermissionStatus;
  reason: string;
};

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
};

export type ManualWorkbenchTaskResult = {
  workspace: ProblemWorkspace;
  events: AgentEvent[];
  evidenceRecords: EvidenceStoreRecord[];
  permissionRequests: WorkbenchTaskPermissionRequest[];
  cacheSnapshot: ReturnType<ResearchCacheManager["snapshot"]>;
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

const createUnavailablePermissionStates = (): WorkbenchTaskPermissionRequest[] => [
  {
    id: "tavily:unavailable",
    toolName: "tavily_search",
    permission: "network",
    status: "blocked",
    reason: "Tavily is not configured; manual/public-safe reading remains available.",
  },
  {
    id: "luogu-cookie:missing",
    toolName: "luogu_cookie_reader",
    permission: "network",
    status: "blocked",
    reason: "No domain-limited Luogu cookie is available for this task.",
  },
];

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
    permission: "read",
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

  const runtime = createAgentRuntime({
    session: createAgentSession({ workspaceId: workspace.id }),
    toolRegistry: registry,
    permissionManager: createPermissionManager(),
  });

  await runtime.runTool(toolName, { url: manualSource.url });
  const events = runtime.events.snapshot();
  const currentWorkspace = workspaceStore.get(workspace.id) ?? workspace;
  const finalWorkspace = workspaceStore.update(workspace.id, {
    traceEventIds: events.map((event) => event.id),
    evidenceIds: currentWorkspace.evidenceIds,
  }) ?? currentWorkspace;

  return {
    workspace: finalWorkspace,
    events,
    evidenceRecords: evidenceStore.list("workspace"),
    permissionRequests: createUnavailablePermissionStates(),
    cacheSnapshot: cacheManager.snapshot(),
  };
}

export async function runManualWorkbenchTask(input: ManualWorkbenchTaskInput): Promise<ManualWorkbenchTaskResult> {
  return runWorkbenchTask({
    mode: "manual_url",
    problem: input.problem,
    manualSource: input.manualSource,
  });
}
