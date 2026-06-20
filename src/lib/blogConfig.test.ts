import { describe, expect, it } from "vitest";
import { DEFAULT_BLOG_CONFIG, normalizeBlogConfigDraft } from "./blogConfig";

describe("blogConfig", () => {
  it("exposes the default blog identity used by app drafts", () => {
    expect(DEFAULT_BLOG_CONFIG).toEqual({
      title: "OI Notebook",
      subtitle: "一本地算法笔记与题解博客",
    });
  });

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
