import type { BlogConfig } from "@/lib/api";

export const DEFAULT_BLOG_CONFIG: BlogConfig = {
  title: "OI Notebook",
  subtitle: "一本地算法笔记与题解博客",
};

export function normalizeBlogConfigDraft(config: BlogConfig): BlogConfig {
  const normalizeText = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
  return {
    title: normalizeText(config.title),
    subtitle: normalizeText(config.subtitle),
  };
}

export function resolveBlogConfigDraft(config: Partial<BlogConfig> | null | undefined): BlogConfig {
  const title = config?.title?.trim() ? config.title : DEFAULT_BLOG_CONFIG.title;
  const subtitle = config?.subtitle?.trim() ? config.subtitle : DEFAULT_BLOG_CONFIG.subtitle;
  return normalizeBlogConfigDraft({ title, subtitle });
}

export type BlogConfigSaveDraftResult =
  | { ok: true; config: BlogConfig }
  | { ok: false; error: string };

export function buildBlogConfigSaveDraft(config: BlogConfig): BlogConfigSaveDraftResult {
  const normalizedConfig = normalizeBlogConfigDraft(config);
  if (!normalizedConfig.title) {
    return { ok: false, error: "博客标题不能为空。" };
  }
  return { ok: true, config: normalizedConfig };
}

export interface BlogSettingsViewInput {
  isLoadingBlogConfig: boolean;
  isSavingBlogConfig: boolean;
  isRestartingBlog: boolean;
}

export interface BlogSettingsView {
  isConfigBusy: boolean;
  areFieldsDisabled: boolean;
  isSaveDisabled: boolean;
  saveButtonLabel: string;
  isOpenDisabled: boolean;
  isBlogOperationBusy: boolean;
  isRestartDisabled: boolean;
  restartButtonLabel: string;
  openButtonLabel: string;
}

export function deriveBlogSettingsView(input: BlogSettingsViewInput): BlogSettingsView {
  const isConfigBusy = input.isLoadingBlogConfig || input.isSavingBlogConfig;

  return {
    isConfigBusy,
    areFieldsDisabled: isConfigBusy,
    isSaveDisabled: isConfigBusy,
    saveButtonLabel: input.isSavingBlogConfig ? "保存中..." : "保存博客信息",
    isOpenDisabled: false,
    isBlogOperationBusy: input.isRestartingBlog,
    isRestartDisabled: input.isRestartingBlog,
    restartButtonLabel: input.isRestartingBlog ? "重启中..." : "重启博客",
    openButtonLabel: "打开博客",
  };
}
