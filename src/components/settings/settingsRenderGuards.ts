import type { SettingsActiveLabel, SettingsGroupId, SettingsSection, SettingsTarget } from "./settingsTypes";

type SettingsSectionLabels = Record<SettingsSection, SettingsActiveLabel & { groupId: SettingsGroupId }>;

export function getSettingsTargetGroupId(
  activePageKey: SettingsSection,
  activeTarget: SettingsTarget,
  sectionLabels: SettingsSectionLabels,
): SettingsGroupId | undefined {
  return activeTarget.type === "category"
    ? activeTarget.category
    : sectionLabels[activePageKey]?.groupId;
}

export function shouldRenderSettingsPage(
  pageKey: SettingsSection,
  activePageKey: SettingsSection,
  activeTarget: SettingsTarget,
  sectionLabels: SettingsSectionLabels,
): boolean {
  const activeGroupId = getSettingsTargetGroupId(activePageKey, activeTarget, sectionLabels);
  return sectionLabels[pageKey]?.groupId === activeGroupId;
}

export function shouldRenderSettingsGroup(
  groupId: SettingsGroupId,
  activePageKey: SettingsSection,
  activeTarget: SettingsTarget,
  sectionLabels: SettingsSectionLabels,
): boolean {
  return getSettingsTargetGroupId(activePageKey, activeTarget, sectionLabels) === groupId;
}
