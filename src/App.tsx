import { Separator } from "@/components/ui/separator";

function App() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-10 shrink-0 items-center border-b border-border px-4">
        <span className="text-sm font-semibold tracking-wide">OI Notebook</span>
      </header>

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: File tree (fixed 240px) */}
        <aside className="flex w-60 shrink-0 flex-col gap-2 p-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            文件树
          </span>
          <span className="text-xs text-muted-foreground">（Coming soon）</span>
        </aside>

        <Separator orientation="vertical" />

        {/* Center: Editor */}
        <main className="flex flex-1 flex-col gap-2 p-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            编辑器
          </span>
          <span className="text-xs text-muted-foreground">（Coming soon）</span>
        </main>

        <Separator orientation="vertical" />

        {/* Right: Preview */}
        <aside className="flex flex-1 flex-col gap-2 p-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            预览
          </span>
          <span className="text-xs text-muted-foreground">（Coming soon）</span>
        </aside>
      </div>
    </div>
  );
}

export default App;
