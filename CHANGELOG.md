# Changelog

## v1.0.1

### Fixed

- 修复 Markdown 编辑区中文、标点和符号输入首次不生效的问题。
- 移除普通保存流程中的内部 Git 自动提交，避免保存后出现 Git 提交失败提示。
- 修复洛谷导入中心未配置账号时“去设置”按钮无法正确打开配置页的问题。
- 优化未配置 AI Provider 时的洛谷导入预览 Markdown 格式。
- 洛谷导入提交信息改为中文并统一放在文末。
- 洛谷导入默认不再把完整源代码写入笔记，改为由导入选项控制。
- 洛谷导入预览补充题目难度显示，无法获取时显示“未获取”。
- 优化 AI 配置组空状态，没有供应商时只显示“新建供应商”。

### Notes

- Windows 代码签名尚未接入，首次下载运行仍可能出现未知发布者提示；后续需要单独配置有效代码签名证书。

## v1.0.0

- First formally usable release.
- Markdown note editing and preview.
- NoteX AI assistant.
- Research Engine web search.
- OI and Luogu search optimization.
- Luogu submission scanning and solution import.
- Local blog preview.
- Security and stability fixes before the v1.0 release.
