import { useCallback, useEffect, useRef } from "react";
import type { MarkdownEditorScrollApi } from "@/components/editor/MarkdownEditor";
import type { MarkdownPreviewScrollApi } from "@/components/editor/MarkdownPreview";
import { markPreviewScrollSync } from "@/lib/previewPerf";

type ScrollPane = "editor" | "preview";

export function useEditorPreviewScrollSync() {
  const editorScrollApiRef = useRef<MarkdownEditorScrollApi | null>(null);
  const previewScrollApiRef = useRef<MarkdownPreviewScrollApi | null>(null);
  const scrollSyncRafRef = useRef<number | null>(null);
  const scrollSyncSuppressRafRef = useRef<number | null>(null);
  const suppressedScrollPaneRef = useRef<ScrollPane | null>(null);

  const syncEditorPreviewScroll = useCallback((source: ScrollPane, ratio: number) => {
    if (suppressedScrollPaneRef.current === source) return;

    if (scrollSyncRafRef.current !== null) {
      window.cancelAnimationFrame(scrollSyncRafRef.current);
    }

    scrollSyncRafRef.current = window.requestAnimationFrame(() => {
      scrollSyncRafRef.current = null;
      markPreviewScrollSync();

      const targetPane: ScrollPane = source === "editor" ? "preview" : "editor";
      const targetApi = source === "editor" ? previewScrollApiRef.current : editorScrollApiRef.current;
      if (!targetApi) return;

      suppressedScrollPaneRef.current = targetPane;
      targetApi.scrollToRatio(ratio);

      if (scrollSyncSuppressRafRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncSuppressRafRef.current);
      }
      scrollSyncSuppressRafRef.current = window.requestAnimationFrame(() => {
        scrollSyncSuppressRafRef.current = null;
        if (suppressedScrollPaneRef.current === targetPane) {
          suppressedScrollPaneRef.current = null;
        }
      });
    });
  }, []);

  const handleEditorScroll = useCallback(
    (ratio: number) => {
      syncEditorPreviewScroll("editor", ratio);
    },
    [syncEditorPreviewScroll],
  );

  const handlePreviewScroll = useCallback(
    (ratio: number) => {
      syncEditorPreviewScroll("preview", ratio);
    },
    [syncEditorPreviewScroll],
  );

  const handleEditorScrollApiChange = useCallback((api: MarkdownEditorScrollApi | null) => {
    editorScrollApiRef.current = api;
  }, []);

  const handlePreviewScrollApiChange = useCallback((api: MarkdownPreviewScrollApi | null) => {
    previewScrollApiRef.current = api;
  }, []);

  const requestEditorMeasure = useCallback(() => {
    editorScrollApiRef.current?.requestMeasure();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollSyncRafRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncRafRef.current);
      }
      if (scrollSyncSuppressRafRef.current !== null) {
        window.cancelAnimationFrame(scrollSyncSuppressRafRef.current);
      }
    };
  }, []);

  return {
    handleEditorScroll,
    handlePreviewScroll,
    handleEditorScrollApiChange,
    handlePreviewScrollApiChange,
    requestEditorMeasure,
  };
}
