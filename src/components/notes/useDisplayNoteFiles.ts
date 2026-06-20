import { useCallback, useMemo, useState } from "react";
import type { NoteFileInfo } from "@/types/note";

export function useDisplayNoteFiles(files: NoteFileInfo[], currentFilePath: string | null) {
  const [displayTitleByPath, setDisplayTitleByPath] = useState<Record<string, string>>({});

  const setDisplayTitleForPath = useCallback((path: string, title: string) => {
    const trimmed = title.trim();
    setDisplayTitleByPath((current) => {
      if (trimmed) {
        if (current[path] === trimmed) return current;
        return { ...current, [path]: trimmed };
      }
      if (!(path in current)) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
  }, []);

  const rewriteDisplayTitlePaths = useCallback((rewritePath: (path: string) => string) => {
    setDisplayTitleByPath((current) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [path, title] of Object.entries(current)) {
        const rewritten = rewritePath(path);
        if (rewritten !== path) changed = true;
        next[rewritten] = title;
      }
      return changed ? next : current;
    });
  }, []);

  const displayFiles = useMemo<NoteFileInfo[]>(
    () =>
      files.map((file) => ({
        ...file,
        displayTitle: file.isDirectory ? undefined : displayTitleByPath[file.path]?.trim() || undefined,
      })),
    [displayTitleByPath, files],
  );

  const activeNoteFile = useMemo(
    () => displayFiles.find((file) => !file.isDirectory && file.path === currentFilePath) ?? null,
    [displayFiles, currentFilePath],
  );

  return {
    displayFiles,
    activeNoteFile,
    setDisplayTitleForPath,
    rewriteDisplayTitlePaths,
  };
}
