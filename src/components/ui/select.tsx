import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"

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

function Select({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
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
    <SelectPrimitive.Root
      data-slot="select"
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

function SelectGroup({ ...props }: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "inline-flex h-8 min-w-0 items-center justify-between gap-2 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-control)] bg-background px-2.5 text-xs text-foreground outline-none transition-[background-color,border-color,color,box-shadow,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] hover:bg-[var(--ui-state-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] disabled:cursor-not-allowed disabled:text-[var(--ui-disabled-foreground)] disabled:opacity-[var(--ui-disabled-opacity)] data-[placeholder]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  sideOffset = 5,
  align = "start",
  style,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "ui-select-content z-80 max-h-[min(18rem,var(--radix-select-content-available-height))] overflow-hidden rounded-[var(--ui-radius-panel)] border border-[var(--ui-border-subtle)] bg-popover text-popover-foreground shadow-lg outline-none",
          className,
        )}
        style={
          {
            minWidth: "var(--radix-select-trigger-width)",
            ...style,
          } as React.CSSProperties
        }
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-[11px] font-medium text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-7 cursor-pointer select-none items-center gap-2 rounded-[var(--ui-radius-item)] py-1.5 pr-2 pl-7 text-xs outline-none transition-[background-color,color,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] focus:bg-[var(--ui-state-hover)] data-[highlighted]:bg-[var(--ui-state-hover)] data-[state=checked]:bg-[var(--ui-state-selected)] data-[state=checked]:text-[var(--ui-state-selected-foreground)] data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:text-[var(--ui-disabled-foreground)] data-[disabled]:opacity-[var(--ui-disabled-opacity)]",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5" aria-hidden="true" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-1 my-1 h-px bg-[var(--ui-border-subtle)]", className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
