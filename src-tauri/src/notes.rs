//! # 前后端字段命名约定
//!
//! 所有需要跨 IPC 边界传递的结构体都使用 #[serde(rename_all = "camelCase")]，
//! 这样 Rust 侧保持 snake_case 风格，前端 TypeScript 侧也能用惯例的 camelCase，
//! 两边都符合各自语言的代码风格。

use std::{
    fs,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use serde::Serialize;

/// 单个笔记文件的元信息。
/// `Serialize` 使其可以被 Tauri 自动序列化为 JSON 发给前端。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFileInfo {
    /// 文件名（不含目录），如 "qpow.md"
    pub name: String,
    /// 相对于 notes/ 的路径，如 "qpow.md"。
    /// 当前只扫一层，path == name；未来支持子目录后会不同（如 "tricks/qpow.md"）。
    pub path: String,
    /// ISO 8601 / RFC 3339 格式的最后修改时间，如 "2026-04-24T10:00:00+00:00"
    pub modified: String,
}

/// 返回 notes 目录的绝对 PathBuf。
///
/// 使用编译期宏 `env!("CARGO_MANIFEST_DIR")` 定位 src-tauri/（Cargo.toml 所在处），
/// 向上一级即为项目根，再拼接 "notes"。
///
/// 这在 `cargo tauri dev`（cwd 不固定）和 `cargo check`（cwd = src-tauri/）下均可靠。
///
/// TODO: 生产分发版本应改用 `tauri::Manager::path().app_data_dir()` 获取
/// 平台标准的应用数据目录，而不是依赖编译时的源码树路径。
fn get_notes_dir() -> Result<PathBuf, String> {
    // CARGO_MANIFEST_DIR 在编译时由 Cargo 写入，值为 src-tauri/ 的绝对路径
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    // .parent() 得到项目根目录（src-tauri/ 的上一级）
    let project_root = manifest_dir
        .parent()
        .ok_or_else(|| "无法从 CARGO_MANIFEST_DIR 获取项目根目录".to_string())?;

    Ok(project_root.join("notes"))
}

/// 将用户提供的相对路径安全地解析为 notes/ 下的绝对路径。
///
/// 安全策略（两层防御，缺一不可）：
///
/// **第一层 — 字符串过滤**：拒绝包含 ".." 或以分隔符开头的路径，
/// 快速阻断 "../../etc/passwd" 或 "/etc/passwd" 形式的注入。
///
/// **第二层 — 路径前缀校验**：对 notes_dir 调用 `canonicalize`（解析符号链接，
/// 消除冗余分隔符），然后确认目标路径以规范化后的 notes 目录为前缀。
/// `starts_with` 按路径组件比较，不会被 "notes_extra/" 这种共前缀目录欺骗。
///
/// 调用前提：`notes_dir` 必须已存在，否则 `canonicalize` 会失败。
fn safe_note_path(notes_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    // 第一层防御：拒绝路径遍历和绝对路径注入
    if relative_path.contains("..")
        || relative_path.starts_with('/')
        || relative_path.starts_with('\\')
    {
        return Err(format!(
            "非法路径：'{relative_path}' 包含路径遍历字符或绝对路径前缀"
        ));
    }

    // 规范化 notes_dir，得到真实绝对路径（解析符号链接）
    let canonical_notes = notes_dir
        .canonicalize()
        .map_err(|e| format!("无法解析 notes 目录路径：{e}"))?;

    // 从规范化基础路径出发构造目标路径
    let target = canonical_notes.join(relative_path);

    // 第二层防御：按路径组件确认目标在 notes/ 内
    if !target.starts_with(&canonical_notes) {
        return Err(format!(
            "路径 '{relative_path}' 越界到 notes 目录之外"
        ));
    }

    Ok(target)
}

/// 列出 notes/ 目录下所有 .md 文件（只扫一层，不递归子目录），
/// 按最后修改时间降序返回（最近修改的排在最前面）。
///
/// 如果 notes/ 目录不存在，会自动创建。
#[tauri::command]
pub fn list_notes() -> Result<Vec<NoteFileInfo>, String> {
    let notes_dir = get_notes_dir()?;

    // 首次运行时目录可能不存在，自动创建避免报错
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let mut notes = Vec::new();

    for entry in fs::read_dir(&notes_dir).map_err(|e| format!("读取 notes 目录失败：{e}"))? {
        let entry = entry.map_err(|e| format!("遍历目录条目失败：{e}"))?;
        let path = entry.path();

        // 只处理普通 .md 文件，跳过子目录和其它扩展名的文件
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| format!("文件名包含非 UTF-8 字符：{path:?}"))?
            .to_string();

        let metadata =
            fs::metadata(&path).map_err(|e| format!("读取文件元数据失败（{name}）：{e}"))?;

        let modified_time = metadata
            .modified()
            .map_err(|e| format!("读取文件修改时间失败（{name}）：{e}"))?;

        // SystemTime → DateTime<Utc> → RFC 3339 字符串（ISO 8601 格式）
        let modified: DateTime<Utc> = modified_time.into();

        notes.push(NoteFileInfo {
            path: name.clone(), // 当前单层目录，path == name
            name,
            modified: modified.to_rfc3339(),
        });
    }

    // RFC 3339 字符串均为 UTC、格式固定，可以直接按字典序降序比较
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));

    Ok(notes)
}

/// 读取指定笔记的完整 UTF-8 内容。
///
/// `relative_path`：相对于 notes/ 的路径，如 `"qpow.md"`
#[tauri::command]
pub fn read_note(relative_path: String) -> Result<String, String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let path = safe_note_path(&notes_dir, &relative_path)?;

    if !path.exists() {
        return Err(format!("笔记不存在：{relative_path}"));
    }

    fs::read_to_string(&path)
        .map_err(|e| format!("读取笔记失败（{relative_path}）：{e}"))
}

/// 覆盖写入指定笔记。如果父目录不存在，会自动创建。
///
/// `relative_path`：相对于 notes/ 的路径，如 `"tricks/qpow.md"`
/// `content`：要写入的 UTF-8 Markdown 内容（覆盖，不是追加）
#[tauri::command]
pub fn write_note(relative_path: String, content: String) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let path = safe_note_path(&notes_dir, &relative_path)?;

    // 支持 "tricks/qpow.md" 这类带子目录的路径——确保父目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建笔记父目录失败：{e}"))?;
    }

    fs::write(&path, content.as_bytes())
        .map_err(|e| format!("写入笔记失败（{relative_path}）：{e}"))
}

/// 删除指定笔记文件。若文件不存在，返回明确的错误信息而非静默忽略。
///
/// `relative_path`：相对于 notes/ 的路径，如 `"qpow.md"`
#[tauri::command]
pub fn delete_note(relative_path: String) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let path = safe_note_path(&notes_dir, &relative_path)?;

    if !path.exists() {
        return Err(format!("笔记不存在：{relative_path}"));
    }

    fs::remove_file(&path)
        .map_err(|e| format!("删除笔记失败（{relative_path}）：{e}"))
}

/// 重命名笔记文件。原子操作，保留文件创建时间。
///
/// `old_relative_path`：原相对路径，如 "qpow.md"
/// `new_relative_path`：新相对路径，如 "fast-pow.md"
#[tauri::command]
pub fn rename_note(old_relative_path: String, new_relative_path: String) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let old_path = safe_note_path(&notes_dir, &old_relative_path)?;
    let new_path = safe_note_path(&notes_dir, &new_relative_path)?;

    if !old_path.exists() {
        return Err(format!("原笔记不存在：{old_relative_path}"));
    }
    if new_path.exists() {
        return Err(format!("目标文件名已存在：{new_relative_path}"));
    }

    if let Some(parent) = new_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建笔记父目录失败：{e}"))?;
    }

    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("重命名笔记失败（{old_relative_path} → {new_relative_path}）：{e}"))
}
