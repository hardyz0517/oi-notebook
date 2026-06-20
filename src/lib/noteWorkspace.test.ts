import { describe, expect, it } from "vitest";
import {
  findEntryCaseInsensitive,
  getCurrentNoteDirectory,
  getNoteDirectories,
  normalizeCustomNoteDirectory,
  resolveNewNoteDirectory,
} from "./noteWorkspace";
import type { NoteFileInfo } from "@/types/note";

const files: NoteFileInfo[] = [
  { name: "b", path: "b", modified: "", isDirectory: true },
  { name: "A", path: "A", modified: "", isDirectory: true },
  { name: "note.md", path: "A/note.md", modified: "" },
];

describe("noteWorkspace", () => {
  it("derives sorted note directories", () => {
    expect(getNoteDirectories(files)).toEqual(["A", "b"]);
  });

  it("derives current note directory", () => {
    expect(getCurrentNoteDirectory("A/note.md")).toBe("A");
    expect(getCurrentNoteDirectory("note.md")).toBe("");
    expect(getCurrentNoteDirectory(null)).toBe("");
  });

  it("normalizes custom note directories", () => {
    expect(normalizeCustomNoteDirectory(" \\tricks\\dp/ ")).toBe("tricks/dp");
    expect(normalizeCustomNoteDirectory("/problems/")).toBe("problems");
  });

  it("resolves new note directories", () => {
    expect(resolveNewNoteDirectory("root", "ignored", "current")).toBe("");
    expect(resolveNewNoteDirectory("tricks", "ignored", "current")).toBe("tricks");
    expect(resolveNewNoteDirectory("problems", "ignored", "current")).toBe("problems");
    expect(resolveNewNoteDirectory("custom", " custom/path ", "current")).toBe("custom/path");
    expect(resolveNewNoteDirectory("current", "ignored", "current")).toBe("current");
  });

  it("finds entries case-insensitively by kind", () => {
    expect(findEntryCaseInsensitive(files, "a/note.md", false)?.path).toBe("A/note.md");
    expect(findEntryCaseInsensitive(files, "a", true)?.path).toBe("A");
    expect(findEntryCaseInsensitive(files, "a", false)).toBeUndefined();
  });
});
