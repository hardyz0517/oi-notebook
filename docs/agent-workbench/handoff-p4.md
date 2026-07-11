# NoteX Agent Workbench Handoff: P4 Closeout

**Date:** 2026-06-28  
**Updated:** 2026-07-02  
**Scope:** P4 closeout and next-session handoff
**Role:** preserve the verified P4 boundary and guide P5 planning

## P4 closeout state

P4 is implemented in `codex/p4-agent-workbench` as a Web Reader + Evidence slice for the new Agent Workbench architecture.

Confirmed implementation:

- Activity Bar opens the new Agent Workbench without rerouting the old `src/components/ai/AiSidebar.tsx`.
- `src/lib/agent-runtime/**` provides typed sessions, events, tool registration, and permission gating.
- `src/lib/problem-workspace/**` provides the first `ProblemWorkspace` model and in-memory store helpers.
- `src/lib/agent-workbench/workbenchTaskFlow.ts` connects runtime, workspace, manual/Luogu/current task modes, evidence, permissions, and cache snapshots.
- `src/components/agent-workbench/**` renders the workspace panel, tool trace, evidence panel, and permission surface.
- `src/lib/research-engine/searchProvider.ts`, `readerProvider.ts`, `extractor.ts`, `evidenceStore.ts`, `cacheManager.ts`, and `pipelineBoundary.ts` separate search, read, extraction, evidence, and cache responsibilities.
- Tavily is configuration-aware and unavailable without a key/transport.
- Public search has a keyless Bing boundary.
- Manual URL reading works through the runtime path.
- Luogu Cookie Reader has an initial safety boundary: domain-limited, missing-cookie aware, and never forwards cookies to model or third-party payloads.
- Frontend-to-Rust IPC remains behind `src/lib/api.ts`, with `src/lib/apiContract.ts` aligned.
- `notes/**` was not modified.

Fresh closeout verification:

- `.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts src/lib/appShell.test.ts` passed: 2 files, 22 tests.
- P4 focused suite passed: 13 files, 26 tests.
- `.\node_modules\.bin\tsc.cmd --noEmit` passed.
- `.\node_modules\.bin\vite.cmd build` passed with only existing large chunk warnings.
- `cargo check --manifest-path .\src-tauri\Cargo.toml` passed with existing dead-code warnings.
- API boundary audit had no matches outside the approved boundary:
  `rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'`
- Browser smoke on Vite confirmed Workbench open, Run flow, Luogu mode, trace/evidence/permission rendering, state preservation, and old AI Sidebar isolation.

Known environment note:

- `pnpm.cmd` commands can be blocked before test execution by the Codex runtime dependency policy:
  `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: msw@2.13.5, sharp@0.34.5`.
  Use the checked-in `node_modules\.bin\*.cmd` commands for local verification in this worktree unless the dependency policy is approved.

## Historical P3 baseline

- P3 closeout verification passed in `C:\Users\cpp_s\.codex\worktrees\730d\oi-notebook`.
- `vitest` passed: **57 files, 416 tests**.
- `tsc --noEmit` passed.
- No stage / commit / push was performed.
- `notes/**` was not touched.

## Original P4 start-point notes

The original start-point handoff recorded only partial P4 evidence:

- **P4.2 Web Reader / Search**
  - The worker reported a search-read split skeleton.
  - It added or updated these files:
    - `src/lib/research-engine/searchProvider.ts`
    - `src/lib/research-engine/readerProvider.ts`
    - `src/lib/research-engine/extractor.ts`
    - `src/lib/research-engine/evidenceStore.ts`
    - `src/lib/research-engine/cacheManager.ts`
    - `src/lib/research-engine/pipelineBoundary.ts`
    - `src/lib/research-engine/index.ts`
  - The worker's own report says the current `research-engine` is still the old coupled pipeline and that Tavily / local reader / manual reader are not yet truly wired.

## Existing P3 anchor

`docs/agent-workbench/phase3-closeout.md` is the main P3 boundary reference.

Key P3 conclusions from that note:

- old `src/components/ai/AiSidebar.tsx` is not wired to L5 capability
- `src/components/agent-workbench/**` stays read-model only
- permission UI emits fake structured intents only
- workspace / evidence / run / artifact panels are ref-only previews
- replay projects into read model; workspace truth stays behind the mutation adapter

## Safe P5 next steps

1. Keep `AiSidebar.tsx` as the legacy flow until a later migration is explicitly planned.
2. Promote the Workbench task flow from manual fixture reading to a real public search/read task using `createKeylessBingSearchProvider` and `createTauriUrlReaderProvider`.
3. Add a user-visible unavailable/config state for Tavily that can become active only after a user-provided key and explicit approval.
4. Keep Luogu cookie use behind the safety boundary; do not forward cookies to model providers, Tavily, browser extraction, logs, or evidence payloads.
5. Persist workspace/evidence state only after defining the storage boundary; P4 intentionally uses in-memory stores.
6. Treat write, execute, patch, and code-runner capabilities as permission placeholders until a separate P5/P6 plan approves them.

## Guardrails

- This thread should coordinate, verify, and integrate.
- It should not be the one doing all implementation work itself.
- When a slice needs code changes, spawn or hand off to a separate worker thread.
- Do not treat subagent reports as verified unless you have the final agent result.
- Do not infer that completion in one P4 slice means the others are done.
- Do not add real runtime/model/Tavily/note IO/patch/code execution into the old sidebar flow.
- Do not stage/commit/push unless explicitly asked.

## P5 Agent Core Contract Freeze handoff

P5 has frozen the Agent Core protocol boundary for the Workbench, but the runtime remains `preview_one_shot`. This is not a real model loop and must not be described as AI upgrade completion, L5 Agent completion, Codex-style runtime completion, or production-ready behavior.

Current contract truth:

- `AgentLoopContract.mode` is `preview_one_shot`.
- Mature capabilities are explicitly `reserved` or `unavailable`, including model step, continuation, interruption, compaction, patch generation/apply, and session persistence.
- The current one-shot runtime can emit contract-shaped events and run preview tool primitives, but it does not own real provider/model request/streaming behavior.
- Workbench UI consumes `loopContract`, session snapshots, and events only; it does not own agent loop decisions, prompt construction, tool routing, continuation, compaction, patch application, or persistence.
- No real write/patch/execute/Cookie-backed expansion/persistence capability was introduced by P5.

Verification rerun on 2026-07-05 in `C:\Users\cpp_s\.codex\worktrees\20cf\oi-notebook`:

- `.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime`: PASS, 6 files / 11 tests.
- `.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench`: PASS, 1 file / 5 tests.
- `.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts`: PASS, 1 file / 7 tests.
- `.\node_modules\.bin\tsc.cmd --noEmit`: PASS.
- API boundary audit had no hits:
  `rg -n "@tauri-apps/api/core|\binvoke\s*\(" src --glob "!src/lib/api.ts" --glob "!src/components/ai/**" --glob "!src/lib/aiWebSearch.ts"`
- Capability claim audit had no hits:
  `rg -n "AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true" src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench`

Next-phase rule: any later work that touches Tool/Permission, Workspace, Web Reader/Evidence, UI IA, or Provider Adapter behavior must cite `docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md` and must not reopen P5's forbidden items without a new approved plan.

## P6 Tool/Permission Contract Freeze handoff

P6 输出状态：**Tool/Permission Contract Preview**。本阶段只冻结 Tool/Permission contract preview 边界，不代表 AI 大升级完成、L5 Agent 完成、Codex-style runtime 完成或 production capability 可用。

P6 已冻结的 contract：

- Tool schema / metadata：工具定义携带 inputSchema、outputSchema、permission、exposure、timeoutMs、lifecycle、failurePolicy。
- Registry duplicate / unsupported guard：重复注册不再静默覆盖，未注册工具返回结构化 unsupported failure。
- Permission decision matrix：permission kind 覆盖 read、local-note-search、public-network、cookie-network、write、patch-apply、execute、destructive；decision status 覆盖 auto-allowed、prompt-required、denied、blocked-by-configuration、unavailable、degraded-fallback。
- Runtime `permission.resolved` lifecycle：runtime 在 permission decision 后输出可审计的 `permission.resolved` path，并保持 `tool.requested`、`permission.required`、`tool.started`、`tool.output`、`tool.failed` 的生命周期边界。
- Reserved event guard：工具提供的 reserved / unavailable 成熟能力事件会被 guard 拒绝并转为结构化失败，不能伪造 model loop、patch apply、compaction 等成熟能力。
- Workbench permissionRequests 消费 policy output：Workbench 的 Tavily / Luogu Cookie permissionRequests 来自 permission policy decision，不再手写旧的 unavailable cards 或 `permission: "network"`。

P6 仍禁止 / 未实现：

- 真实 model loop、provider request、streaming。
- 真实 write、patch apply、execute、code runner、delete、rollback。
- Cookie-backed reader / Cookie-backed Luogu reading。
- session persistence、storage、request log 持久化。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts` 或修改 `notes/**`。

本次 Task 6 closeout 实际验证记录：

- 启动时 `.\node_modules\.bin\vitest.cmd` 缺失，`node .\node_modules\vitest\vitest.mjs` 也因本地 `node_modules\vitest` 缺失不可用；按 worker 指令执行 `pnpm.cmd fetch --force --ignore-scripts --frozen-lockfile` 和 `pnpm.cmd install --ignore-scripts --frozen-lockfile` 修复本地依赖链接，未改锁文件。
- `.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime`: PASS, 6 files / 23 tests.
- `.\node_modules\.bin\vitest.cmd run src/lib/agent-workbench`: PASS, 1 file / 6 tests.
- `.\node_modules\.bin\vitest.cmd run src/lib/apiBoundary.test.ts`: PASS, 1 file / 7 tests.
- `.\node_modules\.bin\tsc.cmd --noEmit`: PASS.
- API boundary audit 无命中：
  `rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'`
- Capability claim audit 无命中：
  `rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench`
- Workbench hardcoded permission-card audit 无命中：
  `rg -n 'createUnavailablePermissionStates|tavily:unavailable|luogu-cookie:missing|permission: "network"' src/lib/agent-workbench/workbenchTaskFlow.ts src/lib/agent-workbench/workbenchTaskFlow.test.ts`
- 额外 false-positive 清理后验证：
  `.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime/agentTypes.test.ts`: PASS, 1 file / 5 tests.
  `.\node_modules\.bin\vitest.cmd run src/lib/agent-runtime`: PASS, 6 files / 23 tests.

下一阶段必须继续参考：

- 总 spec：`docs/superpowers/specs/2026-07-04-ai-agent-workbench-upgrade-design.md`
- P5 freeze：`docs/superpowers/specs/2026-07-05-p5-agent-core-contract-freeze-design.md`
- P6 freeze：`docs/superpowers/specs/2026-07-05-p6-tool-permission-contract-freeze-design.md`
- P6 plan：`docs/superpowers/plans/2026-07-05-p6-tool-permission-contract.md`

后续任何 worker 不得越过 `src/lib/api.ts` 边界，不得把 `notes/**` 纳入 routine engineering work，也不得把 P6 的 preview contract 表述为成熟 Agent 能力。

## P7 OI Research / Solution Skill Contract Freeze handoff

P7 输出状态：**OI Research/Solution Skill Contract Preview**。本阶段只冻结 OI research / solution skill 的 contract、read model、ProblemWorkspace preview fields 和 Workbench projection，不代表真实 AI 解题、成熟 model loop、provider adapter、patch/write/execute、Cookie-backed reader 或 persistence 可用。

P7 已冻结 / 已合入：

- OI skill contract types：`skillId`、task/source/evidence/solution outline/read-model、preview status、source role、permission request、trace event 等类型已经落在 `src/lib/oi-skills/**`。
- ProblemWorkspace preview fields：题面 statement、sourceRoles、solutionOutline preview 挂载字段已经合入 `src/lib/problem-workspace/**`。
- Deterministic `oiSkillPreviewAdapter`：把既有 research evidence 映射成 P7 `research-problem` read model，不接真实 provider/model loop。
- `runWorkbenchTask.oiSkillPreview` read model：Workbench task flow 返回 P7 preview read model，作为只读投影输入。
- Workbench projection：`OiSkillPreviewPanel` 和 `ProblemWorkspacePanel` 只展示 P7 read model / workspace projection。

Workbench 边界：

- Workbench 只消费 P7 read model，不拥有 skill decisions，不拼 prompt，不决定 provider/model，不绕过 runtime/policy。
- `permissionRequests` 继续来自 P6 policy/runtime output；P7 projection 只读取并展示这些请求，不手写新的能力判定。

P7 仍禁止 / 未实现：

- 真实 provider request、prompt construction、model loop、streaming。
- 真实 write、patch apply、execute、code runner、delete、rollback。
- Cookie-backed Luogu reading / Cookie-backed reader。
- session persistence、storage、request log。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts`、直接 Tauri invoke、修改 `notes/**`。

本次 Task 5 boundary audit 实际验证记录：

- 启动快照：
  `git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出；`git log --oneline -10 --decorate` 显示 HEAD 为 `c1aa2b9 feat: project p7 oi skill preview in workbench`，并包含 P7 Task 1-4 commits `56d1617`、`9bc8df5`、`ac5c853`、`c1aa2b9`。
- 初次执行 `node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills` 因本地 `node_modules\vitest\vitest.mjs` 缺失失败；随后执行 `pnpm.cmd install --ignore-scripts --frozen-lockfile` 恢复依赖链接，lockfile 未修改，filtered status 仍为空。
- `node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills`: PASS, 1 file / 4 tests.
- `node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace`: PASS, 2 files / 7 tests.
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench`: PASS, 2 files / 9 tests.
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`: PASS, 6 files / 23 tests.
- `node .\node_modules\vitest\vitest.mjs run src/lib/research-engine`: PASS, 4 files / 10 tests.
- `node .\node_modules\typescript\bin\tsc --noEmit`: PASS.
- API boundary audit 无命中：
  `rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'`
- Capability claim audit 无命中：
  `rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/lib/research-engine src/components/agent-workbench src/lib/problem-workspace src/lib/oi-skills`
- Workbench hardcoded preview drift audit 无命中：
  `rg -n 'createUnavailablePermissionStates|tavily:unavailable|luogu-cookie:missing|permission: "network"' src/lib/agent-workbench src/components/agent-workbench`
- Broad provider/model/streaming audit 有既有命中，不记为全局 no-hit：
  `src/lib/agent-runtime/**` 命中 reserved event literal `model.delta`；`src/lib/research-engine/**` 命中既有 `providerId` / `modelId` planner and shadow-run fields，以及 OpenAI news fixtures / diagnostics / mock reader / self-check fixtures。这些属于 P7 之前已有的 runtime protocol literal 与 research-engine provider/news fixture surface，不是 P7 changed surface 新增越界。
- P7 changed-surface scoped provider/model audit 无命中：
  `rg -n 'providerId|modelId|chat_with_current_note_stream|model\.delta|prompt construction|OpenAI' src/lib/agent-workbench src/components/agent-workbench src/lib/problem-workspace src/lib/oi-skills`
- P7 changed-surface scoped capability claim audit 无命中：
  `rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-workbench src/components/agent-workbench src/lib/problem-workspace src/lib/oi-skills`

下一阶段入口：

- 必须新写 freeze spec 和 implementation plan，才能讨论真实 model loop、provider adapter、patch workflow、execute、Cookie-backed reader 或 persistence。
- 任何后续 worker 不得从 P7 preview contract 推导出真实 AI 解题能力已经可用。

## P8 Agent Session / Replay Contract Freeze handoff

P8 输出状态：**Agent Session/Replay Contract Preview**。本阶段冻结 session metadata、event log/replay fixture、checkpoint contract、privacy/redaction contract、workspace/evidence/session linkage 和 Workbench read-only replay projection，不代表真实 provider request、prompt construction、model loop、streaming、write、patch apply、execute runner、Cookie-backed reader、session persistence/storage 或 request log 可用。

P8 已冻结 / 已合入：

- Session metadata：记录 P8 input/output state、workspace id、privacy policy id、replay source 和 capability statuses。
- Event log / replay fixture：按 sequence deterministic replay，ordering、session mismatch、redaction、reserved/unavailable capability 等 failure 有结构化 reason。
- Checkpoint contract：fixture / in-memory checkpoint 作为恢复边界，不是 storage 或 persistence 实现。
- Privacy/redaction contract：Cookie、secret、local-note、user-input、derived-evidence 等分类进入 policy type，不进入 fixture 明文、模型 provider、第三方 payload 或 request log。
- Workspace/evidence/session linkage：ProblemWorkspace、OI skill read model、replay read model 和 Workbench evidence 可以互相定位。
- Workbench read-only replay projection：UI 只读消费 replay view model，不拥有 replay decision，不拼 prompt，不决定 provider/model，不触发工具执行。

P8 仍禁止 / 未实现：

- 真实 provider request、prompt construction、model loop、streaming。
- 真实 write、patch apply、execute、code runner、delete、rollback。
- Cookie-backed reader 或 Cookie-backed capability expansion。
- session persistence、session storage、request log。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts`、直接 Tauri invoke、修改或读取真实 `notes/**` 参与 routine engineering work。

本次 Task 5 boundary audit 实际验证记录：

- 启动快照：`git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出；`git log --oneline -12 --decorate` 显示 HEAD 为 `699b8bf chore: keep replay capability keys readable`，并包含 P8 Task 1-4 commits `3da7096`、`6afeff3`、`5c9f1d9`、`94fb390`、`41f8f42`、`699b8bf`。
- 首次执行 `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime` 因本地 `node_modules\vitest\vitest.mjs` 缺失失败，未进入 Vitest test discovery；随后执行 `pnpm.cmd install --ignore-scripts --frozen-lockfile` 恢复依赖链接，lockfile / package 文件未修改，filtered status 仍为空。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`: PASS, 7 files / 33 tests.
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench`: PASS, 3 files / 10 tests.
- `node .\node_modules\vitest\vitest.mjs run src/lib/problem-workspace`: PASS, 2 files / 9 tests.
- `node .\node_modules\vitest\vitest.mjs run src/lib/oi-skills`: PASS, 1 file / 5 tests.
- `node .\node_modules\typescript\bin\tsc --noEmit`: PASS.
- API boundary audit 无命中：
  `rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'`
- Provider/model audit 无命中：
  `rg -n 'providerId|modelId|chat_with_current_note_stream|model\.delta|prompt construction|OpenAI' src/lib/agent-workbench src/components/agent-workbench src/lib/problem-workspace src/lib/oi-skills`
- Write/patch/execute/Cookie/storage audit 有允许命中，不记为全局 no-hit：
  `src/lib/oi-skills/oiSkillTypes.ts:6` 命中既有 P7 `write-solution-outline` skill id，是 OI skill contract literal，不是真实 write 能力。
  `src/components/agent-workbench/AgentWorkbenchShell.tsx:127` 命中既有 Workbench preview status `Patch/execute: unavailable`，是不具备能力的状态展示。
  `src/lib/agent-workbench/sessionReplayViewModel.test.ts:13` 命中 P8 `execute: unavailable` fixture，是负证明测试，不是真实 execute 能力。
  `src/components/agent-workbench/SessionReplayPanel.tsx:37` 和 `src/components/agent-workbench/SessionReplayPanel.tsx:38` 只读展示 execute capability reason/status，状态来自 replay view model，不触发执行。
- filtered status 在测试、审计、依赖恢复和追加本 P8 handoff 前仍为空；暂存区在追加本 P8 handoff 前仍为空。

下一阶段必须新写 freeze spec，才能讨论 provider/model adapter contract、patch workflow contract、tool execution runner contract、Cookie-backed reader contract、session persistence/storage contract 或 Workbench IA replay/detail contract。任何后续 worker 不得从 P8 preview contract 推导出真实 provider/model/patch/execute/Cookie/persistence 已获批。

## P9 Provider / Model Adapter Contract Freeze handoff

P9 输出状态：**Provider/Model Adapter Contract Preview**。本阶段冻结并合入 provider/model request envelope、adapter interface、mock fixture、stream event contract、error taxonomy、capability matrix、cancellation/rate-limit/retry metadata、redaction/permission policy 和 Workbench read-only projection。

P9 已冻结 / 已合入：

- Request envelope：记录 request/session/turn/workspace/provider/model/evidence/privacy/permission/capability metadata，只引用 evidence id 和 workspace id，不携带真实 note 内容。
- Adapter interface：仅 mock adapter，使用 deterministic fixture events，不使用真实网络、SDK、Tauri、环境变量、API key 或 secrets。
- Mock fixture：只包含合成文本、固定 id、固定时间和非 secret payload。
- Stream event contract：`*.preview` 事件仅表示 fixture projection，不表示 live streaming。
- Error taxonomy：auth/network/rate-limit/quota/timeout/schema/unsupported/cancel/redaction/permission/fixture errors 映射为 safe structured errors，不向 UI 泄漏 raw provider payload。
- Capability matrix：provider request、streaming、tool calling 等真实能力保持 unavailable/reserved/blocked/degraded，不冒充 live capability。
- Cancellation/rate-limit/retry metadata：只作为 contract metadata 和 preview event，不执行真实 abort、backoff 或 provider retry。
- Redaction/permission policy：secret、cookie、真实 note content 和未获批准 payload 不进入 provider/model request；provider request permission 由 runtime policy 表达，P9 不允许 live call。
- Workbench read-only projection：UI 只读展示 provider/model preview view model，不选择 provider，不拼 prompt，不触发 provider request。

P9 仍禁止 / 未实现：

- 真实 provider request、真实 streaming、prompt construction、model loop。
- API key handling、secret storage、request log、session storage/persistence。
- write、patch apply、execute/code runner、delete/rollback。
- Cookie-backed reader。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts`、直接 Tauri invoke、读取或修改真实 `notes/**`。

本次 Task 5 验证记录：

- 初次执行 `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`：FAIL，`node_modules\vitest\vitest.mjs` 缺失，未进入 Vitest test discovery，无 test file count / test count；随后执行 `pnpm.cmd install --ignore-scripts --frozen-lockfile` 恢复依赖链接，未提交 package/lock 变化。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`：PASS，10 test files / 43 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench`：PASS，4 test files / 11 tests。
- `node .\node_modules\typescript\bin\tsc --noEmit`：PASS。

本次 Task 5 boundary audit 记录：

- API boundary audit 无命中：
  `rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'`
- Network / secret / provider audit 无命中；本轮没有测试里的 `secret` negative-proof 字符串命中，也没有 Authorization、apiKey、OPENAI/ANTHROPIC key、`sk-`、fetch/XMLHttpRequest/EventSource/WebSocket 命中：
  `rg -n 'fetch\(|XMLHttpRequest|EventSource|WebSocket|Authorization|apiKey|api_key|OPENAI_API_KEY|ANTHROPIC_API_KEY|sk-[A-Za-z0-9]' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench`
- Prompt/request-log/storage/Cookie/patch/execute audit 无命中；未出现真实 prompt construction、request log、session storage、Cookie-backed reader、patch apply 或 execute runner：
  `rg -n 'chat_with_current_note_stream|prompt construction|request log|session storage|Cookie-backed|patch apply|execute runner' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench`
- Capability audit 无命中；没有把 live provider request 或 live streaming 标为 preview-ready：
  `rg -n 'providerRequest:\s*\{\s*status:\s*"preview"|streaming:\s*\{\s*status:\s*"preview"' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench`
- 追加本 handoff 前，`git status --short -- . ":(exclude)notes/**"` 无输出，`git diff --cached --name-only` 无输出。

下一阶段必须新写 freeze spec，才能讨论 live provider request、live streaming、prompt construction、model loop、provider settings migration、API key handling、request log persistence、patch workflow、tool execution runner、Cookie-backed reader 或 session persistence/storage。任何后续 worker 不得从 P9 preview contract 推导出真实 provider/model/streaming/prompt/storage/write/patch/execute 能力已经可用。

## P10 Model Loop / Live Provider Request Contract Freeze handoff

P10 输出状态：**Live Provider Request / One-Turn Model Step Contract Preview**。本阶段允许在通过 `src/lib/api.ts` / Tauri 安全边界、runtime permission gate、redaction gate、secret handling、bounded retry、cancellation 和 redacted memory audit snapshot 后进入真实 provider request / live streaming；它仍不是成熟 multi-step model loop、tool continuation、patch workflow、execute/code runner、Cookie-backed reader、session persistence 或 production-ready Agent。

P10 已允许 / 已合入：

- Live request metadata：记录 request/session/turn/workspace/provider/model、contextBuildId、permissionDecisionId、redactionDecisionId、secretRef、streamPolicyId、abortControllerId、retryPolicyId 等 live request boundary 字段。
- Runtime ContextBuilder / PromptAssembler：provider context 和 payload assembly 由 runtime/provider boundary 负责，Workbench / React component 不拥有 P10 provider prompt assembly。
- API boundary：frontend-to-Rust provider request 只经 `src/lib/api.ts`；Rust / Tauri 侧负责 secret lookup 和 live request transport。
- One-turn live model step：冻结并合入单次 live model step、normalized stream projection、usage/completion/safe failure、cancellation、bounded retry 与 audit event contract。
- Redacted memory audit snapshot：P10 只允许内存态 redacted audit snapshot，不写 durable request log。
- Workbench read-only live projection：Workbench 只读展示 live request / stream / cancel / retry / error 状态，不选择 provider、不读 secret、不触发工具执行。

P10 仍禁止 / 未实现：

- multi-step autonomous model loop、tool-call continuation、observation 回灌模型、compaction。
- write、patch generation、patch apply、execute/code runner、delete、rollback。
- Cookie-backed reader / Cookie-backed Luogu reading。
- session persistence、database storage、durable request-log storage。
- 旧 `src/components/ai/AiSidebar.tsx` 迁移。
- 绕过 `src/lib/api.ts`、frontend 持有 API key / Authorization header / cookie、读取或修改真实 `notes/**`。

本次 Task 7 最终验证记录：

- 初次执行 `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`：FAIL，`node_modules\vitest\vitest.mjs` 缺失，未进入 Vitest test discovery，无 test file count / test count；随后执行 `pnpm.cmd install --ignore-scripts --frozen-lockfile` 恢复依赖链接，未修改 package / lock metadata，filtered status 和 staged paths 仍为空。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`：PASS，14 test files / 55 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench`：PASS，4 test files / 13 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts`：PASS，1 test file / 9 tests。
- `node .\node_modules\typescript\bin\tsc --noEmit`：PASS。
- `cargo check --manifest-path .\src-tauri\Cargo.toml`：FAIL / blocker，Tauri build script 停在 `resource path '..\local-blog\dist' doesn't exist`；本次不声称 Rust check 通过。

本次 Task 7 boundary audit 记录：

- Direct Tauri audit 无命中：
  `rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'`
- Secret / provider audit 有允许命中，不代表 frontend / Workbench 持有 secret：
  `src/lib/api.ts:95`、`src/lib/api.ts:109` 命中 Tauri boundary command 参数 `api_key`；`src/lib/api.ts:401` 命中 boundary wrapper option `apiKey?`；`src/lib/agent-runtime/providerModelTypes.test.ts:151` 命中 negative-proof assertion `not.toContain("Authorization")`。
- Prompt construction audit 有 scoped 命中：
  `src/lib/agent-runtime/providerContextBuilder.test.ts` 与 `src/lib/agent-runtime/providerPromptAssembler.test.ts` 是 P10 runtime ContextBuilder / PromptAssembler focused tests；
  `src/components/settings/SearchDiagnosticsPanel.tsx:1235`、`:1561` 是既有搜索诊断面板的 prompt contract static check，只检查关键约束字符串是否存在且不返回提示词全文，不属于 Agent Workbench P10 provider prompt assembly。
- Forbidden patch / execute / Cookie / storage / AiSidebar audit 无命中：
  `rg -n 'patch apply|execute runner|Cookie-backed|session storage|request log persistence|AiSidebar' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench src/lib/api.ts src-tauri/src`
- Forbidden mature capability claim audit 无命中：
  `rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench`
- 追加本 handoff 前，`git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出。

下一阶段必须先写新的 freeze spec，才能讨论 multi-step model loop / tool continuation、session persistence / request-log storage、patch workflow、execute runner、Cookie-backed reader 或 old AiSidebar retirement / migration。任何后续 worker 不得从 P10 one-turn live step contract 推导出完整 autonomous Agent loop 或 production-ready Workbench 已经可用。

## P11 Multi-Step Model Loop / Tool-Call Continuation Contract Freeze handoff

P11 输出状态：**Multi-Step Model Loop / Tool-Call Continuation Contract Preview**。本阶段把 P10 的 one-turn live model step 扩展为受限 multi-step continuation contract preview；它仍不是 production-ready autonomous Agent，也不表示 AI 大升级完成。

P11 已冻结 / 已合入：

- Loop contract / event taxonomy：turn、step、attempt、terminal status、cancellation、failure taxonomy 和 loop event sequence。
- Tool-call parser / normalizer：provider output 只被解析为 tool-call intent，不直接执行工具或泄漏 raw provider payload。
- Tool registry / router / lifecycle preview：preview tool definitions、duplicate guard、unsupported tool failure、mock/read-only route 和 lifecycle events。
- Permission gate：read、local-note-search、public-network、cookie-network、write、patch-apply、execute、delete、rollback、destructive 的决策矩阵。
- Observation redaction / continuation context：工具结果先进入 observation，经 redaction、summarization、bounding 和 provenance 标记后才允许进入 continuation。
- Bounded multi-step loop preview：runtime 拥有 continuation decision、maxSteps、permission denial、tool failure、cancellation 和 terminal handling；transport 为 injected mock/read-only preview。
- Workbench read-only loop projection：Workbench 只读展示 loop timeline、tool-call、permission、observation 和 terminal status，不拥有 loop decisions。

P11 仍禁止 / 未实现：

- production-ready autonomous Agent、AI 大升级完成、L5 Agent 完成、Codex-style runtime 完成等成熟能力声明。
- real patch / write / delete / rollback。
- execute / code runner。
- Cookie-backed reader / Cookie-backed Luogu reading。
- session storage、database storage、durable session persistence、durable request-log persistence、raw provider payload storage。
- old `src/components/ai/AiSidebar.tsx` migration。
- frontend secrets、API key、Authorization header、cookie 或 raw provider payload 持有。
- direct Tauri bypass outside `src/lib/api.ts`。
- 读取或修改真实 `notes/**` 参与 routine engineering work。

本次 Task 8 final verification 记录：

- 初次执行四条 GREEN 命令：FAIL / environment blocker，`node_modules\vitest\vitest.mjs` 与 `node_modules\typescript\bin\tsc` 缺失，未进入 Vitest test discovery，无 test file count / test count。
- 按任务允许命令执行 `pnpm.cmd install --ignore-scripts --frozen-lockfile`：PASS，lockfile already up to date，恢复 763 个本地依赖链接，未修改 package / lock metadata。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`：PASS，23 test files / 93 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench`：PASS，5 test files / 17 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts`：PASS，1 test file / 9 tests。
- `node .\node_modules\typescript\bin\tsc --noEmit`：PASS。

本次 Task 8 boundary audit 记录：

- Direct Tauri audit 无命中：
  `rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'`
- Secret / cookie audit 有允许命中，不代表 Workbench frontend 持有 secret 或 Cookie：
  `src/lib/api.ts:95`、`:109`、`:401` 是 API boundary 参数 / wrapper option；
  `src/lib/agent-workbench/modelLoopViewModel.ts:71` 是 redaction regex；
  `src/lib/agent-workbench/modelLoopViewModel.test.ts:36`、`:96`、`:106`、`:107`、`:109`、`:110` 是 negative-proof redaction tests；
  `src/lib/agent-runtime/multiStepModelLoop.test.ts:181`、`:198`、`:200`、`src/lib/agent-runtime/toolCallParser.test.ts:31`、`:34`、`:43`、`:44`、`src/lib/agent-runtime/toolObservation.test.ts:21`、`:23`、`:25`、`:39`、`:43`、`:44`、`:45`、`:49`、`:59`、`:60`、`:75`、`:76` 是 secret / Authorization / cookie negative-proof tests；
  `src/lib/agent-runtime/providerModelPolicy.test.ts:36`、`:52`、`:54`、`:56`、`:59`、`:67`、`src/lib/agent-runtime/liveProviderPolicy.test.ts:48`、`:50`、`:52`、`:55`、`src/lib/agent-runtime/providerModelTypes.test.ts:146`、`:151` 是 provider exposure negative-proof tests；
  `src/lib/agent-runtime/agentReplay.ts:109`、`src/lib/agent-runtime/agentReplay.test.ts:77`、`:81`、`src/lib/agent-runtime/agentSession.ts:59`、`src/lib/agent-runtime/agentTypes.ts:48`、`:173`、`:196`、`src/lib/agent-runtime/agentTypes.test.ts:118`、`:129`、`:167`、`:185`、`:192`、`:215` 是 P8 replay/privacy/capability contract；
  `src/lib/agent-runtime/agentRuntime.test.ts:135`-`:160`、`src/lib/agent-runtime/permissionManager.ts:37`-`:38`、`src/lib/agent-runtime/permissionManager.test.ts:38`-`:42`、`src/lib/agent-runtime/toolPermissionGate.ts:97`-`:98`、`src/lib/agent-runtime/toolPermissionGate.test.ts:16`、`:58`、`:60`、`src/lib/agent-runtime/toolContinuationRegistry.ts:13`、`:221`、`src/lib/agent-workbench/workbenchTaskFlow.ts:201`、`src/lib/agent-workbench/workbenchTaskFlow.test.ts:102`-`:106`、`src/lib/agent-workbench/sessionReplayViewModel.test.ts:14`、`src/components/agent-workbench/SessionReplayPanel.tsx:40`-`:41` 是 unavailable / preview / policy wording for cookie-network。
- Prompt / ContextBuilder audit 有允许命中：
  `src/lib/agent-runtime/providerContextBuilder.test.ts:3` 与 `src/lib/agent-runtime/providerPromptAssembler.test.ts:3` 是 P10 runtime boundary focused tests；
  `src/components/settings/SearchDiagnosticsPanel.tsx:1235`、`:1561` 是既有搜索诊断 prompt contract 静态检查，不属于 P11 Workbench prompt construction。
- Forbidden capability audit 有允许或既有边界命中，不代表 P11 开放真实 patch/write/delete/rollback/execute/Cookie/storage：
  `src/lib/api.ts:937`、`:939`、`:993`、`:995`、`:1258`、`:1262`、`:1264`、`:1313`、`:1315` 是既有 API boundary delete provider/model/note wrappers；
  `src-tauri/src/ai.rs:3905`、`:3987` 是提示约束文本中的 "Do not delete"；
  `src-tauri/src/ai.rs:12508`、`:12511`、`:12730`、`:12737`、`:12751`、`src-tauri/src/notes.rs:745`、`:838`、`src-tauri/src/git.rs:306`、`:316`、`:318`、`:319`、`:387`、`:432`、`:436`、`:437`、`src-tauri/src/lib.rs:85`、`:89`、`:92`、`:115`、`:122` 是既有 Rust note/provider delete / git commit_deleted_note API surface，不是 P11 implementation；
  `src-tauri/src/prompts.rs:255`、`:272` 是既有提示约束文本；
  `src/lib/agent-runtime/agentRuntime.test.ts:167`、`:179`、`:189`、`src/lib/agent-runtime/permissionManager.test.ts:52`、`:54`、`:66`、`:67`、`:86`、`:91`、`:93`、`src/lib/agent-runtime/permissionManager.ts:41`、`src/lib/agent-runtime/toolRegistry.test.ts:56` 是 P6/P11 negative-proof permission coverage；
  `src/lib/agent-runtime/multiStepModelLoop.ts:171` 是 P11 reserved tool name guard；
  `src/lib/agent-runtime/agentTypes.ts:50`、`src/lib/agent-runtime/agentTypes.test.ts:120`、`:131`、`src/lib/agent-runtime/toolContinuationRegistry.ts:15`、`:17`、`:18`、`src/lib/agent-runtime/toolPermissionGate.ts:103`、`:109`、`:110`、`:112`、`:113`、`src/lib/agent-runtime/toolPermissionGate.test.ts:18`、`:20`、`:21`、`:58`、`:62`、`:64`、`:65` 是 patch-apply / delete / rollback contract literals and unavailable / denied policy。
- Mature capability claim audit 无命中：
  `rg -n 'AI 澶у崌绾у畬鎴恷L5 Agent 瀹屾垚|Codex-style runtime 瀹屾垚|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench`
  额外 UTF-8 中文模式 `AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true` 也无命中。
- 追加本 handoff 前，`git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出。

下一阶段必须先写新的 freeze spec，才能继续讨论 durable session/replay persistence、real patch workflow、execute runner、Cookie-backed reader、old AiSidebar retirement / migration、真实 approval UI wiring 或任何 production autonomous Agent 能力。任何后续 worker 不得从 P11 contract preview 推导出真实 patch/write/delete/rollback/execute/Cookie/storage 已获批。

## P12 Durable Session / Request Log / Replay Persistence Contract Freeze handoff

P12 输出状态：**Durable Session / Request Log / Replay Persistence Contract Preview**。本阶段把 P11 multi-step continuation preview 之后的 durable session metadata、safe request/audit log、in-memory store contract、API/Tauri no-op boundary、deterministic replay projector 和 Workbench 只读 session history projection 冻结为 contract preview；它仍不是 production-ready autonomous Agent，也不表示 AI 大升级完成。

P12 已冻结 / 已合入：

- `79e7610 docs: define p12 durable session request log contract`：冻结 P12 spec / plan、输出状态、storage / redaction / replay / Workbench 只读边界。
- `4ecdcf2 feat: define p12 durable session contract`：冻结 durable session metadata、event envelope、schema version、sequence ordering、checkpoint refs、capability statuses 和 corruption / migration result types。
- `dd4f714 feat: redact p12 request audit logs`：冻结 request/audit log safe metadata 与 redaction policy，保留 `secretRef` ids，不保存 raw provider payload / raw tool output / secret / Cookie。
- `b0dbbdb feat: add p12 in-memory session store contract`：冻结 `AgentSessionStore` / `RequestAuditLogStore` interface 与 in-memory adapter contract，不实现 DB / FS durable storage。
- `b208496 feat: project p12 durable replay logs`：冻结 deterministic replay projector、schema/corruption/migration read model 和 replay read-only guard；历史中的 `8513b44` 已由 `5dfd211` revert，保留为失败 cherry-pick / 安全撤回记录。
- `700b116 feat: project p12 session history`：冻结 Workbench read-only session history / audit trail projection 与 `SessionHistoryPanel` 展示，不让 UI 触发 storage mutation、tool execution、provider request、patch、write、delete、rollback 或 Cookie reader。

P12 仍禁止 / 未实现：

- production-ready autonomous Agent、AI 大升级完成、L5 Agent 完成或 Codex-style runtime 完成等成熟能力声明。
- 真实 DB / FS durable storage、filesystem durable log writer、真实 migration execution、retention/export/delete cleanup job。
- real patch、write mutation、delete、rollback、execute / code runner、Cookie-backed reader。
- raw provider payload storage、raw tool output storage、API key / Authorization / Cookie / secret 明文进入 durable log 或 Workbench。
- 旧 `src/components/ai/AiSidebar.tsx` migration。
- 绕过 `src/lib/api.ts`、frontend 持有 secret / raw payload、读取或修改真实 `notes/**` 参与 routine engineering work。

本次 Task 7 final verification 记录：

- 启动快照：`git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出；`git log --oneline -12 --decorate` 显示 HEAD 为 `700b116 feat: project p12 session history`，并包含 P12 commits `79e7610`、`4ecdcf2`、`dd4f714`、`b0dbbdb`、`b208496`、`700b116`，以及失败 Task 5 cherry-pick `8513b44` 和 revert `5dfd211`。
- 初次执行三条 Vitest GREEN 命令：FAIL / environment blocker，`node_modules\vitest\vitest.mjs` 缺失，未进入 Vitest test discovery，无 test file count / test count。
- 按既有 worktree 恢复方式执行 `pnpm.cmd install --ignore-scripts --frozen-lockfile`：PASS，lockfile already up to date，恢复 763 个本地依赖链接，未修改 package / lock metadata，filtered status 和 staged paths 仍为空。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`：PASS，27 test files / 114 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench`：PASS，6 test files / 21 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts`：PASS，1 test file / 9 tests。
- `node .\node_modules\typescript\bin\tsc --noEmit`：PASS。

本次 Task 7 boundary audit 记录：

- Direct Tauri audit 无命中：
  `rg -n '@tauri-apps/api/core|\binvoke\s*\(' src --glob '!src/lib/api.ts' --glob '!src/components/ai/**' --glob '!src/lib/aiWebSearch.ts'`
- Secret / cookie / raw payload audit 有允许命中，不代表 Workbench frontend 或 durable log 持有 secret / Cookie / raw payload：
  `src/lib/api.ts:95`、`:109`、`:401` 是既有 API boundary 参数 / wrapper option；`src/lib/agent-workbench/modelLoopViewModel.ts:71` 是 redaction regex；`modelLoopViewModel.test.ts`、`multiStepModelLoop.test.ts`、`toolCallParser.test.ts`、`toolObservation.test.ts`、`providerModelPolicy.test.ts`、`liveProviderPolicy.test.ts`、`providerModelTypes.test.ts` 是 P10/P11 negative-proof redaction coverage；`agentReplay*`、`agentSession.ts`、`agentTypes*`、`permissionManager*`、`toolPermissionGate*`、`toolContinuationRegistry.ts`、`workbenchTaskFlow*`、`SessionReplayPanel.tsx` 是 P8/P11 unavailable / preview / privacy contract wording；`inMemorySessionStore.test.ts` 和 `requestLogPolicy.test.ts` 是 P12 negative-proof tests proving raw provider payload, raw tool output, API key, Authorization and Cookie are dropped/redacted.
- Storage / migration audit 有 scoped P12 命中：
  `src/lib/agent-runtime/replayPersistenceProjector.ts` and `.test.ts` expose migration strategy as read-only plan metadata and prove migration hooks are not executed. There were no `localStorage`, `indexedDB`, `database storage`, `request log persistence`, `session storage`, `durable log writer`, or `filesystem durable` hits in P12 code.
- Forbidden patch / execute / Cookie / delete / rollback / AiSidebar audit 有允许或既有边界命中，不代表 P12 开放真实 mutation / execution：
  `src/lib/api.ts` delete wrappers and `src-tauri/src/**` delete functions are pre-existing provider/note APIs outside P12 implementation; `src-tauri/src/prompts.rs` and `src-tauri/src/ai.rs` prompt text contains "Do not delete"; `agentRuntime.test.ts`、`permissionManager*`、`toolRegistry.test.ts`、`multiStepModelLoop.ts`、`agentTypes*`、`toolContinuationRegistry.ts`、`toolPermissionGate*` are P6/P11 permission, reserved-tool and unavailable/denied contract literals; `replayPersistenceProjector.test.ts` proves replay does not invoke tool transport, provider request, patch apply, write, delete, rollback, execute, or Cookie reader hooks.
- 追加本 handoff 前，`git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出。

下一阶段必须先写新的 freeze spec / plan，才能讨论真实 durable DB / FS adapter、真实 migration execution、retention/export/delete controls、real patch/write/delete/rollback/execute/code runner、Cookie-backed reader、old AiSidebar retirement / migration，或任何 production autonomous Agent 能力。任何后续 worker 不得从 P12 contract preview 推导出真实 durable storage、migration、patch/write/delete/rollback/execute/Cookie/raw-payload retention 已获批。

## P13 Patch / Write Workflow Contract Freeze handoff

P13 输出状态：**Patch / Write Workflow Contract Preview**。本阶段把 P12 durable session / request log / replay persistence preview 之后的 patch/write workflow 冻结为 contract preview：proposal envelope、target refs、validation、read-only diff preview、risk classification、permission request/read model、approval decision metadata、dry-run result、rollback-plan metadata、audit event taxonomy、Workbench read-only projection 和 API/Tauri no-op boundary。它仍不是 production-ready autonomous Agent，也不表示 AI 大升级完成。

P13 已冻结 / 已合入：

- `59296c5 docs: define p13 patch write workflow contract`：冻结 P13 spec / plan、输出状态、contract preview 边界和 forbidden mutation scope。
- `10647ed feat: define p13 patch workflow contract`：冻结 proposal envelope、target refs、proposal summary、capability status、reserved event taxonomy 和 mutation-unavailable vocabulary。
- `ba35cea feat: validate p13 patch proposals`：冻结 proposal normalizer / validator、safe summary redaction、blocked operation handling 和 no direct filesystem/Tauri proof。
- `ba40680 feat: classify p13 patch proposal risk`：冻结 deterministic risk classification、permission request shape、approval decision metadata 和 write/patch/delete/rollback/destructive policy decisions。
- `ecfeb15 feat: preview p13 patch diffs`：冻结 read-only diff preview、dry-run result、validation result、bounded/redacted diff projection 和 rollback-plan metadata。
- `661083f feat: project p13 patch workflow preview`：冻结 Workbench read-only projection 和 existing task-flow preview consumption；Workbench 只展示 proposal / diff / risk / permission / approval / validation / dry-run / rollback metadata / audit timeline，不拥有 mutation decision。
- Task 6 API/Tauri No-Op Boundary Audit 为 no-op：未新增 `src/lib/api.ts` wrapper、未新增 Tauri command、未产生主线提交；API/Tauri 在 P13 仍 gated/no-op，不执行 mutation。

P13 仍禁止 / 未实现：

- production-ready autonomous Agent、AI 大升级完成、L5 Agent 完成或 Codex-style runtime 完成等成熟能力声明。
- real patch apply、write mutation、delete、rollback execution、execute / code runner。
- Cookie-backed reader、Cookie-backed Luogu reading。
- DB / FS durable storage、filesystem durable writer、真实 migration execution、raw provider payload storage、raw tool output storage。
- old `src/components/ai/AiSidebar.tsx` migration。
- 绕过 `src/lib/api.ts`、React / Workbench 持有 API key / Authorization header / Cookie / raw payload、读取或修改真实 `notes/**` 参与 routine engineering work。

本次 Task 7 final verification 记录：

- 启动快照：`git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出；`git log --oneline -12 --decorate` 显示 HEAD 为 `661083f feat: project p13 patch workflow preview`，并包含 P13 commits `59296c5`、`10647ed`、`ba35cea`、`ba40680`、`ecfeb15`、`661083f`。
- 初次执行 `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`：FAIL / environment blocker，`node_modules\vitest\vitest.mjs` 缺失，未进入 Vitest test discovery，无 test file count / test count。
- 按任务允许命令执行 `pnpm.cmd install --ignore-scripts --frozen-lockfile`：PASS，lockfile already up to date，恢复 763 个本地依赖链接，未修改 package / lock metadata。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`：PASS，31 test files / 136 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench`：PASS，7 test files / 25 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts`：PASS，1 test file / 9 tests。
- `node .\node_modules\typescript\bin\tsc --noEmit`：PASS。

本次 Task 7 boundary audit 记录：

- Direct Tauri audit 仅有 negative-proof test 命中，不代表 runtime / Workbench 直连 Tauri：
  `src/lib/agent-workbench/patchWorkflowViewModel.test.ts:271`、`:272`，`src/lib/agent-runtime/patchProposalPolicy.test.ts:144`，`src/lib/agent-runtime/patchWorkflowTypes.test.ts:278`、`:279` 命中 `@tauri-apps/api/core` / `invoke(` fixture 或 `not.toContain(...)` assertion。
- Secret / cookie / raw payload audit 有允许命中，不代表 Workbench frontend、runtime proposal 或 durable log 持有 secret / Cookie / raw payload：
  `src/lib/api.ts:95`、`:109`、`:401` 是既有 API boundary 参数 / wrapper option；`modelLoopViewModel*`、`toolCallParser.test.ts`、`toolObservation.test.ts`、`providerModelPolicy.test.ts`、`providerModelTypes.test.ts`、`liveProviderPolicy.test.ts`、`multiStepModelLoop.test.ts` 是 P10/P11 redaction / provider exposure negative-proof coverage；`agentReplay*`、`agentSession.ts`、`agentTypes*`、`permissionManager*`、`toolPermissionGate*`、`toolContinuationRegistry.ts`、`workbenchTaskFlow*`、`SessionReplayPanel.tsx` 是 P8/P11 unavailable / preview / privacy contract wording；`inMemorySessionStore.test.ts`、`requestLogPolicy.test.ts` 是 P12 raw provider payload / raw tool output / API key / Authorization / Cookie drop-redaction tests；P13 `patchWorkflowViewModel*`、`patchDiffPreview*`、`patchProposalPolicy*`、`patchRiskPolicy*` 命中均为 safe redaction, no-cookie-reader, no raw payload/output, permission-risk 或 negative-proof assertions。
- Forbidden patch / write / delete / rollback / execute / Cookie / storage / migration / AiSidebar audit 有允许或既有边界命中，不代表 P13 开放真实 mutation / execution：
  `src/lib/api.ts` delete wrappers and `src-tauri/src/**` delete functions are pre-existing provider/note APIs outside P13 implementation; `src-tauri/src/prompts.rs` and `src-tauri/src/ai.rs` prompt text contains "Do not delete"; P13 `PatchWorkflowPanel.tsx` and `patchWorkflowViewModel*` display/read rollback metadata and `no_delete` / `no_rollback_execution` statuses only; P13 `patchDiffPreview*` creates dry-run and rollback-plan metadata only; P13 `patchProposalPolicy*` blocks delete / rollback execution / filesystem mutation / direct Tauri; P13 `patchRiskPolicy*` denies or blocks write, patch-apply, delete, rollback and destructive requests; P13 `patchWorkflowTypes*` keeps `file.write.completed`, `file.delete.completed` and `rollback.executed` as reserved/non-success events; P6/P11 `permissionManager*`、`toolPermissionGate*`、`toolContinuationRegistry.ts` and P12 `replayPersistenceProjector*` hits are unavailable/denied policy, read-only guard or migration-plan metadata proof.
- Mature capability claim audit 无命中：
  `rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench`
- 追加本 handoff 前，`git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出。

下一阶段必须先写新的 freeze spec / plan，才能讨论真实 patch apply、write mutation、delete、rollback execution、execute/code runner、Cookie-backed reader、DB/FS durable storage、migration execution、raw payload retention、old AiSidebar retirement / migration，或任何 production autonomous Agent 能力。任何后续 worker 不得从 P13 contract preview 推导出真实 patch/write/delete/rollback/execute/Cookie/storage/raw-payload behavior 已获批。

## P14 Execute / Code Runner Contract Freeze handoff

P14 输出状态：**Execute / Code Runner Contract Preview**。本阶段把 P13 patch / write workflow preview 之后的 execute / runner workflow 冻结为 contract preview：runner contract types / event taxonomy、request normalization / classification、sandbox policy / permission read model、mock runner dry-run projection、bounded / redacted observation policy、Workbench read-only runner projection，以及 API / Tauri no-op boundary。它仍不是 production-ready autonomous Agent，也不表示 AI 大升级完成。

P14 已冻结 / 已合入：

- `4537249 feat: define p14 runner contract`：冻结 execution request envelope、target refs、runner capability status、event taxonomy，以及 reserved true-execution event guard。
- `1b21dfa feat: classify p14 runner requests`：冻结 request normalization、safe summary redaction、target / capability validation，以及 deterministic command / language / test-run classification。
- `502b1e3 feat: gate p14 runner sandbox policy`：冻结 permission request、approval decision read model、sandbox profile metadata、resource limits 和 no network / no Cookie / no secret / no write defaults。
- `fc6e3c0 feat: project p14 mock runner results`：冻结 mock runner / dry-run result shape、planned sandbox / resource previews，以及 files / network / output preview semantics。
- `32529c3 feat: redact p14 runner observations`：冻结 bounded stdout / stderr、safe observation summaries、redaction dropped fields，以及 rollback / cleanup / recovery metadata-only contract。
- `0f7b254 feat: project p14 runner workflow preview`：冻结 Workbench read-only runner projection；Workbench 只展示 execution request / classification / sandbox / permission / mock result / observation / cleanup metadata / audit timeline，不拥有 runner decision。
- Task 7 API/Tauri No-Op Boundary Audit 为 no-op：未新增 `src/lib/api.ts` wrapper、未新增 Tauri command、未产生主线提交；API/Tauri 在 P14 仍 gated/no-op，不执行 process / command / runner 行为。

P14 仍禁止 / 未实现：

- production-ready autonomous Agent、AI 大升级完成、L5 Agent 完成或 Codex-style runtime 完成等成熟能力声明。
- real process execution、code runner、stress tester、command execution。
- real patch apply、write mutation、delete、rollback execution。
- Cookie-backed reader、Cookie-backed Luogu reading。
- DB / FS durable storage、filesystem durable writer、真实 migration execution。
- raw provider payload storage、raw tool output storage、API key / Authorization / Cookie / secret 明文进入 runner observation、request log 或 Workbench。
- old `src/components/ai/AiSidebar.tsx` migration。
- 绕过 `src/lib/api.ts`、React / Workbench 直连 Tauri、读取或修改真实 `notes/**` 参与 routine engineering work。

本次 Task 8 final verification 记录：

- 启动快照：`git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出；`git log --oneline -12 --decorate` 显示 HEAD 为 `0f7b254 feat: project p14 runner workflow preview`，并包含 P14 commits `4537249`、`1b21dfa`、`502b1e3`、`fc6e3c0`、`32529c3`、`0f7b254`。
- 初次执行 `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`：FAIL / environment blocker，`node_modules\vitest\vitest.mjs` 缺失，未进入 Vitest test discovery，无 test file count / test count。
- 按既有 worktree 恢复方式执行 `pnpm.cmd install --ignore-scripts --frozen-lockfile`：PASS，lockfile already up to date，恢复 763 个本地依赖链接，未修改 package / lock metadata。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-runtime`：PASS，37 test files / 172 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/agent-workbench`：PASS，8 test files / 28 tests。
- `node .\node_modules\vitest\vitest.mjs run src/lib/apiBoundary.test.ts`：PASS，1 test file / 9 tests。
- `node .\node_modules\typescript\bin\tsc --noEmit`：PASS。

本次 Task 8 boundary audit 记录：

- Direct Tauri audit 仅有 negative-proof test 命中，不代表 runtime / Workbench 直连 Tauri：
  `src/lib/agent-workbench/patchWorkflowViewModel.test.ts:271`、`:272`，`src/lib/agent-runtime/patchProposalPolicy.test.ts:144`，`src/lib/agent-runtime/patchWorkflowTypes.test.ts:278`、`:279`，`src/lib/agent-runtime/runnerClassificationPolicy.test.ts:112`，`src/lib/agent-runtime/runnerRequestPolicy.test.ts:177` 命中 `@tauri-apps/api/core` / `invoke(` fixture 或 `not.toContain(...)` assertion。
- Secret / cookie / raw payload audit 有允许命中，不代表 Workbench frontend、runtime runner projection 或 durable log 持有 secret / Cookie / raw payload：
  `src/lib/api.ts:95`、`:109`、`:401` 是既有 API boundary 参数 / wrapper option；P10/P11/P12/P13 的 `modelLoopViewModel*`、`toolCallParser.test.ts`、`toolObservation.test.ts`、`providerModelPolicy.test.ts`、`providerModelTypes.test.ts`、`liveProviderPolicy.test.ts`、`multiStepModelLoop.test.ts`、`inMemorySessionStore.test.ts`、`requestLogPolicy.test.ts`、`patchWorkflowViewModel*`、`patchDiffPreview*`、`patchProposalPolicy*`、`patchRiskPolicy*` 命中均为 redaction / unavailable / negative-proof coverage；P14 `runnerRequestPolicy*`、`runnerClassificationPolicy*`、`runnerContractTypes*`、`runnerObservationPolicy*`、`mockRunnerProjection.test.ts`、`runnerPermissionSandboxPolicy*`、`runnerWorkflowViewModel.test.ts` 命中均为 safe redaction, blocked capability, no-cookie/no-secret, no raw payload/output, or negative-proof assertions。
- Forbidden process / write / delete / rollback / Cookie / storage / migration / AiSidebar audit 有允许或既有边界命中，不代表 P14 开放真实 runner / mutation / storage：
  `src/lib/api.ts` delete wrappers and `src-tauri/src/**` delete / git / provider commands are pre-existing provider/note APIs outside P14 implementation; `src-tauri/src/ai.rs` and `src-tauri/src/blog_server.rs` thread `spawn` hits are existing non-P14 surfaces; `src-tauri/src/prompts.rs` and `src-tauri/src/ai.rs` prompt text contains "Do not delete"; P13 `PatchWorkflowPanel.tsx` and patch workflow files display / test rollback metadata only; P12 `replayPersistenceProjector*` reports migration strategy as read-only metadata and proves hooks are not executed; P6/P11 permission and continuation files keep Cookie / mutation / execution / delete / rollback unavailable or denied; P14 runner files keep stress-test / execute / delete / rollback / patch / Cookie / secret / write requests blocked, reserved, unavailable, or mock / metadata-only.
- Mature capability claim audit 无命中：
  `rg -n 'AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|production-ready|ready: true|isReady: true' src/lib/agent-runtime src/lib/agent-workbench src/components/agent-workbench`
- 追加本 handoff 前，`git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出。

下一阶段必须先写新的 freeze spec / plan，才能讨论真实 process execution、code runner、stress tester、safe command boundary、sandbox implementation、path safety / resource enforcement、real patch apply、write mutation、delete、rollback execution、Cookie-backed reader、DB / FS durable storage、migration execution、raw payload retention、old AiSidebar retirement / migration，或任何 production autonomous Agent 能力。任何后续 worker 不得从 P14 contract preview 推导出真实 execute / runner / code-runner / stress-test / mutation / Cookie / storage / raw-payload behavior 已获批。

## P15 Cookie-backed Reader Contract Freeze handoff

P15 输出状态：**Cookie-backed Reader Contract Preview**。本阶段把 P14 execute / code runner preview 之后的 Cookie-backed reader workflow 冻结为 contract preview：Cookie reader contract types / event taxonomy、source-boundary classification、redaction / audit summary policy、fixture-only projection、Workbench read-only reader projection，以及 API / Tauri no-op boundary。它仍不是 production-ready autonomous Agent，也不表示 AI 大升级完成。

P15 已冻结 / 已合入：

- `bcfbab0 docs: define p15 cookie reader contract`：冻结 P15 spec / plan、输出状态、preview-only reader 边界和 forbidden Cookie / network / storage scope。
- `161f819 feat: define p15 cookie reader contract`：冻结 Cookie reader contract types、capability statuses、source-boundary / permission / approval / redaction / mock / audit / request-envelope types，以及 pure helper contract。
- `2f55143 feat: gate p15 reader source boundary`：冻结 pure source-boundary classifier；`luogu` / fixture / unsupported / reserved sources 只返回 metadata / capability / permission / blocked reasons，不暴露 fetch target。
- `24d530f feat: redact p15 reader audit summaries`：冻结 projection-facing redaction / audit summary helpers，丢弃或替换 Cookie、Authorization、API key、session token、private note content、raw provider payload 和 raw tool output。
- `2990aa9 feat: project p15 cookie reader fixtures`：冻结 fixture-only reader projection；fixture / replay / manual sources 只投影 bounded problem metadata、redacted source refs 和 safe audit fields。
- `6c89a9d feat: project p15 cookie reader workflow`：冻结 Workbench read-only Cookie reader workflow projection；Workbench 只展示 source boundary、permission、fixture/mock result、redaction/audit timeline 和 unavailable / reserved state，不拥有 reader decision。
- Task 6 API/Tauri No-op Boundary Audit 为 no-op：无文件改动、无提交；`apiBoundary.test.ts` 1 file / 9 tests passed；`tsc --noEmit` passed；API/Tauri audit hits 仅为既有 `api_key` / provider / search / Rust surfaces、existing thread spawn 和 negative-proof literals；没有新增 P15 API / Tauri Cookie implementation。

P15 仍禁止 / 未实现：

- production-ready autonomous Agent、AI 大升级完成、L5 Agent 完成或 Codex-style runtime 完成等成熟能力声明。
- real Cookie reading、browser Cookie extraction、Cookie storage、third-party Cookie forwarding、Cookie-backed Luogu reading 或真实 network reader。
- DB / FS durable storage、filesystem durable writer、migration execution 或 raw payload retention。
- patch、write、delete、rollback、execute、code runner、stress tester 行为。
- old `src/components/ai/AiSidebar.tsx` migration。
- 绕过 `src/lib/api.ts`、React / Workbench 直接连接 Tauri、读取真实 Cookie、把 Cookie / API key / Authorization / raw provider payload / raw tool output 明文带入 provider/search/request-log/evidence/Workbench/storage。

本次 Task 7 final verification 记录：

- 启动快照：`git status --short -- . ":(exclude)notes/**"` 无输出；`git diff --cached --name-only` 无输出；`git log --oneline -12 --decorate` 显示 HEAD 为 `6c89a9d feat: project p15 cookie reader workflow`，并包含 P15 commits `bcfbab0`、`161f819`、`2f55143`、`24d530f`、`2990aa9`、`6c89a9d`。
- `rg -n 'P15|Cookie-backed Reader Contract Preview|Cookie-backed reader|P14|Execute / Code Runner Contract Preview' docs/agent-workbench/handoff-p4.md`：PASS，命中 P14 与新增 P15 handoff / output-state / boundary wording。
- `git log --oneline -12 --decorate`：PASS，HEAD 为 `6c89a9d feat: project p15 cookie reader workflow`，最近 12 条包含 Task 1-6 所需 P15 提交与 P14 handoff lineage。

本次 Task 7 boundary audit 记录：

- `rg -n 'production-ready|AI 大升级完成|L5 Agent 完成|Codex-style runtime 完成|ready: true|isReady: true|real Cookie|browser Cookie|Cookie storage|third-party.*Cookie|writeFile|removeFile|unlink|applyPatch\(|spawn\(|child_process|exec\(|execute runner|code runner|stress tester|database storage|filesystem durable|migration execution|AiSidebar' docs/agent-workbench/handoff-p4.md`
- 命中均为 handoff 中的 forbidden / non-goal / negative-proof language：P11-P14 历史段落和新增 P15 段落明确说明 production-ready / AI 大升级完成 / real Cookie / browser Cookie / Cookie storage / third-party Cookie forwarding / patch-write-delete-rollback-execute-code runner-stress tester / durable storage / migration execution / AiSidebar migration 均未实现或仍需新 spec；未新增任何获批、ready 或实现声明。

后续若要启动真正 Cookie-backed reader work，必须另写单独 safety spec，并由用户明确决定是否允许真实 Cookie 读取、浏览器 Cookie 提取、Cookie 存储 / 转发、真实网络 reader、provider/search/request-log/evidence/Workbench/storage 投影边界，以及对应 API / Tauri / 权限 / 审计策略。任何后续 worker 不得从 P15 contract preview 推导出真实 Cookie / network / storage / forwarding / mutation / execution / raw-payload behavior 已获批。
