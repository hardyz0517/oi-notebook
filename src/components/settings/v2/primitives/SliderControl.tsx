import { Slider } from "@/components/ui/slider";

export interface SliderControlProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

export function SliderControl({
  value,
  min,
  max,
  step = 1,
  ariaLabel,
  disabled = false,
  onChange,
}: SliderControlProps) {
  const clampValue = (nextValue: number) => Math.min(max, Math.max(min, nextValue));
  const safeValue = clampValue(Number.isFinite(value) ? value : min);
  return (
    <Slider
      className="settings-v2-slider-control"
      value={safeValue}
      min={min}
      max={max}
      step={step}
      showValue
      aria-label={ariaLabel}
      disabled={disabled}
      onValueChange={onChange}
    />
  );
}
