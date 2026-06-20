import { describe, expect, it } from "vitest";

import type { LocalNoteIndexStatusResult } from "@/lib/api";
import {
  buildLocalIndexStatusMessage,
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
});
