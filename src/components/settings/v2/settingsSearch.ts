import type { SettingsNavigationGroup } from "../settingsTypes";

export function filterSettingsTree(tree: SettingsNavigationGroup[], query: string): SettingsNavigationGroup[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return tree;

  return tree.filter((group) => group.label.toLowerCase().includes(normalizedQuery));
}
