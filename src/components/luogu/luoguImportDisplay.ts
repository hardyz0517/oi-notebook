import { createIdleTaskState, createTaskProgress, deriveTaskView, isTaskActive, updateTaskProgressValue, type TaskProgress, type TaskState, type TaskView } from "@/lib/taskStatus";
import type { PreviewLuoguSubmission } from "@/lib/api";

import type { LuoguScanResultStats } from "./useLuoguImportController";
import type { LuoguPrepareItemStatus } from "./luoguDisplay";
import {
  getLuoguSubmissionCandidateState,
  type LuoguSubmissionCandidateState,
} from "@/components/settings/pages/luoguImportDomain";
import type { LuoguImportRules } from "@/components/settings/pages/luoguImportRules";

export type LuoguPreviewDetailTab = "rendered" | "markdown" | "source";
export type LuoguImportStep = "scan" | "preview";
export type LuoguTaskViewKind = "scan" | "prepare" | "write";

export interface LuoguScanProgressDisplay {
  currentPage?: number;
  foundCount: number;
  rangeLabel?: string;
  waiting?: boolean;
}

export interface LuoguScanSummaryDisplay {
  scannedPages?: number;
  foundCount: number;
  candidateCount: number;
  skippedCount: number;
  rangeLabel?: string;
}

export interface LuoguScanResultSummaryInput {
  isPaused: boolean;
  progress: LuoguScanProgressDisplay | null;
  summary: LuoguScanSummaryDisplay | null;
  hasPreviewResult: boolean;
  stats: Pick<LuoguScanResultStats, "total" | "candidateCount" | "skippedCount">;
}

export interface LuoguImportCenterBusyInput {
  isImporting: boolean;
  isPreparing: boolean;
  isWriting: boolean;
  isScanning: boolean;
  isSyncing: boolean;
  scanTask?: TaskState;
  prepareTask?: TaskState;
  writeTask?: TaskState;
}

export function isLuoguImportCenterBusy(input: LuoguImportCenterBusyInput): boolean {
  return (
    input.isImporting ||
    input.isPreparing ||
    input.isWriting ||
    input.isScanning ||
    input.isSyncing ||
    Boolean(input.scanTask && isTaskActive(input.scanTask) && input.scanTask.status !== "paused") ||
    Boolean(input.prepareTask && isTaskActive(input.prepareTask) && input.prepareTask.status !== "paused") ||
    Boolean(input.writeTask && isTaskActive(input.writeTask) && input.writeTask.status !== "paused")
  );
}

export interface LuoguScanCompletionSelectionInput {
  submissions: PreviewLuoguSubmission[];
  rules: LuoguImportRules;
  lastSubmissionId: number | null;
  skippedSubmissionIds: Set<string>;
}

export interface LuoguScanCompletionSelection {
  candidateCount: number;
  skippedCount: number;
  defaultSelectedSubmissionIds: Set<string>;
}

export function getLuoguScanCompletionSelection(
  input: LuoguScanCompletionSelectionInput,
): LuoguScanCompletionSelection {
  let candidateCount = 0;
  const defaultSelectedSubmissionIds = new Set<string>();

  for (const submission of input.submissions) {
    const state = getLuoguSubmissionCandidateState(
      submission,
      input.submissions,
      input.rules,
      input.lastSubmissionId,
      input.skippedSubmissionIds,
    );
    if (state.canSelect) {
      candidateCount += 1;
    }
    if (state.defaultSelected) {
      defaultSelectedSubmissionIds.add(submission.submissionId);
    }
  }

  return {
    candidateCount,
    skippedCount: Math.max(0, input.submissions.length - candidateCount),
    defaultSelectedSubmissionIds,
  };
}

export interface LuoguPrepareSelectionPlanInput {
  submissions: PreviewLuoguSubmission[];
  selectedSubmissionIds: Set<string>;
  candidateStates: Record<string, LuoguSubmissionCandidateState | undefined>;
  skippedSubmissionIds: Set<string>;
  prepareStatusesById: Record<string, LuoguPrepareItemStatus>;
  hasReusablePreview: (submissionId: string) => boolean;
}

export interface LuoguPrepareSelectionPlan {
  selectedSubmissions: PreviewLuoguSubmission[];
  queue: PreviewLuoguSubmission[];
  reusablePreviewSubmissions: PreviewLuoguSubmission[];
  ignoredCount: number;
}

export function getLuoguPrepareSelectionPlan(
  input: LuoguPrepareSelectionPlanInput,
): LuoguPrepareSelectionPlan {
  const selectedSubmissions = input.submissions.filter((submission) =>
    input.selectedSubmissionIds.has(submission.submissionId),
  );
  const queue = selectedSubmissions.filter((submission, index, submissions) => {
    const candidateState = input.candidateStates[submission.submissionId];
    const prepareStatus = input.prepareStatusesById[submission.submissionId];
    return (
      submissions.findIndex((item) => item.submissionId === submission.submissionId) === index &&
      candidateState?.canSelect &&
      !input.skippedSubmissionIds.has(submission.submissionId) &&
      prepareStatus !== "running" &&
      prepareStatus !== "queued" &&
      !input.hasReusablePreview(submission.submissionId)
    );
  });
  const reusablePreviewSubmissions = selectedSubmissions.filter((submission) =>
    input.hasReusablePreview(submission.submissionId),
  );

  return {
    selectedSubmissions,
    queue,
    reusablePreviewSubmissions,
    ignoredCount: selectedSubmissions.length - queue.length - reusablePreviewSubmissions.length,
  };
}

export interface LuoguSelectableSelectionInput {
  currentSelection: Set<string>;
  selectableSubmissionIds: string[];
  areAllSelectableSelected: boolean;
}

export function getNextLuoguSelectableSelection(input: LuoguSelectableSelectionInput): Set<string> {
  const next = new Set(input.currentSelection);
  if (input.areAllSelectableSelected) {
    for (const submissionId of input.selectableSubmissionIds) {
      next.delete(submissionId);
    }
    return next;
  }

  for (const submissionId of input.selectableSubmissionIds) {
    next.add(submissionId);
  }
  return next;
}

export function createQueuedLuoguPrepareStatuses(
  submissions: PreviewLuoguSubmission[],
): Record<string, LuoguPrepareItemStatus> {
  return Object.fromEntries(
    submissions.map((submission) => [submission.submissionId, "queued"]),
  ) as Record<string, LuoguPrepareItemStatus>;
}

export function stopQueuedLuoguPrepareStatuses(
  statuses: Record<string, LuoguPrepareItemStatus>,
): Record<string, LuoguPrepareItemStatus> {
  return Object.fromEntries(
    Object.entries(statuses).map(([submissionId, status]) => [
      submissionId,
      status === "queued" ? "stopped" : status,
    ]),
  ) as Record<string, LuoguPrepareItemStatus>;
}

export function finishLuoguPrepareStatuses(
  statuses: Record<string, LuoguPrepareItemStatus>,
  cancelled: boolean,
): Record<string, LuoguPrepareItemStatus> {
  if (!cancelled) return statuses;

  return Object.fromEntries(
    Object.entries(statuses).map(([submissionId, status]) => [
      submissionId,
      status === "queued" || status === "running" ? "stopped" : status,
    ]),
  ) as Record<string, LuoguPrepareItemStatus>;
}

export function getLuoguSubmissionIdSet(submissions: PreviewLuoguSubmission[]): Set<string> {
  return new Set(submissions.map((submission) => submission.submissionId));
}

export interface LuoguInitialPrepareProgressInput {
  queueCount: number;
  reusablePreviewCount: number;
  ignoredCount: number;
}

export function createInitialLuoguPrepareProgress(
  input: LuoguInitialPrepareProgressInput,
): TaskProgress {
  return updateTaskProgressValue(createTaskProgress(input.queueCount), {
    succeeded: input.reusablePreviewCount,
    skipped: input.ignoredCount,
  });
}

export interface LuoguWriteProgressCounts {
  total: number;
  current: number;
  writtenCount: number;
  failedCount: number;
  skippedCount: number;
}

export function createLuoguWriteProgress(input: LuoguWriteProgressCounts): TaskProgress {
  return updateTaskProgressValue(createTaskProgress(input.total), {
    current: input.current,
    succeeded: input.writtenCount,
    failed: input.failedCount,
    skipped: input.skippedCount,
  });
}

export interface LuoguPreparationWorkspaceState<TPreparedNote = unknown, TWriteResult = unknown> {
  skippedSubmissionIds: Set<string>;
  preparedNotesById: Record<string, TPreparedNote>;
  prepareErrorsById: Record<string, string>;
  prepareStatusesById: Record<string, LuoguPrepareItemStatus>;
  editedPreparedMarkdownIds: Set<string>;
  reviewSelectedSubmissionIds: Set<string>;
  currentlyPreparingId: string | null;
  prepareProgress: TaskProgress | null;
  isStoppingPrepare: boolean;
  writeResultsById: Record<string, TWriteResult>;
  currentlyWritingId: string | null;
  writeProgress: TaskProgress | null;
  activePreparedPreviewId: string | null;
  activePreviewDetailTab: LuoguPreviewDetailTab;
  importStep: LuoguImportStep;
}

export function createEmptyLuoguPreparationWorkspace<TPreparedNote = unknown, TWriteResult = unknown>(): LuoguPreparationWorkspaceState<TPreparedNote, TWriteResult> {
  return {
    skippedSubmissionIds: new Set<string>(),
    preparedNotesById: {},
    prepareErrorsById: {},
    prepareStatusesById: {},
    editedPreparedMarkdownIds: new Set<string>(),
    reviewSelectedSubmissionIds: new Set<string>(),
    currentlyPreparingId: null,
    prepareProgress: null,
    isStoppingPrepare: false,
    writeResultsById: {},
    currentlyWritingId: null,
    writeProgress: null,
    activePreparedPreviewId: null,
    activePreviewDetailTab: "rendered",
    importStep: "scan",
  };
}

export interface LuoguScanTaskStateInput {
  isScanning: boolean;
  isPaused: boolean;
  progress: LuoguScanProgressDisplay | null;
  summary: LuoguScanSummaryDisplay | null;
  error: string | null;
}

export interface LuoguScanSourceState extends LuoguScanTaskStateInput {}

export function createIdleLuoguScanSourceState(): LuoguScanSourceState {
  return {
    isScanning: false,
    isPaused: false,
    progress: null,
    summary: null,
    error: null,
  };
}

export function startLuoguScanSourceState(progress: LuoguScanProgressDisplay): LuoguScanSourceState {
  return {
    isScanning: true,
    isPaused: false,
    progress,
    summary: null,
    error: null,
  };
}

export function updateLuoguScanSourceProgress(
  state: LuoguScanSourceState,
  progress: LuoguScanProgressDisplay,
): LuoguScanSourceState {
  return {
    ...state,
    progress,
  };
}

export function pauseLuoguScanSourceState(state: LuoguScanSourceState): LuoguScanSourceState {
  return {
    ...state,
    isScanning: false,
    isPaused: true,
    summary: null,
    error: null,
  };
}

export function finishLuoguScanSourceState(summary: LuoguScanSummaryDisplay): LuoguScanSourceState {
  return {
    isScanning: false,
    isPaused: false,
    progress: null,
    summary,
    error: null,
  };
}

export function failLuoguScanSourceState(error: string): LuoguScanSourceState {
  return {
    isScanning: false,
    isPaused: false,
    progress: null,
    summary: null,
    error,
  };
}

export function deriveLuoguScanTaskState(input: LuoguScanTaskStateInput): TaskState {
  if (input.isScanning) {
    const foundCount = input.progress?.foundCount ?? 0;
    return {
      status: "running",
      progress: {
        current: foundCount,
        total: foundCount,
        succeeded: foundCount,
        failed: 0,
        skipped: 0,
      },
      error: null,
    };
  }

  if (input.isPaused) {
    return { status: "paused", progress: null, error: null };
  }

  if (input.error) {
    return { status: "failed", progress: null, error: input.error };
  }

  if (input.summary) {
    return {
      status: "succeeded",
      progress: {
        current: input.summary.foundCount,
        total: input.summary.foundCount,
        succeeded: input.summary.candidateCount,
        failed: 0,
        skipped: input.summary.skippedCount,
      },
      error: null,
    };
  }

  return createIdleTaskState();
}

export interface LuoguPrepareTaskStateInput {
  isPreparing: boolean;
  isStopping: boolean;
  progress: TaskProgress | null;
}

export interface LuoguPrepareSourceState extends LuoguPrepareTaskStateInput {}

export function createIdleLuoguPrepareSourceState(): LuoguPrepareSourceState {
  return {
    isPreparing: false,
    isStopping: false,
    progress: null,
  };
}

export function startLuoguPrepareSourceState(progress: TaskProgress): LuoguPrepareSourceState {
  return {
    isPreparing: true,
    isStopping: false,
    progress,
  };
}

export function stopLuoguPrepareSourceState(state: LuoguPrepareSourceState): LuoguPrepareSourceState {
  return {
    ...state,
    isStopping: true,
  };
}

export function updateLuoguPrepareSourceProgress(
  state: LuoguPrepareSourceState,
  progress: TaskProgress,
): LuoguPrepareSourceState {
  return {
    ...state,
    progress,
  };
}

export function deriveLuoguPrepareTaskState(input: LuoguPrepareTaskStateInput): TaskState {
  if (input.isStopping) {
    return { status: "stopping", progress: input.progress, error: null };
  }
  if (input.isPreparing) {
    return { status: "running", progress: input.progress, error: null };
  }
  return createIdleTaskState();
}

export interface LuoguWriteTaskStateInput {
  isWriting: boolean;
  progress: TaskProgress | null;
}

export interface LuoguWriteSourceState extends LuoguWriteTaskStateInput {}

export function createIdleLuoguWriteSourceState(): LuoguWriteSourceState {
  return {
    isWriting: false,
    progress: null,
  };
}

export function startLuoguWriteSourceState(total: number): LuoguWriteSourceState {
  return {
    isWriting: true,
    progress: createTaskProgress(total),
  };
}

export function updateLuoguWriteSourceProgress(
  state: LuoguWriteSourceState,
  progress: TaskProgress,
): LuoguWriteSourceState {
  return {
    ...state,
    progress,
  };
}

export function deriveLuoguWriteTaskState(input: LuoguWriteTaskStateInput): TaskState {
  if (input.isWriting) {
    return { status: "running", progress: input.progress, error: null };
  }
  return createIdleTaskState();
}

export function deriveLuoguTaskView(state: TaskState, kind: LuoguTaskViewKind): TaskView {
  if (kind === "scan") {
    return deriveTaskView(state, {
      idleLabel: "开始扫描",
      runningLabel: "扫描中",
      pausedLabel: "继续扫描",
      succeededLabel: "扫描完成",
      failedLabel: "重新扫描",
      cancelledLabel: "扫描已取消",
    });
  }

  if (kind === "prepare") {
    return deriveTaskView(state, {
      idleLabel: "生成预览",
      runningLabel: "生成中",
      stoppingLabel: "停止中",
      succeededLabel: "生成完成",
      failedLabel: "重新生成",
      cancelledLabel: "生成已取消",
    });
  }

  return deriveTaskView(state, {
    idleLabel: "写入选中",
    runningLabel: "写入中",
    succeededLabel: "写入完成",
    failedLabel: "重新写入",
    cancelledLabel: "写入已取消",
  });
}

export function formatLuoguScanResultSummary(input: LuoguScanResultSummaryInput): string {
  if (input.isPaused) {
    return `扫描已暂停 — ${input.stats.total} 条 / 可导入 ${input.stats.candidateCount} / 跳过 ${input.stats.skippedCount}`;
  }

  if (input.progress) {
    return `正在扫描，已发现 ${input.progress.foundCount} 条`;
  }

  if (input.summary) {
    return `${input.summary.foundCount} 条 / 可导入 ${input.summary.candidateCount} / 跳过 ${input.summary.skippedCount}`;
  }

  if (input.hasPreviewResult) {
    return `${input.stats.total} 条 / 可导入 ${input.stats.candidateCount} / 跳过 ${input.stats.skippedCount}`;
  }

  return "还没有扫描结果。";
}

export interface LuoguPrepareButtonLabelInput {
  isPreparing: boolean;
  progress: Pick<TaskProgress, "current" | "total"> | null;
  prepareQueueCount: number;
  reusablePreviewCount: number;
}

export function formatLuoguPrepareButtonLabel(input: LuoguPrepareButtonLabelInput): string {
  if (input.isPreparing) {
    return `生成中 ${input.progress?.current ?? 0}/${input.progress?.total ?? input.prepareQueueCount}`;
  }

  if (input.prepareQueueCount > 0) {
    return `生成预览（${input.prepareQueueCount}）`;
  }

  return `查看预览（${input.reusablePreviewCount}）`;
}

export interface LuoguPreviewReviewSummaryInput {
  prepareProgress: TaskProgress | null;
  writeProgress: Pick<TaskProgress, "current" | "total"> | null;
  preparedCount: number;
  writableCount: number;
}

export function formatLuoguPreviewReviewSummary(input: LuoguPreviewReviewSummaryInput): string {
  if (input.prepareProgress) {
    return `生成中 ${input.prepareProgress.current}/${input.prepareProgress.total} 路 成功 ${input.prepareProgress.succeeded} 路 失败 ${input.prepareProgress.failed}`;
  }

  if (input.writeProgress) {
    return `写入中 ${input.writeProgress.current}/${input.writeProgress.total}`;
  }

  return `已生成 ${input.preparedCount} 个 路 已选 ${input.writableCount} 个`;
}
