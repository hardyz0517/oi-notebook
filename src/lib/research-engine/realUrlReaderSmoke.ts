import { buildExcerpt } from "./excerptBuilder";
import { selectPassages } from "./passageSelector";
import { evaluateReaderQuality } from "./readerQuality";
import { buildQueryPlan } from "./queryPlanner";
import { buildSearchPolicyDecision } from "./searchPolicy";
import {
  runBrowserUrlReaderRequest,
  type BrowserUrlReaderRedactedRequest,
  type BrowserUrlReaderTransportErrorKind,
} from "./browserUrlReaderTransport";
import type {
  ExcerptBuildResult,
  ExtractedContentBlock,
  ExtractedContentBlockType,
  ExtractedDocument,
  ReaderQualityEvaluation,
  UrlReaderResult,
  UrlReaderStatus,
} from "./readerTypes";
import type {
  CandidateSource,
  ExpectedSourceType,
  QueryPlan,
  ResearchLanguage,
  ResearchSearchRequest,
  SearchPolicyDecision,
  SourceReliability,
  SourceType,
} from "./types";

export type ResearchEngineRealUrlReaderSmokeOptions = {
  url: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
};

export type ResearchEngineRealUrlReaderSmokeStatus =
  | "fetched"
  | "partial"
  | "validation_failed"
  | "unsupported_environment"
  | "non_2xx"
  | "unsupported_content_type"
  | "empty_body"
  | "body_too_large"
  | "timeout"
  | "network_error"
  | "needs_js"
  | "parse_failed";

export type ResearchEngineRealUrlReaderSmokeResult = {
  ok: boolean;
  url: string;
  status: ResearchEngineRealUrlReaderSmokeStatus;
  httpStatus?: number;
  contentType?: string;
  bodyBytes?: number;
  bodyPreview?: string;
  qualitySummary?: {
    quality: ReaderQualityEvaluation["quality"];
    canSupportAnswer: boolean;
    canSupportStrongClaim: boolean;
    reasons: string[];
  };
  blockCounts: Record<string, number>;
  selectedPassageCount: number;
  excerptLength: number;
  excerptPreview?: string;
  warnings: string[];
  errors: string[];
  markdownReport: string;
  diagnosticsSnapshot: Record<string, unknown>;
};

type ExtractedDocumentBuildResult = {
  status: UrlReaderStatus;
  document?: ExtractedDocument;
  warnings: string[];
  errors: string[];
};

const DEFAULT_SMOKE_URL = "https://react.dev/reference/react/useEffect";
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const BODY_PREVIEW_MAX_CHARS = 800;
const EXCERPT_PREVIEW_MAX_CHARS = 1200;
const MAX_BLOCKS = 96;
const MAX_NATURAL_BLOCK_CHARS = 1800;
const MAX_ATOMIC_BLOCK_CHARS = 5000;

const previewText = (value: string, maxChars: number): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}...` : normalized;
};

const contentTypeBase = (contentType: string | undefined): string =>
  (contentType ?? "").split(";")[0]?.trim().toLocaleLowerCase() ?? "";

const isIpv4 = (host: string): boolean => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);

const isPrivateIpv4 = (host: string): boolean => {
  if (!isIpv4(host)) return false;
  const parts = host.split(".").map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second] = parts;
  return first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254);
};

const isPrivateIpv6 = (host: string): boolean => {
  const normalized = host.toLocaleLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd");
};

const validatePublicUrl = (rawUrl: string): { ok: true; url: URL } | { ok: false; reason: string; normalizedUrl: string } => {
  const normalizedUrl = rawUrl.trim() || DEFAULT_SMOKE_URL;
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return { ok: false, reason: "invalid_url", normalizedUrl };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "unsupported_protocol", normalizedUrl };
  }
  const host = parsed.hostname.toLocaleLowerCase();
  if (!host) return { ok: false, reason: "missing_host", normalizedUrl };
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, reason: "localhost_blocked", normalizedUrl };
  }
  if (isPrivateIpv4(host)) {
    return { ok: false, reason: "private_ipv4_blocked", normalizedUrl };
  }
  if (host.includes(":") && isPrivateIpv6(host)) {
    return { ok: false, reason: "private_ipv6_blocked", normalizedUrl };
  }
  return { ok: true, url: parsed };
};

const languageForText = (text: string): ResearchLanguage => {
  const hasCjk = /[\u3400-\u9fff\uf900-\ufaff]/.test(text);
  const hasLatin = /[a-z]/i.test(text);
  if (hasCjk && hasLatin) return "mixed";
  if (hasCjk) return "zh";
  return "en";
};

const sourceTypeForHost = (host: string): SourceType => {
  const lower = host.toLocaleLowerCase();
  if (lower === "react.dev" || lower.endsWith(".react.dev")) return "docs";
  if (lower.endsWith(".gov") || lower.endsWith(".edu") || lower === "openai.com" || lower.endsWith(".openai.com")) return "official";
  if (lower.includes("reuters") || lower.includes("bbc.") || lower.includes("apnews")) return "mainstream_news";
  if (lower.includes("github.com") || lower.includes("stackoverflow.com")) return "community";
  return "unknown";
};

const reliabilityForSourceType = (sourceType: SourceType): SourceReliability => {
  if (sourceType === "official" || sourceType === "docs") return "very_high";
  if (sourceType === "mainstream_news") return "high";
  if (sourceType === "community" || sourceType === "tech_media") return "medium";
  if (sourceType === "forum" || sourceType === "seo_aggregator") return "low";
  return "unknown";
};

const expectedSourceTypeFor = (sourceType: SourceType): ExpectedSourceType | "seo_aggregator" | "unknown" => {
  if (sourceType === "docs") return "documentation";
  if (sourceType === "official") return "official";
  if (sourceType === "mainstream_news") return "mainstream_news";
  if (sourceType === "tech_media") return "technical_blog";
  if (sourceType === "community") return "community_solution";
  if (sourceType === "forum") return "forum";
  if (sourceType === "seo_aggregator") return "seo_aggregator";
  return "unknown";
};

const makeRequestContext = (
  url: URL,
): {
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
  candidate: CandidateSource;
} => {
  const request: ResearchSearchRequest = {
    requestId: "developer-real-url-reader-smoke",
    userQuestion: url.toString(),
    locale: "auto",
    options: {
      allowPublicWeb: true,
      offlineOnly: false,
      maxQueries: 1,
    },
    extensions: {
      developerDiagnosticsOnly: true,
      phase13RealUrlReaderSmoke: true,
    },
  };
  const policy = buildSearchPolicyDecision(request);
  const queryPlan = buildQueryPlan(request, policy);
  const sourceType = sourceTypeForHost(url.hostname);
  const candidate: CandidateSource = {
    id: `developer-real-url-reader-smoke:${url.toString()}`,
    jobId: request.requestId ?? "developer-real-url-reader-smoke",
    url: url.toString(),
    title: url.hostname,
    sourceType: expectedSourceTypeFor(sourceType),
    priority: "core",
    host: url.hostname.toLocaleLowerCase().replace(/^www\./, ""),
    language: "mixed",
    queryPurpose: "official",
    status: "discovered",
    readState: "not_started",
    evidence: {
      level: "none",
      reliable: false,
      fresh: false,
    },
    discoveredAt: 0,
    extensions: {
      developerDiagnosticsOnly: true,
      phase13RealUrlReaderSmoke: true,
    },
  };
  return { request, policy, queryPlan, candidate };
};

const cleanText = (value: string): string =>
  value.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();

const naturalBlockText = (value: string): { text: string; isComplete: boolean } => {
  const cleaned = cleanText(value);
  if (cleaned.length <= MAX_NATURAL_BLOCK_CHARS) return { text: cleaned, isComplete: true };
  const slice = cleaned.slice(0, MAX_NATURAL_BLOCK_CHARS - 1);
  const boundary = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("\n"), slice.lastIndexOf(";"));
  if (boundary > 240) return { text: `${slice.slice(0, boundary + 1)}...`, isComplete: false };
  return { text: `${slice}...`, isComplete: false };
};

const block = (
  id: string,
  type: ExtractedContentBlockType,
  text: string,
  options: Partial<ExtractedContentBlock> = {},
): ExtractedContentBlock => ({
  id,
  type,
  text,
  charLength: text.length,
  tokenEstimate: Math.ceil(text.length / 4),
  isComplete: true,
  ...options,
});

const blocksFromPlainText = (bodyText: string): { blocks: ExtractedContentBlock[]; warnings: string[] } => {
  const warnings: string[] = [];
  const paragraphs = bodyText.split(/\n{2,}/).map(cleanText).filter(Boolean);
  const blocks: ExtractedContentBlock[] = [];
  for (const [index, paragraph] of paragraphs.entries()) {
    if (blocks.length >= MAX_BLOCKS) {
      warnings.push("block_limit_reached");
      break;
    }
    const natural = naturalBlockText(paragraph);
    if (!natural.isComplete) warnings.push("long_paragraph_truncated");
    blocks.push(block(`text-${index}`, "paragraph", natural.text, { isComplete: natural.isComplete }));
  }
  return { blocks, warnings };
};

const tagBlockType = (tagName: string): ExtractedContentBlockType | undefined => {
  if (/^h[1-3]$/i.test(tagName)) return "heading";
  if (tagName === "P") return "paragraph";
  if (tagName === "LI") return "list";
  if (tagName === "PRE" || tagName === "CODE") return "code";
  if (tagName === "TABLE") return "table";
  if (tagName === "BLOCKQUOTE") return "quote";
  return undefined;
};

const blocksFromHtml = (bodyText: string): { title: string; blocks: ExtractedContentBlock[]; warnings: string[]; status: UrlReaderStatus } => {
  if (typeof DOMParser === "undefined") {
    return { title: "", blocks: [], warnings: ["dom_parser_unavailable"], status: "unsupported" };
  }
  const warnings: string[] = [];
  const parsed = new DOMParser().parseFromString(bodyText, "text/html");
  const parserError = parsed.querySelector("parsererror");
  if (parserError) {
    return { title: "", blocks: [], warnings: ["html_parser_error"], status: "parse_failed" };
  }
  parsed.querySelectorAll("script, style, noscript, svg, canvas, iframe").forEach((node) => node.remove());
  const title = cleanText(parsed.querySelector("title")?.textContent ?? "");
  const nodes = Array.from(parsed.querySelectorAll("title, h1, h2, h3, p, li, pre, code, table, blockquote"));
  const blocks: ExtractedContentBlock[] = [];
  const headingPath: string[] = [];

  for (const node of nodes) {
    if (blocks.length >= MAX_BLOCKS) {
      warnings.push("block_limit_reached");
      break;
    }
    const element = node as HTMLElement;
    const type = node.nodeName === "TITLE" ? "metadata" : tagBlockType(node.nodeName);
    if (!type) continue;
    const rawText = cleanText(element.innerText || element.textContent || "");
    if (!rawText) continue;
    if (type === "heading") {
      const level = Number(node.nodeName.slice(1));
      headingPath.splice(Math.max(0, level - 1));
      headingPath[level - 1] = rawText;
    }
    if ((type === "code" || type === "table") && rawText.length > MAX_ATOMIC_BLOCK_CHARS) {
      warnings.push(`${type}_block_omitted_too_large`);
      continue;
    }
    const textForBlock = type === "code" || type === "table" || type === "metadata"
      ? { text: rawText, isComplete: true }
      : naturalBlockText(rawText);
    if (!textForBlock.isComplete) warnings.push("long_text_block_truncated");
    blocks.push(block(`${type}-${blocks.length}`, type, textForBlock.text, {
      headingPath: headingPath.filter(Boolean),
      isComplete: textForBlock.isComplete,
      language: languageForText(textForBlock.text),
    }));
  }

  const textChars = blocks.reduce((sum, item) => sum + item.charLength, 0);
  const status: UrlReaderStatus = textChars < 80
    ? "needs_js"
    : textChars < 220
      ? "too_short"
      : "fetched";
  if (status === "needs_js") warnings.push("page_shell_or_js_required_possible");
  return { title, blocks, warnings, status };
};

const extractedDocumentFromBody = (
  input: {
    bodyText: string;
    contentType: string;
    url: URL;
    candidate: CandidateSource;
  },
): ExtractedDocumentBuildResult => {
  const baseType = contentTypeBase(input.contentType);
  const sourceType = sourceTypeForHost(input.url.hostname);
  const extracted = baseType === "text/plain"
    ? { title: "", status: "fetched" as UrlReaderStatus, ...blocksFromPlainText(input.bodyText) }
    : blocksFromHtml(input.bodyText);
  if (extracted.status === "unsupported" || extracted.status === "parse_failed") {
    return {
      status: extracted.status,
      warnings: extracted.warnings,
      errors: [extracted.status === "unsupported" ? "DOMParser is unavailable" : "HTML parsing failed"],
    };
  }
  if (extracted.blocks.length === 0) {
    return {
      status: "needs_js",
      warnings: [...extracted.warnings, "no_readable_blocks"],
      errors: ["No readable blocks were extracted from the page."],
    };
  }
  const textCharLength = extracted.blocks.reduce((sum, item) => sum + item.charLength, 0);
  return {
    status: extracted.status,
    warnings: extracted.warnings,
    errors: [],
    document: {
      candidate: input.candidate,
      metadata: {
        title: extracted.title || input.candidate.title,
        canonicalUrl: input.url.toString(),
        host: input.url.hostname.toLocaleLowerCase().replace(/^www\./, ""),
        sourceType,
        reliability: reliabilityForSourceType(sourceType),
        detectedLanguage: languageForText(extracted.blocks.map((item) => item.text).join("\n")),
      },
      blocks: extracted.blocks,
      textCharLength,
      diagnostics: {
        phase13RealUrlReaderSmoke: true,
        contentType: input.contentType,
        extractor: baseType === "text/plain" ? "plain_text_minimal" : "domparser_minimal",
      },
    },
  };
};

const statusFromTransportError = (kind: BrowserUrlReaderTransportErrorKind): ResearchEngineRealUrlReaderSmokeStatus => {
  if (kind === "timeout" || kind === "aborted") return "timeout";
  if (kind === "non_2xx") return "non_2xx";
  if (kind === "unsupported_content_type") return "unsupported_content_type";
  if (kind === "empty_body") return "empty_body";
  if (kind === "body_too_large") return "body_too_large";
  return "network_error";
};

const urlReaderStatusToSmokeStatus = (status: UrlReaderStatus): ResearchEngineRealUrlReaderSmokeStatus => {
  if (status === "fetched") return "fetched";
  if (status === "partial") return "partial";
  if (status === "needs_js") return "needs_js";
  if (status === "parse_failed") return "parse_failed";
  if (status === "too_short") return "empty_body";
  if (status === "unsupported") return "unsupported_content_type";
  return "parse_failed";
};

const blockCountsFor = (quality?: ReaderQualityEvaluation): Record<string, number> =>
  quality ? quality.blockStats : { total: 0 };

const buildMarkdownReport = (input: {
  result: Omit<ResearchEngineRealUrlReaderSmokeResult, "markdownReport">;
  redactedRequest?: BrowserUrlReaderRedactedRequest;
}): string => {
  const { result, redactedRequest } = input;
  const lines = [
    "# Research Engine Real URL Reader Smoke",
    "",
    `- ok: ${result.ok}`,
    `- status: ${result.status}`,
    `- url: ${result.url}`,
    `- httpStatus: ${result.httpStatus ?? "none"}`,
    `- contentType: ${result.contentType ?? "none"}`,
    `- bodyBytes: ${result.bodyBytes ?? 0}`,
    `- readerQuality: ${result.qualitySummary?.quality ?? "none"}`,
    `- selectedPassageCount: ${result.selectedPassageCount}`,
    `- excerptLength: ${result.excerptLength}`,
    "",
    "## Redacted Request",
    `- method: ${redactedRequest?.method ?? "none"}`,
    `- urlOrigin: ${redactedRequest?.urlOrigin ?? "none"}`,
    `- headerKeys: ${redactedRequest ? Object.keys(redactedRequest.headers).join(", ") : "none"}`,
    `- credentials: ${redactedRequest?.credentials ?? "omit"}`,
    `- redactionFields: ${redactedRequest?.redactionFields.join(", ") || "authorization, cookie"}`,
    "",
    "## Block Counts",
    ...Object.entries(result.blockCounts).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Warnings",
    ...(result.warnings.length > 0 ? result.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Errors",
    ...(result.errors.length > 0 ? result.errors.map((error) => `- ${error}`) : ["- none"]),
    "",
    "## Body Preview",
    result.bodyPreview ?? "none",
    "",
    "## Excerpt Preview",
    result.excerptPreview ?? "none",
  ];
  return lines.join("\n");
};

const failureResult = (
  input: Omit<ResearchEngineRealUrlReaderSmokeResult, "markdownReport"> & {
    redactedRequest?: BrowserUrlReaderRedactedRequest;
  },
): ResearchEngineRealUrlReaderSmokeResult => ({
  ...input,
  markdownReport: buildMarkdownReport({ result: input, redactedRequest: input.redactedRequest }),
});

export const runResearchEngineRealUrlReaderSmoke = async (
  options: ResearchEngineRealUrlReaderSmokeOptions,
): Promise<ResearchEngineRealUrlReaderSmokeResult> => {
  const validation = validatePublicUrl(options.url);
  if (!validation.ok) {
    return failureResult({
      ok: false,
      url: validation.normalizedUrl,
      status: "validation_failed",
      blockCounts: { total: 0 },
      selectedPassageCount: 0,
      excerptLength: 0,
      warnings: [],
      errors: [`URL rejected: ${validation.reason}`],
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        browserSideSmokeOnly: true,
        dnsRebindingProtectionGuaranteed: false,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        validationReason: validation.reason,
      },
    });
  }

  const { request, policy, queryPlan, candidate } = makeRequestContext(validation.url);
  const transport = await runBrowserUrlReaderRequest({
    url: validation.url.toString(),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBodyBytes: options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
  });

  if (!transport.ok) {
    return failureResult({
      ok: false,
      url: validation.url.toString(),
      status: statusFromTransportError(transport.error.kind),
      httpStatus: transport.httpStatus,
      contentType: transport.contentType,
      bodyBytes: transport.bodyBytes,
      bodyPreview: transport.bodyPreview,
      blockCounts: { total: 0 },
      selectedPassageCount: 0,
      excerptLength: 0,
      warnings: transport.warnings,
      errors: [transport.error.message],
      diagnosticsSnapshot: {
        developerDiagnosticsOnly: true,
        browserSideSmokeOnly: true,
        dnsRebindingProtectionGuaranteed: false,
        oldSearchPathTouched: false,
        noteConversationTouched: false,
        transportStatus: transport.error.kind,
        redactedRequest: transport.redactedRequest,
      },
      redactedRequest: transport.redactedRequest,
    });
  }

  const extracted = extractedDocumentFromBody({
    bodyText: transport.bodyText,
    contentType: transport.contentType,
    url: validation.url,
    candidate,
  });
  const readerResult: UrlReaderResult = {
    request: { request, policy, queryPlan, candidate },
    candidate,
    status: transport.truncated && extracted.status === "fetched" ? "partial" : extracted.status,
    document: extracted.document,
    error: extracted.errors.length > 0
      ? {
        kind: extracted.status === "needs_js" ? "js_required" : extracted.status === "unsupported" ? "unsupported_content_type" : "extraction_failed",
        message: extracted.errors.join("; "),
        recoverable: true,
      }
      : undefined,
    diagnostics: {
      phase13RealUrlReaderSmoke: true,
      httpStatus: transport.httpStatus,
      contentType: transport.contentType,
      bodyBytes: transport.bodyBytes,
      bodyTruncated: transport.truncated,
    },
  };
  const quality = evaluateReaderQuality(readerResult);
  const selection = selectPassages({
    request,
    policy,
    queryPlan,
    readerResult,
    quality,
    budget: { maxChars: 1600, maxBlocks: 8, reserveForMetadata: 180 },
  });
  const excerpt: ExcerptBuildResult = buildExcerpt({
    selection,
    quality,
    readerResult,
    budget: { maxChars: 1800, maxBlocks: 8, reserveForMetadata: 220 },
  });
  const warnings = Array.from(new Set([
    ...transport.warnings,
    ...extracted.warnings,
    ...quality.warnings,
    ...selection.warnings,
    ...excerpt.warnings,
    "browser_side_smoke_not_backend_ssrf_boundary",
  ]));
  const errors = extracted.errors;
  const ok = errors.length === 0 && quality.canSupportAnswer;
  const status = transport.truncated
    ? "body_too_large"
    : urlReaderStatusToSmokeStatus(readerResult.status);
  const summary = {
    ok,
    url: validation.url.toString(),
    status,
    httpStatus: transport.httpStatus,
    contentType: transport.contentType,
    bodyBytes: transport.bodyBytes,
    bodyPreview: transport.bodyPreview ? previewText(transport.bodyPreview, BODY_PREVIEW_MAX_CHARS) : undefined,
    qualitySummary: {
      quality: quality.quality,
      canSupportAnswer: quality.canSupportAnswer,
      canSupportStrongClaim: quality.canSupportStrongClaim,
      reasons: quality.reasons,
    },
    blockCounts: blockCountsFor(quality),
    selectedPassageCount: selection.selectedPassages.length,
    excerptLength: excerpt.excerptMarkdown.length,
    excerptPreview: previewText(excerpt.excerptMarkdown, EXCERPT_PREVIEW_MAX_CHARS),
    warnings,
    errors,
    diagnosticsSnapshot: {
      developerDiagnosticsOnly: true,
      browserSideSmokeOnly: true,
      dnsRebindingProtectionGuaranteed: false,
      oldSearchPathTouched: false,
      noteConversationTouched: false,
      requestId: request.requestId,
      redactedRequest: transport.redactedRequest,
      httpStatus: transport.httpStatus,
      contentType: transport.contentType,
      bodyBytes: transport.bodyBytes,
      bodyPreview: transport.bodyPreview,
      readerStatus: readerResult.status,
      readerQuality: quality.quality,
      blockCounts: quality.blockStats,
      passageSelection: selection.coverage,
      excerptLength: excerpt.excerptMarkdown.length,
    },
  };

  return {
    ...summary,
    markdownReport: buildMarkdownReport({
      result: summary,
      redactedRequest: transport.redactedRequest,
    }),
  };
};
