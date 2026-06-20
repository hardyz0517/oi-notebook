import type { NoteFileInfo } from "@/types/note";
import { joinNotePath, normalizeNoteFileName, validateNoteDirectoryPathInput, validateNoteNamePart } from "@/lib/notePathHelpers";

export type NewNoteLocationOption = "root" | "current" | "tricks" | "problems" | "custom";
export type FolderDialogMode = "create" | "rename" | "create-folder" | null;

export interface FolderDialogState {
  nameValidationMessage: string | null;
  parentValidationMessage: string | null;
  helpText: string;
  canConfirm: boolean;
}

export interface RenameDialogInitialState {
  dialogMode: "rename";
  dialogValue: string;
  renameTarget: string;
  renameTargetIsDirectory: boolean;
}

export interface CreateFolderDialogInitialState {
  returnToCreateAfterFolder: boolean;
  dialogMode: "create-folder";
  dialogValue: string;
  folderParentDirectory: string;
}

export interface ClosedNoteDialogState {
  dialogMode: null;
  dialogValue: string;
  newNoteLocationOption: NewNoteLocationOption;
  newNoteCustomDirectory: string;
  newNoteTags: string[];
  folderParentDirectory: string;
  returnToCreateAfterFolder: boolean;
  renameTarget: string | null;
  renameTargetIsDirectory: boolean;
}

export interface NoteWorkspaceCreatePlan {
  path: string;
  title: string;
  error: string | null;
}

export interface NoteWorkspaceCreateFolderPlan {
  path: string;
  error: string | null;
}

export interface NoteWorkspaceRenamePlan {
  path: string;
  shouldClose: boolean;
  error: string | null;
}

const FOLDER_DIALOG_DEFAULT_HELP_TEXT = "名称不能包含路径穿越或 Windows 非法字符";

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

export function getRenameDialogInitialState(path: string, isDirectory = false): RenameDialogInitialState {
  const filename = path.split("/").pop() ?? path;
  return {
    dialogMode: "rename",
    dialogValue: isDirectory ? filename : filename.replace(/\.md$/i, ""),
    renameTarget: path,
    renameTargetIsDirectory: isDirectory,
  };
}

export function getCreateFolderDialogInitialState(
  activeDialogMode: FolderDialogMode,
  resolvedNewNoteDirectory: string,
  currentNoteDirectory: string,
): CreateFolderDialogInitialState {
  const returnToCreateAfterFolder = activeDialogMode === "create";
  return {
    returnToCreateAfterFolder,
    dialogMode: "create-folder",
    dialogValue: "",
    folderParentDirectory: returnToCreateAfterFolder ? resolvedNewNoteDirectory : currentNoteDirectory,
  };
}

export function getClosedNoteDialogState(): ClosedNoteDialogState {
  return {
    dialogMode: null,
    dialogValue: "",
    newNoteLocationOption: "current",
    newNoteCustomDirectory: "",
    newNoteTags: [],
    folderParentDirectory: "",
    returnToCreateAfterFolder: false,
    renameTarget: null,
    renameTargetIsDirectory: false,
  };
}

export function getFolderDialogState(
  dialogMode: FolderDialogMode,
  folderName: string,
  parentDirectory: string,
): FolderDialogState {
  const isCreateFolder = dialogMode === "create-folder";
  const nameValidationMessage =
    isCreateFolder && folderName.trim()
      ? validateNoteNamePart(folderName, "folder")
      : null;
  const parentValidationMessage =
    isCreateFolder && parentDirectory.trim()
      ? validateNoteDirectoryPathInput(parentDirectory)
      : null;

  return {
    nameValidationMessage,
    parentValidationMessage,
    helpText: nameValidationMessage ?? parentValidationMessage ?? FOLDER_DIALOG_DEFAULT_HELP_TEXT,
    canConfirm: isCreateFolder && Boolean(folderName.trim()) && !nameValidationMessage && !parentValidationMessage,
  };
}

export function findEntryCaseInsensitive(
  files: NoteFileInfo[],
  path: string,
  isDirectory: boolean,
): NoteFileInfo | undefined {
  const normalized = path.toLowerCase();
  return files.find((file) => Boolean(file.isDirectory) === isDirectory && file.path.toLowerCase() === normalized);
}

export function getCreateNotePlan(
  files: NoteFileInfo[],
  directory: string,
  name: string,
): NoteWorkspaceCreatePlan {
  const fileError = validateNoteNamePart(name, "file");
  if (fileError) return { path: "", title: "", error: fileError };

  const directoryError = validateNoteDirectoryPathInput(directory);
  if (directoryError) return { path: "", title: "", error: directoryError };

  const filename = normalizeNoteFileName(name);
  const path = joinNotePath(directory, filename);
  if (findEntryCaseInsensitive(files, path, false)) {
    return { path, title: name.trim().replace(/\.md$/i, ""), error: "同目录已存在同名笔记" };
  }

  return { path, title: name.trim().replace(/\.md$/i, ""), error: null };
}

export function getCreateFolderPlan(
  files: NoteFileInfo[],
  parentDirectory: string,
  name: string,
): NoteWorkspaceCreateFolderPlan {
  const nameError = validateNoteNamePart(name, "folder");
  if (nameError) return { path: "", error: nameError };

  const parentError = validateNoteDirectoryPathInput(parentDirectory);
  if (parentError) return { path: "", error: parentError };

  const path = joinNotePath(parentDirectory, name.trim());
  if (findEntryCaseInsensitive(files, path, true)) {
    return { path, error: "同目录已存在同名文件夹" };
  }
  if (findEntryCaseInsensitive(files, `${path}.md`, false)) {
    return { path, error: "同目录已存在同名笔记" };
  }

  return { path, error: null };
}

export function getRenameNotePlan(
  files: NoteFileInfo[],
  targetPath: string,
  nextName: string,
  isDirectory: boolean,
): NoteWorkspaceRenamePlan {
  const nameError = validateNoteNamePart(nextName, isDirectory ? "folder" : "file");
  if (nameError) return { path: "", shouldClose: false, error: nameError };

  const path = buildRenameNotePath(targetPath, nextName, isDirectory);
  if (path === targetPath) return { path, shouldClose: true, error: null };

  const existing = findEntryCaseInsensitive(files, path, isDirectory);
  if (existing && existing.path.toLowerCase() !== targetPath.toLowerCase()) {
    return {
      path,
      shouldClose: false,
      error: isDirectory ? "同目录已存在同名文件夹" : "同目录已存在同名笔记",
    };
  }

  return { path, shouldClose: false, error: null };
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

export interface NoteTreeInlineCreateRequest {
  parentPath: string;
  requestId: number;
}

export interface NoteTreeInlineCreateState {
  isTreeRootCollapsed: boolean;
  createFileRequest: NoteTreeInlineCreateRequest | null;
  createFolderRequest: NoteTreeInlineCreateRequest | null;
}

export type NoteTreeInlineCreateKind = "file" | "folder";

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

export function getTreeSelectionAfterRootSelect(): NoteTreeSelectionState {
  return {
    activeTreeDirectoryPath: "",
    activeTreeFilePath: null,
  };
}

export function getTreeSelectionAfterClear(): NoteTreeSelectionState {
  return {
    activeTreeDirectoryPath: null,
    activeTreeFilePath: null,
  };
}

export function getTreeInlineCreateState(
  kind: NoteTreeInlineCreateKind,
  parentPath: string,
  requestId: number,
): NoteTreeInlineCreateState {
  const request = { parentPath, requestId };
  return {
    isTreeRootCollapsed: false,
    createFileRequest: kind === "file" ? request : null,
    createFolderRequest: kind === "folder" ? request : null,
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
  activeWorkingCopyId: string | null;
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
    activeWorkingCopyId: currentFileAffected ? null : references.activeWorkingCopyId,
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

export interface NoteWorkingCopyReference {
  kind?: string;
  path?: string | null;
}

export function removeDeletedNoteWorkingCopies<TCopy extends NoteWorkingCopyReference>(
  workingCopies: Record<string, TCopy>,
  deletedPath: string,
  isDirectory: boolean,
): Record<string, TCopy> {
  const nextWorkingCopies: Record<string, TCopy> = {};
  for (const [id, copy] of Object.entries(workingCopies)) {
    const notePath = copy.kind === "note" ? copy.path : null;
    if (notePath && isNotePathAffectedByTarget(notePath, deletedPath, isDirectory)) {
      continue;
    }
    nextWorkingCopies[id] = copy;
  }
  return nextWorkingCopies;
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
