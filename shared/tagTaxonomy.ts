export type TagTaxonomyEntry = {
  id: string;
  path: string[];
  aliases?: string[];
  order?: number;
  source?: "builtin" | "user";
  hidden?: boolean;
  deprecated?: boolean;
  mergeTo?: string;
};

export type NormalizedTagPath = {
  name: string;
  fullPath: string;
  segments: string[];
  entryId?: string;
};

export type TagTreeNode = {
  name: string;
  fullPath: string;
  depth: number;
  count: number;
  children: TagTreeNode[];
};

export type TagSuggestion = {
  id: string;
  path: string[];
  pathText: string;
  name: string;
  aliases: string[];
  searchText: string;
  source: "builtin" | "user";
  hidden: boolean;
  deprecated: boolean;
};

export type TagCompletionGroup = {
  name: string;
  path: string[];
  pathText: string;
  groups: Array<{
    name: string;
    path: string[];
    pathText: string;
    candidates: TagSuggestion[];
  }>;
  candidates: TagSuggestion[];
};

export type TagCompletionContext = {
  version: "builtin-v1";
  groups: TagCompletionGroup[];
  flat: TagSuggestion[];
  aliases: Record<string, string>;
};

export type TagSuggestionGroupNode = {
  name: string;
  path: string[];
  pathText: string;
  id?: string;
  entryId?: string;
  orderKey: string;
  candidates: TagSuggestion[];
};

export type TagSuggestionRootGroup = {
  root: string;
  name: string;
  path: string[];
  pathText: string;
  orderKey: string;
  groups: TagSuggestionGroupNode[];
};

export type FindTagSuggestionsOptions = {
  limit?: number;
  includeHidden?: boolean;
  includeDeprecated?: boolean;
  userConfig?: UserTagTaxonomyConfig | null;
};

export type GetTagSuggestionListOptions = {
  includeHidden?: boolean;
  includeDeprecated?: boolean;
};

export type ArticleTagSuggestion = {
  tag: TagSuggestion;
  score: number;
  reasons: string[];
};

export type AiTagRecommendationCandidate = {
  id: string;
  pathText: string;
  name: string;
  aliases: string[];
  source: "builtin" | "user";
  score: number;
  reasons: string[];
};

export type AiTagRecommendationRawSuggestion = {
  tag?: string | null;
  confidence?: number | null;
  reason?: string | null;
  evidence?: string | null;
};

export type AiTagRecommendationSuggestion = {
  tag: string;
  confidence: number;
  reason: string;
  evidence: string;
  normalizedFrom?: string;
};

export type AiTagRecommendationIgnored = {
  tag?: string;
  reason:
    | "invalid_json"
    | "missing_tag"
    | "unknown_tag"
    | "hidden"
    | "deprecated"
    | "duplicate_existing"
    | "duplicate_suggestion"
    | "not_in_candidates";
  detail?: string;
};

export type AiTagRecommendationPostprocessResult = {
  suggestions: AiTagRecommendationSuggestion[];
  ignored: AiTagRecommendationIgnored[];
};

export type ParseAiTagRecommendationJsonResult = {
  suggestions: AiTagRecommendationRawSuggestion[];
  ignored: AiTagRecommendationIgnored[];
  error?: string;
};

export type SuggestTagsFromArticleTextInput = {
  title?: string | null;
  summary?: string | null;
  content?: string | null;
  existingTags?: string[];
};

export type SuggestTagsFromArticleTextOptions = {
  limit?: number;
  includeExistingTags?: boolean;
  userConfig?: UserTagTaxonomyConfig | null;
};

export type BuildAiTagRecommendationCandidatesInput = SuggestTagsFromArticleTextInput & {
  notePath?: string | null;
};

export type BuildAiTagRecommendationCandidatesOptions = {
  limit?: number;
  aliasLimit?: number;
  contentCharLimit?: number;
  userConfig?: UserTagTaxonomyConfig | null;
};

export type UserTagTaxonomyConfig = {
  version?: number;
  entries?: TagTaxonomyEntry[];
  aliases?: Record<string, string>;
  hiddenIds?: string[];
  orderOverrides?: Record<string, number>;
  merges?: Record<string, string>;
  customCollections?: string[];
};

export type TagTaxonomySelfCheckResult = {
  passed: boolean;
  checks: Array<{
    name: string;
    passed: boolean;
    expected: string | number | boolean | null;
    actual: string | number | boolean | null;
  }>;
};

export type TagNormalizationReason =
  | "already_canonical"
  | "alias_to_canonical"
  | "merge_to_target"
  | "alias_to_merged_source"
  | "unknown_freeform"
  | "hidden_no_change"
  | "duplicate_after_normalize";

export type TagNormalizationAnalysis = {
  original: string;
  originalIndex: number;
  originalPathText: string;
  isCanonical: boolean;
  isUnknownFreeform: boolean;
  isAliasMatch: boolean;
  isMergeSource: boolean;
  isAliasToMergedSource: boolean;
  hidden: boolean;
  deprecated: boolean;
  targetCanonicalPath: string | null;
  targetEntryId: string | null;
  targetDisplayName: string | null;
  reason: TagNormalizationReason;
  shouldRewrite: boolean;
  safeToAutoApply: boolean;
  duplicateOfIndex?: number;
};

export type TagNormalizationSuggestion = {
  original: string;
  normalized: string;
  displayName: string;
  pathText: string;
  reason: TagNormalizationReason;
  targetEntryId: string | null;
  safeToAutoApply: boolean;
};

export type TagNormalizationPlan = {
  analyses: TagNormalizationAnalysis[];
  suggestions: TagNormalizationSuggestion[];
  nextTags: string[];
  changed: boolean;
  stats: {
    total: number;
    rewriteCount: number;
    aliasCount: number;
    mergeCount: number;
    aliasToMergedSourceCount: number;
    duplicateCount: number;
    unknownCount: number;
    hiddenSkippedCount: number;
  };
};

type MutableTagTreeNode = {
  name: string;
  fullPath: string;
  depth: number;
  count: number;
  children: MutableTagTreeNode[];
};

type TaggedArticle = {
  relativePath: string;
  tags: string[];
};

export type ResolvedTagTaxonomy = {
  entries: TagTaxonomyEntry[];
  visibleEntries: TagTaxonomyEntry[];
  aliasMap: Map<string, TagTaxonomyEntry>;
  pathMap: Map<string, TagTaxonomyEntry>;
  idMap: Map<string, TagTaxonomyEntry>;
  displayOrder: Map<string, number>;
};

export const tagRootGroups = ["算法", "题型", "训练", "来源", "阶段", "项目", "杂项"] as const;
export const customTagRoot = "自定义标签";
export const tagPathSeparator = "/";

export function getTagNodeOrderKey(path: string[]): string {
  return `path:${path.map((segment) => segment.trim()).filter(Boolean).join(tagPathSeparator)}`;
}

export function createDenseOrderOverrides(
  currentOverrides: Record<string, number> | undefined,
  nextIds: string[],
): Record<string, number> {
  const next = { ...(currentOverrides ?? {}) };
  nextIds.forEach((id, index) => {
    next[id] = index;
  });
  return next;
}

function getTagGroupOrderKey(path: string[], taxonomy: ResolvedTagTaxonomy): string {
  const pathEntry = taxonomy.pathMap.get(normalizeTagAliasKey(getTagPathText(path)));
  return pathEntry?.id ?? getTagNodeOrderKey(path);
}

const algorithmTagGroups = [
  "语言入门",
  "字符串",
  "动态规划 DP",
  "搜索",
  "数学",
  "图论",
  "计算几何",
  "树形数据结构",
  "博弈论",
  "线性数据结构",
  "多项式",
  "数论",
  "基础算法",
  "动态规划优化",
  "树论",
  "群论",
  "组合数学",
  "概率论",
  "线性代数",
  "微积分",
  "其它技巧",
  "组合优化",
] as const;

function tagEntry(id: string, pathText: string, aliases: string[] = []): TagTaxonomyEntry {
  return { id, path: splitTagSegments(pathText), aliases };
}

export const BUILTIN_TAG_TAXONOMY: TagTaxonomyEntry[] = [
  tagEntry("algorithm.group.language", "算法/语言入门"),
  tagEntry("algorithm.group.string", "算法/字符串"),
  tagEntry("algorithm.group.dp", "算法/动态规划 DP"),
  tagEntry("algorithm.group.search", "算法/搜索"),
  tagEntry("algorithm.group.math", "算法/数学"),
  tagEntry("algorithm.group.graph", "算法/图论"),
  tagEntry("algorithm.group.geometry", "算法/计算几何"),
  tagEntry("algorithm.group.tree-data-structure", "算法/树形数据结构"),
  tagEntry("algorithm.group.game-theory", "算法/博弈论"),
  tagEntry("algorithm.group.linear-data-structure", "算法/线性数据结构"),
  tagEntry("algorithm.group.polynomial", "算法/多项式"),
  tagEntry("algorithm.group.number-theory", "算法/数论"),
  tagEntry("algorithm.group.basic", "算法/基础算法"),
  tagEntry("algorithm.group.dp-optimization", "算法/动态规划优化"),
  tagEntry("algorithm.group.tree", "算法/树论"),
  tagEntry("algorithm.group.group-theory", "算法/群论"),
  tagEntry("algorithm.group.combinatorics", "算法/组合数学"),
  tagEntry("algorithm.group.probability", "算法/概率论"),
  tagEntry("algorithm.group.linear-algebra", "算法/线性代数"),
  tagEntry("algorithm.group.calculus", "算法/微积分"),
  tagEntry("algorithm.group.misc", "算法/其它技巧"),
  tagEntry("algorithm.group.combinatorial-optimization", "算法/组合优化"),

  tagEntry("algorithm.language.language", "算法/语言入门/语言入门", ["语言入门"]),
  tagEntry("algorithm.language.sequence", "算法/语言入门/顺序结构", ["顺序结构"]),
  tagEntry("algorithm.language.branch", "算法/语言入门/分支结构", ["分支结构"]),
  tagEntry("algorithm.language.loop", "算法/语言入门/循环结构", ["循环结构"]),
  tagEntry("algorithm.language.array", "算法/语言入门/数组", ["数组"]),
  tagEntry("algorithm.language.string-intro", "算法/语言入门/字符串（入门）", ["字符串（入门）", "字符串入门"]),
  tagEntry("algorithm.language.struct", "算法/语言入门/结构体", ["结构体"]),
  tagEntry("algorithm.language.function-recursion", "算法/语言入门/函数与递归", ["函数与递归"]),

  tagEntry("algorithm.string.string", "算法/字符串/字符串", ["字符串"]),
  tagEntry("algorithm.string.sam", "算法/字符串/后缀自动机 SAM", ["SAM", "后缀自动机", "后缀自动机 SAM"]),
  tagEntry("algorithm.string.trie", "算法/字符串/字典树 Trie", ["Trie", "字典树", "字典树 Trie"]),
  tagEntry("algorithm.string.aho-corasick", "算法/字符串/AC 自动机", ["AC 自动机", "ACAM", "Aho-Corasick"]),
  tagEntry("algorithm.string.kmp", "算法/字符串/KMP 算法", ["KMP", "KMP 算法", "算法/字符串/KMP"]),
  tagEntry("algorithm.string.suffix-array", "算法/字符串/后缀数组 SA", ["SA", "后缀数组", "后缀数组 SA"]),
  tagEntry("algorithm.string.suffix-tree", "算法/字符串/后缀树", ["后缀树"]),
  tagEntry("algorithm.string.finite-automaton", "算法/字符串/有限状态自动机", ["有限状态自动机"]),
  tagEntry("algorithm.string.pam", "算法/字符串/回文自动机 PAM", ["PAM", "回文自动机", "回文自动机 PAM"]),
  tagEntry("algorithm.string.manacher", "算法/字符串/Manacher 算法", ["Manacher", "Manacher 算法"]),
  tagEntry("algorithm.string.lyndon", "算法/字符串/Lyndon 分解", ["Lyndon", "Lyndon 分解"]),
  tagEntry("algorithm.string.z-function", "算法/字符串/Z 函数", ["Z 函数", "Z Algorithm", "扩展 KMP", "拓展 KMP", "exKMP", "Extended KMP"]),
  tagEntry("algorithm.string.suffix-balanced-tree", "算法/字符串/后缀平衡树", ["后缀平衡树"]),

  tagEntry("algorithm.dp.dp", "算法/动态规划 DP/动态规划 DP", ["DP", "动态规划", "动态规划 DP", "算法/动态规划/DP"]),
  tagEntry("algorithm.dp.knapsack", "算法/动态规划 DP/背包 DP", ["背包", "背包 DP", "算法/动态规划/背包 DP"]),
  tagEntry("algorithm.dp.digit", "算法/动态规划 DP/数位 DP", ["数位 DP"]),
  tagEntry("algorithm.dp.interval", "算法/动态规划 DP/区间 DP", ["区间 DP"]),
  tagEntry("algorithm.dp.tree", "算法/动态规划 DP/树形 DP", ["树形 DP"]),
  tagEntry("algorithm.dp.contour-line", "算法/动态规划 DP/轮廓线 DP", ["轮廓线 DP", "插头 DP"]),
  tagEntry("algorithm.dp.linear", "算法/动态规划 DP/线性 DP", ["线性 DP"]),
  tagEntry("algorithm.dp.state-compression", "算法/动态规划 DP/状压 DP", ["状压 DP"]),

  tagEntry("algorithm.search.search", "算法/搜索/搜索", ["搜索"]),
  tagEntry("algorithm.search.bfs", "算法/搜索/广度优先搜索 BFS", ["BFS", "广度优先搜索"]),
  tagEntry("algorithm.search.dfs", "算法/搜索/深度优先搜索 DFS", ["DFS", "深度优先搜索"]),
  tagEntry("algorithm.search.pruning", "算法/搜索/剪枝", ["剪枝"]),
  tagEntry("algorithm.search.memoized-search", "算法/搜索/记忆化搜索", ["记忆化搜索"]),
  tagEntry("algorithm.search.heuristic-search", "算法/搜索/启发式搜索", ["启发式搜索"]),
  tagEntry("algorithm.search.iterative-deepening", "算法/搜索/迭代加深搜索", ["迭代加深", "迭代加深搜索"]),
  tagEntry("algorithm.search.ida-star", "算法/搜索/启发式迭代加深搜索 IDA*", ["IDA*", "启发式迭代加深搜索", "IDA star"]),
  tagEntry("algorithm.search.dancing-links", "算法/搜索/Dancing Links", ["Dancing Links", "DLX"]),
  tagEntry("algorithm.search.hill-climbing", "算法/搜索/爬山算法 Local search", ["爬山", "爬山算法", "Local search"]),
  tagEntry("algorithm.search.simulated-annealing", "算法/搜索/模拟退火", ["模拟退火"]),
  tagEntry("algorithm.search.random-adjustment", "算法/搜索/随机调整", ["随机调整"]),
  tagEntry("algorithm.search.genetic-algorithm", "算法/搜索/遗传算法", ["遗传算法"]),
  tagEntry("algorithm.search.a-star", "算法/搜索/A* 算法", ["A*", "A* 算法", "A star"]),
  tagEntry("algorithm.search.meet-in-the-middle", "算法/搜索/折半搜索 meet in the middle", ["折半搜索", "meet in the middle", "MITM"]),
  tagEntry("algorithm.search.gradient-descent", "算法/搜索/梯度下降法", ["梯度下降法"]),

  tagEntry("algorithm.math.math", "算法/数学/数学", ["数学"]),
  tagEntry("algorithm.math.information-theory", "算法/数学/信息论", ["信息论"]),
  tagEntry("algorithm.math.lagrange-multiplier", "算法/数学/拉格朗日乘数法", ["拉格朗日乘数法"]),
  tagEntry("algorithm.math.lagrange-interpolation", "算法/数学/拉格朗日插值法", ["拉格朗日插值法"]),
  tagEntry("algorithm.math.root-of-unity-filter", "算法/数学/单位根反演", ["单位根反演"]),

  tagEntry("algorithm.graph.graph", "算法/图论/图论", ["图论"]),
  tagEntry("algorithm.graph.kruskal-reconstruction-tree", "算法/图论/Kruskal 重构树", ["Kruskal 重构树"]),
  tagEntry("algorithm.graph.network-flow", "算法/图论/网络流", ["网络流"]),
  tagEntry("algorithm.graph.modeling", "算法/图论/图论建模", ["图论建模"]),
  tagEntry("algorithm.graph.traversal", "算法/图论/图遍历", ["图遍历"]),
  tagEntry("algorithm.graph.topological-sort", "算法/图论/拓扑排序", ["拓扑排序"]),
  tagEntry("algorithm.graph.shortest-path", "算法/图论/最短路", ["最短路"]),
  tagEntry("algorithm.graph.spanning-tree", "算法/图论/生成树", ["生成树", "最小生成树", "MST"]),
  tagEntry("algorithm.graph.planar-graph", "算法/图论/平面图", ["平面图"]),
  tagEntry("algorithm.graph.minimum-cycle", "算法/图论/最小环", ["最小环"]),
  tagEntry("algorithm.graph.negative-cycle", "算法/图论/负权环", ["负权环"]),
  tagEntry("algorithm.graph.connected-component", "算法/图论/连通块", ["连通块"]),
  tagEntry("algorithm.graph.2-sat", "算法/图论/2-SAT", ["2-SAT"]),
  tagEntry("algorithm.graph.planar-euler-formula", "算法/图论/平面图欧拉公式", ["平面图欧拉公式"]),
  tagEntry("algorithm.graph.scc", "算法/图论/强连通分量", ["强连通分量", "SCC"]),
  tagEntry("algorithm.graph.tarjan", "算法/图论/Tarjan", ["Tarjan"]),
  tagEntry("algorithm.graph.biconnected-component", "算法/图论/双连通分量", ["双连通分量"]),
  tagEntry("algorithm.graph.eulerian-circuit", "算法/图论/欧拉回路", ["欧拉回路"]),
  tagEntry("algorithm.graph.difference-constraints", "算法/图论/差分约束", ["差分约束"]),
  tagEntry("algorithm.graph.cactus", "算法/图论/仙人掌", ["仙人掌"]),
  tagEntry("algorithm.graph.bipartite-graph", "算法/图论/二分图", ["二分图"]),
  tagEntry("algorithm.graph.general-graph-matching", "算法/图论/一般图的最大匹配", ["一般图最大匹配", "一般图的最大匹配", "带花树"]),
  tagEntry("algorithm.graph.bounded-flow", "算法/图论/上下界网络流", ["上下界网络流"]),
  tagEntry("algorithm.graph.minimum-cut", "算法/图论/最小割", ["最小割"]),
  tagEntry("algorithm.graph.min-cost-flow", "算法/图论/费用流", ["费用流", "最小费用最大流", "MCMF"]),
  tagEntry("algorithm.graph.block-cut-tree", "算法/图论/圆方树", ["圆方树"]),
  tagEntry("algorithm.graph.chordal-graph", "算法/图论/弦图", ["弦图"]),
  tagEntry("algorithm.graph.floyd", "算法/图论/Floyd 算法", ["Floyd", "Floyd 算法", "算法/图论/Floyd"]),
  tagEntry("algorithm.graph.generalized-series-parallel-graph", "算法/图论/广义串并联图", ["广义串并联图"]),

  tagEntry("algorithm.geometry.geometry", "算法/计算几何/计算几何", ["计算几何"]),
  tagEntry("algorithm.geometry.3d", "算法/计算几何/三维计算几何", ["三维计算几何"]),
  tagEntry("algorithm.geometry.vector", "算法/计算几何/向量", ["向量"]),
  tagEntry("algorithm.geometry.convex-hull", "算法/计算几何/凸包", ["凸包"]),
  tagEntry("algorithm.geometry.cross-product", "算法/计算几何/叉积", ["叉积"]),
  tagEntry("algorithm.geometry.segment-intersection", "算法/计算几何/线段相交", ["线段相交"]),
  tagEntry("algorithm.geometry.half-plane-intersection", "算法/计算几何/半平面交", ["半平面交"]),
  tagEntry("algorithm.geometry.rotating-calipers", "算法/计算几何/旋转卡壳", ["旋转卡壳"]),
  tagEntry("algorithm.geometry.polar-angle-sort", "算法/计算几何/极角排序", ["极角排序"]),
  tagEntry("algorithm.geometry.plane-geometry", "算法/计算几何/平面几何", ["平面几何"]),
  tagEntry("algorithm.geometry.minkowski-sum", "算法/计算几何/闵可夫斯基和 Minkowski sum", ["闵可夫斯基和", "Minkowski sum", "算法/计算几何/闵可夫斯基和"]),

  tagEntry("algorithm.tree-data-structure.tree-data-structure", "算法/树形数据结构/树形数据结构", ["树形数据结构"]),
  tagEntry("algorithm.data-structure.segment-tree", "算法/树形数据结构/线段树", ["线段树"]),
  tagEntry("algorithm.data-structure.disjoint-set", "算法/树形数据结构/并查集", ["并查集", "DSU", "Union-Find"]),
  tagEntry("algorithm.data-structure.balanced-tree", "算法/树形数据结构/平衡树", ["平衡树"]),
  tagEntry("algorithm.data-structure.heap", "算法/树形数据结构/堆", ["堆"]),
  tagEntry("algorithm.data-structure.binary-indexed-tree", "算法/树形数据结构/树状数组", ["树状数组", "BIT", "Fenwick Tree"]),
  tagEntry("algorithm.data-structure.cdq-divide-and-conquer", "算法/树形数据结构/cdq 分治", ["cdq 分治", "CDQ 分治"]),
  tagEntry("algorithm.data-structure.mergeable-heap", "算法/树形数据结构/可并堆", ["可并堆"]),
  tagEntry("algorithm.data-structure.lct", "算法/树形数据结构/动态树 LCT", ["LCT", "动态树", "动态树 LCT", "Link-Cut Tree"]),
  tagEntry("algorithm.data-structure.tree-of-tree", "算法/树形数据结构/树套树", ["树套树"]),
  tagEntry("algorithm.data-structure.persistent-segment-tree", "算法/树形数据结构/可持久化线段树", ["可持久化线段树", "主席树", "算法/数据结构/可持久化线段树"]),
  tagEntry("algorithm.data-structure.persistent-data-structure", "算法/树形数据结构/可持久化", ["可持久化", "可持久化数据结构", "算法/数据结构/可持久化数据结构"]),
  tagEntry("algorithm.data-structure.overall-binary-search", "算法/树形数据结构/整体二分", ["整体二分"]),
  tagEntry("algorithm.data-structure.kd-tree", "算法/树形数据结构/K-D Tree", ["K-D Tree", "KD Tree"]),
  tagEntry("algorithm.data-structure.li-chao-segment-tree", "算法/树形数据结构/李超线段树", ["李超树", "李超线段树", "算法/数据结构/李超线段树"]),
  tagEntry("algorithm.data-structure.segment-tree-beats", "算法/树形数据结构/吉司机线段树 segment tree beats", ["吉司机线段树", "segment tree beats", "Segment Tree Beats", "STB", "算法/数据结构/segment tree beats"]),
  tagEntry("algorithm.data-structure.segment-tree-merge", "算法/树形数据结构/线段树合并", ["线段树合并"]),
  tagEntry("algorithm.data-structure.cat-tree", "算法/树形数据结构/二区间合并（猫树分治）", ["猫树", "猫树分治", "二区间合并", "算法/数据结构/猫树分治"]),
  tagEntry("algorithm.data-structure.ktt", "算法/树形数据结构/KTT / Kinetic Tournament Tree", ["KTT", "Kinetic Tournament Tree", "算法/数据结构/KTT"]),

  tagEntry("algorithm.game-theory.game-theory", "算法/博弈论/博弈论", ["博弈论"]),
  tagEntry("algorithm.game-theory.game-tree", "算法/博弈论/博弈树", ["博弈树"]),
  tagEntry("algorithm.game-theory.nim", "算法/博弈论/Nim 积", ["Nim", "Nim 积"]),
  tagEntry("algorithm.game-theory.sg-function", "算法/博弈论/SG 函数", ["SG 函数"]),

  tagEntry("algorithm.linear-data-structure.linear-data-structure", "算法/线性数据结构/线性数据结构", ["线性数据结构"]),
  tagEntry("algorithm.data-structure.monotone-queue", "算法/线性数据结构/单调队列", ["单调队列"]),
  tagEntry("algorithm.data-structure.odt", "算法/线性数据结构/颜色段均摊（珂朵莉树 ODT）", ["ODT", "珂朵莉树", "颜色段均摊", "珂朵莉树 ODT", "算法/数据结构/珂朵莉树 ODT"]),
  tagEntry("algorithm.basic.prefix-sum", "算法/线性数据结构/前缀和", ["前缀和", "算法/基础算法/前缀和"]),
  tagEntry("algorithm.data-structure.stack", "算法/线性数据结构/栈", ["栈"]),
  tagEntry("algorithm.data-structure.queue", "算法/线性数据结构/队列", ["队列"]),
  tagEntry("algorithm.data-structure.block", "算法/线性数据结构/分块", ["分块"]),
  tagEntry("algorithm.data-structure.sparse-table", "算法/线性数据结构/ST 表", ["ST 表"]),
  tagEntry("algorithm.basic.difference", "算法/线性数据结构/差分", ["差分", "算法/基础算法/差分"]),
  tagEntry("algorithm.data-structure.linked-list", "算法/线性数据结构/链表", ["链表"]),
  tagEntry("algorithm.data-structure.monotone-stack", "算法/线性数据结构/单调栈", ["单调栈"]),
  tagEntry("algorithm.data-structure.hash-table", "算法/线性数据结构/哈希表", ["哈希表"]),

  tagEntry("algorithm.polynomial.polynomial", "算法/多项式/多项式", ["多项式"]),
  tagEntry("algorithm.polynomial.fft", "算法/多项式/快速傅里叶变换 FFT", ["FFT", "快速傅里叶变换", "算法/多项式/FFT"]),
  tagEntry("algorithm.polynomial.ntt", "算法/多项式/快速数论变换 NTT", ["NTT", "快速数论变换", "算法/多项式/NTT"]),
  tagEntry("algorithm.polynomial.fwt", "算法/多项式/快速沃尔什变换 FWT", ["FWT", "快速沃尔什变换", "算法/多项式/FWT"]),
  tagEntry("algorithm.polynomial.fmt", "算法/多项式/快速莫比乌斯变换 FMT", ["FMT", "快速莫比乌斯变换", "算法/多项式/FMT"]),
  tagEntry("algorithm.polynomial.berlekamp-massey", "算法/多项式/Berlekamp-Massey(BM) 算法", ["BM", "Berlekamp-Massey", "Berlekamp-Massey(BM) 算法", "算法/多项式/Berlekamp-Massey"]),
  tagEntry("algorithm.polynomial.set-power-series", "算法/多项式/集合幂级数", ["集合幂级数"]),
  tagEntry("algorithm.polynomial.subset-convolution", "算法/多项式/子集卷积", ["子集卷积", "集合幂级数，子集卷积"]),

  tagEntry("algorithm.number-theory.number-theory", "算法/数论/数论", ["数论", "算法/数学/数论"]),
  tagEntry("algorithm.number-theory.primitive-root", "算法/数论/原根", ["原根"]),
  tagEntry("algorithm.math.prime-test", "算法/数论/素数判断", ["素数", "质数", "素数判断", "算法/数学/素数判断"]),
  tagEntry("algorithm.math.sieve", "算法/数论/筛法", ["筛法", "算法/数学/筛法"]),
  tagEntry("algorithm.math.gcd", "算法/数论/最大公约数 gcd", ["gcd", "最大公约数", "算法/数学/gcd"]),
  tagEntry("algorithm.math.extended-euclidean", "算法/数论/扩展欧几里德算法", ["扩展欧几里德", "扩展欧几里德算法", "exgcd", "算法/数学/扩展欧几里德算法"]),
  tagEntry("algorithm.math.diophantine-equation", "算法/数论/不定方程", ["不定方程"]),
  tagEntry("algorithm.math.base-conversion", "算法/数论/进制", ["进制"]),
  tagEntry("algorithm.math.crt", "算法/数论/中国剩余定理 CRT", ["中国剩余定理", "中国剩余定理 CRT", "CRT", "算法/数学/CRT"]),
  tagEntry("algorithm.math.mobius-inversion", "算法/数论/莫比乌斯反演", ["莫比乌斯反演"]),
  tagEntry("algorithm.math.inverse", "算法/数论/逆元", ["逆元"]),
  tagEntry("algorithm.math.lucas", "算法/数论/Lucas 定理", ["Lucas", "Lucas 定理"]),
  tagEntry("algorithm.math.euclidean-like", "算法/数论/类欧几里得算法", ["类欧几里得", "类欧几里得算法"]),
  tagEntry("algorithm.math.harmonic-series", "算法/数论/调和级数", ["调和级数"]),
  tagEntry("algorithm.math.euler-power-reduction", "算法/数论/欧拉降幂", ["欧拉降幂"]),
  tagEntry("algorithm.math.stern-brocot-tree", "算法/数论/Stern-Brocot 树", ["Stern-Brocot 树"]),
  tagEntry("algorithm.math.divisor-block", "算法/数论/整除分块", ["整除分块"]),
  tagEntry("algorithm.math.dirichlet-convolution", "算法/数论/Dirichlet 卷积", ["Dirichlet 卷积"]),
  tagEntry("algorithm.math.bsgs", "算法/数论/大步小步算法 BSGS", ["BSGS", "大步小步算法", "算法/数学/BSGS"]),
  tagEntry("algorithm.math.quadratic-residue", "算法/数论/二次剩余", ["二次剩余"]),
  tagEntry("algorithm.math.bezout-theorem", "算法/数论/Bézout 定理", ["Bezout 定理", "贝祖定理", "Bézout 定理"]),
  tagEntry("algorithm.math.du-sieve", "算法/数论/杜教筛", ["杜教筛"]),
  tagEntry("algorithm.math.euler-function", "算法/数论/欧拉函数", ["欧拉函数"]),

  tagEntry("algorithm.basic.basic", "算法/基础算法/基础算法", ["基础算法"]),
  tagEntry("algorithm.basic.simulation", "算法/基础算法/模拟", ["模拟"]),
  tagEntry("algorithm.basic.greedy", "算法/基础算法/贪心", ["贪心"]),
  tagEntry("algorithm.basic.recurrence", "算法/基础算法/递推", ["递推"]),
  tagEntry("algorithm.basic.binary-lifting", "算法/基础算法/倍增", ["倍增"]),
  tagEntry("algorithm.basic.binary-search", "算法/基础算法/二分", ["二分"]),
  tagEntry("algorithm.basic.recursion", "算法/基础算法/递归", ["递归"]),
  tagEntry("algorithm.basic.enumeration", "算法/基础算法/枚举", ["枚举"]),
  tagEntry("algorithm.basic.divide-and-conquer", "算法/基础算法/分治", ["分治"]),
  tagEntry("algorithm.basic.sorting", "算法/基础算法/排序", ["排序"]),
  tagEntry("algorithm.basic.stl", "算法/基础算法/STL", ["STL"]),

  tagEntry("algorithm.dp.optimization.optimization", "算法/动态规划优化/动态规划优化", ["动态规划优化"]),
  tagEntry("algorithm.dp.optimization.priority-queue", "算法/动态规划优化/优先队列", ["优先队列"]),
  tagEntry("algorithm.dp.optimization.matrix-acceleration", "算法/动态规划优化/矩阵加速", ["矩阵加速"]),
  tagEntry("algorithm.dp.optimization.slope-optimization", "算法/动态规划优化/斜率优化", ["斜率优化"]),
  tagEntry("algorithm.dp.optimization.state-merge", "算法/动态规划优化/状态合并", ["状态合并"]),
  tagEntry("algorithm.dp.optimization.wqs-binary-search", "算法/动态规划优化/凸完全单调性（wqs 二分）", ["wqs 二分", "凸完全单调性", "算法/动态规划优化/wqs 二分"]),
  tagEntry("algorithm.dp.optimization.quadrangle-inequality", "算法/动态规划优化/四边形不等式", ["四边形不等式"]),
  tagEntry("algorithm.dp.optimization.dp-of-dp", "算法/动态规划优化/DP 套 DP", ["DP 套 DP"]),
  tagEntry("algorithm.dp.optimization.dynamic-dp", "算法/动态规划优化/动态 DP", ["动态 DP"]),
  tagEntry("algorithm.dp.optimization.decision-monotonicity", "算法/动态规划优化/决策单调性", ["决策单调性"]),
  tagEntry("algorithm.dp.optimization.whole-transfer", "算法/动态规划优化/整体转移", ["整体转移"]),
  tagEntry("algorithm.dp.optimization.slope-trick", "算法/动态规划优化/斜率维护技巧 slope trick", ["slope trick", "斜率维护技巧", "算法/动态规划优化/slope trick"]),

  tagEntry("algorithm.tree.tree", "算法/树论/树论", ["树论"]),
  tagEntry("algorithm.tree.centroid-decomposition", "算法/树论/点分治", ["点分治"]),
  tagEntry("algorithm.tree.dsu-on-tree", "算法/树论/树上启发式合并", ["树上启发式合并", "dsu on tree"]),
  tagEntry("algorithm.tree.traversal", "算法/树论/树的遍历", ["树的遍历"]),
  tagEntry("algorithm.tree.lca", "算法/树论/最近公共祖先 LCA", ["LCA", "最近公共祖先", "最近公共祖先 LCA", "算法/树论/LCA"]),
  tagEntry("algorithm.tree.diameter", "算法/树论/树的直径", ["树的直径"]),
  tagEntry("algorithm.tree.hld", "算法/树论/树链剖分", ["树剖", "树链剖分", "HLD"]),
  tagEntry("algorithm.tree.virtual-tree", "算法/树论/虚树", ["虚树"]),
  tagEntry("algorithm.tree.base-cycle-tree", "算法/树论/基环树", ["基环树"]),
  tagEntry("algorithm.tree.dynamic-tree-divide", "算法/树论/动态树分治", ["动态树分治"]),
  tagEntry("algorithm.tree.prufer-sequence", "算法/树论/Prüfer 序列", ["Prüfer 序列", "Prufer 序列"]),
  tagEntry("algorithm.tree.global-balanced-binary-tree", "算法/树论/全局平衡二叉树", ["全局平衡二叉树"]),
  tagEntry("algorithm.tree.centroid", "算法/树论/树的重心", ["树的重心"]),

  tagEntry("algorithm.group-theory.group-theory", "算法/群论/群论", ["群论", "算法/数学/群论"]),
  tagEntry("algorithm.math.permutation", "算法/群论/置换", ["置换", "算法/数学/置换"]),
  tagEntry("algorithm.math.polya", "算法/群论/Pólya 定理", ["Pólya", "Polya 定理", "Pólya 定理", "算法/数学/Pólya 定理"]),

  tagEntry("algorithm.math.combinatorics", "算法/组合数学/组合数学", ["组合数学", "算法/数学/组合数学"]),
  tagEntry("algorithm.math.permutation-combination", "算法/组合数学/排列组合", ["排列组合"]),
  tagEntry("algorithm.math.binomial-theorem", "算法/组合数学/二项式定理", ["二项式定理"]),
  tagEntry("algorithm.math.cantor-expansion", "算法/组合数学/康托展开", ["康托展开"]),
  tagEntry("algorithm.math.pigeonhole-principle", "算法/组合数学/鸽笼原理", ["鸽笼原理"]),
  tagEntry("algorithm.math.inclusion-exclusion", "算法/组合数学/容斥原理", ["容斥原理"]),
  tagEntry("algorithm.math.fibonacci", "算法/组合数学/Fibonacci 数列", ["Fibonacci"]),
  tagEntry("algorithm.math.catalan", "算法/组合数学/Catalan 数", ["Catalan"]),
  tagEntry("algorithm.math.stirling", "算法/组合数学/Stirling 数", ["Stirling"]),
  tagEntry("algorithm.math.generating-function", "算法/组合数学/生成函数", ["生成函数"]),
  tagEntry("algorithm.math.dilworth-theorem", "算法/组合数学/Dilworth 定理", ["Dilworth 定理"]),
  tagEntry("algorithm.math.lagrange-inversion", "算法/组合数学/拉格朗日反演", ["拉格朗日反演"]),
  tagEntry("algorithm.math.young-tableau", "算法/组合数学/杨表", ["杨表"]),

  tagEntry("algorithm.math.probability", "算法/概率论/概率论", ["概率论", "算法/数学/概率论"]),
  tagEntry("algorithm.math.expectation", "算法/概率论/期望", ["期望"]),
  tagEntry("algorithm.math.probability-generating-function", "算法/概率论/概率生成函数", ["概率生成函数"]),
  tagEntry("algorithm.math.markov-chain", "算法/概率论/随机游走 Markov Chain", ["随机游走", "Markov Chain", "马尔可夫链", "算法/数学/Markov Chain"]),
  tagEntry("algorithm.math.optional-stopping-theorem", "算法/概率论/鞅的停时定理", ["鞅的停时定理"]),

  tagEntry("algorithm.math.linear-algebra", "算法/线性代数/线性代数", ["线性代数", "算法/数学/线性代数"]),
  tagEntry("algorithm.math.lgv-lemma", "算法/线性代数/LGV 引理", ["LGV 引理"]),
  tagEntry("algorithm.math.matrix-tree-theorem", "算法/线性代数/矩阵树定理", ["矩阵树定理"]),
  tagEntry("algorithm.math.matrix-operation", "算法/线性代数/矩阵运算", ["矩阵运算"]),
  tagEntry("algorithm.math.matrix-multiplication", "算法/线性代数/矩阵乘法", ["矩阵乘法"]),
  tagEntry("algorithm.math.linear-recurrence", "算法/线性代数/线性递推", ["线性递推"]),
  tagEntry("algorithm.math.gaussian-elimination", "算法/线性代数/高斯消元", ["高斯消元"]),
  tagEntry("algorithm.math.linear-basis", "算法/线性代数/线性基", ["线性基"]),
  tagEntry("algorithm.math.determinant", "算法/线性代数/行列式", ["行列式"]),
  tagEntry("algorithm.math.eigenvalue", "算法/线性代数/特征值", ["特征值"]),

  tagEntry("algorithm.math.calculus", "算法/微积分/微积分", ["微积分", "算法/数学/微积分"]),
  tagEntry("algorithm.math.derivative", "算法/微积分/导数", ["导数"]),
  tagEntry("algorithm.math.integral", "算法/微积分/积分", ["积分"]),
  tagEntry("algorithm.math.definite-integral", "算法/微积分/定积分", ["定积分"]),
  tagEntry("algorithm.math.series", "算法/微积分/级数", ["级数"]),

  tagEntry("algorithm.misc.misc", "算法/其它技巧/其它技巧", ["其它技巧"]),
  tagEntry("algorithm.misc.bruteforce", "算法/其它技巧/暴力", ["暴力"]),
  tagEntry("algorithm.misc.data-structure", "算法/其它技巧/数据结构", ["数据结构", "算法/数据结构/数据结构"]),
  tagEntry("algorithm.misc.high-precision", "算法/其它技巧/高精度", ["高精度"]),
  tagEntry("algorithm.misc.mo-algorithm", "算法/其它技巧/莫队", ["莫队"]),
  tagEntry("algorithm.misc.ternary-search", "算法/其它技巧/三分", ["三分"]),
  tagEntry("algorithm.basic.discretization", "算法/其它技巧/离散化", ["离散化", "算法/基础算法/离散化"]),
  tagEntry("algorithm.misc.huffman-tree", "算法/其它技巧/霍夫曼树", ["霍夫曼树"]),
  tagEntry("algorithm.misc.hashing", "算法/其它技巧/哈希 hashing", ["哈希", "hashing", "hash", "算法/其它技巧/哈希"]),
  tagEntry("algorithm.basic.scanline", "算法/其它技巧/扫描线", ["扫描线", "算法/基础算法/扫描线"]),
  tagEntry("algorithm.misc.randomization", "算法/其它技巧/随机化", ["随机化", "随机调整", "算法/搜索与随机化/随机化"]),
  tagEntry("algorithm.basic.bit-operation", "算法/其它技巧/位运算", ["位运算", "算法/基础算法/位运算"]),
  tagEntry("algorithm.basic.construction", "算法/其它技巧/构造", ["构造", "算法/基础算法/构造"]),
  tagEntry("algorithm.basic.two-pointer", "算法/其它技巧/双指针 two-pointer", ["双指针", "two-pointer", "算法/基础算法/双指针"]),
  tagEntry("algorithm.basic.ad-hoc", "算法/其它技巧/Ad-hoc", ["Ad-hoc", "算法/基础算法/Ad-hoc"]),
  tagEntry("algorithm.misc.cartesian-tree", "算法/其它技巧/笛卡尔树", ["笛卡尔树"]),
  tagEntry("algorithm.misc.sqrt-decomposition", "算法/其它技巧/根号分治", ["根号分治"]),
  tagEntry("algorithm.misc.simulated-cost-flow", "算法/其它技巧/模拟费用流", ["模拟费用流"]),
  tagEntry("algorithm.misc.fractional-cascading", "算法/其它技巧/分散层叠", ["分散层叠"]),
  tagEntry("algorithm.misc.amortized-analysis", "算法/其它技巧/均摊分析", ["均摊分析"]),
  tagEntry("algorithm.misc.case-analysis", "算法/其它技巧/分类讨论", ["分类讨论"]),
  tagEntry("algorithm.misc.approximation", "算法/其它技巧/近似算法", ["近似算法"]),
  tagEntry("algorithm.misc.segment-tree-divide", "算法/其它技巧/线段树分治", ["线段树分治"]),
  tagEntry("algorithm.misc.offline", "算法/其它技巧/离线处理", ["离线处理"]),
  tagEntry("algorithm.misc.bitset", "算法/其它技巧/bitset", ["bitset"]),
  tagEntry("algorithm.misc.heuristic-merge", "算法/其它技巧/启发式合并", ["启发式合并"]),
  tagEntry("algorithm.misc.regret-greedy", "算法/其它技巧/反悔贪心", ["反悔贪心"]),

  tagEntry("algorithm.combinatorial-optimization.combinatorial-optimization", "算法/组合优化/组合优化", ["组合优化"]),
  tagEntry("algorithm.combinatorial-optimization.fractional-programming", "算法/组合优化/分数规划", ["分数规划"]),
  tagEntry("algorithm.combinatorial-optimization.linear-programming", "算法/组合优化/线性规划", ["线性规划"]),
  tagEntry("algorithm.combinatorial-optimization.matroid", "算法/组合优化/拟阵", ["拟阵"]),
  tagEntry("algorithm.combinatorial-optimization.integer-programming", "算法/组合优化/整数规划", ["整数规划"]),
  tagEntry("algorithm.combinatorial-optimization.semidefinite-programming", "算法/组合优化/半正定规划", ["半正定规划"]),
  tagEntry("algorithm.combinatorial-optimization.primal-dual", "算法/组合优化/原始对偶", ["原始对偶"]),
  tagEntry("algorithm.combinatorial-optimization.max-flow-min-cut-theorem", "算法/组合优化/最大流最小割定理", ["最大流最小割定理"]),
  tagEntry("algorithm.combinatorial-optimization.isotonic-regression", "算法/组合优化/保序回归", ["保序回归"]),

  tagEntry("training.record.debug", "训练/记录/调试", ["调试"]),
  tagEntry("training.record.review", "训练/记录/复盘", ["复盘"]),
  tagEntry("training.record.quick-note", "训练/记录/速记", ["速记"]),
  tagEntry("training.record.mistake", "训练/记录/易错", ["易错"]),
  tagEntry("training.record.good-problem", "训练/记录/好题", ["好题"]),
  tagEntry("training.material.template", "训练/材料/模板", ["模板"]),
  tagEntry("training.record.stuck", "训练/记录/卡题", ["卡题"]),
  tagEntry("training.material.summary", "训练/材料/总结", ["总结"]),
  tagEntry("source.platform.luogu", "来源/平台/洛谷", ["洛谷"]),
  tagEntry("source.platform.codeforces", "来源/平台/Codeforces", ["Codeforces", "CF"]),
  tagEntry("source.platform.atcoder", "来源/平台/AtCoder", ["AtCoder"]),
  tagEntry("source.exam.csp", "来源/考试/CSP", ["CSP"]),
  tagEntry("source.exam.noip", "来源/考试/NOIP", ["NOIP"]),
  tagEntry("source.exam.provincial-selection", "来源/考试/省选", ["省选"]),
  tagEntry("source.training.school", "来源/训练/校内训练", ["校内训练"]),
  tagEntry("source.training.mock-contest", "来源/训练/模拟赛", ["模拟赛"]),
  tagEntry("project.oi-notebook.oi-notebook", "项目/OI Notebook/OI Notebook", ["OI Notebook"]),
  tagEntry("project.oi-notebook.notex", "项目/OI Notebook/NoteX", ["NoteX"]),
  tagEntry("project.oi-notebook.local-blog", "项目/OI Notebook/local-blog", ["local-blog"]),
];

export const DEFAULT_TAG_TAXONOMY = BUILTIN_TAG_TAXONOMY;

export function splitTagSegments(tag: string) {
  return tag
    .split(tagPathSeparator)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getTagPathText(segments: string[]) {
  return segments.join(tagPathSeparator);
}

function normalizeTagAliasKey(tag: string) {
  return tag.trim().replace(/\s+/g, " ").toLocaleLowerCase("zh-CN");
}

function normalizeTagSearchKey(tag: string) {
  return normalizeTagAliasKey(tag).replace(/[\s\-_]+/g, "");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeTaxonomyEntry(entry: TagTaxonomyEntry, source: "builtin" | "user", order: number): TagTaxonomyEntry {
  return {
    ...entry,
    aliases: uniqueStrings(entry.aliases ?? []),
    order: entry.order ?? order,
    source: entry.source ?? source,
  };
}

function isPresetTagRoot(name: string): name is (typeof tagRootGroups)[number] {
  return tagRootGroups.includes(name as (typeof tagRootGroups)[number]);
}

function isKnownTagRoot(name: string) {
  return isPresetTagRoot(name) || name === customTagRoot;
}

function indexTagEntries(entries: TagTaxonomyEntry[]) {
  const aliasMap = new Map<string, TagTaxonomyEntry>();
  const pathMap = new Map<string, TagTaxonomyEntry>();
  const idMap = new Map<string, TagTaxonomyEntry>();

  for (const entry of entries) {
    idMap.set(entry.id, entry);
    const pathText = getTagPathText(entry.path);
    pathMap.set(normalizeTagAliasKey(pathText), entry);
    aliasMap.set(normalizeTagAliasKey(pathText), entry);
    aliasMap.set(normalizeTagAliasKey(entry.id), entry);
    aliasMap.set(normalizeTagAliasKey(entry.path[entry.path.length - 1] ?? pathText), entry);

    for (const alias of entry.aliases ?? []) {
      aliasMap.set(normalizeTagAliasKey(alias), entry);
    }
  }

  return { aliasMap, pathMap, idMap };
}

function resolveEntryReference(
  reference: string,
  indexes: Pick<ResolvedTagTaxonomy, "aliasMap" | "pathMap" | "idMap">,
): TagTaxonomyEntry | null {
  const text = reference.trim();
  if (!text) {
    return null;
  }

  const byId = indexes.idMap.get(text);
  if (byId) {
    return byId;
  }

  const key = normalizeTagAliasKey(text);
  return indexes.pathMap.get(key) ?? indexes.aliasMap.get(key) ?? null;
}

export function createResolvedTagTaxonomy(
  entries: TagTaxonomyEntry[] = BUILTIN_TAG_TAXONOMY,
  userConfig: UserTagTaxonomyConfig = {},
): ResolvedTagTaxonomy {
  const entryById = new Map<string, TagTaxonomyEntry>();
  const orderedEntries = [
    ...entries.map((entry, index) => normalizeTaxonomyEntry(entry, "builtin", index)),
    ...(userConfig.entries ?? []).map((entry, index) => normalizeTaxonomyEntry(entry, "user", entries.length + index)),
  ];

  for (const entry of orderedEntries) {
    entryById.set(entry.id, entry);
  }

  const hiddenIds = new Set(userConfig.hiddenIds ?? []);
  let resolvedEntries = Array.from(entryById.values()).map((entry) => {
    const order = userConfig.orderOverrides?.[entry.id] ?? entry.order;
    const mergeTo = userConfig.merges?.[entry.id] ?? entry.mergeTo;

    return {
      ...entry,
      order,
      hidden: entry.hidden || hiddenIds.has(entry.id),
      deprecated: entry.deprecated || Boolean(mergeTo),
      mergeTo,
    };
  });

  let baseIndexes = indexTagEntries(resolvedEntries);
  resolvedEntries = resolvedEntries.map((entry) => {
    if (!entry.mergeTo) {
      return entry;
    }

    const target = resolveEntryReference(entry.mergeTo, baseIndexes);
    return target ? { ...entry, mergeTo: target.id } : entry;
  });

  baseIndexes = indexTagEntries(resolvedEntries);
  const aliasMap = new Map<string, TagTaxonomyEntry>();
  const pathMap = new Map<string, TagTaxonomyEntry>();
  const idMap = new Map<string, TagTaxonomyEntry>();

  const resolveMergeTarget = (entry: TagTaxonomyEntry): TagTaxonomyEntry => {
    const visitedIds = new Set([entry.id]);
    let target = entry;

    while (target.mergeTo) {
      const nextTarget = baseIndexes.idMap.get(target.mergeTo);
      if (!nextTarget || visitedIds.has(nextTarget.id)) {
        return entry;
      }
      visitedIds.add(nextTarget.id);
      target = nextTarget;
    }

    return target;
  };

  for (const entry of resolvedEntries) {
    idMap.set(entry.id, entry);
    const target = resolveMergeTarget(entry);
    const pathText = getTagPathText(entry.path);
    pathMap.set(normalizeTagAliasKey(pathText), target);
    aliasMap.set(normalizeTagAliasKey(pathText), target);
    aliasMap.set(normalizeTagAliasKey(entry.id), target);
    aliasMap.set(normalizeTagAliasKey(entry.path[entry.path.length - 1] ?? pathText), target);

    for (const alias of entry.aliases ?? []) {
      aliasMap.set(normalizeTagAliasKey(alias), target);
    }
  }

  const protectedBuiltinAliasKeys = new Set<string>();
  for (const entry of resolvedEntries.filter((item) => item.source === "builtin")) {
    const target = resolveMergeTarget(entry);
    const pathText = getTagPathText(entry.path);
    const builtinKeys = [
      pathText,
      entry.id,
      entry.path[entry.path.length - 1] ?? pathText,
      ...(entry.aliases ?? []),
    ].map(normalizeTagAliasKey);
    for (const key of builtinKeys) {
      protectedBuiltinAliasKeys.add(key);
      aliasMap.set(key, target);
    }
    pathMap.set(normalizeTagAliasKey(pathText), target);
  }

  for (const [alias, targetReference] of Object.entries(userConfig.aliases ?? {})) {
    const aliasKey = normalizeTagAliasKey(alias);
    if (protectedBuiltinAliasKeys.has(aliasKey)) {
      continue;
    }
    const referencedEntry = resolveEntryReference(targetReference, { aliasMap, pathMap, idMap });
    if (referencedEntry) {
      aliasMap.set(aliasKey, resolveMergeTarget(referencedEntry));
    }
  }

  const visibleEntries = resolvedEntries
    .filter((entry) => !entry.hidden && !entry.deprecated)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || getTagPathText(a.path).localeCompare(getTagPathText(b.path), "zh-CN"));
  const allDisplayEntries = [...resolvedEntries]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || getTagPathText(a.path).localeCompare(getTagPathText(b.path), "zh-CN"));
  const displayOrder = new Map<string, number>();
  allDisplayEntries.forEach((entry, index) => {
    displayOrder.set(entry.id, entry.order ?? index);
  });

  const rootFallbackOrder = new Map<string, number>();
  tagRootGroups.forEach((root, index) => rootFallbackOrder.set(root, index));
  rootFallbackOrder.set(customTagRoot, tagRootGroups.length);

  allDisplayEntries.forEach((entry, index) => {
    const root = entry.path[0];
    if (root) {
      const rootKey = getTagNodeOrderKey([root]);
      if (!displayOrder.has(rootKey)) {
        displayOrder.set(rootKey, userConfig.orderOverrides?.[rootKey] ?? rootFallbackOrder.get(root) ?? entry.order ?? index);
      }
    }

    const group = entry.path[1];
    if (root && group) {
      const groupPath = [root, group];
      const groupPathKey = getTagNodeOrderKey(groupPath);
      const groupEntry = baseIndexes.pathMap.get(normalizeTagAliasKey(getTagPathText(groupPath)));
      const groupOrderKey = groupEntry?.id ?? groupPathKey;
      const groupEntryOrder = groupEntry ? displayOrder.get(groupEntry.id) : undefined;
      const groupOrder =
        userConfig.orderOverrides?.[groupOrderKey]
        ?? userConfig.orderOverrides?.[groupPathKey]
        ?? groupEntryOrder
        ?? entry.order
        ?? index;

      if (!displayOrder.has(groupPathKey)) {
        displayOrder.set(groupPathKey, groupOrder);
      }
      if (groupEntry) {
        displayOrder.set(groupEntry.id, groupOrder);
      }
    }
  });

  return { entries: resolvedEntries, visibleEntries, aliasMap, pathMap, idMap, displayOrder };
}

// Future extension point: merge builtin taxonomy with user overrides from local
// settings, then apply custom order, custom aliases, hidden builtin tags,
// deprecated tags, and mergeTo rules before building indexes.
export function resolveTagTaxonomy(userConfig: UserTagTaxonomyConfig = {}) {
  return createResolvedTagTaxonomy(BUILTIN_TAG_TAXONOMY, userConfig);
}

const resolvedTagTaxonomy = resolveTagTaxonomy();
const userResolvedTagTaxonomyCache = new WeakMap<UserTagTaxonomyConfig, ResolvedTagTaxonomy>();

export const TAG_ALIAS_MAP = resolvedTagTaxonomy.aliasMap;

function getResolvedTagTaxonomy(userConfig?: UserTagTaxonomyConfig | null): ResolvedTagTaxonomy {
  if (!userConfig) {
    return resolvedTagTaxonomy;
  }

  const cached = userResolvedTagTaxonomyCache.get(userConfig);
  if (cached) {
    return cached;
  }

  const resolved = resolveTagTaxonomy(userConfig);
  userResolvedTagTaxonomyCache.set(userConfig, resolved);
  return resolved;
}

export function normalizeTagToTaxonomyPath(tag: string, userConfig?: UserTagTaxonomyConfig | null) {
  const taxonomy = getResolvedTagTaxonomy(userConfig);
  const entry = taxonomy.aliasMap.get(normalizeTagAliasKey(tag));
  return entry ? getTagPathText(entry.path) : null;
}

function findCanonicalEntryForSegments(segments: string[], taxonomy = resolvedTagTaxonomy) {
  const fullPath = getTagPathText(segments);
  const fullPathEntry = taxonomy.pathMap.get(normalizeTagAliasKey(fullPath));
  if (fullPathEntry) {
    return fullPathEntry;
  }

  if (
    segments.length > 1 &&
    taxonomy.entries.some(
      (entry) => entry.path.length > segments.length && segments.every((segment, index) => entry.path[index] === segment),
    )
  ) {
    return null;
  }

  const leaf = segments[segments.length - 1];
  return leaf ? taxonomy.aliasMap.get(normalizeTagAliasKey(leaf)) ?? null : null;
}

export function normalizeTagPath(tag: string, userConfig?: UserTagTaxonomyConfig | null): NormalizedTagPath | null {
  const segments = splitTagSegments(tag);
  if (segments.length === 0) {
    return null;
  }

  const taxonomy = getResolvedTagTaxonomy(userConfig);
  const canonicalEntry = findCanonicalEntryForSegments(segments, taxonomy);
  const normalizedSegments = canonicalEntry
    ? canonicalEntry.path
    : segments.length > 1 || isKnownTagRoot(segments[0])
      ? segments
      : [customTagRoot, ...segments];

  return {
    name: normalizedSegments[normalizedSegments.length - 1],
    fullPath: getTagPathText(normalizedSegments),
    segments: normalizedSegments,
    entryId: canonicalEntry?.id,
  };
}

function findDirectTaxonomyEntryByReference(reference: string, taxonomy: ResolvedTagTaxonomy): TagTaxonomyEntry | null {
  const text = reference.trim();
  if (!text) {
    return null;
  }

  const key = normalizeTagAliasKey(text);
  const byId = taxonomy.idMap.get(text) ?? taxonomy.entries.find((entry) => normalizeTagAliasKey(entry.id) === key);
  if (byId) {
    return byId;
  }

  const byPath = taxonomy.entries.find((entry) => normalizeTagAliasKey(getTagPathText(entry.path)) === key);
  if (byPath) {
    return byPath;
  }

  const byName = taxonomy.entries.find((entry) => normalizeTagAliasKey(entry.path[entry.path.length - 1] ?? getTagPathText(entry.path)) === key);
  if (byName) {
    return byName;
  }

  return taxonomy.entries.find((entry) => (entry.aliases ?? []).some((alias) => normalizeTagAliasKey(alias) === key)) ?? null;
}

function findUserAliasSourceEntry(
  tag: string,
  userConfig: UserTagTaxonomyConfig | null | undefined,
  taxonomy: ResolvedTagTaxonomy,
): TagTaxonomyEntry | null {
  const key = normalizeTagAliasKey(tag);

  for (const [alias, targetReference] of Object.entries(userConfig?.aliases ?? {})) {
    if (normalizeTagAliasKey(alias) !== key) {
      continue;
    }

    return findDirectTaxonomyEntryByReference(targetReference, taxonomy);
  }

  return null;
}

function getTagNormalizationIdentity(analysis: TagNormalizationAnalysis) {
  if (analysis.targetEntryId) {
    return `entry:${analysis.targetEntryId}`;
  }
  return `text:${normalizeTagAliasKey(analysis.original)}`;
}

function createTagNormalizationSuggestion(analysis: TagNormalizationAnalysis): TagNormalizationSuggestion {
  const normalized = analysis.targetCanonicalPath ?? analysis.original;
  return {
    original: analysis.original,
    normalized,
    displayName: analysis.targetDisplayName ?? normalized,
    pathText: normalized,
    reason: analysis.reason,
    targetEntryId: analysis.targetEntryId,
    safeToAutoApply: analysis.safeToAutoApply,
  };
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function analyzeSingleTagNormalization(
  tag: string,
  options: { userConfig?: UserTagTaxonomyConfig | null; index?: number } = {},
): TagNormalizationAnalysis {
  const original = tag.trim();
  const originalSegments = splitTagSegments(original);
  const originalPathText = getTagPathText(originalSegments);
  const taxonomy = getResolvedTagTaxonomy(options.userConfig);
  const userAliasSourceEntry = findUserAliasSourceEntry(original, options.userConfig, taxonomy);
  const sourceEntry = userAliasSourceEntry ?? findDirectTaxonomyEntryByReference(original, taxonomy);
  const normalized = normalizeTagPath(original, options.userConfig);
  const targetEntry = normalized?.entryId ? taxonomy.idMap.get(normalized.entryId) ?? null : null;
  const targetCanonicalPath = targetEntry ? getTagPathText(targetEntry.path) : null;
  const targetDisplayName = targetEntry ? targetEntry.path[targetEntry.path.length - 1] ?? targetCanonicalPath : null;
  const sourcePathText = sourceEntry ? getTagPathText(sourceEntry.path) : null;
  const sourceName = sourceEntry ? sourceEntry.path[sourceEntry.path.length - 1] ?? sourcePathText : null;
  const originalKey = normalizeTagAliasKey(original);
  const isDirectCanonicalPath = Boolean(sourcePathText && normalizeTagAliasKey(sourcePathText) === normalizeTagAliasKey(originalPathText));
  const isDirectId = Boolean(sourceEntry && normalizeTagAliasKey(sourceEntry.id) === originalKey);
  const isDirectName = Boolean(sourceName && normalizeTagAliasKey(sourceName) === originalKey);
  const isEntryAlias = Boolean(sourceEntry?.aliases?.some((alias) => normalizeTagAliasKey(alias) === originalKey));
  const isAliasMatch = Boolean(userAliasSourceEntry || isEntryAlias || (!isDirectCanonicalPath && !isDirectId && !isDirectName && targetEntry));
  const isMergeSource = Boolean(sourceEntry?.mergeTo && targetEntry && sourceEntry.id !== targetEntry.id);
  const isAliasToMergedSource = Boolean(userAliasSourceEntry?.mergeTo && targetEntry && userAliasSourceEntry.id !== targetEntry.id);
  const isCanonical = Boolean(targetEntry && targetCanonicalPath === originalPathText && !isMergeSource);
  const hidden = Boolean(sourceEntry?.hidden ?? targetEntry?.hidden);
  const deprecated = Boolean(sourceEntry?.deprecated || sourceEntry?.mergeTo);
  const shouldRewrite = Boolean(targetEntry && targetCanonicalPath && targetCanonicalPath !== originalPathText);

  let reason: TagNormalizationReason = "unknown_freeform";
  if (!targetEntry) {
    reason = "unknown_freeform";
  } else if (isAliasToMergedSource) {
    reason = "alias_to_merged_source";
  } else if (isMergeSource) {
    reason = "merge_to_target";
  } else if (shouldRewrite || isAliasMatch) {
    reason = "alias_to_canonical";
  } else if (hidden) {
    reason = "hidden_no_change";
  } else {
    reason = "already_canonical";
  }

  return {
    original,
    originalIndex: options.index ?? 0,
    originalPathText,
    isCanonical,
    isUnknownFreeform: !targetEntry,
    isAliasMatch,
    isMergeSource,
    isAliasToMergedSource,
    hidden,
    deprecated,
    targetCanonicalPath,
    targetEntryId: targetEntry?.id ?? null,
    targetDisplayName,
    reason,
    shouldRewrite,
    safeToAutoApply: shouldRewrite,
  };
}

export function analyzeTagListNormalization(
  tags: string[],
  options: { userConfig?: UserTagTaxonomyConfig | null } = {},
): TagNormalizationPlan {
  const analyses = tags
    .map((tag, index) => analyzeSingleTagNormalization(tag, { userConfig: options.userConfig, index }))
    .filter((analysis) => analysis.original.length > 0);
  const nextTags: string[] = [];
  const seen = new Map<string, number>();
  const finalAnalyses = analyses.map((analysis) => ({ ...analysis }));

  for (const analysis of finalAnalyses) {
    const identity = getTagNormalizationIdentity(analysis);
    const duplicateOfIndex = analysis.targetEntryId ? seen.get(identity) : undefined;

    if (duplicateOfIndex !== undefined) {
      analysis.reason = "duplicate_after_normalize";
      analysis.shouldRewrite = true;
      analysis.safeToAutoApply = true;
      analysis.duplicateOfIndex = duplicateOfIndex;
      continue;
    }

    seen.set(identity, analysis.originalIndex);
    nextTags.push(analysis.shouldRewrite && analysis.targetCanonicalPath ? analysis.targetCanonicalPath : analysis.original);
  }

  const suggestions = finalAnalyses
    .filter((analysis) => analysis.safeToAutoApply && analysis.shouldRewrite)
    .map(createTagNormalizationSuggestion);
  const stats = finalAnalyses.reduce<TagNormalizationPlan["stats"]>((current, analysis) => {
    if (analysis.reason === "alias_to_canonical" && analysis.shouldRewrite) {
      current.aliasCount += 1;
    }
    if (analysis.reason === "merge_to_target") {
      current.mergeCount += 1;
    }
    if (analysis.reason === "alias_to_merged_source") {
      current.aliasToMergedSourceCount += 1;
    }
    if (analysis.reason === "duplicate_after_normalize") {
      current.duplicateCount += 1;
    }
    if (analysis.reason === "unknown_freeform") {
      current.unknownCount += 1;
    }
    if (analysis.reason === "hidden_no_change") {
      current.hiddenSkippedCount += 1;
    }
    if (analysis.shouldRewrite && analysis.reason !== "duplicate_after_normalize") {
      current.rewriteCount += 1;
    }
    return current;
  }, {
    total: finalAnalyses.length,
    rewriteCount: 0,
    aliasCount: 0,
    mergeCount: 0,
    aliasToMergedSourceCount: 0,
    duplicateCount: 0,
    unknownCount: 0,
    hiddenSkippedCount: 0,
  });

  return {
    analyses: finalAnalyses,
    suggestions,
    nextTags,
    changed: !areStringArraysEqual(tags.map((tag) => tag.trim()).filter(Boolean), nextTags),
    stats,
  };
}

export function buildTagNormalizationPreview(
  tags: string[],
  options: { userConfig?: UserTagTaxonomyConfig | null } = {},
): TagNormalizationPlan {
  return analyzeTagListNormalization(tags, options);
}

export function applyTagNormalizationPlan(tags: string[], plan: TagNormalizationPlan): string[] {
  const currentTags = tags.map((tag) => tag.trim()).filter(Boolean);
  return plan.changed ? plan.nextTags : currentTags;
}

export function getTagNormalizationSuggestions(
  tags: string[],
  options: { userConfig?: UserTagTaxonomyConfig | null } = {},
): TagNormalizationSuggestion[] {
  return analyzeTagListNormalization(tags, options).suggestions;
}

export function getTagPathPrefixes(segments: string[]) {
  return segments.map((_, index) => getTagPathText(segments.slice(0, index + 1)));
}

function getTagRootOrder(name: string) {
  const presetIndex = tagRootGroups.findIndex((group) => group === name);
  if (presetIndex !== -1) {
    return presetIndex;
  }

  if (name === customTagRoot) {
    return tagRootGroups.length;
  }

  return tagRootGroups.length + 1;
}

function getAlgorithmTagGroupOrder(name: string) {
  const index = algorithmTagGroups.findIndex((group) => group === name);
  return index === -1 ? algorithmTagGroups.length : index;
}

export function compareTagTreeNodes(a: MutableTagTreeNode | TagTreeNode, b: MutableTagTreeNode | TagTreeNode) {
  if (a.depth === 1 && b.depth === 1) {
    const rootOrder = getTagRootOrder(a.name) - getTagRootOrder(b.name);
    if (rootOrder !== 0) {
      return rootOrder;
    }
  }

  if (a.depth === 2 && b.depth === 2 && a.fullPath.startsWith("算法/") && b.fullPath.startsWith("算法/")) {
    const groupOrder = getAlgorithmTagGroupOrder(a.name) - getAlgorithmTagGroupOrder(b.name);
    if (groupOrder !== 0) {
      return groupOrder;
    }
  }

  return b.count - a.count || a.name.localeCompare(b.name, "zh-CN");
}

function ensureTagTreeNode(nodeLookup: Map<string, MutableTagTreeNode>, rootNodes: MutableTagTreeNode[], segments: string[]) {
  let parent: MutableTagTreeNode | null = null;
  let fullPath = "";

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    fullPath = index === 0 ? segment : `${fullPath}${tagPathSeparator}${segment}`;
    let node = nodeLookup.get(fullPath);

    if (!node) {
      node = {
        name: segment,
        fullPath,
        depth: index + 1,
        count: 0,
        children: [],
      };
      nodeLookup.set(fullPath, node);

      if (parent) {
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    parent = node;
  }
}

function freezeTagTreeNode(node: MutableTagTreeNode): TagTreeNode {
  return {
    name: node.name,
    fullPath: node.fullPath,
    depth: node.depth,
    count: node.count,
    children: node.children.sort(compareTagTreeNodes).map(freezeTagTreeNode),
  };
}

export function buildTagTree(notes: TaggedArticle[]): TagTreeNode[] {
  const rootNodes: MutableTagTreeNode[] = [];
  const nodeLookup = new Map<string, MutableTagTreeNode>();
  const pathNotes = new Map<string, Set<string>>();

  for (const note of notes) {
    const notePaths = new Set<string>();

    for (const tag of note.tags) {
      const normalized = normalizeTagPath(tag);
      if (!normalized) {
        continue;
      }

      ensureTagTreeNode(nodeLookup, rootNodes, normalized.segments);
      for (const path of getTagPathPrefixes(normalized.segments)) {
        notePaths.add(path);
      }
    }

    for (const path of notePaths) {
      const notesForPath = pathNotes.get(path) ?? new Set<string>();
      notesForPath.add(note.relativePath);
      pathNotes.set(path, notesForPath);
    }
  }

  for (const [path, node] of nodeLookup) {
    node.count = pathNotes.get(path)?.size ?? 0;
  }

  return rootNodes.sort(compareTagTreeNodes).map(freezeTagTreeNode);
}

export function findTagTreeNode(nodes: TagTreeNode[], tag: string): TagTreeNode | null {
  const normalized = normalizeTagPath(tag);
  if (!normalized) {
    return null;
  }

  for (const node of nodes) {
    if (node.fullPath === normalized.fullPath) {
      return node;
    }

    const child = findTagTreeNode(node.children, normalized.fullPath);
    if (child) {
      return child;
    }
  }

  return null;
}

export function getTagPathSegments(tag: string) {
  return normalizeTagPath(tag)?.segments ?? splitTagSegments(tag);
}

export function flattenTagTree(nodes: TagTreeNode[]) {
  const items: Array<{ name: string; count: number }> = [];

  function visit(node: TagTreeNode) {
    items.push({ name: node.fullPath, count: node.count });
    for (const child of node.children) {
      visit(child);
    }
  }

  for (const node of nodes) {
    visit(node);
  }

  return items;
}

export function matchArticleByTagPath(note: TaggedArticle, targetTag: string, includeDescendants = true) {
  if (note.tags.includes(targetTag)) {
    return true;
  }

  const normalizedTarget = normalizeTagPath(targetTag);
  if (!normalizedTarget) {
    return false;
  }

  return note.tags.some((tag) => {
    const normalized = normalizeTagPath(tag);
    return (
      normalized?.fullPath === normalizedTarget.fullPath ||
      (includeDescendants && normalized?.fullPath.startsWith(`${normalizedTarget.fullPath}${tagPathSeparator}`))
    );
  });
}

export function getArticleTagSearchTerms(note: TaggedArticle) {
  const terms = new Set(note.tags);

  for (const tag of note.tags) {
    const normalized = normalizeTagPath(tag);
    if (!normalized) {
      continue;
    }

    terms.add(normalized.fullPath);
    if (normalized.entryId) {
      terms.add(normalized.entryId);
    }
    for (const segment of normalized.segments) {
      terms.add(segment);
    }
  }

  return Array.from(terms);
}

export function getTagSuggestionList(
  userConfig?: UserTagTaxonomyConfig | null,
  options: GetTagSuggestionListOptions = {},
): TagSuggestion[] {
  const taxonomy = getResolvedTagTaxonomy(userConfig);
  const seen = new Set<string>();

  return taxonomy.entries.flatMap((entry) => {
    if (!options.includeHidden && entry.hidden) {
      return [];
    }
    if (!options.includeDeprecated && entry.deprecated) {
      return [];
    }
    if (seen.has(entry.id)) {
      return [];
    }
    seen.add(entry.id);

    const pathText = getTagPathText(entry.path);
    const name = entry.path[entry.path.length - 1] ?? pathText;
    const aliases = uniqueStrings([
      ...(entry.aliases ?? []),
      ...getUserAliasesForEntry(entry, userConfig, taxonomy),
      ...getMergeSourceAliasesForEntry(entry, taxonomy),
    ]);

    return [{
      id: entry.id,
      path: entry.path,
      pathText,
      name,
      aliases,
      searchText: [entry.id, pathText, name, ...aliases].join(" "),
      source: entry.source ?? "builtin",
      hidden: Boolean(entry.hidden),
      deprecated: Boolean(entry.deprecated),
    }];
  }).sort((a, b) => compareTagSuggestions(a, b, taxonomy));
}

function getUserAliasesForEntry(
  entry: TagTaxonomyEntry,
  userConfig: UserTagTaxonomyConfig | null | undefined,
  taxonomy: Pick<ResolvedTagTaxonomy, "aliasMap" | "pathMap" | "idMap">,
): string[] {
  const aliases: string[] = [];

  for (const [alias, targetReference] of Object.entries(userConfig?.aliases ?? {})) {
    const trimmedAlias = alias.trim();

    if (!trimmedAlias) {
      continue;
    }

    const target = taxonomy.aliasMap.get(normalizeTagAliasKey(targetReference)) ?? resolveEntryReference(targetReference, taxonomy);
    const effectiveTarget = taxonomy.aliasMap.get(normalizeTagAliasKey(trimmedAlias));

    if (target?.id === entry.id && effectiveTarget?.id === entry.id) {
      aliases.push(trimmedAlias);
    }
  }

  return uniqueStrings(aliases);
}

function getMergeSourceAliasesForEntry(
  entry: TagTaxonomyEntry,
  taxonomy: ResolvedTagTaxonomy,
): string[] {
  const aliases: string[] = [];

  for (const source of taxonomy.entries) {
    if (!source.mergeTo || source.id === entry.id) {
      continue;
    }
    const effectiveTarget = taxonomy.aliasMap.get(normalizeTagAliasKey(source.id));
    if (effectiveTarget?.id !== entry.id) {
      continue;
    }
    aliases.push(
      source.path[source.path.length - 1] ?? "",
      getTagPathText(source.path),
      ...(source.aliases ?? []),
    );
  }

  return uniqueStrings(aliases);
}

export function getTagSuggestionRootGroups(
  userConfig?: UserTagTaxonomyConfig | null,
  options: GetTagSuggestionListOptions = {},
): TagSuggestionRootGroup[] {
  const taxonomy = getResolvedTagTaxonomy(userConfig);
  const suggestions = getTagSuggestionList(userConfig, options);
  const rootMap = new Map<string, TagSuggestionRootGroup>();

  for (const suggestion of suggestions) {
    const root = suggestion.path[0] ?? customTagRoot;
    const rootPath = [root];
    const rootPathText = getTagPathText(rootPath);
    const rootOrderKey = getTagNodeOrderKey(rootPath);
    let rootGroup = rootMap.get(rootPathText);
    if (!rootGroup) {
      rootGroup = {
        root,
        name: root,
        path: rootPath,
        pathText: rootPathText,
        orderKey: rootOrderKey,
        groups: [],
      };
      rootMap.set(rootPathText, rootGroup);
    }

    const groupName = suggestion.path[1] ?? suggestion.name;
    const groupPath = suggestion.path.slice(0, Math.min(2, suggestion.path.length));
    const groupPathText = getTagPathText(groupPath);
    let group = rootGroup.groups.find((item) => item.pathText === groupPathText);
    if (!group) {
      const groupEntry = taxonomy.pathMap.get(normalizeTagAliasKey(groupPathText));
      const orderKey = getTagGroupOrderKey(groupPath, taxonomy);
      group = {
        name: groupName,
        path: groupPath,
        pathText: groupPathText,
        id: groupEntry?.id,
        entryId: groupEntry?.id,
        orderKey,
        candidates: [],
      };
      rootGroup.groups.push(group);
    }

    group.candidates.push(suggestion);
  }

  return Array.from(rootMap.values())
    .map((rootGroup) => ({
      ...rootGroup,
      groups: rootGroup.groups
        .map((group) => ({
          ...group,
          candidates: group.candidates.sort((a, b) => compareTagSuggestions(a, b, taxonomy)),
        }))
        .sort((a, b) => getPathOrder(a.path, taxonomy) - getPathOrder(b.path, taxonomy) || a.pathText.localeCompare(b.pathText, "zh-CN")),
    }))
    .sort((a, b) => getPathOrder(a.path, taxonomy) - getPathOrder(b.path, taxonomy) || a.pathText.localeCompare(b.pathText, "zh-CN"));
}

function getPathOrder(path: string[], taxonomy: ResolvedTagTaxonomy): number {
  if (path.length === 0) return Number.MAX_SAFE_INTEGER;
  const pathText = getTagPathText(path);
  const pathEntry = taxonomy.pathMap.get(normalizeTagAliasKey(pathText));
  if (pathEntry) {
    const entryOrder = taxonomy.displayOrder.get(pathEntry.id);
    if (entryOrder !== undefined) return entryOrder;
  }
  return taxonomy.displayOrder.get(getTagNodeOrderKey(path)) ?? Number.MAX_SAFE_INTEGER;
}

function compareTagSuggestions(a: TagSuggestion, b: TagSuggestion, taxonomy = resolvedTagTaxonomy) {
  const rootOrderA = getPathOrder(a.path.slice(0, 1), taxonomy);
  const rootOrderB = getPathOrder(b.path.slice(0, 1), taxonomy);
  if (rootOrderA !== rootOrderB) return rootOrderA - rootOrderB;

  const groupOrderA = getPathOrder(a.path.slice(0, 2), taxonomy);
  const groupOrderB = getPathOrder(b.path.slice(0, 2), taxonomy);
  if (groupOrderA !== groupOrderB) return groupOrderA - groupOrderB;

  const orderA = taxonomy.displayOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
  const orderB = taxonomy.displayOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
  return orderA - orderB || a.pathText.localeCompare(b.pathText, "zh-CN");
}

function getSuggestionPieces(suggestion: TagSuggestion) {
  return [suggestion.id, suggestion.pathText, suggestion.name, ...suggestion.aliases].filter(Boolean);
}

function getSuggestionMatchScore(suggestion: TagSuggestion, query: string) {
  const normalizedQuery = normalizeTagAliasKey(query);
  const compactQuery = normalizeTagSearchKey(query);
  if (!normalizedQuery || !compactQuery) {
    return 0;
  }

  const pieces = getSuggestionPieces(suggestion);
  let score = 0;

  for (const piece of pieces) {
    const normalizedPiece = normalizeTagAliasKey(piece);
    const compactPiece = normalizeTagSearchKey(piece);

    if (normalizedPiece === normalizedQuery) {
      score = Math.max(score, 100);
    } else if (compactPiece === compactQuery) {
      score = Math.max(score, 95);
    } else if (normalizedPiece.startsWith(normalizedQuery) || compactPiece.startsWith(compactQuery)) {
      score = Math.max(score, 76);
    } else if (normalizedPiece.includes(normalizedQuery) || compactPiece.includes(compactQuery)) {
      score = Math.max(score, 58);
    }
  }

  const normalizedSearchText = normalizeTagAliasKey(suggestion.searchText);
  const compactSearchText = normalizeTagSearchKey(suggestion.searchText);
  if (normalizedSearchText.includes(normalizedQuery) || compactSearchText.includes(compactQuery)) {
    score = Math.max(score, 44);
  }

  return suggestion.deprecated ? Math.max(score - 20, 0) : score;
}

export function createTagCompletionContext(userConfig?: UserTagTaxonomyConfig | null): TagCompletionContext {
  const taxonomy = getResolvedTagTaxonomy(userConfig);
  const flat = getTagSuggestionList(userConfig)
    .filter((item) => !item.hidden)
    .sort((a, b) => compareTagSuggestions(a, b, taxonomy));
  const aliases: Record<string, string> = {};
  const groupLookup = new Map<string, TagCompletionGroup>();

  for (const suggestion of flat) {
    aliases[normalizeTagAliasKey(suggestion.pathText)] = suggestion.pathText;
    aliases[normalizeTagAliasKey(suggestion.name)] = suggestion.pathText;
    for (const alias of suggestion.aliases) {
      aliases[normalizeTagAliasKey(alias)] = suggestion.pathText;
    }

    const root = suggestion.path[0] ?? suggestion.name;
    const rootPath = root;
    let group = groupLookup.get(rootPath);
    if (!group) {
      group = {
        name: root,
        path: [root],
        pathText: rootPath,
        groups: [],
        candidates: [],
      };
      groupLookup.set(rootPath, group);
    }

    const subgroupName = suggestion.path[1] ?? suggestion.name;
    const subgroupPath = suggestion.path.slice(0, Math.min(2, suggestion.path.length));
    const subgroupPathText = getTagPathText(subgroupPath);
    let subgroup = group.groups.find((item) => item.pathText === subgroupPathText);
    if (!subgroup) {
      subgroup = {
        name: subgroupName,
        path: subgroupPath,
        pathText: subgroupPathText,
        candidates: [],
      };
      group.groups.push(subgroup);
    }

    subgroup.candidates.push(suggestion);
    group.candidates.push(suggestion);
  }

  const groups = Array.from(groupLookup.values()).map((group) => ({
    ...group,
    groups: group.groups.map((subgroup) => ({
      ...subgroup,
      candidates: subgroup.candidates.sort((a, b) => compareTagSuggestions(a, b, taxonomy)),
    })),
    candidates: group.candidates.sort((a, b) => compareTagSuggestions(a, b, taxonomy)),
  }));

  return {
    version: "builtin-v1",
    groups,
    flat,
    aliases,
  };
}

export function findTagSuggestionsByQuery(query: string, options: FindTagSuggestionsOptions = {}) {
  const limit = options.limit ?? 10;
  const taxonomy = getResolvedTagTaxonomy(options.userConfig);
  const scored = getTagSuggestionList(options.userConfig, {
    includeHidden: options.includeHidden,
    includeDeprecated: options.includeDeprecated,
  })
    .map((suggestion) => ({ suggestion, score: getSuggestionMatchScore(suggestion, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || compareTagSuggestions(a.suggestion, b.suggestion, taxonomy));
  const seen = new Set<string>();
  const results: TagSuggestion[] = [];

  for (const item of scored) {
    if (seen.has(item.suggestion.id)) {
      continue;
    }
    seen.add(item.suggestion.id);
    results.push(item.suggestion);
    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

function getArticleTextParts(input: SuggestTagsFromArticleTextInput) {
  return [
    ["标题", input.title ?? ""] as const,
    ["摘要", input.summary ?? ""] as const,
    ["正文", input.content ?? ""] as const,
  ].filter(([, text]) => text.trim());
}

function getArticleTextMatchScore(suggestion: TagSuggestion, label: string, text: string) {
  const normalizedText = normalizeTagAliasKey(text);
  const compactText = normalizeTagSearchKey(text);
  let score = 0;
  const reasons: string[] = [];

  for (const piece of [suggestion.name, ...suggestion.aliases]) {
    const normalizedPiece = normalizeTagAliasKey(piece);
    const compactPiece = normalizeTagSearchKey(piece);
    if (!normalizedPiece || !compactPiece) {
      continue;
    }

    if (normalizedText.includes(normalizedPiece) || compactText.includes(compactPiece)) {
      const pieceScore = label === "标题" ? 42 : label === "摘要" ? 34 : 26;
      score = Math.max(score, pieceScore + Math.min(piece.length, 12));
      reasons.push(`${label}命中 ${piece}`);
    }
  }

  return { score, reasons };
}

export function suggestTagsFromArticleText(
  input: SuggestTagsFromArticleTextInput,
  options: SuggestTagsFromArticleTextOptions = {},
): ArticleTagSuggestion[] {
  const limit = options.limit ?? 8;
  const taxonomy = getResolvedTagTaxonomy(options.userConfig);
  const existingIds = new Set(
    (input.existingTags ?? [])
      .map((tag) => normalizeTagPath(tag, options.userConfig)?.entryId)
      .filter((id): id is string => Boolean(id)),
  );
  const scored = new Map<string, ArticleTagSuggestion>();

  for (const suggestion of getTagSuggestionList(options.userConfig)) {
    if (suggestion.hidden || suggestion.deprecated) {
      continue;
    }
    if (!options.includeExistingTags && existingIds.has(suggestion.id)) {
      continue;
    }

    for (const [label, text] of getArticleTextParts(input)) {
      const match = getArticleTextMatchScore(suggestion, label, text);
      if (match.score <= 0) {
        continue;
      }

      const previous = scored.get(suggestion.id);
      scored.set(suggestion.id, {
        tag: suggestion,
        score: (previous?.score ?? 0) + match.score,
        reasons: uniqueStrings([...(previous?.reasons ?? []), ...match.reasons]),
      });
    }
  }

  return Array.from(scored.values())
    .sort((a, b) => b.score - a.score || compareTagSuggestions(a.tag, b.tag, taxonomy))
    .slice(0, limit);
}

function normalizeAiRecommendationKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

const AI_TAG_RECOMMENDATION_REASON_LIMIT = 90;
const AI_TAG_RECOMMENDATION_EVIDENCE_LIMIT = 120;

function truncateAiRecommendationText(value: unknown, fallback: string, limit: number): string {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const normalized = text || fallback;
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function findFirstJsonObjectText(text: string): string | null {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(start, index + 1);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            break;
          }
        }
      }
    }
  }

  return null;
}

function extractAiTagRecommendationJsonObjectText(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // Fall through to code-fence and embedded-object extraction.
    }
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    const fenced = fencedMatch[1]?.trim() ?? "";
    if (fenced.startsWith("{")) {
      try {
        JSON.parse(fenced);
        return fenced;
      } catch {
        // Fall through to embedded-object extraction.
      }
    }
  }

  return findFirstJsonObjectText(trimmed);
}

export function parseAiTagRecommendationJson(content: string): ParseAiTagRecommendationJsonResult {
  const jsonText = extractAiTagRecommendationJsonObjectText(content);
  if (!jsonText) {
    return {
      suggestions: [],
      ignored: [{ reason: "invalid_json", detail: "No JSON object found in model output." }],
      error: "invalid_json",
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(jsonText);
  } catch (error) {
    return {
      suggestions: [],
      ignored: [{ reason: "invalid_json", detail: error instanceof Error ? error.message : String(error) }],
      error: "invalid_json",
    };
  }

  if (!value || typeof value !== "object" || !Array.isArray((value as { suggestions?: unknown }).suggestions)) {
    return {
      suggestions: [],
      ignored: [{ reason: "invalid_json", detail: "suggestions must be an array." }],
      error: "invalid_json",
    };
  }

  const suggestions: AiTagRecommendationRawSuggestion[] = [];
  const ignored: AiTagRecommendationIgnored[] = [];
  for (const item of (value as { suggestions: unknown[] }).suggestions) {
    if (!item || typeof item !== "object") {
      ignored.push({ reason: "missing_tag" });
      continue;
    }
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.tag !== "string" || !candidate.tag.trim()) {
      ignored.push({ reason: "missing_tag" });
      continue;
    }
    suggestions.push({
      tag: candidate.tag,
      confidence: typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
        ? Math.max(0, Math.min(1, candidate.confidence))
        : undefined,
      reason: truncateAiRecommendationText(candidate.reason, "", AI_TAG_RECOMMENDATION_REASON_LIMIT),
      evidence: truncateAiRecommendationText(candidate.evidence, "", AI_TAG_RECOMMENDATION_EVIDENCE_LIMIT),
    });
  }

  return { suggestions, ignored };
}

function normalizeAiCandidate(candidate: TagSuggestion, score = 0, reasons: string[] = [], aliasLimit = 4): AiTagRecommendationCandidate {
  return {
    id: candidate.id,
    pathText: candidate.pathText,
    name: candidate.name,
    aliases: uniqueStrings(candidate.aliases.map((alias) => alias.trim()).filter(Boolean)).slice(0, aliasLimit),
    source: candidate.source,
    score,
    reasons,
  };
}

function addAiCandidate(
  candidates: Map<string, AiTagRecommendationCandidate>,
  suggestion: TagSuggestion,
  options: { score?: number; reasons?: string[]; aliasLimit: number; limit: number },
) {
  if (suggestion.hidden || suggestion.deprecated) {
    return;
  }
  const existing = candidates.get(suggestion.id);
  if (existing) {
    candidates.set(suggestion.id, {
      ...existing,
      score: Math.max(existing.score, options.score ?? 0),
      reasons: uniqueStrings([...existing.reasons, ...(options.reasons ?? [])]),
    });
    return;
  }
  if (candidates.size >= options.limit) {
    return;
  }
  candidates.set(suggestion.id, normalizeAiCandidate(suggestion, options.score ?? 0, options.reasons ?? [], options.aliasLimit));
}

function getAiCandidateSeeds(input: BuildAiTagRecommendationCandidatesInput): string[] {
  return uniqueStrings([
    input.title ?? "",
    input.notePath ?? "",
    input.summary ?? "",
    ...(input.existingTags ?? []),
  ].map((item) => item.trim()).filter(Boolean));
}

export function buildAiTagRecommendationCandidates(
  input: BuildAiTagRecommendationCandidatesInput,
  options: BuildAiTagRecommendationCandidatesOptions = {},
): AiTagRecommendationCandidate[] {
  const limit = Math.max(1, Math.min(options.limit ?? 30, 40));
  const aliasLimit = Math.max(0, Math.min(options.aliasLimit ?? 4, 8));
  const contentCharLimit = Math.max(500, Math.min(options.contentCharLimit ?? 4000, 12000));
  const candidates = new Map<string, AiTagRecommendationCandidate>();
  const content = (input.content ?? "").trim();
  const contentExcerpt = content.length > contentCharLimit ? content.slice(0, contentCharLimit) : content;

  for (const item of suggestTagsFromArticleText(
    {
      title: input.title,
      summary: input.summary,
      content: contentExcerpt,
      existingTags: input.existingTags ?? [],
    },
    {
      includeExistingTags: true,
      limit,
      userConfig: options.userConfig,
    },
  )) {
    addAiCandidate(candidates, item.tag, {
      score: item.score,
      reasons: item.reasons,
      aliasLimit,
      limit,
    });
  }

  for (const seed of getAiCandidateSeeds(input)) {
    if (candidates.size >= limit) {
      break;
    }
    for (const suggestion of findTagSuggestionsByQuery(seed, {
      limit: 4,
      userConfig: options.userConfig,
    })) {
      addAiCandidate(candidates, suggestion, {
        score: 1,
        reasons: [`query matched ${seed}`],
        aliasLimit,
        limit,
      });
    }
  }

  return Array.from(candidates.values()).slice(0, limit);
}

function clampAiConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.6;
  }
  return Math.max(0, Math.min(1, value));
}

function getAiRecommendationIdentity(analysis: TagNormalizationAnalysis, fallback: string): string {
  if (analysis.targetEntryId) {
    return `entry:${analysis.targetEntryId}`;
  }
  if (analysis.targetCanonicalPath) {
    return `path:${normalizeAiRecommendationKey(analysis.targetCanonicalPath)}`;
  }
  return `text:${normalizeAiRecommendationKey(fallback)}`;
}

export function postprocessAiTagRecommendations(
  rawSuggestions: AiTagRecommendationRawSuggestion[],
  options: {
    candidates: AiTagRecommendationCandidate[];
    existingTags?: string[];
    userConfig?: UserTagTaxonomyConfig | null;
    limit?: number;
  },
): AiTagRecommendationPostprocessResult {
  const candidateById = new Map(options.candidates.map((candidate) => [candidate.id, candidate]));
  const candidateByPath = new Map(options.candidates.map((candidate) => [normalizeAiRecommendationKey(candidate.pathText), candidate]));
  const existing = new Set(
    (options.existingTags ?? [])
      .map((tag, index) => analyzeSingleTagNormalization(tag, { userConfig: options.userConfig, index }))
      .filter((analysis) => !analysis.isUnknownFreeform)
      .map((analysis) => getAiRecommendationIdentity(analysis, analysis.original)),
  );
  const seen = new Map<string, number>();
  const suggestions: AiTagRecommendationSuggestion[] = [];
  const ignored: AiTagRecommendationIgnored[] = [];
  const limit = Math.max(1, Math.min(options.limit ?? 8, 20));

  for (const raw of rawSuggestions) {
    const original = typeof raw.tag === "string" ? raw.tag.trim() : "";
    if (!original) {
      ignored.push({ reason: "missing_tag" });
      continue;
    }

    const analysis = analyzeSingleTagNormalization(original, { userConfig: options.userConfig });
    const targetPath = analysis.targetCanonicalPath;
    const targetCandidate = (
      analysis.targetEntryId ? candidateById.get(analysis.targetEntryId) : undefined
    ) ?? (
      targetPath ? candidateByPath.get(normalizeAiRecommendationKey(targetPath)) : undefined
    ) ?? null;

    if (!targetPath || !analysis.targetEntryId) {
      ignored.push({ tag: original, reason: "unknown_tag" });
      continue;
    }
    if (!targetCandidate) {
      ignored.push({
        tag: original,
        reason: analysis.hidden
          ? "hidden"
          : analysis.deprecated
            ? "deprecated"
            : "not_in_candidates",
      });
      continue;
    }
    if (targetCandidate.pathText !== targetPath || targetCandidate.id !== analysis.targetEntryId) {
      ignored.push({ tag: original, reason: analysis.hidden ? "hidden" : "deprecated" });
      continue;
    }

    const identity = getAiRecommendationIdentity(analysis, original);
    if (existing.has(identity)) {
      ignored.push({ tag: original, reason: "duplicate_existing" });
      continue;
    }
    const nextSuggestion: AiTagRecommendationSuggestion = {
      tag: targetPath,
      confidence: clampAiConfidence(raw.confidence),
      reason: truncateAiRecommendationText(raw.reason, "匹配当前文章内容与标签候选。", AI_TAG_RECOMMENDATION_REASON_LIMIT),
      evidence: truncateAiRecommendationText(raw.evidence, "模型未提供具体证据。", AI_TAG_RECOMMENDATION_EVIDENCE_LIMIT),
      normalizedFrom: normalizeAiRecommendationKey(original) === normalizeAiRecommendationKey(targetPath) ? undefined : original,
    };

    const existingSuggestionIndex = seen.get(identity);
    if (existingSuggestionIndex !== undefined) {
      const currentSuggestion = suggestions[existingSuggestionIndex];
      if (nextSuggestion.confidence > currentSuggestion.confidence) {
        suggestions[existingSuggestionIndex] = nextSuggestion;
      }
      ignored.push({ tag: original, reason: "duplicate_suggestion" });
      continue;
    }

    seen.set(identity, suggestions.length);
    suggestions.push(nextSuggestion);
    if (suggestions.length >= limit) {
      break;
    }
  }

  return { suggestions, ignored };
}

function addSelfCheck(
  checks: TagTaxonomySelfCheckResult["checks"],
  name: string,
  actual: string | number | boolean | null,
  expected: string | number | boolean | null,
) {
  checks.push({
    name,
    actual,
    expected,
    passed: actual === expected,
  });
}

function getSelfCheckNodeCount(nodes: TagTreeNode[], fullPath: string): number | null {
  for (const node of nodes) {
    if (node.fullPath === fullPath) {
      return node.count;
    }

    const childCount = getSelfCheckNodeCount(node.children, fullPath);
    if (childCount !== null) {
      return childCount;
    }
  }

  return null;
}

function getDuplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }

  return Array.from(duplicates);
}

export function runTagTaxonomySelfCheck(): TagTaxonomySelfCheckResult {
  const checks: TagTaxonomySelfCheckResult["checks"] = [];
  const normalizedPath = (tag: string) => normalizeTagPath(tag)?.fullPath ?? null;
  const firstQueryPath = (query: string) => findTagSuggestionsByQuery(query, { limit: 1 })[0]?.pathText ?? null;
  const suggestedPath = (input: SuggestTagsFromArticleTextInput) => suggestTagsFromArticleText(input, { limit: 1 })[0]?.tag.pathText ?? null;
  const zFunctionPath = "算法/字符串/Z 函数";
  const suggestions = getTagSuggestionList();
  const duplicateIds = getDuplicateValues(BUILTIN_TAG_TAXONOMY.map((entry) => entry.id));
  const duplicatePaths = getDuplicateValues(BUILTIN_TAG_TAXONOMY.map((entry) => getTagPathText(entry.path)));

  addSelfCheck(checks, "builtin taxonomy has no duplicate ids", duplicateIds.length, 0);
  addSelfCheck(checks, "builtin taxonomy has no duplicate paths", duplicatePaths.length, 0);
  addSelfCheck(
    checks,
    "suggestion list includes unused default network flow tag",
    suggestions.some((item) => item.pathText === "算法/图论/网络流"),
    true,
  );

  addSelfCheck(checks, "拓展 KMP aliases to Z 函数", normalizedPath("拓展 KMP"), zFunctionPath);
  addSelfCheck(checks, "扩展 KMP aliases to Z 函数", normalizedPath("扩展 KMP"), zFunctionPath);
  addSelfCheck(checks, "exKMP aliases to Z 函数", normalizedPath("exKMP"), zFunctionPath);
  addSelfCheck(checks, "path leaf exKMP aliases to Z 函数", normalizedPath("算法/字符串/exKMP"), zFunctionPath);
  addSelfCheck(checks, "DP aliases to Luogu dynamic programming", normalizedPath("DP"), "算法/动态规划 DP/动态规划 DP");
  addSelfCheck(checks, "背包 aliases to knapsack DP", normalizedPath("背包"), "算法/动态规划 DP/背包 DP");
  addSelfCheck(checks, "李超树 aliases to 李超线段树", normalizedPath("李超树"), "算法/树形数据结构/李超线段树");
  addSelfCheck(checks, "树剖 aliases to 树链剖分", normalizedPath("树剖"), "算法/树论/树链剖分");
  addSelfCheck(checks, "HLD aliases to 树链剖分", normalizedPath("HLD"), "算法/树论/树链剖分");
  addSelfCheck(checks, "主席树 aliases to 可持久化线段树", normalizedPath("主席树"), "算法/树形数据结构/可持久化线段树");
  addSelfCheck(checks, "STB aliases to segment tree beats", normalizedPath("STB"), "算法/树形数据结构/吉司机线段树 segment tree beats");
  addSelfCheck(checks, "LCA aliases to 最近公共祖先 LCA", normalizedPath("LCA"), "算法/树论/最近公共祖先 LCA");
  addSelfCheck(checks, "FFT stays in polynomial taxonomy", normalizedPath("FFT"), "算法/多项式/快速傅里叶变换 FFT");
  addSelfCheck(checks, "NTT stays in polynomial taxonomy", normalizedPath("NTT"), "算法/多项式/快速数论变换 NTT");
  addSelfCheck(checks, "gcd aliases to gcd", normalizedPath("gcd"), "算法/数论/最大公约数 gcd");
  addSelfCheck(checks, "exgcd aliases to 扩展欧几里德算法", normalizedPath("exgcd"), "算法/数论/扩展欧几里德算法");
  addSelfCheck(checks, "CRT aliases to CRT", normalizedPath("CRT"), "算法/数论/中国剩余定理 CRT");
  addSelfCheck(checks, "two-pointer aliases to 双指针", normalizedPath("two-pointer"), "算法/其它技巧/双指针 two-pointer");
  addSelfCheck(checks, "old path 李超线段树 normalizes to Luogu path", normalizedPath("算法/数据结构/李超线段树"), "算法/树形数据结构/李超线段树");
  addSelfCheck(checks, "old path CRT normalizes to Luogu path", normalizedPath("算法/数学/CRT"), "算法/数论/中国剩余定理 CRT");
  addSelfCheck(checks, "unknown flat tag falls into custom tags", normalizedPath("自己乱写的标签"), "自定义标签/自己乱写的标签");

  const normalizationSuggestions = (tags: string[]) => getTagNormalizationSuggestions(tags).map((item) => item.normalized).join("|");
  addSelfCheck(checks, "normalization suggests 李超树 canonical path", normalizationSuggestions(["李超树"]), "算法/树形数据结构/李超线段树");
  addSelfCheck(checks, "normalization suggests exKMP canonical path", normalizationSuggestions(["exKMP"]), zFunctionPath);
  addSelfCheck(
    checks,
    "normalization suggests old 李超线段树 path canonical path",
    normalizationSuggestions(["算法/数据结构/李超线段树"]),
    "算法/树形数据结构/李超线段树",
  );
  addSelfCheck(
    checks,
    "normalization suggests old CRT path canonical path",
    normalizationSuggestions(["算法/数学/CRT"]),
    "算法/数论/中国剩余定理 CRT",
  );
  addSelfCheck(checks, "normalization ignores canonical Z 函数 path", getTagNormalizationSuggestions([zFunctionPath]).length, 0);
  addSelfCheck(checks, "normalization ignores unknown custom tag", getTagNormalizationSuggestions(["完全自定义标签"]).length, 0);
  addSelfCheck(
    checks,
    "normalization replacement deduplicates canonical duplicate",
    new Set(getTagNormalizationSuggestions(["李超树", "算法/树形数据结构/李超线段树"]).map((item) => item.normalized)).size,
    1,
  );

  addSelfCheck(checks, "query exKMP returns Z 函数", firstQueryPath("exKMP"), zFunctionPath);
  addSelfCheck(checks, "query 拓展 KMP returns Z 函数", firstQueryPath("拓展 KMP"), zFunctionPath);
  addSelfCheck(checks, "query 主席树 returns 可持久化线段树", firstQueryPath("主席树"), "算法/树形数据结构/可持久化线段树");
  addSelfCheck(checks, "query STB returns segment tree beats", firstQueryPath("STB"), "算法/树形数据结构/吉司机线段树 segment tree beats");

  const userAlias = "user-z-alias-selfcheck";
  const userAliasConfig: UserTagTaxonomyConfig = {
    aliases: {
      [userAlias]: "algorithm.string.z-function",
    },
  };
  addSelfCheck(checks, "user alias normalizes to Z 函数", normalizeTagPath(userAlias, userAliasConfig)?.fullPath ?? null, zFunctionPath);
  addSelfCheck(
    checks,
    "query user alias returns Z 函数",
    findTagSuggestionsByQuery(userAlias, { limit: 1, userConfig: userAliasConfig })[0]?.pathText ?? null,
    zFunctionPath,
  );
  addSelfCheck(
    checks,
    "suggestions include user alias",
    getTagSuggestionList(userAliasConfig).find((suggestion) => suggestion.id === "algorithm.string.z-function")?.aliases.includes(userAlias) ?? false,
    true,
  );
  addSelfCheck(
    checks,
    "removed user alias stops matching suggestions",
    findTagSuggestionsByQuery(userAlias, { limit: 1, userConfig: { aliases: {} } }).length,
    0,
  );
  addSelfCheck(checks, "builtin alias works with user aliases", normalizeTagPath("exKMP", userAliasConfig)?.fullPath ?? null, zFunctionPath);

  const userEntryConfig: UserTagTaxonomyConfig = {
    entries: [{
      id: "user.selfcheck.custom",
      path: ["自定义标签", "字符串", "自定义模式匹配"],
      aliases: ["自定义匹配入口"],
      source: "user",
    }],
  };
  addSelfCheck(
    checks,
    "user entry appears in suggestions",
    getTagSuggestionList(userEntryConfig).some((suggestion) => suggestion.id === "user.selfcheck.custom"),
    true,
  );
  addSelfCheck(
    checks,
    "user entry alias normalizes to user canonical path",
    normalizeTagPath("自定义匹配入口", userEntryConfig)?.fullPath ?? null,
    "自定义标签/字符串/自定义模式匹配",
  );

  const mergeConfig: UserTagTaxonomyConfig = {
    merges: {
      "algorithm.string.kmp": "algorithm.string.z-function",
    },
  };
  const mergeSuggestions = getTagSuggestionList(mergeConfig, { includeHidden: true, includeDeprecated: true });
  const visibleMergeSuggestions = getTagSuggestionList(mergeConfig);
  const mergedKmpSuggestion = mergeSuggestions.find((suggestion) => suggestion.id === "algorithm.string.kmp") ?? null;
  addSelfCheck(checks, "merge source normalizes to target path", normalizeTagPath("KMP", mergeConfig)?.fullPath ?? null, zFunctionPath);
  addSelfCheck(checks, "merge source id normalizes to target id", normalizeTagPath("algorithm.string.kmp", mergeConfig)?.entryId ?? null, "algorithm.string.z-function");
  addSelfCheck(checks, "merge source suggestion is deprecated when included", mergedKmpSuggestion?.deprecated ?? null, true);
  addSelfCheck(checks, "merge source hidden from default suggestions", visibleMergeSuggestions.some((suggestion) => suggestion.id === "algorithm.string.kmp"), false);
  addSelfCheck(checks, "merge source query returns visible target", findTagSuggestionsByQuery("KMP", { limit: 1, userConfig: mergeConfig })[0]?.pathText ?? null, zFunctionPath);
  addSelfCheck(checks, "normalization suggests merge source target", getTagNormalizationSuggestions(["KMP"], { userConfig: mergeConfig })[0]?.normalized ?? null, zFunctionPath);
  addSelfCheck(checks, "merge keeps builtin alias normalization", normalizeTagPath("exKMP", mergeConfig)?.fullPath ?? null, zFunctionPath);
  const userAliasToMergeSourceConfig: UserTagTaxonomyConfig = {
    aliases: {
      "旧 KMP 入口": "algorithm.string.kmp",
    },
    merges: {
      "algorithm.string.kmp": "algorithm.string.z-function",
    },
  };
  addSelfCheck(checks, "user alias pointing at merge source normalizes to target", normalizeTagPath("旧 KMP 入口", userAliasToMergeSourceConfig)?.fullPath ?? null, zFunctionPath);
  addSelfCheck(checks, "user alias pointing at merge source searches target", findTagSuggestionsByQuery("旧 KMP 入口", { limit: 1, userConfig: userAliasToMergeSourceConfig })[0]?.pathText ?? null, zFunctionPath);
  addSelfCheck(
    checks,
    "user alias cannot override builtin alias",
    normalizeTagPath("exKMP", { aliases: { exKMP: "algorithm.string.kmp" } })?.fullPath ?? null,
    zFunctionPath,
  );
  addSelfCheck(
    checks,
    "hidden merge source can be previewed when included",
    getTagSuggestionList({
      hiddenIds: ["algorithm.string.kmp"],
      merges: {
        "algorithm.string.kmp": "algorithm.string.z-function",
      },
    }, { includeHidden: true, includeDeprecated: true }).some((suggestion) => suggestion.id === "algorithm.string.kmp" && suggestion.hidden && suggestion.deprecated),
    true,
  );

  const aliasNormalizationPlan = analyzeTagListNormalization(["拓展 KMP"]);
  const mergeNormalizationPlan = analyzeTagListNormalization(["KMP"], { userConfig: mergeConfig });
  const aliasToMergeNormalizationPlan = analyzeTagListNormalization(["旧 KMP 入口"], { userConfig: userAliasToMergeSourceConfig });
  const duplicateNormalizationPlan = analyzeTagListNormalization(["拓展 KMP", zFunctionPath]);
  const unknownNormalizationPlan = analyzeTagListNormalization(["完全自定义标签"]);
  const hiddenOnlyNormalizationPlan = analyzeTagListNormalization([zFunctionPath], {
    userConfig: {
      hiddenIds: ["algorithm.string.z-function"],
    },
  });
  const userEntryNormalizationPlan = analyzeTagListNormalization(["自定义标签/字符串/自定义模式匹配"], { userConfig: userEntryConfig });
  const orderOverrideNormalizationPlan = analyzeTagListNormalization(["拓展 KMP"], {
    userConfig: {
      orderOverrides: {
        "algorithm.string.z-function": -10,
      },
    },
  });

  addSelfCheck(checks, "normalization analysis marks alias to canonical", aliasNormalizationPlan.suggestions[0]?.reason ?? null, "alias_to_canonical");
  addSelfCheck(checks, "normalization analysis rewrites alias to canonical", aliasNormalizationPlan.nextTags.join("|"), zFunctionPath);
  addSelfCheck(checks, "normalization analysis marks merge source", mergeNormalizationPlan.suggestions[0]?.reason ?? null, "merge_to_target");
  addSelfCheck(checks, "normalization analysis rewrites merge source to target", mergeNormalizationPlan.nextTags.join("|"), zFunctionPath);
  addSelfCheck(checks, "normalization analysis marks alias to merge source", aliasToMergeNormalizationPlan.suggestions[0]?.reason ?? null, "alias_to_merged_source");
  addSelfCheck(checks, "normalization analysis rewrites alias to merge source to target", aliasToMergeNormalizationPlan.nextTags.join("|"), zFunctionPath);
  addSelfCheck(checks, "normalization analysis marks duplicate after normalize", duplicateNormalizationPlan.suggestions.some((item) => item.reason === "duplicate_after_normalize"), true);
  addSelfCheck(checks, "apply normalization plan deduplicates target", applyTagNormalizationPlan(["拓展 KMP", zFunctionPath], duplicateNormalizationPlan).join("|"), zFunctionPath);
  addSelfCheck(checks, "unknown freeform normalization stays unchanged", applyTagNormalizationPlan(["完全自定义标签"], unknownNormalizationPlan).join("|"), "完全自定义标签");
  addSelfCheck(checks, "unknown freeform normalization has no rewrite suggestion", unknownNormalizationPlan.suggestions.length, 0);
  addSelfCheck(checks, "hidden only tag is skipped without rewrite", hiddenOnlyNormalizationPlan.analyses[0]?.reason ?? null, "hidden_no_change");
  addSelfCheck(checks, "hidden only tag has no rewrite suggestion", hiddenOnlyNormalizationPlan.suggestions.length, 0);
  addSelfCheck(checks, "user custom canonical is not reported as old tag", userEntryNormalizationPlan.suggestions.length, 0);
  addSelfCheck(checks, "orderOverrides do not change normalization plan target", orderOverrideNormalizationPlan.nextTags.join("|"), zFunctionPath);
  addSelfCheck(
    checks,
    "apply normalization plan keeps stable order",
    applyTagNormalizationPlan(["自定义自由标签", "拓展 KMP", "来源/平台/洛谷"], analyzeTagListNormalization(["自定义自由标签", "拓展 KMP", "来源/平台/洛谷"])).join("|"),
    `自定义自由标签|${zFunctionPath}|来源/平台/洛谷`,
  );

  const aiBuiltinAliasCandidates = buildAiTagRecommendationCandidates({ title: "exKMP 与 Z 函数模板" });
  const aiUserAliasCandidates = buildAiTagRecommendationCandidates(
    { title: "自定义匹配入口复习" },
    { userConfig: userEntryConfig },
  );
  const aiMergeCandidates = buildAiTagRecommendationCandidates(
    { title: "KMP 自动机复习" },
    { userConfig: mergeConfig },
  );
  const aiHiddenCandidates = buildAiTagRecommendationCandidates(
    { title: "exKMP 与 Z 函数模板" },
    { userConfig: { hiddenIds: ["algorithm.string.z-function"] } },
  );
  const aiHiddenIncluded = getTagSuggestionList(
    { hiddenIds: ["algorithm.string.z-function"] },
    { includeHidden: true },
  );
  const aiPostprocessAlias = postprocessAiTagRecommendations(
    [{ tag: "exKMP", confidence: 0.8, reason: "alias", evidence: "exKMP" }],
    { candidates: aiBuiltinAliasCandidates, existingTags: [] },
  );
  const aiPostprocessExisting = postprocessAiTagRecommendations(
    [{ tag: "exKMP", confidence: 0.8, reason: "alias", evidence: "exKMP" }],
    { candidates: aiBuiltinAliasCandidates, existingTags: [zFunctionPath] },
  );
  const aiPostprocessUnknown = postprocessAiTagRecommendations(
    [{ tag: "完全不存在的 AI 自由标签", confidence: 0.8, reason: "unknown", evidence: "unknown" }],
    { candidates: aiBuiltinAliasCandidates, existingTags: [] },
  );
  const aiPostprocessMerge = postprocessAiTagRecommendations(
    [{ tag: "KMP", confidence: 0.7, reason: "merge", evidence: "KMP" }],
    { candidates: aiMergeCandidates, existingTags: [], userConfig: mergeConfig },
  );
  const aiPostprocessAliasToMerge = postprocessAiTagRecommendations(
    [{ tag: "旧 KMP 入口", confidence: 0.7, reason: "alias merge", evidence: "旧 KMP 入口" }],
    { candidates: aiMergeCandidates, existingTags: [], userConfig: userAliasToMergeSourceConfig },
  );
  const aiPostprocessHidden = postprocessAiTagRecommendations(
    [{ tag: zFunctionPath, confidence: 0.8, reason: "hidden", evidence: "hidden" }],
    { candidates: aiHiddenCandidates, existingTags: [], userConfig: { hiddenIds: ["algorithm.string.z-function"] } },
  );
  const deprecatedUserConfig: UserTagTaxonomyConfig = {
    entries: [{
      id: "user.selfcheck.deprecated",
      path: ["自定义标签", "废弃", "旧标签"],
      deprecated: true,
      source: "user",
    }],
  };
  const aiPostprocessDeprecated = postprocessAiTagRecommendations(
    [{ tag: "自定义标签/废弃/旧标签", confidence: 0.8, reason: "deprecated", evidence: "deprecated" }],
    { candidates: buildAiTagRecommendationCandidates({ title: "旧标签" }, { userConfig: deprecatedUserConfig }), existingTags: [], userConfig: deprecatedUserConfig },
  );
  const aiPostprocessExistingAlias = postprocessAiTagRecommendations(
    [{ tag: zFunctionPath, confidence: 0.8, reason: "canonical", evidence: "canonical" }],
    { candidates: aiBuiltinAliasCandidates, existingTags: ["exKMP"] },
  );
  const aiPostprocessDuplicate = postprocessAiTagRecommendations(
    [
      { tag: "exKMP", confidence: 0.4, reason: "low", evidence: "low" },
      { tag: zFunctionPath, confidence: 0.9, reason: "high", evidence: "high" },
    ],
    { candidates: aiBuiltinAliasCandidates, existingTags: [] },
  );
  const aiPostprocessUserCustom = postprocessAiTagRecommendations(
    [{ tag: "自定义标签/字符串/自定义模式匹配", confidence: 0.8, reason: "user", evidence: "user" }],
    { candidates: aiUserAliasCandidates, existingTags: [], userConfig: userEntryConfig },
  );
  const longReason = "很长".repeat(80);
  const aiPostprocessClampAndTruncate = postprocessAiTagRecommendations(
    [{ tag: "exKMP", confidence: 1.8, reason: longReason, evidence: longReason }],
    { candidates: aiBuiltinAliasCandidates, existingTags: [] },
  );
  const parsedFenceJson = parseAiTagRecommendationJson("```json\n{\"suggestions\":[{\"tag\":\"exKMP\",\"confidence\":0.8}]}\n```");
  const parsedEmbeddedJson = parseAiTagRecommendationJson("先解释一句 {\"suggestions\":[{\"tag\":\"exKMP\"}]} 后面还有文字");
  const parsedInvalidJson = parseAiTagRecommendationJson("这不是 JSON");
  const parsedMissingTagJson = parseAiTagRecommendationJson("{\"suggestions\":[{\"confidence\":0.8},{\"tag\":\"exKMP\"}]}");

  addSelfCheck(checks, "AI candidates include builtin alias canonical", aiBuiltinAliasCandidates.some((candidate) => candidate.pathText === zFunctionPath), true);
  addSelfCheck(checks, "AI candidates include user alias target", aiUserAliasCandidates.some((candidate) => candidate.pathText === "自定义标签/字符串/自定义模式匹配"), true);
  addSelfCheck(checks, "AI candidates include merge target", aiMergeCandidates.some((candidate) => candidate.pathText === zFunctionPath), true);
  addSelfCheck(checks, "AI candidates exclude merge source", aiMergeCandidates.some((candidate) => candidate.id === "algorithm.string.kmp"), false);
  addSelfCheck(checks, "AI candidates exclude hidden by default", aiHiddenCandidates.some((candidate) => candidate.id === "algorithm.string.z-function"), false);
  addSelfCheck(checks, "includeHidden can display hidden taxonomy suggestion", aiHiddenIncluded.some((candidate) => candidate.id === "algorithm.string.z-function" && candidate.hidden), true);
  addSelfCheck(checks, "AI candidates exclude deprecated merge source by default", getTagSuggestionList(mergeConfig).some((candidate) => candidate.id === "algorithm.string.kmp"), false);
  addSelfCheck(checks, "AI candidates include user custom tag", aiUserAliasCandidates.some((candidate) => candidate.id === "user.selfcheck.custom"), true);
  addSelfCheck(checks, "AI postprocess normalizes alias output", aiPostprocessAlias.suggestions[0]?.tag ?? null, zFunctionPath);
  addSelfCheck(checks, "AI postprocess normalizes merge source output", aiPostprocessMerge.suggestions[0]?.tag ?? null, zFunctionPath);
  addSelfCheck(checks, "AI postprocess normalizes alias to merge source output", aiPostprocessAliasToMerge.suggestions[0]?.tag ?? null, zFunctionPath);
  addSelfCheck(checks, "AI postprocess drops hidden output", aiPostprocessHidden.ignored[0]?.reason ?? null, "hidden");
  addSelfCheck(checks, "AI postprocess drops deprecated output", aiPostprocessDeprecated.ignored[0]?.reason ?? null, "deprecated");
  addSelfCheck(checks, "AI postprocess drops non taxonomy tag", aiPostprocessUnknown.ignored[0]?.reason ?? null, "unknown_tag");
  addSelfCheck(checks, "AI postprocess deduplicates existing tags", aiPostprocessExisting.suggestions.length, 0);
  addSelfCheck(checks, "AI postprocess deduplicates existing alias tags", aiPostprocessExistingAlias.ignored[0]?.reason ?? null, "duplicate_existing");
  addSelfCheck(checks, "AI postprocess records duplicate suggestions", aiPostprocessDuplicate.ignored[0]?.reason ?? null, "duplicate_suggestion");
  addSelfCheck(checks, "AI postprocess keeps higher confidence duplicate", aiPostprocessDuplicate.suggestions[0]?.confidence ?? null, 0.9);
  addSelfCheck(checks, "AI postprocess allows user custom tag", aiPostprocessUserCustom.suggestions[0]?.tag ?? null, "自定义标签/字符串/自定义模式匹配");
  addSelfCheck(checks, "AI postprocess clamps confidence", aiPostprocessClampAndTruncate.suggestions[0]?.confidence ?? null, 1);
  addSelfCheck(checks, "AI postprocess truncates long reason", (aiPostprocessClampAndTruncate.suggestions[0]?.reason.length ?? 0) <= AI_TAG_RECOMMENDATION_REASON_LIMIT + 3, true);
  addSelfCheck(checks, "AI postprocess truncates long evidence", (aiPostprocessClampAndTruncate.suggestions[0]?.evidence.length ?? 0) <= AI_TAG_RECOMMENDATION_EVIDENCE_LIMIT + 3, true);
  addSelfCheck(checks, "AI JSON parser accepts code fence", parsedFenceJson.suggestions[0]?.tag ?? null, "exKMP");
  addSelfCheck(checks, "AI JSON parser extracts embedded object", parsedEmbeddedJson.suggestions[0]?.tag ?? null, "exKMP");
  addSelfCheck(checks, "AI JSON parser rejects non JSON", parsedInvalidJson.error ?? null, "invalid_json");
  addSelfCheck(checks, "AI JSON parser records missing tag item", parsedMissingTagJson.ignored[0]?.reason ?? null, "missing_tag");

  const userEditOriginalConfig: UserTagTaxonomyConfig = {
    entries: [{
      id: "user.selfcheck.editable",
      path: ["自定义标签", "编辑测试", "旧标签"],
      aliases: ["旧别名"],
      source: "user",
    }],
  };
  const userEditConfig: UserTagTaxonomyConfig = {
    entries: [{
      id: "user.selfcheck.editable",
      path: ["自定义标签", "编辑测试", "新标签"],
      aliases: ["新别名"],
      source: "user",
    }],
  };
  const editedUserSuggestion = getTagSuggestionList(userEditConfig).find((suggestion) => suggestion.id === "user.selfcheck.editable") ?? null;
  const builtinSuggestionForEditCheck = getTagSuggestionList().find((suggestion) => suggestion.id === "algorithm.string.z-function") ?? null;
  const conflictingUserEditPath = "算法/字符串/Z 函数";
  const hasBuiltinPathConflict = getTagSuggestionList(userEditConfig, { includeHidden: true, includeDeprecated: true })
    .some((suggestion) => suggestion.pathText === conflictingUserEditPath && suggestion.id !== "user.selfcheck.editable");

  addSelfCheck(checks, "edited user entry label appears in suggestions", editedUserSuggestion?.pathText ?? null, "自定义标签/编辑测试/新标签");
  addSelfCheck(
    checks,
    "edited user entry new alias is searchable",
    findTagSuggestionsByQuery("新别名", { limit: 1, userConfig: userEditConfig })[0]?.id ?? null,
    "user.selfcheck.editable",
  );
  addSelfCheck(
    checks,
    "removed user entry alias stops matching",
    findTagSuggestionsByQuery("旧别名", { limit: 1, userConfig: userEditConfig }).length,
    0,
  );
  addSelfCheck(
    checks,
    "original user entry alias matched before edit",
    findTagSuggestionsByQuery("旧别名", { limit: 1, userConfig: userEditOriginalConfig })[0]?.id ?? null,
    "user.selfcheck.editable",
  );
  addSelfCheck(checks, "builtin entry remains builtin source", builtinSuggestionForEditCheck?.source ?? null, "builtin");
  addSelfCheck(checks, "user entry edit path conflict can be detected", hasBuiltinPathConflict, true);

  addSelfCheck(checks, "article text 拓展 KMP suggests Z 函数", suggestedPath({ title: "拓展 KMP 模板题" }), zFunctionPath);
  addSelfCheck(
    checks,
    "article text 李超树 suggests 李超线段树",
    suggestedPath({ title: "李超树维护直线最值" }),
    "算法/树形数据结构/李超线段树",
  );
  addSelfCheck(
    checks,
    "query results do not contain duplicate candidates",
    new Set(findTagSuggestionsByQuery("tree", { limit: 20 }).map((item) => item.id)).size,
    findTagSuggestionsByQuery("tree", { limit: 20 }).length,
  );

  const defaultDpOrder = getTagSuggestionList()
    .filter((item) => item.pathText.startsWith("算法/动态规划 DP/"))
    .map((item) => item.id);
  const overriddenDpOrder = getTagSuggestionList({
    orderOverrides: {
      "algorithm.dp.knapsack": -10,
    },
  })
    .filter((item) => item.pathText.startsWith("算法/动态规划 DP/"))
    .map((item) => item.id);
  const hiddenZSuggestions = getTagSuggestionList({
    hiddenIds: ["algorithm.string.z-function"],
    orderOverrides: {
      "algorithm.string.z-function": -10,
    },
  });
  const hiddenZIncludedSuggestions = getTagSuggestionList(
    {
      hiddenIds: ["algorithm.string.z-function"],
      orderOverrides: {
        "algorithm.string.z-function": -10,
      },
    },
    { includeHidden: true },
  );
  const rootOverrideOrder = uniqueStrings(getTagSuggestionList({
    orderOverrides: {
      [getTagNodeOrderKey(["训练"])]: -10,
    },
  }).map((item) => item.path[0] ?? ""));
  const algorithmGroupOverrideOrder = uniqueStrings(getTagSuggestionList({
    orderOverrides: {
      "algorithm.group.string": -10,
    },
  })
    .filter((item) => item.path[0] === "算法")
    .map((item) => item.path[1] ?? ""));
  const algorithmBrowserGroups = getTagSuggestionRootGroups({
    orderOverrides: {
      "algorithm.group.string": -10,
    },
  }).find((group) => group.root === "算法")?.groups.map((group) => group.name) ?? [];
  const dirtyMiddleGroupNextIds = [
    "algorithm.group.string",
    "algorithm.group.language",
    "algorithm.group.dp",
  ];
  const dirtyMiddleGroupOverrides = createDenseOrderOverrides(
    {
      "algorithm.group.string": 0,
      "algorithm.group.language": 0,
      "algorithm.group.dp": 0,
      "algorithm.string.z-function": 42,
    },
    dirtyMiddleGroupNextIds,
  );
  const dirtyMiddleGroupOrder = getTagSuggestionRootGroups({
    orderOverrides: dirtyMiddleGroupOverrides,
  }).find((group) => group.root === "算法")?.groups.map((group) => group.name) ?? [];
  const stringTagOverrideOrder = getTagSuggestionList({
    orderOverrides: {
      "algorithm.string.z-function": -10,
    },
  })
    .filter((item) => item.pathText.startsWith("算法/字符串/"))
    .map((item) => item.id);
  const hiddenStringOverrideOrder = getTagSuggestionList(
    {
      hiddenIds: ["algorithm.string.z-function"],
      orderOverrides: {
        "algorithm.string.z-function": -10,
      },
    },
    { includeHidden: true },
  )
    .filter((item) => item.pathText.startsWith("算法/字符串/"))
    .map((item) => item.id);

  addSelfCheck(
    checks,
    "default order keeps DP before knapsack",
    defaultDpOrder.indexOf("algorithm.dp.dp") < defaultDpOrder.indexOf("algorithm.dp.knapsack"),
    true,
  );
  addSelfCheck(
    checks,
    "orderOverrides can reorder sibling tags",
    overriddenDpOrder.indexOf("algorithm.dp.knapsack") < overriddenDpOrder.indexOf("algorithm.dp.dp"),
    true,
  );
  addSelfCheck(
    checks,
    "orderOverrides can reorder root categories",
    rootOverrideOrder.indexOf("训练") < rootOverrideOrder.indexOf("算法"),
    true,
  );
  addSelfCheck(
    checks,
    "orderOverrides can reorder middle groups",
    algorithmGroupOverrideOrder.indexOf("字符串") < algorithmGroupOverrideOrder.indexOf("语言入门"),
    true,
  );
  addSelfCheck(
    checks,
    "tag manager group list reorders middle groups",
    algorithmBrowserGroups.indexOf("字符串") < algorithmBrowserGroups.indexOf("语言入门"),
    true,
  );
  addSelfCheck(
    checks,
    "dirty middle group overrides rewrite dense values",
    dirtyMiddleGroupNextIds.map((id) => dirtyMiddleGroupOverrides[id]).join(","),
    "0,1,2",
  );
  addSelfCheck(
    checks,
    "dirty middle group overrides keep rewritten browser order",
    dirtyMiddleGroupOrder.indexOf("字符串") < dirtyMiddleGroupOrder.indexOf("语言入门"),
    true,
  );
  addSelfCheck(
    checks,
    "dirty middle group rewrite preserves other scope overrides",
    dirtyMiddleGroupOverrides["algorithm.string.z-function"],
    42,
  );
  addSelfCheck(
    checks,
    "orderOverrides can reorder leaf tags in string group",
    stringTagOverrideOrder.indexOf("algorithm.string.z-function") < stringTagOverrideOrder.indexOf("algorithm.string.kmp"),
    true,
  );
  addSelfCheck(
    checks,
    "orderOverrides keep unspecified sibling tags",
    overriddenDpOrder.includes("algorithm.dp.digit"),
    true,
  );
  addSelfCheck(
    checks,
    "orderOverrides keep unspecified middle groups",
    algorithmGroupOverrideOrder.includes("图论"),
    true,
  );
  addSelfCheck(
    checks,
    "hiddenIds with orderOverrides exclude hidden tags by default",
    hiddenZSuggestions.some((item) => item.id === "algorithm.string.z-function"),
    false,
  );
  addSelfCheck(
    checks,
    "includeHidden returns hidden ordered tags",
    hiddenZIncludedSuggestions.some((item) => item.id === "algorithm.string.z-function" && item.hidden),
    true,
  );
  addSelfCheck(
    checks,
    "includeHidden keeps hidden tags in overridden order",
    hiddenStringOverrideOrder.indexOf("algorithm.string.z-function") < hiddenStringOverrideOrder.indexOf("algorithm.string.kmp"),
    true,
  );
  addSelfCheck(
    checks,
    "orderOverrides do not affect alias normalization",
    normalizeTagPath("exKMP", {
      orderOverrides: {
        "algorithm.string.z-function": -10,
      },
    })?.fullPath ?? null,
    zFunctionPath,
  );

  const tree = buildTagTree([
    { relativePath: "alias-note.md", tags: ["Z 函数", "拓展 KMP"] },
    { relativePath: "path-note.md", tags: ["算法/字符串/exKMP"] },
  ]);
  addSelfCheck(checks, "same note aliases do not duplicate canonical count", getSelfCheckNodeCount(tree, zFunctionPath), 2);

  const aliasNotes = [
    { relativePath: "exkmp.md", tags: ["exKMP"] },
    { relativePath: "extended-kmp.md", tags: ["拓展 KMP"] },
    { relativePath: "z-function.md", tags: ["Z 函数"] },
  ];
  addSelfCheck(
    checks,
    "middle path aggregates Z 函数 aliases",
    aliasNotes.filter((note) => matchArticleByTagPath(note, "算法/字符串")).length,
    3,
  );
  addSelfCheck(
    checks,
    "visible tree omits unused builtin network flow tag",
    getSelfCheckNodeCount(buildTagTree([{ relativePath: "dp.md", tags: ["DP"] }]), "算法/图论/网络流"),
    null,
  );

  return {
    checks,
    passed: checks.every((check) => check.passed),
  };
}
