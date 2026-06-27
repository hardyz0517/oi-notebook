export type LuoguDifficultyTheme = "light" | "dark" | "system";

export const LUOGU_DIFFICULTY_OPTIONS = [
  { value: "", label: "无", className: "text-muted-foreground", textColor: "var(--muted-foreground)", darkTextColor: "var(--muted-foreground)" },
  { value: "入门", label: "入门", className: "text-[#fe4c61]", textColor: "#fe4c61", darkTextColor: "#fe4c61" },
  { value: "普及-", label: "普及-", className: "text-[#f39c11]", textColor: "#f39c11", darkTextColor: "#f39c11" },
  { value: "普及/提高-", label: "普及/提高-", className: "text-[#d89b00] dark:text-[#ffc116]", textColor: "#ffc116", darkTextColor: "#ffc116" },
  { value: "普及+/提高", label: "普及+/提高", className: "text-[#52c41a]", textColor: "#52c41a", darkTextColor: "#52c41a" },
  { value: "提高+/省选-", label: "提高+/省选-", className: "text-[#3498db]", textColor: "#3498db", darkTextColor: "#3498db" },
  { value: "省选/NOI-", label: "省选/NOI-", className: "text-[#9d3dcf] dark:text-[#c084fc]", textColor: "#9d3dcf", darkTextColor: "#c084fc" },
  { value: "NOI/NOI+/CTSC", label: "NOI/NOI+/CTSC", className: "text-[#0e1d69] dark:text-[#9aa7ff]", textColor: "#0e1d69", darkTextColor: "#9aa7ff" },
] as const;

export function getDifficultyOptionClassName(value: string): string {
  return LUOGU_DIFFICULTY_OPTIONS.find((option) => option.value === value)?.className ?? "text-foreground";
}

export function getDifficultyOptionTextColor(value: string, theme: LuoguDifficultyTheme): string | undefined {
  const option = LUOGU_DIFFICULTY_OPTIONS.find((difficultyOption) => difficultyOption.value === value);
  if (!option) return undefined;
  return theme === "dark" ? option.darkTextColor : option.textColor;
}
