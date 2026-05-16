import type { AiConfig } from "@/lib/api";
import type { SolutionFormatChange } from "@/lib/solutionFormatter";

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
  applyKind?: "ai-polish" | "solution-format";
}

export interface AiPolishPreview {
  previewId: string;
  previewKind?: "ai-polish" | "solution-format";
  scope: "selection" | "full-note";
  notePath: string;
  originalText: string;
  polishedText: string;
  selectionRange: AiSidebarTextRange | null;
  selectionStartLine?: number | null;
  instruction?: string;
  changes?: SolutionFormatChange[];
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
  isMaximized?: boolean;
  onMaximizedChange?: (isMaximized: boolean) => void;
  aiConfig: AiConfig | null;
  onAiConfigChange: (config: AiConfig) => void;
  onOpenAiSettings: () => void;
  onApplySuggestedTags: (notePath: string, suggestedTags: string[]) => Promise<void>;
  onApplyPolishedSelection: (input: ApplyPolishedSelectionInput) => Promise<void>;
  onApplyPolishedFullNote: (input: ApplyPolishedFullNoteInput) => Promise<void>;
  onOpenPolishReview: (preview: AiPolishPreview) => void;
  onPolishReviewChange: (preview: AiPolishPreview) => void;
}
