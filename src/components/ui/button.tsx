import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[var(--ui-radius-control)] border border-transparent bg-clip-padding font-medium whitespace-nowrap outline-none select-none transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--ui-motion-duration-fast)] ease-[var(--ui-motion-ease-standard)] focus-visible:ring-[3px] focus-visible:ring-[var(--ui-focus-ring-soft)] active:not-aria-[haspopup]:scale-[var(--motion-scale-pressed)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-[var(--ui-disabled-foreground)] disabled:opacity-[var(--ui-disabled-opacity)] aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/60 dark:aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        primary:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        outline:
          "border-[var(--ui-border-control)] bg-transparent text-foreground hover:bg-[var(--ui-state-hover)]",
        secondary:
          "border-[var(--ui-border-control)] bg-secondary text-secondary-foreground hover:bg-[var(--ui-state-hover)]",
        ghost:
          "bg-transparent text-foreground hover:bg-[var(--ui-state-hover)]",
        subtle:
          "border-[var(--ui-border-control)]/45 bg-muted/40 text-muted-foreground hover:border-[var(--ui-border-control)]/70 hover:bg-[var(--ui-state-hover)] hover:text-foreground",
        danger:
          "bg-destructive text-white hover:bg-destructive/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90",
        link: "h-auto border-0 bg-transparent p-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 px-3 text-xs",
        md: "h-8 px-3 text-xs",
        xs: "h-6 gap-1 px-2 text-[11px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 px-2 text-xs",
        compact:
          "h-7 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-9 px-4 text-sm",
        icon: "size-8 p-0",
        "icon-xs": "size-6 p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 p-0",
        "icon-lg": "size-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
  }>(function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  disabled,
  ...props
}, ref) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading ? "true" : undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    />
  )
})

export { Button, buttonVariants }
