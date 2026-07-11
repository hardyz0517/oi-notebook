import type { CookieReaderViewModel } from "@/lib/agent-workbench/cookieReaderViewModel";

const formatStatus = (status: string): string => {
  if (status === "preview") return "available for preview";
  if (status === "reserved") return "reserved";
  if (status === "blocked") return "blocked";
  if (status === "denied") return "denied";
  if (status === "prompt-required") return "review required";
  return "unavailable";
};

export function CookieReaderPanel({ preview }: { preview: CookieReaderViewModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">
          {preview?.title ?? "Cookie reader projection"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {preview
            ? `${preview.readerRequestId} - read-only preview`
            : "No P15 cookie reader projection captured."}
        </div>
      </header>
      {preview ? (
        <div className="grid gap-3 text-[11px] text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>Source: {preview.source.sourceProfile}</div>
            <div>Capability: {formatStatus(preview.capabilityStatus)}</div>
            <div>Consent: {preview.source.consentStatus}</div>
            <div>Network: {preview.source.networkPolicy}</div>
            <div>Auth material: {preview.source.authMaterialPolicy}</div>
            <div>Fixture: {preview.source.fixturePolicy}</div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div className="min-w-0 truncate" title={preview.source.displayOrigin}>
              Origin: {preview.source.displayOrigin}
            </div>
            <div>Display only: {preview.source.displayOnly ? "yes" : "no"}</div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div className="min-w-0 truncate" title={preview.permission.reviewReason}>
              Permission: {formatStatus(preview.permission.decisionStatus)}
            </div>
            <div>Approval: {preview.permission.approvalStatus}</div>
            <div>Sensitive input requested: {preview.permission.requestedSensitiveInput ? "yes" : "no"}</div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div>Redaction: {preview.redaction.redactionStatus}</div>
            <div>Removed classes: {preview.redaction.redactedClasses.length}</div>
            <div className="min-w-0 truncate" title={preview.redaction.safeSummary}>
              {preview.redaction.safeSummary}
            </div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div>Observation: {preview.fixtureObservation.mode} / {preview.fixtureObservation.status}</div>
            <div className="min-w-0 truncate" title={preview.fixtureObservation.safeTitle}>
              {preview.fixtureObservation.safeTitle}
            </div>
            <div className="min-w-0 truncate" title={preview.fixtureObservation.safeExcerpt}>
              {preview.fixtureObservation.safeExcerpt || "No visible fixture summary."}
            </div>
          </div>
          <div className="grid gap-1 border-t border-border/60 pt-2">
            <div className="min-w-0 truncate">
              Blocked: {preview.blockedReasons.length ? preview.blockedReasons.join(", ") : "none"}
            </div>
            <div className="min-w-0 truncate">
              Unavailable: {preview.unavailableReasons.length ? preview.unavailableReasons.join(", ") : "none"}
            </div>
          </div>
          <div className="min-w-0 truncate border-t border-border/60 pt-2">
            Limitations: {preview.limitations.join(", ")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
