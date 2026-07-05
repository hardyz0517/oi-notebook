# P4 架构纠偏冻结设计

日期：2026-07-04
状态：待评审
范围：当前 P4/P5 前置护栏 spec

## 1. 文档目的

本文件用于冻结当前 P4 Agent Workbench 状态，在继续添加真实 AI 能力之前，先纠正架构语言、preview 语义、readiness 状态、UI 能力表达和 worker 边界。

它不是 AI 大升级总 spec，而是当前阶段的施工护栏。总方向以
`2026-07-04-ai-agent-workbench-upgrade-design.md` 为准。

## 2. 当前结论

当前 P4 不建议重写。已有方向是有价值的：

- 前端到 Rust 仍通过 `src/lib/api.ts` 和 `src/lib/apiContract.ts`；
- 已经出现 runtime、tool registry、permission manager、event stream、workspace store、Workbench UI panels 等早期模块；
- research-engine 正在走 search/read/extract/evidence/cache 分离；
- 当前 P4 preview 路径未发现直接写文件、执行命令或 Cookie 泄露的 P0 证据。

但当前 P4 不应继续直接加真能力。必须先冻结纠偏：

- 当前 runtime 是一次 `runTool()` 的 preview，不是成熟 agent loop；
- readiness preview 存在乐观 `true` 语义；
- Luogu / Current 等 UI 模式名可能暗示真实接通，但实际仍偏 manual/mock flow；
- permission 和 tool contract 太薄，不能承载写入、执行、Cookie、patch、真实模型 loop；
- 当前工作区关键文件仍有未跟踪状态，继续并行 worker 前需要明确 source of truth。

## 3. 规范命名

后续报告和计划统一使用：

- 总升级：**AI Agent Workbench 大升级**；
- 当前护栏阶段：**P4 架构纠偏冻结**；
- 当前 P4 实现状态：**Agent Workbench Foundation Preview**。

禁止称当前 P4 为：

- AI 大升级完成；
- L5 Agent 完成；
- Codex-style runtime 完成；
- 真实 Workbench 能力全部接通。

## 4. 本冻结阶段允许做什么

允许做架构纠偏，不允许扩功能冒进。

允许：

- 将 readiness 改成真实、保守、可解释状态；
- 将 mock/manual/preview 路径明确标记为 preview；
- 移除或改写暗示 Luogu/current-research 已完整接通的 UI 文案或状态；
- 强化 runtime、tool、permission、event 类型契约，但不接真实 provider 行为；
- 增加 preview semantics、permission blocking、API boundary、tool registry、event output 的 focused tests；
- 更新文档以统一 P4 范围和阶段命名；
- 保持所有前端到 Rust 调用走 `src/lib/api.ts`；
- 保持 `notes/**` 不被 routine engineering work 触碰。

## 5. 本冻结阶段禁止做什么

禁止：

- 接入真实模型 loop；
- 改变 prompt、provider selection、model request、streaming 行为；
- 把旧 `AiSidebar` 迁移成新 runtime host；
- 添加真实写文件、应用 patch、执行命令、编译、对拍、删除能力；
- 添加真实 Cookie-backed Luogu reading，除非另有 Cookie safety spec；
- 在 storage/privacy spec 之前持久化 workspace 或 evidence；
- 把 manual/mock flow 表述为 production-ready；
- stage 或 commit 大范围无关改动；
- 使用 `git add .`、`git add -A`、`git commit -a`。

## 6. 必须纠偏的点

### 6.1 Readiness 必须真实

`get_agent_workbench_preview` 不得固定返回乐观 `true` 来表示成熟。

允许的状态：

- `ready`
- `preview`
- `blocked`
- `not_configured`
- `unavailable`
- `failed`

必须能说明 Tavily、Luogu Cookie、patch、execute、model loop 等能力为什么不可用或只是 preview。

### 6.2 AgentRuntime 必须降级命名

当前一次工具执行闭环只能叫 preview runtime 或 runtime primitive。

成熟 runtime 必须另行定义：

- model step；
- tool request；
- permission decision；
- tool execution；
- observation；
- continuation；
- compaction / interruption；
- final result；
- failure。

在这些状态不存在前，任何 worker 不得声称已经完成 Codex-style Agent Runtime。

### 6.3 ToolRegistry 必须走向 Registry + Router

最低要求：

- duplicate registration behavior；
- unsupported tool handling；
- schema metadata；
- permission metadata；
- exposure policy；
- timeout policy；
- lifecycle events。

### 6.4 Permission 必须成为 policy

不能只靠 `read` / non-read boolean。

最小状态：

- auto-allowed；
- prompt-required；
- denied；
- blocked-by-configuration；
- unavailable；
- degraded-fallback。

最小种类：

- read；
- local-note-search；
- public-network；
- cookie-network；
- write；
- patch-apply；
- execute；
- destructive。

### 6.5 UI 必须表达真实能力

UI 必须区分：

- preview；
- configured；
- unavailable；
- blocked by permission；
- running；
- completed；
- failed。

如果 Luogu/current research 没有真实接通，就必须显示 preview、unavailable 或 not configured，而不是让用户以为能力已经完成。

### 6.6 Source of truth 必须清楚

继续 worker 前必须明确哪些 P4 文件属于本阶段：

- docs；
- runtime files；
- workbench UI files；
- problem workspace files；
- research-engine split files；
- Rust preview command；
- API and contract changes；
- tests。

这不要求当前指挥线程提交，但后续 closeout 必须精确列出路径。

## 7. 验证契约

每个 P4 纠偏 worker 必须报告：

- branch / checkout identity；
- `git status --short -- . ":(exclude)notes/**"`；
- `git diff --cached --name-only`；
- 读了哪些文件；
- 改了哪些文件；
- 哪些禁止区域没有触碰；
- 跑了哪些 focused tests；
- 是否做了 API boundary audit；
- `notes/**` 是否保持 untouched；
- 是否 staged / committed / pushed。

推荐命令：

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/problem-workspace/*.test.ts
.\node_modules\.bin\vitest.cmd run src/lib/research-engine/*.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob "!src/lib/api.ts" --glob "!src/components/ai/**" --glob "!src/lib/aiWebSearch.ts"
```

如果 `pnpm.cmd` 被 ignored-build policy 阻塞，应快速切换到本地
`node_modules\.bin\*.cmd`，不要反复重试。

## 8. 退出标准

P4 架构纠偏冻结可以结束的条件：

- readiness 状态真实；
- preview/mock/manual flow 被诚实标记；
- 当前 P4 被文档化为 foundation preview；
- runtime/tool/permission/event contract 的下一步缺口清楚；
- UI 不再宣称未接通能力；
- API boundary 仍干净；
- focused tests 和 typecheck 通过，或失败被明确记录为 blocker；
- 后续 P5 plan 同时引用总 spec 和本 freeze spec。

## 9. P5 进入规则

P5 不得从“继续加 provider/search/cookie/patch/execute/model-loop 真能力”开始。

P5 必须先说明：

1. 它推进总 spec 的哪一层；
2. 它继承本 freeze 的哪些纠偏结果；
3. 它不会重新打开哪些禁止项；
4. 它的 contract tests 和验收证据是什么。

否则不得进入实现。

