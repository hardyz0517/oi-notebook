export interface FrontmatterFields {
  title: string;
  tags: string[];
  summary: string;
  draft: boolean;
  difficulty: string;
  source: string;
}

export interface ParsedFrontmatter {
  fields: FrontmatterFields;
  hasFrontmatter: boolean;
  canMerge: boolean;
  canEditTags: boolean;
  warning: string | null;
}

export interface FrontmatterMetadataPatch {
  title: string;
  tags: string[];
  summary: string;
}

type SplitFrontmatterResult =
  | { kind: "none"; body: string }
  | { kind: "unclosed" }
  | { kind: "found"; yaml: string; body: string };

type TagParseResult =
  | { ok: true; tags: string[]; start: number; end: number }
  | { ok: false; start: number; end: number };

const EMPTY_FIELDS: FrontmatterFields = {
  title: "",
  tags: [],
  summary: "",
  draft: false,
  difficulty: "",
  source: "",
};

const KNOWN_FIELD_ORDER: Array<keyof FrontmatterFields> = [
  "title",
  "tags",
  "difficulty",
  "source",
  "summary",
  "draft",
];

export function splitFrontmatter(markdown: string): SplitFrontmatterResult {
  const openerLength = markdown.startsWith("---\r\n")
    ? 5
    : markdown.startsWith("---\n")
      ? 4
      : -1;

  if (openerLength === -1) {
    return { kind: "none", body: markdown };
  }

  let cursor = openerLength;

  while (cursor < markdown.length) {
    const lineEnd = markdown.indexOf("\n", cursor);
    let lineContentEnd = lineEnd === -1 ? markdown.length : lineEnd;

    if (lineContentEnd > cursor && markdown[lineContentEnd - 1] === "\r") {
      lineContentEnd -= 1;
    }

    if (markdown.slice(cursor, lineContentEnd) === "---") {
      const bodyStart = lineEnd === -1 ? markdown.length : lineEnd + 1;
      return {
        kind: "found",
        yaml: markdown.slice(openerLength, cursor),
        body: markdown.slice(bodyStart),
      };
    }

    if (lineEnd === -1) break;
    cursor = lineEnd + 1;
  }

  return { kind: "unclosed" };
}

export function parseFrontmatterFields(markdown: string): ParsedFrontmatter {
  const split = splitFrontmatter(markdown);

  if (split.kind === "unclosed") {
    return {
      fields: { ...EMPTY_FIELDS },
      hasFrontmatter: true,
      canMerge: false,
      canEditTags: false,
      warning: "frontmatter 缺少闭合 ---，已暂停表单改写",
    };
  }

  if (split.kind === "none") {
    return {
      fields: { ...EMPTY_FIELDS },
      hasFrontmatter: false,
      canMerge: true,
      canEditTags: true,
      warning: null,
    };
  }

  const fields = { ...EMPTY_FIELDS };
  const lines = splitLines(split.yaml);
  const tagResult = parseTags(lines);
  let canEditTags = true;

  if (tagResult.ok) {
    fields.tags = tagResult.tags;
  } else {
    canEditTags = false;
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (index >= tagResult.start && index <= tagResult.end) continue;
    const parsed = parseTopLevelKeyValue(lines[index]);
    if (!parsed) continue;

    if (parsed.key === "title") fields.title = parseScalar(parsed.value);
    else if (parsed.key === "summary") fields.summary = parseScalar(parsed.value);
    else if (parsed.key === "difficulty") fields.difficulty = parseScalar(parsed.value);
    else if (parsed.key === "source") fields.source = parseScalar(parsed.value);
    else if (parsed.key === "draft") fields.draft = parseBoolean(parsed.value);
  }

  return {
    fields,
    hasFrontmatter: true,
    canMerge: true,
    canEditTags,
    warning: canEditTags ? null : "tags 使用了复杂 YAML，第一版暂不通过表单改写 tags",
  };
}

export function mergeFrontmatterFields(
  markdown: string,
  fields: FrontmatterFields,
): string {
  const split = splitFrontmatter(markdown);

  if (split.kind === "unclosed") {
    return markdown;
  }

  if (split.kind === "none") {
    return `---\n${serializeKnownFields(fields)}---\n${markdown}`;
  }

  const lines = splitLines(split.yaml);
  const tagResult = parseTags(lines);
  const fieldLines = new Map<keyof FrontmatterFields, number>();

  for (let index = 0; index < lines.length; index += 1) {
    if (index >= tagResult.start && index <= tagResult.end) continue;
    const parsed = parseTopLevelKeyValue(lines[index]);
    if (!parsed) continue;
    if (isKnownField(parsed.key) && parsed.key !== "tags") {
      fieldLines.set(parsed.key, index);
    }
  }

  for (const key of KNOWN_FIELD_ORDER) {
    if (key === "tags") continue;
    const lineIndex = fieldLines.get(key);
    if (lineIndex === undefined) continue;
    lines[lineIndex] = serializeField(key, fields);
  }

  if (tagResult.ok && tagResult.start >= 0) {
    const tagLines = serializeTags(fields.tags);
    lines.splice(tagResult.start, tagResult.end - tagResult.start + 1, ...tagLines);
  }

  const existingFields = collectKnownFields(lines);
  const missingLines = KNOWN_FIELD_ORDER
    .filter((key) => !existingFields.has(key))
    .map((key) => serializeField(key, fields));

  const yaml = [...lines, ...missingLines].join("\n");
  const yamlWithTrailingNewline = yaml.length > 0 ? `${yaml}\n` : "";
  return `---\n${yamlWithTrailingNewline}---\n${split.body}`;
}

export function mergeFrontmatterMetadata(
  markdown: string,
  patch: FrontmatterMetadataPatch,
): string {
  const split = splitFrontmatter(markdown);

  if (split.kind === "unclosed") {
    return markdown;
  }

  if (split.kind === "none") {
    return `---\n${serializeMetadataPatch(patch)}---\n${markdown}`;
  }

  const lines = splitLines(split.yaml);
  const tagResult = parseTags(lines);
  const fieldLines = new Map<"title" | "summary", number>();

  for (let index = 0; index < lines.length; index += 1) {
    if (index >= tagResult.start && index <= tagResult.end) continue;
    const parsed = parseTopLevelKeyValue(lines[index]);
    if (!parsed) continue;
    if (parsed.key === "title" || parsed.key === "summary") {
      fieldLines.set(parsed.key, index);
    }
  }

  const titleLine = fieldLines.get("title");
  if (titleLine === undefined) {
    lines.push(`title: ${formatScalar(patch.title)}`);
  } else {
    lines[titleLine] = `title: ${formatScalar(patch.title)}`;
  }

  const summaryLine = fieldLines.get("summary");
  if (summaryLine === undefined) {
    lines.push(`summary: ${formatScalar(patch.summary)}`);
  } else {
    lines[summaryLine] = `summary: ${formatScalar(patch.summary)}`;
  }

  if (tagResult.ok && tagResult.start >= 0) {
    const tagLines = serializeTags(patch.tags);
    lines.splice(tagResult.start, tagResult.end - tagResult.start + 1, ...tagLines);
  } else if (tagResult.ok) {
    lines.push(...serializeTags(patch.tags));
  }

  const yaml = lines.join("\n");
  const yamlWithTrailingNewline = yaml.length > 0 ? `${yaml}\n` : "";
  return `---\n${yamlWithTrailingNewline}---\n${split.body}`;
}

function splitLines(value: string): string[] {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((line, index, lines) => {
    return index < lines.length - 1 || line.length > 0;
  });
}

function parseTopLevelKeyValue(line: string): { key: string; value: string } | null {
  if (/^\s/.test(line)) return null;
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/);
  if (!match) return null;
  return { key: match[1], value: match[2].trim() };
}

function parseTags(lines: string[]): TagParseResult {
  const tagLineIndex = lines.findIndex((line) => parseTopLevelKeyValue(line)?.key === "tags");

  if (tagLineIndex === -1) {
    return { ok: true, tags: [], start: -1, end: -1 };
  }

  const parsed = parseTopLevelKeyValue(lines[tagLineIndex]);
  const value = parsed?.value ?? "";

  if (value !== "") {
    const flowTags = parseFlowTags(value);
    if (!flowTags) return { ok: false, start: tagLineIndex, end: tagLineIndex };
    return { ok: true, tags: flowTags, start: tagLineIndex, end: tagLineIndex };
  }

  const tags: string[] = [];
  let end = tagLineIndex;

  for (let index = tagLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (parseTopLevelKeyValue(line)) break;
    if (line.trim() === "") {
      end = index;
      continue;
    }

    const item = line.match(/^\s*-\s+(.+?)\s*$/);
    if (!item) return { ok: false, start: tagLineIndex, end: index };

    const valueText = item[1].trim();
    if (!isSimpleScalar(valueText)) return { ok: false, start: tagLineIndex, end: index };
    tags.push(parseScalar(valueText));
    end = index;
  }

  return { ok: true, tags, start: tagLineIndex, end };
}

function parseFlowTags(value: string): string[] | null {
  if (value === "[]") return [];
  if (!value.startsWith("[") || !value.endsWith("]")) return null;

  const inner = value.slice(1, -1).trim();
  if (!inner) return [];

  const parts = splitFlowItems(inner);
  if (!parts) return null;

  const tags: string[] = [];

  for (const part of parts) {
    const valueText = part.trim();
    if (!valueText || !isSimpleScalar(valueText)) return null;
    tags.push(parseScalar(valueText));
  }

  return tags;
}

function splitFlowItems(value: string): string[] | null {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if ((char === '"' || char === "'") && (index === 0 || value[index - 1] !== "\\")) {
      if (quote === char) {
        quote = null;
      } else if (quote === null) {
        quote = char;
      }
    }

    if (char === "," && quote === null) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (quote !== null) return null;
  parts.push(current);
  return parts;
}

function parseScalar(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseBoolean(value: string): boolean {
  return value.trim().toLowerCase() === "true";
}

function isSimpleScalar(value: string): boolean {
  if (!value) return true;
  if (value.includes("[") || value.includes("]") || value.includes("{") || value.includes("}")) {
    return false;
  }
  return !value.includes(": ");
}

function serializeKnownFields(fields: FrontmatterFields): string {
  return KNOWN_FIELD_ORDER.map((key) => serializeField(key, fields)).join("\n") + "\n";
}

function serializeMetadataPatch(patch: FrontmatterMetadataPatch): string {
  return [
    `title: ${formatScalar(patch.title)}`,
    ...serializeTags(patch.tags),
    `summary: ${formatScalar(patch.summary)}`,
  ].join("\n") + "\n";
}

function serializeField(key: keyof FrontmatterFields, fields: FrontmatterFields): string {
  if (key === "tags") return serializeTags(fields.tags).join("\n");
  if (key === "draft") return `draft: ${fields.draft ? "true" : "false"}`;
  return `${key}: ${formatScalar(fields[key])}`;
}

function serializeTags(tags: string[]): string[] {
  if (tags.length === 0) return ["tags: []"];
  return ["tags:", ...tags.map((tag) => `- ${formatScalar(tag)}`)];
}

function formatScalar(value: string | string[] | boolean): string {
  if (typeof value !== "string") return String(value);
  if (value === "") return '""';
  if (/[:#[\]{},&*!|>'"%@`]/.test(value) || /^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function isKnownField(key: string): key is keyof FrontmatterFields {
  return KNOWN_FIELD_ORDER.includes(key as keyof FrontmatterFields);
}

function collectKnownFields(lines: string[]): Set<keyof FrontmatterFields> {
  const fields = new Set<keyof FrontmatterFields>();

  for (const line of lines) {
    const parsed = parseTopLevelKeyValue(line);
    if (parsed && isKnownField(parsed.key)) {
      fields.add(parsed.key);
    }
  }

  return fields;
}
