import { describe, expect, it } from "vitest";

import {
  classifyLuoguSourceError,
  createLuoguTrainingBatchDraft,
  parseLuoguContestId,
  parseLuoguProblemSetId,
} from "./luoguSourceAdapters";
import type { KnowledgeAssetRow } from "./knowledgeTypes";

const existingFragment: KnowledgeAssetRow = {
  id: "asset:knowledge/fragments/P1001.md",
  type: "asset",
  assetType: "fragment",
  kind: "problem-note",
  title: "P1001 A+B",
  date: "2026-07-01",
  topics: ["入门"],
  relatedProblems: ["P1001"],
  source: "luogu",
  createdFrom: "training-center",
  reviewPriority: "medium",
  status: "active",
  path: "knowledge/fragments/P1001.md",
  refs: ["knowledge/fragments/P1001.md"],
  lastModified: "2026-07-01T00:00:00.000Z",
  relationCount: 1,
  missingMetadataFlags: [],
  classificationReason: "explicit_type",
  classificationConfidence: 1,
  inDegree: 0,
  outDegree: 1,
  degree: 1,
  isolated: false,
  componentId: 0,
};

describe("luogu source adapters", () => {
  it("parses problem set and contest ids from plain ids or Luogu links", () => {
    expect(parseLuoguProblemSetId("B12345")).toBe("B12345");
    expect(parseLuoguProblemSetId("https://www.luogu.com.cn/training/54321#problems")).toBe("54321");
    expect(parseLuoguProblemSetId("https://www.luogu.com.cn/problem/list?tag=1")).toBe(null);

    expect(parseLuoguContestId("987654")).toBe("987654");
    expect(parseLuoguContestId("https://www.luogu.com.cn/contest/987654")).toBe("987654");
    expect(parseLuoguContestId("https://www.luogu.com.cn/problem/P1001")).toBe(null);
  });

  it("normalizes today submissions into a TrainingBatchDraft with duplicates and partial failures", async () => {
    const result = await createLuoguTrainingBatchDraft(
      {
        sourceType: "luogu-today",
        now: "2026-07-03T12:00:00.000Z",
        requireAccepted: true,
      },
      {
        listSubmissions: async () => ({
          submissions: [
            {
              submissionId: "101",
              problemId: "P1001",
              problemTitle: "A+B Problem",
              difficulty: "入门",
              status: "Accepted",
              isAc: true,
              submitTime: "2026-07-03T09:00:00.000Z",
              statusLabel: "AC",
            },
            {
              submissionId: "102",
              problemId: "P2002",
              problemTitle: "消息扩散",
              difficulty: "提高",
              status: "Wrong Answer",
              isAc: false,
              submitTime: "2026-07-03T10:00:00.000Z",
              statusLabel: "WA",
            },
          ],
        }),
        readProblemContent: async ({ problemId }) => {
          if (problemId === "P2002") throw new Error("Luogu problem read failed: 403 permission denied");
          return {
            problemId,
            title: problemId === "P1001" ? "A+B Problem" : "",
            topics: ["模拟"],
          };
        },
        listExistingAssets: async () => [existingFragment],
      },
    );

    expect(result.batch.sourceType).toBe("luogu-today");
    expect(result.batch.errors).toEqual([
      expect.objectContaining({ code: "partial-result" }),
    ]);
    expect(result.batch.duplicateCandidates).toEqual([
      expect.objectContaining({ problemId: "P1001", refs: ["knowledge/fragments/P1001.md"] }),
    ]);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      problemId: "P1001",
      submissionRefs: ["101"],
      suggestedTopics: ["模拟"],
      existingAssetRefs: ["knowledge/fragments/P1001.md"],
      status: "draft",
    });
    expect(result.items[1]).toMatchObject({
      problemId: "P2002",
      status: "failed",
      error: { code: "permission-denied" },
    });
  });

  it("normalizes range submissions by date window", async () => {
    const result = await createLuoguTrainingBatchDraft(
      {
        sourceType: "luogu-range",
        now: "2026-07-03T12:00:00.000Z",
        startDate: "2026-07-01",
        endDate: "2026-07-02",
        requireAccepted: false,
      },
      {
        listSubmissions: async () => ({
          submissions: [
            {
              submissionId: "201",
              problemId: "P1001",
              problemTitle: "A+B Problem",
              status: "Accepted",
              isAc: true,
              submitTime: "2026-07-01T09:00:00.000Z",
            },
            {
              submissionId: "202",
              problemId: "P1002",
              problemTitle: "过河卒",
              status: "Accepted",
              isAc: true,
              submitTime: "2026-07-03T09:00:00.000Z",
            },
          ],
        }),
        listExistingAssets: async () => [],
      },
    );

    expect(result.batch).toMatchObject({
      sourceType: "luogu-range",
      collectionKind: "range-review",
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      problemId: "P1001",
      submissionRefs: ["201"],
    });
  });

  it("keeps single problem as a retryable source item when no submission exists", async () => {
    const result = await createLuoguTrainingBatchDraft(
      {
        sourceType: "luogu-single",
        problemId: "p3379",
      },
      {
        listSubmissions: async () => ({ submissions: [] }),
        readProblemContent: async ({ problemId }) => ({
          problemId,
          title: "最近公共祖先",
          topics: ["LCA"],
          difficulty: "普及+/提高",
        }),
        listExistingAssets: async () => [],
      },
    );

    expect(result.batch).toMatchObject({
      sourceType: "luogu-single",
      collectionKind: "problem-review",
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        problemId: "P3379",
        problemTitle: "最近公共祖先",
        suggestedTopics: ["LCA"],
        status: "draft",
      }),
    ]);
  });

  it("keeps problem set input as candidate refs when detail reading fails", async () => {
    const result = await createLuoguTrainingBatchDraft(
      {
        sourceType: "luogu-problemset",
        problemSetInput: "https://www.luogu.com.cn/training/54321",
        includeCandidates: true,
      },
      {
        readProblemSet: async () => {
          throw new Error("network timeout");
        },
        listExistingAssets: async () => [],
      },
    );

    expect(result.batch.sourceType).toBe("luogu-problemset");
    expect(result.batch.sourceLabel).toContain("54321");
    expect(result.batch.warnings).toEqual([
      expect.objectContaining({ code: "network-error" }),
    ]);
    expect(result.items).toEqual([
      expect.objectContaining({
        problemId: "problemset:54321",
        problemTitle: "洛谷题单 54321",
        status: "failed",
        error: expect.objectContaining({ code: "network-error" }),
      }),
    ]);
  });

  it("normalizes contest metadata as contest-review collection draft items", async () => {
    const result = await createLuoguTrainingBatchDraft(
      {
        sourceType: "luogu-contest",
        contestInput: "https://www.luogu.com.cn/contest/987654",
      },
      {
        readContest: async () => ({
          contestId: "987654",
          title: "7 月模拟赛",
          problems: [
            { problemId: "P3379", problemTitle: "最近公共祖先", topics: ["LCA"] },
          ],
        }),
        listSubmissions: async () => ({
          submissions: [
            {
              submissionId: "301",
              problemId: "P3379",
              problemTitle: "最近公共祖先",
              difficulty: "普及+/提高",
              status: "Accepted",
              isAc: true,
              submitTime: "2026-07-02T20:00:00.000Z",
              statusLabel: "AC",
            },
          ],
        }),
        listExistingAssets: async () => [],
      },
    );

    expect(result.batch).toMatchObject({
      sourceType: "luogu-contest",
      collectionKind: "contest-review",
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        problemId: "P3379",
        submissionRefs: ["301"],
        suggestedTopics: ["LCA"],
      }),
    ]);
  });

  it("classifies auth, network, permission, empty, partial, and parse errors", () => {
    expect(classifyLuoguSourceError("uid is missing")).toBe("auth-expired");
    expect(classifyLuoguSourceError("Failed to fetch: timeout")).toBe("network-error");
    expect(classifyLuoguSourceError("403 permission denied")).toBe("permission-denied");
    expect(classifyLuoguSourceError("no submissions found")).toBe("empty-result");
    expect(classifyLuoguSourceError("some items failed")).toBe("partial-result");
    expect(classifyLuoguSourceError("unexpected JSON structure")).toBe("parse-error");
  });
});
