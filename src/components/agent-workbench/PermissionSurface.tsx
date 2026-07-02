import type { AgentToolPermission } from "@/lib/agent-runtime/agentTypes";

export interface PermissionRequestPreview {
  id?: string;
  toolName: string;
  permission: AgentToolPermission;
  status?: "blocked" | "pending" | "granted";
  reason: string;
}

export function PermissionSurface({ requests }: { requests: PermissionRequestPreview[] }) {
  return (
    <section className="grid gap-2 border border-border/70 bg-background p-3">
      <header className="text-xs font-medium text-foreground">Permissions</header>
      <div className="grid gap-2 text-[11px] text-muted-foreground">
        {requests.length === 0 ? (
          <div>No permission requests.</div>
        ) : requests.map((request) => (
          <div key={request.id ?? `${request.toolName}:${request.permission}`} className="grid gap-1">
            <div className="text-foreground/80">
              {request.toolName} · {request.permission}{request.status ? ` · ${request.status}` : ""}
            </div>
            <div>{request.reason}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
