export type NotePathNameKind = "file" | "folder";

export function normalizeNoteFileName(name: string): string {
  const trimmed = name.trim();
  return trimmed.toLowerCase().endsWith(".md") ? trimmed : `${trimmed}.md`;
}

export function validateNoteNamePart(name: string, kind: NotePathNameKind): string | null {
  const trimmed = name.trim();
  if (!trimmed) return kind === "file" ? "File name cannot be empty" : "Folder name cannot be empty";
  if (/[<>:"/\\|?*]/.test(trimmed)) return 'Name cannot contain Windows reserved characters < > : " / \\ | ? *';
  if (trimmed.includes("..")) return "Name cannot contain path traversal segment ..";
  if (/^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) return "Name cannot be an absolute path";
  return null;
}

export function validateNoteDirectoryPathInput(path: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/[<>:"\\|?*]/.test(trimmed)) return 'Directory cannot contain Windows reserved characters < > : " \\ | ? *';
  if (trimmed.includes("..")) return "Directory cannot contain path traversal segment ..";
  if (/^[a-zA-Z]:/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\")) return "Directory cannot be an absolute path";
  if (trimmed.split("/").some((part) => part.trim() === "")) return "Directory cannot contain empty path segments";
  return null;
}

export function joinNotePath(directory: string, filename: string): string {
  const normalizedDirectory = directory.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return normalizedDirectory ? `${normalizedDirectory}/${filename}` : filename;
}
