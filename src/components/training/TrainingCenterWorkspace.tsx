import { useMemo, useState } from "react";
import { Brain, ChevronRight, Dumbbell, FileText, GraduationCap, LibraryBig, Network, BookOpenText } from "lucide-react";
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
import type { TrainingBatchDraft, TrainingItemDraft, TrainingSourceType } from "@/lib/knowledge/knowledgeTypes";

type TrainingMode = "today" | "range" | "single" | "problemset" | "contest";

const DEFAULT_BATCH_ID = "batch:2026-06-28";

const MODE_OPTIONS: Array<{
  id: TrainingMode;
  sourceType: TrainingSourceType;
  label: string;
  description: string;
  reserved?: boolean;
  icon: typeof Dumbbell;
}> = [
  { id: "today", sourceType: "luogu-today", label: "Today", description: "扫今天的训练沉淀", icon: Dumbbell },
  { id: "range", sourceType: "luogu-range", label: "Range", description: "按日期/题量批处理", icon: GraduationCap },
  { id: "single", sourceType: "luogu-single", label: "Single Problem", description: "围绕单题快速成批", icon: FileText },
  { id: "problemset", sourceType: "luogu-problemset-future", label: "Problem Set", description: "后续开放题单入口", reserved: true, icon: LibraryBig },
  { id: "contest", sourceType: "luogu-contest-future", label: "Contest", description: "后续开放比赛入口", reserved: true, icon: Network },
];

export interface TrainingCenterWorkspaceProps {
  currentNoteTitle?: string | null;
}

function createInitialBatch(): TrainingBatchDraft {
  return createTrainingBatchDraft({
    id: DEFAULT_BATCH_ID,
    title: "2026-06-28 训练沉淀",
    sourceType: "luogu-today",
    sourceLabel: "今日训练",
    createdAt: "2026-06-28T00:00:00.000Z",
    itemIds: ["item:P3803", "item:P3383", "item:blank"],
  });
}

function createInitialItems(batchId: string): TrainingItemDraft[] {
  return [
    createProblemTrainingItemDraft({
      id: "item:P3803",
      batchId,
      problemId: "P3803",
      problemTitle: "多项式乘法",
    }),
    createProblemTrainingItemDraft({
      id: "item:P3383",
      batchId,
      problemId: "P3383",
      problemTitle: "最近公共祖先",
    }),
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

export function TrainingCenterWorkspace({ currentNoteTitle }: TrainingCenterWorkspaceProps) {
  const [activeMode, setActiveMode] = useState<TrainingMode>("today");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [batch, setBatch] = useState<TrainingBatchDraft>(() => createInitialBatch());
  const [items, setItems] = useState<TrainingItemDraft[]>(() => createInitialItems(DEFAULT_BATCH_ID));
  const [selectedItemId, setSelectedItemId] = useState("item:P3803");
  const [writeStatus, setWriteStatus] = useState("尚未写入");
  const [graphStatus, setGraphStatus] = useState("未刷新");
  const [lastWrittenMarkdown, setLastWrittenMarkdown] = useState("");

  const selectedMode = MODE_OPTIONS.find((mode) => mode.id === activeMode) ?? MODE_OPTIONS[0];
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? items[0] ?? null,
    [items, selectedItemId],
  );
  const writePlan = useMemo(() => buildTrainingBatchWritePlan(batch, items), [batch, items]);
  const selectedFragmentPlan = selectedItem
    ? writePlan.fragments.find((fragment) => fragment.itemId === selectedItem.id)
    : null;

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
    updateSelectedItem((item) => ({
      ...item,
      fields: {
        ...item.fields,
        [field]: value,
      },
    }));
  };

  const handleWrite = async () => {
    setWriteStatus("写入中...");
    let written = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const collectionResult = await writeKnowledgeAsset(writePlan.collection.relativePath, writePlan.collection.markdown, true);
      setLastWrittenMarkdown(writePlan.collection.markdown);
      if (collectionResult.skipped) skipped += 1;
      else if (collectionResult.written) written += 1;
      else failed += 1;

      for (const fragment of writePlan.fragments) {
        const result = await writeKnowledgeAsset(fragment.relativePath, fragment.markdown, true);
        setLastWrittenMarkdown(fragment.markdown);
        if (result.skipped) skipped += 1;
        else if (result.written) written += 1;
        else failed += 1;
      }

      const graph = await rebuildKnowledgeGraph();
      setGraphStatus(`已刷新图谱：${graph.nodes.length} nodes / ${graph.edges.length} edges`);
      setWriteStatus(`已完成：写入 ${written}，跳过 ${skipped}，失败 ${failed}`);
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
            {currentNoteTitle ? `回到 editor 时会保留当前笔记：${currentNoteTitle}` : "回到 editor 时会保留当前打开笔记"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{selectedMode.label}</Badge>
          <Button type="button" size="compact" variant="outline">
            Scan
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_320px] gap-0 overflow-hidden">
        <aside className="border-r border-border/70 bg-muted/10 p-3">
          <div className="space-y-2">
            {MODE_OPTIONS.map((mode) => {
              const Icon = mode.icon;
              const selected = mode.id === activeMode;
              return (
                <button
                  key={mode.id}
                  type="button"
                  className={cn(
                    "grid w-full gap-1 rounded-[var(--ui-radius-item)] border px-3 py-2 text-left transition-colors",
                    selected ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/60 bg-background/70 text-foreground/90 hover:bg-muted/50",
                    mode.reserved && "opacity-80",
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

          <div className="mt-4 rounded-[var(--ui-radius-panel)] border border-dashed border-border/70 bg-background/60 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <BookOpenText className="h-4 w-4 text-muted-foreground" />
              Recent batches
            </div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{batch.title}</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">Batch 2026-06-27</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </aside>

        <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">{batch.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {items.length} items · {writePlan.fragments.length} writable · {writePlan.skippedItems.length} skipped
              </div>
            </div>
            <Button type="button" size="compact" onClick={() => void handleWrite()}>
              写入并刷新图谱
            </Button>
          </div>

          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
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
            <div className="grid min-h-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
              <div className="border-r border-border/70 p-3">
                <div className="space-y-2">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "w-full rounded-[var(--ui-radius-item)] border px-3 py-2 text-left transition-colors",
                        item.id === selectedItemId ? "border-primary/40 bg-primary/10" : "border-border/60 bg-background/70 hover:bg-muted/50",
                      )}
                      onClick={() => setSelectedItemId(item.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-sm font-medium text-foreground">{item.fields.title}</div>
                        <Badge variant="secondary">{item.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.problemId || "未填写题号"} · {item.difficulty ?? "未设难度"}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 overflow-auto p-3">
                <Card className="min-h-0 overflow-hidden">
                  <CardHeader className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{selectedItem?.fields.title ?? "No item selected"}</div>
                      <div className="text-xs text-muted-foreground">{selectedItem?.problemId ?? "-"} · {selectedItem?.problemTitle ?? "-"}</div>
                    </div>
                    <Badge variant="info">{selectedFragmentPlan ? "fragment ready" : "not writable"}</Badge>
                  </CardHeader>
                  <CardContent className="grid gap-3">
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
                            />
                          </label>
                        </div>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                          One-line problem
                          <Textarea
                            value={selectedItem.fields.oneLineProblem}
                            onChange={(event) => handleFieldChange("oneLineProblem", event.target.value)}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                          Core idea
                          <Textarea
                            value={selectedItem.fields.coreIdea}
                            onChange={(event) => handleFieldChange("coreIdea", event.target.value)}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                          Pitfalls
                          <Textarea
                            value={selectedItem.fields.pitfalls}
                            onChange={(event) => handleFieldChange("pitfalls", event.target.value)}
                          />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground">
                          Review hint
                          <Textarea
                            value={selectedItem.fields.reviewHint}
                            onChange={(event) => handleFieldChange("reviewHint", event.target.value)}
                          />
                        </label>
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          <Label className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedItem.output.fragment}
                              onChange={(event) => updateSelectedItem((item) => toggleTrainingItemOutput(item, "fragment", event.currentTarget.checked))}
                            />
                            写入 fragment
                          </Label>
                          <Label className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedItem.output.article}
                              onChange={(event) => updateSelectedItem((item) => toggleTrainingItemOutput(item, "article", event.currentTarget.checked))}
                            />
                            写入 article
                          </Label>
                        </div>
                      </>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>

        <aside className={cn("border-l border-border/70 bg-muted/10 p-3 transition-opacity", isInspectorOpen ? "opacity-100" : "opacity-70")}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-foreground">Inspector</div>
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => setIsInspectorOpen((open) => !open)}>
              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isInspectorOpen && "rotate-180")} />
            </Button>
          </div>
          <div className="mt-3 space-y-3 text-xs text-muted-foreground">
            <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
              <div className="text-foreground">Raw info</div>
              <div className="mt-1">Current item: {selectedItem?.id ?? "none"}</div>
              <div>Collection: {writePlan.collection.relativePath}</div>
            </div>
            <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
              <div className="text-foreground">Frontmatter preview</div>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-muted-foreground">
                {serializeFrontmatterPreview(selectedFragmentPlan?.markdown ?? writePlan.collection.markdown)}
              </pre>
            </div>
            <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
              <div className="text-foreground">Graph preview</div>
              <div className="mt-2 text-[11px]">
                {writePlan.fragments.length} fragments will refresh via rebuildKnowledgeGraph after write.
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
              <div className="mt-1">Disabled in Phase 1.</div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
