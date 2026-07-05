import {
  isLuoguArticleSolutionCategory,
  LUOGU_ARTICLE_CATEGORY_OPTIONS,
  normalizeLuoguArticleMetadata,
  type LuoguArticleMetadata,
} from "@/lib/luoguArticleSync";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function LuoguArticleInfoDialog({
  open,
  metadata,
  onChange,
  onSave,
  onClose,
}: {
  open: boolean;
  metadata: LuoguArticleMetadata;
  onChange: (next: LuoguArticleMetadata) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const isSolutionCategory = isLuoguArticleSolutionCategory(metadata.category);

  const updateMetadata = (next: LuoguArticleMetadata) => {
    onChange(normalizeLuoguArticleMetadata(next));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>洛谷文章信息</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>标题</Label>
            <Input value={metadata.title} onChange={(e) => onChange({ ...metadata, title: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label>分类</Label>
            <Select
              value={String(metadata.category)}
              onValueChange={(value) => updateMetadata({ ...metadata, category: Number.parseInt(value, 10) })}
            >
              <SelectTrigger className="w-full" aria-label="洛谷文章分类">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LUOGU_ARTICLE_CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>状态</Label>
            <Input value={String(metadata.status)} inputMode="numeric" onChange={(e) => updateMetadata({ ...metadata, status: Number.parseInt(e.target.value, 10) || 0 })} />
          </div>
          <div className="grid gap-1.5">
            <Label>置顶</Label>
            <Input value={String(metadata.top)} inputMode="numeric" onChange={(e) => updateMetadata({ ...metadata, top: Number.parseInt(e.target.value, 10) || 0 })} />
          </div>
          {isSolutionCategory && (
            <div className="grid gap-1.5">
              <Label>题号</Label>
              <Input
                value={metadata.solutionFor}
                placeholder="P1001"
                onChange={(e) => updateMetadata({ ...metadata, solutionFor: e.target.value })}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
