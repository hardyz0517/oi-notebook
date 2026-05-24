# NoteX 搜索 Grounding 阶段交接文档（2026-05-21）

## 1. 项目与工作方式

项目：OI Notebook / NoteX。

当前主线：NoteX 搜索 grounding、本地索引、URL Reader、新闻搜索、Developer Mode diagnostics。

工作原则：

- 不使用 `git add .`。
- 不处理 `notes/**`，不修改用户笔记正文。
- 先验证，再提交。
- 提交前使用精确 pathspec staging。
- 不读取 Cookie、登录态、浏览器历史。
- 不绕 CAPTCHA、不使用代理、不递归爬取、不翻页。
- 普通模式只展示 usable / cited sources。
- Developer Mode 保留完整 diagnostics。

## 2. 当前 PRD 进度

- Phase 0：No-key grounded search pipeline，已完成。
- Phase 1：Search Architecture 类型整理，已完成。
- Phase 2：Local Index Engine，已完成。
- Phase 3：News Source Registry + self-check，已完成。
- Phase 4：News clustering / company news cleanup，已完成。
- Phase 5：URL Reader / Extractor，已完成。
- Phase 6：Search Mode Policy，已完成。
- Phase 7：普通搜索状态与来源展示减噪，已完成。
- Phase 7 验收发现并修复 news freshness policy，已完成。

当前搜索 PRD 第一轮可以视为基本验收通过。

## 3. 最新关键 commit 列表

- `03599e6 feat(ai): add no-key grounded search pipeline`：建立 No-key grounded search 主链路，包括 Direct Discovery、Bing fallback、URL Reader、Evidence Gate、Developer Mode 字段等。
- `d6d8df3 refactor(ai): organize search architecture types`：整理 SearchIntent / Discovery / Evidence / Diagnostics 等前端搜索架构类型。
- `99ec310 feat(ai): index local notes by chunks`：把本地笔记搜索升级到段落 / 小节 chunk 级索引，并增强 OI 题号、算法词、同义词匹配。
- `aaf544f feat(ai): add local index status controls`：在设置中心增加本地笔记索引状态、刷新和重建入口。
- `52f10e1 feat(ai): add news registry and self check`：增加 News Source Registry、Source Router diagnostics，以及安全的 NoteX 搜索自检 harness。
- `d057b7c feat(ai): cluster news search candidates`：增加新闻候选轻量事件聚类、多样性选择、cluster diagnostics 和 prompt guidance。
- `58fe64f fix(ai): constrain company news focus entity`：修复 OpenAI / Anthropic / Google 等 company-specific news 的主体约束，避免 OpenAI 查询被 Anthropic / Google 主体污染。
- `b936c55 fix(ai): clean company news query diversification`：清理 company-specific queryDiversification 中非 focus company 的 site query。
- `cab2d4b feat(ai): improve url reader quality diagnostics`：增强 URL Reader / extractor quality diagnostics，区分 fetched、partial、needs_js、blocked、too_short 等状态。
- `cf3cd41 test(ai): add url reader live smoke test`：增加 opt-in / ignored 的 URL Reader live smoke test。
- `accdfd0 refactor(ai): add search mode policy`：新增 Search Mode Policy，明确 no_search、local_first、explicit_url、docs_technical、oi_algorithm、news_recent、general_web 等模式。
- `007c007 refactor(ai): simplify search status display`：普通模式搜索状态和来源展示减噪，Developer Mode 保留完整链路。
- `5586d5f fix(ai): enforce freshness window for news`：修复 news_recent freshness policy，默认最近新闻只允许 72 小时 strict window、最多 7 天 fallback，超过 7 天的 stale source 不进入主新闻 roundup / prompt。

当前 `git log --oneline -n 12` 实际最新记录：

```text
5586d5f fix(ai): enforce freshness window for news
007c007 refactor(ai): simplify search status display
accdfd0 refactor(ai): add search mode policy
cf3cd41 test(ai): add url reader live smoke test
cab2d4b feat(ai): improve url reader quality diagnostics
b936c55 fix(ai): clean company news query diversification
58fe64f fix(ai): constrain company news focus entity
d057b7c feat(ai): cluster news search candidates
52f10e1 feat(ai): add news registry and self check
aaf544f feat(ai): add local index status controls
3c5dc23 note: update tricks/123d.md
cda4d92 note: update tricks/123d.md
```

## 4. 当前稳定验证命令

每轮搜索链路相关改动提交前应至少运行：

```powershell
pnpm.cmd tsc --noEmit
pnpm.cmd build
cargo check --manifest-path .\src-tauri\Cargo.toml
cargo test notex_search_self_check --manifest-path .\src-tauri\Cargo.toml -- --nocapture
```

当前 self-check 应为 11/11 PASS。

URL Reader live smoke 的默认检查命令只确认 ignored / opt-in，不联网：

```powershell
cargo test notex_url_reader_smoke --manifest-path .\src-tauri\Cargo.toml -- --nocapture
```

真正需要测试 URL Reader 真实网页时，才运行 opt-in live smoke：

```powershell
cargo test notex_url_reader_smoke --manifest-path .\src-tauri\Cargo.toml -- --ignored --nocapture
```

不要把 live smoke 默认打开。

## 5. 当前核心架构状态

### Search Mode Policy

当前搜索入口已分层：

- `no_search`：普通问答、改写、翻译、总结已给内容，不触发 web/news。
- `local_first`：优先当前笔记 / 本地索引。
- `explicit_url`：用户明确贴 URL，只走 URL Reader，不依赖 Bing / News Registry。
- `docs_technical`：技术文档 / API / 框架问题，优先官方 docs direct source。
- `oi_algorithm`：OI / 算法 / 题号 / 洛谷 / Codeforces / 模板，优先本地索引 + OI source。
- `news_recent`：新闻 / 最近 / 当前信息，走 News Source Registry + URL Reader + Evidence Gate。
- `general_web`：普通公开网页搜索 fallback，不吞掉明确模式。
- `deep_research`：仅预留，当前不实际触发复杂流程。

### Local Index

- 本地索引为 chunk 级索引。
- 索引路径仍是 `.oinb/local-index/notes-index.json`。
- 设置中心 AI -> 本地笔记索引 中有状态、刷新、重建入口。
- 本地笔记引用使用 `N#`，Web 来源使用 `S#`，两者分离。
- 低置信本地候选只在 Developer Mode 显示；普通模式只显示正文实际使用的本地来源。

### Web / URL Reader

- URL Reader 是公开网页成为证据的前置条件。
- Evidence Gate 不允许 candidate、RSS item、Bing 摘要、搜索结果摘要直接成为证据。
- URL Reader / extractor 已有 quality diagnostics，包括 finalUrlHost、contentType、bodyBytes、extractedTextChars、excerptChars、publishedAt、blockedReason、needsJsReason、extractionFailureReason、contentStatus、excerptQuality、pageType 等。
- Live smoke test 是 ignored / opt-in。

### News

- News Source Registry 已建立。
- Source Router 支持 company-specific focus。
- OpenAI / Anthropic / Google / Gemini / DeepMind 查询会根据 rawUserQuery 推断 focus entity。
- company-specific queryDiversification 会过滤非 focus company 的 site query。
- News clustering / diversity 已有轻量骨架，宽泛 AI 新闻优先跨事件覆盖，公司专项新闻不跨主体凑多样性。
- Freshness policy 已修复：
  - 默认“最近 / 最新新闻”使用 72 小时 strict window。
  - 默认 fallback 最多 7 天。
  - 超过 7 天的 stale source 不能进入主新闻 roundup / prompt。
  - 明确时间范围查询才允许更宽范围。

### UI

- 普通模式已减噪：只展示用户能理解的搜索状态、失败原因和真正使用的来源。
- 普通模式不展示 rejected candidate、低置信候选、Evidence Gate、registry、cluster 等内部术语。
- Developer Mode 保留完整链路：
  - Search Mode / 搜索模式
  - Local Index / 本地索引
  - Direct Discovery / 直接发现
  - News Registry / 新闻源路由
  - News Clustering / 新闻聚类
  - URL Reader / 网页读取
  - Evidence Gate / 证据准入
  - Self Check / 自检

## 6. 最近真实验收结论

- 用户实测“最近有什么 AI 新闻？”后发现旧新闻混入：2026 年 4 月新闻被包装成“近期公开新闻来源（2026年4月—5月）”。
- 已通过 `5586d5f fix(ai): enforce freshness window for news` 修复。
- 修复策略：默认 news_recent 不再把超过 7 天的 stale source 放入主新闻 roundup / prompt，self-check 新增 freshness policy synthetic case。
- 修复后用户反馈“没问题了，效果不错”。
- 当前搜索 PRD 第一轮可以视为基本验收通过。

## 7. 后续建议

建议后续不要继续堆搜索功能，优先做稳定化和发布准备：

- 发布前全量验收。
- 打包构建。
- 设置中心 UI 回归。
- NoteX 真实问答 smoke test。
- changelog / release notes。
- 如果继续开发，再考虑 deep_research 或更强 extractor，但不要在当前稳定基线上乱改。

## 8. 注意事项

- 不要把 `notes/**` 纳入提交。
- 不要提交 `.oinb/**`、缓存、日志、API Key、本地索引。
- 不要把 live smoke 默认打开。
- 不要削弱 Evidence Gate。
- 不要放宽 URL Reader 安全边界。
- 新闻 freshness 不要回退到“4月—5月都算近期”。
- OpenAI company-specific query 不能再被 Anthropic / Google 污染。
- React useEffect 不能再出现 `algorithm term matched re` 或无关本地笔记。
- 普通模式只展示 usable / cited sources；Developer Mode 才展示 rejected / low confidence / debug diagnostics。
