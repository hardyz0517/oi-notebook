import { fetchWebSourceExcerpts } from "@/lib/api";
import type { WebSearchResult, WebSourceExcerptResult } from "@/lib/aiWebSearch";
import type { BrowserUrlReaderRedactedRequest } from "./browserUrlReaderTransport";

export type TauriUrlReaderTransportInput = {
  url: string;
  title?: string;
  snippet?: string;
  timeoutMs: number;
  maxBodyBytes: number;
  userInput?: string;
};

export type TauriUrlReaderTransportErrorKind =
  | "tauri_bridge_unavailable"
  | "validation_failed"
  | "backend_network_error"
  | "timeout"
  | "http_non_2xx"
  | "unsupported_content_type"
  | "empty_body"
  | "body_too_large"
  | "blocked_or_captcha"
  | "needs_js"
  | "low_quality"
  | "invalid_response"
  | "unknown_error";

export type TauriUrlReaderRedactedRequest = BrowserUrlReaderRedactedRequest & {
  transport: "tauri_backend";
  backendBridgeName: "fetch_web_source_excerpts";
  authorizationUsed: false;
  cookiesUsed: false;
  browserFetchUsed: false;
  browserCorsNotApplicable: true;
  maxBytes: number;
};

export type TauriUrlReaderTransportError = {
  kind: TauriUrlReaderTransportErrorKind;
  message: string;
  httpStatus?: number;
  elapsedMs?: number;
};

export type TauriUrlReaderTransportResult =
  | {
    ok: true;
    url: string;
    finalUrl?: string;
    httpStatus?: number;
    contentType: string;
    sourceContentType?: string;
    bodyText: string;
    bodyBytes: number;
    bodyPreview: string;
    bodyPreviewLength: number;
    truncated: boolean;
    elapsedMs: number;
    redactedRequest: TauriUrlReaderRedactedRequest;
    warnings: string[];
    backendResult: WebSourceExcerptResult;
  }
  | {
    ok: false;
    url: string;
    finalUrl?: string;
    error: TauriUrlReaderTransportError;
    httpStatus?: number;
    contentType?: string;
    sourceContentType?: string;
    bodyBytes?: number;
    bodyPreview?: string;
    bodyPreviewLength?: number;
    elapsedMs: number;
    redactedRequest: TauriUrlReaderRedactedRequest;
    warnings: string[];
    backendResult?: WebSourceExcerptResult;
  };

const BODY_PREVIEW_MAX_CHARS = 800;
const BACKEND_EXCERPT_MAX_CHARS = 12_000;

const elapsedMsSince = (startedAt: number): number => Math.max(0, Math.round(performance.now() - startedAt));

const previewBody = (bodyText: string): string => {
  const normalized = bodyText.replace(/\s+/g, " ").trim();
  return normalized.length > BODY_PREVIEW_MAX_CHARS
    ? `${normalized.slice(0, BODY_PREVIEW_MAX_CHARS)}...`
    : normalized;
};

const redactedRequestFor = (url: string, maxBytes: number): TauriUrlReaderRedactedRequest => {
  const parsed = new URL(url);
  return {
    method: "GET",
    urlOrigin: parsed.origin,
    urlHost: parsed.hostname,
    headers: {
      Accept: "text/html, text/plain, application/xhtml+xml",
    },
    credentials: "omit",
    redactionFields: ["authorization", "cookie"],
    transport: "tauri_backend",
    backendBridgeName: "fetch_web_source_excerpts",
    authorizationUsed: false,
    cookiesUsed: false,
    browserFetchUsed: false,
    browserCorsNotApplicable: true,
    maxBytes,
  };
};

const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(`tauri_url_reader_timeout:${timeoutMs}`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

const isTauriUnavailable = (message: string): boolean => {
  const lower = message.toLocaleLowerCase();
  return lower.includes("__tauri__") ||
    lower.includes("tauri") && lower.includes("unavailable") ||
    lower.includes("invoke is not") ||
    lower.includes("invoke function") ||
    lower.includes("fetch_web_source_excerpts not found") ||
    lower.includes("command fetch_web_source_excerpts");
};

const kindFromBackendResult = (result: WebSourceExcerptResult): TauriUrlReaderTransportErrorKind => {
  const errorKind = result.errorKind ?? "";
  const status = result.status ?? "";
  const quality = result.excerptQuality ?? "";
  const reason = `${result.error ?? ""}; ${result.excerptReason ?? ""}; ${result.blockedReason ?? ""}; ${result.needsJsReason ?? ""}; ${result.extractionFailureReason ?? ""}`.toLocaleLowerCase();
  if (errorKind === "timeout") return "timeout";
  if (errorKind === "invalid_url" || errorKind === "unsupported_scheme" || errorKind === "private_network" || errorKind === "redirect_blocked") return "validation_failed";
  if (errorKind === "dns_failed" || reason.includes("http request failed")) return "backend_network_error";
  if (errorKind === "http_status") return "http_non_2xx";
  if (errorKind === "content_type_unsupported") return "unsupported_content_type";
  if (errorKind === "too_large") return "body_too_large";
  if (errorKind === "parse_failed") return "invalid_response";
  if (reason.includes("captcha") || reason.includes("bot") || reason.includes("verify")) return "blocked_or_captcha";
  if (result.needsJsReason || status === "blocked" && quality === "blocked" || result.contentStatus === "needs_js") return "needs_js";
  if (quality === "too_short" || quality === "empty" || quality === "snippet_only" || quality === "title_only") return "low_quality";
  if (errorKind === "blocked_or_unreadable" || status === "blocked") return "blocked_or_captcha";
  if (status === "failed") return "backend_network_error";
  return "unknown_error";
};

const warningFromBackendResult = (result: WebSourceExcerptResult): string[] => {
  const warnings = [
    result.cacheStatus ? `cache_${result.cacheStatus}` : undefined,
    result.codeBlocksTruncated ? "code_blocks_truncated" : undefined,
    result.excerptQuality ? `excerpt_quality:${result.excerptQuality}` : undefined,
    result.extractor ? `extractor:${result.extractor}` : undefined,
    result.excerptReason ? `excerpt_reason:${result.excerptReason}` : undefined,
  ];
  return warnings.filter((item): item is string => Boolean(item));
};

export const runTauriUrlReaderRequest = async (
  input: TauriUrlReaderTransportInput,
): Promise<TauriUrlReaderTransportResult> => {
  const startedAt = performance.now();
  const redactedRequest = redactedRequestFor(input.url, input.maxBodyBytes);
  const source: WebSearchResult = {
    id: `research-url-reader:${input.url}`,
    title: input.title?.trim() || new URL(input.url).hostname,
    url: input.url,
    snippet: input.snippet,
    sourceKind: "explicit_url",
  };

  try {
    if (typeof window === "undefined") {
      throw new Error("tauri_bridge_unavailable: URL reader requires the Tauri webview runtime.");
    }
    const results = await withTimeout(fetchWebSourceExcerpts({
      sources: [source],
      maxSources: 1,
      maxCharsPerSource: Math.max(500, Math.min(input.maxBodyBytes, BACKEND_EXCERPT_MAX_CHARS)),
      userInput: input.userInput,
      intent: "general_web",
      queries: input.userInput ? [input.userInput] : [],
      cacheEnabled: false,
    }), input.timeoutMs);
    if (!Array.isArray(results)) {
      throw new Error("invalid_response: fetch_web_source_excerpts did not return an array.");
    }
    const result = results[0];
    if (!result) {
      throw new Error("invalid_response: fetch_web_source_excerpts returned no result.");
    }
    const elapsedMs = elapsedMsSince(startedAt);
    const warnings = warningFromBackendResult(result);
    const bodyText = result.excerpt?.trim() ?? "";
    const bodyPreview = previewBody(bodyText);
    const bodyBytes = result.bodyBytes ?? byteLength(bodyText);
    const truncated = bodyBytes > input.maxBodyBytes || (result.excerptChars ?? bodyText.length) >= BACKEND_EXCERPT_MAX_CHARS;
    const sourceContentType = result.contentType;
    const contentType = "text/plain; source=tauri_backend_excerpt";

    if (!result.fetched || !bodyText) {
      const backendKind = kindFromBackendResult(result);
      const kind = !result.fetched || backendKind !== "unknown_error" ? backendKind : "empty_body";
      return {
        ok: false,
        url: input.url,
        finalUrl: result.finalUrl,
        error: {
          kind,
          message: result.error ?? result.excerptReason ?? result.blockedReason ?? result.extractionFailureReason ?? kind,
          elapsedMs,
        },
        contentType,
        sourceContentType,
        bodyBytes,
        bodyPreview,
        bodyPreviewLength: bodyPreview.length,
        elapsedMs,
        redactedRequest,
        warnings,
        backendResult: result,
      };
    }

    return {
      ok: true,
      url: input.url,
      finalUrl: result.finalUrl,
      contentType,
      sourceContentType,
      bodyText,
      bodyBytes,
      bodyPreview,
      bodyPreviewLength: bodyPreview.length,
      truncated,
      elapsedMs,
      redactedRequest,
      warnings,
      backendResult: result,
    };
  } catch (error) {
    const elapsedMs = elapsedMsSince(startedAt);
    const message = error instanceof Error ? error.message : String(error);
    const timeout = message.startsWith("tauri_url_reader_timeout:");
    return {
      ok: false,
      url: input.url,
      error: {
        kind: timeout ? "timeout" : isTauriUnavailable(message) ? "tauri_bridge_unavailable" : message.includes("invalid_response") ? "invalid_response" : "backend_network_error",
        message: timeout ? "Tauri backend URL reader timed out." : message,
        elapsedMs,
      },
      elapsedMs,
      redactedRequest,
      warnings: [],
    };
  }
};
