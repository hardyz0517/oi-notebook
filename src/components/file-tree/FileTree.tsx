import { Pencil, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { NoteFileInfo } from "@/types/note";

interface FileTreeProps {
  files: NoteFileInfo[];
  /** 当前打开的文件路径，null 表示无选中 */
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onRenameFile: (path: string) => void;
}

/** 去掉 .md 扩展名，用于显示更清爽的标题 */
function stripMdExtension(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

/**
 * 分组规则：
 * - 分组依据 path 的一级目录（第一个 "/" 前的部分）判定
 * - tricks / problems / luogu / inbox 归对应标准分组，始终显示标题（空组显示「暂无」）
 * - 其余（含顶层文件 / 未知子目录）归「其他」，仅有文件时才渲染
 * - 文件项显示用 file.name（后端保证为纯文件名，不含路径前缀），不论分组
 * - 组内顺序保持后端传入顺序（已按 modified 降序排好，前端不再排序）
 */
type GroupKey = "tricks" | "problems" | "luogu" | "inbox" | "其他";

const GROUP_ORDER: GroupKey[] = ["tricks", "problems", "luogu", "inbox", "其他"];
const STANDARD_DIRS = new Set<string>(["tricks", "problems", "luogu", "inbox"]);

function buildGroupMap(files: NoteFileInfo[]): Map<GroupKey, NoteFileInfo[]> {
  const map = new Map<GroupKey, NoteFileInfo[]>(GROUP_ORDER.map((k) => [k, []]));
  for (const file of files) {
    const slashIdx = file.path.indexOf("/");
    const dir = slashIdx === -1 ? null : file.path.slice(0, slashIdx);
    const key: GroupKey =
      dir !== null && STANDARD_DIRS.has(dir) ? (dir as GroupKey) : "其他";
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
    // ScrollArea 确保文件数量多时可以垂直滚动，不撑破左栏布局
    <ScrollArea className="h-full w-full">
      <div className="w-full pt-1 pb-4">
        {GROUP_ORDER.map((groupKey, idx) => {
          const groupFiles = groups.get(groupKey)!;
          const count = groupFiles.length;

          // 「其他」分组没有文件时整组不渲染（标准目录即使为空也要显示）
          if (groupKey === "其他" && count === 0) return null;

          return (
            <div key={groupKey} className={cn(idx > 0 && "mt-3")}>
              {/* 分组标题，不可点击，样式与「笔记列表」标题一致 */}
              <div className="px-3 pb-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {groupKey} ({count})
                </span>
              </div>

              {count === 0 ? (
                // 标准目录空组：显示「暂无」占位，让用户知道这里是规划好的入口
                <p className="py-1 pl-6 text-[10px] text-muted-foreground">暂无</p>
              ) : (
                <ul className="w-full">
                  {groupFiles.map((file) => {
                    const isActive = file.path === activeFilePath;

                    return (
                      <li key={file.path} className="group relative">
                        <button
                          type="button"
                          onClick={() => onSelectFile(file.path)}
                          className={cn(
                            // 基础：撑满宽度，左对齐，左侧留出 border 空间，右侧留出操作按钮的空间
                            "w-full cursor-pointer py-2 pr-16 text-left",
                            // 过渡动画
                            "transition-colors duration-100",
                            // 选中态：bg-accent 背景 + 2px 主色左竖条（Lyra 锐角风格标记）
                            // border-l-2 配合 pl-[10px] 保持内容对齐（px-3=12px，减去 border 2px）
                            isActive
                              ? "border-l-2 border-primary bg-accent pl-[10px] text-accent-foreground"
                              : "border-l-2 border-transparent pl-[10px] text-foreground hover:bg-muted",
                          )}
                        >
                          {/* 文件名（去掉 .md，截断过长名称）；file.name 是纯文件名，不含路径 */}
                          <p className="truncate text-xs font-medium leading-tight">
                            {stripMdExtension(file.name)}
                          </p>

                          {/* 相对时间：小字、静音色 */}
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {formatRelativeTime(file.modified)}
                          </p>
                        </button>

                        {/* hover 显示的操作按钮区，绝对定位在行右侧 */}
                        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            title="重命名"
                            aria-label="重命名"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRenameFile(file.path);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            title="删除"
                            aria-label="删除"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteFile(file.path);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
