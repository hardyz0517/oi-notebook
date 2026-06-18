import { SettingsPageLayout } from "../components/SettingsPageLayout";
import { ReadonlyPill } from "../primitives/ReadonlyPill";
import { SettingRow } from "../primitives/SettingRow";
import { SettingsCard, SettingsSection } from "../primitives/SettingsCard";

export function GeneralSettingsPage() {
  return (
    <SettingsPageLayout title="常规" description="OI Notebook 的基础偏好。">
      <SettingsSection title="常规">
        <SettingsCard>
          <SettingRow title="默认打开目标" description="启动后恢复上次工作区；未选择笔记时显示欢迎页。">
            <ReadonlyPill>自动恢复</ReadonlyPill>
          </SettingRow>
          <SettingRow title="语言" description="界面语言跟随当前应用构建。">
            <ReadonlyPill>自动检测</ReadonlyPill>
          </SettingRow>
        </SettingsCard>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
