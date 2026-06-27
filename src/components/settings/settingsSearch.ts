import type { SettingsNavigationGroup } from "./settingsTypes";
import { SETTINGS_REGISTRY_PAGES } from "./settingsRegistry";

function normalizeSettingsSearchText(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}

export function filterSettingsTreeByQuery(
  tree: SettingsNavigationGroup[],
  query: string,
): SettingsNavigationGroup[] {
  const normalizedQuery = normalizeSettingsSearchText(query);
  if (!normalizedQuery) return tree;

  const pagesById = new Map(SETTINGS_REGISTRY_PAGES.map((page) => [page.id, page]));

  return tree
    .map((group) => {
      const groupMatches = normalizeSettingsSearchText(group.label).includes(normalizedQuery);
      const children = group.children.filter((child) => {
        const page = pagesById.get(child.id);
        const terms = [group.label, child.label, ...(page?.keywords ?? [])];
        return terms.some((term) => normalizeSettingsSearchText(term).includes(normalizedQuery));
      });

      return groupMatches ? group : { ...group, children };
    })
    .filter((group) => group.children.length > 0);
}

export const filterSettingsTree = filterSettingsTreeByQuery;
