import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface PanelProps extends React.ComponentProps<"section"> {
  tone?: "default" | "muted" | "floating"
}

export function Panel({ className, tone = "default", ...props }: PanelProps) {
  return (
    <section
      data-slot="panel"
      data-tone={tone}
      className={cn(
        "min-w-0 rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-subtle)] text-card-foreground",
        tone === "default" && "bg-card shadow-sm",
        tone === "muted" && "bg-muted/20",
        tone === "floating" && "bg-background/96 shadow-xl shadow-black/20 backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  )
}

export function PanelHeader({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="panel-header"
      className={cn("flex min-w-0 items-center justify-between gap-3 border-b border-[var(--ui-border-subtle)] px-4 py-3", className)}
      {...props}
    />
  )
}

export function PanelTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="panel-title"
      className={cn("min-w-0 text-sm font-semibold text-foreground", className)}
      {...props}
    />
  )
}

export function PanelDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="panel-description"
      className={cn("mt-1 text-xs/relaxed text-muted-foreground", className)}
      {...props}
    />
  )
}

export function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="panel-body" className={cn("min-w-0 p-4", className)} {...props} />
}

export function PanelActions({ className, children, ...props }: React.ComponentProps<"div"> & { children: ReactNode }) {
  return (
    <div
      data-slot="panel-actions"
      className={cn("flex min-w-0 items-center justify-end gap-2", className)}
      {...props}
    >
      {children}
    </div>
  )
}
