import {
  getKnowledgeAssets,
  previewLuoguSubmissionPage,
  readLuoguProblemContent,
  type KnowledgeAssetRowResult,
  type PreviewLuoguSubmission,
} from "@/lib/api";
import type {
  LuoguProblemContentRecord,
  LuoguSourceAdapterInput,
  LuoguSourceAdapterTransport,
  LuoguSubmissionSourceRecord,
} from "./luoguSourceAdapters";
import type { KnowledgeAssetRow } from "./knowledgeTypes";

export interface LuoguSourceApiTransportDeps {
  previewLuoguSubmissionPage: typeof previewLuoguSubmissionPage;
  readLuoguProblemContent: typeof readLuoguProblemContent;
  getKnowledgeAssets: typeof getKnowledgeAssets;
}

const DEFAULT_SCAN_PAGES = 3;

function mapSubmission(submission: PreviewLuoguSubmission): LuoguSubmissionSourceRecord {
  return {
    submissionId: submission.submissionId,
    problemId: submission.problemId,
    problemTitle: submission.problemTitle,
    difficulty: submission.difficulty,
    status: submission.status,
    isAc: submission.isAc,
    submitTime: submission.submitTime,
    statusLabel: submission.statusLabel,
  };
}

function mapKnowledgeAsset(row: KnowledgeAssetRowResult): KnowledgeAssetRow {
  return {
    ...row,
    openPath: row.path,
  };
}

export function createLuoguSourceApiTransport(
  deps: LuoguSourceApiTransportDeps = {
    previewLuoguSubmissionPage,
    readLuoguProblemContent,
    getKnowledgeAssets,
  },
): LuoguSourceAdapterTransport {
  return {
    async listSubmissions(input: LuoguSourceAdapterInput) {
      const scanPages = Math.max(1, Math.min(input.scanPages ?? DEFAULT_SCAN_PAGES, 50));
      const submissions: LuoguSubmissionSourceRecord[] = [];
      for (let page = 1; page <= scanPages; page += 1) {
        const result = await deps.previewLuoguSubmissionPage(page);
        submissions.push(...result.submissions.map(mapSubmission));
        if (!result.hasMore) break;
      }
      return { submissions };
    },

    async readProblemContent({ problemId }: { problemId: string }): Promise<LuoguProblemContentRecord> {
      const result = await deps.readLuoguProblemContent({ problemId, kind: "problem" });
      if (!result.fetched && result.error) {
        throw new Error(result.error);
      }
      return {
        problemId: result.problemId,
        title: result.title,
        topics: [],
      };
    },

    async readProblemSet({ problemSetId }: { problemSetId: string }) {
      throw new Error(`Luogu problem set reader is not available yet: ${problemSetId}`);
    },

    async readContest({ contestId }: { contestId: string }) {
      throw new Error(`Luogu contest reader is not available yet: ${contestId}`);
    },

    async listExistingAssets() {
      return (await deps.getKnowledgeAssets()).map(mapKnowledgeAsset);
    },
  };
}
