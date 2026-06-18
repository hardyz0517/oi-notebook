import { ChevronDown } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export interface SelectPillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  ariaLabel: string;
}

export const SelectPill = forwardRef<HTMLButtonElement, SelectPillProps>(function SelectPill({
  children,
  ariaLabel,
  disabled = false,
  ...props
}, ref) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="subtle"
      size="compact"
      className="settings-v2-pill settings-v2-pill-select"
      aria-label={ariaLabel}
      disabled={disabled}
      {...props}
    >
      <span>{children}</span>
      <ChevronDown aria-hidden="true" className="settings-v2-pill-icon" />
    </Button>
  );
});
