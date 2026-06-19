//! # 前后端字段命名约定
//!
//! 所有需要跨 IPC 边界传递的结构体都使用 #[serde(rename_all = "camelCase")]，
//! 这样 Rust 侧保持 snake_case 风格，前端 TypeScript 侧也能用惯例的 camelCase，
//! 两边都符合各自语言的代码风格。

use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Component, Path, PathBuf},
};

use chrono::{DateTime, Duration, Timelike, Utc};
use serde::Serialize;
use serde_yaml::{Mapping, Value};
use walkdir::WalkDir;

use crate::{frontmatter, paths};

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
    pub is_directory: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteAssetResult {
    pub markdown_path: String,
    pub asset_relative_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownSavePathClassification {
    pub kind: String,
    pub relative_path: Option<String>,
    pub absolute_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSearchResult {
    pub path: String,
    pub title: String,
    pub date: String,
    pub tags: Vec<String>,
    pub summary: String,
    pub excerpt: String,
}

#[derive(Debug)]
struct ResolvedNoteAsset {
    path: PathBuf,
    mime_type: &'static str,
}

#[derive(Debug, Default)]
struct SearchFrontmatter {
    title: String,
    tags: Vec<String>,
    source: String,
    summary: String,
    created: Option<DateTime<Utc>>,
    updated: Option<DateTime<Utc>>,
}

#[derive(Debug)]
struct SearchNote {
    path: String,
    body: String,
    modified: DateTime<Utc>,
    frontmatter: SearchFrontmatter,
}

#[derive(Debug, Default)]
struct ParsedSearchQuery {
    terms: Vec<String>,
    tags: Vec<String>,
    sources: Vec<String>,
    recent: bool,
}

fn get_notes_dir() -> Result<PathBuf, String> {
    paths::notes_dir()
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

fn has_windows_invalid_char(value: &str) -> bool {
    value
        .chars()
        .any(|ch| matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'))
}

fn validate_note_relative_path(relative_path: &str, expect_file: bool) -> Result<String, String> {
    let normalized = relative_path.trim().replace('\\', "/");
    if normalized.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if Path::new(&normalized).is_absolute()
        || normalized.starts_with('/')
        || relative_path.trim().starts_with('\\')
    {
        return Err(format!("Invalid path: {relative_path} cannot be absolute"));
    }

    let mut segments = Vec::new();
    for segment in normalized.split('/') {
        if segment.trim().is_empty() {
            return Err(format!("Invalid path: {relative_path} contains an empty segment"));
        }
        if segment == "." || segment == ".." || segment.contains("..") {
            return Err(format!("Invalid path: {relative_path} contains traversal"));
        }
        if has_windows_invalid_char(segment) {
            return Err(format!("Invalid name: {segment} contains Windows-invalid characters"));
        }
        segments.push(segment);
    }

    if expect_file && !normalized.to_ascii_lowercase().ends_with(".md") {
        return Err("Note file path must end with .md".to_string());
    }

    Ok(segments.join("/"))
}

fn validate_note_file_path(relative_path: &str) -> Result<String, String> {
    validate_note_relative_path(relative_path, true)
}

fn validate_note_folder_path(relative_path: &str) -> Result<String, String> {
    let normalized = validate_note_relative_path(relative_path, false)?;
    if normalized.to_ascii_lowercase().ends_with(".md") {
        return Err("Folder name cannot end with .md".to_string());
    }
    Ok(normalized)
}

fn normalize_absolute_path_text(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(|value| value.to_string())
        .ok_or_else(|| format!("Path contains non-UTF-8 characters: {path:?}"))
}

fn normalize_relative_path_text(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(|value| value.replace('\\', "/"))
        .ok_or_else(|| format!("Path contains non-UTF-8 characters: {path:?}"))
}

fn case_fold_path(value: &Path) -> String {
    value.to_string_lossy().replace('\\', "/").to_lowercase()
}

fn case_fold_name(value: &str) -> String {
    value.to_lowercase()
}

fn find_case_insensitive_child(parent: &Path, name: &str) -> Result<Option<PathBuf>, String> {
    if !parent.exists() {
        return Ok(None);
    }

    let wanted = case_fold_name(name);
    for entry in fs::read_dir(parent)
        .map_err(|e| format!("Failed to read directory {}: {e}", parent.display()))?
    {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {e}"))?;
        let entry_name = entry.file_name().to_string_lossy().to_string();
        if case_fold_name(&entry_name) == wanted {
            return Ok(Some(entry.path()));
        }
    }

    Ok(None)
}

fn ensure_case_insensitive_available(
    target_path: &Path,
    original_path: Option<&Path>,
) -> Result<(), String> {
    let parent = target_path
        .parent()
        .ok_or_else(|| "Target path has no parent".to_string())?;
    let name = target_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Target name is not valid UTF-8".to_string())?;

    if let Some(existing) = find_case_insensitive_child(parent, name)? {
        if let Some(original) = original_path {
            if case_fold_path(&existing) == case_fold_path(original) {
                return Ok(());
            }
        }
        return Err(format!("A same-name item already exists in this directory: {name}"));
    }

    Ok(())
}

fn rename_path_case_safe(old_path: &Path, new_path: &Path) -> Result<(), String> {
    if case_fold_path(old_path) == case_fold_path(new_path) && old_path != new_path {
        let parent = old_path
            .parent()
            .ok_or_else(|| "Original path has no parent".to_string())?;
        let original_name = old_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Original name is not valid UTF-8".to_string())?;
        let mut temp_path = parent.join(format!(".oinb-rename-{original_name}.tmp"));
        let mut counter = 0_u32;
        while temp_path.exists() {
            counter += 1;
            temp_path = parent.join(format!(".oinb-rename-{counter}-{original_name}.tmp"));
        }
        fs::rename(old_path, &temp_path)
            .map_err(|e| format!("Failed to rename through temporary path: {e}"))?;
        return fs::rename(&temp_path, new_path)
            .map_err(|e| format!("Failed to finish case-only rename: {e}"));
    }

    fs::rename(old_path, new_path).map_err(|e| format!("Rename failed: {e}"))
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

fn image_mime_type(path: &Path) -> Result<&'static str, String> {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("png") => Ok("image/png"),
        Some("jpg") | Some("jpeg") => Ok("image/jpeg"),
        Some("webp") => Ok("image/webp"),
        _ => Err("图片预览失败：仅支持 png/jpg/webp 图片".to_string()),
    }
}

fn normalize_relative_image_src(image_src: &str) -> Result<String, String> {
    let normalized = image_src.replace('\\', "/");
    let lower = normalized.to_ascii_lowercase();

    if normalized.is_empty()
        || normalized.starts_with('/')
        || image_src.starts_with('\\')
        || Path::new(&normalized).is_absolute()
        || lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
        || lower.starts_with("file:")
        || lower.starts_with("asset:")
        || normalized.contains('?')
        || normalized.contains('#')
    {
        return Err(format!("图片预览失败：不支持的图片路径 '{image_src}'"));
    }

    Ok(normalized)
}

fn resolve_note_asset_path(
    notes_dir: &Path,
    note_relative_path: &str,
    image_src: &str,
) -> Result<ResolvedNoteAsset, String> {
    let note_relative_path = validate_note_reference_path(notes_dir, note_relative_path)?;
    let image_src = normalize_relative_image_src(image_src)?;

    let canonical_notes = notes_dir
        .canonicalize()
        .map_err(|e| format!("无法解析 notes 目录路径：{e}"))?;

    let assets_dir = canonical_notes.join("assets");
    let canonical_assets = assets_dir
        .canonicalize()
        .map_err(|e| format!("无法解析 notes/assets 目录路径：{e}"))?;

    let note_dir = Path::new(&note_relative_path)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let base_dir = canonical_notes.join(note_dir);
    let candidate = base_dir.join(Path::new(&image_src));

    let mut resolved = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::Prefix(prefix) => resolved.push(prefix.as_os_str()),
            Component::RootDir => resolved.push(component.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                resolved.pop();
            }
            Component::Normal(segment) => resolved.push(segment),
        }
    }

    if !resolved.starts_with(&canonical_assets) {
        return Err(format!(
            "图片预览失败：图片路径 '{image_src}' 不在 notes/assets/ 下"
        ));
    }

    let canonical_target = resolved
        .canonicalize()
        .map_err(|e| format!("图片预览失败：无法读取图片 '{image_src}'：{e}"))?;
    if !canonical_target.starts_with(&canonical_assets) {
        return Err(format!(
            "图片预览失败：图片路径 '{image_src}' 越界到 notes/assets/ 之外"
        ));
    }
    if !canonical_target.is_file() {
        return Err(format!("图片预览失败：图片不存在 '{image_src}'"));
    }

    let mime_type = image_mime_type(&canonical_target)?;

    Ok(ResolvedNoteAsset {
        path: canonical_target,
        mime_type,
    })
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut encoded = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = *chunk.get(1).unwrap_or(&0);
        let b2 = *chunk.get(2).unwrap_or(&0);

        encoded.push(TABLE[(b0 >> 2) as usize] as char);
        encoded.push(TABLE[(((b0 & 0b0000_0011) << 4) | (b1 >> 4)) as usize] as char);

        if chunk.len() > 1 {
            encoded.push(TABLE[(((b1 & 0b0000_1111) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            encoded.push('=');
        }

        if chunk.len() > 2 {
            encoded.push(TABLE[(b2 & 0b0011_1111) as usize] as char);
        } else {
            encoded.push('=');
        }
    }

    encoded
}

fn yaml_string(mapping: &Mapping, key: &str) -> String {
    mapping
        .get(Value::String(key.to_string()))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string()
}

fn yaml_tags(mapping: &Mapping) -> Vec<String> {
    mapping
        .get(Value::String("tags".to_string()))
        .and_then(Value::as_sequence)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|tag| !tag.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn parse_yaml_datetime(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|datetime| datetime.with_timezone(&Utc))
}

fn parse_search_frontmatter(yaml: &str) -> SearchFrontmatter {
    let Ok(Value::Mapping(mapping)) = serde_yaml::from_str::<Value>(yaml) else {
        return SearchFrontmatter::default();
    };

    let created = parse_yaml_datetime(&yaml_string(&mapping, "created"));
    let updated = parse_yaml_datetime(&yaml_string(&mapping, "updated"));

    SearchFrontmatter {
        title: yaml_string(&mapping, "title"),
        tags: yaml_tags(&mapping),
        source: yaml_string(&mapping, "source"),
        summary: yaml_string(&mapping, "summary"),
        created,
        updated,
    }
}

fn split_search_frontmatter(content: &str) -> (SearchFrontmatter, String) {
    let after_open = if content.starts_with("---\r\n") {
        &content[5..]
    } else if content.starts_with("---\n") {
        &content[4..]
    } else {
        return (SearchFrontmatter::default(), content.to_string());
    };

    let bytes = after_open.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\n' {
            let rest = &bytes[i + 1..];
            if rest.starts_with(b"---\r\n") {
                return (
                    parse_search_frontmatter(&after_open[..i]),
                    after_open[i + 6..].to_string(),
                );
            }
            if rest.starts_with(b"---\n") {
                return (
                    parse_search_frontmatter(&after_open[..i]),
                    after_open[i + 5..].to_string(),
                );
            }
            if rest == b"---" || rest == b"---\r" {
                return (parse_search_frontmatter(&after_open[..i]), String::new());
            }
        }
        i += 1;
    }

    (SearchFrontmatter::default(), content.to_string())
}

fn parse_search_query(query: &str) -> ParsedSearchQuery {
    let mut parsed = ParsedSearchQuery::default();

    for raw in query.split_whitespace() {
        let token = raw.trim();
        if token.is_empty() {
            continue;
        }

        if token.eq_ignore_ascii_case("@recent") {
            parsed.recent = true;
        } else if let Some(tag) = token.strip_prefix("tag:") {
            if !tag.trim().is_empty() {
                parsed.tags.push(tag.trim().to_lowercase());
            }
        } else if let Some(source) = token.strip_prefix("source:") {
            if !source.trim().is_empty() {
                parsed.sources.push(source.trim().to_lowercase());
            }
        } else {
            parsed.terms.push(token.to_lowercase());
        }
    }

    parsed
}

fn best_note_date(note: &SearchNote) -> DateTime<Utc> {
    note.frontmatter
        .updated
        .or(note.frontmatter.created)
        .unwrap_or(note.modified)
}

fn is_recent(note: &SearchNote, now: DateTime<Utc>) -> bool {
    best_note_date(note) >= now - Duration::days(7)
}

fn fallback_title(path: &str) -> String {
    path.rsplit('/')
        .next()
        .unwrap_or(path)
        .strip_suffix(".md")
        .unwrap_or_else(|| path.rsplit('/').next().unwrap_or(path))
        .to_string()
}

fn contains_lower(haystack: &str, needle: &str) -> bool {
    haystack.to_lowercase().contains(needle)
}

fn score_search_note(
    note: &SearchNote,
    query: &ParsedSearchQuery,
    now: DateTime<Utc>,
) -> Option<i64> {
    if query.recent && !is_recent(note, now) {
        return None;
    }

    for tag in &query.tags {
        if !note
            .frontmatter
            .tags
            .iter()
            .any(|candidate| candidate.to_lowercase().contains(tag))
        {
            return None;
        }
    }

    for source in &query.sources {
        if !note.frontmatter.source.to_lowercase().contains(source) {
            return None;
        }
    }

    let title = if note.frontmatter.title.is_empty() {
        fallback_title(&note.path)
    } else {
        note.frontmatter.title.clone()
    };

    let mut score = 0_i64;

    for term in &query.terms {
        let mut matched = false;

        if contains_lower(&title, term) {
            score += 100;
            matched = true;
        }
        if note
            .frontmatter
            .tags
            .iter()
            .any(|tag| contains_lower(tag, term))
            || contains_lower(&note.frontmatter.source, term)
        {
            score += 60;
            matched = true;
        }
        if contains_lower(&note.frontmatter.summary, term) || contains_lower(&note.path, term) {
            score += 40;
            matched = true;
        }
        if contains_lower(&note.body, term) {
            score += 10;
            matched = true;
        }

        if !matched {
            return None;
        }
    }

    if query.terms.is_empty() && query.tags.is_empty() && query.sources.is_empty() && !query.recent
    {
        score += 1;
    }

    let age_hours = (now - best_note_date(note)).num_hours().max(0);
    score += (168 - age_hours).clamp(0, 168) / 24;

    Some(score)
}

fn make_excerpt(note: &SearchNote, query: &ParsedSearchQuery) -> String {
    let body = note
        .body
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    let source = query
        .terms
        .iter()
        .find_map(|term| {
            body.lines()
                .find(|line| line.to_lowercase().contains(term))
                .map(ToString::to_string)
        })
        .unwrap_or(body);

    source.chars().take(120).collect()
}

fn search_notes_in_dir(notes_dir: &Path, query: &str) -> Result<Vec<NoteSearchResult>, String> {
    fs::create_dir_all(notes_dir).map_err(|e| format!("创建 notes 目录失败: {e}"))?;

    let canonical_notes_dir = notes_dir
        .canonicalize()
        .map_err(|e| format!("无法解析 notes 目录路径: {e}"))?;

    let parsed_query = parse_search_query(query);
    let now = Utc::now();
    let mut scored = Vec::new();

    for entry in WalkDir::new(&canonical_notes_dir)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'))
    {
        let entry = entry.map_err(|e| format!("遍历 notes 目录失败: {e}"))?;
        let path = entry.path();

        let relative = path
            .strip_prefix(&canonical_notes_dir)
            .map_err(|_| format!("无法计算相对路径: {path:?}"))?;
        let path_str = relative
            .to_str()
            .ok_or_else(|| format!("路径包含非 UTF-8 字符: {path:?}"))?
            .replace('\\', "/");

        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }

        let content =
            fs::read_to_string(path).map_err(|e| format!("读取笔记失败 ({path_str}): {e}"))?;
        let metadata =
            fs::metadata(path).map_err(|e| format!("读取文件元数据失败 ({path_str}): {e}"))?;
        let modified_time = metadata
            .modified()
            .map_err(|e| format!("读取文件修改时间失败 ({path_str}): {e}"))?;
        let modified: DateTime<Utc> = modified_time.into();
        let (frontmatter, body) = split_search_frontmatter(&content);
        let note = SearchNote {
            path: path_str,
            body,
            modified,
            frontmatter,
        };

        if let Some(score) = score_search_note(&note, &parsed_query, now) {
            scored.push((score, best_note_date(&note), note));
        }
    }

    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| b.1.cmp(&a.1))
            .then_with(|| a.2.path.cmp(&b.2.path))
    });

    Ok(scored
        .into_iter()
        .take(20)
        .map(|(_, date, note)| {
            let excerpt = make_excerpt(&note, &parsed_query);
            let title = if note.frontmatter.title.is_empty() {
                fallback_title(&note.path)
            } else {
                note.frontmatter.title
            };
            let summary = note.frontmatter.summary;

            NoteSearchResult {
                path: note.path,
                title,
                date: date.to_rfc3339(),
                tags: note.frontmatter.tags,
                summary,
                excerpt,
            }
        })
        .collect())
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

    paths::ensure_data_dirs()?;

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
        let is_directory = path.is_dir();
        if !is_directory && (!path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("md")) {
            continue;
        }
        if is_directory && path.file_name().and_then(|n| n.to_str()) == Some("assets") {
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
            is_directory,
        });
    }

    // 收集完所有 entry 之后统一排序，不依赖 walkdir 的遍历顺序
    // RFC 3339 字符串均为 UTC、格式固定，可以直接按字典序降序比较
    notes.sort_by(|a, b| b.modified.cmp(&a.modified));

    Ok(notes)
}

#[tauri::command]
pub fn search_notes(query: String) -> Result<Vec<NoteSearchResult>, String> {
    let notes_dir = get_notes_dir()?;
    search_notes_in_dir(&notes_dir, &query)
}

/// 读取指定笔记的完整 UTF-8 内容。
///
/// `relative_path`：相对于 notes/ 的路径，如 `"tricks/qpow.md"`
#[tauri::command]
pub fn read_note(relative_path: String) -> Result<String, String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let relative_path = validate_note_file_path(&relative_path)?;

    let path = safe_note_path(&notes_dir, &relative_path)?;

    if !path.exists() {
        return Err(format!("笔记不存在：{relative_path}"));
    }

    fs::read_to_string(&path).map_err(|e| format!("读取笔记失败（{relative_path}）：{e}"))
}

#[tauri::command]
pub fn get_notes_root_path() -> Result<String, String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;
    let canonical_notes = notes_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve notes directory path: {e}"))?;

    normalize_absolute_path_text(&canonical_notes)
}

#[tauri::command]
pub fn classify_markdown_save_path(
    absolute_path: String,
) -> Result<MarkdownSavePathClassification, String> {
    let target_path = PathBuf::from(&absolute_path);
    if !target_path.is_absolute() {
        return Err("Markdown save path must be absolute".to_string());
    }

    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;
    let canonical_notes = notes_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve notes directory path: {e}"))?;

    let parent = target_path
        .parent()
        .ok_or_else(|| "Markdown save path must have a parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create markdown save parent directory: {e}"))?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|e| format!("Failed to resolve markdown save parent directory: {e}"))?;
    let file_name = target_path
        .file_name()
        .ok_or_else(|| "Markdown save path must include a file name".to_string())?;
    let canonical_target = canonical_parent.join(file_name);
    let absolute_path = normalize_absolute_path_text(&canonical_target)?;

    if canonical_target.starts_with(&canonical_notes) {
        let relative = canonical_target
            .strip_prefix(&canonical_notes)
            .map_err(|_| "Failed to calculate note-relative save path".to_string())?;
        let relative_path = normalize_relative_path_text(relative)?;
        let relative_path = validate_note_file_path(&relative_path)?;

        return Ok(MarkdownSavePathClassification {
            kind: "note".to_string(),
            relative_path: Some(relative_path),
            absolute_path,
        });
    }

    Ok(MarkdownSavePathClassification {
        kind: "external".to_string(),
        relative_path: None,
        absolute_path,
    })
}

#[tauri::command]
pub fn write_external_markdown_file(absolute_path: String, content: String) -> Result<(), String> {
    let target_path = PathBuf::from(&absolute_path);
    if !target_path.is_absolute() {
        return Err("Markdown file path must be absolute".to_string());
    }
    if target_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
        != Some("md")
    {
        return Err("External markdown file path must end with .md".to_string());
    }

    let parent = target_path
        .parent()
        .ok_or_else(|| "Markdown file path must have a parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("Failed to create external markdown parent directory: {e}"))?;

    fs::write(&target_path, content.as_bytes())
        .map_err(|e| format!("Failed to write external markdown file: {e}"))
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

    let relative_path = validate_note_file_path(&relative_path)?;

    let path = safe_note_path(&notes_dir, &relative_path)?;
    if !path.exists() {
        ensure_case_insensitive_available(&path, None)?;
    }

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

#[tauri::command]
pub fn resolve_note_asset_url(
    note_relative_path: String,
    image_src: String,
) -> Result<String, String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let resolved = resolve_note_asset_path(&notes_dir, &note_relative_path, &image_src)?;
    let bytes = fs::read(&resolved.path).map_err(|e| {
        format!(
            "图片预览失败：读取图片失败（{}）：{e}",
            resolved.path.display()
        )
    })?;

    Ok(format!(
        "data:{};base64,{}",
        resolved.mime_type,
        base64_encode(&bytes)
    ))
}

/// 删除指定笔记文件。若文件不存在，返回明确的错误信息而非静默忽略。
///
/// `relative_path`：相对于 notes/ 的路径，如 `"tricks/qpow.md"`
#[tauri::command]
pub fn delete_note(relative_path: String) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("创建 notes 目录失败：{e}"))?;

    let relative_path = validate_note_file_path(&relative_path)?;

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
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;

    let old_relative_path = validate_note_file_path(&old_relative_path)?;
    let new_relative_path = validate_note_file_path(&new_relative_path)?;
    let old_path = safe_note_path(&notes_dir, &old_relative_path)?;
    let new_path = safe_note_path(&notes_dir, &new_relative_path)?;

    if old_relative_path == new_relative_path {
        return Ok(());
    }
    if !old_path.exists() {
        return Err(format!("Original note does not exist: {old_relative_path}"));
    }
    ensure_case_insensitive_available(&new_path, Some(&old_path))?;

    if let Some(parent) = new_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create note parent directory: {e}"))?;
    }

    rename_path_case_safe(&old_path, &new_path)
        .map_err(|e| format!("Rename note failed ({old_relative_path} -> {new_relative_path}): {e}"))
}

#[tauri::command]
pub fn create_note_folder(relative_path: String) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;

    let relative_path = validate_note_folder_path(&relative_path)?;
    let path = safe_note_path(&notes_dir, &relative_path)?;
    ensure_case_insensitive_available(&path, None)?;

    fs::create_dir_all(&path)
        .map_err(|e| format!("Create folder failed ({relative_path}): {e}"))
}

#[tauri::command]
pub fn rename_note_folder(old_relative_path: String, new_relative_path: String) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;

    let old_relative_path = validate_note_folder_path(&old_relative_path)?;
    let new_relative_path = validate_note_folder_path(&new_relative_path)?;
    let old_path = safe_note_path(&notes_dir, &old_relative_path)?;
    let new_path = safe_note_path(&notes_dir, &new_relative_path)?;

    if old_relative_path == new_relative_path {
        return Ok(());
    }
    if !old_path.is_dir() {
        return Err(format!("Original folder does not exist: {old_relative_path}"));
    }
    ensure_case_insensitive_available(&new_path, Some(&old_path))?;

    if let Some(parent) = new_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create target parent folder: {e}"))?;
    }

    rename_path_case_safe(&old_path, &new_path)
        .map_err(|e| format!("Rename folder failed ({old_relative_path} -> {new_relative_path}): {e}"))
}

#[tauri::command]
pub fn delete_note_folder(relative_path: String) -> Result<(), String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;

    let relative_path = validate_note_folder_path(&relative_path)?;
    let path = safe_note_path(&notes_dir, &relative_path)?;

    if !path.is_dir() {
        return Err(format!("Folder does not exist: {relative_path}"));
    }

    fs::remove_dir_all(&path)
        .map_err(|e| format!("Delete folder failed ({relative_path}): {e}"))
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

    #[test]
    fn resolve_asset_from_nested_note() {
        let dir = tempdir().unwrap();
        let assets_dir = dir.path().join("assets");
        fs::create_dir_all(&assets_dir).unwrap();
        fs::write(assets_dir.join("paste.png"), [1_u8, 2, 3]).unwrap();

        let resolved =
            resolve_note_asset_path(dir.path(), "luogu/P/foo.md", "../../assets/paste.png")
                .unwrap();

        assert!(resolved.path.ends_with("assets/paste.png"));
        assert_eq!(resolved.mime_type, "image/png");
    }

    #[test]
    fn reject_resolved_image_outside_assets() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("assets")).unwrap();
        fs::create_dir_all(dir.path().join("tricks")).unwrap();
        fs::write(dir.path().join("tricks/local.png"), [1_u8]).unwrap();

        assert!(resolve_note_asset_path(dir.path(), "tricks/foo.md", "local.png").is_err());
    }

    #[test]
    fn base64_encode_pads_short_chunks() {
        assert_eq!(base64_encode(&[1]), "AQ==");
        assert_eq!(base64_encode(&[1, 2]), "AQI=");
        assert_eq!(base64_encode(&[1, 2, 3]), "AQID");
    }

    #[test]
    fn search_finds_title_tags_summary_source_and_body() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("tricks")).unwrap();
        fs::write(
            dir.path().join("tricks/dp.md"),
            concat!(
                "---\n",
                "title: 区间 DP\n",
                "tags: [DP, 区间]\n",
                "source: luogu-P1000\n",
                "summary: 合并石子模型\n",
                "created: 2026-05-01T00:00:00+00:00\n",
                "updated: 2026-05-02T00:00:00+00:00\n",
                "---\n",
                "四边形不等式优化\n",
            ),
        )
        .unwrap();

        assert_eq!(search_notes_in_dir(dir.path(), "区间").unwrap().len(), 1);
        assert_eq!(search_notes_in_dir(dir.path(), "tag:DP").unwrap().len(), 1);
        assert_eq!(
            search_notes_in_dir(dir.path(), "source:P1000")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(search_notes_in_dir(dir.path(), "四边形").unwrap().len(), 1);
    }

    #[test]
    fn search_requires_all_filters() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("tricks")).unwrap();
        fs::write(
            dir.path().join("tricks/graph.md"),
            "---\ntitle: 最短路\ntags: [图论]\nsource: manual\n---\nDijkstra\n",
        )
        .unwrap();

        assert_eq!(
            search_notes_in_dir(dir.path(), "tag:DP Dijkstra")
                .unwrap()
                .len(),
            0
        );
    }
}
