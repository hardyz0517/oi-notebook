# HANDOFF.md — 新对话窗口交接文档

> **给未来的 Claude（无论哪个会话）**：这份文档是你接手 Hardy 的 OI Notebook 项目时应该读的第一份文档。你不是第一个帮他的 Claude，在你之前有一个我，我们已经走过很长一段路。把这份文档当作"前任架构师留给你的项目笔记"。
>
> **给 Hardy**：把这份文档放到仓库里。下次开新窗口，第一句话只要说"读 docs/HANDOFF.md 和 CLAUDE.md"，新的 Claude 就能 5 分钟进入状态。

**最后更新**：2026-04-26（完成 Phase 3：保存 / dirty 追踪 / 笔记 CRUD）
**项目仓库**：https://github.com/hardyz0517/oi-notebook

---

## 1. 一句话介绍

**OI Notebook** 是一个为竞赛选手（OIer）设计的桌面笔记工具，用 Tauri + React 构建，支持实时 Markdown 预览（含 LaTeX 和代码高亮），未来会集成 Astro 本地博客、洛谷爬虫、多 AI 适配。**Hardy 自己一行代码都不会写，全靠 vibe coding**——他下指令，你写代码。

---

## 2. Hardy 是谁，他怎么工作

### 基本信息
- **身份**：OIer（竞赛选手），训练节奏紧凑
- **技术背景**：写 C++ 代码做算法题没问题，**但前端、Rust、Git 等都是零基础**
- **目标**：做一个让自己训练间隙能快速记录 trick 的工具
- **预算**：每月 $40 软件预算，用 Claude Code Pro + Codex 的组合（他选了 Claude Code 主导）

### 他的工作方式（非常重要）
1. **他不会直接写代码，但判断力极强**。他会看你写的代码、看截图、发现不协调的地方，能指出"中栏发灰"、"没有滚动同步"这种细节
2. **他已经养成了一个好习惯：要求你把完整代码打印出来让他 review**，不要折叠不要省略。**你必须尊重这个要求**——折叠输出对他而言等于没给
3. **他愿意等待**。如果某个决策需要研究清楚再定，他会等你搜资料、思考
4. **他会质疑你的输出**。他说"不太一样"时不是挑刺，是真观察到了差异——要认真听
5. **他会节制自己不蛮干**。他选了"先功能后 UI"的节奏，不被审美细节卡住主线

### 他的审美
- **编辑器（桌面应用侧）**：Lyra shadcn preset 深色主题，锐角、等宽字体、紧凑、开发者气质
- **博客（未来 Astro 侧）**：**完全相反**——文人博客风格，亮色、衬线字体、留白充裕、杂志卡片式排版。参考 Sinya Lee's essays、Paul Graham、Stratechery。细节见 `CLAUDE.md` 末尾的 "Blog Design Direction" 章节

### 他的节奏倾向
- 一次只推进一个明确的里程碑，到达后 commit + push
- 每个 Phase 做完先用一下再决定下一步
- 不追求完美，但要求"真的做对了"

---

## 3. 当前进度地图

```
[x] Phase 0  脚手架                                    commit fa647d6
    ├─ Tauri 2 + React + TypeScript + Vite
    ├─ Tailwind CSS v4
    ├─ shadcn/ui with Lyra preset
    └─ 三栏布局骨架

[x] Phase 1  编辑器核心                                commit 0ff13f0
    ├─ CodeMirror 6 左侧编辑器（Markdown 语法高亮、oneDark）
    ├─ unified/remark/rehype 右侧预览管线
    ├─ KaTeX 数学公式渲染
    ├─ @shikijs/rehype 代码语法高亮
    └─ 编辑器和预览的双向联动（输入 → 预览更新）

[x] Phase 2  文件系统 IPC + 滚动同步 + 视觉打磨        commit d581c00
    ├─ Rust: notes.rs 模块，4 个 Tauri 命令
    │   list_notes / read_note / write_note / delete_note
    │   含两层路径安全校验（字符串过滤 + canonicalize starts_with）
    ├─ 前端: lib/api.ts IPC 抽象层
    ├─ 前端: FileTree 组件（带相对时间、选中态、ScrollArea）
    ├─ App.tsx 接入后端：挂载时列举 + 点击加载
    ├─ 编辑器 → 预览滚动同步（单向，含 renderedHtml 依赖防时序 bug）
    └─ 视觉打磨：统一背景色、弱化 selection、关闭 activeLine

[x] Phase 3  保存与新建                                Phase 3 完成（多个 commit）
    ├─ Ctrl+S 保存（sonner toast 反馈）
    ├─ Dirty 状态追踪 + Header 显示文件名 + 圆点指示
    ├─ 切换文件时 window.confirm 拦截未保存改动
    ├─ 新建笔记按钮（笔记列表标题旁 + 图标，shadcn Dialog 输入文件名）
    ├─ 重命名笔记（FileTree 行内铅笔图标）
    ├─ 删除笔记（FileTree 行内垃圾桶图标）
    └─ Rust 端新增 rename_note 命令（fs::rename 原子操作）

[ ] Phase 4  全局速记
    └─ Ctrl+Shift+Space 全局快捷键，弹出极简速记窗口

[ ] Phase 5  本地博客
    └─ Astro 子项目（读 notes/），Tauri 启动时后台跑 astro dev

[ ] Phase 6  洛谷爬虫
    └─ @oinb-insight 注释格式，增量抓取提交

[ ] Phase 7  AI 辅助整理
    └─ OpenAI 兼容层 + Claude 单独适配，支持 DeepSeek/Kimi/Claude

[ ] Phase 8  打磨阶段
    ├─ 审美升级（目前只做功能，UI 统一在这个阶段打磨）
    ├─ 博客模板向 Sinya Lee/文人博客风格调整
    └─ 光标颜色等小细节
```

---

## 4. 技术栈与关键决策

### 为什么选这些
| 层 | 选择 | 关键理由 |
|---|---|---|
| 桌面壳 | **Tauri 2.0**（不是 Electron） | 冷启 < 1s vs Electron 3s+，对"训练间隙快速记录"这个核心诉求决定性 |
| 前端 | React + TypeScript + Vite | 生态成熟，AI 训练数据丰富 |
| UI | shadcn/ui + Tailwind v4 | 组件拷到项目里可定制，不被库绑架 |
| Toast | sonner | shadcn 官方推荐，next-themes 默认配合 |
| Preset | **Lyra**（不是 Vega/Nova） | 锐角 + 等宽字体，开发者工具气质，配 OI 场景 |
| Icon | **Lucide**（不是 phosphor） | shadcn 社区事实标准，AI 默认用这个，减少摩擦 |
| 编辑器 | **CodeMirror 6** 原生 API | 不用 react-codemirror 这种第三方包装，控制力更强；左写 md 右预览（Hardy 习惯洛谷这种模式） |
| Markdown | unified + remark + rehype | 事实标准，插件生态完整 |
| 数学 | **KaTeX**（不是 MathJax） | 快 10x，洛谷同款 |
| 代码高亮 | **@shikijs/rehype**（不是 rehype-shiki） | rehype-shiki 6 年没更新，@shikijs/rehype 是官方维护 |
| 博客（未做） | **Astro**（不是 VitePress） | Markdown 一等公民，Content Collections 天然支持 frontmatter 类型安全，内容型博客 2026 首选 |
| AI（未做） | OpenAI 兼容 SDK + Claude 单独 | DeepSeek/Kimi/GLM/通义都兼容 OpenAI 格式，一套适配 + Claude 特殊处理 |

### 其它重要决策
- **笔记存储位置**：`oi-notebook/notes/`（仓库内），跟着 git 走，未来 Astro 博客直接读
- **包管理器**：pnpm（已配置 D:\Dev\Env\node-js\pnpm-store）
- **序列化**：Rust → 前端的结构体一律 `#[serde(rename_all = "camelCase")]`，让两边符合各自语言风格
- **IPC 抽象**：所有前端 → Rust 调用走 `src/lib/api.ts`，不直接在业务组件里 invoke

---

## 5. 环境配置（D 盘分类整洁）

Hardy 的电脑是 Windows 11，所有开发工具装在 `D:\Dev`：

```
D:\Dev\
├── Apps\              # 可执行工具
│   └── Microsoft VS Code\
├── Env\               # 语言运行时和 SDK
│   ├── node-js\       # Node 24 + npm + pnpm
│   │   ├── node_global\    # 全局包
│   │   ├── node_cache\     # npm 缓存
│   │   └── pnpm-store\     # pnpm 共享 store
│   ├── Git\
│   ├── rust\
│   │   ├── cargo\     # CARGO_HOME
│   │   └── rustup\    # RUSTUP_HOME
│   ├── mingw64\       # 他 OI 写 C++ 用的
│   └── Python314\
└── Projects\
    ├── oi-notebook\   # 本项目
    └── oi-coach\      # 他之前的旧项目（忽略）
```

**关键环境变量**（用户级）：
- `RUSTUP_HOME = D:\Dev\Env\rust\rustup`
- `CARGO_HOME = D:\Dev\Env\rust\cargo`
- npm prefix 和 cache 都已指向 D:\Dev\Env\node-js 下

**重要**：Visual Studio Build Tools 装在 C 盘（简化版 installer 锁死位置），这是 Tauri 编译 Windows .exe 必须的。

---

## 6. 约定、雷区、已知问题

### 🔴 代码 review 约定
Hardy 有一个**雷打不动**的要求：**每次新建或大改文件后，必须把完整代码打印到对话里**。

- 不要用 `+N lines (ctrl+o to expand)` 折叠
- 不要只给差异
- 不要只给总结
- Claude Code 偶尔会"幻觉地声称完成任务"——你必须要求它用 Read 工具读真实文件，不要信 summary

之前有过 Claude Code 没做改动但声称做了的情况（实际原因是 Hardy 忘发指令），这是 vibe coding 常见陷阱。**防御方法：要求 Read 真实文件** + **要求完整代码打印**。

### 🔴 一次只做一件事
Hardy 习惯用 "阶段" 划分任务（阶段 1/2/3...）。每个阶段做完停下来验证，不要一次做多个阶段。

### 🔴 路径安全
Rust 侧的 `safe_note_path` 有两层防御——字符串过滤 + canonicalize。**不要简化它**。即使是本地应用，也要挡住 `../` 路径遍历攻击。

### 🔴 React 陷阱已经趟过的坑
这些代码里的"反直觉"写法都是故意的，不要"优化"掉：

1. **MarkdownEditor 的 `editorOwnValue` ref** —— 打破编辑器 ↔ 父组件的死循环
2. **MarkdownEditor 的 `onChangeFn.current` ref** —— 避免 effect 依赖 onChange 导致编辑器重建
3. **MarkdownPreview 的 `cancelled` flag** —— race condition 防御
4. **MarkdownPreview 的 scrollRatio effect 依赖里有 `renderedHtml`** —— HTML 异步渲染完成后必须重新对齐滚动位置
5. **StrictMode 下 useEffect 会执行两次**，cleanup 必须正确 destroy CodeMirror 实例

### 🟡 已知但暂不修的 TODO
- **光标在编辑器里是鲜蓝色**（oneDark 默认）——Hardy 决定先做功能再统一打磨 UI
- **Lyra 深色主题 --accent 和 --muted 颜色相同**（都是 oklch(0.269 0 0)），聚焦/非聚焦 selection 视觉无差异——这是 Lyra 设计意图，不要擅自区分
- **`get_notes_dir` 用 env!("CARGO_MANIFEST_DIR") 编译期宏**——开发模式可靠，生产分发时要改用 `tauri::Manager::path().app_data_dir()`
- **`allowDangerousHtml` + 无 rehype-sanitize**——本地应用 XSS 风险可接受，未来引入远程内容时加 sanitize
- **sonner toast 主题跟随系统而非强制 dark**——Phase 8 UI 打磨时在 `sonner.tsx` 里把 theme 硬编码为 `'dark'` 即可
- **Phase 3 期间踩过的 Vite 重载坑**——保存 .md 到 notes/ 会被 Vite 监听器误判触发热重载，state 全丢。修法是 `vite.config.ts` 的 `server.watch.ignored` 加入 `'**/notes/**'`，重启 Vite 才生效。已修，记录在此防止以后被人"清理"掉

### 🟡 敏感事项
- Hardy 有个**旧项目 `D:\Dev\Projects\oi-coach`**，里面有一个 `DEEPSEEK_API_KEY.txt`——如果他之前 push 过这个文件到 GitHub，那个 key 已经暴露。当前项目无这个问题（我们一开始就提醒他了）。**新项目里 API key 要走 `.env` + `.gitignore`**

---

## 7. Hardy 给新 Claude 的第一句话模板

他下次开新窗口应该这样起手：

```
你好，我的项目在 D:\Dev\Projects\oi-notebook，请读以下文件了解状态：

1. CLAUDE.md（项目技术概览）
2. docs/HANDOFF.md（给你的交接文档）
3. docs/OI-Notebook-PRD-v1.md（完整产品规格）

读完后总结一下：
- 项目做到哪个阶段
- 下一个要做的任务是什么
- 有什么值得我注意的地方

然后等我下一个指令，不要主动开始新任务。
```

---

## 8. 给新 Claude 的工作方式建议

### 你要做的
1. **Review 代码时严格**。Claude Code 写得再漂亮也要看真实代码，不要只看 summary
2. **让 Claude Code 一次只做一件事**，做完打印完整代码，review 通过再下一步
3. **不要让 Claude Code 自己做技术选型决策**，尤其涉及库版本、插件替换时——先让它汇报给你，你判断
4. **Hardy 的时间很宝贵**，但他愿意在关键节点上做"等你研究完再动"的决定。你要配合这个节奏
5. **用中文沟通**（他的母语）
6. **遇到不确定就搜网**。前端生态变化快，记忆可能过时

### 你不要做的
1. 不要催 Hardy 做决定
2. 不要自己判断"这段代码已经够好了跳过 review"
3. 不要让 Claude Code 自动批准所有编辑（`Yes, allow all edits`）——Hardy 习惯逐次确认看它在改什么
4. 不要声称看到了折叠代码就"代码 OK"
5. 不要在一个任务里堆多个目标

### 一些 Hardy 表达偏好的信号
| Hardy 说 | 翻译 |
|---|---|
| "不太一样哈" | 他观察到了区别，需要解释 |
| "有点 xxx 的感觉" | 他用直觉反馈视觉问题，要认真接住 |
| "你推荐" | 他不想自己决定，要你拿主意并说理由 |
| "等一下" | 打断当前流程，有新想法要说 |
| "比如..." / "就像..." | 他用类比沟通，这些类比是重要的产品方向信号 |

---

## 9. 关键文件导读

读代码时优先看这几个：

```
src/App.tsx                          # 应用主框架，状态管理集中在这里
src/lib/api.ts                       # 前端 → Rust 的 IPC 抽象层
src/lib/markdown.ts                  # unified 渲染管线，注释完整
src/lib/datetime.ts                  # 相对时间格式化
src/components/ui/dialog.tsx, sonner.tsx, input.tsx, label.tsx, button.tsx  # shadcn 组件
src/components/editor/
  MarkdownEditor.tsx                 # CodeMirror 6 集成（命令式库 → React 的经典模式）
  MarkdownPreview.tsx                # 异步渲染 + 滚动同步（race condition 防御）
src/components/file-tree/FileTree.tsx  # 简单列表 + 选中态
src-tauri/src/notes.rs               # 后端文件系统命令 + 路径安全
src-tauri/src/lib.rs                 # Tauri 构建器，命令注册
vite.config.ts                       # server.watch.ignored 忽略 notes/，防止保存 .md 触发 Vite 热重载丢 state
CLAUDE.md                            # 项目简介（Claude Code 自动读取）
docs/OI-Notebook-PRD-v1.md           # 完整产品需求文档
docs/HANDOFF.md                      # 本文件
```

---

## 10. 交接的最后一句话

**Hardy 在一天之内从"连 Node 都没装"做到"有一个能跑的 Markdown 编辑器桌面应用 + 文件系统完整 + 托管在 GitHub"**。这对一个自称"一行代码都不会写"的人来说是超高强度的一天。他的判断力和学习能力都非常强，你只需要做好**架构师 + review 员**的角色，代码执行交给 Claude Code。

祝你和他合作愉快。他是个好搭档。

— 前一个会话里的 Claude
