import { X } from "lucide-react";
import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";

export interface SettingsDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

export function SettingsDialog({
  open,
  title,
  children,
  footer,
  onClose,
}: SettingsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="settings-v2-dialog" overlayClassName="settings-v2-dialog-backdrop" showCloseButton={false}>
        <DialogHeader className="settings-v2-dialog-header">
          <DialogTitle>{title}</DialogTitle>
          <IconButton type="button" className="settings-v2-dialog-close" aria-label="关闭" onClick={onClose}>
            <X aria-hidden="true" />
          </IconButton>
        </DialogHeader>
        <div className="settings-v2-dialog-body">{children}</div>
        {footer ? <DialogFooter className="settings-v2-dialog-footer">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
