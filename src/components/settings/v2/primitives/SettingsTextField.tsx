import { Input } from "@/components/ui/input";

export interface SettingsTextFieldProps {
  value: string | null;
  ariaLabel: string;
  placeholder?: string;
  onChange: (value: string | null) => void;
}

export function SettingsTextField({
  value,
  ariaLabel,
  placeholder = "未设置",
  onChange,
}: SettingsTextFieldProps) {
  return (
    <Input
      type="text"
      className="settings-v2-text-field"
      aria-label={ariaLabel}
      placeholder={placeholder}
      spellCheck={false}
      value={value ?? ""}
      onChange={(event) => {
        const next = event.target.value.trim();
        onChange(next ? next : null);
      }}
    />
  );
}
