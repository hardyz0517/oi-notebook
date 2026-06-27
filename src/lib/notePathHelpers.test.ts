import { describe, expect, it } from "vitest";

import {
  joinNotePath,
  normalizeNoteFileName,
  validateNoteDirectoryPathInput,
  validateNoteNamePart,
} from "./notePathHelpers";

describe("notePathHelpers", () => {
  it("normalizes note filenames without duplicating markdown extensions", () => {
    expect(normalizeNoteFileName("  Segment Tree  ")).toBe("Segment Tree.md");
    expect(normalizeNoteFileName("Segment Tree.MD")).toBe("Segment Tree.MD");
  });

  it("joins note paths using normalized relative directories", () => {
    expect(joinNotePath("", "a.md")).toBe("a.md");
    expect(joinNotePath(" tricks\\dp/ ", "knapsack.md")).toBe("tricks/dp/knapsack.md");
  });

  it("accepts plain names and relative directories", () => {
    expect(validateNoteNamePart("abc", "file")).toBeNull();
    expect(validateNoteNamePart("abc", "folder")).toBeNull();
    expect(validateNoteDirectoryPathInput("tricks/dp")).toBeNull();
  });

  it("rejects path traversal, absolute paths, empty names, and illegal characters", () => {
    expect(validateNoteNamePart("", "file")).not.toBeNull();
    expect(validateNoteNamePart("a/b", "file")).not.toBeNull();
    expect(validateNoteNamePart("../a", "folder")).not.toBeNull();
    expect(validateNoteNamePart("C:/a", "folder")).not.toBeNull();
    expect(validateNoteDirectoryPathInput("../a")).not.toBeNull();
    expect(validateNoteDirectoryPathInput("C:/a")).not.toBeNull();
    expect(validateNoteDirectoryPathInput("a//b")).not.toBeNull();
  });
});
