import { Loader2, Plus, SquarePen, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TagSuggestion } from "@/lib/tagTaxonomy";
import type { CustomTagCreateDraft, CustomTagEditDraft } from "./tagManagerConfig";
import type { MergePreviewInfo } from "./types";

export function TagManagerDetailsPanel({
  selectedSuggestion,
  selectedUserAliases,
  selectedBuiltinAliases,
  mergePreview,
  canEditMergeRule,
  isMergeEditorOpen,
  mergeSearchQuery,
  mergeTargetCandidates,
  selectedMergeTarget,
  mergeError,
  canManageAliases,
  aliasInput,
  aliasError,
  customTagCreateDraft,
  customTagCreateError,
  customTagEditDraft,
  customTagEditError,
  isSaving,
  onAliasInputChange,
  onAddAlias,
  onDeleteUserAlias,
  onCancelCustomTagCreate,
  onCustomTagCreateDraftChange,
  onSaveCustomTagCreate,
  onStartCustomTagEdit,
  onDeleteCustomTag,
  onCancelCustomTagEdit,
  onCustomTagEditDraftChange,
  onSaveCustomTagEdit,
  onStartMergeEdit,
  onCancelMergeEdit,
  onMergeSearchQueryChange,
  onSelectMergeTarget,
  onSaveMergeRule,
  onDeleteMergeRule,
  onSetSuggestionHidden,
}: {
  selectedSuggestion: TagSuggestion | null;
  selectedUserAliases: string[];
  selectedBuiltinAliases: string[];
  mergePreview: MergePreviewInfo;
  canEditMergeRule: boolean;
  isMergeEditorOpen: boolean;
  mergeSearchQuery: string;
  mergeTargetCandidates: TagSuggestion[];
  selectedMergeTarget: TagSuggestion | null;
  mergeError: string | null;
  canManageAliases: boolean;
  aliasInput: string;
  aliasError: string | null;
  customTagCreateDraft: CustomTagCreateDraft | null;
  customTagCreateError: string | null;
  customTagEditDraft: CustomTagEditDraft | null;
  customTagEditError: string | null;
  isSaving: boolean;
  onAliasInputChange: (value: string) => void;
  onAddAlias: () => void;
  onDeleteUserAlias: (alias: string) => void;
  onCancelCustomTagCreate: () => void;
  onCustomTagCreateDraftChange: (patch: Partial<CustomTagCreateDraft>) => void;
  onSaveCustomTagCreate: () => void;
  onStartCustomTagEdit: () => void;
  onDeleteCustomTag: () => void;
  onCancelCustomTagEdit: () => void;
  onCustomTagEditDraftChange: (patch: Partial<CustomTagEditDraft>) => void;
  onSaveCustomTagEdit: () => void;
  onStartMergeEdit: () => void;
  onCancelMergeEdit: () => void;
  onMergeSearchQueryChange: (value: string) => void;
  onSelectMergeTarget: (suggestion: TagSuggestion) => void;
  onSaveMergeRule: () => void;
  onDeleteMergeRule: () => void;
  onSetSuggestionHidden: (suggestion: TagSuggestion, hidden: boolean) => void;
}) {
  const handleAliasKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onAddAlias();
    }
  };
  const customTagPathPreview = selectedSuggestion && customTagEditDraft
    ? [...selectedSuggestion.path.slice(0, -1), customTagEditDraft.name.trim().replace(/\s+/g, " ") || "未命名标签"].join(" / ")
    : "";
  const customTagCreatePathPreview = customTagCreateDraft?.parentLocked
    ? [
      customTagCreateDraft.parentPathText.trim().replace(/\s*[/／]\s*/g, " / "),
      customTagCreateDraft.name.trim().replace(/\s+/g, " ") || "未命名标签",
    ].filter(Boolean).join(" / ")
    : "";

  return (
    <aside className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
        <div className="text-xs font-medium text-muted-foreground">标签详情</div>
      </div>
      <div className="tag-manager-scrollbar min-h-0 overflow-y-auto overflow-x-hidden p-4">
        {customTagCreateDraft ? (
          <div data-tag-manager-interactive="true" className="grid gap-4">
            <div className="grid gap-1">
              <div className="text-base font-semibold text-foreground">新建自定义标签</div>
              <div className="text-xs leading-5 text-muted-foreground">请先在中栏选择目标二级标签，再创建具体标签；不会修改 notes。</div>
            </div>
            <div className="grid gap-3 rounded-sm border border-border/70 bg-background/30 p-3 text-sm">
              <div className="grid gap-1.5">
                <div className="text-[11px] text-muted-foreground">父级</div>
                {customTagCreateDraft.parentLocked ? (
                  <div className="inline-flex max-w-full items-center rounded-sm border border-border/70 bg-muted/20 px-2 py-1 text-sm text-foreground">
                    <span className="min-w-0 truncate">{customTagCreateDraft.parentPathText}</span>
                  </div>
                ) : (
                  <div className="rounded-sm border border-dashed border-border/70 bg-background/20 px-2 py-2 text-xs leading-5 text-muted-foreground">
                    请先在中栏选择一个二级标签，或选中某个具体标签后再创建。
                  </div>
                )}
              </div>
              <div className="grid gap-1.5">
                <label className="text-[11px] text-muted-foreground" htmlFor="tag-manager-custom-tag-create-name">标签名</label>
                <Input
                  id="tag-manager-custom-tag-create-name"
                  name="tag-manager-custom-create-label"
                  value={customTagCreateDraft.name}
                  autoComplete="new-password"
                  placeholder="标签名"
                  onChange={(event) => onCustomTagCreateDraftChange({ name: event.target.value })}
                  disabled={isSaving}
                  className="h-8 text-sm"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-[11px] text-muted-foreground" htmlFor="tag-manager-custom-tag-create-aliases">aliases</label>
                <Input
                  id="tag-manager-custom-tag-create-aliases"
                  name="tag-manager-custom-create-aliases"
                  value={customTagCreateDraft.aliasesText}
                  autoComplete="new-password"
                  placeholder="别名，逗号分隔，可选"
                  onChange={(event) => onCustomTagCreateDraftChange({ aliasesText: event.target.value })}
                  disabled={isSaving}
                  className="h-8 text-sm"
                />
              </div>
              <div className="text-xs text-muted-foreground">路径预览：{customTagCreatePathPreview || "请选择二级标签并输入标签名"}</div>
              {customTagCreateError && <div className="text-xs text-destructive">{customTagCreateError}</div>}
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onSaveCustomTagCreate} disabled={isSaving || !customTagCreateDraft.parentLocked}>
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  保存
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={onCancelCustomTagCreate} disabled={isSaving}>
                  取消
                </Button>
              </div>
            </div>
          </div>
        ) : selectedSuggestion ? (
          <div data-tag-manager-interactive="true" className="grid gap-4">
            <div className="grid gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-foreground">{selectedSuggestion.name}</span>
                <span className="rounded-sm border border-border/70 bg-muted/20 px-1.5 py-0.5 text-[11px] text-muted-foreground">{selectedSuggestion.source === "user" ? "用户自定义标签" : "内置标签"}</span>
                {selectedSuggestion.deprecated && <span className="rounded-sm border border-amber-300/50 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-200">已合并 / 已停用</span>}
                {selectedSuggestion.hidden && <span className="rounded-sm border border-border/70 bg-muted/20 px-1.5 py-0.5 text-[11px] text-muted-foreground">已隐藏</span>}
              </div>
              <div className="text-xs text-muted-foreground">当前为管理预览。排序、可见性和具体标签别名会写入用户配置。</div>
            </div>
            <div className="grid gap-3 text-sm">
              <div className="grid gap-1"><div className="text-xs text-muted-foreground">完整路径</div><div className="break-words text-foreground">{selectedSuggestion.pathText}</div></div>
              <div className="grid gap-1"><div className="text-xs text-muted-foreground">canonical id</div><div className="break-all rounded-sm border border-border/70 bg-background/30 px-2 py-1 font-mono text-xs text-foreground">{selectedSuggestion.id}</div></div>
              <div className="grid gap-1"><div className="text-xs text-muted-foreground">来源</div><div className="text-foreground">{selectedSuggestion.source}</div></div>
              {selectedSuggestion.source === "user" && (
                <div className="grid gap-2 border-t border-border/70 pt-3">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">自定义标签</div>
                    {!customTagEditDraft && (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={onStartCustomTagEdit} disabled={isSaving}>
                          <SquarePen className="h-3.5 w-3.5" />
                          编辑
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={onDeleteCustomTag} disabled={isSaving}>
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    )}
                  </div>
                  {customTagEditDraft ? (
                    <div className="grid gap-2 rounded-sm border border-border/70 bg-background/30 p-3">
                      <div className="grid gap-1.5">
                        <label className="text-[11px] text-muted-foreground" htmlFor="tag-manager-custom-tag-name">标签名</label>
                        <Input
                          id="tag-manager-custom-tag-name"
                          name="tag-manager-custom-edit-label"
                          value={customTagEditDraft.name}
                          autoComplete="new-password"
                          placeholder="标签名"
                          onChange={(event) => onCustomTagEditDraftChange({ name: event.target.value })}
                          disabled={isSaving}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label className="text-[11px] text-muted-foreground" htmlFor="tag-manager-custom-tag-aliases">aliases</label>
                        <Input
                          id="tag-manager-custom-tag-aliases"
                          name="tag-manager-custom-edit-aliases"
                          value={customTagEditDraft.aliasesText}
                          autoComplete="new-password"
                          placeholder="别名，逗号分隔"
                          onChange={(event) => onCustomTagEditDraftChange({ aliasesText: event.target.value })}
                          disabled={isSaving}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">路径预览：{customTagPathPreview}</div>
                      {customTagEditError && <div className="text-xs text-destructive">{customTagEditError}</div>}
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={onSaveCustomTagEdit} disabled={isSaving}>
                          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          保存
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={onCancelCustomTagEdit} disabled={isSaving}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs leading-5 text-muted-foreground">可编辑标签名和 aliases；不会修改 canonical id，也不会批量替换笔记中的旧 tag。</div>
                  )}
                </div>
              )}
              <div className="grid gap-2 border-t border-border/70 pt-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">别名管理</div>
                  {!canManageAliases && <div className="text-[11px] text-muted-foreground">只有具体标签支持别名管理</div>}
                </div>
                <div className="grid gap-1.5">
                  <div className="text-[11px] text-muted-foreground">内置 aliases</div>
                  {selectedBuiltinAliases.length === 0 ? <div className="text-xs text-muted-foreground">暂无内置别名。</div> : (
                    <div className="flex flex-wrap gap-2">
                      {selectedBuiltinAliases.map((alias) => (
                        <span key={alias} className="inline-flex items-center gap-1.5 rounded-sm border border-border/70 bg-background/30 px-2 py-1 text-xs text-muted-foreground">
                          <span>{alias}</span>
                          <span className="rounded-sm border border-border/60 px-1 text-[10px]">内置</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <div className="text-[11px] text-muted-foreground">自定义 aliases</div>
                  {selectedUserAliases.length === 0 ? <div className="text-xs text-muted-foreground">暂无自定义别名。</div> : (
                    <div className="flex flex-wrap gap-2">
                      {selectedUserAliases.map((alias) => (
                        <span key={alias} className="inline-flex items-center gap-1.5 rounded-sm border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-foreground">
                          <span>{alias}</span>
                          <button
                            type="button"
                            className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`删除别名 ${alias}`}
                            onClick={() => onDeleteUserAlias(alias)}
                            disabled={isSaving}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 gap-2">
                  <Input
                    name="tag-manager-single-alias"
                    value={aliasInput}
                    autoComplete="new-password"
                    placeholder="添加别名，例如 exKMP"
                    onChange={(event) => onAliasInputChange(event.target.value)}
                    onKeyDown={handleAliasKeyDown}
                    disabled={!canManageAliases || isSaving}
                    className="h-8 min-w-0 text-sm"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={onAddAlias} disabled={!canManageAliases || isSaving}>
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    添加
                  </Button>
                </div>
                {aliasError && <div className="text-xs text-destructive">{aliasError}</div>}
              </div>
              <div className="grid gap-2 border-t border-border/70 pt-3">
                <div className="text-xs text-muted-foreground">合并规则</div>
                <div className="grid gap-1.5 rounded-sm border border-border/70 bg-background/30 p-2.5">
                  {mergePreview.targetReference ? (
                    <div className="grid gap-1">
                      <div className="text-xs text-muted-foreground">当前标签已合并到：</div>
                      <div className="break-words text-sm text-foreground">{mergePreview.targetSuggestion?.pathText ?? mergePreview.targetReference}</div>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground">当前未设置合并规则。</div>
                  )}
                  {mergePreview.incomingSuggestions.length > 0 && (
                    <div className="grid gap-1 border-t border-border/60 pt-2">
                      <div className="text-xs text-muted-foreground">有 {mergePreview.incomingSuggestions.length} 个标签合并到此标签。</div>
                      <div className="flex flex-wrap gap-1.5">
                        {mergePreview.incomingSuggestions.slice(0, 5).map((source) => (
                          <span key={source.id} className="rounded-sm border border-border/70 bg-muted/20 px-2 py-1 text-xs text-muted-foreground">{source.pathText}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={onStartMergeEdit} disabled={!canEditMergeRule || isSaving}>
                      设置合并目标
                    </Button>
                    {mergePreview.targetReference && (
                      <Button type="button" variant="ghost" size="sm" onClick={onDeleteMergeRule} disabled={!canEditMergeRule || isSaving}>
                        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        取消合并规则
                      </Button>
                    )}
                    {!canEditMergeRule && <div className="text-xs text-muted-foreground">只有具体标签支持合并规则。</div>}
                  </div>
                  {isMergeEditorOpen && (
                    <div className="grid gap-2 rounded-sm border border-border/70 bg-background/30 p-3">
                      <div className="grid gap-1.5">
                        <label className="text-[11px] text-muted-foreground" htmlFor="tag-manager-merge-target">合并目标</label>
                        <Input
                          id="tag-manager-merge-target"
                          name="tag-manager-merge-target-search"
                          value={mergeSearchQuery}
                          autoComplete="new-password"
                          placeholder="搜索具体标签作为目标"
                          onChange={(event) => onMergeSearchQueryChange(event.target.value)}
                          disabled={isSaving}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="grid max-h-44 gap-1 overflow-y-auto">
                        {mergeSearchQuery.trim() ? (
                          mergeTargetCandidates.length === 0 ? (
                            <div className="text-xs text-muted-foreground">没有可用的合并目标。</div>
                          ) : (
                            mergeTargetCandidates.map((candidate) => (
                              <button
                                key={candidate.id}
                                type="button"
                                className={`grid gap-0.5 rounded-sm border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50 ${selectedMergeTarget?.id === candidate.id ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/70 bg-background/20 text-muted-foreground"}`}
                                onClick={() => onSelectMergeTarget(candidate)}
                                disabled={isSaving}
                              >
                                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                  <span className="font-medium text-foreground">{candidate.name}</span>
                                  {candidate.hidden && <span className="rounded-sm border border-border/70 px-1 text-[10px] text-muted-foreground">隐藏</span>}
                                </span>
                                <span className="break-words">{candidate.pathText}</span>
                              </button>
                            ))
                          )
                        ) : (
                          <div className="text-xs text-muted-foreground">输入关键词后选择一个具体标签。</div>
                        )}
                      </div>
                      {selectedMergeTarget && (
                        <div className="grid gap-1 rounded-sm border border-primary/30 bg-primary/10 p-2 text-xs">
                          <div>当前标签：{selectedSuggestion.pathText}</div>
                          <div>将合并到：{selectedMergeTarget.pathText}</div>
                          <div className="text-muted-foreground">影响：以后规范化和建议会优先指向目标；不会自动修改 notes。</div>
                        </div>
                      )}
                      {mergeError && <div className="text-xs text-destructive">{mergeError}</div>}
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={onSaveMergeRule} disabled={!selectedMergeTarget || isSaving}>
                          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          保存合并规则
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={onCancelMergeEdit} disabled={isSaving}>
                          取消
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="max-w-[28rem] text-xs leading-5 text-muted-foreground">
                    合并会影响后续规范化和建议结果；保存前会二次确认，不会自动修改 notes。
                  </div>
                </div>
              </div>
              <div className="grid gap-2 border-t border-border/70 pt-3">
                <div className="text-xs text-muted-foreground">可见性</div>
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <span className="text-sm text-foreground">状态：{selectedSuggestion.hidden ? "已隐藏" : "显示中"}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => onSetSuggestionHidden(selectedSuggestion, !selectedSuggestion.hidden)} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {selectedSuggestion.hidden ? "恢复显示" : "隐藏此标签"}
                  </Button>
                </div>
                <div className="text-xs leading-5 text-muted-foreground">该操作只写入用户配置 hiddenIds，不会修改内置 taxonomy 或任何笔记。</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[320px] items-center justify-center rounded-sm border border-dashed border-border/70 text-sm text-muted-foreground">请选择左侧标签。</div>
        )}
      </div>
    </aside>
  );
}
