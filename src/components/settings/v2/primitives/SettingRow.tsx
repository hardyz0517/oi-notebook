import type { ReactNode } from "react";

import { ListItem } from "@/components/ui/list-item";
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

  return (
    <ListItem className={cn("settings-v2-row", className)} data-density={density} data-variant={resolvedVariant}>
      <div className="settings-v2-row-copy">
        <div className="settings-v2-row-title">{title}</div>
        {description ? <div className="settings-v2-row-description">{description}</div> : null}
      </div>
      {children ? <div className="settings-v2-row-control">{children}</div> : null}
    </ListItem>
  );
}
