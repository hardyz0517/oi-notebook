import type { DiscoveryRawResult, PlannedQuery } from "./types";

const COMMAND_PREFIX_PATTERN =
  /^(?:\s*(?:\u5e2e\u6211|\u9ebb\u70e6|\u8bf7)?\s*(?:\u641c\u4e00\u4e0b|\u641c\u7d22\u4e00\u4e0b|\u67e5\u4e00\u4e0b|\u67e5\u8be2\u4e00\u4e0b|\u641c\u641c|\u641c|\u641c\u7d22|\u67e5|\u67e5\u8be2)\s*)+/i;
const LUOGU_WORD_PATTERN = /\u6d1b\u8c37|luogu/i;
const LUOGU_PROBLEM_ID_PATTERN = /\bP\d{3,6}\b/i;

const compact = (value: string): string => value.replace(/\s+/g, " ").trim();

export const cleanSearchCommandNoise = (value: string): string => {
  const cleaned = compact(value)
    .replace(COMMAND_PREFIX_PATTERN, "")
    .replace(/^(?:\u4e00\u4e0b|\u4e0b)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || compact(value);
};

export const extractLuoguProblemId = (value: string): string | undefined =>
  value.match(LUOGU_PROBLEM_ID_PATTERN)?.[0]?.toUpperCase();

export const normalizeOiSearchQuery = (value: string): string => {
  const cleaned = cleanSearchCommandNoise(value);
  const problemId = extractLuoguProblemId(cleaned);
  if (problemId && LUOGU_WORD_PATTERN.test(cleaned)) {
    return compact(cleaned.replace(/(?:\u6d1b\u8c37|luogu)\s*P\d{3,6}/i, `\u6d1b\u8c37 ${problemId}`));
  }
  return cleaned;
};

export const buildDirectOiDiscoveryResults = (input: {
  rawUserQuery: string;
  plannedQueries: PlannedQuery[];
  nowMs?: number;
}): DiscoveryRawResult[] => {
  const haystack = [
    input.rawUserQuery,
    ...input.plannedQueries.map((query) => query.query),
  ].join(" ");
  const luoguProblemId = extractLuoguProblemId(haystack);
  if (!luoguProblemId || !LUOGU_WORD_PATTERN.test(haystack)) return [];

  const query = normalizeOiSearchQuery(input.rawUserQuery);
  const wantsSolution = /\u9898\u89e3|solution|editorial/i.test(haystack);
  const wantsDiscussion = /\u8ba8\u8bba|discuss|discussion|\u8b66\u793a\u540e\u4eba|\u5751\u70b9|WA|TLE/i.test(haystack);
  const results: DiscoveryRawResult[] = [];
  const push = (item: {
    id: string;
    url: string;
    title: string;
    snippet: string;
    sourceRole: "problem_statement" | "community_solution" | "discussion_warning";
    reason: string;
    resultIndex: number;
    sourceTypeHint: "official" | "community";
  }) => {
    results.push({
      id: item.id,
      provider: "manual",
      providerPriority: 1000,
      query,
      queryPurpose: "exact_problem",
      queryLanguage: "mixed",
      resultIndex: item.resultIndex,
      url: item.url,
      title: item.title,
      snippet: item.snippet,
      discoveredAt: input.nowMs ?? Date.now(),
      sourceTypeHint: item.sourceTypeHint,
      extensions: {
        directDiscovery: {
          reason: item.reason,
          sourceRole: item.sourceRole,
          problemId: luoguProblemId,
        },
      },
    });
  };

  push({
    id: `direct:luogu:${luoguProblemId}:problem`,
    url: `https://www.luogu.com.cn/problem/${luoguProblemId}`,
    title: `Luogu ${luoguProblemId} problem`,
    snippet: `${luoguProblemId} official Luogu problem statement.`,
    sourceRole: "problem_statement",
    reason: "direct_luogu_problem_url",
    resultIndex: -1000,
    sourceTypeHint: "official",
  });
  if (wantsSolution) {
    push({
      id: `direct:luogu:${luoguProblemId}:solution`,
      url: `https://www.luogu.com.cn/problem/solution/${luoguProblemId}`,
      title: `Luogu ${luoguProblemId} solutions`,
      snippet: `${luoguProblemId} Luogu community solution list or solution content.`,
      sourceRole: "community_solution",
      reason: "direct_luogu_solution_url",
      resultIndex: -999,
      sourceTypeHint: "community",
    });
  }
  if (wantsDiscussion) {
    push({
      id: `direct:luogu:${luoguProblemId}:discussion`,
      url: `https://www.luogu.com.cn/discuss/lists?forumname=${luoguProblemId}`,
      title: `Luogu ${luoguProblemId} discussions`,
      snippet: `${luoguProblemId} Luogu discussion list.`,
      sourceRole: "discussion_warning",
      reason: "direct_luogu_discussion_url",
      resultIndex: -998,
      sourceTypeHint: "community",
    });
  }
  return results;
};
