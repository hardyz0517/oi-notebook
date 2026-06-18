import type { ReactNode } from "react";

export interface SettingsOption<TValue extends string> {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
}

export interface SettingsControlBaseProps {
  ariaLabel: string;
  disabled?: boolean;
}
