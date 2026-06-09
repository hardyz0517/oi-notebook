export interface PreviewPerfStats {
  editorChangeCount: number;
  editorDocChangedCount: number;
  appEditorChangeCount: number;
  committedMarkdownScheduleCount: number;
  committedMarkdownSetCount: number;
  deferredMarkdownSeenCount: number;
  previewEffectStartCount: number;
  previewEffectCommitCount: number;
  previewScheduleCount: number;
  markdownParseCount: number;
  sanitizeCount: number;
  highlightCount: number;
  previewCommitCount: number;
  scrollSyncCount: number;
  lastDocLength: number;
  lastParseMs: number;
  lastSanitizeMs: number;
  lastHighlightMs: number;
  lastCommitMs: number;
  lastTotalPreviewMs: number;
  lastScheduleDelayMs: number;
  lastEditorDocChangedAt: number;
  lastAppEditorChangeAt: number;
  lastCommittedScheduleAt: number;
  lastCommittedSetAt: number;
  lastPreviewEffectStartAt: number;
  lastPreviewHtmlReadyAt: number;
  lastPreviewDomCommitAt: number;
  lastEditorToAppMs: number;
  lastAppChangeToCommittedSetMs: number;
  lastCommittedSetToPreviewEffectMs: number;
  lastEditorToPreviewEffectMs: number;
  lastEditorToPreviewCommitMs: number;
  lastCommittedToPreviewCommitMs: number;
  lastAppScheduleDelayMs: number;
  lastDeferredDelayMs: number;
  skippedStaleRenderCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  shikiCacheHitCount: number;
  shikiCacheMissCount: number;
  shikiCacheSize: number;
  lastShikiCacheKeyCount: number;
  lastHighlightActualMs: number;
  lastHighlightCachedMs: number;
}

declare global {
  interface Window {
    __OINB_PREVIEW_PERF__?: PreviewPerfStats;
  }
}

const createPreviewPerfStats = (): PreviewPerfStats => ({
  editorChangeCount: 0,
  editorDocChangedCount: 0,
  appEditorChangeCount: 0,
  committedMarkdownScheduleCount: 0,
  committedMarkdownSetCount: 0,
  deferredMarkdownSeenCount: 0,
  previewEffectStartCount: 0,
  previewEffectCommitCount: 0,
  previewScheduleCount: 0,
  markdownParseCount: 0,
  sanitizeCount: 0,
  highlightCount: 0,
  previewCommitCount: 0,
  scrollSyncCount: 0,
  lastDocLength: 0,
  lastParseMs: 0,
  lastSanitizeMs: 0,
  lastHighlightMs: 0,
  lastCommitMs: 0,
  lastTotalPreviewMs: 0,
  lastScheduleDelayMs: 0,
  lastEditorDocChangedAt: 0,
  lastAppEditorChangeAt: 0,
  lastCommittedScheduleAt: 0,
  lastCommittedSetAt: 0,
  lastPreviewEffectStartAt: 0,
  lastPreviewHtmlReadyAt: 0,
  lastPreviewDomCommitAt: 0,
  lastEditorToAppMs: 0,
  lastAppChangeToCommittedSetMs: 0,
  lastCommittedSetToPreviewEffectMs: 0,
  lastEditorToPreviewEffectMs: 0,
  lastEditorToPreviewCommitMs: 0,
  lastCommittedToPreviewCommitMs: 0,
  lastAppScheduleDelayMs: 0,
  lastDeferredDelayMs: 0,
  skippedStaleRenderCount: 0,
  cacheHitCount: 0,
  cacheMissCount: 0,
  shikiCacheHitCount: 0,
  shikiCacheMissCount: 0,
  shikiCacheSize: 0,
  lastShikiCacheKeyCount: 0,
  lastHighlightActualMs: 0,
  lastHighlightCachedMs: 0,
});

const now = () => (typeof performance === "undefined" ? Date.now() : performance.now());

export function getPreviewPerfStats(): PreviewPerfStats | null {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return null;
  }

  window.__OINB_PREVIEW_PERF__ ??= createPreviewPerfStats();
  return window.__OINB_PREVIEW_PERF__;
}

export function markPreviewEditorChange(docLength: number): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.editorChangeCount += 1;
  stats.appEditorChangeCount += 1;
  stats.lastDocLength = docLength;
  stats.lastAppEditorChangeAt = now();
  if (stats.lastEditorDocChangedAt > 0) {
    stats.lastEditorToAppMs = stats.lastAppEditorChangeAt - stats.lastEditorDocChangedAt;
  }
}

export function markPreviewEditorDocChanged(docLength: number): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.editorDocChangedCount += 1;
  stats.lastDocLength = docLength;
  stats.lastEditorDocChangedAt = now();
}

export function markCommittedMarkdownSchedule(docLength: number): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.committedMarkdownScheduleCount += 1;
  stats.lastDocLength = docLength;
  stats.lastCommittedScheduleAt = now();
}

export function markCommittedMarkdownSet(docLength: number): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.committedMarkdownSetCount += 1;
  stats.lastDocLength = docLength;
  stats.lastCommittedSetAt = now();
  if (stats.lastAppEditorChangeAt > 0) {
    stats.lastAppChangeToCommittedSetMs = stats.lastCommittedSetAt - stats.lastAppEditorChangeAt;
  }
  if (stats.lastCommittedScheduleAt > 0) {
    stats.lastAppScheduleDelayMs = stats.lastCommittedSetAt - stats.lastCommittedScheduleAt;
  }
}

export function markDeferredMarkdownSeen(docLength: number): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.deferredMarkdownSeenCount += 1;
  stats.lastDocLength = docLength;
  if (stats.lastCommittedSetAt > 0) {
    stats.lastDeferredDelayMs = now() - stats.lastCommittedSetAt;
  }
}

export function markPreviewSchedule(docLength: number): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.previewScheduleCount += 1;
  stats.lastDocLength = docLength;
}

export function markPreviewEffectStart(docLength: number): number {
  const stats = getPreviewPerfStats();
  const startedAt = now();
  if (!stats) return startedAt;

  stats.previewEffectStartCount += 1;
  stats.lastDocLength = docLength;
  stats.lastPreviewEffectStartAt = startedAt;
  if (stats.lastCommittedSetAt > 0) {
    stats.lastCommittedSetToPreviewEffectMs = startedAt - stats.lastCommittedSetAt;
  }
  if (stats.lastEditorDocChangedAt > 0) {
    stats.lastEditorToPreviewEffectMs = startedAt - stats.lastEditorDocChangedAt;
  }
  return startedAt;
}

export function markPreviewHtmlReady(): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.previewEffectCommitCount += 1;
  stats.lastPreviewHtmlReadyAt = now();
}

export function markPreviewMarkdownRender(input: {
  docLength: number;
  parseMs: number;
  highlightMs: number;
  highlightCount: number;
}): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.markdownParseCount += 1;
  stats.lastDocLength = input.docLength;
  stats.lastParseMs = input.parseMs;
  stats.lastHighlightMs = input.highlightMs;
  stats.highlightCount += input.highlightCount;
}

export function markShikiCacheLookup(input: {
  hit: boolean;
  cacheSize: number;
  lookupMs: number;
}): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  if (input.hit) {
    stats.cacheHitCount += 1;
    stats.shikiCacheHitCount += 1;
    stats.lastHighlightCachedMs = input.lookupMs;
  } else {
    stats.cacheMissCount += 1;
    stats.shikiCacheMissCount += 1;
    stats.lastHighlightActualMs = input.lookupMs;
  }
  stats.shikiCacheSize = input.cacheSize;
  stats.lastShikiCacheKeyCount = input.cacheSize;
}

export function markPreviewSanitize(sanitizeMs: number): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.sanitizeCount += 1;
  stats.lastSanitizeMs = sanitizeMs;
}

export function markPreviewCommit(input: {
  commitMs: number;
  totalPreviewMs: number;
  scheduleDelayMs: number;
}): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  const committedAt = now();
  stats.previewCommitCount += 1;
  stats.lastCommitMs = input.commitMs;
  stats.lastTotalPreviewMs = input.totalPreviewMs;
  stats.lastScheduleDelayMs = input.scheduleDelayMs;
  stats.lastPreviewDomCommitAt = committedAt;
  if (stats.lastEditorDocChangedAt > 0) {
    stats.lastEditorToPreviewCommitMs = committedAt - stats.lastEditorDocChangedAt;
  }
  if (stats.lastCommittedSetAt > 0) {
    stats.lastCommittedToPreviewCommitMs = committedAt - stats.lastCommittedSetAt;
  }
}

export function markPreviewStaleRender(): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.skippedStaleRenderCount += 1;
}

export function markPreviewScrollSync(): void {
  const stats = getPreviewPerfStats();
  if (!stats) return;

  stats.scrollSyncCount += 1;
}
