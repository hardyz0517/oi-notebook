import { describe, expect, it } from "vitest";
import { buildBlogConfigSaveDraft, DEFAULT_BLOG_CONFIG, normalizeBlogConfigDraft, resolveBlogConfigDraft } from "./blogConfig";

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

  it("resolves partial loaded config with app defaults", () => {
    expect(resolveBlogConfigDraft({ title: "", subtitle: "Custom" })).toEqual({
      title: DEFAULT_BLOG_CONFIG.title,
      subtitle: "Custom",
    });
    expect(resolveBlogConfigDraft(null)).toEqual(DEFAULT_BLOG_CONFIG);
  });

  it("builds a validated save draft", () => {
    expect(buildBlogConfigSaveDraft({
      title: "  Training\nLog ",
      subtitle: "  Week\r\nNotes ",
    })).toEqual({
      ok: true,
      config: {
        title: "Training Log",
        subtitle: "Week Notes",
      },
    });

    expect(buildBlogConfigSaveDraft({ title: "\n\t", subtitle: "x" })).toEqual({
      ok: false,
      error: "博客标题不能为空。",
    });
  });
});
