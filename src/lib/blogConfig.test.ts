import { describe, expect, it } from "vitest";
import { normalizeBlogConfigDraft } from "./blogConfig";

describe("blogConfig", () => {
  it("normalizes blog text fields for persistence", () => {
    expect(normalizeBlogConfigDraft({
      title: "  OI\nNotebook  ",
      subtitle: "\tTraining\r\nJournal\t",
    })).toEqual({
      title: "OI Notebook",
      subtitle: "Training Journal",
    });
  });
});
