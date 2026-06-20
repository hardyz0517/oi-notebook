import type { NoteFileInfo } from "@/types/note";
import { normalizeNoteFileName } from "@/lib/notePathHelpers";

export type NewNoteLocationOption = "root" | "current" | "tricks" | "problems" | "custom";

export function getNoteDirectories(files: NoteFileInfo[]): string[] {
  return files
    .filter((file) => file.isDirectory)
    .map((file) => file.path)
    .sort((a, b) => a.localeCompare(b, "zh-CN", { sensitivity: "base" }));
}

export function getCurrentNoteDirectory(currentFilePath: string | null): string {
  if (!currentFilePath || !currentFilePath.includes("/")) return "";
  return currentFilePath.slice(0, currentFilePath.lastIndexOf("/"));
}

export function normalizeCustomNoteDirectory(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function resolveNewNoteDirectory(
  option: NewNoteLocationOption,
  customDirectory: string,
  currentDirectory: string,
): string {
  if (option === "root") return "";
  if (option === "tricks") return "tricks";
  if (option === "problems") return "problems";
  if (option === "custom") return normalizeCustomNoteDirectory(customDirectory);
  return currentDirectory;
}

export function buildRenameNotePath(targetPath: string, nextName: string, isDirectory: boolean): string {
  const lastSlashIndex = targetPath.lastIndexOf("/");
  const directoryPrefix = lastSlashIndex === -1 ? "" : targetPath.slice(0, lastSlashIndex + 1);
  const normalizedName = isDirectory ? nextName.trim() : normalizeNoteFileName(nextName);
  return `${directoryPrefix}${normalizedName}`;
}

export function findEntryCaseInsensitive(
  files: NoteFileInfo[],
  path: string,
  isDirectory: boolean,
): NoteFileInfo | undefined {
  const normalized = path.toLowerCase();
  return files.find((file) => Boolean(file.isDirectory) === isDirectory && file.path.toLowerCase() === normalized);
}

export function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

export function buildNewNoteMarkdown(title: string, tags: string[], createdAt = new Date().toISOString()): string {
  const quotedTitle = quoteYamlString(title);
  const tagText = tags.length > 0 ? `[${tags.map(quoteYamlString).join(", ")}]` : "[]";
  return `---\ntitle: ${quotedTitle}\ntags: ${tagText}\ncreatedAt: ${quoteYamlString(createdAt)}\n---\n`;
}

export function getSelectedTreeCreateParent(
  activeTreeDirectoryPath: string | null,
  activeTreeFilePath: string | null,
): string {
  if (activeTreeDirectoryPath !== null) return activeTreeDirectoryPath;
  if (activeTreeFilePath) {
    const slashIndex = activeTreeFilePath.lastIndexOf("/");
    return slashIndex === -1 ? "" : activeTreeFilePath.slice(0, slashIndex);
  }
  return "";
}

export function getDefaultNewNoteCreateParent(
  activeTreeDirectoryPath: string | null,
  activeTreeFilePath: string | null,
  currentDirectory: string,
): string {
  if (activeTreeDirectoryPath !== null || activeTreeFilePath) {
    return getSelectedTreeCreateParent(activeTreeDirectoryPath, activeTreeFilePath);
  }
  return currentDirectory;
}

export interface NoteTreeSelectionState {
  activeTreeDirectoryPath: string | null;
  activeTreeFilePath: string | null;
}

export function getTreeSelectionAfterDirectorySelect(path: string): NoteTreeSelectionState {
  return {
    activeTreeDirectoryPath: path,
    activeTreeFilePath: null,
  };
}

export function getTreeSelectionAfterFileSelect(path: string): NoteTreeSelectionState {
  return {
    activeTreeDirectoryPath: null,
    activeTreeFilePath: path,
  };
}

export function getTreeSelectionAfterClear(): NoteTreeSelectionState {
  return {
    activeTreeDirectoryPath: null,
    activeTreeFilePath: null,
  };
}

export function rewriteNotePathReference(
  path: string,
  oldPath: string,
  newPath: string,
  isDirectory: boolean,
): string {
  if (isDirectory) {
    return path === oldPath || path.startsWith(`${oldPath}/`)
      ? `${newPath}${path.slice(oldPath.length)}`
      : path;
  }
  return path === oldPath ? newPath : path;
}

export function isNotePathAffectedByTarget(path: string, targetPath: string, isDirectory: boolean): boolean {
  return path === targetPath || (isDirectory && path.startsWith(`${targetPath}/`));
}

export function filterDeletedNoteTabs(tabPaths: string[], deletedPath: string, isDirectory: boolean): string[] {
  return tabPaths.filter((tabPath) => !isNotePathAffectedByTarget(tabPath, deletedPath, isDirectory));
}

export interface DeletedNoteWorkspaceReferences {
  openTabPaths: string[];
  currentFilePath: string | null;
  activeWorkspaceTabId: string | null;
  activeTreeDirectoryPath: string | null;
  activeTreeFilePath: string | null;
}

export interface RemovedDeletedNoteWorkspaceReferences extends DeletedNoteWorkspaceReferences {
  shouldClearDirty: boolean;
}

export function removeDeletedNoteWorkspaceReferences(
  references: DeletedNoteWorkspaceReferences,
  deletedPath: string,
  isDirectory: boolean,
): RemovedDeletedNoteWorkspaceReferences {
  const currentFileAffected = references.currentFilePath
    ? isNotePathAffectedByTarget(references.currentFilePath, deletedPath, isDirectory)
    : false;

  return {
    openTabPaths: filterDeletedNoteTabs(references.openTabPaths, deletedPath, isDirectory),
    currentFilePath: currentFileAffected ? null : references.currentFilePath,
    activeWorkspaceTabId: currentFileAffected ? null : references.activeWorkspaceTabId,
    activeTreeDirectoryPath:
      isDirectory && references.activeTreeDirectoryPath && isNotePathAffectedByTarget(references.activeTreeDirectoryPath, deletedPath, true)
        ? null
        : references.activeTreeDirectoryPath,
    activeTreeFilePath:
      references.activeTreeFilePath && isNotePathAffectedByTarget(references.activeTreeFilePath, deletedPath, isDirectory)
        ? null
        : references.activeTreeFilePath,
    shouldClearDirty: currentFileAffected,
  };
}

export interface NoteWorkspacePendingFileSelection {
  path: string;
  [key: string]: unknown;
}

export interface NoteWorkspaceReviewTabReference {
  id: string;
  notePath: string;
}

export interface NoteWorkspacePathReferences {
  openTabPaths: string[];
  pendingFileSelection: NoteWorkspacePendingFileSelection | null;
  pendingAssetsByFile: Record<string, string[]>;
  openReviewTabs: NoteWorkspaceReviewTabReference[];
  currentFilePath: string | null;
  activeWorkspaceTabId: string | null;
  activeWorkingCopyId: string | null;
  activeTreeDirectoryPath: string | null;
  activeTreeFilePath: string | null;
  savedSnapshotPath: string | null;
}

function rewriteNoteWorkspaceTabId(tabId: string | null, rewritePath: (path: string) => string): string | null {
  if (!tabId || tabId.startsWith("review:")) return tabId;
  if (tabId.startsWith("note:")) return `note:${rewritePath(tabId.slice("note:".length))}`;
  return rewritePath(tabId);
}

function rewriteNullableNotePath(path: string | null, rewritePath: (path: string) => string): string | null {
  return path ? rewritePath(path) : path;
}

export function rewriteNoteWorkspaceReferences(
  references: NoteWorkspacePathReferences,
  oldPath: string,
  newPath: string,
  isDirectory: boolean,
): NoteWorkspacePathReferences {
  const rewritePath = (path: string) => rewriteNotePathReference(path, oldPath, newPath, isDirectory);
  const pendingAssetsByFile: Record<string, string[]> = {};
  for (const [path, assets] of Object.entries(references.pendingAssetsByFile)) {
    const rewritten = rewritePath(path);
    pendingAssetsByFile[rewritten] = [...(pendingAssetsByFile[rewritten] ?? []), ...assets];
  }

  return {
    openTabPaths: references.openTabPaths.map(rewritePath),
    pendingFileSelection: references.pendingFileSelection
      ? { ...references.pendingFileSelection, path: rewritePath(references.pendingFileSelection.path) }
      : references.pendingFileSelection,
    pendingAssetsByFile,
    openReviewTabs: references.openReviewTabs.map((tab) => ({ ...tab, notePath: rewritePath(tab.notePath) })),
    currentFilePath: rewriteNullableNotePath(references.currentFilePath, rewritePath),
    activeWorkspaceTabId: rewriteNoteWorkspaceTabId(references.activeWorkspaceTabId, rewritePath),
    activeWorkingCopyId: rewriteNoteWorkspaceTabId(references.activeWorkingCopyId, rewritePath),
    activeTreeDirectoryPath: rewriteNullableNotePath(references.activeTreeDirectoryPath, rewritePath),
    activeTreeFilePath: rewriteNullableNotePath(references.activeTreeFilePath, rewritePath),
    savedSnapshotPath: rewriteNullableNotePath(references.savedSnapshotPath, rewritePath),
  };
}
