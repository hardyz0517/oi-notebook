export type WorkingCopyKind = "note" | "external" | "untitled";

export interface WorkingCopySnapshot {
  pathKey: string | null;
  frontmatterPrefix: string;
  markdown: string;
}

export interface WorkingCopy {
  id: string;
  kind: WorkingCopyKind;
  path: string | null;
  absolutePath: string | null;
  displayName: string;
  frontmatterPrefix: string;
  markdown: string;
  savedSnapshot: WorkingCopySnapshot;
  dirty: boolean;
}

export interface WorkingCopyContent {
  frontmatterPrefix: string;
  markdown: string;
}

export function getNoteWorkingCopyId(relativePath: string): string {
  return `note:${relativePath}`;
}

export function getExternalWorkingCopyId(absolutePath: string): string {
  return `external:${absolutePath}`;
}

export function getUntitledWorkingCopyId(sequence: number): string {
  return `untitled:${sequence}`;
}

export function getWorkingCopyPathKey(copy: Pick<WorkingCopy, "kind" | "path" | "absolutePath">): string | null {
  if (copy.kind === "note") return copy.path ? getNoteWorkingCopyId(copy.path) : null;
  if (copy.kind === "external") return copy.absolutePath ? getExternalWorkingCopyId(copy.absolutePath) : null;
  return null;
}

export function isWorkingCopyDirty(
  snapshot: WorkingCopySnapshot,
  pathKey: string | null,
  content: WorkingCopyContent,
): boolean {
  return (
    snapshot.pathKey !== pathKey ||
    snapshot.frontmatterPrefix !== content.frontmatterPrefix ||
    snapshot.markdown !== content.markdown
  );
}

export function createUntitledWorkingCopy(sequence: number): WorkingCopy {
  const id = getUntitledWorkingCopyId(sequence);
  return {
    id,
    kind: "untitled",
    path: null,
    absolutePath: null,
    displayName: `Untitled-${sequence}`,
    frontmatterPrefix: "",
    markdown: "",
    savedSnapshot: {
      pathKey: null,
      frontmatterPrefix: "",
      markdown: "",
    },
    dirty: false,
  };
}

export function createNoteWorkingCopy(
  relativePath: string,
  displayName: string,
  content: WorkingCopyContent,
): WorkingCopy {
  const id = getNoteWorkingCopyId(relativePath);
  return {
    id,
    kind: "note",
    path: relativePath,
    absolutePath: null,
    displayName,
    frontmatterPrefix: content.frontmatterPrefix,
    markdown: content.markdown,
    savedSnapshot: {
      pathKey: id,
      frontmatterPrefix: content.frontmatterPrefix,
      markdown: content.markdown,
    },
    dirty: false,
  };
}

export function createExternalWorkingCopy(
  absolutePath: string,
  displayName: string,
  content: WorkingCopyContent,
): WorkingCopy {
  const id = getExternalWorkingCopyId(absolutePath);
  return {
    id,
    kind: "external",
    path: null,
    absolutePath,
    displayName,
    frontmatterPrefix: content.frontmatterPrefix,
    markdown: content.markdown,
    savedSnapshot: {
      pathKey: id,
      frontmatterPrefix: content.frontmatterPrefix,
      markdown: content.markdown,
    },
    dirty: false,
  };
}

export function updateWorkingCopyContent(copy: WorkingCopy, content: WorkingCopyContent): WorkingCopy {
  const pathKey = getWorkingCopyPathKey(copy);
  return {
    ...copy,
    frontmatterPrefix: content.frontmatterPrefix,
    markdown: content.markdown,
    dirty: isWorkingCopyDirty(copy.savedSnapshot, pathKey, content),
  };
}

export function markWorkingCopySaved(copy: WorkingCopy, content: WorkingCopyContent): WorkingCopy {
  const pathKey = getWorkingCopyPathKey(copy);
  return {
    ...copy,
    frontmatterPrefix: content.frontmatterPrefix,
    markdown: content.markdown,
    savedSnapshot: {
      pathKey,
      frontmatterPrefix: content.frontmatterPrefix,
      markdown: content.markdown,
    },
    dirty: false,
  };
}
