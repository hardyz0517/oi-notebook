import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-xs leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-[var(--ui-disabled-foreground)] group-data-[disabled=true]:opacity-[var(--ui-disabled-opacity)] peer-disabled:cursor-not-allowed peer-disabled:text-[var(--ui-disabled-foreground)] peer-disabled:opacity-[var(--ui-disabled-opacity)]",
        className
      )}
      {...props}
    />
  )
}

export { Label }
