import { useEffect, useMemo, useRef, useState } from "react";
import { searchNotes, type NoteSearchResult } from "@/lib/api";
import { buildLocalSearchResults, toSearchResultItem } from "@/lib/localSearchResults";
import type { NoteFileInfo } from "@/types/note";

export function useLocalNoteSearchController(noteFiles: NoteFileInfo[]) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [backendSearchResults, setBackendSearchResults] = useState<NoteSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRequestSeqRef = useRef(0);

  const trimmedSearchQuery = searchQuery.trim();
  const searchResults = useMemo(() => {
    if (trimmedSearchQuery === "") return buildLocalSearchResults(noteFiles, "");

    if (searchError) return buildLocalSearchResults(noteFiles, searchQuery);

    return backendSearchResults.map(toSearchResultItem);
  }, [backendSearchResults, noteFiles, searchError, searchQuery, trimmedSearchQuery]);

  useEffect(() => {
    if (!isSearchOpen) return;

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isSearchOpen]);

  useEffect(() => {
    const query = searchQuery.trim();

    if (!isSearchOpen || query === "") {
      searchRequestSeqRef.current += 1;
      setBackendSearchResults([]);
      setSearchError(null);
      setIsSearchLoading(false);
      return;
    }

    const requestId = searchRequestSeqRef.current + 1;
    searchRequestSeqRef.current = requestId;
    setSearchError(null);
    setBackendSearchResults([]);
    setIsSearchLoading(true);

    const timer = window.setTimeout(() => {
      searchNotes(query)
        .then((results) => {
          if (searchRequestSeqRef.current !== requestId) return;
          setBackendSearchResults(results);
          setSearchError(null);
        })
        .catch((error: Error) => {
          if (searchRequestSeqRef.current !== requestId) return;
          setBackendSearchResults([]);
          setSearchError(error.message || "搜索失败");
        })
        .finally(() => {
          if (searchRequestSeqRef.current === requestId) {
            setIsSearchLoading(false);
          }
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [isSearchOpen, searchQuery]);

  return {
    isSearchOpen,
    setIsSearchOpen,
    searchQuery,
    setSearchQuery,
    trimmedSearchQuery,
    searchResults,
    isSearchLoading,
    searchError,
    searchInputRef,
  };
}
