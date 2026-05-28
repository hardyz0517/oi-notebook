import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, Loader2, PlugZap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { SettingRow } from "../SettingsPages";

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

const SETTINGS_SELECT_ITEM_HEIGHT = 36;
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
      className="relative w-full max-w-[300px] sm:w-[300px]"
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
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border/75 bg-muted/20 px-3 text-left text-sm font-normal text-foreground shadow-sm outline-none transition-colors",
          "hover:border-muted-foreground/55 hover:bg-muted/25 focus:border-primary/65 focus:bg-background focus:ring-2 focus:ring-primary/20",
          "disabled:cursor-not-allowed disabled:border-border/50 disabled:bg-muted/10 disabled:text-muted-foreground disabled:opacity-70",
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          if (disabled) return;
          updateMenuLayout();
          onExpandedRuleChange(expanded ? null : id);
        }}
      >
        <span className="min-w-0 truncate">{selectedOption?.label ?? "请选择"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div
          ref={menuRef}
          data-no-window-drag="true"
          className={cn(
            "absolute left-0 z-[80] grid w-full rounded-md border border-border bg-[#1f1f1f] p-1 text-sm text-foreground shadow-lg transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
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
                className={cn(
                  "flex h-9 min-w-0 items-center gap-2 rounded-sm px-2.5 text-left text-sm transition-colors",
                  selected ? "bg-[#343434] text-foreground" : "text-foreground hover:bg-[#2a2a2a]",
                  option.disabled && "cursor-not-allowed opacity-50",
                )}
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
                }}
              >
                <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                  {selected && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 truncate">{option.label}</span>
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
  onOpenImportCenter,
}: {
  className: string;
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
  onOpenImportCenter: () => void;
}) {
  return (
    <section className={className}>
      <div className="mb-3 grid gap-1">
        <div className="text-base font-semibold text-foreground">账号配置</div>
        <div className="text-xs leading-5 text-muted-foreground">复用现有洛谷 Cookie 配置窗口，保存 UID、__client_id 和最后同步提交 ID。</div>
      </div>
      <SettingRow title="连接状态" description={statusDescription}>
        <span className={cn("inline-flex rounded-sm border px-2 py-0.5 text-xs", configured ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-200")}>
          {statusLabel}
        </span>
      </SettingRow>
      <SettingRow title="当前配置" description="未读取配置前可能显示为空；打开配置窗口会读取后端保存值。">
        <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
          <span>UID：{uid || "未读取"}</span>
          <span>最后同步提交 ID：{lastSubmissionId || "未设置"}</span>
          <span>AI：{aiConfigured ? "已配置" : "未配置或未读取"}</span>
        </div>
      </SettingRow>
      <SettingRow title="账号操作" description="打开现有洛谷设置窗口，可测试连接并保存配置。">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onOpenSettings} disabled={isLoadingConfig || isSavingConfig || isTestingConnection}>
            {isLoadingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
            打开账号配置
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenImportCenter} disabled={isLoadingConfig}>
            <ExternalLink className="h-3.5 w-3.5" />
            打开导入中心
          </Button>
        </div>
      </SettingRow>
    </section>
  );
}

export function LuoguRulesSettingsPage({
  className,
  rows,
  expandedRuleId,
  onExpandedRuleChange,
  disabled,
  showCustomSaveDirectory,
  customSaveDirectory,
  onCustomSaveDirectoryChange,
}: {
  className: string;
  rows: LuoguRuleSettingRow[];
  expandedRuleId: string | null;
  onExpandedRuleChange: (id: string | null) => void;
  disabled: boolean;
  showCustomSaveDirectory: boolean;
  customSaveDirectory: string;
  onCustomSaveDirectoryChange: (value: string) => void;
}) {
  return (
    <section className={className}>
      <div className="mb-3 grid gap-1">
        <div className="text-base font-semibold text-foreground">导入规则</div>
        <div className="text-xs leading-5 text-muted-foreground">配置扫描、筛选、预览生成和写入策略；规则会保存到本地。</div>
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
  );
}

export function LuoguImportCenterSettingsPage({
  className,
  accountLabel,
  aiLabel,
  rangeLabel,
  disabled,
  onOpenImportCenter,
}: {
  className: string;
  accountLabel: string;
  aiLabel: string;
  rangeLabel: string;
  disabled: boolean;
  onOpenImportCenter: () => void;
}) {
  return (
    <section className={className}>
      <div className="mb-3 grid gap-1">
        <div className="text-base font-semibold text-foreground">导入中心</div>
        <div className="text-xs leading-5 text-muted-foreground">复用现有洛谷导入中心窗口，负责扫描、预览、手动导入和写入笔记。</div>
      </div>
      <SettingRow title="导入前置状态" description="导入中心打开时会读取最新洛谷和 AI 配置。">
        <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
          <span>洛谷账号：{accountLabel}</span>
          <span>AI：{aiLabel}</span>
          <span>默认扫描范围：{rangeLabel}</span>
        </div>
      </SettingRow>
      <SettingRow title="打开导入中心" description="打开后可在独立窗口中扫描提交、生成预览并写入本地笔记。">
        <Button variant="outline" size="sm" onClick={onOpenImportCenter} disabled={disabled}>
          <ExternalLink className="h-3.5 w-3.5" />
          打开洛谷导入中心
        </Button>
      </SettingRow>
    </section>
  );
}
