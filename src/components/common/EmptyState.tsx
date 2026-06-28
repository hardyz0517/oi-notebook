import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface EmptyStateProps extends Omit<React.ComponentProps<"div">, "title"> {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
}

export function EmptyState({
  title,
  description,
  action,
  className,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn("grid min-w-0 place-items-center gap-2 px-4 py-8 text-center", className)}
      {...props}
    >
      <div className="grid max-w-sm gap-1">
        {title ? <div className="text-sm font-medium text-foreground">{title}</div> : null}
        {description ? <div className="text-xs/relaxed text-muted-foreground">{description}</div> : null}
        {children}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
