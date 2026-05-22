import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteFileInfo } from "@/types/note";

interface FileTreeProps {
  files: NoteFileInfo[];
  activeFilePath: string | null;
  activeDirectoryPath: string | null;
  rootCollapsed: boolean;
  createFolderRequest: { parentPath: string; requestId: number } | null;
  onSelectFile: (path: string) => void;
  onSelectDirectory: (path: string) => void;
  onClearSelection: () => void;
  onCreateFolder: (parentPath: string, name: string) => Promise<string>;
  onDeleteItem: (path: string, isDirectory: boolean) => void;
  onRenameItem: (path: string, isDirectory: boolean) => void;
}

interface TreeNode {
  name: string;
  path: string;
  displayTitle?: string;
  isDirectory: boolean;
  modified: string;
  children: TreeNode[];
}

const COLLAPSED_FOLDERS_STORAGE_KEY = "oi-notebook.collapsedFolders";
const STANDARD_DIRECTORY_ORDER = ["tricks", "problems", "luogu", "inbox"];
const TREE_DEPTH_INDENT = 11;
const FOLDER_ROW_LEFT = 1;
const FILE_ROW_LEFT = 18;

function stripMdExtension(name: string): string {
  return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function getNodeDisplayTitle(node: TreeNode): string {
  if (node.isDirectory) return node.name;
  return node.displayTitle?.trim() || stripMdExtension(node.name);
}

function readStoredStringArray(key: string): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

function makeDirectoryNode(path: string): TreeNode {
  const name = path.split("/").pop() ?? path;
  return {
    name,
    path,
    isDirectory: true,
    modified: "",
    children: [],
  };
}

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;

  const aTop = !a.path.includes("/") ? STANDARD_DIRECTORY_ORDER.indexOf(a.path) : -1;
  const bTop = !b.path.includes("/") ? STANDARD_DIRECTORY_ORDER.indexOf(b.path) : -1;
  if (aTop !== -1 || bTop !== -1) {
    if (aTop === -1) return 1;
    if (bTop === -1) return -1;
    if (aTop !== bTop) return aTop - bTop;
  }

  return a.name.localeCompare(b.name, "zh-CN", { sensitivity: "base" });
}

function buildTree(entries: NoteFileInfo[]): TreeNode[] {
  const root: TreeNode[] = [];
  const directories = new Map<string, TreeNode>();

  const ensureDirectory = (path: string): TreeNode => {
    const normalized = path.replace(/\/+$/g, "");
    const existing = directories.get(normalized);
    if (existing) return existing;

    const node = makeDirectoryNode(normalized);
    directories.set(normalized, node);
    const slashIndex = normalized.lastIndexOf("/");
    if (slashIndex === -1) {
      root.push(node);
    } else {
      ensureDirectory(normalized.slice(0, slashIndex)).children.push(node);
    }
    return node;
  };

  for (const entry of entries) {
    const path = entry.path.replace(/\\/g, "/").replace(/\/+$/g, "");
    if (!path) continue;
    if (entry.isDirectory) {
      const node = ensureDirectory(path);
      node.name = entry.name;
      node.modified = entry.modified;
      continue;
    }

    const slashIndex = path.lastIndexOf("/");
    const fileNode: TreeNode = {
      name: entry.name,
      path,
      displayTitle: entry.displayTitle,
      isDirectory: false,
      modified: entry.modified,
      children: [],
    };

    if (slashIndex === -1) {
      root.push(fileNode);
    } else {
      ensureDirectory(path.slice(0, slashIndex)).children.push(fileNode);
    }
  }

  const sortBranch = (nodes: TreeNode[]) => {
    nodes.sort(compareNodes);
    for (const node of nodes) sortBranch(node.children);
  };
  sortBranch(root);

  return root;
}

function hasActiveDescendant(node: TreeNode, activeFilePath: string | null): boolean {
  if (!activeFilePath) return false;
  if (!node.isDirectory) return node.path === activeFilePath;
  return activeFilePath === node.path || activeFilePath.startsWith(`${node.path}/`);
}

export default function FileTree({
  files,
  activeFilePath,
  activeDirectoryPath,
  rootCollapsed,
  createFolderRequest,
  onSelectFile,
  onSelectDirectory,
  onClearSelection,
  onCreateFolder,
  onDeleteItem,
  onRenameItem,
}: FileTreeProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(readStoredStringArray(COLLAPSED_FOLDERS_STORAGE_KEY)),
  );
  const [inlineFolderParent, setInlineFolderParent] = useState<string | null>(null);
  const [inlineFolderName, setInlineFolderName] = useState("");
  const [inlineFolderError, setInlineFolderError] = useState<string | null>(null);
  const inlineInputRef = useRef<HTMLInputElement | null>(null);
  const tree = useMemo(() => buildTree(files), [files]);

  useEffect(() => {
    window.localStorage.setItem(
      COLLAPSED_FOLDERS_STORAGE_KEY,
      JSON.stringify(Array.from(collapsedFolders)),
    );
  }, [collapsedFolders]);

  useEffect(() => {
    if (!createFolderRequest) return;
    const parentPath = createFolderRequest.parentPath.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    setInlineFolderParent(parentPath);
    setInlineFolderName("");
    setInlineFolderError(null);
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (parentPath) {
        const parts = parentPath.split("/");
        for (let index = 0; index < parts.length; index += 1) {
          next.delete(parts.slice(0, index + 1).join("/"));
        }
      }
      return next;
    });
    if (parentPath) {
      onSelectDirectory(parentPath);
    } else {
      onSelectDirectory("");
    }
  }, [createFolderRequest, onSelectDirectory]);

  useEffect(() => {
    if (inlineFolderParent === null) return;
    window.setTimeout(() => {
      inlineInputRef.current?.focus();
      inlineInputRef.current?.select();
    }, 0);
  }, [inlineFolderParent]);

  const toggleFolder = (folderPath: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  };

  const cancelInlineFolder = () => {
    setInlineFolderParent(null);
    setInlineFolderName("");
    setInlineFolderError(null);
  };

  const commitInlineFolder = async () => {
    if (inlineFolderParent === null) return;
    const name = inlineFolderName.trim();
    if (!name) {
      setInlineFolderError("Folder name is required");
      return;
    }

    try {
      const createdPath = await onCreateFolder(inlineFolderParent, name);
      setInlineFolderParent(null);
      setInlineFolderName("");
      setInlineFolderError(null);
      if (createdPath) onSelectDirectory(createdPath);
    } catch (error) {
      setInlineFolderError(error instanceof Error ? error.message : String(error));
    }
  };

  const renderInlineFolderInput = (parentPath: string, depth: number) => {
    if (inlineFolderParent !== parentPath) return null;
    return (
      <li key={`inline-folder:${parentPath || "root"}`} className="grid gap-0.5 py-px">
        <div
          className="flex min-w-0 items-center rounded-[2px] border border-ring/70 bg-background px-1"
          style={{ marginLeft: `${FILE_ROW_LEFT + depth * TREE_DEPTH_INDENT}px`, marginRight: "3px", height: "27px" }}
        >
          <Folder className="mr-1 shrink-0 text-muted-foreground/95" size={16} strokeWidth={2} />
          <input
            ref={inlineInputRef}
            value={inlineFolderName}
            onChange={(event) => {
              setInlineFolderName(event.target.value);
              setInlineFolderError(null);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                void commitInlineFolder();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelInlineFolder();
              }
            }}
            onBlur={cancelInlineFolder}
            className="h-6 min-w-0 flex-1 bg-transparent text-[14.5px] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="New folder"
          />
        </div>
        {inlineFolderError && (
          <p
            className="pr-2 text-[10px] leading-4 text-destructive"
            style={{ paddingLeft: `${FILE_ROW_LEFT + 4 + depth * TREE_DEPTH_INDENT}px` }}
          >
            {inlineFolderError}
          </p>
        )}
      </li>
    );
  };

  const renderNode = (node: TreeNode, depth: number): ReactNode => {
    const isCollapsed = collapsedFolders.has(node.path);
    const isActive = node.isDirectory ? node.path === activeDirectoryPath : node.path === activeFilePath;
    const hasActive = hasActiveDescendant(node, activeFilePath);
    const FolderIcon = isCollapsed ? Folder : FolderOpen;

    if (node.isDirectory) {
      return (
        <li key={`folder:${node.path}`} className="group/tree-node">
          <div className="group relative">
            <button
              type="button"
              className={cn(
                "app-file-row app-file-folder-row relative flex w-full min-w-0 items-center border border-transparent pr-1 text-left transition-colors duration-100",
                isActive || hasActive ? "text-accent-foreground" : "text-foreground/92",
              )}
              style={{ paddingLeft: `${FOLDER_ROW_LEFT + depth * TREE_DEPTH_INDENT}px` }}
              data-active={isActive ? "true" : "false"}
              onClick={() => {
                onSelectDirectory(node.path);
                toggleFolder(node.path);
              }}
              aria-expanded={!isCollapsed}
              title={node.path}
            >
              <ChevronRight
                className={cn("mr-0.5 shrink-0 transition-transform", !isCollapsed && "rotate-90")}
                size={14}
                strokeWidth={2.15}
              />
              <FolderIcon className="mr-1 shrink-0 text-muted-foreground/95" size={16} strokeWidth={2} />
              <span className="min-w-0 truncate text-[14.5px] font-medium leading-[26px]">{node.name}</span>
            </button>

            <div className="app-file-actions absolute right-0.5 top-1/2 flex -translate-y-1/2 items-center gap-px opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                title="重命名文件夹"
                aria-label="重命名文件夹"
                onClick={(e) => {
                  e.stopPropagation();
                  onRenameItem(node.path, true);
                }}
                className="app-file-action flex items-center justify-center text-muted-foreground/80 hover:bg-muted hover:text-foreground"
              >
                <Pencil />
              </button>
              <button
                type="button"
                title="删除文件夹"
                aria-label="删除文件夹"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteItem(node.path, true);
                }}
                className="app-file-action app-file-action-danger flex items-center justify-center text-muted-foreground/80 hover:bg-destructive/15 hover:text-destructive"
              >
                <Trash2 />
              </button>
            </div>
          </div>
          {isCollapsed ? null : (
            <ul className="w-full space-y-px">
              {renderInlineFolderInput(node.path, depth + 1)}
              {node.children.length === 0 && inlineFolderParent !== node.path ? (
                <li
                  className="app-file-empty py-1 text-[11px] leading-4 text-muted-foreground/75"
                  style={{ paddingLeft: `${FILE_ROW_LEFT + 1 + depth * TREE_DEPTH_INDENT}px` }}
                >
                  空文件夹
                </li>
              ) : null}
              {node.children.map((child) => renderNode(child, depth + 1))}
            </ul>
          )}
        </li>
      );
    }

    return (
      <li key={`file:${node.path}`} className="group relative">
        <button
          type="button"
          onClick={() => onSelectFile(node.path)}
          title={node.path}
          data-active={isActive ? "true" : "false"}
          className={cn(
            "app-file-row relative flex w-full min-w-0 items-center border border-transparent pr-1 text-left transition-colors duration-100",
            isActive ? "text-accent-foreground" : "text-foreground/92",
          )}
          style={{ paddingLeft: `${FILE_ROW_LEFT + depth * TREE_DEPTH_INDENT}px` }}
        >
          <FileText className="mr-1 shrink-0 text-muted-foreground/88" size={16} strokeWidth={1.95} />
          <span className="app-file-name min-w-0 truncate text-[14.5px] font-normal leading-[26px]">
            {getNodeDisplayTitle(node)}
          </span>
        </button>

        <div className="app-file-actions absolute right-0.5 top-1/2 flex -translate-y-1/2 items-center gap-px opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            title="重命名"
            aria-label="重命名"
            onClick={(e) => {
              e.stopPropagation();
              onRenameItem(node.path, false);
            }}
            className="app-file-action flex items-center justify-center text-muted-foreground/80 hover:bg-muted hover:text-foreground"
          >
            <Pencil />
          </button>
          <button
            type="button"
            title="删除"
            aria-label="删除"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteItem(node.path, false);
            }}
            className="app-file-action app-file-action-danger flex items-center justify-center text-muted-foreground/80 hover:bg-destructive/15 hover:text-destructive"
          >
            <Trash2 />
          </button>
        </div>
      </li>
    );
  };

  return (
    <div
      className="app-file-tree-scroll h-full min-h-0 w-full overflow-y-auto overflow-x-hidden"
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest(".app-file-row, .app-file-actions, input")) return;
        onClearSelection();
      }}
    >
      <div className="app-file-tree w-full px-1 py-1">
        {rootCollapsed ? null : (
          <ul className="w-full space-y-px">
            {renderInlineFolderInput("", 0)}
            {tree.length === 0 && inlineFolderParent !== "" ? (
              <li
                className="app-file-empty py-1 text-[11px] leading-4 text-muted-foreground/75"
                style={{ paddingLeft: `${FILE_ROW_LEFT + 1}px` }}
              >
                No notes yet
              </li>
            ) : null}
            {tree.map((node) => renderNode(node, 0))}
          </ul>
        )}
      </div>
    </div>
  );
}
