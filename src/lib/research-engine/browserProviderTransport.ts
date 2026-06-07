import type {
  RealDiscoveryProviderName,
  RealDiscoveryTransportError,
  RealDiscoveryTransportErrorKind,
} from "./realProviderTypes";

export type BrowserProviderSmokeInput = {
  providerName: Extract<RealDiscoveryProviderName, "bocha" | "brave">;
  endpoint: string;
  apiKey: string;
  query: string;
  maxResults: number;
  timeoutMs: number;
};

export type BrowserProviderSmokeResult =
  | {
    ok: true;
    statusCode: number;
    elapsedMs: number;
    bodyText: string;
    bodyPreview: string;
    redactedRequest: BrowserProviderRedactedRequest;
  }
  | {
    ok: false;
    error: RealDiscoveryTransportError;
    bodyPreview?: string;
    redactedRequest: BrowserProviderRedactedRequest;
  };

export type BrowserProviderRedactedRequest = {
  method: "GET" | "POST";
  endpointOrigin: string;
  endpointHost: string;
  headers: Record<string, string>;
  queryKeys: string[];
  bodyKeys: string[];
  credentials: "omit";
  redactionFields: string[];
};

const BODY_PREVIEW_MAX_CHARS = 800;

const endpointSummary = (endpoint: string): Pick<BrowserProviderRedactedRequest, "endpointOrigin" | "endpointHost"> => {
  try {
    const parsed = new URL(endpoint);
    return {
      endpointOrigin: parsed.origin,
      endpointHost: parsed.hostname,
    };
  } catch {
    return {
      endpointOrigin: "invalid",
      endpointHost: "invalid",
    };
  }
};

const previewBody = (bodyText: string): string => {
  const normalized = bodyText.replace(/\s+/g, " ").trim();
  return normalized.length > BODY_PREVIEW_MAX_CHARS
    ? `${normalized.slice(0, BODY_PREVIEW_MAX_CHARS)}...`
    : normalized;
};

const errorKindForStatus = (statusCode: number): RealDiscoveryTransportErrorKind => {
  if (statusCode === 401 || statusCode === 403) return "unauthorized";
  if (statusCode === 429) return "rate_limited";
  return "unknown";
};

const errorMessageForStatus = (statusCode: number): string => {
  if (statusCode === 401 || statusCode === 403) return "provider returned unauthorized";
  if (statusCode === 429) return "provider returned rate limit";
  return `provider returned HTTP ${statusCode}`;
};

const elapsedMsSince = (startedAt: number): number => Math.max(0, Math.round(performance.now() - startedAt));

const buildProviderRequest = (
  input: BrowserProviderSmokeInput,
): {
  url: string;
  init: RequestInit;
  redactedRequest: BrowserProviderRedactedRequest;
} => {
  const endpoint = input.endpoint.trim();
  const maxResults = Math.max(1, Math.min(input.maxResults, 10));
  if (input.providerName === "brave") {
    const url = new URL(endpoint);
    url.searchParams.set("q", input.query);
    url.searchParams.set("count", String(maxResults));
    url.searchParams.set("country", "cn");
    url.searchParams.set("search_lang", "zh-hans");
    return {
      url: url.toString(),
      init: {
        method: "GET",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": input.apiKey,
        },
      },
      redactedRequest: {
        method: "GET",
        ...endpointSummary(endpoint),
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": "<redacted>",
        },
        queryKeys: ["q", "count", "country", "search_lang"],
        bodyKeys: [],
        credentials: "omit",
        redactionFields: ["apiKey", "x-subscription-token", "authorization", "cookie", "requestBody"],
      },
    };
  }

  return {
    url: endpoint,
    init: {
      method: "POST",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify({
        query: input.query,
        freshness: "noLimit",
        summary: true,
        count: maxResults,
      }),
    },
    redactedRequest: {
      method: "POST",
      ...endpointSummary(endpoint),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer <redacted>",
      },
      queryKeys: [],
      bodyKeys: ["query", "freshness", "summary", "count"],
      credentials: "omit",
      redactionFields: ["apiKey", "authorization", "cookie", "requestBody"],
    },
  };
};

export const runBrowserProviderSmokeRequest = async (
  input: BrowserProviderSmokeInput,
): Promise<BrowserProviderSmokeResult> => {
  const startedAt = performance.now();
  const { url, init, redactedRequest } = buildProviderRequest(input);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort("timeout"), Math.max(1, input.timeoutMs));

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const elapsedMs = elapsedMsSince(startedAt);
    const bodyText = await response.text();
    const bodyPreview = previewBody(bodyText);
    if (!response.ok) {
      return {
        ok: false,
        error: {
          kind: errorKindForStatus(response.status),
          message: errorMessageForStatus(response.status),
          statusCode: response.status,
          elapsedMs,
        },
        bodyPreview,
        redactedRequest,
      };
    }
    return {
      ok: true,
      statusCode: response.status,
      elapsedMs,
      bodyText,
      bodyPreview,
      redactedRequest,
    };
  } catch (error) {
    const elapsedMs = elapsedMsSince(startedAt);
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      error: {
        kind: aborted ? "timeout" : "unknown",
        message: aborted ? "provider request timed out" : error instanceof Error ? error.message : "provider request failed",
        elapsedMs,
      },
      redactedRequest,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};
