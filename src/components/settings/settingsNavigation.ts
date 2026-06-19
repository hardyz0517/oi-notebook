import type {
  SettingsActiveLabel,
  SettingsCategory,
  SettingsGroupId,
  SettingsNavigationGroup,
  SettingsSection,
} from "./settingsTypes";

export const SETTINGS_TREE: SettingsNavigationGroup[] = [
  { id: "general", label: "常规", children: [{ id: "general-basics", label: "基础偏好" }] },
  { id: "appearance", label: "外观", children: [{ id: "appearance-theme", label: "主题" }] },
  {
    id: "ai",
    label: "AI",
    children: [
      { id: "ai-api", label: "模型与 API" },
      { id: "ai-local-notes", label: "本地笔记索引" },
      { id: "ai-web-search", label: "联网搜索" },
      { id: "ai-prompts", label: "提示词模板" },
    ],
  },
  {
    id: "luogu",
    label: "洛谷",
    children: [
      { id: "luogu-account", label: "账号配置" },
      { id: "luogu-rules", label: "导入规则" },
      { id: "luogu-import-center", label: "导入中心" },
    ],
  },
  {
    id: "blog",
    label: "博客",
    children: [
      { id: "blog-info", label: "博客信息" },
      { id: "blog-preview", label: "本地预览" },
      { id: "blog-tag-taxonomy", label: "标签体系" },
      { id: "blog-tag-manager", label: "标签管理器" },
    ],
  },
  { id: "data", label: "数据与存储", children: [{ id: "data-storage", label: "目录与缓存" }] },
  { id: "keyboard", label: "键盘快捷键", children: [{ id: "keyboard-shortcuts", label: "快捷键" }] },
  {
    id: "advanced",
    label: "高级 / 开发者",
    children: [
      { id: "advanced-developer", label: "开发者" },
      { id: "diagnostics-search", label: "搜索自检" },
    ],
  },
  {
    id: "about",
    label: "关于",
    children: [{ id: "about-version", label: "关于 OI Notebook" }],
  },
];

export const SETTINGS_SECTION_FALLBACK: Record<SettingsCategory, SettingsSection> = {
  general: "general-basics",
  appearance: "appearance-theme",
  ai: "ai-api",
  luogu: "luogu-account",
  blog: "blog-info",
  data: "data-storage",
  keyboard: "keyboard-shortcuts",
  advanced: "advanced-developer",
  about: "about-version",
  diagnostics: "diagnostics-search",
  editor: "about-version",
};

export const SETTINGS_SECTION_LABELS = SETTINGS_TREE.reduce(
  (labels, group) => {
    for (const child of group.children) {
      labels[child.id] = { group: group.label, groupId: group.id, section: child.label };
    }
    return labels;
  },
  {} as Record<SettingsSection, SettingsActiveLabel & { groupId: SettingsGroupId }>,
);
