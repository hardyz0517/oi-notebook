import * as React from "react"

import { cn } from "@/lib/utils"

export interface SliderProps extends Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> {
  value: number
  min: number
  max: number
  step?: number
  onValueChange: (value: number) => void
  showValue?: boolean
}

function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  showValue = false,
  className,
  style,
  ...props
}: SliderProps) {
  const clampValue = (nextValue: number) => Math.min(max, Math.max(min, nextValue))
  const safeValue = clampValue(Number.isFinite(value) ? value : min)
  const percent = max === min ? 0 : ((safeValue - min) / (max - min)) * 100
  const handleInput = (nextValue: string) => {
    const numericValue = Number(nextValue)
    if (!Number.isFinite(numericValue)) return
    onValueChange(clampValue(numericValue))
  }

  return (
    <div
      data-slot="slider"
      className={cn("inline-flex items-center gap-2", className)}
      style={{ "--ui-slider-value": `${percent}%`, ...style } as React.CSSProperties}
    >
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={safeValue}
        className="ui-slider-input"
        onInput={(event) => handleInput(event.currentTarget.value)}
        onChange={(event) => handleInput(event.currentTarget.value)}
        {...props}
      />
      {showValue ? <span data-slot="slider-value">{safeValue}</span> : null}
    </div>
  )
}

export { Slider }
