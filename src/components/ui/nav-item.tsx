import * as React from "react"

import { cn } from "@/lib/utils"

export interface NavItemProps
  extends Omit<React.ComponentProps<"button">, "children"> {
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: React.ReactNode
  description?: React.ReactNode
  selected?: boolean
}

function NavItem({
  icon: Icon,
  label,
  description,
  selected = false,
  className,
  type = "button",
  ...props
}: NavItemProps) {
  return (
    <button
      type={type}
      data-slot="nav-item"
      data-selected={selected ? "true" : undefined}
      aria-current={selected ? "page" : props["aria-current"]}
      className={cn(
        "group/nav-item relative flex w-full min-w-0 items-center gap-2 rounded-[var(--ui-radius-item)] px-2.5 py-2 text-left text-xs text-muted-foreground outline-none transition-[background-color,color,box-shadow,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-[var(--ui-disabled-opacity)] data-[selected=true]:bg-[var(--ui-state-selected)] data-[selected=true]:text-[var(--ui-state-selected-foreground)]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity duration-[var(--ui-motion-duration-fast)] group-data-[selected=true]/nav-item:opacity-100"
      />
      {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </button>
  )
}

export { NavItem }
