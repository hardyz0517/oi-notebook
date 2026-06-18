import type { SettingsThemeState, SettingsThemeV1Payload } from "./settingsThemeTypes";

export interface SettingsThemePreset {
  id: string;
  name: string;
  payload: SettingsThemeV1Payload;
  source: "codex-builtin";
}

function createPreset(
  id: string,
  name: string,
  payload: SettingsThemeV1Payload,
): SettingsThemePreset {
  return { id, name, payload, source: "codex-builtin" };
}

export const CODEX_LIGHT_THEME: SettingsThemeV1Payload = {
  codeThemeId: "codex",
  variant: "light",
  theme: {
    accent: "#0169CC",
    contrast: 45,
    fonts: {
      code: null,
      ui: null,
    },
    ink: "#0D0D0D",
    opaqueWindows: false,
    semanticColors: {
      diffAdded: "#00A240",
      diffRemoved: "#E02E2A",
      skill: "#751ED9",
    },
    surface: "#FFFFFF",
  },
};

export const CODEX_DARK_THEME: SettingsThemeV1Payload = {
  codeThemeId: "codex",
  variant: "dark",
  theme: {
    accent: "#0169CC",
    contrast: 60,
    fonts: {
      code: null,
      ui: null,
    },
    ink: "#FCFCFC",
    opaqueWindows: false,
    semanticColors: {
      diffAdded: "#00A240",
      diffRemoved: "#E02E2A",
      skill: "#B06DFF",
    },
    surface: "#111111",
  },
};

export const CODEX_BUILTIN_THEME_PRESETS: SettingsThemePreset[] = [
  createPreset("codex-light", "Codex", CODEX_LIGHT_THEME),
  createPreset("codex-dark", "Codex", CODEX_DARK_THEME),
  createPreset("linear-light", "Linear", {
    codeThemeId: "linear",
    variant: "light",
    theme: {
      accent: "#5E6AD2",
      contrast: 45,
      fonts: {
        code: null,
        ui: "Inter",
      },
      ink: "#1B1B1B",
      opaqueWindows: true,
      semanticColors: {
        diffAdded: "#52A450",
        diffRemoved: "#C94446",
        skill: "#8160D8",
      },
      surface: "#FCFCFD",
    },
  }),
  createPreset("linear-dark", "Linear", {
    codeThemeId: "linear",
    variant: "dark",
    theme: {
      accent: "#606ACC",
      contrast: 60,
      fonts: {
        code: null,
        ui: "Inter",
      },
      ink: "#E3E4E6",
      opaqueWindows: true,
      semanticColors: {
        diffAdded: "#69C967",
        diffRemoved: "#FF7E78",
        skill: "#C2A1FF",
      },
      surface: "#0F0F11",
    },
  }),
  createPreset("vercel-light", "Vercel", {
    codeThemeId: "vercel",
    variant: "light",
    theme: {
      accent: "#006AFF",
      contrast: 40,
      fonts: {
        code: "\"Geist Mono\", ui-monospace, \"SFMono-Regular\"",
        ui: "Geist, Inter",
      },
      ink: "#171717",
      opaqueWindows: true,
      semanticColors: {
        diffAdded: "#28A948",
        diffRemoved: "#EB001D",
        skill: "#A100F8",
      },
      surface: "#FFFFFF",
    },
  }),
  createPreset("vercel-dark", "Vercel", {
    codeThemeId: "vercel",
    variant: "dark",
    theme: {
      accent: "#006EFE",
      contrast: 50,
      fonts: {
        code: "\"Geist Mono\", ui-monospace, \"SFMono-Regular\"",
        ui: "Geist, Inter",
      },
      ink: "#EDEDED",
      opaqueWindows: true,
      semanticColors: {
        diffAdded: "#00AD3A",
        diffRemoved: "#F13342",
        skill: "#9540D5",
      },
      surface: "#000000",
    },
  }),
  createPreset("github-light", "GitHub", {
    codeThemeId: "github",
    variant: "light",
    theme: {
      accent: "#0969DA",
      contrast: 45,
      fonts: {
        code: null,
        ui: null,
      },
      ink: "#1F2328",
      opaqueWindows: false,
      semanticColors: {
        diffAdded: "#1A7F37",
        diffRemoved: "#CF222E",
        skill: "#8250DF",
      },
      surface: "#FFFFFF",
    },
  }),
  createPreset("github-dark", "GitHub", {
    codeThemeId: "github",
    variant: "dark",
    theme: {
      accent: "#1F6FEB",
      contrast: 60,
      fonts: {
        code: null,
        ui: null,
      },
      ink: "#E6EDF3",
      opaqueWindows: false,
      semanticColors: {
        diffAdded: "#3FB950",
        diffRemoved: "#F85149",
        skill: "#BC8CFF",
      },
      surface: "#0D1117",
    },
  }),
  createPreset("xcode-light", "Xcode", {
    codeThemeId: "xcode",
    variant: "light",
    theme: {
      accent: "#0E0EFF",
      contrast: 45,
      fonts: {
        code: "\"SFMono-Regular\"",
        ui: null,
      },
      ink: "#000000",
      opaqueWindows: false,
      semanticColors: {
        diffAdded: "#00A240",
        diffRemoved: "#C41A16",
        skill: "#0E0EFF",
      },
      surface: "#FFFFFF",
    },
  }),
  createPreset("xcode-dark", "Xcode", {
    codeThemeId: "xcode",
    variant: "dark",
    theme: {
      accent: "#5482FF",
      contrast: 60,
      fonts: {
        code: "\"SFMono-Medium\"",
        ui: null,
      },
      ink: "#FFFFFF",
      opaqueWindows: false,
      semanticColors: {
        diffAdded: "#67B7A4",
        diffRemoved: "#FC6A5D",
        skill: "#5482FF",
      },
      surface: "#1F1F24",
    },
  }),
  createPreset("one-light", "One", {
    codeThemeId: "one",
    variant: "light",
    theme: {
      accent: "#526FFF",
      contrast: 45,
      fonts: {
        code: null,
        ui: null,
      },
      ink: "#383A42",
      opaqueWindows: false,
      semanticColors: {
        diffAdded: "#3BBA54",
        diffRemoved: "#E45649",
        skill: "#526FFF",
      },
      surface: "#FAFAFA",
    },
  }),
  createPreset("one-dark", "One", {
    codeThemeId: "one",
    variant: "dark",
    theme: {
      accent: "#4D78CC",
      contrast: 60,
      fonts: {
        code: null,
        ui: null,
      },
      ink: "#ABB2BF",
      opaqueWindows: false,
      semanticColors: {
        diffAdded: "#8CC265",
        diffRemoved: "#E05561",
        skill: "#C162DE",
      },
      surface: "#282C34",
    },
  }),
  createPreset("notion-light", "Notion", {
    codeThemeId: "notion",
    variant: "light",
    theme: {
      accent: "#3183D8",
      contrast: 45,
      fonts: {
        code: null,
        ui: null,
      },
      ink: "#37352F",
      opaqueWindows: true,
      semanticColors: {
        diffAdded: "#008000",
        diffRemoved: "#A31515",
        skill: "#0000FF",
      },
      surface: "#FFFFFF",
    },
  }),
  createPreset("notion-dark", "Notion", {
    codeThemeId: "notion",
    variant: "dark",
    theme: {
      accent: "#3183D8",
      contrast: 60,
      fonts: {
        code: null,
        ui: null,
      },
      ink: "#D9D9D8",
      opaqueWindows: true,
      semanticColors: {
        diffAdded: "#4EC9B0",
        diffRemoved: "#FA423E",
        skill: "#3183D8",
      },
      surface: "#191919",
    },
  }),
  createPreset("raycast-light", "Raycast", {
    codeThemeId: "raycast",
    variant: "light",
    theme: {
      accent: "#FF6363",
      contrast: 45,
      fonts: {
        code: "\"Jetbrains Mono\"",
        ui: "Inter",
      },
      ink: "#030303",
      opaqueWindows: false,
      semanticColors: {
        diffAdded: "#006B4F",
        diffRemoved: "#B12424",
        skill: "#9A1B6E",
      },
      surface: "#FFFFFF",
    },
  }),
  createPreset("raycast-dark", "Raycast", {
    codeThemeId: "raycast",
    variant: "dark",
    theme: {
      accent: "#FF6363",
      contrast: 60,
      fonts: {
        code: "\"Jetbrains Mono\"",
        ui: "Inter",
      },
      ink: "#FEFEFE",
      opaqueWindows: false,
      semanticColors: {
        diffAdded: "#59D499",
        diffRemoved: "#FF6363",
        skill: "#CF2F98",
      },
      surface: "#101010",
    },
  }),
];

export const DEFAULT_SETTINGS_THEME_STATE: SettingsThemeState = {
  mode: "system",
  light: CODEX_LIGHT_THEME,
  dark: CODEX_DARK_THEME,
};
