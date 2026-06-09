import type { ResearchPlanIntent } from "./researchPlanTypes";

export type DateConfidence = "high" | "medium" | "low" | "none";

export type FreshnessStatus = "fresh" | "stale" | "unknown" | "future_date_suspicious";

export type DateSignalSource =
  | "provider_metadata"
  | "reader_metadata"
  | "title"
  | "snippet"
  | "body_excerpt"
  | "url_path"
  | "relative_text"
  | "none";

export type DateSignalResult = {
  publishedDate?: string;
  dateSignalText?: string;
  dateSignalSource: DateSignalSource;
  dateConfidence: DateConfidence;
  ageDays?: number;
  isRecentEnough: boolean;
  freshnessStatus: FreshnessStatus;
  freshnessReason: string;
};

export type FreshnessWindowPolicy = {
  currentDate: string;
  freshnessWindowDays: number;
  freshnessRequired: boolean;
  freshnessReason: string;
  queryFreshnessHints: string[];
};

type DateCandidate = {
  date: Date;
  text: string;
  source: DateSignalSource;
  confidence: DateConfidence;
};

const DAY_MS = 86_400_000;

const NEWS_INTENTS = new Set<ResearchPlanIntent>(["entity_news", "broad_topic_news", "broad_news_digest"]);

const compact = (value: string | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

const currentDateOnly = (value?: string): string => {
  const parsed = value ? new Date(value) : new Date();
  const safe = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return safe.toISOString().slice(0, 10);
};

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const parseIsoLike = (value: string): Date | undefined => {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && parsed.getUTCFullYear() >= 2000) return parsed;
  return undefined;
};

const dateFromParts = (year: number, month: number, day: number): Date | undefined => {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date;
};

const monthNumber = (value: string): number | undefined => {
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  return months[value.slice(0, 3).toLocaleLowerCase()];
};

const relativeDate = (text: string, now: Date): DateCandidate | undefined => {
  const lower = text.toLocaleLowerCase();
  if (/\b(today|just now)\b/.test(lower) || /\u4eca\u5929|\u4eca\u65e5/.test(text)) {
    return { date: now, text: "today", source: "relative_text", confidence: "medium" };
  }
  if (/\byesterday\b/.test(lower) || /\u6628\u5929|\u6628\u65e5/.test(text)) {
    return { date: new Date(now.getTime() - DAY_MS), text: "yesterday", source: "relative_text", confidence: "medium" };
  }
  const dayAgo = lower.match(/\b(\d{1,2})\s+days?\s+ago\b/);
  if (dayAgo) {
    const days = Number(dayAgo[1]);
    return { date: new Date(now.getTime() - days * DAY_MS), text: dayAgo[0], source: "relative_text", confidence: "medium" };
  }
  const hourAgo = lower.match(/\b(\d{1,2})\s+hours?\s+ago\b/);
  if (hourAgo) {
    const hours = Number(hourAgo[1]);
    return { date: new Date(now.getTime() - hours * 3_600_000), text: hourAgo[0], source: "relative_text", confidence: "medium" };
  }
  const zhDayAgo = text.match(/(\d{1,2})\s*\u5929\u524d/);
  if (zhDayAgo) {
    const days = Number(zhDayAgo[1]);
    return { date: new Date(now.getTime() - days * DAY_MS), text: zhDayAgo[0], source: "relative_text", confidence: "medium" };
  }
  const zhHourAgo = text.match(/(\d{1,2})\s*\u5c0f\u65f6\u524d/);
  if (zhHourAgo) {
    const hours = Number(zhHourAgo[1]);
    return { date: new Date(now.getTime() - hours * 3_600_000), text: zhHourAgo[0], source: "relative_text", confidence: "medium" };
  }
  return undefined;
};

const candidatesFromText = (text: string, source: DateSignalSource, confidence: DateConfidence): DateCandidate[] => {
  const candidates: DateCandidate[] = [];
  for (const match of text.matchAll(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/g)) {
    const date = dateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date) candidates.push({ date, text: match[0], source, confidence });
  }
  for (const match of text.matchAll(/(20\d{2})\u5e74\s*(0?[1-9]|1[0-2])\u6708\s*(0?[1-9]|[12]\d|3[01])\u65e5?/g)) {
    const date = dateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
    if (date) candidates.push({ date, text: match[0], source, confidence });
  }
  for (const match of text.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi)) {
    const month = monthNumber(match[1]);
    const date = month ? dateFromParts(Number(match[3]), month, Number(match[2])) : undefined;
    if (date) candidates.push({ date, text: match[0], source, confidence });
  }
  for (const match of text.matchAll(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?,?\s+(20\d{2})\b/gi)) {
    const month = monthNumber(match[2]);
    const date = month ? dateFromParts(Number(match[3]), month, Number(match[1])) : undefined;
    if (date) candidates.push({ date, text: match[0], source, confidence });
  }
  return candidates;
};

const candidateFromUrl = (url: string): DateCandidate | undefined => {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/(20\d{2})\/(0?[1-9]|1[0-2])(?:\/(0?[1-9]|[12]\d|3[01]))?\b/);
    if (!match) return undefined;
    const date = dateFromParts(Number(match[1]), Number(match[2]), Number(match[3] ?? 1));
    if (!date) return undefined;
    return {
      date,
      text: match.slice(1).filter(Boolean).join("-"),
      source: "url_path",
      confidence: match[3] ? "medium" : "low",
    };
  } catch {
    return undefined;
  }
};

const bestCandidate = (candidates: DateCandidate[], currentDate: Date): DateCandidate | undefined => {
  const rank: Record<DateConfidence, number> = { high: 4, medium: 3, low: 2, none: 0 };
  return candidates
    .filter((item) => item.date.getUTCFullYear() >= 2000)
    .sort((left, right) =>
      rank[right.confidence] - rank[left.confidence] ||
      Math.abs(currentDate.getTime() - left.date.getTime()) - Math.abs(currentDate.getTime() - right.date.getTime()),
    )[0];
};

export const buildFreshnessWindowPolicy = (input: {
  intent: ResearchPlanIntent;
  freshness?: string;
  userQuery: string;
  currentDate?: string;
}): FreshnessWindowPolicy => {
  const currentDate = currentDateOnly(input.currentDate);
  const query = input.userQuery.toLocaleLowerCase();
  const explicitYear = /\b20\d{2}\b|\u4eca\u5e74|\u672c\u5e74/.test(input.userQuery);
  const today = /\btoday\b|\u4eca\u5929|\u4eca\u65e5/.test(query);
  const thisWeek = /\bthis week\b|\brecent days?\b|\u672c\u5468|\u8fd9\u51e0\u5929|\u6700\u8fd1\u51e0\u5929|\u8fd1\u51e0\u5929/.test(query);
  const trend = /\btrend|trends|outlook\b|\u8d8b\u52bf|\u8fd1\u671f\u8d8b\u52bf/.test(query);
  const freshnessRequired = NEWS_INTENTS.has(input.intent) ||
    (input.intent === "technical_docs" || input.intent === "official_reference"
      ? /\blatest|recent|current|updated|version\b|\u6700\u65b0|\u6700\u8fd1|\u5f53\u524d\u7248\u672c|\u66f4\u65b0/.test(query)
      : input.freshness === "latest" || input.freshness === "recent" || input.freshness === "current");

  let freshnessWindowDays = 0;
  if (input.intent === "broad_news_digest") freshnessWindowDays = today ? 2 : thisWeek ? 10 : 14;
  else if (input.intent === "broad_topic_news") freshnessWindowDays = explicitYear ? 180 : trend ? 90 : 60;
  else if (input.intent === "entity_news") freshnessWindowDays = today ? 3 : thisWeek ? 10 : explicitYear ? 180 : 45;
  else if (input.intent === "technical_docs" || input.intent === "official_reference") freshnessWindowDays = freshnessRequired ? 180 : 0;
  else freshnessWindowDays = freshnessRequired ? 60 : 0;

  const queryFreshnessHints = [
    today ? "today" : undefined,
    thisWeek ? "this_week_or_recent_days" : undefined,
    trend ? "trend_window" : undefined,
    explicitYear ? "explicit_year_window" : undefined,
    input.freshness ? `freshness=${input.freshness}` : undefined,
  ].filter((item): item is string => Boolean(item));

  return {
    currentDate,
    freshnessWindowDays,
    freshnessRequired,
    freshnessReason: freshnessRequired
      ? `freshness_required_for_${input.intent}`
      : "freshness_not_required_for_stable_reference",
    queryFreshnessHints,
  };
};

export const extractDateSignal = (input: {
  title?: string;
  snippet?: string;
  url?: string;
  bodyExcerpt?: string;
  providerDate?: string;
  readerPublishedAt?: string;
  currentDate: string;
  freshnessWindowDays: number;
  freshnessRequired: boolean;
}): DateSignalResult => {
  const current = startOfUtcDay(new Date(`${input.currentDate}T00:00:00Z`));
  const candidates: DateCandidate[] = [];
  const directReader = compact(input.readerPublishedAt);
  const directProvider = compact(input.providerDate);
  const readerDate = directReader ? parseIsoLike(directReader) : undefined;
  if (readerDate) candidates.push({ date: readerDate, text: directReader, source: "reader_metadata", confidence: "high" });
  const providerDate = directProvider ? parseIsoLike(directProvider) : undefined;
  if (providerDate) candidates.push({ date: providerDate, text: directProvider, source: "provider_metadata", confidence: "high" });

  const title = compact(input.title);
  const snippet = compact(input.snippet);
  const bodyExcerpt = compact(input.bodyExcerpt);
  candidates.push(...candidatesFromText(title, "title", "medium"));
  candidates.push(...candidatesFromText(snippet, "snippet", "medium"));
  candidates.push(...candidatesFromText(bodyExcerpt, "body_excerpt", "medium"));
  const relative = relativeDate(`${title} ${snippet}`, current);
  if (relative) candidates.push(relative);
  if (input.url) {
    const urlCandidate = candidateFromUrl(input.url);
    if (urlCandidate) candidates.push(urlCandidate);
  }

  const chosen = bestCandidate(candidates, current);
  if (!chosen) {
    return {
      dateSignalSource: "none",
      dateConfidence: "none",
      isRecentEnough: !input.freshnessRequired,
      freshnessStatus: input.freshnessRequired ? "unknown" : "fresh",
      freshnessReason: input.freshnessRequired ? "no_publish_date_signal" : "freshness_not_required",
    };
  }

  const publishedDay = startOfUtcDay(chosen.date);
  const ageDays = Math.floor((current.getTime() - publishedDay.getTime()) / DAY_MS);
  const futureSuspicious = ageDays < -2;
  const fresh = !futureSuspicious && (!input.freshnessRequired || ageDays <= input.freshnessWindowDays);
  return {
    publishedDate: publishedDay.toISOString().slice(0, 10),
    dateSignalText: chosen.text,
    dateSignalSource: chosen.source,
    dateConfidence: chosen.confidence,
    ageDays,
    isRecentEnough: fresh,
    freshnessStatus: futureSuspicious ? "future_date_suspicious" : fresh ? "fresh" : "stale",
    freshnessReason: futureSuspicious
      ? "publish_date_is_in_future"
      : fresh
        ? `within_${input.freshnessWindowDays}_day_freshness_window`
        : `older_than_${input.freshnessWindowDays}_day_freshness_window`,
  };
};
