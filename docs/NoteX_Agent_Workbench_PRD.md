# NoteX Agent Workbench PRD

> 项目：OI Notebook / NoteX Agent Workbench  
> 文档类型：产品需求文档（PRD）  
> 当前目标：把 OI Notebook 的 AI 从“侧边栏聊天功能”升级为“面向信息学竞赛的 L5 级 Agent Workbench”  
> 状态：讨论稿，可作为后续架构设计、Codex 开发指令和工程拆解的基础  
> 日期：2026-06-27

---

## 1. 背景与问题

OI Notebook 经过一轮工程化升级后，基础能力、设置体系、主题体系、供应商管理等已有一定基础。但此前 AI 相关能力整体被冻结，原因是旧 AI 功能已经逐渐暴露出结构性问题：

- AI 更像“聊天侧边栏”，而不是可持续执行任务的 Agent。
- 搜索、阅读、回答、引用、工具调用等逻辑耦合较重，不适合长期维护。
- 旧的无 key 搜索路线不稳定，后续方向已转向 Tavily 等专业搜索 / 抽取服务。
- 现有 AI 前端体验不成熟，难以支撑长任务、工具轨迹、代码预览、diff、证据面板等复杂工作流。
- 如果继续在旧侧边栏上打补丁，最终很可能变成“聊天框 + 几个工具函数 + 大 prompt”的玩具式 Agent。
- 用户希望 OI Notebook 不只是笔记软件，而是一个面向信息学竞赛学习、代码调试、题解沉淀的桌面工作台。

因此，本轮不是简单升级 AI 功能，而是需要重构 AI 产品定位与底层架构。

---

## 2. 产品定位

### 2.1 一句话定位

NoteX Agent Workbench 是 OI Notebook 内置的竞赛学习与代码调试 Agent。它以 Problem Workspace 为中心，能够读取网页与本地笔记，理解题目和代码，运行样例与对拍，帮助用户查题解、调 bug、整理题解，并以低依赖方式在普通机房电脑上运行。

### 2.2 不做什么

本项目不是：

- 普通 AI 聊天侧边栏。
- Codex / Cursor / OpenCode 的泛用平替。
- 单纯模型中转壳。
- 只接几个工具函数的浅层 Agent。
- 依赖用户额外安装大量 Node / Python / MCP server 的高级玩家工具。
- 只会搜索题解、解释代码，但不能完成做题闭环的玩具功能。

### 2.3 要做什么

本项目要做的是：

- 一个 OI 场景特化的 Agent Workbench。
- 一个以题目工作区为中心的 AI 桌面工作台。
- 一个参考 Codex / OpenCode 成熟 Agent 架构，但服务于 OI 学习与竞赛流程的系统。
- 一个可低依赖运行，同时保留 MCP / Skill / 外部 Agent Adapter 扩展能力的长期架构。
- 一个能完成“做题 → 调试 → 研究 → 沉淀”闭环的生产力工具。

---

## 3. 核心目标：直接按 L5 设计

### 3.1 成熟度等级

| 等级 | 名称 | 能力状态 | 评价 |
|---|---|---|---|
| L1 | 聊天助手 | 能问答、解释代码 | 不算 Agent |
| L2 | 工具助手 | 能搜索、读文件、查笔记 | 有用，但仍然浅 |
| L3 | 可观察 Agent | 能展示工具调用过程 | 开始可信 |
| L4 | OI 专项 Agent | 能查题解、调代码、读笔记 | 有明显价值，但仍可能不够形成生产力 |
| L5 | OI Agent Workbench | 能完成做题、调试、研究、沉淀闭环 | 真正有生产力 |

当前目标不是“先做 L3/L4 玩具再说”，而是：

> 架构从第一天按 L5 设计，第一版至少打通 L5 的主链路。

这意味着，即使功能分阶段落地，底层架构也必须一开始支持：

- Problem Workspace。
- Agent Runtime。
- Tool / Skill / MCP 分层。
- 权限控制。
- 事件流。
- 工具轨迹。
- 证据系统。
- 代码运行。
- Diff-first 修改。
- 侧边栏与全屏 Workbench 共用同一底层。

---

## 4. 用户与核心场景

### 4.1 目标用户

主要面向：

- 信息学竞赛学生。
- 正在学习算法与数据结构的 OI / ACM 用户。
- 需要写题解、整理笔记、沉淀知识的用户。
- 在学校机房等低权限、弱网、低依赖环境中使用的用户。
- 使用 AI 辅助学习、调试代码、整理题解的用户。

### 4.2 核心场景

#### 场景 A：调试当前代码

用户正在做一道题，代码 WA / RE / TLE，希望 Agent 帮忙定位问题。

Agent 应该能：

- 读取当前代码。
- 读取题面、样例和约束。
- 编译代码。
- 运行样例。
- 比较实际输出和期望输出。
- 构造边界数据。
- 必要时生成暴力和数据生成器。
- 跑对拍。
- 定位 bug。
- 生成 patch。
- 展示 diff。
- 用户确认后应用。
- 重新验证样例 / 对拍。

#### 场景 B：研究一道题

用户输入题号或题面，希望 Agent 帮忙查资料、找思路。

Agent 应该能：

- 读取题面。
- 识别约束、标签、算法方向。
- 搜索题解。
- 读取 OI Wiki、博客、官方 editorial、洛谷讨论等来源。
- 过滤低质量来源。
- 结合本地笔记。
- 总结多种解法。
- 给出复杂度分析。
- 标注引用来源。
- 不确定时说明风险。

#### 场景 C：根据本地笔记回答

用户希望根据自己已有笔记、模板、做题记录回答问题。

Agent 应该能：

- 检索本地笔记。
- 找相似题。
- 读取旧模板和旧题解。
- 结合用户已有知识回答。
- 指出与旧笔记的关系。
- 必要时建议补充或更新笔记。

#### 场景 D：整理题解和博客

用户完成一道题后，希望沉淀成题解或博客。

Agent 应该能：

- 读取题目工作区。
- 读取最终 AC 代码。
- 读取调试记录和反例。
- 读取查阅过的资料来源。
- 生成题解草稿。
- 修复 Markdown / KaTeX / 代码块。
- 建议配图。
- 自动打标签。
- 保存到本地笔记。
- 生成本地博客草稿。
- 支持预览。

#### 场景 E：学习陪练

用户不想直接看答案，希望 Agent 分层提示。

Agent 应该能：

- 只给提示。
- 给关键观察。
- 给核心转化。
- 给完整思路。
- 给伪代码。
- 给完整代码。
- 根据用户选择控制提示强度。

---

## 5. 护城河

OI Notebook Agent 的护城河不在“我也有 Agent”，而在：

### 5.1 OI 场景深度集成

| 泛用 Agent | NoteX Agent Workbench |
|---|---|
| 面向通用软件工程 | 面向 OI 学习与竞赛 |
| 以代码仓库为中心 | 以 Problem Workspace 为中心 |
| 通用 shell / test / build | OI 专用 compile / sample / brute / gen / stress |
| 通用搜索和文档阅读 | 洛谷、题解、讨论区、OI Wiki、竞赛站点 |
| 通用代码修改 | OI C++ 代码调试、边界检查、对拍 |
| 通用文档生成 | 洛谷题解、本地博客、算法笔记 |
| 当前项目上下文 | 用户长期笔记、题目历史、算法知识体系 |

### 5.2 本地知识沉淀

OI Notebook 拥有 Codex 默认没有的东西：

- 用户自己的算法笔记。
- 用户自己的题解。
- 用户自己的代码风格。
- 用户做过的类似题。
- 用户常犯错误。
- 用户本地博客体系。
- OI 分类标签和知识图谱。

这些应成为 Agent 的长期优势。

### 5.3 低依赖机房体验

默认体验应是：

1. 下载 OI Notebook。
2. 打开。
3. 配置模型 / 中转站 / Tavily key。
4. 直接使用核心 Agent 能力。

不应要求普通用户安装：

- Node。
- Python。
- Codex CLI。
- MCP server。
- 浏览器插件。
- 复杂 PATH。
- 额外代理工具。

MCP、Codex Adapter、OpenCode Adapter 是高级可选能力，不是默认依赖。

---

## 6. Codex / OpenCode 架构对标与模仿策略

### 6.1 模仿的核心不是 UI，而是 Agent Harness

需要模仿 Codex / OpenCode 的成熟 Agent 架构，而不是照搬界面。

要模仿的是：

- Agent Loop。
- Tool Registry。
- Sandbox / Approval。
- Context Management。
- Long Task Compaction。
- Event Stream。
- Patch Workflow。
- Multi-surface Runtime。
- Project Instruction。
- MCP Extension。

不是模仿：

- 聊天框布局。
- 终端输出样式。
- 单个按钮位置。
- 泛用软件工程任务边界。

### 6.2 Codex 成熟能力映射

| Codex 成熟能力 | 解决的问题 | OI Notebook 应如何模仿 |
|---|---|---|
| Agent Loop | 模型持续调用工具完成任务 | 实现 AgentRuntime：计划、工具调用、观察、继续执行、最终总结 |
| Tool System | 工具统一注册和调用 | 实现 ToolRegistry：搜索、读网页、编译、跑样例、查笔记、写 patch |
| Sandbox / Approval | 控制执行权限 | 实现 PermissionManager：只读、联网、运行代码、写文件、Cookie 页面读取 |
| Context Management | 给模型正确上下文 | 实现 ContextBuilder：题面、代码、笔记、网页证据按任务类型组织 |
| Compaction | 长任务上下文压缩 | 实现任务摘要、工具结果摘要、Evidence 缓存、Workspace 状态压缩 |
| Event Stream | 工具过程可观察 | 实现 AgentEvent 协议，UI 只消费事件 |
| Multi-surface | 多入口复用底层 | 侧边栏和全屏 Workbench 共用 Agent Runtime |
| Project Instruction | 项目级指令 | 实现 `.oinb/agent.md`、Workspace 配置、用户风格规则 |
| Patch Workflow | AI 修改可审查 | 实现 diff-first、用户确认、事务应用、撤销 |
| MCP Extension | 外部工具扩展 | 默认内置工具，高级用户可接 MCP |

### 6.3 不能照搬 Codex 的地方

Codex 的世界观是：

- 软件工程仓库。
- 文件树。
- 构建命令。
- 测试命令。
- 开发任务。

OI Notebook 的世界观应是：

- 一道题。
- 题面。
- 样例。
- C++ 代码。
- 暴力代码。
- 数据生成器。
- 对拍脚本。
- 题解 / 讨论 / 笔记。
- 最终沉淀为题解或博客。

因此，OI Notebook 不能照搬“仓库中心”，而要做“Problem Workspace 中心”。

---

## 7. 现有 AI 功能审计与迁移策略

### 7.1 总体原则

当前 AI 功能大概率需要整体重做，但不是所有已有工作都废弃。

准确说：

> 旧 AI 的主流程和侧边栏架构需要重做；旧 AI 中已有的配置资产、供应商管理、模型管理、部分日志、部分 UI 组件可以审计后迁移。

### 7.2 保留并迁移

以下内容如果已实现较好，应保留并迁移：

- 模型供应商管理弹窗。
- 多 baseURL / 中转站管理。
- API Key 配置。
- 模型列表管理。
- 启用 / 禁用 provider。
- 默认模型选择。
- 请求日志。
- 余额 / quota 查询能力，如已有。
- 设置页 AI 配置基础。
- Settings v2 主题变量基础。
- 部分通用表单、弹窗、列表 UI 组件。

这些应迁移为：

- `ModelProviderManager`
- `ProviderAdapter`
- `ModelAdapter`
- `ProviderSettingsUI`
- `RequestLogStore`

### 7.3 重构后复用

以下内容可能可复用，但必须拆出旧流程：

- 搜索诊断面板。
- 现有联网搜索 provider。
- 现有网页读取逻辑。
- 现有 AI 配置组。
- 现有消息组件。
- 现有 Markdown 渲染。
- 现有代码块展示。
- 现有引用列表 UI。

迁移目标：

- `WebReader`
- `EvidenceStore`
- `AgentMessageRenderer`
- `ToolTraceViewer`
- `ModelAdapter`
- `CitationRenderer`

### 7.4 废弃

以下内容大概率应废弃：

- 无 key 搜索主链路。
- 旧 research-engine 主流程。
- 过度复杂且不可控的 rescue / shadow run 逻辑。
- 搜索、阅读、回答混在一起的巨型函数。
- 前端组件中直接拼 prompt 的逻辑。
- AI 侧边栏里散落的任务分支。
- 不能被新 Agent Runtime 调用的旧工具逻辑。

### 7.5 完全重做

以下内容必须按新架构重做：

- AI 侧边栏主结构。
- Agent 执行流程。
- Tool Registry。
- Skill Runner。
- Permission Manager。
- Event Stream。
- Fullscreen Workbench。
- Code Debugger。
- Problem Workspace。
- Patch / Diff / Rollback。
- Luogu Cookie Reader 安全层。

### 7.6 迁移方式

迁移不应是直接删除旧 AI。

推荐路线：

1. 旧 AiSidebar 暂时保留。
2. 新建 `agent-runtime`。
3. 新建 `workbench-ui` 骨架。
4. 把 provider 管理迁移成共享服务。
5. 新 Agent 先只接一个模型和一个 `read_current_file` 工具。
6. 打通 EventStream。
7. 再逐步接搜索、代码运行、笔记检索。
8. 旧 AiSidebar 逐步退场。

---

## 8. 产品形态

### 8.1 侧边栏模式

侧边栏模式服务于日常轻量任务：

- 解释当前选中内容。
- 解释当前代码。
- 快速问答。
- 根据笔记回答。
- 读取一个网页。
- 整理一小段题解。
- 生成小修改建议。

特点：

- 不打断主编辑区。
- UI 轻量。
- 工具调用可折叠。
- 可快速升级到全屏 Workbench。

### 8.2 全屏 Workbench 模式

全屏模式服务于长任务和 AI 主导任务：

- 完整调试一道题。
- 查题解和讨论。
- 跑样例和对拍。
- 生成题解。
- 整理博客。
- 从多个来源综合学习。

推荐三栏布局：

| 区域 | 内容 |
|---|---|
| 左栏 | Problem Workspace、文件、工具、上下文、任务列表 |
| 中栏 | Agent 对话、计划、执行轨迹、最终结果 |
| 右栏 | 代码预览、diff、网页正文、样例输出、笔记预览、Markdown 预览 |

右栏应根据当前 Agent Action 自动切换：

- 读网页时显示网页正文。
- 跑样例时显示输入输出。
- 改代码时显示 diff。
- 写题解时显示 Markdown 预览。
- 查笔记时显示相关笔记。

---

## 9. 核心架构

### 9.1 总体结构

```text
NoteX Agent Workbench
├─ UI Layer
│  ├─ Sidebar Agent
│  ├─ Fullscreen Workbench
│  ├─ Tool Trace Viewer
│  ├─ Evidence Panel
│  ├─ Diff Viewer
│  └─ Problem Workspace Panel
│
├─ Agent Runtime
│  ├─ AgentSession
│  ├─ AgentLoop
│  ├─ ContextBuilder
│  ├─ ToolRegistry
│  ├─ SkillRunner
│  ├─ PermissionManager
│  ├─ EventStream
│  └─ SessionStorage
│
├─ Capability Layer
│  ├─ Built-in Tools
│  ├─ OI Skills
│  ├─ MCP Adapter
│  ├─ Codex/OpenCode Adapter
│  └─ Provider Adapter
│
├─ Execution Layer
│  ├─ Web Reader
│  ├─ Luogu Cookie Reader
│  ├─ Code Runner
│  ├─ Stress Tester
│  ├─ Patch Applier
│  └─ Cache Manager
│
└─ Knowledge Layer
   ├─ Problem Workspace
   ├─ Local Notes Index
   ├─ Web Evidence Store
   ├─ User Mistake Memory
   └─ Algorithm Knowledge Graph
```

### 9.2 Agent Runtime

Agent Runtime 是底层核心，必须独立于 UI。

职责：

- 创建和管理 Agent Session。
- 驱动 Agent Loop。
- 调用模型。
- 调用工具。
- 接收工具结果。
- 根据结果继续执行。
- 处理权限请求。
- 记录事件。
- 输出最终答复、patch、证据或笔记草稿。

### 9.3 AgentEvent 协议

前端不应直接拼 prompt，也不应直接理解工具内部逻辑。前端只消费结构化事件。

基础事件包括：

```text
agent.started
agent.plan.created
model.delta
tool.started
tool.output
tool.failed
permission.required
evidence.added
patch.generated
patch.applied
workspace.updated
agent.completed
agent.failed
```

### 9.4 Tool Registry

所有工具必须统一注册，不能散落在 UI 组件中。

Tool 应包含：

- 名称。
- 描述。
- 输入 schema。
- 输出 schema。
- 权限级别。
- 是否允许自动调用。
- 超时设置。
- 错误处理策略。
- 日志策略。

### 9.5 Skill Runner

Skill 是面向场景的工作流，不是原子工具。

示例：

- `/debug-code`
- `/research-problem`
- `/stress-test`
- `/write-solution`
- `/explain-algo`
- `/find-notes`
- `/read-luogu-discussion`

Skill 应包含：

- 目标描述。
- 默认上下文策略。
- 推荐工具序列。
- 权限需求。
- 输出格式。
- 验证标准。
- 失败降级策略。

### 9.6 Permission Manager

权限至少分为：

| 权限 | 示例 |
|---|---|
| 只读 | 读取当前文件、本地笔记 |
| 联网 | 搜索网页、读取公开网页 |
| 敏感联网 | 带 Cookie 读取洛谷等登录态页面 |
| 执行 | 编译、运行代码、跑对拍 |
| 写入 | 修改文件、创建笔记、保存博客草稿 |
| 危险操作 | 删除文件、执行非白名单命令、大量发送本地内容 |

默认策略：

- 读取当前打开文件可默认允许。
- 搜索本地笔记可默认允许。
- 联网每个任务询问一次。
- 运行代码每个任务询问一次。
- 带 Cookie 读取每个站点或任务询问一次。
- 写文件必须用户确认。
- 删除文件和危险命令默认禁止或强确认。

### 9.7 Context Builder

Context Builder 根据任务类型构建上下文。

调试代码时，应优先包括：

- 当前代码。
- 题面。
- 样例。
- 编译器信息。
- 最近错误。
- 相关本地笔记。
- 最近运行结果。

研究题目时，应优先包括：

- 题面。
- 约束。
- 标签。
- 搜索结果。
- 网页正文摘要。
- 本地相似笔记。
- 来源可信度。

写题解时，应优先包括：

- 题面。
- 最终代码。
- 调试记录。
- 查阅资料。
- 用户写作风格。
- 本地标签体系。

---

## 10. Problem Workspace

### 10.1 定义

Problem Workspace 是 NoteX Agent Workbench 的核心对象。

它表示用户围绕一道题进行学习、编码、调试、研究、沉淀的完整工作区。

### 10.2 包含内容

一个 Workspace 应包含：

- 题目来源。
- 题号。
- 题目标题。
- 题面。
- 输入输出格式。
- 样例。
- 数据范围。
- 当前代码。
- 暴力代码。
- 数据生成器。
- 对拍脚本。
- Checker，如有。
- 编译配置。
- 运行记录。
- 反例。
- 已读取网页。
- 已读取讨论。
- 已引用资料。
- 相关本地笔记。
- 最终题解草稿。
- 博客草稿。
- Agent 执行历史。

### 10.3 Workspace 价值

Problem Workspace 解决的问题：

- 防止上下文散乱。
- 让调试、研究、写作形成闭环。
- 让 Agent 记住当前做题状态。
- 让缓存、证据、反例、草稿可复用。
- 让用户切换侧边栏 / 全屏模式时不丢状态。
- 让最终题解可以从真实过程沉淀出来。

---

## 11. Web Reader 与搜索能力

### 11.1 搜索和读取分离

必须把搜索与读取拆开：

```text
Search Provider：负责找到 URL
Reader Provider：负责读取 URL
Extractor：负责提取正文
Evidence Builder：负责整理证据
Cache Manager：负责缓存搜索和正文
```

### 11.2 Tavily

后续计划接入 Tavily 作为主要搜索 / 抽取服务之一。

Tavily 应用于：

- 普通公开网页搜索。
- 公开网页正文抽取。
- 多来源题解检索。
- OI Wiki / 博客 / editorial 搜索。
- 与本地 reader 互补。

### 11.3 Luogu Cookie Reader

洛谷等需要登录态的页面必须走本地 Reader。

原则：

- 用户显式粘贴 Cookie。
- Cookie 只保存本地。
- Cookie 只用于指定域名。
- Cookie 不进入模型。
- Cookie 不发送给 Tavily。
- Cookie 不发送给 OpenAI / Anthropic / 其他模型服务。
- 请求日志可查看。
- 可一键删除 Cookie。
- 读取登录态页面前需清楚提示。

### 11.4 Evidence System

所有网页资料都应进入 Evidence Store。

Evidence 应包含：

- 来源 URL。
- 标题。
- 站点。
- 抽取时间。
- 摘要。
- 关键片段。
- 是否登录态。
- 是否来自本地笔记。
- 可信度标记。
- 在最终回答中的引用编号。

Agent 输出题解或结论时，应尽量基于 Evidence，不应胡编来源。

---

## 12. Code Runner 与对拍系统

### 12.1 基础能力

Code Runner 应支持：

- 自动探测 g++ / clang++ / MinGW / Dev-C++ / Code::Blocks / MSYS2。
- 自定义编译命令。
- 编译当前 C++ 文件。
- 运行样例。
- 比较期望输出与实际输出。
- 设置超时。
- 设置内存限制，如可行。
- 临时目录执行。
- 运行日志记录。
- 错误输出展示。

### 12.2 OI 专用能力

应逐步支持：

- 生成暴力代码。
- 生成数据生成器。
- 生成 checker。
- 批量随机测试。
- 对拍。
- 保存第一组反例。
- 复现反例。
- 把反例挂到 Problem Workspace。
- 生成验证报告。

### 12.3 最终目标

Agent 最终结论应尽量可验证：

- 编译是否通过。
- 样例是否通过。
- 对拍通过多少组。
- 发现了哪组反例。
- 修改后是否重新验证。
- 仍有哪些未验证风险。

---

## 13. Patch / Diff / Rollback

### 13.1 基本原则

AI 不得静默修改用户文件。

所有修改必须：

1. 生成 patch。
2. 展示 diff。
3. 用户确认。
4. 应用 patch。
5. 记录到 Agent Session。
6. 支持撤销。

### 13.2 事务机制

多个文件变更应作为一个事务：

- 全部应用成功。
- 或全部回滚。
- 应用失败时不破坏用户文件。
- 用户可以查看变更记录。

### 13.3 适用范围

包括：

- 修改当前代码。
- 新建暴力代码。
- 新建数据生成器。
- 新建对拍脚本。
- 新建题解草稿。
- 修改笔记。
- 生成博客草稿。

---

## 14. 本地知识与长期记忆

### 14.1 本地笔记索引

Agent 应能检索：

- 用户题解。
- 算法笔记。
- 代码模板。
- 本地博客。
- 标签体系。
- 相关题目。

### 14.2 算法知识图谱

长期目标：

- 基于用户笔记建立算法知识图谱。
- 题目与算法标签关联。
- 相似题关联。
- 模板与题目关联。
- 易错点与题型关联。

### 14.3 用户易错点记忆

可选长期功能：

- 记录用户常犯错误。
- 例如 long long、数组越界、初始化、二分边界、Dijkstra 过期判断等。
- 调试时优先检查这些点。
- 必须本地保存。
- 用户可查看、编辑、删除。
- 默认不上传。

---

## 15. UI 需求

### 15.1 UI 原则

- 不做玩具聊天框。
- 不堆大按钮。
- 保持 VS Code / Codex Desktop 风格的专业感。
- 工具调用过程可见。
- 证据来源可见。
- 代码修改可见。
- 权限请求可理解。
- 长任务状态清楚。
- 失败原因清楚。

### 15.2 核心组件

必须规划：

- Agent Task Header。
- Message List。
- Tool Trace Viewer。
- Evidence Panel。
- Code Preview。
- Diff Viewer。
- Sample Output Viewer。
- Problem Workspace Panel。
- Permission Dialog。
- Final Result Card。
- Markdown Preview。
- Workspace Switcher。

### 15.3 最终结果卡片

Agent 完成任务后，应输出结构化总结：

- 做了什么。
- 发现了什么。
- 修改了什么。
- 验证了什么。
- 引用了哪些来源。
- 仍有哪些风险。
- 可继续执行什么操作。

示例：

```text
发现 bug：二分右边界更新错误。
已验证：
- 编译通过
- 样例 1/2/3 通过
- 与暴力对拍 1000 组通过
已生成 patch，等待用户确认应用。
风险：未覆盖 n=2e5 极限性能测试。
```

---

## 16. 模型与 Provider 设计

### 16.1 Provider Adapter

需要支持：

- Responses API。
- Chat Completions。
- OpenAI-compatible base URL。
- Anthropic。
- 本地模型。
- 中转站模型。
- 未来可选 Codex / OpenCode Adapter。

### 16.2 模型能力矩阵

每个模型应记录：

- 是否支持 tool calling。
- 是否支持 Responses API。
- 是否支持 streaming。
- 是否支持长上下文。
- 是否支持结构化输出。
- 代码能力等级。
- 成本。
- 速度。
- 稳定性。

### 16.3 任务级模型策略

可逐步支持：

- 简单问答用便宜模型。
- 代码调试用强代码模型。
- 长资料阅读用长上下文模型。
- 题解写作用表达能力强的模型。
- 工具规划用稳定 tool calling 模型。

---

## 17. 成本、缓存与额度

### 17.1 缓存

需要缓存：

- 搜索结果。
- 网页正文。
- 题面。
- 洛谷讨论。
- Evidence Packet。
- 本地笔记检索结果。
- 编译和运行记录。
- 对拍反例。

### 17.2 额度统计

需要统计：

- 模型调用次数。
- token 消耗。
- Tavily 调用次数。
- 网页读取次数。
- 登录态页面读取次数。
- 当前 Workspace 消耗。

### 17.3 低成本模式

低成本模式可限制：

- 搜索深度。
- 网页读取数量。
- 模型上下文长度。
- 对拍轮数。
- 是否读取讨论区。
- 是否使用强模型。

---

## 18. 安全、隐私与教育边界

### 18.1 Cookie 安全

必须满足：

- Cookie 显式配置。
- Cookie 本地保存。
- Cookie 不进入模型。
- Cookie 不发送第三方。
- Cookie 可删除。
- Cookie 使用有日志。

### 18.2 文件安全

- 默认只读。
- 写入需确认。
- 删除默认禁止。
- Patch-first。
- 支持撤销。

### 18.3 命令安全

- 编译、运行走白名单。
- 非白名单命令需强确认。
- 危险命令禁止。
- 对拍设置超时。
- 运行在临时目录。
- 尽量限制文件访问范围。

### 18.4 教育模式

可以提供提示强度：

- 只给提示。
- 给关键观察。
- 给完整思路。
- 给伪代码。
- 给完整代码。

可选模式：

- 学习模式。
- 调试模式。
- 题解模式。
- 比赛 / 考试模式。

---

## 19. 低依赖与机房适配

### 19.1 默认要求

普通用户不应额外安装大量依赖。

默认功能应尽量内置：

- Agent Runtime。
- Web Reader。
- Tool Registry。
- Provider 管理。
- 本地笔记检索。
- 基础 Code Runner。
- Workspace 存储。

### 19.2 机房问题

需要考虑：

- 无管理员权限。
- Windows 版本较老。
- 路径含中文。
- 代理环境复杂。
- g++ 路径不统一。
- 机房重启还原。
- 弱网 / 无网。
- 杀软误报。
- WebView2 版本问题。

### 19.3 降级模式

应支持：

- 完整模式：模型、搜索、网页读取均可用。
- 弱网模式：允许用户手动贴 URL / 题面。
- 离线模式：本地笔记、代码解释、模板检索仍可用。

---

## 20. 评测与验收标准

### 20.1 内部 Benchmark

应建立内部评测集。

调试类：

- 编译错误。
- 样例错误。
- long long 溢出。
- 数组越界。
- 二分边界。
- DP 初始化。
- 图论建边。
- Dijkstra 忘记判过期。
- TLE 复杂度错误。
- 对拍发现反例。

研究类：

- 给定题号查资料。
- 读取洛谷讨论。
- 对比不同题解。
- 过滤低质量来源。
- 结合本地笔记回答。

写作类：

- 生成题解。
- 整理博客。
- 自动打标签。
- 补充复杂度。
- 补充证明。
- 修复 Markdown / KaTeX。

### 20.2 验收指标

不能只看回答是否好看，应看：

- 是否使用了正确工具。
- 是否展示了工具过程。
- 是否找到正确 bug。
- 是否引用来源。
- 是否通过样例验证。
- 是否通过对拍。
- 是否生成可用 patch。
- 是否避免错误修改文件。
- 是否说明不确定性。
- 是否能从失败中恢复。
- 是否形成可沉淀的笔记 / 题解。

---

## 21. 阶段路线

### Phase 0：审计与架构冻结

目标：

- 审计现有 AI 代码。
- 按 Provider / UI / Web / Runtime / Legacy 分类。
- 明确保留、迁移、废弃、重做清单。
- 输出技术架构设计。
- 冻结 AgentEvent、Tool、Workspace 基础类型。

产物：

- AI 资产审计报告。
- Agent Runtime 架构设计。
- Workbench UI 信息架构。
- 迁移计划。

### Phase 1：Agent Runtime 骨架

目标：

- 新建 Agent Runtime。
- 新建 AgentSession。
- 新建 AgentEvent。
- 新建 ToolRegistry。
- 新建 PermissionManager。
- 新建 ContextBuilder。
- 接入现有 Provider 管理。
- 打通最小模型调用。
- 注册一个只读工具，例如 `read_current_file`。

验收：

- 侧边栏 / Workbench 能消费同一 AgentEvent。
- 一次最小 agent loop 能跑通。
- 工具调用过程可见。
- 不依赖旧 AiSidebar 主流程。

### Phase 2：Problem Workspace 骨架

目标：

- 建立 Problem Workspace 数据模型。
- 支持题目、代码、样例、运行记录、证据、笔记关联。
- Workbench 左栏展示 Workspace。
- Agent 能以 Workspace 为上下文执行。

验收：

- 用户可创建 / 绑定一道题的 Workspace。
- 代码、样例、题面可挂到 Workspace。
- Agent 执行历史挂到 Workspace。
- 切换侧边栏 / 全屏不丢状态。

### Phase 3：Code Debugger 主链路

目标：

- 读当前代码。
- 编译。
- 运行样例。
- 展示输出。
- 生成修复建议。
- 生成 patch。
- diff 预览。
- 用户确认后应用。
- 重新验证。

验收：

- 能完成简单 WA / 编译错误定位。
- 工具轨迹可见。
- patch-first。
- 支持撤销。
- 运行失败有清楚提示。

### Phase 4：Web Reader 与 Evidence

目标：

- 接入 Tavily。
- 实现公开网页 reader。
- 实现 Evidence Store。
- 实现引用显示。
- 实现 Luogu Cookie Reader 初版。
- 搜索和读取分离。
- 支持缓存。

验收：

- 能搜索并读取公开题解。
- 能读取指定 URL。
- 能保存 Evidence。
- 能在回答中引用来源。
- Cookie 不进入模型和第三方服务。
- 失败时支持用户手动贴 URL / 题面。

### Phase 5：OI Research Skill

目标：

- `/research-problem` skill。
- 读取题面。
- 搜索题解。
- 读取讨论。
- 结合本地笔记。
- 综合多来源。
- 输出算法思路、复杂度、风险。

验收：

- 能完成一道题的资料研究闭环。
- 能过滤明显低质量来源。
- 能引用网页与本地笔记。
- 不胡编资料。

### Phase 6：Stress Test Skill

目标：

- 生成暴力。
- 生成数据生成器。
- 对拍。
- 保存反例。
- 复现反例。
- 结合调试流程定位 bug。

验收：

- 能对典型 OI 题完成对拍。
- 能保存第一组反例。
- 能把反例挂到 Workspace。
- 能在最终结论中报告验证结果。

### Phase 7：题解沉淀闭环

目标：

- `/write-solution` skill。
- 从 Workspace 生成题解。
- 引用资料来源。
- 结合最终代码。
- 自动打标签。
- 保存本地笔记。
- 生成博客草稿。
- 支持预览。

验收：

- 能从做题过程生成可编辑题解。
- 能保存到本地笔记。
- 能关联题目和标签。
- 不照搬网页原文。

### Phase 8：MCP / Codex / OpenCode Adapter

目标：

- 支持高级用户接 MCP。
- 支持自定义 skills。
- 探索 Codex / OpenCode Adapter。
- 不影响默认低依赖体验。

验收：

- 默认用户无需安装额外依赖。
- 高级用户可扩展工具。
- Adapter 与主 Runtime 解耦。

---

## 22. 非目标

第一阶段不做：

- 插件市场。
- 完整多 agent 调度系统。
- 云端同步 Agent 历史。
- 自动发布题解到外部平台。
- 默认集成 Codex CLI。
- 默认依赖 MCP server。
- 默认开启完整 shell 权限。
- 自动读取浏览器 Cookie。
- 未经确认自动修改用户代码。
- 无限制网页爬取。
- 替代专业 OJ 提交系统。

---

## 23. 开发约束与工作模式

### 23.1 工程约束

- 不允许把 Agent 逻辑写进巨型 React 组件。
- 不允许继续在旧 AiSidebar 上堆逻辑。
- 不允许把搜索、阅读、回答混成巨型函数。
- 不允许直接静默写用户文件。
- 不允许 Cookie 进入模型上下文。
- 不允许默认执行危险 shell 命令。
- 不允许用“临时 prompt”代替架构模块。
- 不允许为了快速 demo 破坏长期架构。

### 23.2 推荐开发方式

- 先审计。
- 再冻结类型协议。
- 再做空骨架。
- 再打通最小闭环。
- 再迁移旧资产。
- 再逐步接复杂能力。

### 23.3 给 Codex 的基本要求

后续给 Codex 开发时，应要求它：

- 先阅读 AGENTS.md、git 状态、相关文件。
- 先做架构审计，不要直接改代码。
- 严格区分保留、迁移、废弃、重做。
- 不要 `git add .`。
- 涉及 UI 变化先讨论确认。
- 所有 AI 架构变更必须说明模块边界。
- 不要把新 Agent 做成旧 AI 侧边栏补丁。
- 完成后必须验证。

---

## 24. 最终验收标准

NoteX Agent Workbench 初版可认为达到目标，需要满足：

1. 架构上已脱离旧 AiSidebar 主流程。
2. Agent Runtime、ToolRegistry、PermissionManager、EventStream、Problem Workspace 已建立。
3. 侧边栏和全屏 Workbench 共用同一底层。
4. 至少打通代码调试主链路。
5. 至少打通题目研究主链路。
6. 至少打通题解沉淀基础链路。
7. AI 改代码必须 diff-first。
8. 工具执行过程可见。
9. Evidence 可追踪，来源可引用。
10. Cookie 安全边界清楚。
11. 默认低依赖，不要求普通用户安装 MCP / Codex / Node / Python。
12. 失败时有清楚降级策略。
13. 有内部 benchmark 用于回归测试。
14. UI 观感接近成熟工作台，而非半成品聊天框。
15. OI 场景闭环明显强于泛用 Agent 的默认体验。

---

## 25. 总结

NoteX Agent Workbench 的核心不是“让 AI 更聪明一点”，而是把 OI Notebook 的 AI 能力从聊天功能升级为成熟的 Agent 工作台。

它应以 Codex / OpenCode 的成熟 Agent Harness 为参考，但不做泛用 coding agent 平替；它应围绕 OI 的真实工作流建立自己的护城河：

```text
读题 → 查资料 → 看笔记 → 写代码 → 跑样例 → 对拍 → 找 bug → 改代码 → 验证 → 写题解 → 沉淀博客
```

这条闭环成立，OI Notebook 的 AI 才不是玩具，而是可以真正提升信息学竞赛学习与开发效率的核心功能。
