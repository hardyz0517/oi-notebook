import { describe, expect, it } from "vitest";

import { formatLuoguCandidateSuggestionTitle, type LuoguCandidateDisplayState } from "./luoguDisplay";

describe("luoguDisplay", () => {
  it("formats candidate suggestion title from detail and output", () => {
    const displayState: LuoguCandidateDisplayState = {
      label: "已预览",
      detail: "目标文件已存在，写入不会覆盖",
      tone: "info",
      output: "luogu/P1001.md",
    };

    expect(formatLuoguCandidateSuggestionTitle(displayState)).toBe("目标文件已存在，写入不会覆盖 路 luogu/P1001.md");
  });

  it("omits placeholder output from candidate suggestion title", () => {
    const displayState: LuoguCandidateDisplayState = {
      label: "跳过",
      detail: "非 AC，不会导入",
      tone: "warning",
      output: "—",
    };

    expect(formatLuoguCandidateSuggestionTitle(displayState)).toBe("非 AC，不会导入");
  });
});
