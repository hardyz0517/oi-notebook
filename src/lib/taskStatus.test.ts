import { describe, expect, it } from "vitest";
import {
  cancelTaskState,
  createIdleTaskState,
  createTaskProgress,
  failTaskState,
  finishTaskState,
  startTaskState,
  updateTaskProgress,
  updateTaskProgressValue,
  pauseTaskState,
  queueTaskState,
  resumeTaskState,
  stopTaskState,
  isTaskActive,
  isTaskFailed,
  isTaskPaused,
  isTaskRunning,
  deriveTaskView,
} from "./taskStatus";

describe("taskStatus", () => {
  it("creates idle task state and zeroed progress", () => {
    expect(createIdleTaskState()).toEqual({ status: "idle", progress: null, error: null });
    expect(createTaskProgress(3)).toEqual({ current: 0, total: 3, succeeded: 0, failed: 0, skipped: 0 });
  });

  it("starts a task with normalized progress", () => {
    expect(startTaskState(2)).toEqual({
      status: "running",
      progress: { current: 0, total: 2, succeeded: 0, failed: 0, skipped: 0 },
      error: null,
    });
    expect(startTaskState(-1).progress?.total).toBe(0);
  });

  it("updates task progress without mutating the previous state", () => {
    const state = startTaskState(5);
    const next = updateTaskProgress(state, { current: 2, succeeded: 1 });

    expect(next).toEqual({
      status: "running",
      progress: { current: 2, total: 5, succeeded: 1, failed: 0, skipped: 0 },
      error: null,
    });
    expect(state.progress?.current).toBe(0);
  });

  it("updates standalone progress values for legacy task state migration", () => {
    const progress = createTaskProgress(5);
    const next = updateTaskProgressValue(progress, { current: 2, succeeded: 1, skipped: 1 });

    expect(next).toEqual({
      current: 2,
      total: 5,
      succeeded: 1,
      failed: 0,
      skipped: 1,
    });
    expect(progress.current).toBe(0);
  });

  it("uses zeroed progress when updating an idle task", () => {
    expect(updateTaskProgress(createIdleTaskState(), { total: 4, skipped: 2 })).toEqual({
      status: "idle",
      progress: { current: 0, total: 4, succeeded: 0, failed: 0, skipped: 2 },
      error: null,
    });
  });

  it("marks terminal task states", () => {
    const running = updateTaskProgress(startTaskState(4), { current: 4, succeeded: 3, failed: 1 });

    expect(finishTaskState(running)).toEqual({
      status: "succeeded",
      progress: { current: 4, total: 4, succeeded: 3, failed: 1, skipped: 0 },
      error: null,
    });
    expect(failTaskState(running, "boom")).toEqual({
      status: "failed",
      progress: { current: 4, total: 4, succeeded: 3, failed: 1, skipped: 0 },
      error: "boom",
    });
    expect(cancelTaskState(running)).toEqual({
      status: "cancelled",
      progress: { current: 4, total: 4, succeeded: 3, failed: 1, skipped: 0 },
      error: null,
    });
  });

  it("models queued, paused, resumed, and stopping task states", () => {
    const queued = queueTaskState(3);
    expect(queued).toEqual({
      status: "queued",
      progress: { current: 0, total: 3, succeeded: 0, failed: 0, skipped: 0 },
      error: null,
    });

    const running = startTaskState(3);
    const paused = pauseTaskState(updateTaskProgress(running, { current: 1 }));
    expect(paused).toEqual({
      status: "paused",
      progress: { current: 1, total: 3, succeeded: 0, failed: 0, skipped: 0 },
      error: null,
    });
    expect(resumeTaskState(paused)).toEqual({
      status: "running",
      progress: { current: 1, total: 3, succeeded: 0, failed: 0, skipped: 0 },
      error: null,
    });
    expect(stopTaskState(paused)).toEqual({
      status: "stopping",
      progress: { current: 1, total: 3, succeeded: 0, failed: 0, skipped: 0 },
      error: null,
    });
  });

  it("derives common task status predicates", () => {
    const idle = createIdleTaskState();
    const running = startTaskState();
    const paused = pauseTaskState(running);
    const stopping = stopTaskState(running);
    const failed = failTaskState(running, "boom");

    expect(isTaskRunning(running)).toBe(true);
    expect(isTaskRunning(paused)).toBe(false);

    expect(isTaskPaused(paused)).toBe(true);
    expect(isTaskPaused(running)).toBe(false);

    expect(isTaskActive(idle)).toBe(false);
    expect(isTaskActive(queueTaskState())).toBe(true);
    expect(isTaskActive(running)).toBe(true);
    expect(isTaskActive(paused)).toBe(true);
    expect(isTaskActive(stopping)).toBe(true);
    expect(isTaskActive(finishTaskState(running))).toBe(false);

    expect(isTaskFailed(failed)).toBe(true);
    expect(isTaskFailed(cancelTaskState(running))).toBe(false);
  });

  it("derives a common task view for controls and status text", () => {
    expect(deriveTaskView(createIdleTaskState(), {
      idleLabel: "Ready",
      runningLabel: "Working",
      succeededLabel: "Done",
      failedLabel: "Failed",
      cancelledLabel: "Cancelled",
    })).toEqual({
      status: "idle",
      isActive: false,
      isBusy: false,
      canStart: true,
      canCancel: false,
      canRetry: false,
      label: "Ready",
      message: null,
      progress: null,
      error: null,
    });

    expect(deriveTaskView(updateTaskProgress(startTaskState(3), { current: 1 }), {
      idleLabel: "Ready",
      runningLabel: "Working",
      succeededLabel: "Done",
      failedLabel: "Failed",
      cancelledLabel: "Cancelled",
    })).toEqual({
      status: "running",
      isActive: true,
      isBusy: true,
      canStart: false,
      canCancel: true,
      canRetry: false,
      label: "Working",
      message: "1/3",
      progress: { current: 1, total: 3, succeeded: 0, failed: 0, skipped: 0 },
      error: null,
    });

    expect(deriveTaskView(failTaskState(startTaskState(), "boom"), {
      idleLabel: "Ready",
      runningLabel: "Working",
      succeededLabel: "Done",
      failedLabel: "Failed",
      cancelledLabel: "Cancelled",
    })).toMatchObject({
      status: "failed",
      isActive: false,
      isBusy: false,
      canStart: true,
      canCancel: false,
      canRetry: true,
      label: "Failed",
      message: "boom",
      error: "boom",
    });
  });
});
