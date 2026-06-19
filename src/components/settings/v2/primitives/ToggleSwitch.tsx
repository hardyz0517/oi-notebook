import { Switch } from "@/components/ui/switch";

import type { SettingsControlBaseProps } from "./SettingsPrimitiveTypes";

export interface ToggleSwitchProps extends SettingsControlBaseProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      aria-label={ariaLabel}
      disabled={disabled}
      className="settings-v2-switch"
    />
  );
}
