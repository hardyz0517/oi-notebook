import { describe, expect, it } from "vitest";
import {
  buildNewNoteMarkdown,
  buildRenameNotePath,
  getCreateFolderPlan,
  getCreateNotePlan,
  getCreateFolderDialogInitialState,
  getClosedNoteDialogState,
  getFolderDialogState,
  findEntryCaseInsensitive,
  getCurrentNoteDirectory,
  getDefaultNewNoteCreateParent,
  getNoteDirectories,
  getRenameNotePlan,
  getRenameDialogInitialState,
  getSelectedTreeCreateParent,
  getTreeSelectionAfterClear,
  getTreeSelectionAfterFileSelect,
  getTreeSelectionAfterDirectorySelect,
  getTreeSelectionAfterRootSelect,
  getTreeInlineCreateState,
  normalizeCustomNoteDirectory,
  quoteYamlString,
  removeDeletedNoteWorkspaceReferences,
  rewriteNotePathReference,
  filterDeletedNoteTabs,
  rewriteNoteWorkspaceReferences,
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

  it("builds rename target paths in the original directory", () => {
    expect(buildRenameNotePath("A/old.md", "new", false)).toBe("A/new.md");
    expect(buildRenameNotePath("old.md", "new.md", false)).toBe("new.md");
    expect(buildRenameNotePath("A/old-folder", "new-folder", true)).toBe("A/new-folder");
  });

  it("derives rename dialog initial state", () => {
    expect(getRenameDialogInitialState("A/old.md")).toEqual({
      dialogMode: "rename",
      dialogValue: "old",
      renameTarget: "A/old.md",
      renameTargetIsDirectory: false,
    });
    expect(getRenameDialogInitialState("A/old-folder", true)).toEqual({
      dialogMode: "rename",
      dialogValue: "old-folder",
      renameTarget: "A/old-folder",
      renameTargetIsDirectory: true,
    });
  });

  it("derives create-folder dialog initial state from the active dialog", () => {
    expect(getCreateFolderDialogInitialState("create", "custom/path", "current/path")).toEqual({
      returnToCreateAfterFolder: true,
      dialogMode: "create-folder",
      dialogValue: "",
      folderParentDirectory: "custom/path",
    });
    expect(getCreateFolderDialogInitialState(null, "custom/path", "current/path")).toEqual({
      returnToCreateAfterFolder: false,
      dialogMode: "create-folder",
      dialogValue: "",
      folderParentDirectory: "current/path",
    });
  });

  it("derives closed note dialog reset state", () => {
    expect(getClosedNoteDialogState()).toEqual({
      dialogMode: null,
      dialogValue: "",
      newNoteLocationOption: "current",
      newNoteCustomDirectory: "",
      newNoteTags: [],
      folderParentDirectory: "",
      returnToCreateAfterFolder: false,
      renameTarget: null,
      renameTargetIsDirectory: false,
    });
  });

  it("derives create-folder dialog validation state", () => {
    expect(getFolderDialogState("create-folder", "Algo", "tricks/dp")).toEqual({
      nameValidationMessage: null,
      parentValidationMessage: null,
      helpText: "名称不能包含路径穿越或 Windows 非法字符",
      canConfirm: true,
    });

    expect(getFolderDialogState("create-folder", "bad/name", "")).toEqual({
      nameValidationMessage: 'Name cannot contain Windows reserved characters < > : " / \\ | ? *',
      parentValidationMessage: null,
      helpText: 'Name cannot contain Windows reserved characters < > : " / \\ | ? *',
      canConfirm: false,
    });

    expect(getFolderDialogState("create-folder", "Algo", "bad//path")).toEqual({
      nameValidationMessage: null,
      parentValidationMessage: "Directory cannot contain empty path segments",
      helpText: "Directory cannot contain empty path segments",
      canConfirm: false,
    });
  });

  it("keeps folder dialog confirmation disabled outside create-folder mode", () => {
    expect(getFolderDialogState("rename", "Algo", "tricks")).toEqual({
      nameValidationMessage: null,
      parentValidationMessage: null,
      helpText: "名称不能包含路径穿越或 Windows 非法字符",
      canConfirm: false,
    });
  });

  it("finds entries case-insensitively by kind", () => {
    expect(findEntryCaseInsensitive(files, "a/note.md", false)?.path).toBe("A/note.md");
    expect(findEntryCaseInsensitive(files, "a", true)?.path).toBe("A");
    expect(findEntryCaseInsensitive(files, "a", false)).toBeUndefined();
  });

  it("builds create note plans with validation and conflicts", () => {
    expect(getCreateNotePlan(files, "A", "New Note")).toEqual({
      path: "A/New Note.md",
      title: "New Note",
      error: null,
    });
    expect(getCreateNotePlan(files, "A", "note.md")).toEqual({
      path: "A/note.md",
      title: "note",
      error: "同目录已存在同名笔记",
    });
    expect(getCreateNotePlan(files, "bad//path", "New")).toEqual({
      path: "",
      title: "",
      error: "Directory cannot contain empty path segments",
    });
  });

  it("builds create folder plans with validation and sibling conflicts", () => {
    expect(getCreateFolderPlan(files, "A", "child")).toEqual({
      path: "A/child",
      error: null,
    });
    expect(getCreateFolderPlan(files, "", "a")).toEqual({
      path: "a",
      error: "同目录已存在同名文件夹",
    });
    expect(getCreateFolderPlan(files, "A", "note")).toEqual({
      path: "A/note",
      error: "同目录已存在同名笔记",
    });
  });

  it("builds rename plans with no-op and sibling conflicts", () => {
    expect(getRenameNotePlan(files, "A/note.md", "renamed", false)).toEqual({
      path: "A/renamed.md",
      shouldClose: false,
      error: null,
    });
    expect(getRenameNotePlan(files, "A/note.md", "note", false)).toEqual({
      path: "A/note.md",
      shouldClose: true,
      error: null,
    });
    expect(getRenameNotePlan(files, "b", "A", true)).toEqual({
      path: "A",
      shouldClose: false,
      error: "同目录已存在同名文件夹",
    });
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

  it("derives tree selection state from file tree actions", () => {
    expect(getTreeSelectionAfterDirectorySelect("A/B")).toEqual({
      activeTreeDirectoryPath: "A/B",
      activeTreeFilePath: null,
    });
    expect(getTreeSelectionAfterFileSelect("A/B/note.md")).toEqual({
      activeTreeDirectoryPath: null,
      activeTreeFilePath: "A/B/note.md",
    });
    expect(getTreeSelectionAfterClear()).toEqual({
      activeTreeDirectoryPath: null,
      activeTreeFilePath: null,
    });
    expect(getTreeSelectionAfterRootSelect()).toEqual({
      activeTreeDirectoryPath: "",
      activeTreeFilePath: null,
    });
  });

  it("derives inline create state for the file tree", () => {
    expect(getTreeInlineCreateState("file", "A/B", 123)).toEqual({
      isTreeRootCollapsed: false,
      createFileRequest: { parentPath: "A/B", requestId: 123 },
      createFolderRequest: null,
    });
    expect(getTreeInlineCreateState("folder", "", 456)).toEqual({
      isTreeRootCollapsed: false,
      createFileRequest: null,
      createFolderRequest: { parentPath: "", requestId: 456 },
    });
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

  it("removes workspace references affected by deleted files and directories", () => {
    expect(
      removeDeletedNoteWorkspaceReferences(
        {
          openTabPaths: ["A/dir/a.md", "A/dir2/b.md", "A/root.md"],
          currentFilePath: "A/dir/a.md",
          activeWorkspaceTabId: "note:A/dir/a.md",
          activeWorkingCopyId: "note:A/dir/a.md",
          activeTreeDirectoryPath: "A/dir",
          activeTreeFilePath: "A/dir/nested/b.md",
        },
        "A/dir",
        true,
      ),
    ).toEqual({
      openTabPaths: ["A/dir2/b.md", "A/root.md"],
      currentFilePath: null,
      activeWorkspaceTabId: null,
      activeWorkingCopyId: null,
      activeTreeDirectoryPath: null,
      activeTreeFilePath: null,
      shouldClearDirty: true,
    });

    expect(
      removeDeletedNoteWorkspaceReferences(
        {
          openTabPaths: ["A/dir/a.md", "A/root.md"],
          currentFilePath: "A/root.md",
          activeWorkspaceTabId: "note:A/root.md",
          activeWorkingCopyId: "note:A/root.md",
          activeTreeDirectoryPath: "A/dir",
          activeTreeFilePath: "A/dir/a.md",
        },
        "A/dir/a.md",
        false,
      ),
    ).toEqual({
      openTabPaths: ["A/root.md"],
      currentFilePath: "A/root.md",
      activeWorkspaceTabId: "note:A/root.md",
      activeWorkingCopyId: "note:A/root.md",
      activeTreeDirectoryPath: "A/dir",
      activeTreeFilePath: null,
      shouldClearDirty: false,
    });
  });

  it("rewrites workspace path references for a directory rename", () => {
    expect(
      rewriteNoteWorkspaceReferences(
        {
          openTabPaths: ["A/dir/a.md", "A/dir2/b.md"],
          pendingFileSelection: { path: "A/dir/a.md", previousPath: "keep" },
          pendingAssetsByFile: {
            "A/dir/a.md": ["a.png"],
            "A/dir/nested/b.md": ["b.png"],
            "A/dir2/c.md": ["c.png"],
          },
          openReviewTabs: [
            { id: "review-1", notePath: "A/dir/a.md" },
            { id: "review-2", notePath: "A/dir2/b.md" },
          ],
          currentFilePath: "A/dir/a.md",
          activeWorkspaceTabId: "note:A/dir/a.md",
          activeWorkingCopyId: "note:A/dir/a.md",
          activeTreeDirectoryPath: "A/dir",
          activeTreeFilePath: "A/dir/nested/b.md",
          savedSnapshotPath: "A/dir/a.md",
        },
        "A/dir",
        "B/dir",
        true,
      ),
    ).toEqual({
      openTabPaths: ["B/dir/a.md", "A/dir2/b.md"],
      pendingFileSelection: { path: "B/dir/a.md", previousPath: "keep" },
      pendingAssetsByFile: {
        "B/dir/a.md": ["a.png"],
        "B/dir/nested/b.md": ["b.png"],
        "A/dir2/c.md": ["c.png"],
      },
      openReviewTabs: [
        { id: "review-1", notePath: "B/dir/a.md" },
        { id: "review-2", notePath: "A/dir2/b.md" },
      ],
      currentFilePath: "B/dir/a.md",
      activeWorkspaceTabId: "note:B/dir/a.md",
      activeWorkingCopyId: "note:B/dir/a.md",
      activeTreeDirectoryPath: "B/dir",
      activeTreeFilePath: "B/dir/nested/b.md",
      savedSnapshotPath: "B/dir/a.md",
    });
  });

  it("merges pending asset buckets when a rename collides with an existing reference", () => {
    expect(
      rewriteNoteWorkspaceReferences(
        {
          openTabPaths: [],
          pendingFileSelection: null,
          pendingAssetsByFile: {
            "A/old.md": ["old.png"],
            "A/new.md": ["new.png"],
          },
          openReviewTabs: [],
          currentFilePath: null,
          activeWorkspaceTabId: null,
          activeWorkingCopyId: null,
          activeTreeDirectoryPath: null,
          activeTreeFilePath: null,
          savedSnapshotPath: null,
        },
        "A/old.md",
        "A/new.md",
        false,
      ).pendingAssetsByFile,
    ).toEqual({
      "A/new.md": ["old.png", "new.png"],
    });
  });
});
