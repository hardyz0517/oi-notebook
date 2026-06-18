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
          "border-border/70 bg-background/70 text-foreground shadow-sm hover:border-border hover:bg-accent/80 hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:bg-input/35 dark:hover:bg-accent/90",
        primary:
          "border-border/70 bg-primary text-primary-foreground shadow-sm hover:border-border/80 hover:bg-primary/92",
        outline:
          "border-border bg-background/70 text-foreground/92 hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground dark:bg-input/35 dark:hover:bg-accent/90",
        secondary:
          "border-border/60 bg-secondary text-secondary-foreground hover:bg-secondary/88 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "text-muted-foreground hover:bg-accent/80 hover:text-foreground aria-expanded:bg-accent/80 aria-expanded:text-foreground",
        subtle:
          "border-border/45 bg-muted/40 text-muted-foreground hover:border-border/70 hover:bg-muted/70 hover:text-foreground aria-expanded:bg-muted/70 aria-expanded:text-foreground",
        danger:
          "border-destructive/30 bg-destructive/12 text-destructive hover:bg-destructive/18 focus-visible:border-destructive/50 focus-visible:ring-destructive/20 dark:bg-destructive/18 dark:hover:bg-destructive/24 dark:focus-visible:ring-destructive/30",
        destructive:
          "border-destructive/30 bg-destructive/12 text-destructive hover:bg-destructive/18 focus-visible:border-destructive/50 focus-visible:ring-destructive/20 dark:bg-destructive/18 dark:hover:bg-destructive/24 dark:focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        md: "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 text-[11px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-[11px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        compact:
          "h-7 gap-1 px-2 text-[11px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
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
