import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

export interface ListItemProps extends React.ComponentProps<"div"> {
  asChild?: boolean
  interactive?: boolean
  selected?: boolean
}

function ListItem({
  asChild = false,
  className,
  interactive = false,
  selected = false,
  ...props
}: ListItemProps) {
  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      data-slot="list-item"
      data-interactive={interactive ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      className={cn(
        "rounded-[var(--ui-radius-item)] border border-transparent outline-none transition-[background-color,border-color,color,box-shadow,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:cursor-not-allowed disabled:opacity-[var(--ui-disabled-opacity)]",
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
