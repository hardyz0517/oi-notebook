import { FileText, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/datetime";
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
const STANDARD_DIRS = new Set<string>(["tricks", "problems", "luogu", "inbox"]);
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

function buildGroupMap(files: NoteFileInfo[]): Map<GroupKey, NoteFileInfo[]> {
  const map = new Map<GroupKey, NoteFileInfo[]>(GROUP_ORDER.map((key) => [key, []]));

  for (const file of files) {
    const slashIndex = file.path.indexOf("/");
    const dir = slashIndex === -1 ? null : file.path.slice(0, slashIndex);
    const key: GroupKey = dir !== null && STANDARD_DIRS.has(dir) ? (dir as GroupKey) : "other";
    map.get(key)!.push(file);
  }

  return map;
}

export default function FileTree({
  files,
  activeFilePath,
  onSelectFile,
  onDeleteFile,
  onRenameFile,
}: FileTreeProps) {
  const groups = buildGroupMap(files);

  return (
    <ScrollArea className="h-full w-full">
      <div className="w-full px-2 py-2">
        {GROUP_ORDER.map((groupKey, index) => {
          const groupFiles = groups.get(groupKey)!;
          const count = groupFiles.length;
          const groupMeta = GROUP_META[groupKey];

          if (groupKey === "other" && count === 0) return null;

          return (
            <section key={groupKey} className={cn(index > 0 && "mt-4")}>
              <div className="mb-1 flex items-center justify-between px-2">
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground/85">
                  <FolderOpen className="h-3 w-3 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/90">
                      {groupMeta.label}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground/65">
                      {groupMeta.directory}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground/65">{count}</span>
              </div>

              {count === 0 ? (
                <p className="px-7 py-1.5 text-[10px] leading-4 text-muted-foreground/75">
                  {groupMeta.emptyText}
                </p>
              ) : (
                <ul className="w-full space-y-0.5 pl-2">
                  {groupFiles.map((file) => {
                    const isActive = file.path === activeFilePath;

                    return (
                      <li key={file.path} className="group relative">
                        <button
                          type="button"
                          onClick={() => onSelectFile(file.path)}
                          title={file.path}
                          className={cn(
                            "relative flex w-full min-w-0 items-start gap-2 rounded-sm border border-transparent py-2 pl-2.5 pr-14 text-left transition-colors duration-100",
                            isActive
                              ? "bg-accent/75 text-accent-foreground before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-px before:bg-primary"
                              : "text-foreground/92 hover:bg-muted/60",
                          )}
                        >
                          <FileText
                            className={cn(
                              "mt-0.5 h-3.5 w-3.5 shrink-0",
                              isActive ? "text-primary" : "text-muted-foreground/70",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-medium leading-4">
                              {stripMdExtension(file.name)}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] leading-4 text-muted-foreground/70">
                              {formatRelativeTime(file.modified)}
                            </p>
                          </div>
                        </button>

                        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <button
                            type="button"
                            title="\u91cd\u547d\u540d"
                            aria-label="\u91cd\u547d\u540d"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRenameFile(file.path);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground/80 hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="\u5220\u9664"
                            aria-label="\u5220\u9664"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteFile(file.path);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground/80 hover:bg-destructive/15 hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
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
    </ScrollArea>
  );
}
