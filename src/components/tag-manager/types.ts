import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { TagSuggestion, TagSuggestionRootGroup, UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";

export type WorkspaceRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ResizeHandle = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type SortScope = "root" | "group" | "tag";
export type SaveOperation = "sort" | "visibility" | "alias" | "merge" | "collection";
export type TagManagerFilterMode = "all" | "user" | "hidden" | "builtin" | "deprecated";
export type TagManagerWorkspaceView = "tags" | "collections";

export type RootGroup = TagSuggestionRootGroup;
export type GroupNode = RootGroup["groups"][number];

export type GroupOrderSaveDebugContext = {
  scope: SortScope;
  parentKey?: string;
  previousIds: string[];
  nextIds: string[];
  currentIdsSource: string;
  currentGroups?: GroupNode[];
};

export type StatusMessage = {
  kind: "success" | "error";
  message: string;
} | null;

export type MergePreviewInfo = {
  targetReference: string | null;
  targetSuggestion: TagSuggestion | null;
  incomingSuggestions: TagSuggestion[];
};

export type SortStartHandler = (scope: SortScope, parentKey: string | undefined, event: DragStartEvent) => void;
export type SortCancelHandler = (scope: SortScope, parentKey?: string) => void;

export type SortEndHandler = (
  scope: SortScope,
  parentKey: string | undefined,
  currentIds: string[],
  event: DragEndEvent,
  currentGroups?: GroupNode[],
  currentIdsSource?: string,
) => void;

export type TagManagerCloseReason =
  | "close-button";

export type TagManagerWorkspaceProps = {
  initialConfig: UserTagTaxonomyConfig;
  initialFilterMode?: TagManagerFilterMode;
  builtinCollections?: string[];
  noteCollections?: string[];
  developerModeEnabled: boolean;
  onRequestClose: (reason: TagManagerCloseReason, finalConfig: UserTagTaxonomyConfig) => void;
};
