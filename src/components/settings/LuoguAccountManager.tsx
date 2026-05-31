import type { SyncLuoguInsightsResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type LuoguAccountManagerProps = {
  mode?: "dialog" | "page";
  uid: string;
  clientId: string;
  lastSubmissionId: string;
  isLoading: boolean;
  isSaving: boolean;
  isTestingConnection: boolean;
  isSyncing: boolean;
  syncResult: SyncLuoguInsightsResult | null;
  onUidChange: (value: string) => void;
  onClientIdChange: (value: string) => void;
  onLastSubmissionIdChange: (value: string) => void;
  onClose: () => void;
  onTestConnection: () => void;
  onSave: () => void;
};

export function LuoguAccountManager({
  mode = "dialog",
  uid,
  clientId,
  lastSubmissionId,
  isLoading,
  isSaving,
  isTestingConnection,
  isSyncing,
  syncResult,
  onUidChange,
  onClientIdChange,
  onLastSubmissionIdChange,
  onClose,
  onTestConnection,
  onSave,
}: LuoguAccountManagerProps) {
  const isPage = mode === "page";
  const isBusy = isLoading || isSaving || isSyncing;

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden bg-white dark:bg-background", isPage && "h-full")}>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto grid w-full max-w-[820px] gap-5">
          <div className="grid gap-1">
            <div className="text-base font-semibold text-foreground">洛谷账号配置</div>
            <div className="text-xs leading-5 text-muted-foreground">
              手动填写洛谷 Cookie 配置，用于测试连接和同步提交。
            </div>
          </div>

          <div className="grid gap-0.5 rounded-sm border border-border/60 bg-muted/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
            <div>需要从浏览器洛谷 Cookie 中复制 _uid 和 __client_id。</div>
            <div>路径：F12 → Application/应用 → Cookies → https://www.luogu.com.cn。</div>
          </div>

          <section className="grid gap-3">
            <div className="text-sm font-medium text-foreground">手动配置</div>
            <div className="grid gap-2">
              <Label htmlFor="luogu-account-uid">UID</Label>
              <Input
                id="luogu-account-uid"
                value={uid}
                onChange={(event) => onUidChange(event.target.value)}
                placeholder="洛谷 _uid"
                className="bg-background/60"
                disabled={isLoading || isSaving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="luogu-account-client-id">__client_id</Label>
              <Input
                id="luogu-account-client-id"
                type="password"
                value={clientId}
                onChange={(event) => onClientIdChange(event.target.value)}
                placeholder="洛谷 __client_id"
                className="bg-background/60"
                disabled={isLoading || isSaving}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="luogu-account-last-submission-id">最后同步提交 ID</Label>
              <Input
                id="luogu-account-last-submission-id"
                value={lastSubmissionId}
                onChange={(event) => onLastSubmissionIdChange(event.target.value)}
                placeholder="留空表示尚未同步"
                className="bg-background/60"
                inputMode="numeric"
                disabled={isLoading || isSaving}
              />
            </div>
          </section>

          {syncResult && (
            <div className="grid gap-2 rounded-sm border border-border bg-muted/20 p-3 text-xs">
              <div className="font-medium text-foreground">
                洛谷同步：扫描 {syncResult.scannedPages} 页 / {syncResult.scannedCount} 条，AC {syncResult.acCount} 条，AI 导入 {syncResult.aiImportedCount} 篇
              </div>
              <div className="grid gap-1 text-muted-foreground">
                <div>AI 整理：是，模型：{syncResult.aiModel ?? "未配置"}</div>
                <div>
                  AI 跳过 {syncResult.aiSkippedCount} 条，AI 失败 {syncResult.aiFailedCount} 条，跳过无心得 {syncResult.skippedNoInsight} 条，已存在 {syncResult.skippedExisting} 条，总失败 {syncResult.failedCount} 条
                </div>
                <div>{syncResult.reachedLastSubmissionId ? "已触达最后同步提交 ID" : "未触达最后同步提交 ID"}</div>
                <div>最后同步提交 ID：{syncResult.updatedLastSubmissionId ?? "未更新"}</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-border/70 bg-white px-6 py-3 dark:bg-background/95">
        <DialogFooter className="mx-auto w-full max-w-[820px]">
          <Button variant="outline" onClick={onTestConnection} disabled={isBusy || isTestingConnection}>
            {isTestingConnection ? "测试中..." : "测试连接"}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isSaving || isSyncing}>
            取消
          </Button>
          <Button onClick={onSave} disabled={isBusy || isTestingConnection}>
            {isSaving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </div>
    </div>
  );
}
