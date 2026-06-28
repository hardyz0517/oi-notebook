import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export interface AppDialogProps {
  open: boolean
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: "sm" | "md" | "lg" | "xl"
  overlayClassName?: string
  contentClassName?: string
  headerClassName?: string
  bodyClassName?: string
  footerClassName?: string
  showCloseButton?: boolean
  onOpenChange: (open: boolean) => void
}

const widthClassName = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
} satisfies Record<NonNullable<AppDialogProps["width"]>, string>

export function AppDialog({
  open,
  title,
  description,
  children,
  footer,
  width = "md",
  overlayClassName,
  contentClassName,
  headerClassName,
  bodyClassName,
  footerClassName,
  showCloseButton = true,
  onOpenChange,
}: AppDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={overlayClassName}
        showCloseButton={showCloseButton}
        className={cn(widthClassName[width], contentClassName)}
      >
        <DialogHeader className={headerClassName}>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children ? <div className={cn("min-w-0", bodyClassName)}>{children}</div> : null}
        {footer ? <DialogFooter className={footerClassName}>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

export function AppDialogCloseButton({
  children = "取消",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button type="button" variant="outline" {...props}>
      {children}
    </Button>
  )
}
