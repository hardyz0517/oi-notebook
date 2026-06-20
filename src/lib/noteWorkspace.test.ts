import { describe, expect, it } from "vitest";
import {
  buildNewNoteMarkdown,
  findEntryCaseInsensitive,
  getCurrentNoteDirectory,
  getDefaultNewNoteCreateParent,
  getNoteDirectories,
  getSelectedTreeCreateParent,
  normalizeCustomNoteDirectory,
  quoteYamlString,
  rewriteNotePathReference,
  filterDeletedNoteTabs,
  isNotePathAffectedByTarget,
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

  it("quotes yaml strings through JSON escaping", () => {
    expect(quoteYamlString('title "x"')).toBe('"title \\"x\\""');
  });

  it("builds new note markdown with deterministic metadata", () => {
    expect(buildNewNoteMarkdown("Segment Tree", ["trick", "range query"], "2026-06-20T00:00:00.000Z")).toBe(
      '---\ntitle: "Segment Tree"\ntags: ["trick", "range query"]\ncreatedAt: "2026-06-20T00:00:00.000Z"\n---\n',
    );
    expect(buildNewNoteMarkdown("Untitled", [], "2026-06-20T00:00:00.000Z")).toContain("tags: []");
  });

  it("derives tree create parents", () => {
    expect(getSelectedTreeCreateParent("A/B", null)).toBe("A/B");
    expect(getSelectedTreeCreateParent(null, "A/B/note.md")).toBe("A/B");
    expect(getSelectedTreeCreateParent(null, "note.md")).toBe("");
    expect(getSelectedTreeCreateParent(null, null)).toBe("");
  });

  it("falls back new note create parent to current directory when tree has no selection", () => {
    expect(getDefaultNewNoteCreateParent(null, null, "current")).toBe("current");
    expect(getDefaultNewNoteCreateParent("A", null, "current")).toBe("A");
    expect(getDefaultNewNoteCreateParent(null, "A/note.md", "current")).toBe("A");
  });

  it("rewrites note path references for file and directory renames", () => {
    expect(rewriteNotePathReference("A/old.md", "A/old.md", "A/new.md", false)).toBe("A/new.md");
    expect(rewriteNotePathReference("A/other.md", "A/old.md", "A/new.md", false)).toBe("A/other.md");
    expect(rewriteNotePathReference("A/dir/note.md", "A/dir", "B/dir", true)).toBe("B/dir/note.md");
    expect(rewriteNotePathReference("A/dir2/note.md", "A/dir", "B/dir", true)).toBe("A/dir2/note.md");
  });

  it("detects paths affected by deleted files and directories", () => {
    expect(isNotePathAffectedByTarget("A/note.md", "A/note.md", false)).toBe(true);
    expect(isNotePathAffectedByTarget("A/other.md", "A/note.md", false)).toBe(false);
    expect(isNotePathAffectedByTarget("A/dir/note.md", "A/dir", true)).toBe(true);
    expect(isNotePathAffectedByTarget("A/dir2/note.md", "A/dir", true)).toBe(false);
  });

  it("filters tabs removed by file and directory deletion", () => {
    const tabs = ["A/dir/a.md", "A/dir/nested/b.md", "A/dir2/c.md", "A/root.md"];

    expect(filterDeletedNoteTabs(tabs, "A/dir/a.md", false)).toEqual([
      "A/dir/nested/b.md",
      "A/dir2/c.md",
      "A/root.md",
    ]);
    expect(filterDeletedNoteTabs(tabs, "A/dir", true)).toEqual([
      "A/dir2/c.md",
      "A/root.md",
    ]);
  });
});
