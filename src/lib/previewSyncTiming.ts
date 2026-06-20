export function getCommittedMarkdownSyncDelayMs(docLength: number, lastParseMs: number): number {
  if (docLength <= 2_000 && lastParseMs < 40) {
    return 50;
  }
  if (docLength <= 15_000 && lastParseMs < 90) {
    return 90;
  }
  if (docLength >= 25_000 || lastParseMs >= 120) {
    return 160;
  }
  return 120;
}

export function getPreviewMarkdownSyncDelayMs(docLength: number, lastParseMs: number): number {
  if (docLength < 3_000) {
    return 25;
  }
  if (docLength < 12_000) {
    return lastParseMs >= 90 ? 90 : 65;
  }
  if (docLength >= 25_000 || lastParseMs >= 120) {
    return 150;
  }
  return 120;
}
