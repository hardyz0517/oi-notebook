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
