import { runResearchEngineRealUrlReaderSmoke, type ResearchEngineRealUrlReaderSmokeResult, type ResearchEngineRealUrlReaderSmokeStatus } from "./realUrlReaderSmoke";
import { canonicalizePortfolioHost } from "./sourcePortfolio";
import type { CandidateSource } from "./types";

export type ConcurrentReaderStatus = ResearchEngineRealUrlReaderSmokeStatus | "skipped" | "aborted";

export type EvidenceTextLevel = "body_excerpt" | "snippet_only" | "title_only" | "none";

export type ConcurrentReadAttempt = {
  candidate: CandidateSource;
  status: ConcurrentReaderStatus;
  whyRead?: string;
  whySkipped?: string;
  reader?: ResearchEngineRealUrlReaderSmokeResult;
  httpStatus?: number;
  contentType?: string;
  errorKind?: string;
  evidenceTextLevel: EvidenceTextLevel;
  excerptLength: number;
  elapsedMs: number;
  warnings: string[];
  errors: string[];
};

export type ConcurrentReaderDiagnostics = {
  attemptedReadCount: number;
  completedReadCount: number;
  successfulReadCount: number;
  failedReadCount: number;
  skippedReadCount: number;
  abortedReadCount: number;
  readerConcurrency: number;
  globalReaderBudgetMs: number;
  perUrlTimeoutMs: number;
  partialResultsUsed: boolean;
  distinctAttemptedHosts: number;
  readAttemptHostDistribution: Record<string, number>;
  evidenceTextLevelDistribution: Record<EvidenceTextLevel, number>;
  concurrentReaderSummary: string;
};

export type ConcurrentReaderInput = {
  readQueue: CandidateSource[];
  maxReadAttempts: number;
  concurrency?: number;
  perUrlTimeoutMs?: number;
  globalBudgetMs?: number;
  abortSignal?: AbortSignal;
  whyRead?: (candidate: CandidateSource) => string;
};

export type ConcurrentReaderResult = {
  attempts: ConcurrentReadAttempt[];
  diagnostics: ConcurrentReaderDiagnostics;
};

const DEFAULT_CONCURRENCY = 5;
const MAX_CONCURRENCY = 6;
const DEFAULT_PER_URL_TIMEOUT_MS = 9_000;
const DEFAULT_GLOBAL_BUDGET_MS = 60_000;

const elapsedMsSince = (startedAt: number): number => Math.max(0, Math.round(performance.now() - startedAt));

const isDangerousReadUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return true;
    const host = parsed.hostname.toLocaleLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host === "127.0.0.1" ||
      host.startsWith("127.") ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
    ) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
};

const distribution = <T extends string>(values: T[]): Record<T, number> =>
  values.reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {} as Record<T, number>);

const evidenceTextLevelFor = (candidate: CandidateSource, reader?: ResearchEngineRealUrlReaderSmokeResult): EvidenceTextLevel => {
  if (reader?.excerptPreview?.trim()) return "body_excerpt";
  if (candidate.snippet?.trim()) return "snippet_only";
  if (candidate.title?.trim()) return "title_only";
  return "none";
};

const uniqueCandidates = (candidates: CandidateSource[], maxReadAttempts: number): CandidateSource[] => {
  const seen = new Set<string>();
  const output: CandidateSource[] = [];
  for (const candidate of candidates) {
    const key = candidate.url.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(candidate);
    if (output.length >= maxReadAttempts) break;
  }
  return output;
};

const errorKindFor = (reader?: ResearchEngineRealUrlReaderSmokeResult): string | undefined => {
  if (!reader || reader.ok) return undefined;
  return typeof reader.diagnosticsSnapshot.transportStatus === "string"
    ? reader.diagnosticsSnapshot.transportStatus
    : reader.status;
};

export const runConcurrentReader = async (
  input: ConcurrentReaderInput,
): Promise<ConcurrentReaderResult> => {
  const startedAt = performance.now();
  const concurrency = Math.max(1, Math.min(input.concurrency ?? DEFAULT_CONCURRENCY, MAX_CONCURRENCY));
  const perUrlTimeoutMs = input.perUrlTimeoutMs ?? DEFAULT_PER_URL_TIMEOUT_MS;
  const globalReaderBudgetMs = input.globalBudgetMs ?? DEFAULT_GLOBAL_BUDGET_MS;
  const readQueue = uniqueCandidates(input.readQueue, Math.max(1, input.maxReadAttempts));
  const attempts: ConcurrentReadAttempt[] = [];
  let nextIndex = 0;

  const budgetExpired = (): boolean => elapsedMsSince(startedAt) >= globalReaderBudgetMs;
  const aborted = (): boolean => Boolean(input.abortSignal?.aborted) || budgetExpired();

  const readOne = async (candidate: CandidateSource): Promise<ConcurrentReadAttempt> => {
    const readStartedAt = performance.now();
    if (aborted()) {
      return {
        candidate,
        status: "aborted",
        whyRead: input.whyRead?.(candidate),
        evidenceTextLevel: evidenceTextLevelFor(candidate),
        excerptLength: 0,
        elapsedMs: 0,
        warnings: [],
        errors: ["reader aborted before URL request"],
      };
    }
    if (!candidate.url) {
      return {
        candidate,
        status: "skipped",
        whySkipped: "no_candidate_url",
        evidenceTextLevel: evidenceTextLevelFor(candidate),
        excerptLength: 0,
        elapsedMs: 0,
        warnings: ["no_candidate_url"],
        errors: ["Candidate URL is empty."],
      };
    }
    if (isDangerousReadUrl(candidate.url)) {
      return {
        candidate,
        status: "skipped",
        whySkipped: "dangerous_or_private_url",
        evidenceTextLevel: evidenceTextLevelFor(candidate),
        excerptLength: 0,
        elapsedMs: elapsedMsSince(readStartedAt),
        warnings: ["dangerous_or_private_url"],
        errors: ["URL reader refused to read a non-public or unsafe URL."],
      };
    }
    try {
      const remainingMs = Math.max(1, globalReaderBudgetMs - elapsedMsSince(startedAt));
      const reader = await runResearchEngineRealUrlReaderSmoke({
        url: candidate.url,
        timeoutMs: Math.min(perUrlTimeoutMs, remainingMs),
      });
      const evidenceTextLevel = evidenceTextLevelFor(candidate, reader);
      return {
        candidate,
        status: reader.status,
        whyRead: input.whyRead?.(candidate),
        reader,
        httpStatus: reader.httpStatus,
        contentType: reader.contentType,
        errorKind: errorKindFor(reader),
        evidenceTextLevel,
        excerptLength: reader.excerptLength,
        elapsedMs: elapsedMsSince(readStartedAt),
        warnings: reader.warnings,
        errors: reader.errors,
      };
    } catch (error) {
      return {
        candidate,
        status: "backend_network_error",
        whyRead: input.whyRead?.(candidate),
        errorKind: "reader_exception",
        evidenceTextLevel: evidenceTextLevelFor(candidate),
        excerptLength: 0,
        elapsedMs: elapsedMsSince(readStartedAt),
        warnings: [],
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  };

  const worker = async (): Promise<void> => {
    while (nextIndex < readQueue.length && !aborted()) {
      const candidate = readQueue[nextIndex];
      nextIndex += 1;
      if (!candidate) continue;
      attempts.push(await readOne(candidate));
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, readQueue.length) }, () => worker()));

  while (nextIndex < readQueue.length && aborted()) {
    const candidate = readQueue[nextIndex];
    nextIndex += 1;
    if (!candidate) continue;
    attempts.push({
      candidate,
      status: "aborted",
      whyRead: input.whyRead?.(candidate),
      evidenceTextLevel: evidenceTextLevelFor(candidate),
      excerptLength: 0,
      elapsedMs: 0,
      warnings: [],
      errors: ["reader global budget or abort signal stopped before this URL"],
    });
  }

  const successfulReadCount = attempts.filter((attempt) => attempt.status === "fetched" || attempt.status === "partial" || attempt.status === "body_too_large").length;
  const skippedReadCount = attempts.filter((attempt) => attempt.status === "skipped").length;
  const abortedReadCount = attempts.filter((attempt) => attempt.status === "aborted").length;
  const failedReadCount = attempts.length - successfulReadCount - skippedReadCount - abortedReadCount;
  const hosts = attempts.map((attempt) => canonicalizePortfolioHost(attempt.candidate.host));
  const evidenceLevels = attempts.map((attempt) => attempt.evidenceTextLevel);
  return {
    attempts,
    diagnostics: {
      attemptedReadCount: attempts.length,
      completedReadCount: attempts.length - abortedReadCount,
      successfulReadCount,
      failedReadCount,
      skippedReadCount,
      abortedReadCount,
      readerConcurrency: concurrency,
      globalReaderBudgetMs,
      perUrlTimeoutMs,
      partialResultsUsed: abortedReadCount > 0 || failedReadCount > 0,
      distinctAttemptedHosts: new Set(hosts.filter((host) => host !== "unknown")).size,
      readAttemptHostDistribution: distribution(hosts),
      evidenceTextLevelDistribution: distribution(evidenceLevels),
      concurrentReaderSummary: `attempted=${attempts.length}; success=${successfulReadCount}; failed=${failedReadCount}; aborted=${abortedReadCount}; concurrency=${concurrency}`,
    },
  };
};
