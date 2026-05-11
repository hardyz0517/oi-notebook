export interface AiSidebarNoteContext {
  filePath: string | null;
  title: string;
  bodyLength: number;
  hasBody: boolean;
  tags: string[];
  summary: string;
  selectedTextLength: number | null;
  selectionStatus: "available" | "empty" | "unavailable";
}

export interface AiSidebarProps {
  context: AiSidebarNoteContext;
  onClose: () => void;
}
