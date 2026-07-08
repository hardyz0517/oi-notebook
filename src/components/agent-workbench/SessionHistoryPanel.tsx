import type { SessionHistoryViewModel } from "@/lib/agent-workbench/sessionHistoryViewModel";

const formatCapability = (status: string): string => {
  if (status === "preview") return "available for preview";
  if (status === "reserved") return "reserved";
  if (status === "blocked") return "blocked";
  return "unavailable";
};

export function SessionHistoryPanel({ history }: { history: SessionHistoryViewModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">
          {history?.title ?? "Durable session history projection"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {history ? `${history.session.sessionId} · read-only preview` : "No P12 session history projection captured."}
        </div>
      </header>
      {history ? (
        <div className="grid gap-3 text-[11px] text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>Events: {history.summary.eventCount}</div>
            <div>Checkpoints: {history.summary.checkpointCount}</div>
            <div>Requests: {history.summary.requestAuditRecordCount}</div>
            <div>Warnings: {history.summary.warningCount}</div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div className="min-w-0 truncate">Storage: {history.session.storageAdapterKind}</div>
            <div className="min-w-0 truncate">Workspace refs: {history.linkage.workspaceRefs.join(", ") || "none"}</div>
            <div className="min-w-0 truncate">Evidence refs: {history.linkage.evidenceRefs.join(", ") || "none"}</div>
            <div className="min-w-0 truncate">
              Replay checkpoints: {history.linkage.replayCheckpointRefs.join(", ") || "none"}
            </div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div title={history.capabilities.durableSessionMetadata.reason}>
              Durable metadata: {formatCapability(history.capabilities.durableSessionMetadata.status)}
            </div>
            <div title={history.capabilities.requestLogPersistence.reason}>
              Request audit: {formatCapability(history.capabilities.requestLogPersistence.status)}
            </div>
            <div title={history.capabilities.replayPersistence.reason}>
              Replay projection: {formatCapability(history.capabilities.replayPersistence.status)}
            </div>
            <div title={history.capabilities.storageAdapter.reason}>
              Storage adapter: {formatCapability(history.capabilities.storageAdapter.status)}
            </div>
          </div>
          {history.requestAuditTrail.length > 0 ? (
            <ol className="grid gap-0 border-t border-border/60 pt-2">
              {history.requestAuditTrail.map((record) => (
                <li key={record.requestLogId} className="grid gap-1 border-t border-border/60 py-2 first:border-t-0 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] font-medium text-foreground">
                      {record.requestKind}
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{record.status}</span>
                  </div>
                  <div className="min-w-0 truncate" title={record.safeInputSummary}>
                    Input: {record.safeInputSummary}
                  </div>
                  <div className="min-w-0 truncate" title={record.safeOutputSummary}>
                    Output: {record.safeOutputSummary}
                  </div>
                  <div className="min-w-0 truncate text-[10px]">
                    {record.providerId} / {record.modelId}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          {history.corruptionWarnings.length > 0 ? (
            <div className="grid gap-1 border-t border-border/60 pt-2">
              {history.corruptionWarnings.map((warning) => (
                <div key={warning.warningId} className="min-w-0 truncate" title={warning.message}>
                  {warning.severity}: {warning.message}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
