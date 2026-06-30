import { useMemo, useState } from "react";
import {
  BookOpenText,
  Brain,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  FileText,
  GraduationCap,
  LibraryBig,
  Network,
  SkipForward,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { rebuildKnowledgeGraph, writeKnowledgeAsset } from "@/lib/api";
import {
  buildTrainingBatchWritePlan,
  createProblemTrainingItemDraft,
  createTrainingBatchDraft,
  createTrainingItemDraft,
  toggleTrainingItemOutput,
} from "@/lib/knowledge/trainingDrafts";
import {
  applyTrainingWriteFeedback,
  buildTrainingBatchStatusSummary,
  buildTrainingWriteFeedback,
  isTrainingWriteEnabled,
  markTrainingItemReady,
  skipTrainingItem,
  type TrainingWriteFeedback,
} from "@/lib/knowledge/trainingLoop";
import type { KnowledgeWorkspaceTabId, TrainingBatchDraft, TrainingItemDraft, TrainingItemStatus, TrainingSourceType } from "@/lib/knowledge/knowledgeTypes";

type TrainingMode = "today" | "range" | "single" | "problemset" | "contest";

const DEFAULT_BATCH_ID = "batch:2026-06-30-p2";

const MODE_OPTIONS: Array<{
  id: TrainingMode;
  sourceType: TrainingSourceType;
  label: string;
  description: string;
  reserved?: boolean;
  icon: typeof Dumbbell;
}> = [
  { id: "today", sourceType: "luogu-today", label: "今日", description: "扫描今日 Luogu 提交", icon: Dumbbell },
  { id: "range", sourceType: "luogu-range", label: "范围", description: "按日期窗口沉淀训练", icon: GraduationCap },
  { id: "single", sourceType: "luogu-single", label: "单题", description: "围绕单题补录片段", icon: FileText },
  { id: "problemset", sourceType: "luogu-problemset-future", label: "题单", description: "等待 P2-A/P3 数据入口", reserved: true, icon: LibraryBig },
  { id: "contest", sourceType: "luogu-contest-future", label: "比赛", description: "等待 P2-A/P3 数据入口", reserved: true, icon: Network },
];

const STATUS_LABELS: Record<TrainingItemStatus, string> = {
  draft: "draft",
  ready: "ready",
  written: "written",
  skipped: "skipped",
  failed: "failed",
};

export interface TrainingCenterWorkspaceProps {
  currentNoteTitle?: string | null;
  onOpenAsset?: (path: string) => void;
  onOpenKnowledgeTab?: (tab: KnowledgeWorkspaceTabId) => void;
}

function createInitialBatch(): TrainingBatchDraft {
  return createTrainingBatchDraft({
    id: DEFAULT_BATCH_ID,
    title: "2026-06-30 P2 训练沉淀",
    sourceType: "luogu-today",
    sourceLabel: "今日训练",
    createdAt: "2026-06-30T00:00:00.000Z",
    itemIds: ["item:P3803", "item:P3383", "item:blank"],
  });
}

function createInitialItems(batchId: string): TrainingItemDraft[] {
  return [
    markTrainingItemReady(createProblemTrainingItemDraft({
      id: "item:P3803",
      batchId,
      problemId: "P3803",
      problemTitle: "多项式乘法",
      submitTime: "2026-06-30T18:42:00.000Z",
      difficulty: "提高+/省选-",
    })),
    markTrainingItemReady(createProblemTrainingItemDraft({
      id: "item:P3383",
      batchId,
      problemId: "P3383",
      problemTitle: "线性筛素数",
      submitTime: "2026-06-30T19:10:00.000Z",
      difficulty: "普及/提高-",
    })),
    createTrainingItemDraft({
      id: "item:blank",
      batchId,
    }),
  ];
}

function serializeFrontmatterPreview(markdown: string): string {
  const start = markdown.indexOf("---");
  const end = markdown.indexOf("\n---\n", start + 3);
  if (start === -1 || end === -1) return markdown.slice(0, 240);
  return markdown.slice(start + 4, end).trim();
}

function splitListInput(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function statusBadgeVariant(status: TrainingItemStatus): "default" | "secondary" | "success" | "warning" | "danger" | "info" {
  if (status === "written") return "success";
  if (status === "ready") return "info";
  if (status === "skipped") return "warning";
  if (status === "failed") return "danger";
  return "secondary";
}

export function TrainingCenterWorkspace({ currentNoteTitle, onOpenAsset, onOpenKnowledgeTab }: TrainingCenterWorkspaceProps) {
  const [activeMode, setActiveMode] = useState<TrainingMode>("today");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [batch, setBatch] = useState<TrainingBatchDraft>(() => createInitialBatch());
  const [items, setItems] = useState<TrainingItemDraft[]>(() => createInitialItems(DEFAULT_BATCH_ID));
  const [selectedItemId, setSelectedItemId] = useState("item:P3803");
  const [writeStatus, setWriteStatus] = useState("等待确认写入");
  const [graphStatus, setGraphStatus] = useState("图谱未刷新");
  const [lastWrittenMarkdown, setLastWrittenMarkdown] = useState("");
  const [feedback, setFeedback] = useState<TrainingWriteFeedback | null>(null);

  const selectedMode = MODE_OPTIONS.find((mode) => mode.id === activeMode) ?? MODE_OPTIONS[0];
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? items[0] ?? null,
    [items, selectedItemId],
  );
  const readyItems = useMemo(() => items.filter((item) => item.status === "ready"), [items]);
  const writePlan = useMemo(() => buildTrainingBatchWritePlan(batch, readyItems), [batch, readyItems]);
  const previewPlan = useMemo(() => buildTrainingBatchWritePlan(batch, items.filter((item) => item.status !== "skipped")), [batch, items]);
  const selectedFragmentPlan = selectedItem
    ? previewPlan.fragments.find((fragment) => fragment.itemId === selectedItem.id)
    : null;
  const statusSummary = useMemo(() => buildTrainingBatchStatusSummary(batch, items), [batch, items]);
  const canWrite = isTrainingWriteEnabled(items) && writePlan.fragments.length > 0;

  const updateSelectedItem = (update: (item: TrainingItemDraft) => TrainingItemDraft) => {
    if (!selectedItem) return;
    setItems((current) => current.map((item) => item.id === selectedItem.id ? update(item) : item));
  };

  const handleModeSelect = (mode: TrainingMode) => {
    const nextMode = MODE_OPTIONS.find((option) => option.id === mode) ?? MODE_OPTIONS[0];
    setActiveMode(mode);
    setBatch((current) => ({
      ...current,
      sourceType: nextMode.sourceType,
      sourceLabel: nextMode.label,
    }));
  };

  const handleFieldChange = (field: keyof TrainingItemDraft["fields"], value: string | string[]) => {
    updateSelectedItem((item) => markTrainingItemReady({
      ...item,
      fields: {
        ...item.fields,
        [field]: value,
      },
    }));
  };

  const handleWrite = async () => {
    if (!canWrite) {
      setWriteStatus("没有 ready 条目可写入");
      return;
    }
    setWriteStatus("写入中...");
    setFeedback(null);

    try {
      const collectionResult = await writeKnowledgeAsset(writePlan.collection.relativePath, writePlan.collection.markdown, true);
      setLastWrittenMarkdown(writePlan.collection.markdown);

      const fragmentResults = [];
      for (const fragment of writePlan.fragments) {
        const result = await writeKnowledgeAsset(fragment.relativePath, fragment.markdown, true);
        setLastWrittenMarkdown(fragment.markdown);
        fragmentResults.push({
          itemId: fragment.itemId,
          written: result.written,
          skipped: result.skipped,
        });
      }

      const graph = await rebuildKnowledgeGraph();
      const nextFeedback = buildTrainingWriteFeedback({
        collectionWritten: collectionResult.written,
        fragmentResults,
        edgeCount: graph.edges.length,
        collectionPath: writePlan.collection.relativePath,
      });
      setFeedback(nextFeedback);
      setItems((current) => applyTrainingWriteFeedback(current, nextFeedback));
      setGraphStatus(`已刷新：${graph.nodes.length} nodes / ${graph.edges.length} edges`);
      setWriteStatus(`写入完成：fragment ${nextFeedback.fragmentCount} / collection ${nextFeedback.collectionCount} / edge ${nextFeedback.edgeCount}`);
    } catch (error) {
      setWriteStatus(`写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
            Training Center
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {currentNoteTitle ? `返回 editor 保留当前笔记：${currentNoteTitle}` : "三栏沉淀工作区，当前使用 P1 写入链路"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{selectedMode.label}</Badge>
          <Button type="button" size="compact" variant="outline">
            扫描当前来源
          </Button>
        </div>
      </header>

      <div className={cn(
        "grid min-h-0 flex-1 gap-0 overflow-hidden",
        isInspectorOpen ? "grid-cols-[250px_minmax(0,1fr)_330px]" : "grid-cols-[250px_minmax(0,1fr)_44px]",
      )}>
        <aside className="min-h-0 overflow-auto border-r border-border/70 bg-muted/10 p-3">
          <div className="space-y-2">
            {MODE_OPTIONS.map((mode) => {
              const Icon = mode.icon;
              const selected = mode.id === activeMode;
              return (
                <button
                  key={mode.id}
                  type="button"
                  className={cn(
                    "grid w-full cursor-pointer gap-1 rounded-[var(--ui-radius-item)] border px-3 py-2 text-left transition-colors",
                    selected ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/60 bg-background/70 text-foreground/90 hover:bg-muted/50",
                    mode.reserved && "cursor-not-allowed opacity-70",
                  )}
                  disabled={mode.reserved}
                  onClick={() => handleModeSelect(mode.id)}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{mode.label}</span>
                    {mode.reserved ? <Badge variant="default" className="ml-auto">Reserved</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">{mode.description}</div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-[var(--ui-radius-panel)] border border-border/70 bg-background/70 p-3 text-xs">
            <div className="flex items-center gap-2 text-foreground">
              <BookOpenText className="h-4 w-4 text-muted-foreground" />
              当前来源
            </div>
            <div className="mt-3 grid gap-2 text-muted-foreground">
              <div>来源：{selectedMode.label}</div>
              <div>当前批次：{batch.title}</div>
              <div>最近状态：ready {statusSummary.ready} / written {statusSummary.written} / skipped {statusSummary.skipped}</div>
              <Button type="button" size="compact" variant="outline" className="mt-1 justify-start">
                扫描{selectedMode.label}
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-[var(--ui-radius-panel)] border border-dashed border-border/70 bg-background/60 p-3 text-xs text-muted-foreground">
            <div className="text-foreground">最近批次</div>
            <div className="mt-2 space-y-1">
              {[batch.title, "2026-06-29 字符串专题", "2026-06-27 模拟赛复盘"].map((label) => (
                <button key={label} type="button" className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--ui-radius-item)] px-2 py-1 text-left hover:bg-muted/50">
                  <span className="truncate">{label}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{batch.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                draft {statusSummary.draft} · ready {statusSummary.ready} · written {statusSummary.written} · skipped {statusSummary.skipped} · failed {statusSummary.failed}
              </div>
            </div>
            <Button type="button" size="compact" onClick={() => void handleWrite()} disabled={!canWrite}>
              写入确认
            </Button>
          </div>

          <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
            <div className="grid grid-cols-[minmax(180px,280px)_minmax(0,1fr)] gap-3 border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">
              <label className="grid gap-1">
                <span>Batch title</span>
                <Input
                  value={batch.title}
                  onChange={(event) => setBatch((current) => ({ ...current, title: event.target.value }))}
                  className="h-8 text-xs"
                />
              </label>
              <div className="flex min-w-0 items-end justify-between gap-3">
                <span className="truncate">{writeStatus}</span>
                <span className="shrink-0">{graphStatus}</span>
              </div>
            </div>

            {feedback ? (
              <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-primary/5 px-4 py-2 text-xs">
                <span>新增 fragment {feedback.fragmentCount}</span>
                <span>collection {feedback.collectionCount}</span>
                <span>edge {feedback.edgeCount}</span>
                <Button type="button" size="xs" variant="outline" onClick={() => onOpenAsset?.(feedback.collectionPath)}>查看生成集合</Button>
                <Button type="button" size="xs" variant="outline" onClick={() => onOpenKnowledgeTab?.("collections")}>知识库列表</Button>
                <Button type="button" size="xs" variant="outline" onClick={() => onOpenKnowledgeTab?.("graph")}>局部图谱</Button>
              </div>
            ) : null}

            <div className="grid min-h-0 grid-cols-[290px_minmax(0,1fr)] overflow-hidden">
              <div className="min-h-0 overflow-auto border-r border-border/70 p-3">
                <div className="space-y-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "w-full cursor-pointer rounded-[var(--ui-radius-item)] border px-3 py-2 text-left transition-colors",
                        item.id === selectedItemId ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/70 hover:bg-muted/50",
                      )}
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-sm font-medium text-foreground">{item.fields.title}</div>
                        <Badge variant={statusBadgeVariant(item.status)}>{STATUS_LABELS[item.status]}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.problemId || "未填写题号"} · {item.submitTime?.slice(11, 16) ?? "未设时间"}</div>
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">将生成：{item.output.fragment ? "fragment" : "无"}{item.output.article ? " + article" : ""}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 overflow-auto p-3">
                <Card className="min-h-0 overflow-hidden">
                  <CardHeader className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{selectedItem?.fields.title ?? "No item selected"}</div>
                      <div className="text-xs text-muted-foreground">{selectedItem?.problemId ?? "-"} · {selectedItem?.problemTitle ?? "-"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedItem ? <Badge variant={statusBadgeVariant(selectedItem.status)}>{selectedItem.status}</Badge> : null}
                      <Button type="button" size="xs" variant="outline" onClick={() => updateSelectedItem(markTrainingItemReady)}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        ready
                      </Button>
                      <Button type="button" size="xs" variant="subtle" onClick={() => updateSelectedItem(skipTrainingItem)}>
                        <SkipForward className="h-3.5 w-3.5" />
                        skip
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 px-4 pb-4">
                    {selectedItem ? (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1 text-xs text-muted-foreground">
                            Title
                            <Input
                              value={selectedItem.fields.title}
                              onChange={(event) => handleFieldChange("title", event.target.value)}
                            />
                          </label>
                          <label className="grid gap-1 text-xs text-muted-foreground">
                            Topics
                            <Input
                              value={selectedItem.fields.topics.join(", ")}
                              onChange={(event) => handleFieldChange("topics", splitListInput(event.target.value))}
                              placeholder="FFT, 单位根"
                            />
                          </label>
                        </div>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                          一句话题意
                          <Textarea value={selectedItem.fields.oneLineProblem} onChange={(event) => handleFieldChange("oneLineProblem", event.target.value)} />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                          核心考点
                          <Textarea value={selectedItem.fields.coreIdea} onChange={(event) => handleFieldChange("coreIdea", event.target.value)} />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                          坑点 / 错因
                          <Textarea value={selectedItem.fields.pitfalls} onChange={(event) => handleFieldChange("pitfalls", event.target.value)} />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                          复习提示
                          <Textarea value={selectedItem.fields.reviewHint} onChange={(event) => handleFieldChange("reviewHint", event.target.value)} />
                        </label>
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          <Label className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedItem.output.fragment}
                              onChange={(event) => updateSelectedItem((item) => markTrainingItemReady(toggleTrainingItemOutput(item, "fragment", event.currentTarget.checked)))}
                            />
                            输出 fragment
                          </Label>
                          <Label className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedItem.output.article}
                              onChange={(event) => updateSelectedItem((item) => markTrainingItemReady(toggleTrainingItemOutput(item, "article", event.currentTarget.checked)))}
                            />
                            输出 article
                          </Label>
                          <span className="text-muted-foreground">article 仍等待 P2-A/P3 写入接口。</span>
                        </div>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>

        <aside className={cn("min-h-0 overflow-auto border-l border-border/70 bg-muted/10 p-3", !isInspectorOpen && "overflow-hidden px-2")}>
          <div className="flex items-center justify-between">
            {isInspectorOpen ? <div className="text-sm font-semibold text-foreground">Inspector</div> : null}
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => setIsInspectorOpen((open) => !open)} aria-label="切换 Inspector">
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isInspectorOpen && "rotate-180")} />
            </Button>
          </div>
          {isInspectorOpen ? (
            <div className="mt-3 space-y-3 text-xs text-muted-foreground">
              <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
                <div className="text-foreground">原始信息</div>
                <div className="mt-1">当前条目：{selectedItem?.id ?? "none"}</div>
                <div>提交：{selectedItem?.submitTime ?? "fixture / 等待扫描 API"}</div>
                <div>状态：{selectedItem?.status ?? "-"}</div>
              </div>
              <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
                <div className="text-foreground">Frontmatter preview</div>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                  {serializeFrontmatterPreview(selectedFragmentPlan?.markdown ?? previewPlan.collection.markdown)}
                </pre>
              </div>
              <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
                <div className="text-foreground">图谱更新预览</div>
                <div className="mt-2 text-[11px]">
                  将写入 {writePlan.fragments.length} 个 fragment，写入后调用 rebuildKnowledgeGraph。
                </div>
                {lastWrittenMarkdown ? (
                  <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                    {lastWrittenMarkdown}
                  </pre>
                ) : null}
              </div>
              <div className="rounded-[var(--ui-radius-panel)] border border-dashed border-border/60 bg-background/50 p-3">
                <div className="flex items-center gap-2 text-foreground">
                  <Brain className="h-4 w-4 text-muted-foreground" />
                  Future AI slot
                </div>
                <div className="mt-1">P2-B 不调用 AI；这里仅保留未来 field-level patch 位置。</div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
