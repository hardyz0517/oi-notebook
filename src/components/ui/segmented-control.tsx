import * as React from "react"

import { cn } from "@/lib/utils"

export interface SegmentedControlOption<TValue extends string> {
  value: TValue
  label: React.ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<TValue extends string> {
  value: TValue
  options: Array<SegmentedControlOption<TValue>>
  onValueChange: (value: TValue) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
  itemClassName?: string | ((option: SegmentedControlOption<TValue>, checked: boolean) => string)
}

function SegmentedControl<TValue extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  disabled = false,
  className,
  itemClassName,
}: SegmentedControlProps<TValue>) {
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const enabledOptions = options.filter((option) => !option.disabled)

  const changeValue = (nextValue: TValue) => {
    if (nextValue !== value) onValueChange(nextValue)
  }

  const moveFocus = (direction: 1 | -1) => {
    if (enabledOptions.length === 0) return
    const currentIndex = enabledOptions.findIndex((option) => option.value === value)
    const baseIndex = currentIndex >= 0 ? currentIndex : 0
    const nextOption = enabledOptions[(baseIndex + direction + enabledOptions.length) % enabledOptions.length]
    changeValue(nextOption.value)
    const nextIndex = options.findIndex((option) => option.value === nextOption.value)
    window.requestAnimationFrame(() => itemRefs.current[nextIndex]?.focus())
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault()
      moveFocus(1)
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault()
      moveFocus(-1)
    }
  }

  return (
    <div
      data-slot="segmented-control"
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5", className)}
      onKeyDown={onKeyDown}
    >
      {options.map((option, index) => {
        const checked = value === option.value
        const itemDisabled = disabled || Boolean(option.disabled)
        const resolvedItemClassName =
          typeof itemClassName === "function" ? itemClassName(option, checked) : itemClassName
        return (
          <button
            key={option.value}
            ref={(node) => {
              itemRefs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={itemDisabled}
            data-slot="segmented-control-item"
            data-state={checked ? "checked" : "unchecked"}
            tabIndex={checked || (!options.some((item) => item.value === value) && index === 0) ? 0 : -1}
            disabled={itemDisabled}
            className={cn(
              "inline-flex h-6 min-w-0 items-center justify-center rounded-full px-2 text-xs font-medium text-muted-foreground outline-none transition-[background-color,color,box-shadow,opacity] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-background data-[state=checked]:text-foreground data-[state=checked]:shadow-sm",
              resolvedItemClassName
            )}
            onClick={() => changeValue(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { SegmentedControl }
