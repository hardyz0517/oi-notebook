import { readLuoguProblemContent, type ReadLuoguProblemContentResult } from "@/lib/api";

export type LuoguReaderKind = "problem" | "solution" | "discussion";

export type LuoguReaderTarget = {
  problemId: string;
  kind: LuoguReaderKind;
};

export type LuoguReaderResult =
  | {
    ok: true;
    target: LuoguReaderTarget;
    url: string;
    title: string;
    bodyText: string;
    bodyBytes: number;
    bodyPreview: string;
    sourceRole: string;
    luoguCookieUsed: boolean;
    luoguCookieAvailable: boolean;
    permissionRequired: false;
    backendResult: ReadLuoguProblemContentResult;
    warnings: string[];
  }
  | {
    ok: false;
    target: LuoguReaderTarget;
    url: string;
    title?: string;
    status: string;
    message: string;
    sourceRole: string;
    luoguCookieUsed: boolean;
    luoguCookieAvailable: boolean;
    permissionRequired: boolean;
    backendResult?: ReadLuoguProblemContentResult;
    warnings: string[];
  };

const LUOGU_HOST_PATTERN = /(^|\.)luogu\.com\.cn$/i;
const PROBLEM_ID_PATTERN = /\bP\d{3,6}\b/i;
const BODY_PREVIEW_MAX_CHARS = 800;

const byteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

const previewBody = (bodyText: string): string => {
  const normalized = bodyText.replace(/\s+/g, " ").trim();
  return normalized.length > BODY_PREVIEW_MAX_CHARS
    ? `${normalized.slice(0, BODY_PREVIEW_MAX_CHARS)}...`
    : normalized;
};

export const parseLuoguReaderTarget = (rawUrl: string): LuoguReaderTarget | undefined => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (!LUOGU_HOST_PATTERN.test(url.hostname)) return undefined;
  const problemId = url.pathname.match(PROBLEM_ID_PATTERN)?.[0]?.toUpperCase() ??
    url.search.match(PROBLEM_ID_PATTERN)?.[0]?.toUpperCase();
  if (!problemId) return undefined;
  const path = url.pathname.toLocaleLowerCase();
  const kind: LuoguReaderKind = path.includes("/problem/solution/")
    ? "solution"
    : path.includes("/discuss")
      ? "discussion"
      : "problem";
  return { problemId, kind };
};

export const runLuoguReaderRequest = async (rawUrl: string): Promise<LuoguReaderResult | undefined> => {
  const target = parseLuoguReaderTarget(rawUrl);
  if (!target) return undefined;
  const backendResult = await readLuoguProblemContent({ problemId: target.problemId, kind: target.kind });
  const warnings = [
    "luogu_special_reader",
    backendResult.luoguCookieUsed ? "luogu_cookie_used" : "luogu_cookie_not_used",
    backendResult.luoguCookieAvailable ? "luogu_cookie_available" : "luogu_cookie_unavailable",
  ];
  if (!backendResult.fetched || !backendResult.excerpt.trim()) {
    return {
      ok: false,
      target,
      url: backendResult.url || rawUrl,
      title: backendResult.title,
      status: backendResult.status || "failed",
      message: backendResult.permissionRequired
        ? "Luogu login state is unavailable or permission is insufficient."
        : backendResult.error || "Luogu reader did not return readable content.",
      sourceRole: backendResult.sourceRole,
      luoguCookieUsed: backendResult.luoguCookieUsed,
      luoguCookieAvailable: backendResult.luoguCookieAvailable,
      permissionRequired: backendResult.permissionRequired,
      backendResult,
      warnings,
    };
  }
  const bodyText = backendResult.excerpt.trim();
  return {
    ok: true,
    target,
    url: backendResult.url || rawUrl,
    title: backendResult.title || `${target.problemId} ${target.kind}`,
    bodyText,
    bodyBytes: byteLength(bodyText),
    bodyPreview: previewBody(bodyText),
    sourceRole: backendResult.sourceRole,
    luoguCookieUsed: backendResult.luoguCookieUsed,
    luoguCookieAvailable: backendResult.luoguCookieAvailable,
    permissionRequired: false,
    backendResult,
    warnings,
  };
};
