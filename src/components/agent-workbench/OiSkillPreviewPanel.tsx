import type { OiSkillReadModel } from "@/lib/oi-skills";

export function OiSkillPreviewPanel({ preview }: { preview: OiSkillReadModel | null }) {
  return (
    <section className="grid gap-3 border border-border/70 bg-background p-3">
      <header className="grid gap-1">
        <div className="text-xs font-medium text-foreground">OI Research/Solution Skill Contract Preview</div>
        <div className="text-[11px] text-muted-foreground">
          {preview ? `${preview.invocation.skillId} · ${preview.status}` : "No OI skill preview captured."}
        </div>
      </header>
      {preview ? (
        <div className="grid gap-2 text-[11px] text-muted-foreground">
          <div className="min-w-0 truncate">Problem: {preview.problemRef.title}</div>
          <div>Sources: {preview.sources.length}</div>
          <div>Evidence: {preview.evidence.length}</div>
          <div className="min-w-0 truncate">Limitations: {preview.limitations.join(", ") || "none"}</div>
          {preview.solutionOutline ? (
            <div className="grid gap-1 border-t border-border/60 pt-2">
              <div className="text-foreground/80">Solution outline: {preview.solutionOutline.status}</div>
              <div className="min-w-0 truncate">Algorithm: {preview.solutionOutline.algorithm}</div>
              <div>
                Complexity: {preview.solutionOutline.complexity.time} / {preview.solutionOutline.complexity.memory}
              </div>
              <div className="min-w-0 truncate">Citations: {preview.solutionOutline.citationIds.join(", ") || "none"}</div>
            </div>
          ) : (
            <div>No solution outline preview.</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
