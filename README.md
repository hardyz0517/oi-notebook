# OI Notebook

> 面向 OI 学习的 Markdown 笔记与 NoteX AI 助手桌面工作台。

把题解、笔记、AI 辅助、洛谷导入和本地博客放进一个桌面应用。v1.0.0 是第一个正式可用版本，适合小范围试用、日常笔记工作流和反馈。

[![Release](https://img.shields.io/badge/release-v1.0.0-blue)](https://github.com/hardyz0517/oi-notebook/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows-informational)
![Built with](https://img.shields.io/badge/built%20with-Tauri%20%2F%20React%20%2F%20TypeScript-7c3aed)

**快速入口：**
[下载最新版](https://github.com/hardyz0517/oi-notebook/releases/latest) |
[功能特性](#功能亮点) |
[隐私说明](PRIVACY.md) |
[开发运行](#开发者说明)

## 预览

> 截图待补充：建议放置主界面、NoteX、洛谷导入、本地博客预览四张图。

## 功能亮点

### 笔记与 Markdown

OI Notebook 以本地 Markdown 笔记为核心，提供编辑、预览和文件树管理。适合整理题解、训练复盘、知识点和算法模板。

### NoteX AI 助手

NoteX 可以围绕当前笔记内容辅助总结、润色和整理思路。AI Provider 和 API Key 由用户自行配置，不配置 AI 也可以正常写笔记。

### Research Engine 联网搜索

联网搜索与 Research Engine 用于辅助查找公开资料，并把搜索、证据和引用工作流放进桌面应用中。使用这些能力时，会访问外部搜索或 AI 服务。

### OI / 洛谷增强

针对 OI 和算法竞赛场景做了搜索优化，并提供洛谷题面、题解、讨论读取，以及提交扫描与题解导入能力。洛谷相关功能需要用户按需配置 Cookie / 登录信息。

### 本地博客预览

可以把本地笔记以博客形式预览，方便复盘、阅读和整理公开内容。

### 设置与个性化

支持主题、缩放、AI 配置、洛谷配置等常用设置，尽量把日常学习工作流集中在一个工作台里。

## 下载与安装

前往 [GitHub Releases](https://github.com/hardyz0517/oi-notebook/releases/latest) 下载 v1.0.0。

- 推荐普通用户下载：`oi-notebook_1.0.0_x64-setup.exe`
- MSI 安装包：备用安装方式
- 裸 `oi-notebook.exe`：更适合高级用户或临时测试

Windows 首次运行未签名桌面应用时，可能出现未知发布者或安全提示。这是未签名应用常见情况，请确认来源是本仓库 Release 后再继续。

## 快速开始

1. 下载并安装 `oi-notebook_1.0.0_x64-setup.exe`。
2. 打开 OI Notebook。
3. 新建或选择笔记目录。
4. 如需 AI 能力，配置 AI Provider 和 API Key。
5. 如需洛谷功能，可选配置洛谷 Cookie / 登录信息。
6. 开始写 Markdown 笔记，或打开 NoteX 辅助整理内容。

## 隐私与联网说明

- 笔记默认保存在本地。
- AI 请求会把必要的问题、选中内容、笔记上下文或任务内容发送到用户配置的 AI 服务。
- 联网搜索会把搜索关键词或相关查询发送到公开搜索服务或配置的服务。
- 洛谷 Cookie 只用于用户配置的洛谷相关功能。
- OI Notebook 不读取浏览器 Cookie，也不读取系统登录态。
- 不要在公开 issue、日志或截图中粘贴 API Key、Cookie、私人笔记或其他敏感信息。

更多说明见 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## 开发者说明

安装依赖并启动开发环境：

```powershell
pnpm.cmd install
pnpm.cmd dev
pnpm.cmd tauri dev
```

常用构建命令：

```powershell
pnpm.cmd build
pnpm.cmd --dir local-blog build
pnpm.cmd tauri build
```

Release 前建议检查：

```powershell
pnpm.cmd tsc --noEmit
pnpm.cmd build
pnpm.cmd --dir local-blog build
cargo check --manifest-path .\src-tauri\Cargo.toml
```

## FAQ

### 这只是 IDE 吗？

不是。OI Notebook 更像面向 OI 学习的笔记工作台，重点是 Markdown 笔记、题解整理、AI 辅助和洛谷导入。

### 数据保存在哪里？

笔记默认保存在本地。具体位置取决于你选择或配置的笔记目录。

### 必须配置 AI 才能用吗？

不需要。Markdown 笔记、文件管理和本地博客预览可以独立使用；NoteX 和部分研究辅助能力需要配置 AI Provider。

### 洛谷 Cookie 是必须的吗？

不是。只有使用洛谷题面读取、提交扫描、题解导入等相关能力时才需要按需配置。

### 为什么 Windows 会提示未知发布者？

v1.0.0 发布包尚未进行代码签名。Windows 对未签名桌面应用提示未知发布者是常见情况，请确认安装包来自本仓库 Release。

### 支持 macOS / Linux 吗？

v1.0.0 主要面向 Windows 发布。仓库基于 Tauri 构建，但当前 Release 产物以 Windows 为主。

## Roadmap

后续方向会根据实际使用反馈继续调整，暂不承诺具体时间：

- 更稳定的搜索与引用（目前的联网功能问题较多，仅仅在开发者模式中开放）
- 更好的本地笔记索引
- 更完善的发布包和自动更新
- 更多 OI 学习工作流
- UI 细节继续打磨

## 贡献与反馈

欢迎通过 [GitHub Issues](https://github.com/hardyz0517/oi-notebook/issues) 反馈 bug 或建议。

提交问题时，建议附上版本号、系统环境、复现步骤和必要截图。请不要在 issue 中公开 API Key、Cookie、私人笔记或其他敏感信息。

## 许可证

OI Notebook 使用 [MIT License](LICENSE)。
