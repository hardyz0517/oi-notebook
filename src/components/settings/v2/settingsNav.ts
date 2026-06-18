import {
  Bot,
  Braces,
  Database,
  Info,
  Keyboard,
  Palette,
  Settings2,
  SlidersHorizontal,
  Trophy,
  Type,
} from "lucide-react";

import type { SettingsGroupId } from "../settingsTypes";

export const SETTINGS_V2_GROUPS: Array<{
  title: string;
  items: SettingsGroupId[];
}> = [
  { title: "个人", items: ["general", "appearance", "ai"] },
  { title: "集成", items: ["luogu", "blog"] },
  { title: "数据", items: ["data"] },
  { title: "编码", items: ["keyboard"] },
  { title: "高级", items: ["advanced"] },
  { title: "关于", items: ["about"] },
];

export const SETTINGS_V2_ICONS: Record<SettingsGroupId, typeof Settings2> = {
  general: Settings2,
  appearance: Palette,
  ai: Bot,
  luogu: Trophy,
  blog: Type,
  data: Database,
  keyboard: Keyboard,
  advanced: SlidersHorizontal,
  about: Info,
  diagnostics: Braces,
};
