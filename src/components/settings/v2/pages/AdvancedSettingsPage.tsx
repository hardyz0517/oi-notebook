import { SettingRow } from "../components/SettingRow";
import { SettingsCard, SettingsSection } from "../components/SettingsCard";
import { SettingsPageLayout } from "../components/SettingsPageLayout";
import { SettingsButton } from "../primitives/SettingsButton";
import { ToggleSwitch } from "../components/ToggleSwitch";

export function AdvancedSettingsPage({
  embedded = false,
  developerModeEnabled,
  onToggleDeveloperMode,
  onOpenSearchDiagnostics,
}: {
  embedded?: boolean;
  developerModeEnabled: boolean;
  onToggleDeveloperMode: () => void;
  onOpenSearchDiagnostics: () => void;
}) {
  return (
    <SettingsPageLayout title="高级" description="诊断与开发者功能。普通使用通常不需要修改这些设置。" embedded={embedded}>
      <SettingsSection title="开发者">
        <SettingsCard>
          <SettingRow title="开发者模式" description="显示诊断、自检和底层调试入口。">
            <ToggleSwitch checked={developerModeEnabled} ariaLabel="开发者模式" onChange={() => onToggleDeveloperMode()} />
          </SettingRow>
          <SettingRow title="Research Engine / 搜索诊断" description="查看联网搜索、自检和证据链诊断信息。">
            <SettingsButton onClick={onOpenSearchDiagnostics}>
              打开诊断
            </SettingsButton>
          </SettingRow>
        </SettingsCard>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
