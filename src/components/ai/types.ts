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
  selectedTextRange: AiSidebarTextRange | null;
  selectionStatus: "available" | "empty" | "unavailable";
  currentParagraphText: string;
  currentParagraphLength: number | null;
  currentParagraphStatus: "available" | "empty" | "unavailable";
  currentParagraphIsCode: boolean;
  markdownBody: string;
}

export interface AiSidebarTextRange {
  from: number;
  to: number;
}

export interface ApplyPolishedSelectionInput {
  notePath: string;
  originalText: string;
  polishedText: string;
  selectionRange: AiSidebarTextRange | null;
}

export interface AiSidebarProps {
  context: AiSidebarNoteContext;
  isAiConfigured: boolean;
  isOpen: boolean;
  onClose: () => void;
  width?: number;
  aiConfig: AiConfig | null;
  onOpenAiSettings: () => void;
  onApplySuggestedTags: (notePath: string, suggestedTags: string[]) => Promise<void>;
  onApplyPolishedSelection: (input: ApplyPolishedSelectionInput) => Promise<void>;
}
