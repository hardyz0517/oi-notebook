import type { BlogConfig } from "@/lib/api";

export function normalizeBlogConfigDraft(config: BlogConfig): BlogConfig {
  const normalizeText = (value: string) => value.replace(/[\r\n]+/g, " ").trim();
  return {
    title: normalizeText(config.title),
    subtitle: normalizeText(config.subtitle),
  };
}
