import type {
  CandidateCanonicalInfo,
  CandidateDedupeKey,
  CandidateSource,
  DiscoveryRawResult,
  ExpectedSourceType,
  NormalizedCandidate,
  QueryPurpose,
  ResearchLanguage,
  SourceReliability,
  SourceType,
} from "./types";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "spm",
  "fbclid",
  "gclid",
]);

const REDIRECT_PARAMS = ["url", "u", "target", "r", "redirect", "q"];
const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;
const LATIN_PATTERN = /[a-z]/i;

const reliabilityScoreByLevel: Record<SourceReliability, number> = {
  very_high: 1,
  high: 0.82,
  medium: 0.58,
  low: 0.24,
  unknown: 0.4,
};

const sourceToExpected: Record<SourceType, ExpectedSourceType | "seo_aggregator" | "unknown"> = {
  official: "official",
  docs: "documentation",
  mainstream_news: "mainstream_news",
  tech_media: "technical_blog",
  community: "community_solution",
  forum: "forum",
  seo_aggregator: "seo_aggregator",
  unknown: "unknown",
};

const decodeCandidateUrl = (value: string): string | undefined => {
  try {
    const decoded = decodeURIComponent(value);
    return /^https?:\/\//i.test(decoded) ? decoded : undefined;
  } catch {
    return /^https?:\/\//i.test(value) ? value : undefined;
  }
};

const unwrapRedirectUrl = (rawUrl: string): { url: string; redirectUnwrapped: boolean } => {
  try {
    const parsed = new URL(rawUrl);
    for (const key of REDIRECT_PARAMS) {
      const value = parsed.searchParams.get(key);
      if (!value) continue;
      const decoded = decodeCandidateUrl(value);
      if (decoded) return { url: decoded, redirectUnwrapped: true };
    }
  } catch {
    return { url: rawUrl, redirectUnwrapped: false };
  }
  return { url: rawUrl, redirectUnwrapped: false };
};

const normalizeHost = (host: string): string => {
  const lower = host.toLocaleLowerCase().replace(/:80$|:443$/, "");
  return lower.startsWith("www.") ? lower.slice(4) : lower;
};

const normalizeTitle = (title: string): string =>
  title
    .replace(/\s+/g, " ")
    .replace(/\s*[-|_]\s*(知乎|百度知道|CSDN博客|CSDN|掘金|简书|React|Vue|Vite|MDN)\s*$/i, "")
    .trim()
    .toLocaleLowerCase();

const normalizeSnippet = (snippet?: string): string =>
  (snippet ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase().slice(0, 160);

const detectLanguage = (text: string, hint?: ResearchLanguage): ResearchLanguage => {
  if (hint) return hint;
  const hasCjk = CJK_PATTERN.test(text);
  const hasLatin = LATIN_PATTERN.test(text);
  if (hasCjk && hasLatin) return "mixed";
  if (hasCjk) return "zh";
  return "en";
};

const classifyUrlSource = (host: string, path: string, hint?: SourceType): { sourceType: SourceType; reliability: SourceReliability } => {
  if (hint) return { sourceType: hint, reliability: reliabilityForSourceType(hint) };
  if (/(^|\.)react\.dev$|(^|\.)vuejs\.org$|(^|\.)vite\.dev$|(^|\.)docs\.rs$|(^|\.)tauri\.app$|developer\.mozilla\.org$/i.test(host)) {
    return { sourceType: "docs", reliability: "very_high" };
  }
  if (/(^|\.)oi-wiki\.org$|(^|\.)cp-algorithms\.com$|(^|\.)usaco\.guide$/i.test(host)) {
    return { sourceType: "docs", reliability: "high" };
  }
  if (/(^|\.)atcoder\.jp$|(^|\.)cses\.fi$/i.test(host)) {
    return { sourceType: "official", reliability: "very_high" };
  }
  if (/(^|\.)luogu\.com\.cn$|(^|\.)codeforces\.com$|(^|\.)nowcoder\.com$/i.test(host)) {
    return { sourceType: "community", reliability: "high" };
  }
  if (/(^|\.)openai\.com$|(^|\.)microsoft\.com$|(^|\.)google\.com$|(^|\.)github\.com$/i.test(host)) {
    return { sourceType: "official", reliability: "very_high" };
  }
  if (/(^|\.)reuters\.com$|(^|\.)apnews\.com$|(^|\.)bbc\.com$|(^|\.)nytimes\.com$|(^|\.)thepaper\.cn$|(^|\.)xinhuanet\.com$/i.test(host)) {
    return { sourceType: "mainstream_news", reliability: "high" };
  }
  if (/(^|\.)infoq\.cn$|(^|\.)36kr\.com$|(^|\.)theverge\.com$|(^|\.)techcrunch\.com$|(^|\.)cnblogs\.com$|(^|\.)github\.io$/i.test(host)) {
    return { sourceType: "tech_media", reliability: "medium" };
  }
  if (/(^|\.)zhihu\.com$|(^|\.)juejin\.cn$|(^|\.)stackoverflow\.com$|(^|\.)segmentfault\.com$/i.test(host)) {
    return { sourceType: "forum", reliability: "medium" };
  }
  if (/csdn\.net$|jianshu\.com$|51cto\.com$|educba\.com$|geeksforgeeks\.org$|programmerall\.com$|topic\.algo\.monster$|hydro\.ac$/i.test(host) || (host === "cloud.tencent.com" && path.startsWith("/developer"))) {
    return { sourceType: "seo_aggregator", reliability: "low" };
  }
  return { sourceType: "unknown", reliability: "unknown" };
};

const reliabilityForSourceType = (sourceType: SourceType): SourceReliability => {
  if (sourceType === "official" || sourceType === "docs") return "very_high";
  if (sourceType === "mainstream_news") return "high";
  if (sourceType === "tech_media" || sourceType === "community" || sourceType === "forum") return "medium";
  if (sourceType === "seo_aggregator") return "low";
  return "unknown";
};

const buildId = (raw: DiscoveryRawResult, canonicalUrl: string): string => {
  if (raw.id) return raw.id;
  return `${raw.provider}:${raw.resultIndex}:${canonicalUrl}`;
};

export const canonicalizeUrl = (
  url: string,
  context: {
    title?: string;
    language?: ResearchLanguage;
    sourceTypeHint?: SourceType;
    dateHint?: string;
    queryPurpose?: QueryPurpose;
  } = {},
): CandidateCanonicalInfo => {
  const unwrapped = unwrapRedirectUrl(url);
  try {
    const parsed = new URL(unwrapped.url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        canonicalUrl: unwrapped.url,
        originalUrl: url,
        host: "",
        normalizedHost: "",
        path: "",
        title: context.title ?? "",
        normalizedTitle: normalizeTitle(context.title ?? ""),
        language: detectLanguage(context.title ?? "", context.language),
        sourceType: "unknown",
        reliability: "unknown",
        dateHint: context.dateHint,
        queryPurpose: context.queryPurpose ?? "recall",
        redirectUnwrapped: unwrapped.redirectUnwrapped,
        unsupportedReason: "unsupported_url",
      };
    }
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLocaleLowerCase())) parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
    const normalizedHost = normalizeHost(parsed.host);
    parsed.host = normalizedHost;
    const canonicalUrl = parsed.toString().replace(/\/$/, "");
    const classified = classifyUrlSource(normalizedHost, parsed.pathname, context.sourceTypeHint);
    return {
      canonicalUrl,
      originalUrl: url,
      host: parsed.host,
      normalizedHost,
      path: parsed.pathname,
      title: context.title ?? "",
      normalizedTitle: normalizeTitle(context.title ?? ""),
      language: detectLanguage(`${context.title ?? ""} ${parsed.pathname}`, context.language),
      sourceType: classified.sourceType,
      reliability: classified.reliability,
      dateHint: context.dateHint,
      queryPurpose: context.queryPurpose ?? "recall",
      redirectUnwrapped: unwrapped.redirectUnwrapped,
    };
  } catch {
    return {
      canonicalUrl: url,
      originalUrl: url,
      host: "",
      normalizedHost: "",
      path: "",
      title: context.title ?? "",
      normalizedTitle: normalizeTitle(context.title ?? ""),
      language: detectLanguage(context.title ?? "", context.language),
      sourceType: "unknown",
      reliability: "unknown",
      dateHint: context.dateHint,
      queryPurpose: context.queryPurpose ?? "recall",
      redirectUnwrapped: false,
      unsupportedReason: "unsupported_url",
    };
  }
};

export const buildCandidateDedupeKey = (candidate: NormalizedCandidate): CandidateDedupeKey => ({
  canonicalUrl: candidate.canonicalUrl.toLocaleLowerCase(),
  titleHost: `${candidate.canonical.normalizedHost}:${candidate.normalizedTitle}`,
  titleHostSnippet: `${candidate.canonical.normalizedHost}:${candidate.normalizedTitle}:${normalizeSnippet(candidate.snippet)}`,
  normalizedHost: candidate.canonical.normalizedHost,
  normalizedTitle: candidate.normalizedTitle,
});

export const normalizeDiscoveryResult = (
  raw: DiscoveryRawResult,
  originalIndex = raw.resultIndex,
): NormalizedCandidate => {
  const canonical = canonicalizeUrl(raw.url, {
    title: raw.title,
    language: raw.queryLanguage,
    sourceTypeHint: raw.sourceTypeHint,
    dateHint: raw.publishedAt,
    queryPurpose: raw.queryPurpose,
  });
  const normalizedTitle = canonical.normalizedTitle;
  const base: Omit<NormalizedCandidate, "dedupeKey"> = {
    id: buildId(raw, canonical.canonicalUrl),
    raw,
    canonical,
    url: raw.url,
    canonicalUrl: canonical.canonicalUrl,
    title: raw.title.trim(),
    normalizedTitle,
    snippet: raw.snippet?.trim(),
    provider: raw.provider,
    providerPriority: raw.providerPriority ?? 0,
    query: raw.query,
    queryPurpose: raw.queryPurpose,
    language: canonical.language,
    sourceType: canonical.sourceType,
    reliability: canonical.reliability,
    reliabilityScore: reliabilityScoreByLevel[canonical.reliability],
    discoveredAt: raw.discoveredAt ?? originalIndex,
    originalIndex,
  };
  const candidate = { ...base, dedupeKey: {} as CandidateDedupeKey };
  return { ...candidate, dedupeKey: buildCandidateDedupeKey(candidate) };
};

export const normalizeDiscoveryResults = (rawResults: DiscoveryRawResult[]): NormalizedCandidate[] =>
  rawResults.map((raw, index) => normalizeDiscoveryResult(raw, index));

const expectedSourceTypeForCandidate = (
  candidate: NormalizedCandidate,
): ExpectedSourceType | "seo_aggregator" | "unknown" => {
  const directDiscovery = candidate.raw.extensions?.directDiscovery;
  if (directDiscovery && typeof directDiscovery === "object" && !Array.isArray(directDiscovery)) {
    const sourceRole = (directDiscovery as Record<string, unknown>).sourceRole;
    if (sourceRole === "problem_statement") return "problem_statement";
    if (sourceRole === "community_solution") return "community_solution";
    if (sourceRole === "discussion_warning" || sourceRole === "discussion") return "forum";
  }
  return sourceToExpected[candidate.sourceType];
};

export const toCandidateSource = (
  candidate: NormalizedCandidate,
  jobId: string,
): CandidateSource => ({
  id: candidate.id,
  jobId,
  url: candidate.canonicalUrl,
  title: candidate.title,
  snippet: candidate.snippet,
  sourceType: expectedSourceTypeForCandidate(candidate),
  priority: candidate.sourceType === "official" || candidate.sourceType === "docs"
    ? "core"
    : candidate.reliability === "high"
      ? "preferred"
      : candidate.sourceType === "seo_aggregator"
        ? "background"
        : "supplemental",
  host: candidate.canonical.normalizedHost,
  language: candidate.language,
  queryPurpose: candidate.queryPurpose,
  status: "discovered",
  readState: "not_started",
  evidence: { level: "none", reliable: candidate.reliabilityScore >= 0.58, fresh: Boolean(candidate.canonical.dateHint) },
  discoveredAt: candidate.discoveredAt,
  score: candidate.rank?.total,
  extensions: {
    ...candidate.raw.extensions,
    phase3: {
      sourceType: candidate.sourceType,
      reliability: candidate.reliability,
      canonical: candidate.canonical,
    },
  },
});
