import { describe, expect, it } from "vitest";
import type { SettingsActiveLabel, SettingsGroupId, SettingsSection } from "./settingsTypes";
import {
  getSettingsTargetGroupId,
  shouldRenderSettingsGroup,
  shouldRenderSettingsPage,
} from "./settingsRenderGuards";

const labels: Record<SettingsSection, SettingsActiveLabel & { groupId: SettingsGroupId }> = {
  "general-basics": { group: "通用", section: "基础", groupId: "general" },
  "appearance-theme": { group: "外观", section: "主题", groupId: "appearance" },
  "ai-api": { group: "AI", section: "API", groupId: "ai" },
  "ai-local-notes": { group: "AI", section: "本地笔记", groupId: "ai" },
  "ai-web-search": { group: "AI", section: "联网搜索", groupId: "ai" },
  "ai-prompts": { group: "AI", section: "提示词", groupId: "ai" },
  "luogu-account": { group: "洛谷", section: "账号", groupId: "luogu" },
  "luogu-rules": { group: "洛谷", section: "规则", groupId: "luogu" },
  "luogu-import-center": { group: "洛谷", section: "导入中心", groupId: "luogu" },
  "blog-tag-taxonomy": { group: "博客", section: "标签体系", groupId: "blog" },
  "blog-tag-manager": { group: "博客", section: "标签管理器", groupId: "blog" },
  "blog-info": { group: "博客", section: "信息", groupId: "blog" },
  "blog-preview": { group: "博客", section: "预览", groupId: "blog" },
  "data-storage": { group: "数据", section: "存储", groupId: "data" },
  "keyboard-shortcuts": { group: "快捷键", section: "快捷键", groupId: "keyboard" },
  "advanced-developer": { group: "高级", section: "开发者", groupId: "advanced" },
  "about-version": { group: "关于", section: "版本", groupId: "about" },
  "about-markdown": { group: "关于", section: "Markdown", groupId: "about" },
  "about-privacy": { group: "关于", section: "隐私", groupId: "about" },
  "diagnostics-search": { group: "诊断", section: "搜索", groupId: "diagnostics" },
};

describe("settingsRenderGuards", () => {
  it("uses explicit category targets before the active page group", () => {
    expect(getSettingsTargetGroupId("ai-api", { type: "category", category: "blog" }, labels)).toBe("blog");
  });

  it("falls back to the active page group for page targets", () => {
    expect(getSettingsTargetGroupId("luogu-rules", { type: "page", page: "luogu-rules" }, labels)).toBe("luogu");
  });

  it("renders all pages in the active group and hides other groups", () => {
    expect(shouldRenderSettingsPage("blog-info", "blog-preview", { type: "page", page: "blog-preview" }, labels)).toBe(true);
    expect(shouldRenderSettingsPage("blog-tag-taxonomy", "blog-preview", { type: "page", page: "blog-preview" }, labels)).toBe(true);
    expect(shouldRenderSettingsPage("luogu-account", "blog-preview", { type: "page", page: "blog-preview" }, labels)).toBe(false);
  });

  it("renders settings groups by the derived target group", () => {
    expect(shouldRenderSettingsGroup("ai", "general-basics", { type: "category", category: "ai" }, labels)).toBe(true);
    expect(shouldRenderSettingsGroup("general", "general-basics", { type: "category", category: "ai" }, labels)).toBe(false);
  });
});
