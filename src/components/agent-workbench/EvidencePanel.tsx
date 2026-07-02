import type { EvidenceStoreRecord } from "@/lib/research-engine";

export function EvidencePanel({ records }: { records: EvidenceStoreRecord[] }) {
  return (
    <section className="grid min-h-0 gap-2 border border-border/70 bg-background p-3">
      <header className="text-xs font-medium text-foreground">Evidence</header>
      <div className="grid max-h-56 gap-2 overflow-auto text-[11px] text-muted-foreground">
        {records.length === 0 ? (
          <div>No evidence captured.</div>
        ) : records.map((record) => (
          <article key={record.packetId} className="grid gap-1 border-b border-border/50 pb-2 last:border-b-0">
            <div className="truncate text-foreground/80">{record.packetId}</div>
            <div>{record.scope} · {record.packet.status}</div>
            <div>{record.packet.evidenceItems.length} sources · {record.packet.evidenceSummary.citeableCount} citeable</div>
            {record.packet.evidenceItems.slice(0, 2).map((item) => (
              <div key={item.evidenceId} className="min-w-0 truncate">
                {item.evidenceId} · {item.title} · {item.url}
              </div>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
