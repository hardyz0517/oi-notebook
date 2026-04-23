import { useState } from "react";
import { Separator } from "@/components/ui/separator";
import MarkdownEditor from "@/components/editor/MarkdownEditor";
import MarkdownPreview from "@/components/editor/MarkdownPreview";

// 示例 Markdown 放在组件外，避免每次渲染都重新创建字符串常量
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
  const [markdown, setMarkdown] = useState(INITIAL_MARKDOWN);

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

        {/* Center: Markdown editor */}
        <main className="flex flex-1 overflow-hidden">
          <MarkdownEditor
            value={markdown}
            onChange={setMarkdown}
            className="h-full w-full"
          />
        </main>

        <Separator orientation="vertical" />

        {/* Right: Live preview */}
        <aside className="flex flex-1 overflow-hidden">
          <MarkdownPreview
            markdown={markdown}
            className="h-full w-full"
          />
        </aside>
      </div>
    </div>
  );
}
