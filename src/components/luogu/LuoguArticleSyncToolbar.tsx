import { Button } from "@/components/ui/button";
import { RefreshCcw, Settings2, Upload } from "lucide-react";

export function LuoguArticleSyncToolbar({
  syncDisabled,
  infoDisabled,
  canPull,
  hasBinding,
  onSync,
  onPull,
  onEditInfo,
}: {
  syncDisabled: boolean;
  infoDisabled: boolean;
  canPull: boolean;
  hasBinding: boolean;
  onSync: () => void;
  onPull: () => void;
  onEditInfo: () => void;
}) {
  return (
    <div className="ml-2 flex shrink-0 items-center gap-1">
      <Button variant="outline" size="icon-sm" title="同步到洛谷" aria-label="同步到洛谷" disabled={syncDisabled} onClick={onSync}>
        <Upload className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant="outline" size="icon-sm" title={hasBinding ? "从洛谷同步下来" : "需要先绑定文章"} aria-label="从洛谷同步下来" disabled={syncDisabled || !canPull} onClick={onPull}>
        <RefreshCcw className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant="outline" size="icon-sm" title="编辑洛谷文章信息" aria-label="编辑洛谷文章信息" disabled={infoDisabled} onClick={onEditInfo}>
        <Settings2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
