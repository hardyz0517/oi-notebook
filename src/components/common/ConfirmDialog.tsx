import type { ReactNode } from "react"

import { AppDialog } from "@/components/common/AppDialog"
import { Button } from "@/components/ui/button"

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AppDialog
      open={open}
      title={title}
      description={description}
      width="md"
      overlayClassName="z-[150]"
      contentClassName="z-[160] w-[min(420px,calc(100vw-32px))] max-w-none border-border/80 bg-popover text-popover-foreground shadow-2xl shadow-black/25 dark:border-white/10 dark:bg-popover"
      footerClassName="gap-2 sm:justify-end"
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button type="button" variant={danger ? "destructive" : "default"} onClick={onConfirm}>
            {confirmText}
          </Button>
        </>
      }
    />
  )
}
