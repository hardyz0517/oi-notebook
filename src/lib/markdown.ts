import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeShiki from "@shikijs/rehype";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";
import type { BuiltinLanguage, ShikiTransformer } from "shiki";
import { remarkLuoguCallouts } from "./markdownCallouts";
import { rehypeTableMerge } from "../../shared/rehypeTableMerge";
import { markPreviewMarkdownRender, markShikiCacheLookup } from "./previewPerf";

type CodeMeta = {
  highlightLines?: Set<number>;
  showLineNumbers?: boolean;
};

const SHIKI_LANGS: BuiltinLanguage[] = [
  "cpp",
  "c",
  "python",
  "java",
  "rust",
  "javascript",
  "typescript",
  "json",
  "yaml",
  "markdown",
  "bash",
];

class InstrumentedShikiCache extends Map<string, Root> {
  override get(key: string): Root | undefined {
    const startedAt = now();
    const hasKey = super.has(key);
    const value = super.get(key);
    if (hasKey) {
      markShikiCacheLookup({
        hit: true,
        cacheSize: this.size,
        lookupMs: now() - startedAt,
      });
    }
    return value;
  }

  override set(key: string, value: Root): this {
    const result = super.set(key, value);
    markShikiCacheLookup({
      hit: false,
      cacheSize: this.size,
      lookupMs: 0,
    });
    return result;
  }
}

const shikiHighlightCache = new InstrumentedShikiCache();

const katexOptions = {
  throwOnError: false,
  errorColor: "inherit",
  strict: "ignore" as const,
};

const luoguCodeLineTransformer: ShikiTransformer = {
  name: "oi-luogu-code-lines",
  pre(node) {
    const meta = this.options.meta as CodeMeta | undefined;

    if (meta?.showLineNumbers) {
      this.addClassToHast(node, "oi-code-with-lines");
    }
  },
  line(node, lineNumber) {
    const meta = this.options.meta as CodeMeta | undefined;

    if (meta?.highlightLines?.has(lineNumber)) {
      this.addClassToHast(node, "oi-code-line-highlight");
    }
  },
};

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

const rehypeHighlightPerfStart = () => (_tree: Root, file: { data: Record<string, unknown> }) => {
  file.data.oinbHighlightStart = now();
};

const rehypeHighlightPerfEnd = () => (_tree: Root, file: { data: Record<string, unknown> }) => {
  const start = file.data.oinbHighlightStart;
  file.data.oinbHighlightMs = typeof start === "number" ? now() - start : 0;
};

const dangerousHtmlTags = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "style",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
]);

const urlPropertyNames = new Set(["href", "src"]);

const rehypeSanitizeMarkdownHtml = () => (tree: Root) => {
  visit(tree, "element", (node, index, parent) => {
    if (dangerousHtmlTags.has(node.tagName)) {
      if (parent && typeof index === "number") {
        parent.children.splice(index, 1);
        return index;
      }
      return;
    }

    sanitizeElementProperties(node);
  });
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkLuoguCallouts)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex, katexOptions)
  .use(rehypeTableMerge)
  .use(rehypeHighlightPerfStart)
  .use(rehypeShiki, {
    defaultLanguage: "cpp",
    fallbackLanguage: "text",
    langs: SHIKI_LANGS,
    parseMetaString: parseCodeMeta,
    themes: {
      light: "github-light",
      dark: "one-dark-pro",
    },
    transformers: [luoguCodeLineTransformer],
    cache: shikiHighlightCache,
  })
  .use(rehypeHighlightPerfEnd)
  .use(rehypeSanitizeMarkdownHtml)
  .use(rehypeStringify)
  .freeze();

const lightThemeProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkLuoguCallouts)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex, katexOptions)
  .use(rehypeTableMerge)
  .use(rehypeHighlightPerfStart)
  .use(rehypeShiki, {
    defaultLanguage: "cpp",
    fallbackLanguage: "text",
    langs: SHIKI_LANGS,
    parseMetaString: parseCodeMeta,
    theme: "github-light",
    transformers: [luoguCodeLineTransformer],
  })
  .use(rehypeHighlightPerfEnd)
  .use(rehypeSanitizeMarkdownHtml)
  .use(rehypeStringify)
  .freeze();

const darkThemeProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkLuoguCallouts)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex, katexOptions)
  .use(rehypeTableMerge)
  .use(rehypeHighlightPerfStart)
  .use(rehypeShiki, {
    defaultLanguage: "cpp",
    fallbackLanguage: "text",
    langs: SHIKI_LANGS,
    parseMetaString: parseCodeMeta,
    theme: "one-dark-pro",
    transformers: [luoguCodeLineTransformer],
  })
  .use(rehypeHighlightPerfEnd)
  .use(rehypeSanitizeMarkdownHtml)
  .use(rehypeStringify)
  .freeze();

export async function renderMarkdown(md: string): Promise<string> {
  const markdown = stripFrontmatter(md);
  const startedAt = now();
  const result = await processor.process(markdown);
  markPreviewMarkdownRender({
    docLength: markdown.length,
    parseMs: now() - startedAt,
    highlightMs: typeof result.data.oinbHighlightMs === "number" ? result.data.oinbHighlightMs : 0,
    highlightCount: countFencedCodeBlocks(markdown),
  });
  return String(result);
}

export async function renderMarkdownForTheme(md: string, theme: "dark" | "light"): Promise<string> {
  const themedProcessor = theme === "dark" ? darkThemeProcessor : lightThemeProcessor;
  const result = await themedProcessor.process(stripFrontmatter(md));
  return String(result);
}

export async function prewarmMarkdownRenderer(): Promise<void> {
  try {
    await renderMarkdown("```cpp\nint main() { return 0; }\n```");
  } catch (error) {
    console.warn("Prewarm markdown renderer failed:", error);
  }
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

function countFencedCodeBlocks(markdown: string): number {
  return markdown.match(/(^|\n)(`{3,}|~{3,})/g)?.length ?? 0;
}

function sanitizeElementProperties(node: Element) {
  const properties = node.properties;
  if (!properties) return;

  for (const propertyName of Object.keys(properties)) {
    const normalizedName = propertyName.toLowerCase();
    const value = properties[propertyName];

    if (normalizedName.startsWith("on") || normalizedName === "srcdoc") {
      delete properties[propertyName];
      continue;
    }

    if (urlPropertyNames.has(normalizedName) && !isSafeMarkdownUrl(node.tagName, value)) {
      delete properties[propertyName];
    }
  }
}

function isSafeMarkdownUrl(tagName: string, value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.every((item) => isSafeMarkdownUrl(tagName, item));
  }
  if (typeof value !== "string") return true;

  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#")) return true;
  if (isRelativeUrl(trimmed)) return true;

  try {
    const parsed = new URL(trimmed);
    if (tagName === "a") {
      return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:";
    }
    if (tagName === "img") {
      return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "asset:" || parsed.protocol === "tauri:";
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isRelativeUrl(value: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith("//");
}

function parseCodeMeta(metaString: string, _node: Element): CodeMeta | undefined {
  const highlightLines = parseHighlightedLines(metaString);
  const showLineNumbers = shouldShowLineNumbers(metaString);

  if (highlightLines.size === 0 && !showLineNumbers) {
    return undefined;
  }

  return {
    ...(highlightLines.size > 0 ? { highlightLines } : {}),
    ...(showLineNumbers ? { showLineNumbers } : {}),
  };
}

function shouldShowLineNumbers(metaString: string): boolean {
  return /(?:^|\s)(?:showLineNumbers|line-numbers|lineNumbers)(?=\s|$)/.test(metaString);
}

function parseHighlightedLines(metaString: string): Set<number> {
  const lines = new Set<number>();
  const match = metaString.match(/(?:^|\s)lines=([^\s]+)/);

  if (!match) {
    return lines;
  }

  for (const segment of match[1].split(",")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;

    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
        continue;
      }

      for (let line = start; line <= end; line += 1) {
        lines.add(line);
      }
      continue;
    }

    if (/^\d+$/.test(trimmed)) {
      const line = Number(trimmed);
      if (Number.isSafeInteger(line) && line >= 1) {
        lines.add(line);
      }
    }
  }

  return lines;
}
