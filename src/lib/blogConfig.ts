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
