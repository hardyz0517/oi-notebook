import { Edit3, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CollectionCandidateRow } from "./tagManagerConfig";

type TagManagerCollectionsPanelProps = {
  rows: CollectionCandidateRow[];
  createInput: string;
  createError: string | null;
  editingName: string | null;
  editInput: string;
  editError: string | null;
  isSaving: boolean;
  onCreateInputChange: (value: string) => void;
  onCreate: () => void;
  onStartEdit: (name: string) => void;
  onEditInputChange: (value: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: (name: string) => void;
};

function CollectionSourceBadge({ label, tone }: { label: string; tone: "builtin" | "custom" | "article" }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium",
        tone === "builtin" && "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
        tone === "custom" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tone === "article" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {label}
    </span>
  );
}

export function TagManagerCollectionsPanel({
  rows,
  createInput,
  createError,
  editingName,
  editInput,
  editError,
  isSaving,
  onCreateInputChange,
  onCreate,
  onStartEdit,
  onEditInputChange,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: TagManagerCollectionsPanelProps) {
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingName) {
      return;
    }

    window.requestAnimationFrame(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    });
  }, [editingName]);

  return (
    <section className="col-span-3 min-h-0 overflow-y-auto bg-background" data-tag-manager-no-clear="true">
      <div className="mx-auto grid w-full max-w-5xl gap-5 px-6 py-5">
        <div className="rounded-sm border border-border/80 bg-muted/10 p-4">
          <div className="mb-3 flex flex-col gap-1">
            <div className="text-sm font-semibold text-foreground">文集候选管理</div>
            <div className="text-xs leading-5 text-muted-foreground">
              这里只维护以后选择时出现的候选文集，不会批量修改已有文章的 frontmatter。
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <Input
                value={createInput}
                autoComplete="off"
                placeholder="例如：暑假集训日志"
                className="h-9 bg-background text-sm"
                onChange={(event) => onCreateInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onCreate();
                  }
                }}
              />
              {createError && <div className="mt-1.5 text-xs text-destructive">{createError}</div>}
            </div>
            <Button type="button" size="sm" className="h-9 shrink-0" disabled={isSaving} onClick={onCreate}>
              <Plus className="h-3.5 w-3.5" />
              新建文集
            </Button>
          </div>
        </div>

        <div className="overflow-hidden rounded-sm border border-border/80 bg-background">
          <div className="grid grid-cols-[minmax(180px,1fr)_220px_180px] border-b border-border/70 bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground">
            <div>文集名称</div>
            <div>来源 / 类型</div>
            <div className="text-right">操作</div>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">暂无文集候选。</div>
          ) : (
            <div className="divide-y divide-border/70">
              {rows.map((row) => {
                const isEditing = editingName === row.name;
                return (
                  <div key={row.name} className="grid grid-cols-[minmax(180px,1fr)_220px_180px] items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      {isEditing ? (
                        <div className="grid gap-1.5">
                          <Input
                            ref={editInputRef}
                            value={editInput}
                            autoComplete="off"
                            className="h-8 bg-background px-2 text-sm shadow-none focus-visible:ring-1"
                            onChange={(event) => onEditInputChange(event.target.value)}
                            onBlur={onSaveEdit}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                event.stopPropagation();
                                onSaveEdit();
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                event.stopPropagation();
                                onCancelEdit();
                              }
                            }}
                          />
                          {editError && <div className="text-xs text-destructive">{editError}</div>}
                        </div>
                      ) : (
                        <div className="truncate font-medium text-foreground" title={row.name}>
                          {row.name}
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {row.isBuiltin && <CollectionSourceBadge label="内置" tone="builtin" />}
                      {row.isCustom && <CollectionSourceBadge label="自定义" tone="custom" />}
                      {row.isFromArticle && <CollectionSourceBadge label="来自文章" tone="article" />}
                    </div>
                    <div className="flex justify-end gap-1.5">
                      {!isEditing && row.isCustom ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            disabled={isSaving}
                            aria-label="编辑文集"
                            title="编辑文集"
                            onClick={() => onStartEdit(row.name)}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            disabled={isSaving}
                            aria-label="删除文集"
                            title="删除文集"
                            onClick={() => onDelete(row.name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : !isEditing ? (
                        <span className="text-xs text-muted-foreground">只读</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
