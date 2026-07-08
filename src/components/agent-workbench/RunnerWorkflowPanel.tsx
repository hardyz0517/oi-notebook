import type { RunnerWorkflowViewModel } from "@/lib/agent-workbench/runnerWorkflowViewModel";

const formatStatus = (status: string): string => {
  if (status === "preview") return "available for preview";
  if (status === "reserved") return "reserved";
  if (status === "blocked") return "blocked";
  if (status === "denied") return "denied";
  return "unavailable";
};

export function RunnerWorkflowPanel({ preview }: { preview: RunnerWorkflowViewModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">
          {preview?.title ?? "Runner workflow projection"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {preview
            ? `${preview.executionRequest.executionRequestId} · read-only preview`
            : "No P14 runner workflow projection captured."}
        </div>
      </header>
      {preview ? (
        <div className="grid gap-3 text-[11px] text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>Runner: {preview.summary.runnerKind}</div>
            <div>Capability: {formatStatus(preview.summary.capabilityStatus)}</div>
            <div>Targets: {preview.summary.targetCount}</div>
            <div>Audit events: {preview.summary.auditEventCount}</div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div className="min-w-0 truncate" title={preview.executionRequest.safeSummary}>
              Request: {preview.executionRequest.safeSummary}
            </div>
            <div>Classification: {preview.classification.commandClass} / {preview.classification.languageClass}</div>
            <div>Test plan: {preview.classification.testRunClass} · {preview.classification.riskLevel}</div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            {preview.targetRefs.map((targetRef) => (
              <div key={targetRef.targetRefId} className="min-w-0 truncate" title={targetRef.displayPath}>
                {targetRef.displayPath} · {targetRef.pathSafetyStatus} · {targetRef.notesPolicy}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border/60 pt-2">
            <div>Sandbox: {preview.sandboxPlan.profile}</div>
            <div>Network: {preview.sandboxPlan.networkAccess}</div>
            <div>Write: {preview.sandboxPlan.writeAccess}</div>
            <div>Timeout: {preview.resourceLimits.timeoutMs}ms</div>
            <div>Max output: {preview.resourceLimits.maxOutputBytes}</div>
            <div>True execution: {preview.resourceLimits.trueExecution}</div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div className="min-w-0 truncate" title={preview.permissionRequest.reason}>
              Permission: {preview.permissionRequest.permissionKind} / {preview.permissionRequest.decisionStatus}
            </div>
            <div className="min-w-0 truncate" title={preview.approvalDecision.safeReason}>
              Approval: {preview.approvalDecision.status}
            </div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div>Mock: {preview.mockResult.mode} / {preview.mockResult.status}</div>
            <div>Observation: {preview.observation.status} / {preview.observation.redactionStatus}</div>
            <div className="min-w-0 truncate" title={preview.observation.safeSummary}>
              {preview.observation.safeSummary || "No visible observation summary."}
            </div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div>Cleanup required: {preview.cleanupMetadata.requiredBeforeExecute ? "yes" : "no"}</div>
            <div className="min-w-0 truncate">
              Recovery: {preview.cleanupMetadata.recoveryStrategy}
            </div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            {preview.auditEvents.slice(0, 5).map((event) => (
              <div key={event.eventId} className="min-w-0 truncate" title={event.summary}>
                {event.eventType} · {event.status}
              </div>
            ))}
          </div>
          <div className="min-w-0 truncate border-t border-border/60 pt-2">
            Limitations: {preview.limitations.join(", ")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
