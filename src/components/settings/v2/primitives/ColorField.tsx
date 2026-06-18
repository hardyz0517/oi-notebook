import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function normalizeHexColor(value: string) {
  const trimmed = value.trim();
  const expanded = /^#[0-9a-f]{3}$/i.test(trimmed)
    ? `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`
    : trimmed;
  return /^#[0-9a-f]{6}$/i.test(expanded) ? expanded.toUpperCase() : null;
}

export interface ColorFieldProps {
  value: string;
  ariaLabel: string;
  readonly?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
}

export function ColorField({
  value,
  ariaLabel,
  readonly,
  readOnly,
  disabled = false,
  onChange,
}: ColorFieldProps) {
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedValue = normalizeHexColor(value) ?? "#000000";
  const [draft, setDraft] = useState(normalizedValue);
  const interactive = !readonly && !readOnly && !disabled && Boolean(onChange);

  useEffect(() => {
    setDraft(normalizedValue);
  }, [normalizedValue]);

  const commitValue = (next: string) => {
    setDraft(next);
    if (next !== normalizedValue) onChange?.(next);
  };

  const commit = () => {
    const next = normalizeHexColor(draft);
    if (!next) {
      setDraft(normalizedValue);
      return;
    }
    commitValue(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commit();
    event.currentTarget.blur();
  };

  return (
    <div className="settings-v2-color-field" data-readonly={interactive ? "false" : "true"}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={!interactive}
        aria-label={ariaLabel}
        className="settings-v2-color-swatch"
        style={{ backgroundColor: normalizedValue }}
        onClick={() => colorInputRef.current?.click()}
      />
      {interactive ? (
        <>
          <Input
            ref={colorInputRef}
            type="color"
            value={normalizedValue}
            aria-label={`${ariaLabel} 颜色选择`}
            onChange={(event) => {
              const next = normalizeHexColor(event.target.value);
              if (next) commitValue(next);
            }}
          />
          <Input
            type="text"
            value={draft}
            aria-label={`${ariaLabel} HEX`}
            spellCheck={false}
            onChange={(event) => {
              const nextDraft = event.target.value;
              setDraft(nextDraft);
              const next = normalizeHexColor(nextDraft);
              if (next && next !== normalizedValue) onChange?.(next);
            }}
            onBlur={commit}
            onKeyDown={onKeyDown}
          />
        </>
      ) : (
        <span>{normalizedValue}</span>
      )}
    </div>
  );
}
