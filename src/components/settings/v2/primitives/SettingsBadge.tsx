import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type SettingsBadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

export function SettingsBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: SettingsBadgeTone;
}) {
  const badgeVariant = tone === "neutral" ? "default" : tone;

  return (
    <Badge
      variant={badgeVariant}
      className={cn(
        "settings-v2-badge",
        tone !== "neutral" && `settings-v2-status-badge-${tone}`,
      )}
    >
      {children}
    </Badge>
  );
}
