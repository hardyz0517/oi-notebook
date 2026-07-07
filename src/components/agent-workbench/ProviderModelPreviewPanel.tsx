import type { ProviderModelViewModel } from "@/lib/agent-workbench/providerModelViewModel";

const formatCapability = (status: string): string => {
  if (status === "preview") return "available for preview";
  if (status === "reserved") return "reserved";
  return "unavailable";
};

export function ProviderModelPreviewPanel({ preview }: { preview: ProviderModelViewModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">
          {preview?.title ?? "Provider/model projection"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {preview ? `Provider/model: ${preview.providerProfileId} / ${preview.modelProfileId}` : "No provider/model projection captured."}
        </div>
      </header>
      {preview ? (
        <div className="grid gap-2 text-[11px] text-muted-foreground">
          <div className="min-w-0 truncate">Request: {preview.requestId}</div>
          <div title={preview.providerRequestStatus.reason}>
            Provider request: {formatCapability(preview.providerRequestStatus.status)}
          </div>
          <div title={preview.streamingStatus.reason}>Streaming: {formatCapability(preview.streamingStatus.status)}</div>
          <div title={preview.toolCallingStatus.reason}>Tool calling: {formatCapability(preview.toolCallingStatus.status)}</div>
          <div>Stream events: {preview.eventCount}</div>
          <div className="min-w-0 truncate">Stream text: {preview.previewText || "none"}</div>
          <div className="min-w-0 truncate border-t border-border/60 pt-2">
            Limitations: {preview.limitations.join(", ") || "none"}
          </div>
        </div>
      ) : null}
    </section>
  );
}
