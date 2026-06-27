import type { SettingsGroupId, SettingsSection } from "./settingsTypes";

export interface SettingsRegistryGroup {
  id: SettingsGroupId;
  label: string;
  developerOnly?: boolean;
}

export interface SettingsRegistryPage {
  id: SettingsSection;
  groupId: SettingsGroupId;
  label: string;
  keywords: string[];
}

export const SETTINGS_REGISTRY_GROUPS: SettingsRegistryGroup[] = [
  { id: "general", label: "常规" },
  { id: "appearance", label: "外观" },
  { id: "ai", label: "AI" },
  { id: "luogu", label: "洛谷" },
  { id: "blog", label: "博客" },
  { id: "data", label: "数据与存储" },
  { id: "keyboard", label: "键盘快捷键" },
  { id: "advanced", label: "高级 / 开发者" },
  { id: "about", label: "关于" },
];

export const SETTINGS_REGISTRY_PAGES: SettingsRegistryPage[] = [
  { id: "general-basics", groupId: "general", label: "基础偏好", keywords: ["常规", "基础", "偏好"] },
  { id: "appearance-theme", groupId: "appearance", label: "主题", keywords: ["外观", "主题", "颜色", "字体", "浅色", "深色"] },
  { id: "ai-api", groupId: "ai", label: "模型与 API", keywords: ["AI", "模型", "API", "供应商"] },
  { id: "ai-local-notes", groupId: "ai", label: "本地笔记索引", keywords: ["AI", "索引", "本地笔记", "搜索"] },
  { id: "ai-web-search", groupId: "ai", label: "联网搜索", keywords: ["AI", "搜索", "网页", "缓存"] },
  { id: "ai-prompts", groupId: "ai", label: "提示词模板", keywords: ["AI", "提示词", "模板"] },
  { id: "luogu-account", groupId: "luogu", label: "账号配置", keywords: ["洛谷", "账号", "Cookie"] },
  { id: "luogu-rules", groupId: "luogu", label: "导入规则", keywords: ["洛谷", "规则", "AC", "题号"] },
  { id: "luogu-import-center", groupId: "luogu", label: "导入中心", keywords: ["洛谷", "导入", "提交"] },
  { id: "blog-info", groupId: "blog", label: "博客信息", keywords: ["博客", "标题", "副标题"] },
  { id: "blog-preview", groupId: "blog", label: "本地预览", keywords: ["博客", "预览", "服务"] },
  { id: "blog-tag-taxonomy", groupId: "blog", label: "标签体系", keywords: ["博客", "标签", "体系"] },
  { id: "blog-tag-manager", groupId: "blog", label: "标签管理器", keywords: ["博客", "标签", "管理"] },
  { id: "data-storage", groupId: "data", label: "目录与缓存", keywords: ["数据", "存储", "目录", "缓存"] },
  { id: "keyboard-shortcuts", groupId: "keyboard", label: "快捷键", keywords: ["键盘", "快捷键"] },
  { id: "advanced-developer", groupId: "advanced", label: "开发者", keywords: ["高级", "开发者", "诊断"] },
  { id: "diagnostics-search", groupId: "advanced", label: "搜索自检", keywords: ["诊断", "搜索", "自检"] },
  { id: "about-version", groupId: "about", label: "关于 OI Notebook", keywords: ["关于", "版本", "Markdown"] },
];
