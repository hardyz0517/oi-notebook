import type {
  CandidateSource,
  QueryPlan,
  ResearchSearchRequest,
  SearchPolicyDecision,
} from "./types";
import type { UrlReaderResult } from "./readerTypes";

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

const LUOGU_COOKIE_DOMAINS = ["luogu.com.cn", "www.luogu.com.cn", "luogu.com", "www.luogu.com"];

const hostFromUrl = (url: string): string => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
};

const isLuoguHost = (host: string): boolean =>
  LUOGU_COOKIE_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));

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
