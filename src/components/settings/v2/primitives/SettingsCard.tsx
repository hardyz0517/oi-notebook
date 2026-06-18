import type { ReactNode } from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-v2-section" data-has-description={description ? "true" : "false"}>
      <div className="settings-v2-section-header">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("settings-v2-card", className)}>
      {(title || description || action) && (
        <CardHeader className="settings-v2-card-header">
          <div>
            {title ? <h3>{title}</h3> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div className="settings-v2-card-action">{action}</div> : null}
        </CardHeader>
      )}
      {children}
    </Card>
  );
}
