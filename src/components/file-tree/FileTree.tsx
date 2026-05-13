import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoteFileInfo } from "@/types/note";

interface FileTreeProps {
  files: NoteFileInfo[];
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onRenameFile: (path: string) => void;
}

function stripMdExtension(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

type GroupKey = "tricks" | "problems" | "luogu" | "inbox" | "other";

const GROUP_ORDER: GroupKey[] = ["tricks", "problems", "luogu", "inbox", "other"];
const GROUP_META: Record<GroupKey, { label: string; directory: string; emptyText: string }> = {
  tricks: {
    label: "\u6280\u5de7",
    directory: "tricks",
    emptyText: "\u8fd8\u6ca1\u6709\u624b\u5199\u6280\u5de7\u7b14\u8bb0",
  },
  problems: {
    label: "\u9898\u89e3",
    directory: "problems",
    emptyText: "\u8fd8\u6ca1\u6709\u9898\u89e3\u7b14\u8bb0",
  },
  luogu: {
    label: "\u6d1b\u8c37",
    directory: "luogu",
    emptyText: "\u8fd8\u6ca1\u6709\u6d1b\u8c37\u540c\u6b65\u7b14\u8bb0",
  },
  inbox: {
    label: "\u6536\u4ef6\u7bb1",
    directory: "inbox",
    emptyText: "\u8fd8\u6ca1\u6709\u901f\u8bb0",
  },
  other: {
    label: "\u5176\u4ed6",
    directory: "misc",
    emptyText: "\u6682\u65e0\u5176\u4ed6\u7b14\u8bb0",
  },
};

const COLLAPSED_FOLDERS_STORAGE_KEY = "oi-notebook.collapsedFolders";

interface FileGroup {
  id: string;
  label: string;
  directory: string;
  emptyText: string;
  files: NoteFileInfo[];
}

function normalizeFolderKey(value: string): string {
  return value.trim().toLowerCase();
}

function getTopLevelDirectory(path: string): string | null {
  const slashIndex = path.indexOf("/");
  return slashIndex === -1 ? null : path.slice(0, slashIndex);
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

function buildGroups(files: NoteFileInfo[]): FileGroup[] {
  const standardGroups: FileGroup[] = GROUP_ORDER
    .filter((key) => key !== "other")
    .map((key) => ({
      id: key,
      label: GROUP_META[key].label,
      directory: GROUP_META[key].directory,
      emptyText: GROUP_META[key].emptyText,
      files: [],
    }));
  const otherGroup: FileGroup = {
    id: "other",
    label: GROUP_META.other.label,
    directory: GROUP_META.other.directory,
    emptyText: GROUP_META.other.emptyText,
    files: [],
  };

  const standardByDirectory = new Map<string, FileGroup>(
    standardGroups.map((group) => [normalizeFolderKey(group.directory), group]),
  );

  for (const file of files) {
    const dir = getTopLevelDirectory(file.path);
    const normalizedDir = dir === null ? "" : normalizeFolderKey(dir);
    const standardGroup = standardByDirectory.get(normalizedDir);
    if (standardGroup) {
      standardGroup.files.push(file);
      continue;
    }

    otherGroup.files.push(file);
  }

  return [...standardGroups, otherGroup].filter((group) => group.id !== "other" || group.files.length > 0);
}

export default function FileTree({
  files,
  activeFilePath,
  onSelectFile,
  onDeleteFile,
  onRenameFile,
}: FileTreeProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(readStoredStringArray(COLLAPSED_FOLDERS_STORAGE_KEY)),
  );
  const groups = useMemo(() => buildGroups(files), [files]);

  useEffect(() => {
    window.localStorage.setItem(
      COLLAPSED_FOLDERS_STORAGE_KEY,
      JSON.stringify(Array.from(collapsedFolders)),
    );
  }, [collapsedFolders]);

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  return (
    <div className="app-file-tree-scroll h-full min-h-0 w-full overflow-y-auto overflow-x-hidden">
      <div className="app-file-tree w-full px-1.5 py-1.5">
        {groups.map((group, index) => {
          const groupFiles = group.files;
          const count = groupFiles.length;
          const isCollapsed = collapsedFolders.has(group.id);
          const hasActiveFile = groupFiles.some((file) => file.path === activeFilePath);
          const FolderIcon = isCollapsed ? Folder : FolderOpen;

          return (
            <section key={group.id} className={cn("app-file-group", index > 0 && "mt-2.5")}>
              <button
                type="button"
                className={cn(
                  "app-file-group-header mb-0.5 flex w-full items-center justify-between rounded-sm px-1.5 text-left transition-colors hover:bg-muted/45",
                  hasActiveFile && isCollapsed && "app-file-group-header-active",
                )}
                onClick={() => toggleFolder(group.id)}
                aria-expanded={!isCollapsed}
                title={`${isCollapsed ? "展开" : "折叠"} ${group.label}`}
              >
                <div className="flex min-w-0 items-center gap-1 text-muted-foreground/85">
                  <ChevronRight
                    className={cn(
                      "app-file-group-chevron shrink-0 transition-transform",
                      !isCollapsed && "rotate-90",
                    )}
                    size={13}
                    strokeWidth={2.35}
                  />
                  <FolderIcon className="app-file-group-icon shrink-0" size={16} strokeWidth={2.15} />
                  <div className="app-file-group-label min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
                    {group.label}
                  </div>
                </div>
                <span className="app-file-group-count shrink-0 text-[10px] text-muted-foreground/65">{count}</span>
              </button>

              {isCollapsed ? null : count === 0 ? (
                <p className="app-file-empty px-7 py-1.5 text-[10px] leading-4 text-muted-foreground/75">
                  {group.emptyText}
                </p>
              ) : (
                <ul className="w-full space-y-px pl-1">
                  {groupFiles.map((file) => {
                    const isActive = file.path === activeFilePath;

                    return (
                      <li key={file.path} className="group relative">
                        <button
                          type="button"
                          onClick={() => onSelectFile(file.path)}
                          title={file.path}
                          data-active={isActive ? "true" : "false"}
                          className={cn(
                            "app-file-row relative flex w-full min-w-0 items-center rounded-sm border border-transparent py-1 pl-2.5 pr-11 text-left transition-colors duration-100",
                            isActive
                              ? "text-accent-foreground"
                              : "text-foreground/92",
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="app-file-name truncate text-[12px] font-medium leading-5">
                              {stripMdExtension(file.name)}
                            </p>
                          </div>
                        </button>

                        <div className="app-file-actions absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-px opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <button
                            type="button"
                            title="\u91cd\u547d\u540d"
                            aria-label="\u91cd\u547d\u540d"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRenameFile(file.path);
                            }}
                            className="app-file-action flex items-center justify-center text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                          >
                            <Pencil />
                          </button>
                          <button
                            type="button"
                            title="\u5220\u9664"
                            aria-label="\u5220\u9664"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteFile(file.path);
                            }}
                            className="app-file-action app-file-action-danger flex items-center justify-center text-muted-foreground/80 hover:bg-destructive/15 hover:text-destructive"
                          >
                            <Trash2 />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
