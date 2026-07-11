import { P15_COOKIE_READER_SCHEMA_VERSION } from "./cookieReaderContractTypes";
import type {
  CookieReaderMockProjection,
  CookieReaderMockProjectionMode,
  CookieReaderMockProjectionStatus,
  CookieReaderRedactionClass,
  CookieReaderSourceProfile,
} from "./cookieReaderContractTypes";
import type { CookieReaderSensitiveInput } from "./cookieReaderRedactionAuditPolicy";

export const P15_COOKIE_READER_MOCK_FIXTURE_PROJECTION_SCHEMA_VERSION = P15_COOKIE_READER_SCHEMA_VERSION;

export type MockCookieReaderFixtureInput = {
  fixtureId: string;
  readerRequestId: string;
  sourceProfile: CookieReaderSourceProfile;
  displayOrigin: string;
  title: string;
  excerpt: string;
  evidenceRefs?: string[];
  redactionMarkers?: CookieReaderRedactionClass[];
  blockedReasons?: string[];
  unavailableReasons?: string[];
  sensitiveInput?: CookieReaderSensitiveInput;
  createdAt: string;
};

export type MockCookieReaderFixtureProjection = CookieReaderMockProjection & {
  unavailableReasons: string[];
  schemaVersion: typeof P15_COOKIE_READER_MOCK_FIXTURE_PROJECTION_SCHEMA_VERSION;
};

const TEXT_LIMIT = 240;

export function projectMockCookieReaderFixture(
  input: MockCookieReaderFixtureInput,
): MockCookieReaderFixtureProjection {
  const blockedReasons = uniqueSafeValues(input.blockedReasons ?? []);
  const unavailableReasons = uniqueSafeValues(input.unavailableReasons ?? []);
  const mode = modeFor(blockedReasons, unavailableReasons);
  const status = statusForMode(mode);

  return {
    mockProjectionId: `${input.readerRequestId}:mock-fixture-projection:${mode}`,
    readerRequestId: input.readerRequestId,
    mode,
    status,
    fixtureId: input.fixtureId,
    sourceProfile: input.sourceProfile,
    displayOrigin: safeDisplayOrigin(input.displayOrigin),
    safeTitle: redactAndBound(input.title, input.sensitiveInput),
    safeExcerpt: redactAndBound(input.excerpt, input.sensitiveInput),
    sanitizedEvidenceRefs: sanitizedEvidenceRefsFor(input.evidenceRefs ?? [], input.sensitiveInput),
    redactionMarkers: uniqueRedactionMarkers(input.redactionMarkers ?? []),
    blockedReasons,
    unavailableReasons,
    schemaVersion: P15_COOKIE_READER_MOCK_FIXTURE_PROJECTION_SCHEMA_VERSION,
    createdAt: input.createdAt,
  };
}

function modeFor(blockedReasons: string[], unavailableReasons: string[]): CookieReaderMockProjectionMode {
  if (blockedReasons.length > 0) {
    return "blocked";
  }

  if (unavailableReasons.length > 0) {
    return "unavailable";
  }

  return "fixture-only";
}

function statusForMode(mode: CookieReaderMockProjectionMode): CookieReaderMockProjectionStatus {
  if (mode === "blocked") {
    return "blocked";
  }

  if (mode === "unavailable") {
    return "unavailable";
  }

  return "projected";
}

function safeDisplayOrigin(displayOrigin: string): string {
  try {
    const url = new URL(displayOrigin);
    return `${url.origin}${url.pathname}`;
  } catch {
    return redactAndBound(displayOrigin);
  }
}

function sanitizedEvidenceRefsFor(evidenceRefs: string[], sensitiveInput?: CookieReaderSensitiveInput): string[] {
  return uniqueSafeValues(evidenceRefs).filter((ref) => ref.startsWith("evidence:") && ref === redactAndBound(ref, sensitiveInput));
}

function uniqueRedactionMarkers(markers: CookieReaderRedactionClass[]): CookieReaderRedactionClass[] {
  return [...new Set(markers)];
}

function uniqueSafeValues(values: string[]): string[] {
  return [...new Set(values.map((value) => redactAndBound(value)).filter((value) => value.length > 0))];
}

function redactAndBound(value: string, sensitiveInput: CookieReaderSensitiveInput = {}): string {
  const sensitiveValues = Object.values(sensitiveInput).filter((sensitiveValue): sensitiveValue is string =>
    sensitiveValue !== undefined && sensitiveValue.length > 0,
  );
  let redacted = value;

  for (const sensitiveValue of sensitiveValues) {
    redacted = replaceAll(redacted, sensitiveValue, "[redacted]");
  }

  redacted = redacted
    .replace(/cookie\s*[:=]\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/authori(?:z|s)ation\s*:\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/raw\s+provider\s+payload\s*:\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/raw\s+tool\s+output\s*:\s*[^,;.\n\r]+/gi, "[redacted]")
    .replace(/sk-[a-z0-9_-]+/gi, "[redacted]")
    .replace(/private\s+note\s+content/gi, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();

  if (redacted.length <= TEXT_LIMIT) {
    return redacted;
  }

  return redacted.slice(0, TEXT_LIMIT - 3).trimEnd() + "...";
}

function replaceAll(value: string, search: string, replacement: string): string {
  return value.split(search).join(replacement);
}
