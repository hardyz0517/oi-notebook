import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  OPEN_TABS_ACTIVE_STORAGE_KEY,
  OPEN_TABS_STORAGE_KEY,
  filterValidOpenTabPaths,
  parseStoredOpenTabPaths,
  parseStoredOpenTabsActivePath,
  serializeOpenTabPaths,
} from "@/lib/openTabs";
import type { NoteFileInfo } from "@/types/note";

interface UseOpenTabsControllerParams {
  currentFilePath: string | null;
  setCurrentFilePath: Dispatch<SetStateAction<string | null>>;
  noteFiles: NoteFileInfo[];
  hasLoadedNotes: boolean;
}

function getInitialOpenTabPaths(): string[] {
  return parseStoredOpenTabPaths(window.localStorage.getItem(OPEN_TABS_STORAGE_KEY));
}

function getInitialOpenTabsActivePath(): string | null {
  return parseStoredOpenTabsActivePath(window.localStorage.getItem(OPEN_TABS_ACTIVE_STORAGE_KEY));
}

export function useOpenTabsController({
  currentFilePath,
  setCurrentFilePath,
  noteFiles,
  hasLoadedNotes,
}: UseOpenTabsControllerParams) {
  const [openTabPaths, setOpenTabPaths] = useState<string[]>(getInitialOpenTabPaths);
  const initialOpenTabsActivePathRef = useRef<string | null>(getInitialOpenTabsActivePath());
  const hasRestoredOpenTabsRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedNotes) return;

    const validPaths = new Set(noteFiles.map((file) => file.path));
    setOpenTabPaths((current) => filterValidOpenTabPaths(current, validPaths));

    if (currentFilePath && !validPaths.has(currentFilePath)) {
      setCurrentFilePath(null);
    }
  }, [currentFilePath, noteFiles, hasLoadedNotes, setCurrentFilePath]);

  useEffect(() => {
    if (!currentFilePath) return;

    setOpenTabPaths((current) => {
      if (current.includes(currentFilePath)) return current;
      return [...current, currentFilePath];
    });
  }, [currentFilePath]);

  useEffect(() => {
    if (!hasLoadedNotes || hasRestoredOpenTabsRef.current) return;

    const validPaths = new Set(noteFiles.map((file) => file.path));
    const restoredPaths = filterValidOpenTabPaths(openTabPaths, validPaths);
    const storedActivePath = initialOpenTabsActivePathRef.current;
    const activePath =
      storedActivePath && validPaths.has(storedActivePath)
        ? storedActivePath
        : restoredPaths[0] ?? null;

    hasRestoredOpenTabsRef.current = true;
    if (restoredPaths.length !== openTabPaths.length) {
      setOpenTabPaths(restoredPaths);
    }
    if (!currentFilePath && activePath) {
      setCurrentFilePath(activePath);
    }
  }, [currentFilePath, noteFiles, hasLoadedNotes, openTabPaths, setCurrentFilePath]);

  useEffect(() => {
    window.localStorage.setItem(OPEN_TABS_STORAGE_KEY, serializeOpenTabPaths(openTabPaths));
  }, [openTabPaths]);

  useEffect(() => {
    if (currentFilePath) {
      window.localStorage.setItem(OPEN_TABS_ACTIVE_STORAGE_KEY, currentFilePath);
    } else {
      window.localStorage.removeItem(OPEN_TABS_ACTIVE_STORAGE_KEY);
    }
  }, [currentFilePath]);

  return {
    openTabPaths,
    setOpenTabPaths,
  };
}
