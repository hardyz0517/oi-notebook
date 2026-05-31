import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { ExternalLink, FolderOpen, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SettingRow({
  title,
  description,
  children,
  align = "center",
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-3 border-b border-border/60 py-3 xl:grid-cols-[minmax(260px,1fr)_320px]",
        align === "center" ? "lg:items-center" : "lg:items-start",
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description && <div className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface AppearanceOption {
  id: string;
  label: string;
  description?: string;
}

export interface AppearanceSettingsPageProps {
  className: string;
  appTheme: string;
  appThemeLabel: string;
  themeOptions: AppearanceOption[];
  onThemeChange: (value: string) => void;
  uiScale: number;
  uiScaleLabel: string;
  uiScaleMin: number;
  uiScaleMax: number;
  onUiScaleChange: (value: number) => void;
  appZoom: number;
  appZoomLabel: string;
  appZoomMin: number;
  appZoomMax: number;
  onAppZoomChange: (value: number) => void;
  settingsFontSize: number;
  settingsFontSizeMin: number;
  settingsFontSizeMax: number;
  onSettingsFontSizeChange: (value: number) => void;
  contentZoom: number;
  contentZoomLabel: string;
  contentZoomMin: number;
  contentZoomMax: number;
  onContentZoomChange: (value: number) => void;
  toolbarFontSize: number;
  toolbarFontSizeMin: number;
  toolbarFontSizeMax: number;
  onToolbarFontSizeChange: (value: number) => void;
  editorFontSize: number;
  previewFontSize: number;
  fontSizeMin: number;
  fontSizeMax: number;
  onEditorFontSizeChange: (value: number) => void;
  onPreviewFontSizeChange: (value: number) => void;
  readingDensity: string;
  readingDensityOptions: AppearanceOption[];
  activeReadingDensityDescription: string;
  onReadingDensityChange: (value: string) => void;
}

function clampNumericSetting(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function NumericSettingInput({
  value,
  min,
  max,
  step,
  unit,
  ariaLabel,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  ariaLabel: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitDraft = () => {
    if (draft.trim() === "") {
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const nextValue = clampNumericSetting(parsed, min, max);
    setDraft(String(nextValue));
    if (nextValue !== value) onCommit(nextValue);
  };

  const commitStep = (direction: 1 | -1) => {
    const parsedDraft = Number(draft);
    const baseValue = Number.isFinite(parsedDraft) ? parsedDraft : value;
    const nextValue = clampNumericSetting(baseValue + direction * step, min, max);
    setDraft(String(nextValue));
    if (nextValue !== value) onCommit(nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      commitStep(1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      commitStep(-1);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          const nextDraft = event.target.value;
          if (/^-?\d*$/.test(nextDraft)) setDraft(nextDraft);
        }}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        className="h-8 w-24 text-right"
        aria-label={ariaLabel}
      />
      <span className="w-6 shrink-0 text-sm text-muted-foreground">{unit}</span>
    </div>
  );
}

export function AppearanceSettingsPage({
  className,
  appTheme,
  appThemeLabel,
  themeOptions,
  onThemeChange,
  uiScale,
  uiScaleLabel,
  uiScaleMin,
  uiScaleMax,
  onUiScaleChange,
  appZoom,
  appZoomLabel,
  appZoomMin,
  appZoomMax,
  onAppZoomChange,
  settingsFontSize,
  settingsFontSizeMin,
  settingsFontSizeMax,
  onSettingsFontSizeChange,
  contentZoom,
  contentZoomLabel,
  contentZoomMin,
  contentZoomMax,
  onContentZoomChange,
  toolbarFontSize,
  toolbarFontSizeMin,
  toolbarFontSizeMax,
  onToolbarFontSizeChange,
  editorFontSize,
  previewFontSize,
  fontSizeMin,
  fontSizeMax,
  onEditorFontSizeChange,
  onPreviewFontSizeChange,
  readingDensity,
  readingDensityOptions,
  activeReadingDensityDescription,
  onReadingDensityChange,
}: AppearanceSettingsPageProps) {
  return (
    <section className={className}>
      <div className="mb-3 grid gap-1">
        <div className="text-base font-semibold text-foreground">主题与字号</div>
      </div>
      <SettingRow title="主题" description={`当前使用 ${appThemeLabel}。`}>
        <div className="flex flex-wrap gap-2">
          {themeOptions.map((option) => (
            <Button key={option.id} type="button" variant={appTheme === option.id ? "default" : "outline"} size="sm" onClick={() => onThemeChange(option.id)}>
              {option.label}
            </Button>
          ))}
        </div>
      </SettingRow>
      <SettingRow title="界面密度" description={`当前 ${uiScaleLabel}。`}>
        <NumericSettingInput
          value={Math.round(uiScale * 100)}
          min={Math.round(uiScaleMin * 100)}
          max={Math.round(uiScaleMax * 100)}
          step={5}
          unit="%"
          ariaLabel="界面密度"
          onCommit={(value) => onUiScaleChange(value / 100)}
        />
      </SettingRow>
      <SettingRow title="全局界面缩放" description={`当前 ${appZoomLabel}。`}>
        <NumericSettingInput
          value={Math.round(appZoom * 100)}
          min={Math.round(appZoomMin * 100)}
          max={Math.round(appZoomMax * 100)}
          step={5}
          unit="%"
          ariaLabel="全局界面缩放"
          onCommit={(value) => onAppZoomChange(value / 100)}
        />
      </SettingRow>
      <SettingRow title="设置中心文字大小" description={`${settingsFontSize}px。`}>
        <NumericSettingInput
          value={settingsFontSize}
          min={settingsFontSizeMin}
          max={settingsFontSizeMax}
          step={1}
          unit="px"
          ariaLabel="设置中心文字大小"
          onCommit={onSettingsFontSizeChange}
        />
      </SettingRow>
      <SettingRow title="Markdown 内容缩放" description={`当前 ${contentZoomLabel}。`}>
        <NumericSettingInput
          value={Math.round(contentZoom * 100)}
          min={Math.round(contentZoomMin * 100)}
          max={Math.round(contentZoomMax * 100)}
          step={5}
          unit="%"
          ariaLabel="Markdown 内容缩放"
          onCommit={(value) => onContentZoomChange(value / 100)}
        />
      </SettingRow>
      <SettingRow title="工具栏文字大小" description={`${toolbarFontSize}px。`}>
        <NumericSettingInput
          value={toolbarFontSize}
          min={toolbarFontSizeMin}
          max={toolbarFontSizeMax}
          step={1}
          unit="px"
          ariaLabel="工具栏文字大小"
          onCommit={onToolbarFontSizeChange}
        />
      </SettingRow>
      <SettingRow title="编辑区字体大小" description={`${editorFontSize}px。`}>
        <NumericSettingInput
          value={editorFontSize}
          min={fontSizeMin}
          max={fontSizeMax}
          step={1}
          unit="px"
          ariaLabel="编辑区字体大小"
          onCommit={onEditorFontSizeChange}
        />
      </SettingRow>
      <SettingRow title="预览区字体大小" description={`${previewFontSize}px。`}>
        <NumericSettingInput
          value={previewFontSize}
          min={fontSizeMin}
          max={fontSizeMax}
          step={1}
          unit="px"
          ariaLabel="预览区字体大小"
          onCommit={onPreviewFontSizeChange}
        />
      </SettingRow>
      <SettingRow title="阅读密度" description={activeReadingDensityDescription}>
        <div className="flex flex-wrap gap-2">
          {readingDensityOptions.map((option) => (
            <Button key={option.id} type="button" variant={readingDensity === option.id ? "default" : "outline"} size="sm" onClick={() => onReadingDensityChange(option.id)}>
              {option.label}
            </Button>
          ))}
        </div>
      </SettingRow>
    </section>
  );
}

export function DataStorageSettingsPage({
  className,
  isClearingWebCache,
  onOpenNotesFolder,
  onClearWebCache,
}: {
  className: string;
  isClearingWebCache: boolean;
  onOpenNotesFolder: () => void;
  onClearWebCache: () => void;
}) {
  return (
    <section className={className}>
      <div className="mb-3 text-base font-semibold text-foreground">目录与缓存</div>
      <SettingRow title="打开笔记文件夹" description="查看当前笔记目录。">
        <Button variant="outline" onClick={onOpenNotesFolder}><FolderOpen className="h-3.5 w-3.5" />打开笔记文件夹</Button>
      </SettingRow>
      <SettingRow title="清理联网缓存" description="同联网搜索页的缓存操作。">
        <Button type="button" variant="outline" size="sm" onClick={onClearWebCache} disabled={isClearingWebCache}>
          {isClearingWebCache ? "清理中..." : "清理联网缓存"}
        </Button>
      </SettingRow>
    </section>
  );
}

export function AboutVersionSettingsPage({
  className,
  developerModeEnabled,
  onToggleDeveloperMode,
}: {
  className: string;
  developerModeEnabled: boolean;
  onToggleDeveloperMode: () => void;
}) {
  return (
    <section className={className}>
      <div className="mb-3 text-base font-semibold text-foreground">版本与说明</div>
      <SettingRow title="OI Notebook" description="面向 OI 训练场景的本地笔记、博客、洛谷整理和 AI 辅助工作台。">
        <span className="text-sm text-muted-foreground">版本：0.1.0</span>
      </SettingRow>
      <SettingRow title="开发者模式" description="显示 Git、诊断、自检和底层调试入口。">
        <button type="button" className={cn("relative h-6 w-11 shrink-0 rounded-full border transition-colors", developerModeEnabled ? "border-primary/70 bg-primary" : "border-border bg-muted")} onClick={onToggleDeveloperMode} role="switch" aria-checked={developerModeEnabled} aria-label="启用开发者模式">
          <span className={cn("absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-sm transition-transform", developerModeEnabled && "translate-x-5")} />
        </button>
      </SettingRow>
    </section>
  );
}

export function AboutMarkdownSettingsPage({ className, capabilities }: { className: string; capabilities: string[] }) {
  return (
    <section className={className}>
      <div className="mb-3 text-base font-semibold text-foreground">Markdown 支持</div>
      <SettingRow title="预览能力" description="主工作台负责编辑和预览。">
        <div className="flex flex-wrap gap-2">
          {capabilities.map((feature) => (
            <span key={feature} className="inline-flex items-center border border-border/70 bg-muted/20 px-2 py-1 text-xs text-foreground">{feature}</span>
          ))}
        </div>
      </SettingRow>
    </section>
  );
}

export function AboutPrivacySettingsPage({ className }: { className: string }) {
  return (
    <section className={className}>
      <div className="mb-3 text-base font-semibold text-foreground">数据与隐私</div>
      <SettingRow title="本机配置" description="配置保存在本机；API Key 不显示明文，不写入前端 localStorage。" />
      <SettingRow title="缓存与索引" description="本地笔记索引和联网缓存保存在 .oinb/。" />
      <SettingRow title="联网搜索" description="只向所选 Provider 发送必要查询词；网页摘录只读取公开 http/https 页面。" />
      <SettingRow title="本地笔记" description="不会上传到搜索 Provider；不读取 Cookie、历史记录、密码或登录态。" />
    </section>
  );
}

export function BlogPreviewSettingsPage({
  className,
  blogTitle,
  blogSubtitle,
  blogConfigError,
  isLoadingBlogConfig,
  isSavingBlogConfig,
  onBlogTitleChange,
  onBlogSubtitleChange,
  onSaveBlogInfo,
  isRestartingBlog,
  onOpenBlog,
  onRestartBlog,
}: {
  className: string;
  blogTitle: string;
  blogSubtitle: string;
  blogConfigError: string | null;
  isLoadingBlogConfig: boolean;
  isSavingBlogConfig: boolean;
  onBlogTitleChange: (value: string) => void;
  onBlogSubtitleChange: (value: string) => void;
  onSaveBlogInfo: () => void;
  isRestartingBlog: boolean;
  onOpenBlog: () => void;
  onRestartBlog: () => void;
}) {
  return (
    <section className={className}>
      <div className="mb-3 text-base font-semibold text-foreground">本地预览</div>
      <SettingRow
        title="博客信息"
        description="用于 Local Blog 首页顶部、全站 header 和页面标题；留空时使用默认博客名称和简介。"
        align="start"
      >
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            博客名称
            <Input
              value={blogTitle}
              onChange={(event) => onBlogTitleChange(event.target.value)}
              placeholder="OI Notebook"
              disabled={isLoadingBlogConfig || isSavingBlogConfig}
              className="h-9 text-sm text-foreground"
            />
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            博客简介
            <Input
              value={blogSubtitle}
              onChange={(event) => onBlogSubtitleChange(event.target.value)}
              placeholder="一本地算法笔记与题解博客"
              disabled={isLoadingBlogConfig || isSavingBlogConfig}
              className="h-9 text-sm text-foreground"
            />
          </label>
          {blogConfigError ? <div className="text-xs leading-5 text-destructive">{blogConfigError}</div> : null}
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={onSaveBlogInfo} disabled={isLoadingBlogConfig || isSavingBlogConfig}>
              {isSavingBlogConfig ? "保存中..." : "保存博客信息"}
            </Button>
          </div>
        </div>
      </SettingRow>
      <SettingRow title="博客预览" description="打开或重启本地博客服务。">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onOpenBlog}><ExternalLink className="h-3.5 w-3.5" />打开博客</Button>
          <Button variant="outline" onClick={onRestartBlog} disabled={isRestartingBlog}>
            <RotateCcw className="h-3.5 w-3.5" />
            {isRestartingBlog ? "重启中..." : "重启博客"}
          </Button>
        </div>
      </SettingRow>
    </section>
  );
}

export function BlogTagManagerSettingsPage({
  className,
  availableCandidateCount,
  entriesCount,
  aliasesCount,
  hiddenIdsCount,
  onOpenTagManager,
}: {
  className: string;
  availableCandidateCount: number;
  entriesCount: number;
  aliasesCount: number;
  hiddenIdsCount: number;
  onOpenTagManager: () => void;
}) {
  return (
    <section className={className}>
      <div className="grid gap-5">
        <div className="grid gap-1">
          <div className="text-base font-semibold text-foreground">标签管理器</div>
          <div className="text-xs leading-5 text-muted-foreground">
            浏览当前合并后的标签体系，并管理标签可见性。
          </div>
        </div>
        <div className="grid gap-3 rounded-sm border border-border/70 bg-muted/10 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-sm border border-border/70 bg-background/30 px-2 py-1">可用标签候选 {availableCandidateCount}</span>
            <span className="rounded-sm border border-border/70 bg-background/30 px-2 py-1">自定义标签 {entriesCount}</span>
            <span className="rounded-sm border border-border/70 bg-background/30 px-2 py-1">自定义别名 {aliasesCount}</span>
            <span className="rounded-sm border border-border/70 bg-background/30 px-2 py-1">隐藏标签 {hiddenIdsCount}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={onOpenTagManager}>打开标签管理器</Button>
            <span className="text-xs leading-5 text-muted-foreground">
              打开独立管理面板后可浏览、搜索并调整标签可见性。
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
