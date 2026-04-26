import { getCurrentWindow } from "@tauri-apps/api/window";
import { type KeyboardEvent, useState } from "react";
import { writeNote } from "@/lib/api";

function makeQuickNoteFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `quick-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.md`;
}

export default function QuickNoteApp() {
  const [content, setContent] = useState("");

  async function hideWindow() {
    await getCurrentWindow().hide();
  }

  async function saveAndHide() {
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      await hideWindow();
      return;
    }

    try {
      await writeNote(makeQuickNoteFilename(), trimmedContent);
      setContent("");
      await hideWindow();
    } catch (error) {
      console.error("Failed to save quick note:", error);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void saveAndHide();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      void hideWindow();
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <textarea
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="写下你的速记..."
        className="flex-1 resize-none bg-transparent px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="flex h-6 shrink-0 items-center justify-between px-4 text-[10px] text-muted-foreground">
        <span>Ctrl+Enter 保存 · Esc 取消</span>
      </div>
    </div>
  );
}
