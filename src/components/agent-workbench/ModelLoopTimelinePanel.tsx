import type { ModelLoopTimelineItem, ModelLoopViewModel } from "@/lib/agent-workbench/modelLoopViewModel";

const kindLabel: Record<ModelLoopTimelineItem["kind"], string> = {
  turn: "Turn",
  step: "Step",
  "model-delta": "Model delta",
  "tool-call": "Tool call",
  permission: "Permission",
  lifecycle: "Lifecycle",
  observation: "Observation",
  terminal: "Terminal",
};

function ModelLoopTimelineRow({ item }: { item: ModelLoopTimelineItem }) {
  return (
    <li className="grid gap-1 border-t border-border/60 py-2 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-medium text-foreground">{item.title}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">{kindLabel[item.kind]}</span>
      </div>
      <div className="min-w-0 truncate text-[11px] text-muted-foreground" title={item.detail}>
        {item.detail}
      </div>
      <div className="min-w-0 truncate text-[10px] text-muted-foreground">
        {[
          item.stepId,
          item.toolName ?? undefined,
          item.observationId,
          item.terminalStatus,
        ].filter(Boolean).join(" · ") || item.turnId}
      </div>
    </li>
  );
}

export function ModelLoopTimelinePanel({ preview }: { preview: ModelLoopViewModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">
          {preview?.title ?? "Model loop projection"}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {preview ? `${preview.turn.turnId} · ${preview.terminalStatus ?? preview.turn.status}` : "No P11 runtime loop result captured."}
        </div>
      </header>
      {preview ? (
        <div className="grid gap-3 text-[11px] text-muted-foreground">
          <div className="grid grid-cols-2 gap-2">
            <div>Step: {preview.turn.currentStep} / {preview.turn.maxSteps}</div>
            <div>Attempt: {preview.turn.attempt}</div>
            <div>Observations: {preview.observations.length}</div>
            <div>Timeline: {preview.timeline.length}</div>
          </div>
          {preview.failureDetail ? (
            <div className="min-w-0 truncate border-t border-border/60 pt-2" title={preview.failureDetail}>
              Failure: {preview.failureDetail}
            </div>
          ) : null}
          <ol className="grid gap-0">
            {preview.timeline.map((item) => (
              <ModelLoopTimelineRow key={item.id} item={item} />
            ))}
          </ol>
          <div className="min-w-0 truncate border-t border-border/60 pt-2">
            Limitations: {preview.limitations.join(", ")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
