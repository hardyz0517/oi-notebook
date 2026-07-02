import type { AgentEvent } from "@/lib/agent-runtime/agentTypes";

export function ToolTraceViewer({ events }: { events: AgentEvent[] }) {
  return (
    <section className="grid min-h-0 gap-2 border border-border/70 bg-background p-3">
      <header className="text-xs font-medium text-foreground">Tool Trace</header>
      <div className="grid max-h-56 gap-1 overflow-auto text-[11px] text-muted-foreground">
        {events.length === 0 ? (
          <div>No events yet.</div>
        ) : events.map((event) => (
          <div key={event.id} className="grid grid-cols-[96px_1fr] gap-2 border-b border-border/50 py-1 last:border-b-0">
            <span className="truncate text-foreground/80">{event.type}</span>
            <span className="truncate">
              {event.type === "tool.started" || event.type === "tool.output"
                ? String(event.payload.toolName ?? event.at)
                : event.type === "evidence.added"
                  ? String(event.payload.packetId ?? event.at)
                  : event.type === "workspace.updated"
                    ? String(event.payload.workspaceId ?? event.at)
                    : event.at}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
