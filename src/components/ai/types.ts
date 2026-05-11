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
  markdownBody: string;
}

export interface AiSidebarProps {
  context: AiSidebarNoteContext;
  isAiConfigured: boolean;
  isOpen: boolean;
  onClose: () => void;
  width?: number;
}
