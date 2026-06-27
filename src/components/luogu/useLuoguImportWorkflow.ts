import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

import type {
  PrepareLuoguSubmissionNoteResult,
  WriteLuoguPreparedNoteResult,
} from "@/lib/api";

import type { LuoguPrepareItemStatus } from "./luoguDisplay";
import {
  createEmptyLuoguPreparationWorkspace,
  createIdleLuoguPrepareSourceState,
  createIdleLuoguWriteSourceState,
  type LuoguImportStep,
  type LuoguPrepareSourceState,
  type LuoguPreviewDetailTab,
  type LuoguWriteSourceState,
} from "./luoguImportDisplay";

export interface LuoguImportWorkflowState {
  selectedSubmissionIds: Set<string>;
  skippedSubmissionIds: Set<string>;
  prepareSourceState: LuoguPrepareSourceState;
  preparedNotesById: Record<string, PrepareLuoguSubmissionNoteResult>;
  prepareErrorsById: Record<string, string>;
  prepareStatusesById: Record<string, LuoguPrepareItemStatus>;
  currentlyPreparingId: string | null;
  writeSourceState: LuoguWriteSourceState;
  writeResultsById: Record<string, WriteLuoguPreparedNoteResult>;
  currentlyWritingId: string | null;
  activePreparedPreviewId: string | null;
  activePreviewDetailTab: LuoguPreviewDetailTab;
  editedPreparedMarkdownIds: Set<string>;
  reviewSelectedSubmissionIds: Set<string>;
  importStep: LuoguImportStep;
}

export interface LuoguImportWorkflowController extends LuoguImportWorkflowState {
  isPreparingSelected: boolean;
  isStoppingPrepare: boolean;
  isWritingPrepared: boolean;
  setSelectedSubmissionIds: Dispatch<SetStateAction<Set<string>>>;
  setSkippedSubmissionIds: Dispatch<SetStateAction<Set<string>>>;
  setPrepareSourceState: Dispatch<SetStateAction<LuoguPrepareSourceState>>;
  setPreparedNotesById: Dispatch<SetStateAction<Record<string, PrepareLuoguSubmissionNoteResult>>>;
  setPrepareErrorsById: Dispatch<SetStateAction<Record<string, string>>>;
  setPrepareStatusesById: Dispatch<SetStateAction<Record<string, LuoguPrepareItemStatus>>>;
  setCurrentlyPreparingId: Dispatch<SetStateAction<string | null>>;
  setWriteSourceState: Dispatch<SetStateAction<LuoguWriteSourceState>>;
  setWriteResultsById: Dispatch<SetStateAction<Record<string, WriteLuoguPreparedNoteResult>>>;
  setCurrentlyWritingId: Dispatch<SetStateAction<string | null>>;
  setActivePreparedPreviewId: Dispatch<SetStateAction<string | null>>;
  setActivePreviewDetailTab: Dispatch<SetStateAction<LuoguPreviewDetailTab>>;
  setEditedPreparedMarkdownIds: Dispatch<SetStateAction<Set<string>>>;
  setReviewSelectedSubmissionIds: Dispatch<SetStateAction<Set<string>>>;
  setImportStep: Dispatch<SetStateAction<LuoguImportStep>>;
  resetPreparationWorkspace: () => void;
  resetSelection: () => void;
  toggleSubmissionSelection: (submissionId: string) => void;
  updatePreparedMarkdown: (submissionId: string, markdown: string) => void;
  toggleReviewSelection: (submissionId: string) => void;
}

export function getNextToggledLuoguIdSet(current: Set<string>, submissionId: string): Set<string> {
  const next = new Set(current);
  if (next.has(submissionId)) {
    next.delete(submissionId);
  } else {
    next.add(submissionId);
  }
  return next;
}

export function updateLuoguPreparedMarkdown(
  current: Record<string, PrepareLuoguSubmissionNoteResult>,
  submissionId: string,
  markdown: string,
): Record<string, PrepareLuoguSubmissionNoteResult> {
  const prepared = current[submissionId];
  if (!prepared || prepared.markdown === markdown) return current;
  return {
    ...current,
    [submissionId]: {
      ...prepared,
      markdown,
    },
  };
}

export function getNextEditedLuoguPreparedMarkdownIds(
  current: Set<string>,
  preparedNotesById: Record<string, PrepareLuoguSubmissionNoteResult>,
  submissionId: string,
  markdown: string,
): Set<string> {
  const prepared = preparedNotesById[submissionId];
  if (!prepared || prepared.markdown === markdown || current.has(submissionId)) return current;
  return new Set([...current, submissionId]);
}

export interface LuoguPreparedMarkdownUpdatePlan {
  preparedNotesById: Record<string, PrepareLuoguSubmissionNoteResult>;
  editedPreparedMarkdownIds: Set<string>;
}

export function getLuoguPreparedMarkdownUpdatePlan(input: {
  preparedNotesById: Record<string, PrepareLuoguSubmissionNoteResult>;
  editedPreparedMarkdownIds: Set<string>;
  submissionId: string;
  markdown: string;
}): LuoguPreparedMarkdownUpdatePlan {
  return {
    preparedNotesById: updateLuoguPreparedMarkdown(
      input.preparedNotesById,
      input.submissionId,
      input.markdown,
    ),
    editedPreparedMarkdownIds: getNextEditedLuoguPreparedMarkdownIds(
      input.editedPreparedMarkdownIds,
      input.preparedNotesById,
      input.submissionId,
      input.markdown,
    ),
  };
}

export function useLuoguImportWorkflow(): LuoguImportWorkflowController {
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Set<string>>(() => new Set());
  const [skippedSubmissionIds, setSkippedSubmissionIds] = useState<Set<string>>(() => new Set());
  const [prepareSourceState, setPrepareSourceState] = useState(createIdleLuoguPrepareSourceState);
  const [preparedNotesById, setPreparedNotesById] = useState<Record<string, PrepareLuoguSubmissionNoteResult>>({});
  const [prepareErrorsById, setPrepareErrorsById] = useState<Record<string, string>>({});
  const [prepareStatusesById, setPrepareStatusesById] = useState<Record<string, LuoguPrepareItemStatus>>({});
  const [currentlyPreparingId, setCurrentlyPreparingId] = useState<string | null>(null);
  const [writeSourceState, setWriteSourceState] = useState(createIdleLuoguWriteSourceState);
  const [writeResultsById, setWriteResultsById] = useState<Record<string, WriteLuoguPreparedNoteResult>>({});
  const [currentlyWritingId, setCurrentlyWritingId] = useState<string | null>(null);
  const [activePreparedPreviewId, setActivePreparedPreviewId] = useState<string | null>(null);
  const [activePreviewDetailTab, setActivePreviewDetailTab] = useState<LuoguPreviewDetailTab>("rendered");
  const [editedPreparedMarkdownIds, setEditedPreparedMarkdownIds] = useState<Set<string>>(() => new Set());
  const [reviewSelectedSubmissionIds, setReviewSelectedSubmissionIds] = useState<Set<string>>(() => new Set());
  const [importStep, setImportStep] = useState<LuoguImportStep>("scan");

  const resetPreparationWorkspace = useCallback(() => {
    const workspace = createEmptyLuoguPreparationWorkspace<PrepareLuoguSubmissionNoteResult, WriteLuoguPreparedNoteResult>();
    setSkippedSubmissionIds(workspace.skippedSubmissionIds);
    setPreparedNotesById(workspace.preparedNotesById);
    setPrepareErrorsById(workspace.prepareErrorsById);
    setPrepareStatusesById(workspace.prepareStatusesById);
    setEditedPreparedMarkdownIds(workspace.editedPreparedMarkdownIds);
    setReviewSelectedSubmissionIds(workspace.reviewSelectedSubmissionIds);
    setCurrentlyPreparingId(workspace.currentlyPreparingId);
    setPrepareSourceState(createIdleLuoguPrepareSourceState());
    setWriteResultsById(workspace.writeResultsById);
    setCurrentlyWritingId(workspace.currentlyWritingId);
    setWriteSourceState(createIdleLuoguWriteSourceState());
    setActivePreparedPreviewId(workspace.activePreparedPreviewId);
    setActivePreviewDetailTab(workspace.activePreviewDetailTab);
    setImportStep(workspace.importStep);
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedSubmissionIds(new Set<string>());
  }, []);

  const toggleSubmissionSelection = useCallback((submissionId: string) => {
    setSelectedSubmissionIds((current) => getNextToggledLuoguIdSet(current, submissionId));
  }, []);

  const updatePreparedMarkdown = useCallback((submissionId: string, markdown: string) => {
    const plan = getLuoguPreparedMarkdownUpdatePlan({
      preparedNotesById,
      editedPreparedMarkdownIds,
      submissionId,
      markdown,
    });
    setPreparedNotesById(plan.preparedNotesById);
    setEditedPreparedMarkdownIds(plan.editedPreparedMarkdownIds);
  }, [editedPreparedMarkdownIds, preparedNotesById]);

  const toggleReviewSelection = useCallback((submissionId: string) => {
    setReviewSelectedSubmissionIds((current) => getNextToggledLuoguIdSet(current, submissionId));
  }, []);

  return {
    selectedSubmissionIds,
    skippedSubmissionIds,
    prepareSourceState,
    preparedNotesById,
    prepareErrorsById,
    prepareStatusesById,
    currentlyPreparingId,
    writeSourceState,
    writeResultsById,
    currentlyWritingId,
    activePreparedPreviewId,
    activePreviewDetailTab,
    editedPreparedMarkdownIds,
    reviewSelectedSubmissionIds,
    importStep,
    isPreparingSelected: prepareSourceState.isPreparing,
    isStoppingPrepare: prepareSourceState.isStopping,
    isWritingPrepared: writeSourceState.isWriting,
    setSelectedSubmissionIds,
    setSkippedSubmissionIds,
    setPrepareSourceState,
    setPreparedNotesById,
    setPrepareErrorsById,
    setPrepareStatusesById,
    setCurrentlyPreparingId,
    setWriteSourceState,
    setWriteResultsById,
    setCurrentlyWritingId,
    setActivePreparedPreviewId,
    setActivePreviewDetailTab,
    setEditedPreparedMarkdownIds,
    setReviewSelectedSubmissionIds,
    setImportStep,
    resetPreparationWorkspace,
    resetSelection,
    toggleSubmissionSelection,
    updatePreparedMarkdown,
    toggleReviewSelection,
  };
}
