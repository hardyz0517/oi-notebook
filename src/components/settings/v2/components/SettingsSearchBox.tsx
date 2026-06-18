import { Search } from "lucide-react";

export function SettingsSearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="settings-v2-search">
      <Search className="h-3.5 w-3.5" />
      <input
        value={value}
        placeholder="搜索设置..."
        aria-label="搜索设置"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
