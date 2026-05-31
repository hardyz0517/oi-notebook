import type { CSSProperties, ReactNode, RefObject, PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronRight, Maximize2, Minimize2, X } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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
}

export default function SettingsCenterShell({
  open,
  panelRef,
  contentRef,
  style,
  isMaximized,
  settingsView,
  visibleSettingsTree,
  expandedSettingsGroups,
  activeSettingsGroupId,
  activeSettingsTarget,
  activeSettingsPageKey,
  activeSettingsLabel,
  mainHeaderActions,
  promptHeaderContent,
  promptHeaderActions,
  renderPromptEditor,
  renderAiConfigManager,
  renderLuoguAccountManager,
  renderActivePage,
  onOpenChange,
  onToggleMaximize,
  onCloseRequest,
  onBeginDrag,
  onBeginResize,
  onToggleGroup,
  onOpenSettingsSection,
}: SettingsCenterShellProps) {
  if (!open) return null;
  const isWorkspaceView =
    settingsView === "prompt-editor" ||
    settingsView === "ai-config-manager" ||
    settingsView === "luogu-account-manager";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        ref={panelRef}
        className="settings-center fixed left-0 top-0 z-[60] flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-lg p-0 data-closed:zoom-out-100 data-open:zoom-in-100 sm:max-w-none"
        style={style}
        showCloseButton={false}
      >
        <div className="absolute right-2.5 top-2.5 z-30 flex items-center gap-1">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={onToggleMaximize}
            title={isMaximized ? "还原设置中心" : "最大化设置中心"}
            aria-label={isMaximized ? "还原设置中心" : "最大化设置中心"}
          >
            {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            onClick={onCloseRequest}
            title={isWorkspaceView ? "返回设置" : "关闭设置中心"}
            aria-label={isWorkspaceView ? "返回设置" : "关闭设置中心"}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <DialogHeader
          className={cn(
            "settings-center-drag-handle shrink-0 border-b border-border/80 bg-muted/10 px-5 pr-24 text-left",
            isMaximized ? "cursor-default" : "cursor-grab active:cursor-grabbing",
            isWorkspaceView ? "py-2" : "py-3",
          )}
          onPointerDown={onBeginDrag}
        >
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              {settingsView === "prompt-editor" ? (
                promptHeaderContent
              ) : settingsView === "ai-config-manager" ? (
                <DialogTitle className="text-base">AI 配置组</DialogTitle>
              ) : settingsView === "luogu-account-manager" ? (
                <DialogTitle className="text-base">洛谷账号配置</DialogTitle>
              ) : (
                <>
                  <DialogTitle className="text-base">设置中心</DialogTitle>
                  <div className="text-xs leading-5 text-muted-foreground">左侧选择设置页，右侧只显示当前页。</div>
                </>
              )}
            </div>
            {settingsView === "main" ? mainHeaderActions : settingsView === "prompt-editor" ? promptHeaderActions : null}
          </div>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 overflow-hidden flex-col md:flex-row">
          {settingsView === "main" && (
            <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-border/80 bg-muted/10 md:w-[236px] md:min-w-[236px] md:border-b-0 md:border-r">
              <div className="px-4 py-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">设置</div>
              <ScrollArea className="min-h-0 flex-1 max-h-[28vh] md:max-h-none">
                <div className="grid gap-0 p-2">
                  {visibleSettingsTree.map((group) => {
                    const isExpanded = expandedSettingsGroups[group.id] === true;
                    const groupActive = activeSettingsGroupId === group.id;
                    const categoryActive = activeSettingsTarget.type === "category" && activeSettingsTarget.category === group.id;
                    return (
                      <div key={group.id} className="grid gap-0">
                        <div
                          className={cn(
                            "flex h-8 w-full items-center gap-1.5 rounded-sm px-2 text-left text-sm font-medium",
                            categoryActive ? "bg-accent text-accent-foreground" : groupActive ? "text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                          )}
                        >
                          <button
                            type="button"
                            className="flex h-6 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted/60"
                            onClick={(event) => {
                              event.stopPropagation();
                              onToggleGroup(group.id);
                            }}
                            aria-label={isExpanded ? `收起 ${group.label}` : `展开 ${group.label}`}
                          >
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left"
                            onClick={() => onOpenSettingsSection(group.id)}
                          >
                            {group.label}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="grid gap-0 pl-5">
                            {group.children.map((child) => {
                              const isActive = activeSettingsTarget.type === "page" && activeSettingsPageKey === child.id;
                              return (
                                <button
                                  key={child.id}
                                  type="button"
                                  className={cn(
                                    "h-7 truncate rounded-sm px-2 text-left text-sm",
                                    isActive
                                      ? "bg-accent text-accent-foreground"
                                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                                  )}
                                  onClick={() => onOpenSettingsSection(child.id)}
                                >
                                  {child.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </aside>
          )}
          <main
            className={cn(
              "min-h-0 min-w-0 flex-1 overflow-hidden",
              settingsView === "luogu-account-manager" ? "bg-white dark:bg-background" : "bg-background/70",
            )}
          >
            {settingsView === "prompt-editor" ? (
              <div className="flex h-full min-h-0 flex-col overflow-hidden">{renderPromptEditor()}</div>
            ) : settingsView === "ai-config-manager" && renderAiConfigManager ? (
              <div className="flex h-full min-h-0 flex-col overflow-hidden">{renderAiConfigManager()}</div>
            ) : settingsView === "luogu-account-manager" && renderLuoguAccountManager ? (
              <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white dark:bg-background">{renderLuoguAccountManager()}</div>
            ) : (
              <div ref={contentRef} className="h-full min-h-0 overflow-auto" data-settings-scroll-container="true">
                <div className="sticky top-0 z-10 border-b border-border/80 bg-background/95 px-6 py-2 backdrop-blur">
                  <div className="text-sm font-semibold text-foreground">{activeSettingsLabel.group}</div>
                  {activeSettingsLabel.section && <div className="text-xs text-muted-foreground">{activeSettingsLabel.section}</div>}
                </div>
                <div className="grid min-w-0 gap-0 px-0 pb-2">{renderActivePage(activeSettingsPageKey, activeSettingsTarget)}</div>
              </div>
            )}
          </main>
        </div>
        <button
          type="button"
          className="absolute bottom-0 right-0 top-0 z-20 w-2 cursor-ew-resize bg-transparent"
          onPointerDown={(event) => onBeginResize("right", event)}
          aria-label="从右侧调整设置中心宽度"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute bottom-0 left-0 top-0 z-20 w-2 cursor-ew-resize bg-transparent"
          onPointerDown={(event) => onBeginResize("left", event)}
          aria-label="从左侧调整设置中心宽度"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute left-0 right-0 top-0 z-20 h-2 cursor-ns-resize bg-transparent"
          onPointerDown={(event) => onBeginResize("top", event)}
          aria-label="从顶部调整设置中心高度"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute bottom-0 left-0 right-0 z-20 h-2 cursor-ns-resize bg-transparent"
          onPointerDown={(event) => onBeginResize("bottom", event)}
          aria-label="从底部调整设置中心高度"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute left-0 top-0 z-30 h-4 w-4 cursor-nwse-resize bg-transparent"
          onPointerDown={(event) => onBeginResize("top-left", event)}
          aria-label="调整设置中心左上角"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute right-0 top-0 z-30 h-4 w-4 cursor-nesw-resize bg-transparent"
          onPointerDown={(event) => onBeginResize("top-right", event)}
          aria-label="调整设置中心右上角"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute bottom-0 left-0 z-30 h-4 w-4 cursor-nesw-resize bg-transparent"
          onPointerDown={(event) => onBeginResize("bottom-left", event)}
          aria-label="调整设置中心左下角"
          tabIndex={-1}
        />
        <button
          type="button"
          className="absolute bottom-0 right-0 z-30 h-4 w-4 cursor-nwse-resize bg-transparent"
          onPointerDown={(event) => onBeginResize("bottom-right", event)}
          aria-label="调整设置中心右下角"
          tabIndex={-1}
        />
      </DialogContent>
    </Dialog>
  );
}
