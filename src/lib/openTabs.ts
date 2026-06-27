import type { OpenFileTab } from "@/components/layout/OpenTabsBar";
import type { WorkingCopy } from "@/lib/workingCopies";
import type { NoteFileInfo } from "@/types/note";

export const OPEN_TABS_STORAGE_KEY = "oi-notebook.openTabs";
export const OPEN_TABS_ACTIVE_STORAGE_KEY = "oi-notebook.openTabs.activePath";

export function parseStoredOpenTabPaths(stored: string | null): string[] {
  if (stored === null) return [];

  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return normalizeOpenTabPaths(parsed);
  } catch {
    return [];
  }
}

export function parseStoredOpenTabsActivePath(stored: string | null): string | null {
  const path = stored?.trim();
  return path || null;
}

export function serializeOpenTabPaths(paths: string[]): string {
  return JSON.stringify(normalizeOpenTabPaths(paths));
}

export function normalizeOpenTabPaths(values: unknown[]): string[] {
  const paths: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const path = value.trim();
    if (!path || paths.includes(path)) continue;
    paths.push(path);
  }

  return paths;
}

export function filterValidOpenTabPaths(paths: string[], validPaths: Set<string>): string[] {
  return paths.filter((path) => validPaths.has(path));
}

export function getNoteDisplayName(path: string, files: NoteFileInfo[]): string {
  const file = files.find((item) => item.path === path);
  const title = file?.displayTitle?.trim();
  if (title) return title;
  const name = file?.name ?? path.split("/").pop() ?? path;
  return name.replace(/\.md$/i, "") || path;
}

export function buildOpenFileTabs(
  workingCopies: Record<string, WorkingCopy>,
  openTabPaths: string[],
  displayFiles: NoteFileInfo[],
): OpenFileTab[] {
  return Object.values(workingCopies)
    .filter((copy) => copy.kind !== "note" || openTabPaths.includes(copy.path ?? ""))
    .map((copy) => ({
      kind: "file",
      id: copy.id,
      path: copy.path,
      externalPath: copy.absolutePath,
      displayName: copy.kind === "note" && copy.path ? getNoteDisplayName(copy.path, displayFiles) : copy.displayName,
      dirty: copy.dirty,
    }));
}

export function getNextOpenTabPathAfterClose(openTabs: OpenFileTab[], closingPath: string): string | null {
  const visibleNoteTabsAfterClose = openTabs.filter((item) => item.kind === "file" && item.path && item.path !== closingPath);
  const visibleTabIndex = openTabs.findIndex((item) => item.kind === "file" && item.path === closingPath);
  return (
    visibleNoteTabsAfterClose[visibleTabIndex]?.path ??
    visibleNoteTabsAfterClose[visibleTabIndex - 1]?.path ??
    null
  );
}
