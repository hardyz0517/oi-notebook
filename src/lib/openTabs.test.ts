import { describe, expect, it } from "vitest";

import {
  buildOpenFileTabs,
  filterValidOpenTabPaths,
  getNextOpenTabPathAfterClose,
  parseStoredOpenTabPaths,
  parseStoredOpenTabsActivePath,
  serializeOpenTabPaths,
} from "./openTabs";
import { createExternalWorkingCopy, createNoteWorkingCopy, createUntitledWorkingCopy } from "./workingCopies";
import type { NoteFileInfo } from "@/types/note";

const files: NoteFileInfo[] = [
  {
    path: "a.md",
    name: "a.md",
    isDirectory: false,
    displayTitle: "Alpha",
    modified: "2026-01-01T00:00:00+00:00",
  },
  {
    path: "b.md",
    name: "b.md",
    isDirectory: false,
    modified: "2026-01-02T00:00:00+00:00",
  },
];

describe("openTabs", () => {
  it("parses stored tab paths defensively with trimming and de-duplication", () => {
    expect(parseStoredOpenTabPaths(JSON.stringify([" a.md ", "", "a.md", 1, "b.md"]))).toEqual(["a.md", "b.md"]);
    expect(parseStoredOpenTabPaths("{bad json")).toEqual([]);
    expect(parseStoredOpenTabPaths(JSON.stringify({ path: "a.md" }))).toEqual([]);
  });

  it("parses and serializes active tab paths", () => {
    expect(parseStoredOpenTabsActivePath("  a.md  ")).toBe("a.md");
    expect(parseStoredOpenTabsActivePath("   ")).toBeNull();
    expect(serializeOpenTabPaths([" a.md ", "a.md", "b.md"])).toBe(JSON.stringify(["a.md", "b.md"]));
  });

  it("filters restored paths against currently valid notes", () => {
    expect(filterValidOpenTabPaths(["a.md", "missing.md", "b.md"], new Set(["a.md", "b.md"]))).toEqual(["a.md", "b.md"]);
  });

  it("builds visible file tabs from working copies and persisted note tabs", () => {
    const noteA = createNoteWorkingCopy("a.md", "a.md", { frontmatterPrefix: "", markdown: "" });
    const noteB = createNoteWorkingCopy("b.md", "b.md", { frontmatterPrefix: "", markdown: "" });
    const external = createExternalWorkingCopy("C:/tmp/outside.md", "outside.md", { frontmatterPrefix: "", markdown: "" });
    const untitled = createUntitledWorkingCopy(1);

    const tabs = buildOpenFileTabs(
      {
        [noteA.id]: noteA,
        [noteB.id]: noteB,
        [external.id]: external,
        [untitled.id]: untitled,
      },
      ["a.md"],
      files,
    );

    expect(tabs.map((tab) => [tab.id, tab.displayName])).toEqual([
      [noteA.id, "Alpha"],
      [external.id, "outside.md"],
      [untitled.id, "Untitled-1"],
    ]);
  });

  it("selects the next right tab, then previous tab, after closing a note tab", () => {
    const tabs = [
      { kind: "file" as const, id: "note:a.md", path: "a.md", displayName: "a" },
      { kind: "file" as const, id: "note:b.md", path: "b.md", displayName: "b" },
      { kind: "file" as const, id: "note:c.md", path: "c.md", displayName: "c" },
    ];

    expect(getNextOpenTabPathAfterClose(tabs, "b.md")).toBe("c.md");
    expect(getNextOpenTabPathAfterClose(tabs, "c.md")).toBe("b.md");
    expect(getNextOpenTabPathAfterClose([tabs[0]], "a.md")).toBeNull();
  });
});
