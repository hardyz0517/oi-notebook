import type { ReactNode } from "react";

import { SettingRow as UiSettingRow } from "@/components/ui/setting-row";
import { cn } from "@/lib/utils";

export type SettingRowDensity = "normal" | "compact";
export type SettingRowVariant = "default" | "grid" | "nested" | "compact";

export function SettingRow({
  title,
  description,
  children,
  density = "normal",
  variant,
  className,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  density?: SettingRowDensity;
  variant?: SettingRowVariant;
  className?: string;
}) {
  const resolvedVariant = variant ?? (density === "compact" ? "compact" : "grid");
  const layout =
    resolvedVariant === "default" || resolvedVariant === "compact"
      ? "stacked"
      : resolvedVariant === "nested"
        ? "nested"
        : "split";

  return (
    <UiSettingRow
      title={title}
      description={description}
      density={density}
      layout={layout}
      className={cn("settings-v2-row", className)}
      contentClassName="settings-v2-row-copy"
      controlClassName="settings-v2-row-control"
      data-variant={resolvedVariant}
    >
      {children}
    </UiSettingRow>
  );
}
