import { describe, expect, it } from "vitest";
import {
  LUOGU_DIFFICULTY_OPTIONS,
  getDifficultyOptionClassName,
  getDifficultyOptionTextColor,
} from "./luoguDifficulty";

describe("luoguDifficulty", () => {
  it("keeps the known Luogu difficulty order", () => {
    expect(LUOGU_DIFFICULTY_OPTIONS.map((option) => option.value)).toEqual([
      "",
      "入门",
      "普及-",
      "普及/提高-",
      "普及+/提高",
      "提高+/省选-",
      "省选/NOI-",
      "NOI/NOI+/CTSC",
    ]);
  });

  it("returns classes for known difficulties and a fallback for unknown values", () => {
    expect(getDifficultyOptionClassName("入门")).toBe("text-[#fe4c61]");
    expect(getDifficultyOptionClassName("普及/提高-")).toBe("text-[#d89b00] dark:text-[#ffc116]");
    expect(getDifficultyOptionClassName("未知")).toBe("text-foreground");
  });

  it("returns theme-aware text colors", () => {
    expect(getDifficultyOptionTextColor("省选/NOI-", "light")).toBe("#9d3dcf");
    expect(getDifficultyOptionTextColor("省选/NOI-", "dark")).toBe("#c084fc");
    expect(getDifficultyOptionTextColor("未知", "dark")).toBeUndefined();
  });
});
