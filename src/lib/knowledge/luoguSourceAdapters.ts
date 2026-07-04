import {
  createTrainingBatchDraft,
  createTrainingItemDraft,
} from "./trainingDrafts";
import {
  normalizeKnowledgeList,
  normalizeKnowledgeText,
  type KnowledgeAssetRow,
  type TrainingBatchDraft,
  type TrainingCollectionKind,
  type TrainingItemDraft,
  type TrainingSourceErrorCode,
  type TrainingSourceIssue,
  type TrainingSourceType,
} from "./knowledgeTypes";

export interface LuoguSubmissionSourceRecord {
  submissionId: string;
  problemId: string;
  problemTitle: string;
  difficulty?: string;
  status?: string;
  isAc?: boolean;
  submitTime?: string;
  statusLabel?: string;
}

export interface LuoguProblemSourceRecord {
  problemId: string;
  problemTitle: string;
  difficulty?: string;
  topics?: string[];
}

export interface LuoguProblemContentRecord {
  problemId: string;
  title?: string;
  topics?: string[];
  difficulty?: string;
}

export interface LuoguProblemSetRecord {
  problemSetId: string;
  title?: string;
  problems: LuoguProblemSourceRecord[];
}

export interface LuoguContestRecord {
  contestId: string;
  title?: string;
  problems: LuoguProblemSourceRecord[];
}

export interface LuoguSourceAdapterInput {
  sourceType: TrainingSourceType;
  now?: string;
  startDate?: string;
  endDate?: string;
  scanPages?: number;
  problemId?: string;
  problemSetInput?: string;
  contestInput?: string;
  requireAccepted?: boolean;
  includeCandidates?: boolean;
}

export interface LuoguSourceAdapterTransport {
  listSubmissions?: (input: LuoguSourceAdapterInput) => Promise<{ submissions: LuoguSubmissionSourceRecord[] }>;
  readProblemContent?: (input: { problemId: string }) => Promise<LuoguProblemContentRecord>;
  readProblemSet?: (input: { problemSetId: string }) => Promise<LuoguProblemSetRecord>;
  readContest?: (input: { contestId: string }) => Promise<LuoguContestRecord>;
  listExistingAssets?: () => Promise<KnowledgeAssetRow[]>;
}

export interface LuoguTrainingBatchDraftResult {
  batch: TrainingBatchDraft;
  items: TrainingItemDraft[];
}

function issue(code: TrainingSourceErrorCode, message: string, recoverable = true, extra: Partial<TrainingSourceIssue> = {}): TrainingSourceIssue {
  return {
    code,
    message: normalizeKnowledgeText(message, code),
    recoverable,
    ...extra,
  };
}

export function classifyLuoguSourceError(error: unknown): TrainingSourceErrorCode {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  if (/uid|client_id|cookie|login|auth|unauthorized|401|expired/.test(message)) return "auth-expired";
  if (/network|timeout|timed out|failed to fetch|dns|econn|fetch/.test(message)) return "network-error";
  if (/permission|403|forbidden|captcha|blocked|private/.test(message)) return "permission-denied";
  if (/empty|no submissions|no result|not found|missing input/.test(message)) return "empty-result";
  if (/partial|some items failed/.test(message)) return "partial-result";
  return "parse-error";
}

function issueFromError(error: unknown, extra: Partial<TrainingSourceIssue> = {}): TrainingSourceIssue {
  const message = String(error instanceof Error ? error.message : error);
  const code = classifyLuoguSourceError(error);
  return issue(code, message, code !== "parse-error", extra);
}

function normalizeProblemId(value: string): string {
  return value.trim().toUpperCase();
}

export function parseLuoguProblemSetId(input: string): string | null {
  const trimmed = input.trim();
  if (/^B?\d+$/i.test(trimmed)) return trimmed.toUpperCase();
  const match = trimmed.match(/luogu\.com\.cn\/(?:training|problemset)\/([A-Za-z]?\d+)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

export function parseLuoguContestId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/luogu\.com\.cn\/contest\/(\d+)/i);
  return match?.[1] ?? null;
}

function datePart(value: string | undefined): string {
  return (value ?? "").slice(0, 10);
}

function isInDateWindow(record: LuoguSubmissionSourceRecord, input: LuoguSourceAdapterInput): boolean {
  const submitDate = datePart(record.submitTime);
  if (!submitDate) return true;
  if (input.sourceType === "luogu-today") {
    return submitDate === datePart(input.now ?? new Date().toISOString());
  }
  if (input.sourceType === "luogu-range") {
    const startDate = input.startDate?.trim();
    const endDate = input.endDate?.trim();
    return (!startDate || submitDate >= startDate) && (!endDate || submitDate <= endDate);
  }
  return true;
}

function sourceLabel(input: LuoguSourceAdapterInput): string {
  if (input.sourceType === "luogu-today") return `${datePart(input.now ?? new Date().toISOString())} 今日训练`;
  if (input.sourceType === "luogu-range") return `${input.startDate ?? "开始"} - ${input.endDate ?? "结束"} 范围训练`;
  if (input.sourceType === "luogu-single") return `单题 ${normalizeProblemId(input.problemId ?? "")}`;
  if (input.sourceType === "luogu-problemset") return `洛谷题单 ${parseLuoguProblemSetId(input.problemSetInput ?? "") ?? input.problemSetInput ?? ""}`;
  if (input.sourceType === "luogu-contest") return `洛谷比赛 ${parseLuoguContestId(input.contestInput ?? "") ?? input.contestInput ?? ""}`;
  return "洛谷训练来源";
}

function collectionKind(sourceType: TrainingSourceType): TrainingCollectionKind {
  if (sourceType === "luogu-range") return "range-review";
  if (sourceType === "luogu-single") return "problem-review";
  if (sourceType === "luogu-problemset" || sourceType === "luogu-problemset-future") return "problemset-review";
  if (sourceType === "luogu-contest" || sourceType === "luogu-contest-future") return "contest-review";
  return "daily-log";
}

function buildBatch(input: LuoguSourceAdapterInput, itemIds: string[], warnings: TrainingSourceIssue[], errors: TrainingSourceIssue[]): TrainingBatchDraft {
  const createdAt = input.now ?? new Date().toISOString();
  const status = errors.length > 0 && itemIds.length > 0 ? "partial" : errors.length > 0 ? "failed" : "draft";
  const batch = createTrainingBatchDraft({
    id: `batch:${input.sourceType}:${createdAt.slice(0, 10)}:${normalizeKnowledgeText(input.problemId ?? input.problemSetInput ?? input.contestInput ?? "scan", "scan")}`,
    title: sourceLabel(input),
    sourceType: input.sourceType,
    sourceLabel: sourceLabel(input),
    createdAt,
    itemIds,
  });
  return {
    ...batch,
    status,
    collectionKind: collectionKind(input.sourceType),
    sourceInput: input.problemId ?? input.problemSetInput ?? input.contestInput,
    warnings,
    errors,
  };
}

function existingRefsForProblem(assets: KnowledgeAssetRow[], problemId: string): string[] {
  return assets
    .filter((asset) => asset.relatedProblems.map((problem) => problem.toUpperCase()).includes(problemId.toUpperCase()))
    .map((asset) => asset.path);
}

function duplicateCandidates(assets: KnowledgeAssetRow[], problemIds: string[]) {
  return normalizeKnowledgeList(problemIds)
    .map((problemId) => ({
      problemId,
      refs: existingRefsForProblem(assets, problemId),
      reason: "existing-knowledge-asset",
    }))
    .filter((candidate) => candidate.refs.length > 0);
}

function createItem(input: {
  batchId: string;
  sourceType: TrainingSourceType;
  problemId: string;
  problemTitle: string;
  difficulty?: string;
  submissions?: LuoguSubmissionSourceRecord[];
  topics?: string[];
  existingAssetRefs?: string[];
  error?: TrainingSourceIssue;
}): TrainingItemDraft {
  const submissionRefs = normalizeKnowledgeList((input.submissions ?? []).map((submission) => submission.submissionId));
  const item = createTrainingItemDraft({
    id: `item:${input.sourceType}:${input.problemId}`,
    batchId: input.batchId,
    problemId: input.problemId,
    problemTitle: input.problemTitle,
    submissionId: submissionRefs[0],
    submitTime: input.submissions?.[0]?.submitTime,
    difficulty: input.difficulty ?? input.submissions?.[0]?.difficulty,
  });
  const suggestedTopics = normalizeKnowledgeList(input.topics ?? []);
  const existingAssetRefs = normalizeKnowledgeList(input.existingAssetRefs ?? []);
  return {
    ...item,
    status: input.error ? "failed" : item.status,
    sourceType: input.sourceType,
    sourceRefs: [`luogu:${input.sourceType}:${input.problemId}`],
    submissionRefs,
    suggestedTopics,
    existingAssetRefs,
    draftFields: {
      ...item.fields,
      topics: suggestedTopics,
      relatedProblems: [input.problemId],
    },
    fields: {
      ...item.fields,
      topics: suggestedTopics,
      relatedProblems: [input.problemId],
    },
    error: input.error,
  };
}

async function readProblemTopics(
  problemId: string,
  transport: LuoguSourceAdapterTransport,
): Promise<{ topics: string[]; title?: string; difficulty?: string; error?: TrainingSourceIssue }> {
  if (!transport.readProblemContent) return { topics: [] };
  try {
    const content = await transport.readProblemContent({ problemId });
    return {
      topics: normalizeKnowledgeList(content.topics ?? []),
      title: content.title,
      difficulty: content.difficulty,
    };
  } catch (error) {
    return {
      topics: [],
      error: issueFromError(error, { problemId }),
    };
  }
}

function groupSubmissions(submissions: LuoguSubmissionSourceRecord[]): Map<string, LuoguSubmissionSourceRecord[]> {
  const grouped = new Map<string, LuoguSubmissionSourceRecord[]>();
  for (const submission of submissions) {
    const problemId = normalizeProblemId(submission.problemId);
    if (!problemId) continue;
    grouped.set(problemId, [...(grouped.get(problemId) ?? []), { ...submission, problemId }]);
  }
  return grouped;
}

async function normalizeSubmissionSource(
  input: LuoguSourceAdapterInput,
  transport: LuoguSourceAdapterTransport,
  assets: KnowledgeAssetRow[],
): Promise<LuoguTrainingBatchDraftResult> {
  const warnings: TrainingSourceIssue[] = [];
  const errors: TrainingSourceIssue[] = [];
  let submissions: LuoguSubmissionSourceRecord[] = [];

  try {
    submissions = (await transport.listSubmissions?.(input))?.submissions ?? [];
  } catch (error) {
    const sourceError = issueFromError(error);
    errors.push(sourceError);
    const batch = buildBatch(input, [], warnings, errors);
    return { batch, items: [] };
  }

  submissions = submissions.filter((submission) => isInDateWindow(submission, input));
  if (input.sourceType === "luogu-single" && input.problemId) {
    const problemId = normalizeProblemId(input.problemId);
    submissions = submissions.filter((submission) => normalizeProblemId(submission.problemId) === problemId);
  }

  if (submissions.length === 0 && input.sourceType === "luogu-single" && input.problemId) {
    const problemId = normalizeProblemId(input.problemId);
    const read = await readProblemTopics(problemId, transport);
    if (read.error) warnings.push(read.error);
    const batch = buildBatch(input, [`item:${input.sourceType}:${problemId}`], warnings, errors);
    return {
      batch,
      items: [
        createItem({
          batchId: batch.id,
          sourceType: input.sourceType,
          problemId,
          problemTitle: read.title ?? problemId,
          topics: read.topics,
          existingAssetRefs: existingRefsForProblem(assets, problemId),
          error: read.error,
        }),
      ],
    };
  }

  if (submissions.length === 0) {
    errors.push(issue("empty-result", "No Luogu submissions matched this source.", true));
  }

  const grouped = groupSubmissions(submissions);
  const itemInputs = await Promise.all(Array.from(grouped.entries()).map(async ([problemId, records]) => {
    const accepted = records.some((record) => record.isAc || /accepted|ac/i.test(`${record.status ?? ""} ${record.statusLabel ?? ""}`));
    const read = await readProblemTopics(problemId, transport);
    const noAcceptedError = input.requireAccepted && !accepted
      ? issue("empty-result", "No accepted submission was found for this problem.", true, { problemId })
      : undefined;
    const error = read.error ?? noAcceptedError;
    if (error) errors.push(error);
    return {
      problemId,
      problemTitle: read.title ?? records[0]?.problemTitle ?? problemId,
      difficulty: read.difficulty ?? records[0]?.difficulty,
      submissions: records,
      topics: read.topics,
      existingAssetRefs: existingRefsForProblem(assets, problemId),
      error,
    };
  }));

  const itemIds = itemInputs.map((item) => `item:${input.sourceType}:${item.problemId}`);
  const batchErrors = errors.length > 0 && itemInputs.some((item) => !item.error)
    ? [issue("partial-result", "Some Luogu source items failed while other items were kept.", true)]
    : errors;
  const batch = {
    ...buildBatch(input, itemIds, warnings, batchErrors),
    duplicateCandidates: duplicateCandidates(assets, itemInputs.map((item) => item.problemId)),
  };
  return {
    batch,
    items: itemInputs.map((item) => createItem({
      batchId: batch.id,
      sourceType: input.sourceType,
      ...item,
    })),
  };
}

async function normalizeProblemRefsSource(
  input: LuoguSourceAdapterInput,
  transport: LuoguSourceAdapterTransport,
  assets: KnowledgeAssetRow[],
): Promise<LuoguTrainingBatchDraftResult> {
  const warnings: TrainingSourceIssue[] = [];
  const errors: TrainingSourceIssue[] = [];
  const isProblemSet = input.sourceType === "luogu-problemset";
  const sourceId = isProblemSet
    ? parseLuoguProblemSetId(input.problemSetInput ?? "")
    : parseLuoguContestId(input.contestInput ?? "");
  if (!sourceId) {
    const sourceError = issue("parse-error", "Unable to parse Luogu source id from input.", true);
    const batch = buildBatch(input, [], warnings, [sourceError]);
    return { batch, items: [] };
  }

  try {
    const record = isProblemSet
      ? await transport.readProblemSet?.({ problemSetId: sourceId })
      : await transport.readContest?.({ contestId: sourceId });
    if (!record) {
      throw new Error("Luogu source reader is not available for this source type.");
    }
    const problems = record?.problems ?? [];
    if (problems.length === 0) {
      warnings.push(issue("empty-result", "Luogu source returned no problem refs.", true, { sourceRef: sourceId }));
    }

    const submissions = (await transport.listSubmissions?.(input))?.submissions ?? [];
    const submissionsByProblem = groupSubmissions(submissions);
    const itemIds = problems.map((problem) => `item:${input.sourceType}:${normalizeProblemId(problem.problemId)}`);
    const batch = {
      ...buildBatch(
        {
          ...input,
          now: input.now,
          problemSetInput: isProblemSet ? sourceId : input.problemSetInput,
          contestInput: isProblemSet ? input.contestInput : sourceId,
        },
        itemIds,
        warnings,
        errors,
      ),
      title: record?.title ? `${record.title} ${isProblemSet ? "题单沉淀" : "比赛复盘"}` : sourceLabel(input),
      duplicateCandidates: duplicateCandidates(assets, problems.map((problem) => normalizeProblemId(problem.problemId))),
    };
    return {
      batch,
      items: problems.map((problem) => {
        const problemId = normalizeProblemId(problem.problemId);
        return createItem({
          batchId: batch.id,
          sourceType: input.sourceType,
          problemId,
          problemTitle: normalizeKnowledgeText(problem.problemTitle, problemId),
          difficulty: problem.difficulty,
          topics: problem.topics,
          submissions: submissionsByProblem.get(problemId) ?? [],
          existingAssetRefs: existingRefsForProblem(assets, problemId),
        });
      }),
    };
  } catch (error) {
    const sourceError = issueFromError(error, { sourceRef: sourceId });
    warnings.push(sourceError);
    const candidateProblemId = `${isProblemSet ? "problemset" : "contest"}:${sourceId}`;
    const batch = buildBatch(
      {
        ...input,
        problemSetInput: isProblemSet ? sourceId : input.problemSetInput,
        contestInput: isProblemSet ? input.contestInput : sourceId,
      },
      [`item:${input.sourceType}:${candidateProblemId}`],
      warnings,
      errors,
    );
    return {
      batch,
      items: [
        createItem({
          batchId: batch.id,
          sourceType: input.sourceType,
          problemId: candidateProblemId,
          problemTitle: isProblemSet ? `洛谷题单 ${sourceId}` : `洛谷比赛 ${sourceId}`,
          error: sourceError,
        }),
      ],
    };
  }
}

export async function createLuoguTrainingBatchDraft(
  input: LuoguSourceAdapterInput,
  transport: LuoguSourceAdapterTransport,
): Promise<LuoguTrainingBatchDraftResult> {
  const assets = await transport.listExistingAssets?.().catch(() => []) ?? [];
  if (input.sourceType === "luogu-problemset" || input.sourceType === "luogu-contest") {
    return normalizeProblemRefsSource(input, transport, assets);
  }
  return normalizeSubmissionSource(input, transport, assets);
}
