import { createDenseOrderOverrides } from "@/lib/tagTaxonomy";
import type { GroupNode, RootGroup } from "./types";

export function areStringArraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function createOrderOverrides(currentOverrides: Record<string, number> | undefined, nextIds: string[]): Record<string, number> {
  return createDenseOrderOverrides(currentOverrides, nextIds);
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
