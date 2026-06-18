import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SettingsButtonVariant = "secondary" | "ghost" | "danger";

export interface SettingsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: SettingsButtonVariant;
}

export function SettingsButton({
  children,
  className,
  variant = "secondary",
  type = "button",
  ...props
}: SettingsButtonProps) {
  const buttonVariant =
    variant === "danger" ? "danger" : variant === "ghost" ? "ghost" : "secondary";

  return (
    <Button
      type={type}
      variant={buttonVariant}
      size="compact"
      className={cn(
        variant === "ghost"
          ? "settings-v2-button settings-v2-button--ghost"
          : variant === "danger"
            ? "settings-v2-button settings-v2-button--danger"
            : "settings-v2-button settings-v2-button--secondary",
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}
