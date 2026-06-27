import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type UIEvent } from "react";
import { createPortal } from "react-dom";

import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

import { SettingsSidebar } from "./v2/components/SettingsSidebar";
import { filterSettingsTreeByQuery } from "./settingsSearch";
import "./v2/settingsV2.css";
import type {
  BeginSettingsCenterResize,
  SettingsActiveLabel,
  SettingsCategory,
  SettingsGroupId,
  SettingsNavigationGroup,
  SettingsSection,
  SettingsTarget,
  SettingsView,
} from "./settingsTypes";

const SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY = "oi-notebook.settingsCenter.sidebarWidth";
const SETTINGS_SIDEBAR_WIDTH_DEFAULT = 240;
const SETTINGS_SIDEBAR_WIDTH_MIN = 240;
const SETTINGS_SIDEBAR_WIDTH_MAX = 520;
const MANAGER_DIALOG_MIN_WIDTH = 760;
const MANAGER_DIALOG_MIN_HEIGHT = 500;
const MANAGER_DIALOG_DEFAULT_WIDTH = 980;
const MANAGER_DIALOG_DEFAULT_HEIGHT = 680;
const COMPACT_MANAGER_DIALOG_MIN_WIDTH = 480;
const COMPACT_MANAGER_DIALOG_MIN_HEIGHT = 420;
const COMPACT_MANAGER_DIALOG_DEFAULT_WIDTH = 560;
const COMPACT_MANAGER_DIALOG_DEFAULT_HEIGHT = 560;
const MANAGER_DIALOG_MARGIN = 24;

type ManagerDialogRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ManagerResizeHandle = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getManagerDialogBounds(container: HTMLElement | null) {
  const width = container?.clientWidth ?? (typeof window === "undefined" ? MANAGER_DIALOG_DEFAULT_WIDTH + MANAGER_DIALOG_MARGIN * 2 : window.innerWidth);
  const height = container?.clientHeight ?? (typeof window === "undefined" ? MANAGER_DIALOG_DEFAULT_HEIGHT + MANAGER_DIALOG_MARGIN * 2 : window.innerHeight);
  return {
    width: Math.max(320, width),
    height: Math.max(360, height),
  };
}

function getManagerDialogMetrics(compact: boolean) {
  return compact
    ? {
        minWidth: COMPACT_MANAGER_DIALOG_MIN_WIDTH,
        minHeight: COMPACT_MANAGER_DIALOG_MIN_HEIGHT,
        defaultWidth: COMPACT_MANAGER_DIALOG_DEFAULT_WIDTH,
        defaultHeight: COMPACT_MANAGER_DIALOG_DEFAULT_HEIGHT,
      }
    : {
        minWidth: MANAGER_DIALOG_MIN_WIDTH,
        minHeight: MANAGER_DIALOG_MIN_HEIGHT,
        defaultWidth: MANAGER_DIALOG_DEFAULT_WIDTH,
        defaultHeight: MANAGER_DIALOG_DEFAULT_HEIGHT,
      };
}

function getDefaultManagerDialogRect(container: HTMLElement | null, compact = false): ManagerDialogRect {
  const bounds = getManagerDialogBounds(container);
  const metrics = getManagerDialogMetrics(compact);
  const maxWidth = Math.max(1, bounds.width - MANAGER_DIALOG_MARGIN * 2);
  const maxHeight = Math.max(1, bounds.height - MANAGER_DIALOG_MARGIN * 2);
  const width = Math.min(metrics.defaultWidth, maxWidth);
  const height = Math.min(metrics.defaultHeight, maxHeight);
  return {
    left: Math.max(MANAGER_DIALOG_MARGIN, (bounds.width - width) / 2),
    top: Math.max(MANAGER_DIALOG_MARGIN, (bounds.height - height) / 2),
    width,
    height,
  };
}

function clampManagerDialogRect(rect: ManagerDialogRect, container: HTMLElement | null, compact = false): ManagerDialogRect {
  const bounds = getManagerDialogBounds(container);
  const metrics = getManagerDialogMetrics(compact);
  const maxWidth = Math.max(1, bounds.width - MANAGER_DIALOG_MARGIN * 2);
  const maxHeight = Math.max(1, bounds.height - MANAGER_DIALOG_MARGIN * 2);
  const minWidth = Math.min(metrics.minWidth, maxWidth);
  const minHeight = Math.min(metrics.minHeight, maxHeight);
  const width = clampNumber(Number.isFinite(rect.width) ? rect.width : metrics.defaultWidth, minWidth, maxWidth);
  const height = clampNumber(Number.isFinite(rect.height) ? rect.height : metrics.defaultHeight, minHeight, maxHeight);
  return {
    left: clampNumber(Number.isFinite(rect.left) ? rect.left : MANAGER_DIALOG_MARGIN, MANAGER_DIALOG_MARGIN, Math.max(MANAGER_DIALOG_MARGIN, bounds.width - MANAGER_DIALOG_MARGIN - width)),
    top: clampNumber(Number.isFinite(rect.top) ? rect.top : MANAGER_DIALOG_MARGIN, MANAGER_DIALOG_MARGIN, Math.max(MANAGER_DIALOG_MARGIN, bounds.height - MANAGER_DIALOG_MARGIN - height)),
    width,
    height,
  };
}

function getResizedManagerDialogRect(handle: ManagerResizeHandle, startRect: ManagerDialogRect, deltaX: number, deltaY: number) {
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
  return rect;
}

function getManagerResizeCursor(handle: ManagerResizeHandle) {
  if (handle === "left" || handle === "right") return "ew-resize";
  if (handle === "top" || handle === "bottom") return "ns-resize";
  if (handle === "top-left" || handle === "bottom-right") return "nwse-resize";
  return "nesw-resize";
}

function getInitialSidebarWidth() {
  if (typeof window === "undefined") return SETTINGS_SIDEBAR_WIDTH_DEFAULT;
  try {
    const rawValue = window.localStorage.getItem(SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY);
    if (!rawValue) return SETTINGS_SIDEBAR_WIDTH_DEFAULT;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return SETTINGS_SIDEBAR_WIDTH_DEFAULT;
    return Math.min(SETTINGS_SIDEBAR_WIDTH_MAX, Math.max(SETTINGS_SIDEBAR_WIDTH_MIN, Math.round(parsed)));
  } catch {
    return SETTINGS_SIDEBAR_WIDTH_DEFAULT;
  }
}

export interface SettingsCenterShellProps {
  open: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
  isMaximized: boolean;
  settingsView: SettingsView;
  visibleSettingsTree: SettingsNavigationGroup[];
  expandedSettingsGroups: Record<string, boolean>;
  activeSettingsGroupId: SettingsGroupId;
  activeSettingsTarget: SettingsTarget;
  activeSettingsPageKey: SettingsSection;
  activeSettingsLabel: SettingsActiveLabel;
  mainHeaderActions?: ReactNode;
  promptHeaderContent?: ReactNode;
  promptHeaderActions?: ReactNode;
  renderPromptEditor: () => ReactNode;
  renderAiConfigManager?: () => ReactNode;
  renderLuoguAccountManager?: () => ReactNode;
  onCloseAiConfigManager?: () => void;
  onCloseLuoguAccountManager?: () => void;
  renderActivePage: (activePageKey: SettingsSection, activeTarget: SettingsTarget) => ReactNode;
  onOpenChange: (open: boolean) => void;
  onToggleMaximize: () => void;
  onCloseRequest: () => void;
  onBeginDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onBeginResize: BeginSettingsCenterResize;
  onToggleGroup: (groupId: string) => void;
  onOpenSettingsSection: (target: SettingsSection | SettingsCategory) => void;
  onActiveSettingsSectionChange: (section: SettingsSection) => void;
}

export default function SettingsCenterShell({
  open,
  panelRef,
  contentRef,
  style,
  settingsView,
  visibleSettingsTree,
  activeSettingsGroupId,
  activeSettingsTarget,
  activeSettingsPageKey,
  promptHeaderContent,
  promptHeaderActions,
  renderPromptEditor,
  renderAiConfigManager,
  renderLuoguAccountManager,
  onCloseAiConfigManager,
  onCloseLuoguAccountManager,
  renderActivePage,
  onCloseRequest,
  onOpenSettingsSection,
  onActiveSettingsSectionChange,
}: SettingsCenterShellProps) {
  const scrollSpyEnabledRef = useRef(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const managerDialogRef = useRef<HTMLElement | null>(null);
  const sidebarResizeRef = useRef<{
    cleanup: (() => void) | null;
    dragging: boolean;
    handle: HTMLDivElement | null;
    pointerId: number;
  }>({ cleanup: null, dragging: false, handle: null, pointerId: -1 });
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [managerDialogRect, setManagerDialogRect] = useState<ManagerDialogRect>(() => getDefaultManagerDialogRect(null));
  const filteredSettingsTree = useMemo(
    () => filterSettingsTreeByQuery(visibleSettingsTree, settingsSearchQuery),
    [settingsSearchQuery, visibleSettingsTree],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SETTINGS_SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
    } catch {
      // Ignore storage failures; the in-memory resize state still works.
    }
  }, [sidebarWidth]);

  useEffect(() => () => {
    sidebarResizeRef.current.cleanup?.();
  }, []);

  useEffect(() => {
    if (settingsView === "luogu-account-manager") {
      setManagerDialogRect(getDefaultManagerDialogRect(shellRef.current, true));
      return;
    }
    if (settingsView === "ai-config-manager") {
      setManagerDialogRect((current) => clampManagerDialogRect(current, shellRef.current));
    }
  }, [settingsView]);

  const beginManagerDialogDrag = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button,input,textarea,select,label,[data-no-window-drag='true']")) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const compact = settingsView === "luogu-account-manager";
    const startRect = clampManagerDialogRect(managerDialogRect, shellRef.current, compact);
    let latestRect = startRect;
    let frameId = 0;
    const dialogElement = managerDialogRef.current;
    document.body.style.userSelect = "none";
    shellRef.current?.classList.add("settings-v2-manager-moving");

    const applyLatestRect = () => {
      frameId = 0;
      if (!dialogElement) return;
      dialogElement.style.left = `${latestRect.left}px`;
      dialogElement.style.top = `${latestRect.top}px`;
      dialogElement.style.width = `${latestRect.width}px`;
      dialogElement.style.height = `${latestRect.height}px`;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      latestRect = clampManagerDialogRect({
        ...startRect,
        left: startRect.left + moveEvent.clientX - startX,
        top: startRect.top + moveEvent.clientY - startY,
      }, shellRef.current, compact);
      if (!frameId) frameId = window.requestAnimationFrame(applyLatestRect);
    };

    const stopDrag = () => {
      document.body.style.userSelect = "";
      shellRef.current?.classList.remove("settings-v2-manager-moving");
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        applyLatestRect();
      }
      setManagerDialogRect(clampManagerDialogRect(latestRect, shellRef.current, compact));
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
  }, [managerDialogRect, settingsView]);

  const beginManagerDialogResize = useCallback((handle: ManagerResizeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const compact = settingsView === "luogu-account-manager";
    const startRect = clampManagerDialogRect(managerDialogRect, shellRef.current, compact);
    let latestRect = startRect;
    let frameId = 0;
    const dialogElement = managerDialogRef.current;
    document.body.style.userSelect = "none";
    shellRef.current?.classList.add("settings-v2-manager-moving");

    const applyLatestRect = () => {
      frameId = 0;
      if (!dialogElement) return;
      dialogElement.style.left = `${latestRect.left}px`;
      dialogElement.style.top = `${latestRect.top}px`;
      dialogElement.style.width = `${latestRect.width}px`;
      dialogElement.style.height = `${latestRect.height}px`;
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      latestRect = clampManagerDialogRect(
        getResizedManagerDialogRect(handle, startRect, moveEvent.clientX - startX, moveEvent.clientY - startY),
        shellRef.current,
        compact,
      );
      if (!frameId) frameId = window.requestAnimationFrame(applyLatestRect);
    };

    const stopResize = () => {
      document.body.style.userSelect = "";
      shellRef.current?.classList.remove("settings-v2-manager-moving");
      if (frameId) {
        window.cancelAnimationFrame(frameId);
        applyLatestRect();
      }
      setManagerDialogRect(clampManagerDialogRect(latestRect, shellRef.current, compact));
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }, [managerDialogRect, settingsView]);

  const beginSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    sidebarResizeRef.current.cleanup?.();

    const clampSidebarWidth = (value: number) => (
      Math.min(SETTINGS_SIDEBAR_WIDTH_MAX, Math.max(SETTINGS_SIDEBAR_WIDTH_MIN, Math.round(value)))
    );
    const handleElement = event.currentTarget;
    const pointerId = event.pointerId;

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      sidebarResizeRef.current.dragging = false;
      sidebarResizeRef.current.pointerId = -1;
      sidebarResizeRef.current.handle = null;
      sidebarResizeRef.current.cleanup = null;
      shellRef.current?.classList.remove("settings-v2-sidebar-resizing");
      try {
        if (handleElement.hasPointerCapture(pointerId)) {
          handleElement.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore release failures from webviews that already ended capture.
      }
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!sidebarResizeRef.current.dragging || moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      const shellLeft = shellRef.current?.getBoundingClientRect().left ?? 0;
      setSidebarWidth(clampSidebarWidth(moveEvent.clientX - shellLeft));
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      cleanup();
    };

    sidebarResizeRef.current.dragging = true;
    sidebarResizeRef.current.pointerId = pointerId;
    sidebarResizeRef.current.handle = handleElement;
    sidebarResizeRef.current.cleanup = cleanup;
    shellRef.current?.classList.add("settings-v2-sidebar-resizing");
    try {
      handleElement.setPointerCapture(pointerId);
    } catch {
      // Pointer capture can fail in embedded webviews; global listeners still handle dragging.
    }
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
  };

  if (activeSettingsTarget.type === "category") scrollSpyEnabledRef.current = false;
  if (!open) return null;
  const portalRoot = typeof document === "undefined" ? null : document.getElementById("settings-center-content-root");
  if (!portalRoot) return null;

  const isWorkspaceView = settingsView === "prompt-editor";

  const enableScrollSpy = () => {
    scrollSpyEnabledRef.current = true;
  };

  const handleSettingsScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!scrollSpyEnabledRef.current) return;
    const container = event.currentTarget;
    const sections = Array.from(container.querySelectorAll<HTMLElement>("[data-settings-section]"));
    if (sections.length === 0) return;
    const headerHeight = container.querySelector<HTMLElement>("[data-settings-scroll-header]")?.offsetHeight ?? 0;
    const containerTop = container.getBoundingClientRect().top + headerHeight;
    const activeSection = container.scrollTop + container.clientHeight >= container.scrollHeight - 2
      ? sections[sections.length - 1]
      : sections.reduce((closest, section) => (
          Math.abs(section.getBoundingClientRect().top - containerTop) <
          Math.abs(closest.getBoundingClientRect().top - containerTop)
            ? section
            : closest
        ));
    const sectionId = activeSection.dataset.settingsSection as SettingsSection | undefined;
    if (sectionId && (activeSettingsTarget.type !== "page" || activeSettingsPageKey !== sectionId)) {
      onActiveSettingsSectionChange(sectionId);
    }
  };

  const fullPageStyle = {
    ...style,
    "--settings-sidebar-width": `${sidebarWidth}px`,
    left: 0,
    top: 0,
    width: "100%",
    height: "100%",
    minWidth: 0,
    minHeight: 0,
    maxWidth: "none",
    maxHeight: "none",
  } as CSSProperties;

  return createPortal(
    <div
      ref={(node) => {
        shellRef.current = node;
        if (panelRef) {
          panelRef.current = node;
        }
      }}
      className="settings-center settings-v2 pointer-events-auto absolute inset-0 flex max-w-none flex-col gap-0 overflow-hidden p-0"
      style={fullPageStyle}
      aria-hidden={!open}
    >
      {isWorkspaceView && (
        <header className="settings-v2-workspace-header">
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              {settingsView === "prompt-editor" ? (
                promptHeaderContent
              ) : settingsView === "luogu-account-manager" ? (
                <h2 className="settings-v2-workspace-title">洛谷账号配置</h2>
              ) : (
                <h2 className="settings-v2-workspace-title">设置中心</h2>
              )}
            </div>
            {settingsView === "prompt-editor" ? promptHeaderActions : null}
          </div>
        </header>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden flex-col md:flex-row">
        {(settingsView === "main" || settingsView === "ai-config-manager" || settingsView === "luogu-account-manager") && (
          <div
            className="settings-v2-sidebar-shell"
            style={{
              width: sidebarWidth,
              minWidth: sidebarWidth,
              flexBasis: sidebarWidth,
            }}
          >
            <SettingsSidebar
              tree={filteredSettingsTree}
              activeGroupId={activeSettingsGroupId}
              searchQuery={settingsSearchQuery}
              onSearchQueryChange={setSettingsSearchQuery}
              onClose={onCloseRequest}
              onOpenGroup={(groupId) => {
                scrollSpyEnabledRef.current = false;
                onOpenSettingsSection(groupId);
              }}
            />
            <div
              className="settings-v2-sidebar-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整设置目录宽度"
              onPointerDown={beginSidebarResize}
            />
          </div>
        )}
        <main
          className={cn(
            "settings-v2-main min-h-0 min-w-0 flex-1 overflow-hidden",
            "settings-v2-main-settings",
          )}
        >
          {settingsView === "prompt-editor" ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">{renderPromptEditor()}</div>
          ) : (
            <div
              ref={contentRef}
              className="settings-v2-content h-full min-h-0 overflow-auto"
              data-settings-scroll-container="true"
              onPointerDown={enableScrollSpy}
              onTouchMove={enableScrollSpy}
              onWheel={enableScrollSpy}
              onScroll={handleSettingsScroll}
            >
              <div className="grid min-w-0 gap-0">{renderActivePage(activeSettingsPageKey, activeSettingsTarget)}</div>
            </div>
          )}
        </main>
      </div>
      {settingsView === "ai-config-manager" && renderAiConfigManager ? (
        <div
          className="settings-v2-manager-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCloseAiConfigManager?.();
          }}
        >
          <section
            ref={managerDialogRef}
            className="settings-v2-manager-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-v2-ai-manager-title"
            style={{
              left: managerDialogRect.left,
              top: managerDialogRect.top,
              width: managerDialogRect.width,
              height: managerDialogRect.height,
            }}
          >
            <header className="settings-v2-manager-dialog-header" onPointerDown={beginManagerDialogDrag}>
              <h2 id="settings-v2-ai-manager-title" className="settings-v2-workspace-title">AI 配置组</h2>
              <IconButton type="button" size="icon-xs" className="settings-v2-manager-dialog-close" aria-label="关闭 AI 配置组" onClick={onCloseAiConfigManager} data-no-window-drag="true">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>
            </header>
            <div className="settings-v2-manager-dialog-body">{renderAiConfigManager()}</div>
            {(["right", "left", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"] as ManagerResizeHandle[]).map((handle) => (
              <button
                key={handle}
                type="button"
                className={cn(
                  "settings-v2-manager-resize-handle",
                  handle === "right" && "settings-v2-manager-resize-handle-right",
                  handle === "left" && "settings-v2-manager-resize-handle-left",
                  handle === "top" && "settings-v2-manager-resize-handle-top",
                  handle === "bottom" && "settings-v2-manager-resize-handle-bottom",
                  handle === "top-left" && "settings-v2-manager-resize-handle-top-left",
                  handle === "top-right" && "settings-v2-manager-resize-handle-top-right",
                  handle === "bottom-left" && "settings-v2-manager-resize-handle-bottom-left",
                  handle === "bottom-right" && "settings-v2-manager-resize-handle-bottom-right",
                )}
                style={{ cursor: getManagerResizeCursor(handle) }}
                tabIndex={-1}
                aria-hidden="true"
                onPointerDown={(event) => beginManagerDialogResize(handle, event)}
              />
            ))}
          </section>
        </div>
      ) : null}
      {settingsView === "luogu-account-manager" && renderLuoguAccountManager ? (
        <div
          className="settings-v2-manager-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCloseLuoguAccountManager?.();
          }}
        >
          <section
            ref={managerDialogRef}
            className="settings-v2-manager-dialog settings-v2-manager-dialog-compact"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-v2-luogu-manager-title"
            style={{
              left: managerDialogRect.left,
              top: managerDialogRect.top,
              width: managerDialogRect.width,
              height: managerDialogRect.height,
            }}
          >
            <header className="settings-v2-manager-dialog-header" onPointerDown={beginManagerDialogDrag}>
              <h2 id="settings-v2-luogu-manager-title" className="settings-v2-workspace-title">洛谷账号配置</h2>
              <IconButton type="button" size="icon-xs" className="settings-v2-manager-dialog-close" aria-label="关闭洛谷账号配置" onClick={onCloseLuoguAccountManager} data-no-window-drag="true">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </IconButton>
            </header>
            <div className="settings-v2-manager-dialog-body">{renderLuoguAccountManager()}</div>
            {(["right", "left", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"] as ManagerResizeHandle[]).map((handle) => (
              <button
                key={handle}
                type="button"
                className={cn(
                  "settings-v2-manager-resize-handle",
                  handle === "right" && "settings-v2-manager-resize-handle-right",
                  handle === "left" && "settings-v2-manager-resize-handle-left",
                  handle === "top" && "settings-v2-manager-resize-handle-top",
                  handle === "bottom" && "settings-v2-manager-resize-handle-bottom",
                  handle === "top-left" && "settings-v2-manager-resize-handle-top-left",
                  handle === "top-right" && "settings-v2-manager-resize-handle-top-right",
                  handle === "bottom-left" && "settings-v2-manager-resize-handle-bottom-left",
                  handle === "bottom-right" && "settings-v2-manager-resize-handle-bottom-right",
                )}
                style={{ cursor: getManagerResizeCursor(handle) }}
                tabIndex={-1}
                aria-hidden="true"
                onPointerDown={(event) => beginManagerDialogResize(handle, event)}
              />
            ))}
          </section>
        </div>
      ) : null}
    </div>,
    portalRoot,
  );
}
