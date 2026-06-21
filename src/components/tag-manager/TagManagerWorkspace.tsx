import { PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { saveTagTaxonomyConfig } from "@/lib/api";
import { type TagSuggestion, type UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";
import { TagManagerCollectionsPanel } from "./TagManagerCollectionsPanel";
import { TagManagerDetailsPanel } from "./TagManagerDetailsPanel";
import { TagManagerGroupColumn } from "./TagManagerGroupColumn";
import { TagManagerRootColumn } from "./TagManagerRootColumn";
import { TagManagerShell } from "./TagManagerShell";
import { addUserAliasToConfig, createCustomCollectionCandidate, createCustomTagCreateSelectionPlan, createCustomTagEntry, deleteCustomCollectionCandidate, deleteCustomTagEntry, deleteMergeRule, deleteUserAliasFromConfig, getClearedCustomTagCreateDraftSelection, getClosedMergeEditorState, getCollectionEditSavePlan, getGroupedCustomTagCreateDraftSelection, getOpenedCustomTagCreateState, getOpenedCustomTagEditState, getOpenedMergeEditorState, getSaveEventBase, getSearchedMergeEditorState, getSuggestionCustomTagCreateDraftSelection, normalizeConfig, renameCustomCollectionCandidate, setMergeRule, setTagSuggestionHiddenInConfig, updateCustomTagEntry, writeStoredCustomCollections, type CustomTagCreateDraft, type CustomTagEditDraft, type CustomTagEditorState, type MergeEditorState } from "./tagManagerConfig";
import { DEBUG_LOG_KEY, debugEvent } from "./tagManagerDebug";
import { createOrderOverrides, getDebugGroupOrderRows, getSortEndPlan } from "./tagManagerOrdering";
import { deriveTagManagerWorkspaceViewModel } from "./tagManagerViewModel";
import type { GroupNode, GroupOrderSaveDebugContext, SaveOperation, SortScope, TagManagerCloseReason, TagManagerFilterMode, TagManagerWorkspaceProps, TagManagerWorkspaceView } from "./types";

export type { TagManagerCloseReason };

type ConfirmDialogState = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  resolve: (confirmed: boolean) => void;
};

export default function TagManagerWorkspace({ initialConfig, initialFilterMode = "all", builtinCollections = [], noteCollections = [], developerModeEnabled, onRequestClose }: TagManagerWorkspaceProps) {
  const [workingConfig, setWorkingConfig] = useState(() => normalizeConfig(initialConfig));
  const [activeView, setActiveView] = useState<TagManagerWorkspaceView>("tags");
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
  const [collectionCreateInput, setCollectionCreateInput] = useState("");
  const [collectionCreateError, setCollectionCreateError] = useState<string | null>(null);
  const [editingCollectionName, setEditingCollectionName] = useState<string | null>(null);
  const [collectionEditInput, setCollectionEditInput] = useState("");
  const [collectionEditError, setCollectionEditError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const groupRenderDebugKeyRef = useRef<string | null>(null);
  const groupAfterWorkingConfigDebugKeyRef = useRef<string | null>(null);
  const requestConfirm = useCallback((options: Omit<ConfirmDialogState, "resolve">) => {
    return new Promise<boolean>((resolve) => {
      setConfirmDialog({ ...options, resolve });
    });
  }, []);
  const handleConfirmDialogCancel = useCallback(() => {
    setConfirmDialog((current) => {
      current?.resolve(false);
      return null;
    });
  }, []);
  const handleConfirmDialogConfirm = useCallback(() => {
    setConfirmDialog((current) => {
      current?.resolve(true);
      return null;
    });
  }, []);
  const applyMergeEditorState = useCallback((state: MergeEditorState) => {
    setIsMergeEditorOpen(state.isOpen);
    setMergeSearchQuery(state.searchQuery);
    setSelectedMergeTargetId(state.selectedTargetId);
    setMergeError(state.error);
  }, []);
  const applyCustomTagEditorState = useCallback((state: CustomTagEditorState) => {
    setCustomTagCreateDraft(state.createDraft);
    setCustomTagCreateError(state.createError);
    setCustomTagEditDraft(state.editDraft);
    setCustomTagEditError(state.editError);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const tagManagerView = useMemo(() => deriveTagManagerWorkspaceViewModel({
    config: workingConfig,
    showHidden,
    filterMode,
    activeRoot,
    selectedSuggestionId,
    selectedMergeTargetId,
    mergeSearchQuery,
    searchQuery,
    builtinCollections,
    noteCollections,
  }), [
    activeRoot,
    builtinCollections,
    filterMode,
    mergeSearchQuery,
    noteCollections,
    searchQuery,
    selectedMergeTargetId,
    selectedSuggestionId,
    showHidden,
    workingConfig,
  ]);
  const {
    rootGroups,
    activeRootGroup,
    nextActiveRoot,
    activeRootSortedGroups,
    activeRootSortableItems,
    suggestions,
    selectedSuggestion,
    selectedUserAliases,
    selectedBuiltinAliases,
    mergePreview,
    canEditMergeRule,
    mergeTargetCandidates,
    selectedMergeTarget,
    collectionRows,
    collectionExistingCandidates,
    canManageAliases,
    isSortDisabled,
    searchResults,
  } = tagManagerView;

  useEffect(() => {
    debugEvent("manager.mount", {
      hiddenIds: initialConfig.hiddenIds?.length ?? 0,
      orderOverrides: Object.keys(initialConfig.orderOverrides ?? {}).length,
    });
    return () => debugEvent("manager.unmount");
  }, [initialConfig]);

  useEffect(() => {
    setActiveRoot(nextActiveRoot);
  }, [nextActiveRoot]);

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

  const copyDebugLog = useCallback(async () => {
    const log = window.localStorage.getItem(DEBUG_LOG_KEY) ?? "";
    try {
      await navigator.clipboard.writeText(log);
      toast.success("已复制调试日志");
    } catch {
      toast.error("复制失败，请从 localStorage 读取调试日志");
    }
  }, []);

  const clearDebugLog = useCallback(() => {
    window.localStorage.removeItem(DEBUG_LOG_KEY);
    toast.success("已清空调试日志");
  }, []);

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
      writeStoredCustomCollections(normalizedConfig.customCollections ?? []);
      debugEvent(`${eventBase}.success`, {
        hiddenIds: normalizedConfig.hiddenIds?.length ?? 0,
        aliases: Object.keys(normalizedConfig.aliases ?? {}).length,
        orderOverrides: Object.keys(normalizedConfig.orderOverrides ?? {}).length,
        customCollections: normalizedConfig.customCollections?.length ?? 0,
      });
      toast.success("修改已保存");
      return true;
    } catch (error) {
      debugEvent(`${eventBase}.error`, error);
      setWorkingConfig(previousConfig);
      toast.error(failureMessage);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

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
    const sortEndPlan = getSortEndPlan(currentIds, activeId, overId);
    if (scope === "group") {
      setActiveDraggingGroupId(null);
    }
    if (scope === "group") {
      debugEvent("manager.groupOrder.dragEnd", {
        scope,
        parentKey,
        activeRootName: parentKey,
        activeId: sortEndPlan.activeId,
        overId: sortEndPlan.overId,
        currentIds,
        nextIds: sortEndPlan.nextIds,
        changed: sortEndPlan.changed,
        currentIdsSource,
        ...(sortEndPlan.reason ? { reason: sortEndPlan.reason } : {}),
        currentGroups: currentGroups ? getDebugGroupOrderRows(currentGroups, workingConfig.orderOverrides) : [],
      });
    }
    debugEvent("manager.drag.end", {
      scope,
      parentKey,
      activeId: sortEndPlan.activeId,
      overId: sortEndPlan.overId,
      changed: sortEndPlan.changed,
      ...(sortEndPlan.reason ? { reason: sortEndPlan.reason } : {}),
    });
    if (!sortEndPlan.changed) return;
    saveOrder(sortEndPlan.nextIds, {
      scope,
      parentKey,
      previousIds: currentIds,
      nextIds: sortEndPlan.nextIds,
      currentIdsSource,
      currentGroups,
    });
  }, [saveOrder, workingConfig.orderOverrides]);

  const setSuggestionHidden = useCallback((suggestion: TagSuggestion, hidden: boolean) => {
    const currentConfig = normalizeConfig(workingConfig);
    const nextConfig = setTagSuggestionHiddenInConfig(currentConfig, suggestion, hidden);
    void saveWorkingConfig(nextConfig, currentConfig, "保存失败，已恢复原状态", "visibility");
  }, [saveWorkingConfig, workingConfig]);

  const addAlias = useCallback(async () => {
    const currentConfig = normalizeConfig(workingConfig);
    const result = addUserAliasToConfig(currentConfig, selectedSuggestion, aliasInput, selectedBuiltinAliases);
    if (!result.ok) {
      setAliasError(result.error);
      return;
    }

    setAliasError(null);
    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原别名", "alias");
    if (saved) {
      setAliasInput("");
    } else {
      setAliasError("保存失败，已恢复原别名");
    }
  }, [aliasInput, saveWorkingConfig, selectedBuiltinAliases, selectedSuggestion, workingConfig]);

  const deleteUserAlias = useCallback(async (alias: string) => {
    const currentConfig = normalizeConfig(workingConfig);
    const result = deleteUserAliasFromConfig(currentConfig, selectedSuggestion, alias);
    if (!result.ok) {
      setAliasError(result.error);
      return;
    }

    setAliasError(null);
    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原别名", "alias");
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
    setCustomTagCreateDraft(getClearedCustomTagCreateDraftSelection);
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
    setCustomTagCreateDraft((current) => getGroupedCustomTagCreateDraftSelection(current, group));
    setCustomTagCreateError(null);
  }, [activeRootSortedGroups]);

  const selectSuggestion = useCallback((suggestionId: string) => {
    const suggestion = suggestions.find((item) => item.id === suggestionId) ?? null;
    setSelectedGroupOrderKey(null);
    setSelectedSuggestionId(suggestionId);
    setCustomTagCreateDraft((current) => getSuggestionCustomTagCreateDraftSelection(current, suggestion));
    setCustomTagCreateError(null);
  }, [suggestions]);

  const handleAliasInputChange = useCallback((value: string) => {
    setAliasInput(value);
    setAliasError(null);
  }, []);

  const startCustomTagCreate = useCallback(() => {
    applyCustomTagEditorState(getOpenedCustomTagCreateState({
      createDraft: customTagCreateDraft,
      createError: customTagCreateError,
      editDraft: customTagEditDraft,
      editError: customTagEditError,
    }, selectedSuggestion, selectedGroupOrderKey, activeRootSortedGroups));
    setIsMergeEditorOpen(false);
    setMergeError(null);
  }, [
    activeRootSortedGroups,
    applyCustomTagEditorState,
    customTagCreateDraft,
    customTagCreateError,
    customTagEditDraft,
    customTagEditError,
    selectedGroupOrderKey,
    selectedSuggestion,
  ]);

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
      const selectionPlan = createCustomTagCreateSelectionPlan(result.config, result.entryId);
      if (selectionPlan.activeRoot) {
        setActiveRoot(selectionPlan.activeRoot);
      }
      if (selectionPlan.expandedGroupOrderKey) {
        const expandedGroupOrderKey = selectionPlan.expandedGroupOrderKey;
        setExpandedGroups((current) => ({ ...current, [expandedGroupOrderKey]: true }));
      }
      setFilterMode(selectionPlan.filterMode);
      setSelectedGroupOrderKey(selectionPlan.selectedGroupOrderKey);
      setSelectedSuggestionId(selectionPlan.selectedSuggestionId);
      setCustomTagCreateDraft(null);
      setCustomTagCreateError(null);
    } else {
      setCustomTagCreateError("保存失败，已恢复原自定义标签");
    }
  }, [customTagCreateDraft, saveWorkingConfig, workingConfig]);

  const startCustomTagEdit = useCallback(() => {
    if (!selectedSuggestion || selectedSuggestion.source !== "user") return;
    applyCustomTagEditorState(getOpenedCustomTagEditState({
      createDraft: customTagCreateDraft,
      createError: customTagCreateError,
      editDraft: customTagEditDraft,
      editError: customTagEditError,
    }, workingConfig, selectedSuggestion));
  }, [
    applyCustomTagEditorState,
    customTagCreateDraft,
    customTagCreateError,
    customTagEditDraft,
    customTagEditError,
    selectedSuggestion,
    workingConfig,
  ]);

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
    const confirmed = await requestConfirm({
      title: `删除自定义标签“${selectedSuggestion.pathText}”？`,
      description: "不会自动修改 notes。",
      confirmText: "删除",
      danger: true,
    });
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
  }, [requestConfirm, saveWorkingConfig, selectedSuggestion, workingConfig]);

  const startMergeEdit = useCallback(() => {
    if (!canEditMergeRule) {
      setMergeError("只有具体标签可以设置合并规则。");
      return;
    }
    applyMergeEditorState(getOpenedMergeEditorState());
  }, [applyMergeEditorState, canEditMergeRule]);

  const cancelMergeEdit = useCallback(() => {
    applyMergeEditorState(getClosedMergeEditorState({
      isOpen: isMergeEditorOpen,
      searchQuery: mergeSearchQuery,
      selectedTargetId: selectedMergeTargetId,
      error: mergeError,
    }));
  }, [applyMergeEditorState, isMergeEditorOpen, mergeError, mergeSearchQuery, selectedMergeTargetId]);

  const handleMergeSearchQueryChange = useCallback((value: string) => {
    applyMergeEditorState(getSearchedMergeEditorState({
      isOpen: isMergeEditorOpen,
      searchQuery: mergeSearchQuery,
      selectedTargetId: selectedMergeTargetId,
      error: mergeError,
    }, value));
  }, [applyMergeEditorState, isMergeEditorOpen, mergeError, mergeSearchQuery, selectedMergeTargetId]);

  const saveMergeRule = useCallback(async () => {
    const currentConfig = normalizeConfig(workingConfig);
    const result = setMergeRule(currentConfig, selectedSuggestion, selectedMergeTarget);
    if (!result.ok) {
      setMergeError(result.error);
      return;
    }

    const confirmed = await requestConfirm({
      title: "确认合并标签？",
      description: `确认把“${selectedSuggestion?.pathText ?? ""}”合并到“${selectedMergeTarget?.pathText ?? ""}”？\n\n以后规范化和建议会优先指向目标标签；不会自动修改 notes。`,
      confirmText: "合并",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原合并规则", "merge");
    if (saved) {
      applyMergeEditorState(getClosedMergeEditorState({
        isOpen: isMergeEditorOpen,
        searchQuery: mergeSearchQuery,
        selectedTargetId: selectedMergeTargetId,
        error: mergeError,
      }));
    } else {
      setMergeError("保存失败，已恢复原合并规则");
    }
  }, [applyMergeEditorState, isMergeEditorOpen, mergeError, mergeSearchQuery, requestConfirm, saveWorkingConfig, selectedMergeTarget, selectedMergeTargetId, selectedSuggestion, workingConfig]);

  const removeMergeRule = useCallback(async () => {
    const currentConfig = normalizeConfig(workingConfig);
    const result = deleteMergeRule(currentConfig, selectedSuggestion);
    if (!result.ok) {
      setMergeError(result.error);
      return;
    }

    const confirmed = await requestConfirm({
      title: "取消合并规则？",
      description: `确认取消“${selectedSuggestion?.pathText ?? ""}”的合并规则？\n\n不会自动修改 notes。`,
      confirmText: "取消合并",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原合并规则", "merge");
    if (saved) {
      applyMergeEditorState(getClosedMergeEditorState({
        isOpen: isMergeEditorOpen,
        searchQuery: mergeSearchQuery,
        selectedTargetId: selectedMergeTargetId,
        error: mergeError,
      }));
    } else {
      setMergeError("保存失败，已恢复原合并规则");
    }
  }, [applyMergeEditorState, isMergeEditorOpen, mergeError, mergeSearchQuery, requestConfirm, saveWorkingConfig, selectedMergeTargetId, selectedSuggestion, workingConfig]);

  const handleActiveViewChange = useCallback((nextView: TagManagerWorkspaceView) => {
    setActiveView(nextView);
    setCollectionCreateError(null);
    setCollectionEditError(null);
  }, []);

  const createCollection = useCallback(async () => {
    const currentConfig = normalizeConfig(workingConfig);
    const result = createCustomCollectionCandidate(currentConfig, collectionCreateInput, collectionExistingCandidates);
    if (!result.ok) {
      setCollectionCreateError(result.error);
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原文集候选", "collection");
    if (saved) {
      setCollectionCreateInput("");
      setCollectionCreateError(null);
    } else {
      setCollectionCreateError("保存失败，已恢复原文集候选");
    }
  }, [collectionCreateInput, collectionExistingCandidates, saveWorkingConfig, workingConfig]);

  const startCollectionEdit = useCallback((name: string) => {
    setEditingCollectionName(name);
    setCollectionEditInput(name);
    setCollectionEditError(null);
    setCollectionCreateError(null);
  }, []);

  const cancelCollectionEdit = useCallback(() => {
    setEditingCollectionName(null);
    setCollectionEditInput("");
    setCollectionEditError(null);
  }, []);

  const saveCollectionEdit = useCallback(async () => {
    if (!editingCollectionName) return;

    const savePlan = getCollectionEditSavePlan(editingCollectionName, collectionEditInput);
    if (savePlan.action === "cancel") {
      cancelCollectionEdit();
      return;
    }

    const currentConfig = normalizeConfig(workingConfig);
    const result = renameCustomCollectionCandidate(currentConfig, editingCollectionName, savePlan.nextName, collectionExistingCandidates);
    if (!result.ok) {
      setCollectionEditError(result.error);
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原文集候选", "collection");
    if (saved) {
      cancelCollectionEdit();
    } else {
      setCollectionEditError("保存失败，已恢复原文集候选");
    }
  }, [cancelCollectionEdit, collectionEditInput, collectionExistingCandidates, editingCollectionName, saveWorkingConfig, workingConfig]);

  const deleteCollection = useCallback(async (name: string) => {
    const confirmed = await requestConfirm({
      title: `删除自定义文集“${name}”？`,
      description: "只会删除候选，不会修改已有文章。",
      confirmText: "删除",
      danger: true,
    });
    if (!confirmed) return;

    const currentConfig = normalizeConfig(workingConfig);
    const result = deleteCustomCollectionCandidate(currentConfig, name);
    if (!result.ok) {
      setCollectionEditError(result.error);
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原文集候选", "collection");
    if (saved && editingCollectionName === name) {
      cancelCollectionEdit();
    } else if (!saved) {
      setCollectionEditError("保存失败，已恢复原文集候选");
    }
  }, [cancelCollectionEdit, editingCollectionName, requestConfirm, saveWorkingConfig, workingConfig]);

  const handleClose = useCallback(() => {
    debugEvent("manager.closeButton.click", {
      hiddenIds: workingConfig.hiddenIds?.length ?? 0,
      orderOverrides: Object.keys(workingConfig.orderOverrides ?? {}).length,
    });
    onRequestClose("close-button", workingConfig);
  }, [onRequestClose, workingConfig]);

  return (
    <>
    <TagManagerShell
      activeView={activeView}
      searchQuery={searchQuery}
      showHidden={showHidden}
      filterMode={filterMode}
      isDebugPanelVisible={developerModeEnabled}
      onSearchQueryChange={setSearchQuery}
      onActiveViewChange={handleActiveViewChange}
      onShowHiddenChange={setShowHidden}
      onFilterModeChange={setFilterMode}
      onCopyDebugLog={() => void copyDebugLog()}
      onClearDebugLog={clearDebugLog}
      onCreateCustomTag={startCustomTagCreate}
      onClearSelection={clearSelectedNode}
      onClose={handleClose}
    >
      {activeView === "tags" ? (
        <>
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
        </>
      ) : (
        <TagManagerCollectionsPanel
          rows={collectionRows}
          createInput={collectionCreateInput}
          createError={collectionCreateError}
          editingName={editingCollectionName}
          editInput={collectionEditInput}
          editError={collectionEditError}
          isSaving={isSaving}
          onCreateInputChange={(value) => {
            setCollectionCreateInput(value);
            setCollectionCreateError(null);
          }}
          onCreate={() => void createCollection()}
          onStartEdit={startCollectionEdit}
          onEditInputChange={(value) => {
            setCollectionEditInput(value);
            setCollectionEditError(null);
          }}
          onCancelEdit={cancelCollectionEdit}
          onSaveEdit={() => void saveCollectionEdit()}
          onDelete={(name) => void deleteCollection(name)}
        />
      )}
    </TagManagerShell>
    <ConfirmDialog
      open={Boolean(confirmDialog)}
      title={confirmDialog?.title ?? ""}
      description={confirmDialog?.description}
      confirmText={confirmDialog?.confirmText}
      cancelText={confirmDialog?.cancelText}
      danger={confirmDialog?.danger}
      onConfirm={handleConfirmDialogConfirm}
      onCancel={handleConfirmDialogCancel}
    />
    </>
  );
}
