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

use crate::ai::{organize_luogu_insight, OrganizeLuoguInsightInput, OrganizedLuoguInsight};
use crate::frontmatter;
use crate::git::{commit_note, CommitNoteStatus};
use crate::paths;

const LUOGU_SYNC_MAX_PAGES: u32 = 5;
const LUOGU_SYNC_PAGE_INTERVAL: Duration = Duration::from_secs(1);
const LUOGU_SYNC_DETAIL_INTERVAL: Duration = Duration::from_secs(3);
const LUOGU_PREVIEW_DEFAULT_LIMIT: usize = 20;
const LUOGU_PREVIEW_MAX_LIMIT: usize = 100;
const LUOGU_PREVIEW_MAX_PAGE: u32 = 50;
const LUOGU_PREPARE_LOOKUP_PAGE_INTERVAL: Duration = Duration::from_millis(1500);
const LUOGU_COOKIE_EXPIRED_MESSAGE: &str =
    "洛谷 Cookie 可能已失效，请重新复制 _uid 和 __client_id。";

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct LuoguConfig {
    pub luogu: LuoguConfigFields,
    #[serde(default)]
    pub ai: AiConfigFields,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct LuoguConfigFields {
    pub uid: String,
    pub client_id: String,
    pub last_submission_id: Option<u64>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct AiConfigFields {
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub providers: Vec<AiProvider>,
    #[serde(default)]
    pub default_provider_id: Option<String>,
    #[serde(default)]
    pub default_model_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct AiProvider {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub api_key: String,
    pub enabled: bool,
    pub default_model: Option<String>,
    #[serde(default)]
    pub models: Vec<AiModel>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct AiModel {
    pub id: String,
    pub name: Option<String>,
    pub enabled: bool,
    pub supports_stream: bool,
    pub source: String,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportLuoguInsightResult {
    pub relative_path: String,
    pub ai_model: String,
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
pub struct PreviewLuoguSubmission {
    pub submission_id: String,
    pub problem_id: String,
    pub problem_title: String,
    pub status: String,
    pub is_ac: bool,
    pub submit_time: String,
    pub status_label: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewLuoguSubmissionsResult {
    pub fetched_count: usize,
    pub limit: usize,
    pub uid_configured: bool,
    pub client_id_configured: bool,
    pub ai_configured: bool,
    pub last_submission_id: Option<u64>,
    pub submissions: Vec<PreviewLuoguSubmission>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewLuoguSubmissionPageResult {
    pub page: u32,
    pub fetched_count: usize,
    pub has_more: bool,
    pub uid_configured: bool,
    pub client_id_configured: bool,
    pub ai_configured: bool,
    pub last_submission_id: Option<u64>,
    pub submissions: Vec<PreviewLuoguSubmission>,
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
    pub ai_imported_count: usize,
    pub ai_skipped_count: usize,
    pub ai_failed_count: usize,
    pub ai_model: Option<String>,
    pub reached_last_submission_id: bool,
    pub updated_last_submission_id: Option<u64>,
    pub imported_paths: Vec<String>,
    pub message: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportLuoguSubmissionResult {
    pub submission_id: String,
    pub problem_id: String,
    pub problem_title: String,
    pub relative_path: Option<String>,
    pub draft_fallback: bool,
    pub skipped: bool,
    pub skip_reason: Option<String>,
    pub failed: bool,
    pub error: Option<String>,
    pub committed: bool,
    pub commit_status: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PrepareLuoguSubmissionNoteResult {
    pub submission_id: String,
    pub problem_id: String,
    pub problem_title: String,
    pub suggested_relative_path: String,
    pub markdown: String,
    pub source_code: String,
    pub draft_fallback: bool,
    pub ai_status: String,
    pub reason: Option<String>,
    pub existing: bool,
    pub skipped: bool,
    pub skip_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LuoguPrepareRules {
    pub require_ac: bool,
    pub allow_raw_draft_without_insight: bool,
}

impl Default for LuoguPrepareRules {
    fn default() -> Self {
        Self {
            require_ac: true,
            allow_raw_draft_without_insight: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WriteLuoguPreparedNoteResult {
    pub relative_path: Option<String>,
    pub skipped: bool,
    pub skip_reason: Option<String>,
    pub failed: bool,
    pub error: Option<String>,
    pub committed: bool,
    pub commit_status: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LuoguSubmissionRecord {
    submission_id: u64,
    problem_id: String,
    problem_title: String,
    status: String,
    submit_time: String,
}

#[allow(dead_code)]
#[derive(Debug, Default)]
struct InsightFrontmatter {
    title: Option<String>,
    tags: Vec<String>,
    difficulty: Option<String>,
    summary: Option<String>,
    draft: Option<bool>,
}

#[allow(dead_code)]
#[derive(Debug)]
struct InsightBlock {
    frontmatter: InsightFrontmatter,
    body: String,
}

#[derive(Debug, PartialEq, Eq)]
enum LuoguAiImportOutcome {
    Imported(ImportLuoguInsightResult),
    NoCandidate,
    AiSkipped,
}

struct PreparedLuoguNote {
    relative_path: String,
    markdown: String,
    draft_fallback: bool,
    ai_status: String,
    reason: Option<String>,
}

fn get_notes_dir() -> Result<PathBuf, String> {
    paths::notes_dir()
}

#[cfg(test)]
fn config_path_for_repo(repo_root: &Path) -> PathBuf {
    repo_root.join(".oinb").join("config.json")
}

fn config_path() -> Result<PathBuf, String> {
    Ok(paths::oinb_dir()?.join("config.json"))
}

impl Default for LuoguConfig {
    fn default() -> Self {
        Self {
            luogu: LuoguConfigFields {
                uid: String::new(),
                client_id: String::new(),
                last_submission_id: None,
            },
            ai: AiConfigFields::default(),
        }
    }
}

pub(crate) fn read_luogu_config_from_path(config_path: &Path) -> Result<LuoguConfig, String> {
    if !config_path.exists() {
        return Ok(LuoguConfig::default());
    }

    let content = fs::read_to_string(config_path)
        .map_err(|e| format!("Failed to read Luogu config file: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse Luogu config file: {e}"))
}

pub(crate) fn write_luogu_config_to_path(
    config_path: &Path,
    config: &LuoguConfig,
) -> Result<(), String> {
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .oinb config directory: {e}"))?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize Luogu config: {e}"))?;
    fs::write(config_path, format!("{content}\n"))
        .map_err(|e| format!("Failed to write Luogu config file: {e}"))
}

pub(crate) fn read_config() -> Result<LuoguConfig, String> {
    read_luogu_config_from_path(&config_path()?)
}

pub(crate) fn write_config(config: &LuoguConfig) -> Result<(), String> {
    write_luogu_config_to_path(&config_path()?, config)
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

fn is_ai_configured(config: &AiConfigFields) -> bool {
    !config.base_url.trim().is_empty()
        && !config.api_key.trim().is_empty()
        && !config.model.trim().is_empty()
}

fn preview_status_label(record: &LuoguSubmissionRecord, last_submission_id: Option<u64>) -> String {
    if last_submission_id
        .map(|last_id| record.submission_id <= last_id)
        .unwrap_or(false)
    {
        return "旧提交".to_string();
    }

    if !is_ac_status(&record.status) {
        return "跳过：非 AC".to_string();
    }

    "可候选".to_string()
}

fn submission_scan_preview(
    record: &LuoguSubmissionRecord,
    last_submission_id: Option<u64>,
) -> PreviewLuoguSubmission {
    PreviewLuoguSubmission {
        submission_id: record.submission_id.to_string(),
        problem_id: record.problem_id.clone(),
        problem_title: record.problem_title.clone(),
        status: record.status.clone(),
        is_ac: is_ac_status(&record.status),
        submit_time: record.submit_time.clone(),
        status_label: preview_status_label(record, last_submission_id),
    }
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
            luogu_request_error(&format!("Luogu sync failed: submission {submission_id}"), e)
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

fn extract_luogu_ai_candidate_comment(source_code: &str) -> Option<String> {
    if source_code.contains("/* @oinb-insight") {
        return extract_oinb_insight(source_code)
            .ok()
            .map(|content| clean_block_comment_content(&content))
            .filter(|content| has_enough_ai_candidate_content(content));
    }

    extract_ai_candidate_comment(source_code)
}

#[allow(dead_code)]
fn yaml_string(mapping: &Mapping, key: &str) -> Option<String> {
    mapping
        .get(YamlValue::String(key.to_string()))
        .and_then(YamlValue::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

#[allow(dead_code)]
fn yaml_bool(mapping: &Mapping, key: &str) -> Option<bool> {
    mapping
        .get(YamlValue::String(key.to_string()))
        .and_then(YamlValue::as_bool)
}

#[allow(dead_code)]
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

#[allow(dead_code)]
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

#[allow(dead_code)]
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

fn build_ai_note_markdown(
    problem_id: &str,
    submission_id: &str,
    insight: &OrganizedLuoguInsight,
    ai_model: &str,
) -> String {
    let tags = insight
        .tags
        .iter()
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();

    let mut markdown = format!(
        "---\ntitle: {}\ntags: {}\ndifficulty: {}\nsource: {}\nsummary: {}\ndraft: {}\nluogu_submission: {}\nai_generated: true\nai_model: {}\n---\n\n",
        yaml_quote(insight.title.trim()),
        tags_yaml(&tags),
        yaml_quote(insight.difficulty.trim()),
        yaml_quote(&format!("luogu-{problem_id}")),
        yaml_quote(insight.summary.trim()),
        insight.draft,
        yaml_quote(submission_id.trim()),
        yaml_quote(ai_model.trim()),
    );

    let body = insight.body.trim();
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

fn build_ai_prepared_luogu_note(
    problem_id: &str,
    submission_id: &str,
    insight: &OrganizedLuoguInsight,
    ai_model: &str,
) -> Result<PreparedLuoguNote, String> {
    let problem_id = normalize_problem_id(problem_id)?;
    let safe_title = safe_title_for_filename(insight.title.trim(), &problem_id);
    let relative_path = format!("luogu/{problem_id}-{safe_title}.md");
    let markdown = build_ai_note_markdown(&problem_id, submission_id, insight, ai_model);
    let (final_content, warning) = frontmatter::process_for_write(&markdown, &relative_path);
    if let Some(warning) = warning {
        return Err(format!(
            "Luogu import failed: generated frontmatter warning for {relative_path}: {warning}"
        ));
    }

    Ok(PreparedLuoguNote {
        relative_path,
        markdown: final_content,
        draft_fallback: false,
        ai_status: "organized".to_string(),
        reason: None,
    })
}

fn write_ai_luogu_note_to_notes_dir(
    notes_dir: &Path,
    problem_id: &str,
    submission_id: &str,
    insight: &OrganizedLuoguInsight,
    ai_model: &str,
) -> Result<ImportLuoguInsightResult, String> {
    let safe_title = safe_title_for_filename(insight.title.trim(), problem_id);
    let relative_path = format!("luogu/{problem_id}-{safe_title}.md");
    let target_path = notes_dir.join(&relative_path);

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!("Luogu import failed: cannot create notes/luogu directory: {e}")
        })?;
    }

    let markdown = build_ai_note_markdown(problem_id, submission_id, insight, ai_model);
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

    Ok(ImportLuoguInsightResult {
        relative_path,
        ai_model: ai_model.trim().to_string(),
    })
}

fn build_raw_luogu_draft_markdown(
    problem_id: &str,
    problem_title: &str,
    submission_id: &str,
    source_code: &str,
    fallback_reason: &str,
) -> String {
    let candidate_comment = extract_luogu_ai_candidate_comment(source_code)
        .or_else(|| extract_oinb_insight(source_code).ok());
    let title = if problem_title.trim().is_empty() {
        format!("{problem_id} raw Luogu draft")
    } else {
        format!("{problem_id} - {} raw Luogu draft", problem_title.trim())
    };

    let mut markdown = format!(
        "---\ntitle: {}\ntags: [洛谷, 待整理]\ndifficulty: \"\"\nsource: {}\nsummary: {}\ndraft: true\nluogu_submission: {}\nai_generated: false\nai_status: {}\n---\n\n",
        yaml_quote(&title),
        yaml_quote(&format!("luogu-{problem_id}")),
        yaml_quote("AI was unavailable or did not produce an organized note; this is a raw draft."),
        yaml_quote(submission_id.trim()),
        yaml_quote("raw_draft_fallback"),
    );

    markdown.push_str("# Raw Luogu Draft\n\n");
    markdown.push_str("## Submission\n\n");
    markdown.push_str(&format!("- Submission ID: {}\n", submission_id.trim()));
    markdown.push_str(&format!("- Problem: {problem_id}"));
    if !problem_title.trim().is_empty() {
        markdown.push_str(&format!(" - {}", problem_title.trim()));
    }
    markdown.push('\n');
    markdown.push_str(&format!(
        "- Problem URL: https://www.luogu.com.cn/problem/{problem_id}\n"
    ));
    markdown.push_str(&format!(
        "- Submission URL: https://www.luogu.com.cn/record/{}\n\n",
        submission_id.trim()
    ));

    markdown.push_str("## AI Status\n\n");
    markdown.push_str(fallback_reason.trim());
    markdown.push_str("\n\n");

    markdown.push_str("## Raw @oinb-insight Candidate\n\n");
    if let Some(candidate_comment) = candidate_comment {
        markdown.push_str("```text\n");
        markdown.push_str(candidate_comment.trim());
        markdown.push_str("\n```\n\n");
    } else {
        markdown.push_str("No @oinb-insight or reusable tail comment candidate was found.\n\n");
    }

    markdown.push_str("## Source Code\n\n");
    markdown.push_str("```cpp\n");
    markdown.push_str(source_code.trim());
    markdown.push_str("\n```\n");

    markdown
}

fn build_raw_prepared_luogu_note(
    problem_id: &str,
    problem_title: &str,
    submission_id: &str,
    source_code: &str,
    fallback_reason: &str,
) -> Result<PreparedLuoguNote, String> {
    let problem_id = normalize_problem_id(problem_id)?;
    let safe_title = safe_title_for_filename(problem_title.trim(), "raw-draft");
    let relative_path = format!("luogu/{problem_id}-{safe_title}.md");
    let markdown = build_raw_luogu_draft_markdown(
        &problem_id,
        problem_title,
        submission_id,
        source_code,
        fallback_reason,
    );
    let (final_content, warning) = frontmatter::process_for_write(&markdown, &relative_path);
    if let Some(warning) = warning {
        return Err(format!(
            "Luogu import failed: generated raw draft frontmatter warning for {relative_path}: {warning}"
        ));
    }

    Ok(PreparedLuoguNote {
        relative_path,
        markdown: final_content,
        draft_fallback: true,
        ai_status: "rawDraftFallback".to_string(),
        reason: Some(fallback_reason.trim().to_string()),
    })
}

fn write_raw_luogu_draft_to_notes_dir(
    notes_dir: &Path,
    problem_id: &str,
    problem_title: &str,
    submission_id: &str,
    source_code: &str,
    fallback_reason: &str,
) -> Result<ImportLuoguInsightResult, String> {
    let problem_id = normalize_problem_id(problem_id)?;
    let safe_title = safe_title_for_filename(problem_title.trim(), "raw-draft");
    let relative_path = format!("luogu/{problem_id}-{safe_title}.md");
    let target_path = notes_dir.join(&relative_path);

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!("Luogu import failed: cannot create notes/luogu directory: {e}")
        })?;
    }

    let markdown = build_raw_luogu_draft_markdown(
        &problem_id,
        problem_title,
        submission_id,
        source_code,
        fallback_reason,
    );
    let (final_content, warning) = frontmatter::process_for_write(&markdown, &relative_path);
    if let Some(warning) = warning {
        return Err(format!(
            "Luogu import failed: generated raw draft frontmatter warning for {relative_path}: {warning}"
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

    Ok(ImportLuoguInsightResult {
        relative_path,
        ai_model: String::new(),
    })
}

fn should_fallback_to_raw_draft(error: &str) -> bool {
    error.starts_with("AI connection failed") || error.starts_with("Luogu AI insight failed")
}

fn safe_luogu_note_path_for_write(
    notes_dir: &Path,
    relative_path: &str,
) -> Result<(String, PathBuf), String> {
    let normalized = relative_path.replace('\\', "/");
    if normalized.is_empty() {
        return Err("Luogu write failed: relative_path cannot be empty".to_string());
    }
    if Path::new(&normalized).is_absolute()
        || normalized.starts_with('/')
        || relative_path.starts_with('\\')
    {
        return Err(format!(
            "Luogu write failed: illegal note path '{relative_path}'"
        ));
    }
    if !normalized.starts_with("luogu/") {
        return Err(format!(
            "Luogu write failed: note path must be under notes/luogu: '{relative_path}'"
        ));
    }
    if !normalized.to_ascii_lowercase().ends_with(".md") {
        return Err(format!(
            "Luogu write failed: note path must end with .md: '{relative_path}'"
        ));
    }
    for segment in normalized.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(format!(
                "Luogu write failed: illegal note path segment in '{relative_path}'"
            ));
        }
    }

    fs::create_dir_all(notes_dir)
        .map_err(|e| format!("Luogu write failed: cannot create notes directory: {e}"))?;
    let luogu_dir = notes_dir.join("luogu");
    fs::create_dir_all(&luogu_dir)
        .map_err(|e| format!("Luogu write failed: cannot create notes/luogu directory: {e}"))?;

    let canonical_notes = notes_dir
        .canonicalize()
        .map_err(|e| format!("Luogu write failed: cannot resolve notes directory: {e}"))?;
    let canonical_luogu = luogu_dir
        .canonicalize()
        .map_err(|e| format!("Luogu write failed: cannot resolve notes/luogu directory: {e}"))?;
    if !canonical_luogu.starts_with(&canonical_notes) {
        return Err("Luogu write failed: notes/luogu escapes notes directory".to_string());
    }

    let target_path = canonical_notes.join(&normalized);
    if !target_path.starts_with(&canonical_luogu) {
        return Err(format!(
            "Luogu write failed: note path '{relative_path}' escapes notes/luogu"
        ));
    }

    Ok((normalized, target_path))
}

fn luogu_note_exists(notes_dir: &Path, relative_path: &str) -> bool {
    let normalized = relative_path.replace('\\', "/");
    if normalized.is_empty()
        || !normalized.starts_with("luogu/")
        || !normalized.to_ascii_lowercase().ends_with(".md")
    {
        return false;
    }

    notes_dir.join(normalized).exists()
}

fn find_luogu_submission_record_by_id(
    uid: &str,
    client_id: &str,
    submission_id: u64,
) -> Result<Option<LuoguSubmissionRecord>, String> {
    for page in 1..=LUOGU_PREVIEW_MAX_PAGE {
        if page > 1 {
            sleep(LUOGU_PREPARE_LOOKUP_PAGE_INTERVAL);
        }

        let records = fetch_luogu_submission_records(uid, client_id, page)?;
        if records.is_empty() {
            return Ok(None);
        }

        if let Some(record) = records
            .into_iter()
            .find(|record| record.submission_id == submission_id)
        {
            return Ok(Some(record));
        }
    }

    Ok(None)
}

fn prepare_luogu_submission_record_note(
    client: &reqwest::blocking::Client,
    uid: &str,
    client_id: &str,
    notes_dir: &Path,
    ai_config: &AiConfigFields,
    rules: &LuoguPrepareRules,
    record: &LuoguSubmissionRecord,
) -> PrepareLuoguSubmissionNoteResult {
    if rules.require_ac && !is_ac_status(&record.status) {
        return PrepareLuoguSubmissionNoteResult {
            submission_id: record.submission_id.to_string(),
            problem_id: record.problem_id.clone(),
            problem_title: record.problem_title.clone(),
            suggested_relative_path: String::new(),
            markdown: String::new(),
            source_code: String::new(),
            draft_fallback: false,
            ai_status: "skipped".to_string(),
            reason: Some(format!("非 AC 提交，当前 verdict 为 {}", record.status)),
            existing: false,
            skipped: true,
            skip_reason: Some(format!("非 AC 提交，当前 verdict 为 {}", record.status)),
        };
    }

    if !is_ac_status(&record.status) {
        return PrepareLuoguSubmissionNoteResult {
            submission_id: record.submission_id.to_string(),
            problem_id: record.problem_id.clone(),
            problem_title: record.problem_title.clone(),
            suggested_relative_path: String::new(),
            markdown: String::new(),
            source_code: String::new(),
            draft_fallback: false,
            ai_status: "skipped".to_string(),
            reason: Some(format!(
                "当前后端只支持 AC 提交导入，当前 verdict 为 {}",
                record.status
            )),
            existing: false,
            skipped: true,
            skip_reason: Some(format!(
                "当前后端只支持 AC 提交导入，当前 verdict 为 {}",
                record.status
            )),
        };
    }

    let source_code =
        match fetch_luogu_submission_source(client, uid, client_id, record.submission_id) {
            Ok(source_code) => source_code,
            Err(error) => {
                return PrepareLuoguSubmissionNoteResult {
                    submission_id: record.submission_id.to_string(),
                    problem_id: record.problem_id.clone(),
                    problem_title: record.problem_title.clone(),
                    suggested_relative_path: String::new(),
                    markdown: String::new(),
                    source_code: String::new(),
                    draft_fallback: false,
                    ai_status: "failed".to_string(),
                    reason: Some(error.clone()),
                    existing: false,
                    skipped: false,
                    skip_reason: None,
                };
            }
        };

    if !rules.allow_raw_draft_without_insight
        && extract_luogu_ai_candidate_comment(&source_code).is_none()
    {
        return PrepareLuoguSubmissionNoteResult {
            submission_id: record.submission_id.to_string(),
            problem_id: record.problem_id.clone(),
            problem_title: record.problem_title.clone(),
            suggested_relative_path: String::new(),
            markdown: String::new(),
            source_code,
            draft_fallback: false,
            ai_status: "skipped".to_string(),
            reason: Some("未找到 insight / 启示注释，按规则跳过".to_string()),
            existing: false,
            skipped: true,
            skip_reason: Some("未找到 insight / 启示注释，按规则跳过".to_string()),
        };
    }

    let prepared = match prepare_ai_first_luogu_note(
        &record.problem_id,
        &record.problem_title,
        &record.submission_id.to_string(),
        &source_code,
        ai_config,
    ) {
        Ok(prepared) => prepared,
        Err(error) => {
            return PrepareLuoguSubmissionNoteResult {
                submission_id: record.submission_id.to_string(),
                problem_id: record.problem_id.clone(),
                problem_title: record.problem_title.clone(),
                suggested_relative_path: String::new(),
                markdown: String::new(),
                source_code: source_code.clone(),
                draft_fallback: false,
                ai_status: "failed".to_string(),
                reason: Some(error),
                existing: false,
                skipped: false,
                skip_reason: None,
            };
        }
    };
    let existing = luogu_note_exists(notes_dir, &prepared.relative_path);

    PrepareLuoguSubmissionNoteResult {
        submission_id: record.submission_id.to_string(),
        problem_id: record.problem_id.clone(),
        problem_title: record.problem_title.clone(),
        suggested_relative_path: prepared.relative_path,
        markdown: prepared.markdown,
        source_code,
        draft_fallback: prepared.draft_fallback,
        ai_status: prepared.ai_status,
        reason: prepared.reason,
        existing,
        skipped: false,
        skip_reason: None,
    }
}

fn prepare_ai_first_luogu_note(
    problem_id: &str,
    problem_title: &str,
    submission_id: &str,
    source_code: &str,
    ai_config: &AiConfigFields,
) -> Result<PreparedLuoguNote, String> {
    let problem_id = normalize_problem_id(problem_id)?;
    if problem_title.trim().is_empty() {
        return Err("Luogu import failed: problem title cannot be empty".to_string());
    }
    if submission_id.trim().is_empty() {
        return Err("Luogu import failed: submission id cannot be empty".to_string());
    }

    let Some(candidate_comment) = extract_luogu_ai_candidate_comment(source_code) else {
        return build_raw_prepared_luogu_note(
            &problem_id,
            problem_title,
            submission_id,
            source_code,
            "没有找到 @oinb-insight 候选内容，已生成待整理源码草稿。",
        );
    };

    match organize_luogu_insight(
        ai_config,
        &OrganizeLuoguInsightInput {
            problem_id: problem_id.clone(),
            problem_title: problem_title.trim().to_string(),
            submission_id: submission_id.trim().to_string(),
            candidate_comment,
        },
    ) {
        Ok(insight) if insight.should_import => build_ai_prepared_luogu_note(
            &problem_id,
            submission_id,
            &insight,
            ai_config.model.trim(),
        ),
        Ok(_) => build_raw_prepared_luogu_note(
            &problem_id,
            problem_title,
            submission_id,
            source_code,
            "AI 判断这条注释暂不适合结构化导入，已生成待整理源码草稿。",
        ),
        Err(error) if should_fallback_to_raw_draft(&error) => build_raw_prepared_luogu_note(
            &problem_id,
            problem_title,
            submission_id,
            source_code,
            &format!("AI 未整理原因：{error}"),
        ),
        Err(error) => Err(error),
    }
}

fn import_luogu_insight_to_notes_dir(
    notes_dir: &Path,
    problem_id: &str,
    problem_title: &str,
    submission_id: &str,
    source_code: &str,
    ai_config: &AiConfigFields,
) -> Result<LuoguAiImportOutcome, String> {
    let problem_id = normalize_problem_id(problem_id)?;
    if problem_title.trim().is_empty() {
        return Err("Luogu import failed: problem title cannot be empty".to_string());
    }
    if submission_id.trim().is_empty() {
        return Err("Luogu import failed: submission id cannot be empty".to_string());
    }

    let Some(candidate_comment) = extract_luogu_ai_candidate_comment(source_code) else {
        return Ok(LuoguAiImportOutcome::NoCandidate);
    };

    let insight = organize_luogu_insight(
        ai_config,
        &OrganizeLuoguInsightInput {
            problem_id: problem_id.clone(),
            problem_title: problem_title.trim().to_string(),
            submission_id: submission_id.trim().to_string(),
            candidate_comment,
        },
    )?;

    if !insight.should_import {
        return Ok(LuoguAiImportOutcome::AiSkipped);
    }

    write_ai_luogu_note_to_notes_dir(
        notes_dir,
        &problem_id,
        submission_id,
        &insight,
        ai_config.model.trim(),
    )
    .map(LuoguAiImportOutcome::Imported)
}

fn luogu_submission_import_failed(
    submission_id: &str,
    problem_id: &str,
    problem_title: &str,
    relative_path: Option<String>,
    error: String,
    commit_status: &str,
) -> ImportLuoguSubmissionResult {
    ImportLuoguSubmissionResult {
        submission_id: submission_id.to_string(),
        problem_id: problem_id.to_string(),
        problem_title: problem_title.to_string(),
        relative_path,
        draft_fallback: false,
        skipped: false,
        skip_reason: None,
        failed: true,
        error: Some(error),
        committed: false,
        commit_status: commit_status.to_string(),
    }
}

fn luogu_submission_import_skipped(
    record: &LuoguSubmissionRecord,
    reason: String,
) -> ImportLuoguSubmissionResult {
    ImportLuoguSubmissionResult {
        submission_id: record.submission_id.to_string(),
        problem_id: record.problem_id.clone(),
        problem_title: record.problem_title.clone(),
        relative_path: None,
        draft_fallback: false,
        skipped: true,
        skip_reason: Some(reason),
        failed: false,
        error: None,
        committed: false,
        commit_status: "skipped".to_string(),
    }
}

fn import_luogu_submission_record(
    client: &reqwest::blocking::Client,
    uid: &str,
    client_id: &str,
    notes_dir: &Path,
    ai_config: &AiConfigFields,
    record: &LuoguSubmissionRecord,
    auto_commit: bool,
) -> ImportLuoguSubmissionResult {
    if !is_ac_status(&record.status) {
        return luogu_submission_import_skipped(
            record,
            format!("非 AC 提交，当前 verdict 为 {}", record.status),
        );
    }

    let source_code =
        match fetch_luogu_submission_source(client, uid, client_id, record.submission_id) {
            Ok(source_code) => source_code,
            Err(error) => {
                return luogu_submission_import_failed(
                    &record.submission_id.to_string(),
                    &record.problem_id,
                    &record.problem_title,
                    None,
                    error,
                    "skipped",
                );
            }
        };

    let mut draft_fallback = false;
    let imported = match import_luogu_insight_to_notes_dir(
        notes_dir,
        &record.problem_id,
        &record.problem_title,
        &record.submission_id.to_string(),
        &source_code,
        ai_config,
    ) {
        Ok(LuoguAiImportOutcome::Imported(imported)) => imported,
        Ok(LuoguAiImportOutcome::NoCandidate) => {
            draft_fallback = true;
            match write_raw_luogu_draft_to_notes_dir(
                notes_dir,
                &record.problem_id,
                &record.problem_title,
                &record.submission_id.to_string(),
                &source_code,
                "没有找到 @oinb-insight 候选内容，已生成待整理源码草稿。",
            ) {
                Ok(imported) => imported,
                Err(error) if error.contains("already exists") => {
                    return luogu_submission_import_skipped(record, format!("已存在：{error}"));
                }
                Err(error) => {
                    return luogu_submission_import_failed(
                        &record.submission_id.to_string(),
                        &record.problem_id,
                        &record.problem_title,
                        None,
                        error,
                        "skipped",
                    );
                }
            }
        }
        Ok(LuoguAiImportOutcome::AiSkipped) => {
            return luogu_submission_import_skipped(
                record,
                "AI 判断这条注释暂不适合导入".to_string(),
            );
        }
        Err(error) if error.contains("already exists") => {
            return luogu_submission_import_skipped(record, format!("已存在：{error}"));
        }
        Err(error) if should_fallback_to_raw_draft(&error) => {
            draft_fallback = true;
            match write_raw_luogu_draft_to_notes_dir(
                notes_dir,
                &record.problem_id,
                &record.problem_title,
                &record.submission_id.to_string(),
                &source_code,
                &format!("AI 未整理原因：{error}"),
            ) {
                Ok(imported) => imported,
                Err(error) if error.contains("already exists") => {
                    return luogu_submission_import_skipped(record, format!("已存在：{error}"));
                }
                Err(error) => {
                    return luogu_submission_import_failed(
                        &record.submission_id.to_string(),
                        &record.problem_id,
                        &record.problem_title,
                        None,
                        error,
                        "skipped",
                    );
                }
            }
        }
        Err(error) => {
            return luogu_submission_import_failed(
                &record.submission_id.to_string(),
                &record.problem_id,
                &record.problem_title,
                None,
                error,
                "skipped",
            );
        }
    };

    if !auto_commit {
        return ImportLuoguSubmissionResult {
            submission_id: record.submission_id.to_string(),
            problem_id: record.problem_id.clone(),
            problem_title: record.problem_title.clone(),
            relative_path: Some(imported.relative_path),
            draft_fallback,
            skipped: false,
            skip_reason: None,
            failed: false,
            error: None,
            committed: false,
            commit_status: "skipped".to_string(),
        };
    }

    match commit_note(imported.relative_path.clone(), None) {
        Ok(CommitNoteStatus::Committed) => ImportLuoguSubmissionResult {
            submission_id: record.submission_id.to_string(),
            problem_id: record.problem_id.clone(),
            problem_title: record.problem_title.clone(),
            relative_path: Some(imported.relative_path),
            draft_fallback,
            skipped: false,
            skip_reason: None,
            failed: false,
            error: None,
            committed: true,
            commit_status: "committed".to_string(),
        },
        Ok(CommitNoteStatus::NoChanges) => ImportLuoguSubmissionResult {
            submission_id: record.submission_id.to_string(),
            problem_id: record.problem_id.clone(),
            problem_title: record.problem_title.clone(),
            relative_path: Some(imported.relative_path),
            draft_fallback,
            skipped: false,
            skip_reason: None,
            failed: false,
            error: None,
            committed: false,
            commit_status: "noChanges".to_string(),
        },
        Err(error) => {
            let mut result = luogu_submission_import_failed(
                &record.submission_id.to_string(),
                &record.problem_id,
                &record.problem_title,
                Some(imported.relative_path),
                format!("Git 提交失败：{error}"),
                "failed",
            );
            result.draft_fallback = draft_fallback;
            result
        }
    }
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
    let config = read_config()?;

    match import_luogu_insight_to_notes_dir(
        &notes_dir,
        &problem_id,
        &problem_title,
        &submission_id,
        &source_code,
        &config.ai,
    )? {
        LuoguAiImportOutcome::Imported(imported) => Ok(imported),
        LuoguAiImportOutcome::NoCandidate => Err(
            "Luogu import failed: source code does not contain an AI insight comment candidate"
                .to_string(),
        ),
        LuoguAiImportOutcome::AiSkipped => Err(
            "Luogu import skipped: AI did not find enough reusable insight in the comment"
                .to_string(),
        ),
    }
}

#[tauri::command]
pub fn import_luogu_submission(
    submission_id: String,
    auto_commit: Option<bool>,
) -> Result<ImportLuoguSubmissionResult, String> {
    let submission_id = submission_id.trim();
    let parsed_submission_id = match submission_id.parse::<u64>() {
        Ok(value) if value > 0 => value,
        _ => {
            return Ok(luogu_submission_import_failed(
                submission_id,
                "",
                "",
                None,
                "submission_id 必须是正整数".to_string(),
                "skipped",
            ));
        }
    };

    let config = read_config()?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let uid = uid.to_string();
    let client_id = client_id.to_string();
    let records = fetch_luogu_submission_records(&uid, &client_id, 1)?;
    let Some(record) = records
        .into_iter()
        .find(|record| record.submission_id == parsed_submission_id)
    else {
        return Ok(luogu_submission_import_failed(
            submission_id,
            "",
            "",
            None,
            "未在最近提交列表中找到这条 submission".to_string(),
            "skipped",
        ));
    };

    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("Luogu import failed: cannot create notes directory: {e}"))?;
    let client = luogu_http_client()?;

    Ok(import_luogu_submission_record(
        &client,
        &uid,
        &client_id,
        &notes_dir,
        &config.ai,
        &record,
        auto_commit.unwrap_or(true),
    ))
}

#[tauri::command]
pub fn prepare_luogu_submission_note(
    submission_id: String,
    rules: Option<LuoguPrepareRules>,
) -> Result<PrepareLuoguSubmissionNoteResult, String> {
    let submission_id = submission_id.trim();
    let parsed_submission_id = match submission_id.parse::<u64>() {
        Ok(value) if value > 0 => value,
        _ => {
            return Err("submission_id 必须是正整数".to_string());
        }
    };

    let config = read_config()?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let uid = uid.to_string();
    let client_id = client_id.to_string();
    let Some(record) = find_luogu_submission_record_by_id(&uid, &client_id, parsed_submission_id)?
    else {
        return Err("未在最多 50 页洛谷提交列表中找到这条 submission".to_string());
    };

    let notes_dir = get_notes_dir()?;
    let client = luogu_http_client()?;
    let rules = rules.unwrap_or_default();

    Ok(prepare_luogu_submission_record_note(
        &client,
        &uid,
        &client_id,
        &notes_dir,
        &config.ai,
        &rules,
        &record,
    ))
}

#[tauri::command]
pub fn write_luogu_prepared_note(
    relative_path: String,
    markdown: String,
    auto_commit: Option<bool>,
) -> Result<WriteLuoguPreparedNoteResult, String> {
    let notes_dir = get_notes_dir()?;
    let (relative_path, target_path) =
        safe_luogu_note_path_for_write(&notes_dir, relative_path.trim())?;
    let (final_content, warning) = frontmatter::process_for_write(&markdown, &relative_path);
    if let Some(warning) = warning {
        return Ok(WriteLuoguPreparedNoteResult {
            relative_path: Some(relative_path),
            skipped: false,
            skip_reason: None,
            failed: true,
            error: Some(format!("生成的 frontmatter 有问题：{warning}")),
            committed: false,
            commit_status: "skipped".to_string(),
        });
    }

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!("Luogu write failed: cannot create note parent directory: {e}")
        })?;
    }

    let mut file = match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target_path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return Ok(WriteLuoguPreparedNoteResult {
                relative_path: Some(relative_path),
                skipped: true,
                skip_reason: Some("已存在，未覆盖".to_string()),
                failed: false,
                error: None,
                committed: false,
                commit_status: "skipped".to_string(),
            });
        }
        Err(e) => {
            return Err({
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                format!("已存在：{relative_path}")
            } else {
                format!("Luogu write failed: cannot create note {relative_path}: {e}")
            }
            });
        }
    };

    if let Err(error) = file.write_all(final_content.as_bytes()) {
        return Ok(WriteLuoguPreparedNoteResult {
            relative_path: Some(relative_path),
            skipped: false,
            skip_reason: None,
            failed: true,
            error: Some(format!("Luogu write failed: cannot write note: {error}")),
            committed: false,
            commit_status: "skipped".to_string(),
        });
    }

    if !auto_commit.unwrap_or(true) {
        return Ok(WriteLuoguPreparedNoteResult {
            relative_path: Some(relative_path),
            skipped: false,
            skip_reason: None,
            failed: false,
            error: None,
            committed: false,
            commit_status: "skipped".to_string(),
        });
    }

    match commit_note(relative_path.clone(), None) {
        Ok(CommitNoteStatus::Committed) => Ok(WriteLuoguPreparedNoteResult {
            relative_path: Some(relative_path),
            skipped: false,
            skip_reason: None,
            failed: false,
            error: None,
            committed: true,
            commit_status: "committed".to_string(),
        }),
        Ok(CommitNoteStatus::NoChanges) => Ok(WriteLuoguPreparedNoteResult {
            relative_path: Some(relative_path),
            skipped: false,
            skip_reason: None,
            failed: false,
            error: None,
            committed: false,
            commit_status: "noChanges".to_string(),
        }),
        Err(error) => Ok(WriteLuoguPreparedNoteResult {
            relative_path: Some(relative_path),
            skipped: false,
            skip_reason: None,
            failed: true,
            error: Some(format!("Git 提交失败：{error}")),
            committed: false,
            commit_status: "failed".to_string(),
        }),
    }
}

#[tauri::command]
pub fn get_luogu_config() -> Result<LuoguConfig, String> {
    read_config()
}

#[tauri::command]
pub fn save_luogu_config(config: LuoguConfig) -> Result<(), String> {
    let mut app_config = read_config()?;
    app_config.luogu = config.luogu;
    write_config(&app_config)
}

#[tauri::command]
pub fn update_luogu_last_submission_id(last_submission_id: Option<u64>) -> Result<(), String> {
    let mut config = read_config()?;
    config.luogu.last_submission_id = last_submission_id;
    write_config(&config)
}

#[tauri::command]
pub fn test_luogu_connection() -> Result<TestLuoguConnectionResult, String> {
    let config = read_config()?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let uid = uid.to_string();
    let client_id = client_id.to_string();
    fetch_luogu_submission_list(&uid, &client_id)
}

#[tauri::command]
pub fn preview_luogu_submissions(
    limit: Option<usize>,
) -> Result<PreviewLuoguSubmissionsResult, String> {
    let config = read_config()?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let uid = uid.to_string();
    let client_id = client_id.to_string();
    let limit = limit
        .unwrap_or(LUOGU_PREVIEW_DEFAULT_LIMIT)
        .clamp(1, LUOGU_PREVIEW_MAX_LIMIT);
    let last_submission_id = config.luogu.last_submission_id;

    let records = fetch_luogu_submission_records(&uid, &client_id, 1)?;
    let submissions = records
        .iter()
        .take(limit)
        .map(|record| submission_scan_preview(record, last_submission_id))
        .collect();

    Ok(PreviewLuoguSubmissionsResult {
        fetched_count: records.len(),
        limit,
        uid_configured: !config.luogu.uid.trim().is_empty(),
        client_id_configured: !config.luogu.client_id.trim().is_empty(),
        ai_configured: is_ai_configured(&config.ai),
        last_submission_id,
        submissions,
    })
}

#[tauri::command]
pub fn preview_luogu_submission_page(
    page: Option<u32>,
) -> Result<PreviewLuoguSubmissionPageResult, String> {
    let config = read_config()?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let uid = uid.to_string();
    let client_id = client_id.to_string();
    let page = page.unwrap_or(1).clamp(1, LUOGU_PREVIEW_MAX_PAGE);
    let last_submission_id = config.luogu.last_submission_id;

    let records = fetch_luogu_submission_records(&uid, &client_id, page)?;
    let fetched_count = records.len();
    let submissions = records
        .iter()
        .map(|record| submission_scan_preview(record, last_submission_id))
        .collect();

    Ok(PreviewLuoguSubmissionPageResult {
        page,
        fetched_count,
        has_more: fetched_count > 0 && page < LUOGU_PREVIEW_MAX_PAGE,
        uid_configured: !config.luogu.uid.trim().is_empty(),
        client_id_configured: !config.luogu.client_id.trim().is_empty(),
        ai_configured: is_ai_configured(&config.ai),
        last_submission_id,
        submissions,
    })
}

#[tauri::command]
pub fn sync_luogu_insights() -> Result<SyncLuoguInsightsResult, String> {
    let config_path = config_path()?;
    let mut config = read_luogu_config_from_path(&config_path)?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let uid = uid.to_string();
    let client_id = client_id.to_string();
    let ai_config = config.ai.clone();
    let ai_model = {
        let model = ai_config.model.trim();
        if model.is_empty() {
            None
        } else {
            Some(model.to_string())
        }
    };
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
    let mut ai_imported_count = 0;
    let mut ai_skipped_count = 0;
    let mut ai_failed_count = 0;
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

        let imported = match import_luogu_insight_to_notes_dir(
            &notes_dir,
            &record.problem_id,
            &record.problem_title,
            &record.submission_id.to_string(),
            &source_code,
            &ai_config,
        ) {
            Ok(LuoguAiImportOutcome::Imported(imported)) => imported,
            Ok(LuoguAiImportOutcome::NoCandidate) => {
                skipped_no_insight += 1;
                continue;
            }
            Ok(LuoguAiImportOutcome::AiSkipped) => {
                ai_skipped_count += 1;
                continue;
            }
            Err(error) if error.contains("already exists") => {
                skipped_existing += 1;
                warnings.push(error);
                continue;
            }
            Err(error) => {
                failed_count += 1;
                ai_failed_count += 1;
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
        ai_imported_count += 1;
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
            "Luogu sync completed: AI imported {ai_imported_count}, AI skipped {ai_skipped_count}, skipped {skipped_no_insight} without insight, skipped {skipped_existing} existing notes"
        )
    } else {
        format!(
            "Luogu sync completed with {failed_count} failure(s): AI imported {ai_imported_count}, AI skipped {ai_skipped_count}, AI failed {ai_failed_count}, skipped {skipped_no_insight} without insight, skipped {skipped_existing} existing notes"
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
        ai_imported_count,
        ai_skipped_count,
        ai_failed_count,
        ai_model,
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
    fn extracts_oinb_insight_as_luogu_ai_candidate() {
        let comment = extract_luogu_ai_candidate_comment(&sample_source()).unwrap();

        assert!(comment.contains("title: Interval Coverage"));
        assert!(comment.contains("## Insight"));
        assert!(!comment.contains("/*"));
        assert!(!comment.contains("*/"));
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
    fn generated_ai_frontmatter_uses_ai_fields_and_keeps_draft() {
        let insight = OrganizedLuoguInsight {
            should_import: true,
            title: "AI Interval Coverage".to_string(),
            tags: vec!["difference".to_string(), "pitfall".to_string()],
            difficulty: "improve+".to_string(),
            summary: "Boundary handling matters.".to_string(),
            draft: true,
            body: "## Insight\n\nUse a difference array.".to_string(),
        };

        let markdown = build_ai_note_markdown("P1234", "987654", &insight, "deepseek-chat");

        assert!(markdown.contains("title: AI Interval Coverage"));
        assert!(markdown.contains("tags: [difference, pitfall]"));
        assert!(markdown.contains("difficulty: improve+"));
        assert!(markdown.contains("source: luogu-P1234"));
        assert!(markdown.contains("summary: Boundary handling matters."));
        assert!(markdown.contains("draft: true"));
        assert!(markdown.contains("luogu_submission: '987654'"));
        assert!(markdown.contains("ai_generated: true"));
        assert!(markdown.contains("ai_model: deepseek-chat"));
        assert!(!markdown.contains("api_key"));
        assert!(!markdown.contains("base_url"));
        assert!(markdown.contains("## Insight"));
    }

    #[test]
    fn generated_raw_draft_keeps_source_and_is_draft() {
        let markdown = build_raw_luogu_draft_markdown(
            "P1234",
            "Interval Coverage",
            "987654",
            &sample_source(),
            "AI unavailable",
        );

        assert!(markdown.contains("tags: [洛谷, 待整理]"));
        assert!(markdown.contains("draft: true"));
        assert!(markdown.contains("ai_status: raw_draft_fallback"));
        assert!(markdown.contains("Submission ID: 987654"));
        assert!(markdown.contains("Problem: P1234 - Interval Coverage"));
        assert!(markdown.contains("AI unavailable"));
        assert!(markdown.contains("## Raw @oinb-insight Candidate"));
        assert!(markdown.contains("title: Interval Coverage"));
        assert!(markdown.contains("## Source Code"));
        assert!(markdown.contains("int main() { return 0; }"));
    }

    #[test]
    fn generated_raw_draft_allows_missing_insight_candidate() {
        let markdown = build_raw_luogu_draft_markdown(
            "P1000",
            "A+B Problem",
            "123456",
            "int main() { return 0; }",
            "No candidate",
        );

        assert!(markdown.contains("tags: [洛谷, 待整理]"));
        assert!(markdown.contains("No @oinb-insight or reusable tail comment candidate was found."));
        assert!(markdown.contains("```cpp\nint main() { return 0; }\n```"));
    }

    #[test]
    fn import_does_not_overwrite_existing_file() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();
        let insight = OrganizedLuoguInsight {
            should_import: true,
            title: "Interval Coverage".to_string(),
            tags: vec!["difference".to_string(), "construction".to_string()],
            difficulty: "improve+".to_string(),
            summary: "Find the difference-array view.".to_string(),
            draft: true,
            body: "## Insight\n\nUse a difference array.".to_string(),
        };

        let first = write_ai_luogu_note_to_notes_dir(
            notes_dir,
            "P1234",
            "987654",
            &insight,
            "deepseek-chat",
        )
        .unwrap();
        assert_eq!(first.relative_path, "luogu/P1234-Interval-Coverage.md");
        assert_eq!(first.ai_model, "deepseek-chat");

        let second = write_ai_luogu_note_to_notes_dir(
            notes_dir,
            "P1234",
            "987654",
            &insight,
            "deepseek-chat",
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
            ai: AiConfigFields {
                base_url: "https://api.example.com/v1".to_string(),
                api_key: "ai-secret".to_string(),
                model: "example-model".to_string(),
                ..AiConfigFields::default()
            },
        };

        write_luogu_config_to_path(&config_path, &config).unwrap();
        let raw = fs::read_to_string(&config_path).unwrap();
        let parsed = read_luogu_config_from_path(&config_path).unwrap();

        assert!(raw.contains("\"client_id\""));
        assert!(raw.contains("\"last_submission_id\""));
        assert!(raw.contains("\"base_url\""));
        assert!(raw.contains("\"api_key\""));
        assert!(raw.contains("\"model\""));
        assert_eq!(parsed, config);
    }

    #[test]
    fn reads_old_luogu_only_config_with_default_ai_fields() {
        let dir = tempdir().unwrap();
        let config_path = config_path_for_repo(dir.path());
        fs::create_dir_all(config_path.parent().unwrap()).unwrap();
        fs::write(
            &config_path,
            r#"{
  "luogu": {
    "uid": "12345",
    "client_id": "client-secret",
    "last_submission_id": 987654
  }
}
"#,
        )
        .unwrap();

        let parsed = read_luogu_config_from_path(&config_path).unwrap();

        assert_eq!(parsed.ai, AiConfigFields::default());
        assert_eq!(parsed.luogu.uid, "12345");
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
