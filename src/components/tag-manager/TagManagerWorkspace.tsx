import { PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { saveTagTaxonomyConfig } from "@/lib/api";
import { getTagSuggestionList, getTagSuggestionRootGroups, type TagSuggestion, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";
import { TagManagerDetailsPanel } from "./TagManagerDetailsPanel";
import { TagManagerGroupColumn } from "./TagManagerGroupColumn";
import { TagManagerRootColumn } from "./TagManagerRootColumn";
import { TagManagerShell } from "./TagManagerShell";
import { createCustomTagEntry, deleteCustomTagEntry, deleteMergeRule, filterTagRootGroups, filterTagSuggestions, getAliasCompareKey, getBuiltinAliasesForSuggestion, getCustomTagCreateDraft, getCustomTagEditDraft, getMergePreviewInfo, getMergeTargetCandidates, getSaveEventBase, getUserAliasesForSuggestion, isLeafTagSuggestion, normalizeConfig, setMergeRule, updateCustomTagEntry, type CustomTagCreateDraft, type CustomTagEditDraft } from "./tagManagerConfig";
import { DEBUG_LOG_KEY, debugEvent, isDebugEnabled } from "./tagManagerDebug";
import { areStringArraysEqual, createOrderOverrides, getDebugGroupOrderRows, sortGroupsByOrderOverrides } from "./tagManagerOrdering";
import type { GroupNode, GroupOrderSaveDebugContext, SaveOperation, SortScope, StatusMessage, TagManagerCloseReason, TagManagerFilterMode, TagManagerWorkspaceProps } from "./types";

export type { TagManagerCloseReason };

const STATUS_DURATION_MS = 1800;

export default function TagManagerWorkspace({ initialConfig, initialFilterMode = "all", onRequestClose }: TagManagerWorkspaceProps) {
  const [workingConfig, setWorkingConfig] = useState(() => normalizeConfig(initialConfig));
  const [searchQuery, setSearchQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [filterMode, setFilterMode] = useState<TagManagerFilterMode>(initialFilterMode);
  const [activeRoot, setActiveRoot] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedGroupOrderKey, setSelectedGroupOrderKey] = useState<string | null>(null);
  const [activeDraggingGroupId, setActiveDraggingGroupId] = useState<string | null>(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [customTagCreateDraft, setCustomTagCreateDraft] = useState<CustomTagCreateDraft | null>(null);
  const [customTagCreateError, setCustomTagCreateError] = useState<string | null>(null);
  const [customTagEditDraft, setCustomTagEditDraft] = useState<CustomTagEditDraft | null>(null);
  const [customTagEditError, setCustomTagEditError] = useState<string | null>(null);
  const [isMergeEditorOpen, setIsMergeEditorOpen] = useState(false);
  const [mergeSearchQuery, setMergeSearchQuery] = useState("");
  const [selectedMergeTargetId, setSelectedMergeTargetId] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [debugActionMessage, setDebugActionMessage] = useState<string | null>(null);
  const [isDebugPanelVisible] = useState(isDebugEnabled);
  const statusTimeoutRef = useRef<number | null>(null);
  const debugActionTimeoutRef = useRef<number | null>(null);
  const groupRenderDebugKeyRef = useRef<string | null>(null);
  const groupAfterWorkingConfigDebugKeyRef = useRef<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const includeHidden = showHidden || filterMode === "hidden";
  const baseSuggestions = useMemo(() => getTagSuggestionList(workingConfig, { includeHidden, includeDeprecated: true }), [includeHidden, workingConfig]);
  const baseRootGroups = useMemo(() => getTagSuggestionRootGroups(workingConfig, { includeHidden, includeDeprecated: true }), [includeHidden, workingConfig]);
  const suggestions = useMemo(() => filterTagSuggestions(baseSuggestions, filterMode), [baseSuggestions, filterMode]);
  const rootGroups = useMemo(() => filterTagRootGroups(baseRootGroups, filterMode), [baseRootGroups, filterMode]);
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
  const mergePreview = useMemo(() => getMergePreviewInfo(workingConfig, selectedSuggestion, baseSuggestions), [baseSuggestions, selectedSuggestion, workingConfig]);
  const canEditMergeRule = isLeafTagSuggestion(selectedSuggestion);
  const mergeTargetCandidates = useMemo(
    () => getMergeTargetCandidates(baseSuggestions, selectedSuggestion, workingConfig, mergeSearchQuery),
    [baseSuggestions, mergeSearchQuery, selectedSuggestion, workingConfig],
  );
  const selectedMergeTarget = useMemo(
    () => mergeTargetCandidates.find((candidate) => candidate.id === selectedMergeTargetId)
      ?? baseSuggestions.find((candidate) => candidate.id === selectedMergeTargetId)
      ?? null,
    [baseSuggestions, mergeTargetCandidates, selectedMergeTargetId],
  );
  const canManageAliases = Boolean(selectedSuggestion && selectedSuggestion.path.length >= 3);
  const isSortDisabled = Boolean(searchQuery.trim()) || filterMode !== "all";
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
    setCustomTagCreateError(null);
    setCustomTagEditDraft(null);
    setCustomTagEditError(null);
    setIsMergeEditorOpen(false);
    setMergeSearchQuery("");
    setSelectedMergeTargetId(null);
    setMergeError(null);
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
    if (scope === "group") {
      setActiveDraggingGroupId(String(event.active.id));
    }
    debugEvent("manager.drag.start", { scope, parentKey, activeId: String(event.active.id) });
  }, []);

  const handleSortCancel = useCallback((scope: SortScope, parentKey?: string) => {
    if (scope === "group") {
      setActiveDraggingGroupId(null);
    }
    debugEvent("manager.drag.cancel", { scope, parentKey });
  }, []);

  const handleSortEnd = useCallback((
    scope: SortScope,
    parentKey: string | undefined,
    currentIds: string[],
    event: DragEndEvent,
    currentGroups?: GroupNode[],
    currentIdsSource = "unknown",
  ) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (scope === "group") {
      setActiveDraggingGroupId(null);
    }
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

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((current) => ({ ...current, [groupKey]: !current[groupKey] }));
  }, []);

  const clearSelectedNode = useCallback(() => {
    setSelectedGroupOrderKey(null);
    setSelectedSuggestionId(null);
    setCustomTagCreateDraft((current) => current ? {
      ...current,
      parentPathText: "",
      parentLocked: false,
    } : current);
    setCustomTagCreateError(null);
  }, []);

  const selectRoot = useCallback((root: string) => {
    setActiveRoot(root);
    clearSelectedNode();
  }, [clearSelectedNode]);

  const selectGroup = useCallback((groupKey: string) => {
    const group = activeRootSortedGroups.find((item) => item.orderKey === groupKey) ?? null;
    setSelectedGroupOrderKey(groupKey);
    setSelectedSuggestionId(null);
    setCustomTagCreateDraft((current) => current && group ? {
      ...current,
      parentPathText: group.path.join(" / "),
      parentLocked: true,
    } : current);
    setCustomTagCreateError(null);
  }, [activeRootSortedGroups]);

  const selectSuggestion = useCallback((suggestionId: string) => {
    const suggestion = suggestions.find((item) => item.id === suggestionId) ?? null;
    setSelectedGroupOrderKey(null);
    setSelectedSuggestionId(suggestionId);
    setCustomTagCreateDraft((current) => current && suggestion && suggestion.path.length >= 3 ? {
      ...current,
      parentPathText: suggestion.path.slice(0, -1).join(" / "),
      parentLocked: true,
    } : current);
    setCustomTagCreateError(null);
  }, [suggestions]);

  const handleAliasInputChange = useCallback((value: string) => {
    setAliasInput(value);
    setAliasError(null);
  }, []);

  const startCustomTagCreate = useCallback(() => {
    setCustomTagCreateDraft(getCustomTagCreateDraft(selectedSuggestion, selectedGroupOrderKey, activeRootSortedGroups));
    setCustomTagCreateError(null);
    setCustomTagEditDraft(null);
    setCustomTagEditError(null);
    setIsMergeEditorOpen(false);
    setMergeError(null);
  }, [activeRootSortedGroups, selectedGroupOrderKey, selectedSuggestion]);

  const cancelCustomTagCreate = useCallback(() => {
    setCustomTagCreateDraft(null);
    setCustomTagCreateError(null);
  }, []);

  const updateCustomTagCreateDraft = useCallback((patch: Partial<CustomTagCreateDraft>) => {
    setCustomTagCreateDraft((current) => current ? { ...current, ...patch } : current);
    setCustomTagCreateError(null);
  }, []);

  const saveCustomTagCreate = useCallback(async () => {
    if (!customTagCreateDraft) return;

    const currentConfig = normalizeConfig(workingConfig);
    const result = createCustomTagEntry(currentConfig, customTagCreateDraft);
    if (!result.ok) {
      setCustomTagCreateError(result.error);
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原自定义标签", "alias");
    if (saved) {
      const nextRootGroups = getTagSuggestionRootGroups(result.config, { includeHidden: true, includeDeprecated: true });
      const nextRootGroup = nextRootGroups.find((rootGroup) => rootGroup.groups.some((group) => group.candidates.some((candidate) => candidate.id === result.entryId)));
      const nextGroup = nextRootGroup?.groups.find((group) => group.candidates.some((candidate) => candidate.id === result.entryId));
      if (nextRootGroup) {
        setActiveRoot(nextRootGroup.root);
      }
      if (nextGroup) {
        setExpandedGroups((current) => ({ ...current, [nextGroup.orderKey]: true }));
      }
      setFilterMode("all");
      setSelectedGroupOrderKey(null);
      setSelectedSuggestionId(result.entryId);
      setCustomTagCreateDraft(null);
      setCustomTagCreateError(null);
    } else {
      setCustomTagCreateError("保存失败，已恢复原自定义标签");
    }
  }, [customTagCreateDraft, saveWorkingConfig, workingConfig]);

  const startCustomTagEdit = useCallback(() => {
    if (!selectedSuggestion || selectedSuggestion.source !== "user") return;
    setCustomTagEditDraft(getCustomTagEditDraft(workingConfig, selectedSuggestion));
    setCustomTagEditError(null);
    setCustomTagCreateDraft(null);
    setCustomTagCreateError(null);
  }, [selectedSuggestion, workingConfig]);

  const cancelCustomTagEdit = useCallback(() => {
    setCustomTagEditDraft(null);
    setCustomTagEditError(null);
  }, []);

  const updateCustomTagEditDraft = useCallback((patch: Partial<CustomTagEditDraft>) => {
    setCustomTagEditDraft((current) => current ? { ...current, ...patch } : current);
    setCustomTagEditError(null);
  }, []);

  const saveCustomTagEdit = useCallback(async () => {
    if (!selectedSuggestion || !customTagEditDraft) return;

    const currentConfig = normalizeConfig(workingConfig);
    const result = updateCustomTagEntry(currentConfig, selectedSuggestion, customTagEditDraft);
    if (!result.ok) {
      setCustomTagEditError(result.error);
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原自定义标签", "alias");
    if (saved) {
      setSelectedSuggestionId(selectedSuggestion.id);
      setCustomTagEditDraft(null);
      setCustomTagEditError(null);
    } else {
      setCustomTagEditError("保存失败，已恢复原自定义标签");
    }
  }, [customTagEditDraft, saveWorkingConfig, selectedSuggestion, workingConfig]);

  const deleteCustomTag = useCallback(async () => {
    if (!selectedSuggestion || selectedSuggestion.source !== "user") return;
    const confirmed = window.confirm(`确认删除自定义标签“${selectedSuggestion.pathText}”？\n\n不会自动修改 notes。`);
    if (!confirmed) return;

    const currentConfig = normalizeConfig(workingConfig);
    const result = deleteCustomTagEntry(currentConfig, selectedSuggestion);
    if (!result.ok) {
      setCustomTagEditError(result.error);
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原自定义标签", "alias");
    if (saved) {
      setSelectedSuggestionId(null);
      setCustomTagEditDraft(null);
      setCustomTagEditError(null);
    } else {
      setCustomTagEditError("保存失败，已恢复原自定义标签");
    }
  }, [saveWorkingConfig, selectedSuggestion, workingConfig]);

  const startMergeEdit = useCallback(() => {
    if (!canEditMergeRule) {
      setMergeError("只有具体标签可以设置合并规则。");
      return;
    }
    setIsMergeEditorOpen(true);
    setMergeSearchQuery("");
    setSelectedMergeTargetId(null);
    setMergeError(null);
  }, [canEditMergeRule]);

  const cancelMergeEdit = useCallback(() => {
    setIsMergeEditorOpen(false);
    setMergeSearchQuery("");
    setSelectedMergeTargetId(null);
    setMergeError(null);
  }, []);

  const handleMergeSearchQueryChange = useCallback((value: string) => {
    setMergeSearchQuery(value);
    setSelectedMergeTargetId(null);
    setMergeError(null);
  }, []);

  const saveMergeRule = useCallback(async () => {
    const currentConfig = normalizeConfig(workingConfig);
    const result = setMergeRule(currentConfig, selectedSuggestion, selectedMergeTarget);
    if (!result.ok) {
      setMergeError(result.error);
      return;
    }

    const confirmed = window.confirm(`确认把“${selectedSuggestion?.pathText ?? ""}”合并到“${selectedMergeTarget?.pathText ?? ""}”？\n\n以后规范化和建议会优先指向目标标签；不会自动修改 notes。`);
    if (!confirmed) {
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原合并规则", "merge");
    if (saved) {
      setIsMergeEditorOpen(false);
      setMergeSearchQuery("");
      setSelectedMergeTargetId(null);
      setMergeError(null);
    } else {
      setMergeError("保存失败，已恢复原合并规则");
    }
  }, [saveWorkingConfig, selectedMergeTarget, selectedSuggestion, workingConfig]);

  const removeMergeRule = useCallback(async () => {
    const currentConfig = normalizeConfig(workingConfig);
    const result = deleteMergeRule(currentConfig, selectedSuggestion);
    if (!result.ok) {
      setMergeError(result.error);
      return;
    }

    const confirmed = window.confirm(`确认取消“${selectedSuggestion?.pathText ?? ""}”的合并规则？\n\n不会自动修改 notes。`);
    if (!confirmed) {
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原合并规则", "merge");
    if (saved) {
      setIsMergeEditorOpen(false);
      setMergeSearchQuery("");
      setSelectedMergeTargetId(null);
      setMergeError(null);
    } else {
      setMergeError("保存失败，已恢复原合并规则");
    }
  }, [saveWorkingConfig, selectedSuggestion, workingConfig]);

  const handleClose = useCallback(() => {
    debugEvent("manager.closeButton.click", {
      hiddenIds: workingConfig.hiddenIds?.length ?? 0,
      orderOverrides: Object.keys(workingConfig.orderOverrides ?? {}).length,
    });
    onRequestClose("close-button", workingConfig);
  }, [onRequestClose, workingConfig]);

  return (
    <TagManagerShell
      searchQuery={searchQuery}
      showHidden={showHidden}
      filterMode={filterMode}
      status={status}
      isDebugPanelVisible={isDebugPanelVisible}
      debugActionMessage={debugActionMessage}
      onSearchQueryChange={setSearchQuery}
      onShowHiddenChange={setShowHidden}
      onFilterModeChange={setFilterMode}
      onCopyDebugLog={() => void copyDebugLog()}
      onClearDebugLog={clearDebugLog}
      onCreateCustomTag={startCustomTagCreate}
      onClearSelection={clearSelectedNode}
      onClose={handleClose}
    >
      <TagManagerRootColumn
        rootGroups={rootGroups}
        activeRootName={activeRootGroup?.root ?? null}
        isSaving={isSaving}
        isSortDisabled={isSortDisabled}
        sensors={sensors}
        onSelectRoot={selectRoot}
        onSortStart={handleSortStart}
        onSortEnd={handleSortEnd}
      />
      <TagManagerGroupColumn
        searchQuery={searchQuery}
        searchResults={searchResults}
        activeRootGroup={activeRootGroup}
        activeRootSortedGroups={activeRootSortedGroups}
        activeRootSortableItems={activeRootSortableItems}
        expandedGroups={expandedGroups}
        selectedGroupOrderKey={selectedGroupOrderKey}
        selectedSuggestionId={selectedSuggestionId}
        activeDraggingGroupId={activeDraggingGroupId}
        isSaving={isSaving}
        isSortDisabled={isSortDisabled}
        sensors={sensors}
        onToggleGroup={toggleGroup}
        onSelectGroup={selectGroup}
        onSelectSuggestion={selectSuggestion}
        onSortStart={handleSortStart}
        onSortCancel={handleSortCancel}
        onSortEnd={handleSortEnd}
      />
      <TagManagerDetailsPanel
        selectedSuggestion={selectedSuggestion}
        selectedUserAliases={selectedUserAliases}
        selectedBuiltinAliases={selectedBuiltinAliases}
        mergePreview={mergePreview}
        canEditMergeRule={canEditMergeRule}
        isMergeEditorOpen={isMergeEditorOpen}
        mergeSearchQuery={mergeSearchQuery}
        mergeTargetCandidates={mergeTargetCandidates}
        selectedMergeTarget={selectedMergeTarget}
        mergeError={mergeError}
        canManageAliases={canManageAliases}
        aliasInput={aliasInput}
        aliasError={aliasError}
        customTagCreateDraft={customTagCreateDraft}
        customTagCreateError={customTagCreateError}
        customTagEditDraft={customTagEditDraft}
        customTagEditError={customTagEditError}
        isSaving={isSaving}
        onAliasInputChange={handleAliasInputChange}
        onAddAlias={() => void addAlias()}
        onDeleteUserAlias={(alias) => void deleteUserAlias(alias)}
        onCancelCustomTagCreate={cancelCustomTagCreate}
        onCustomTagCreateDraftChange={updateCustomTagCreateDraft}
        onSaveCustomTagCreate={() => void saveCustomTagCreate()}
        onStartCustomTagEdit={startCustomTagEdit}
        onDeleteCustomTag={() => void deleteCustomTag()}
        onCancelCustomTagEdit={cancelCustomTagEdit}
        onCustomTagEditDraftChange={updateCustomTagEditDraft}
        onSaveCustomTagEdit={() => void saveCustomTagEdit()}
        onStartMergeEdit={startMergeEdit}
        onCancelMergeEdit={cancelMergeEdit}
        onMergeSearchQueryChange={handleMergeSearchQueryChange}
        onSelectMergeTarget={(suggestion) => {
          setSelectedMergeTargetId(suggestion.id);
          setMergeError(null);
        }}
        onSaveMergeRule={() => void saveMergeRule()}
        onDeleteMergeRule={() => void removeMergeRule()}
        onSetSuggestionHidden={setSuggestionHidden}
      />
    </TagManagerShell>
  );
}
