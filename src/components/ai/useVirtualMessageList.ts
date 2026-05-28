import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

export type VirtualMessageLike = {
  id: string;
  role?: string;
};

export type VirtualMessageItem<T extends VirtualMessageLike> = {
  item: T;
  index: number;
  start: number;
  size: number;
};

type VirtualMessageListOptions<T extends VirtualMessageLike> = {
  items: T[];
  resetKey?: string;
  scrollRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  overscan?: number;
  estimateSize?: (item: T) => number;
};

const DEFAULT_OVERSCAN = 6;
const DEFAULT_ESTIMATED_HEIGHT = 160;
const SCROLL_RANGE_EPSILON = 1;

const defaultEstimateSize = <T extends VirtualMessageLike>(item: T): number => {
  if (item.role === "user") return 84;
  if (item.role === "system") return 96;
  return DEFAULT_ESTIMATED_HEIGHT;
};

export function useVirtualMessageList<T extends VirtualMessageLike>({
  items,
  resetKey,
  scrollRef,
  enabled = true,
  overscan = DEFAULT_OVERSCAN,
  estimateSize = defaultEstimateSize,
}: VirtualMessageListOptions<T>) {
  const heightsRef = useRef<Map<string, number>>(new Map());
  const pendingHeightUpdatesRef = useRef<Map<string, number>>(new Map());
  const heightFrameRef = useRef<number | null>(null);
  const rangeFrameRef = useRef<number | null>(null);
  const lastResetKeyRef = useRef<string | undefined>(resetKey);
  const [heightVersion, setHeightVersion] = useState(0);
  const [range, setRange] = useState({ startIndex: 0, endIndex: 0 });
  const rangeRef = useRef(range);

  const measurements = useMemo(() => {
    let totalHeight = 0;
    const offsets = new Array<number>(items.length);
    const sizes = new Array<number>(items.length);

    items.forEach((item, index) => {
      const measuredHeight = heightsRef.current.get(item.id);
      const size = measuredHeight ?? estimateSize(item);
      offsets[index] = totalHeight;
      sizes[index] = size;
      totalHeight += size;
    });

    return { offsets, sizes, totalHeight };
  }, [estimateSize, heightVersion, items]);

  const calculateRange = useCallback(() => {
    if (!enabled || items.length === 0) {
      return { startIndex: 0, endIndex: 0 };
    }

    const scrollEl = scrollRef.current;
    const scrollTop = scrollEl?.scrollTop ?? Math.max(0, measurements.totalHeight - (scrollEl?.clientHeight ?? 0));
    const viewportHeight = scrollEl?.clientHeight ?? 0;
    const viewportEnd = scrollTop + viewportHeight;

    let firstVisible = 0;
    while (
      firstVisible < items.length - 1 &&
      measurements.offsets[firstVisible] + measurements.sizes[firstVisible] < scrollTop
    ) {
      firstVisible += 1;
    }

    let lastVisible = firstVisible;
    while (
      lastVisible < items.length - 1 &&
      measurements.offsets[lastVisible] < viewportEnd
    ) {
      lastVisible += 1;
    }

    return {
      startIndex: Math.max(0, firstVisible - overscan),
      endIndex: Math.min(items.length, lastVisible + overscan + 1),
    };
  }, [enabled, items.length, measurements.offsets, measurements.sizes, measurements.totalHeight, overscan, scrollRef]);

  const updateRange = useCallback(() => {
    const nextRange = calculateRange();
    const currentRange = rangeRef.current;
    if (
      currentRange.startIndex === nextRange.startIndex &&
      currentRange.endIndex === nextRange.endIndex
    ) {
      return;
    }

    rangeRef.current = nextRange;
    setRange(nextRange);
  }, [calculateRange]);

  useLayoutEffect(() => {
    if (lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;
    heightsRef.current.clear();
    pendingHeightUpdatesRef.current.clear();
    rangeRef.current = { startIndex: 0, endIndex: 0 };
    setRange({ startIndex: 0, endIndex: 0 });
    setHeightVersion((version) => version + 1);
  }, [resetKey]);

  const scheduleRangeUpdate = useCallback(() => {
    if (rangeFrameRef.current !== null) return;
    rangeFrameRef.current = window.requestAnimationFrame(() => {
      rangeFrameRef.current = null;
      updateRange();
    });
  }, [updateRange]);

  useLayoutEffect(() => {
    updateRange();
  }, [items.length, measurements.totalHeight, updateRange]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || !enabled) return undefined;

    scrollEl.addEventListener("scroll", scheduleRangeUpdate, { passive: true });
    window.addEventListener("resize", scheduleRangeUpdate);
    scheduleRangeUpdate();

    return () => {
      scrollEl.removeEventListener("scroll", scheduleRangeUpdate);
      window.removeEventListener("resize", scheduleRangeUpdate);
      if (rangeFrameRef.current !== null) {
        window.cancelAnimationFrame(rangeFrameRef.current);
        rangeFrameRef.current = null;
      }
    };
  }, [enabled, scheduleRangeUpdate, scrollRef]);

  const flushHeightUpdates = useCallback(() => {
    heightFrameRef.current = null;
    if (pendingHeightUpdatesRef.current.size === 0) return;

    let hasChanged = false;
    pendingHeightUpdatesRef.current.forEach((height, id) => {
      const current = heightsRef.current.get(id);
      if (current !== undefined && Math.abs(current - height) <= SCROLL_RANGE_EPSILON) return;
      heightsRef.current.set(id, height);
      hasChanged = true;
    });
    pendingHeightUpdatesRef.current.clear();

    if (hasChanged) {
      setHeightVersion((version) => version + 1);
    }
  }, []);

  const measureItem = useCallback((id: string, height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    pendingHeightUpdatesRef.current.set(id, height);
    if (heightFrameRef.current !== null) return;
    heightFrameRef.current = window.requestAnimationFrame(flushHeightUpdates);
  }, [flushHeightUpdates]);

  useEffect(() => {
    return () => {
      if (heightFrameRef.current !== null) {
        window.cancelAnimationFrame(heightFrameRef.current);
        heightFrameRef.current = null;
      }
      if (rangeFrameRef.current !== null) {
        window.cancelAnimationFrame(rangeFrameRef.current);
        rangeFrameRef.current = null;
      }
    };
  }, []);

  const virtualItems = useMemo<Array<VirtualMessageItem<T>>>(() => (
    items.slice(range.startIndex, range.endIndex).map((item, relativeIndex) => {
      const index = range.startIndex + relativeIndex;
      return {
        item,
        index,
        start: measurements.offsets[index] ?? 0,
        size: measurements.sizes[index] ?? estimateSize(item),
      };
    })
  ), [estimateSize, items, measurements.offsets, measurements.sizes, range.endIndex, range.startIndex]);

  const topSpacerHeight = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const renderedHeight = virtualItems.reduce((total, item) => total + item.size, 0);
  const bottomSpacerHeight = Math.max(0, measurements.totalHeight - topSpacerHeight - renderedHeight);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTo({ top: Math.max(0, measurements.totalHeight - scrollEl.clientHeight), behavior });
    if (behavior === "auto") {
      scrollEl.scrollTop = Math.max(0, measurements.totalHeight - scrollEl.clientHeight);
    }
    scheduleRangeUpdate();
  }, [measurements.totalHeight, scheduleRangeUpdate, scrollRef]);

  return {
    bottomSpacerHeight,
    measureItem,
    scrollToBottom,
    topSpacerHeight,
    totalHeight: measurements.totalHeight,
    updateRange,
    visibleRange: range,
    virtualItems,
  };
}
