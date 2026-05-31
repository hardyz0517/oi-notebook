import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { debugEvent } from "./tagManagerDebug";
import type { ResizeHandle, TagManagerFilterMode, TagManagerWorkspaceView, WorkspaceRect } from "./types";

const MIN_WIDTH = 960;
const MIN_HEIGHT = 600;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 820;
const MARGIN_X = 36;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 36;

const FILTER_OPTIONS: Array<{ value: TagManagerFilterMode; label: string }> = [
  { value: "all", label: "全部标签" },
  { value: "user", label: "只看自定义" },
  { value: "hidden", label: "只看隐藏" },
  { value: "builtin", label: "只看内置" },
  { value: "deprecated", label: "已合并 / 已停用" },
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
      className="fixed inset-0 z-[90] overflow-hidden bg-background/55 backdrop-blur-[2px]"
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
        className="absolute flex min-h-[560px] min-w-[900px] flex-col overflow-hidden rounded-sm border border-border/80 bg-background shadow-2xl"
        style={{ left: dialogRect.left, top: dialogRect.top, width: dialogRect.width, height: dialogRect.height }}
      >
        <header data-tag-manager-no-clear="true" className="flex h-12 shrink-0 cursor-grab items-center justify-between gap-4 border-b border-border/70 px-5 active:cursor-grabbing" onPointerDown={beginDrag}>
          <div className="text-base font-semibold text-foreground">标签管理器</div>
          <Button data-tag-manager-interactive="true" type="button" variant="ghost" size="icon" aria-label="关闭标签管理器" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div data-tag-manager-clear-scope="true" className="flex min-h-0 flex-1 flex-col overflow-hidden" onPointerDownCapture={handleClearScopePointerDown}>
        <div className="relative z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-border/70 px-5 py-3">
          <div className="flex shrink-0 rounded-sm border border-border/80 bg-muted/10 p-0.5" data-tag-manager-interactive="true">
            {(["tags", "collections"] as TagManagerWorkspaceView[]).map((view) => (
              <button
                key={view}
                type="button"
                className={cn(
                  "h-7 rounded-[3px] px-3 text-xs font-medium transition-colors",
                  activeView === view ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  onActiveViewChange(view);
                  setIsFilterMenuOpen(false);
                }}
              >
                {view === "tags" ? "标签" : "文集"}
              </button>
            ))}
          </div>
          {activeView === "tags" ? (
            <>
              <div className="relative min-w-[240px] flex-[1_1_320px]" data-tag-manager-interactive="true">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input name="tag-manager-taxonomy-search" value={searchQuery} autoComplete="new-password" placeholder="搜索标签、路径或别名" onChange={(event) => onSearchQueryChange(event.target.value)} className="h-9 pl-9 text-sm" />
              </div>
              <div className="relative shrink-0" data-no-window-drag="true" data-tag-manager-interactive="true">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-44 justify-between gap-2 border-border/80 bg-muted/10 px-2 text-xs text-foreground hover:bg-muted/25"
                  aria-haspopup="listbox"
                  aria-expanded={isFilterMenuOpen}
                  onClick={() => setIsFilterMenuOpen((current) => !current)}
                >
                  <span className="truncate">{activeFilterOption.label}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Button>
                {isFilterMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.35rem)] z-30 w-48 rounded-sm border border-white/10 bg-[#161616]/95 p-1.5 shadow-[0_16px_42px_rgba(0,0,0,0.42)] backdrop-blur" role="listbox">
                    {FILTER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={option.value === filterMode}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors",
                          option.value === filterMode ? "bg-primary/15 text-foreground" : "text-foreground/80 hover:bg-white/[0.07] hover:text-foreground",
                        )}
                        onClick={() => {
                          onFilterModeChange(option.value);
                          setIsFilterMenuOpen(false);
                        }}
                      >
                        <span>{option.label}</span>
                        {option.value === filterMode && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button data-tag-manager-interactive="true" type="button" variant="outline" size="sm" className="h-8 shrink-0 text-xs" onClick={onCreateCustomTag}>
                <Plus className="h-3.5 w-3.5" />
                新建自定义标签
              </Button>
              <label data-tag-manager-interactive="true" className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={showHidden} onChange={(event) => onShowHiddenChange(event.target.checked)} />
                显示隐藏标签
              </label>
            </>
          ) : (
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>管理文集候选：新增、重命名、删除都不会批量改 notes。</span>
            </div>
          )}
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(360px,1fr)_minmax(360px,1fr)] overflow-hidden">
          {children}
        </div>
        </div>

        {isDebugPanelVisible && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-sm border border-border/70 bg-background/95 px-2 py-1.5 text-[11px] text-muted-foreground shadow-lg">
            <button type="button" className="rounded-sm px-1.5 py-0.5 hover:bg-muted/60 hover:text-foreground" onClick={onCopyDebugLog}>复制调试日志</button>
            <button type="button" className="rounded-sm px-1.5 py-0.5 hover:bg-muted/60 hover:text-foreground" onClick={onClearDebugLog}>清空调试日志</button>
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
