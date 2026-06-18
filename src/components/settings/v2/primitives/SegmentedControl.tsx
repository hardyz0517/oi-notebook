import { SegmentedControl as UiSegmentedControl } from "@/components/ui/segmented-control";

import type { SettingsControlBaseProps, SettingsOption } from "./SettingsPrimitiveTypes";

export interface SegmentedControlProps<TValue extends string> extends SettingsControlBaseProps {
  value: TValue;
  options: Array<SettingsOption<TValue>>;
  onChange: (value: TValue) => void;
}

export function SegmentedControl<TValue extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: SegmentedControlProps<TValue>) {
  return (
    <UiSegmentedControl
      value={value}
      options={options}
      onValueChange={onChange}
      ariaLabel={ariaLabel}
      disabled={disabled}
      className="settings-v2-segmented"
      itemClassName={(_option, checked) => checked ? "settings-v2-segment settings-v2-segment-active" : "settings-v2-segment"}
    />
  );
}
