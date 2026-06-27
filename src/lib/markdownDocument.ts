import { splitFrontmatter } from "./frontmatter";

export interface LoadedMarkdownParts {
  frontmatterPrefix: string;
  body: string;
  warning: string | null;
}

export interface SavedNoteSnapshot {
  path: string | null;
  frontmatterPrefix: string;
  markdown: string;
}

export function splitLoadedMarkdown(markdown: string): LoadedMarkdownParts {
  const split = splitFrontmatter(markdown);

  if (split.kind === "found") {
    return {
      frontmatterPrefix: markdown.slice(0, markdown.length - split.body.length),
      body: split.body,
      warning: null,
    };
  }

  if (split.kind === "unclosed") {
    return {
      frontmatterPrefix: "",
      body: markdown,
      warning: "frontmatter 缺少闭合 ---，已作为正文载入以避免丢数据",
    };
  }

  return {
    frontmatterPrefix: "",
    body: split.body,
    warning: null,
  };
}

export function combineMarkdown(frontmatterPrefix: string, body: string): string {
  return `${frontmatterPrefix}${body}`;
}

export function isSnapshotDirty(
  snapshot: SavedNoteSnapshot,
  path: string | null,
  nextFrontmatterPrefix: string,
  nextMarkdown: string,
): boolean {
  if (path === null) return false;
  return (
    snapshot.path !== path ||
    snapshot.frontmatterPrefix !== nextFrontmatterPrefix ||
    snapshot.markdown !== nextMarkdown
  );
}
