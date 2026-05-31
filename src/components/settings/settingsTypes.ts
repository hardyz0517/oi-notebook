import type { PointerEvent as ReactPointerEvent } from "react";

export type SettingsCategory = "appearance" | "ai" | "luogu" | "blog" | "data" | "about" | "diagnostics" | "git" | "editor";

export type SettingsSection =
  | "appearance-theme"
  | "ai-api"
  | "ai-local-notes"
  | "ai-web-search"
  | "ai-prompts"
  | "luogu-account"
  | "luogu-rules"
  | "luogu-import-center"
  | "blog-tag-taxonomy"
  | "blog-tag-manager"
  | "blog-info"
  | "blog-preview"
  | "data-storage"
  | "about-version"
  | "about-markdown"
  | "about-privacy"
  | "diagnostics-search"
  | "git-sync";

export type SettingsGroupId = Exclude<SettingsCategory, "editor">;

export type SettingsTarget =
  | { type: "category"; category: SettingsGroupId }
  | { type: "page"; page: SettingsSection };

export type SettingsView = "main" | "prompt-editor" | "ai-config-manager" | "luogu-account-manager";

export type SettingsResizeHandle = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface SettingsNavigationChild {
  id: SettingsSection;
  label: string;
}

export interface SettingsNavigationGroup {
  id: SettingsGroupId;
  label: string;
  developerOnly?: boolean;
  children: SettingsNavigationChild[];
}

export interface SettingsActiveLabel {
  group: string;
  section: string;
}

export type BeginSettingsCenterResize = (
  handle: SettingsResizeHandle,
  event: ReactPointerEvent<HTMLButtonElement>,
) => void;
