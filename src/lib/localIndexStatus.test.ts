import { describe, expect, it } from "vitest";

import type { LocalNoteIndexStatusResult } from "@/lib/api";
import {
  buildLocalIndexRebuildSuccessMessage,
  buildLocalIndexStatusMessage,
  deriveLocalIndexDetailsView,
  deriveLocalIndexTaskView,
  getLocalIndexRebuildRunningMessage,
  getLocalIndexRebuildButtonLabel,
  getLocalIndexStatusBadgeTone,
  isLocalIndexActionDisabled,
} from "./localIndexStatus";

const baseStatus: LocalNoteIndexStatusResult = {
  exists: true,
  status: "ready",
  noteCount: 12,
  chunkCount: 34,
  updatedAt: 1_700_000_000,
  version: 3,
  currentVersion: 3,
  pathLabel: "index.json",
  approxSizeBytes: 2048,
  readable: true,
  writable: true,
  sampleRelativePaths: ["a.md"],
};

describe("localIndexStatus model helpers", () => {
  it("builds status messages for missing, stale, and error indexes", () => {
    expect(buildLocalIndexStatusMessage({ ...baseStatus, exists: false, status: "missing" })).toBe(
      "本地索引尚未建立，首次搜索或点击重建后会生成。",
    );
    expect(buildLocalIndexStatusMessage({ ...baseStatus, status: "stale" })).toBe(
      "本地索引版本已更新，建议重建索引。",
    );
    expect(buildLocalIndexStatusMessage({ ...baseStatus, status: "error" })).toBe(
      "本地索引读取失败，可尝试重建。",
    );
    expect(buildLocalIndexStatusMessage(baseStatus)).toBeNull();
  });

  it("maps status and rebuild state to the existing badge tones", () => {
    expect(getLocalIndexStatusBadgeTone(baseStatus, true)).toBe("info");
    expect(getLocalIndexStatusBadgeTone(baseStatus, false)).toBe("success");
    expect(getLocalIndexStatusBadgeTone({ ...baseStatus, status: "error" }, false)).toBe("danger");
    expect(getLocalIndexStatusBadgeTone({ ...baseStatus, status: "stale" }, false)).toBe("warning");
    expect(getLocalIndexStatusBadgeTone(null, false)).toBe("warning");
  });

  it("derives action disabled and rebuild button labels from loading flags", () => {
    expect(isLocalIndexActionDisabled({ isLoading: false, isRebuilding: false })).toBe(false);
    expect(isLocalIndexActionDisabled({ isLoading: true, isRebuilding: false })).toBe(true);
    expect(isLocalIndexActionDisabled({ isLoading: false, isRebuilding: true })).toBe(true);

    expect(getLocalIndexRebuildButtonLabel(false)).toBe("重建索引");
    expect(getLocalIndexRebuildButtonLabel(true)).toBe("正在建立...");
  });

  it("builds local index rebuild messages", () => {
    expect(getLocalIndexRebuildRunningMessage()).toBe("正在建立本地笔记索引...");
    expect(buildLocalIndexRebuildSuccessMessage({ noteCount: 12, chunkCount: 34 })).toBe(
      "重建完成：12 篇笔记，34 个片段。",
    );
  });

  it("derives legacy local index UI flags from task states", () => {
    expect(
      deriveLocalIndexTaskView({
        status: baseStatus,
        loadTask: { status: "running", progress: null, error: null },
        rebuildTask: { status: "idle", progress: null, error: null },
        fallbackMessage: null,
      }),
    ).toMatchObject({
      isLoading: true,
      isRebuilding: false,
      actionDisabled: true,
      rebuildButtonLabel: "重建索引",
      message: null,
    });

    expect(
      deriveLocalIndexTaskView({
        status: baseStatus,
        loadTask: { status: "idle", progress: null, error: null },
        rebuildTask: { status: "running", progress: null, error: null },
        fallbackMessage: "old message",
      }),
    ).toMatchObject({
      isLoading: false,
      isRebuilding: true,
      actionDisabled: true,
      rebuildButtonLabel: "正在建立...",
      message: "正在建立本地笔记索引...",
    });

    expect(
      deriveLocalIndexTaskView({
        status: baseStatus,
        loadTask: { status: "idle", progress: null, error: null },
        rebuildTask: { status: "failed", progress: null, error: "boom" },
        fallbackMessage: null,
      }).message,
    ).toBe("boom");
  });

  it("derives local index busy flags from the common task view model", () => {
    expect(
      deriveLocalIndexTaskView({
        status: baseStatus,
        loadTask: { status: "queued", progress: null, error: null },
        rebuildTask: { status: "idle", progress: null, error: null },
        fallbackMessage: null,
      }),
    ).toMatchObject({
      isLoading: true,
      isRebuilding: false,
      actionDisabled: true,
      message: null,
    });

    expect(
      deriveLocalIndexTaskView({
        status: baseStatus,
        loadTask: { status: "idle", progress: null, error: null },
        rebuildTask: { status: "stopping", progress: null, error: null },
        fallbackMessage: "old message",
      }),
    ).toMatchObject({
      isLoading: false,
      isRebuilding: true,
      actionDisabled: true,
      rebuildButtonLabel: getLocalIndexRebuildButtonLabel(true),
      message: getLocalIndexRebuildRunningMessage(),
    });
  });

  it("derives local index status label and badge tone from the same task view", () => {
    expect(
      deriveLocalIndexTaskView({
        status: baseStatus,
        loadTask: { status: "idle", progress: null, error: null },
        rebuildTask: { status: "idle", progress: null, error: null },
        fallbackMessage: null,
      }),
    ).toMatchObject({
      statusLabel: "可用",
      statusBadgeTone: "success",
    });

    expect(
      deriveLocalIndexTaskView({
        status: { ...baseStatus, status: "stale" },
        loadTask: { status: "idle", progress: null, error: null },
        rebuildTask: { status: "running", progress: null, error: null },
        fallbackMessage: null,
      }),
    ).toMatchObject({
      statusLabel: "正在建立本地笔记索引...",
      statusBadgeTone: "info",
    });
  });

  it("derives local index details for settings display", () => {
    expect(deriveLocalIndexDetailsView(null)).toEqual({
      noteCountLabel: "未获取",
      chunkCountLabel: "未获取",
      updatedLabel: "尚未记录",
      versionLabel: "未获取",
      pathLabel: null,
      sizeLabel: null,
      accessLabel: null,
    });

    expect(deriveLocalIndexDetailsView(baseStatus)).toEqual({
      noteCountLabel: "12",
      chunkCountLabel: "34",
      updatedLabel: new Date(baseStatus.updatedAt! * 1000).toLocaleString(),
      versionLabel: "3 / 当前 3",
      pathLabel: "index.json",
      sizeLabel: "2.0 KB",
      accessLabel: "可读写",
    });

    expect(deriveLocalIndexDetailsView({ ...baseStatus, version: undefined })).toMatchObject({
      versionLabel: "尚未建立 / 当前 3",
    });
  });
});
