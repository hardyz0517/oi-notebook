import type { NoteFileInfo } from "@/types/note";

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

export function findEntryCaseInsensitive(
  files: NoteFileInfo[],
  path: string,
  isDirectory: boolean,
): NoteFileInfo | undefined {
  const normalized = path.toLowerCase();
  return files.find((file) => Boolean(file.isDirectory) === isDirectory && file.path.toLowerCase() === normalized);
}
