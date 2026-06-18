import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

export function ReadonlyPill({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <Badge className="settings-v2-pill settings-v2-pill-readonly" title={title}>
      <span>{children}</span>
    </Badge>
  );
}
