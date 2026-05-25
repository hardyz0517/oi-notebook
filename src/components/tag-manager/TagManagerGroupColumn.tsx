import { closestCenter, DndContext } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { SortableItem } from "./SortableItem";
import type { GroupNode, RootGroup, SortCancelHandler, SortEndHandler, SortStartHandler } from "./types";
import type { TagSuggestion } from "@/lib/tagTaxonomy";

export function TagManagerGroupColumn({
  searchQuery,
  searchResults,
  activeRootGroup,
  activeRootSortedGroups,
  activeRootSortableItems,
  expandedGroups,
  selectedGroupOrderKey,
  selectedSuggestionId,
  activeDraggingGroupId,
  isSaving,
  isSortDisabled,
  sensors,
  onToggleGroup,
  onSelectGroup,
  onSelectSuggestion,
  onSortStart,
  onSortCancel,
  onSortEnd,
}: {
  searchQuery: string;
  searchResults: TagSuggestion[];
  activeRootGroup: RootGroup | null;
  activeRootSortedGroups: GroupNode[];
  activeRootSortableItems: string[];
  expandedGroups: Record<string, boolean>;
  selectedGroupOrderKey: string | null;
  selectedSuggestionId: string | null;
  activeDraggingGroupId: string | null;
  isSaving: boolean;
  isSortDisabled: boolean;
  sensors: ComponentProps<typeof DndContext>["sensors"];
  onToggleGroup: (groupKey: string) => void;
  onSelectGroup: (groupKey: string) => void;
  onSelectSuggestion: (suggestionId: string) => void;
  onSortStart: SortStartHandler;
  onSortCancel: SortCancelHandler;
  onSortEnd: SortEndHandler;
}) {
  const trimmedSearchQuery = searchQuery.trim();
  const isSearchMode = Boolean(trimmedSearchQuery);

  return (
    <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-r border-border/70">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-2">
        <div className="text-xs font-medium text-muted-foreground">{isSearchMode ? `搜索结果 ${searchResults.length}` : activeRootGroup ? `${activeRootGroup.root} 标签` : "标签列表"}</div>
        {!isSearchMode && activeRootGroup && <div className="text-[11px] text-muted-foreground">{activeRootSortedGroups.length} 个二级标签</div>}
      </div>
      <div
        className="tag-manager-scrollbar min-h-0 overflow-y-auto overflow-x-hidden overscroll-x-none p-3 [contain:paint]"
        onScroll={(event) => {
          if (event.currentTarget.scrollLeft !== 0) event.currentTarget.scrollLeft = 0;
        }}
      >
        {isSearchMode ? (
          searchResults.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">没有找到匹配的标签。</div>
          ) : (
            <div className="grid gap-1.5">
              {searchResults.map((suggestion) => (
                <button key={suggestion.id} data-tag-manager-interactive="true" type="button" className={cn("grid w-full min-w-0 max-w-full gap-0.5 overflow-hidden rounded-sm border border-l-2 px-3 py-2 text-left transition-colors [contain:paint]", selectedSuggestionId === suggestion.id ? "border-primary/60 border-l-primary bg-primary/10" : "border-transparent border-l-transparent hover:border-border/70 hover:border-l-border hover:bg-muted/20")} onClick={() => onSelectSuggestion(suggestion.id)}>
                  <span className="text-sm text-foreground">{suggestion.name}</span>
                  <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="min-w-0 break-words">{suggestion.pathText}</span>
                    {suggestion.hidden && <span className="shrink-0 rounded-sm border border-border/70 px-1.5 py-0.5">已隐藏</span>}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : activeRootGroup ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => onSortStart("group", activeRootGroup.root, event)} onDragCancel={() => onSortCancel("group", activeRootGroup.root)} onDragEnd={(event) => onSortEnd("group", activeRootGroup.root, activeRootSortableItems, event, activeRootSortedGroups, "activeRootSortedGroups")}>
            <SortableContext items={activeRootSortableItems} strategy={verticalListSortingStrategy}>
              <div className="grid gap-2">
                {activeRootSortedGroups.map((group) => {
                  const groupKey = `${activeRootGroup.root}:${group.name}`;
                  const sortableGroupKey = group.orderKey;
                  const isExpanded = expandedGroups[sortableGroupKey] === true;
                  const isGroupSelected = selectedGroupOrderKey === sortableGroupKey;
                  const isDraggingGroup = activeDraggingGroupId === sortableGroupKey;
                  const shouldRenderChildren = isExpanded && !isDraggingGroup;
                  return (
                    <SortableItem key={groupKey} id={sortableGroupKey} disabled={isSaving || isSortDisabled}>
                      {({ setNodeRef, attributes, listeners, transform, transition, isDragging }) => (
                        <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, width: "100%", maxWidth: "100%" }} className={cn("w-full max-w-full overflow-hidden border-b border-t border-b-border/60 border-t-transparent pb-2 last:border-b-0 [contain:paint]", isDragging && "relative z-10 opacity-80 shadow-sm")}>
                          <div data-tag-manager-interactive="true" className={cn("flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-sm border border-transparent transition-colors", isGroupSelected ? "border-primary/35 bg-primary/10 shadow-[inset_2px_0_0_hsl(var(--primary))]" : "hover:bg-muted/15", isDraggingGroup && "bg-primary/5")}>
                            <button type="button" data-no-window-drag="true" title="拖动二级标签排序" aria-label={`拖动二级标签排序 ${group.name}`} className="flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted/20 hover:text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40" disabled={isSaving || isSortDisabled} onClick={(event) => event.stopPropagation()} {...attributes} {...listeners}>
                              <span className="grid gap-[3px] text-current"><span className="h-px w-3 rounded-full bg-current" /><span className="h-px w-2.5 rounded-full bg-current" /></span>
                            </button>
                            <button type="button" className="flex h-8 w-6 shrink-0 items-center justify-center rounded-sm hover:bg-muted/20" onClick={() => onToggleGroup(sortableGroupKey)} aria-label={`${isExpanded ? "收起" : "展开"}二级标签 ${group.name}`}>
                              {isExpanded ? <ChevronDown className={cn("h-3.5 w-3.5 shrink-0", isGroupSelected ? "text-primary" : "text-muted-foreground")} /> : <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", isGroupSelected ? "text-primary" : "text-muted-foreground")} />}
                            </button>
                            <button type="button" className={cn("flex min-w-0 max-w-full flex-1 items-center justify-between gap-3 overflow-hidden rounded-sm px-1 py-2 text-left transition-colors", !isGroupSelected && "hover:bg-muted/20")} onClick={() => onSelectGroup(sortableGroupKey)}>
                              <span className={cn("min-w-0 truncate text-sm font-medium", isGroupSelected ? "text-foreground" : "text-foreground/90")}>{group.name}</span>
                              <span className={cn("shrink-0 rounded-sm border px-1.5 py-0.5 text-[11px]", isGroupSelected ? "border-primary/30 bg-primary/15 text-foreground" : "border-transparent text-muted-foreground")}>{group.candidates.length}</span>
                            </button>
                          </div>
                          {shouldRenderChildren && (
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => onSortStart("tag", sortableGroupKey, event)} onDragCancel={() => onSortCancel("tag", sortableGroupKey)} onDragEnd={(event) => onSortEnd("tag", sortableGroupKey, group.candidates.map((suggestion) => suggestion.id), event)}>
                              <SortableContext items={group.candidates.map((suggestion) => suggestion.id)} strategy={verticalListSortingStrategy}>
                                <div className="grid gap-1 px-2 pb-2 pt-1">
                                  {group.candidates.map((suggestion) => (
                                    <SortableItem key={suggestion.id} id={suggestion.id} disabled={isSaving || isSortDisabled}>
                                      {({ setNodeRef, attributes, listeners, transform, transition, isDragging }) => (
                                        <div data-tag-manager-interactive="true" ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, width: "100%", maxWidth: "100%" }} className={cn("flex w-full min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-sm border-y border-transparent [contain:paint]", isDragging && "relative z-10 opacity-70 shadow-sm")}>
                                          <button type="button" data-no-window-drag="true" title="拖动标签排序" aria-label={`拖动标签排序 ${suggestion.name}`} className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-muted/20 hover:text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40" disabled={isSaving || isSortDisabled} onClick={(event) => event.stopPropagation()} {...attributes} {...listeners}>
                                            <span className="grid grid-cols-2 gap-0.5 text-current"><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /></span>
                                          </button>
                                          <button type="button" className={cn("flex min-w-0 max-w-full flex-1 items-center justify-between gap-2 overflow-hidden rounded-sm border-l-2 px-2 py-1.5 text-left text-sm transition-colors", selectedSuggestionId === suggestion.id ? "border-l-primary bg-primary/10 text-foreground" : "border-l-transparent text-muted-foreground hover:bg-muted/20 hover:text-foreground")} onClick={() => onSelectSuggestion(suggestion.id)}>
                                            <span className="min-w-0 break-words">{suggestion.name}</span>
                                            <span className="flex shrink-0 items-center gap-1">{suggestion.hidden && <span className="rounded-sm border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">已隐藏</span>}{suggestion.source === "user" && <span className="rounded-sm border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">user</span>}</span>
                                          </button>
                                        </div>
                                      )}
                                    </SortableItem>
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>
                          )}
                        </section>
                      )}
                    </SortableItem>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="py-8 text-sm text-muted-foreground">暂无可浏览的标签。</div>
        )}
      </div>
    </main>
  );
}
