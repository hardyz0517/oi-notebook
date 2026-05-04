//! # 前后端字段命名约定
//!
//! 所有需要跨 IPC 边界传递的结构体都使用 #[serde(rename_all = "camelCase")]，
//! 这样 Rust 侧保持 snake_case 风格，前端 TypeScript 侧也能用惯例的 camelCase，
//! 两边都符合各自语言的代码风格。

use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};

use chrono::{DateTime, Timelike, Utc};
use serde::Serialize;
use walkdir::WalkDir;

use crate::frontmatter;

/// 单个笔记文件的元信息。
/// `Serialize` 使其可以被 Tauri 自动序列化为 JSON 发给前端。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteFileInfo {
    /// 文件名（不含目录），如 "qpow.md"
    pub name: String,
    /// 相对于 notes/ 的路径，统一用正斜杠，如 "tricks/qpow.md" 或 "note.md"（顶层）。
    pub path: String,
    /// ISO 8601 / RFC 3339 格式的最后修改时间，如 "2026-04-24T10:00:00+00:00"
    pub modified: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteAssetResult {
    pub markdown_path: String,
    pub asset_relative_path: String,
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

/// safe_note_path 里绝对路径 / 路径遍历的统一错误消息。
/// 两处检查共用同一段文字，避免修改时漏改其中一处。
const ERR_ABSOLUTE_OR_TRAVERSAL: &str = "包含路径遍历字符或绝对路径前缀";

/// 将用户提供的相对路径安全地解析为 notes/ 下的绝对路径。
///
/// 安全策略（两层防御，缺一不可）：
///
/// **第一层 — 字符串过滤**：标准化分隔符后，拒绝空路径、以 `/` 开头的绝对路径，
/// 并按路径段拒绝 `..` 或 `.`，阻断路径遍历注入。
///
/// **第二层 — 路径前缀校验**：对 notes_dir 调用 `canonicalize`（解析符号链接，
/// 消除冗余分隔符），然后确认目标路径以规范化后的 notes 目录为前缀。
/// `starts_with` 按路径组件比较，不会被 "notes_extra/" 这种共前缀目录欺骗。
///
/// 调用前提：`notes_dir` 必须已存在，否则 `canonicalize` 会失败。
fn safe_note_path(notes_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    // 标准化：统一用正斜杠，防止 Windows 反斜杠绕过后续字符串过滤
    let normalized = relative_path.replace('\\', "/");

    // 第一层防御 ⓪：拒绝空路径（target 会变成 notes 目录本身，导致上层命令行为异常）
    if normalized.is_empty() {
        return Err("非法路径：相对路径不能为空".to_string());
    }

    // 第一层防御 ①：拒绝绝对路径（正斜杠形式，含标准化后的反斜杠绝对路径）
    if normalized.starts_with('/') {
        return Err(format!(
            "非法路径：'{relative_path}' {ERR_ABSOLUTE_OR_TRAVERSAL}"
        ));
    }

    // 第一层防御 ①（深度防御）：对原始字符串保留反斜杠绝对路径检查。
    // 标准化后反斜杠已被替换为正斜杠，上面的 starts_with('/') 理论上已能覆盖。
    // 此处保留是为了防止未来标准化逻辑被修改后产生遗漏——双保险，不要删。
    if relative_path.starts_with('\\') {
        return Err(format!(
            "非法路径：'{relative_path}' {ERR_ABSOLUTE_OR_TRAVERSAL}"
        ));
    }

    // 第一层防御 ②：按路径段拒绝路径遍历。
    // 注意：不用 contains("..") —— 那会误伤 "note..md" 这类合法文件名。
    // 按段检查只拒绝 ".." 整段（真正的向上跳目录语义）和 "." 当前目录引用。
    for segment in normalized.split('/') {
        if segment == ".." || segment == "." {
            return Err(format!("非法路径：'{relative_path}' 包含路径遍历段"));
        }
    }

    // 规范化 notes_dir，得到真实绝对路径（解析符号链接）
    let canonical_notes = notes_dir
        .canonicalize()
        .map_err(|e| format!("无法解析 notes 目录路径：{e}"))?;

    // 从规范化基础路径出发构造目标路径（使用标准化后的正斜杠路径）
    let target = canonical_notes.join(&normalized);

    // 第二层防御：即使第一层字符串过滤全部通过，
    // 这里仍按路径组件（不是字符串前缀）确认目标在 notes/ 之内。
    // 两层防御缺一不可——字符串过滤防快速注入，此层防符号链接等 OS 层绕过。
    if !target.starts_with(&canonical_notes) {
        return Err(format!("路径 '{relative_path}' 越界到 notes 目录之外"));
    }

    Ok(target)
}

fn validate_note_reference_path(notes_dir: &Path, relative_path: &str) -> Result<String, String> {
    let normalized = relative_path.replace('\\', "/");

    if normalized.is_empty() {
        return Err("图片保存失败：当前笔记路径不能为空".to_string());
    }
    if Path::new(&normalized).is_absolute()
        || normalized.starts_with('/')
        || relative_path.starts_with('\\')
    {
        return Err(format!("图片保存失败：非法笔记路径 '{relative_path}'"));
    }
    for segment in normalized.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(format!("图片保存失败：非法笔记路径 '{relative_path}'"));
        }
    }

    let canonical_notes = notes_dir
        .canonicalize()
        .map_err(|e| format!("无法解析 notes 目录路径：{e}"))?;
    let target = canonical_notes.join(&normalized);
    if !target.starts_with(&canonical_notes) {
        return Err(format!(
            "图片保存失败：笔记路径 '{relative_path}' 越界到 notes 目录之外"
        ));
    }

    Ok(normalized)
}

fn image_extension(mime_type: &str) -> Result<&'static str, String> {
    match mime_type {
        "image/png" => Ok("png"),
        "image/jpeg" => Ok("jpg"),
        "image/webp" => Ok("webp"),
        other => Err(format!("图片保存失败：暂不支持的图片类型 {other}")),
    }
}

fn markdown_asset_path(note_relative_path: &str, asset_relative_path: &str) -> String {
    let depth = note_relative_path.split('/').count().saturating_sub(1);
    let prefix = "../".repeat(depth);
    format!("{prefix}{asset_relative_path}")
}

/// 递归列出 notes/ 目录下所有 .md 文件（含子目录），
/// 跳过隐藏目录和隐藏文件（以 '.' 开头），
/// 按最后修改时间降序返回（最近修改的排在最前面）。
///
/// 如果 notes/ 目录不存在，会自动创建，并同时建好四个标准子目录：
/// inbox / tricks / problems / luogu
#[tauri::command]
pub fn list_notes() -> Result<Vec<NoteFileInfo>, String> {
    let notes_dir = get_notes_dir()?;

    // 首次运行时目录可能不存在，自动创建避免报错
    fs::create_dir_all(&notes_dir).map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    // 确保四个标准子目录存在（新克隆仓库的人第一次启动即可看到完整结构）
    for sub in ["inbox", "tricks", "problems", "luogu"] {
        fs::create_dir_all(notes_dir.join(sub))
            .map_err(|e| format!("创建子目录 {sub} 失败：{e}"))?;
    }

    // canonicalize 一次，后续 WalkDir 和 strip_prefix 都用同一份规范化路径，
    // 避免 Windows 上 \\?\ verbatim 前缀不一致导致 strip_prefix 失败。
    let canonical_notes_dir = notes_dir
        .canonicalize()
        .map_err(|e| format!("无法解析 notes 目录路径：{e}"))?;

    let mut notes = Vec::new();

    for entry in WalkDir::new(&canonical_notes_dir)
        .min_depth(1)
        .into_iter()
        // 跳过以 '.' 开头的目录和文件（.git、.oinb、.DS_Store 等）。
        // filter_entry 在 walkdir 内部剪枝：隐藏目录整棵不展开，效率更高。
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'))
    {
        let entry = entry.map_err(|e| format!("遍历目录失败：{e}"))?;
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

        // 计算相对于 canonical_notes_dir 的路径，统一转为正斜杠（Windows 下 PathBuf 用反斜杠）
        let relative = path
            .strip_prefix(&canonical_notes_dir)
            .map_err(|_| format!("无法计算相对路径：{path:?}"))?;
        let path_str = relative
            .to_str()
            .ok_or_else(|| format!("路径包含非 UTF-8 字符：{path:?}"))?
            .replace('\\', "/");

        let metadata =
            fs::metadata(path).map_err(|e| format!("读取文件元数据失败（{name}）：{e}"))?;

        let modified_time = metadata
            .modified()
            .map_err(|e| format!("读取文件修改时间失败（{name}）：{e}"))?;

        // SystemTime → DateTime<Utc> → RFC 3339 字符串（ISO 8601 格式）
        let modified: DateTime<Utc> = modified_time.into();

        notes.push(NoteFileInfo {
            name,
            path: path_str,
            modified: modified.to_rfc3339(),
        });
    }

    // 收集完所有 entry 之后统一排序，不依赖 walkdir 的遍历顺序
    // RFC 3339 字符串均为 UTC、格式固定，可以直接按字典序降序比较
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));

    Ok(notes)
}

/// 读取指定笔记的完整 UTF-8 内容。
///
/// `relative_path`：相对于 notes/ 的路径，如 `"tricks/qpow.md"`
#[tauri::command]
pub fn read_note(relative_path: String) -> Result<String, String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let path = safe_note_path(&notes_dir, &relative_path)?;

    if !path.exists() {
        return Err(format!("笔记不存在：{relative_path}"));
    }

    fs::read_to_string(&path).map_err(|e| format!("读取笔记失败（{relative_path}）：{e}"))
}

/// 覆盖写入指定笔记，写入前自动补全 frontmatter。如果父目录不存在，会自动创建。
///
/// `relative_path`：相对于 notes/ 的路径，如 `"tricks/qpow.md"`
/// `content`：要写入的 UTF-8 Markdown 内容（覆盖，不是追加）
///
/// 返回值：
/// - `Ok(None)`：写入成功，frontmatter 处理正常
/// - `Ok(Some(warning))`：写入成功，但 frontmatter 解析失败（已原样写入）
/// - `Err(...)`：真正的失败（IO 错误、路径非法等）
#[tauri::command]
pub fn write_note(relative_path: String, content: String) -> Result<Option<String>, String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let path = safe_note_path(&notes_dir, &relative_path)?;

    // 支持 "tricks/qpow.md" 这类带子目录的路径——确保父目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建笔记父目录失败：{e}"))?;
    }

    let (final_content, warning) = frontmatter::process_for_write(&content, &relative_path);

    fs::write(&path, final_content.as_bytes())
        .map_err(|e| format!("写入笔记失败（{relative_path}）：{e}"))?;

    Ok(warning)
}

#[tauri::command]
pub fn save_note_asset(
    note_relative_path: String,
    bytes: Vec<u8>,
    mime_type: String,
) -> Result<SaveNoteAssetResult, String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let note_relative_path = validate_note_reference_path(&notes_dir, &note_relative_path)?;
    let extension = image_extension(&mime_type)?;

    let assets_dir = notes_dir.join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| format!("创建 notes/assets 目录失败：{e}"))?;

    let canonical_assets = assets_dir
        .canonicalize()
        .map_err(|e| format!("无法解析 notes/assets 目录路径：{e}"))?;

    let mut saved_filename = None;
    for _ in 0..16 {
        let now = Utc::now();
        let filename = format!(
            "{}-{:09}.{}",
            now.format("%Y%m%d-%H%M%S"),
            now.nanosecond(),
            extension
        );
        let target = canonical_assets.join(&filename);

        if !target.starts_with(&canonical_assets) {
            return Err("图片保存失败：目标路径越界到 notes/assets 目录之外".to_string());
        }

        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(mut file) => {
                file.write_all(&bytes)
                    .map_err(|e| format!("写入图片失败（{filename}）：{e}"))?;
                saved_filename = Some(filename);
                break;
            }
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("写入图片失败（{filename}）：{e}")),
        }
    }

    let filename =
        saved_filename.ok_or_else(|| "图片保存失败：连续生成了重复文件名".to_string())?;

    let asset_relative_path = format!("assets/{filename}");
    let markdown_path = markdown_asset_path(&note_relative_path, &asset_relative_path);

    Ok(SaveNoteAssetResult {
        markdown_path,
        asset_relative_path,
    })
}

/// 删除指定笔记文件。若文件不存在，返回明确的错误信息而非静默忽略。
///
/// `relative_path`：相对于 notes/ 的路径，如 `"tricks/qpow.md"`
#[tauri::command]
pub fn delete_note(relative_path: String) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let path = safe_note_path(&notes_dir, &relative_path)?;

    if !path.exists() {
        return Err(format!("笔记不存在：{relative_path}"));
    }

    fs::remove_file(&path).map_err(|e| format!("删除笔记失败（{relative_path}）：{e}"))
}

/// 重命名笔记文件。原子操作，支持跨子目录移动（目标父目录不存在时自动创建）。
///
/// `old_relative_path`：原相对路径，如 "inbox/note.md"
/// `new_relative_path`：新相对路径，如 "tricks/note.md"
#[tauri::command]
pub fn rename_note(old_relative_path: String, new_relative_path: String) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let old_path = safe_note_path(&notes_dir, &old_relative_path)?;
    let new_path = safe_note_path(&notes_dir, &new_relative_path)?;

    if !old_path.exists() {
        return Err(format!("原笔记不存在：{old_relative_path}"));
    }
    if new_path.exists() {
        return Err(format!("目标文件名已存在：{new_relative_path}"));
    }

    // 支持跨子目录重命名（如 inbox/note.md → tricks/note.md）——确保目标父目录存在
    if let Some(parent) = new_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建笔记父目录失败：{e}"))?;
    }

    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("重命名笔记失败（{old_relative_path} → {new_relative_path}）：{e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    // ── safe_note_path 拒绝用例 ──────────────────────────────────────────────

    #[test]
    fn reject_parent_traversal() {
        let dir = tempdir().unwrap();
        assert!(safe_note_path(dir.path(), "../etc/passwd").is_err());
    }

    #[test]
    fn reject_nested_traversal() {
        let dir = tempdir().unwrap();
        assert!(safe_note_path(dir.path(), "tricks/../../escape.md").is_err());
    }

    #[test]
    fn reject_absolute_unix() {
        let dir = tempdir().unwrap();
        assert!(safe_note_path(dir.path(), "/absolute/path.md").is_err());
    }

    #[test]
    fn reject_absolute_windows() {
        let dir = tempdir().unwrap();
        assert!(safe_note_path(dir.path(), "\\windows\\path.md").is_err());
    }

    #[test]
    fn reject_empty_path() {
        let dir = tempdir().unwrap();
        assert!(safe_note_path(dir.path(), "").is_err());
    }

    // ── safe_note_path 接受用例 ──────────────────────────────────────────────

    #[test]
    fn accept_nested_path() {
        let dir = tempdir().unwrap();
        assert!(safe_note_path(dir.path(), "tricks/qpow.md").is_ok());
    }

    #[test]
    fn accept_inbox_path() {
        let dir = tempdir().unwrap();
        assert!(safe_note_path(dir.path(), "inbox/quick-2026-04-26.md").is_ok());
    }

    #[test]
    fn accept_toplevel_path() {
        let dir = tempdir().unwrap();
        assert!(safe_note_path(dir.path(), "note.md").is_ok());
    }

    #[test]
    fn safe_path_does_not_require_target_exists() {
        let dir = tempdir().unwrap();
        // tricks/ 子目录不存在也应返回 Ok（safe_note_path 只做校验，不要求目标存在）
        let result = safe_note_path(dir.path(), "tricks/qpow.md").unwrap();
        assert!(!result.exists());
    }
}
