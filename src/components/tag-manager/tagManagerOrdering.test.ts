import { describe, expect, it } from "vitest";

import { getGroupOrderAfterWorkingConfigDebugPayload, getGroupOrderRenderDebugPayload, getSortEndPlan, getTagSortSavePlan, SORT_SAVE_FAILURE_MESSAGE } from "./tagManagerOrdering";
import type { RootGroup } from "./types";

describe("tagManagerOrdering sort end plan", () => {
  const currentIds = ["root-a", "root-b", "root-c"];

  it("keeps the current order when there is no drop target", () => {
    expect(getSortEndPlan(currentIds, "root-a", null)).toEqual({
      activeId: "root-a",
      overId: null,
      nextIds: currentIds,
      changed: false,
    });
  });

  it("keeps the current order when dropped on itself", () => {
    expect(getSortEndPlan(currentIds, "root-a", "root-a")).toEqual({
      activeId: "root-a",
      overId: "root-a",
      nextIds: currentIds,
      changed: false,
    });
  });

  it("keeps the current order and reports invalid indexes", () => {
    expect(getSortEndPlan(currentIds, "missing", "root-b")).toEqual({
      activeId: "missing",
      overId: "root-b",
      nextIds: currentIds,
      changed: false,
      reason: "invalid-index",
    });
  });

  it("returns moved ids when active and over ids are valid", () => {
    expect(getSortEndPlan(currentIds, "root-a", "root-c")).toEqual({
      activeId: "root-a",
      overId: "root-c",
      nextIds: ["root-b", "root-c", "root-a"],
      changed: true,
    });
  });
});

describe("tagManagerOrdering sort save plan", () => {
  it("builds a sort save plan with dense order overrides and save metadata", () => {
    const result = getTagSortSavePlan({
      hiddenIds: ["tag.hidden"],
      orderOverrides: {
        "root.old": 9,
      },
    }, ["root-a", "root-b"]);

    expect(result).toEqual({
      previousConfig: {
        version: 1,
        hiddenIds: ["tag.hidden"],
        aliases: {},
        merges: {},
        orderOverrides: {
          "root.old": 9,
        },
        entries: [],
        customCollections: [],
      },
      nextConfig: {
        version: 1,
        hiddenIds: ["tag.hidden"],
        aliases: {},
        merges: {},
        orderOverrides: {
          "root.old": 9,
          "root-a": 0,
          "root-b": 1,
        },
        entries: [],
        customCollections: [],
      },
      failureMessage: SORT_SAVE_FAILURE_MESSAGE,
      operation: "sort",
    });
  });
});

describe("tagManagerOrdering group order debug payloads", () => {
  const activeRootGroup: RootGroup = {
    root: "数据结构",
    name: "数据结构",
    orderKey: "root.data-structure",
    path: ["数据结构"],
    pathText: "数据结构",
    groups: [
      {
        orderKey: "group.stack",
        name: "栈",
        path: ["数据结构", "栈"],
        pathText: "数据结构/栈",
        candidates: [],
      },
      {
        orderKey: "group.queue",
        name: "队列",
        path: ["数据结构", "队列"],
        pathText: "数据结构/队列",
        candidates: [],
      },
    ],
  };
  const activeRootSortedGroups = [...activeRootGroup.groups].reverse();
  const sortableItems = activeRootSortedGroups.map((group) => group.orderKey);

  it("skips group order debug payloads for non-algorithm roots without overrides", () => {
    expect(getGroupOrderRenderDebugPayload({
      activeRootGroup,
      activeRootSortedGroups,
      sortableItems,
      orderOverrides: {},
      searchQuery: "",
    })).toBeNull();
    expect(getGroupOrderAfterWorkingConfigDebugPayload({
      activeRootGroup,
      activeRootSortedGroups,
      sortableItems,
      orderOverrides: {},
    })).toBeNull();
  });

  it("builds group order debug payloads when an override is present", () => {
    const orderOverrides = {
      "group.queue": 0,
    };

    expect(getGroupOrderRenderDebugPayload({
      activeRootGroup,
      activeRootSortedGroups,
      sortableItems,
      orderOverrides,
      searchQuery: "   ",
    })).toEqual({
      activeRootName: "数据结构",
      activeRootOrderKey: "root.data-structure",
      rawGroups: [
        { name: "栈", orderKey: "group.stack", override: undefined },
        { name: "队列", orderKey: "group.queue", override: 0 },
      ],
      activeRootSortedGroups: [
        { name: "队列", orderKey: "group.queue", override: 0 },
        { name: "栈", orderKey: "group.stack", override: undefined },
      ],
      sortableItems: ["group.queue", "group.stack"],
      workingOrderOverrideCount: 1,
      searchQueryEmpty: true,
    });

    expect(getGroupOrderAfterWorkingConfigDebugPayload({
      activeRootGroup,
      activeRootSortedGroups,
      sortableItems,
      orderOverrides,
    })).toEqual({
      activeRootName: "数据结构",
      activeRootOrderKey: "root.data-structure",
      activeRootSortedGroups: [
        { name: "队列", orderKey: "group.queue", override: 0 },
        { name: "栈", orderKey: "group.stack", override: undefined },
      ],
      sortableItems: ["group.queue", "group.stack"],
      workingOrderOverrideCount: 1,
    });
  });
});
