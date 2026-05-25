import { closestCenter, DndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { SortableItem } from "./SortableItem";
import type { RootGroup, SortEndHandler, SortStartHandler } from "./types";

export function TagManagerRootColumn({
  rootGroups,
  activeRootName,
  isSaving,
  isSortDisabled,
  sensors,
  onSelectRoot,
  onSortStart,
  onSortEnd,
}: {
  rootGroups: RootGroup[];
  activeRootName: string | null;
  isSaving: boolean;
  isSortDisabled: boolean;
  sensors: ComponentProps<typeof DndContext>["sensors"];
  onSelectRoot: (root: string) => void;
  onSortStart: SortStartHandler;
  onSortEnd: SortEndHandler;
}) {
  return (
    <aside className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-border/70 bg-muted/5">
      <div className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">一级标签</div>
      <div className="tag-manager-scrollbar min-h-0 overflow-y-auto overflow-x-hidden overscroll-x-none p-2 [contain:paint]" onScroll={(event) => {
        if (event.currentTarget.scrollLeft !== 0) event.currentTarget.scrollLeft = 0;
      }}>
        {rootGroups.length === 0 ? (
          <div className="px-2 py-6 text-sm text-muted-foreground">暂无标签。</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => onSortStart("root", undefined, event)} onDragEnd={(event) => onSortEnd("root", undefined, rootGroups.map((rootGroup) => rootGroup.orderKey), event)}>
            <SortableContext items={rootGroups.map((rootGroup) => rootGroup.orderKey)} strategy={verticalListSortingStrategy}>
              <div className="grid gap-1">
                {rootGroups.map((rootGroup) => {
                  const count = rootGroup.groups.reduce((total, group) => total + group.candidates.length, 0);
                  return (
                    <SortableItem key={rootGroup.orderKey} id={rootGroup.orderKey} disabled={isSaving || isSortDisabled}>
                      {({ setNodeRef, attributes, listeners, transform, transition, isDragging }) => (
                        <div data-tag-manager-interactive="true" ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, width: "100%", maxWidth: "100%" }} className={cn("flex w-full min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-sm border-y border-transparent transition-colors [contain:paint]", isDragging && "relative z-10 opacity-70 shadow-sm")}>
                          <button type="button" data-no-window-drag="true" title="拖动一级标签排序" aria-label={`拖动一级标签排序 ${rootGroup.root}`} className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted/20 hover:text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40" disabled={isSaving || isSortDisabled} onClick={(event) => event.stopPropagation()} {...attributes} {...listeners}>
                            <span className="grid gap-1 text-current"><span className="h-0.5 w-3.5 rounded-full bg-current" /><span className="h-0.5 w-3.5 rounded-full bg-current" /></span>
                          </button>
                          <button type="button" className={cn("flex min-w-0 max-w-full flex-1 items-center justify-between gap-2 overflow-hidden rounded-sm px-2.5 py-2 text-left text-sm transition-colors", activeRootName === rootGroup.root ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/20 hover:text-foreground")} onClick={() => onSelectRoot(rootGroup.root)}>
                            <span className="min-w-0 truncate">{rootGroup.root}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{count}</span>
                          </button>
                        </div>
                      )}
                    </SortableItem>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </aside>
  );
}
