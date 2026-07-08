import type {
  PatchWorkflowProposalViewModel,
  PatchWorkflowViewModel,
} from "@/lib/agent-workbench/patchWorkflowViewModel";

const formatStatus = (status: string): string => {
  if (status === "preview") return "available for preview";
  if (status === "reserved") return "reserved";
  if (status === "blocked") return "blocked";
  if (status === "denied") return "denied";
  return "unavailable";
};

function PatchProposalPreview({ proposal }: { proposal: PatchWorkflowProposalViewModel }) {
  return (
    <li className="grid gap-2 border-t border-border/60 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-medium text-foreground">
          {proposal.proposalSummary || proposal.proposalId}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{proposal.risk.riskLevel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        <div className="min-w-0 truncate" title={proposal.patchFormat}>Format: {proposal.patchFormat}</div>
        <div title={proposal.capabilityStatus}>Capability: {formatStatus(proposal.capabilityStatus)}</div>
        <div className="min-w-0 truncate" title={proposal.permissionRequest.reason}>
          Permission: {proposal.permissionRequest.permissionKind} / {proposal.permissionRequest.decisionStatus}
        </div>
        <div>Approval: {proposal.approvalDecision?.status ?? "unavailable"}</div>
        <div>Validation: {proposal.validationResult.status}</div>
        <div>Dry-run: {proposal.dryRunResult.status}</div>
      </div>
      <div className="grid gap-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        {proposal.targetRefs.map((targetRef) => (
          <div key={targetRef.targetRefId} className="min-w-0 truncate" title={targetRef.displayPath}>
            {targetRef.displayPath} · {targetRef.pathSafetyStatus} · {targetRef.notesPolicy}
          </div>
        ))}
      </div>
      {proposal.diffPreview?.safeHunks.length ? (
        <div className="grid gap-1 border-t border-border/60 pt-2 text-[10px] text-muted-foreground">
          {proposal.diffPreview.safeHunks.slice(0, 2).map((hunk) => (
            <pre
              key={`${hunk.targetRefId}:${hunk.oldStart}:${hunk.newStart}`}
              className="max-h-28 overflow-auto whitespace-pre-wrap border border-border/60 bg-muted/20 p-2"
            >
              {hunk.safePreviewLines.join("\n")}
            </pre>
          ))}
        </div>
      ) : null}
      <div className="grid gap-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <div className="min-w-0 truncate">
          Recovery metadata: {proposal.rollbackPlan.rollbackKind} · {proposal.rollbackPlan.affectedTargetRefs.length} target refs
        </div>
        <div className="min-w-0 truncate">
          Warnings: {proposal.validationResult.warnings.join(", ") || "none"}
        </div>
      </div>
    </li>
  );
}

export function PatchWorkflowPanel({ preview }: { preview: PatchWorkflowViewModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">
          {preview?.title ?? "Patch workflow projection"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {preview
            ? `${preview.summary.proposalCount} proposals · read-only preview`
            : "No P13 patch workflow projection captured."}
        </div>
      </header>
      {preview ? (
        <div className="grid gap-3 text-[11px] text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>Targets: {preview.summary.targetCount}</div>
            <div>Diffs: {preview.summary.diffPreviewCount}</div>
            <div>Approvals: {preview.summary.approvalDecisionCount}</div>
            <div>Audit events: {preview.summary.auditEventCount}</div>
          </div>
          <ol className="grid gap-0 border-t border-border/60 pt-2">
            {preview.proposals.map((proposal) => (
              <PatchProposalPreview key={proposal.proposalId} proposal={proposal} />
            ))}
          </ol>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            {preview.auditEvents.slice(0, 4).map((event) => (
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
