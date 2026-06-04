import type {
  CandidateSource,
  SourceReliability,
  SourceType,
} from "./types";
import type {
  ExtractedContentBlock,
  ExtractedDocument,
  ExtractedDocumentMetadata,
  MockReaderScenario,
  UrlReaderRequest,
  UrlReaderResult,
  UrlReaderStatus,
} from "./readerTypes";

const normalizeHost = (host: string): string => host.toLowerCase().replace(/^www\./, "");

const block = (
  id: string,
  type: ExtractedContentBlock["type"],
  text: string,
  options: Partial<ExtractedContentBlock> = {},
): ExtractedContentBlock => ({
  id,
  type,
  text,
  charLength: text.length,
  tokenEstimate: Math.ceil(text.length / 4),
  isComplete: true,
  ...options,
});

const metadata = (
  candidate: CandidateSource,
  overrides: Partial<ExtractedDocumentMetadata> = {},
): ExtractedDocumentMetadata => ({
  title: candidate.title,
  canonicalUrl: candidate.url,
  host: normalizeHost(candidate.host),
  sourceType: sourceTypeFromCandidate(candidate),
  reliability: reliabilityFromCandidate(candidate),
  detectedLanguage: candidate.language,
  ...overrides,
});

const document = (
  candidate: CandidateSource,
  meta: ExtractedDocumentMetadata,
  blocks: ExtractedContentBlock[],
): ExtractedDocument => ({
  candidate,
  metadata: meta,
  blocks,
  textCharLength: blocks.reduce((sum, item) => sum + item.charLength, 0),
});

const sourceTypeFromCandidate = (candidate: CandidateSource): SourceType => {
  if (candidate.sourceType === "documentation") return "docs";
  if (candidate.sourceType === "mainstream_news") return "mainstream_news";
  if (candidate.sourceType === "official" || candidate.sourceType === "public_activity" || candidate.sourceType === "fact_check") return "official";
  if (candidate.sourceType === "technical_blog") return "tech_media";
  if (candidate.sourceType === "forum") return "forum";
  if (candidate.sourceType === "seo_aggregator") return "seo_aggregator";
  if (candidate.sourceType === "community_solution" || candidate.sourceType === "problem_statement") return "community";
  return "unknown";
};

const reliabilityFromCandidate = (candidate: CandidateSource): SourceReliability => {
  const host = normalizeHost(candidate.host);
  if (host === "react.dev" || host === "openai.com" || host === "oi-wiki.org") return "very_high";
  if (host === "luogu.com.cn" || host.endsWith("reuters.com")) return "high";
  if (candidate.sourceType === "forum" || candidate.sourceType === "seo_aggregator") return "low";
  if (candidate.sourceType === "official" || candidate.sourceType === "documentation" || candidate.sourceType === "mainstream_news") return "high";
  return "medium";
};

const statusError = (request: UrlReaderRequest, status: UrlReaderStatus): UrlReaderResult => {
  const errorByStatus: Record<UrlReaderStatus, UrlReaderResult["error"]> = {
    fetched: undefined,
    partial: undefined,
    blocked: { kind: "blocked_by_site", message: "The mock reader fixture marks this page as blocked.", recoverable: true },
    timeout: { kind: "network_timeout", message: "The mock reader fixture marks this page as timed out.", recoverable: true },
    needs_js: { kind: "js_required", message: "The mock reader fixture marks this page as requiring client-side rendering.", recoverable: true },
    too_short: { kind: "empty_body", message: "The mock reader fixture has too little readable body text.", recoverable: false },
    homepage: { kind: "unknown", message: "The mock reader fixture is a homepage instead of an answer-bearing page.", recoverable: true },
    wrong_page_type: { kind: "unsupported_content_type", message: "The mock reader fixture has the wrong page type.", recoverable: true },
    parse_failed: { kind: "extraction_failed", message: "The mock reader fixture failed extraction.", recoverable: true },
    unsupported: { kind: "unsupported_content_type", message: "The mock reader fixture is unsupported.", recoverable: false },
  };
  return {
    request,
    candidate: request.candidate,
    status,
    error: errorByStatus[status],
    diagnostics: { scenarioStatus: status },
  };
};

const oversizedCode = (): string =>
  Array.from({ length: 80 }, (_, index) => `function step${index}(node) { return lift(node, ${index}); }`).join("\n");

const oversizedMath = (): string =>
  `$$\n${Array.from({ length: 60 }, (_, index) => `dp_{${index + 1}} = min(dp_{${index}}, depth(u) + depth(v) - 2depth(lca(u,v)))`).join(" + \n")}\n$$`;

const reactDocs = (candidate: CandidateSource, scenario?: MockReaderScenario): ExtractedDocument => {
  const blocks = [
    block("react-heading", "heading", "useEffect", { headingPath: ["useEffect"], relevanceHint: "React official hook reference" }),
    block("react-summary", "paragraph", "useEffect is a React Hook for synchronizing a component with an external system. The official docs describe dependencies, cleanup, and when an effect runs.", { headingPath: ["useEffect"] }),
    block("react-code", "code", scenario?.oversizedCodeUrls?.includes(candidate.url) ? oversizedCode() : "useEffect(() => {\n  const connection = createConnection(serverUrl, roomId);\n  connection.connect();\n  return () => connection.disconnect();\n}, [serverUrl, roomId]);", { headingPath: ["useEffect", "Reference"], language: "tsx", relevanceHint: "React useEffect code example" }),
    block("react-caveat", "paragraph", "Effects run after rendering. In Strict Mode, React may run setup and cleanup one extra time in development to surface cleanup bugs.", { headingPath: ["useEffect", "Caveats"] }),
  ];
  return document(candidate, metadata(candidate, { title: "useEffect - React", sourceType: "docs", reliability: "very_high", detectedLanguage: "en" }), blocks);
};

const oiWikiLca = (candidate: CandidateSource, scenario?: MockReaderScenario): ExtractedDocument => {
  const mathText = scenario?.oversizedMathUrls?.includes(candidate.url)
    ? oversizedMath()
    : "$$up[v][k] = up[up[v][k-1]][k-1]$$";
  const blocks = [
    block("oi-heading", "heading", "Lowest Common Ancestor", { headingPath: ["Lowest Common Ancestor"], relevanceHint: "LCA OI Wiki" }),
    block("oi-paragraph", "paragraph", "Binary lifting preprocesses each node's ancestors. Implementation mistakes usually come from root depth, ancestor table bounds, and lifting order.", { headingPath: ["Lowest Common Ancestor", "Binary lifting"] }),
    block("oi-math", "math", mathText, { headingPath: ["Lowest Common Ancestor", "Binary lifting"], relevanceHint: "LCA recurrence" }),
    block("oi-code", "code", "for (let k = LOG - 1; k >= 0; k--) {\n  if (depth[up[u][k]] >= depth[v]) u = up[u][k];\n}", { headingPath: ["Lowest Common Ancestor", "Implementation"], language: "cpp" }),
  ];
  return document(candidate, metadata(candidate, { title: "Lowest Common Ancestor - OI Wiki", sourceType: "docs", reliability: "very_high", detectedLanguage: "en" }), blocks);
};

const luoguP3379 = (candidate: CandidateSource): ExtractedDocument => {
  const blocks = [
    block("luogu-heading", "heading", "P3379 LCA", { headingPath: ["P3379 LCA"], relevanceHint: "P3379 LCA" }),
    block("luogu-statement", "paragraph", "P3379 asks for the lowest common ancestor of many node pairs on a rooted tree. The usual solution is binary lifting after DFS preprocessing.", { headingPath: ["P3379 LCA"] }),
    block("luogu-math", "math", "$$dist(u,v)=depth_u+depth_v-2depth_{lca(u,v)}$$", { headingPath: ["P3379 LCA", "Formula"] }),
    block("luogu-code", "code", "int lca(int u, int v) {\n  if (dep[u] < dep[v]) swap(u, v);\n  for (int k = LOG - 1; k >= 0; --k) if (dep[fa[u][k]] >= dep[v]) u = fa[u][k];\n  return u == v ? u : fa[u][0];\n}", { headingPath: ["P3379 LCA", "Code"], language: "cpp" }),
  ];
  return document(candidate, metadata(candidate, { title: "P3379 LCA", sourceType: "community", reliability: "high", detectedLanguage: "zh" }), blocks);
};

const newsArticle = (candidate: CandidateSource): ExtractedDocument => {
  const blocks = [
    block("news-title", "heading", "OpenAI announces research and product updates", { headingPath: ["OpenAI announces research and product updates"], relevanceHint: "OpenAI news" }),
    block("news-date", "metadata", "Published: 2026-06-04", { relevanceHint: "published date" }),
    block("news-lede", "paragraph", "OpenAI announced recent product and research updates, with official materials pointing readers to release notes and safety documentation.", { headingPath: ["OpenAI announces research and product updates"] }),
    block("news-context", "paragraph", "The article distinguishes confirmed announcements from market rumors and links the public statement as the primary source.", { headingPath: ["OpenAI announces research and product updates"] }),
  ];
  return document(candidate, metadata(candidate, { title: "OpenAI announces research and product updates", sourceType: "mainstream_news", reliability: "high", publishedAt: "2026-06-04", detectedLanguage: "en" }), blocks);
};

const tooShortDocument = (candidate: CandidateSource): ExtractedDocument =>
  document(candidate, metadata(candidate, { title: "Short page", reliability: "low" }), [
    block("too-short", "paragraph", "No details.", { headingPath: ["Short page"] }),
  ]);

const homepageDocument = (candidate: CandidateSource): ExtractedDocument =>
  document(candidate, metadata(candidate, { title: "Example home", reliability: "medium" }), [
    block("home-heading", "heading", "Welcome", { headingPath: ["Welcome"] }),
    block("home-body", "paragraph", "This is a navigation-heavy homepage with links to many sections but no specific answer-bearing content.", { headingPath: ["Welcome"] }),
  ]);

const forcedStatus = (request: UrlReaderRequest): UrlReaderStatus | undefined => {
  const { scenario, candidate } = request;
  return scenario?.statusByUrl?.[candidate.url] ?? (scenario?.partialUrls?.includes(candidate.url) ? "partial" : undefined);
};

const documentForCandidate = (candidate: CandidateSource, scenario?: MockReaderScenario): ExtractedDocument => {
  const host = normalizeHost(candidate.host);
  const url = candidate.url.toLowerCase();
  if (host === "react.dev" || url.includes("react.dev/reference/react/useeffect")) return reactDocs(candidate, scenario);
  if (host === "oi-wiki.org" || url.includes("oi-wiki.org/graph/lca")) return oiWikiLca(candidate, scenario);
  if (host === "luogu.com.cn" || url.includes("p3379")) return luoguP3379(candidate);
  if (host === "openai.com" || host.endsWith("reuters.com") || url.includes("/news/")) return newsArticle(candidate);
  if (url.includes("too-short")) return tooShortDocument(candidate);
  if (url.endsWith("/") || url.includes("homepage")) return homepageDocument(candidate);
  return document(candidate, metadata(candidate), [
    block("generic-heading", "heading", candidate.title, { headingPath: [candidate.title] }),
    block("generic-body", "paragraph", candidate.snippet ?? "The mock reader produced a deterministic generic article body for offline tests.", { headingPath: [candidate.title] }),
  ]);
};

const inferredStatus = (candidate: CandidateSource): UrlReaderStatus => {
  const url = candidate.url.toLowerCase();
  if (url.includes("needs-js")) return "needs_js";
  if (url.includes("blocked")) return "blocked";
  if (url.includes("timeout")) return "timeout";
  if (url.includes("parse-failed")) return "parse_failed";
  if (url.includes("wrong-page-type")) return "wrong_page_type";
  if (url.includes("unsupported")) return "unsupported";
  if (url.includes("too-short")) return "too_short";
  if (url.endsWith("/") || url.includes("homepage")) return "homepage";
  return "fetched";
};

export const readMockUrl = (request: UrlReaderRequest): UrlReaderResult => {
  const status = forcedStatus(request) ?? inferredStatus(request.candidate);
  if (status === "fetched" || status === "partial" || status === "too_short" || status === "homepage") {
    return {
      request,
      candidate: request.candidate,
      status,
      document: documentForCandidate(request.candidate, request.scenario),
      diagnostics: { fixture: "mock_url_reader" },
    };
  }
  return statusError(request, status);
};

export const readMockCandidates = (input: {
  request: UrlReaderRequest["request"];
  policy: UrlReaderRequest["policy"];
  queryPlan: UrlReaderRequest["queryPlan"];
  candidates: CandidateSource[];
  scenario?: MockReaderScenario;
}): UrlReaderResult[] =>
  input.candidates.map((candidate) =>
    readMockUrl({
      request: input.request,
      policy: input.policy,
      queryPlan: input.queryPlan,
      candidate,
      scenario: input.scenario,
    }),
  );
