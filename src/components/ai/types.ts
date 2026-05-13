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
  bodyStartLine: number | null;
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

export interface ApplyPolishedFullNoteInput {
  notePath: string;
  originalBody: string;
  polishedBody: string;
}

export interface AiPolishPreview {
  previewId: string;
  scope: "selection" | "full-note";
  notePath: string;
  originalText: string;
  polishedText: string;
  selectionRange: AiSidebarTextRange | null;
  selectionStartLine?: number | null;
  instruction?: string;
  applied?: boolean;
  ignored?: boolean;
  error?: string;
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
  onApplyPolishedFullNote: (input: ApplyPolishedFullNoteInput) => Promise<void>;
  onOpenPolishReview: (preview: AiPolishPreview) => void;
  onPolishReviewChange: (preview: AiPolishPreview) => void;
}
