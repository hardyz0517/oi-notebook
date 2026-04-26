import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import MarkdownPreview from "@/components/editor/MarkdownPreview";
import FileTree from "@/components/file-tree/FileTree";
import { listNotes, readNote, writeNote } from "@/lib/api";
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
        await writeNote(currentFilePath, markdown);
        toast.success("已保存");
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
        </div>
      </header>

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: File tree (fixed 240px) */}
        <aside className="flex w-60 shrink-0 flex-col overflow-hidden">
          <div className="flex h-8 shrink-0 items-center px-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              笔记列表
            </span>
          </div>
          <FileTree
            files={files}
            activeFilePath={currentFilePath}
            onSelectFile={handleSelectFile}
          />
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
