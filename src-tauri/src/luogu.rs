use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    thread::sleep,
    time::Duration,
};

use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use serde_yaml::{Mapping, Value as YamlValue};

use crate::frontmatter;
use crate::git::{commit_note, CommitNoteStatus};

const LUOGU_SYNC_MAX_PAGES: u32 = 5;
const LUOGU_SYNC_PAGE_INTERVAL: Duration = Duration::from_secs(1);
const LUOGU_SYNC_DETAIL_INTERVAL: Duration = Duration::from_secs(3);
const LUOGU_COOKIE_EXPIRED_MESSAGE: &str =
    "洛谷 Cookie 可能已失效，请重新复制 _uid 和 __client_id。";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct LuoguConfig {
    pub luogu: LuoguConfigFields,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct LuoguConfigFields {
    pub uid: String,
    pub client_id: String,
    pub last_submission_id: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLuoguInsightResult {
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LuoguSubmissionPreview {
    pub submission_id: String,
    pub problem_id: String,
    pub problem_title: String,
    pub status: String,
    pub submit_time: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TestLuoguConnectionResult {
    pub fetched_count: usize,
    pub submissions: Vec<LuoguSubmissionPreview>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncLuoguInsightsResult {
    pub scanned_pages: usize,
    pub scanned_count: usize,
    pub ac_count: usize,
    pub imported_count: usize,
    pub skipped_no_insight: usize,
    pub skipped_existing: usize,
    pub failed_count: usize,
    pub reached_last_submission_id: bool,
    pub updated_last_submission_id: Option<u64>,
    pub imported_paths: Vec<String>,
    pub message: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LuoguSubmissionRecord {
    submission_id: u64,
    problem_id: String,
    problem_title: String,
    status: String,
    submit_time: String,
}

#[derive(Debug, Default)]
struct InsightFrontmatter {
    title: Option<String>,
    tags: Vec<String>,
    difficulty: Option<String>,
    summary: Option<String>,
    draft: Option<bool>,
}

#[derive(Debug)]
struct InsightBlock {
    frontmatter: InsightFrontmatter,
    body: String,
}

fn repo_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Cannot resolve repo root from CARGO_MANIFEST_DIR".to_string())
}

fn get_notes_dir() -> Result<PathBuf, String> {
    Ok(repo_root()?.join("notes"))
}

fn config_path_for_repo(repo_root: &Path) -> PathBuf {
    repo_root.join(".oinb").join("config.json")
}

impl Default for LuoguConfig {
    fn default() -> Self {
        Self {
            luogu: LuoguConfigFields {
                uid: String::new(),
                client_id: String::new(),
                last_submission_id: None,
            },
        }
    }
}

fn read_luogu_config_from_path(config_path: &Path) -> Result<LuoguConfig, String> {
    if !config_path.exists() {
        return Ok(LuoguConfig::default());
    }

    let content = fs::read_to_string(config_path)
        .map_err(|e| format!("Failed to read Luogu config file: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse Luogu config file: {e}"))
}

fn write_luogu_config_to_path(config_path: &Path, config: &LuoguConfig) -> Result<(), String> {
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .oinb config directory: {e}"))?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize Luogu config: {e}"))?;
    fs::write(config_path, format!("{content}\n"))
        .map_err(|e| format!("Failed to write Luogu config file: {e}"))
}

fn require_luogu_config(config: &LuoguConfig) -> Result<(&str, &str), String> {
    let uid = config.luogu.uid.trim();
    let client_id = config.luogu.client_id.trim();

    if uid.is_empty() {
        return Err("Luogu connection failed: uid is missing in .oinb/config.json".to_string());
    }
    if !uid.chars().all(|ch| ch.is_ascii_digit()) {
        return Err(
            "Luogu connection failed: uid in .oinb/config.json must be numeric".to_string(),
        );
    }
    if client_id.is_empty() {
        return Err(
            "Luogu connection failed: __client_id is missing in .oinb/config.json".to_string(),
        );
    }
    if client_id.contains(['\r', '\n', ';']) {
        return Err(
            "Luogu connection failed: __client_id in .oinb/config.json contains invalid characters"
                .to_string(),
        );
    }

    Ok((uid, client_id))
}

fn luogu_submission_status(value: &JsonValue) -> String {
    if let Some(text) = value.as_str() {
        return text.to_string();
    }
    if let Some(code) = value.as_i64() {
        return code.to_string();
    }
    if let Some(code) = value.as_u64() {
        return code.to_string();
    }
    "unknown".to_string()
}

fn value_to_string(value: &JsonValue) -> Option<String> {
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    if let Some(number) = value.as_i64() {
        return Some(number.to_string());
    }
    if let Some(number) = value.as_u64() {
        return Some(number.to_string());
    }
    None
}

fn parse_luogu_submission_record(record: &JsonValue) -> Result<LuoguSubmissionRecord, String> {
    let submission_id_text = record
        .get("id")
        .and_then(value_to_string)
        .ok_or_else(|| "Luogu connection failed: submission record is missing id".to_string())?;
    let submission_id = submission_id_text.parse::<u64>().map_err(|_| {
        format!("Luogu connection failed: submission id is not numeric: {submission_id_text}")
    })?;

    let problem = record.get("problem").ok_or_else(|| {
        "Luogu connection failed: submission record is missing problem".to_string()
    })?;
    let problem_id = problem
        .get("pid")
        .or_else(|| problem.get("id"))
        .and_then(value_to_string)
        .ok_or_else(|| {
            "Luogu connection failed: submission record is missing problem id".to_string()
        })?;
    let problem_title = problem
        .get("title")
        .and_then(JsonValue::as_str)
        .unwrap_or("")
        .to_string();

    let status = record
        .get("status")
        .map(luogu_submission_status)
        .unwrap_or_else(|| "unknown".to_string());
    let submit_time = record
        .get("submitTime")
        .or_else(|| record.get("submit_time"))
        .or_else(|| record.get("createTime"))
        .and_then(value_to_string)
        .unwrap_or_else(|| "".to_string());

    Ok(LuoguSubmissionRecord {
        submission_id,
        problem_id,
        problem_title,
        status,
        submit_time,
    })
}

fn parse_luogu_submission_records(value: &JsonValue) -> Result<Vec<LuoguSubmissionRecord>, String> {
    let records = value
        .pointer("/currentData/records/result")
        .or_else(|| value.pointer("/currentData/submissions/result"))
        .or_else(|| value.pointer("/data/records/result"))
        .or_else(|| value.pointer("/data/submissions/result"))
        .and_then(JsonValue::as_array)
        .ok_or_else(|| {
            "Luogu connection failed: unexpected submissions JSON structure".to_string()
        })?;

    records.iter().map(parse_luogu_submission_record).collect()
}

fn submission_preview(record: &LuoguSubmissionRecord) -> LuoguSubmissionPreview {
    LuoguSubmissionPreview {
        submission_id: record.submission_id.to_string(),
        problem_id: record.problem_id.clone(),
        problem_title: record.problem_title.clone(),
        status: record.status.clone(),
        submit_time: record.submit_time.clone(),
    }
}

#[cfg(test)]
fn parse_luogu_submission_list(value: &JsonValue) -> Result<TestLuoguConnectionResult, String> {
    let records = parse_luogu_submission_records(value)?;
    let submissions = records.iter().take(5).map(submission_preview).collect();

    Ok(TestLuoguConnectionResult {
        fetched_count: records.len(),
        submissions,
    })
}

fn luogu_http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("Luogu connection failed: cannot create HTTP client: {e}"))
}

fn luogu_cookie(uid: &str, client_id: &str) -> String {
    format!("_uid={uid}; __client_id={client_id}")
}

fn luogu_status_error(scope: &str, status: StatusCode) -> String {
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return format!("{scope}: {LUOGU_COOKIE_EXPIRED_MESSAGE}");
    }

    format!("{scope}: server returned HTTP {}", status.as_u16())
}

fn luogu_request_error(scope: &str, error: reqwest::Error) -> String {
    if error.is_timeout() {
        format!("{scope}: 请求超时")
    } else {
        format!("{scope}: 网络失败")
    }
}

fn fetch_luogu_submission_records(
    uid: &str,
    client_id: &str,
    page: u32,
) -> Result<Vec<LuoguSubmissionRecord>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("Luogu connection failed: cannot create HTTP client: {e}"))?;
    let url = format!("https://www.luogu.com.cn/record/list?user={uid}&page={page}&_contentOnly=1");
    let cookie = luogu_cookie(uid, client_id);

    let response = client
        .get(url)
        .header(reqwest::header::COOKIE, cookie)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .map_err(|e| luogu_request_error("Luogu connection failed", e))?;

    let status = response.status();
    if !status.is_success() {
        return Err(luogu_status_error("Luogu connection failed", status));
    }

    let json = response
        .json::<JsonValue>()
        .map_err(|_| "Luogu connection failed: 返回格式异常".to_string())?;
    parse_luogu_submission_records(&json)
}

fn fetch_luogu_submission_list(
    uid: &str,
    client_id: &str,
) -> Result<TestLuoguConnectionResult, String> {
    let records = fetch_luogu_submission_records(uid, client_id, 1)?;
    Ok(TestLuoguConnectionResult {
        fetched_count: records.len(),
        submissions: records.iter().take(5).map(submission_preview).collect(),
    })
}

fn is_ac_status(status: &str) -> bool {
    let normalized = status.trim().to_ascii_lowercase();
    matches!(normalized.as_str(), "12" | "accepted" | "ac")
}

fn json_string_at<'a>(value: &'a JsonValue, pointers: &[&str]) -> Option<&'a str> {
    pointers
        .iter()
        .find_map(|pointer| value.pointer(pointer).and_then(JsonValue::as_str))
}

fn extract_source_code_from_detail(value: &JsonValue) -> Result<String, String> {
    json_string_at(
        value,
        &[
            "/currentData/record/sourceCode",
            "/currentData/record/source",
            "/currentData/record/code",
            "/currentData/submission/sourceCode",
            "/currentData/submission/source",
            "/currentData/submission/code",
            "/currentData/sourceCode",
            "/currentData/source",
            "/currentData/code",
            "/data/record/sourceCode",
            "/data/record/source",
            "/data/record/code",
            "/data/submission/sourceCode",
            "/data/submission/source",
            "/data/submission/code",
            "/data/sourceCode",
            "/data/source",
            "/data/code",
        ],
    )
    .map(ToOwned::to_owned)
    .ok_or_else(|| {
        "Luogu sync skipped submission: detail JSON does not contain source code".to_string()
    })
}

fn fetch_luogu_submission_source(
    client: &reqwest::blocking::Client,
    uid: &str,
    client_id: &str,
    submission_id: u64,
) -> Result<String, String> {
    let url = format!("https://www.luogu.com.cn/record/{submission_id}?_contentOnly=1");
    let response = client
        .get(url)
        .header(reqwest::header::COOKIE, luogu_cookie(uid, client_id))
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .map_err(|e| {
            luogu_request_error(
                &format!("Luogu sync failed: submission {submission_id}"),
                e,
            )
        })?;

    let status = response.status();
    if !status.is_success() {
        return Err(luogu_status_error(
            &format!("Luogu sync failed: submission {submission_id}"),
            status,
        ));
    }

    let json = response.json::<JsonValue>().map_err(|e| {
        let _ = e;
        format!("Luogu sync failed: submission {submission_id}: 返回格式异常")
    })?;
    extract_source_code_from_detail(&json)
}

fn normalize_problem_id(problem_id: &str) -> Result<String, String> {
    let trimmed = problem_id.trim();
    if trimmed.is_empty() {
        return Err("Luogu import failed: problem id cannot be empty".to_string());
    }

    let digits = trimmed
        .strip_prefix('P')
        .or_else(|| trimmed.strip_prefix('p'))
        .unwrap_or(trimmed);

    if digits.is_empty() || !digits.chars().all(|ch| ch.is_ascii_digit()) {
        return Err(format!(
            "Luogu import failed: problem id must look like P1234 or 1234, got '{problem_id}'"
        ));
    }

    Ok(format!("P{digits}"))
}

fn safe_title_for_filename(title: &str, fallback: &str) -> String {
    const MAX_LEN: usize = 64;

    let mut result = String::new();
    let mut previous_was_space = false;

    for ch in title.trim().chars() {
        let replacement = match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => None,
            ch if ch.is_control() => None,
            ch if ch.is_whitespace() => Some('-'),
            ch => Some(ch),
        };

        if let Some(ch) = replacement {
            if ch == '-' {
                if !previous_was_space && !result.is_empty() {
                    result.push('-');
                }
                previous_was_space = true;
            } else {
                result.push(ch);
                previous_was_space = false;
            }
        }

        if result.chars().count() >= MAX_LEN {
            break;
        }
    }

    let trimmed = result.trim_matches(['.', '-', ' ']).to_string();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed
    }
}

fn extract_oinb_insight(source_code: &str) -> Result<String, String> {
    let marker = "/* @oinb-insight";
    let start = source_code.find(marker).ok_or_else(|| {
        "Luogu import failed: cannot find /* @oinb-insight ... */ block".to_string()
    })?;
    let content_start = start + marker.len();
    let rest = &source_code[content_start..];
    let end = rest.find("*/").ok_or_else(|| {
        "Luogu import failed: @oinb-insight block is not closed with */".to_string()
    })?;

    Ok(rest[..end].trim().to_string())
}

#[allow(dead_code)]
fn clean_block_comment_content(content: &str) -> String {
    content
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(|line| line.trim().trim_start_matches('*').trim())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

#[allow(dead_code)]
fn has_ai_candidate_keyword(content: &str) -> bool {
    let lower = content.to_ascii_lowercase();
    content.contains("启示")
        || content.contains("坑点")
        || content.contains("思路")
        || content.contains("总结")
        || lower.contains("trick")
        || lower.contains("idea")
}

#[allow(dead_code)]
fn has_enough_ai_candidate_content(content: &str) -> bool {
    content.chars().filter(|ch| !ch.is_whitespace()).count() >= 10
}

#[allow(dead_code)]
fn extract_ai_candidate_comment(source_code: &str) -> Option<String> {
    if source_code.contains("/* @oinb-insight") {
        return None;
    }

    let tail_start = source_code.len() * 7 / 10;
    let mut search_from = 0;
    let mut candidate = None;

    while let Some(relative_start) = source_code[search_from..].find("/*") {
        let start = search_from + relative_start;
        let content_start = start + "/*".len();
        let Some(relative_end) = source_code[content_start..].find("*/") else {
            break;
        };
        let end = content_start + relative_end;
        search_from = end + "*/".len();

        if end < tail_start {
            continue;
        }

        let content = clean_block_comment_content(&source_code[content_start..end]);
        if content.contains("@oinb-insight") {
            continue;
        }
        if !has_ai_candidate_keyword(&content) {
            continue;
        }
        if !has_enough_ai_candidate_content(&content) {
            continue;
        }

        candidate = Some(content);
    }

    candidate
}

fn yaml_string(mapping: &Mapping, key: &str) -> Option<String> {
    mapping
        .get(YamlValue::String(key.to_string()))
        .and_then(YamlValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn yaml_bool(mapping: &Mapping, key: &str) -> Option<bool> {
    mapping
        .get(YamlValue::String(key.to_string()))
        .and_then(YamlValue::as_bool)
}

fn yaml_tags(mapping: &Mapping) -> Vec<String> {
    let Some(value) = mapping.get(YamlValue::String("tags".to_string())) else {
        return Vec::new();
    };

    match value {
        YamlValue::Sequence(items) => items
            .iter()
            .filter_map(YamlValue::as_str)
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        YamlValue::String(value) => value
            .split(',')
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}

fn split_insight_frontmatter(insight: &str) -> Result<InsightBlock, String> {
    let normalized = insight.replace("\r\n", "\n").replace('\r', "\n");
    let Some(rest) = normalized.strip_prefix("---\n") else {
        return Ok(InsightBlock {
            frontmatter: InsightFrontmatter::default(),
            body: normalized.trim().to_string(),
        });
    };

    let Some(end_index) = rest.find("\n---") else {
        return Err("Luogu import failed: insight frontmatter is not closed with ---".to_string());
    };

    let yaml_text = &rest[..end_index];
    let after_yaml = &rest[end_index + "\n---".len()..];
    let body = after_yaml.trim_start_matches('\n').trim().to_string();

    let value: YamlValue = serde_yaml::from_str(yaml_text)
        .map_err(|e| format!("Luogu import failed: cannot parse insight frontmatter: {e}"))?;
    let mapping = value.as_mapping().ok_or_else(|| {
        "Luogu import failed: insight frontmatter must be a YAML mapping".to_string()
    })?;

    Ok(InsightBlock {
        frontmatter: InsightFrontmatter {
            title: yaml_string(mapping, "title"),
            tags: yaml_tags(mapping),
            difficulty: yaml_string(mapping, "difficulty"),
            summary: yaml_string(mapping, "summary"),
            draft: yaml_bool(mapping, "draft"),
        },
        body,
    })
}

fn yaml_quote(value: &str) -> String {
    serde_yaml::to_string(value)
        .unwrap_or_else(|_| "\"\"".to_string())
        .trim()
        .trim_start_matches("---")
        .trim()
        .to_string()
}

fn tags_yaml(tags: &[String]) -> String {
    if tags.is_empty() {
        "[]".to_string()
    } else {
        let values = tags
            .iter()
            .map(|tag| yaml_quote(tag))
            .collect::<Vec<_>>()
            .join(", ");
        format!("[{values}]")
    }
}

fn build_note_markdown(
    problem_id: &str,
    problem_title: &str,
    submission_id: &str,
    insight: InsightBlock,
) -> String {
    let title = insight
        .frontmatter
        .title
        .as_deref()
        .unwrap_or_else(|| problem_title.trim());
    let difficulty = insight.frontmatter.difficulty.as_deref().unwrap_or("");
    let summary = insight.frontmatter.summary.as_deref().unwrap_or("");
    let draft = insight.frontmatter.draft.unwrap_or(false);
    let body = insight.body.trim();

    let mut markdown = format!(
        "---\ntitle: {}\ntags: {}\ndifficulty: {}\nsource: {}\nsummary: {}\ndraft: {}\nluogu_submission: {}\n---\n\n",
        yaml_quote(title),
        tags_yaml(&insight.frontmatter.tags),
        yaml_quote(difficulty),
        yaml_quote(&format!("luogu-{problem_id}")),
        yaml_quote(summary),
        draft,
        yaml_quote(submission_id.trim()),
    );

    if !body.is_empty() {
        markdown.push_str(body);
        markdown.push_str("\n\n");
    }

    markdown.push_str("## Links\n\n");
    markdown.push_str(&format!(
        "- Original problem: https://www.luogu.com.cn/problem/{problem_id}\n"
    ));
    markdown.push_str(&format!(
        "- AC submission: https://www.luogu.com.cn/record/{}\n",
        submission_id.trim()
    ));

    markdown
}

fn import_luogu_insight_to_notes_dir(
    notes_dir: &Path,
    problem_id: &str,
    problem_title: &str,
    submission_id: &str,
    source_code: &str,
) -> Result<ImportLuoguInsightResult, String> {
    let problem_id = normalize_problem_id(problem_id)?;
    if problem_title.trim().is_empty() {
        return Err("Luogu import failed: problem title cannot be empty".to_string());
    }
    if submission_id.trim().is_empty() {
        return Err("Luogu import failed: submission id cannot be empty".to_string());
    }

    let insight_text = extract_oinb_insight(source_code)?;
    let insight = split_insight_frontmatter(&insight_text)?;
    let title = insight
        .frontmatter
        .title
        .as_deref()
        .unwrap_or_else(|| problem_title.trim());
    let safe_title = safe_title_for_filename(title, &problem_id);
    let relative_path = format!("luogu/{problem_id}-{safe_title}.md");
    let target_path = notes_dir.join(&relative_path);

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!("Luogu import failed: cannot create notes/luogu directory: {e}")
        })?;
    }

    let markdown = build_note_markdown(&problem_id, problem_title, submission_id, insight);
    let (final_content, warning) = frontmatter::process_for_write(&markdown, &relative_path);
    if let Some(warning) = warning {
        return Err(format!(
            "Luogu import failed: generated frontmatter warning for {relative_path}: {warning}"
        ));
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target_path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                format!("Luogu import failed: note already exists: {relative_path}")
            } else {
                format!("Luogu import failed: cannot create note {relative_path}: {e}")
            }
        })?;

    file.write_all(final_content.as_bytes())
        .map_err(|e| format!("Luogu import failed: cannot write note {relative_path}: {e}"))?;

    Ok(ImportLuoguInsightResult { relative_path })
}

#[tauri::command]
pub fn import_luogu_insight(
    problem_id: String,
    problem_title: String,
    submission_id: String,
    source_code: String,
) -> Result<ImportLuoguInsightResult, String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("Luogu import failed: cannot create notes directory: {e}"))?;

    import_luogu_insight_to_notes_dir(
        &notes_dir,
        &problem_id,
        &problem_title,
        &submission_id,
        &source_code,
    )
}

#[tauri::command]
pub fn get_luogu_config() -> Result<LuoguConfig, String> {
    read_luogu_config_from_path(&config_path_for_repo(&repo_root()?))
}

#[tauri::command]
pub fn save_luogu_config(config: LuoguConfig) -> Result<(), String> {
    write_luogu_config_to_path(&config_path_for_repo(&repo_root()?), &config)
}

#[tauri::command]
pub fn test_luogu_connection() -> Result<TestLuoguConnectionResult, String> {
    let config = read_luogu_config_from_path(&config_path_for_repo(&repo_root()?))?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let uid = uid.to_string();
    let client_id = client_id.to_string();
    fetch_luogu_submission_list(&uid, &client_id)
}

#[tauri::command]
pub fn sync_luogu_insights() -> Result<SyncLuoguInsightsResult, String> {
    let repo_root = repo_root()?;
    let config_path = config_path_for_repo(&repo_root);
    let mut config = read_luogu_config_from_path(&config_path)?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let uid = uid.to_string();
    let client_id = client_id.to_string();
    let last_submission_id = config.luogu.last_submission_id;
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("Luogu sync failed: cannot create notes directory: {e}"))?;

    let mut candidates = Vec::new();
    let mut scanned_pages = 0usize;
    let mut scanned_count = 0usize;
    let mut reached_last_submission_id = false;
    let mut max_seen_submission_id = last_submission_id;

    for page in 1..=LUOGU_SYNC_MAX_PAGES {
        if page > 1 {
            sleep(LUOGU_SYNC_PAGE_INTERVAL);
        }

        let records = fetch_luogu_submission_records(&uid, &client_id, page)?;
        scanned_pages += 1;
        scanned_count += records.len();

        if let Some(page_max_submission_id) =
            records.iter().map(|record| record.submission_id).max()
        {
            max_seen_submission_id = Some(
                max_seen_submission_id
                    .map(|current| current.max(page_max_submission_id))
                    .unwrap_or(page_max_submission_id),
            );
        }

        if records.is_empty() {
            break;
        }

        let page_reached_last = last_submission_id
            .map(|last_id| records.iter().any(|record| record.submission_id <= last_id))
            .unwrap_or(false);

        candidates.extend(records.into_iter().filter(|record| {
            last_submission_id
                .map(|last_id| record.submission_id > last_id)
                .unwrap_or(true)
        }));

        if page_reached_last {
            reached_last_submission_id = true;
            break;
        }
    }

    candidates.sort_by_key(|record| record.submission_id);

    let client = luogu_http_client()?;
    let mut ac_count = 0;
    let mut imported_count = 0;
    let mut skipped_no_insight = 0;
    let mut skipped_existing = 0;
    let mut failed_count = 0;
    let mut imported_paths = Vec::new();
    let mut warnings = Vec::new();
    let mut detail_requests = 0usize;

    for record in candidates {
        if !is_ac_status(&record.status) {
            continue;
        }
        ac_count += 1;

        if detail_requests > 0 {
            sleep(LUOGU_SYNC_DETAIL_INTERVAL);
        }
        detail_requests += 1;

        let source_code =
            match fetch_luogu_submission_source(&client, &uid, &client_id, record.submission_id) {
                Ok(source_code) => source_code,
                Err(error) => {
                    failed_count += 1;
                    warnings.push(error);
                    continue;
                }
            };

        if extract_oinb_insight(&source_code).is_err() {
            skipped_no_insight += 1;
            continue;
        }

        let imported = match import_luogu_insight_to_notes_dir(
            &notes_dir,
            &record.problem_id,
            &record.problem_title,
            &record.submission_id.to_string(),
            &source_code,
        ) {
            Ok(imported) => imported,
            Err(error) if error.contains("already exists") => {
                skipped_existing += 1;
                warnings.push(error);
                continue;
            }
            Err(error) => {
                failed_count += 1;
                warnings.push(error);
                continue;
            }
        };

        match commit_note(imported.relative_path.clone(), None) {
            Ok(CommitNoteStatus::Committed) => {}
            Ok(CommitNoteStatus::NoChanges) => {
                warnings.push(format!(
                    "Luogu sync warning: generated note had no Git diff: {}",
                    imported.relative_path
                ));
            }
            Err(error) => {
                failed_count += 1;
                warnings.push(format!(
                    "Luogu sync failed: Git commit failed for {}: {error}",
                    imported.relative_path
                ));
                imported_paths.push(imported.relative_path);
                continue;
            }
        }

        imported_count += 1;
        imported_paths.push(imported.relative_path);
    }

    let updated_last_submission_id = if failed_count == 0 {
        let next_last_submission_id = match (last_submission_id, max_seen_submission_id) {
            (Some(previous), Some(seen)) => Some(previous.max(seen)),
            (None, Some(seen)) => Some(seen),
            (previous, None) => previous,
        };

        if next_last_submission_id != last_submission_id {
            config.luogu.last_submission_id = next_last_submission_id;
            write_luogu_config_to_path(&config_path, &config)?;
        }

        next_last_submission_id
    } else {
        warnings.push(
            "Luogu sync warning: last_submission_id was not updated because some submissions failed"
                .to_string(),
        );
        last_submission_id
    };

    let message = if failed_count == 0 {
        format!(
            "Luogu sync completed: imported {imported_count}, skipped {skipped_no_insight} without insight, skipped {skipped_existing} existing notes"
        )
    } else {
        format!(
            "Luogu sync completed with {failed_count} failure(s): imported {imported_count}, skipped {skipped_no_insight} without insight, skipped {skipped_existing} existing notes"
        )
    };

    Ok(SyncLuoguInsightsResult {
        scanned_pages,
        scanned_count,
        ac_count,
        imported_count,
        skipped_no_insight,
        skipped_existing,
        failed_count,
        reached_last_submission_id,
        updated_last_submission_id,
        imported_paths,
        message,
        warnings,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_source() -> String {
        r#"
int main() { return 0; }

/* @oinb-insight
---
title: Interval Coverage
tags: [difference, construction]
difficulty: improve+
summary: Find the difference-array view.
draft: true
---

## Insight

Use a difference array.
*/
"#
        .to_string()
    }

    #[test]
    fn extracts_oinb_insight_block() {
        let block = extract_oinb_insight(&sample_source()).unwrap();
        assert!(block.contains("title: Interval Coverage"));
        assert!(block.contains("## Insight"));
        assert!(!block.contains("@oinb-insight"));
    }

    #[test]
    fn missing_insight_block_returns_error() {
        assert!(extract_oinb_insight("int main() {}").is_err());
    }

    #[test]
    fn extracts_tail_ai_candidate_comment_with_chinese_keywords() {
        let source = r#"
#include <bits/stdc++.h>
using namespace std;

int main() {
    cout << 1 << "\n";
    return 0;
}

/*
启示：
状态转移之前先把边界条件想清楚。
坑点：
初始化不能漏掉空集合。
*/
"#;

        let comment = extract_ai_candidate_comment(source).unwrap();

        assert!(comment.contains("启示："));
        assert!(comment.contains("坑点："));
        assert!(!comment.contains("/*"));
        assert!(!comment.contains("*/"));
    }

    #[test]
    fn does_not_extract_middle_block_comment() {
        let source = format!(
            "{}\n/*\n启示：这个注释在源码中间，不应该作为 AI 候选。\n*/\n{}",
            "int a;\n".repeat(80),
            "int b;\n".repeat(80),
        );

        assert_eq!(extract_ai_candidate_comment(&source), None);
    }

    #[test]
    fn does_not_extract_comment_without_candidate_keyword() {
        let source = r#"
int main() {
    return 0;
}

/*
这里记录的是普通说明，内容很长但是没有触发词。
*/
"#;

        assert_eq!(extract_ai_candidate_comment(source), None);
    }

    #[test]
    fn does_not_extract_too_short_candidate_comment() {
        let source = r#"
int main() {
    return 0;
}

/*
启示：短
*/
"#;

        assert_eq!(extract_ai_candidate_comment(source), None);
    }

    #[test]
    fn does_not_treat_oinb_insight_as_ai_candidate_comment() {
        assert_eq!(extract_ai_candidate_comment(&sample_source()), None);
    }

    #[test]
    fn extracts_tail_ai_candidate_comment_with_english_keywords() {
        let source = r#"
int main() {
    return 0;
}

/*
Idea:
Compress the state before running the transition.
Trick:
Keep one sentinel item to avoid special casing.
*/
"#;

        let comment = extract_ai_candidate_comment(source).unwrap();

        assert!(comment.contains("Idea:"));
        assert!(comment.contains("Trick:"));
    }

    #[test]
    fn safe_filename_removes_windows_invalid_chars() {
        assert_eq!(
            safe_title_for_filename("  a <b>: c / d  ", "P1000"),
            "a-b-c-d"
        );
        assert_eq!(safe_title_for_filename("///", "P1000"), "P1000");
    }

    #[test]
    fn generated_frontmatter_uses_insight_fields() {
        let insight =
            split_insight_frontmatter(&extract_oinb_insight(&sample_source()).unwrap()).unwrap();
        let markdown = build_note_markdown("P1234", "Fallback", "987654", insight);

        assert!(markdown.contains("title: Interval Coverage"));
        assert!(markdown.contains("tags: [difference, construction]"));
        assert!(markdown.contains("difficulty: improve+"));
        assert!(markdown.contains("source: luogu-P1234"));
        assert!(markdown.contains("summary: Find the difference-array view."));
        assert!(markdown.contains("draft: true"));
        assert!(markdown.contains("luogu_submission: '987654'"));
        assert!(markdown.contains("https://www.luogu.com.cn/problem/P1234"));
        assert!(markdown.contains("https://www.luogu.com.cn/record/987654"));
    }

    #[test]
    fn import_does_not_overwrite_existing_file() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();

        let first = import_luogu_insight_to_notes_dir(
            notes_dir,
            "1234",
            "Fallback",
            "987654",
            &sample_source(),
        )
        .unwrap();
        assert_eq!(first.relative_path, "luogu/P1234-Interval-Coverage.md");

        let second = import_luogu_insight_to_notes_dir(
            notes_dir,
            "P1234",
            "Fallback",
            "987654",
            &sample_source(),
        );
        assert!(second.unwrap_err().contains("already exists"));
    }

    #[test]
    fn missing_luogu_config_returns_default() {
        let dir = tempdir().unwrap();
        let config_path = config_path_for_repo(dir.path());

        let config = read_luogu_config_from_path(&config_path).unwrap();

        assert_eq!(config, LuoguConfig::default());
    }

    #[test]
    fn writes_luogu_config_with_snake_case_fields() {
        let dir = tempdir().unwrap();
        let config_path = config_path_for_repo(dir.path());
        let config = LuoguConfig {
            luogu: LuoguConfigFields {
                uid: "12345".to_string(),
                client_id: "client-secret".to_string(),
                last_submission_id: Some(987654),
            },
        };

        write_luogu_config_to_path(&config_path, &config).unwrap();
        let raw = fs::read_to_string(&config_path).unwrap();
        let parsed = read_luogu_config_from_path(&config_path).unwrap();

        assert!(raw.contains("\"client_id\""));
        assert!(raw.contains("\"last_submission_id\""));
        assert_eq!(parsed, config);
    }

    #[test]
    fn missing_luogu_connection_config_returns_clear_error() {
        let config = LuoguConfig::default();

        assert!(require_luogu_config(&config)
            .unwrap_err()
            .contains("uid is missing"));
    }

    #[test]
    fn parses_luogu_submission_list_preview() {
        let json = serde_json::json!({
            "currentData": {
                "records": {
                    "result": [
                        {
                            "id": 123456,
                            "problem": { "pid": "P1000", "title": "A+B Problem" },
                            "status": 12,
                            "submitTime": 1777777777
                        },
                        {
                            "id": 123455,
                            "problem": { "pid": "P1001", "title": "Test" },
                            "status": "Accepted",
                            "submitTime": "2026-05-04 12:00:00"
                        }
                    ]
                }
            }
        });

        let result = parse_luogu_submission_list(&json).unwrap();

        assert_eq!(result.fetched_count, 2);
        assert_eq!(
            result.submissions[0],
            LuoguSubmissionPreview {
                submission_id: "123456".to_string(),
                problem_id: "P1000".to_string(),
                problem_title: "A+B Problem".to_string(),
                status: "12".to_string(),
                submit_time: "1777777777".to_string(),
            }
        );
        assert_eq!(result.submissions[1].status, "Accepted");
    }

    #[test]
    fn parses_submission_records_for_sync() {
        let json = serde_json::json!({
            "currentData": {
                "records": {
                    "result": [
                        {
                            "id": "123456",
                            "problem": { "pid": "P1000", "title": "A+B Problem" },
                            "status": 12,
                            "submitTime": 1777777777
                        }
                    ]
                }
            }
        });

        let records = parse_luogu_submission_records(&json).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].submission_id, 123456);
        assert_eq!(records[0].problem_id, "P1000");
        assert!(is_ac_status(&records[0].status));
    }

    #[test]
    fn extracts_source_code_from_submission_detail_shapes() {
        let json = serde_json::json!({
            "currentData": {
                "record": {
                    "sourceCode": "int main() { return 0; }"
                }
            }
        });

        assert_eq!(
            extract_source_code_from_detail(&json).unwrap(),
            "int main() { return 0; }"
        );
    }

    #[test]
    fn rejects_detail_without_source_code() {
        let json = serde_json::json!({ "currentData": { "record": {} } });

        assert!(extract_source_code_from_detail(&json)
            .unwrap_err()
            .contains("does not contain source code"));
    }

    #[test]
    fn rejects_unexpected_luogu_submission_json() {
        let json = serde_json::json!({ "currentData": {} });

        assert!(parse_luogu_submission_list(&json)
            .unwrap_err()
            .contains("unexpected submissions JSON structure"));
    }

    #[test]
    fn luogu_status_error_explains_expired_cookie() {
        assert_eq!(
            luogu_status_error("Luogu connection failed", StatusCode::UNAUTHORIZED),
            "Luogu connection failed: 洛谷 Cookie 可能已失效，请重新复制 _uid 和 __client_id。"
        );
        assert_eq!(
            luogu_status_error("Luogu sync failed", StatusCode::FORBIDDEN),
            "Luogu sync failed: 洛谷 Cookie 可能已失效，请重新复制 _uid 和 __client_id。"
        );
    }

    #[test]
    fn luogu_status_error_keeps_other_http_status_short() {
        assert_eq!(
            luogu_status_error("Luogu connection failed", StatusCode::BAD_GATEWAY),
            "Luogu connection failed: server returned HTTP 502"
        );
    }
}
