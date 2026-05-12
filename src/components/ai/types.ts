import type { AiConfig } from "@/lib/api";

export interface AiSidebarNoteContext {
  filePath: string | null;
  title: string;
  bodyLength: number;
  hasBody: boolean;
  tags: string[];
  summary: string;
  selectedText: string;
  selectedTextLength: number | null;
  selectionStatus: "available" | "empty" | "unavailable";
  currentParagraphText: string;
  currentParagraphLength: number | null;
  currentParagraphStatus: "available" | "empty" | "unavailable";
  currentParagraphIsCode: boolean;
  markdownBody: string;
}

export interface AiSidebarProps {
  context: AiSidebarNoteContext;
  isAiConfigured: boolean;
  isOpen: boolean;
  onClose: () => void;
  width?: number;
  aiConfig: AiConfig | null;
  onOpenAiSettings: () => void;
}
