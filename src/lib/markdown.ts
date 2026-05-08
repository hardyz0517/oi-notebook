import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeShiki from "@shikijs/rehype";
import rehypeStringify from "rehype-stringify";
import { remarkLuoguCallouts } from "./markdownCallouts";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkLuoguCallouts)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeKatex)
  .use(rehypeShiki, { theme: "one-dark-pro" })
  .use(rehypeStringify, { allowDangerousHtml: true })
  .freeze();

export async function renderMarkdown(md: string): Promise<string> {
  const result = await processor.process(stripFrontmatter(md));
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
