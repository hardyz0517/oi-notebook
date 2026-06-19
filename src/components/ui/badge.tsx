import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex min-w-0 shrink-0 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium transition-[background-color,border-color,color,opacity] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)]",
  {
    variants: {
      variant: {
        default: "border-[var(--ui-border-subtle)] bg-muted/55 text-muted-foreground",
        secondary: "border-[var(--ui-border-control)] bg-secondary text-secondary-foreground",
        success: "border-primary/25 bg-primary/10 text-foreground",
        warning: "border-[var(--ui-border-subtle)] bg-accent/60 text-accent-foreground",
        danger: "border-destructive/30 bg-destructive/12 text-destructive",
        info: "border-primary/25 bg-primary/10 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { Badge, badgeVariants }
