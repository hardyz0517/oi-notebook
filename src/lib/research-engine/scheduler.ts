import type {
  CandidatePriority,
  CandidateSource,
  PipelineEvent,
  SchedulerConfig,
  SchedulerSnapshot,
  StaleGuardState,
} from "./types";

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  maxCandidates: 64,
  maxReadTargets: 10,
  maxConcurrentReads: 4,
  perHostLimit: 2,
  softDeadlineMs: 2500,
  hardDeadlineMs: 8000,
  priorityTopK: 3,
  minStrongEvidence: 1,
  minMediumEvidence: 2,
};

const priorityWeight: Record<CandidatePriority, number> = {
  core: 400,
  preferred: 300,
  supplemental: 150,
  background: 50,
};

const sourceTypeWeight = (sourceType: CandidateSource["sourceType"]): number => {
  if (sourceType === "official" || sourceType === "documentation") return 120;
  if (sourceType === "mainstream_news" || sourceType === "fact_check") return 90;
  if (sourceType === "technical_blog" || sourceType === "problem_statement") return 60;
  if (sourceType === "community_solution" || sourceType === "forum") return 25;
  if (sourceType === "seo_aggregator") return -80;
  return 0;
};

const event = (
  jobId: string,
  type: PipelineEvent["type"],
  createdAt: number,
  candidateId?: string,
  message?: string,
): PipelineEvent => ({
  id: `${jobId}:${type}:${candidateId ?? "job"}:${createdAt}`,
  jobId,
  type,
  createdAt,
  candidateId,
  message,
});

const scoreCandidate = (candidate: CandidateSource): number =>
  (candidate.score ?? 0) + priorityWeight[candidate.priority] + sourceTypeWeight(candidate.sourceType);

const normalizeCandidates = (
  jobId: string,
  candidates: CandidateSource[],
  config: SchedulerConfig,
): CandidateSource[] =>
  candidates
    .filter((candidate) => candidate.jobId === jobId)
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate) }))
    .sort((left, right) => (right.score ?? 0) - (left.score ?? 0))
    .slice(0, config.maxCandidates);

export const createSchedulerSnapshot = (
  jobId: string,
  candidates: CandidateSource[],
  config: Partial<SchedulerConfig> = {},
  nowMs = 0,
): SchedulerSnapshot => {
  const finalConfig = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
  const staleGuard: StaleGuardState = { activeJobId: jobId, jobEpoch: 1, abortedJobIds: [] };
  const normalized = normalizeCandidates(jobId, candidates, finalConfig);
  return {
    jobId,
    activeJobId: jobId,
    nowMs,
    candidates: normalized,
    scheduledCandidateIds: [],
    readingCandidateIds: [],
    finishedCandidateIds: [],
    rejectedCandidateIds: [],
    zombieCandidateIds: [],
    events: [event(jobId, "job_started", nowMs)],
    config: finalConfig,
    staleGuard,
  };
};

export const scheduleCandidates = (snapshot: SchedulerSnapshot): SchedulerSnapshot => {
  const hostCounts = new Map<string, number>();
  const scheduled = new Set(snapshot.scheduledCandidateIds);
  for (const candidate of snapshot.candidates) {
    if (candidate.readState === "scheduled" || candidate.readState === "reading") {
      hostCounts.set(candidate.host, (hostCounts.get(candidate.host) ?? 0) + 1);
      scheduled.add(candidate.id);
    }
  }
  const events: PipelineEvent[] = [];
  const nextCandidates = snapshot.candidates.map((candidate) => {
    if (scheduled.size >= snapshot.config.maxReadTargets) return candidate;
    if (candidate.status !== "discovered" && candidate.status !== "queued") return candidate;
    const currentHostCount = hostCounts.get(candidate.host) ?? 0;
    if (currentHostCount >= snapshot.config.perHostLimit) {
      return { ...candidate, status: "queued" as const };
    }
    scheduled.add(candidate.id);
    hostCounts.set(candidate.host, currentHostCount + 1);
    events.push(event(snapshot.jobId, "candidate_scheduled", snapshot.nowMs, candidate.id));
    return { ...candidate, status: "scheduled" as const, readState: "scheduled" as const, scheduledAt: snapshot.nowMs };
  });

  return {
    ...snapshot,
    candidates: nextCandidates,
    scheduledCandidateIds: [...scheduled],
    events: [...snapshot.events, ...events],
  };
};

export const simulateSchedulerStep = (
  snapshot: SchedulerSnapshot,
  options: {
    activeJobId?: string;
    aborted?: boolean;
    finishCandidateIds?: string[];
    nowMs?: number;
  } = {},
): SchedulerSnapshot => {
  const activeJobId = options.activeJobId ?? snapshot.activeJobId;
  const nowMs = options.nowMs ?? snapshot.nowMs + 1;
  const finishCandidateIds = new Set(options.finishCandidateIds ?? []);

  if (activeJobId !== snapshot.jobId || options.aborted) {
    const nextCandidates = snapshot.candidates.map((candidate) =>
      finishCandidateIds.has(candidate.id)
        ? {
            ...candidate,
            status: "zombie_discarded" as const,
            readState: "zombie_discarded" as const,
            finishedAt: nowMs,
          }
        : candidate,
    );
    const zombieEvents = snapshot.candidates
      .filter((candidate) => finishCandidateIds.has(candidate.id))
      .map((candidate) => event(snapshot.jobId, "zombie_discarded", nowMs, candidate.id, "late_result_discarded"));
    const zombieCandidateIds = new Set([...snapshot.zombieCandidateIds, ...finishCandidateIds]);
    return {
      ...snapshot,
      activeJobId,
      nowMs,
      candidates: nextCandidates,
      staleGuard: {
        ...snapshot.staleGuard,
        activeJobId,
        abortedJobIds: options.aborted ? [...snapshot.staleGuard.abortedJobIds, snapshot.jobId] : snapshot.staleGuard.abortedJobIds,
      },
      readingCandidateIds: nextCandidates.filter((candidate) => candidate.readState === "reading").map((candidate) => candidate.id),
      zombieCandidateIds: [...zombieCandidateIds],
      events: [...snapshot.events, ...zombieEvents],
    };
  }

  const runningHosts = new Map<string, number>();
  const readingIds = new Set(snapshot.readingCandidateIds);
  for (const candidate of snapshot.candidates) {
    if (candidate.readState === "reading") {
      runningHosts.set(candidate.host, (runningHosts.get(candidate.host) ?? 0) + 1);
      readingIds.add(candidate.id);
    }
  }
  const events: PipelineEvent[] = [];
  const nextCandidates = snapshot.candidates.map((candidate) => {
    if (finishCandidateIds.has(candidate.id) && candidate.readState === "reading") {
      events.push(event(snapshot.jobId, "candidate_read_finished", nowMs, candidate.id));
      return { ...candidate, status: "finished" as const, readState: "finished" as const, finishedAt: nowMs };
    }
    if (candidate.readState !== "scheduled") return candidate;
    if (readingIds.size >= snapshot.config.maxConcurrentReads) return candidate;
    const hostCount = runningHosts.get(candidate.host) ?? 0;
    if (hostCount >= snapshot.config.perHostLimit) return candidate;
    runningHosts.set(candidate.host, hostCount + 1);
    readingIds.add(candidate.id);
    events.push(event(snapshot.jobId, "candidate_read_started", nowMs, candidate.id));
    return { ...candidate, status: "reading" as const, readState: "reading" as const };
  });

  return {
    ...snapshot,
    nowMs,
    candidates: nextCandidates,
    readingCandidateIds: nextCandidates.filter((candidate) => candidate.readState === "reading").map((candidate) => candidate.id),
    finishedCandidateIds: nextCandidates.filter((candidate) => candidate.readState === "finished").map((candidate) => candidate.id),
    events: [...snapshot.events, ...events],
  };
};
