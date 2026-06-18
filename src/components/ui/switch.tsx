import * as React from "react"

import { cn } from "@/lib/utils"

export interface SwitchProps extends Omit<React.ComponentProps<"button">, "onChange" | "value"> {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}

function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
  type = "button",
  ...props
}: SwitchProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-8 shrink-0 cursor-pointer items-center rounded-full border border-[var(--ui-border-control)] bg-muted/80 outline-none transition-[background-color,border-color,box-shadow,opacity] duration-[var(--ui-motion-duration-base)] ease-[var(--ui-motion-ease-standard)] hover:border-[var(--ui-focus-ring)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:cursor-not-allowed disabled:opacity-[var(--ui-disabled-opacity)] data-[state=checked]:border-primary/70 data-[state=checked]:bg-primary",
        className
      )}
      onClick={() => {
        if (!disabled) onCheckedChange?.(!checked)
      }}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 size-3.5 rounded-full bg-background shadow-sm transition-transform duration-[var(--ui-motion-duration-base)] ease-[var(--ui-motion-ease-out)] data-[state=checked]:translate-x-3"
        data-state={checked ? "checked" : "unchecked"}
      />
    </button>
  )
}

export { Switch }
