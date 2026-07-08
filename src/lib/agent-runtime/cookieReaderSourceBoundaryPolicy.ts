import type {
  CookieReaderAuthMaterialPolicy,
  CookieReaderCapabilityStatus,
  CookieReaderConsentStatus,
  CookieReaderCookiePolicy,
  CookieReaderDomainPolicy,
  CookieReaderFixturePolicy,
  CookieReaderNetworkPolicy,
  CookieReaderPermissionDecisionStatus,
  CookieReaderPrivateContentPolicy,
  CookieReaderSourceBoundary,
  CookieReaderSourceProfile,
  CookieReaderSourceRef,
} from "./cookieReaderContractTypes";

export const P15_COOKIE_READER_SOURCE_PROFILES: CookieReaderSourceProfile[] = [
  "luogu",
  "workspace-fixture",
  "manual-fixture",
  "replay-fixture",
  "unsupported",
  "reserved-future-source",
];

export type BuildCookieReaderSourceBoundaryDecisionInput = {
  readerRequestId: string;
  sourceRefId: string;
  sourceProfile: CookieReaderSourceProfile;
  displayOrigin: string;
  createdAt: string;
  requestedRealCookie?: boolean;
  requestedBrowserCookie?: boolean;
  requestedCookieStorage?: boolean;
  requestedThirdPartyCookieForwarding?: boolean;
  requestedPrivateNoteContent?: boolean;
};

export type CookieReaderSourceBoundaryDecision = {
  sourceRef: CookieReaderSourceRef;
  sourceBoundary: CookieReaderSourceBoundary;
  capabilityStatus: CookieReaderCapabilityStatus;
  permissionStatus: CookieReaderPermissionDecisionStatus;
  blockedReasons: string[];
  fetchTarget?: never;
};

type SourceProfileDefaults = {
  capabilityStatus: CookieReaderCapabilityStatus;
  permissionStatus: CookieReaderPermissionDecisionStatus;
  domainPolicy: CookieReaderDomainPolicy;
  authMaterialPolicy: CookieReaderAuthMaterialPolicy;
  networkPolicy: CookieReaderNetworkPolicy;
  cookiePolicy: CookieReaderCookiePolicy;
  privateContentPolicy: CookieReaderPrivateContentPolicy;
  fixturePolicy: CookieReaderFixturePolicy;
  consentStatus: CookieReaderConsentStatus;
  blockedReasons: string[];
};

const SOURCE_PROFILE_DEFAULTS: Record<CookieReaderSourceProfile, SourceProfileDefaults> = {
  luogu: {
    capabilityStatus: "preview",
    permissionStatus: "prompt-required",
    domainPolicy: "display-only",
    authMaterialPolicy: "redacted-ref-only",
    networkPolicy: "none",
    cookiePolicy: "fixture-only",
    privateContentPolicy: "opaque-ref-only",
    fixturePolicy: "deterministic-fixture",
    consentStatus: "future-review-required",
    blockedReasons: [],
  },
  "workspace-fixture": {
    capabilityStatus: "preview",
    permissionStatus: "prompt-required",
    domainPolicy: "workspace-fixture-only",
    authMaterialPolicy: "not-present",
    networkPolicy: "none",
    cookiePolicy: "fixture-only",
    privateContentPolicy: "fixture-only",
    fixturePolicy: "deterministic-fixture",
    consentStatus: "fixture-consent-recorded",
    blockedReasons: [],
  },
  "manual-fixture": {
    capabilityStatus: "preview",
    permissionStatus: "prompt-required",
    domainPolicy: "manual-fixture-only",
    authMaterialPolicy: "not-present",
    networkPolicy: "none",
    cookiePolicy: "fixture-only",
    privateContentPolicy: "fixture-only",
    fixturePolicy: "manual-fixture",
    consentStatus: "fixture-consent-recorded",
    blockedReasons: [],
  },
  "replay-fixture": {
    capabilityStatus: "preview",
    permissionStatus: "prompt-required",
    domainPolicy: "display-only",
    authMaterialPolicy: "redacted-ref-only",
    networkPolicy: "none",
    cookiePolicy: "fixture-only",
    privateContentPolicy: "opaque-ref-only",
    fixturePolicy: "replay-fixture",
    consentStatus: "not-required",
    blockedReasons: [],
  },
  unsupported: {
    capabilityStatus: "unavailable",
    permissionStatus: "unavailable",
    domainPolicy: "unsupported",
    authMaterialPolicy: "unsupported",
    networkPolicy: "none",
    cookiePolicy: "blocked",
    privateContentPolicy: "unsupported",
    fixturePolicy: "unsupported",
    consentStatus: "unavailable",
    blockedReasons: ["unsupported_source_profile"],
  },
  "reserved-future-source": {
    capabilityStatus: "reserved",
    permissionStatus: "reserved",
    domainPolicy: "reserved-future-allowlist",
    authMaterialPolicy: "reserved-future-user-consent",
    networkPolicy: "none",
    cookiePolicy: "blocked",
    privateContentPolicy: "reserved-future-user-consent",
    fixturePolicy: "blocked",
    consentStatus: "future-review-required",
    blockedReasons: ["true_cookie_reader_reserved_future_phase"],
  },
};

export function buildCookieReaderSourceBoundaryDecision(
  input: BuildCookieReaderSourceBoundaryDecisionInput,
): CookieReaderSourceBoundaryDecision {
  const defaults = SOURCE_PROFILE_DEFAULTS[input.sourceProfile];
  const blockedReasons = [...defaults.blockedReasons, ...sensitiveRequestBlockedReasonsFor(input)];
  const hasBlockedRequest = blockedReasons.length > defaults.blockedReasons.length;
  const isBlocked = blockedReasons.length > 0;
  const capabilityStatus = hasBlockedRequest ? "blocked" : defaults.capabilityStatus;
  const permissionStatus = hasBlockedRequest ? "blocked-by-configuration" : defaults.permissionStatus;
  const sourceRef: CookieReaderSourceRef = {
    sourceRefId: input.sourceRefId,
    sourceProfile: input.sourceProfile,
    displayOrigin: input.displayOrigin,
    domainPolicy: defaults.domainPolicy,
    authMaterialPolicy: hasBlockedRequest ? "blocked" : defaults.authMaterialPolicy,
    networkPolicy: "none",
    cookiePolicy: hasBlockedRequest ? "blocked" : defaults.cookiePolicy,
    privateContentPolicy: hasBlockedRequest ? "blocked" : defaults.privateContentPolicy,
    fixturePolicy: hasBlockedRequest ? "blocked" : defaults.fixturePolicy,
    consentStatus: hasBlockedRequest ? "blocked" : defaults.consentStatus,
    blockedReasons,
  };

  return {
    sourceRef,
    sourceBoundary: {
      boundaryId: `${input.readerRequestId}:source-boundary`,
      sourceProfile: input.sourceProfile,
      displayOrigin: input.displayOrigin,
      displayOnly: true,
      allowedSourceRefs: isBlocked ? [] : [input.sourceRefId],
      deniedSourceRefs: isBlocked ? [input.sourceRefId] : [],
      requiredConsent: sourceRef.consentStatus,
      blockedReasons,
      createdAt: input.createdAt,
    },
    capabilityStatus,
    permissionStatus,
    blockedReasons,
  };
}

function sensitiveRequestBlockedReasonsFor(input: BuildCookieReaderSourceBoundaryDecisionInput): string[] {
  const blockedReasons: string[] = [];

  if (input.requestedRealCookie) {
    blockedReasons.push("real_cookie_access_blocked_in_p15");
  }

  if (input.requestedBrowserCookie) {
    blockedReasons.push("browser_cookie_access_blocked_in_p15");
  }

  if (input.requestedCookieStorage) {
    blockedReasons.push("cookie_storage_blocked_in_p15");
  }

  if (input.requestedThirdPartyCookieForwarding) {
    blockedReasons.push("third_party_cookie_forwarding_blocked_in_p15");
  }

  if (input.requestedPrivateNoteContent) {
    blockedReasons.push("private_note_content_blocked_in_p15");
  }

  return blockedReasons;
}
