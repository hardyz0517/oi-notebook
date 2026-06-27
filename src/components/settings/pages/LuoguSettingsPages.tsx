import { ExternalLink, Loader2, PlugZap } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { SettingRow } from "../SettingsPages";
import { SettingsPageLayout } from "../v2/components/SettingsPageLayout";
import { SettingsBadge } from "../v2/primitives/SettingsBadge";
import { SettingsButton } from "../v2/primitives/SettingsButton";
import type { LuoguAccountSettingsView } from "@/lib/luoguConfigForm";

export interface LuoguRuleSettingOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface LuoguRuleSettingRow {
  id: string;
  title: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  options: LuoguRuleSettingOption[];
}

export function SettingsInlineSelect({
  value,
  options,
  disabled,
  onChange,
  ariaLabel,
}: {
  id: string;
  value: string;
  options: LuoguRuleSettingOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
  ariaLabel: string;
  expandedRuleId: string | null;
  onExpandedRuleChange: (id: string | null) => void;
  themed?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="settings-v2-inline-select-trigger"
        onClick={(event) => event.stopPropagation()}
      >
        <SelectValue placeholder="请选择" />
      </SelectTrigger>
      <SelectContent
        className="settings-v2-inline-select-content"
        onClick={(event) => event.stopPropagation()}
      >
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled} title={option.label}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LuoguAccountSettingsPage({
  className,
  embedded = false,
  configured,
  statusLabel,
  statusDescription,
  uid,
  lastSubmissionId,
  aiConfigured,
  accountSettingsView,
  onOpenSettings,
}: {
  className: string;
  embedded?: boolean;
  configured: boolean;
  statusLabel: string;
  statusDescription: string;
  uid: string;
  lastSubmissionId: string;
  aiConfigured: boolean;
  accountSettingsView: LuoguAccountSettingsView;
  onOpenSettings: () => void;
}) {
  return (
    <SettingsPageLayout title="洛谷" embedded={embedded}>
    <section className={className}>
      <div className="settings-v2-legacy-section-header">
        <div className="settings-v2-legacy-section-title">账号配置</div>
        <div className="settings-v2-legacy-section-description">查看或更新洛谷 Cookie 配置。</div>
      </div>
      <SettingRow title="连接状态" description={statusDescription}>
        <SettingsBadge tone={configured ? "success" : "warning"}>{statusLabel}</SettingsBadge>
      </SettingRow>
      <SettingRow title="当前配置" description="查看或更新洛谷 Cookie 配置。">
        <div className="settings-v2-value-list">
          <span>UID：{uid || "未读取"}</span>
          <span>最后同步提交 ID：{lastSubmissionId || "未设置"}</span>
          <span>AI：{aiConfigured ? "已配置" : "未配置或未读取"}</span>
        </div>
      </SettingRow>
      <SettingRow title="账号操作" description="打开现有洛谷设置窗口，可测试连接并保存配置。">
        <div className="flex flex-wrap gap-2">
          <SettingsButton onClick={onOpenSettings} disabled={accountSettingsView.isOpenSettingsDisabled}>
            {accountSettingsView.showOpenSettingsSpinner ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
            打开账号配置
          </SettingsButton>
        </div>
      </SettingRow>
    </section>
    </SettingsPageLayout>
  );
}

export function LuoguRulesSettingsPage({
  className,
  embedded = false,
  rows,
  expandedRuleId,
  onExpandedRuleChange,
  disabled,
  showCustomSaveDirectory,
  customSaveDirectory,
  onCustomSaveDirectoryChange,
}: {
  className: string;
  embedded?: boolean;
  rows: LuoguRuleSettingRow[];
  expandedRuleId: string | null;
  onExpandedRuleChange: (id: string | null) => void;
  disabled: boolean;
  showCustomSaveDirectory: boolean;
  customSaveDirectory: string;
  onCustomSaveDirectoryChange: (value: string) => void;
}) {
  return (
    <SettingsPageLayout title="洛谷" embedded={embedded}>
    <section className={className}>
      <div className="settings-v2-legacy-section-header">
        <div className="settings-v2-legacy-section-title">导入规则</div>
        <div className="settings-v2-legacy-section-description">配置扫描、筛选、预览生成和写入策略；规则会保存到本地。</div>
      </div>
      {rows.map((row) => (
        <SettingRow key={row.id} title={row.title} description={row.description}>
          <SettingsInlineSelect
            id={row.id}
            value={row.value}
            options={row.options}
            disabled={disabled}
            onChange={row.onChange}
            ariaLabel={row.title}
            expandedRuleId={expandedRuleId}
            onExpandedRuleChange={onExpandedRuleChange}
          />
        </SettingRow>
      ))}
      {showCustomSaveDirectory && (
        <SettingRow title="自定义保存目录" description="相对于 notes/ 的安全相对目录。">
          <Input
            value={customSaveDirectory}
            placeholder="luogu/custom"
            onChange={(event) => onCustomSaveDirectoryChange(event.target.value)}
            disabled={disabled}
          />
        </SettingRow>
      )}
    </section>
    </SettingsPageLayout>
  );
}

export function LuoguImportCenterSettingsPage({
  className,
  embedded = false,
  accountLabel,
  aiLabel,
  rangeLabel,
  disabled,
  onOpenImportCenter,
}: {
  className: string;
  embedded?: boolean;
  accountLabel: string;
  aiLabel: string;
  rangeLabel: string;
  disabled: boolean;
  onOpenImportCenter: () => void;
}) {
  return (
    <SettingsPageLayout title="洛谷" embedded={embedded}>
    <section className={className}>
      <div className="settings-v2-legacy-section-header">
        <div className="settings-v2-legacy-section-title">导入中心</div>
        <div className="settings-v2-legacy-section-description">扫描洛谷提交，预览后写入本地笔记。</div>
      </div>
      <SettingRow title="导入前置状态" description="导入中心打开时会读取最新洛谷和 AI 配置。">
        <div className="settings-v2-value-list">
          <span>洛谷账号：{accountLabel}</span>
          <span>AI：{aiLabel}</span>
          <span>默认扫描范围：{rangeLabel}</span>
        </div>
      </SettingRow>
      <SettingRow title="打开导入中心" description="打开后可在独立窗口中扫描提交、生成预览并写入本地笔记。">
        <SettingsButton onClick={onOpenImportCenter} disabled={disabled}>
          <ExternalLink className="h-3.5 w-3.5" />
          打开洛谷导入中心
        </SettingsButton>
      </SettingRow>
    </section>
    </SettingsPageLayout>
  );
}
