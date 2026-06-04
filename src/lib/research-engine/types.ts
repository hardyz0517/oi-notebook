export type ResearchLanguage = "zh" | "en" | "mixed";

export type SearchMode =
  | "no_search"
  | "explicit_url"
  | "docs_technical"
  | "oi_algorithm"
  | "news_recent"
  | "general_web"
  | "rumor_check";

export type SearchRiskLevel = "low" | "medium" | "high";

export type FreshnessRequirement = "stable" | "recent" | "latest" | "current";

export type SearchVertical =
  | "general_web"
  | "news"
  | "oi_algorithm"
  | "docs_technical"
  | "explicit_url"
  | "no_search";

export type QueryPurpose =
  | "recall"
  | "official"
  | "news"
  | "rebuttal"
  | "docs"
  | "exact_problem";

export type ExpectedSourceType =
  | "official"
  | "documentation"
  | "mainstream_news"
  | "technical_blog"
  | "community_solution"
  | "forum"
  | "problem_statement"
  | "fact_check"
  | "public_activity"
  | "explicit_url";

export type ResearchSearchRequest = {
  requestId?: string;
  userQuestion: string;
  locale?: ResearchLanguage | "auto";
  createdAt?: number;
  currentNoteContext?: {
    title?: string;
    tags?: string[];
    summary?: string;
    path?: string;
  };
  options?: {
    maxQueries?: number;
    allowPublicWeb?: boolean;
    offlineOnly?: boolean;
  };
  extensions?: Record<string, unknown>;
};

export type SearchPolicyDecision = {
  needSearch: boolean;
  mode: SearchMode;
  risk: SearchRiskLevel;
  freshness: FreshnessRequirement;
  vertical: SearchVertical;
  reason: string;
  guards: string[];
  confidence: number;
  focusEntities: string[];
  locale: ResearchLanguage;
  mixedLanguage: boolean;
  mustUseEvidence: boolean;
  evidenceRequirement: "none" | "medium" | "strong";
  future: {
    job?: unknown;
    events?: unknown[];
    candidates?: unknown[];
    evidencePacket?: unknown;
    answerContract?: unknown;
  };
};

export type PlannedQuery = {
  query: string;
  language: ResearchLanguage;
  purpose: QueryPurpose;
  priority: number;
  expectedSourceTypes: ExpectedSourceType[];
  preferredDomains?: string[];
};

export type QueryPlan = {
  requestId?: string;
  userQuestion: string;
  needSearch: boolean;
  mode: SearchMode;
  risk: SearchRiskLevel;
  freshness: FreshnessRequirement;
  vertical: SearchVertical;
  locale: ResearchLanguage;
  focusEntities: string[];
  maxQueries: number;
  queries: PlannedQuery[];
  reason: string;
  future: {
    discoveryJob?: unknown;
    schedulerConfig?: unknown;
    eventStream?: unknown;
    candidatePool?: unknown;
    evidencePacket?: unknown;
  };
};

export type ResearchEngineSelfCheckCase = {
  id: string;
  question: string;
  expectedNeedSearch: boolean;
  expectedMode: SearchMode;
  expectedRisk: SearchRiskLevel;
  expectedFreshness: FreshnessRequirement;
  notes?: string;
};

export type ResearchEngineSelfCheckResult = {
  id: string;
  question: string;
  passed: boolean;
  failures: string[];
  policy: SearchPolicyDecision;
  plan: QueryPlan;
};
