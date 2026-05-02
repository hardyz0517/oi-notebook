import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeShiki from "@shikijs/rehype";
import rehypeStringify from "rehype-stringify";

// unified 处理器在模块加载时构建一次，后续所有调用复用同一个实例。
// .freeze() 锁定配置，同时允许 Shiki 在内部缓存已加载的语言/主题文件，
// 这样第二次以后的渲染不会重复进行 IO。
const processor = unified()
  // 第 1 步：将 Markdown 文本解析为 MDAST（Markdown Abstract Syntax Tree）。
  // MDAST 是一棵描述文档结构的 JSON 树，例如 heading、paragraph、code 等节点。
  .use(remarkParse)

  // 第 2 步：扩展 GFM（GitHub Flavored Markdown）语法。
  // 增加对表格、任务列表 (- [x])、删除线 (~~text~~)、自动链接的支持。
  .use(remarkGfm)

  // 第 3 步：识别数学公式语法，将 $...$ 和 $$...$$ 标记为 math 节点。
  // 此步只做标记，实际渲染由第 5 步的 rehype-katex 完成。
  .use(remarkMath)

  // 第 4 步：将 MDAST 转换为 HAST（Hypertext Abstract Syntax Tree）。
  // HAST 描述的是 HTML 结构，是 rehype 生态的标准中间格式。
  // allowDangerousHtml: true 让 Markdown 里的原生 HTML 标签不被丢弃，
  // 而是作为 raw 节点穿透到后续步骤（最终由 rehype-stringify 原样输出）。
  .use(remarkRehype, { allowDangerousHtml: true })

  // 第 5 步：将第 3 步产生的 math 节点渲染为 KaTeX 生成的 HTML。
  // 行内公式变为 <span class="katex">...</span>，
  // 块级公式变为 <div class="katex-display">...</div>。
  .use(rehypeKatex)

  // 第 6 步：对 HAST 中的 <code> 代码块节点进行语法高亮。
  // Shiki 首次运行时会异步加载对应语言的 TextMate 语法文件，之后缓存。
  // 输出的高亮结果以内联 style 或 CSS 变量的形式写入 span 标签。
  .use(rehypeShiki, { theme: "one-dark-pro" })

  // 第 7 步：将 HAST 序列化为最终的 HTML 字符串。
  // allowDangerousHtml: true 确保第 4 步穿透的原生 HTML raw 节点
  // 被原样写出，而不是被 HTML 实体转义。
  .use(rehypeStringify, { allowDangerousHtml: true })

  .freeze();

/**
 * 将 Markdown 字符串渲染为 HTML 字符串。
 *
 * 内部使用 unified 管线（remark → rehype），支持：
 * - GitHub Flavored Markdown（表格、任务列表等）
 * - LaTeX 数学公式（KaTeX 渲染）
 * - 代码块语法高亮（Shiki，主题：one-dark-pro）
 * - Markdown 内嵌的原生 HTML 穿透输出
 *
 * @param md - 输入的 Markdown 原始字符串
 * @returns 渲染后的 HTML 字符串，可直接用于 dangerouslySetInnerHTML
 */
export async function renderMarkdown(md: string): Promise<string> {
  const result = await processor.process(stripFrontmatter(md));
  // VFile 实现了 toString()，直接返回序列化后的 HTML 内容
  return String(result);
}

function stripFrontmatter(markdown: string): string {
  const openerLength = markdown.startsWith("---\r\n") ? 5 : markdown.startsWith("---\n") ? 4 : -1;

  if (openerLength === -1) {
    return markdown;
  }

  let cursor = openerLength;

  while (cursor < markdown.length) {
    const lineEnd = markdown.indexOf("\n", cursor);
    let lineContentEnd = lineEnd === -1 ? markdown.length : lineEnd;

    if (lineContentEnd > cursor && markdown[lineContentEnd - 1] === "\r") {
      lineContentEnd -= 1;
    }

    if (markdown.slice(cursor, lineContentEnd) === "---") {
      return markdown.slice(lineEnd === -1 ? markdown.length : lineEnd + 1);
    }

    if (lineEnd === -1) {
      break;
    }

    cursor = lineEnd + 1;
  }

  return markdown;
}
