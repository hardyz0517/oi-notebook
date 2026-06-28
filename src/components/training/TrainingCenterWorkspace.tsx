import { useMemo, useState } from "react";
import { Brain, ChevronRight, Dumbbell, GraduationCap, LibraryBig, Network, BookOpenText, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TrainingMode = "today" | "range" | "single" | "problemset" | "contest";

interface TrainingItemStub {
  id: string;
  title: string;
  problemId: string;
  status: "pending" | "confirmed" | "skipped";
  difficulty: string;
  topics: string[];
}

const MODE_OPTIONS: Array<{ id: TrainingMode; label: string; description: string; reserved?: boolean; icon: typeof Dumbbell }> = [
  { id: "today", label: "Today", description: "扫今天的训练沉淀", icon: Dumbbell },
  { id: "range", label: "Range", description: "按日期/题量批处理", icon: GraduationCap },
  { id: "single", label: "Single Problem", description: "围绕单题快速成批", icon: FileText },
  { id: "problemset", label: "Problem Set", description: "后续开放题单入口", reserved: true, icon: LibraryBig },
  { id: "contest", label: "Contest", description: "后续开放比赛入口", reserved: true, icon: Network },
];

const STUB_ITEMS: TrainingItemStub[] = [
  { id: "train-1", title: "P3803 FFT 复习点", problemId: "P3803", status: "confirmed", difficulty: "省选", topics: ["FFT", "模板"] },
  { id: "train-2", title: "P1000 题意提炼", problemId: "P1000", status: "pending", difficulty: "入门", topics: ["题意", "审题"] },
  { id: "train-3", title: "P2345 反思卡片", problemId: "P2345", status: "skipped", difficulty: "提高", topics: ["贪心"] },
];

export interface TrainingCenterWorkspaceProps {
  currentNoteTitle?: string | null;
}

export function TrainingCenterWorkspace({ currentNoteTitle }: TrainingCenterWorkspaceProps) {
  const [activeMode, setActiveMode] = useState<TrainingMode>("today");
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState(STUB_ITEMS[0]?.id ?? null);
  const selectedItem = useMemo(
    () => STUB_ITEMS.find((item) => item.id === selectedItemId) ?? STUB_ITEMS[0] ?? null,
    [selectedItemId],
  );
  const selectedMode = MODE_OPTIONS.find((mode) => mode.id === activeMode) ?? MODE_OPTIONS[0];

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
                  onClick={() => setActiveMode(mode.id)}
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
                <span className="truncate">Batch 2026-06-28</span>
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
              <div className="text-sm font-semibold text-foreground">Batch shell</div>
              <div className="truncate text-xs text-muted-foreground">3 items · 1 confirmed · 1 pending · 1 skipped</div>
            </div>
            <Badge variant="info">Local stub data</Badge>
          </div>

          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
            <div className="border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">
              Selected mode: <span className="text-foreground">{selectedMode.label}</span>
            </div>
            <div className="grid min-h-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
              <div className="border-r border-border/70 p-3">
                <div className="space-y-2">
                  {STUB_ITEMS.map((item) => (
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
                        <div className="min-w-0 truncate text-sm font-medium text-foreground">{item.title}</div>
                        <Badge variant="secondary">{item.status}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{item.problemId} · {item.difficulty}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-3">
                <Card className="min-h-0 overflow-hidden">
                  <CardHeader className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">{selectedItem?.title ?? "No item selected"}</div>
                      <div className="text-xs text-muted-foreground">{selectedItem?.problemId ?? "—"} · {selectedItem?.difficulty ?? "—"}</div>
                    </div>
                    <Button type="button" variant="outline" size="compact">
                      Write
                    </Button>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <div className="grid gap-2">
                      <label className="grid gap-1 text-xs text-muted-foreground">
                        Title
                        <Input value={selectedItem?.title ?? ""} readOnly />
                      </label>
                      <label className="grid gap-1 text-xs text-muted-foreground">
                        Core idea
                        <textarea className="min-h-24 rounded-[var(--ui-radius-control)] border border-[var(--ui-border-control)] bg-background/55 p-2 text-xs outline-none" readOnly value="This is a shell. The draft editor lands in the next phase." />
                      </label>
                    </div>
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
              <div>Inspector keeps room for future AI patch targets.</div>
            </div>
            <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
              <div className="text-foreground">Frontmatter preview</div>
              <pre className="mt-2 overflow-auto text-[11px] leading-5 text-muted-foreground">
{`type: fragment
kind: problem-note
title: ${selectedItem?.title ?? ""}
status: draft`}
              </pre>
            </div>
            <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
              <div className="text-foreground">Graph preview</div>
              <div className="mt-2 text-[11px]">Local placeholder edges only, no Rust graph calls yet.</div>
            </div>
            <div className="rounded-[var(--ui-radius-panel)] border border-dashed border-border/60 bg-background/50 p-3">
              <div className="flex items-center gap-2 text-foreground">
                <Brain className="h-4 w-4 text-muted-foreground" />
                Future AI slot
              </div>
              <div className="mt-1">Disabled in P4.</div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
