# NoteX Research Engine Core Phase 10 审计与交接

## 1. 当前目标

Research Engine Core 的目标是把 NoteX 的联网研究能力从旧搜索链路中拆出来，形成一个可离线验证、可诊断、可扩展的证据生产核心。它目前不负责真实联网、不负责 LLM 生成、不负责 UI 展示，也不替换 `aiWebSearch.ts`。当前核心只把“问题 -> 策略 -> 查询 -> 候选 -> 阅读 -> excerpt -> evidence -> answer contract -> verifier -> diagnostics”这条链路以纯 TypeScript contracts 和纯函数方式跑通。

当前状态适合继续接入 Developer Diagnostics UI、真实 provider transport、真实 reader adapter，以及后续 NoteX 灰度接入。

## 2. Phase 1-9 已完成内容

### Phase 1: Contracts / Policy / Query Planner

- 建立基础类型：`ResearchSearchRequest`、`SearchPolicyDecision`、`QueryPlan`、`PlannedQuery`、source/risk/freshness/vertical 等。
- 实现 `buildSearchPolicyDecision`，区分 `no_search`、news/current、rumor_check、technical_doc、oi_algorithm 等场景。
- 实现 `buildQueryPlan`，生成多语言、多目的 query，并保留 exact URL、docs、refute、news 等查询意图。

### Phase 2: Scheduler / ReadinessGate / EventBuffer

- 建立候选调度 snapshot、优先级屏障、per-host limit、zombie/stale 生命周期字段。
- 实现 `evaluateReadinessGate`，避免低质量快速来源抢跑高优先级来源。
- 实现 `EventBuffer`，为后续 UI/Developer Mode 提供可节流、可聚合的事件缓冲。

### Phase 3: Candidate Pool

- 实现候选标准化、URL canonicalization、去重 key、候选排序、diversity selection。
- 建立 `CandidatePoolSnapshot`，保留 selected/rejected、cluster、rank breakdown、rejected reason 等诊断信息。

### Phase 4: Discovery Providers

- 建立 discovery provider contracts、mock provider、registry、merge、offline pipeline。
- 支持 docs/news/OI/exact_url/web 等 mock provider，用 deterministic fixture 验证候选池入口。
- Discovery 仍为离线 mock，不接真实网络。

### Phase 5: Reader / Passage / Excerpt

- 建立 URL reader / extracted document / content block / reader quality / excerpt contracts。
- 实现 mock reader、reader quality evaluator、passage selector、excerpt builder。
- 对 code/math/table 使用结构化 block 处理：要么整块保留，要么整块 omit 并产生 warning；不做半截代码/半截公式证据。

### Phase 6: Evidence / Contract / Verifier

- 建立 `EvidenceItem`、`EvidencePacket`、`EvidenceEvaluationResult`、`AnswerContract`、`PostGenerationVerificationResult` 等 contracts。
- 实现 evidence packet builder、evidence evaluator、answer contract builder、post-generation verifier。
- 高风险传闻无可靠强证据时不能 direct；forbidden claim、unknown citation、mustCite 缺失都会被 verifier 拦截并返回 safe fallback。

### Phase 7: End-to-End Offline Orchestrator

- 实现 `runResearchEngineOffline`，把 Phase 1-6 串成纯离线端到端流程。
- no_search 场景短路，不执行 discovery/reader/evidence。
- needSearch 场景完整经过 policy/query/discovery/candidate/scheduler/reader/quality/passage/excerpt/evidence/contract/verifier。
- Orchestrator 只串联阶段 API，不复制阶段核心决策逻辑。

### Phase 8: Real Provider Boundary

- 建立真实 provider 未来接入前的边界层：config、transport、response、normalizer、fixture smoke。
- `executeRealDiscoveryProviderAdapter` 只通过注入的 `RealDiscoveryTransport` 执行，不调用全局 `fetch`，不读 env，不读真实 key。
- 支持 bing-like、brave-like、bocha-like fixture normalizer，并能 smoke 到 CandidatePool。
- provider disabled、missing credential、no transport、malformed、empty、unauthorized、rate_limited、timeout、aborted 都转成结构化 `DiscoveryProviderResponse`。

### Phase 9: Diagnostics Export

- 建立 `ResearchEngineDiagnostics`、diagnostic snapshot、diagnostic section、selfCheck summary 等类型。
- 实现 offline run diagnostics、selfCheck diagnostics、JSON-safe sanitization、Markdown debug report。
- diagnostics 只保留 preview，不输出完整 `excerptMarkdown`、secret、Authorization、Cookie 或完整 body。
- selfCheck reporter 只处理传入结果，不主动执行 selfCheck。

## 3. 关键文件结构

```text
src/lib/research-engine/
  types.ts                         Phase 1-4 基础 contracts
  searchPolicy.ts                  SearchPolicyDecision
  queryPlanner.ts                  QueryPlan
  scheduler.ts                     Candidate scheduler snapshot
  readinessGate.ts                 Priority barrier / readiness gate
  eventBuffer.ts                   Pipeline event buffer
  candidateNormalizer.ts           URL/candidate normalization
  candidateRanker.ts               Ranking features
  diversitySelector.ts             Diversity and per-host selection
  candidatePool.ts                 CandidatePoolSnapshot
  discoveryProvider.ts             Discovery provider contracts/execution
  discoveryRegistry.ts             Mock provider registry
  discoveryMerge.ts                Provider response merge
  mockDiscoveryProvider.ts         Deterministic discovery fixtures
  discoveryPipeline.ts             Offline discovery pipeline
  readerTypes.ts                   Reader/extractor/excerpt contracts
  mockUrlReader.ts                 Deterministic reader fixtures
  readerQuality.ts                 Reader quality evaluation
  passageSelector.ts               Block-aware passage selection
  excerptBuilder.ts                Markdown excerpt builder
  evidenceTypes.ts                 Evidence/contract/verifier contracts
  evidencePacket.ts                Evidence packet builder
  evidenceEvaluator.ts             Evidence sufficiency/conflict evaluation
  answerContract.ts                Answer contract builder
  postGenerationVerifier.ts        Deterministic generated answer verifier
  offlineTypes.ts                  Offline orchestrator contracts
  offlineOrchestrator.ts           End-to-end offline pipeline
  realProviderTypes.ts             Real provider boundary contracts
  realProviderAdapter.ts           Injected-transport provider adapter
  providerResponseNormalizer.ts    Provider payload normalizers
  providerFixtures.ts              Deterministic provider fixtures
  diagnosticsTypes.ts              Diagnostics contracts
  diagnosticsExporter.ts           JSON-safe diagnostics export
  diagnosticsFormatter.ts          Markdown diagnostics formatter
  selfCheckReporter.ts             SelfCheck summary/report helpers
  selfCheck.ts                     Phase 1-9 selfCheck cases
  index.ts                         Public API exports
```

## 4. 当前公开 API 入口

主要从 `src/lib/research-engine/index.ts` 导出：

- Policy / query: `buildSearchPolicyDecision`, `buildQueryPlan`
- Candidate pool: `normalizeDiscoveryResult`, `normalizeDiscoveryResults`, `buildCandidatePool`, `scoreCandidate`, `rankCandidates`, `selectDiverseCandidates`
- Discovery: `createDiscoveryProvider`, `executeDiscoveryProvider`, `executeDiscoveryProvidersOffline`, `runDiscoveryPipelineOffline`, `selectProvidersForPolicy`
- Scheduler / events: `createSchedulerSnapshot`, `scheduleCandidates`, `simulateSchedulerStep`, `evaluateReadinessGate`, `createEventBuffer`, `appendPipelineEvents`, `flushEventBuffer`
- Reader/excerpt: `readMockUrl`, `readMockCandidates`, `evaluateReaderQuality`, `selectPassages`, `buildExcerpt`
- Evidence/contract/verifier: `buildEvidenceItems`, `buildEvidencePacket`, `evaluateEvidencePacket`, `buildAnswerContract`, `verifyGeneratedAnswer`
- Offline E2E: `createDefaultOfflineRunConfig`, `runResearchEngineOffline`
- Real provider boundary: `createRealDiscoveryProviderAdapter`, `executeRealDiscoveryProviderAdapter`, `validateRealProviderConfig`, `redactRealProviderConfig`, `normalizeRealProviderPayload`, `runRealProviderAdapterSmokeCheck`
- Diagnostics: `buildDiagnosticsFromOfflineRun`, `buildDiagnosticsFromSelfCheck`, `buildResearchEngineDiagnostics`, `toJsonSafeDiagnostics`, `formatDiagnosticsAsMarkdown`, `summarizeResearchEngineSelfCheck`, `groupSelfCheckResultsByPhase`
- Regression: `runResearchEngineSelfCheck`

## 5. SelfCheck 覆盖

Phase 10 审计前，`runResearchEngineSelfCheck()` 覆盖 92 个 case，覆盖范围包括：

- Phase 1 policy/query/no_search/current/high risk/OI/docs
- Phase 2 scheduler/readiness/event buffer/abort/zombie
- Phase 3 candidate normalize/rank/dedupe/diversity
- Phase 4 discovery provider selection/merge/mock pipeline
- Phase 5 reader quality/passage/excerpt/code/math/table warnings
- Phase 6 evidence packet/evaluator/contract/verifier/high risk/refute/conflict
- Phase 7 offline orchestrator no_search/docs/OI/news/rumor/verifier diagnostics
- Phase 8 real provider boundary disabled/credential/transport/fixtures/errors/redaction/candidate smoke
- Phase 9 diagnostics export/JSON-safe/redaction/Markdown/selfCheck summary/verifier diagnostics/long preview

Case 命名已经用阶段前缀体现归属，例如 `scheduler-`、`candidate-`、`discovery-`、`reader-`、`evidence-`、`verifier-`、`offline-`、`real-provider-`、`diagnostics-`、`selfcheck-`。

## 6. 当前离线边界

当前 Research Engine Core 保持：

- 无真实网络请求。
- 无 LLM 调用。
- 无 UI 组件或 React 依赖。
- 无旧搜索主流程接入。
- 无 Rust/Tauri 改动。
- 无全局 `fetch`、`XMLHttpRequest`、`WebSocket`、Tauri `invoke`。
- 无 `Date.now`、`Math.random`、`process.env`、`localStorage`、`sessionStorage`、`document.`、`window.` 依赖。

Phase 8 允许定义 transport/config，但 adapter 只能通过注入的 `RealDiscoveryTransport` 执行，不能直接联网。

## 7. 当前安全边界

### Provider key / secret

- `RealDiscoveryProviderConfig` 只保存 `apiKeyRedacted` / `credentialAvailable` 这类脱敏状态，不保存真实 key。
- `redactRealProviderConfig` 输出 `<redacted>`。
- diagnostics 中记录 `credentialRedacted: true` 和 redactedFields，不输出真实 Authorization、Cookie、token、secret 或完整 body。

### High risk evidence gate

- `SearchPolicyDecision` 会把高风险传闻识别为 high risk / rumor_check。
- `EvidenceEvaluator` 要求可靠来源、强证据或可靠 refute；forum、mentions、unknown、weak evidence 不能支撑 direct。
- `AnswerContract` 在证据不足时进入 `insufficient_evidence` 或 `refuse_current_claim`，并带保守 fallback。

### Post-generation verifier

- `verifyGeneratedAnswer` deterministic 检查 citation、forbidden claim、mustCite、unsupported high-risk strong assertion。
- 校验失败时返回 `safeFallback`，不相信模型自我 repair。

### Excerpt integrity

- `PassageSelector` 将 code/math/table 视为 atomic block。
- 超预算 code/math/table 整块 omit 并产生 `omitted_large_code_block` / `omitted_large_math_block` 等 warning。
- paragraph/list/quote 只在自然边界截断，并产生 `truncated_paragraph`。
- `ExcerptBuilder` 输出 Markdown 时会闭合代码围栏和 math block。

## 8. 后续推进路线

### Phase 11: Developer Diagnostics UI 接入

- 最小接入 `buildDiagnosticsFromOfflineRun`、`formatDiagnosticsAsMarkdown`、`summarizeResearchEngineSelfCheck`。
- 只做 Developer Mode/调试面板接入，不改普通用户搜索主流程。
- UI 中只显示 preview、counts、warnings、errors、stage summary，不显示完整正文或 secret。

### Phase 12: 真实 provider 最小 smoke 接入

- 选择一个 provider 做最小 transport adapter。
- 使用 Phase 8 的 `RealDiscoveryTransport`，由外层注入 credential，不在 core 内读 env。
- 先只跑 Developer Mode smoke，不进入正式回答路径。

### Phase 13: Real URL Reader Adapter

- 定义真实 reader transport/adapter。
- 保持 block-aware extractor，不把网页全文塞进 prompt 或 diagnostics。
- 继续沿用 ReaderQuality / PassageSelector / ExcerptBuilder，不绕过 evidence gate。

### Phase 14: NoteX 灰度接入，不替换旧链路

- 用 adapter 把旧 NoteX request 映射到 `ResearchSearchRequest`。
- 先在 Developer Mode 或灰度开关下对照旧链路输出。
- 观察 diagnostics/selfCheck/smoke，不直接替换 `aiWebSearch.ts`。

### Phase 15: 旧链路迁移/清理

- 在灰度稳定后逐步迁移旧搜索链路。
- 清理重复 diagnostics 和旧 provider glue。
- 保留 fallback，避免一次性切换导致回归。

## 9. 明确不要做的事

- 不要直接替换 `src/lib/aiWebSearch.ts`。
- 不要一口气接多个真实 provider。
- 不要把真实 API key 写入 config、diagnostics、selfCheck 或 snapshot。
- 不要把完整网页正文、完整 `excerptMarkdown` 或完整 request body 塞进日志。
- 不要跳过 `runResearchEngineSelfCheck()`。
- 不要在 core 内读 env 或本地配置文件。
- 不要把 UI/Rust/Tauri 逻辑塞进 `src/lib/research-engine/`。
- 不要让 low quality / weak evidence 支撑高风险强断言。

## 10. 当前提交链路

```text
1afa4b4 feat(ai): add research engine phase one
aacaf20 feat(ai): add research engine scheduler core
14fa240 feat(ai): add research engine candidate pool
44b4e6a feat(ai): add research engine discovery providers
1caac95 feat(ai): add research engine reader contracts
a6dd65a feat(ai): add research engine evidence contracts
aa82c93 feat(ai): add research engine offline orchestrator
d30fe39 feat(ai): add research engine provider boundary
6716b67 feat(ai): add research engine diagnostics export
```

## 11. Phase 10 本轮审计结论

本轮 Phase 10 做了以下审计：

- 检查过滤后工作区和暂存区，开始时均干净。
- 检查最近提交链，Phase 1-9 提交完整。
- 审阅 PRD、AGENTS 和 `src/lib/research-engine/` 文件结构。
- 检查 public exports，当前 `index.ts` 按类型域和阶段 API 导出，未发现必须拆改的问题。
- 检查 `offlineOrchestrator.ts`，确认其串联 Phase 1-6 API，没有复制核心阶段逻辑。
- 检查 `realProviderAdapter.ts`，确认只使用注入 transport，不直接 fetch、不读 env、不读真实 key。
- 检查 `passageSelector.ts` / `excerptBuilder.ts`，确认 code/math/table atomic 处理仍成立。
- 检查 `evidenceEvaluator.ts` / `postGenerationVerifier.ts`，确认高风险传闻和生成后校验仍有保守边界。
- 检查 `diagnosticsExporter.ts`，确认 JSON-safe、redaction、preview 和 Error/circular handling 保持。
- 用脚本检查 research-engine 内部 import 图，37 个 TS 文件未发现循环依赖。
- 做禁区扫描，命中仅为本地变量/字段名 `document`，不是 DOM 依赖。

本轮没有发现需要代码小修的问题，因此只新增此交接文档。

## 12. 下一轮接手建议

下一轮如果做 Phase 11，建议先接 diagnostics 到 Developer Mode 的一个只读面板或现有 diagnostics 面板的单独 section。推荐从最小 API 开始：

```ts
runResearchEngineOffline(input)
buildDiagnosticsFromOfflineRun(run)
formatDiagnosticsAsMarkdown(diagnostics)
summarizeResearchEngineSelfCheck(runResearchEngineSelfCheck())
```

接 UI 前仍需再次确认：

- 不展示完整 excerpt。
- 不展示 secret/body/header。
- 不触发真实 provider。
- 不替换旧搜索链路。
- selfCheck 全部通过。
