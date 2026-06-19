import { useEffect, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";

import type { SettingsControlBaseProps } from "./SettingsPrimitiveTypes";

function clampNumber(value: number, min: number, max: number, step: number) {
  const stepped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, stepped));
}

export interface NumberFieldProps extends SettingsControlBaseProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function NumberField({
  value,
  min,
  max,
  step = 1,
  unit,
  ariaLabel,
  disabled = false,
  onChange,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = clampNumber(parsed, min, max, step);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit();
    event.currentTarget.blur();
  };

  return (
    <label className="settings-v2-number">
      <Input
        type="text"
        value={draft}
        inputMode="decimal"
        aria-label={ariaLabel}
        className="settings-v2-number-input"
        disabled={disabled}
        onChange={(event) => {
          if (/^-?\d*(?:\.\d*)?$/.test(event.target.value)) setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {unit ? <span>{unit}</span> : null}
    </label>
  );
}
