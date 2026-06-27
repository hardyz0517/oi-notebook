import type {
  SettingsActiveLabel,
  SettingsCategory,
  SettingsGroupId,
  SettingsNavigationGroup,
  SettingsSection,
} from "./settingsTypes";
import { SETTINGS_REGISTRY_GROUPS, SETTINGS_REGISTRY_PAGES } from "./settingsRegistry";

export const SETTINGS_TREE: SettingsNavigationGroup[] = SETTINGS_REGISTRY_GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  developerOnly: group.developerOnly,
  children: SETTINGS_REGISTRY_PAGES
    .filter((page) => page.groupId === group.id)
    .map((page) => ({ id: page.id, label: page.label })),
}));

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

export const SETTINGS_SECTION_LABELS = SETTINGS_REGISTRY_PAGES.reduce(
  (labels, page) => {
    const group = SETTINGS_REGISTRY_GROUPS.find((registryGroup) => registryGroup.id === page.groupId);
    if (group) {
      labels[page.id] = { group: group.label, groupId: group.id, section: page.label };
    }
    return labels;
  },
  {} as Record<SettingsSection, SettingsActiveLabel & { groupId: SettingsGroupId }>,
);
