export type BrowserUrlReaderTransportInput = {
  url: string;
  timeoutMs: number;
  maxBodyBytes: number;
};

export type BrowserUrlReaderTransportErrorKind =
  | "timeout"
  | "aborted"
  | "network_error"
  | "non_2xx"
  | "unsupported_content_type"
  | "empty_body"
  | "body_too_large";

export type BrowserUrlReaderRedactedRequest = {
  method: "GET";
  urlOrigin: string;
  urlHost: string;
  headers: Record<string, string>;
  credentials: "omit";
  redactionFields: string[];
};

export type BrowserUrlReaderTransportError = {
  kind: BrowserUrlReaderTransportErrorKind;
  message: string;
  httpStatus?: number;
  elapsedMs?: number;
};

export type BrowserUrlReaderTransportResult =
  | {
    ok: true;
    url: string;
    httpStatus: number;
    contentType: string;
    bodyText: string;
    bodyBytes: number;
    bodyPreview: string;
    truncated: boolean;
    elapsedMs: number;
    redactedRequest: BrowserUrlReaderRedactedRequest;
    warnings: string[];
  }
  | {
    ok: false;
    url: string;
    error: BrowserUrlReaderTransportError;
    httpStatus?: number;
    contentType?: string;
    bodyBytes?: number;
    bodyPreview?: string;
    elapsedMs: number;
    redactedRequest: BrowserUrlReaderRedactedRequest;
    warnings: string[];
  };

const BODY_PREVIEW_MAX_CHARS = 800;
const SUPPORTED_CONTENT_TYPES = ["text/html", "text/plain", "application/xhtml+xml"];

const elapsedMsSince = (startedAt: number): number => Math.max(0, Math.round(performance.now() - startedAt));

const previewBody = (bodyText: string): string => {
  const normalized = bodyText.replace(/\s+/g, " ").trim();
  return normalized.length > BODY_PREVIEW_MAX_CHARS
    ? `${normalized.slice(0, BODY_PREVIEW_MAX_CHARS)}...`
    : normalized;
};

const redactedRequestFor = (url: string): BrowserUrlReaderRedactedRequest => {
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
  };
};

const contentTypeBase = (contentType: string): string =>
  contentType.split(";")[0]?.trim().toLocaleLowerCase() ?? "";

const isSupportedContentType = (contentType: string): boolean => {
  const base = contentTypeBase(contentType);
  return SUPPORTED_CONTENT_TYPES.includes(base);
};

const readCappedBody = async (
  response: Response,
  maxBodyBytes: number,
): Promise<{ bodyText: string; bodyBytes: number; truncated: boolean }> => {
  const maxBytes = Math.max(1, maxBodyBytes);
  if (!response.body) {
    const text = await response.text();
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    const truncatedBytes = bytes.slice(0, maxBytes);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    return {
      bodyText: decoder.decode(truncatedBytes),
      bodyBytes: bytes.length,
      truncated: bytes.length > maxBytes,
    };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bodyBytes = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const remaining = maxBytes - bodyBytes;
    bodyBytes += value.byteLength;
    if (remaining > 0) {
      chunks.push(value.byteLength > remaining ? value.slice(0, remaining) : value);
    }
    if (bodyBytes > maxBytes) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }

  const decoder = new TextDecoder("utf-8", { fatal: false });
  return {
    bodyText: chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join("") + decoder.decode(),
    bodyBytes,
    truncated,
  };
};

export const runBrowserUrlReaderRequest = async (
  input: BrowserUrlReaderTransportInput,
): Promise<BrowserUrlReaderTransportResult> => {
  const startedAt = performance.now();
  const redactedRequest = redactedRequestFor(input.url);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort("timeout"), Math.max(1, input.timeoutMs));

  try {
    const response = await fetch(input.url, {
      method: "GET",
      credentials: "omit",
      headers: redactedRequest.headers,
      signal: controller.signal,
    });
    const elapsedMs = elapsedMsSince(startedAt);
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      return {
        ok: false,
        url: input.url,
        error: {
          kind: "non_2xx",
          message: `URL reader smoke received HTTP ${response.status}`,
          httpStatus: response.status,
          elapsedMs,
        },
        httpStatus: response.status,
        contentType,
        elapsedMs,
        redactedRequest,
        warnings: [],
      };
    }
    if (!isSupportedContentType(contentType)) {
      return {
        ok: false,
        url: input.url,
        error: {
          kind: "unsupported_content_type",
          message: contentType ? `Unsupported content type: ${contentType}` : "Missing content type",
          httpStatus: response.status,
          elapsedMs,
        },
        httpStatus: response.status,
        contentType,
        elapsedMs,
        redactedRequest,
        warnings: [],
      };
    }

    const body = await readCappedBody(response, input.maxBodyBytes);
    const bodyPreview = previewBody(body.bodyText);
    const warnings = body.truncated ? ["body_too_large_truncated"] : [];
    if (!body.bodyText.trim()) {
      return {
        ok: false,
        url: input.url,
        error: {
          kind: "empty_body",
          message: "URL reader smoke received an empty body",
          httpStatus: response.status,
          elapsedMs,
        },
        httpStatus: response.status,
        contentType,
        bodyBytes: body.bodyBytes,
        bodyPreview,
        elapsedMs,
        redactedRequest,
        warnings,
      };
    }

    return {
      ok: true,
      url: input.url,
      httpStatus: response.status,
      contentType,
      bodyText: body.bodyText,
      bodyBytes: body.bodyBytes,
      bodyPreview,
      truncated: body.truncated,
      elapsedMs,
      redactedRequest,
      warnings,
    };
  } catch (error) {
    const elapsedMs = elapsedMsSince(startedAt);
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      url: input.url,
      error: {
        kind: aborted ? "timeout" : "network_error",
        message: aborted ? "URL reader smoke timed out" : error instanceof Error ? error.message : "URL reader smoke network error",
        elapsedMs,
      },
      elapsedMs,
      redactedRequest,
      warnings: aborted ? [] : ["cors_or_network_error_possible"],
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
};
