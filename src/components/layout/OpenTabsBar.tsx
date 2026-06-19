import { useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import { FileText, GitCompare, X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface OpenFileTab {
  kind: "file";
  id: string;
  path: string | null;
  title?: string;
  displayName: string;
  dirty?: boolean;
  externalPath?: string | null;
}

export interface OpenReviewTab {
  kind: "review";
  id: string;
  sourcePath: string;
  title: string;
  displayName: string;
  status: "pending" | "applied" | "cancelled" | "stale";
}

export type OpenTab = OpenFileTab | OpenReviewTab;

interface OpenTabsBarProps {
  tabs: OpenTab[];
  activeTabId: string | null;
  onSelect: (tab: OpenTab) => void;
  onClose: (tab: OpenTab) => void;
}

export default function OpenTabsBar({
  tabs,
  activeTabId,
  onSelect,
  onClose,
}: OpenTabsBarProps) {
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollIndicator, setScrollIndicator] = useState({
    left: 0,
    visible: false,
    width: 100,
  });

  const updateScrollIndicator = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      setScrollIndicator({ left: 0, visible: false, width: 100 });
      return;
    }

    const { clientWidth, scrollLeft, scrollWidth } = container;
    const maxScrollLeft = scrollWidth - clientWidth;
    if (clientWidth <= 0 || maxScrollLeft <= 1) {
      setScrollIndicator({ left: 0, visible: false, width: 100 });
      return;
    }

    const width = Math.max(12, (clientWidth / scrollWidth) * 100);
    const left = (scrollLeft / maxScrollLeft) * (100 - width);
    setScrollIndicator({ left, visible: true, width });
  }, []);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
    updateScrollIndicator();
  }, [activeTabId, tabs.length, updateScrollIndicator]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    updateScrollIndicator();
    const resizeObserver = new ResizeObserver(updateScrollIndicator);
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
    };
  }, [updateScrollIndicator]);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container || container.scrollWidth <= container.clientWidth + 1) {
      return;
    }

    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    container.scrollLeft += delta;
    updateScrollIndicator();
  }, [updateScrollIndicator]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="open-tabs-bar relative flex w-full min-w-0 shrink-0 items-stretch overflow-hidden border-y border-border/80 bg-muted/20">
      <div
        ref={scrollContainerRef}
        className="open-tabs-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
        onWheel={handleWheel}
        onScroll={updateScrollIndicator}
      >
        <div className="open-tabs-list flex w-max min-w-max">
          {tabs.map((tab) => {
            const tabId = tab.id;
            const isActive = tabId === activeTabId;
            const label = tab.title?.trim() || tab.displayName;
            const tooltip = tab.kind === "file" ? (tab.path ?? tab.externalPath ?? tab.displayName) : `${tab.title}: ${tab.sourcePath}`;
            const Icon = tab.kind === "file" ? FileText : GitCompare;

            return (
              <div
                key={tabId}
                ref={isActive ? activeTabRef : undefined}
                className={cn(
                  "open-tab group relative flex min-w-28 max-w-56 shrink-0 items-center border-r border-border/70 text-xs transition-colors",
                  isActive
                    ? "open-tab-active border-t border-t-primary/45 bg-background text-foreground"
                    : "bg-muted/10 text-muted-foreground hover:bg-accent/35 hover:text-foreground",
                  tab.kind === "review" && "open-tab-review",
                )}
                data-active={isActive ? "true" : "false"}
                data-kind={tab.kind}
                title={tooltip}
              >
                <button
                  type="button"
                  className="open-tab-button flex h-full min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left"
                  onClick={() => onSelect(tab)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="open-tab-icon h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                  <span className="open-tab-label min-w-0 truncate">{label}</span>
                  {tab.kind === "file" && tab.dirty && (
                    <span
                      className="open-tab-status-dot ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                      aria-label="unsaved"
                    />
                  )}
                  {tab.kind === "review" && (
                    <span
                      className={cn(
                        "open-tab-status-dot ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        tab.status === "pending" && "bg-sky-400",
                        tab.status === "applied" && "bg-emerald-400",
                        tab.status === "cancelled" && "bg-muted-foreground/45",
                        tab.status === "stale" && "bg-amber-400",
                      )}
                      aria-label={tab.status}
                    />
                  )}
                </button>
                <button
                  type="button"
                  className={cn(
                    "open-tab-close mr-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    !isActive && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                    tab.kind === "file" && tab.dirty && "opacity-100",
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onClose(tab);
                  }}
                  title={`Close ${label}`}
                  aria-label={`Close ${label}`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {scrollIndicator.visible && (
        <div className="open-tabs-scroll-indicator" aria-hidden="true">
          <div
            className="open-tabs-scroll-indicator-thumb"
            style={{
              left: `${scrollIndicator.left}%`,
              width: `${scrollIndicator.width}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
