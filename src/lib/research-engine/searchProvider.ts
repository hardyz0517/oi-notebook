import type {
  DiscoveryExecutionSnapshot,
  DiscoveryRawResult,
  QueryPlan,
  ResearchSearchRequest,
  SearchPolicyDecision,
} from "./types";
import { runKeylessBingProvider, type KeylessBingProviderOptions } from "./keylessBingProvider";

export type ResearchSearchProviderName =
  | "tavily"
  | "bing"
  | "local_index"
  | "mock"
  | "manual";

export type ResearchSearchProviderMode = "search" | "abstract" | "hybrid";

export type ResearchSearchProviderContext = {
  request: ResearchSearchRequest;
  policy: SearchPolicyDecision;
  queryPlan: QueryPlan;
  queryText: string;
  allowPublicWeb: boolean;
};

export type ResearchSearchProviderResult = {
  providerName: ResearchSearchProviderName;
  providerMode: ResearchSearchProviderMode;
  rawResults: DiscoveryRawResult[];
  warnings: string[];
  errors: string[];
  diagnostics?: Record<string, unknown>;
};

export interface ResearchSearchProvider {
  readonly name: ResearchSearchProviderName;
  readonly mode: ResearchSearchProviderMode;
  search(input: ResearchSearchProviderContext): Promise<ResearchSearchProviderResult>;
}

export type TavilySearchTransport = (input: ResearchSearchProviderContext & {
  apiKey: string;
}) => Promise<DiscoveryRawResult[]>;

export type TavilyReadySearchProviderInput = {
  apiKey?: string | null;
  transport?: TavilySearchTransport;
};

export type KeylessBingSearchProviderInput = {
  executor?: (options: KeylessBingProviderOptions) => Promise<{
    rawResults: DiscoveryRawResult[];
    warnings: string[];
    errors: string[];
    diagnostics: Record<string, unknown>;
  }>;
};

export type ManualSearchSource = {
  url: string;
  title: string;
  snippet?: string;
};

export type ManualSearchProviderInput = {
  sources: ManualSearchSource[];
};

export type ResearchSearchBoundary = {
  provider: ResearchSearchProvider;
  snapshot?: DiscoveryExecutionSnapshot;
};

export const createEmptySearchProviderResult = (
  providerName: ResearchSearchProviderName,
): ResearchSearchProviderResult => ({
  providerName,
  providerMode: "search",
  rawResults: [],
  warnings: [],
  errors: [],
});

export const createTavilyReadySearchProvider = (
  config: TavilyReadySearchProviderInput = {},
): ResearchSearchProvider => ({
  name: "tavily",
  mode: "search",
  async search(input: ResearchSearchProviderContext): Promise<ResearchSearchProviderResult> {
    const apiKey = config.apiKey?.trim();
    if (!apiKey) {
      return {
        providerName: "tavily",
        providerMode: "search",
        rawResults: [],
        warnings: ["tavily_not_configured"],
        errors: [],
        diagnostics: {
          status: "unavailable",
          reason: "missing_api_key",
          fallback: "manual_or_public_provider",
        },
      };
    }
    if (!config.transport) {
      return {
        providerName: "tavily",
        providerMode: "search",
        rawResults: [],
        warnings: ["tavily_transport_unavailable"],
        errors: [],
        diagnostics: {
          status: "unavailable",
          reason: "missing_transport",
          fallback: "manual_or_public_provider",
        },
      };
    }

    const rawResults = await config.transport({ ...input, apiKey });
    return {
      providerName: "tavily",
      providerMode: "search",
      rawResults,
      warnings: [],
      errors: [],
      diagnostics: {
        status: "available",
      },
    };
  },
});

export const createKeylessBingSearchProvider = (
  config: KeylessBingSearchProviderInput = {},
): ResearchSearchProvider => ({
  name: "bing",
  mode: "search",
  async search(input: ResearchSearchProviderContext): Promise<ResearchSearchProviderResult> {
    if (!input.allowPublicWeb) {
      return {
        providerName: "bing",
        providerMode: "search",
        rawResults: [],
        warnings: ["public_web_disabled"],
        errors: [],
        diagnostics: {
          publicProvider: "keyless_bing",
          status: "disabled",
        },
      };
    }

    const firstQuery = input.queryPlan.queries[0];
    const executor = config.executor ?? runKeylessBingProvider;
    const result = await executor({
      query: input.queryText,
      rawUserQuery: input.request.userQuestion,
      queryPurpose: firstQuery?.purpose ?? "recall",
      queryLanguage: firstQuery?.language ?? input.queryPlan.locale,
      plannedQueries: input.queryPlan.queries,
    });

    return {
      providerName: "bing",
      providerMode: "search",
      rawResults: result.rawResults,
      warnings: result.warnings,
      errors: result.errors,
      diagnostics: {
        publicProvider: "keyless_bing",
        ...(result.diagnostics as Record<string, unknown>),
      },
    };
  },
});

export const createManualSearchProvider = (
  config: ManualSearchProviderInput,
): ResearchSearchProvider => ({
  name: "manual",
  mode: "search",
  async search(input: ResearchSearchProviderContext): Promise<ResearchSearchProviderResult> {
    const query = input.queryText.trim().toLowerCase();
    const rawResults = config.sources
      .filter((source) => !query || source.url.toLowerCase().includes(query) || source.title.toLowerCase().includes(query))
      .map((source, index) => ({
        provider: "manual" as const,
        query: input.queryText,
        queryPurpose: input.queryPlan.queries[0]?.purpose ?? "official",
        resultIndex: index,
        url: source.url,
        title: source.title,
        snippet: source.snippet,
        extensions: { manualSource: true },
      }));

    return {
      providerName: "manual",
      providerMode: "search",
      rawResults,
      warnings: [],
      errors: [],
      diagnostics: {
        credentialPolicy: "none",
        networkUsed: false,
      },
    };
  },
});

