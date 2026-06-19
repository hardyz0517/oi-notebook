import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { debugEvent } from "./tagManagerDebug";
import type { ResizeHandle, TagManagerFilterMode, TagManagerWorkspaceView, WorkspaceRect } from "./types";

const MIN_WIDTH = 900;
const MIN_HEIGHT = 560;
const DEFAULT_WIDTH = 1120;
const DEFAULT_HEIGHT = 720;
const MARGIN_X = 72;
const MARGIN_TOP = 54;
const MARGIN_BOTTOM = 54;

const FILTER_OPTIONS: Array<{ value: TagManagerFilterMode; label: string }> = [
  { value: "all", label: "\u5168\u90e8\u6807\u7b7e" },
  { value: "user", label: "\u53ea\u770b\u81ea\u5b9a\u4e49" },
  { value: "hidden", label: "\u53ea\u770b\u9690\u85cf" },
  { value: "builtin", label: "\u53ea\u770b\u5185\u7f6e" },
  { value: "deprecated", label: "\u5df2\u5408\u5e76 / \u5df2\u505c\u7528" },
];

const WORKSPACE_VIEW_OPTIONS: Array<{ value: TagManagerWorkspaceView; label: string }> = [
  { value: "tags", label: "\u6807\u7b7e" },
  { value: "collections", label: "\u6587\u96c6" },
];

function getViewportSize() {
  if (typeof window === "undefined") {
    return { width: DEFAULT_WIDTH + MARGIN_X * 2, height: DEFAULT_HEIGHT + MARGIN_TOP + MARGIN_BOTTOM };
  }
  return {
    width: Math.max(320, Number.isFinite(window.innerWidth) ? window.innerWidth : DEFAULT_WIDTH + MARGIN_X * 2),
    height: Math.max(360, Number.isFinite(window.innerHeight) ? window.innerHeight : DEFAULT_HEIGHT + MARGIN_TOP + MARGIN_BOTTOM),
  };
}

function getMaxSize() {
  const viewport = getViewportSize();
  return {
    width: Math.max(1, viewport.width - MARGIN_X * 2),
    height: Math.max(1, viewport.height - MARGIN_TOP - MARGIN_BOTTOM),
  };
}

function getDefaultRect(): WorkspaceRect {
  const viewport = getViewportSize();
  const maxSize = getMaxSize();
  const width = Math.min(DEFAULT_WIDTH, maxSize.width);
  const height = Math.min(DEFAULT_HEIGHT, maxSize.height);
  return {
    left: Math.max(0, Math.min(Math.max(MARGIN_X, (viewport.width - width) / 2), viewport.width - width)),
    top: Math.max(0, Math.min(Math.max(MARGIN_TOP, (viewport.height - height) / 2), viewport.height - height)),
    width,
    height,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampRect(rect: WorkspaceRect): WorkspaceRect {
  const viewport = getViewportSize();
  const maxSize = getMaxSize();
  const fallback = getDefaultRect();
  const minWidth = Math.min(MIN_WIDTH, maxSize.width);
  const minHeight = Math.min(MIN_HEIGHT, maxSize.height);
  const width = clampNumber(Number.isFinite(rect.width) ? rect.width : fallback.width, minWidth, maxSize.width);
  const height = clampNumber(Number.isFinite(rect.height) ? rect.height : fallback.height, minHeight, maxSize.height);
  const minLeft = Math.min(MARGIN_X, Math.max(0, viewport.width - width));
  const maxLeft = Math.max(minLeft, viewport.width - MARGIN_X - width);
  const minTop = Math.min(MARGIN_TOP, Math.max(0, viewport.height - height));
  const maxTop = Math.max(minTop, viewport.height - MARGIN_BOTTOM - height);
  return {
    left: clampNumber(Number.isFinite(rect.left) ? rect.left : fallback.left, minLeft, maxLeft),
    top: clampNumber(Number.isFinite(rect.top) ? rect.top : fallback.top, minTop, maxTop),
    width,
    height,
  };
}

function getResizedRect(handle: ResizeHandle, startRect: WorkspaceRect, deltaX: number, deltaY: number): WorkspaceRect {
  const rect = { ...startRect };
  if (handle.includes("right")) rect.width = startRect.width + deltaX;
  if (handle.includes("left")) {
    rect.left = startRect.left + deltaX;
    rect.width = startRect.width - deltaX;
  }
  if (handle.includes("bottom")) rect.height = startRect.height + deltaY;
  if (handle.includes("top")) {
    rect.top = startRect.top + deltaY;
    rect.height = startRect.height - deltaY;
  }
  return clampRect(rect);
}

function getResizeCursor(handle: ResizeHandle): string {
  if (handle === "left" || handle === "right") return "ew-resize";
  if (handle === "top" || handle === "bottom") return "ns-resize";
  if (handle === "top-left" || handle === "bottom-right") return "nwse-resize";
  return "nesw-resize";
}

export function TagManagerShell({
  activeView,
  searchQuery,
  showHidden,
  filterMode,
  isDebugPanelVisible,
  onSearchQueryChange,
  onActiveViewChange,
  onShowHiddenChange,
  onFilterModeChange,
  onCopyDebugLog,
  onClearDebugLog,
  onCreateCustomTag,
  onClearSelection,
  onClose,
  children,
}: {
  activeView: TagManagerWorkspaceView;
  searchQuery: string;
  showHidden: boolean;
  filterMode: TagManagerFilterMode;
  isDebugPanelVisible: boolean;
  onSearchQueryChange: (value: string) => void;
  onActiveViewChange: (view: TagManagerWorkspaceView) => void;
  onShowHiddenChange: (value: boolean) => void;
  onFilterModeChange: (value: TagManagerFilterMode) => void;
  onCopyDebugLog: () => void;
  onClearDebugLog: () => void;
  onCreateCustomTag: () => void;
  onClearSelection: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const [dialogRect, setDialogRect] = useState<WorkspaceRect>(getDefaultRect);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const activeFilterOption = FILTER_OPTIONS.find((option) => option.value === filterMode) ?? FILTER_OPTIONS[0];

  const beginResize = useCallback((handle: ResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = clampRect(dialogRect);
    let latestRect = startRect;
    document.body.style.userSelect = "none";
    const handlePointerMove = (moveEvent: PointerEvent) => {
      latestRect = getResizedRect(handle, startRect, moveEvent.clientX - startX, moveEvent.clientY - startY);
      setDialogRect(latestRect);
    };
    const stopResize = () => {
      document.body.style.userSelect = "";
      setDialogRect(clampRect(latestRect));
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }, [dialogRect]);

  const beginDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button,input,label,[data-no-window-drag='true']")) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = clampRect(dialogRect);
    let latestRect = startRect;
    document.body.style.userSelect = "none";
    const handlePointerMove = (moveEvent: PointerEvent) => {
      latestRect = clampRect({ ...startRect, left: startRect.left + moveEvent.clientX - startX, top: startRect.top + moveEvent.clientY - startY });
      setDialogRect(latestRect);
    };
    const stopDrag = () => {
      document.body.style.userSelect = "";
      setDialogRect(clampRect(latestRect));
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  }, [dialogRect]);

  const shouldClearSelection = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return false;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (!target.closest('[data-tag-manager-clear-scope="true"]')) return false;
    if (target.closest('[data-tag-manager-no-clear="true"]')) return false;
    if (target.closest('[data-tag-manager-interactive="true"]')) return false;
    if (target.closest('input,textarea,button,select,label,[role="button"],[role="checkbox"],[role="menu"],[role="menuitem"],[contenteditable="true"]')) return false;
    return true;
  }, []);

  const handleClearScopePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (shouldClearSelection(event)) {
      onClearSelection();
    }
  }, [onClearSelection, shouldClearSelection]);

  return (
    <div
      data-tag-manager-workspace="true"
      className="fixed inset-0 z-[90] overflow-hidden bg-black/42 backdrop-blur-[3px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) debugEvent("manager.backdrop.click");
      }}
    >
      <style>{`
        .tag-manager-scrollbar { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent; }
        .tag-manager-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .tag-manager-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .tag-manager-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.18); border-radius: 999px; }
        .tag-manager-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.28); }
        .tag-manager-scrollbar::-webkit-scrollbar-corner { background: transparent; }
      `}</style>
      <section
        className="absolute flex min-h-[560px] min-w-[900px] flex-col overflow-hidden rounded-[10px] border border-[var(--ui-border-subtle)] bg-background/96 shadow-[0_24px_80px_rgb(0_0_0/45%)] backdrop-blur-xl"
        style={{ left: dialogRect.left, top: dialogRect.top, width: dialogRect.width, height: dialogRect.height }}
      >
        <header data-tag-manager-no-clear="true" className="flex h-12 shrink-0 cursor-grab items-center justify-between gap-4 border-b border-border/70 px-5 active:cursor-grabbing" onPointerDown={beginDrag}>
          <div className="text-base font-semibold text-foreground">Tag Manager</div>
          <IconButton data-tag-manager-interactive="true" type="button" aria-label="Close tag manager" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        </header>

        <div data-tag-manager-clear-scope="true" className="flex min-h-0 flex-1 flex-col overflow-hidden" onPointerDownCapture={handleClearScopePointerDown}>
        <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-border/70 px-5 py-3">
          <SegmentedControl
            value={activeView}
            ariaLabel="Tag manager view"
            options={WORKSPACE_VIEW_OPTIONS}
            className="shrink-0 border border-border/80 bg-muted/10"
            itemClassName="h-7 px-3"
            onValueChange={(view) => {
              onActiveViewChange(view);
              setIsFilterMenuOpen(false);
            }}
          />
          {activeView === "tags" ? (
            <>
              <div className="relative min-w-[240px] flex-[1_1_320px]" data-tag-manager-interactive="true">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input name="tag-manager-taxonomy-search" value={searchQuery} autoComplete="new-password" placeholder="\u641c\u7d22\u6807\u7b7e\u3001\u8def\u5f84\u6216\u522b\u540d" onChange={(event) => onSearchQueryChange(event.target.value)} className="h-9 pl-9 text-sm" />
              </div>
              <DropdownMenu open={isFilterMenuOpen} onOpenChange={setIsFilterMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    data-no-window-drag="true"
                    data-tag-manager-interactive="true"
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-44 justify-between gap-2 border-border/80 bg-muted/10 px-2 text-xs text-foreground hover:bg-muted/25"
                  >
                    <span className="truncate">{activeFilterOption.label}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {FILTER_OPTIONS.map((option) => {
                    const selected = option.value === filterMode;
                    return (
                      <DropdownMenuItem
                        key={option.value}
                        className={cn("justify-between", selected && "bg-[var(--ui-state-selected)] text-[var(--ui-state-selected-foreground)]")}
                        onSelect={() => {
                          onFilterModeChange(option.value);
                        }}
                      >
                        <span>{option.label}</span>
                        {selected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button data-tag-manager-interactive="true" type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={onCreateCustomTag}>
                <Plus className="h-3.5 w-3.5" />
                {"\u65b0\u5efa\u81ea\u5b9a\u4e49\u6807\u7b7e"}
              </Button>
              <label data-tag-manager-interactive="true" className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={showHidden} onChange={(event) => onShowHiddenChange(event.target.checked)} />
                {"\u663e\u793a\u9690\u85cf\u6807\u7b7e"}
              </label>
            </>
          ) : (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{"\u7ba1\u7406\u6587\u96c6\u5019\u9009\uff1a\u65b0\u589e\u3001\u91cd\u547d\u540d\u3001\u5220\u9664\u90fd\u4e0d\u4f1a\u6279\u91cf\u6539 notes\u3002"}</span>
            </div>
          )}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(360px,1fr)_minmax(360px,1fr)] overflow-hidden">
          {children}
        </div>
        </div>

        {isDebugPanelVisible && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-sm border border-border/70 bg-background/95 px-2 py-1.5 text-[11px] text-muted-foreground shadow-lg">
            <Button type="button" variant="ghost" size="xs" onClick={onCopyDebugLog}>{"\u590d\u5236\u8c03\u8bd5\u65e5\u5fd7"}</Button>
            <Button type="button" variant="ghost" size="xs" onClick={onClearDebugLog}>{"\u6e05\u7a7a\u8c03\u8bd5\u65e5\u5fd7"}</Button>
          </div>
        )}

        {(["right", "left", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"] as ResizeHandle[]).map((handle) => (
          <button
            key={handle}
            type="button"
            data-tag-manager-no-clear="true"
            aria-hidden="true"
            tabIndex={-1}
            className={cn(
              "absolute z-10 border-0 bg-transparent p-0 opacity-0",
              handle === "right" && "right-0 top-3 h-[calc(100%-24px)] w-2",
              handle === "left" && "left-0 top-3 h-[calc(100%-24px)] w-2",
              handle === "top" && "left-3 top-0 h-2 w-[calc(100%-24px)]",
              handle === "bottom" && "bottom-0 left-3 h-2 w-[calc(100%-24px)]",
              handle === "top-left" && "left-0 top-0 h-3 w-3",
              handle === "top-right" && "right-0 top-0 h-3 w-3",
              handle === "bottom-left" && "bottom-0 left-0 h-3 w-3",
              handle === "bottom-right" && "bottom-0 right-0 h-3 w-3",
            )}
            style={{ cursor: getResizeCursor(handle) }}
            onPointerDown={(event) => beginResize(handle, event)}
          />
        ))}
      </section>
    </div>
  );
}
