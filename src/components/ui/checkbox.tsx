import * as React from "react"

import { cn } from "@/lib/utils"

function Checkbox({ className, type = "checkbox", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="checkbox"
      type={type}
      className={cn(
        "size-4 rounded border-border accent-primary outline-none transition-[box-shadow,opacity] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Checkbox }
