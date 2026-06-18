import type { ReactNode } from "react"

import { ListItem } from "@/components/ui/list-item"
import { cn } from "@/lib/utils"

export type SettingRowDensity = "normal" | "compact"
export type SettingRowLayout = "split" | "stacked" | "nested"

export interface SettingRowProps {
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  density?: SettingRowDensity
  layout?: SettingRowLayout
  className?: string
  contentClassName?: string
  controlClassName?: string
}

function SettingRow({
  title,
  description,
  children,
  density = "normal",
  layout = "split",
  className,
  contentClassName,
  controlClassName,
}: SettingRowProps) {
  return (
    <ListItem
      className={cn(
        "grid gap-3 border-[var(--ui-border-subtle)] px-4 py-3",
        density === "compact" && "px-3 py-2",
        layout === "split" && "grid-cols-[minmax(0,1fr)_auto] items-center",
        layout === "stacked" && "grid-cols-1",
        layout === "nested" &&
          "ml-4 grid-cols-[minmax(0,1fr)_auto] items-center border-l pl-4",
        className,
      )}
      data-density={density}
      data-layout={layout}
    >
      <div className={cn("min-w-0", contentClassName)}>
        <div className="text-xs font-medium text-foreground">{title}</div>
        {description ? (
          <div className="mt-1 text-xs/relaxed text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      {children ? (
        <div
          className={cn(
            "flex min-w-0 items-center justify-end gap-2",
            controlClassName,
          )}
        >
          {children}
        </div>
      ) : null}
    </ListItem>
  )
}

export { SettingRow }
