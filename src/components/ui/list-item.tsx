import * as React from "react"

import { cn } from "@/lib/utils"

function ListItem({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-item"
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 border-b border-border bg-transparent px-4 py-2 transition-[background-color,border-color,color] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] last:border-b-0 data-[interactive=true]:hover:bg-[var(--color-background-hover)] data-[selected=true]:bg-[var(--color-background-active)]",
        className
      )}
      {...props}
    />
  )
}

export { ListItem }
