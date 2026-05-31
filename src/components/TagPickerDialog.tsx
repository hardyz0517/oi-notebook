import {
  memo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getTagSuggestionList, normalizeTagPath, type TagSuggestion, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";

const TAG_PICKER_MIN_WIDTH = 760;
const TAG_PICKER_MIN_HEIGHT = 520;
const TAG_PICKER_DEFAULT_WIDTH = 1120;
const TAG_PICKER_DEFAULT_HEIGHT = 760;
const TAG_PICKER_MARGIN_X = 36;
const TAG_PICKER_MARGIN_TOP = 36;
const TAG_PICKER_MARGIN_BOTTOM = 36;
const TAG_PICKER_SEARCH_RESULT_LIMIT = 100;
const COLLECTION_ROOT_NAME = "文集";

type TagPickerRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ResizeDirection = "top" | "bottom" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

type TagPickerCatalogItem = TagSuggestion & {
  root: string;
  group: string;
  storedValue: string;
  identityKey: string;
  normalizedSearchText: string;
  compactSearchText: string;
};

type TagPickerCatalog = {
  suggestions: TagPickerCatalogItem[];
  rootNames: string[];
  suggestionsByRoot: Map<string, TagPickerCatalogItem[]>;
  identityKeys: Set<string>;
};

type TagPickerSubgroup = {
  name: string;
  pathText: string;
  candidates: TagPickerCatalogItem[];
};

type TagPickerRootGroup = {
  name: string;
  subgroups: TagPickerSubgroup[];
};

type DraftSelectedTag = {
  value: string;
  identityKey: string;
  displayName: string;
  pathTitle: string;
  root: string;
};

type DraftSelection = {
  items: DraftSelectedTag[];
  identityKeys: Set<string>;
};

type TagPickerDialogProps = {
  open: boolean;
  selectedTags: string[];
  selectedCollections?: string[];
  collectionCandidates?: string[];
  userConfig?: UserTagTaxonomyConfig | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (tags: string[], collections: string[]) => void;
};

function normalizeTagValue(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

function getTagDisplayName(tagOrPath: string): string {
  const segments = tagOrPath.split("/").map(normalizeTagValue).filter(Boolean);
  return segments[segments.length - 1] ?? normalizeTagValue(tagOrPath);
}

function getTagPathText(tagOrPath: string): string {
  const segments = tagOrPath.split("/").map(normalizeTagValue).filter(Boolean);
  return segments.length > 0 ? segments.join(" / ") : normalizeTagValue(tagOrPath);
}

function getStoredTagValue(suggestion: TagSuggestion): string {
  return suggestion.pathText;
}

function getTagIdentityKey(tag: string, userConfig?: UserTagTaxonomyConfig | null): string {
  const normalized = normalizeTagPath(tag, userConfig);
  if (normalized) {
    return `path:${normalized.fullPath.toLocaleLowerCase()}`;
  }
  return `text:${normalizeTagValue(tag).toLocaleLowerCase()}`;
}

function normalizeCollectionValue(collection: string): string {
  return collection.trim().replace(/\s+/g, " ");
}

function isCollectionTagValue(tag: string): boolean {
  const normalized = normalizeTagValue(tag).toLocaleLowerCase();
  return normalized.startsWith("文集:") || normalized.startsWith("collection:");
}

function normalizeCollectionIdentity(collection: string): string {
  return normalizeCollectionValue(collection).toLocaleLowerCase();
}

function mergeCollectionCandidates(candidates: string[] = [], selectedCollections: string[] = []): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const rawCandidate of [...selectedCollections, ...candidates]) {
    const candidate = normalizeCollectionValue(rawCandidate);
    if (!candidate || candidate === "未归档") continue;
    const key = normalizeCollectionIdentity(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
  }

  return merged;
}

function mergeTagsStable(existingTags: string[], suggestedTags: string[], userConfig?: UserTagTaxonomyConfig | null): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const tag of [...existingTags, ...suggestedTags]) {
    const normalized = normalizeTagValue(tag);
    const identityKey = getTagIdentityKey(normalized, userConfig);
    if (!normalized || seen.has(identityKey)) continue;
    seen.add(identityKey);
    merged.push(normalized);
  }

  return merged;
}

function createDraftSelectedTag(tag: string, userConfig?: UserTagTaxonomyConfig | null): DraftSelectedTag | null {
  const value = normalizeTagValue(tag);
  if (!value) return null;

  const normalized = normalizeTagPath(value, userConfig);
  const fullPath = normalized?.fullPath ?? value;
  return {
    value,
    identityKey: getTagIdentityKey(value, userConfig),
    displayName: getTagDisplayName(fullPath),
    pathTitle: getTagPathText(fullPath),
    root: normalized?.segments[0] ?? getTagDisplayName(value),
  };
}

function createDraftSelection(tags: string[], userConfig?: UserTagTaxonomyConfig | null): DraftSelection {
  const items: DraftSelectedTag[] = [];
  const identityKeys = new Set<string>();

  for (const tag of tags) {
    const item = createDraftSelectedTag(tag, userConfig);
    if (!item || identityKeys.has(item.identityKey)) continue;
    identityKeys.add(item.identityKey);
    items.push(item);
  }

  return { items, identityKeys };
}

function normalizeTagPickerSearchText(value: string): string {
  return normalizeTagValue(value).toLocaleLowerCase();
}

function compactTagPickerSearchText(value: string): string {
  return normalizeTagPickerSearchText(value).replace(/[\s/_\-路.]+/g, "");
}

function getTagPickerSearchScore(suggestion: TagPickerCatalogItem, query: string): number {
  const normalizedQuery = normalizeTagPickerSearchText(query);
  const compactQuery = compactTagPickerSearchText(query);
  if (!normalizedQuery || !compactQuery) return 0;

  if (suggestion.name.toLocaleLowerCase() === normalizedQuery) return 100;
  if (suggestion.pathText.toLocaleLowerCase() === normalizedQuery) return 95;
  if (suggestion.aliases.some((alias) => normalizeTagPickerSearchText(alias) === normalizedQuery)) return 90;
  if (suggestion.compactSearchText.includes(compactQuery)) return 70;
  if (suggestion.normalizedSearchText.includes(normalizedQuery)) return 60;
  return 0;
}

function createTagPickerCatalog(userConfig?: UserTagTaxonomyConfig | null): TagPickerCatalog {
  const suggestionsByRoot = new Map<string, TagPickerCatalogItem[]>();
  const identityKeys = new Set<string>();
  const rootNames: string[] = [];

  const suggestions = getTagSuggestionList(userConfig)
    .filter((suggestion) => !suggestion.hidden && !suggestion.deprecated)
    .map((suggestion) => {
      const root = suggestion.path[0] ?? suggestion.name;
      const group = suggestion.path[1] ?? "自定义";
      const storedValue = getStoredTagValue(suggestion);
      const identityKey = getTagIdentityKey(storedValue, userConfig);
      const normalizedSearchText = normalizeTagPickerSearchText(suggestion.searchText);
      const compactSearchText = compactTagPickerSearchText(suggestion.searchText);
      const item: TagPickerCatalogItem = {
        ...suggestion,
        root,
        group,
        storedValue,
        identityKey,
        normalizedSearchText,
        compactSearchText,
      };

      identityKeys.add(identityKey);
      if (!suggestionsByRoot.has(root)) {
        suggestionsByRoot.set(root, []);
        rootNames.push(root);
      }
      suggestionsByRoot.get(root)?.push(item);
      return item;
    });

  return {
    suggestions,
    rootNames,
    suggestionsByRoot,
    identityKeys,
  };
}

let builtinCatalogCache: TagPickerCatalog | null = null;
const userCatalogCache = new WeakMap<UserTagTaxonomyConfig, TagPickerCatalog>();

function getCachedTagPickerCatalog(userConfig?: UserTagTaxonomyConfig | null): TagPickerCatalog {
  if (!userConfig) {
    builtinCatalogCache ??= createTagPickerCatalog(null);
    return builtinCatalogCache;
  }

  const cached = userCatalogCache.get(userConfig);
  if (cached) return cached;

  const catalog = createTagPickerCatalog(userConfig);
  userCatalogCache.set(userConfig, catalog);
  return catalog;
}

function getViewportSize() {
  if (typeof window === "undefined") {
    return {
      width: TAG_PICKER_DEFAULT_WIDTH + TAG_PICKER_MARGIN_X * 2,
      height: TAG_PICKER_DEFAULT_HEIGHT + TAG_PICKER_MARGIN_TOP + TAG_PICKER_MARGIN_BOTTOM,
    };
  }
  return {
    width: Math.max(320, Number.isFinite(window.innerWidth) ? window.innerWidth : TAG_PICKER_DEFAULT_WIDTH),
    height: Math.max(360, Number.isFinite(window.innerHeight) ? window.innerHeight : TAG_PICKER_DEFAULT_HEIGHT),
  };
}

function getMaxSize() {
  const viewport = getViewportSize();
  return {
    width: Math.max(1, viewport.width - TAG_PICKER_MARGIN_X * 2),
    height: Math.max(1, viewport.height - TAG_PICKER_MARGIN_TOP - TAG_PICKER_MARGIN_BOTTOM),
  };
}

function isFinitePositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function getDefaultTagPickerRect(): TagPickerRect {
  const viewport = getViewportSize();
  const maxSize = getMaxSize();
  const width = Math.min(TAG_PICKER_DEFAULT_WIDTH, maxSize.width);
  const height = Math.min(TAG_PICKER_DEFAULT_HEIGHT, Math.floor(viewport.height * 0.82), maxSize.height);
  return {
    left: Math.max(0, Math.min(Math.max(TAG_PICKER_MARGIN_X, (viewport.width - width) / 2), viewport.width - width)),
    top: Math.max(0, Math.min(Math.max(TAG_PICKER_MARGIN_TOP, (viewport.height - height) / 2), viewport.height - height)),
    width,
    height,
  };
}

function clampTagPickerRect(rect: TagPickerRect): TagPickerRect {
  const viewport = getViewportSize();
  const maxSize = getMaxSize();
  const defaultRect = getDefaultTagPickerRect();
  const minWidth = Math.min(TAG_PICKER_MIN_WIDTH, maxSize.width);
  const minHeight = Math.min(TAG_PICKER_MIN_HEIGHT, maxSize.height);
  const width = Math.min(
    Math.max(isFinitePositiveNumber(rect.width) ? rect.width : defaultRect.width, minWidth),
    maxSize.width,
  );
  const height = Math.min(
    Math.max(isFinitePositiveNumber(rect.height) ? rect.height : defaultRect.height, minHeight),
    maxSize.height,
  );
  const minLeft = Math.min(TAG_PICKER_MARGIN_X, Math.max(0, viewport.width - width));
  const maxLeft = Math.max(minLeft, viewport.width - TAG_PICKER_MARGIN_X - width);
  const minTop = Math.min(TAG_PICKER_MARGIN_TOP, Math.max(0, viewport.height - height));
  const maxTop = Math.max(minTop, viewport.height - TAG_PICKER_MARGIN_BOTTOM - height);
  const safeLeft = Number.isFinite(rect.left) ? rect.left : defaultRect.left;
  const safeTop = Number.isFinite(rect.top) ? rect.top : defaultRect.top;
  return {
    left: Math.min(Math.max(safeLeft, minLeft), maxLeft),
    top: Math.min(Math.max(safeTop, minTop), maxTop),
    width,
    height,
  };
}

function getResizedTagPickerRect(startRect: TagPickerRect, deltaX: number, deltaY: number, direction: ResizeDirection): TagPickerRect {
  const maxSize = getMaxSize();
  const minWidth = Math.min(TAG_PICKER_MIN_WIDTH, maxSize.width);
  const minHeight = Math.min(TAG_PICKER_MIN_HEIGHT, maxSize.height);
  const startRight = startRect.left + startRect.width;
  const startBottom = startRect.top + startRect.height;
  let nextLeft = startRect.left;
  let nextTop = startRect.top;
  let nextWidth = startRect.width;
  let nextHeight = startRect.height;

  if (direction.includes("right")) {
    nextWidth = Math.min(Math.max(startRect.width + deltaX, minWidth), maxSize.width);
  }

  if (direction.includes("left")) {
    nextWidth = Math.min(Math.max(startRect.width - deltaX, minWidth), maxSize.width);
    nextLeft = startRight - nextWidth;
  }

  if (direction.includes("bottom")) {
    nextHeight = Math.min(Math.max(startRect.height + deltaY, minHeight), maxSize.height);
  }

  if (direction.includes("top")) {
    nextHeight = Math.min(Math.max(startRect.height - deltaY, minHeight), maxSize.height);
    nextTop = startBottom - nextHeight;
  }

  return clampTagPickerRect({
    left: nextLeft,
    top: nextTop,
    width: nextWidth,
    height: nextHeight,
  });
}

function createCandidateDraftItem(candidate: TagPickerCatalogItem): DraftSelectedTag {
  return {
    value: candidate.storedValue,
    identityKey: candidate.identityKey,
    displayName: candidate.name,
    pathTitle: getTagPathText(candidate.pathText),
    root: candidate.root,
  };
}

function buildTagPickerGroups(candidates: TagPickerCatalogItem[]): TagPickerRootGroup[] {
  const rootLookup = new Map<string, TagPickerRootGroup>();

  for (const candidate of candidates) {
    let rootGroup = rootLookup.get(candidate.root);
    if (!rootGroup) {
      rootGroup = { name: candidate.root, subgroups: [] };
      rootLookup.set(candidate.root, rootGroup);
    }

    const subgroupPathText = candidate.path.slice(0, Math.min(2, candidate.path.length)).join("/");
    let subgroup = rootGroup.subgroups.find((item) => item.pathText === subgroupPathText);
    if (!subgroup) {
      subgroup = { name: candidate.group, pathText: subgroupPathText, candidates: [] };
      rootGroup.subgroups.push(subgroup);
    }
    subgroup.candidates.push(candidate);
  }

  return Array.from(rootLookup.values());
}

const TagPickerDialog = memo(function TagPickerDialog({
  open,
  selectedTags,
  selectedCollections = [],
  collectionCandidates = [],
  userConfig,
  onOpenChange,
  onConfirm,
}: TagPickerDialogProps) {
  const catalog = useMemo(() => getCachedTagPickerCatalog(userConfig), [userConfig]);
  const [draftSelection, setDraftSelection] = useState<DraftSelection>(() => createDraftSelection(selectedTags, userConfig));
  const [draftCollections, setDraftCollections] = useState(() => mergeCollectionCandidates([], selectedCollections));
  const [searchQuery, setSearchQuery] = useState("");
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [rect, setRect] = useState<TagPickerRect>(getDefaultTagPickerRect);
  const panelRef = useRef<HTMLDivElement>(null);
  const normalizedCollectionCandidates = useMemo(
    () => mergeCollectionCandidates(collectionCandidates, selectedCollections),
    [collectionCandidates, selectedCollections],
  );
  const rootNames = useMemo(
    () => [...catalog.rootNames.filter((rootName) => rootName !== COLLECTION_ROOT_NAME), COLLECTION_ROOT_NAME],
    [catalog.rootNames],
  );

  useEffect(() => {
    if (!open) return;
    setDraftSelection(createDraftSelection(selectedTags, userConfig));
    setDraftCollections(mergeCollectionCandidates([], selectedCollections));
    setSearchQuery("");
  }, [open, selectedCollections, selectedTags, userConfig]);

  const selectedCountByRoot = useMemo(() => {
    const counts = new Map<string, number>();
    if (draftCollections.length > 0) {
      counts.set(COLLECTION_ROOT_NAME, draftCollections.length);
    }
    for (const item of draftSelection.items) {
      counts.set(item.root, (counts.get(item.root) ?? 0) + 1);
    }
    return counts;
  }, [draftCollections, draftSelection.items]);

  const activeRootName = useMemo(() => (
    activeRoot && rootNames.includes(activeRoot)
      ? activeRoot
      : rootNames[0] ?? null
  ), [activeRoot, rootNames]);

  const visibleCandidates = useMemo(() => {
    if (!open) return [];
    if (activeRootName === COLLECTION_ROOT_NAME && !normalizeTagValue(searchQuery)) return [];
    const query = normalizeTagValue(searchQuery);
    if (!query) {
      return activeRootName
        ? catalog.suggestionsByRoot.get(activeRootName) ?? []
        : catalog.suggestions.slice(0, TAG_PICKER_SEARCH_RESULT_LIMIT);
    }
    return catalog.suggestions
      .map((suggestion) => ({ suggestion, score: getTagPickerSearchScore(suggestion, query) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, TAG_PICKER_SEARCH_RESULT_LIMIT)
      .map((item) => item.suggestion);
  }, [activeRootName, catalog.suggestions, catalog.suggestionsByRoot, open, searchQuery]);

  const visibleCollectionCandidates = useMemo(() => {
    if (!open) return [];
    const query = normalizeCollectionValue(searchQuery).toLocaleLowerCase();
    if (!query) {
      return activeRootName === COLLECTION_ROOT_NAME ? normalizedCollectionCandidates : [];
    }
    return normalizedCollectionCandidates.filter((candidate) => candidate.toLocaleLowerCase().includes(query));
  }, [activeRootName, normalizedCollectionCandidates, open, searchQuery]);

  const groups = useMemo(() => (open ? buildTagPickerGroups(visibleCandidates) : []), [open, visibleCandidates]);

  const canAddCustomTag = useMemo(() => {
    if (!open) return false;
    const query = normalizeTagValue(searchQuery);
    if (!query) return false;
    if (activeRootName === COLLECTION_ROOT_NAME || isCollectionTagValue(query)) return false;
    const queryKey = getTagIdentityKey(query, userConfig);
    return !draftSelection.identityKeys.has(queryKey) && !catalog.identityKeys.has(queryKey);
  }, [activeRootName, catalog.identityKeys, draftSelection.identityKeys, open, searchQuery, userConfig]);

  const canAddCustomCollection = useMemo(() => {
    if (!open) return false;
    const query = normalizeCollectionValue(searchQuery);
    if (!query || query === "未归档") return false;
    const queryKey = normalizeCollectionIdentity(query);
    return (
      (activeRootName === COLLECTION_ROOT_NAME || searchQuery.trim().length > 0) &&
      !draftCollections.some((collection) => normalizeCollectionIdentity(collection) === queryKey) &&
      !normalizedCollectionCandidates.some((candidate) => normalizeCollectionIdentity(candidate) === queryKey)
    );
  }, [activeRootName, draftCollections, normalizedCollectionCandidates, open, searchQuery]);
  const showCollectionPanel = activeRootName === COLLECTION_ROOT_NAME || visibleCollectionCandidates.length > 0 || canAddCustomCollection;

  const style = useMemo(() => {
    const maxSize = getMaxSize();
    const minSize = {
      width: Math.min(TAG_PICKER_MIN_WIDTH, maxSize.width),
      height: Math.min(TAG_PICKER_MIN_HEIGHT, maxSize.height),
    };
    const effectiveRect = clampTagPickerRect(rect);
    return {
      left: `${effectiveRect.left}px`,
      top: `${effectiveRect.top}px`,
      width: `${effectiveRect.width}px`,
      height: `${effectiveRect.height}px`,
      minWidth: `${minSize.width}px`,
      minHeight: `${minSize.height}px`,
      maxWidth: `${maxSize.width}px`,
      maxHeight: `${maxSize.height}px`,
      transform: "none",
      transition: "none",
      animation: "none",
    } as CSSProperties;
  }, [rect]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const confirm = useCallback(() => {
    onConfirm(mergeTagsStable([], draftSelection.items.map((item) => item.value), userConfig), draftCollections);
    onOpenChange(false);
  }, [draftCollections, draftSelection.items, onConfirm, onOpenChange, userConfig]);

  const toggleCandidate = useCallback((candidate: TagPickerCatalogItem) => {
    setDraftSelection((current) => {
      const nextKeys = new Set(current.identityKeys);
      if (nextKeys.has(candidate.identityKey)) {
        nextKeys.delete(candidate.identityKey);
        return {
          items: current.items.filter((item) => item.identityKey !== candidate.identityKey),
          identityKeys: nextKeys,
        };
      }

      nextKeys.add(candidate.identityKey);
      return {
        items: [...current.items, createCandidateDraftItem(candidate)],
        identityKeys: nextKeys,
      };
    });
  }, []);

  const removeDraftTag = useCallback((identityKey: string) => {
    setDraftSelection((current) => {
      if (!current.identityKeys.has(identityKey)) return current;
      const nextKeys = new Set(current.identityKeys);
      nextKeys.delete(identityKey);
      return {
        items: current.items.filter((item) => item.identityKey !== identityKey),
        identityKeys: nextKeys,
      };
    });
  }, []);

  const addCustomTag = useCallback(() => {
    const customTag = normalizeTagValue(searchQuery);
    if (!customTag || isCollectionTagValue(customTag)) return;
    const item = createDraftSelectedTag(customTag, userConfig);
    if (!item) return;
    setDraftSelection((current) => {
      if (current.identityKeys.has(item.identityKey)) return current;
      const nextKeys = new Set(current.identityKeys);
      nextKeys.add(item.identityKey);
      return {
        items: [...current.items, item],
        identityKeys: nextKeys,
      };
    });
    setSearchQuery("");
  }, [searchQuery, userConfig]);

  const selectCollection = useCallback((collection: string) => {
    const normalizedCollection = normalizeCollectionValue(collection);
    if (!normalizedCollection) return;
    setDraftCollections((current) => {
      const collectionKey = normalizeCollectionIdentity(normalizedCollection);
      if (current.some((item) => normalizeCollectionIdentity(item) === collectionKey)) {
        return current.filter((item) => normalizeCollectionIdentity(item) !== collectionKey);
      }

      return [...current, normalizedCollection];
    });
  }, []);

  const removeCollection = useCallback((collection: string) => {
    const collectionKey = normalizeCollectionIdentity(collection);
    setDraftCollections((current) => current.filter((item) => normalizeCollectionIdentity(item) !== collectionKey));
  }, []);

  const addCustomCollection = useCallback(() => {
    const collection = normalizeCollectionValue(searchQuery);
    if (!collection || collection === "未归档") return;
    setDraftCollections((current) => mergeCollectionCandidates([collection], current));
    setSearchQuery("");
    setActiveRoot(COLLECTION_ROOT_NAME);
  }, [searchQuery]);

  const beginDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, [role='button'], [data-no-window-drag='true']")) return;

    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = clampTagPickerRect(rect);
    const panel = panelRef.current;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    const previousPanelWillChange = panel?.style.willChange ?? "";
    let latestRect = startRect;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    if (panel) {
      panel.style.transition = "none";
      panel.style.animation = "none";
      panel.style.willChange = "left, top";
    }

    const applyRectToPanel = (nextRect: TagPickerRect) => {
      if (!panel) return;
      panel.style.left = `${nextRect.left}px`;
      panel.style.top = `${nextRect.top}px`;
      panel.style.transform = "none";
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      latestRect = clampTagPickerRect({
        ...startRect,
        left: startRect.left + moveEvent.clientX - startX,
        top: startRect.top + moveEvent.clientY - startY,
      });
      applyRectToPanel(latestRect);
    };

    const handlePointerUp = () => {
      const finalRect = clampTagPickerRect(latestRect);
      applyRectToPanel(finalRect);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      if (panel) {
        panel.style.willChange = previousPanelWillChange;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      setRect(finalRect);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }, [rect]);

  const beginResize = useCallback((event: ReactPointerEvent<HTMLDivElement>, direction: ResizeDirection) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = clampTagPickerRect(rect);
    const panel = panelRef.current;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    const previousPanelWillChange = panel?.style.willChange ?? "";
    let latestRect = startRect;

    const resizeCursor = direction === "top" || direction === "bottom"
      ? "ns-resize"
      : direction === "left" || direction === "right"
        ? "ew-resize"
        : direction === "top-left" || direction === "bottom-right"
          ? "nwse-resize"
          : "nesw-resize";

    document.body.style.userSelect = "none";
    document.body.style.cursor = resizeCursor;
    if (panel) {
      panel.style.transition = "none";
      panel.style.animation = "none";
      panel.style.willChange = "left, top, width, height";
    }

    const applyRectToPanel = (nextRect: TagPickerRect) => {
      if (!panel) return;
      panel.style.left = `${nextRect.left}px`;
      panel.style.top = `${nextRect.top}px`;
      panel.style.width = `${nextRect.width}px`;
      panel.style.height = `${nextRect.height}px`;
      panel.style.transform = "none";
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      latestRect = getResizedTagPickerRect(startRect, moveEvent.clientX - startX, moveEvent.clientY - startY, direction);
      applyRectToPanel(latestRect);
    };

    const handlePointerUp = () => {
      const finalRect = clampTagPickerRect(latestRect);
      applyRectToPanel(finalRect);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      if (panel) {
        panel.style.willChange = previousPanelWillChange;
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      setRect(finalRect);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }, [rect]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) close();
    }}>
      {open && (
        <DialogContent
          ref={panelRef}
          className="fixed left-0 top-0 z-[70] flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-sm border-border bg-background p-0 shadow-none data-closed:zoom-out-100 data-open:zoom-in-100 sm:max-w-none"
          style={style}
          showCloseButton={false}
        >
          <DialogHeader
            className="shrink-0 cursor-grab border-b border-border/80 bg-muted/10 px-5 py-3 text-left active:cursor-grabbing"
            onPointerDown={beginDrag}
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <DialogTitle className="text-base">选择标签</DialogTitle>
              <button
                type="button"
                data-no-window-drag="true"
                className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                onClick={close}
                aria-label="关闭标签选择"
                title="关闭标签选择"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </DialogHeader>
          <div className="shrink-0 border-b border-border/80 bg-background px-5 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-wrap gap-2">
                {rootNames.length > 0 ? (
                  rootNames.map((rootName) => {
                    const selectedCount = selectedCountByRoot.get(rootName) ?? 0;
                    const active = !searchQuery.trim() && activeRootName === rootName;
                    return (
                      <button
                        key={rootName}
                        type="button"
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 border-b-2 px-1 text-sm transition-colors",
                          active ? "border-[#146BB7] text-[#146BB7]" : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => {
                          setActiveRoot(rootName);
                          setSearchQuery("");
                        }}
                      >
                        <span>{rootName === "自定义标签" ? "自定义" : rootName}</span>
                        {selectedCount > 0 && (
                          <span className="rounded-sm bg-[#146BB7]/10 px-1.5 py-0.5 text-[10px] text-[#146BB7]">
                            {selectedCount}
                          </span>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="h-8 text-sm leading-8 text-muted-foreground">暂无可选标签。</div>
                )}
              </div>
              <div className="relative w-full xl:w-[360px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={searchQuery}
                  placeholder="搜索全部标签"
                  className="h-9 border-border/80 bg-background pl-8 text-sm shadow-none focus-visible:ring-[#146BB7]/30"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  data-no-window-drag="true"
                />
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border/80 bg-muted/10 px-5 py-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                当前文集与标签（{draftSelection.items.length} 个标签）
              </div>
              {(draftCollections.length > 0 || draftSelection.items.length > 0) && (
                <div className="max-h-[112px] overflow-y-auto">
                  <div className="flex min-w-0 flex-wrap gap-2 pr-1">
                    {draftCollections.map((collection) => (
                      <button
                        key={collection}
                        type="button"
                        className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-left text-xs text-emerald-600 dark:text-emerald-300"
                        title={`文集：${collection}`}
                        onClick={() => removeCollection(collection)}
                      >
                        <span className="min-w-0 whitespace-normal break-words font-medium [overflow-wrap:anywhere]">{collection}</span>
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ))}
                    {draftSelection.items.map((item) => (
                      <button
                        key={`${item.identityKey}-${item.value}`}
                        type="button"
                        className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-[#146BB7]/35 bg-[#146BB7]/10 px-2 py-1 text-left text-xs text-[#146BB7]"
                        title={item.pathTitle}
                        onClick={() => removeDraftTag(item.identityKey)}
                      >
                        <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">{item.displayName}</span>
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">
              {groups.length === 0 && !showCollectionPanel ? (
                <div className="grid gap-3 py-8 text-center">
                  <div className="text-sm text-muted-foreground">
                    {searchQuery.trim() ? "没有找到匹配的标签。" : "暂无可选标签。"}
                  </div>
                  {canAddCustomTag && (
                    <div>
                      <Button type="button" variant="outline" size="sm" onClick={addCustomTag}>
                        添加自定义标签：“{normalizeTagValue(searchQuery)}”
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid gap-6">
                  {showCollectionPanel && (
                    <section className="grid gap-3">
                      {searchQuery.trim() && (
                        <div className="text-sm font-semibold text-foreground">{COLLECTION_ROOT_NAME}</div>
                      )}
                      <div className="grid gap-2 md:grid-cols-[156px_minmax(0,1fr)] md:gap-4">
                        <div className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                          文章文集
                        </div>
                        <div className="grid min-w-0 gap-2">
                          <div className="flex min-w-0 flex-wrap gap-2">
                            {visibleCollectionCandidates.map((collection) => {
                              const selected = draftCollections.some((item) => normalizeCollectionIdentity(item) === normalizeCollectionIdentity(collection));
                              return (
                                <button
                                  key={collection}
                                  type="button"
                                  title={`文集：${collection}`}
                                  className={cn(
                                    "inline-flex max-w-full rounded-sm border px-2.5 py-1.5 text-left text-sm leading-snug transition-colors",
                                    selected
                                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                                      : "border-border bg-muted/25 text-foreground hover:border-emerald-500 hover:bg-emerald-500/5 hover:text-emerald-600 dark:hover:text-emerald-300",
                                  )}
                                  onClick={() => selectCollection(collection)}
                                >
                                  <span className="min-w-0 whitespace-normal break-words font-medium [overflow-wrap:anywhere]">{collection}</span>
                                </button>
                              );
                            })}
                          </div>
                          {canAddCustomCollection && (
                            <div className="rounded-sm border border-dashed border-emerald-500/40 bg-emerald-500/[0.06] px-3 py-2 text-sm">
                              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-emerald-600 hover:text-emerald-700 dark:text-emerald-300 dark:hover:text-emerald-200" onClick={addCustomCollection}>
                                <Plus className="h-3.5 w-3.5" />
                                新建文集：{normalizeCollectionValue(searchQuery)}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </section>
                  )}
                  {canAddCustomTag && (
                    <div className="rounded-sm border border-dashed border-border/80 bg-muted/10 px-3 py-2 text-sm">
                      <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[#146BB7]" onClick={addCustomTag}>
                        <Plus className="h-3.5 w-3.5" />
                        添加自定义标签：“{normalizeTagValue(searchQuery)}”
                      </Button>
                    </div>
                  )}
                  {groups.map((rootGroup) => (
                    <section key={rootGroup.name} className="grid gap-3">
                      {searchQuery.trim() && (
                        <div className="text-sm font-semibold text-foreground">{rootGroup.name === "自定义标签" ? "自定义" : rootGroup.name}</div>
                      )}
                      <div className="grid gap-4">
                        {rootGroup.subgroups.map((subgroup, subgroupIndex) => (
                          <div
                            key={subgroup.pathText}
                            className={cn(
                              "grid gap-2 md:grid-cols-[156px_minmax(0,1fr)] md:gap-4",
                              subgroupIndex > 0 && "border-t border-border/60 pt-4",
                            )}
                          >
                            <div className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                              {subgroup.name}
                            </div>
                            <div className="flex min-w-0 flex-wrap gap-2">
                              {subgroup.candidates.map((candidate) => {
                                const selected = draftSelection.identityKeys.has(candidate.identityKey);
                                return (
                                  <button
                                    key={candidate.id}
                                    type="button"
                                    title={getTagPathText(candidate.pathText)}
                                    className={cn(
                                      "inline-flex max-w-full rounded-sm border px-2.5 py-1.5 text-left text-sm leading-snug transition-colors",
                                      selected
                                        ? "border-[#146BB7] bg-[#146BB7]/10 text-[#146BB7]"
                                        : "border-border bg-muted/25 text-foreground hover:border-[#146BB7] hover:bg-[#146BB7]/5 hover:text-[#146BB7]",
                                    )}
                                    onClick={() => toggleCandidate(candidate)}
                                  >
                                    <span className="min-w-0 whitespace-normal break-words font-medium [overflow-wrap:anywhere]">{candidate.name}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="relative z-[2] shrink-0 border-t border-border/80 bg-background px-5 py-3">
            <Button type="button" variant="outline" onClick={close}>取消</Button>
            <Button type="button" onClick={confirm}>确认</Button>
          </DialogFooter>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1]">
            <div
              className="pointer-events-auto absolute left-3 right-3 top-0 h-2 cursor-ns-resize"
              onPointerDown={(event) => beginResize(event, "top")}
            />
            <div
              className="pointer-events-auto absolute bottom-0 left-3 right-3 h-2 cursor-ns-resize"
              onPointerDown={(event) => beginResize(event, "bottom")}
            />
            <div
              className="pointer-events-auto absolute bottom-3 left-0 top-3 w-2 cursor-ew-resize"
              onPointerDown={(event) => beginResize(event, "left")}
            />
            <div
              className="pointer-events-auto absolute bottom-3 right-0 top-3 w-2 cursor-ew-resize"
              onPointerDown={(event) => beginResize(event, "right")}
            />
            <div
              className="pointer-events-auto absolute left-0 top-0 h-3.5 w-3.5 cursor-nwse-resize"
              onPointerDown={(event) => beginResize(event, "top-left")}
            />
            <div
              className="pointer-events-auto absolute right-0 top-0 h-3.5 w-3.5 cursor-nesw-resize"
              onPointerDown={(event) => beginResize(event, "top-right")}
            />
            <div
              className="pointer-events-auto absolute bottom-0 left-0 h-3.5 w-3.5 cursor-nesw-resize"
              onPointerDown={(event) => beginResize(event, "bottom-left")}
            />
            <div
              className="pointer-events-auto absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize"
              onPointerDown={(event) => beginResize(event, "bottom-right")}
            />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
});

export default TagPickerDialog;
