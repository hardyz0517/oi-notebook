export type CitationMarkerMatch = {
  index: number;
  start: number;
  end: number;
  raw: string;
  rawMarker: string;
  citationId: string;
};

export const possibleCitationMarkerPattern = /\[\[?[SN]\d{1,2}\]\]?/;

export const stripMarkdownRegionsForCitationScan = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]*(?:\n[^`]*)?`/g, "");

export const findCitationMarkerMatches = (text: string): CitationMarkerMatch[] => {
  const matches: CitationMarkerMatch[] = [];
  let index = 0;

  while (index < text.length) {
    if (text.startsWith("[[", index)) {
      const doubleBracketMatch = /^\[\[([SN]\d{1,2})\]\]/.exec(text.slice(index));
      if (doubleBracketMatch) {
        matches.push({
          index,
          start: index,
          end: index + doubleBracketMatch[0].length,
          raw: doubleBracketMatch[0],
          rawMarker: doubleBracketMatch[0],
          citationId: doubleBracketMatch[1],
        });
        index += doubleBracketMatch[0].length;
        continue;
      }
    }

    if (text[index] === "[" && text[index - 1] !== "[") {
      const singleBracketMatch = /^\[([SN]\d{1,2})\]/.exec(text.slice(index));
      if (singleBracketMatch) {
        const nextChar = text[index + singleBracketMatch[0].length];
        const previousChar = text[index - 1];
        if (
          previousChar !== "[" &&
          nextChar !== "(" &&
          nextChar !== "[" &&
          nextChar !== "]"
        ) {
          matches.push({
            index,
            start: index,
            end: index + singleBracketMatch[0].length,
            raw: singleBracketMatch[0],
            rawMarker: singleBracketMatch[0],
            citationId: singleBracketMatch[1],
          });
          index += singleBracketMatch[0].length;
          continue;
        }
      }
    }

    index += 1;
  }

  return matches;
};

export const getUsedCitationIdList = (text: string, validIds: Iterable<string>): string[] => {
  const validIdSet = new Set(validIds);
  const usedIds: string[] = [];
  const seenIds = new Set<string>();
  const searchableText = stripMarkdownRegionsForCitationScan(text);
  for (const match of findCitationMarkerMatches(searchableText)) {
    const citationId = match.citationId;
    if (validIdSet.has(citationId) && !seenIds.has(citationId)) {
      usedIds.push(citationId);
      seenIds.add(citationId);
    }
  }
  return usedIds;
};
