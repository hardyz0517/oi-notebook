import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { NoteFileInfo } from "@/types/note";

interface FileTreeProps {
  files: NoteFileInfo[];
  /** 当前打开的文件路径，null 表示无选中 */
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
}

/** 去掉 .md 扩展名，用于显示更清爽的标题 */
function stripMdExtension(name: string): string {
  return name.endsWith(".md") ? name.slice(0, -3) : name;
}

export default function FileTree({
  files,
  activeFilePath,
  onSelectFile,
}: FileTreeProps) {
  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-xs text-muted-foreground">暂无笔记</span>
      </div>
    );
  }

  return (
    // ScrollArea 确保文件数量多时可以垂直滚动，不撑破左栏布局
    <ScrollArea className="h-full w-full">
      <ul className="py-1">
        {files.map((file) => {
          const isActive = file.path === activeFilePath;

          return (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => onSelectFile(file.path)}
                className={cn(
                  // 基础：撑满宽度，左对齐，左侧留出 border 空间
                  "w-full cursor-pointer py-2 pr-3 text-left",
                  // 过渡动画
                  "transition-colors duration-100",
                  // 选中态：bg-accent 背景 + 2px 主色左竖条（Lyra 锐角风格标记）
                  // border-l-2 配合 pl-[10px] 保持内容对齐（px-3=12px，减去 border 2px）
                  isActive
                    ? "border-l-2 border-primary bg-accent pl-[10px] text-accent-foreground"
                    : "border-l-2 border-transparent pl-[10px] text-foreground hover:bg-muted",
                )}
              >
                {/* 文件名（去掉 .md，截断过长名称） */}
                <p className="truncate text-xs font-medium leading-tight">
                  {stripMdExtension(file.name)}
                </p>

                {/* 相对时间：小字、静音色 */}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatRelativeTime(file.modified)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
