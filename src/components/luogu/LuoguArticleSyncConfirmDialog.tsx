import type { ReactNode } from "react";

import { CodexDiffPreview, getDiffStats } from "@/components/ai/DiffPreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LuoguArticleMetadata } from "@/lib/luoguArticleSync";

export function LuoguArticleSyncConfirmDialog({
  open,
  title,
  localMetadata,
  remoteMetadata,
  localBody,
  remoteBody,
  sourcePath,
  onConfirm,
  onCancel,
  confirmText = "同步到洛谷",
  description,
}: {
  open: boolean;
  title: string;
  localMetadata: LuoguArticleMetadata;
  remoteMetadata: LuoguArticleMetadata;
  localBody: string;
  remoteBody: string;
  sourcePath: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  description?: ReactNode;
}) {
  const stats = getDiffStats(remoteBody, localBody, 1);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="flex max-h-[min(86vh,760px)] w-[min(1120px,calc(100vw-32px))] max-w-none flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description}
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden text-xs text-muted-foreground">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div>标题：{localMetadata.title}</div>
            <div>远端标题：{remoteMetadata.title}</div>
            <div>分类：{localMetadata.category}</div>
            <div>状态：{localMetadata.status}</div>
            <div>置顶：{localMetadata.top}</div>
            <div>题目编号：{localMetadata.solutionFor || "无"}</div>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px]">
            <span>+{stats.addedRows}</span>
            <span>-{stats.deletedRows}</span>
          </div>
          <CodexDiffPreview
            title={title}
            filePath={sourcePath}
            oldText={remoteBody}
            newText={localBody}
            startLine={1}
            density="review"
            maxHeightClassName="max-h-[52vh]"
          />
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button onClick={onConfirm}>{confirmText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
