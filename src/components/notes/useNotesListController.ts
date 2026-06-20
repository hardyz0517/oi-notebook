import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { listNotes } from "@/lib/api";
import type { NoteFileInfo } from "@/types/note";

interface UseNotesListControllerParams {
  onNotesChanged?: () => void;
}

export function useNotesListController({ onNotesChanged }: UseNotesListControllerParams = {}) {
  const [files, setFiles] = useState<NoteFileInfo[]>([]);
  const [hasLoadedNotes, setHasLoadedNotes] = useState(false);

  useEffect(() => {
    listNotes()
      .then((loaded) => {
        setFiles(loaded);
        setHasLoadedNotes(true);
      })
      .catch((error: Error) => console.error("加载笔记列表失败：", error.message));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen("notes-changed", () => {
      onNotesChanged?.();
      listNotes()
        .then((updated) => {
          if (!cancelled) {
            setFiles(updated);
            setHasLoadedNotes(true);
          }
        })
        .catch((error: Error) =>
          console.error("收到 notes-changed 后刷新列表失败：", error.message),
        );
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((error: Error) =>
        console.error("注册 notes-changed 监听失败：", error.message),
      );

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [onNotesChanged]);

  return {
    files,
    setFiles,
    hasLoadedNotes,
  };
}
