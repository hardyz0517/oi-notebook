import { describe, expect, it } from "vitest";

import { createInMemoryEvidenceStore } from "./evidenceStore";

describe("evidence store", () => {
  it("saves, lists, and clears records by scope", () => {
    const store = createInMemoryEvidenceStore();
    const record = store.save({
      packet: {
        packetId: "packet-1",
        request: { userQuestion: "q" },
        policy: { mode: "general_web" },
        queryPlan: { userQuestion: "q" },
        evidenceItems: [],
        conflicts: [],
        status: "no_evidence",
        evidenceSummary: {
          strongCount: 0,
          mediumCount: 0,
          weakCount: 0,
          noneCount: 0,
          supportsCount: 0,
          refutesCount: 0,
          conflictCount: 0,
          reliableSourceCount: 0,
          citeableCount: 0,
        },
        allowedClaims: [],
        forbiddenClaims: [],
        missingEvidenceReasons: [],
        citationMap: {},
      } as never,
      scope: "workspace",
    });

    expect(record.scope).toBe("workspace");
    expect(store.get("packet-1")).toBe(record);
    expect(store.list("workspace")).toHaveLength(1);
    store.clear("workspace");
    expect(store.list()).toHaveLength(0);
  });
});
