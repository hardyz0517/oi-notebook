import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const siteDir = path.dirname(fileURLToPath(import.meta.url));

export function resolveNotesDir() {
  const configuredNotesDir = process.env.OINB_NOTES_DIR?.trim();

  if (configuredNotesDir) {
    return path.resolve(configuredNotesDir);
  }

  return path.resolve(siteDir, "../notes");
}

export function resolveNotesDirUrl() {
  return pathToFileURL(resolveNotesDir()).href;
}
