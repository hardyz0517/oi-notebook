import { useEffect, useRef, useState, type ComponentType } from "react";
import { Clipboard, Copy, Download, ExternalLink, FilePlus, FileText, FolderPlus, Pencil, Redo2, Scissors, Settings, TextSelect, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { openExternalUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AppContextMenuProps {
  developerModeEnabled: boolean;
  actions: AppContextMenuActions;
}

export interface AppContextMenuActions {
  createNote: (parentPath?: string) => void;
  createFolder: (parentPath?: string) => void;
  openFile: (path: string) => void;
  renameTreeItem: (path: string, isDirectory: boolean) => void;
  deleteTreeItem: (path: string, isDirectory: boolean) => void;
  openLuoguImport: () => void;
  openBlog: () => void;
  openSettings: () => void;
  minimizeWindow: () => void | Promise<void>;
  maximizeWindow: () => void | Promise<void>;
  restoreWindow: () => void | Promise<void>;
  closeWindow: () => void | Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
}

interface ContextMenuState {
  x: number;
  y: number;
  editable: HTMLElement | null;
  textSurface: HTMLElement | null;
  link: HTMLAnchorElement | null;
  selectedText: string;
  appContext: AppMenuContext | null;
  windowMaximized: boolean;
}

interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
  separatorBefore?: boolean;
  danger?: boolean;
  run: () => void | Promise<void>;
}

type AppMenuContext =
  | { kind: "welcome" | "titlebar" | "file-tree-blank" }
  | { kind: "file-tree-file" | "file-tree-folder"; path: string };

const EDITABLE_SELECTOR = "textarea, input:not([type='button']):not([type='checkbox']):not([type='radio']):not([type='submit']), [contenteditable='true'], .cm-content";
const TEXT_SURFACE_SELECTOR = "[data-markdown-preview-content='true'], [data-ai-markdown-message='true'], [data-app-context-menu-text='true']";
const APP_CONTEXT_SELECTOR = "[data-app-context-menu]";
const MENU_WIDTH = 208;
const SYSTEM_MENU_WIDTH = 176;
const MENU_MAX_HEIGHT = 320;
const MENU_MARGIN = 8;

function getElementTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function getSelectedText(editable: HTMLElement | null): string {
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    const start = editable.selectionStart ?? 0;
    const end = editable.selectionEnd ?? start;
    return editable.value.slice(start, end);
  }
  return window.getSelection()?.toString() ?? "";
}

function getAppMenuContext(target: Element | null): AppMenuContext | null {
  const contextTarget = target?.closest<HTMLElement>(APP_CONTEXT_SELECTOR);
  if (!contextTarget) return null;
  const kind = contextTarget.dataset.appContextMenu;
  if (kind === "welcome" || kind === "titlebar" || kind === "file-tree-blank") return { kind };
  if (kind === "file-tree-file" || kind === "file-tree-folder") {
    return { kind, path: contextTarget.dataset.appContextPath ?? "" };
  }
  return null;
}

function focusEditable(editable: HTMLElement) {
  editable.focus();
}

function dispatchInput(editable: HTMLInputElement | HTMLTextAreaElement, inputType: string, data: string | null) {
  editable.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    inputType,
    data,
  }));
}

async function copyText(text: string) {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to execCommand for WebViews without clipboard permission.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("复制失败");
}

function replaceInputSelection(editable: HTMLInputElement | HTMLTextAreaElement, text: string, inputType: string) {
  const start = editable.selectionStart ?? editable.value.length;
  const end = editable.selectionEnd ?? start;
  editable.setRangeText(text, start, end, "end");
  dispatchInput(editable, inputType, text || null);
}

function selectSurfaceContents(surface: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(surface);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function runEditableCommand(editable: HTMLElement, command: "undo" | "redo") {
  focusEditable(editable);
  if (editable.closest(".cm-editor")) {
    const handled = !editable.dispatchEvent(new KeyboardEvent("keydown", {
      key: command === "undo" ? "z" : "y",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }));
    if (handled) return;
  }
  if (!document.execCommand(command)) {
    toast.info(command === "undo" ? "当前没有可撤销内容" : "当前没有可重做内容");
  }
}

async function pasteIntoEditable(editable: HTMLElement) {
  const text = await navigator.clipboard.readText();
  focusEditable(editable);
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    replaceInputSelection(editable, text, "insertFromPaste");
    return;
  }
  if (!document.execCommand("insertText", false, text)) {
    throw new Error("当前编辑器无法粘贴，请使用 Ctrl+V");
  }
}

async function cutEditableSelection(editable: HTMLElement, selectedText: string) {
  if (!selectedText) return;
  focusEditable(editable);
  const cut = document.execCommand("cut");
  if (cut) return;
  await copyText(selectedText);
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    replaceInputSelection(editable, "", "deleteByCut");
    return;
  }
  if (!document.execCommand("delete")) {
    throw new Error("当前编辑器无法剪切，请使用 Ctrl+X");
  }
}

function selectEditableContents(editable: HTMLElement) {
  focusEditable(editable);
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    editable.select();
    return;
  }
  document.execCommand("selectAll");
}

export default function AppContextMenu({ developerModeEnabled, actions }: AppContextMenuProps) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const handleContextMenu = async (event: MouseEvent) => {
      if (developerModeEnabled && event.shiftKey) {
        setMenu(null);
        return;
      }

      event.preventDefault();
      const target = getElementTarget(event.target);
      const editable = target?.closest<HTMLElement>(EDITABLE_SELECTOR) ?? null;
      const textSurface = target?.closest<HTMLElement>(TEXT_SURFACE_SELECTOR) ?? null;
      const link = target?.closest<HTMLAnchorElement>("a[href]") ?? null;
      const selectedText = getSelectedText(editable);
      const appContext = editable ? null : getAppMenuContext(target);
      const windowMaximized = appContext?.kind === "titlebar"
        ? await actionsRef.current.isWindowMaximized().catch(() => false)
        : false;

      if (!editable && !textSurface && !link && !selectedText && !appContext) {
        setMenu(null);
        return;
      }

      setMenu({
        x: Math.min(event.clientX, window.innerWidth - (appContext?.kind === "titlebar" ? SYSTEM_MENU_WIDTH : MENU_WIDTH) - MENU_MARGIN),
        y: Math.min(event.clientY, window.innerHeight - MENU_MAX_HEIGHT - MENU_MARGIN),
        editable,
        textSurface,
        link,
        selectedText,
        appContext,
        windowMaximized,
      });
    };
    const closeMenu = () => setMenu(null);
    const handlePointerDown = (event: PointerEvent) => {
      if (!getElementTarget(event.target)?.closest(".app-context-menu")) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [developerModeEnabled]);

  if (!menu) return null;

  const runAndClose = (item: ContextMenuItem) => async () => {
    if (item.disabled) return;
    setMenu(null);
    try {
      await item.run();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };
  const linkHref = menu.link?.href ?? "";
  const isSystemMenu = menu.appContext?.kind === "titlebar";
  const items: ContextMenuItem[] = [];

  if (menu.appContext?.kind === "welcome") {
    items.push(
      { id: "create-note", label: "新建笔记", icon: FilePlus, run: () => actions.createNote() },
      { id: "luogu-import", label: "从洛谷导入", icon: Download, run: actions.openLuoguImport },
      { id: "open-blog", label: "打开本地博客", icon: ExternalLink, run: actions.openBlog },
      { id: "open-settings", label: "打开设置", icon: Settings, separatorBefore: true, run: actions.openSettings },
    );
  } else if (menu.appContext?.kind === "titlebar") {
    items.push(
      { id: "restore-window", label: "还原", disabled: !menu.windowMaximized, run: actions.restoreWindow },
      { id: "move-window", label: "移动", disabled: true, run: () => {} },
      { id: "resize-window", label: "大小", disabled: true, run: () => {} },
      { id: "minimize-window", label: "最小化", run: actions.minimizeWindow },
      { id: "maximize-window", label: "最大化", disabled: menu.windowMaximized, run: actions.maximizeWindow },
      { id: "close-window", label: "关闭", shortcut: "Alt+F4", separatorBefore: true, run: actions.closeWindow },
    );
  } else if (menu.appContext?.kind === "file-tree-blank") {
    items.push(
      { id: "create-note", label: "新建文件", icon: FilePlus, run: () => actions.createNote("") },
      { id: "create-folder", label: "新建文件夹", icon: FolderPlus, run: () => actions.createFolder("") },
    );
  } else if (menu.appContext?.kind === "file-tree-folder") {
    const folderPath = menu.appContext.path;
    items.push(
      { id: "create-note", label: "新建文件", icon: FilePlus, run: () => actions.createNote(folderPath) },
      { id: "create-folder", label: "新建文件夹", icon: FolderPlus, run: () => actions.createFolder(folderPath) },
    );
    if (folderPath) {
      items.push(
        { id: "rename-folder", label: "重命名", icon: Pencil, separatorBefore: true, run: () => actions.renameTreeItem(folderPath, true) },
        { id: "delete-folder", label: "删除", icon: Trash2, danger: true, run: () => actions.deleteTreeItem(folderPath, true) },
      );
    }
  } else if (menu.appContext?.kind === "file-tree-file") {
    const filePath = menu.appContext.path;
    items.push(
      { id: "open-file", label: "打开", icon: FileText, run: () => actions.openFile(filePath) },
      { id: "rename-file", label: "重命名", icon: Pencil, separatorBefore: true, run: () => actions.renameTreeItem(filePath, false) },
      { id: "delete-file", label: "删除", icon: Trash2, danger: true, run: () => actions.deleteTreeItem(filePath, false) },
      { id: "copy-relative-path", label: "复制相对路径", icon: Clipboard, separatorBefore: true, run: () => copyText(filePath) },
    );
  } else if (menu.link && /^https?:|^mailto:/i.test(linkHref)) {
    items.push(
      { id: "open-link", label: "打开链接", icon: ExternalLink, run: () => openExternalUrl(linkHref) },
      { id: "copy-link", label: "复制链接", icon: Clipboard, run: () => copyText(linkHref) },
    );
  }

  if (menu.editable) {
    const editable = menu.editable;
    items.push(
      { id: "undo", label: "撤销", shortcut: "Ctrl+Z", icon: Undo2, separatorBefore: items.length > 0, run: () => runEditableCommand(editable, "undo") },
      { id: "redo", label: "重做", shortcut: "Ctrl+Y", icon: Redo2, run: () => runEditableCommand(editable, "redo") },
      { id: "cut", label: "剪切", shortcut: "Ctrl+X", icon: Scissors, disabled: !menu.selectedText, separatorBefore: true, run: () => cutEditableSelection(editable, menu.selectedText) },
      { id: "copy", label: "复制", shortcut: "Ctrl+C", icon: Copy, disabled: !menu.selectedText, run: () => copyText(menu.selectedText) },
      { id: "paste", label: "粘贴", shortcut: "Ctrl+V", icon: Clipboard, disabled: !navigator.clipboard?.readText, run: () => pasteIntoEditable(editable) },
      { id: "select-all", label: "全选", shortcut: "Ctrl+A", icon: TextSelect, separatorBefore: true, run: () => selectEditableContents(editable) },
    );
  } else if (!menu.appContext) {
    items.push(
      { id: "copy", label: "复制", shortcut: "Ctrl+C", icon: Copy, disabled: !menu.selectedText, separatorBefore: items.length > 0, run: () => copyText(menu.selectedText) },
    );
    if (menu.textSurface) {
      const textSurface = menu.textSurface;
      items.push({ id: "select-all", label: "全选", shortcut: "Ctrl+A", icon: TextSelect, run: () => selectSurfaceContents(textSurface) });
    }
  }

  return (
    <div
      role="menu"
      aria-label={isSystemMenu ? "窗口菜单" : "应用菜单"}
      className={cn(
        "app-context-menu fixed z-[240] max-h-80 overflow-y-auto border border-border/75 bg-popover/98 text-popover-foreground shadow-md shadow-black/15 backdrop-blur-sm dark:border-white/10 dark:bg-[#252525]/98",
        isSystemMenu ? "w-44 rounded-sm p-0.5" : "w-52 rounded-md p-1",
      )}
      style={{ left: Math.max(MENU_MARGIN, menu.x), top: Math.max(MENU_MARGIN, menu.y) }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.id}>
            {item.separatorBefore && <div className={cn("border-t border-border/60 dark:border-white/10", isSystemMenu ? "-mx-0.5 my-0.5" : "-mx-1 my-1")} />}
            <button
              type="button"
              role="menuitem"
              className={cn(
                "flex w-full items-center text-left transition-colors",
                isSystemMenu ? "h-7 gap-1.5 rounded-[3px] px-3 text-xs" : "h-7 gap-2 rounded-[4px] px-2.5 text-[13px]",
                item.disabled
                  ? "cursor-default text-muted-foreground/55 hover:bg-muted/50 dark:hover:bg-white/[0.08]"
                  : item.danger
                    ? "text-red-600 hover:bg-red-500/10 hover:text-red-700 active:bg-red-500/15 dark:text-red-300 dark:hover:text-red-200"
                    : "text-popover-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent/80",
              )}
              aria-disabled={item.disabled}
              tabIndex={item.disabled ? -1 : 0}
              onClick={runAndClose(item)}
            >
              {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", item.danger ? "text-current" : "text-muted-foreground")} />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.shortcut && <span className="shrink-0 text-[10px] text-muted-foreground/75">{item.shortcut}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
}
