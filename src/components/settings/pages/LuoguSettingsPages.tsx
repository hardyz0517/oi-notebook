import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, Loader2, PlugZap } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { SettingRow } from "../SettingsPages";
import { SettingsPageLayout } from "../v2/components/SettingsPageLayout";
import { SettingsBadge } from "../v2/primitives/SettingsBadge";
import { SettingsButton } from "../v2/primitives/SettingsButton";

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

const SETTINGS_SELECT_ITEM_HEIGHT = 30;
const SETTINGS_SELECT_VERTICAL_PADDING = 4;
const SETTINGS_SELECT_BORDER_WIDTH = 1;
const SETTINGS_SELECT_GAP = 6;

interface SettingsSelectPlacementInput {
  triggerRect: Pick<DOMRect, "top" | "bottom">;
  containerRect: Pick<DOMRect, "top" | "bottom">;
  optionsCount: number;
}

interface SettingsSelectPlacement {
  direction: "up" | "down";
  menuNaturalHeight: number;
  maxHeight: number | null;
  shouldScroll: boolean;
}

function computeSettingsSelectPlacement({
  triggerRect,
  containerRect,
  optionsCount,
}: SettingsSelectPlacementInput): SettingsSelectPlacement {
  const optionCount = Math.max(0, optionsCount);
  const menuNaturalHeight =
    optionCount * SETTINGS_SELECT_ITEM_HEIGHT +
    SETTINGS_SELECT_VERTICAL_PADDING * 2 +
    SETTINGS_SELECT_BORDER_WIDTH * 2;
  const availableBelow = Math.max(0, containerRect.bottom - triggerRect.bottom - SETTINGS_SELECT_GAP);
  const availableAbove = Math.max(0, triggerRect.top - containerRect.top - SETTINGS_SELECT_GAP);

  if (menuNaturalHeight <= availableBelow) {
    return { direction: "down", menuNaturalHeight, maxHeight: null, shouldScroll: false };
  }
  if (menuNaturalHeight <= availableAbove) {
    return { direction: "up", menuNaturalHeight, maxHeight: null, shouldScroll: false };
  }

  const direction = availableBelow >= availableAbove ? "down" : "up";
  const available = direction === "down" ? availableBelow : availableAbove;

  return {
    direction,
    menuNaturalHeight,
    maxHeight: Math.max(1, available),
    shouldScroll: true,
  };
}

export function SettingsInlineSelect({
  id,
  value,
  options,
  disabled,
  onChange,
  ariaLabel,
  expandedRuleId,
  onExpandedRuleChange,
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
  const expanded = expandedRuleId === id;
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuLayout, setMenuLayout] = useState<SettingsSelectPlacement>({
    direction: "down",
    menuNaturalHeight: 0,
    maxHeight: null,
    shouldScroll: false,
  });
  const [menuEntered, setMenuEntered] = useState(false);

  const updateMenuLayout = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const scrollContainer = trigger.closest("[data-settings-scroll-container='true']");
    const boundaryRect = scrollContainer?.getBoundingClientRect() ?? document.documentElement.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    setMenuLayout(computeSettingsSelectPlacement({
      triggerRect,
      containerRect: boundaryRect,
      optionsCount: options.length,
    }));
  }, [options.length]);

  useEffect(() => {
    if (!expanded) return;

    updateMenuLayout();
    setMenuEntered(false);
    const frameId = window.requestAnimationFrame(() => setMenuEntered(true));
    const trigger = triggerRef.current;
    const scrollContainer = trigger?.closest("[data-settings-scroll-container='true']");
    const handleScrollOrResize = () => {
      onExpandedRuleChange(null);
    };
    const handleDocumentPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onExpandedRuleChange(null);
    };
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExpandedRuleChange(null);
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("keydown", handleDocumentKeyDown);
    scrollContainer?.addEventListener("scroll", handleScrollOrResize, { passive: true });
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      scrollContainer?.removeEventListener("scroll", handleScrollOrResize);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [expanded, onExpandedRuleChange, updateMenuLayout]);

  return (
    <div
      ref={rootRef}
      className="settings-v2-inline-select"
      data-no-window-drag="true"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        className="settings-v2-inline-select-trigger"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          updateMenuLayout();
          onExpandedRuleChange(expanded ? null : id);
        }}
      >
        <span className="settings-v2-inline-select-label">{selectedOption?.label ?? "请选择"}</span>
        <ChevronDown className={cn("settings-v2-pill-icon transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div
          ref={menuRef}
          data-no-window-drag="true"
          className={cn(
            "settings-v2-inline-select-menu",
            menuLayout.shouldScroll ? "overflow-y-auto" : "overflow-visible",
            menuLayout.direction === "down" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]",
          )}
          style={{
            maxHeight: menuLayout.maxHeight === null ? undefined : `${menuLayout.maxHeight}px`,
            opacity: menuEntered ? 1 : 0,
            transform: menuEntered
              ? "translateY(0) scale(1)"
              : menuLayout.direction === "down"
                ? "translateY(-4px) scale(0.98)"
                : "translateY(4px) scale(0.98)",
          }}
          role="listbox"
          aria-label={ariaLabel}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                className="settings-v2-inline-select-option"
                title={option.label}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (option.disabled) return;
                  if (option.value !== value) onChange(option.value);
                  onExpandedRuleChange(null);
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.detail !== 0 || option.disabled) return;
                  if (option.value !== value) onChange(option.value);
                  onExpandedRuleChange(null);
                }}
              >
                <span className="settings-v2-inline-select-label">{option.label}</span>
                <span className="settings-v2-inline-select-check">
                  {selected && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
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
  isLoadingConfig,
  isSavingConfig,
  isTestingConnection,
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
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  isTestingConnection: boolean;
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
          <SettingsButton onClick={onOpenSettings} disabled={isLoadingConfig || isSavingConfig || isTestingConnection}>
            {isLoadingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
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
