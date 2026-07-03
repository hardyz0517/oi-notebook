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
});
