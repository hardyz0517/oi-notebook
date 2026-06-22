import { describe, expect, it } from "vitest";

import { getSortEndPlan, getTagSortSavePlan, SORT_SAVE_FAILURE_MESSAGE } from "./tagManagerOrdering";

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
