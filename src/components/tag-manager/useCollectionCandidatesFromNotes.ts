import { useEffect, useState } from "react";
import { getEffectiveCollections, normalizeCollectionValues } from "@/lib/collectionTags";
import { parseFrontmatterFields } from "@/lib/frontmatter";
import { readNote } from "@/lib/api";
import type { NoteFileInfo } from "@/types/note";

export function useCollectionCandidatesFromNotes(noteFiles: NoteFileInfo[]) {
  const [collectionCandidatesFromNotes, setCollectionCandidatesFromNotes] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadCollectionCandidates = async () => {
      const candidates: string[] = [];

      for (const file of noteFiles) {
        try {
          const content = await readNote(file.path);
          const parsed = parseFrontmatterFields(content);
          candidates.push(...getEffectiveCollections(parsed.fields));
        } catch (error) {
          console.warn("Failed to read note collection candidates", file.path, error);
        }
      }

      if (!cancelled) {
        setCollectionCandidatesFromNotes(normalizeCollectionValues(candidates));
      }
    };

    void loadCollectionCandidates();

    return () => {
      cancelled = true;
    };
  }, [noteFiles]);

  return collectionCandidatesFromNotes;
}
