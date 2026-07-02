import type {
  CandidateSource,
  QueryPlan,
  ResearchLanguage,
  ResearchSearchRequest,
  SearchPolicyDecision,
  SourceReliability,
  SourceType,
} from "./types";
import type { UrlReaderResult } from "./readerTypes";
import { runBrowserUrlReaderRequest, type BrowserUrlReaderTransportInput, type BrowserUrlReaderTransportResult } from "./browserUrlReaderTransport";
import { runTauriUrlReaderRequest, type TauriUrlReaderTransportInput, type TauriUrlReaderTransportResult } from "./tauriUrlReaderTransport";

export type ResearchReaderProviderName =
  | "browser"
  | "tauri"
  | "luogu"
  | "mock"
  | "manual";

export type ResearchCookieSafetyMode =
  | "blocked"
  | "manual"
  | "domain_limited";

export type ResearchCookieBoundary = {
  mode: ResearchCookieSafetyMode;
  allowedDomains: string[];
  sendCookiesToModel: false;
};

export type LuoguCookieSafetyStatus =
  | "available"
  | "blocked"
  | "missing_cookie";

export type LuoguCookieSafetyState = {
  status: LuoguCookieSafetyStatus;
  domainAllowed: boolean;
  mayAttachCookieToReader: boolean;
  sendCookiesToModel: false;
  sendCookiesToThirdParty: false;
  reason: "luogu_cookie_domain_allowed" | "domain_not_allowed" | "luogu_cookie_missing";
};

export type ResearchReaderProviderContext = {
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
  candidate: CandidateSource;
  cookieBoundary?: ResearchCookieBoundary;
};

export interface ResearchReaderProvider {
  readonly name: ResearchReaderProviderName;
  readonly loginStateAware: boolean;
  read(input: ResearchReaderProviderContext): Promise<UrlReaderResult>;
}

export const createStrictCookieBoundary = (
  allowedDomains: string[] = [],
): ResearchCookieBoundary => ({
  mode: "blocked",
  allowedDomains: Array.from(
    new Set(
      allowedDomains
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
    ),
  ),
  sendCookiesToModel: false,
});

export type ManualReaderFixture = {
  title: string;
  text: string;
};

export type ManualReaderProviderInput = {
  fixtures: Record<string, ManualReaderFixture>;
};

export type UrlReaderTransportInput = TauriUrlReaderTransportInput | BrowserUrlReaderTransportInput;

export type UrlReaderTransportResult = TauriUrlReaderTransportResult | BrowserUrlReaderTransportResult;

export type UrlReaderTransport = (input: UrlReaderTransportInput) => Promise<UrlReaderTransportResult>;

export type UrlReaderProviderInput = {
  transport?: UrlReaderTransport;
  timeoutMs?: number;
  maxBodyBytes?: number;
};

const LUOGU_COOKIE_DOMAINS = ["luogu.com.cn", "www.luogu.com.cn", "luogu.com", "www.luogu.com"];
const DEFAULT_READER_TIMEOUT_MS = 12_000;
const DEFAULT_READER_MAX_BODY_BYTES = 12_000;

const hostFromUrl = (url: string): string => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
};

const isLuoguHost = (host: string): boolean =>
  LUOGU_COOKIE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));

const splitReadableParagraphs = (text: string): string[] =>
  text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);

const languageForCandidate = (candidate: CandidateSource): ResearchLanguage =>
  candidate.language === "zh" || candidate.language === "en" ? candidate.language : "mixed";

const sourceTypeForCandidate = (candidate: CandidateSource): SourceType => {
  switch (candidate.sourceType) {
    case "official":
      return "official";
    case "documentation":
      return "docs";
    case "mainstream_news":
      return "mainstream_news";
    case "technical_blog":
      return "tech_media";
    case "community_solution":
      return "community";
    case "forum":
      return "forum";
    case "seo_aggregator":
      return "seo_aggregator";
    default:
      return "unknown";
  }
};

const reliabilityForTransport = (result: UrlReaderTransportResult): SourceReliability => {
  if (!result.ok) return "unknown";
  if ("sourceContentType" in result && result.sourceContentType) return "medium";
  return "medium";
};

const errorKindForTransport = (result: Extract<UrlReaderTransportResult, { ok: false }>): NonNullable<UrlReaderResult["error"]>["kind"] => {
  const kind = result.error.kind;
  if (kind === "timeout") return "network_timeout";
  if (kind === "unsupported_content_type") return "unsupported_content_type";
  if (kind === "empty_body") return "empty_body";
  if (kind === "blocked_or_captcha") return "captcha_or_bot_check";
  if (kind === "needs_js") return "js_required";
  if (kind === "invalid_response" || kind === "low_quality") return "extraction_failed";
  return "unknown";
};

const statusForTransportError = (result: Extract<UrlReaderTransportResult, { ok: false }>): UrlReaderResult["status"] => {
  const kind = result.error.kind;
  if (kind === "timeout") return "timeout";
  if (kind === "unsupported_content_type") return "unsupported";
  if (kind === "empty_body" || kind === "low_quality") return "too_short";
  if (kind === "blocked_or_captcha") return "blocked";
  if (kind === "needs_js") return "needs_js";
  return "parse_failed";
};

const toReaderResult = (
  input: ResearchReaderProviderContext,
  transportName: "tauri_backend" | "browser_fetch",
  result: UrlReaderTransportResult,
): UrlReaderResult => {
  const request = {
    request: input.request,
    policy: input.policy,
    queryPlan: input.queryPlan,
    candidate: input.candidate,
  };
  const diagnostics = {
    transport: transportName,
    cookiesUsed: false,
    authorizationUsed: false,
    redactedRequest: result.redactedRequest,
    warnings: result.warnings,
    elapsedMs: result.elapsedMs,
  };

  if (!result.ok) {
    return {
      request,
      candidate: input.candidate,
      status: statusForTransportError(result),
      error: {
        kind: errorKindForTransport(result),
        message: result.error.message,
        recoverable: true,
      },
      diagnostics,
    };
  }

  const title = input.candidate.title.trim() || input.candidate.url;
  const paragraphs = splitReadableParagraphs(result.bodyText);
  const finalUrl = "finalUrl" in result && result.finalUrl ? result.finalUrl : input.candidate.url;
  return {
    request,
    candidate: input.candidate,
    status: result.truncated ? "partial" : "fetched",
    document: {
      candidate: input.candidate,
      metadata: {
        title,
        canonicalUrl: finalUrl,
        host: input.candidate.host,
        sourceType: sourceTypeForCandidate(input.candidate),
        reliability: reliabilityForTransport(result),
        detectedLanguage: languageForCandidate(input.candidate),
      },
      blocks: [
        {
          id: "reader-heading",
          type: "heading",
          text: title,
          charLength: title.length,
          isComplete: true,
          headingPath: [title],
        },
        ...paragraphs.map((paragraph, index) => ({
          id: `reader-paragraph-${index + 1}`,
          type: "paragraph" as const,
          text: paragraph,
          charLength: paragraph.length,
          isComplete: true,
          headingPath: [title],
          relevanceHint: transportName,
        })),
      ],
      textCharLength: result.bodyText.length,
      diagnostics,
    },
    diagnostics,
  };
};

export const createLuoguCookieSafetyState = (input: {
  url: string;
  hasCookie: boolean;
}): LuoguCookieSafetyState => {
  const domainAllowed = isLuoguHost(hostFromUrl(input.url));
  if (!domainAllowed) {
    return {
      status: "blocked",
      domainAllowed: false,
      mayAttachCookieToReader: false,
      sendCookiesToModel: false,
      sendCookiesToThirdParty: false,
      reason: "domain_not_allowed",
    };
  }
  if (!input.hasCookie) {
    return {
      status: "missing_cookie",
      domainAllowed: true,
      mayAttachCookieToReader: false,
      sendCookiesToModel: false,
      sendCookiesToThirdParty: false,
      reason: "luogu_cookie_missing",
    };
  }
  return {
    status: "available",
    domainAllowed: true,
    mayAttachCookieToReader: true,
    sendCookiesToModel: false,
    sendCookiesToThirdParty: false,
    reason: "luogu_cookie_domain_allowed",
  };
};

export const createManualReaderProvider = (
  config: ManualReaderProviderInput,
): ResearchReaderProvider => ({
  name: "manual",
  loginStateAware: false,
  async read(input: ResearchReaderProviderContext): Promise<UrlReaderResult> {
    const fixture = config.fixtures[input.candidate.url];
    const text = fixture?.text ?? input.candidate.snippet ?? "";
    const paragraphs = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    const document: NonNullable<UrlReaderResult["document"]> = {
      candidate: input.candidate,
      metadata: {
        title: fixture?.title ?? input.candidate.title,
        canonicalUrl: input.candidate.url,
        host: input.candidate.host,
        sourceType: "docs",
        reliability: "high",
        detectedLanguage: input.candidate.language,
      },
      blocks: [
        {
          id: "manual-heading",
          type: "heading",
          text: fixture?.title ?? input.candidate.title,
          charLength: (fixture?.title ?? input.candidate.title).length,
          isComplete: true,
          headingPath: [fixture?.title ?? input.candidate.title],
        },
        ...paragraphs.map((paragraph, index) => ({
          id: `manual-paragraph-${index + 1}`,
          type: "paragraph" as const,
          text: paragraph,
          charLength: paragraph.length,
          isComplete: true,
          headingPath: [fixture?.title ?? input.candidate.title],
          relevanceHint: "manual reader fixture",
        })),
      ],
      textCharLength: text.length,
    };

    return {
      request: {
        request: input.request,
        policy: input.policy,
        queryPlan: input.queryPlan,
        candidate: input.candidate,
      },
      candidate: input.candidate,
      status: "fetched",
      document,
      diagnostics: {
        manualReader: true,
        cookiesUsed: false,
      },
    };
  },
});

export const createTauriUrlReaderProvider = (
  config: UrlReaderProviderInput = {},
): ResearchReaderProvider => ({
  name: "tauri",
  loginStateAware: false,
  async read(input: ResearchReaderProviderContext): Promise<UrlReaderResult> {
    const transport = config.transport ?? runTauriUrlReaderRequest;
    const result = await transport({
      url: input.candidate.url,
      title: input.candidate.title,
      snippet: input.candidate.snippet,
      timeoutMs: config.timeoutMs ?? DEFAULT_READER_TIMEOUT_MS,
      maxBodyBytes: config.maxBodyBytes ?? DEFAULT_READER_MAX_BODY_BYTES,
      userInput: input.request.userQuestion,
    });
    return toReaderResult(input, "tauri_backend", result);
  },
});

export const createBrowserUrlReaderProvider = (
  config: UrlReaderProviderInput = {},
): ResearchReaderProvider => ({
  name: "browser",
  loginStateAware: false,
  async read(input: ResearchReaderProviderContext): Promise<UrlReaderResult> {
    const transport = config.transport ?? runBrowserUrlReaderRequest;
    const result = await transport({
      url: input.candidate.url,
      timeoutMs: config.timeoutMs ?? DEFAULT_READER_TIMEOUT_MS,
      maxBodyBytes: config.maxBodyBytes ?? DEFAULT_READER_MAX_BODY_BYTES,
    });
    return toReaderResult(input, "browser_fetch", result);
  },
});
