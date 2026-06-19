import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, FileText, Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteFileInfo } from "@/types/note";

interface FileTreeProps {
  files: NoteFileInfo[];
  activeFilePath: string | null;
  activeDirectoryPath: string | null;
  rootCollapsed: boolean;
  createFileRequest: { parentPath: string; requestId: number } | null;
  createFolderRequest: { parentPath: string; requestId: number } | null;
  onSelectFile: (path: string) => void;
  onSelectDirectory: (path: string) => void;
  onClearSelection: () => void;
  onCreateFile: (parentPath: string, name: string) => Promise<string>;
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
const TREE_DEPTH_INDENT = 9;
const TREE_ROW_LEFT = 4;
const TREE_LABEL_LEFT_OFFSET = 40;

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
  createFileRequest,
  createFolderRequest,
  onSelectFile,
  onSelectDirectory,
  onClearSelection,
  onCreateFile,
  onCreateFolder,
  onDeleteItem,
  onRenameItem,
}: FileTreeProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(readStoredStringArray(COLLAPSED_FOLDERS_STORAGE_KEY)),
  );
  const [inlineFileParent, setInlineFileParent] = useState<string | null>(null);
  const [inlineFileName, setInlineFileName] = useState("");
  const [inlineFileError, setInlineFileError] = useState<string | null>(null);
  const [inlineFolderParent, setInlineFolderParent] = useState<string | null>(null);
  const [inlineFolderName, setInlineFolderName] = useState("");
  const [inlineFolderError, setInlineFolderError] = useState<string | null>(null);
  const inlineFileInputRef = useRef<HTMLInputElement | null>(null);
  const inlineFolderInputRef = useRef<HTMLInputElement | null>(null);
  const tree = useMemo(() => buildTree(files), [files]);

  useEffect(() => {
    window.localStorage.setItem(
      COLLAPSED_FOLDERS_STORAGE_KEY,
      JSON.stringify(Array.from(collapsedFolders)),
    );
  }, [collapsedFolders]);

  useEffect(() => {
    if (!createFileRequest) return;
    const parentPath = createFileRequest.parentPath.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    setInlineFileParent(parentPath);
    setInlineFileName("");
    setInlineFileError(null);
    setInlineFolderParent(null);
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
    onSelectDirectory(parentPath);
  }, [createFileRequest, onSelectDirectory]);

  useEffect(() => {
    if (!createFolderRequest) return;
    const parentPath = createFolderRequest.parentPath.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    setInlineFileParent(null);
    setInlineFileName("");
    setInlineFileError(null);
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
    if (inlineFileParent === null) return;
    window.setTimeout(() => {
      inlineFileInputRef.current?.focus();
      inlineFileInputRef.current?.select();
    }, 0);
  }, [inlineFileParent]);

  useEffect(() => {
    if (inlineFolderParent === null) return;
    window.setTimeout(() => {
      inlineFolderInputRef.current?.focus();
      inlineFolderInputRef.current?.select();
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

  const cancelInlineFile = () => {
    setInlineFileParent(null);
    setInlineFileName("");
    setInlineFileError(null);
  };

  const commitInlineFile = async () => {
    if (inlineFileParent === null) return;
    const name = inlineFileName.trim();
    if (!name) {
      setInlineFileError("File name is required");
      return;
    }

    try {
      await onCreateFile(inlineFileParent, name);
      setInlineFileParent(null);
      setInlineFileName("");
      setInlineFileError(null);
    } catch (error) {
      setInlineFileError(error instanceof Error ? error.message : String(error));
    }
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

  const renderInlineFileInput = (parentPath: string, depth: number) => {
    if (inlineFileParent !== parentPath) return null;
    return (
      <li key={`inline-file:${parentPath || "root"}`} className="onb-tree-node">
        <div
          className="onb-tree-row onb-tree-inline-row"
          style={{ paddingLeft: `${TREE_ROW_LEFT + depth * TREE_DEPTH_INDENT}px` }}
        >
          <span className="onb-tree-twistie" aria-hidden="true" />
          <span className="onb-tree-icon" aria-hidden="true">
            <FileText size={16} strokeWidth={1.7} />
          </span>
          <input
            ref={inlineFileInputRef}
            value={inlineFileName}
            onChange={(event) => {
              setInlineFileName(event.target.value);
              setInlineFileError(null);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                void commitInlineFile();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelInlineFile();
              }
            }}
            onBlur={cancelInlineFile}
            className="onb-tree-inline-input"
            placeholder="New file"
          />
        </div>
        {inlineFileError && (
          <p
            className="onb-tree-error"
            style={{ paddingLeft: `${TREE_ROW_LEFT + TREE_LABEL_LEFT_OFFSET + depth * TREE_DEPTH_INDENT}px` }}
          >
            {inlineFileError}
          </p>
        )}
      </li>
    );
  };

  const renderInlineFolderInput = (parentPath: string, depth: number) => {
    if (inlineFolderParent !== parentPath) return null;
    return (
      <li key={`inline-folder:${parentPath || "root"}`} className="onb-tree-node">
        <div
          className="onb-tree-row onb-tree-inline-row"
          style={{ paddingLeft: `${TREE_ROW_LEFT + depth * TREE_DEPTH_INDENT}px` }}
        >
          <span className="onb-tree-twistie" aria-hidden="true" />
          <span className="onb-tree-icon" aria-hidden="true">
            <Folder size={16} strokeWidth={1.8} />
          </span>
          <input
            ref={inlineFolderInputRef}
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
            className="onb-tree-inline-input"
            placeholder="New folder"
          />
        </div>
        {inlineFolderError && (
          <p
            className="onb-tree-error"
            style={{ paddingLeft: `${TREE_ROW_LEFT + TREE_LABEL_LEFT_OFFSET + depth * TREE_DEPTH_INDENT}px` }}
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
        <li key={`folder:${node.path}`} className="onb-tree-node">
          <div
            className={cn("onb-tree-row", hasActive && "onb-tree-row-descendant")}
            style={{ paddingLeft: `${TREE_ROW_LEFT + depth * TREE_DEPTH_INDENT}px` }}
            data-active={isActive ? "true" : "false"}
            data-descendant-active={hasActive ? "true" : "false"}
            data-app-context-menu="file-tree-folder"
            data-app-context-path={node.path}
          >
            <button
              type="button"
              className="onb-tree-main"
              onClick={() => {
                onSelectDirectory(node.path);
                toggleFolder(node.path);
              }}
              aria-expanded={!isCollapsed}
              title={node.path}
            >
              <span className="onb-tree-twistie" aria-hidden="true">
                <ChevronRight
                  className={cn("onb-tree-chevron", !isCollapsed && "onb-tree-chevron-expanded")}
                  size={15}
                  strokeWidth={1.9}
                />
              </span>
              <span className="onb-tree-icon" aria-hidden="true">
                <FolderIcon size={16} strokeWidth={1.8} />
              </span>
              <span className="onb-tree-label onb-tree-label-folder">{node.name}</span>
              <span className="onb-tree-spacer" aria-hidden="true" />
            </button>

            <div className="onb-tree-actions">
              <button
                type="button"
                title="重命名文件夹"
                aria-label="重命名文件夹"
                onClick={(e) => {
                  e.stopPropagation();
                  onRenameItem(node.path, true);
                }}
                className="onb-tree-action"
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
                className="onb-tree-action onb-tree-action-danger"
              >
                <Trash2 />
              </button>
            </div>
          </div>
          {isCollapsed ? null : (
            <ul className="w-full">
              {renderInlineFileInput(node.path, depth + 1)}
              {renderInlineFolderInput(node.path, depth + 1)}
              {node.children.length === 0 && inlineFileParent !== node.path && inlineFolderParent !== node.path ? (
                <li
                  className="onb-tree-empty"
                  style={{ paddingLeft: `${TREE_ROW_LEFT + TREE_LABEL_LEFT_OFFSET + (depth + 1) * TREE_DEPTH_INDENT}px` }}
                  data-app-context-menu="file-tree-folder"
                  data-app-context-path={node.path}
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
      <li key={`file:${node.path}`} className="onb-tree-node">
        <div
          className="onb-tree-row"
          style={{ paddingLeft: `${TREE_ROW_LEFT + depth * TREE_DEPTH_INDENT}px` }}
          data-active={isActive ? "true" : "false"}
          data-app-context-menu="file-tree-file"
          data-app-context-path={node.path}
        >
          <button
            type="button"
            onClick={() => onSelectFile(node.path)}
            title={node.path}
            className="onb-tree-main"
          >
            <span className="onb-tree-twistie" aria-hidden="true" />
            <span className="onb-tree-icon" aria-hidden="true">
              <FileText size={16} strokeWidth={1.7} />
            </span>
            <span className="onb-tree-label">{getNodeDisplayTitle(node)}</span>
            <span className="onb-tree-spacer" aria-hidden="true" />
          </button>

          <div className="onb-tree-actions">
            <button
              type="button"
              title="重命名"
              aria-label="重命名"
              onClick={(e) => {
                e.stopPropagation();
                onRenameItem(node.path, false);
              }}
              className="onb-tree-action"
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
              className="onb-tree-action onb-tree-action-danger"
            >
              <Trash2 />
            </button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div
      className="onb-tree-scroll h-full min-h-0 w-full overflow-y-auto overflow-x-hidden"
      data-app-context-menu="file-tree-blank"
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest(".onb-tree-row, .onb-tree-actions, input")) return;
        onClearSelection();
      }}
    >
      <div className="onb-tree w-full px-1 py-1">
        {rootCollapsed ? null : (
          <ul className="w-full">
            {renderInlineFileInput("", 0)}
            {renderInlineFolderInput("", 0)}
            {tree.length === 0 && inlineFileParent !== "" && inlineFolderParent !== "" ? (
              <li
                className="onb-tree-empty"
                style={{ paddingLeft: `${TREE_ROW_LEFT + TREE_LABEL_LEFT_OFFSET}px` }}
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
