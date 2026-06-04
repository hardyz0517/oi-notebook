import type { EventBufferConfig, EventBufferSnapshot, PipelineEvent } from "./types";

export const DEFAULT_EVENT_BUFFER_CONFIG: EventBufferConfig = {
  mode: "normal",
  maxEvents: 24,
  maxDeveloperEvents: 80,
};

export const createEventBuffer = (
  jobId: string,
  config: Partial<EventBufferConfig> = {},
): EventBufferSnapshot => {
  const finalConfig = { ...DEFAULT_EVENT_BUFFER_CONFIG, ...config };
  return {
    jobId,
    mode: finalConfig.mode,
    totalEventsSeen: 0,
    retainedEvents: [],
    normalSummary: {
      status: "idle",
      discovered: 0,
      scheduled: 0,
      reading: 0,
      finished: 0,
      rejected: 0,
      zombies: 0,
    },
    droppedEventCount: 0,
  };
};

const summarize = (events: PipelineEvent[]): EventBufferSnapshot["normalSummary"] => {
  const latestReadiness = [...events].reverse().find((event) => event.type === "readiness_changed");
  return {
    status: events.length > 0 ? events[events.length - 1].type : "idle",
    discovered: events.filter((event) => event.type === "candidate_discovered").length,
    scheduled: events.filter((event) => event.type === "candidate_scheduled").length,
    reading: events.filter((event) => event.type === "candidate_read_started").length,
    finished: events.filter((event) => event.type === "candidate_read_finished").length,
    rejected: events.filter((event) => event.type === "candidate_rejected").length,
    zombies: events.filter((event) => event.type === "zombie_discarded").length,
    readiness: latestReadiness?.message,
  };
};

const compressByCandidateState = (events: PipelineEvent[]): PipelineEvent[] => {
  const result: PipelineEvent[] = [];
  const latestCandidateState = new Map<string, number>();
  for (const event of events) {
    if (!event.candidateId || !event.type.startsWith("candidate_")) {
      result.push(event);
      continue;
    }
    const key = `${event.candidateId}:${event.type}`;
    const existingIndex = latestCandidateState.get(key);
    if (existingIndex !== undefined) {
      result[existingIndex] = event;
    } else {
      latestCandidateState.set(key, result.length);
      result.push(event);
    }
  }
  return result;
};

export const appendPipelineEvents = (
  snapshot: EventBufferSnapshot,
  events: PipelineEvent[],
  config: Partial<EventBufferConfig> = {},
): EventBufferSnapshot => {
  const finalConfig = { ...DEFAULT_EVENT_BUFFER_CONFIG, mode: snapshot.mode, ...config };
  const sameJobEvents = events.filter((event) => event.jobId === snapshot.jobId);
  const combined = compressByCandidateState([...snapshot.retainedEvents, ...sameJobEvents]);
  const limit = finalConfig.mode === "developer" ? finalConfig.maxDeveloperEvents : finalConfig.maxEvents;
  const retainedEvents = combined.slice(-limit);
  return {
    ...snapshot,
    mode: finalConfig.mode,
    totalEventsSeen: snapshot.totalEventsSeen + sameJobEvents.length,
    retainedEvents,
    normalSummary: summarize([...snapshot.retainedEvents, ...sameJobEvents]),
    droppedEventCount: snapshot.droppedEventCount + Math.max(0, combined.length - retainedEvents.length),
  };
};

export const flushEventBuffer = (
  snapshot: EventBufferSnapshot,
): EventBufferSnapshot => ({
  ...snapshot,
  retainedEvents: snapshot.mode === "developer" ? snapshot.retainedEvents : [],
});
