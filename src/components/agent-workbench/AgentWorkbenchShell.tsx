import { Loader2, Play } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createPreviewAgentLoopContract } from "@/lib/agent-runtime/agentLoopContract";
import type { AgentEvent, AgentLoopCapabilityStatus, AgentLoopContract } from "@/lib/agent-runtime/agentTypes";
import { createAgentSession } from "@/lib/agent-runtime/agentSession";
import type { ProviderModelViewModel } from "@/lib/agent-workbench/providerModelViewModel";
import type { SessionReplayViewModel } from "@/lib/agent-workbench/sessionReplayViewModel";
import type { ModelLoopViewModel } from "@/lib/agent-workbench/modelLoopViewModel";
import type { SessionHistoryViewModel } from "@/lib/agent-workbench/sessionHistoryViewModel";
import { runWorkbenchTask, type WorkbenchTaskMode } from "@/lib/agent-workbench/workbenchTaskFlow";
import type { AgentWorkbenchPreviewResult } from "@/lib/api";
import type { OiSkillReadModel } from "@/lib/oi-skills";
import { type ProblemWorkspace } from "@/lib/problem-workspace/problemWorkspaceTypes";
import type { EvidenceStoreRecord } from "@/lib/research-engine";
import { EvidencePanel } from "./EvidencePanel";
import { ModelLoopTimelinePanel } from "./ModelLoopTimelinePanel";
import { OiSkillPreviewPanel } from "./OiSkillPreviewPanel";
import { PermissionSurface, type PermissionRequestPreview } from "./PermissionSurface";
import { ProblemWorkspacePanel } from "./ProblemWorkspacePanel";
import { ProviderModelPreviewPanel } from "./ProviderModelPreviewPanel";
import { SessionReplayPanel } from "./SessionReplayPanel";
import { SessionHistoryPanel } from "./SessionHistoryPanel";
import { ToolTraceViewer } from "./ToolTraceViewer";

const DEFAULT_WORKSPACE: ProblemWorkspace = {
  id: "workspace:manual",
  title: "Manual Problem Workspace",
  source: "manual",
  problemId: "manual",
  sampleInputs: [],
  sampleOutputs: [],
  evidenceIds: [],
  traceEventIds: [],
};

const DEFAULT_EVENTS: AgentEvent[] = [
  {
    id: "agent-workbench-preview-started",
    type: "agent.started",
    sessionId: createAgentSession({ workspaceId: DEFAULT_WORKSPACE.id }).id,
    at: new Date(0).toISOString(),
    payload: { workspaceId: DEFAULT_WORKSPACE.id },
  },
];

const formatPreviewStatus = (status: AgentWorkbenchPreviewResult["runtimeStatus"] | undefined): string => {
  if (status === "preview") return "available for preview";
  return "unavailable";
};

const formatCapabilityStatus = (status: AgentLoopCapabilityStatus): string => {
  if (status === "preview") return "available for preview";
  if (status === "reserved") return "reserved";
  return "unavailable";
};

export function AgentWorkbenchShell({
  workspace = DEFAULT_WORKSPACE,
  events = DEFAULT_EVENTS,
  evidenceRecords = [],
  permissionRequests = [],
  loopContract = createPreviewAgentLoopContract(),
  oiSkillPreview = null,
  modelLoopPreview = null,
  preview = null,
}: {
  workspace?: ProblemWorkspace;
  events?: AgentEvent[];
  evidenceRecords?: EvidenceStoreRecord[];
  permissionRequests?: PermissionRequestPreview[];
  loopContract?: AgentLoopContract;
  oiSkillPreview?: OiSkillReadModel | null;
  modelLoopPreview?: ModelLoopViewModel | null;
  preview?: AgentWorkbenchPreviewResult | null;
}) {
  const [currentWorkspace, setCurrentWorkspace] = useState(workspace);
  const [currentEvents, setCurrentEvents] = useState(events);
  const [currentEvidenceRecords, setCurrentEvidenceRecords] = useState(evidenceRecords);
  const [currentPermissionRequests, setCurrentPermissionRequests] = useState(permissionRequests);
  const [currentLoopContract, setCurrentLoopContract] = useState(loopContract);
  const [currentOiSkillPreview, setCurrentOiSkillPreview] = useState<OiSkillReadModel | null>(oiSkillPreview);
  const [currentSessionReplay, setCurrentSessionReplay] = useState<SessionReplayViewModel | null>(null);
  const [currentProviderModelPreview, setCurrentProviderModelPreview] = useState<ProviderModelViewModel | null>(null);
  const [currentModelLoopPreview, setCurrentModelLoopPreview] = useState<ModelLoopViewModel | null>(modelLoopPreview);
  const [currentSessionHistoryPreview, setCurrentSessionHistoryPreview] = useState<SessionHistoryViewModel | null>(null);
  const [manualUrl, setManualUrl] = useState(workspace.problemUrl ?? "https://example.com/lca");
  const [manualTitle, setManualTitle] = useState(workspace.title === DEFAULT_WORKSPACE.title ? "Lowest Common Ancestor Notes" : workspace.title);
  const [manualText, setManualText] = useState("Lowest common ancestor can be solved with binary lifting after DFS preprocessing.\n\nFor each vertex, up[v][k] stores the 2^k-th ancestor of v.");
  const [taskMode, setTaskMode] = useState<WorkbenchTaskMode>("manual_url");
  const [isRunning, setIsRunning] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  const runManualTask = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsRunning(true);
    setTaskError(null);
    try {
      const result = await runWorkbenchTask({
        mode: taskMode,
        problem: {
          title: manualTitle.trim() || "Manual Problem Workspace",
          problemId: "manual",
          problemUrl: manualUrl.trim() || undefined,
        },
        manualSource: {
          url: manualUrl.trim() || "manual://source",
          title: manualTitle.trim() || "Manual Source",
          text: manualText,
        },
      });
      setCurrentWorkspace(result.workspace);
      setCurrentEvents(result.events);
      setCurrentEvidenceRecords(result.evidenceRecords);
      setCurrentPermissionRequests(result.permissionRequests);
      setCurrentLoopContract(result.loopContract);
      setCurrentOiSkillPreview(result.oiSkillPreview);
      setCurrentSessionReplay(result.sessionReplayViewModel);
      setCurrentProviderModelPreview(result.providerModelPreview);
      setCurrentModelLoopPreview(result.modelLoopPreview);
      setCurrentSessionHistoryPreview(result.sessionHistoryPreview);
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : "manual_task_failed");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_280px] gap-3 overflow-hidden bg-muted/10 p-3">
      <aside className="min-h-0 overflow-auto">
        <ProblemWorkspacePanel workspace={currentWorkspace} />
      </aside>
      <main className="grid min-h-0 content-start gap-3 overflow-auto">
        <div className="grid gap-2 border border-border/70 bg-background p-4">
          <h2 className="text-sm font-semibold text-foreground">{preview?.previewName ?? "Agent Workbench Foundation Preview"}</h2>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
            <div title={preview?.runtimeReason}>Runtime: {formatPreviewStatus(preview?.runtimeStatus)}</div>
            <div title={preview?.workspaceReason}>Workspace: {formatPreviewStatus(preview?.workspaceStatus)}</div>
            <div title={preview?.researchBoundaryReason}>Research: {formatPreviewStatus(preview?.researchBoundaryStatus)}</div>
            <div title={preview?.unavailableReason}>Model loop: {preview?.modelLoopStatus ?? "unavailable"}</div>
            <div title={preview?.unavailableReason}>Patch/execute: {preview?.patchStatus ?? "unavailable"} / {preview?.executeStatus ?? "unavailable"}</div>
            <div title={preview?.unavailableReason}>Persistence: {preview?.persistenceStatus ?? "unavailable"}</div>
            <div>Legacy sidebar: {preview?.legacySidebarIsolated ? "isolated" : "unchanged"}</div>
          </div>
          <div className="grid gap-1 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
            <div className="font-medium text-foreground">Loop contract: {currentLoopContract.mode}</div>
            <div className="grid grid-cols-2 gap-2">
              <div title={currentLoopContract.modelStep.reason}>Model step: {formatCapabilityStatus(currentLoopContract.modelStep.status)}</div>
              <div title={currentLoopContract.toolRequest.reason}>Tool request: {formatCapabilityStatus(currentLoopContract.toolRequest.status)}</div>
              <div title={currentLoopContract.permissionDecision.reason}>Permission decision: {formatCapabilityStatus(currentLoopContract.permissionDecision.status)}</div>
              <div title={currentLoopContract.toolExecution.reason}>Tool execution: {formatCapabilityStatus(currentLoopContract.toolExecution.status)}</div>
              <div title={currentLoopContract.observation.reason}>Observation: {formatCapabilityStatus(currentLoopContract.observation.status)}</div>
              <div title={currentLoopContract.continuation.reason}>Continuation: {formatCapabilityStatus(currentLoopContract.continuation.status)}</div>
              <div title={currentLoopContract.compaction.reason}>Compaction: {formatCapabilityStatus(currentLoopContract.compaction.status)}</div>
              <div title={currentLoopContract.patchGeneration.reason}>Patch generation: {formatCapabilityStatus(currentLoopContract.patchGeneration.status)}</div>
              <div title={currentLoopContract.patchApply.reason}>Patch apply: {formatCapabilityStatus(currentLoopContract.patchApply.status)}</div>
              <div title={currentLoopContract.sessionPersistence.reason}>Session persistence: {formatCapabilityStatus(currentLoopContract.sessionPersistence.status)}</div>
            </div>
          </div>
        </div>
        <form className="grid gap-2 border border-border/70 bg-background p-3" onSubmit={runManualTask}>
          <div className="grid grid-cols-3 gap-1 text-[11px]">
            {[
              ["manual_url", "Manual"],
              ["luogu_problem", "Luogu"],
              ["current_research", "Current"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`h-7 border px-2 text-left ${taskMode === value ? "border-foreground bg-foreground/5 text-foreground" : "border-border bg-background text-muted-foreground"}`}
                onClick={() => setTaskMode(value as WorkbenchTaskMode)}
              >
                {label}
              </button>
              ))}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {taskMode === "manual_url" ? "Manual URL reading" : taskMode === "luogu_problem" ? "Luogu problem reading" : "Current research reading"}
          </div>
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <label className="grid min-w-0 gap-1 text-[11px] text-muted-foreground">
              {taskMode === "luogu_problem" ? "Luogu URL" : "URL"}
              <input
                value={manualUrl}
                onChange={(event) => setManualUrl(event.target.value)}
                className="h-8 min-w-0 border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
              />
            </label>
            <label className="grid min-w-0 gap-1 text-[11px] text-muted-foreground">
              {taskMode === "current_research" ? "Research Title" : "Title"}
              <input
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                className="h-8 min-w-0 border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring"
              />
            </label>
          </div>
          <textarea
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            rows={5}
            className="min-h-28 resize-y border border-border bg-background px-2 py-2 text-xs text-foreground outline-none focus-visible:border-ring"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="submit"
              disabled={isRunning}
              className="inline-flex h-8 items-center gap-1.5 border border-border bg-muted/30 px-3 text-xs text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
              Run
            </button>
            {taskError && <div className="min-w-0 truncate text-[11px] text-destructive">{taskError}</div>}
          </div>
        </form>
        <ToolTraceViewer events={currentEvents} />
      </main>
      <aside className="grid min-h-0 content-start gap-3 overflow-auto">
        <PermissionSurface requests={currentPermissionRequests} />
        <OiSkillPreviewPanel preview={currentOiSkillPreview} />
        <SessionReplayPanel replay={currentSessionReplay} />
        <SessionHistoryPanel history={currentSessionHistoryPreview} />
        <ProviderModelPreviewPanel preview={currentProviderModelPreview} />
        <ModelLoopTimelinePanel preview={currentModelLoopPreview} />
        <EvidencePanel records={currentEvidenceRecords} />
      </aside>
    </section>
  );
}
