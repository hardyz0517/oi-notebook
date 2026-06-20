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

export function cancelTaskState<TError = string>(state: TaskState<TError>): TaskState<TError> {
  return { ...state, status: "cancelled", error: null };
}
