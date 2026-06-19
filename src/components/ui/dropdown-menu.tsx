import * as React from "react"
import { CheckIcon } from "lucide-react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

type UiDropdownRegistryGlobal = typeof globalThis & {
  __oiNotebookActiveDropdownClose?: (() => void) | null
}

function getActiveDropdownClose() {
  return (globalThis as UiDropdownRegistryGlobal).__oiNotebookActiveDropdownClose ?? null
}

function setActiveDropdownClose(close: (() => void) | null) {
  ;(globalThis as UiDropdownRegistryGlobal).__oiNotebookActiveDropdownClose = close
}

function DropdownMenu({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const isControlled = open !== undefined
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const actualOpen = isControlled ? open : internalOpen
  const closeRef = React.useRef<() => void>(() => undefined)
  const close = React.useCallback(() => closeRef.current(), [])

  closeRef.current = () => {
    if (!isControlled) {
      setInternalOpen(false)
    }
    if (actualOpen) {
      onOpenChange?.(false)
    }
  }

  React.useEffect(() => {
    return () => {
      if (getActiveDropdownClose() === close) {
        setActiveDropdownClose(null)
      }
    }
  }, [close])

  return (
    <DropdownMenuPrimitive.Root
      data-slot="dropdown-menu"
      open={actualOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          getActiveDropdownClose()?.()
          setActiveDropdownClose(close)
        } else if (getActiveDropdownClose() === close) {
          setActiveDropdownClose(null)
        }
        if (!isControlled) {
          setInternalOpen(nextOpen)
        }
        onOpenChange?.(nextOpen)
      }}
      {...props}
    />
  )
}

function DropdownMenuTrigger({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuPortal({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

function DropdownMenuContent({
  className,
  sideOffset = 5,
  align = "start",
  style,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPortal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "ui-dropdown-content z-80 overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-subtle)] bg-popover p-1 text-popover-foreground shadow-lg outline-none",
          className
        )}
        style={
          {
            minWidth: "var(--radix-dropdown-menu-trigger-width)",
            ...style,
          } as React.CSSProperties
        }
        {...props}
      />
    </DropdownMenuPortal>
  )
}

function DropdownMenuItem({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset ? "true" : undefined}
      className={cn(
        "relative flex min-h-7 cursor-pointer select-none items-center gap-2 rounded-[var(--ui-radius-item)] px-2 py-1.5 text-xs outline-none transition-[background-color,color,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] focus:bg-[var(--ui-state-hover)] data-[highlighted]:bg-[var(--ui-state-hover)] data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:text-[var(--ui-disabled-foreground)] data-[disabled]:opacity-[var(--ui-disabled-opacity)] data-[inset=true]:pl-7",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      checked={checked}
      className={cn(
        "relative flex min-h-7 cursor-pointer select-none items-center gap-2 rounded-[var(--ui-radius-item)] py-1.5 pr-2 pl-7 text-xs outline-none transition-[background-color,color,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] focus:bg-[var(--ui-state-hover)] data-[highlighted]:bg-[var(--ui-state-hover)] data-[state=checked]:bg-[var(--ui-state-selected)] data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:text-[var(--ui-disabled-foreground)] data-[disabled]:opacity-[var(--ui-disabled-opacity)]",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
}
