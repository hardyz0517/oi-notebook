import * as React from "react"

import { cn } from "@/lib/utils"

export interface ListItemProps extends React.ComponentProps<"div"> {
  interactive?: boolean
  selected?: boolean
}

function ListItem({
  className,
  interactive = false,
  selected = false,
  ...props
}: ListItemProps) {
  return (
    <div
      data-slot="list-item"
      data-interactive={interactive ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      className={cn(
        "rounded-[var(--ui-radius-item)] border border-transparent transition-[background-color,border-color,color,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)]",
        interactive && "cursor-pointer hover:bg-[var(--ui-state-hover)]",
        selected &&
          "bg-[var(--ui-state-selected)] text-[var(--ui-state-selected-foreground)]",
        className,
      )}
      {...props}
    />
  )
}

export { ListItem }
