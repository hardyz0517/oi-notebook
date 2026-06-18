export type SettingsThemeVariant = "light" | "dark" | "system";

export interface SettingsThemeV1Payload {
  codeThemeId: string;
  variant: SettingsThemeVariant;
  theme: {
    accent: string;
    contrast: number;
    fonts: {
      ui: string | null;
      code: string | null;
    };
    ink: string;
    opaqueWindows: boolean;
    surface: string;
    semanticColors: {
      diffAdded: string;
      diffRemoved: string;
      skill: string;
    };
  };
}

export interface SettingsThemeState {
  mode: SettingsThemeVariant;
  light: SettingsThemeV1Payload;
  dark: SettingsThemeV1Payload;
}
