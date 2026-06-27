export type TaskStatus = "idle" | "queued" | "running" | "paused" | "stopping" | "succeeded" | "failed" | "cancelled";

export interface TaskProgress {
  current: number;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface TaskState<TError = string> {
  status: TaskStatus;
  progress: TaskProgress | null;
  error: TError | null;
}

export interface TaskView<TError = string> {
  status: TaskStatus;
  isActive: boolean;
  isBusy: boolean;
  canStart: boolean;
  canCancel: boolean;
  canRetry: boolean;
  label: string;
  message: string | null;
  progress: TaskProgress | null;
  error: TError | null;
}

export interface TaskViewLabels {
  idleLabel: string;
  queuedLabel?: string;
  runningLabel: string;
  pausedLabel?: string;
  stoppingLabel?: string;
  succeededLabel: string;
  failedLabel: string;
  cancelledLabel: string;
}

export function createIdleTaskState<TError = string>(): TaskState<TError> {
  return { status: "idle", progress: null, error: null };
}

function normalizeProgressValue(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function createTaskProgress(total = 0): TaskProgress {
  return {
    current: 0,
    total: normalizeProgressValue(total),
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };
}

export function startTaskState<TError = string>(total = 0): TaskState<TError> {
  return { status: "running", progress: createTaskProgress(total), error: null };
}

export function queueTaskState<TError = string>(total = 0): TaskState<TError> {
  return { status: "queued", progress: createTaskProgress(total), error: null };
}

export function updateTaskProgress<TError = string>(
  state: TaskState<TError>,
  patch: Partial<TaskProgress>,
): TaskState<TError> {
  const current = state.progress ?? createTaskProgress();
  return {
    ...state,
    progress: {
      current: normalizeProgressValue(patch.current ?? current.current),
      total: normalizeProgressValue(patch.total ?? current.total),
      succeeded: normalizeProgressValue(patch.succeeded ?? current.succeeded),
      failed: normalizeProgressValue(patch.failed ?? current.failed),
      skipped: normalizeProgressValue(patch.skipped ?? current.skipped),
    },
  };
}

export function updateTaskProgressValue(progress: TaskProgress, patch: Partial<TaskProgress>): TaskProgress {
  return {
    current: normalizeProgressValue(patch.current ?? progress.current),
    total: normalizeProgressValue(patch.total ?? progress.total),
    succeeded: normalizeProgressValue(patch.succeeded ?? progress.succeeded),
    failed: normalizeProgressValue(patch.failed ?? progress.failed),
    skipped: normalizeProgressValue(patch.skipped ?? progress.skipped),
  };
}

export function finishTaskState<TError = string>(state: TaskState<TError>): TaskState<TError> {
  return { ...state, status: "succeeded", error: null };
}

export function failTaskState<TError>(state: TaskState<TError>, error: TError): TaskState<TError> {
  return { ...state, status: "failed", error };
}

export function pauseTaskState<TError = string>(state: TaskState<TError>): TaskState<TError> {
  return { ...state, status: "paused", error: null };
}

export function resumeTaskState<TError = string>(state: TaskState<TError>): TaskState<TError> {
  return { ...state, status: "running", error: null };
}

export function stopTaskState<TError = string>(state: TaskState<TError>): TaskState<TError> {
  return { ...state, status: "stopping", error: null };
}

export function cancelTaskState<TError = string>(state: TaskState<TError>): TaskState<TError> {
  return { ...state, status: "cancelled", error: null };
}

export function isTaskRunning(state: TaskState<unknown>): boolean {
  return state.status === "running";
}

export function isTaskPaused(state: TaskState<unknown>): boolean {
  return state.status === "paused";
}

export function isTaskActive(state: TaskState<unknown>): boolean {
  return state.status === "queued" || state.status === "running" || state.status === "paused" || state.status === "stopping";
}

export function isTaskFailed(state: TaskState<unknown>): boolean {
  return state.status === "failed";
}

export function formatTaskProgress(progress: TaskProgress | null): string | null {
  if (!progress || progress.total <= 0) return null;
  return `${progress.current}/${progress.total}`;
}

export function deriveTaskView<TError = string>(
  state: TaskState<TError>,
  labels: TaskViewLabels,
): TaskView<TError> {
  const isActive = isTaskActive(state);
  const isBusy = state.status === "queued" || state.status === "running" || state.status === "stopping";
  const labelByStatus: Record<TaskStatus, string> = {
    idle: labels.idleLabel,
    queued: labels.queuedLabel ?? labels.runningLabel,
    running: labels.runningLabel,
    paused: labels.pausedLabel ?? labels.runningLabel,
    stopping: labels.stoppingLabel ?? labels.runningLabel,
    succeeded: labels.succeededLabel,
    failed: labels.failedLabel,
    cancelled: labels.cancelledLabel,
  };

  return {
    status: state.status,
    isActive,
    isBusy,
    canStart: !isActive,
    canCancel: state.status === "queued" || state.status === "running" || state.status === "paused",
    canRetry: state.status === "failed" || state.status === "cancelled",
    label: labelByStatus[state.status],
    message: state.error == null ? formatTaskProgress(state.progress) : String(state.error),
    progress: state.progress,
    error: state.error,
  };
}
