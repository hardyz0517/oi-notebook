import { describe, expect, it } from "vitest";

import type { PrepareLuoguSubmissionNoteResult } from "@/lib/api";

import {
  getLuoguPreparedMarkdownUpdatePlan,
  getNextEditedLuoguPreparedMarkdownIds,
  getNextToggledLuoguIdSet,
  updateLuoguPreparedMarkdown,
} from "./useLuoguImportWorkflow";

function createPreparedNote(
  patch: Partial<PrepareLuoguSubmissionNoteResult> = {},
): PrepareLuoguSubmissionNoteResult {
  return {
    submissionId: "1001",
    problemId: "P1001",
    problemTitle: "A+B",
    difficulty: "入门",
    suggestedRelativePath: "Luogu/P1001.md",
    markdown: "# A+B",
    sourceCode: "print(1+1)",
    draftFallback: false,
    aiStatus: "organized",
    reason: null,
    existing: false,
    skipped: false,
    skipReason: null,
    ...patch,
  };
}

describe("useLuoguImportWorkflow helpers", () => {
  it("toggles ids without mutating the original set", () => {
    const current = new Set(["keep", "remove"]);

    const removed = getNextToggledLuoguIdSet(current, "remove");
    const added = getNextToggledLuoguIdSet(current, "add");

    expect(removed).toEqual(new Set(["keep"]));
    expect(added).toEqual(new Set(["keep", "remove", "add"]));
    expect(current).toEqual(new Set(["keep", "remove"]));
  });

  it("updates prepared markdown only when the prepared note exists and changes", () => {
    const preparedNotesById = {
      "1001": createPreparedNote(),
    };

    const unchanged = updateLuoguPreparedMarkdown(preparedNotesById, "1001", "# A+B");
    const missing = updateLuoguPreparedMarkdown(preparedNotesById, "missing", "# Missing");
    const changed = updateLuoguPreparedMarkdown(preparedNotesById, "1001", "# Changed");

    expect(unchanged).toBe(preparedNotesById);
    expect(missing).toBe(preparedNotesById);
    expect(changed).not.toBe(preparedNotesById);
    expect(changed["1001"].markdown).toBe("# Changed");
    expect(preparedNotesById["1001"].markdown).toBe("# A+B");
  });

  it("marks edited ids only for real markdown changes", () => {
    const preparedNotesById = {
      "1001": createPreparedNote(),
    };
    const editedIds = new Set(["already"]);

    expect(getNextEditedLuoguPreparedMarkdownIds(editedIds, preparedNotesById, "missing", "# Missing")).toBe(editedIds);
    expect(getNextEditedLuoguPreparedMarkdownIds(editedIds, preparedNotesById, "1001", "# A+B")).toBe(editedIds);
    expect(getNextEditedLuoguPreparedMarkdownIds(editedIds, preparedNotesById, "already", "# Changed")).toBe(editedIds);

    const next = getNextEditedLuoguPreparedMarkdownIds(editedIds, preparedNotesById, "1001", "# Changed");
    expect(next).toEqual(new Set(["already", "1001"]));
    expect(editedIds).toEqual(new Set(["already"]));
  });

  it("derives a consistent markdown update plan from one state snapshot", () => {
    const preparedNotesById = {
      "1001": createPreparedNote(),
    };
    const editedPreparedMarkdownIds = new Set<string>();

    const plan = getLuoguPreparedMarkdownUpdatePlan({
      preparedNotesById,
      editedPreparedMarkdownIds,
      submissionId: "1001",
      markdown: "# Changed",
    });

    expect(plan.preparedNotesById["1001"].markdown).toBe("# Changed");
    expect(plan.editedPreparedMarkdownIds).toEqual(new Set(["1001"]));
    expect(preparedNotesById["1001"].markdown).toBe("# A+B");
    expect(editedPreparedMarkdownIds).toEqual(new Set());
  });
});
