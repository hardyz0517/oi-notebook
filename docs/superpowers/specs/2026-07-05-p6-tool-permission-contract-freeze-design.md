# P6 Tool/Permission Contract Freeze 设计

日期：2026-07-05
状态：待评审
范围：AI Agent Workbench 大升级 / P6 Tool/Permission Contract Freeze

## 1. 文档目的

本文冻结 P6 的 Tool / Permission contract 边界。P6 不接入真实模型循环，不扩大工具能力，而是把 P5 已冻结的 `preview_one_shot` runtime 继续推进为可测试、可审计、不会误报成熟能力的 Tool/Permission contract preview。

P6 必须引用并继承：

- 总 spec：`docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- P5 freeze：`docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md`
- P4 handoff：`docs/agent-workbench/handoff-p4.md`

P6 继承 P5 禁止项：禁止真实 model loop、provider/prompt/model request/streaming、真实 write/patch apply/execute/code runner/delete/rollback、Cookie-backed Luogu reading、persistence/storage、旧 `AiSidebar` 迁移、绕过 `src/lib/api.ts`、改 `notes/**`。

## 2. 阶段身份

阶段名称：**P6 Tool/Permission Contract Freeze**

当前输入状态：**Agent Core Contract Preview**

P6 输出状态建议名：**Tool/Permission Contract Preview**

统一口径：

- P6 是 contract/type/test/runtime preview guard 阶段。
- P6 不让任何未来工具被静默当作可用能力。
- P6 不把 write、patch、execute、Cookie、persistence 从 reserved/unavailable 变成真实执行。
- P6 的价值是让后续工具接入必须经过 schema、permission、exposure、timeout、lifecycle、failure policy 和 event guard。

## 3. Codex 对标事实与本项目映射

P6 学习 `openai/codex` 的 harness 分层，而不是照搬产品形态。P6-Prep-A 的上游审计事实是：

- `codex-rs` 有 core / protocol / cli / tui / tools / execpolicy / sandboxing / apply-patch / exec-server 等分层。
- protocol 是 Submission / Event queue 边界。
- tools 有 registry / router / lifecycle。
- exec policy 与 apply-patch safety / approval 是独立边界。

映射到 OI Notebook：

- `src/lib/agent-runtime/**` 承担 Tool / Permission contract 的本地 preview core。
- `ToolRegistry` 需要从薄 Map 变成带 duplicate guard、unsupported failure、metadata list 的 registry/router 基础。
- `PermissionManager` 需要从 boolean 判断变成能输出 permission decision result 的 policy preview。
- Runtime 需要以 `tool.requested`、`permission.required`、`permission.resolved`、`tool.started`、`tool.output`、`tool.failed` 维护生命周期。
- Workbench 只消费 policy 输出和 runtime events，不再手写看似真实能力的 unavailable cards。

不照搬项：

- 不照搬 CLI/TUI 产品结构。
- 不默认提供 shell 权限。
- 不把 OI Notebook 变成 repo-centric coding agent。
- 不要求普通用户安装 Codex CLI、MCP、Node、Python 或浏览器插件。

## 4. 当前事实与缺口

P6-Prep-B 和当前源码确认的事实：

- `AgentToolPermission` 只有 `read | network | write | execute`，不能表达 local-note-search、public-network、cookie-network、patch-apply、destructive 等安全差异。
- `AgentToolDefinition` 只有 `name`、`description`、`permission`、`run`，没有 input/output schema、exposure、timeout、lifecycle、failure policy。
- `ToolRegistry.register()` 使用 `Map.set()`，同名工具会静默覆盖。
- `PermissionManager` 只有 `canAutoRunTool()` / `shouldPromptForPermission()` 两个 boolean 路径，默认只有 read auto-allowed。
- `createAgentRuntime().runTool()` 对 permission block 只发 `permission.required`，没有 `permission.resolved` decision path。
- Workbench glue 每次注册一个 read tool，并手写 Tavily / Luogu unavailable permission cards。
- Tool-supplied events 可以直接追加，尚未按 reserved / unavailable 语义守门。

这些不是 P6 要一次性补齐的成熟能力，而是 P6 必须冻结的 contract 缺口。

## 5. P6 允许做什么

允许：

- 增加纯 contract/type/test/runtime preview guard。
- 为 tool contract 增加 schema metadata。
- 增加 registry duplicate guard。
- 为 unsupported tool 返回结构化失败。
- 增加 timeout / exposure metadata。
- 增加 permission decision result。
- 增加 reserved / unavailable event guard，阻止工具伪造未实现能力。
- 让 Workbench 改为消费 policy 输出，而不是手写 unavailable permission cards。
- 增加 focused tests、API boundary audit、capability claim audit。

## 6. P6 禁止做什么

禁止：

- 真实模型循环。
- provider / prompt / model request / streaming。
- 真实 write / patch apply / execute / code runner / delete / rollback。
- Cookie-backed Luogu reading 或 Cookie-backed capability expansion。
- persistence / storage / request log / session storage。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts`。
- 改 `notes/**`。
- 用 UI 文案暗示 Tool/Permission Contract Preview 已经具备成熟 Agent 能力。

## 7. Tool contract 最小字段

P6 后每个工具定义至少应能表达：

```text
name
description
inputSchema
outputSchema
permission
exposure
timeoutMs
lifecycle
failurePolicy
```

字段语义：

- `inputSchema` / `outputSchema`：描述可验证的数据边界，P6 可先用 lightweight JSON-schema-like metadata，不引入重型依赖。
- `permission`：引用 P6 permission kind。
- `exposure`：表达工具是否面向 preview UI、internal runtime、future adapter 或 unavailable placeholder。
- `timeoutMs`：只表达 policy 和测试边界，不引入真实长任务调度。
- `lifecycle`：表达 request / permission / start / output / failed 的 event contract。
- `failurePolicy`：表达 unsupported、permission blocked、timeout reserved、tool error、reserved event rejected 等结构化失败。

## 8. Permission contract 最小 kind

P6 permission kind 至少包括：

```text
read
local-note-search
public-network
cookie-network
write
patch-apply
execute
destructive
```

默认策略：

- `read` 可 auto-allowed。
- `local-note-search` 可作为 prompt-required 或 degraded-fallback，不能默认读真实 `notes/**`。
- `public-network` 必须按配置和任务显式策略决定。
- `cookie-network` 必须 blocked-by-configuration 或 unavailable，P6 不接入。
- `write`、`patch-apply`、`execute`、`destructive` 必须 prompt-required、blocked-by-configuration 或 unavailable，P6 不执行。

## 9. Permission decision 最小状态

P6 permission decision 至少包括：

```text
auto-allowed
prompt-required
denied
blocked-by-configuration
unavailable
degraded-fallback
```

每个 decision 必须带：

- `toolName`
- `permission`
- `status`
- `reason`
- 可选 `fallbackToolName` / `fallbackReason`

Runtime 必须能把 decision 映射到事件：

- auto-allowed：允许进入 `tool.started`。
- prompt-required：发 `permission.required` 和 `permission.resolved`，返回 `blocked`。
- denied / blocked-by-configuration / unavailable：发 `permission.resolved`，返回结构化 `blocked` 或 `failed`。
- degraded-fallback：发 `permission.resolved`，只允许进入已声明的 fallback read path。

## 10. Event / lifecycle contract

P6 最小 lifecycle events：

```text
tool.requested
permission.required
permission.resolved
tool.started
tool.output
tool.failed
```

Reserved / unavailable guard 语义：

- 工具不得自行发出 P5/P6 标为 reserved 或 unavailable 的成熟能力事件，例如真实 `model.delta`、`patch.applied`、`agent.compacted`。
- tool-supplied events 必须先经过 guard；被拒绝时 runtime 记录结构化失败，例如 `reserved_agent_event:<type>` 或 `unavailable_agent_event:<type>`。
- `tool.output` 只能表示当前 preview primitive 的输出，不能暗示成熟 model loop 完成。
- `agent.completed` 只能表示 one-shot preview primitive 完成。

## 11. Source of truth

P6 允许路径：

```text
src/lib/agent-runtime/**
src/lib/agent-workbench/**
src/components/agent-workbench/**
docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md
docs/superpowers/plans/2026-07-05-p6-tool-permission-contract.md
docs/agent-workbench/handoff-p4.md
```

P6 禁止路径：

```text
notes/**
src/components/ai/**
src-tauri/src/ai.rs
src-tauri/src/luogu*.rs
local-blog/**
provider/model selection code
prompt construction code
real patch/write/execute/code-runner code
storage/privacy persistence surface
```

文档 worker 只允许创建/修改 P6 spec 和 P6 implementation plan；`handoff-p4.md` 仅在需要添加 P6 入口提示时可选修改。

## 12. 验收命令

P6 implementation worker 至少运行：

```powershell
.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime
.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench
.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts
.\node_modules\.bin\tsc.cmd --noEmit
rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob "!src/lib/api.ts" --glob "!src/components/ai/**" --glob "!src/lib/aiWebSearch.ts"
rg -n "AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true" src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench
git status --short -- . ":(exclude)notes/**"
git diff --cached --name-only
```

如果实现触碰 Rust API boundary，需额外运行：

```powershell
cargo check --manifest-path .\src-tauri\Cargo.toml
```

## 13. 退出标准

P6 可以结束的条件：

- Tool contract 至少表达 name / description / inputSchema / outputSchema / permission / exposure / timeoutMs / lifecycle / failurePolicy。
- Permission kind 至少覆盖 read / local-note-search / public-network / cookie-network / write / patch-apply / execute / destructive。
- Permission decision 至少覆盖 auto-allowed / prompt-required / denied / blocked-by-configuration / unavailable / degraded-fallback。
- Registry duplicate 不再静默覆盖。
- Unsupported tool 产生结构化失败。
- Runtime 具备 `permission.resolved` path。
- Reserved / unavailable event guard 能阻止工具伪造成熟能力。
- Workbench unavailable / permission 展示来自 policy 输出。
- Focused tests、typecheck、API boundary audit、capability claim audit 通过。
- `notes/**` 未修改，未 push。
