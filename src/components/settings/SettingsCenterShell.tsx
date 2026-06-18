import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type UIEvent } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { SettingsSidebar } from "./v2/components/SettingsSidebar";
import { filterSettingsTree } from "./v2/settingsSearch";
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
  renderActivePage,
  onCloseRequest,
  onOpenSettingsSection,
  onActiveSettingsSectionChange,
}: SettingsCenterShellProps) {
  const scrollSpyEnabledRef = useRef(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const sidebarResizeRef = useRef<{
    cleanup: (() => void) | null;
    dragging: boolean;
    handle: HTMLDivElement | null;
    pointerId: number;
  }>({ cleanup: null, dragging: false, handle: null, pointerId: -1 });
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const filteredSettingsTree = useMemo(
    () => filterSettingsTree(visibleSettingsTree, settingsSearchQuery),
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

  const isWorkspaceView =
    settingsView === "prompt-editor" ||
    settingsView === "ai-config-manager" ||
    settingsView === "luogu-account-manager";

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
              ) : settingsView === "ai-config-manager" ? (
                <h2 className="settings-v2-workspace-title">AI 配置组</h2>
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
        {settingsView === "main" && (
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
            settingsView === "luogu-account-manager" ? "settings-v2-main-workspace" : "settings-v2-main-settings",
          )}
        >
          {settingsView === "prompt-editor" ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">{renderPromptEditor()}</div>
          ) : settingsView === "ai-config-manager" && renderAiConfigManager ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">{renderAiConfigManager()}</div>
          ) : settingsView === "luogu-account-manager" && renderLuoguAccountManager ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">{renderLuoguAccountManager()}</div>
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
    </div>,
    portalRoot,
  );
}
