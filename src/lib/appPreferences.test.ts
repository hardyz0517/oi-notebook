import { describe, expect, it } from "vitest";

import {
  READING_DENSITY_OPTIONS,
  isReadingDensity,
  type ReadingDensity,
} from "./appPreferences";

describe("appPreferences", () => {
  it("exports stable reading density options for settings and preview layout", () => {
    expect(READING_DENSITY_OPTIONS.map((option) => option.id)).toEqual([
      "compact",
      "standard",
      "comfortable",
    ]);
    expect(READING_DENSITY_OPTIONS.every((option) => isReadingDensity(option.id))).toBe(true);
    expect(READING_DENSITY_OPTIONS.find((option) => option.id === "standard")).toMatchObject({
      lineHeight: 1.7,
      blockSpacing: "0.75rem",
    });
  });

  it("keeps reading density ids narrow", () => {
    const ids: ReadingDensity[] = ["compact", "standard", "comfortable"];

    expect(ids.every(isReadingDensity)).toBe(true);
    expect(isReadingDensity("loose")).toBe(false);
  });
});
