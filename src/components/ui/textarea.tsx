import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full min-w-0 rounded-md border border-input bg-background/55 px-2.5 py-2 text-xs text-foreground/92 shadow-sm outline-none transition-[background-color,border-color,box-shadow,color] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] placeholder:text-muted-foreground/90 focus-visible:border-ring/80 focus-visible:bg-background/75 focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/35 disabled:text-muted-foreground disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:bg-input/38 dark:focus-visible:bg-input/52 dark:disabled:bg-input/28 dark:aria-invalid:border-destructive/60 dark:aria-invalid:ring-destructive/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
