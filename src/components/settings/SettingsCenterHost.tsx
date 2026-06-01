import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import SettingsCenterShell from "./SettingsCenterShell";
import type { SettingsCenterShellProps } from "./SettingsCenterShell";
import type {
  SettingsActiveLabel,
  SettingsCategory,
  SettingsGroupId,
  SettingsSection,
  SettingsTarget,
  SettingsView,
} from "./settingsTypes";

export interface SettingsCenterHostHandle {
  open: () => SettingsSection;
  openSection: (category: SettingsCategory) => SettingsSection;
  openPage: (page: SettingsSection) => SettingsSection;
  openTarget: (target: SettingsTarget) => SettingsSection;
  openPromptEditor: (promptId?: string, returnTarget?: SettingsTarget | SettingsSection | null) => void;
  closePromptEditor: () => SettingsSection;
  openAiConfigManager: () => void;
  closeAiConfigManager: () => void;
  openLuoguAccountManager: () => void;
  closeLuoguAccountManager: () => void;
  close: () => void;
  resetUiAfterClose: () => void;
  isOpen: () => boolean;
  getActivePage: () => SettingsSection;
  getView: () => SettingsView;
}

type ShellControlledProps =
  | "open"
  | "onOpenChange"
  | "settingsView"
  | "expandedSettingsGroups"
  | "activeSettingsGroupId"
  | "activeSettingsTarget"
  | "activeSettingsPageKey"
  | "activeSettingsLabel"
  | "onToggleGroup"
  | "onOpenSettingsSection"
  | "onActiveSettingsSectionChange";

interface SettingsCenterHostProps extends Omit<SettingsCenterShellProps, ShellControlledProps> {
  disabled?: boolean;
  defaultPage: SettingsSection;
  sectionFallback: Record<SettingsCategory, SettingsSection>;
  sectionLabels: Record<SettingsSection, SettingsActiveLabel & { groupId: SettingsGroupId }>;
  onBeforeOpen?: () => void;
  onOpenStateChange?: (open: boolean) => void;
  onActivePageChange?: (page: SettingsSection) => void;
  onSettingsViewChange?: (view: SettingsView) => void;
}

const SettingsCenterHost = forwardRef<SettingsCenterHostHandle, SettingsCenterHostProps>(
  (
    {
      disabled = false,
      defaultPage,
      sectionFallback,
      sectionLabels,
      visibleSettingsTree,
      contentRef,
      onBeforeOpen,
      onOpenStateChange,
      onActivePageChange,
      onSettingsViewChange,
      ...shellProps
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const [activePageKey, setActivePageKey] = useState<SettingsSection>(defaultPage);
    const defaultGroupId = sectionLabels[defaultPage]?.groupId ?? "appearance";
    const [activeSettingsTarget, setActiveSettingsTarget] = useState<SettingsTarget>({ type: "category", category: defaultGroupId });
    const [settingsView, setSettingsView] = useState<SettingsView>("main");
    const [expandedSettingsGroups, setExpandedSettingsGroups] = useState<Record<string, boolean>>({});

    const openRef = useRef(open);
    const activePageRef = useRef(activePageKey);
    const settingsViewRef = useRef(settingsView);
    const promptEditorReturnPageRef = useRef<SettingsSection>(defaultPage);

    const visiblePageIds = useMemo(
      () => new Set(visibleSettingsTree.flatMap((group) => group.children.map((child) => child.id))),
      [visibleSettingsTree],
    );
    const visibleGroupIds = useMemo(
      () => new Set(visibleSettingsTree.map((group) => group.id)),
      [visibleSettingsTree],
    );

    const resolvePage = useCallback((page: SettingsSection): SettingsSection => {
      return visiblePageIds.has(page) ? page : defaultPage;
    }, [defaultPage, visiblePageIds]);

    const resolveTarget = useCallback((target: SettingsTarget | SettingsSection | null | undefined): SettingsSection => {
      if (!target) return activePageRef.current;
      if (typeof target === "string") return resolvePage(target);
      if (target.type === "page") return resolvePage(target.page);
      return resolvePage(sectionFallback[target.category] ?? defaultPage);
    }, [defaultPage, resolvePage, sectionFallback]);

    const setHostOpen = useCallback((nextOpen: boolean) => {
      openRef.current = nextOpen;
      setOpen(nextOpen);
      onOpenStateChange?.(nextOpen);
    }, [onOpenStateChange]);

    const ensureOpen = useCallback(() => {
      if (openRef.current) return;
      onBeforeOpen?.();
      setHostOpen(true);
    }, [onBeforeOpen, setHostOpen]);

    const setActivePage = useCallback((page: SettingsSection) => {
      const nextPage = resolvePage(page);
      activePageRef.current = nextPage;
      setActivePageKey(nextPage);
      onActivePageChange?.(nextPage);
      return nextPage;
    }, [onActivePageChange, resolvePage]);

    const setHostView = useCallback((view: SettingsView) => {
      settingsViewRef.current = view;
      setSettingsView(view);
      onSettingsViewChange?.(view);
    }, [onSettingsViewChange]);

    const expandActiveGroup = useCallback((page: SettingsSection, forceReset: boolean) => {
      const groupId = sectionLabels[page]?.groupId;
      setExpandedSettingsGroups((current) => {
        const next = forceReset ? {} : current;
        return groupId && next[groupId] !== true ? { ...next, [groupId]: true } : next;
      });
    }, [sectionLabels]);

    const expandGroup = useCallback((groupId: SettingsGroupId, forceReset: boolean) => {
      setExpandedSettingsGroups((current) => {
        const next = forceReset ? {} : current;
        return next[groupId] === true ? next : { ...next, [groupId]: true };
      });
    }, []);

    const openPageInternal = useCallback((page: SettingsSection, options?: { resetExpanded?: boolean }) => {
      const wasOpen = openRef.current;
      const nextPage = setActivePage(page);
      const nextTarget: SettingsTarget = { type: "page", page: nextPage };
      setActiveSettingsTarget(nextTarget);
      setHostView("main");
      expandActiveGroup(nextPage, options?.resetExpanded ?? !wasOpen);
      ensureOpen();
      window.requestAnimationFrame(() => {
        const settingsContent = contentRef.current;
        const section = settingsContent?.querySelector<HTMLElement>(`[data-settings-section="${nextPage}"]`);
        if (!settingsContent || !section) return;
        const headerHeight = settingsContent.querySelector<HTMLElement>("[data-settings-scroll-header]")?.offsetHeight ?? 0;
        settingsContent.scrollTop += section.getBoundingClientRect().top - settingsContent.getBoundingClientRect().top - headerHeight;
      });
      return nextPage;
    }, [contentRef, ensureOpen, expandActiveGroup, setActivePage, setHostView]);

    const openSection = useCallback((category: SettingsCategory) => {
      const fallbackPage = sectionFallback[category] ?? defaultPage;
      const fallbackGroupId = sectionLabels[fallbackPage]?.groupId;
      const canShowFallbackPage =
        category === "editor" ||
        (fallbackGroupId !== undefined && visibleGroupIds.has(fallbackGroupId) && visiblePageIds.has(fallbackPage));
      const nextPage = setActivePage(canShowFallbackPage ? fallbackPage : defaultPage);
      const targetCategory = visibleGroupIds.has(category as SettingsGroupId)
        ? category as SettingsGroupId
        : sectionLabels[nextPage]?.groupId ?? "appearance";
      const nextTarget: SettingsTarget = { type: "category", category: targetCategory };
      setActiveSettingsTarget(nextTarget);
      setHostView("main");
      expandGroup(targetCategory, !openRef.current);
      ensureOpen();
      window.requestAnimationFrame(() => {
        const settingsContent = contentRef.current;
        if (settingsContent) settingsContent.scrollTop = 0;
      });
      return nextPage;
    }, [contentRef, defaultPage, ensureOpen, expandGroup, sectionFallback, sectionLabels, setActivePage, setHostView, visibleGroupIds, visiblePageIds]);

    const setActiveSectionFromScroll = useCallback((page: SettingsSection) => {
      const nextPage = setActivePage(page);
      setActiveSettingsTarget({ type: "page", page: nextPage });
    }, [setActivePage]);

    const openSettingsCenter = useCallback(() => {
      return openSection(defaultGroupId);
    }, [defaultGroupId, openSection]);

    const openTarget = useCallback((target: SettingsTarget) => {
      return target.type === "category" ? openSection(target.category) : openPageInternal(target.page);
    }, [openPageInternal, openSection]);

    const openPromptEditor = useCallback((_promptId?: string, returnTarget?: SettingsTarget | SettingsSection | null) => {
      promptEditorReturnPageRef.current = resolveTarget(returnTarget);
      setHostView("prompt-editor");
      ensureOpen();
    }, [ensureOpen, resolveTarget, setHostView]);

    const closePromptEditor = useCallback(() => {
      const nextPage = setActivePage(promptEditorReturnPageRef.current || sectionFallback.ai || defaultPage);
      setHostView("main");
      return nextPage;
    }, [defaultPage, sectionFallback.ai, setActivePage, setHostView]);

    const openAiConfigManager = useCallback(() => {
      setHostView("ai-config-manager");
      ensureOpen();
    }, [ensureOpen, setHostView]);

    const closeAiConfigManager = useCallback(() => {
      setActivePage(sectionFallback.ai ?? "ai-api");
      setHostView("main");
    }, [sectionFallback.ai, setActivePage, setHostView]);

    const openLuoguAccountManager = useCallback(() => {
      setHostView("luogu-account-manager");
      ensureOpen();
    }, [ensureOpen, setHostView]);

    const closeLuoguAccountManager = useCallback(() => {
      const nextPage = setActivePage(sectionFallback.luogu ?? "luogu-account");
      setActiveSettingsTarget({ type: "page", page: nextPage });
      setHostView("main");
    }, [sectionFallback.luogu, setActivePage, setHostView]);

    const closeSettingsCenter = useCallback(() => {
      setHostOpen(false);
    }, [setHostOpen]);

    const resetUiAfterClose = useCallback(() => {
      setHostView("main");
      setExpandedSettingsGroups({});
    }, [setHostView]);

    const toggleGroup = useCallback((groupId: string) => {
      setExpandedSettingsGroups((current) => ({ ...current, [groupId]: !current[groupId] }));
    }, []);

    const openSettingsSection = useCallback((target: SettingsSection | SettingsCategory) => {
      if (target in sectionFallback) {
        openSection(target as SettingsCategory);
        return;
      }
      openPageInternal(target as SettingsSection);
    }, [openPageInternal, openSection, sectionFallback]);

    useImperativeHandle(ref, () => ({
      open: openSettingsCenter,
      openSection,
      openPage: (page) => openPageInternal(page),
      openTarget,
      openPromptEditor,
      closePromptEditor,
      openAiConfigManager,
      closeAiConfigManager,
      openLuoguAccountManager,
      closeLuoguAccountManager,
      close: closeSettingsCenter,
      resetUiAfterClose,
      isOpen: () => openRef.current,
      getActivePage: () => activePageRef.current,
      getView: () => settingsViewRef.current,
    }), [
      closePromptEditor,
      closeLuoguAccountManager,
      closeSettingsCenter,
      openAiConfigManager,
      closeAiConfigManager,
      openLuoguAccountManager,
      openPageInternal,
      openPromptEditor,
      openSection,
      openSettingsCenter,
      openTarget,
      resetUiAfterClose,
    ]);

    useEffect(() => {
      openRef.current = open;
      onOpenStateChange?.(open);
    }, [onOpenStateChange, open]);

    useEffect(() => {
      activePageRef.current = activePageKey;
      onActivePageChange?.(activePageKey);
    }, [activePageKey, onActivePageChange]);

    useEffect(() => {
      settingsViewRef.current = settingsView;
      onSettingsViewChange?.(settingsView);
    }, [onSettingsViewChange, settingsView]);

    useEffect(() => {
      if (activeSettingsTarget.type === "category" && visibleGroupIds.has(activeSettingsTarget.category)) return;
      if (activeSettingsTarget.type === "page" && visiblePageIds.has(activePageKey)) return;
      const fallbackCategory = visibleSettingsTree[0]?.id ?? "appearance";
      const fallbackPage = setActivePage(sectionFallback[fallbackCategory] ?? defaultPage);
      const nextTarget: SettingsTarget = { type: "page", page: fallbackPage };
      setActiveSettingsTarget(nextTarget);
      setHostView("main");
    }, [activePageKey, activeSettingsTarget, defaultPage, sectionFallback, setActivePage, setHostView, visibleGroupIds, visiblePageIds, visibleSettingsTree]);

    const activeSettingsGroupId =
      activeSettingsTarget.type === "category"
        ? activeSettingsTarget.category
        : sectionLabels[activePageKey]?.groupId ?? "appearance";
    const activeGroupLabel = visibleSettingsTree.find((group) => group.id === activeSettingsGroupId)?.label ?? sectionLabels[activePageKey]?.group ?? sectionLabels[defaultPage].group;
    const activeSettingsLabel =
      activeSettingsTarget.type === "category"
        ? { group: activeGroupLabel, section: "" }
        : sectionLabels[activePageKey] ?? sectionLabels[defaultPage];

    return (
      <SettingsCenterShell
        {...shellProps}
        contentRef={contentRef}
        open={open && !disabled}
        settingsView={settingsView}
        visibleSettingsTree={visibleSettingsTree}
        expandedSettingsGroups={expandedSettingsGroups}
        activeSettingsGroupId={activeSettingsGroupId}
        activeSettingsTarget={activeSettingsTarget}
        activeSettingsPageKey={activePageKey}
        activeSettingsLabel={activeSettingsLabel}
        onToggleGroup={toggleGroup}
        onOpenSettingsSection={openSettingsSection}
        onActiveSettingsSectionChange={setActiveSectionFromScroll}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            openSettingsCenter();
            return;
          }
          shellProps.onCloseRequest();
        }}
      />
    );
  },
);

SettingsCenterHost.displayName = "SettingsCenterHost";

export default SettingsCenterHost;
