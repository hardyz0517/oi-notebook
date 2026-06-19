import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { ExternalLink, FolderOpen, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { SettingsPageLayout } from "./v2/components/SettingsPageLayout";
import { ReadonlyPill } from "./v2/primitives/ReadonlyPill";
import { SettingRow as PrimitiveSettingRow } from "./v2/primitives/SettingRow";
import { SettingsButton } from "./v2/primitives/SettingsButton";
import { SettingsCard, SettingsSection } from "./v2/primitives/SettingsCard";
import { ToggleSwitch } from "./v2/primitives/ToggleSwitch";

const L = {
  appearance: "\u5916\u89c2",
  themeAndFonts: "\u4e3b\u9898\u4e0e\u5b57\u53f7",
  theme: "\u4e3b\u9898",
  density: "\u754c\u9762\u5bc6\u5ea6",
  densityDesc: "\u8c03\u6574\u6574\u4f53\u63a7\u4ef6\u548c\u6587\u5b57\u5bc6\u5ea6\u3002",
  appZoom: "\u5168\u5c40\u754c\u9762\u7f29\u653e",
  appZoomDesc: "\u7f29\u653e\u6574\u4e2a\u5e94\u7528\u754c\u9762\u3002",
  settingsFont: "\u8bbe\u7f6e\u4e2d\u5fc3\u6587\u5b57\u5927\u5c0f",
  settingsFontDesc: "\u4ec5\u5f71\u54cd\u8bbe\u7f6e\u4e2d\u5fc3\u6587\u5b57\u3002",
  markdownZoom: "Markdown \u5185\u5bb9\u7f29\u653e",
  markdownZoomDesc: "\u8c03\u6574 Markdown \u5185\u5bb9\u663e\u793a\u6bd4\u4f8b\u3002",
  toolbarFont: "\u5de5\u5177\u680f\u6587\u5b57\u5927\u5c0f",
  toolbarFontDesc: "\u4ec5\u5f71\u54cd\u7f16\u8f91\u5de5\u5177\u680f\u6587\u5b57\u3002",
  editorFont: "\u7f16\u8f91\u533a\u5b57\u4f53\u5927\u5c0f",
  editorFontDesc: "\u4ec5\u5f71\u54cd\u7f16\u8f91\u533a\u6b63\u6587\u663e\u793a\uff0c\u4e0d\u6539\u53d8\u6587\u4ef6\u5185\u5bb9\u3002",
  previewFont: "\u9884\u89c8\u533a\u5b57\u4f53\u5927\u5c0f",
  previewFontDesc: "\u4ec5\u5f71\u54cd\u9884\u89c8\u533a\u6b63\u6587\u663e\u793a\u3002",
  readingDensity: "\u9605\u8bfb\u5bc6\u5ea6",
  data: "\u6570\u636e\u4e0e\u5b58\u50a8",
  directoriesCache: "\u76ee\u5f55\u4e0e\u7f13\u5b58",
  openNotes: "\u6253\u5f00\u7b14\u8bb0\u6587\u4ef6\u5939",
  openNotesDesc: "\u67e5\u770b\u5f53\u524d\u7b14\u8bb0\u76ee\u5f55\u3002",
  clearCache: "\u6e05\u7406\u641c\u7d22\u7f13\u5b58",
  clearCacheDesc: "\u5220\u9664\u5df2\u4fdd\u5b58\u7684\u641c\u7d22\u7ed3\u679c\u548c\u7f51\u9875\u6458\u8981\u7f13\u5b58\u3002",
  clearing: "\u6e05\u7406\u4e2d...",
  blog: "\u535a\u5ba2",
  blogInfo: "\u535a\u5ba2\u4fe1\u606f",
  blogInfoDesc: "\u7528\u4e8e\u672c\u5730\u535a\u5ba2\u9996\u9875\u3001\u9875\u5934\u548c\u9875\u9762\u6807\u9898\u3002",
  blogNameIntro: "\u535a\u5ba2\u540d\u79f0\u4e0e\u7b80\u4ecb",
  blogName: "\u535a\u5ba2\u540d\u79f0",
  blogSubtitle: "\u535a\u5ba2\u7b80\u4ecb",
  saveBlog: "\u4fdd\u5b58\u535a\u5ba2\u4fe1\u606f",
  saving: "\u4fdd\u5b58\u4e2d...",
  localPreview: "\u672c\u5730\u9884\u89c8",
  localPreviewDesc: "\u6253\u5f00\u6216\u91cd\u542f\u672c\u5730\u535a\u5ba2\u670d\u52a1\u3002",
  openBlog: "\u6253\u5f00\u535a\u5ba2",
  restartBlog: "\u91cd\u542f\u535a\u5ba2",
  restarting: "\u91cd\u542f\u4e2d...",
  tagManager: "\u6807\u7b7e\u7ba1\u7406\u5668",
  tagManagerDesc: "\u7ba1\u7406\u63a8\u8350\u6807\u7b7e\u3001\u6587\u96c6\u5019\u9009\u548c\u6807\u7b7e\u663e\u793a\u65b9\u5f0f\u3002",
  openTagManager: "\u6253\u5f00\u6807\u7b7e\u7ba1\u7406\u5668",
  availableTags: "\u53ef\u7528\u6807\u7b7e\u5019\u9009",
  customTags: "\u81ea\u5b9a\u4e49\u6807\u7b7e",
  aliases: "\u81ea\u5b9a\u4e49\u522b\u540d",
  hiddenTags: "\u9690\u85cf\u6807\u7b7e",
  version: "\u7248\u672c\u4e0e\u8bf4\u660e",
  developerMode: "\u5f00\u53d1\u8005\u6a21\u5f0f",
  developerModeDesc: "\u663e\u793a\u8bca\u65ad\u3001\u81ea\u68c0\u548c\u5e95\u5c42\u8c03\u8bd5\u5165\u53e3\u3002",
  markdownSupport: "Markdown \u652f\u6301",
  privacy: "\u6570\u636e\u4e0e\u9690\u79c1",
};

export function SettingRow({
  title,
  description,
  children,
  align = "center",
  layout = "split",
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  align?: "center" | "start";
  layout?: "split" | "stacked";
}) {
  return (
    <PrimitiveSettingRow
      title={title}
      description={description}
      variant={layout === "stacked" || align === "start" ? "default" : "grid"}
      className={cn(layout === "stacked" && "settings-v2-row-stacked", align === "start" && "settings-v2-row-align-start")}
    >
      {children}
    </PrimitiveSettingRow>
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
    <div className="settings-v2-number">
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
        className="settings-v2-number-input"
        aria-label={ariaLabel}
      />
      <span className="settings-v2-number-unit">{unit}</span>
    </div>
  );
}

export function AppearanceSettingsPage({
  appTheme,
  themeOptions,
  onThemeChange,
  uiScale,
  uiScaleMin,
  uiScaleMax,
  onUiScaleChange,
  appZoom,
  appZoomMin,
  appZoomMax,
  onAppZoomChange,
  settingsFontSize,
  settingsFontSizeMin,
  settingsFontSizeMax,
  onSettingsFontSizeChange,
  contentZoom,
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
    <SettingsPageLayout title={L.appearance}>
      <SettingsSection title={L.themeAndFonts}>
        <SettingsCard>
          <SettingRow title={L.theme}>
            <div className="flex flex-wrap gap-2">
              {themeOptions.map((option) => (
                <Button key={option.id} type="button" variant={appTheme === option.id ? "default" : "outline"} size="sm" onClick={() => onThemeChange(option.id)}>
                  {option.label}
                </Button>
              ))}
            </div>
          </SettingRow>
          <SettingRow title={L.density} description={L.densityDesc}>
            <NumericSettingInput value={Math.round(uiScale * 100)} min={Math.round(uiScaleMin * 100)} max={Math.round(uiScaleMax * 100)} step={5} unit="%" ariaLabel={L.density} onCommit={(value) => onUiScaleChange(value / 100)} />
          </SettingRow>
          <SettingRow title={L.appZoom} description={L.appZoomDesc}>
            <NumericSettingInput value={Math.round(appZoom * 100)} min={Math.round(appZoomMin * 100)} max={Math.round(appZoomMax * 100)} step={5} unit="%" ariaLabel={L.appZoom} onCommit={(value) => onAppZoomChange(value / 100)} />
          </SettingRow>
          <SettingRow title={L.settingsFont} description={L.settingsFontDesc}>
            <NumericSettingInput value={settingsFontSize} min={settingsFontSizeMin} max={settingsFontSizeMax} step={1} unit="px" ariaLabel={L.settingsFont} onCommit={onSettingsFontSizeChange} />
          </SettingRow>
          <SettingRow title={L.markdownZoom} description={L.markdownZoomDesc}>
            <NumericSettingInput value={Math.round(contentZoom * 100)} min={Math.round(contentZoomMin * 100)} max={Math.round(contentZoomMax * 100)} step={5} unit="%" ariaLabel={L.markdownZoom} onCommit={(value) => onContentZoomChange(value / 100)} />
          </SettingRow>
          <SettingRow title={L.toolbarFont} description={L.toolbarFontDesc}>
            <NumericSettingInput value={toolbarFontSize} min={toolbarFontSizeMin} max={toolbarFontSizeMax} step={1} unit="px" ariaLabel={L.toolbarFont} onCommit={onToolbarFontSizeChange} />
          </SettingRow>
          <SettingRow title={L.editorFont} description={L.editorFontDesc}>
            <NumericSettingInput value={editorFontSize} min={fontSizeMin} max={fontSizeMax} step={1} unit="px" ariaLabel={L.editorFont} onCommit={onEditorFontSizeChange} />
          </SettingRow>
          <SettingRow title={L.previewFont} description={L.previewFontDesc}>
            <NumericSettingInput value={previewFontSize} min={fontSizeMin} max={fontSizeMax} step={1} unit="px" ariaLabel={L.previewFont} onCommit={onPreviewFontSizeChange} />
          </SettingRow>
          <SettingRow title={L.readingDensity} description={activeReadingDensityDescription}>
            <div className="flex flex-wrap gap-2">
              {readingDensityOptions.map((option) => (
                <Button key={option.id} type="button" variant={readingDensity === option.id ? "default" : "outline"} size="sm" onClick={() => onReadingDensityChange(option.id)}>
                  {option.label}
                </Button>
              ))}
            </div>
          </SettingRow>
        </SettingsCard>
      </SettingsSection>
    </SettingsPageLayout>
  );
}

export function DataStorageSettingsPage({
  embedded = false,
  isClearingWebCache,
  onOpenNotesFolder,
  onClearWebCache,
}: {
  className: string;
  embedded?: boolean;
  isClearingWebCache: boolean;
  onOpenNotesFolder: () => void;
  onClearWebCache: () => void;
}) {
  return (
    <SettingsPageLayout title={L.data} embedded={embedded}>
      <SettingsSection title={L.directoriesCache}>
        <SettingsCard>
          <SettingRow title={L.openNotes} description={L.openNotesDesc}>
            <SettingsButton onClick={onOpenNotesFolder}><FolderOpen className="h-3.5 w-3.5" />{L.openNotes}</SettingsButton>
          </SettingRow>
          <SettingRow title={L.clearCache} description={L.clearCacheDesc}>
            <SettingsButton onClick={onClearWebCache} disabled={isClearingWebCache}>{isClearingWebCache ? L.clearing : L.clearCache}</SettingsButton>
          </SettingRow>
        </SettingsCard>
      </SettingsSection>
    </SettingsPageLayout>
  );
}

export function AboutVersionSettingsPage({
  className: _className,
  developerModeEnabled,
  onToggleDeveloperMode,
}: {
  className: string;
  developerModeEnabled: boolean;
  onToggleDeveloperMode: () => void;
}) {
  return (
    <SettingsSection title={L.version}>
      <SettingsCard>
        <SettingRow title="OI Notebook" description="Local notes, blog, Luogu integration, and AI-assisted workspace.">
          <ReadonlyPill>1.0.1</ReadonlyPill>
        </SettingRow>
        <SettingRow title={L.developerMode} description={L.developerModeDesc}>
          <ToggleSwitch checked={developerModeEnabled} ariaLabel={L.developerMode} onChange={() => onToggleDeveloperMode()} />
        </SettingRow>
      </SettingsCard>
    </SettingsSection>
  );
}

export function AboutMarkdownSettingsPage({ capabilities }: { className: string; capabilities: string[] }) {
  return (
    <SettingsSection title={L.markdownSupport}>
      <SettingsCard>
        <div className="settings-v2-chip-list">
          {capabilities.map((feature) => (
            <span key={feature} className="settings-v2-badge">{feature}</span>
          ))}
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}

export function AboutPrivacySettingsPage() {
  return (
    <SettingsSection title={L.privacy}>
      <SettingsCard>
        <SettingRow title="Local config" description="Configuration is stored locally; API keys are not shown in plain text or written to frontend localStorage." />
        <SettingRow title="Cache and index" description="Local note index and web cache are stored in .oinb/." />
        <SettingRow title="Web search" description="Only necessary queries are sent to the selected search service; public page excerpts are read from http/https pages." />
        <SettingRow title="Local notes" description="Notes are not uploaded to search services; cookies, history, passwords, and login state are not read." />
      </SettingsCard>
    </SettingsSection>
  );
}

export function BlogPreviewSettingsPage({
  embedded = false,
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
  embedded?: boolean;
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
    <SettingsPageLayout title={L.blog} embedded={embedded}>
      <div data-settings-section="blog-info">
        <SettingsSection title={L.blogInfo}>
          <SettingsCard title={L.blogNameIntro} description={L.blogInfoDesc} className="settings-v2-blog-info-card">
            <div className="settings-v2-blog-info-form">
              <label className="settings-v2-field-label settings-v2-blog-info-field">
                {L.blogName}
                <Input value={blogTitle} onChange={(event) => onBlogTitleChange(event.target.value)} placeholder="OI Notebook" disabled={isLoadingBlogConfig || isSavingBlogConfig} className="settings-v2-field-input" />
              </label>
              <label className="settings-v2-field-label settings-v2-blog-info-field">
                {L.blogSubtitle}
                <Input value={blogSubtitle} onChange={(event) => onBlogSubtitleChange(event.target.value)} placeholder="OI Notebook Blog" disabled={isLoadingBlogConfig || isSavingBlogConfig} className="settings-v2-field-input" />
              </label>
              {blogConfigError ? <div className="settings-v2-field-error settings-v2-blog-info-error">{blogConfigError}</div> : null}
              <div className="settings-v2-blog-info-actions">
                <SettingsButton onClick={onSaveBlogInfo} disabled={isLoadingBlogConfig || isSavingBlogConfig}>{isSavingBlogConfig ? L.saving : L.saveBlog}</SettingsButton>
              </div>
            </div>
          </SettingsCard>
        </SettingsSection>
      </div>
      <div data-settings-section="blog-preview">
        <SettingsSection title={L.localPreview}>
          <SettingsCard>
            <div className="settings-v2-action-row">
              <SettingsButton onClick={onOpenBlog}><ExternalLink className="h-3.5 w-3.5" />{L.openBlog}</SettingsButton>
              <SettingsButton onClick={onRestartBlog} disabled={isRestartingBlog}>
                <RotateCcw className="h-3.5 w-3.5" />
                {isRestartingBlog ? L.restarting : L.restartBlog}
              </SettingsButton>
            </div>
          </SettingsCard>
        </SettingsSection>
      </div>
    </SettingsPageLayout>
  );
}

export function BlogTagManagerSettingsPage({
  embedded = false,
  availableCandidateCount,
  entriesCount,
  aliasesCount,
  hiddenIdsCount,
  onOpenTagManager,
}: {
  className: string;
  embedded?: boolean;
  availableCandidateCount: number;
  entriesCount: number;
  aliasesCount: number;
  hiddenIdsCount: number;
  onOpenTagManager: () => void;
}) {
  return (
    <SettingsPageLayout title={L.blog} embedded={embedded}>
      <SettingsSection title={L.tagManager}>
        <SettingsCard>
          <div className="settings-v2-chip-list">
            <span>{L.availableTags} {availableCandidateCount}</span>
            <span>{L.customTags} {entriesCount}</span>
            <span>{L.aliases} {aliasesCount}</span>
            <span>{L.hiddenTags} {hiddenIdsCount}</span>
          </div>
          <div className="settings-v2-action-row">
            <SettingsButton onClick={onOpenTagManager}>{L.openTagManager}</SettingsButton>
          </div>
        </SettingsCard>
      </SettingsSection>
    </SettingsPageLayout>
  );
}
