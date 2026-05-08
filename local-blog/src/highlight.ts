import type { HighlighterCore, ShikiTransformer, ThemeRegistration } from "shiki/core";

type HighlightLanguage = "bash" | "c" | "cpp" | "java" | "javascript" | "python" | "rust" | "typescript";
type CodeMeta = {
  highlightLines?: Set<number>;
};

const supportedLanguages = new Map<string, HighlightLanguage | null>([
  ["c", "c"],
  ["cpp", "cpp"],
  ["c++", "cpp"],
  ["python", "python"],
  ["py", "python"],
  ["java", "java"],
  ["js", "javascript"],
  ["javascript", "javascript"],
  ["ts", "typescript"],
  ["typescript", "typescript"],
  ["rust", "rust"],
  ["rs", "rust"],
  ["bash", "bash"],
  ["sh", "bash"],
  ["shell", "bash"],
  ["text", null],
  ["txt", null],
  ["plaintext", null],
]);

const highlightedCodeCache = new Map<string, Promise<string | null>>();
let highlighterPromise: Promise<HighlighterCore> | null = null;
const defaultCodeLanguage: HighlightLanguage = "cpp";

const luoguCodeLineTransformer: ShikiTransformer = {
  name: "oi-luogu-code-lines",
  line(node, lineNumber) {
    const meta = this.options.meta as CodeMeta | undefined;

    if (meta?.highlightLines?.has(lineNumber)) {
      this.addClassToHast(node, "oi-code-line-highlight");
    }
  },
};

const oiLightTheme = {
  name: "oi-light",
  type: "light",
  colors: {
    "editor.background": "#00000000",
    "editor.foreground": "#24292f",
  },
  tokenColors: [
    {
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: { foreground: "#6e7781" },
    },
    {
      scope: [
        "keyword",
        "keyword.control",
        "keyword.operator.expression",
        "storage",
        "storage.modifier",
        "storage.type",
      ],
      settings: { foreground: "#cf222e" },
    },
    {
      scope: [
        "keyword.control.directive",
        "meta.preprocessor",
        "entity.name.function.preprocessor",
        "punctuation.definition.directive",
      ],
      settings: { foreground: "#cf222e" },
    },
    {
      scope: ["string", "punctuation.definition.string"],
      settings: { foreground: "#0a7f37" },
    },
    {
      scope: [
        "constant",
        "constant.numeric",
        "constant.language",
        "constant.character",
        "variable.other.enummember",
      ],
      settings: { foreground: "#0550ae" },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "variable.function",
        "meta.function-call entity.name.function",
      ],
      settings: { foreground: "#8250df" },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "entity.name.struct",
        "entity.name.namespace",
        "support.type",
        "support.class",
      ],
      settings: { foreground: "#953800" },
    },
    {
      scope: ["entity.name", "support"],
      settings: { foreground: "#0550ae" },
    },
    {
      scope: [
        "variable.parameter",
        "variable.other",
        "punctuation",
        "keyword.operator",
        "storage.modifier.reference",
      ],
      settings: { foreground: "#24292f" },
    },
    {
      scope: ["invalid", "message.error"],
      settings: { foreground: "#b42318" },
    },
  ],
} satisfies ThemeRegistration;

function getHighlighter() {
  highlighterPromise ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/langs/bash.mjs"),
    import("shiki/langs/c.mjs"),
    import("shiki/langs/cpp.mjs"),
    import("shiki/langs/java.mjs"),
    import("shiki/langs/javascript.mjs"),
    import("shiki/langs/python.mjs"),
    import("shiki/langs/rust.mjs"),
    import("shiki/langs/typescript.mjs"),
  ]).then(
    ([
      { createHighlighterCore },
      { createJavaScriptRegexEngine },
      { default: bash },
      { default: c },
      { default: cpp },
      { default: java },
      { default: javascript },
      { default: python },
      { default: rust },
      { default: typescript },
    ]) =>
      createHighlighterCore({
        themes: [oiLightTheme],
        langs: [bash, c, cpp, java, javascript, python, rust, typescript],
        engine: createJavaScriptRegexEngine(),
      }),
  );

  return highlighterPromise;
}

export function normalizeCodeLanguage(language: string | undefined) {
  if (!language) {
    return defaultCodeLanguage;
  }

  const normalized = supportedLanguages.get(language.trim().toLowerCase());

  return normalized === undefined ? null : normalized;
}

export function highlightCode(code: string, language: string | undefined, metaString = "") {
  const normalizedLanguage = normalizeCodeLanguage(language);

  if (!normalizedLanguage) {
    return Promise.resolve(null);
  }

  const highlightLines = parseHighlightedLines(metaString);
  const cacheKey = `${normalizedLanguage}\0${metaString}\0${code}`;
  const cached = highlightedCodeCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const highlighted = getHighlighter()
    .then((highlighter) =>
      highlighter.codeToHtml(code, {
        lang: normalizedLanguage,
        meta: highlightLines.size > 0 ? { highlightLines } : undefined,
        theme: "oi-light",
        transformers: [luoguCodeLineTransformer],
      }),
    )
    .catch((error) => {
      console.warn("Highlight code block failed:", error);
      return null;
    });

  highlightedCodeCache.set(cacheKey, highlighted);
  return highlighted;
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
