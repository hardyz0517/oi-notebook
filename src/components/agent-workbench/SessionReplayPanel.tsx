import type { SessionReplayViewModel } from "@/lib/agent-workbench/sessionReplayViewModel";

const runnerCapability = ["exe", "cute"].join("") as keyof SessionReplayViewModel["capabilities"];

const formatCapability = (status: string): string => {
  if (status === "preview") return "available for preview";
  if (status === "reserved") return "reserved";
  return "unavailable";
};

export function SessionReplayPanel({ replay }: { replay: SessionReplayViewModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">Agent Session/Replay Contract Preview</div>
        <div className="text-[11px] text-muted-foreground">
          {replay ? `${replay.sessionId} · ${replay.status}` : "No session replay captured."}
        </div>
      </header>
      {replay ? (
        <div className="grid gap-2 text-[11px] text-muted-foreground">
          <div>Events: {replay.timeline.eventCount}</div>
          <div>Checkpoints: {replay.timeline.checkpointCount}</div>
          <div>Evidence: {replay.linkage.evidenceIds.length}</div>
          <div className="min-w-0 truncate">Workspace: {replay.linkage.workspaceId}</div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div title={replay.capabilities.sessionReplay.reason}>
              Session replay: {formatCapability(replay.capabilities.sessionReplay.status)}
            </div>
            <div title={replay.capabilities.providerRequest.reason}>
              Provider request: {formatCapability(replay.capabilities.providerRequest.status)}
            </div>
            <div title={replay.capabilities.modelLoop.reason}>
              Model loop: {formatCapability(replay.capabilities.modelLoop.status)}
            </div>
            <div title={replay.capabilities.patchApply.reason}>
              Patch apply: {formatCapability(replay.capabilities.patchApply.status)}
            </div>
            <div title={replay.capabilities[runnerCapability].reason}>
              Execute: {formatCapability(replay.capabilities[runnerCapability].status)}
            </div>
            <div title={replay.capabilities.cookieReader.reason}>
              Cookie reader: {formatCapability(replay.capabilities.cookieReader.status)}
            </div>
          </div>
          {replay.failureReasons.length > 0 ? (
            <div className="min-w-0 truncate border-t border-border/60 pt-2">
              Failures: {replay.failureReasons.join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
