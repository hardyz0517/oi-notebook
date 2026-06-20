import { describe, expect, it } from "vitest";
import { buildBlogConfigSaveDraft, DEFAULT_BLOG_CONFIG, deriveBlogSettingsView, normalizeBlogConfigDraft, resolveBlogConfigDraft } from "./blogConfig";

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
  it("derives idle blog settings view state", () => {
    expect(deriveBlogSettingsView({
      isLoadingBlogConfig: false,
      isSavingBlogConfig: false,
      isRestartingBlog: false,
    })).toEqual({
      isConfigBusy: false,
      areFieldsDisabled: false,
      isSaveDisabled: false,
      saveButtonLabel: "保存博客信息",
      isRestartDisabled: false,
      restartButtonLabel: "重启博客",
      openButtonLabel: "打开博客",
    });
  });

  it("derives loading blog settings view state", () => {
    expect(deriveBlogSettingsView({
      isLoadingBlogConfig: true,
      isSavingBlogConfig: false,
      isRestartingBlog: false,
    })).toMatchObject({
      isConfigBusy: true,
      areFieldsDisabled: true,
      isSaveDisabled: true,
      saveButtonLabel: "保存博客信息",
    });
  });

  it("derives saving blog settings view state", () => {
    expect(deriveBlogSettingsView({
      isLoadingBlogConfig: false,
      isSavingBlogConfig: true,
      isRestartingBlog: false,
    })).toMatchObject({
      isConfigBusy: true,
      areFieldsDisabled: true,
      isSaveDisabled: true,
      saveButtonLabel: "保存中...",
    });
  });

  it("derives restarting blog settings view state", () => {
    expect(deriveBlogSettingsView({
      isLoadingBlogConfig: false,
      isSavingBlogConfig: false,
      isRestartingBlog: true,
    })).toMatchObject({
      isRestartDisabled: true,
      restartButtonLabel: "重启中...",
    });
  });
});
