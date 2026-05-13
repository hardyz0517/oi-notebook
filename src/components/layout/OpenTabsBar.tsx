import { useEffect, useRef } from "react";
import { FileText, GitCompare, X } from "lucide-react";

import { cn } from "@/lib/utils";

export interface OpenFileTab {
  kind: "file";
  path: string;
  title?: string;
  displayName: string;
  dirty?: boolean;
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

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeTabId, tabs.length]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="open-tabs-bar flex h-8 shrink-0 items-end overflow-hidden border-b border-border/80 bg-muted/20">
      <div className="open-tabs-scrollbar flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
        {tabs.map((tab) => {
          const tabId = tab.kind === "file" ? tab.path : tab.id;
          const isActive = tabId === activeTabId;
          const label = tab.title?.trim() || tab.displayName;
          const tooltip = tab.kind === "file" ? tab.path : `${tab.title}: ${tab.sourcePath}`;
          const Icon = tab.kind === "file" ? FileText : GitCompare;

          return (
            <div
              key={tabId}
              ref={isActive ? activeTabRef : undefined}
              className={cn(
                "open-tab group relative flex h-8 min-w-28 max-w-56 shrink-0 items-center border-r border-border/70 text-xs transition-colors",
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
                <span className="min-w-0 truncate">{label}</span>
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
  );
}
