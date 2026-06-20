import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import { Check, Download, Loader2, Plus, RefreshCw, Search, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TagManagerFilterMode } from "@/components/tag-manager/types";
import type { TagTaxonomyConfigImportResult } from "@/components/tag-manager/tagManagerConfig";
import type {
  TagNormalizationApplyResult,
  TagNormalizationPanelView,
  TagNormalizationScanResult,
  TagNormalizationScanStats,
} from "@/components/tag-manager/tagNormalizationScan";
import { cn } from "@/lib/utils";
import type { TagNormalizationReason, TagNormalizationSuggestion, TagTaxonomyEntry } from "@/lib/tagTaxonomy";
import type { TagTaxonomySettingsView } from "@/lib/tagTaxonomySettingsModel";

import { SettingsPageLayout } from "../v2/components/SettingsPageLayout";

interface TagTaxonomyStats {
  statusLabel: string;
  userConfigItemCount: number;
  availableCandidateCount: number;
  entriesCount: number;
  aliasesCount: number;
  hiddenIdsCount: number;
  orderOverridesCount: number;
  mergesCount: number;
}

interface TagTaxonomyStatItem {
  label: string;
  value: string | number;
}

export interface BlogTaxonomySettingsPageProps {
  className: string;
  embedded?: boolean;
  tagTaxonomyConfigError: string | null;
  tagTaxonomyStats: TagTaxonomyStats;
  tagTaxonomySettingsView: TagTaxonomySettingsView;
  tagTaxonomyStatItems: TagTaxonomyStatItem[];
  tagTaxonomyImportFileInputRef: RefObject<HTMLInputElement | null>;
  tagTaxonomyImportMessage: string | null;
  tagTaxonomyImportJsonInput: string;
  tagTaxonomyImportPreview: TagTaxonomyConfigImportResult | null;
  tagTaxonomyImportError: string | null;
  tagTaxonomyUserEntries: TagTaxonomyEntry[];
  displayedTagTaxonomyUserEntries: TagTaxonomyEntry[];
  isTagTaxonomyEntryListExpanded: boolean;
  tagTaxonomyEntryPathInput: string;
  tagTaxonomyEntryAliasesInput: string;
  tagTaxonomyEntryListQuery: string;
  tagTaxonomyUserAliases: Array<[string, string]>;
  displayedTagTaxonomyUserAliases: Array<[string, string]>;
  isTagTaxonomyAliasListExpanded: boolean;
  tagTaxonomyAliasNameInput: string;
  tagTaxonomyAliasTargetInput: string;
  tagTaxonomyAliasListQuery: string;
  tagTaxonomySaveError: string | null;
  tagNormalizationScanError: string | null;
  tagNormalizationApplyResult: TagNormalizationApplyResult | null;
  tagNormalizationScanResults: TagNormalizationScanResult[] | null;
  tagNormalizationScanIssueCount: number;
  tagNormalizationScanStats: TagNormalizationScanStats;
  tagNormalizationPanelView: TagNormalizationPanelView;
  selectedTagNormalizationScanStats: TagNormalizationScanStats;
  selectedTagNormalizationScanPaths: Set<string>;
  loadTagTaxonomyConfig: () => void | Promise<void>;
  handleExportTagTaxonomyConfig: () => void | Promise<void>;
  handleSelectTagTaxonomyImportFile: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  handleTagTaxonomyImportInputChange: (value: string) => void;
  previewTagTaxonomyImport: (value: string) => void;
  handleConfirmTagTaxonomyImport: () => void | Promise<void>;
  openTagManagerWorkspace: (initialFilterMode?: TagManagerFilterMode) => void;
  setIsTagTaxonomyEntryListExpanded: Dispatch<SetStateAction<boolean>>;
  setTagTaxonomyEntryPathInput: (value: string) => void;
  setTagTaxonomyEntryAliasesInput: (value: string) => void;
  handleAddTagTaxonomyEntry: () => void | Promise<void>;
  setTagTaxonomyEntryListQuery: (value: string) => void;
  handleDeleteTagTaxonomyEntry: (id: string) => void | Promise<void>;
  setIsTagTaxonomyAliasListExpanded: Dispatch<SetStateAction<boolean>>;
  setTagTaxonomyAliasNameInput: (value: string) => void;
  setTagTaxonomyAliasTargetInput: (value: string) => void;
  handleAddTagTaxonomyAlias: () => void | Promise<void>;
  setTagTaxonomyAliasListQuery: (value: string) => void;
  handleDeleteTagTaxonomyAlias: (aliasName: string) => void | Promise<void>;
  handleScanLegacyTags: () => void | Promise<void>;
  selectAllTagNormalizationScanResults: () => void;
  clearTagNormalizationScanSelection: () => void;
  applySelectedTagNormalizationScanResults: () => void | Promise<void>;
  toggleTagNormalizationScanSelection: (path: string) => void;
  formatTagNormalizationReason: (reason: TagNormalizationReason) => string;
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border border-border/70 bg-muted/20 px-2 py-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </span>
  );
}

function ScanStatGrid({ stats }: { stats: TagNormalizationScanStats }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <StatPill label="笔记" value={stats.noteCount} />
      <StatPill label="建议" value={stats.suggestionCount} />
      <StatPill label="可改写" value={stats.rewriteCount} />
      <StatPill label="别名" value={stats.aliasCount} />
      <StatPill label="合并" value={stats.mergeCount} />
      <StatPill label="重复" value={stats.duplicateCount} />
      <StatPill label="未知" value={stats.unknownCount} />
      <StatPill label="隐藏跳过" value={stats.hiddenSkippedCount} />
      <StatPill label="合并源别名" value={stats.aliasToMergedSourceCount} />
    </div>
  );
}

function renderEntryPath(entry: TagTaxonomyEntry): string {
  return entry.path.join(" / ");
}

function renderSuggestion(
  suggestion: TagNormalizationSuggestion,
  formatTagNormalizationReason: (reason: TagNormalizationReason) => string,
) {
  return (
    <div key={`${suggestion.original}-${suggestion.normalized}-${suggestion.reason}`} className="rounded-sm border border-border/60 bg-muted/10 px-2 py-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-foreground">{suggestion.original}</span>
        <span className="text-muted-foreground">-&gt;</span>
        <span className="font-medium text-foreground">{suggestion.pathText || suggestion.normalized}</span>
        {suggestion.safeToAutoApply && (
          <span className="rounded-sm border border-emerald-300/60 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-200">
            可自动应用
          </span>
        )}
      </div>
      <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {formatTagNormalizationReason(suggestion.reason)}
      </div>
    </div>
  );
}

export function BlogTaxonomySettingsPage(props: BlogTaxonomySettingsPageProps) {
  const hasScanResults = props.tagNormalizationScanResults !== null;
  const selectedCount = props.selectedTagNormalizationScanPaths.size;

  return (
    <SettingsPageLayout title="博客" embedded={props.embedded}>
    <section className={props.className}>
      <div className="settings-v2-legacy-section-header">
        <div className="settings-v2-legacy-section-title">标签体系</div>
        <div className="settings-v2-legacy-section-description">
          用于组织博客文章、桌面端标签建议和 AI 元数据补全；除推荐标签外，也可以输入自定义标签。
        </div>
      </div>

      <div className="grid gap-5">
        <section className="grid gap-3 border-t border-border/70 pt-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <div className="text-sm font-semibold text-foreground">状态概览</div>
              <div className="text-xs leading-5 text-muted-foreground">
                读取用户配置后合并内置标签体系；失败时自动回退内置默认体系。
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void props.loadTagTaxonomyConfig()}
              disabled={props.tagTaxonomySettingsView.isReloadDisabled}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", props.tagTaxonomySettingsView.showReloadSpinner && "animate-spin")} />
              重新加载
            </Button>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-sm border px-2 py-0.5 text-xs",
                props.tagTaxonomySettingsView.statusTone === "warning"
                  ? "border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                  : props.tagTaxonomySettingsView.statusTone === "success"
                    ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                    : "border-border/70 bg-muted/20 text-muted-foreground",
              )}
            >
              {props.tagTaxonomyStats.statusLabel}
            </span>
            <span className="inline-flex rounded-sm border border-border/70 bg-muted/20 px-2 py-1 font-mono text-xs text-foreground">
              .oinb/tag-taxonomy.json
            </span>
          </div>

          {props.tagTaxonomyConfigError && (
            <div className="text-xs leading-5 text-muted-foreground">读取失败：{props.tagTaxonomyConfigError}</div>
          )}

          <div className="flex min-w-0 flex-wrap gap-2">
            {props.tagTaxonomyStatItems.map((item) => (
              <StatPill key={item.label} label={item.label} value={item.value} />
            ))}
            <StatPill label="可用候选" value={props.tagTaxonomyStats.availableCandidateCount} />
          </div>
        </section>

        <section className="grid gap-3 border-t border-border/70 pt-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <div className="text-sm font-semibold text-foreground">配置导入与备份</div>
              <div className="text-xs leading-5 text-muted-foreground">
                导出当前用户配置，或粘贴 / 选择 JSON 后预览并导入。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void props.handleExportTagTaxonomyConfig()}
                disabled={props.tagTaxonomySettingsView.areConfigActionsDisabled}
              >
                <Download className="h-3.5 w-3.5" />
                导出
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => props.tagTaxonomyImportFileInputRef.current?.click()}
                disabled={props.tagTaxonomySettingsView.areConfigActionsDisabled}
              >
                <Upload className="h-3.5 w-3.5" />
                选择 JSON
              </Button>
            </div>
          </div>

          <input
            ref={props.tagTaxonomyImportFileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void props.handleSelectTagTaxonomyImportFile(event)}
          />

          {props.tagTaxonomyImportMessage && (
            <div className="rounded-sm border border-emerald-300/60 bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-700 dark:text-emerald-200">
              {props.tagTaxonomyImportMessage}
            </div>
          )}
          {props.tagTaxonomyImportError && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
              {props.tagTaxonomyImportError}
            </div>
          )}

          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">导入 JSON</Label>
            <textarea
              value={props.tagTaxonomyImportJsonInput}
              onChange={(event) => props.handleTagTaxonomyImportInputChange(event.target.value)}
              onBlur={() => props.previewTagTaxonomyImport(props.tagTaxonomyImportJsonInput)}
              placeholder='{"version":1,"entries":[],"aliases":{}}'
              spellCheck={false}
              className="min-h-24 resize-y rounded-md border border-border/75 bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/65 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {props.tagTaxonomyImportPreview && (
            <div className="grid gap-2 rounded-sm border border-border/70 bg-muted/10 p-3">
              <div className="text-xs font-medium text-foreground">预览</div>
              <div className="flex flex-wrap gap-2">
                <StatPill label="自定义标签" value={props.tagTaxonomyImportPreview.preview.entriesCount} />
                <StatPill label="别名" value={props.tagTaxonomyImportPreview.preview.aliasesCount} />
                <StatPill label="隐藏" value={props.tagTaxonomyImportPreview.preview.hiddenIdsCount} />
                <StatPill label="排序" value={props.tagTaxonomyImportPreview.preview.orderOverridesCount} />
                <StatPill label="合并" value={props.tagTaxonomyImportPreview.preview.mergesCount} />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => void props.handleConfirmTagTaxonomyImport()}
                disabled={props.tagTaxonomySettingsView.isConfirmImportDisabled}
              >
                {props.tagTaxonomySettingsView.showConfirmImportSpinner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                确认导入
              </Button>
            </div>
          )}
        </section>

        <section className="grid gap-3 border-t border-border/70 pt-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <div className="text-sm font-semibold text-foreground">标签管理</div>
              <div className="text-xs leading-5 text-muted-foreground">
                快速维护自定义标签、别名与隐藏项；完整树形管理可打开标签管理器。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => props.openTagManagerWorkspace()}>
                打开标签管理器
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => props.openTagManagerWorkspace("hidden")}>
                管理隐藏标签
              </Button>
            </div>
          </div>

          {props.tagTaxonomySaveError && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
              {props.tagTaxonomySaveError}
            </div>
          )}

          <div className="grid gap-3 rounded-sm border border-border/70 bg-muted/10 p-3">
            <div className="text-xs font-medium text-foreground">自定义标签</div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Input
                value={props.tagTaxonomyEntryPathInput}
                onChange={(event) => props.setTagTaxonomyEntryPathInput(event.target.value)}
                placeholder="算法 / 图论 / 最短路"
              />
              <Input
                value={props.tagTaxonomyEntryAliasesInput}
                onChange={(event) => props.setTagTaxonomyEntryAliasesInput(event.target.value)}
                placeholder="别名，逗号分隔"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => void props.handleAddTagTaxonomyEntry()} disabled={props.tagTaxonomySettingsView.areEditActionsDisabled}>
                <Plus className="h-3.5 w-3.5" />
                添加
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={props.tagTaxonomyEntryListQuery}
                  onChange={(event) => props.setTagTaxonomyEntryListQuery(event.target.value)}
                  placeholder="筛选自定义标签"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => props.setIsTagTaxonomyEntryListExpanded((expanded) => !expanded)}
              >
                {props.isTagTaxonomyEntryListExpanded ? "收起" : "展开全部"}
              </Button>
            </div>
            <div className="grid gap-2">
              {(props.isTagTaxonomyEntryListExpanded ? props.displayedTagTaxonomyUserEntries : props.displayedTagTaxonomyUserEntries.slice(0, 4)).map((entry) => (
                <div key={entry.id} className="flex min-w-0 items-start justify-between gap-3 rounded-sm border border-border/60 bg-background/60 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-foreground">{renderEntryPath(entry)}</div>
                    <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {entry.aliases?.length ? `别名：${entry.aliases.join("，")}` : "无别名"}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void props.handleDeleteTagTaxonomyEntry(entry.id)}
                    disabled={props.tagTaxonomySettingsView.areEditActionsDisabled}
                    aria-label="删除自定义标签"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {props.tagTaxonomyUserEntries.length === 0 && (
                <div className="rounded-sm border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                  暂无自定义标签。
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-3 rounded-sm border border-border/70 bg-muted/10 p-3">
            <div className="text-xs font-medium text-foreground">别名映射</div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Input
                value={props.tagTaxonomyAliasNameInput}
                onChange={(event) => props.setTagTaxonomyAliasNameInput(event.target.value)}
                placeholder="别名"
              />
              <Input
                value={props.tagTaxonomyAliasTargetInput}
                onChange={(event) => props.setTagTaxonomyAliasTargetInput(event.target.value)}
                placeholder="目标标签路径"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => void props.handleAddTagTaxonomyAlias()} disabled={props.tagTaxonomySettingsView.areEditActionsDisabled}>
                <Plus className="h-3.5 w-3.5" />
                添加
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[180px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={props.tagTaxonomyAliasListQuery}
                  onChange={(event) => props.setTagTaxonomyAliasListQuery(event.target.value)}
                  placeholder="筛选别名"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => props.setIsTagTaxonomyAliasListExpanded((expanded) => !expanded)}
              >
                {props.isTagTaxonomyAliasListExpanded ? "收起" : "展开全部"}
              </Button>
            </div>
            <div className="grid gap-2">
              {(props.isTagTaxonomyAliasListExpanded ? props.displayedTagTaxonomyUserAliases : props.displayedTagTaxonomyUserAliases.slice(0, 4)).map(([aliasName, target]) => (
                <div key={aliasName} className="flex min-w-0 items-center justify-between gap-3 rounded-sm border border-border/60 bg-background/60 px-3 py-2">
                  <div className="min-w-0 text-xs">
                    <span className="font-medium text-foreground">{aliasName}</span>
                    <span className="px-1.5 text-muted-foreground">-&gt;</span>
                    <span className="text-muted-foreground">{target}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => void props.handleDeleteTagTaxonomyAlias(aliasName)}
                    disabled={props.tagTaxonomySettingsView.areEditActionsDisabled}
                    aria-label="删除别名"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {props.tagTaxonomyUserAliases.length === 0 && (
                <div className="rounded-sm border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                  暂无自定义别名。
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-3 border-t border-border/70 pt-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <div className="text-sm font-semibold text-foreground">旧标签扫描与批量应用</div>
              <div className="text-xs leading-5 text-muted-foreground">
                扫描已有笔记中的自由标签，按当前标签体系生成规范化建议。
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void props.handleScanLegacyTags()} disabled={props.tagNormalizationPanelView.isScanDisabled}>
              {props.tagNormalizationPanelView.showScanSpinner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {props.tagNormalizationPanelView.scanButtonLabel}
            </Button>
          </div>

          {props.tagNormalizationScanError && (
            <div className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
              {props.tagNormalizationScanError}
            </div>
          )}
          {props.tagNormalizationApplyResult && (
            <div className="rounded-sm border border-border/70 bg-muted/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
              已应用 {props.tagNormalizationApplyResult.successCount} 篇，规范化 {props.tagNormalizationApplyResult.normalizedTagCount} 个标签，
              去重 {props.tagNormalizationApplyResult.duplicateTagCount} 个，跳过 {props.tagNormalizationApplyResult.skippedCount} 个。
              {props.tagNormalizationApplyResult.failures.length > 0 && ` 失败 ${props.tagNormalizationApplyResult.failures.length} 篇。`}
            </div>
          )}

          {hasScanResults ? (
            <div className="grid gap-3 rounded-sm border border-border/70 bg-muted/10 p-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <div className="grid gap-1">
                  <div className="text-xs font-medium text-foreground">
                    扫描结果：{props.tagNormalizationScanIssueCount} 个需要处理的问题
                  </div>
                  <div className="text-xs leading-5 text-muted-foreground">
                    当前已选择 {selectedCount} 篇，预计应用 {props.selectedTagNormalizationScanStats.rewriteCount} 个改写建议。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={props.selectAllTagNormalizationScanResults}>
                    全选
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={props.clearTagNormalizationScanSelection}>
                    清空
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void props.applySelectedTagNormalizationScanResults()}
                    disabled={props.tagNormalizationPanelView.isApplyDisabled}
                  >
                    {props.tagNormalizationPanelView.showApplySpinner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {props.tagNormalizationPanelView.applyButtonLabel}
                  </Button>
                </div>
              </div>

              <ScanStatGrid stats={props.tagNormalizationScanStats} />

              <div className="grid gap-2">
                {(props.tagNormalizationScanResults ?? []).map((item) => {
                  const selected = props.selectedTagNormalizationScanPaths.has(item.path);
                  return (
                    <div key={item.path} className="grid gap-2 rounded-sm border border-border/60 bg-background/60 p-3">
                      <label className="flex min-w-0 items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                          checked={selected}
                          onChange={() => props.toggleTagNormalizationScanSelection(item.path)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">{item.title || item.path}</span>
                          <span className="block truncate text-muted-foreground">{item.path}</span>
                        </span>
                      </label>
                      <div className="grid gap-1.5">
                        {item.suggestions.map((suggestion) => renderSuggestion(suggestion, props.formatTagNormalizationReason))}
                      </div>
                    </div>
                  );
                })}
                {(props.tagNormalizationScanResults ?? []).length === 0 && (
                  <div className="rounded-sm border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
                    当前没有需要规范化的旧标签。
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-sm border border-dashed border-border/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
              尚未扫描旧标签。
            </div>
          )}
        </section>
      </div>
    </section>
    </SettingsPageLayout>
  );
}
