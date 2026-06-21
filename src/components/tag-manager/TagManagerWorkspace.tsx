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
import { addUserAliasToConfig, createCustomCollectionCandidate, createCustomTagCreateSelectionPlan, createCustomTagEntry, deleteCustomCollectionCandidate, deleteCustomTagEntry, deleteMergeRule, deleteUserAliasFromConfig, getAppliedCollectionCreateState, getAppliedCollectionViewState, getAppliedCustomTagCreateSelectionState, getAppliedCustomTagEditSelectionState, getCancelledCollectionEditState, getChangedCollectionCreateInputState, getChangedCollectionEditInputState, getClearedNodeSelectionState, getClosedMergeEditorState, getCollectionEditSavePlan, getFailedCollectionCreateState, getFailedCollectionEditState, getOpenedCollectionEditState, getOpenedCustomTagCreateState, getOpenedCustomTagEditState, getOpenedMergeEditorState, getSaveEventBase, getSearchedMergeEditorState, getSelectedGroupState, getSelectedMergeTargetState, getSelectedRootState, getSelectedSuggestionState, getSelectionChangeTransientState, normalizeConfig, renameCustomCollectionCandidate, setMergeRule, setTagSuggestionHiddenInConfig, updateCustomTagEntry, writeStoredCustomCollections, type CollectionEditState, type CollectionPanelState, type CustomTagCreateDraft, type CustomTagCreateSelectionState, type CustomTagEditDraft, type CustomTagEditSelectionState, type CustomTagEditorState, type MergeEditorState, type TagManagerNodeSelectionState, type TagManagerSelectionChangeTransientState } from "./tagManagerConfig";
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
  const previousSelectionIdRef = useRef<string | null>(selectedSuggestionId);
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
  const applyNodeSelectionState = useCallback((state: TagManagerNodeSelectionState) => {
    setActiveRoot(state.activeRoot);
    setSelectedGroupOrderKey(state.selectedGroupOrderKey);
    setSelectedSuggestionId(state.selectedSuggestionId);
    setCustomTagCreateDraft(state.customTagCreateDraft);
    setCustomTagCreateError(state.customTagCreateError);
  }, []);
  const applyCustomTagCreateSelectionState = useCallback((state: CustomTagCreateSelectionState) => {
    setActiveRoot(state.activeRoot);
    setExpandedGroups(state.expandedGroups);
    setFilterMode(state.filterMode);
    setSelectedGroupOrderKey(state.selectedGroupOrderKey);
    setSelectedSuggestionId(state.selectedSuggestionId);
    setCustomTagCreateDraft(state.customTagCreateDraft);
    setCustomTagCreateError(state.customTagCreateError);
  }, []);
  const applyCustomTagEditSelectionState = useCallback((state: CustomTagEditSelectionState) => {
    setSelectedSuggestionId(state.selectedSuggestionId);
    setCustomTagEditDraft(state.customTagEditDraft);
    setCustomTagEditError(state.customTagEditError);
  }, []);
  const applySelectionChangeTransientState = useCallback((state: TagManagerSelectionChangeTransientState) => {
    setAliasInput(state.aliasInput);
    setAliasError(state.aliasError);
    setCustomTagCreateError(state.customTagCreateError);
    setCustomTagEditDraft(state.customTagEditDraft);
    setCustomTagEditError(state.customTagEditError);
    applyMergeEditorState(state.mergeEditor);
  }, [applyMergeEditorState]);
  const applyCollectionEditState = useCallback((state: CollectionEditState) => {
    setEditingCollectionName(state.editingName);
    setCollectionEditInput(state.editInput);
    setCollectionEditError(state.editError);
    setCollectionCreateError(state.createError);
  }, []);
  const applyCollectionPanelState = useCallback((state: CollectionPanelState) => {
    setActiveView(state.activeView);
    setCollectionCreateInput(state.createInput);
    setCollectionCreateError(state.createError);
    setCollectionEditError(state.editError);
  }, []);

  const getCurrentCollectionEditState = useCallback((): CollectionEditState => ({
    editingName: editingCollectionName,
    editInput: collectionEditInput,
    editError: collectionEditError,
    createError: collectionCreateError,
  }), [collectionCreateError, collectionEditError, collectionEditInput, editingCollectionName]);
  const getCurrentCollectionPanelState = useCallback((): CollectionPanelState => ({
    activeView,
    createInput: collectionCreateInput,
    createError: collectionCreateError,
    editError: collectionEditError,
  }), [activeView, collectionCreateError, collectionCreateInput, collectionEditError]);
  const applyFailedCollectionCreateState = useCallback((createError: string) => {
    applyCollectionPanelState(getFailedCollectionCreateState(getCurrentCollectionPanelState(), createError));
  }, [applyCollectionPanelState, getCurrentCollectionPanelState]);
  const applyFailedCollectionEditState = useCallback((editError: string) => {
    applyCollectionPanelState(getFailedCollectionEditState(getCurrentCollectionPanelState(), editError));
  }, [applyCollectionPanelState, getCurrentCollectionPanelState]);

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
    if (previousSelectionIdRef.current === selectedSuggestionId) {
      return;
    }

    previousSelectionIdRef.current = selectedSuggestionId;
    applySelectionChangeTransientState(getSelectionChangeTransientState({
      aliasInput,
      aliasError,
      customTagCreateError,
      customTagEditDraft,
      customTagEditError,
      mergeEditor: {
        isOpen: isMergeEditorOpen,
        searchQuery: mergeSearchQuery,
        selectedTargetId: selectedMergeTargetId,
        error: mergeError,
      },
    }));
  }, [
    aliasError,
    aliasInput,
    applySelectionChangeTransientState,
    customTagCreateError,
    customTagEditDraft,
    customTagEditError,
    isMergeEditorOpen,
    mergeError,
    mergeSearchQuery,
    selectedMergeTargetId,
    selectedSuggestionId,
  ]);

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
    applyNodeSelectionState(getClearedNodeSelectionState({
      activeRoot,
      selectedGroupOrderKey,
      selectedSuggestionId,
      customTagCreateDraft,
      customTagCreateError,
    }));
  }, [
    activeRoot,
    applyNodeSelectionState,
    customTagCreateDraft,
    customTagCreateError,
    selectedGroupOrderKey,
    selectedSuggestionId,
  ]);

  const selectRoot = useCallback((root: string) => {
    applyNodeSelectionState(getSelectedRootState({
      activeRoot,
      selectedGroupOrderKey,
      selectedSuggestionId,
      customTagCreateDraft,
      customTagCreateError,
    }, root));
  }, [
    activeRoot,
    applyNodeSelectionState,
    customTagCreateDraft,
    customTagCreateError,
    selectedGroupOrderKey,
    selectedSuggestionId,
  ]);

  const selectGroup = useCallback((groupKey: string) => {
    applyNodeSelectionState(getSelectedGroupState({
      activeRoot,
      selectedGroupOrderKey,
      selectedSuggestionId,
      customTagCreateDraft,
      customTagCreateError,
    }, groupKey, activeRootSortedGroups));
  }, [
    activeRoot,
    activeRootSortedGroups,
    applyNodeSelectionState,
    customTagCreateDraft,
    customTagCreateError,
    selectedGroupOrderKey,
    selectedSuggestionId,
  ]);

  const selectSuggestion = useCallback((suggestionId: string) => {
    applyNodeSelectionState(getSelectedSuggestionState({
      activeRoot,
      selectedGroupOrderKey,
      selectedSuggestionId,
      customTagCreateDraft,
      customTagCreateError,
    }, suggestionId, suggestions));
  }, [
    activeRoot,
    applyNodeSelectionState,
    customTagCreateDraft,
    customTagCreateError,
    selectedGroupOrderKey,
    selectedSuggestionId,
    suggestions,
  ]);

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
      applyCustomTagCreateSelectionState(getAppliedCustomTagCreateSelectionState({
        activeRoot,
        expandedGroups,
        filterMode,
        selectedGroupOrderKey,
        selectedSuggestionId,
        customTagCreateDraft,
        customTagCreateError,
      }, createCustomTagCreateSelectionPlan(result.config, result.entryId)));
    } else {
      setCustomTagCreateError("保存失败，已恢复原自定义标签");
    }
  }, [
    activeRoot,
    applyCustomTagCreateSelectionState,
    customTagCreateDraft,
    customTagCreateError,
    expandedGroups,
    filterMode,
    saveWorkingConfig,
    selectedGroupOrderKey,
    selectedSuggestionId,
    workingConfig,
  ]);

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
      applyCustomTagEditSelectionState(getAppliedCustomTagEditSelectionState({
        selectedSuggestionId,
        customTagEditDraft,
        customTagEditError,
      }, selectedSuggestion.id));
    } else {
      setCustomTagEditError("保存失败，已恢复原自定义标签");
    }
  }, [
    applyCustomTagEditSelectionState,
    customTagEditDraft,
    customTagEditError,
    saveWorkingConfig,
    selectedSuggestion,
    selectedSuggestionId,
    workingConfig,
  ]);

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
      applyCustomTagEditSelectionState(getAppliedCustomTagEditSelectionState({
        selectedSuggestionId,
        customTagEditDraft,
        customTagEditError,
      }, null));
    } else {
      setCustomTagEditError("保存失败，已恢复原自定义标签");
    }
  }, [
    applyCustomTagEditSelectionState,
    customTagEditDraft,
    customTagEditError,
    requestConfirm,
    saveWorkingConfig,
    selectedSuggestion,
    selectedSuggestionId,
    workingConfig,
  ]);

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
    applyCollectionPanelState(getAppliedCollectionViewState(getCurrentCollectionPanelState(), nextView));
  }, [applyCollectionPanelState, getCurrentCollectionPanelState]);

  const createCollection = useCallback(async () => {
    const currentConfig = normalizeConfig(workingConfig);
    const result = createCustomCollectionCandidate(currentConfig, collectionCreateInput, collectionExistingCandidates);
    if (!result.ok) {
      applyFailedCollectionCreateState(result.error);
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原文集候选", "collection");
    if (saved) {
      applyCollectionPanelState(getAppliedCollectionCreateState(getCurrentCollectionPanelState()));
    } else {
      applyFailedCollectionCreateState("保存失败，已恢复原文集候选");
    }
  }, [applyCollectionPanelState, applyFailedCollectionCreateState, collectionCreateInput, collectionExistingCandidates, getCurrentCollectionPanelState, saveWorkingConfig, workingConfig]);

  const startCollectionEdit = useCallback((name: string) => {
    applyCollectionEditState(getOpenedCollectionEditState(getCurrentCollectionEditState(), name));
  }, [applyCollectionEditState, getCurrentCollectionEditState]);

  const cancelCollectionEdit = useCallback(() => {
    applyCollectionEditState(getCancelledCollectionEditState(getCurrentCollectionEditState()));
  }, [applyCollectionEditState, getCurrentCollectionEditState]);

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
      applyFailedCollectionEditState(result.error);
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原文集候选", "collection");
    if (saved) {
      cancelCollectionEdit();
    } else {
      applyFailedCollectionEditState("保存失败，已恢复原文集候选");
    }
  }, [applyFailedCollectionEditState, cancelCollectionEdit, collectionEditInput, collectionExistingCandidates, editingCollectionName, saveWorkingConfig, workingConfig]);

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
      applyFailedCollectionEditState(result.error);
      return;
    }

    const saved = await saveWorkingConfig(result.config, currentConfig, "保存失败，已恢复原文集候选", "collection");
    if (saved && editingCollectionName === name) {
      cancelCollectionEdit();
    } else if (!saved) {
      applyFailedCollectionEditState("保存失败，已恢复原文集候选");
    }
  }, [applyFailedCollectionEditState, cancelCollectionEdit, editingCollectionName, requestConfirm, saveWorkingConfig, workingConfig]);

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
              applyMergeEditorState(getSelectedMergeTargetState({
                isOpen: isMergeEditorOpen,
                searchQuery: mergeSearchQuery,
                selectedTargetId: selectedMergeTargetId,
                error: mergeError,
              }, suggestion.id));
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
            applyCollectionPanelState(getChangedCollectionCreateInputState(getCurrentCollectionPanelState(), value));
          }}
          onCreate={() => void createCollection()}
          onStartEdit={startCollectionEdit}
          onEditInputChange={(value) => {
            applyCollectionEditState(getChangedCollectionEditInputState(getCurrentCollectionEditState(), value));
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
