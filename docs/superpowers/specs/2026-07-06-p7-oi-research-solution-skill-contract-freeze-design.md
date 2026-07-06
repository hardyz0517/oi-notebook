# P7 OI Research / Solution Skill Contract Freeze 设计

日期：2026-07-06
状态：待评审
范围：AI Agent Workbench 大升级 / P7 OI Research / Solution Skills

## 1. 文档目的

本文冻结 P7 的进入边界。P7 的目标不是直接接入真实模型循环，也不是把现有搜索管线包装成“自动解题 Agent”，而是在 P5/P6 已冻结的 Agent Core、Tool、Permission、Event preview contract 之上，定义 OI Research / Solution Skill 的任务模型、证据模型、结果读模型和 Workbench 投影。

P7 必须引用并继承：

- 总 spec：`docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- P5 freeze：`docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md`
- P6 freeze：`docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md`
- P6 handoff：`docs/agent-workbench/handoff-p4.md`

如果上下文压缩后只剩本文，worker 必须先恢复并阅读上述文档，再进入任何实现。找不到这些文档时，只允许做只读审计和计划，不允许写功能代码。

## 2. 阶段身份

阶段名称：**P7 OI Research / Solution Skill Contract Freeze**

当前输入状态：**Tool/Permission Contract Preview**

P7 输出状态建议名：**OI Research/Solution Skill Contract Preview**

统一口径：

- P7 是 skill contract、task schema、evidence/read-model、Workbench projection 的冻结阶段。
- P7 不声明 AI 大升级完成、不声明 L5 Agent 完成、不声明 Codex-style runtime 完成、不声明 production-ready。
- P7 的能力必须通用化：OI 场景特别强，但底层 skill/task/evidence/read-model 不能只服务 OI。
- P7 不打开真实 provider request、model loop、streaming、write、patch apply、execute、Cookie-backed reader、session persistence 或旧 AiSidebar 迁移。

## 3. Codex 对标事实与本项目映射

P7 继续学习 `openai/codex` 的成熟 Agent Harness 分层，而不是照搬 CLI/TUI 产品形态。

P7 Prep A 于 2026-07-06 刷新官方仓库 `openai/codex`：

- 本地参考位置：`%TEMP%\openai-codex-reference`
- branch：`main`
- commit：`be33f80bc65159c094ecd06bf155afa3061ce23d`
- 获取时间：`2026-07-06T17:30:07+08:00`

上游架构事实：

- protocol/session/event：输入队列与输出事件队列分离，runtime 负责 turn/session 生命周期。
- tool registry/router/lifecycle：工具注册、路由、unsupported、trace、lifecycle 由核心层管理。
- approval/permission/sandbox/exec：权限决策、审批缓存、沙箱策略和执行策略分层，不由 UI 判断。
- patch/apply：patch 是有 grammar、approval、stream update、safety evaluation 的工具链，不是随手写文件 helper。
- model/provider loop：真实 model loop 负责 tool exposure、stream events、tool output 回灌下一轮 sampling。
- UI/CLI consumer：消费者订阅事件和 read model，不拥有核心决策。
- persistence/rollout：成熟持久化是单独能力，涉及 session meta、resume、state DB、隐私与恢复边界。

映射到 OI Notebook：

- `src/lib/agent-runtime/**` 继续承担 runtime/event/tool/permission preview contract。
- `src/lib/research-engine/**` 提供 search/read/extract/evidence/cache 基础设施，但不是 P7 skill contract 本身。
- `src/lib/agent-workbench/**` 应承载 P7 skill read model、view-model adapter、deterministic preview flow。
- `src/components/agent-workbench/**` 只能消费 read model 和 events，不能拼 prompt、不能决定权限、不能直接调用 Tauri。
- `src/lib/api.ts` 仍是前端到 Rust/Tauri 的唯一边界。

## 4. 当前本地事实

P7 Prep B 只读审计确认：

- `src/lib/research-engine/**` 已有 policy、query planner、discovery、reader、evidence、diagnostics、cache 等基础设施。
- OI vertical 已存在于 search policy 和 query planner 中，能识别 Luogu、Codeforces、AtCoder、CSES、OI Wiki、cp-algorithms 等来源。
- Luogu direct discovery / reader 已有可复用底座，reader 通过 `src/lib/api.ts` wrapper 调 `read_luogu_problem_content`。
- evidence/answer contract 已有 allowed/forbidden claims、citation ids、post-generation verification 形状。
- P6 runtime 已有 tool schema metadata、permission decision matrix、`permission.resolved` lifecycle、duplicate/unsupported guard、reserved event guard。
- Workbench UI 已能展示 preview loop contract、trace、permission、evidence。

当前缺口：

- 没有 P7 task model：`research-problem`、`debug-code`、`stress-test`、`write-solution`、`find-notes` 的 typed input/output/status/failure 尚未冻结。
- 没有 P7 source/evidence contract：题面、官方题面、社区题解、讨论 warning、算法参考、本地笔记的 source role 尚未统一。
- 没有 problem statement extraction model：题意、输入输出、约束、样例、数据范围未结构化进入 workspace。
- 没有 solution outline model：算法思路、证明、复杂度、实现要点、坑点、evidence 引用、禁止照搬原文规则未冻结。
- 没有 deterministic skill shell：算法标签、复杂度、题目约束推理不能先交给真实模型，必须先有可测试壳。
- 当前 `ProblemWorkspace` 还只是 preview 级挂载对象，不足以承载 P7 的题面、来源、解法草稿和证据关系。

## 5. P7 允许做什么

允许：

- 新增 P7 skill/task/source/evidence/solution/read-model 类型。
- 新增 deterministic preview adapters，用 fixture 或已有 research-engine evidence 生成 P7 read model。
- 将 `/research-problem`、`/write-solution`、`/find-notes` 等表达成 tool/skill definition，不接真实 model loop。
- 增加 P7-focused tests，覆盖 schema、permission、event、read-model、negative proof。
- 扩展 `src/lib/problem-workspace/**` 的 preview contract，使其能挂载题面结构、source roles、evidence ids、solution outline preview。
- 扩展 `src/components/agent-workbench/**` 只读展示 P7 read model。
- 复用 P6 permission decision：public-network 需要 prompt-required，cookie-network unavailable，write/patch/execute unavailable 或 blocked。
- 继续通过 `src/lib/api.ts` 使用已有 search/read wrapper。
- 更新 handoff / spec / plan 文档，明确 P7 preview 状态与下一阶段入口。

## 6. P7 禁止做什么

禁止：

- 接真实 provider request、prompt construction、model loop、streaming。
- 真实 write、patch apply、execute、code runner、delete、rollback。
- Cookie-backed Luogu reading 或 Cookie-backed capability expansion。
- session persistence、storage、request log 持久化。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移或接入新 P7 能力。
- 绕过 `src/lib/api.ts` 直接 `invoke()`。
- 修改 `notes/**`，或把真实用户笔记纳入 routine engineering work。
- 把 fixture/manual/deterministic preview flow 展示成成熟 Agent 能力。
- 复制网页原文作为题解沉淀。

## 7. P7 Skill Contract

P7 的 skill contract 必须先通用，再 OI 特化。

通用字段：

```text
skillId
label
description
inputSchema
outputSchema
requiredPermissions
sourceRoles
evidencePolicy
resultStatus
failureReasons
traceEvents
```

OI 特化字段：

```text
problemRef
platform
problemId
statement
constraints
samples
algorithmTags
complexityHints
solutionOutline
implementationNotes
pitfalls
sourceCitations
```

建议 skill ids：

- `research-problem`
- `find-notes`
- `write-solution-outline`
- `debug-code-preview`
- `stress-test-preview`

命名规则：

- 不使用 `ready`、`production`、`complete` 描述 preview skill。
- 未接真实能力的 skill 使用 `preview`、`contract-preview`、`unavailable`、`blocked`、`degraded`。
- `write-solution` 在未接真实 model loop 前只能是 `write-solution-outline` 或 `solution-outline-preview`。

## 8. Evidence / Source Contract

P7 research result 必须能解释“为什么可信”。

Source role 最少覆盖：

- `problem-statement`
- `official-editorial`
- `community-solution`
- `discussion-warning`
- `algorithm-reference`
- `local-note`
- `unknown`

Evidence packet 最少字段：

```text
evidenceId
sourceRole
sourceUrl
title
excerpt
claim
confidence
freshness
readerStatus
limitations
```

规则：

- 没有 evidence 的 research result 只能是 degraded 或 unavailable。
- sourceRole 为 `community-solution` 时，Workbench 必须提示“不能照搬原文”。
- Cookie source 不能进入模型 provider、第三方 search、browser extraction、logs 或 evidence payload。
- local-note source 在 P7 只能通过 contract/read-model 表达，不能读写真实 `notes/**`。

## 9. Workbench Projection

Workbench 只能消费 P7 read model。

建议新增或扩展 read model：

```text
skillStatus
problemSummary
sourceSummary
evidenceItems
solutionOutlinePreview
permissionRequests
traceEvents
limitations
```

UI 可显示：

- 当前 skill 状态：preview / unavailable / blocked / degraded / completed。
- 题面结构：题意、约束、样例计数。
- 来源角色：官方题面、题解、讨论、算法参考、本地笔记。
- evidence 列表和引用关系。
- solution outline preview：算法、复杂度、实现要点、坑点。
- limitation：哪些能力未接通，为什么。

UI 不得显示：

- “自动解题已完成”
- “L5 Agent 完成”
- “Codex-style runtime 完成”
- “production-ready”
- “ready: true”
- 真实 patch/write/execute/session persistence 可用暗示

## 10. P7 推荐任务切片

Task 0：P7 freeze / plan docs

- 只改 docs。
- 产出 P7 spec 和实施计划。
- 不改功能代码。

Task 1：Skill contract types

- 允许修改 `src/lib/agent-workbench/**` 或新建 `src/lib/oi-skills/**`。
- 定义 skill/task/source/evidence/solution read-model 类型和 focused tests。
- 不接 research-engine 或 UI。

Task 2：ProblemWorkspace preview extension

- 允许修改 `src/lib/problem-workspace/**` 和 focused tests。
- 让 workspace 能挂载 problem statement / constraints / samples / evidence ids / solution outline preview。
- 不读写真实 notes。

Task 3：Research skill adapter preview

- 允许修改 `src/lib/research-engine/**`、`src/lib/agent-workbench/**` 的 adapter/test。
- 将已有 research evidence 转成 P7 `research-problem` read model。
- 不接真实 model/provider/streaming。

Task 4：Workbench projection

- 允许修改 `src/components/agent-workbench/**` 和相关 view-model tests。
- 只读展示 P7 read model。
- 不改旧 AiSidebar，不拼 prompt。

Task 5：Boundary audit and handoff

- 只读或只改 `docs/agent-workbench/handoff-p4.md`。
- 复跑 tests、typecheck、no-hit audits。
- 记录 P7 输出状态和下一阶段禁区。

## 11. 验收命令

每个 P7 worker 启动必须运行：

```powershell
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
git log --oneline -8 --decorate
```

根据 slice 运行：

```powershell
node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench
node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime
node .\node_modules\vitest\vitest.mjs run src/lib/research-engine
node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace
node .\node_modules\typescript\bin\tsc --noEmit
```

如果 `.bin` 可用，也可使用：

```powershell
.\node_modules\.bin\vitest.cmd run <target>
.\node_modules\.bin\tsc.cmd --noEmit
```

`.bin` 缺失不是测试失败；可使用 Node fallback。依赖半残时，worker 必须先报告，再按授权使用 `pnpm.cmd fetch --force --ignore-scripts --frozen-lockfile` 和 `pnpm.cmd install --ignore-scripts --frozen-lockfile`，不得改 lockfile。

## 12. No-hit Audit

API boundary：

```powershell
rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'
```

Provider/model/streaming：

```powershell
rg -n 'providerId|modelId|chat_with_current_note_stream|model.delta|prompt construction|OpenAI' src/lib/agent-runtime src/lib/agent-workbench src/lib/research-engine src/components/agent-workbench
```

Capability claim：

```powershell
rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/lib/research-engine src/components/agent-workbench
```

Workbench hardcoded preview drift：

```powershell
rg -n 'createUnavailablePermissionStates|tavily:unavailable|luogu-cookie:missing|permission: "network"' src/lib/agent-workbench src/components/agent-workbench
```

Notes boundary：

```powershell
git status --short -- . ":(exclude)notes/**"
git status --short -- notes
```

Routine status must exclude `notes/**`; mention `notes/**` only when user asks or a P7 worker explicitly has approved fixture notes.

## 13. 退出标准

P7 可以结束的条件：

- P7 skill/task/source/evidence/solution read-model contract 已有 focused tests。
- OI 特化字段没有污染通用 skill contract。
- `research-problem` / `find-notes` / `write-solution-outline` 至少能以 preview contract 表达。
- Workbench 展示来自 read model，不拥有 skill decisions。
- Permission requests 来自 P6 policy/runtime output。
- 没有真实 provider/model/streaming/write/patch/execute/Cookie/persistence。
- 没有旧 AiSidebar 迁移。
- 没有绕过 `src/lib/api.ts`。
- 没有修改 `notes/**`。
- Focused tests、typecheck、API boundary audit、provider/model audit、capability claim audit 通过。
- `docs/agent-workbench/handoff-p4.md` 记录 P7 输出状态与下一阶段入口。

## 14. 下一阶段入口

P7 结束后，下一阶段才能讨论：

- 是否进入真实 model loop / provider adapter。
- 是否进入 code debugger / patch workflow。
- 是否进入 session persistence / rollout。
- 是否激活 Cookie-backed reader。

这些都必须有新的 freeze spec 和 implementation plan。任何 worker 不得从 P7 spec 推导出上述能力已经获批。

## 15. Spec 自查

- 无占位段落或未完成说明。
- 本文继承 P5/P6 禁止项，没有重新打开真实模型、写文件、patch、执行、Cookie、persistence。
- P7 输出名明确为 preview contract。
- P7 强调通用 skill contract，OI 作为强特化，不把系统做成窄 OI 玩具。
- 每个后续 worker 都能从本文恢复阶段目标、允许范围、禁止范围、验收命令和 no-hit audit。
