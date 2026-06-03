---
title: searchprd
tags: []
createdAt: 2026-06-03T12:02:38.887Z
updated: 2026-06-03T20:03:14.758779500+08:00
---
# OI Notebook / NoteX 联网搜索系统重构背景交接

## 1. 项目背景

项目是 Windows 桌面应用 **OI Notebook**，核心是本地 Markdown OI 学习工作台。右侧 AI 工作台叫 **NoteX**，用于问答、润色、解释、总结、本地笔记检索和联网搜索。

当前 NoteX 已经有联网功能，但真实效果不够可靠。近期做过一轮 Search Pipeline v2 升级，包括：

- 主动判断是否需要联网；
- 扩大候选网页发现；
- Rerank / Cluster / Diversity；
- Evidence Gate；
- Developer Mode 诊断；
- Rescue Mode；
- search summary only 弱证据；
- 高风险问题不允许用摘要下定论。

但实际测试仍然失败，例如问：

```text
张雪峰死了吗
````

结果仍然显示：

```text
没有找到引用的公开资料。
未检索到可靠公开来源支持该说法，因此不能确认其成立。
```

这个回答虽然安全，没有胡编，但说明搜索系统没有真正找到、筛选、读取、理解公开来源。用户认为当前框架已经不值得继续打补丁，应该重新设计一套更强的搜索系统。

## 2. 当前核心问题

现在的联网功能更像“给普通 AI 回答挂了几个搜索结果”，不是一个真正的检索系统。

主要问题：

1. **主动搜索判断还不够泛化**

   * 虽然加入了 Search Policy v2，但本质仍然依赖大量规则和垂类判断。
   * 用户希望系统能判断“这个问题离线回答是否容易过期或缺证据”，而不是靠预设足球、人物、公司新闻等固定场景。

2. **候选网页太少或被过早过滤**

   * 理想状态应该是发现 20～30 个候选网页，再筛选真正有用的信息。
   * 现在经常最后只剩 0～3 个来源，甚至直接 evidence=0。

3. **Discovery、Reader、Evidence Gate 混在一起**

   * 搜索失败时很难判断到底是：

     * 搜索服务没返回；
     * 候选被去重/过滤删光；
     * URL Reader 读失败；
     * 提取正文失败；
     * Evidence Gate 太严；
     * 还是回答阶段没用好证据。

4. **证据门槛是安全的，但不够聪明**

   * 高风险问题不胡编是对的。
   * 但中风险新闻、公司动态、当前事实类问题不能动不动就“没有可靠来源”。
   * 应该有分层证据：官方来源、权威媒体、搜索摘要弱证据、正文证据、时间证据等。

5. **现在系统太像补丁堆叠**

   * `aiWebSearch.ts`、`AiSidebar.tsx`、`searchDiagnostics.ts`、`SearchDiagnosticsPanel.tsx`、`src-tauri/src/ai.rs` 都被不断补逻辑。
   * 搜索策略、候选发现、URL 阅读、证据评估、回答契约互相缠在一起。
   * 后续继续改会越来越难维护。

## 3. 用户的目标

用户希望重新设计一套能“单独拎出来也很能打”的搜索系统，而不是继续在现有框架上修补。

目标不是简单“多搜几个网页”，而是：

```text
判断是否必须搜索
→ 规划搜索任务
→ 多 query 发现候选
→ 去重与来源质量评估
→ 聚类和多样性选择
→ 精读高价值网页
→ 证据门槛判断
→ 基于证据回答
→ 失败时明确说明失败在哪一层
```

一句话：**让 NoteX 从“有联网功能”升级成“有搜索引擎思维的研究助手”。**

## 4. 新系统应该如何设计

建议设计一个独立模块，比如：

```text
src/lib/search-engine/
src-tauri/src/search_engine/
```

而不是继续把搜索逻辑散落在 `AiSidebar.tsx` 和 `aiWebSearch.ts`。

建议核心架构：

```text
SearchController
  ├─ SearchPolicyPlanner
  ├─ QueryPlanner
  ├─ DiscoveryManager
  ├─ CandidateNormalizer
  ├─ SourceRegistry
  ├─ Reranker
  ├─ Clusterer
  ├─ DiversitySelector
  ├─ UrlReader
  ├─ EvidenceEvaluator
  └─ AnswerContractBuilder
```

### 4.1 SearchPolicyPlanner

判断问题是否需要联网。

不是靠领域枚举，而是判断问题属性：

```text
是否涉及当前状态
是否涉及最近 / 今天 / 昨天 / 最新
事实是否会随时间变化
是否需要外部来源确认
是否涉及传闻、争议、重大负面断言
是否用户要求新闻、价格、赛事、政策、版本、公司动态
```

输出类似：

```ts
{
  needSearch: boolean;
  reason: string;
  risk: "low" | "medium" | "high";
  freshness: "stable" | "recent" | "latest" | "current";
  searchGoal: string;
  vertical: string;
}
```

### 4.2 QueryPlanner

不要直接搜用户原句，而是生成多组 query。

例如：

```text
张雪峰死了吗
```

应该生成：

```text
张雪峰 去世
张雪峰 最新消息
张雪峰 辟谣
张雪峰 近期 公开活动
```

但回答时不能因为没搜到“没死”就断言，只能说“未检索到可靠来源支持该传闻”。

例如：

```text
OpenAI 最近有什么新闻
```

应该生成：

```text
OpenAI 最近 新闻
OpenAI news recent
site:openai.com OpenAI news
OpenAI announcement
OpenAI blog announcement
```

### 4.3 DiscoveryManager

目标不是读取 3 个网页，而是发现候选池。

默认策略：

```text
quick: 8～12 candidates
normal: 20～30 candidates
deep: 40～60 candidates
```

注意：不是全文读 30 个网页，而是先发现 30 个候选。

### 4.4 CandidateNormalizer

对候选做标准化：

```text
URL canonicalize
去 tracking 参数
unwrap Bing / redirect URL
host 归一化
title 归一化
date hint 提取
source type 判断
```

### 4.5 SourceRegistry

建立来源知识库，而不是只靠搜索排名。

例如：

```text
official
mainstream_news
tech_media
documentation
community
forum
seo_aggregator
unknown
```

每个来源有：

```ts
reliability
freshnessAbility
paywallRisk
jsRequiredRisk
domainType
topicCoverage
```

### 4.6 Reranker

候选按多维评分：

```text
相关性
来源可靠性
新鲜度
是否具体文章页
是否官方/权威
是否有发布时间
是否匹配 searchGoal
是否重复转载
```

### 4.7 Clusterer

同一事件、同一新闻、同一页面不要重复占满候选。

比如世界新闻类问题，需要保留多个事件；OpenAI 新闻类问题需要保留官方公告和媒体报道；技术问题需要保留官方文档和高质量社区资料。

### 4.8 DiversitySelector

从 20～30 个候选中选 8～12 个 read targets。

要求：

```text
不能全是同一 host
不能全是 SEO
不能全是同一媒体转载
官方源优先
高质量补充源保留
```

### 4.9 UrlReader

URL Reader 要单独做强，不能只是“能抓到就抓”。

需要输出清晰状态：

```text
fetched
blocked
needs_js
too_short
homepage
wrong_page_type
redirect_failed
timeout
parse_failed
content_extracted
```

### 4.10 EvidenceEvaluator

证据分级：

```text
strong: 正文可读 + 来源可靠 + 时间合适
medium: 正文可读但来源普通
weak: 只有标题/snippet，但来源可靠
none: 不可用
```

不同风险不同门槛：

```text
low risk:
  1～2 个可靠来源可答。

medium risk:
  需要近期来源，来源不足时谨慎回答。

high risk:
  人物生死、刑事、医疗、严重负面传闻等；
  没有权威来源不能下定论。
```

### 4.11 AnswerContractBuilder

回答阶段必须拿到 evidence packet，而不是让模型自由发挥。

如果 needSearch=true：

```text
只能基于已读来源回答
不能用离线知识补当前事实
证据不足就说不足
高风险传闻不能凭搜索摘要下结论
关键事实要引用
```

## 5. 当前 Git / 代码状态提醒

最近用户已经提交了多轮 prompt 和设置文案优化。当前最新 Search Pipeline v2 的一轮修复仍是 pending，用户尚未确认提交。

最后一次 reported modified files 是：

```text
M src-tauri/src/ai.rs
M src/components/ai/AiSidebar.tsx
M src/components/settings/SearchDiagnosticsPanel.tsx
M src/lib/aiWebSearch.ts
M src/lib/searchDiagnostics.ts
```

但之前还存在右键菜单、文件树、欢迎页、设置页等 UI pending，用户曾要求“提交当前可以提交的所有东西”，但在当前对话里没有看到最终提交回报。新对话开始后必须先让用户或 Codex 运行：

```bash
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

不要假设工作区干净。

项目纪律：

```text
禁止 git add .
禁止 git add -A
禁止 git commit -a
notes/** 不提交
.oinb/** 不处理
每次只提交明确范围
```

## 6. 下一步建议

不要继续在旧搜索链上补丁式修：

```text
不要再只改 aiWebSearch.ts 里的几个 if
不要继续靠 fixed query rescue
不要把 Evidence Gate 放宽成“没证据也答”
不要一次性全文读取 30 个网页
```

建议下一轮先做：

```text
新搜索系统 PRD / 技术设计文档
```

文档要明确：

```text
目标
非目标
模块边界
数据结构
搜索流程
证据门槛
失败状态
Developer Mode 诊断
与现有 NoteX 的接入方式
迁移计划
```

然后分阶段落地：

```text
Phase 0: 只读审计旧系统，冻结接口
Phase 1: 新 SearchPolicy + QueryPlanner 独立模块
Phase 2: Discovery Candidate Pool 独立实现
Phase 3: Rerank / Cluster / Diversity
Phase 4: URL Reader & Extractor 重构
Phase 5: Evidence Evaluator
Phase 6: Answer Contract 接入 NoteX
Phase 7: Developer Mode 诊断和回归测试
```

核心思想：**先把搜索系统当成独立产品设计，再接回 NoteX。**

