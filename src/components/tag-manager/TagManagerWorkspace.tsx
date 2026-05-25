import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveTagTaxonomyConfig } from "@/lib/api";
import { createDenseOrderOverrides, getTagSuggestionList, getTagSuggestionRootGroups, type TagSuggestion, type TagSuggestionRootGroup, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 960;
const MIN_HEIGHT = 600;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 820;
const MARGIN_X = 36;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 36;
const STATUS_DURATION_MS = 1800;
const DEBUG_KEY = "oi-notebook.debugTagManager";
const DEBUG_LOG_KEY = "oi-notebook.debugTagManagerLog";
const DEBUG_LOG_LIMIT = 300;

type WorkspaceRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ResizeHandle = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
type SortScope = "root" | "group" | "tag";
type SaveOperation = "sort" | "visibility" | "alias";

type RootGroup = TagSuggestionRootGroup;

type GroupOrderSaveDebugContext = {
  scope: SortScope;
  parentKey?: string;
  previousIds: string[];
  nextIds: string[];
  currentIdsSource: string;
  currentGroups?: RootGroup["groups"];
};

type StatusMessage = {
  kind: "success" | "error";
  message: string;
} | null;

type MergePreviewInfo = {
  targetReference: string | null;
  targetSuggestion: TagSuggestion | null;
  incomingSuggestions: TagSuggestion[];
};

type SortableRenderProps = ReturnType<typeof useSortable>;

export type TagManagerCloseReason =
  | "close-button";

export type TagManagerWorkspaceProps = {
  initialConfig: UserTagTaxonomyConfig;
  onRequestClose: (reason: TagManagerCloseReason, finalConfig: UserTagTaxonomyConfig) => void;
};

function isDebugEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(DEBUG_KEY) === "1";
  } catch {
    return false;
  }
}

function recordDebugEvent(event: string, payload?: unknown): void {
  if (!isDebugEnabled()) return;
  try {
    const raw = window.localStorage.getItem(DEBUG_LOG_KEY) ?? "";
    const entries = raw.split("\n").filter(Boolean);
    entries.push(JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      payload,
    }));
    window.localStorage.setItem(DEBUG_LOG_KEY, entries.slice(-DEBUG_LOG_LIMIT).join("\n"));
  } catch {
    // Debug logging must not affect application behavior.
  }
}

function debugEvent(event: string, payload?: unknown): void {
  recordDebugEvent(event, payload);
}

function normalizeConfig(config: UserTagTaxonomyConfig | null | undefined): UserTagTaxonomyConfig {
  return {
    version: config?.version ?? 1,
    entries: [...(config?.entries ?? [])],
    aliases: { ...(config?.aliases ?? {}) },
    hiddenIds: [...(config?.hiddenIds ?? [])],
    orderOverrides: { ...(config?.orderOverrides ?? {}) },
    merges: { ...(config?.merges ?? {}) },
  };
}

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

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getAliasCompareKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function getUserAliasesForSuggestion(config: UserTagTaxonomyConfig, suggestion: TagSuggestion | null): string[] {
  if (!suggestion) return [];
  return Object.entries(config.aliases ?? {})
    .filter(([, targetId]) => targetId === suggestion.id)
    .map(([alias]) => alias.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function getBuiltinAliasesForSuggestion(suggestion: TagSuggestion | null, userAliases: string[]): string[] {
  if (!suggestion) return [];
  const userAliasKeys = new Set(userAliases.map(getAliasCompareKey));
  return suggestion.aliases.filter((alias) => !userAliasKeys.has(getAliasCompareKey(alias)));
}

function resolveSuggestionReference(reference: string, suggestions: TagSuggestion[]): TagSuggestion | null {
  const text = reference.trim();
  if (!text) return null;

  const byId = suggestions.find((suggestion) => suggestion.id === text);
  if (byId) return byId;

  const key = getAliasCompareKey(text);
  return suggestions.find((suggestion) => {
    if (getAliasCompareKey(suggestion.id) === key) return true;
    if (getAliasCompareKey(suggestion.pathText) === key) return true;
    if (getAliasCompareKey(suggestion.name) === key) return true;
    return suggestion.aliases.some((alias) => getAliasCompareKey(alias) === key);
  }) ?? null;
}

function getMergePreviewInfo(
  config: UserTagTaxonomyConfig,
  suggestion: TagSuggestion | null,
  suggestions: TagSuggestion[],
): MergePreviewInfo {
  const merges = config.merges ?? {};
  const targetReference = suggestion ? merges[suggestion.id]?.trim() || null : null;
  const targetSuggestion = targetReference ? resolveSuggestionReference(targetReference, suggestions) : null;
  const incomingSuggestions = suggestion
    ? Object.entries(merges)
      .filter(([sourceId, target]) => sourceId !== suggestion.id && resolveSuggestionReference(target, suggestions)?.id === suggestion.id)
      .map(([sourceId]) => suggestions.find((item) => item.id === sourceId))
      .filter((item): item is TagSuggestion => Boolean(item))
      .sort((a, b) => a.pathText.localeCompare(b.pathText, "zh-CN"))
    : [];

  return {
    targetReference,
    targetSuggestion,
    incomingSuggestions,
  };
}

function getSaveEventBase(operation: SaveOperation): string {
  if (operation === "visibility") return "manager.visibilitySave";
  if (operation === "alias") return "manager.aliasSave";
  return "manager.sortSave";
}

function createOrderOverrides(currentOverrides: Record<string, number> | undefined, nextIds: string[]): Record<string, number> {
  return createDenseOrderOverrides(currentOverrides, nextIds);
}

function sortGroupsByOrderOverrides(
  groups: RootGroup["groups"],
  orderOverrides: Record<string, number> | undefined,
): RootGroup["groups"] {
  return groups
    .map((group, defaultOrder) => ({ group, defaultOrder }))
    .sort((a, b) => {
      const orderA = orderOverrides?.[a.group.orderKey];
      const orderB = orderOverrides?.[b.group.orderKey];

      if (orderA !== undefined || orderB !== undefined) {
        return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER)
          || a.defaultOrder - b.defaultOrder;
      }

      return a.defaultOrder - b.defaultOrder;
    })
    .map(({ group }) => group);
}

function getDebugGroupOrderRows(
  groups: RootGroup["groups"],
  orderOverrides: Record<string, number> | undefined,
): Array<{ name: string; orderKey: string; override: number | undefined }> {
  return groups.map((group) => ({
    name: group.name,
    orderKey: group.orderKey,
    override: orderOverrides?.[group.orderKey],
  }));
}

function SortableItem({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (sortable: SortableRenderProps) => ReactNode;
}) {
  const sortable = useSortable({ id, disabled });
  return <>{children(sortable)}</>;
}

export default function TagManagerWorkspace({ initialConfig, onRequestClose }: TagManagerWorkspaceProps) {
  const [workingConfig, setWorkingConfig] = useState(() => normalizeConfig(initialConfig));
  const [dialogRect, setDialogRect] = useState<WorkspaceRect>(getDefaultRect);
  const [searchQuery, setSearchQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [debugActionMessage, setDebugActionMessage] = useState<string | null>(null);
  const [isDebugPanelVisible] = useState(isDebugEnabled);
  const panelRef = useRef<HTMLElement | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const debugActionTimeoutRef = useRef<number | null>(null);
  const groupRenderDebugKeyRef = useRef<string | null>(null);
  const groupAfterWorkingConfigDebugKeyRef = useRef<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const suggestions = useMemo(() => getTagSuggestionList(workingConfig, { includeHidden: showHidden, includeDeprecated: true }), [showHidden, workingConfig]);
  const rootGroups = useMemo(() => getTagSuggestionRootGroups(workingConfig, { includeHidden: showHidden, includeDeprecated: true }), [showHidden, workingConfig]);
  const activeRootGroup = useMemo(() => rootGroups.find((group) => group.root === activeRoot) ?? rootGroups[0] ?? null, [activeRoot, rootGroups]);
  const activeRootSortedGroups = useMemo(
    () => activeRootGroup ? sortGroupsByOrderOverrides(activeRootGroup.groups, workingConfig.orderOverrides) : [],
    [activeRootGroup, workingConfig.orderOverrides],
  );
  const activeRootSortableItems = useMemo(
    () => activeRootSortedGroups.map((group) => group.orderKey),
    [activeRootSortedGroups],
  );
  const selectedSuggestion = useMemo(() => suggestions.find((suggestion) => suggestion.id === selectedSuggestionId) ?? null, [selectedSuggestionId, suggestions]);
  const selectedUserAliases = useMemo(() => getUserAliasesForSuggestion(workingConfig, selectedSuggestion), [selectedSuggestion, workingConfig]);
  const selectedBuiltinAliases = useMemo(() => getBuiltinAliasesForSuggestion(selectedSuggestion, selectedUserAliases), [selectedSuggestion, selectedUserAliases]);
  const mergePreview = useMemo(() => getMergePreviewInfo(workingConfig, selectedSuggestion, suggestions), [selectedSuggestion, suggestions, workingConfig]);
  const canManageAliases = Boolean(selectedSuggestion && selectedSuggestion.path.length >= 3);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return suggestions
      .filter((suggestion) => [suggestion.id, suggestion.name, suggestion.pathText, suggestion.searchText, ...suggestion.aliases].join("\n").toLowerCase().includes(query))
      .slice(0, 100);
  }, [searchQuery, suggestions]);

  useEffect(() => {
    debugEvent("manager.mount", {
      hiddenIds: initialConfig.hiddenIds?.length ?? 0,
      orderOverrides: Object.keys(initialConfig.orderOverrides ?? {}).length,
    });
    return () => debugEvent("manager.unmount");
  }, [initialConfig]);

  useEffect(() => {
    if (rootGroups.length === 0) {
      setActiveRoot(null);
      return;
    }
    setActiveRoot((current) => (current && rootGroups.some((group) => group.root === current) ? current : rootGroups[0].root));
  }, [rootGroups]);

  useEffect(() => {
    setAliasInput("");
    setAliasError(null);
  }, [selectedSuggestionId]);

  useEffect(() => {
    if (!activeRootGroup) {
      return;
    }

    const rawGroups = getDebugGroupOrderRows(activeRootGroup.groups, workingConfig.orderOverrides);
    const sortedGroups = getDebugGroupOrderRows(activeRootSortedGroups, workingConfig.orderOverrides);
    const hasGroupOverride = rawGroups.some((group) => group.override !== undefined);

    if (activeRootGroup.root !== "算法" && !hasGroupOverride) {
      return;
    }

    const payload = {
      activeRootName: activeRootGroup.root,
      activeRootOrderKey: activeRootGroup.orderKey,
      rawGroups,
      activeRootSortedGroups: sortedGroups,
      sortableItems: activeRootSortableItems,
      workingOrderOverrideCount: Object.keys(workingConfig.orderOverrides ?? {}).length,
      searchQueryEmpty: searchQuery.trim().length === 0,
    };
    const debugKey = JSON.stringify(payload);

    if (groupRenderDebugKeyRef.current === debugKey) {
      return;
    }

    groupRenderDebugKeyRef.current = debugKey;
    debugEvent("manager.groupOrder.render", payload);
  }, [activeRootGroup, activeRootSortableItems, activeRootSortedGroups, searchQuery, workingConfig.orderOverrides]);

  useEffect(() => {
    if (!activeRootGroup) {
      return;
    }

    const rawGroups = getDebugGroupOrderRows(activeRootGroup.groups, workingConfig.orderOverrides);
    const hasGroupOverride = rawGroups.some((group) => group.override !== undefined);

    if (activeRootGroup.root !== "算法" && !hasGroupOverride) {
      return;
    }

    const payload = {
      activeRootName: activeRootGroup.root,
      activeRootOrderKey: activeRootGroup.orderKey,
      activeRootSortedGroups: getDebugGroupOrderRows(activeRootSortedGroups, workingConfig.orderOverrides),
      sortableItems: activeRootSortableItems,
      workingOrderOverrideCount: Object.keys(workingConfig.orderOverrides ?? {}).length,
    };
    const debugKey = JSON.stringify(payload);

    if (groupAfterWorkingConfigDebugKeyRef.current === debugKey) {
      return;
    }

    groupAfterWorkingConfigDebugKeyRef.current = debugKey;
    debugEvent("manager.groupOrder.afterWorkingConfig", payload);
  }, [activeRootGroup, activeRootSortableItems, activeRootSortedGroups, workingConfig.orderOverrides]);

  useEffect(() => () => {
    if (statusTimeoutRef.current !== null) window.clearTimeout(statusTimeoutRef.current);
    if (debugActionTimeoutRef.current !== null) window.clearTimeout(debugActionTimeoutRef.current);
  }, []);

  const showStatus = useCallback((nextStatus: Exclude<StatusMessage, null>) => {
    if (statusTimeoutRef.current !== null) window.clearTimeout(statusTimeoutRef.current);
    setStatus(nextStatus);
    statusTimeoutRef.current = window.setTimeout(() => {
      setStatus(null);
      statusTimeoutRef.current = null;
    }, STATUS_DURATION_MS);
  }, []);

  const showDebugActionMessage = useCallback((message: string) => {
    if (debugActionTimeoutRef.current !== null) window.clearTimeout(debugActionTimeoutRef.current);
    setDebugActionMessage(message);
    debugActionTimeoutRef.current = window.setTimeout(() => {
      setDebugActionMessage(null);
      debugActionTimeoutRef.current = null;
    }, 1600);
  }, []);

  const copyDebugLog = useCallback(async () => {
    const log = window.localStorage.getItem(DEBUG_LOG_KEY) ?? "";
    try {
      await navigator.clipboard.writeText(log);
      showDebugActionMessage("已复制调试日志");
    } catch {
      showDebugActionMessage("复制失败，请从 localStorage 读取调试日志");
    }
  }, [showDebugActionMessage]);

  const clearDebugLog = useCallback(() => {
    window.localStorage.removeItem(DEBUG_LOG_KEY);
    showDebugActionMessage("已清空调试日志");
  }, [showDebugActionMessage]);

  const saveWorkingConfig = useCallback(async (
    nextConfig: UserTagTaxonomyConfig,
    previousConfig: UserTagTaxonomyConfig,
    failureMessage = "保存失败，已恢复原顺序",
    operation: SaveOperation = "sort",
  ): Promise<boolean> => {
    const normalizedConfig = normalizeConfig(nextConfig);
    const eventBase = getSaveEventBase(operation);
    setWorkingConfig(normalizedConfig);
    setIsSaving(true);
    debugEvent(`${eventBase}.start`, {
      hiddenIds: normalizedConfig.hiddenIds?.length ?? 0,
      aliases: Object.keys(normalizedConfig.aliases ?? {}).length,
      orderOverrides: Object.keys(normalizedConfig.orderOverrides ?? {}).length,
    });
    try {
      await saveTagTaxonomyConfig(normalizedConfig);
      debugEvent(`${eventBase}.success`, {
        hiddenIds: normalizedConfig.hiddenIds?.length ?? 0,
        aliases: Object.keys(normalizedConfig.aliases ?? {}).length,
        orderOverrides: Object.keys(normalizedConfig.orderOverrides ?? {}).length,
      });
      showStatus({ kind: "success", message: "修改已保存" });
      return true;
    } catch (error) {
      debugEvent(`${eventBase}.error`, error);
      setWorkingConfig(previousConfig);
      showStatus({ kind: "error", message: failureMessage });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [showStatus]);

  const saveOrder = useCallback((nextIds: string[], debugContext?: GroupOrderSaveDebugContext) => {
    const currentConfig = normalizeConfig(workingConfig);
    const nextConfig = normalizeConfig({
      ...currentConfig,
      orderOverrides: createOrderOverrides(currentConfig.orderOverrides, nextIds),
    });

    if (debugContext?.scope === "group") {
      debugEvent("manager.groupOrder.saveNext", {
        scope: debugContext.scope,
        parentKey: debugContext.parentKey,
        activeRootName: debugContext.parentKey,
        currentIdsSource: debugContext.currentIdsSource,
        previousIds: debugContext.previousIds,
        nextIds: debugContext.nextIds,
        currentGroups: debugContext.currentGroups
          ? getDebugGroupOrderRows(debugContext.currentGroups, currentConfig.orderOverrides)
          : [],
        previousOverridesForNextIds: debugContext.nextIds.map((key) => ({
          key,
          value: currentConfig.orderOverrides?.[key],
        })),
        savedOverridesForNextIds: debugContext.nextIds.map((key) => ({
          key,
          value: nextConfig.orderOverrides?.[key],
        })),
        orderOverrideCountBefore: Object.keys(currentConfig.orderOverrides ?? {}).length,
        orderOverrideCountAfter: Object.keys(nextConfig.orderOverrides ?? {}).length,
      });
    }

    void saveWorkingConfig(nextConfig, currentConfig, "保存失败，已恢复原顺序", "sort");
  }, [saveWorkingConfig, workingConfig]);

  const handleSortStart = useCallback((scope: SortScope, parentKey: string | undefined, event: DragStartEvent) => {
    debugEvent("manager.drag.start", { scope, parentKey, activeId: String(event.active.id) });
  }, []);

  const handleSortEnd = useCallback((
    scope: SortScope,
    parentKey: string | undefined,
    currentIds: string[],
    event: DragEndEvent,
    currentGroups?: RootGroup["groups"],
    currentIdsSource = "unknown",
  ) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) {
      if (scope === "group") {
        debugEvent("manager.groupOrder.dragEnd", {
          scope,
          parentKey,
          activeRootName: parentKey,
          activeId,
          overId,
          currentIds,
          nextIds: currentIds,
          changed: false,
          currentIdsSource,
          currentGroups: currentGroups ? getDebugGroupOrderRows(currentGroups, workingConfig.orderOverrides) : [],
        });
      }
      debugEvent("manager.drag.end", { scope, parentKey, activeId, overId, changed: false });
      return;
    }
    const oldIndex = currentIds.indexOf(activeId);
    const newIndex = currentIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) {
      if (scope === "group") {
        debugEvent("manager.groupOrder.dragEnd", {
          scope,
          parentKey,
          activeRootName: parentKey,
          activeId,
          overId,
          currentIds,
          nextIds: currentIds,
          changed: false,
          currentIdsSource,
          reason: "invalid-index",
          currentGroups: currentGroups ? getDebugGroupOrderRows(currentGroups, workingConfig.orderOverrides) : [],
        });
      }
      debugEvent("manager.drag.end", { scope, parentKey, activeId, overId, changed: false, reason: "invalid-index" });
      return;
    }
    const nextIds = arrayMove(currentIds, oldIndex, newIndex);
    const changed = !areStringArraysEqual(nextIds, currentIds);
    if (scope === "group") {
      debugEvent("manager.groupOrder.dragEnd", {
        scope,
        parentKey,
        activeRootName: parentKey,
        activeId,
        overId,
        currentIds,
        nextIds,
        changed,
        currentIdsSource,
        currentGroups: currentGroups ? getDebugGroupOrderRows(currentGroups, workingConfig.orderOverrides) : [],
      });
    }
    debugEvent("manager.drag.end", { scope, parentKey, activeId, overId, changed });
    if (!changed) return;
    saveOrder(nextIds, {
      scope,
      parentKey,
      previousIds: currentIds,
      nextIds,
      currentIdsSource,
      currentGroups,
    });
  }, [saveOrder, workingConfig.orderOverrides]);

  const setSuggestionHidden = useCallback((suggestion: TagSuggestion, hidden: boolean) => {
    const currentConfig = normalizeConfig(workingConfig);
    const hiddenIds = new Set(currentConfig.hiddenIds ?? []);
    if (hidden) hiddenIds.add(suggestion.id);
    else hiddenIds.delete(suggestion.id);
    const nextConfig = normalizeConfig({ ...currentConfig, hiddenIds: Array.from(hiddenIds) });
    void saveWorkingConfig(nextConfig, currentConfig, "保存失败，已恢复原状态", "visibility");
  }, [saveWorkingConfig, workingConfig]);

  const addAlias = useCallback(async () => {
    if (!selectedSuggestion || !canManageAliases) {
      setAliasError("只有具体标签支持别名管理");
      return;
    }

    const alias = aliasInput.trim();
    const aliasKey = getAliasCompareKey(alias);
    if (!alias) {
      setAliasError("请输入别名");
      return;
    }
    if (aliasKey === getAliasCompareKey(selectedSuggestion.name) || aliasKey === getAliasCompareKey(selectedSuggestion.pathText)) {
      setAliasError("该名称已是当前标签，无需添加");
      return;
    }

    const currentConfig = normalizeConfig(workingConfig);
    const existingUserAlias = Object.keys(currentConfig.aliases ?? {}).some((existingAlias) => getAliasCompareKey(existingAlias) === aliasKey);
    const existingBuiltinAlias = selectedBuiltinAliases.some((existingAlias) => getAliasCompareKey(existingAlias) === aliasKey);

    if (existingUserAlias || existingBuiltinAlias) {
      setAliasError("别名已存在");
      return;
    }

    const nextConfig = normalizeConfig({
      ...currentConfig,
      aliases: {
        ...(currentConfig.aliases ?? {}),
        [alias]: selectedSuggestion.id,
      },
    });
    setAliasError(null);
    const saved = await saveWorkingConfig(nextConfig, currentConfig, "保存失败，已恢复原别名", "alias");
    if (saved) {
      setAliasInput("");
    } else {
      setAliasError("保存失败，已恢复原别名");
    }
  }, [aliasInput, canManageAliases, saveWorkingConfig, selectedBuiltinAliases, selectedSuggestion, workingConfig]);

  const deleteUserAlias = useCallback(async (alias: string) => {
    if (!selectedSuggestion) return;

    const currentConfig = normalizeConfig(workingConfig);
    const nextAliases = { ...(currentConfig.aliases ?? {}) };
    const targetId = nextAliases[alias];

    if (targetId !== selectedSuggestion.id) {
      setAliasError("只能删除当前标签的自定义别名");
      return;
    }

    delete nextAliases[alias];
    const nextConfig = normalizeConfig({
      ...currentConfig,
      aliases: nextAliases,
    });
    setAliasError(null);
    const saved = await saveWorkingConfig(nextConfig, currentConfig, "保存失败，已恢复原别名", "alias");
    if (!saved) {
      setAliasError("保存失败，已恢复原别名");
    }
  }, [saveWorkingConfig, selectedSuggestion, workingConfig]);

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

  const handleClose = useCallback(() => {
    debugEvent("manager.closeButton.click", {
      hiddenIds: workingConfig.hiddenIds?.length ?? 0,
      orderOverrides: Object.keys(workingConfig.orderOverrides ?? {}).length,
    });
    onRequestClose("close-button", workingConfig);
  }, [onRequestClose, workingConfig]);

  return (
    <div
      data-tag-manager-workspace="true"
      className="fixed inset-0 z-[90] bg-background/55 backdrop-blur-[2px]"
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
        ref={panelRef}
        className="absolute flex min-h-[560px] min-w-[900px] flex-col overflow-hidden rounded-sm border border-border/80 bg-background shadow-2xl"
        style={{ left: dialogRect.left, top: dialogRect.top, width: dialogRect.width, height: dialogRect.height }}
      >
        <header className="flex h-12 shrink-0 cursor-grab items-center justify-between gap-4 border-b border-border/70 px-5 active:cursor-grabbing" onPointerDown={beginDrag}>
          <div className="text-base font-semibold text-foreground">标签管理器</div>
          <Button type="button" variant="ghost" size="icon" aria-label="关闭标签管理器" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/70 px-5 py-3">
          <div className="relative min-w-[280px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchQuery} placeholder="搜索标签、路径或别名" onChange={(event) => setSearchQuery(event.target.value)} className="h-9 pl-9 text-sm" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} />
            显示隐藏标签
          </label>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(360px,1fr)_minmax(360px,1fr)] overflow-hidden">
          <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-border/70 bg-muted/5">
            <div className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">一级分类</div>
            <div className="tag-manager-scrollbar min-h-0 overflow-y-auto p-2">
              {rootGroups.length === 0 ? (
                <div className="px-2 py-6 text-sm text-muted-foreground">暂无标签。</div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => handleSortStart("root", undefined, event)} onDragEnd={(event) => handleSortEnd("root", undefined, rootGroups.map((rootGroup) => rootGroup.orderKey), event)}>
                  <SortableContext items={rootGroups.map((rootGroup) => rootGroup.orderKey)} strategy={verticalListSortingStrategy}>
                    <div className="grid gap-1">
                      {rootGroups.map((rootGroup) => {
                        const count = rootGroup.groups.reduce((total, group) => total + group.candidates.length, 0);
                        return (
                          <SortableItem key={rootGroup.orderKey} id={rootGroup.orderKey} disabled={isSaving || Boolean(searchQuery.trim())}>
                            {({ setNodeRef, attributes, listeners, transform, transition, isDragging }) => (
                              <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex min-w-0 items-center gap-1 rounded-sm border-y border-transparent transition-colors", isDragging && "relative z-10 opacity-70 shadow-sm")}>
                                <button type="button" data-no-window-drag="true" title="拖动一级分类排序" aria-label={`拖动一级分类排序 ${rootGroup.root}`} className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted/20 hover:text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40" disabled={isSaving || Boolean(searchQuery.trim())} onClick={(event) => event.stopPropagation()} {...attributes} {...listeners}>
                                  <span className="grid gap-1 text-current"><span className="h-0.5 w-3.5 rounded-full bg-current" /><span className="h-0.5 w-3.5 rounded-full bg-current" /></span>
                                </button>
                                <button type="button" className={cn("flex min-w-0 flex-1 items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-left text-sm transition-colors", activeRootGroup?.root === rootGroup.root ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/20 hover:text-foreground")} onClick={() => setActiveRoot(rootGroup.root)}>
                                  <span className="min-w-0 truncate">{rootGroup.root}</span>
                                  <span className="shrink-0 text-[11px] text-muted-foreground">{count}</span>
                                </button>
                              </div>
                            )}
                          </SortableItem>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </aside>

          <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r border-border/70">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
              <div className="text-xs font-medium text-muted-foreground">{searchQuery.trim() ? `搜索结果 ${searchResults.length}` : activeRootGroup ? `${activeRootGroup.root} 分类` : "标签列表"}</div>
              {!searchQuery.trim() && activeRootGroup && <div className="text-[11px] text-muted-foreground">{activeRootSortedGroups.length} 个中类</div>}
            </div>
            <div className="tag-manager-scrollbar min-h-0 overflow-y-auto p-3">
              {searchQuery.trim() ? (
                searchResults.length === 0 ? (
                  <div className="py-8 text-sm text-muted-foreground">没有找到匹配的标签。</div>
                ) : (
                  <div className="grid gap-1.5">
                    {searchResults.map((suggestion) => (
                      <button key={suggestion.id} type="button" className={cn("grid min-w-0 gap-0.5 rounded-sm border px-3 py-2 text-left transition-colors", selectedSuggestion?.id === suggestion.id ? "border-primary/60 bg-primary/10" : "border-transparent hover:border-border/70 hover:bg-muted/20")} onClick={() => setSelectedSuggestionId(suggestion.id)}>
                        <span className="text-sm text-foreground">{suggestion.name}</span>
                        <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="min-w-0 break-words">{suggestion.pathText}</span>
                          {suggestion.hidden && <span className="shrink-0 rounded-sm border border-border/70 px-1.5 py-0.5">已隐藏</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              ) : activeRootGroup ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => handleSortStart("group", activeRootGroup.root, event)} onDragEnd={(event) => handleSortEnd("group", activeRootGroup.root, activeRootSortableItems, event, activeRootSortedGroups, "activeRootSortedGroups")}>
                  <SortableContext items={activeRootSortableItems} strategy={verticalListSortingStrategy}>
                    <div className="grid gap-2">
                      {activeRootSortedGroups.map((group) => {
                        const groupKey = `${activeRootGroup.root}:${group.name}`;
                        const sortableGroupKey = group.orderKey;
                        const isExpanded = expandedGroups[sortableGroupKey] === true;
                        return (
                          <SortableItem key={groupKey} id={sortableGroupKey} disabled={isSaving || Boolean(searchQuery.trim())}>
                            {({ setNodeRef, attributes, listeners, transform, transition, isDragging }) => (
                              <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("border-b border-t border-b-border/60 border-t-transparent pb-2 last:border-b-0", isDragging && "relative z-10 opacity-70 shadow-sm")}>
                                <div className="flex min-w-0 items-center gap-1 rounded-sm">
                                  <button type="button" data-no-window-drag="true" title="拖动中类排序" aria-label={`拖动中类排序 ${group.name}`} className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted/20 hover:text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40" disabled={isSaving || Boolean(searchQuery.trim())} onClick={(event) => event.stopPropagation()} {...attributes} {...listeners}>
                                    <span className="grid gap-[3px] text-current"><span className="h-px w-3 rounded-full bg-current" /><span className="h-px w-2.5 rounded-full bg-current" /></span>
                                  </button>
                                  <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-sm px-2 py-2 text-left hover:bg-muted/20" onClick={() => setExpandedGroups((current) => ({ ...current, [sortableGroupKey]: !current[sortableGroupKey] }))}>
                                    <span className="flex min-w-0 items-center gap-2">{isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}<span className="min-w-0 text-sm font-medium text-foreground">{group.name}</span></span>
                                    <span className="shrink-0 text-[11px] text-muted-foreground">{group.candidates.length}</span>
                                  </button>
                                </div>
                                {isExpanded && (
                                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => handleSortStart("tag", sortableGroupKey, event)} onDragEnd={(event) => handleSortEnd("tag", sortableGroupKey, group.candidates.map((suggestion) => suggestion.id), event)}>
                                    <SortableContext items={group.candidates.map((suggestion) => suggestion.id)} strategy={verticalListSortingStrategy}>
                                      <div className="grid gap-1 px-2 pb-2 pt-1">
                                        {group.candidates.map((suggestion) => (
                                          <SortableItem key={suggestion.id} id={suggestion.id} disabled={isSaving || Boolean(searchQuery.trim())}>
                                            {({ setNodeRef, attributes, listeners, transform, transition, isDragging }) => (
                                              <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex min-w-0 items-center gap-1 rounded-sm border-y border-transparent", isDragging && "relative z-10 opacity-70 shadow-sm")}>
                                                <button type="button" data-no-window-drag="true" title="拖动标签排序" aria-label={`拖动标签排序 ${suggestion.name}`} className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted/20 hover:text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40" disabled={isSaving || Boolean(searchQuery.trim())} onClick={(event) => event.stopPropagation()} {...attributes} {...listeners}>
                                                  <span className="grid grid-cols-2 gap-0.5 text-current"><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /></span>
                                                </button>
                                                <button type="button" className={cn("flex min-w-0 flex-1 items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors", selectedSuggestion?.id === suggestion.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/20 hover:text-foreground")} onClick={() => setSelectedSuggestionId(suggestion.id)}>
                                                  <span className="min-w-0 break-words">{suggestion.name}</span>
                                                  <span className="flex shrink-0 items-center gap-1">{suggestion.hidden && <span className="rounded-sm border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">已隐藏</span>}{suggestion.source === "user" && <span className="rounded-sm border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">user</span>}</span>
                                                </button>
                                              </div>
                                            )}
                                          </SortableItem>
                                        ))}
                                      </div>
                                    </SortableContext>
                                  </DndContext>
                                )}
                              </section>
                            )}
                          </SortableItem>
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="py-8 text-sm text-muted-foreground">暂无可浏览的标签。</div>
              )}
            </div>
          </main>

          <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
              <div className="text-xs font-medium text-muted-foreground">标签详情</div>
            </div>
            <div className="tag-manager-scrollbar min-h-0 overflow-y-auto p-4">
              {selectedSuggestion ? (
                <div className="grid gap-4">
                  <div className="grid gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-foreground">{selectedSuggestion.name}</span>
                      <span className="rounded-sm border border-border/70 bg-muted/20 px-1.5 py-0.5 text-[11px] text-muted-foreground">{selectedSuggestion.source === "user" ? "用户自定义标签" : "内置标签"}</span>
                      {selectedSuggestion.deprecated && <span className="rounded-sm border border-amber-300/50 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-200">deprecated</span>}
                      {selectedSuggestion.hidden && <span className="rounded-sm border border-border/70 bg-muted/20 px-1.5 py-0.5 text-[11px] text-muted-foreground">已隐藏</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">当前为管理预览。排序、可见性和具体标签别名会写入用户配置。</div>
                  </div>
                  <div className="grid gap-3 text-sm">
                    <div className="grid gap-1"><div className="text-xs text-muted-foreground">完整路径</div><div className="break-words text-foreground">{selectedSuggestion.pathText}</div></div>
                    <div className="grid gap-1"><div className="text-xs text-muted-foreground">canonical id</div><div className="break-all rounded-sm border border-border/70 bg-background/30 px-2 py-1 font-mono text-xs text-foreground">{selectedSuggestion.id}</div></div>
                    <div className="grid gap-1"><div className="text-xs text-muted-foreground">来源</div><div className="text-foreground">{selectedSuggestion.source}</div></div>
                    <div className="grid gap-2 border-t border-border/70 pt-3">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <div className="text-xs text-muted-foreground">别名管理</div>
                        {!canManageAliases && <div className="text-[11px] text-muted-foreground">只有具体标签支持别名管理</div>}
                      </div>
                      <div className="grid gap-1.5">
                        <div className="text-[11px] text-muted-foreground">内置 aliases</div>
                        {selectedBuiltinAliases.length === 0 ? <div className="text-xs text-muted-foreground">暂无内置别名。</div> : (
                          <div className="flex flex-wrap gap-2">
                            {selectedBuiltinAliases.map((alias) => (
                              <span key={alias} className="inline-flex items-center gap-1.5 rounded-sm border border-border/70 bg-background/30 px-2 py-1 text-xs text-muted-foreground">
                                <span>{alias}</span>
                                <span className="rounded-sm border border-border/60 px-1 text-[10px]">内置</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="grid gap-1.5">
                        <div className="text-[11px] text-muted-foreground">自定义 aliases</div>
                        {selectedUserAliases.length === 0 ? <div className="text-xs text-muted-foreground">暂无自定义别名。</div> : (
                          <div className="flex flex-wrap gap-2">
                            {selectedUserAliases.map((alias) => (
                              <span key={alias} className="inline-flex items-center gap-1.5 rounded-sm border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-foreground">
                                <span>{alias}</span>
                                <button
                                  type="button"
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                  aria-label={`删除别名 ${alias}`}
                                  onClick={() => void deleteUserAlias(alias)}
                                  disabled={isSaving}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 gap-2">
                        <Input
                          value={aliasInput}
                          placeholder="添加别名，例如 exKMP"
                          onChange={(event) => {
                            setAliasInput(event.target.value);
                            setAliasError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void addAlias();
                            }
                          }}
                          disabled={!canManageAliases || isSaving}
                          className="h-8 min-w-0 text-sm"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => void addAlias()} disabled={!canManageAliases || isSaving}>
                          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          添加
                        </Button>
                      </div>
                      {aliasError && <div className="text-xs text-destructive">{aliasError}</div>}
                    </div>
                    <div className="grid gap-2 border-t border-border/70 pt-3">
                      <div className="text-xs text-muted-foreground">合并规则</div>
                      <div className="grid gap-1.5 rounded-sm border border-border/70 bg-background/30 p-2.5">
                        {mergePreview.targetReference ? (
                          <div className="grid gap-1">
                            <div className="text-xs text-muted-foreground">当前标签已合并到：</div>
                            <div className="break-words text-sm text-foreground">{mergePreview.targetSuggestion?.pathText ?? mergePreview.targetReference}</div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">当前未设置合并规则。</div>
                        )}
                        {mergePreview.incomingSuggestions.length > 0 && (
                          <div className="grid gap-1 border-t border-border/60 pt-2">
                            <div className="text-xs text-muted-foreground">有 {mergePreview.incomingSuggestions.length} 个标签合并到此标签。</div>
                            <div className="flex flex-wrap gap-1.5">
                              {mergePreview.incomingSuggestions.slice(0, 5).map((source) => (
                                <span key={source.id} className="rounded-sm border border-border/70 bg-muted/20 px-2 py-1 text-xs text-muted-foreground">{source.pathText}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Button type="button" variant="outline" size="sm" disabled>
                          设置合并目标（后续）
                        </Button>
                        <div className="max-w-[28rem] text-xs leading-5 text-muted-foreground">
                          后续将支持把旧标签或重复标签合并到当前标签；这会影响规范化和批量扫描，因此会单独提供预览确认。
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 border-t border-border/70 pt-3">
                      <div className="text-xs text-muted-foreground">可见性</div>
                      <div className="flex min-w-0 flex-wrap items-center gap-3">
                        <span className="text-sm text-foreground">状态：{selectedSuggestion.hidden ? "已隐藏" : "显示中"}</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => setSuggestionHidden(selectedSuggestion, !selectedSuggestion.hidden)} disabled={isSaving}>
                          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {selectedSuggestion.hidden ? "恢复显示" : "隐藏此标签"}
                        </Button>
                      </div>
                      <div className="text-xs leading-5 text-muted-foreground">该操作只写入用户配置 hiddenIds，不会修改内置 taxonomy 或任何笔记。</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-sm border border-dashed border-border/70 text-sm text-muted-foreground">请选择左侧标签。</div>
              )}
            </div>
          </aside>
        </div>

        {status && <div className={cn("pointer-events-none absolute bottom-3 left-3 z-20 rounded-sm border px-3 py-1.5 text-xs shadow-lg", status.kind === "success" ? "border-border/70 bg-background/95 text-foreground" : "border-destructive/40 bg-destructive/10 text-destructive")}>{status.message}</div>}
        {isDebugPanelVisible && (
          <div className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-sm border border-border/70 bg-background/95 px-2 py-1.5 text-[11px] text-muted-foreground shadow-lg">
            <button type="button" className="rounded-sm px-1.5 py-0.5 hover:bg-muted/60 hover:text-foreground" onClick={() => void copyDebugLog()}>复制调试日志</button>
            <button type="button" className="rounded-sm px-1.5 py-0.5 hover:bg-muted/60 hover:text-foreground" onClick={clearDebugLog}>清空调试日志</button>
            {debugActionMessage && <span className="pl-1 text-foreground">{debugActionMessage}</span>}
          </div>
        )}

        {(["right", "left", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"] as ResizeHandle[]).map((handle) => (
          <button
            key={handle}
            type="button"
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
