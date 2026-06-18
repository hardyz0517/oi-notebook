import { SettingRow } from "../components/SettingRow";
import { SettingsCard, SettingsSection } from "../components/SettingsCard";
import { SettingsPageLayout } from "../components/SettingsPageLayout";

export function AboutSettingsPage({ capabilities }: { capabilities: string[] }) {
  return (
    <SettingsPageLayout title="关于" description="版本、Markdown 能力和本地数据说明。">
      <SettingsSection title="应用">
        <SettingsCard>
          <SettingRow title="版本">
            <span className="settings-v2-readonly-value">1.0.1</span>
          </SettingRow>
          <SettingRow title="定位" description="面向 OI 训练场景的本地笔记、博客、洛谷整理和 AI 辅助工作台。" />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Markdown 支持">
        <SettingsCard>
          <div className="settings-v2-chip-list">
            {capabilities.map((capability) => (
              <span key={capability}>{capability}</span>
            ))}
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="数据与隐私">
        <SettingsCard>
          <SettingRow title="本机配置" description="配置保存在本机；API Key 不显示明文，不写入前端 localStorage。" />
          <SettingRow title="缓存与索引" description="本地笔记索引和联网缓存保存在 .oinb/。" />
          <SettingRow title="本地笔记" description="不会上传到搜索服务；不读取 Cookie、历史记录、密码或登录态。" />
        </SettingsCard>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
