# OI Notebook —— OIer 的 trick & 建模速记系统 PRD

> **版本**：v1.0（定稿）
> **目标用户**：作者本人（OIer，训练节奏紧凑）
> **核心价值**：训练间隙最低摩擦记录 trick / 建模 → 本地秒开博客复习 → 自动同步到 GitHub 线上站

---

## 1. 产品定位

### 1.1 一句话描述

一个桌面优先的 OI 速记工具，自带**本地实时博客**，支持洛谷提交爬取和多模型 AI 辅助整理，所有内容自动同步到 GitHub。

### 1.2 核心场景

**场景 A：训练间隙速记**
> "这题的 DP 转移好妙，我得记下来" → `Ctrl+Shift+Space` → 弹出速记窗口 → 左写 md 右看预览 → 回车保存 → 窗口消失 → 继续训练

**场景 B：复习查找**
> "上周记的那个李超树 trick 在哪？" → 浏览器打开 `localhost:4321` → 搜索"李超树" → 瞬间看到笔记（和线上博客一样的样子）

**场景 C：自动沉淀代码洞察**
> 在洛谷 AC 了一题，代码末尾写了 `/* @oinb-insight ... */` 注释 → 晚上桌面应用自动抓取 → AI 润色 → 生成一篇结构化笔记

### 1.3 设计原则

1. **摩擦最小化**：速记窗口冷启 < 500ms
2. **本地优先**：断网、无账号都能用
3. **Markdown 为真**：所有数据是裸 `.md` 文件，不绑定私有格式
4. **自动化友好**：文件结构和 frontmatter 便于脚本/AI 处理
5. **不造轮子**：复用 Astro / CodeMirror / remark 等成熟生态

---

## 2. 技术栈

### 2.1 核心栈

| 层 | 技术 | 理由 |
|---|---|---|
| 桌面壳 | **Tauri 2.0** | 包小（~5MB），冷启 < 1s，比 Electron 符合"秒开"需求 |
| 前端框架 | React 18 + TypeScript | 生态成熟，你只需学过 React |
| 构建工具 | Vite | 快，Tauri 官方默认搭配 |
| 编辑器 | **CodeMirror 6** | VS Code 同核，左写 md 最佳选择 |
| Markdown 渲染 | unified + remark + rehype | 事实标准，扩展性强 |
| 数学公式 | KaTeX | 洛谷同款，快 |
| 代码高亮 | Shiki | VS Code 同款主题 |
| UI 组件 | shadcn/ui + Tailwind | 可复制可定制，不被库绑架 |
| 状态管理 | Zustand | 10 行上手 |
| 本地索引 | SQLite (`tauri-plugin-sql`) | 全文搜索、标签 |
| Git | 调用系统 `git` 命令 | 比库简单可靠 |
| 静态站 | **Astro** | 2026 最佳内容型博客框架 |

### 2.2 为什么不选其他方案

- **Electron**：启动慢、包大，违背"训练间隙秒开"
- **VitePress**：偏文档站，做博客要自己写很多东西，Astro 开箱即用
- **Obsidian / Typora 二次开发**：闭源/插件受限，无法深度定制
- **所见即所得编辑器（Milkdown/Notion 风格）**：你已经说了偏好双栏预览，不合适
- **纯 Web 应用**：没法做全局快捷键，文件操作受限

---

## 3. 架构总览

### 3.1 仓库结构（单仓库）

```
oi-notebook/                    # 你的 GitHub 仓库
├── notes/                      # 📝 笔记目录（你唯一关心的地方）
│   ├── tricks/                 # 手写 trick
│   │   ├── 李超树-斜率转化.md
│   │   └── ...
│   ├── problems/               # 手写题解
│   ├── luogu/                  # 爬虫自动生成
│   │   ├── P1234-xxx.md
│   │   └── ...
│   └── assets/                 # 图片
│
├── site/                       # 🌐 Astro 博客（自动读 notes/）
│   ├── src/
│   │   ├── pages/index.astro
│   │   ├── layouts/Post.astro
│   │   └── content.config.ts   # 指向 ../notes/
│   ├── astro.config.mjs
│   └── package.json
│
├── app/                        # 🖥️ Tauri 桌面应用源码
│   ├── src/                    # React 前端
│   ├── src-tauri/              # Rust 后端
│   └── package.json
│
├── .oinb/                      # 系统文件（gitignore 掉索引和缓存）
│   ├── config.json             # 用户配置
│   ├── index.db                # SQLite 索引（不进 Git）
│   └── ai-cache/               # AI 缓存（不进 Git）
│
├── .github/workflows/
│   └── deploy.yml              # push 后自动构建 + 部署
│
└── README.md
```

### 3.2 数据流

```
  ┌─────────────────────────────────────────┐
  │  Tauri 桌面应用（日常记录入口）           │
  │  ┌──────────────┐  ┌──────────────┐     │
  │  │ CodeMirror   │  │ 实时预览       │     │
  │  │ (左侧 md)    │  │ (右侧渲染)     │     │
  │  └──────────────┘  └──────────────┘     │
  └──────────────────┬──────────────────────┘
                     │ 保存
                     ▼
          ┌──────────────────────┐
          │  notes/**/*.md        │◀──── 洛谷爬虫写入
          └──────────┬───────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
         ▼           ▼           ▼
   SQLite 索引   Astro 本地站    Git commit/push
   (搜索用)      :4321 (看)       (同步)
                                  │
                                  ▼
                            GitHub Pages
                            (公开博客)
```

### 3.3 关键设计：本地 Astro 服务

Tauri 应用启动时：
1. 检查 `site/node_modules` 是否存在，不存在自动 `npm install`
2. 后台起 `astro dev --port 4321`
3. 用户在桌面应用里点"打开博客"按钮 → 浏览器打开 `localhost:4321`
4. **笔记改动 → Astro 热更新 → 浏览器自动刷新**（Astro 自带 HMR）

效果：你写完笔记，切到浏览器 tab，已经更新好了。

---

## 4. 功能模块

### 4.1 Feature 1：双栏 Markdown 编辑器 🔥 P0

**布局**：
```
┌────────┬──────────────────────────┬──────────────────────────┐
│ 笔记树   │ ## 今天学的 trick         │ # 今天学的 trick          │
│         │                           │                           │
│ ▸ tricks│ 这题发现 $f_i$ 转移形如... │ 这题发现 f_i 转移形如...  │
│ ▾ luogu │                           │                           │
│  P1234  │ ```cpp                    │ (渲染后的代码块)          │
│  P5678  │ for(...) ...              │                           │
│         │ ```                       │                           │
│         │                           │                           │
└────────┴──────────────────────────┴──────────────────────────┘
         ^ 左：CodeMirror 6           ^ 右：实时渲染
```

**关键特性**：
- 双栏分屏（可拖拽宽度），与洛谷题解编辑器一致
- **光标滚动同步**：左侧写到哪，右侧预览自动滚到哪
- LaTeX：`$...$` 行内、`$$...$$` 块级，KaTeX 实时渲染
- 代码高亮：Shiki + VS Code Dark+ 主题
- 图片粘贴：Ctrl+V 截图自动存 `notes/assets/` 并插链接
- Frontmatter 编辑器：顶部有一个折叠表单，专门编辑 tags、title 等字段
- 模板：新建笔记时可选"trick 模板"、"题解模板"、"空白"

**Frontmatter 约定**：
```yaml
---
title: 李超树维护下凸壳
tags: [数据结构, 李超树, 斜率优化]
difficulty: 省选
source: luogu-P4097
created: 2026-04-22T14:30:00+08:00
updated: 2026-04-22T14:30:00+08:00
summary: 将斜率优化问题转化为平面上的直线集，用李超树 O(log) 查询。
draft: false
---
```

### 4.2 Feature 2：全局速记 🔥 P0

- 全局快捷键（默认 `Ctrl+Shift+Space`，可自定义）
- 触发后弹出一个 600x400 的极简窗口：
  - 只有一个编辑区 + 一个标签输入框 + "保存 & 关闭" 按钮
  - 按 `Ctrl+Enter` 保存并关闭
  - 按 `Esc` 取消
- 默认保存到 `notes/inbox/YYYY-MM-DD-HHMMSS.md`
- 稍后在主界面可以整理到正式分类

### 4.3 Feature 3：本地博客实时预览 🔥 P0

- Tauri 启动时后台跑 `astro dev`
- 桌面应用状态栏显示"📡 博客运行中 localhost:4321"
- 一键在默认浏览器打开
- Astro 模板：基于 Astro 官方 blog 模板 + 针对 OI 的定制（标签页、搜索、深色模式）

**Astro 站支持**：
- 首页：最近笔记时间线 + 标签云
- 标签页：按标签筛选
- 文章页：侧边目录、上一篇/下一篇、相关推荐
- 搜索：客户端全文搜索（Pagefind 或 Fuse.js）
- 深色模式
- 数学公式 + 代码高亮（和编辑器渲染一致）

### 4.4 Feature 4：洛谷提交爬取 🔥 P0

**约定的代码注释格式**：

```cpp
int main() {
    // ... 你的代码
    return 0;
}

/* @oinb-insight
---
title: 区间覆盖差分
tags: [差分, 构造]
difficulty: 提高+
---

## 启示

关键是发现区间覆盖可以用差分转化为单点加减。
当区间的左右端点形成有序对时，可以用双指针...

## 坑点

- 差分数组大小要 n+2
- 注意边界的 0
*/
```

**爬取流程**：

1. **首次配置**：用户在设置里粘贴洛谷 `__client_id` 和 `_uid` Cookie
   - 会给出一个说明页教用户怎么在浏览器 F12 里找到
2. **触发方式**：
   - 手动：点"同步洛谷"按钮
   - 自动：每天早上 6 点 + 应用启动时
3. **抓取**：
   - 调洛谷 `/user/{uid}` 的提交 API（JSON 接口）
   - 增量：记录上次最大提交 ID
   - 请求间隔 ≥ 3 秒
4. **处理**：
   - 只处理 AC 提交
   - 提取 `@oinb-insight` 注释块
   - 有注释 → 生成 `notes/luogu/P{pid}-{title}.md`
   - 无注释 → 跳过（不污染笔记）
5. **Cookie 过期**：检测到 401 时弹通知，引导重新配置

**自动生成的笔记样子**：

```markdown
---
title: "P1234 - XX题 | 区间覆盖差分"
tags: [差分, 构造, 洛谷]
difficulty: 提高+
source: luogu-P1234
luogu_submission: 12345678
created: 2026-04-22T10:00:00+08:00
---

> 原题：[P1234 - XX题](https://www.luogu.com.cn/problem/P1234)
> AC 提交：[R12345678](https://www.luogu.com.cn/record/12345678)

## 启示

关键是发现区间覆盖可以用差分转化为单点加减。
...

## 坑点

- 差分数组大小要 n+2
- 注意边界的 0

## 代码

\`\`\`cpp
int main() {
    // ... 你的代码
}
\`\`\`
```

### 4.5 Feature 5：标签与搜索 🔥 P0

**标签系统**：
- 来源：frontmatter 的 `tags` 字段
- 支持层级：`数据结构/线段树/李超树`
- 左侧导航栏显示标签云

**搜索**：
- `Ctrl+K` 呼出全局搜索面板
- SQLite FTS5 全文索引
- 搜索语法：
  - 普通词：搜标题+内容
  - `tag:DP` 按标签
  - `source:luogu` 按来源
  - `@recent` 最近 7 天
- 实时搜索，边输边出结果

### 4.6 Feature 6：AI 辅助整理 🔥 P0

**多模型适配架构**：

```typescript
// 用户配置示例
{
  "providers": [
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "baseUrl": "https://api.deepseek.com/v1",
      "apiKey": "sk-xxx",
      "models": ["deepseek-chat", "deepseek-reasoner"]
    },
    {
      "id": "kimi",
      "name": "Kimi",
      "baseUrl": "https://api.moonshot.cn/v1",
      "apiKey": "sk-xxx",
      "models": ["moonshot-v1-32k"]
    },
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKey": "sk-or-xxx",
      "models": ["openai/gpt-4.1", "google/gemini-pro", "qwen/qwen-max"]
    }
  ],
  "tasks": {
    "auto_tag": "deepseek:deepseek-chat",       // 便宜任务用便宜模型
    "polish": "openrouter:openai/gpt-4.1",       // 润色走强模型路由
    "summarize": "deepseek:deepseek-chat",
    "relate": "deepseek:deepseek-chat"
  }
}
```

**底层实现**：优先支持 OpenAI-compatible provider。DeepSeek、Kimi、GLM、通义、OpenRouter 等都可以通过统一的 base URL / API key / model 配置接入。需要强模型润色时，推荐走 OpenRouter 或其它兼容路由，而不是为单个模型供应商写专门适配。

**具体 AI 能力**：

| 功能 | 触发方式 | 建议模型档位 |
|---|---|---|
| 自动打标签 | `Ctrl+T` | 便宜模型即可 |
| 生成摘要 | 保存时可选 | 便宜模型 |
| 注释润色 | 右键菜单 | 强模型（润色质量重要） |
| 关联推荐 | 侧边栏显示 | 便宜模型 + 向量检索 |
| 题目信息补全 | 粘贴洛谷链接后 | 便宜模型 |
| 复习问答 | 命令面板"考我" | 强模型 |

**Prompt 模板化**：所有 prompt 存 `.oinb/prompts/*.md`，用户可自己改。例如 `auto-tag.md`：

```markdown
你是一个 OI 算法笔记助手。请根据以下笔记内容，从用户现有的标签体系中选择 3-5 个最合适的标签。

现有标签体系：
{{existing_tags}}

笔记内容：
{{content}}

只返回 JSON 数组，不要其他内容：
["标签1", "标签2", ...]
```

**成本控制**：
- 全部用户触发，不后台偷跑
- 本地缓存：笔记内容 hash 不变就不重复调
- 默认选便宜模型

### 4.7 Feature 7：GitHub 同步

- 笔记仓库 = 整个项目仓库
- 保存笔记后：
  - 立即 `git add . && git commit -m "note: {title}"`（静默，不弹窗）
  - 每 5 分钟或关闭应用时 `git push`
- 冲突：优先本地，冲突文件保存为 `.conflict.md`
- GitHub Actions 自动部署：

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
    paths: ['notes/**', 'site/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: cd site && npm ci && npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          publish_dir: site/dist
```

---

## 5. 非功能需求

| 维度 | 要求 |
|---|---|
| 主窗口冷启 | < 2s |
| 速记窗口呼出 | < 500ms |
| 内存占用 | 空闲 < 150MB（含后台 Astro） |
| 笔记规模 | 支持 10,000+ 条无卡顿 |
| 平台 | Windows / macOS / Linux |
| 离线 | 除 AI / GitHub / 洛谷爬虫外全部离线可用 |
| 数据安全 | Git 历史 + 启动时仓库完整性检查 |

---

## 6. 开发路线图

### Phase 0：脚手架（3-5 天）
- [ ] Tauri 2.0 项目初始化
- [ ] React + Vite + TypeScript + Tailwind + shadcn
- [ ] 基础窗口 + 文件树 + 空编辑器
- [ ] 仓库目录结构 + Git 初始化

**验收**：能打开应用，看到文件树，能点开一个 md 看到内容。

### Phase 1：编辑器核心（1 周）
- [ ] CodeMirror 6 集成（左侧）
- [ ] remark/rehype 渲染管线（右侧）
- [ ] KaTeX + Shiki 配置
- [ ] 滚动同步
- [ ] Frontmatter 折叠编辑器
- [ ] 图片粘贴与存储

**验收**：可以像在洛谷写题解一样写笔记了。

### Phase 2：记录体验闭环（3-5 天）
- [ ] 全局快捷键 + 速记窗口
- [ ] 模板系统
- [ ] 自动 Git commit（保存时）
- [ ] 标签筛选
- [ ] `Ctrl+K` 搜索（SQLite FTS5）

**验收**：可以开始每天用，替代 VS Code 写 md。

### Phase 3：本地博客 + 线上部署（3-5 天）
- [ ] Astro 子项目初始化（定制博客模板）
- [ ] Tauri 启动时后台跑 `astro dev`
- [ ] 状态栏显示 + 一键打开浏览器
- [ ] GitHub Actions 部署配置

**验收**：浏览器打开 localhost:4321 能看到博客，push 后 GitHub Pages 自动更新。

### Phase 4：洛谷爬取（1 周）
- [ ] Cookie 配置界面
- [ ] 提交列表 API 调用
- [ ] 代码详情抓取
- [ ] 注释格式解析
- [ ] 笔记生成逻辑
- [ ] 定时任务 + 失败处理

**验收**：写了 `@oinb-insight` 注释的 AC 代码，同步后能看到对应笔记。

### Phase 5：AI 辅助（1 周）
- [ ] 多 provider 配置界面
- [ ] OpenAI-compatible SDK/provider 适配层
- [ ] Prompt 模板系统
- [ ] 自动打标签 / 摘要 / 润色
- [ ] 关联推荐
- [ ] 本地缓存

**验收**：写完笔记一键打标签，润色工作良好。

### Phase 6：打磨（持续）
- [ ] 主题 / 快捷键自定义
- [ ] 导入现有 md
- [ ] 性能优化
- [ ] 跨平台打包发布

**MVP 预计**：Phase 0-3 合计 3 周左右，到这里就已经可以每天用了。全部功能预计 6-8 周。

---

## 7. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| Tauri 2.0 生态问题 | 开发受阻 | 社区已稳定，文档全；90% 代码在前端，后端可退路到 Node |
| 洛谷反爬升级 | 爬虫失效 | 爬虫模块解耦；兜底提供手动导入 |
| 洛谷 API 变更 | 字段错位 | 抓取结果先存原始 JSON，解析失败不影响存储 |
| AI API 费用超预算 | 持续支出 | 默认便宜模型 + 缓存 + 用户触发 |
| 笔记量大后 Astro 构建慢 | 本地预览卡 | 按时间分页；超过 5000 篇考虑增量构建策略 |
| 个人项目烂尾 | — | 每个 Phase 独立可用，即使停在 Phase 3 也已经替代 VS Code |

---

## 8. 后续可以加但现在不做

- 移动端/PWA
- 博客评论 / 访问统计
- 跨设备实时同步（Git 已经够用）
- 协作编辑
- AI 主动建议（定期扫描 inbox 归档）
- 刷题进度统计看板

