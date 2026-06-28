import { useMemo, useState } from "react";
import { BookOpenText, Brain, ChevronRight, GraduationCap, LibraryBig, Network, SquareLibrary, BookText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KnowledgeView = "overview" | "graph" | "fragments" | "collections" | "articles" | "review" | "mistakes" | "relationships";

const KNOWLEDGE_VIEWS: Array<{ id: KnowledgeView; label: string; icon: typeof LibraryBig }> = [
  { id: "overview", label: "Overview", icon: BookOpenText },
  { id: "graph", label: "Graph", icon: Network },
  { id: "fragments", label: "Fragments", icon: BookText },
  { id: "collections", label: "Collections", icon: SquareLibrary },
  { id: "articles", label: "Articles", icon: GraduationCap },
  { id: "review", label: "Review", icon: Sparkles },
  { id: "mistakes", label: "Mistakes", icon: Brain },
  { id: "relationships", label: "Relationship Suggestions", icon: LibraryBig },
];

const STUB_COUNTS = {
  assets: 12,
  fragments: 7,
  collections: 3,
  articles: 2,
  edges: 18,
};

export function KnowledgeBaseWorkspace() {
  const [activeView, setActiveView] = useState<KnowledgeView>("overview");
  const currentView = useMemo(() => KNOWLEDGE_VIEWS.find((view) => view.id === activeView) ?? KNOWLEDGE_VIEWS[0], [activeView]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <LibraryBig className="h-4 w-4 text-muted-foreground" />
            Knowledge Base
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">Shell only for P4, with local stub data and no Rust/API write path.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{currentView.label}</Badge>
          <Button type="button" size="compact" variant="outline">
            Rebuild graph
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
        <aside className="border-r border-border/70 bg-muted/10 p-3">
          <div className="space-y-2">
            {KNOWLEDGE_VIEWS.map((view) => {
              const Icon = view.icon;
              const selected = view.id === activeView;
              return (
                <button
                  key={view.id}
                  type="button"
                  className={cn(
                    "grid w-full gap-1 rounded-[var(--ui-radius-item)] border px-3 py-2 text-left transition-colors",
                    selected ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/60 bg-background/70 text-foreground/90 hover:bg-muted/50",
                  )}
                  onClick={() => setActiveView(view.id)}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{view.label}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">View shell</div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-[var(--ui-radius-panel)] border border-dashed border-border/70 bg-background/60 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <ChevronRight className="h-4 w-4" />
              Quick stats
            </div>
            <div className="mt-2 space-y-1">
              <div>Assets: {STUB_COUNTS.assets}</div>
              <div>Edges: {STUB_COUNTS.edges}</div>
            </div>
          </div>
        </aside>

        <main className="min-h-0 overflow-hidden p-3">
          <Card className="h-full overflow-hidden">
            <CardHeader>
              <div>
                <div className="text-sm font-semibold text-foreground">{currentView.label}</div>
                <div className="text-xs text-muted-foreground">Overview, graph, lists, review, and relationship shells all live here.</div>
              </div>
            </CardHeader>
            <CardContent className="grid min-h-0 gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
                  <div className="text-xs text-muted-foreground">Assets</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{STUB_COUNTS.assets}</div>
                </div>
                <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
                  <div className="text-xs text-muted-foreground">Fragments</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{STUB_COUNTS.fragments}</div>
                </div>
                <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
                  <div className="text-xs text-muted-foreground">Collections</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{STUB_COUNTS.collections}</div>
                </div>
                <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-3">
                  <div className="text-xs text-muted-foreground">Articles</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">{STUB_COUNTS.articles}</div>
                </div>
              </div>

              <div className="grid min-h-0 gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-foreground">Overview / List / Graph shell</div>
                    <Badge variant="info">Local data only</Badge>
                  </div>
                  <div className="mt-3 grid min-h-40 place-items-center rounded-[var(--ui-radius-panel)] border border-dashed border-border/60 bg-muted/20 text-sm text-muted-foreground">
                    {currentView.id === "graph" ? "Graph canvas placeholder" : "Knowledge content placeholder"}
                  </div>
                </div>
                <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/70 p-4">
                  <div className="text-sm font-medium text-foreground">Review shell</div>
                  <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                    <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/60 p-3">Recent fragments list placeholder</div>
                    <div className="rounded-[var(--ui-radius-panel)] border border-border/60 bg-background/60 p-3">Mistake and relationship sections are reserved for later phases</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </section>
  );
}
