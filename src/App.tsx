import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import MarkdownPreview from "@/components/editor/MarkdownPreview";
import FileTree from "@/components/file-tree/FileTree";
import { listNotes, readNote, writeNote, deleteNote, renameNote, openBlog } from "@/lib/api";
import type { NoteFileInfo } from "@/types/note";

// 欢迎内容：未选中文件时在编辑器和预览里显示
const INITIAL_MARKDOWN = `# OI Notebook 欢迎使用

## 这是什么？

**OI Notebook** 是一个专为竞赛选手设计的本地笔记工具。你可以在左侧编辑 *Markdown*，右侧实时预览渲染结果。支持 \`LaTeX\` 数学公式和代码语法高亮。

## 功能一览

- 支持 **GitHub Flavored Markdown**（表格、任务列表、删除线）
- 支持 $\\LaTeX$ 行内公式和块级公式
- 代码块语法高亮（由 Shiki 驱动）
- 深色主题，护眼适合长时间刷题

## 快速幂模板

下面是一段常用的快速幂代码（$O(\\log n)$ 时间复杂度）：

\`\`\`cpp
// 快速幂：计算 base^exp % mod
long long qpow(long long base, long long exp, long long mod) {
    long long result = 1;
    base %= mod;
    while (exp > 0) {
        if (exp & 1) result = result * base % mod;
        base = base * base % mod;
        exp >>= 1;
    }
    return result;
}
\`\`\`

## 数学公式

费马小定理：若 $p$ 是质数且 $\\gcd(a, p) = 1$，则

$$
a^{p-1} \\equiv 1 \\pmod{p}
$$

因此 $a$ 在模 $p$ 意义下的逆元为 $a^{p-2} \\bmod p$，可用快速幂 $O(\\log p)$ 求出。

## 常用复杂度速查

| 算法 | 时间复杂度 |
|------|-----------|
| 快速排序（平均） | $O(n \\log n)$ |
| 线段树单点修改 | $O(\\log n)$ |
| Dijkstra（堆优化） | $O((V + E) \\log V)$ |

## 学习建议

1. 先把基础数据结构（线段树、树状数组）打扎实
2. 图论专题：最短路、最小生成树、强连通分量
3. 动态规划：背包、区间 DP、树形 DP
4. 数学：快速幂、逆元、组合数、莫比乌斯反演

> 刷题不在多，在精。每道题都要弄懂为什么对、为什么错，而不是只追 AC 数量。
`;

export default function App() {
  const [files, setFiles] = useState<NoteFileInfo[]>([]);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  // null 时显示欢迎内容，选中文件后显示文件实际内容
  const [markdown, setMarkdown] = useState(INITIAL_MARKDOWN);
  // undefined 表示未发生过滚动（初次挂载跳过预览同步）
  const [scrollRatio, setScrollRatio] = useState<number | undefined>(undefined);
  const [isDirty, setIsDirty] = useState(false);
  const [dialogMode, setDialogMode] = useState<null | "create" | "rename">(null);
  const [dialogValue, setDialogValue] = useState("");
  const [newNoteDirectory, setNewNoteDirectory] = useState<"tricks" | "problems">("tricks");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);

  function validateFilename(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return "文件名不能为空";
    // TODO(后续 Phase): 支持跨目录重命名（拖拽或对话框选目标目录）
    if (trimmed.includes("/") || trimmed.includes("\\")) return "文件名不能包含路径分隔符";
    if (trimmed.includes("..")) return "文件名不能包含 ..";
    if (trimmed.toLowerCase().endsWith(".md")) return "不需要输入 .md 后缀";
    return null;
  }

  const openCreateDialog = () => {
    setDialogMode("create");
    setDialogValue("");
    setNewNoteDirectory("tricks");
  };

  const openRenameDialog = (path: string) => {
    // 提取纯文件名（不含目录前缀），如 "inbox/quick-xxx.md" → "quick-xxx"
    const filename = path.split("/").pop() ?? path;
    const baseName = filename.replace(/\.md$/i, "");
    setDialogMode("rename");
    setDialogValue(baseName);
    setRenameTarget(path);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setDialogValue("");
    setNewNoteDirectory("tricks");
    setRenameTarget(null);
  };

  const handleCreate = async () => {
    const err = validateFilename(dialogValue);
    if (err) { toast.error(err); return; }
    const newPath = `${newNoteDirectory}/${dialogValue.trim()}.md`;
    if (files.some((f) => f.path === newPath)) { toast.error("文件名已存在"); return; }
    // dirty 检查必须在创建文件之前——避免用户取消后留下孤儿文件
    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，新建会切换走，未保存的改动将丢失。确定吗？");
      if (!ok) return;
    }
    try {
      await writeNote(newPath, "");
      const updated = await listNotes();
      setFiles(updated);
      closeDialog();
      setCurrentFilePath(newPath);
      toast.success("已创建");
    } catch (e) {
      toast.error(`创建失败: ${e}`);
    }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    const err = validateFilename(dialogValue);
    if (err) { toast.error(err); return; }
    // 保留原目录前缀，如 "inbox/quick-xxx.md" → "inbox/new-name.md"
    const lastSlashIdx = renameTarget.lastIndexOf("/");
    const dirPrefix = lastSlashIdx === -1 ? "" : renameTarget.slice(0, lastSlashIdx + 1);
    const newPath = `${dirPrefix}${dialogValue.trim()}.md`;
    if (newPath === renameTarget) { closeDialog(); return; }
    if (files.some((f) => f.path === newPath)) { toast.error("文件名已存在"); return; }
    if (renameTarget === currentFilePath && isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，重命名前请先保存。确定继续吗？未保存的改动将丢失。");
      if (!ok) return;
    }
    try {
      await renameNote(renameTarget, newPath);
      const updated = await listNotes();
      setFiles(updated);
      if (renameTarget === currentFilePath) {
        setCurrentFilePath(newPath);
        setIsDirty(false);
      }
      closeDialog();
      toast.success("已重命名");
    } catch (e) {
      toast.error(`重命名失败: ${e}`);
    }
  };

  const handleDelete = async (path: string) => {
    const ok = window.confirm(`确定删除"${path}"吗？此操作不可撤销。`);
    if (!ok) return;
    try {
      await deleteNote(path);
      const updated = await listNotes();
      setFiles(updated);
      if (path === currentFilePath) {
        setCurrentFilePath(null);
        setIsDirty(false);
      }
      toast.success("已删除");
    } catch (e) {
      toast.error(`删除失败: ${e}`);
    }
  };

  const handleDialogConfirm = () => {
    if (dialogMode === "create") handleCreate();
    else if (dialogMode === "rename") handleRename();
  };

  const handleOpenBlog = async () => {
    try {
      await openBlog();
    } catch (e) {
      toast.error(`打开博客失败: ${e}`);
    }
  };

  const handleEditorChange = (value: string) => {
    setMarkdown(value);
    setIsDirty(true);
  };

  const handleSelectFile = (path: string) => {
    if (isDirty) {
      const ok = window.confirm("当前笔记有未保存的改动，切换将会丢失。确定切换吗？");
      if (!ok) return;
    }
    setCurrentFilePath(path);
  };

  // Ctrl+S / Cmd+S 保存当前笔记
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.key === "s")) return;
      e.preventDefault();
      if (currentFilePath === null) {
        toast.info("请先打开一个笔记后再保存");
        return;
      }
      try {
        const warning = await writeNote(currentFilePath, markdown);
        if (warning) {
          toast.warning(`已保存（${warning}）`);
        } else {
          toast.success("已保存");
        }
        setIsDirty(false);
      } catch (err) {
        toast.error(`保存失败: ${err}`);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentFilePath, markdown]);

  // 挂载时从后端加载笔记列表
  useEffect(() => {
    listNotes()
      .then(setFiles)
      .catch((e: Error) => console.error("加载笔记列表失败：", e.message));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen("notes-changed", () => {
      listNotes()
        .then((updated) => {
          if (!cancelled) setFiles(updated);
        })
        .catch((e: Error) =>
          console.error("收到 notes-changed 后刷新列表失败：", e.message),
        );
    })
      .then((fn) => {
        if (cancelled) {
          // 组件已卸载，立即取消订阅
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e: Error) =>
        console.error("注册 notes-changed 监听失败：", e.message),
      );

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // 当选中文件变化时，从后端读取内容
  // 使用 cancelled flag 防御 race condition：
  // 快速连续点击不同文件时，后到的响应可能比先到的早 resolve，
  // cancelled 确保只有最新一次 readNote 的结果会被 setMarkdown 采用。
  useEffect(() => {
    if (currentFilePath === null) {
      // 无选中文件时恢复欢迎内容
      setMarkdown(INITIAL_MARKDOWN);
      setIsDirty(false);
      return;
    }

    let cancelled = false;

    readNote(currentFilePath)
      .then((content) => {
        if (!cancelled) {
          setMarkdown(content);
          setIsDirty(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) console.error("读取笔记失败：", e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [currentFilePath]);

  return (
    <>
    <Toaster />
    <Dialog open={dialogMode !== null} onOpenChange={(open) => !open && closeDialog()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {dialogMode === "create" ? "新建笔记" : "重命名笔记"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          {dialogMode === "create" && (
            <div className="grid gap-2">
              <Label>保存位置</Label>
              <div className="grid gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteDirectory === "tricks"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-directory"
                    value="tricks"
                    checked={newNoteDirectory === "tricks"}
                    onChange={() => setNewNoteDirectory("tricks")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">tricks/</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      技巧笔记：算法 trick、模板、结论整理
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/40 ${
                    newNoteDirectory === "problems"
                      ? "border-ring bg-accent/50"
                      : "border-border bg-background"
                  }`}
                >
                  <input
                    type="radio"
                    name="note-directory"
                    value="problems"
                    checked={newNoteDirectory === "problems"}
                    onChange={() => setNewNoteDirectory("problems")}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <span className="grid gap-1">
                    <span className="font-medium text-foreground">problems/</span>
                    <span className="text-xs leading-5 text-muted-foreground">
                      题解笔记：题目分析、解法记录
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="filename">文件名</Label>
            <Input
              id="filename"
              value={dialogValue}
              onChange={(e) => setDialogValue(e.target.value)}
              placeholder="不需要输入 .md"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleDialogConfirm();
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {dialogMode === "rename" && renameTarget && renameTarget.includes("/")
                ? `当前位于 ${renameTarget.slice(0, renameTarget.lastIndexOf("/"))}/，目录会保留`
                : "系统会自动加上 .md 后缀"}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>取消</Button>
          <Button onClick={handleDialogConfirm}>
            {dialogMode === "create" ? "创建" : "重命名"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-semibold tracking-wide">OI Notebook</span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {currentFilePath && (
            <>
              <span>{currentFilePath}</span>
              {isDirty && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-foreground"
                  aria-label="有未保存的改动"
                  title="有未保存的改动"
                />
              )}
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={handleOpenBlog}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            打开博客
          </Button>
        </div>
      </header>

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: File tree (fixed 240px) */}
        <aside className="flex w-60 shrink-0 flex-col overflow-hidden">
          <div className="flex h-8 shrink-0 items-center justify-between px-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              笔记列表
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={openCreateDialog}
              title="新建笔记"
              aria-label="新建笔记"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <FileTree
              files={files}
              activeFilePath={currentFilePath}
              onSelectFile={handleSelectFile}
              onDeleteFile={handleDelete}
              onRenameFile={openRenameDialog}
            />
          </div>
        </aside>

        <Separator orientation="vertical" />

        {/* Center: Markdown editor */}
        <main className="flex flex-1 overflow-hidden">
          <MarkdownEditor
            value={markdown}
            onChange={handleEditorChange}
            onScroll={(r) => setScrollRatio(r)}
            className="h-full w-full"
          />
        </main>

        <Separator orientation="vertical" />

        {/* Right: Live preview */}
        <aside className="flex flex-1 overflow-hidden">
          <MarkdownPreview
            markdown={markdown}
            scrollRatio={scrollRatio}
            className="h-full w-full"
          />
        </aside>
      </div>
    </div>
    </>
  );
}
