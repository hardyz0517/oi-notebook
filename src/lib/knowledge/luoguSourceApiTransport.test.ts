import { describe, expect, it, vi } from "vitest";

import { createLuoguSourceApiTransport } from "./luoguSourceApiTransport";
import { createLuoguTrainingBatchDraft } from "./luoguSourceAdapters";

describe("luoguSourceApiTransport", () => {
  it("maps paged Luogu submission previews into source records", async () => {
    const transport = createLuoguSourceApiTransport({
      previewLuoguSubmissionPage: vi.fn()
        .mockResolvedValueOnce({
          hasMore: true,
          submissions: [
            {
              submissionId: "1",
              problemId: "P1001",
              problemTitle: "A+B Problem",
              difficulty: "入门",
              status: "Accepted",
              isAc: true,
              submitTime: "2026-07-03T09:00:00.000Z",
              statusLabel: "AC",
            },
          ],
        })
        .mockResolvedValueOnce({
          hasMore: false,
          submissions: [
            {
              submissionId: "2",
              problemId: "P1002",
              problemTitle: "过河卒",
              difficulty: "普及-",
              status: "Wrong Answer",
              isAc: false,
              submitTime: "2026-07-03T10:00:00.000Z",
              statusLabel: "WA",
            },
          ],
        }),
      readLuoguProblemContent: vi.fn(),
      getKnowledgeAssets: vi.fn().mockResolvedValue([]),
    });

    await expect(transport.listSubmissions?.({
      sourceType: "luogu-range",
      scanPages: 5,
    })).resolves.toEqual({
      submissions: [
        expect.objectContaining({ submissionId: "1", problemId: "P1001", isAc: true }),
        expect.objectContaining({ submissionId: "2", problemId: "P1002", isAc: false }),
      ],
    });
  });

  it("lets unavailable problem set readers degrade into candidate batches", async () => {
    const transport = createLuoguSourceApiTransport({
      previewLuoguSubmissionPage: vi.fn(),
      readLuoguProblemContent: vi.fn(),
      getKnowledgeAssets: vi.fn().mockResolvedValue([]),
    });

    const result = await createLuoguTrainingBatchDraft({
      sourceType: "luogu-problemset",
      problemSetInput: "https://www.luogu.com.cn/training/54321",
    }, transport);

    expect(result.batch.warnings).toEqual([
      expect.objectContaining({ code: "parse-error", sourceRef: "54321" }),
    ]);
    expect(result.items).toEqual([
      expect.objectContaining({ problemId: "problemset:54321", status: "failed" }),
    ]);
  });

  it("maps Luogu problem set and contest API readers into source records", async () => {
    const transport = createLuoguSourceApiTransport({
      previewLuoguSubmissionPage: vi.fn().mockResolvedValue({
        hasMore: false,
        submissions: [],
      }),
      readLuoguProblemContent: vi.fn(),
      readLuoguProblemSet: vi.fn().mockResolvedValue({
        problemSetId: "54321",
        title: "图论题单",
        problems: [
          { problemId: "P3379", problemTitle: "最近公共祖先", difficulty: "普及+/提高", topics: ["LCA"] },
        ],
      }),
      readLuoguContest: vi.fn().mockResolvedValue({
        contestId: "987654",
        title: "模拟赛",
        problems: [
          { problemId: "P1001", problemTitle: "A+B Problem", difficulty: "入门", topics: [] },
        ],
      }),
      getKnowledgeAssets: vi.fn().mockResolvedValue([]),
    });

    await expect(transport.readProblemSet?.({ problemSetId: "54321" })).resolves.toEqual({
      problemSetId: "54321",
      title: "图论题单",
      problems: [
        { problemId: "P3379", problemTitle: "最近公共祖先", difficulty: "普及+/提高", topics: ["LCA"] },
      ],
    });
    await expect(transport.readContest?.({ contestId: "987654" })).resolves.toEqual({
      contestId: "987654",
      title: "模拟赛",
      problems: [
        { problemId: "P1001", problemTitle: "A+B Problem", difficulty: "入门", topics: [] },
      ],
    });
  });
});
