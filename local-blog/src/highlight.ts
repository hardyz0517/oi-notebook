import type { HighlighterCore } from "shiki/core";

type HighlightLanguage = "bash" | "c" | "cpp" | "java" | "javascript" | "python" | "rust" | "typescript";

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
    import("shiki/themes/github-light.mjs"),
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
      { default: githubLight },
    ]) =>
      createHighlighterCore({
        themes: [githubLight],
        langs: [bash, c, cpp, java, javascript, python, rust, typescript],
        engine: createJavaScriptRegexEngine(),
      }),
  );

  return highlighterPromise;
}

export function normalizeCodeLanguage(language: string | undefined) {
  if (!language) {
    return "text";
  }

  const normalized = supportedLanguages.get(language.trim().toLowerCase());

  return normalized === undefined ? null : normalized;
}

export function highlightCode(code: string, language: string | undefined) {
  const normalizedLanguage = normalizeCodeLanguage(language);

  if (!normalizedLanguage) {
    return Promise.resolve(null);
  }

  const cacheKey = `${normalizedLanguage}\0${code}`;
  const cached = highlightedCodeCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const highlighted = getHighlighter()
    .then((highlighter) =>
      highlighter.codeToHtml(code, {
        lang: normalizedLanguage,
        theme: "github-light",
      }),
    )
    .catch((error) => {
      console.warn("Highlight code block failed:", error);
      return null;
    });

  highlightedCodeCache.set(cacheKey, highlighted);
  return highlighted;
}
