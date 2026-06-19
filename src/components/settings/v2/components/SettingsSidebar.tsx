import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NavItem } from "@/components/ui/nav-item";

import type { SettingsGroupId, SettingsNavigationGroup } from "../../settingsTypes";
import { SETTINGS_V2_GROUPS, SETTINGS_V2_ICONS } from "../settingsNav";
import { SettingsSearchBox } from "./SettingsSearchBox";

export function SettingsSidebar({
  tree,
  activeGroupId,
  searchQuery,
  onSearchQueryChange,
  onClose,
  onOpenGroup,
}: {
  tree: SettingsNavigationGroup[];
  activeGroupId: SettingsGroupId;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onClose: () => void;
  onOpenGroup: (groupId: SettingsGroupId) => void;
}) {
  const groupsById = new Map(tree.map((group) => [group.id, group]));
  const visibleGroups = SETTINGS_V2_GROUPS
    .map((section) => ({
      ...section,
      items: section.items.map((id) => groupsById.get(id)).filter((group): group is SettingsNavigationGroup => Boolean(group)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="settings-v2-sidebar">
      <Button type="button" variant="ghost" size="compact" className="settings-v2-back" onClick={onClose}>
        <ArrowLeft className="h-4 w-4" />
        <span>返回应用</span>
      </Button>

      <SettingsSearchBox value={searchQuery} onChange={onSearchQueryChange} />

      <nav className="settings-v2-nav" aria-label="设置导航">
        {visibleGroups.map((section) => (
          <div key={section.title} className="settings-v2-nav-section">
            <div className="settings-v2-nav-heading">{section.title}</div>
            <div className="settings-v2-nav-items">
              {section.items.map((group) => {
                const Icon = SETTINGS_V2_ICONS[group.id];
                const isActive = activeGroupId === group.id;
                return (
                  <NavItem
                    key={group.id}
                    icon={Icon}
                    label={group.label}
                    selected={isActive}
                    className="settings-v2-nav-item"
                    onClick={() => onOpenGroup(group.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
