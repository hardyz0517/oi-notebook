import { useMemo, useState } from "react";

import { Check, Type } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { SettingsPageLayout } from "../components/SettingsPageLayout";
import { ColorField } from "../primitives/ColorField";
import { NumberField } from "../primitives/NumberField";
import { SelectPill } from "../primitives/SelectPill";
import { SegmentedControl } from "../primitives/SegmentedControl";
import { SettingRow } from "../primitives/SettingRow";
import { SettingsButton } from "../primitives/SettingsButton";
import { SettingsCard, SettingsSection } from "../primitives/SettingsCard";
import { SettingsDialog } from "../primitives/SettingsDialog";
import { SettingsTextField } from "../primitives/SettingsTextField";
import { SliderControl } from "../primitives/SliderControl";
import { ToggleSwitch } from "../primitives/ToggleSwitch";
import {
  CODEX_BUILTIN_THEME_PRESETS,
  decodeSettingsThemeV1,
  encodeSettingsThemeV1,
  normalizeSettingsThemeState,
  type SettingsThemeState,
  type SettingsThemeV1Payload,
  type SettingsThemeVariant,
} from "@/theme";

export type ThemeMode = SettingsThemeVariant;
export type ReducedMotionMode = "system" | "on" | "off";
export type DiffMarkerMode = "color" | "symbols";

type EditableThemeVariant = "light" | "dark";

const L = {
  appearance: "\u5916\u89c2",
  appearanceDesc: "\u7ba1\u7406\u754c\u9762\u4e3b\u9898\u3001\u989c\u8272\u548c\u5b57\u53f7\u3002",
  theme: "\u4e3b\u9898",
  themeMode: "\u4e3b\u9898\u6a21\u5f0f",
  light: "\u6d45\u8272",
  dark: "\u6df1\u8272",
  system: "\u7cfb\u7edf",
  themeConfig: "\u4e3b\u9898\u914d\u7f6e",
  lightTheme: "\u6d45\u8272\u4e3b\u9898",
  darkTheme: "\u6df1\u8272\u4e3b\u9898",
  copy: "\u590d\u5236",
  import: "\u5bfc\u5165",
  accent: "\u5f3a\u8c03\u8272",
  surface: "\u80cc\u666f",
  ink: "\u524d\u666f",
  contrast: "\u5bf9\u6bd4\u5ea6",
  opaqueWindows: "\u534a\u900f\u660e\u4fa7\u8fb9\u680f",
  uiFont: "UI \u5b57\u4f53",
  codeFont: "\u4ee3\u7801\u5b57\u4f53",
  behavior: "\u754c\u9762\u884c\u4e3a",
  uiFontSize: "UI \u5b57\u53f7",
  uiFontSizeDesc: "\u8bbe\u7f6e\u4e2d\u5fc3\u548c\u754c\u9762\u4f7f\u7528\u7684\u57fa\u7840\u5b57\u53f7\u3002",
  codeFontSize: "\u4ee3\u7801\u5b57\u53f7",
  codeFontSizeDesc: "\u4ee3\u7801\u5757\u4e0e\u9884\u89c8\u533a\u57df\u5b57\u53f7\u3002",
  pointerCursor: "\u4f7f\u7528\u6307\u9488\u5149\u6807",
  pointerCursorDesc: "\u60ac\u505c\u53ef\u4ea4\u4e92\u63a7\u4ef6\u65f6\u4f7f\u7528 pointer \u5149\u6807\u3002",
  reducedMotion: "\u51cf\u5c11\u52a8\u6001\u6548\u679c",
  reducedMotionDesc: "\u51cf\u5c11\u52a8\u6548\uff0c\u6216\u8ddf\u968f\u7cfb\u7edf\u504f\u597d\u3002",
  on: "\u5f00\u542f",
  off: "\u5173\u95ed",
  diffMarker: "\u5dee\u5f02\u6807\u8bb0",
  diffMarkerDesc: "\u4f7f\u7528\u989c\u8272\u9ad8\u4eae\uff0c\u6216\u5728\u53d8\u5316\u884c\u663e\u793a + / -\u3002",
  color: "\u989c\u8272",
  symbols: "+ / -",
  importTheme: "\u5bfc\u5165\u4e3b\u9898",
  exportTheme: "\u5bfc\u51fa\u4e3b\u9898",
  cancel: "\u53d6\u6d88",
  finish: "\u5b8c\u6210",
  copied: "\u5df2\u590d\u5236\u4e3b\u9898\u3002",
  clipboardFailed: "\u65e0\u6cd5\u8bbf\u95ee\u526a\u8d34\u677f\uff0c\u8bf7\u624b\u52a8\u590d\u5236\u3002",
};

const THEME_MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: "light", label: L.light },
  { value: "dark", label: L.dark },
  { value: "system", label: L.system },
];

function getVisibleThemeVariants(mode: ThemeMode): EditableThemeVariant[] {
  return mode === "system" ? ["light", "dark"] : [mode];
}

function AppearanceDiffPreview({
  accentColor,
  contrast,
  diffMarkerMode,
}: {
  accentColor: string;
  contrast: number;
  diffMarkerMode: DiffMarkerMode;
}) {
  const before = [
    "const themePreview = {",
    '  surface: "sidebar",',
    '  accent: "#2563EB",',
    "  contrast: 42,",
    "};",
  ];
  const after = [
    "const themePreview = {",
    '  surface: "sidebar-soft",',
    `  accent: "${accentColor}",`,
    `  contrast: ${contrast},`,
    "};",
  ];

  return (
    <div className="settings-v2-diff-preview" data-marker-mode={diffMarkerMode}>
      <div className="settings-v2-diff-pane" data-kind="delete">
        {before.map((line, index) => (
          <div key={`${line}-${index}`} className="settings-v2-diff-line" data-changed={index > 0 && index < 4 ? "true" : "false"}>
            <span>{index + 1}</span>
            <b>-</b>
            <code>{line}</code>
          </div>
        ))}
      </div>
      <div className="settings-v2-diff-pane" data-kind="add">
        {after.map((line, index) => (
          <div key={`${line}-${index}`} className="settings-v2-diff-line" data-changed={index > 0 && index < 4 ? "true" : "false"}>
            <span>{index + 1}</span>
            <b>+</b>
            <code>{line}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThemePresetSelect({
  value,
  variant,
  onChange,
}: {
  value: SettingsThemeV1Payload;
  variant: EditableThemeVariant;
  onChange: (value: SettingsThemeV1Payload) => void;
}) {
  const presets = CODEX_BUILTIN_THEME_PRESETS.filter((preset) => preset.payload.variant === variant);
  const selectedPreset = presets.find((preset) => preset.payload.codeThemeId === value.codeThemeId) ?? presets[0];

  return (
    <DropdownMenu>
      <div className="settings-v2-inline-select">
        <DropdownMenuTrigger asChild>
          <SelectPill ariaLabel={`${variant === "light" ? L.light : L.dark}${L.theme}`}>
            {selectedPreset?.name ?? "Codex"}
          </SelectPill>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="settings-v2-theme-preset-menu" align="end" sideOffset={6}>
          {presets.map((preset) => {
            const selected = preset.id === selectedPreset?.id;
            return (
              <DropdownMenuItem
                key={preset.id}
                className={selected ? "settings-v2-theme-preset-item settings-v2-theme-preset-item-selected" : "settings-v2-theme-preset-item"}
                onSelect={() => {
                  onChange({ ...preset.payload, variant });
                }}
              >
                <span className="settings-v2-theme-preset-icon">
                  <Type aria-hidden className="size-3" />
                </span>
                <span className="settings-v2-theme-preset-label">{preset.name}</span>
                <span className="settings-v2-theme-preset-check" aria-hidden="true">
                  {selected ? <Check className="size-3.5" /> : null}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </div>
    </DropdownMenu>
  );
}

function ThemeEditCard({
  title,
  theme,
  onChange,
  onCopy,
  onImport,
}: {
  title: string;
  theme: SettingsThemeV1Payload;
  onChange: (value: SettingsThemeV1Payload) => void;
  onCopy: (value: SettingsThemeV1Payload) => void;
  onImport: () => void;
}) {
  const updateTheme = (next: Partial<SettingsThemeV1Payload["theme"]>) => {
    onChange({ ...theme, theme: { ...theme.theme, ...next } });
  };

  return (
    <SettingsCard className="settings-v2-theme-group">
      <div className="settings-v2-theme-option-card">
        <div className="settings-v2-theme-option-copy">
          <div className="settings-v2-theme-option-title">{title}</div>
        </div>
        <div className="settings-v2-theme-toolbar">
          <SettingsButton variant="ghost" onClick={() => onCopy(theme)}>{L.copy}</SettingsButton>
          <SettingsButton variant="ghost" onClick={onImport}>{L.import}</SettingsButton>
          <ThemePresetSelect value={theme} variant={theme.variant === "light" ? "light" : "dark"} onChange={onChange} />
        </div>
      </div>
      <div className="settings-v2-nested-row-stack">
        <SettingRow title={L.accent} variant="nested">
          <ColorField value={theme.theme.accent} ariaLabel={`${title} ${L.accent}`} onChange={(accent) => updateTheme({ accent })} />
        </SettingRow>
        <SettingRow title={L.surface} variant="nested">
          <ColorField value={theme.theme.surface} ariaLabel={`${title} ${L.surface}`} onChange={(surface) => updateTheme({ surface })} />
        </SettingRow>
        <SettingRow title={L.ink} variant="nested">
          <ColorField value={theme.theme.ink} ariaLabel={`${title} ${L.ink}`} onChange={(ink) => updateTheme({ ink })} />
        </SettingRow>
        <SettingRow title={L.uiFont} variant="nested">
          <SettingsTextField value={theme.theme.fonts.ui} ariaLabel={`${title} ${L.uiFont}`} onChange={(ui) => updateTheme({ fonts: { ...theme.theme.fonts, ui } })} />
        </SettingRow>
        <SettingRow title={L.codeFont} variant="nested">
          <SettingsTextField value={theme.theme.fonts.code} ariaLabel={`${title} ${L.codeFont}`} onChange={(code) => updateTheme({ fonts: { ...theme.theme.fonts, code } })} />
        </SettingRow>
        <SettingRow title={L.opaqueWindows} variant="nested">
          <ToggleSwitch checked={theme.theme.opaqueWindows} ariaLabel={`${title} ${L.opaqueWindows}`} onChange={(opaqueWindows) => updateTheme({ opaqueWindows })} />
        </SettingRow>
        <SettingRow title={L.contrast} variant="nested">
          <SliderControl value={theme.theme.contrast} min={0} max={100} ariaLabel={`${title} ${L.contrast}`} onChange={(contrast) => updateTheme({ contrast })} />
        </SettingRow>
      </div>
    </SettingsCard>
  );
}

export function AppearanceSettingsPage({
  appTheme,
  resolvedTheme,
  themeState,
  uiFontSize,
  uiFontSizeMin,
  uiFontSizeMax,
  codeFontSize,
  codeFontSizeMin,
  codeFontSizeMax,
  pointerCursor,
  reducedMotion,
  diffMarkerMode,
  onThemeChange,
  onThemeStateChange,
  onUiFontSizeChange,
  onCodeFontSizeChange,
  onPointerCursorChange,
  onReducedMotionChange,
  onDiffMarkerModeChange,
}: {
  appTheme: ThemeMode;
  resolvedTheme: "dark" | "light";
  themeState: SettingsThemeState;
  uiFontSize: number;
  uiFontSizeMin: number;
  uiFontSizeMax: number;
  codeFontSize: number;
  codeFontSizeMin: number;
  codeFontSizeMax: number;
  pointerCursor: boolean;
  reducedMotion: ReducedMotionMode;
  diffMarkerMode: DiffMarkerMode;
  onThemeChange: (value: ThemeMode) => void;
  onThemeStateChange: (value: SettingsThemeState) => void;
  onUiFontSizeChange: (value: number) => void;
  onCodeFontSizeChange: (value: number) => void;
  onPointerCursorChange: (value: boolean) => void;
  onReducedMotionChange: (value: ReducedMotionMode) => void;
  onDiffMarkerModeChange: (value: DiffMarkerMode) => void;
}) {
  const safeThemeState = useMemo(() => normalizeSettingsThemeState(themeState), [themeState]);
  const activeTheme = resolvedTheme === "light" ? safeThemeState.light : safeThemeState.dark;
  const visibleThemeVariants = getVisibleThemeVariants(appTheme);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importInput, setImportInput] = useState("");
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);
  const [manualExportValue, setManualExportValue] = useState("");
  const exportValue = manualExportValue || encodeSettingsThemeV1(activeTheme);

  const updateThemeVariant = (variant: EditableThemeVariant, value: SettingsThemeV1Payload) => {
    onThemeStateChange({ ...safeThemeState, [variant]: { ...value, variant } });
  };

  const handleModeChange = (nextMode: ThemeMode) => {
    onThemeChange(nextMode);
    onThemeStateChange({ ...safeThemeState, mode: nextMode });
  };

  const handleImport = () => {
    const decoded = decodeSettingsThemeV1(importInput);
    if (!decoded.ok) {
      setDialogMessage(decoded.error);
      return;
    }
    const targetVariant = decoded.value.variant === "light" ? "light" : decoded.value.variant === "dark" ? "dark" : resolvedTheme;
    updateThemeVariant(targetVariant, { ...decoded.value, variant: targetVariant });
    setDialogMessage(null);
    setImportOpen(false);
    setImportInput("");
  };

  const openImportDialog = () => {
    setDialogMessage(null);
    setImportOpen(true);
  };

  const handleCopyTheme = async (theme: SettingsThemeV1Payload) => {
    const nextExportValue = encodeSettingsThemeV1(theme);
    setManualExportValue(nextExportValue);
    try {
      await navigator.clipboard.writeText(nextExportValue);
      setDialogMessage(L.copied);
    } catch {
      setDialogMessage(L.clipboardFailed);
      setExportOpen(true);
    }
  };

  return (
    <SettingsPageLayout title={L.appearance} description={L.appearanceDesc}>
      <SettingsSection title={L.theme}>
        <SettingsCard>
          <SettingRow title={L.themeMode} variant="grid">
            <SegmentedControl value={appTheme} ariaLabel={L.themeMode} options={THEME_MODE_OPTIONS} onChange={handleModeChange} />
          </SettingRow>
          <div className="settings-v2-preview-row">
            <AppearanceDiffPreview accentColor={activeTheme.theme.accent} contrast={activeTheme.theme.contrast} diffMarkerMode={diffMarkerMode} />
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={L.themeConfig}>
        {visibleThemeVariants.includes("light") ? (
          <ThemeEditCard title={L.lightTheme} theme={safeThemeState.light} onChange={(value) => updateThemeVariant("light", value)} onCopy={(value) => void handleCopyTheme(value)} onImport={openImportDialog} />
        ) : null}
        {visibleThemeVariants.includes("dark") ? (
          <ThemeEditCard title={L.darkTheme} theme={safeThemeState.dark} onChange={(value) => updateThemeVariant("dark", value)} onCopy={(value) => void handleCopyTheme(value)} onImport={openImportDialog} />
        ) : null}
      </SettingsSection>

      <SettingsSection title={L.behavior}>
        <SettingsCard>
          <SettingRow title={L.uiFontSize} description={L.uiFontSizeDesc} variant="grid">
            <NumberField value={uiFontSize} min={uiFontSizeMin} max={uiFontSizeMax} unit="px" ariaLabel={L.uiFontSize} onChange={onUiFontSizeChange} />
          </SettingRow>
          <SettingRow title={L.codeFontSize} description={L.codeFontSizeDesc} variant="grid">
            <NumberField value={codeFontSize} min={codeFontSizeMin} max={codeFontSizeMax} unit="px" ariaLabel={L.codeFontSize} onChange={onCodeFontSizeChange} />
          </SettingRow>
          <SettingRow title={L.pointerCursor} description={L.pointerCursorDesc} variant="grid">
            <ToggleSwitch checked={pointerCursor} ariaLabel={L.pointerCursor} onChange={onPointerCursorChange} />
          </SettingRow>
          <SettingRow title={L.reducedMotion} description={L.reducedMotionDesc} variant="grid">
            <SegmentedControl
              value={reducedMotion}
              ariaLabel={L.reducedMotion}
              options={[
                { value: "system", label: L.system },
                { value: "on", label: L.on },
                { value: "off", label: L.off },
              ]}
              onChange={onReducedMotionChange}
            />
          </SettingRow>
          <SettingRow title={L.diffMarker} description={L.diffMarkerDesc} variant="grid">
            <SegmentedControl
              value={diffMarkerMode}
              ariaLabel={L.diffMarker}
              options={[
                { value: "color", label: L.color },
                { value: "symbols", label: L.symbols },
              ]}
              onChange={onDiffMarkerModeChange}
            />
          </SettingRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsDialog
        open={importOpen}
        title={L.importTheme}
        onClose={() => setImportOpen(false)}
        footer={(
          <>
            <SettingsButton variant="ghost" onClick={() => setImportOpen(false)}>{L.cancel}</SettingsButton>
            <SettingsButton onClick={handleImport}>{L.importTheme}</SettingsButton>
          </>
        )}
      >
        <textarea className="settings-v2-theme-textarea" value={importInput} spellCheck={false} placeholder="codex-theme-v1:{...}" onChange={(event) => setImportInput(event.target.value)} />
        {dialogMessage ? <div className="settings-v2-field-error">{dialogMessage}</div> : null}
      </SettingsDialog>

      <SettingsDialog open={exportOpen} title={L.exportTheme} onClose={() => setExportOpen(false)} footer={<SettingsButton onClick={() => setExportOpen(false)}>{L.finish}</SettingsButton>}>
        <textarea className="settings-v2-theme-textarea" value={exportValue} readOnly spellCheck={false} />
        {dialogMessage ? <div className="settings-v2-row-description">{dialogMessage}</div> : null}
      </SettingsDialog>
    </SettingsPageLayout>
  );
}
