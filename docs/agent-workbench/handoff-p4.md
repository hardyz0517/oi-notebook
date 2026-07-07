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
