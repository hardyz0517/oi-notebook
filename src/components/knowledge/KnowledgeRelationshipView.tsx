import { useState } from "react";
import { ExternalLink, FilePlus2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  buildLegacyMigrationDraft,
  readNote,
  writeKnowledgeAsset,
  type LegacyMigrationDraftResult,
} from "@/lib/api";
import type { KnowledgeSuggestionRow } from "@/lib/knowledge/knowledgeUiModel";

export function KnowledgeRelationshipView({
  suggestions,
  onOpenAsset,
}: {
  suggestions: KnowledgeSuggestionRow[];
  onOpenAsset?: (path: string) => void;
}) {
  const [draft, setDraft] = useState<LegacyMigrationDraftResult | null>(null);
  const [status, setStatus] = useState("");

  const handlePreviewLegacy = async (suggestion: KnowledgeSuggestionRow, targetType: "fragment" | "collection") => {
    const sourcePath = suggestion.refs[0] ?? suggestion.action.path;
    if (!sourcePath) return;
    setStatus("生成迁移草稿预览...");
    try {
      const markdown = await readNote(sourcePath);
      const nextDraft = await buildLegacyMigrationDraft(sourcePath, markdown, targetType);
      setDraft(nextDraft);
      setStatus("草稿已生成，确认前不会写入任何文件。");
    } catch (error) {
      setStatus(`草稿生成失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleConfirmDraft = async () => {
    if (!draft || !draft.requiresConfirmation || draft.writesOriginal) return;
    setStatus("创建迁移草稿...");
    try {
      const result = await writeKnowledgeAsset(draft.targetPath, draft.markdown, false);
      setStatus(result.skipped ? "目标草稿已存在，未覆盖。" : `已创建：${result.relativePath}`);
    } catch (error) {
      setStatus(`创建失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="text-xs text-muted-foreground">以下为规则提示 / 待人工确认，不包含 AI 分析或模型调用。</div>
      {draft ? (
        <Card>
          <CardHeader className="px-4 py-3">
            <div>
              <div className="text-sm font-medium">迁移草稿预览</div>
              <div className="mt-1 text-xs text-muted-foreground">{draft.sourcePath}{" -> "}{draft.targetPath}</div>
            </div>
            <Badge variant="warning">preview</Badge>
          </CardHeader>
          <CardContent className="grid gap-2 text-xs text-muted-foreground">
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-[var(--ui-radius-item)] border border-border/70 bg-muted/30 p-3 text-[11px] leading-5">
              {draft.markdown}
            </pre>
            <div>原文保留：{draft.writesOriginal ? "no" : "yes"} · 需要确认：{draft.requiresConfirmation ? "yes" : "no"}</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="xs" onClick={() => void handleConfirmDraft()} disabled={draft.writesOriginal || !draft.requiresConfirmation}>
                <FilePlus2 className="h-3.5 w-3.5" />
                确认创建草稿
              </Button>
              <Button type="button" size="xs" variant="outline" onClick={() => onOpenAsset?.(draft.sourcePath)}>
                打开原文
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {status ? <div className="text-xs text-muted-foreground">{status}</div> : null}
      {suggestions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">暂无确定性关系建议。</CardContent>
        </Card>
      ) : suggestions.map((suggestion) => (
        <Card key={suggestion.id}>
          <CardHeader className="px-4 py-3">
            <div>
              <div className="text-sm font-medium">{suggestion.targetTitle}</div>
              <div className="mt-1 text-xs text-muted-foreground">{suggestion.reason}</div>
            </div>
            <Badge variant="info">score {suggestion.score.toFixed(2)}</Badge>
          </CardHeader>
          <CardContent className="grid gap-2 text-xs text-muted-foreground">
            <div>{suggestion.preview}</div>
            <div className="truncate">refs: {suggestion.refs.join(", ")}</div>
            {suggestion.kind === "legacy-upgrade" ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={!suggestion.action.enabled}
                  onClick={() => void handlePreviewLegacy(suggestion, "fragment")}
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  升级为片段草稿
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="subtle"
                  disabled={!suggestion.action.enabled}
                  onClick={() => void handlePreviewLegacy(suggestion, "collection")}
                >
                  升级为集合草稿
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="w-fit"
                disabled={!suggestion.action.enabled}
                onClick={() => onOpenAsset?.(suggestion.action.path)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {suggestion.action.label}
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
