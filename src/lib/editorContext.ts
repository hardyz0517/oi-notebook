export interface CursorParagraphContext {
  text: string;
  isCode: boolean;
}

export function extractCursorParagraph(
  markdownContent: string,
  cursorOffset: number | null,
): CursorParagraphContext | null {
  if (cursorOffset === null || markdownContent.trim().length === 0) return null;

  const safeOffset = Math.max(0, Math.min(markdownContent.length, cursorOffset));
  let lineStart = 0;
  let inFence = false;
  let fenceStart = 0;
  let fenceMarker = "";

  while (lineStart <= markdownContent.length) {
    const lineEnd = markdownContent.indexOf("\n", lineStart);
    const nextLineStart = lineEnd === -1 ? markdownContent.length + 1 : lineEnd + 1;
    const lineText = markdownContent.slice(lineStart, lineEnd === -1 ? markdownContent.length : lineEnd);
    const fenceMatch = lineText.match(/^\s*(`{3,}|~{3,})/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceStart = lineStart;
        fenceMarker = marker;
      } else if (marker === fenceMarker) {
        if (safeOffset >= fenceStart && safeOffset <= nextLineStart) {
          return {
            text: markdownContent.slice(fenceStart, nextLineStart).trim(),
            isCode: true,
          };
        }
        inFence = false;
        fenceMarker = "";
      }
    }

    if (safeOffset < nextLineStart) break;
    lineStart = nextLineStart;
  }

  if (inFence && safeOffset >= fenceStart) {
    const closingPattern = new RegExp(`(^|\\n)\\s*${fenceMarker}{3,}[^\\n]*(\\n|$)`);
    const rest = markdownContent.slice(safeOffset);
    const closingMatch = rest.match(closingPattern);
    const fenceEnd = closingMatch?.index === undefined
      ? markdownContent.length
      : safeOffset + closingMatch.index + closingMatch[0].length;
    return {
      text: markdownContent.slice(fenceStart, fenceEnd).trim(),
      isCode: true,
    };
  }

  const beforeCursor = markdownContent.slice(0, safeOffset);
  const paragraphStartMatch = beforeCursor.match(/\n\s*\n[ \t]*[^\n]*$/);
  const paragraphStart = paragraphStartMatch?.index === undefined
    ? 0
    : paragraphStartMatch.index + paragraphStartMatch[0].match(/^\n\s*\n/)![0].length;
  const afterCursor = markdownContent.slice(safeOffset);
  const paragraphEndMatch = afterCursor.match(/\n\s*\n/);
  const paragraphEnd = paragraphEndMatch?.index === undefined ? markdownContent.length : safeOffset + paragraphEndMatch.index;
  const paragraphText = markdownContent.slice(paragraphStart, paragraphEnd).trim();

  return paragraphText ? { text: paragraphText, isCode: false } : null;
}
