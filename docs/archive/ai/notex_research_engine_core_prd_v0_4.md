# NoteX Research Engine Core PRD v0.4

版本：v0.4  
日期：2026-06-04  
状态：执行前基线稿，可用于后续拆分 Codex 任务；不是一次性实现指令  
更新原因：根据第三轮工程显微镜 Review，补强早退策略、完整代码/公式片段保真、生成后失败处理、事件流节流、Zombie Request 生命周期管理，并完成执行前自审。

---

## 0. 一句话结论

NoteX 的联网能力不应该继续是“AI 回答前随手搜几个网页”，而应该重构成一个独立的 **Research Engine Core**：输入用户问题，输出结构化证据包、失败原因、引用契约、可诊断搜索轨迹，以及可以流式展示给 NoteX 的中间状态。

v0.4 的核心修正是：

1. **早退不能只看证据数量**。必须引入 `PriorityBarrier`：高优核心来源未返回或未超时前，低质量快站点不能抢跑生成答案。
2. **Excerpt 不能按字符物理截断代码/公式**。代码块、数学块、表格必须作为结构化原子处理，要么完整保留，要么完整舍弃/摘要，不能切半。
3. **Post-generation repair 不能只靠 Prompt**。校验失败后优先走确定性 fallback 或物理收缩证据上下文，再允许一次受控重写；不能让模型自己“擦屁股”。
4. **PipelineEvent 不能无节制推 UI**。事件流必须在 adapter/store 层做 coalescing、throttle、batching，普通 UI 只接收摘要事件。
5. **Abort 不等于底层连接一定消失**。Scheduler 必须有 hard timeout、watchdog、worker lifecycle、connection budget 和 stale guard，防止 Zombie Requests。
6. 这版 PRD 已经从“系统设计草图”收敛为“可执行工程基线”：Phase 1 可以开始做 contracts / policy / query planner；Phase 2 再做 scheduler / event buffer / abort 生命周期。

---

## 1. 第三轮 Review 采纳结论

| Review 点 | 结论 | v0.4 处理方式 |
|---|---|---|
| soft deadline + evidenceReady 可能让低质量快源抢跑 | 必须采纳 | 新增 `PriorityBarrier` / `ReadinessGate`：高优 Top-K 未完成或未超时前，不允许仅凭低优 medium 证据早退 |
| CSDN 快于 cppreference 会劣币驱逐良币 | 必须采纳 | Scheduler 记录 `priorityTier`、`coreSourcePending`、`barrierDeadlineMs`，早退条件必须同时满足 evidence threshold 与 priority barrier |
| Excerpt 字符截断会切坏代码/公式 | 必须采纳 | PassageSelector 改为 block-aware；代码、公式、表格是 indivisible block；禁止 half-code / half-math 进入证据包 |
| OI 题解需要语法结构感知 | 改写后采纳 | Phase 1 不做完整 AST；先做 Markdown block parser + fenced code integrity + optional language-aware trimming；后续可接 Tree-sitter/AST |
| repair_once 会让模型继续编引用 | 必须采纳 | PostGenerationVerifier 改为 deterministic-first：非法引用/forbidden claim 默认 fallback；仅低风险格式错误可受控 rewrite |
| PipelineEvent 过多导致渲染雪崩 | 必须采纳 | 新增 `EventBuffer`：100ms 左右合批、状态去重、普通/开发模式事件分级、最大事件日志上限 |
| AbortSignal 不能保证底层 socket 立刻中断 | 必须采纳 | 新增 watchdog、hard timeout、worker lease、connection budget、zombie cleanup、stale result discard |
| 高并发服务级资源池 | 部分采纳 | 不按多租户服务做复杂架构，但单用户桌面端仍需防止同一用户连续提问造成后台任务堆积 |
| 可以开始执行 | 采纳 | PRD 末尾新增执行前自审、Phase 1 首批任务边界、禁止事项和验收清单 |

---

## 2. 当前系统问题重新定义

现有联网功能的问题不是“完全不会联网”，而是没有形成真正的检索系统。

主要症状：

1. **召回不足**：候选网页太少，或者太早被过滤，最后 Evidence Gate 没有足够材料。
2. **边界不清**：Discovery、Reader、Evidence Gate、Answer Contract 混在一起，失败时难以定位。
3. **调度粗糙**：搜索、读网页、证据判断过于批处理，容易被慢网页拖垮，也容易被低质量快网页抢跑。
4. **排序脆弱**：硬编码权重可以跑通 demo，但长尾问题很容易失效。
5. **抽取破坏结构**：技术文档、OI 题解、代码块、数学公式、表格容易被 innerText 压坏。
6. **片段压缩危险**：按字符预算截断代码/公式，会制造坏证据，比没有证据更危险。
7. **冲突处理不足**：多个来源互相矛盾时，不能只把材料扔给大模型，让它自己“端水”。
8. **生成约束不闭环**：Answer Contract 是生成前约束，但还需要后置机械校验和确定性 fallback。
9. **生命周期不完整**：Abort、timeout、stale guard、worker cleanup 没闭环时，会出现幽灵请求。
10. **事件流无节制**：开发诊断需要细，但普通 UI 不能被几百条 PipelineEvent 打爆。

新系统的目标是：**把用户问题转化成可调度、可压缩、可验证、可回放的证据生产过程**。

---

## 3. 产品定位

### 3.1 内部命名

内部模块名建议：**Research Engine Core**。

不要继续叫 `webSearch`，因为它不只是联网搜索，而是一个“问题 → 候选 → 阅读 → 证据 → 回答契约 → 后置校验”的研究引擎。

### 3.2 与 NoteX 的关系

```text
NoteX UI / Chat
  ↓
SearchAdapter
  ↓
Research Engine Core
  ↓
Pipeline Events + Evidence Packet + Diagnostics + Answer Contract
  ↓
Answer Generator
  ↓
PostGenerationVerifier
  ↓
NoteX Renderer / Citation Renderer
```

第一阶段不做大 UI 改版，只允许最小必要的状态事件接入。普通模式显示简洁状态与最终引用；Developer Mode 显示完整链路。

---

## 4. 目标与非目标

### 4.1 目标

1. 将搜索系统从旧 NoteX 逻辑中独立出来，形成清晰模块边界。
2. 支持风险感知的搜索决策：稳定知识不乱搜，当前事实必须搜，高风险传闻必须有强证据。
3. 建立有界候选池：默认 quick 8–12、normal 20–30、deep 40–60，硬上限建议 64 或 100。
4. 建立动态候选调度：高质量来源优先读，慢来源不能阻塞整条链路。
5. 建立 PriorityBarrier：高优核心来源未完成/超时前，低质量快来源不能触发过早回答。
6. 支持并发 Reader：通过 worker pool 控制 `maxInflightReads`，避免串行 Fetch。
7. 支持取消、过期保护、worker lifecycle 和 in-flight dedupe：用户重新提问时旧任务停止或结果被忽略。
8. 支持多语言通道：中文 query、英文 query、site query 分开搜索，再合并候选池。
9. 支持来源质量模型：official、documentation、mainstream news、tech media、community、forum、seo aggregator、unknown。
10. 支持多阶段 Ranking：RRF / lexical / BM25-like / source quality / freshness / optional semantic rerank。
11. 支持聚类与多样性选择：避免同一事件或同一 host 占满阅读目标。
12. 支持 Markdown 保真抽取：保留代码块、数学公式、表格、列表、标题层级、链接上下文。
13. 支持 block-aware ExcerptBuilder：代码/公式/表格不被切半；长代码必须完整保留、结构化摘要或完整舍弃。
14. 支持 claim-level EvidenceEvaluator：分辨支持、反驳、过时、冲突、弱证据。
15. 支持 Answer Contract + Post-generation Verification：生成前约束，生成后机械校验。
16. 支持 EventBuffer：控制 UI 事件频率，普通模式不被事件洪水影响。
17. 支持 Developer Mode 诊断：能定位失败在 policy、planner、discovery、scheduler、reader、extractor、excerpt、evidence、answer verifier 哪一层。
18. 建立回归测试集：每次修改都能验证搜索决策、候选数量、调度顺序、证据质量、引用合法性和资源回收。

### 4.2 非目标

1. 不做通用爬虫，不长期抓取全网。
2. 不绕过登录、付费墙、Cookie、验证码、反爬机制。
3. 不读取浏览器历史、用户账号、私有页面。
4. Phase 1 不强依赖本地 embedding / cross-encoder / GPU。
5. Phase 1 不引入大型向量数据库。
6. 不默认使用无头浏览器自动化。
7. 不把 Firecrawl / Jina Reader / Browser Automation 作为硬依赖。
8. 不把 Evidence Gate 放宽成“没证据也能答”。
9. 不默认对所有问题搜索；普通翻译、润色、稳定概念解释仍应 no_search。
10. 不做大规模 UI 重构；涉及普通 UI 明显变化需单独讨论确认。
11. Phase 1 不做完整代码 AST 分析；先保证代码块完整性和语言标记，后续再考虑 Tree-sitter。
12. 不为了“高级”牺牲桌面端可维护性；算法增强必须能被关闭、降级和诊断。

---

## 5. 总体架构

```text
ResearchEngineCore
  ├─ SearchController
  ├─ SearchPolicyPlanner
  ├─ QueryPlanner
  ├─ DiscoveryManager
  ├─ CandidateNormalizer
  ├─ SourceRegistry
  ├─ CandidateScheduler
  │   ├─ PriorityQueue
  │   ├─ PriorityBarrier / ReadinessGate
  │   ├─ WorkerPool
  │   ├─ Watchdog
  │   └─ LifecycleManager
  ├─ Ranker
  │   ├─ LexicalRanker / BM25-like Ranker
  │   ├─ RRF Fusion
  │   ├─ SourceQualityRanker
  │   ├─ FreshnessRanker
  │   └─ SemanticReranker(optional)
  ├─ Clusterer
  │   ├─ HeuristicClusterer
  │   └─ SemanticGraphClusterer(optional)
  ├─ DiversitySelector
  ├─ UrlReader
  ├─ MarkdownExtractor
  ├─ PassageSelector / ExcerptBuilder
  ├─ EvidenceEvaluator
  ├─ ConflictResolver
  ├─ AnswerContractBuilder
  ├─ AnswerGeneratorAdapter
  ├─ PostGenerationVerifier
  ├─ CacheManager
  ├─ EventBuffer
  └─ DiagnosticsRecorder
```

关键变化：`CandidateScheduler` 不只是“按分数读网页”，还要承担早退门槛、并发资源、超时回收和事件节流的上游协作。

---

## 6. 数据结构设计

### 6.1 SearchRequest

```ts
type SearchDepth = "quick" | "normal" | "deep";
type SearchRisk = "low" | "medium" | "high";
type SearchFreshness = "stable" | "recent" | "latest" | "current";

type SearchRequest = {
  requestId: string;
  userQuestion: string;
  localeHint: "zh" | "en" | "mixed" | "auto";
  depth: SearchDepth;
  createdAt: number;
  abortSignal?: AbortSignal;
  currentNoteContext?: {
    title?: string;
    tags?: string[];
    summary?: string;
    path?: string;
  };
};
```

### 6.2 SearchDecision

```ts
type SearchDecision = {
  needSearch: boolean;
  reason: string;
  risk: SearchRisk;
  freshness: SearchFreshness;
  vertical:
    | "current_fact"
    | "news"
    | "technical_doc"
    | "oi_algorithm"
    | "rumor_check"
    | "product_version"
    | "policy"
    | "no_search";
  confidence: number;
  mustUseEvidence: boolean;
  allowedEvidenceLevel: "weak" | "medium" | "strong";
};
```

### 6.3 QueryPlan

```ts
type QueryPlan = {
  searchGoal: string;
  channels: Array<{
    language: "zh" | "en";
    query: string;
    intent: "broad" | "official" | "recent" | "refute" | "docs" | "forum";
    preferredDomains?: string[];
    negativeKeywords?: string[];
    maxResults: number;
  }>;
  entities: string[];
  mustFindPrimarySource: boolean;
};
```

### 6.4 Candidate

```ts
type Candidate = {
  candidateId: string;
  url: string;
  canonicalUrl: string;
  title: string;
  snippet?: string;
  host: string;
  provider: string;
  queryChannel: string;
  discoveredAt: number;
  sourceType:
    | "official"
    | "documentation"
    | "mainstream_news"
    | "tech_media"
    | "community"
    | "forum"
    | "seo_aggregator"
    | "unknown";
  sourceReliability: number;
  priorityTier: "core" | "preferred" | "supplemental" | "background";
  freshnessHint?: number;
  lexicalScore?: number;
  semanticScore?: number;
  freshnessScore?: number;
  sourceScore?: number;
  fusedScore?: number;
  priorityScore?: number;
  clusterId?: string;
  rejectedReason?: string;
};
```

`priorityTier` 用于早退屏障，而不是最终证据等级。比如 cppreference、React 官方文档、OpenAI News、OI Wiki 可以是 `core/preferred`，CSDN/转载站通常只能是 `supplemental/background`。

### 6.5 CandidateScheduler

```ts
type SchedulerConfig = {
  maxCandidates: number;      // quick 16 / normal 64 / deep 100
  maxReadTargets: number;     // quick 3-4 / normal 6-10 / deep 10-14
  maxInflightReads: number;   // desktop default 3-4
  perHostLimit: number;       // default 2
  readTimeoutMs: number;      // default 5000-8000
  firstUsefulEvidenceMs: number;
  softDeadlineMs: number;
  hardDeadlineMs: number;
  priorityBarrierMs: number;  // 等核心来源的最长屏障时间
  eventFlushIntervalMs: number; // default around 100ms
};

type SchedulerState = {
  queueSize: number;
  inflightReads: number;
  completedReads: number;
  skippedCandidates: number;
  corePending: number;
  coreCompleted: number;
  coreTimedOut: number;
  evidenceReady: boolean;
  priorityBarrierSatisfied: boolean;
  canEarlyAnswer: boolean;
};
```

实现建议：

- 用成熟容器实现优先队列，不手写复杂堆。
- TypeScript 侧可用数组堆封装；Rust 侧可用 `BinaryHeap` + wrapper。
- 候选池必须有硬上限，避免无限 discovery。
- 读取任务按照 `priorityScore` 出队。
- 高优来源先读，但低优来源不能永远饥饿，可加 aging。
- host 并发要限流，避免同一站点被连续请求。
- `evidenceReady=true` 只是必要条件，不是充分条件；早退还必须满足 `priorityBarrierSatisfied=true`。

PriorityScore 示例：

```text
priorityScore =
  sourceReliability
  + freshnessScore
  + lexicalOrSemanticRelevance
  + officialBoost
  + exactEntityBoost
  + priorityTierBoost
  - seoPenalty
  - duplicatePenalty
  - slowHostPenalty
```

这不是最终相关性分数，而是调度分数，目标是让最可能产出强证据的页面先被读取。

### 6.6 PriorityBarrier / ReadinessGate

第三轮 Review 指出的关键风险是：低质量但响应快的来源可能先凑够 medium evidence，导致系统提前生成并取消还在路上的官方/权威来源。v0.4 明确禁止这种早退。

```ts
type ReadinessGate = {
  evidenceThresholdSatisfied: boolean;
  priorityBarrierSatisfied: boolean;
  requiredCoreCandidates: string[];
  pendingCoreCandidates: string[];
  timedOutCoreCandidates: string[];
  lowQualityOnlyEvidence: boolean;
  canBuildContract: boolean;
  reason: string;
};
```

`canBuildContract` 只能在以下条件之一成立时为 true：

```text
1. evidenceThresholdSatisfied=true
   且 priorityBarrierSatisfied=true

2. hardDeadline 到达
   且已没有可继续等待的高优来源
   且 EvidenceEvaluator 能给出明确的“证据不足/谨慎回答”契约

3. 所有 core/preferred 来源已完成、失败或超时
   且当前证据满足对应风险等级门槛
```

错误早退示例：

```text
CSDN 300ms 返回 2 条 medium
cppreference / official docs 仍在读取
=> 不允许立即生成直接答案
=> 只能显示“已找到补充来源，仍在等待高优来源”
```

正确早退示例：

```text
官方文档 900ms 返回 strong
另一个媒体来源 1100ms 返回 medium
剩余低优论坛仍在读取
=> 允许提前生成
```

### 6.7 ReadResult

```ts
type ReadResult = {
  candidateId: string;
  url: string;
  finalUrl: string;
  status:
    | "fetched"
    | "partial"
    | "blocked"
    | "timeout"
    | "needs_js"
    | "homepage"
    | "wrong_page_type"
    | "too_short"
    | "parse_failed"
    | "aborted"
    | "zombie_discarded";
  contentType?: string;
  bodyBytes?: number;
  markdown?: string;
  title?: string;
  publishedAt?: string;
  extractedTextChars?: number;
  markdownChars?: number;
  preservedBlocks?: {
    codeBlocks: number;
    mathBlocks: number;
    tables: number;
    lists: number;
    headings: number;
  };
  lifecycle?: {
    startedAt: number;
    finishedAt?: number;
    timedOut: boolean;
    aborted: boolean;
    stale: boolean;
    workerId?: string;
  };
  failureReason?: string;
};
```

### 6.8 Excerpt

```ts
type PassageBlockType =
  | "paragraph"
  | "heading"
  | "fenced_code"
  | "inline_code_context"
  | "math_block"
  | "math_inline_context"
  | "table"
  | "list"
  | "quote";

type ExcerptBlock = {
  blockId: string;
  type: PassageBlockType;
  text: string;
  headingPath?: string[];
  score: number;
  reason: string;
  complete: boolean;       // false 的代码/公式块禁止进入证据包
  truncated: boolean;      // fenced_code/math_block/table 原则上不允许 true
  language?: string;
  lineStart?: number;
  lineEnd?: number;
};

type Excerpt = {
  candidateId: string;
  sourceId: string;
  blocks: ExcerptBlock[];
  totalChars: number;
  relevanceSummary: string;
  omittedBlocks: Array<{
    blockId: string;
    type: PassageBlockType;
    reason: "budget" | "irrelevant" | "too_large" | "unsafe_incomplete";
  }>;
};
```

### 6.9 Evidence Packet

```ts
type EvidenceLevel = "strong" | "medium" | "weak" | "none";
type EvidenceStance = "supports" | "refutes" | "updates" | "background" | "unclear";

type EvidenceItem = {
  sourceId: string;
  candidateId: string;
  url: string;
  title: string;
  sourceType: Candidate["sourceType"];
  priorityTier: Candidate["priorityTier"];
  reliability: number;
  publishedAt?: string;
  level: EvidenceLevel;
  stance: EvidenceStance;
  claimKeys: string[];
  excerptBlockIds: string[];
  excerpt: string;
  reason: string;
};

type ClaimEvidenceSet = {
  claimKey: string;
  claimText: string;
  supporting: EvidenceItem[];
  refuting: EvidenceItem[];
  updating: EvidenceItem[];
  unresolved: EvidenceItem[];
  resolution:
    | "supported"
    | "refuted"
    | "updated_by_newer_authority"
    | "conflicting"
    | "insufficient";
  resolutionReason: string;
};

type EvidencePacket = {
  requestId: string;
  decision: SearchDecision;
  items: EvidenceItem[];
  claims: ClaimEvidenceSet[];
  readinessGate: ReadinessGate;
  overallLevel: EvidenceLevel;
  conflictSummary?: string;
  canAnswer: boolean;
  mustHedge: boolean;
  forbiddenClaims: string[];
};
```

### 6.10 AnswerContract

```ts
type AnswerContract = {
  requestId: string;
  canAnswer: boolean;
  answerMode:
    | "direct_with_citations"
    | "cautious_summary"
    | "insufficient_evidence"
    | "refuse_current_fact_claim";
  allowedClaims: string[];
  forbiddenClaims: string[];
  requiredCitations: Array<{
    claimKey: string;
    minEvidenceLevel: EvidenceLevel;
    sourceIds: string[];
  }>;
  mustMentionUncertainty: boolean;
  citationStyle: "S_bracket";
  repairPolicy: "no_repair" | "format_repair_only" | "strict_rewrite_with_reduced_context";
};
```

### 6.11 PostGenerationReport

```ts
type PostGenerationReport = {
  passed: boolean;
  invalidCitationIds: string[];
  uncitedStrongClaims: string[];
  forbiddenClaimHits: string[];
  overconfidentPhrases: string[];
  repairAttempted: boolean;
  repairAllowed: boolean;
  finalAction: "accept" | "fallback" | "strict_rewrite_once";
  fallbackReason?: string;
};
```

---

## 7. Pipeline 与调度流程

### 7.1 不再使用纯串行流水线

错误模式：

```text
搜完所有 query
→ 合并所有候选
→ 排序
→ 等所有 read target 读完
→ 再评估证据
→ 再回答
```

正确模式：

```text
SearchJob created
→ Policy / QueryPlan ready
→ Discovery channel 分批产出候选
→ CandidateNormalizer 增量标准化
→ Scheduler 按 priorityScore 入队
→ Worker pool 并发读取高优候选
→ 每个 ReadResult 立刻进入 ExcerptBuilder
→ EvidenceEvaluator 增量更新 EvidencePacket
→ ReadinessGate 判断是否可以生成
→ 只有 evidence threshold + priority barrier 同时满足，才允许提前生成
→ 慢来源继续完成、超时或被 hard deadline 截断
→ AnswerContractBuilder 生成契约
→ AnswerGeneratorAdapter 生成文本
→ PostGenerationVerifier 校验输出
→ 通过则展示，失败则 fallback / 受控重写
```

### 7.2 PipelineEvent

```ts
type PipelineEvent =
  | { type: "job_started"; requestId: string }
  | { type: "policy_decided"; decision: SearchDecision }
  | { type: "query_planned"; plan: QueryPlan }
  | { type: "candidates_discovered"; count: number; total: number }
  | { type: "candidate_scheduled"; candidateId: string; priorityScore: number; priorityTier: Candidate["priorityTier"] }
  | { type: "read_started"; candidateId: string; host: string; title: string }
  | { type: "read_finished"; result: ReadResult }
  | { type: "excerpt_built"; candidateId: string; chars: number; blocks: number }
  | { type: "evidence_updated"; overallLevel: EvidenceLevel; canAnswer: boolean }
  | { type: "readiness_gate_updated"; gate: ReadinessGate }
  | { type: "source_rejected"; candidateId: string; reason: string }
  | { type: "contract_ready"; contract: AnswerContract }
  | { type: "post_verification_finished"; report: PostGenerationReport }
  | { type: "job_aborted"; reason: string }
  | { type: "job_failed"; stage: string; reason: string };
```

这些事件是核心内部日志，不等于 UI 每条都要渲染。

### 7.3 EventBuffer / UI 节流

单次搜索可能产生几百条事件。普通 UI 如果每条事件都 `setState`，会造成输入卡顿和渲染雪崩。

因此必须新增 EventBuffer：

```ts
type EventBufferConfig = {
  flushIntervalMs: number;       // default 100ms
  maxBufferedEvents: number;     // default 200
  maxVisibleDevEvents: number;   // default 300-500
  mode: "normal" | "developer";
};
```

普通模式只输出聚合状态：

```text
正在规划搜索
已找到 18 个候选来源
正在读取 4 个高价值来源
已排除 5 个低质量/重复来源
已找到补充来源，仍在等待高优来源
证据不足，继续补查
已形成 3 条可引用证据
```

Developer Mode 可以展示完整事件，但也要做上限和折叠：

```text
保留最近 N 条事件
同类 read_started/read_finished 可折叠
source_rejected 可按 reason 聚合
```

### 7.4 Deadline 策略

每个 job 有四类 deadline：

```ts
type DeadlinePolicy = {
  firstUsefulEvidenceMs: number; // 希望多久内拿到第一条可用证据
  priorityBarrierMs: number;     // 核心来源屏障最长等待时间
  softDeadlineMs: number;        // 证据够 + barrier 满足后可生成
  hardDeadlineMs: number;        // 到达后强制停止剩余 reader
};
```

建议初始值：

```text
quick:  firstUseful 1500ms, barrier 2500ms, soft 4000ms, hard 7000ms
normal: firstUseful 2500ms, barrier 4500ms, soft 7000ms, hard 12000ms
deep:   firstUseful 4000ms, barrier 8000ms, soft 12000ms, hard 20000ms
```

这些不是 UI 承诺时间，只是内部调度预算。

### 7.5 早退规则

早退必须满足：

```text
canEarlyAnswer =
  evidenceThresholdSatisfied
  AND priorityBarrierSatisfied
  AND not lowQualityOnlyEvidence
  AND postableContractCanBeBuilt
```

其中 `priorityBarrierSatisfied` 的定义：

```text
核心来源已完成并产出证据
OR 核心来源已明确失败/blocked/needs_js/timeout
OR priorityBarrierMs 已到达，且至少尝试过核心来源
OR 当前已有 strong evidence 来自 core/preferred 来源
```

禁止：

```text
只有 SEO / 论坛 / 低质量转载 medium evidence 时提前生成直接事实答案。
```

允许：

```text
生成“目前只读到低质量补充来源，仍缺少权威来源，因此不能下结论”的保守回答。
```

---

## 8. Ranking 设计

### 8.1 分阶段排序，而不是单个万能公式

Ranking 分三层：

```text
Stage A: Candidate-level pre-rank
  用 title/snippet/url/host/source registry/freshness hint 做快速初排。

Stage B: Fusion rank
  合并多个 query/channel/provider 的排名，推荐 RRF 或 rank-based fusion，避免不同 provider score 不可比。

Stage C: Read-aware rerank
  读取后用 excerpt/markdown 重新判断相关性与证据价值。
```

### 8.2 Baseline 特征

```text
lexicalRelevance: title/snippet/url 是否命中实体、关键词、题号、错误信息
sourceQuality: official/documentation/mainstream > community/forum > SEO/unknown
freshness: 对 news/current 更重要，对 stable docs 次要
pageType: article/docs/problem/editorial > homepage/tag/search/listing
entityMatch: 人名、公司名、题号、库名是否准确
queryIntentMatch: docs/news/refute/forum 是否符合 QueryPlan channel
```

### 8.3 RRF Fusion

多个 query / provider 的原始分数不可直接比较，建议先用 rank-based fusion：

```text
RRF(d) = Σ 1 / (k + rank_i(d))
```

好处：

1. 不需要不同 provider 分数同尺度。
2. 对多 query 召回更稳。
3. 可解释，适合 Phase 1–3。

### 8.4 Dynamic Alpha / Semantic Rerank

长期方向：

```text
FinalScore = alpha(queryIntent) * BM25Like(q, d)
           + (1 - alpha(queryIntent)) * SemanticScore(q, d)
           + SourceQualityBoost
           + FreshnessBoost
           - SpamPenalty
```

但 v0.4 仍明确：

```text
Phase 1 不强依赖 embedding/cross-encoder。
Phase 3/8 预留 SemanticReranker interface。
关闭语义模型后，baseline 必须仍可工作。
```

动态 alpha 示例：

| Query 类型 | alpha 倾向 | 原因 |
|---|---:|---|
| 编译报错、具体 API、题号 | 高 | 精确词匹配很重要 |
| 概念解释、同义词、新闻概括 | 中低 | 语义匹配更有价值 |
| 人物传闻核查 | 中 | 实体精确 + 语义反驳都重要 |
| OI 实现坑 | 中高 | 算法名/错误词/代码词强相关 |

---

## 9. Clustering / Diversity

### 9.1 为什么需要聚类

不聚类会导致：

1. 同一新闻事件被 8 个媒体转载占满。
2. 同一文档不同 tracking URL 重复。
3. 同一 CSDN 转载群压过官方来源。
4. Token 被重复内容浪费。

### 9.2 Phase 1 HeuristicClusterer

先使用低成本特征：

```text
canonicalUrl
host + normalized path
title token overlap
entity overlap
date hint
snippet shingle / simhash
source copied signal
```

单次候选通常 `N≤64/100`，`O(N^2)` 相似度比较可接受。真正风险不是复杂度，而是漏聚类和误聚类。

### 9.3 Phase 3/8 SemanticGraphClusterer optional

后续可选：

```text
candidate/excerpt embedding
cosine similarity edge
threshold union
DSU connected components
component representative selection
```

原则：

1. 不引入链式前向星等复杂结构。
2. 单次请求小图用数组/邻接表/DSU 即可。
3. 代表节点选择看 source quality、freshness、readability、evidence level，而不是只看相似度中心。

### 9.4 DiversitySelector

从每个 cluster 选择代表时，确保：

```text
官方/权威来源保留
不同事件保留
不同语言通道适度保留
同 host 不超过 perHostLimit
SEO/转载不能占满 read target
```

---

## 10. UrlReader / MarkdownExtractor

### 10.1 Reader 状态

```text
fetched
partial
blocked
timeout
needs_js
homepage
wrong_page_type
too_short
parse_failed
aborted
zombie_discarded
```

### 10.2 Markdown 保真抽取

Extractor 输出的不是纯文本，而是结构化 Markdown。

必须保留：

```text
heading hierarchy
paragraphs
fenced code blocks with language
inline code
display math / inline math
tables
ordered/unordered lists
blockquote
important links and anchor text
published time / updated time hints
```

必须剔除：

```text
script/style/nav/footer/sidebar
cookie banner
ads
related posts
comment spam
share widgets
search result list when not target page
```

### 10.3 DOM 遍历策略

实现不应使用全局正则剥 HTML。

建议：

1. 使用成熟 HTML parser。
2. DOM traversal 可用显式 stack/queue，避免深层 DOM 递归爆栈。
3. 设置 node limit / depth limit / body size limit。
4. 针对 `pre/code/table/ul/ol/math` 等节点触发专用 Markdown serializer。
5. 对常见代码高亮结构做兼容：`pre > code`、`div[class*=highlight]`、`td.rouge-code` 等。
6. 如果页面只有 meta description / title，没有正文，则不能产生 strong evidence。

### 10.4 技术文档特殊通道

对高优技术来源可尝试：

```text
GitHub raw / README
llms.txt / llms-full.txt
sitemap / docs static JSON
官方文档静态页面
```

ExternalMarkdownReader 可以接 Jina Reader / Firecrawl，但必须满足：

1. 默认关闭，需要用户设置或开发模式开启。
2. 不发送私有页面、Cookie、登录态内容。
3. 记录 provider、URL、状态和失败原因。
4. 失败后回退到 native reader。

---

## 11. PassageSelector / ExcerptBuilder

### 11.1 为什么需要 ExcerptBuilder

不能把 8–12 个网页全文塞给主模型，否则会造成：

1. token 成本高；
2. 长上下文中间信息丢失；
3. 证据噪声污染回答；
4. 后置校验困难。

### 11.2 Block-aware Passage 选择策略

每篇文档先分块：

```text
heading block
paragraph block
fenced code block
inline code context block
math block
list block
table block
quote block
```

每个 block 打分：

```text
query entity match
claim keyword match
freshness/date match
contains code/math/table
source section importance
proximity to heading
language match
line range relevance
```

每个 source 初始预算：

```text
quick: 800-1200 chars/source
normal: 1200-2000 chars/source
deep: 1500-3000 chars/source
```

但是预算不是简单字符刀。v0.4 明确规则：

```text
paragraph 可以按句子边界截断。
list/table 尽量按行边界截断，截断后必须标记 incomplete，不能作为 strong evidence。
fenced_code/math_block 不允许切半。
超大代码块要么完整保留，要么抽取相关完整函数/片段，要么完整舍弃并记录 omitted reason。
```

### 11.3 代码块处理规则

Phase 1 不做完整 AST，但必须保证基本完整性：

1. fenced code block 必须保持开闭 fence 成对。
2. 代码块如果超过预算，默认不物理截断。
3. 可选做 language-aware trimming：按空行、函数边界的简单启发式选完整片段。
4. 如果无法保证完整片段，则丢弃该代码块，并保留附近解释性段落。
5. EvidenceItem 如果依赖代码块，必须记录 `complete=true`。
6. `complete=false` 的代码块不能作为 strong evidence 支撑实现细节。

后续增强可选：

```text
Tree-sitter parse
函数级切分
符号索引
只抽取与 query 相关的函数
```

但这不是 Phase 1 硬依赖。

### 11.4 数学公式处理规则

1. display math 块不切半。
2. inline math 尽量随句子保留。
3. 如果公式过长导致预算超限，保留公式所在段落或完整舍弃。
4. 被截断/乱码的公式不能作为 strong evidence。
5. OI/算法题解中，公式、变量定义、状态转移必须尽量和前后解释一起选入。

### 11.5 Excerpt 输出要求

Excerpt 不能只是摘要，还要保留证据定位：

```text
source id
heading path
selected block ids
line range when available
why selected
contains code/math/date flags
complete/truncated flags
omitted block summary
```

---

## 12. EvidenceEvaluator 与 ConflictResolver

### 12.1 Evidence 分级

```text
strong:
  正文可读 + 来源可靠 + 与问题直接相关 + 时间合适 + 可支持具体 claim
  对代码/公式相关 claim，还要求相关 block 完整。

medium:
  正文可读 + 来源普通/时间不完全明确 + 能支持部分 claim

weak:
  只有标题/snippet/摘要，或来源可靠但正文不可读，或只提供背景信息

none:
  不可读、不相关、首页、搜索页、SEO 聚合、内容过短、无法支持 claim
```

### 12.2 Claim-level 评估

不要只对整篇网页打分，要对 claim 打分。

例如用户问：

```text
张雪峰死了吗
```

系统应形成 claim：

```text
claim: 张雪峰已去世
```

Evidence stance：

```text
supports: 有权威来源明确说去世
refutes: 有近期本人/官方公开活动、辟谣、权威媒体否认
background: 只是介绍人物，不足以支持/反驳
unclear: 标题党、论坛传言、摘要不完整
```

回答不能因为“搜不到去世”就断言“没死”；只能说“未检索到可靠公开来源支持该传闻”。如果有近期可靠公开活动或权威辟谣，才可以更明确地说明。

### 12.3 冲突消解不是简单拓扑排序

冲突处理采用：

```text
claim-level conflict set
+ temporal ordering
+ source authority ordering
+ explicit update/refute relation
+ optional citation graph
```

规则：

1. 最新不一定正确。
2. 官方/权威来源优先于论坛/SEO。
3. 弱证据只能作为背景，不能压过 strong evidence。
4. 高风险问题必须有强证据，否则保守回答。
5. 技术文档以官方当前文档优先；旧博客可作为历史背景。

### 12.4 ConflictResolver 规则

```ts
type ConflictResolutionPolicy = {
  preferOfficialForDocs: boolean;
  preferAuthoritativeRecentForNews: boolean;
  preferPrimarySourceForCompanyNews: boolean;
  requireStrongEvidenceForHighRisk: boolean;
  allowWeakEvidenceAsBackgroundOnly: boolean;
  requireCompleteCodeBlockForCodeClaims: boolean;
};
```

常见规则：

1. **技术文档**：官方文档 > 官方博客 > 主流社区 > 论坛问答 > SEO 聚合。
2. **新闻动态**：官方公告 / 当事方声明 + 权威媒体报道优先；最新权威来源可以更新旧来源。
3. **人物生死 / 负面传闻**：没有权威来源不能下定论；论坛、短视频、SEO 摘要不能作为 strong evidence。
4. **版本/API**：官方当前文档优先；旧博客如果与官方冲突，应标为 outdated。
5. **OI 题解/算法**：官方题面、OI Wiki、CP-algorithms、高质量题解优先；CSDN/转载可做背景但不能压过高质量来源。
6. **代码实现细节**：依赖的代码块必须完整；不完整代码块只能作为背景或被舍弃。

---

## 13. Answer Contract 与后置校验

### 13.1 生成前契约

AnswerContract 必须告诉模型：

```text
可以说什么
不能说什么
哪些 claim 必须引用
哪些 evidence 只能作为背景
是否必须表达不确定性
是否只能给“证据不足”回答
哪些代码/公式证据是完整的
```

### 13.2 生成后校验

PostGenerationVerifier 做机械检查：

1. 引用编号是否存在。
2. 是否引用了不允许引用的 weak/none source。
3. 强断言是否没有引用。
4. 是否命中 forbiddenClaims。
5. 是否把“证据不足”改写成了确定结论。
6. 是否在高风险问题中使用了过强措辞。
7. 是否引用了 incomplete code/math block 来支撑实现细节。
8. 是否输出了不可见/未映射 citation id。

### 13.3 Repair Policy

v0.4 明确：校验失败后，不默认相信模型能自我修复。

```text
invalid citation id
→ 直接 fallback，或删除非法引用并降级为证据不足模板。

forbidden claim hit
→ 直接 fallback。

high-risk overclaim
→ 直接 fallback。

uncited strong claim
→ 如果对应 claim 在 EvidencePacket 中有明确 source，可执行 strict_rewrite_once；否则 fallback。

minor citation format error
→ format_repair_only。
```

`strict_rewrite_once` 必须伴随物理干预：

1. 只传允许的 EvidenceItems。
2. 移除 weak/none/background-only 证据。
3. 明确列出 allowedClaims。
4. 禁止模型新增引用编号。
5. 重写仍失败则 fallback，不进入循环。

### 13.4 引用合法性

正文中的 `[[S1]]` / `[S1]` 必须映射到 EvidencePacket 中存在且可见的 source。

如果模型输出不存在的引用：

```text
invalidCitationIds = ["S7"]
passed = false
finalAction = "fallback"
fallbackReason = "invalid citation id"
```

---

## 14. Cache / Abort / Dedupe / Worker Lifecycle

### 14.1 Abort

每个 SearchJob 必须绑定：

```text
requestId
abortToken / AbortSignal
createdAt
active flag
job epoch
```

用户重新提问时：

1. 旧 job 收到 abort。
2. 正在 fetch 的 reader 尽量取消。
3. 已返回的旧结果被 stale guard 忽略。
4. UI 不再展示旧 job 的后续事件。
5. Worker lease 到期后强制释放资源。

### 14.2 Zombie Requests

AbortSignal 不能保证 DNS、TLS、socket 阻塞立刻结束，所以需要额外生命周期管理。

```ts
type WorkerLease = {
  workerId: string;
  requestId: string;
  candidateId: string;
  startedAt: number;
  softTimeoutAt: number;
  hardTimeoutAt: number;
  state: "running" | "aborting" | "finished" | "timed_out" | "zombie_discarded";
};
```

规则：

1. 每个 reader 有 read timeout。
2. 每个 worker 有 hard timeout。
3. Watchdog 定期扫描超时 worker。
4. 超过 hard timeout 的结果即使最终返回，也标记 `zombie_discarded`，不得进入 EvidencePacket。
5. 限制全局 in-flight read 数量，避免连续提问积压。
6. 对同 host 设置连接预算和退避。
7. `requestId + job epoch` 不匹配的事件全部丢弃。

### 14.3 Cache 层级

```text
QueryPlan cache: 同一问题短时间重复问，可复用规划
Discovery cache: 同一 query 5-10 分钟复用候选 URL
Read cache: 同一 URL 短时间复用 markdown/excerpt，按内容类型和 freshness 调 TTL
SourceRegistry cache: 域名质量长期缓存
In-flight dedupe: 同一 URL 正在读取时复用同一个 Promise/任务
```

### 14.4 Freshness 与缓存

缓存不能破坏时效性。

建议：

| 类型 | TTL |
|---|---:|
| latest/current/news | 3–10 分钟 |
| technical docs | 1–24 小时 |
| stable OI/算法资料 | 1–7 天 |
| source registry | 7–30 天 |

高风险当前事实查询不能只用旧缓存下结论；旧缓存最多作为背景。

---

## 15. Diagnostics

Developer Mode 至少展示：

```text
ranking feature breakdown
scheduler queue / inflight / completed / timeout / zombie count
priority barrier status
core/preferred candidates pending/completed/timed out
event buffer stats
cluster count / representative source
extractor preserved block stats
excerpt omitted blocks and reasons
conflict sets
claim-level evidence
answer contract
post-generation verification report
failure stage
```

普通模式只展示：

```text
正在搜索 / 正在读取 / 等待高优来源 / 已找到来源 / 证据不足 / 引用来源
```

普通模式不展示几百条原始事件。

---

## 16. 回归测试设计

### 16.1 Policy 测试

```text
React useEffect 是什么 -> docs_technical or no_search depending setting, not news
最近 OpenAI 有什么新闻 -> news/current, needSearch=true
张雪峰死了吗 -> rumor_check/high risk, needSearch=true, strong evidence required
最近这个词英语怎么说 -> no_search
P3379 LCA 怎么做 -> oi_algorithm, may use local+web
帮我润色这段文字 -> no_search
```

### 16.2 Scheduler / ReadinessGate 测试

1. 高优官方来源应先进入 read queue。
2. 慢来源不能阻塞其他来源完成。
3. 仅低优 medium evidence 不得触发直接早退。
4. 高优 core 来源未完成但 priorityBarrierMs 未到时，不允许低质量来源抢跑。
5. core 来源超时后，系统可以生成保守契约或继续基于已有强证据回答。
6. 达到 soft deadline 且 evidence threshold + priority barrier 都满足时可以生成。
7. per-host limit 生效。
8. in-flight dedupe 生效。
9. aging 不应让 SEO 来源超过核心权威来源。

### 16.3 EventBuffer 测试

1. 300 条 PipelineEvent 不应触发 300 次 UI setState。
2. 普通模式只收到聚合事件。
3. Developer Mode 保留完整信息但有最大日志上限。
4. 同类 source_rejected 可以按 reason 聚合。
5. abort 后旧 job 的 buffered events 不应 flush 到新 job。

### 16.4 Abort / Worker Lifecycle 测试

1. abort 后不应继续推送旧事件。
2. stale requestId/job epoch 的结果被丢弃。
3. read timeout 生效。
4. hard timeout 后 late result 标记 `zombie_discarded`。
5. 连续快速提问不会累积无限 in-flight read。
6. 同 host 连接失败后有退避。

### 16.5 Ranking / Clustering 测试

1. 同一 URL tracking 参数应合并。
2. 同一事件多篇转载应聚成一组。
3. 不同事件不能因为同一实体被误聚。
4. 官方文档应优先于 SEO 聚合。
5. 代码报错 query lexical 权重更高。
6. 概念解释 query semantic 权重可更高。

### 16.6 Extractor 测试

1. 保留 fenced code block。
2. 保留 inline code。
3. 保留 `$$...$$` 和 `$...$`。
4. 表格转 Markdown table。
5. 深层 DOM 不爆栈。
6. script/style/nav/footer 不进入正文。
7. meta description only 不应成为 strong evidence。
8. homepage/search page/tag page 被识别。
9. 代码 fence 不会丢失结束符。
10. 公式块不会被切半。

### 16.7 ExcerptBuilder 测试

1. 段落可按句子边界截断。
2. fenced code 不按字符切半。
3. display math 不按字符切半。
4. 超大代码块要么完整保留，要么完整舍弃并记录 reason。
5. incomplete code/math 不得支撑 strong evidence。
6. OI 状态转移公式应尽量连同变量解释一起选入。

### 16.8 Evidence / Conflict 测试

1. 高风险传闻无强证据时不能下定论。
2. 官方当前文档应覆盖旧博客。
3. 官方公告与媒体报道冲突时要解释不确定性。
4. weak evidence 只能作为背景。
5. refuting evidence 不应被当成 supporting evidence。
6. 依赖不完整代码块的实现 claim 不得为 strong。

### 16.9 Post-generation 测试

1. 不存在的引用编号必须拦截。
2. 无引用强断言必须拦截。
3. forbidden claim 命中必须 fallback。
4. “证据不足”不能被改写成确定结论。
5. invalid citation 不进入无限 repair。
6. repair_once 只能在 reduced context 下执行一次。
7. 第二次失败必须 fallback。

---

## 17. 分阶段落地计划

### Phase 0：旧系统审计与接口冻结

目标：不改 UI，不动大逻辑，确认旧链路输入输出。

产物：

```text
旧 SearchDecision 输入输出表
旧 source/citation 数据结构表
旧 diagnostics 字段表
旧失败 case 列表
```

验收：

```text
能说明旧系统失败在哪些层
能列出新旧系统兼容字段
工作区状态明确，不假设干净
```

### Phase 1：Contracts + Policy + QueryPlan

目标：先建类型，不接复杂 reader。

产物：

```text
search_engine/contracts.ts
search_engine/policy.ts
search_engine/queryPlanner.ts
search_engine/testCases.ts
```

验收：

```text
Policy 测试通过
QueryPlan 可生成多语言、多通道 query
不影响旧搜索链路
不接 UI 大改
不引入 embedding 硬依赖
```

### Phase 2：Discovery Pool + CandidateScheduler + EventBuffer

目标：把候选池、调度机制和事件节流独立出来。

产物：

```text
DiscoveryManager
CandidateNormalizer
CandidateScheduler
PriorityBarrier / ReadinessGate
PipelineEvent
EventBuffer
Abort / stale guard / in-flight dedupe
Worker lifecycle / watchdog
```

验收：

```text
能发现 20–30 个候选
能按 priority 触发 read
慢候选不阻塞快候选
低优快证据不能抢跑高优慢证据
abort 生效
zombie result 被丢弃
普通 UI 不被事件洪水打爆
Developer Mode 能看到 scheduler 状态
```

### Phase 3：Ranking / Fusion / Clustering / Diversity

目标：替换脆弱线性排序。

产物：

```text
RRF fusion
SourceRegistry rank
Freshness rank
HeuristicClusterer
DiversitySelector
SemanticReranker interface optional
```

验收：

```text
同一事件不过度重复
官方/权威来源优先
不同事件保留多样性
没有 embedding 时仍能工作
```

### Phase 4：UrlReader + MarkdownExtractor

目标：让 Reader 成为可靠子系统。

产物：

```text
NativeHttpReader
MarkdownExtractor
Block parser
SourceSpecificAdapter optional
ExternalMarkdownReader optional
Extractor diagnostics
```

验收：

```text
代码块/公式/表格/标题保留
代码/公式不切半
JS/blocked/homepage/too_short 状态清晰
meta-only 不作为 strong evidence
```

### Phase 5：ExcerptBuilder + EvidenceEvaluator + ConflictResolver

目标：从网页内容变成证据包。

产物：

```text
PassageSelector
Block-aware ExcerptBuilder
ClaimExtractor
EvidenceEvaluator
ConflictResolver
EvidencePacket
```

验收：

```text
不会全文堆 prompt
不会把半截代码/公式当证据
能输出支持/反驳/背景/冲突
高风险问题证据不足时保守回答
```

### Phase 6：AnswerContract + PostGenerationVerifier

目标：让回答闭环。

产物：

```text
AnswerContractBuilder
PostGenerationVerifier
fallback conservative answer
citation legality check
reduced-context strict rewrite once
```

验收：

```text
非法引用被拦截
无引用强断言被拦截
forbidden claim 被拦截
repair 不会循环
第二次失败 fallback
```

### Phase 7：NoteX 接入与 UI 状态事件

目标：最小接入，不做大 UI 改版。

产物：

```text
SearchAdapter
PipelineEvent UI bridge
EventBuffer store integration
普通状态展示
Developer Mode diagnostics
```

验收：

```text
普通用户看到简洁状态和引用
开发模式看到完整链路
输入框不卡顿
旧功能不回归
```

### Phase 8：可选语义增强

目标：在基础链路稳定后，再接 embedding / rerank。

可选方向：

```text
ONNX BGE micro embedding
remote rerank provider
semantic clustering
semantic passage selection
small local vector cache
Tree-sitter code block slicing
```

验收：

```text
语义增强可开关
关闭后 baseline 仍可工作
不会显著拖慢 quick/normal 模式
```

---

## 18. MVP 建议

最小可行版本不要一上来实现全部算法。

推荐 MVP：

```text
Phase 1 + Phase 2 skeleton + baseline Reader Adapter + baseline Evidence
```

也就是：

1. 先把类型和 pipeline 拆出来。
2. 实现候选池、调度、PriorityBarrier、取消、事件缓冲。
3. Reader 先允许可选外部 Markdown reader 跑通验证，但 native extractor 同时保留。
4. Evidence 先做到 strong/medium/weak/none 和 high-risk gate。
5. Post-generation 先做引用合法性、无引用强断言扫描和确定性 fallback。

不要第一天就实现 embedding、DAG、复杂 AST。那样会把主线拖死。

---

## 19. 执行前自审

### 19.1 对第三轮 Review 的最终判断

必须立即吸收：

```text
PriorityBarrier，避免低质量快源抢跑
block-aware excerpt，避免半截代码/公式污染证据
PostGenerationVerifier deterministic-first，避免 repair_once 变成幻觉循环
EventBuffer，避免 PipelineEvent 渲染雪崩
Worker lifecycle + watchdog，避免 Zombie Requests
```

应预留接口、后续增强：

```text
embedding rerank
cross-encoder
semantic graph clustering
citation graph / DAG
Tree-sitter / AST code slicing
动态 alpha 学习或配置化
```

暂不机械采纳：

```text
把桌面端 MVP 按多租户高并发服务设计
强制预分配固定 N=64 内存池
把 O(N^2) 聚类视为主要瓶颈
用拓扑排序强制选择最新来源
Phase 1 强依赖本地模型或外部 reader 服务
```

### 19.2 v0.4 自审结果

| 检查项 | 结果 | 说明 |
|---|---|---|
| 是否仍然串行批处理 | 通过 | 已改为 SearchJob + CandidateScheduler + WorkerPool + EventBuffer |
| 是否会低质量快源抢跑 | 通过 | 新增 PriorityBarrier / ReadinessGate，early answer 需要 barrier satisfied |
| 是否会切半代码/公式 | 通过 | ExcerptBlock 有 complete/truncated 标记，代码/公式块禁止物理切半 |
| 是否仍然依赖 prompt 自我修复 | 通过 | PostGenerationVerifier 改为 deterministic-first，非法引用/forbidden claim 默认 fallback |
| 是否可能 UI 渲染雪崩 | 通过 | 新增 EventBuffer，普通模式只推聚合状态 |
| 是否可能 Zombie Request 污染结果 | 通过 | 新增 WorkerLease、watchdog、hard timeout、zombie_discarded、job epoch |
| Phase 1 是否过重 | 通过 | Phase 1 只做 contracts/policy/queryPlan/testCases，不碰 reader 大工程 |
| 是否违反隐私/反爬边界 | 通过 | 非目标明确不绕过登录、Cookie、验证码、付费墙，不默认无头浏览器 |
| 是否符合 NoteX 现阶段产品 | 通过 | 仍按桌面单用户优先，保留后续服务化空间 |
| 是否可测试 | 通过 | 新增 Scheduler、EventBuffer、Abort、Excerpt、Post-generation 专项测试 |

### 19.3 执行前必须遵守

1. 第一批实现不改普通 UI 外观。
2. 不继续在旧 `aiWebSearch.ts` 里补 if 作为主方案。
3. 不引入 embedding / cross-encoder 作为 Phase 1 硬依赖。
4. 不一次性实现所有 Phase。
5. 不使用 `git add .`、`git add -A`、`git commit -a`。
6. 不处理 `notes/**`、`.oinb/**`。
7. 每次 Codex 任务必须先实现和验证，再由用户确认效果，确认后再 commit。

---

## 20. 第一批可执行任务建议

如果开始执行，第一步建议只做 **Phase 1：Contracts + Policy + QueryPlan**。

任务边界：

```text
新增 search_engine/contracts.ts
新增 search_engine/policy.ts
新增 search_engine/queryPlanner.ts
新增 search_engine/testCases.ts
必要时新增最小 index.ts
不接 UI
不替换旧搜索链路
不改 Reader
不改 Evidence Gate
```

验证目标：

```text
能用测试 case 输出稳定 SearchDecision
能生成多语言、多通道 QueryPlan
能区分 news/current/rumor_check/technical_doc/oi_algorithm/no_search
类型结构为后续 CandidateScheduler / EvidencePacket / AnswerContract 预留字段
```

第一批不做：

```text
真实联网
读取网页
EventBuffer
PriorityBarrier 实现
PostGenerationVerifier 实现
UI 展示
```

这样做的好处是：先把地基和类型边界定死，再逐层迁移旧链路，避免一上来把旧搜索系统和新系统搅在一起。

---

## 21. 最终原则

**Research Engine Core 的先进性不在于堆了多少算法名词，而在于它能把每次搜索变成一个可调度、可诊断、可验证、可回放、可降级的证据生产过程。**
