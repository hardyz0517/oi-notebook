export type SolutionFormatRuleId =
  | "cjk_spacing"
  | "punctuation_normalize"
  | "inline_math_wrap"
  | "math_symbol_latex"
  | "math_spacing"
  | "heading_marker_spacing"
  | "blank_lines_around_headings"
  | "blank_lines_around_code_fences"
  | "blank_lines_around_lists"
  | "normalize_code_fence_lang";

export interface SolutionFormatChange {
  ruleId: SolutionFormatRuleId;
  message: string;
  count: number;
}

export interface FormatSolutionResult {
  formattedBody: string;
  changes: SolutionFormatChange[];
}

export interface FormatLuoguSolutionOptions {
  enabledRules?: Partial<Record<SolutionFormatRuleId, boolean>>;
}

type CountMap = Record<SolutionFormatRuleId, number>;

type FenceBlock =
  | { type: "text"; value: string }
  | { type: "fence"; value: string };

interface LinkToken {
  isImage: boolean;
  label: string;
  url: string;
}

interface InlineFormatOptions {
  allowLinkFormatting?: boolean;
}

const DEFAULT_ENABLED_RULES: Record<SolutionFormatRuleId, boolean> = {
  cjk_spacing: true,
  punctuation_normalize: true,
  inline_math_wrap: true,
  math_symbol_latex: true,
  math_spacing: true,
  heading_marker_spacing: true,
  blank_lines_around_headings: true,
  blank_lines_around_code_fences: true,
  blank_lines_around_lists: true,
  normalize_code_fence_lang: true,
};

const CHANGE_MESSAGES: Record<SolutionFormatRuleId, string> = {
  cjk_spacing: "\u4e2d\u82f1\u6587\u7a7a\u683c",
  punctuation_normalize: "\u4e2d\u6587\u6807\u70b9",
  inline_math_wrap: "\u53d8\u91cf/\u6570\u5b57\u884c\u5185\u516c\u5f0f\u5316",
  math_symbol_latex: "\u6570\u5b66\u7b26\u53f7 LaTeX \u5316",
  math_spacing: "\u516c\u5f0f\u7a7a\u683c",
  heading_marker_spacing: "\u6807\u9898\u6807\u8bb0\u7a7a\u683c",
  blank_lines_around_headings: "\u6807\u9898\u7a7a\u884c",
  blank_lines_around_code_fences: "\u4ee3\u7801\u5757\u7a7a\u884c",
  blank_lines_around_lists: "\u5217\u8868/\u5f15\u7528/\u8868\u683c\u7a7a\u884c",
  normalize_code_fence_lang: "\u4ee3\u7801\u5757\u8bed\u8a00\u540d",
};

const CODE_FENCE_LANG_ALIASES = new Map([
  ["c++", "cpp"],
  ["cpp", "cpp"],
]);

const TOKEN_PREFIX = "__OI_FMT_";
const MATH_TOKEN = `${TOKEN_PREFIX}MATH_`;
const CODE_TOKEN = `${TOKEN_PREFIX}CODE_`;
const LINK_TOKEN = `${TOKEN_PREFIX}LINK_`;
const URL_TOKEN = `${TOKEN_PREFIX}URL_`;
const SAFE_TOKEN = `${TOKEN_PREFIX}SAFE_`;
const WRAPPED_MATH_TOKEN = `${TOKEN_PREFIX}WRAPPED_MATH_`;

const CJK_CLASS = "\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
const CJK_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const TOKENIZED_INLINE_PATTERN = `(?:${MATH_TOKEN}\\d+__|${SAFE_TOKEN}\\d+__)`;

const STRUCTURED_WORDS = new Set([
  "C++",
  "STL",
  "Dijkstra",
  "priority_queue",
  "vector",
  "long long",
  "int",
  "std",
]);

const RESERVED_SHORT_IDENTIFIERS = new Set([
  "std",
  "long",
  "int",
  "inf",
  "log",
  "min",
  "max",
  "sum",
]);

const MATH_CONTEXT_KEYWORDS = [
  "\u51fa\u8fb9",
  "\u5165\u8fb9",
  "\u8fb9",
  "\u72b6\u6001",
  "\u6ee1\u8db3",
  "\u5982\u679c",
  "\u82e5",
  "\u521d\u59cb\u5316",
  "\u66f4\u65b0",
  "\u590d\u6742\u5ea6",
  "\u8303\u56f4",
  "\u8868\u793a",
  "\u8ddd\u79bb",
  "\u7b54\u6848",
  "\u8f6c\u79fb",
  "\u5faa\u73af\u8303\u56f4",
  "\u5faa\u73af",
  "\u679a\u4e3e",
  "\u4ee4",
  "\u8bbe",
  "\u7531\u4e8e",
  "\u6709",
];

const PUNCTUATION_MAP: Record<string, string> = {
  ",": "\uFF0C",
  ".": "\u3002",
  ":": "\uFF1A",
  ";": "\uFF1B",
  "?": "\uFF1F",
  "!": "\uFF01",
};

const MATH_IDENTIFIER = "[A-Za-z]+(?:\\[[^\\]\\n]+\\]|_\\{[^{}\\n]+\\}|_[A-Za-z0-9+\\-]+)?";
const MATH_ATOM = `(?:${MATH_IDENTIFIER}|INF|inf|\\d+(?:\\.\\d+)?(?:\\^\\d+)?)`;
const MATH_TERM = `${MATH_ATOM}(?:\\s*[+\\-*/]\\s*${MATH_ATOM})*`;

function createInitialCounts(): CountMap {
  return {
    cjk_spacing: 0,
    punctuation_normalize: 0,
    inline_math_wrap: 0,
    math_symbol_latex: 0,
    math_spacing: 0,
    heading_marker_spacing: 0,
    blank_lines_around_headings: 0,
    blank_lines_around_code_fences: 0,
    blank_lines_around_lists: 0,
    normalize_code_fence_lang: 0,
  };
}

function detectEol(input: string): string {
  return input.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeNewlines(input: string): string {
  return input.replace(/\r\n/g, "\n");
}

function isCjkChar(char: string | undefined): boolean {
  return !!char && CJK_CHAR.test(char);
}

function isAsciiWordChar(char: string | undefined): boolean {
  return !!char && /[A-Za-z0-9]/.test(char);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countReplace(
  value: string,
  pattern: RegExp,
  replacer: string | ((match: string, ...args: string[]) => string),
): [string, number] {
  if (typeof replacer === "string") {
    const matches = [...value.matchAll(pattern)];
    return [value.replace(pattern, replacer), matches.length];
  }

  let count = 0;
  const next = value.replace(pattern, (...args) => {
    const replacement = replacer(...(args as [string, ...string[]]));
    if (replacement !== args[0]) {
      count += 1;
    }
    return replacement;
  });
  return [next, count];
}

function pushToken(store: string[], tokenPrefix: string, value: string): string {
  const token = `${tokenPrefix}${store.length}__`;
  store.push(value);
  return token;
}

function restoreProtectedSegments(input: string, tokenPrefix: string, store: string[]): string {
  return input.replace(new RegExp(`${escapeRegExp(tokenPrefix)}(\\d+)__`, "g"), (match, indexText: string) => {
    const index = Number.parseInt(indexText, 10);
    return Number.isNaN(index) ? match : (store[index] ?? match);
  });
}

function protectByPattern(input: string, pattern: RegExp, tokenPrefix: string, store: string[]): string {
  return input.replace(pattern, (match) => pushToken(store, tokenPrefix, match));
}

function getNearestNonSpaceChar(input: string, index: number, step: -1 | 1): string | undefined {
  let cursor = index;
  while (cursor >= 0 && cursor < input.length) {
    const char = input[cursor];
    if (char !== " " && char !== "\t") return char;
    cursor += step;
  }
  return undefined;
}

function hasCjkContextAround(input: string, start: number, end: number): boolean {
  const prev = getNearestNonSpaceChar(input, start - 1, -1);
  const next = getNearestNonSpaceChar(input, end, 1);
  return isCjkChar(prev) || isCjkChar(next);
}

function hasMathKeywordContext(input: string, start: number): boolean {
  const before = input.slice(Math.max(0, start - 12), start);
  return MATH_CONTEXT_KEYWORDS.some((keyword) => before.includes(keyword));
}

function isInsideProtectedPlaceholder(input: string, offset: number): boolean {
  const start = input.lastIndexOf(TOKEN_PREFIX, offset);
  if (start === -1) return false;
  const end = input.indexOf("__", start + TOKEN_PREFIX.length);
  return end !== -1 && offset < end + 2;
}

function collapseInlineSpaces(input: string): string {
  return input.replace(/[ \t]{2,}/g, " ");
}

function splitTrailingInlineWhitespace(input: string): { body: string; trailingWhitespace: string } {
  const match = input.match(/[ \t]+$/);
  if (!match) return { body: input, trailingWhitespace: "" };
  return {
    body: input.slice(0, -match[0].length),
    trailingWhitespace: match[0],
  };
}

function isTableLikeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  if (/^\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed)) return true;
  return trimmed.startsWith("|") || /^\S.*\|.*\|\s*$/.test(trimmed);
}

function isTableSeparatorLine(line: string): boolean {
  return /^\|?(?:\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(line.trim());
}

function isQuoteLine(line: string): boolean {
  return /^\s{0,3}(?:>\s*)+/.test(line);
}

function isListLine(line: string): boolean {
  return /^(\s*)([-+*]|\d+\.)\s*/.test(line);
}

function repairProtectedLiterals(input: string): string {
  let value = input;
  value = value.replace(/(\d)\u3002(?=\d)/g, "$1.");
  value = value.replace(/([A-Za-z0-9_])\u3002(?=[A-Za-z0-9_])/g, "$1.");
  return value;
}

function formatMathOperatorSpacing(input: string): string {
  let output = "";
  let braceDepth = 0;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === "{") {
      braceDepth += 1;
      output += char;
      continue;
    }
    if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      output += char;
      continue;
    }
    if (braceDepth > 0) {
      output += char;
      continue;
    }
    if (char === ",") {
      output = output.replace(/[ \t]+$/, "");
      output += ", ";
      while (input[index + 1] === " " || input[index + 1] === "\t") index += 1;
      continue;
    }
    if (char === "=" || char === "<" || char === ">" || char === "+") {
      output = output.replace(/[ \t]+$/, "");
      output += ` ${char} `;
      while (input[index + 1] === " " || input[index + 1] === "\t") index += 1;
      continue;
    }
    if (char === "-") {
      const prev = output.replace(/[ \t]+$/, "").slice(-1);
      const next = input[index + 1];
      const isUnary = !prev || /[(,=<>+\-*/]/.test(prev) || /\s/.test(next ?? "");
      if (isUnary) {
        output += char;
        continue;
      }
      output = output.replace(/[ \t]+$/, "");
      output += " - ";
      while (input[index + 1] === " " || input[index + 1] === "\t") index += 1;
      continue;
    }
    output += char;
  }

  return output.replace(/[ \t]{2,}/g, " ").trim();
}

function normalizeMathFunctions(input: string): string {
  let value = input;
  value = value.replace(/\bO\s*\(/g, "O(");
  value = value.replace(/(?<!\\)\blog\s*\(\s*([A-Za-z0-9_]+)\s*\)/g, (_match, arg: string) => `\\log ${arg}`);
  value = value.replace(/(?<!\\)\blog\s+([A-Za-z0-9_]+)/g, (_match, arg: string) => `\\log ${arg}`);
  value = value.replace(/(?<!\\)\blog([A-Za-z0-9_])/g, (_match, arg: string) => `\\log ${arg}`);
  value = value.replace(/(?<!\\)\bsum(?=_(?:\{|[A-Za-z0-9]))/g, "\\sum");
  value = value.replace(/(?<!\\)\bmin\s*\(/g, "\\min(");
  value = value.replace(/(?<!\\)\bmax\s*\(/g, "\\max(");
  value = value.replace(/(\d)\s*\*\s*(\d+(?:\^\d+)?|[A-Za-z](?:_[A-Za-z0-9+\-]+)?|\([^)]+\))/g, "$1 \\times $2");
  value = value.replace(/([A-Za-z](?:_[A-Za-z0-9+\-]+)?|\))\s*\*\s*(\d+(?:\^\d+)?|[A-Za-z](?:_[A-Za-z0-9+\-]+)?|\([^)]+\))/g, "$1 \\times $2");
  return value;
}

function formatMathContent(input: string, counts: CountMap): string {
  let value = input.trim();
  value = normalizeMathFunctions(value);

  const replacements: Array<[RegExp, string]> = [
    [/<=>/g, " \\Leftrightarrow "],
    [/<=/g, " \\le "],
    [/>=/g, " \\ge "],
    [/!=/g, " \\ne "],
    [/->/g, " \\to "],
    [/<-/g, " \\leftarrow "],
    [/\.\.\./g, " \\cdots "],
    [/\binf\b/g, " \\infty "],
    [/\bsum\b/g, " \\sum "],
  ];

  for (const [pattern, replacement] of replacements) {
    const [next, replacementCount] = countReplace(value, pattern, replacement);
    value = next;
    counts.math_symbol_latex += replacementCount;
  }

  const spacedValue = formatMathOperatorSpacing(value);
  if (spacedValue !== value) {
    counts.math_spacing += 1;
    value = spacedValue;
  }

  value = value.replace(/[ \t]+/g, " ");
  value = value.replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  value = value.replace(/\s+([,.;!?])/g, "$1");
  return value.trim();
}

function protectMathSegments(input: string, counts: CountMap, store: string[]): string {
  let output = "";
  let index = 0;

  while (index < input.length) {
    if (input[index] !== "$") {
      output += input[index];
      index += 1;
      continue;
    }

    const delimiter = input[index + 1] === "$" ? "$$" : "$";
    const isBlock = delimiter === "$$";
    const start = index;
    index += delimiter.length;
    let end = index;
    let found = false;

    while (end < input.length) {
      if (input[end] === "\\") {
        end += 2;
        continue;
      }
      if (input.startsWith(delimiter, end)) {
        found = true;
        break;
      }
      if (!isBlock && input[end] === "\n") break;
      end += 1;
    }

    if (!found) {
      output += input[start];
      index = start + 1;
      continue;
    }

    const rawContent = input.slice(index, end);
    const formatted = formatMathContent(rawContent, counts);
    output += pushToken(store, MATH_TOKEN, `${delimiter}${formatted}${delimiter}`);
    index = end + delimiter.length;
  }

  return output;
}

function protectLinksAndImages(
  input: string,
  counts: CountMap,
  rules: Record<SolutionFormatRuleId, boolean>,
  store: string[],
): string {
  return input.replace(/(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/g, (_match, bang: string, label: string, url: string) => {
    const formattedLabel = formatInlineContent(label, counts, rules, { allowLinkFormatting: false });
    const payload: LinkToken = { isImage: bang === "!", label: formattedLabel, url };
    return pushToken(store, LINK_TOKEN, JSON.stringify(payload));
  });
}

function restoreLinksAndImages(input: string, store: string[]): string {
  return input.replace(new RegExp(`${escapeRegExp(LINK_TOKEN)}(\\d+)__`, "g"), (match, indexText: string) => {
    const index = Number.parseInt(indexText, 10);
    if (Number.isNaN(index)) return match;
    const raw = store[index];
    if (!raw) return match;
    const payload = JSON.parse(raw) as LinkToken;
    return `${payload.isImage ? "!" : ""}[${payload.label}](${payload.url})`;
  });
}

function protectSafeSegments(input: string, store: string[]): string {
  let value = input;

  value = value.replace(/\bC\+\+STL\b/g, () => pushToken(store, SAFE_TOKEN, "C++ STL"));

  const patterns: RegExp[] = [
    /\b(?:v)?\d+(?:\.\d+){2,}\b/g,
    /\b\d+\.\d+\b/g,
    /\b\d+(?:e|E)\d+\b/g,
    /\b[A-Za-z]:\\(?:[^\\\s]+\\)*[^\\\s]+\b/g,
    /\b(?:[\w.-]+\/)+[\w.-]+\.[A-Za-z0-9]{1,8}\b/g,
    /\B\.[A-Za-z0-9]{1,8}\b/g,
    /\b[\w-]+\.(?:cpp|cc|cxx|c|h|hpp|md|txt|in|out|json|yaml|yml)\b/gi,
    /\bC\+\+\b/g,
  ];

  for (const pattern of patterns) {
    value = protectByPattern(value, pattern, SAFE_TOKEN, store);
  }

  for (const word of STRUCTURED_WORDS) {
    value = value.replace(new RegExp(escapeRegExp(word), "g"), () => pushToken(store, SAFE_TOKEN, word));
  }

  return value;
}

function formatPunctuation(input: string, counts: CountMap): string {
  let output = "";
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const replacement = PUNCTUATION_MAP[char];
    if (!replacement) {
      output += char;
      continue;
    }

    const prev = output[output.length - 1];
    const next = input[index + 1];
    const prevIsCjk = isCjkChar(prev);
    const nextIsCjk = isCjkChar(next);

    if (char === "." && /\d/.test(prev ?? "") && /\d/.test(next ?? "")) {
      output += char;
      continue;
    }
    if (char === "." && isAsciiWordChar(prev) && isAsciiWordChar(next)) {
      output += char;
      continue;
    }
    if (char === "." && /\d/.test(prev ?? "") && isCjkChar(next)) {
      output += char;
      continue;
    }
    if (!prevIsCjk && !nextIsCjk) {
      output += char;
      continue;
    }

    counts.punctuation_normalize += 1;
    output = output.replace(/[ \t]+$/, "");
    output += replacement;
    while (input[index + 1] === " " || input[index + 1] === "\t") {
      index += 1;
    }
  }
  return output;
}

function formatTokenAwarePunctuation(input: string, counts: CountMap): string {
  let value = input;
  const tokenOrCjk = `(?:${TOKENIZED_INLINE_PATTERN}|[${CJK_CLASS}])`;

  value = value.replace(new RegExp(`(${tokenOrCjk})\\s*,\\s*(?=${tokenOrCjk})`, "g"), (_match, left: string) => {
    counts.punctuation_normalize += 1;
    return `${left}\uFF0C`;
  });

  value = value.replace(
    new RegExp(`(${TOKENIZED_INLINE_PATTERN})\\s*([.:;?!])(?=$|\\s|[${CJK_CLASS}])`, "g"),
    (_match, left: string, punct: string) => {
      const replacement = PUNCTUATION_MAP[punct];
      if (!replacement) return `${left}${punct}`;
      counts.punctuation_normalize += 1;
      return `${left}${replacement}`;
    },
  );

  return value;
}

function formatCjkSpacing(input: string, counts: CountMap): string {
  let value = input;
  const replacements: Array<[RegExp, string]> = [
    [new RegExp(`([${CJK_CLASS}])([A-Za-z0-9][A-Za-z0-9+_\\\\-]*)`, "g"), "$1 $2"],
    [new RegExp(`([A-Za-z0-9][A-Za-z0-9+_\\\\-]*)([${CJK_CLASS}])`, "g"), "$1 $2"],
  ];

  for (const [pattern, replacement] of replacements) {
    const [next, replacementCount] = countReplace(value, pattern, replacement);
    value = next;
    counts.cjk_spacing += replacementCount;
  }

  value = value.replace(/C\+\+STL/g, () => {
    counts.cjk_spacing += 1;
    return "C++ STL";
  });

  return value;
}

function formatMathSpacing(input: string, counts: CountMap): string {
  let value = input;
  const patterns: Array<[RegExp, string]> = [
    [new RegExp(`([${CJK_CLASS}A-Za-z0-9])(${escapeRegExp(MATH_TOKEN)}\\d+__)`, "g"), "$1 $2"],
    [new RegExp(`(${escapeRegExp(MATH_TOKEN)}\\d+__)([${CJK_CLASS}A-Za-z0-9])`, "g"), "$1 $2"],
  ];

  for (const [pattern, replacement] of patterns) {
    const [next, replacementCount] = countReplace(value, pattern, replacement);
    value = next;
    counts.math_spacing += replacementCount;
  }
  return value;
}

function formatSafeSpacing(input: string, counts: CountMap): string {
  let value = input;
  const patterns: Array<[RegExp, string]> = [
    [new RegExp(`([${CJK_CLASS}A-Za-z0-9])(${escapeRegExp(SAFE_TOKEN)}\\d+__)`, "g"), "$1 $2"],
    [new RegExp(`(${escapeRegExp(SAFE_TOKEN)}\\d+__)([${CJK_CLASS}A-Za-z0-9])`, "g"), "$1 $2"],
  ];
  for (const [pattern, replacement] of patterns) {
    const [next, replacementCount] = countReplace(value, pattern, replacement);
    value = next;
    counts.cjk_spacing += replacementCount;
  }
  return value;
}

function isInsideInlineMathSegment(input: string, start: number, end: number): boolean {
  const lineStart = input.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = input.indexOf("\n", end);
  const boundaryEnd = lineEnd === -1 ? input.length : lineEnd;
  const before = input.slice(lineStart, start);
  const after = input.slice(end, boundaryEnd);
  const prevDollar = before.lastIndexOf("$");
  const nextDollar = after.indexOf("$");
  if (prevDollar === -1 || nextDollar === -1) return false;
  if (before.slice(prevDollar + 1).includes("$")) return false;
  return true;
}

function isLikelyMathAtom(token: string): boolean {
  if (/^\d+$/.test(token)) return true;
  if (/^[A-Za-z]$/.test(token)) return true;
  if (/^[A-Za-z]+(?:_\{[^{}\n]+\}|_[A-Za-z0-9+\-]+)$/.test(token)) {
    const match = token.match(/^([A-Za-z]+)_(\{[^{}\n]+\}|[A-Za-z0-9+\-]+)$/);
    if (!match) return false;
    const base = match[1];
    const rawSubscript = match[2];
    const subscript = rawSubscript.startsWith("{") && rawSubscript.endsWith("}")
      ? rawSubscript.slice(1, -1).trim()
      : rawSubscript;
    if (base.length > 4) return false;
    if (!/^[A-Za-z0-9+\-]+$/.test(subscript)) return false;
    if (/^[A-Za-z]{3,}$/.test(subscript)) return false;
    return true;
  }
  return false;
}

function formatVariableListExpression(expr: string, counts: CountMap): string {
  const parts = expr.split(/\s*,\s*/);
  counts.inline_math_wrap += 1;
  return parts.map((part) => `$${formatMathContent(part, counts)}$`).join("\uFF0C");
}

function formatInlineMathWrap(input: string, counts: CountMap): string {
  let value = input;
  const wrappedSegments: string[] = [];
  const rangePattern = new RegExp(`${MATH_TERM}\\s*(?:<=|>=|!=|=|<|>)\\s*${MATH_TERM}(?:\\s*(?:<=|>=|!=|=|<|>)\\s*${MATH_TERM})+`, "g");
  const comparisonPattern = new RegExp(`${MATH_TERM}\\s*(?:<=|>=|!=|=|<|>)\\s*${MATH_TERM}`, "g");
  const complexityPattern = /O\([^\uFF0C\u3002\uFF01\uFF1F\uFF1B,.\s\n]+\)/g;
  const simpleExpressionPattern = new RegExp(`${MATH_ATOM}\\s*[+\\-]\\s*\\d+`, "g");
  const powerOrTimesPattern = /(?:\d+\^\d+|\d+\s*\*\s*\d+(?:\^\d+)?)/g;
  const variableListPattern = new RegExp(`${MATH_IDENTIFIER}(?:\\s*,\\s*${MATH_IDENTIFIER})+`, "g");
  const plainVariableListPattern = /(?:[A-Za-z])(?:\s*,\s*[A-Za-z])+/g;
  const arrowPattern = new RegExp(`${MATH_IDENTIFIER}->(?:${MATH_IDENTIFIER}|\\d+)`, "g");
  const indexedComparisonPattern = /[A-Za-z]+\[[^\]\n]+\]\s*(?:<=|>=|!=|=|<|>)\s*(?:INF(?:\/\d+)?|[A-Za-z]+\[[^\]\n]+\]|[A-Za-z]+(?:_\{[^{}\n]+\}|_[A-Za-z0-9+\-]+)?|\d+(?:\.\d+)?(?:\^\d+)?(?:\s*[+\-*/]\s*(?:INF(?:\/\d+)?|[A-Za-z]+\[[^\]\n]+\]|[A-Za-z]+(?:_\{[^{}\n]+\}|_[A-Za-z0-9+\-]+)?|\d+(?:\.\d+)?(?:\^\d+)?))*)/g;
  const shortNamedVarPattern = /\b[a-z]{2,4}\b/g;
  const negativeNumberPattern = /-\d+\b/g;
  const ordinalExpressionPattern = new RegExp(`(\u7b2c)\\s*(${MATH_ATOM}\\s*[+\\-]\\s*\\d+)\\s*(\u4e2a)`, "g");
  const ordinalAtomPattern = new RegExp(`(\u7b2c)\\s*(${MATH_IDENTIFIER}|\\d+)\\s*(\u4e2a)`, "g");
  const contextualArrowPattern = new RegExp(`((?:\u51fa\u8fb9|\u5165\u8fb9|\u72b6\u6001|\u8f6c\u79fb))\\s*(${MATH_IDENTIFIER}->(?:${MATH_IDENTIFIER}|\\d+))`, "g");
  const contextualComparisonPattern = new RegExp(
    `((?:\u5982\u679c|\u82e5|\u7531\u4e8e|\u6ee1\u8db3|\u521d\u59cb\u5316\u65f6|\u521d\u59cb\u5316|\u66f4\u65b0))\\s*(${MATH_TERM}\\s*(?:<=|>=|!=|=|<|>)\\s*${MATH_TERM}(?:\\s*(?:<=|>=|!=|=|<|>)\\s*${MATH_TERM})*)`,
    "g",
  );
  const namedVariablePattern = new RegExp(
    `((?:\u7b54\u6848|\u8ddd\u79bb|\u72b6\u6001))\\s*([A-Za-z]{1,4}(?:\\[[^\\]\\n]+\\]|_\\{[^{}\\n]+\\}|_[A-Za-z0-9+\\-]+)?)`,
    "g",
  );
  const contextualNumberPattern = new RegExp(`((?:\u8fbe\u5230|\u6709))\\s*(\\d+\\^\\d+|\\d+\\s*\\*\\s*\\d+(?:\\^\\d+)?)`, "g");

  const wrap = (content: string): string => {
    counts.inline_math_wrap += 1;
    return `$${formatMathContent(content, counts)}$`;
  };

  const wrapIf = (
    source: string,
    pattern: RegExp,
    allow: (expr: string, offset: number, whole: string) => boolean,
    transform?: (expr: string) => string,
  ): string => source.replace(pattern, (expr, offset: number, whole: string) => {
    if (isInsideProtectedPlaceholder(whole, offset)) return expr;
    if (!allow(expr, offset, whole)) return expr;
    return wrap(transform ? transform(expr) : expr);
  });

  value = value.replace(ordinalExpressionPattern, (match, head: string, expr: string, tail: string, offset: number, whole: string) => {
    if (isInsideProtectedPlaceholder(whole, offset)) return match;
    return `${head} ${wrap(expr)} ${tail}`;
  });

  value = value.replace(ordinalAtomPattern, (match, head: string, expr: string, tail: string, offset: number, whole: string) => {
    if (isInsideProtectedPlaceholder(whole, offset)) return match;
    if (!isLikelyMathAtom(expr)) return match;
    return `${head} ${wrap(expr)} ${tail}`;
  });

  value = value.replace(contextualArrowPattern, (match, prefix: string, expr: string, offset: number, whole: string) => {
    if (isInsideProtectedPlaceholder(whole, offset)) return match;
    return `${prefix} ${wrap(expr)}`;
  });

  value = value.replace(contextualComparisonPattern, (match, prefix: string, expr: string, offset: number, whole: string) => {
    if (isInsideProtectedPlaceholder(whole, offset)) return match;
    return `${prefix} ${wrap(expr)}`;
  });

  value = value.replace(namedVariablePattern, (match, prefix: string, expr: string, offset: number, whole: string) => {
    if (isInsideProtectedPlaceholder(whole, offset)) return match;
    if (STRUCTURED_WORDS.has(expr) || RESERVED_SHORT_IDENTIFIERS.has(expr)) return match;
    if (!isLikelyMathAtom(expr) && !/^[A-Za-z]{2,4}$/.test(expr)) return match;
    return `${prefix} ${wrap(expr)}`;
  });

  value = value.replace(contextualNumberPattern, (match, prefix: string, expr: string, offset: number, whole: string) => {
    if (isInsideProtectedPlaceholder(whole, offset)) return match;
    return `${prefix} ${wrap(expr)}`;
  });

  value = value.replace(/\$[^$\n]+\$/g, (match) => pushToken(wrappedSegments, WRAPPED_MATH_TOKEN, match));

  value = wrapIf(value, rangePattern, (expr, offset, whole) => {
    const prev = whole[offset - 1];
    const next = whole[offset + expr.length];
    return prev !== "$" && next !== "$" && !/[A-Za-z0-9_]/.test(prev ?? "") && !/[A-Za-z0-9_]/.test(next ?? "");
  });

  value = wrapIf(value, complexityPattern, (expr, offset, whole) => {
    const prev = whole[offset - 1];
    const next = whole[offset + expr.length];
    return prev !== "$" && next !== "$" && hasCjkContextAround(whole, offset, offset + expr.length);
  });

  value = wrapIf(value, indexedComparisonPattern, (expr, offset, whole) => {
    const prev = whole[offset - 1];
    const next = whole[offset + expr.length];
    if (prev === "$" || next === "$") return false;
    return hasMathKeywordContext(whole, offset) || hasCjkContextAround(whole, offset, offset + expr.length);
  });

  value = wrapIf(value, comparisonPattern, (expr, offset, whole) => {
    const prev = whole[offset - 1];
    const next = whole[offset + expr.length];
    if (prev === "$" || next === "$") return false;
    if (/[A-Za-z0-9_]/.test(prev ?? "") || /[A-Za-z0-9_]/.test(next ?? "")) return false;
    if (hasMathKeywordContext(whole, offset)) return true;
    if (/[_\[\]^{}]|INF|inf/.test(expr)) return true;
    return /^[A-Za-z]\s*(?:<=|>=|!=|=|<|>)\s*\d/.test(expr);
  });

  value = wrapIf(value, arrowPattern, (expr, offset, whole) => {
    if (whole[offset - 1] === "$" || whole[offset + expr.length] === "$") return false;
    return hasMathKeywordContext(whole, offset) || expr.includes("_");
  });

  value = wrapIf(value, simpleExpressionPattern, (expr, offset, whole) => {
    if (whole[offset - 1] === "$" || whole[offset + expr.length] === "$") return false;
    return hasCjkContextAround(whole, offset, offset + expr.length);
  });

  value = wrapIf(value, negativeNumberPattern, (expr, offset, whole) => {
    if (whole[offset - 1] === "$" || whole[offset + expr.length] === "$") return false;
    const prev = whole[offset - 1];
    const prevPrev = whole[offset - 2];
    if (/[A-Za-z0-9_\])}]/.test(prev ?? "")) return false;
    if (prev === "-" || prev === "+") return false;
    return isCjkChar(prev) || /[\s(\uFF08:\uFF1A,\uFF0C]/.test(prev ?? "") || isCjkChar(prevPrev);
  });

  value = wrapIf(value, powerOrTimesPattern, (expr, offset, whole) => {
    if (whole[offset - 1] === "$" || whole[offset + expr.length] === "$") return false;
    return hasCjkContextAround(whole, offset, offset + expr.length) || hasMathKeywordContext(whole, offset);
  });

  value = wrapIf(value, shortNamedVarPattern, (expr, offset, whole) => {
    if (whole[offset - 1] === "$" || whole[offset + expr.length] === "$") return false;
    if (!hasMathKeywordContext(whole, offset)) return false;
    return !STRUCTURED_WORDS.has(expr) && !RESERVED_SHORT_IDENTIFIERS.has(expr);
  });

  for (const pattern of [variableListPattern, plainVariableListPattern]) {
    value = value.replace(pattern, (expr, offset: number, whole: string) => {
      if (isInsideProtectedPlaceholder(whole, offset)) return expr;
      if (whole[offset - 1] === "$" || whole[offset + expr.length] === "$") return expr;
      if (!hasCjkContextAround(whole, offset, offset + expr.length)) return expr;
      return formatVariableListExpression(expr.replace(/\s+/g, ""), counts);
    });
  }

  value = value.replace(/\$[^$\n]+\$/g, (match) => pushToken(wrappedSegments, WRAPPED_MATH_TOKEN, match));

  value = value.replace(/\b[A-Za-z]+(?:\[[^\]\n]+\]|_\{[^{}\n]+\}|_[A-Za-z0-9+\-]+)?\b|\b\d+\b/g, (token, offset: number, whole: string) => {
    if (isInsideProtectedPlaceholder(whole, offset)) return token;
    const prev = whole[offset - 1];
    const next = whole[offset + token.length];
    if (prev === "$" || next === "$") return token;
    if (next === "[" || prev === "]") return token;
    if (isInsideInlineMathSegment(whole, offset, offset + token.length)) return token;
    if (/[<>=\-+*/\[]/.test(prev ?? "") || /[<>=\-+*/\]]/.test(next ?? "")) return token;
    if (!isLikelyMathAtom(token)) return token;
    if (!hasCjkContextAround(whole, offset, offset + token.length)) return token;
    if (prev === "^" || next === "^") return token;
    return wrap(token);
  });

  return restoreProtectedSegments(value, WRAPPED_MATH_TOKEN, wrappedSegments);
}

function formatProtectedSpacing(value: string, counts: CountMap, rules: Record<SolutionFormatRuleId, boolean>): string {
  let next = value;
  if (rules.math_spacing) {
    next = formatMathSpacing(next, counts);
  }
  if (rules.cjk_spacing) {
    next = formatCjkSpacing(next, counts);
  }
  next = formatSafeSpacing(next, counts);
  return next;
}

function normalizeRestoredMathSpacingFinal(input: string): string {
  let value = input;
  for (let index = 0; index < 3; index += 1) {
    const next = value
      .replace(/([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])(\$[^$\n]+\$)/g, "$1 $2")
      .replace(/((?:\u51fa\u8fb9|\u5165\u8fb9|\u72b6\u6001|\u8f6c\u79fb))(\$[^$\n]+\$)/g, "$1 $2")
      .replace(/((?<![A-Za-z0-9_\\}\]\)])\$[^$\n]+\$)([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaffA-Za-z0-9])/g, "$1 $2");
    if (next === value) break;
    value = next;
  }
  return value;
}

function postProcessRestoredInlineText(input: string, counts: CountMap): string {
  let value = input
    .replace(/(?<![A-Za-z0-9_\\}\]\)])\$([^$\n]+)\$/g, (_match, content: string) => `$${content.trim()}$`)
    .replace(/\$\s+/g, "$")
    .replace(/\s+\$/g, "$");

  value = value.replace(/((?:(?<![A-Za-z0-9_\\}\]\)])\$[^$\n]+\$)|(?:[A-Za-z][A-Za-z0-9+\-]*))\.(?=$|\s|[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])/g, (_match, token: string) => {
    counts.punctuation_normalize += 1;
    return `${token}\u3002`;
  });

  return value;
}

function formatInlineContent(
  input: string,
  counts: CountMap,
  rules: Record<SolutionFormatRuleId, boolean>,
  options: InlineFormatOptions = {},
): string {
  const { body, trailingWhitespace } = splitTrailingInlineWhitespace(input);
  const codeSegments: string[] = [];
  const linkSegments: string[] = [];
  const urlSegments: string[] = [];
  const safeSegments: string[] = [];
  const mathSegments: string[] = [];
  let value = repairProtectedLiterals(body);

  value = protectMathSegments(value, counts, mathSegments);
  value = value.replace(/(`+)([^`\n]*?)\1/g, (match) => pushToken(codeSegments, CODE_TOKEN, match));
  if (options.allowLinkFormatting !== false) {
    value = protectLinksAndImages(value, counts, rules, linkSegments);
  }
  value = protectByPattern(value, /https?:\/\/[^\s)>]+/g, URL_TOKEN, urlSegments);
  value = protectSafeSegments(value, safeSegments);

  if (rules.inline_math_wrap) {
    value = formatInlineMathWrap(value, counts);
    value = protectMathSegments(value, counts, mathSegments);
  }
  if (rules.punctuation_normalize) {
    value = formatPunctuation(value, counts);
  }
  if (rules.cjk_spacing) {
    value = formatCjkSpacing(value, counts);
  }
  value = formatProtectedSpacing(value, counts, rules);
  if (rules.punctuation_normalize) {
    value = formatTokenAwarePunctuation(value, counts);
  }
  value = collapseInlineSpaces(value);

  value = restoreProtectedSegments(value, MATH_TOKEN, mathSegments);
  value = restoreProtectedSegments(value, SAFE_TOKEN, safeSegments);
  value = restoreProtectedSegments(value, URL_TOKEN, urlSegments);
  if (options.allowLinkFormatting !== false) {
    value = restoreLinksAndImages(value, linkSegments);
  }
  value = normalizeRestoredMathSpacingFinal(value);
  value = postProcessRestoredInlineText(value, counts);
  value = normalizeRestoredMathSpacingFinal(value);
  value = value.replace(/\$\s+/g, "$").replace(/\s+\$/g, "$");
  value = value.replace(/((?:\u51fa\u8fb9|\u5165\u8fb9|\u72b6\u6001|\u8f6c\u79fb))(\$[^$\n]+\$)/g, "$1 $2");
  value = value.replace(/(\u7b2c)(\$[^$\n]+\$)(\u4e2a)/g, "$1 $2 $3");
  value = value
    .replace(/([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])(\$[^$\n]+\$)/g, "$1 $2")
    .replace(/((?<![A-Za-z0-9_\\}\]\)])\$[^$\n]+\$)([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaffA-Za-z0-9])/g, "$1 $2");
  value = value.replace(/(?<![A-Za-z0-9_\\}\]\)])\$([^$\n]+)\$/g, (_match, content: string) => `$${content.trim()}$`);
  value = normalizeRestoredMathSpacingFinal(value);
  value = collapseInlineSpaces(value);
  value = restoreProtectedSegments(value, CODE_TOKEN, codeSegments);
  value = restoreProtectedSegments(value, MATH_TOKEN, mathSegments);
  return `${value}${trailingWhitespace}`;
}

function formatHeadingLine(
  line: string,
  counts: CountMap,
  rules: Record<SolutionFormatRuleId, boolean>,
): string {
  const headingMatch = line.match(/^(\s{0,3}#{1,6})(\s*)(.*)$/);
  if (!headingMatch) return line;
  const marker = headingMatch[1];
  const tail = headingMatch[3]?.trim() ?? "";
  if (!tail) return marker;
  if (rules.heading_marker_spacing && headingMatch[2] !== " ") {
    counts.heading_marker_spacing += 1;
  }
  return `${marker} ${formatInlineContent(tail, counts, rules)}`;
}

function formatQuoteLine(
  line: string,
  counts: CountMap,
  rules: Record<SolutionFormatRuleId, boolean>,
): string {
  const match = line.match(/^(\s{0,3})((?:>\s*)+)(.*)$/);
  if (!match) return line;
  const indent = match[1];
  const markerCount = match[2].match(/>/g)?.length ?? 0;
  const content = match[3].trimStart();
  const prefix = `${indent}${Array.from({ length: markerCount }, () => ">").join(" ")}${content ? " " : ""}`;
  return `${prefix}${content ? formatInlineContent(content, counts, rules) : ""}`;
}

function formatListLine(
  line: string,
  counts: CountMap,
  rules: Record<SolutionFormatRuleId, boolean>,
): string {
  const match = line.match(/^(\s*)([-+*]|\d+\.)(\s*)(.*)$/);
  if (!match) return line;
  const indent = match[1];
  const marker = match[2];
  const hadSpace = match[3].length > 0;
  const content = match[4];
  if (!content) return `${indent}${marker}`;
  if (rules.blank_lines_around_lists && !hadSpace) {
    counts.blank_lines_around_lists += 1;
  }
  return `${indent}${marker} ${formatInlineContent(content.trimStart(), counts, rules)}`;
}

function formatTableLine(
  line: string,
  counts: CountMap,
  rules: Record<SolutionFormatRuleId, boolean>,
): string {
  if (isTableSeparatorLine(line)) return line;

  const trimmed = line.trim();
  const leadingPipe = trimmed.startsWith("|");
  const trailingPipe = trimmed.endsWith("|");
  const inner = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = inner.split("|");
  const formattedCells = cells.map((cell) => {
    const trimmedCell = cell.trim();
    if (trimmedCell.length === 0) return " ";
    if (/^\d+\.\d+$/.test(trimmedCell)) {
      return ` ${trimmedCell} `;
    }
    if (/^[A-Za-z](?:\s*,\s*[A-Za-z])+$/i.test(trimmedCell)) {
      return ` ${formatVariableListExpression(trimmedCell.replace(/\s+/g, ""), counts)} `;
    }
    if (!trimmedCell.includes("`") && !trimmedCell.includes("$") && isLikelyMathAtom(trimmedCell) && !/^\d+\.\d+$/.test(trimmedCell)) {
      counts.inline_math_wrap += 1;
      return ` $${formatMathContent(trimmedCell, counts)}$ `;
    }
    return ` ${formatInlineContent(trimmedCell, counts, rules)} `;
  });

  return `${leadingPipe ? "|" : ""}${formattedCells.join("|")}${trailingPipe ? "|" : ""}`;
}

function formatBlockMath(lines: string[], counts: CountMap): string[] {
  return lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed === "$$") return line;
    const leading = line.match(/^\s*/)?.[0] ?? "";
    const trailing = line.match(/\s*$/)?.[0] ?? "";
    return `${leading}${formatMathContent(trimmed, counts)}${trailing}`;
  });
}

function formatTextBlock(
  input: string,
  counts: CountMap,
  rules: Record<SolutionFormatRuleId, boolean>,
): string {
  const lines = input.split("\n");
  const output: string[] = [];
  let inBlockMath = false;
  let blockMathBuffer: string[] = [];

  const flushBlockMath = () => {
    if (blockMathBuffer.length === 0) return;
    output.push(...formatBlockMath(blockMathBuffer, counts));
    blockMathBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "$$") {
      if (inBlockMath) {
        blockMathBuffer.push(line);
        flushBlockMath();
        inBlockMath = false;
      } else {
        flushBlockMath();
        inBlockMath = true;
        blockMathBuffer.push(line);
      }
      continue;
    }

    if (inBlockMath) {
      blockMathBuffer.push(line);
      continue;
    }

    if (trimmed.length === 0) {
      output.push(line);
      continue;
    }

    const { body, trailingWhitespace } = splitTrailingInlineWhitespace(line);

    if (isTableLikeLine(body)) {
      output.push(`${formatTableLine(body, counts, rules)}${trailingWhitespace}`);
      continue;
    }
    if (/^\s{0,3}#{1,6}(?:\s*|$)/.test(body)) {
      output.push(`${formatHeadingLine(body, counts, rules)}${trailingWhitespace}`);
      continue;
    }
    if (isQuoteLine(body)) {
      output.push(`${formatQuoteLine(body, counts, rules)}${trailingWhitespace}`);
      continue;
    }
    if (isListLine(body)) {
      output.push(`${formatListLine(body, counts, rules)}${trailingWhitespace}`);
      continue;
    }

    output.push(`${formatInlineContent(body, counts, rules)}${trailingWhitespace}`);
  }

  flushBlockMath();
  return output.join("\n");
}

function splitFenceBlocks(
  input: string,
  counts: CountMap,
  rules: Record<SolutionFormatRuleId, boolean>,
): FenceBlock[] {
  const lines = input.split("\n");
  const blocks: FenceBlock[] = [];
  let textBuffer: string[] = [];
  let fenceBuffer: string[] | null = null;
  let fenceMarker = "";

  const flushText = () => {
    if (textBuffer.length === 0) return;
    blocks.push({ type: "text", value: textBuffer.join("\n") });
    textBuffer = [];
  };

  const flushFence = () => {
    if (!fenceBuffer) return;
    blocks.push({ type: "fence", value: fenceBuffer.join("\n") });
    fenceBuffer = null;
    fenceMarker = "";
  };

  for (const line of lines) {
    if (fenceBuffer) {
      fenceBuffer.push(line);
      if (new RegExp(`^\\s{0,3}${escapeRegExp(fenceMarker)}\\s*$`).test(line)) {
        flushFence();
      }
      continue;
    }

    const openMatch = line.match(/^(\s{0,3})(`{3,}|~{3,})(.*)$/);
    if (!openMatch) {
      textBuffer.push(line);
      continue;
    }

    flushText();
    const indent = openMatch[1];
    fenceMarker = openMatch[2];
    const info = openMatch[3] ?? "";
    let nextLine = line;

    if (rules.normalize_code_fence_lang) {
      const trimmedInfo = info.trim();
      if (trimmedInfo.length > 0) {
        const [rawLang, ...rest] = trimmedInfo.split(/\s+/);
        const normalizedLang = CODE_FENCE_LANG_ALIASES.get(rawLang.toLowerCase());
        if (normalizedLang && normalizedLang !== rawLang) {
          counts.normalize_code_fence_lang += 1;
          nextLine = `${indent}${fenceMarker}${normalizedLang}${rest.length > 0 ? ` ${rest.join(" ")}` : ""}`;
        }
      }
    }

    fenceBuffer = [nextLine];
  }

  flushText();
  flushFence();
  return blocks;
}

function buildChanges(counts: CountMap): SolutionFormatChange[] {
  return (Object.keys(counts) as SolutionFormatRuleId[]).map((ruleId) => ({
    ruleId,
    message: CHANGE_MESSAGES[ruleId],
    count: counts[ruleId],
  }));
}

export function formatLuoguSolution(markdownBody: string, options: FormatLuoguSolutionOptions = {}): FormatSolutionResult {
  const eol = detectEol(markdownBody);
  const normalizedInput = normalizeNewlines(markdownBody);
  const counts = createInitialCounts();
  const rules = { ...DEFAULT_ENABLED_RULES, ...(options.enabledRules ?? {}) };

  const blocks = splitFenceBlocks(normalizedInput, counts, rules);
  const formatted = blocks
    .map((block) => (block.type === "text" ? formatTextBlock(block.value, counts, rules) : block.value))
    .join("\n");

  return {
    formattedBody: formatted.replace(/\n/g, eol),
    changes: buildChanges(counts),
  };
}

export function runSolutionFormatterSelfCheck(): void {
  const cases: Array<{ name: string; input: string; includes: string[]; excludes?: string[] }> = [
    {
      name: "protected punctuation",
      input: "\u6570\u636e\u8303\u56f4\u6ee1\u8db3 $1 \\le n \\le 10^5$,$1 \\le m \\le 2 \\times 10^5$,$0 \\le w \\le 10^9$.",
      includes: ["$1 \\le n \\le 10^5$\uFF0C$1 \\le m \\le 2 \\times 10^5$\uFF0C$0 \\le w \\le 10^9$\u3002"],
    },
    {
      name: "assignment and comparison",
      input: "\u521d\u59cb\u5316\u65f6dis_1=0,\u5176\u5b83\u70b9dis_i=inf.\u5982\u679cdis_u+w<dis_v,\u5c31\u66f4\u65b0dis_v=dis_u+w.\u7531\u4e8ew>=0,\u6240\u4ee5\u6b63\u786e.",
      includes: ["$dis_1 = 0$", "$dis_i = \\infty$", "$dis_u + w < dis_v$", "$dis_v = dis_u + w$", "$w \\ge 0$"],
    },
    {
      name: "edge arrow",
      input: "\u679a\u4e3e\u5b83\u7684\u6240\u6709\u51fa\u8fb9u->v\u3002\u4f46\u662f\u666e\u901a\u6587\u672c\u91cc\u7684a->b\u53ea\u662f\u6307\u9488\u5199\u6cd5\u3002",
      includes: ["\u51fa\u8fb9 $u \\to v$", "a->b"],
      excludes: ["$a \\to b$"],
    },
    {
      name: "simple expression",
      input: "\u7b2ci+1\u4e2a\u70b9\u53ef\u80fd\u4ece\u7b2ci\u4e2a\u70b9\u8f6c\u79fb\u3002",
      includes: ["\u7b2c $i + 1$ \u4e2a\u70b9\u53ef\u80fd\u4ece\u7b2c $i$ \u4e2a\u70b9\u8f6c\u79fb\u3002"],
      excludes: ["\u7b2c $i$+$1$ \u4e2a\u70b9"],
    },
    {
      name: "table decimal and variable list",
      input: "| \u5c0f\u6570 | 3.14 | \u4e0d\u5e94\u8be5\u6539 |\n| --- | --- | --- |\n| \u591a\u53d8\u91cf | n,m,l,r | \u5e94\u8be5\u53d8\u6210\u516c\u5f0f |",
      includes: ["| \u5c0f\u6570 | 3.14 | \u4e0d\u5e94\u8be5\u6539 |", "| \u591a\u53d8\u91cf | $n$\uFF0C$m$\uFF0C$l$\uFF0C$r$ | \u5e94\u8be5\u53d8\u6210\u516c\u5f0f |"],
      excludes: ["$3.14$"],
    },
    {
      name: "large number and times",
      input: "\u7b54\u6848ans\u53ef\u80fd\u8fbe\u523010^18,\u6570\u636e\u8303\u56f4\u67092*10^5\u6761\u8fb9.",
      includes: ["$ans$", "$10^18$", "$2 \\times 10^5$"],
      excludes: ["$10$^18"],
    },
    {
      name: "quote punctuation",
      input: ">\u8fd9\u91cc\u6709$a<=b$.",
      includes: ["> \u8fd9\u91cc\u6709 $a \\le b$\u3002"],
    },
    {
      name: "plain protection",
      input: "\u666e\u901a\u6587\u672c\u91cc\u7684cnt<=n\u5982\u679c\u4e0d\u662f\u6570\u5b66\u516c\u5f0f\uff0c\u4e5f\u4e0d\u5e94\u8be5\u88ab\u5f3a\u884c\u6539\u6210\u516c\u5f0f\u3002\u6587\u4ef6std.cpp\u548c\u5c0f\u65703.14\u90fd\u4e0d\u52a8\u3002",
      includes: ["cnt<=n", "std.cpp", "3.14"],
      excludes: ["$cnt \\le n$", "$3.14$", "std\u3002cpp"],
    },
    {
      name: "preserve blank lines and hard breaks",
      input: "# \u9898\u89e3\n\n\u7b2c\u4e00\u884c\u540e\u9762\u6709\u4e24\u4e2a\u7a7a\u683c  \n\u4e0b\u4e00\u884c\u5e94\u7ee7\u7eed\u4fdd\u7559\u4e3a\u72ec\u7acb\u6362\u884c\u3002\n\n\n- \u5217\u8868\u524d\u540e\u7684\u7a7a\u884c\u4e0d\u88ab\u5408\u5e76\n\n\u6700\u540e\u4e00\u6bb5",
      includes: ["# \u9898\u89e3\n\n", "\u7b2c\u4e00\u884c\u540e\u9762\u6709\u4e24\u4e2a\u7a7a\u683c  \n", "\n\n\n- "],
      excludes: ["# \u9898\u89e3\n\n\n", "\u6709\u4e24\u4e2a\u7a7a\u683c \n"],
    },
  ];

  for (const testCase of cases) {
    const result = formatLuoguSolution(testCase.input).formattedBody;
    if (result.split("\n").length !== testCase.input.split("\n").length) {
      throw new Error(`solution formatter self check failed: ${testCase.name}\nline count changed\n${result}`);
    }
    for (const expected of testCase.includes) {
      if (!result.includes(expected)) {
        throw new Error(`solution formatter self check failed: ${testCase.name}\nmissing: ${expected}\n${result}`);
      }
    }
    for (const unexpected of testCase.excludes ?? []) {
      if (result.includes(unexpected)) {
        throw new Error(`solution formatter self check failed: ${testCase.name}\nunexpected: ${unexpected}\n${result}`);
      }
    }
  }
}
