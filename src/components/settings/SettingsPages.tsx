import type { ReactNode } from "react";
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
  uiScalePresets: number[];
  onUiScaleChange: (value: number) => void;
  appZoom: number;
  appZoomLabel: string;
  appZoomPresets: number[];
  onAppZoomChange: (value: number) => void;
  settingsFontSize: number;
  settingsFontSizeMin: number;
  settingsFontSizeMax: number;
  onSettingsFontSizeChange: (value: number) => void;
  contentZoom: number;
  contentZoomLabel: string;
  contentZoomPresets: number[];
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

export function AppearanceSettingsPage({
  className,
  appTheme,
  appThemeLabel,
  themeOptions,
  onThemeChange,
  uiScale,
  uiScaleLabel,
  uiScalePresets,
  onUiScaleChange,
  appZoom,
  appZoomLabel,
  appZoomPresets,
  onAppZoomChange,
  settingsFontSize,
  settingsFontSizeMin,
  settingsFontSizeMax,
  onSettingsFontSizeChange,
  contentZoom,
  contentZoomLabel,
  contentZoomPresets,
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
        <div className="flex flex-wrap gap-2">
          {uiScalePresets.map((scale) => (
            <Button key={scale} type="button" variant={Math.round(uiScale * 100) === Math.round(scale * 100) ? "default" : "outline"} size="sm" onClick={() => onUiScaleChange(scale)}>
              {Math.round(scale * 100)}%
            </Button>
          ))}
        </div>
      </SettingRow>
      <SettingRow title="全局界面缩放" description={`当前 ${appZoomLabel}。`}>
        <div className="flex flex-wrap gap-2">
          {appZoomPresets.map((zoom) => (
            <Button key={zoom} type="button" variant={Math.round(appZoom * 100) === Math.round(zoom * 100) ? "default" : "outline"} size="sm" onClick={() => onAppZoomChange(zoom)}>
              {Math.round(zoom * 100)}%
            </Button>
          ))}
        </div>
      </SettingRow>
      <SettingRow title="设置中心文字大小" description={`${settingsFontSize}px。`}>
        <div className="flex min-w-0 items-center gap-2">
          <input type="range" min={settingsFontSizeMin} max={settingsFontSizeMax} step={1} value={settingsFontSize} onChange={(event) => onSettingsFontSizeChange(Number(event.target.value))} className="h-2 min-w-0 flex-1 accent-primary" aria-label="设置中心文字大小" />
          <Input type="number" min={settingsFontSizeMin} max={settingsFontSizeMax} value={settingsFontSize} onChange={(event) => onSettingsFontSizeChange(Number(event.target.value))} className="h-8 w-20" aria-label="设置中心文字大小数值" />
        </div>
      </SettingRow>
      <SettingRow title="Markdown 内容缩放" description={`当前 ${contentZoomLabel}。`}>
        <div className="flex flex-wrap gap-2">
          {contentZoomPresets.map((zoom) => (
            <Button key={zoom} type="button" variant={Math.round(contentZoom * 100) === Math.round(zoom * 100) ? "default" : "outline"} size="sm" onClick={() => onContentZoomChange(zoom)}>
              {Math.round(zoom * 100)}%
            </Button>
          ))}
        </div>
      </SettingRow>
      <SettingRow title="工具栏文字大小" description={`${toolbarFontSize}px。`}>
        <div className="flex min-w-0 items-center gap-2">
          <input type="range" min={toolbarFontSizeMin} max={toolbarFontSizeMax} step={1} value={toolbarFontSize} onChange={(event) => onToolbarFontSizeChange(Number(event.target.value))} className="h-2 min-w-0 flex-1 accent-primary" aria-label="工具栏文字大小" />
          <Input type="number" min={toolbarFontSizeMin} max={toolbarFontSizeMax} value={toolbarFontSize} onChange={(event) => onToolbarFontSizeChange(Number(event.target.value))} className="h-8 w-20" aria-label="工具栏文字大小数值" />
        </div>
      </SettingRow>
      <SettingRow title="编辑区字体大小" description={`${editorFontSize}px。`}>
        <div className="flex min-w-0 items-center gap-2">
          <input type="range" min={fontSizeMin} max={fontSizeMax} step={1} value={editorFontSize} onChange={(event) => onEditorFontSizeChange(Number(event.target.value))} className="h-2 min-w-0 flex-1 accent-primary" aria-label="编辑区字体大小" />
          <Input type="number" min={fontSizeMin} max={fontSizeMax} value={editorFontSize} onChange={(event) => onEditorFontSizeChange(Number(event.target.value))} className="h-8 w-20" aria-label="编辑区字体大小数值" />
        </div>
      </SettingRow>
      <SettingRow title="预览区字体大小" description={`${previewFontSize}px。`}>
        <div className="flex min-w-0 items-center gap-2">
          <input type="range" min={fontSizeMin} max={fontSizeMax} step={1} value={previewFontSize} onChange={(event) => onPreviewFontSizeChange(Number(event.target.value))} className="h-2 min-w-0 flex-1 accent-primary" aria-label="预览区字体大小" />
          <Input type="number" min={fontSizeMin} max={fontSizeMax} value={previewFontSize} onChange={(event) => onPreviewFontSizeChange(Number(event.target.value))} className="h-8 w-20" aria-label="预览区字体大小数值" />
        </div>
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
  isRestartingBlog,
  onOpenBlog,
  onRestartBlog,
}: {
  className: string;
  isRestartingBlog: boolean;
  onOpenBlog: () => void;
  onRestartBlog: () => void;
}) {
  return (
    <section className={className}>
      <div className="mb-3 text-base font-semibold text-foreground">本地预览</div>
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
