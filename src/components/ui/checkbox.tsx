import * as React from "react"

import { cn } from "@/lib/utils"

function Checkbox({ className, type = "checkbox", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="checkbox"
      type={type}
      className={cn(
        "size-4 rounded-[var(--ui-radius-item)] border-[var(--ui-border-control)] accent-primary outline-none transition-[box-shadow,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:cursor-not-allowed disabled:opacity-[var(--ui-disabled-opacity)]",
        className
      )}
      {...props}
    />
  )
}

export { Checkbox }
