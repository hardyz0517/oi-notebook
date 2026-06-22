import { arrayMove } from "@dnd-kit/sortable";

import { createDenseOrderOverrides } from "@/lib/tagTaxonomy";
import type { UserTagTaxonomyConfig } from "@/lib/tagTaxonomy";
import { normalizeConfig } from "./tagManagerConfig";
import type { GroupNode, RootGroup, SaveOperation } from "./types";

export const SORT_SAVE_FAILURE_MESSAGE = "保存失败，已恢复原顺序";

export type SortEndPlan = {
  activeId: string;
  overId: string | null;
  nextIds: string[];
  changed: boolean;
  reason?: "invalid-index";
};

export type TagSortSavePlan = {
  previousConfig: UserTagTaxonomyConfig;
  nextConfig: UserTagTaxonomyConfig;
  failureMessage: string;
  operation: SaveOperation;
};

export function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function createOrderOverrides(currentOverrides: Record<string, number> | undefined, nextIds: string[]): Record<string, number> {
  return createDenseOrderOverrides(currentOverrides, nextIds);
}

export function getTagSortSavePlan(config: UserTagTaxonomyConfig, nextIds: string[]): TagSortSavePlan {
  const previousConfig = normalizeConfig(config);
  return {
    previousConfig,
    nextConfig: normalizeConfig({
      ...previousConfig,
      orderOverrides: createOrderOverrides(previousConfig.orderOverrides, nextIds),
    }),
    failureMessage: SORT_SAVE_FAILURE_MESSAGE,
    operation: "sort",
  };
}

export function getSortEndPlan(currentIds: string[], activeId: string, overId: string | null): SortEndPlan {
  if (!overId || activeId === overId) {
    return {
      activeId,
      overId,
      nextIds: currentIds,
      changed: false,
    };
  }

  const oldIndex = currentIds.indexOf(activeId);
  const newIndex = currentIds.indexOf(overId);

  if (oldIndex < 0 || newIndex < 0) {
    return {
      activeId,
      overId,
      nextIds: currentIds,
      changed: false,
      reason: "invalid-index",
    };
  }

  const nextIds = arrayMove(currentIds, oldIndex, newIndex);

  return {
    activeId,
    overId,
    nextIds,
    changed: !areStringArraysEqual(nextIds, currentIds),
  };
}

export function sortGroupsByOrderOverrides(
  groups: RootGroup["groups"],
  orderOverrides: Record<string, number> | undefined,
): RootGroup["groups"] {
  return groups
    .map((group, defaultOrder) => ({ group, defaultOrder }))
    .sort((a, b) => {
      const orderA = orderOverrides?.[a.group.orderKey];
      const orderB = orderOverrides?.[b.group.orderKey];

      if (orderA !== undefined || orderB !== undefined) {
        return (orderA ?? Number.MAX_SAFE_INTEGER) - (orderB ?? Number.MAX_SAFE_INTEGER)
          || a.defaultOrder - b.defaultOrder;
      }

      return a.defaultOrder - b.defaultOrder;
    })
    .map(({ group }) => group);
}

export function getDebugGroupOrderRows(
  groups: GroupNode[],
  orderOverrides: Record<string, number> | undefined,
): Array<{ name: string; orderKey: string; override: number | undefined }> {
  return groups.map((group) => ({
    name: group.name,
    orderKey: group.orderKey,
    override: orderOverrides?.[group.orderKey],
  }));
}
