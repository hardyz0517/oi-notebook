import { SettingRow } from "../components/SettingRow";
import { SettingsCard, SettingsSection } from "../components/SettingsCard";
import { SettingsPageLayout } from "../components/SettingsPageLayout";

export function KeyboardSettingsPage() {
  return (
    <SettingsPageLayout title="键盘快捷键" description="当前快捷键只展示，不在此处编辑。">
      <SettingsSection title="快捷键">
        <SettingsCard>
          <SettingRow title="快速记笔" description="打开 quick-note 窗口。">
            <kbd className="settings-v2-kbd">Ctrl+Alt+Space</kbd>
          </SettingRow>
          <SettingRow title="快捷键冲突降级" description="如果快捷键被系统或其它应用占用，OI Notebook 仍会正常启动，只禁用该快捷键。">
            <span className="settings-v2-readonly-value">已启用</span>
          </SettingRow>
        </SettingsCard>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
