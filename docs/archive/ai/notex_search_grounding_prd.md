# NoteX Search Grounding PRD

版本：v0.2 Draft  
日期：2026-05-20  
项目：OI Notebook / NoteX  
目标模块：NoteX 搜索、网页阅读、本地索引、证据引用与 AI Grounding 系统

## 1. 一句话定位

NoteX Search 不是要复刻 Google / Bing 这种全网搜索引擎，而是要做一个面向 OI 学习、技术资料、新闻动态和本地笔记的 **垂直 Grounding Search Engine**。

它的目标不是返回一堆网页列表，而是：

```text
本地索引 + 精选公开源 + 按需网页读取 + Evidence Gate + AI 总结
```

换句话说，NoteX 的搜索功能应该由两部分组成：

```text
Local Index Engine
```

负责本地笔记、题目资料、已读网页缓存、历史摘录、RSS 元数据等可控内容。

```text
Live Grounding Engine
```

负责实时公开网页、RSS / Atom、官方源、新闻聚合源、Bing fallback、URL Reader、Evidence Gate 和回答引用。

这套系统既借鉴传统搜索引擎的 seed、目录、索引、排序思想，也借鉴 GPT / Gemini / Claude 风格的按需搜索、实时 grounding、证据过滤与引用回答。

## 2. 背景与当前状态

NoteX 目前已经具备以下基础能力：

- 本地笔记搜索。
- 显式 URL Reader。
- Bing 公开搜索候选发现。
- Bing News RSS apiclick 解包到真实新闻 URL。
- URL Reader 读取真实网页正文。
- Evidence Gate 区分 candidate / fetched / usable / rejected。
- 普通模式只展示 usable / injected 来源。
- Developer Mode 显示搜索准备、Direct Discovery、Bing 阶段、URL Reader、Evidence Gate 等诊断。

最近的真实链路已经能做到：

```text
Bing News RSS
→ 解包真实新闻 URL
→ URL Reader 读取 CNET / CNBC / News.az 等页面
→ Evidence Gate 判断 usable
→ 注入回答上下文
```

同时，正文不可用、needs JS、搜索页、跳转页、summary-only 的候选会被拒绝。

当前主要问题已经不是“能不能搜到”，而是：

1. 新闻类搜索仍然过度依赖 Bing RSS fallback。
2. 宽泛新闻问题容易被单一事件簇霸屏，例如 Google I/O / Gemini。
3. Direct Discovery 和 News Source Registry 还不够系统化。
4. 本地索引、RSS 元数据、网页摘录缓存还没有形成真正的轻量索引。
5. Developer Mode 诊断信息已经很多，但还需要整理成清晰链路视图。

## 3. 搜索引擎思想借鉴

传统搜索引擎一般包括：

```text
抓取网页 → 建索引 → 查询召回 → 排序
```

早期搜索引擎对 NoteX 最有价值的不是“全网爬取”，而是以下思想：

### 3.1 人工目录思想

早期 Yahoo 式目录把网站按分类维护。NoteX 可以借鉴这一点，维护可信 Source Registry，而不是盲目全网搜索。

适合 NoteX 的精选源包括：

- OI Wiki。
- cp-algorithms。
- USACO Guide。
- 洛谷。
- Codeforces blog。
- React docs。
- MDN。
- Rust / Python / Tauri / Vite / Tailwind 官方文档。
- OpenAI / Anthropic / Google / DeepMind / Microsoft / NVIDIA 官方博客。
- TechCrunch / The Verge / CNBC Tech / Reuters Tech / 36kr / 量子位 / 机器之心等媒体源。

### 3.2 Seed + Frontier 思想

传统 crawler 从 seed URL 出发，把新链接加入 frontier。NoteX 不做全网递归爬取，但可以做可控的一跳发现：

- RSS feed。
- 官方 news 页面。
- docs index。
- sitemap。
- GitHub release 页面。
- 洛谷题号页。

原则：只读少量候选，不翻页，不递归，不长期爬取。

### 3.3 倒排索引思想

NoteX 不适合索引全网，但非常适合索引：

- 本地笔记。
- 已读网页摘录。
- 题目元数据。
- 常用 docs 页面。
- RSS item metadata。

这可以逐步形成 NoteX 自己的 Local Index Engine。

### 3.4 权威排序思想

NoteX 不做 PageRank，但可以做简化的 Source Reliability：

```text
官方文档 / 官方博客
> 权威媒体
> 高质量社区文章
> 普通博客
> 聚合页
> 搜索结果页
```

搜索排序不只看关键词，还要看来源可信度、页面类型、正文可读性、时效性、intent 匹配度。

## 4. 产品目标

### 4.1 总目标

构建一个无 API Key 默认可用的搜索 grounding 系统，让 NoteX 可以在本地笔记和公开网页之间建立可靠连接，并以证据驱动的方式回答用户问题。

### 4.2 核心原则

1. 无 Key 默认可用。Bocha / Brave / Tavily / Exa 等 API 只能作为增强项。
2. 不同 intent 走不同信息源。
3. 搜索结果不是证据，真实可读正文才是证据。
4. Evidence Gate 不能为了回答更多而放宽。
5. 没有可引用证据时，宁可短失败。
6. 本地笔记和确定性来源优先于通用搜索。
7. 新闻类优先 RSS / 官方源 / 聚合源发现，Bing 只做 fallback。
8. 普通模式简洁可信，Developer Mode 完整可观测。
9. 严格遵守隐私与安全边界。

## 5. 非目标

当前阶段不做：

1. 不做全网搜索引擎。
2. 不做大规模爬虫。
3. 不做递归抓取或自动翻页。
4. 不绕 CAPTCHA / 登录 / 付费墙。
5. 不读取 Cookie、浏览器历史、登录态。
6. 不访问内网、localhost、file://。
7. 不用代理池或模拟真人点击。
8. 不把搜索摘要、聚合页、跳转页、首页当证据。
9. 不在当前版本实现真正后台 deep research，只预留架构。

## 6. 典型用户场景

### 6.1 新闻 / 最新动态

用户问：最近有什么 AI 新闻？

期望：

NoteX 判断为 news/recent intent，优先尝试新闻源 registry、官方博客、媒体 RSS、聚合源，再 fallback Bing News RSS。读取真实网页正文后，做事件聚类，输出多个独立新闻点。如果来源只覆盖一个事件簇，应明确说明覆盖有限。

### 6.2 指定主体新闻

用户问：最近 OpenAI 有什么新闻？

期望：

优先 OpenAI 官方源，其次权威媒体和聚合源。回答围绕 OpenAI，不强求多公司覆盖，但避免同一事件重复拆条。

### 6.3 技术文档

用户问：React useEffect 是什么？

期望：

直接构造 react.dev 候选，不先依赖 Bing。读取官方文档，通过 Evidence Gate 后解释概念、用法、示例和常见坑。

### 6.4 OI / 算法

用户问：点分树常见实现坑。

期望：

优先本地笔记，其次 OI Wiki、cp-algorithms、USACO Guide、洛谷、Codeforces blog。回答要符合 OI 学习方式。

### 6.5 翻译 / 词义

用户问：最近这个词英语怎么说？

期望：

触发 translation / word lookup guard，不进行 news search。

### 6.6 显式 URL 阅读

用户说：帮我总结这个网页：https://cp-algorithms.com/graph/centroid_decomposition.html

期望：

直接走 URL Reader，不依赖搜索 Provider。能读正文则总结，读不到则说明原因。

## 7. 总体架构：Search Grounding Pipeline

整体流程：

```text
用户输入
→ Search Need 判断
→ Intent Router
→ Source Router
→ Candidate Discovery
→ URL Reader / Extractor
→ Evidence Gate
→ Ranking / Clustering / Diversity
→ Prompt Injection
→ Answer Synthesis + Citations
→ UI / Diagnostics
```

### 7.1 Search Need 判断

判断是否需要联网。

强触发：

- 最近、最新、新闻、动态、当前、今天、发布、价格、版本、政策、规则变化。
- 用户显式说搜一下、查一下、联网。
- 用户贴 URL。
- 用户问公开资料、文档当前用法、库版本、题目讨论。

不触发或弱触发：

- 翻译。
- 润色。
- 改写。
- 总结当前文本。
- 普通概念解释。
- 本地笔记足够回答。

AI Planner 只能增强，不能阻断 rule fallback。

### 7.2 Intent Router

统一 intent：

- explicit_url。
- local_note。
- news_recent。
- docs_technical。
- oi_algorithm。
- github_project。
- general_knowledge。
- general_web。

要求：

- 中文规则不能 mojibake。
- news/recent 不能被 planner timeout 阻断。
- 翻译 guard 优先级高于“最近”新闻触发。

### 7.3 Source Router

不同 intent 走不同源。

新闻类：

- News Source Registry。
- 官方博客 / 新闻页。
- 媒体 RSS / Atom。
- 聚合源发现。
- Bing News RSS fallback。
- API Provider 增强。

技术文档类：

- 官方 docs。
- 固定路径候选。
- docs index / sitemap，后续增强。
- Bing Web fallback。

OI 类：

- 本地笔记。
- OI Wiki。
- cp-algorithms。
- USACO Guide。
- 洛谷。
- Codeforces blog。

GitHub 类：

- README。
- releases。
- issues。
- pull requests。
- docs。

普通知识类：

- Wikipedia / 百科。
- 官方介绍页。
- 高质量解释文章。
- Bing fallback。

### 7.4 Candidate Discovery

候选发现只找 URL，不证明可信。

候选类型：

- explicit_url。
- local_note。
- direct_rss。
- direct_site。
- constructed_source。
- search_provider。
- cached_excerpt。

候选字段：

- url。
- originalUrl。
- resolvedUrl。
- title。
- snippet。
- discoveryMethod。
- sourceKind。
- sourceReliability。
- discoveredBy。
- feedUrl。
- sourceHome。
- dateHint。
- topicKeywords。
- directDiscoveryReason。

### 7.5 URL Reader / Extractor

所有网页候选必须读取真实正文。

输出字段：

- contentStatus：not_fetched / fetched / partial / unavailable / needs_js / blocked / failed。
- excerptQuality：good / partial / short / noisy / failed。
- excerptChars。
- pageType：news_article / article / docs / homepage / search_page / redirect / login / download / api_docs / encyclopedia / forum / unknown。
- title。
- dateHint。
- publisher / author，可选。
- cleanedExcerpt。
- extractionReason。

### 7.6 Evidence Gate

统一证据状态：

- candidate。
- fetched。
- usable。
- rejected。

硬规则：

- search summary only 不可用。
- 正文不可用不可用。
- needs_js / blocked / failed 不可用。
- 搜索页、首页、跳转页、登录页、下载页、pricing、help、privacy、terms、map、shopping 不可用。
- go.microsoft.com/fwlink 不可用。
- bing.com/news/apiclick 原始 URL 不可用；必须解包真实 URL。
- 所有 Provider 都必须过 Gate。

新闻类更严格：

- 必须是具体新闻、公告、博客文章或媒体文章。
- 必须有正文。
- 最好有发布时间。
- 官网首页不能当新闻。

技术文档：

- 官方 docs / README / tutorial / release notes 可用。
- 不要求发布时间。

OI：

- OI Wiki / cp-algorithms / USACO / 洛谷 / Codeforces 优先。
- 普通博客 medium / weak。

### 7.7 Ranking / Clustering / Diversity

对 usable evidence 做去重和多样性选择。

新闻事件 cluster：

- Google / Gemini / I/O / Antigravity / Omni / Genie。
- OpenAI / ChatGPT / GPT。
- Anthropic / Claude。
- DeepSeek。
- funding / 融资 / startup。
- regulation / AI Act / 监管。
- infrastructure / chip / datacenter / Nvidia。
- security / safety / 漏洞 / 风险。
- China AI / 量子位 / 机器之心 / 36kr。

规则：

- 宽泛新闻优先不同 cluster。
- 同一 cluster 最多一个主新闻点。
- 同一事件多个来源作为交叉佐证。
- 只有一个 cluster 时说明覆盖有限。

### 7.8 Prompt Injection

只注入：

- usableEvidence=true。
- evidenceStatus=usable。
- injectedIntoAnswer=true。

绝不注入：

- rejected candidate。
- search summary only。
- needs_js / unavailable / failed 页面。
- 搜索页、首页、跳转页。

news/recent 无 usable evidence 时：

- 不允许旧知识补新闻。
- 短失败。

### 7.9 Answer Synthesis

新闻综述：

- 一句总览。
- 3 到 6 个独立事件；证据不足就 1 到 3 个并说明覆盖有限。
- 每条说明发生了什么、为什么重要、后续影响。
- 同一事件不拆成多条。
- 不用旧知识补未读取事件。

技术文档：

- 结论。
- 概念。
- 示例。
- 常见坑。

OI：

- 用途。
- 核心思想。
- 适用场景。
- 实现坑。
- 调试建议。

## 8. Local Index Engine 规划

Local Index Engine 是 NoteX 最稳定、最可控的搜索能力。

### 8.1 索引对象

- Markdown 笔记。
- 当前笔记上下文。
- 题目元数据。
- 已读网页摘录。
- RSS item metadata。
- 历史搜索结果摘要。

### 8.2 索引方式

初期：

- 文件级索引。
- 标题、路径、frontmatter、正文摘要。
- 简单分词 / keyword match。
- 最近编辑权重。

中期：

- 段落级索引。
- 轻量倒排索引。
- OI 术语同义词。
- 题号 / 算法名 / 标签索引。

后期：

- 向量索引可选。
- 本地 embedding 可选。
- 搜索结果与网页摘录统一缓存。

### 8.3 本地索引优先级

- OI 学习问题优先本地笔记。
- 当前笔记相关问题优先当前笔记。
- 用户明确要求联网时，本地和网页并行。
- 本地笔记引用和 Web 引用必须分开。

## 9. Live Grounding Engine 规划

Live Grounding Engine 负责实时公开信息。

### 9.1 信息源分级

新闻：

```text
官方源 > 权威媒体 RSS > 聚合源发现 > Bing News fallback > Bing Web fallback
```

技术：

```text
官方 docs > docs index > GitHub repo docs > 高质量教程 > Bing fallback
```

OI：

```text
本地笔记 > OI Wiki / cp-algorithms / USACO > 洛谷 / Codeforces > 普通博客 > Bing fallback
```

普通知识：

```text
官方介绍 / 百科 > 权威解释页 > Bing fallback
```

### 9.2 缓存策略

缓存对象：

- 搜索结果。
- RSS item metadata。
- URL Reader excerpt。
- failed excerpt。
- source diagnostics。

建议 TTL：

- 新闻搜索结果：2 到 6 小时。
- 新闻 excerpt：6 到 12 小时。
- 技术 docs：7 到 30 天。
- OI 资料：14 到 30 天。
- failed excerpt：20 到 60 分钟。

缓存不得存储：

- API Key。
- Cookie。
- 浏览器历史。
- 登录态。
- 用户隐私数据。

## 10. News Search 专项设计

### 10.1 News Source Registry

sourceType：

- official_news。
- official_blog。
- media_rss。
- aggregator_rss。
- search_fallback。

sourceTopic：

- model_release。
- agent_tool。
- company_update。
- funding_startup。
- regulation_policy。
- infrastructure_chip。
- security_safety。
- china_ai。

初始官方源：

- OpenAI News / Blog。
- Anthropic News。
- Google Blog / DeepMind Blog。
- Microsoft AI Blog。
- DeepSeek News / Blog。
- Meta AI Blog。
- NVIDIA Blog。

初始媒体源：

- TechCrunch。
- The Verge。
- Wired。
- CNBC Tech。
- Reuters Tech。
- AP Tech。
- Ars Technica。
- MIT Technology Review。
- 36kr。
- 量子位。
- 机器之心。

聚合源：

- Bing News RSS。
- MSN。
- Google News RSS 类入口，后续评估。
- Yahoo News，后续评估。

聚合源只发现候选，不作为主证据。

### 10.2 News Query Lanes

宽泛 AI 新闻分 lanes：

- 模型与产品发布。
- AI Agent / 工具。
- 公司动态。
- 融资 / 初创公司。
- 监管 / 政策。
- 算力 / 芯片 / 数据中心。
- 安全 / 风险。

每次最多 3 到 5 个 lanes。

指定主体问题不使用过宽 lanes。

### 10.3 News Read Budget

- quick news：最多 4 个候选，目标 2 个 usable。
- normal news：最多 10 到 12 个候选，目标 5 个 usable。
- deep news：未来后台任务，最多 20 到 30 个候选，目标 8 到 12 个 usable。

### 10.4 News Failure Policy

无 usable evidence：

```text
当前没有成功读取到足够可靠的近期新闻正文，因此我不能可靠总结最新动态。
```

只有一个 cluster：

```text
当前成功读取的来源主要集中在某某事件，覆盖可能不完整。
```

## 11. UI 设计

### 11.1 普通模式

普通用户看到：

- 是否启用联网。
- 正在搜索 / 正在读取网页。
- 已读取几个可引用来源。
- 回答正文。
- 引用来源。
- 简洁失败原因。

不显示：

- rejected candidate。
- parser debug。
- raw diagnostics。
- 长搜索日志。

### 11.2 Developer Mode

Developer Mode 应整理成链路树：

- Search Preparation。
- AI Planner。
- Intent Router。
- Source Router。
- Direct Discovery。
- Provider Search。
- URL Reader。
- Evidence Gate。
- News Read Budget。
- Event Clustering。
- Prompt Injection。

每个来源显示：

- discoveryMethod。
- sourceKind。
- sourceReliability。
- pageType。
- contentStatus。
- evidenceStatus。
- usableEvidence。
- injectedIntoAnswer。
- rejectedReason。
- eventCluster。
- selectedForRoundup。

## 12. 隐私与安全

必须遵守：

- 不读取 Cookie。
- 不读取浏览器历史。
- 不读取登录态。
- 不访问 localhost / 内网 / file://。
- 不绕 CAPTCHA。
- 不使用代理池。
- 不模拟点击。
- 不递归爬取。
- 限制重定向、超时、响应大小。
- 只访问公开网页。

设置页应明确说明：

- 搜索只发送必要 query。
- 不读取浏览器隐私数据。
- 搜索 Provider Key 是可选增强。
- 没有 Key 也能使用基础联网能力。

## 13. 自动诊断与验收

### 13.1 长期验收问题

- 最近有什么 AI 新闻？
- 最近 OpenAI 有什么新闻？
- React useEffect 是什么？
- 点分树常见实现坑。
- 最近这个词英语怎么说？
- 帮我总结这个网页：https://cp-algorithms.com/graph/centroid_decomposition.html

### 13.2 验收标准

新闻：

- 不崩溃。
- 不用旧知识回答新闻。
- 不展示 rejected candidate 为引用。
- 有 usable evidence 时生成引用回答。
- 没有 usable evidence 时短失败。
- 宽泛新闻优先多个事件簇。

技术文档：

- 官方 docs 优先。
- docs 不要求发布时间。
- 能解释概念、示例、常见坑。

OI：

- 本地笔记优先。
- 确定性来源优先。
- 不被 news query 影响。

翻译：

- 不触发 news/recent search。

### 13.3 Developer Diagnostics 自检

SearchDiagnosticsPanel 应包含：

- AI news + planner timeout。
- OpenAI news 主体保留。
- translation guard。
- React docs direct candidate。
- OI algorithm direct source。
- Bing apiclick unwrap。
- fetched excerpt 不被 candidate not_fetched 覆盖。
- evidence usable 才能注入。
- rejected candidate 不进 prompt。
- news cluster 去重。
- source registry lane selection。

## 14. 阶段计划

### Phase 0：冻结并验收当前 pending

目标：确认当前搜索链路真实 UI 可用，停止盲改。

任务：

- 跑长期验收问题。
- 检查 Developer Mode 链路完整性。
- 小修普通中文文案。
- 确认无 staged 文件。
- 提交当前搜索链路大改。

### Phase 1：Search Architecture 类型整理

目标：统一类型，不大改行为。

整理：

- SearchIntent。
- SearchPlan。
- DiscoveryCandidate。
- FetchedSource。
- EvidenceSource。
- SearchDiagnostics。
- NewsCluster。
- SearchMode。

### Phase 2：Local Index Engine 强化

目标：把本地笔记搜索做成稳定底座。

任务：

- 段落级索引。
- OI 术语同义词。
- 题号 / 标签 / 算法名索引。
- 已读网页摘录索引。
- 本地搜索 diagnostics。

### Phase 3：News Source Registry v1

目标：新闻不再主要依赖 Bing。

任务：

- 官方源 registry。
- 媒体 RSS registry。
- 聚合源 registry。
- 按 topic lane 尝试。
- 每源短 timeout。
- 所有候选进入 URL Reader + Evidence Gate。

### Phase 4：News Clustering / Diversity

目标：解决单事件霸屏。

任务：

- eventCluster 规则。
- cluster 去重。
- broad news 多样化选择。
- Developer Mode 显示 cluster。
- Prompt 避免拆同一事件。

### Phase 5：Extractor 强化

目标：提高正文质量。

任务：

- 新闻页正文抽取增强。
- docs 页结构抽取。
- OI 页代码 / 段落抽取。
- excerptQuality。
- tooShort / noisy / needs_js 诊断。

### Phase 6：搜索模式分层

目标：提供不同深度。

模式：

- 轻量搜索：快，少量来源。
- 标准搜索：默认，5 到 8 个 usable evidence。
- 深度研究：未来后台任务。

### Phase 7：UI 产品化

目标：普通模式更清楚，Developer Mode 更像链路调试器。

任务：

- 普通来源卡片收敛。
- Developer Mode 链路树。
- 搜索失败原因分类。
- 一键诊断入口。

## 15. 关键风险与缓解

### 风险 1：无 Key 搜索不稳定

缓解：官方源和 RSS 优先，Bing 只 fallback，失败时诚实说明。

### 风险 2：新闻覆盖窄

缓解：News Source Registry、query lanes、event clustering、覆盖有限提示。

### 风险 3：Extractor 读不到正文

缓解：不放宽 Gate，增强抽取，rejected candidate 只在 Developer Mode。

### 风险 4：链路复杂难调试

缓解：Developer Mode 链路树、离线诊断、分阶段执行。

### 风险 5：pending 过大

缓解：Phase 0 后先提交，后续每个 phase 单独提交。

## 16. 当前建议执行顺序

1. 暂停继续扩展搜索功能。
2. 按 Phase 0 做真实 UI 验收。
3. 修少量 UI / 文案问题。
4. 提交当前 pending。
5. 新开 Phase 1 做类型整理。
6. Phase 2 强化 Local Index Engine。
7. Phase 3 做 News Source Registry。
8. Phase 4 做 News Clustering / Diversity。

当前不建议：

- 继续随手加 RSS 源。
- 继续盲调 Bing query。
- 为了回答更多而放宽 Evidence Gate。
- 在未提交当前 pending 前继续大规模重构。

## 17. 总结

NoteX Search 的长期方向不是做全网 Google，而是做一个面向 OI 学习和个人知识工作的垂直搜索 grounding 系统。

它应由 Local Index Engine 和 Live Grounding Engine 组成：前者提供稳定、私有、可控的本地搜索；后者提供按需、有限、可验证的公开网页 grounding。

搜索体验的核心不是“搜到了多少网页”，而是：

- 什么时候该搜。
- 应该搜哪里。
- 能不能读到真实正文。
- 哪些来源有资格被引用。
- 如何避免同一事件霸屏。
- 如何在证据不足时诚实失败。

这也是后续 NoteX 搜索功能的产品边界。

