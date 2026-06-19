import * as React from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ButtonProps = React.ComponentProps<typeof Button>

export interface ToolbarButtonProps
  extends Omit<ButtonProps, "variant" | "size"> {
  selected?: boolean
  size?: Extract<ButtonProps["size"], "icon-xs" | "icon-sm" | "compact">
}

function ToolbarButton({
  selected = false,
  size = "icon-sm",
  className,
  ...props
}: ToolbarButtonProps) {
  return (
    <Button
      data-slot="toolbar-button"
      data-selected={selected ? "true" : undefined}
      variant="ghost"
      size={size}
      className={cn(
        "rounded-[var(--ui-radius-item)] text-muted-foreground transition-[background-color,color,box-shadow,opacity,transform] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:cursor-not-allowed disabled:text-[var(--ui-disabled-foreground)] disabled:opacity-[var(--ui-disabled-opacity)] data-[selected=true]:bg-[var(--ui-state-selected)] data-[selected=true]:text-[var(--ui-state-selected-foreground)]",
        className,
      )}
      aria-pressed={selected || props["aria-pressed"]}
      {...props}
    />
  )
}

export { ToolbarButton }
