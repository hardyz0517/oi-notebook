use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    time::Duration,
};

use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use serde_yaml::{Mapping, Value as YamlValue};

use crate::frontmatter;

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

fn parse_luogu_submission_record(record: &JsonValue) -> Result<LuoguSubmissionPreview, String> {
    let submission_id = record
        .get("id")
        .and_then(value_to_string)
        .ok_or_else(|| "Luogu connection failed: submission record is missing id".to_string())?;

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

    Ok(LuoguSubmissionPreview {
        submission_id,
        problem_id,
        problem_title,
        status,
        submit_time,
    })
}

fn parse_luogu_submission_list(value: &JsonValue) -> Result<TestLuoguConnectionResult, String> {
    let records = value
        .pointer("/currentData/records/result")
        .or_else(|| value.pointer("/currentData/submissions/result"))
        .or_else(|| value.pointer("/data/records/result"))
        .or_else(|| value.pointer("/data/submissions/result"))
        .and_then(JsonValue::as_array)
        .ok_or_else(|| {
            "Luogu connection failed: unexpected submissions JSON structure".to_string()
        })?;

    let submissions = records
        .iter()
        .take(5)
        .map(parse_luogu_submission_record)
        .collect::<Result<Vec<_>, _>>()?;

    Ok(TestLuoguConnectionResult {
        fetched_count: records.len(),
        submissions,
    })
}

fn fetch_luogu_submission_list(
    uid: &str,
    client_id: &str,
) -> Result<TestLuoguConnectionResult, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("Luogu connection failed: cannot create HTTP client: {e}"))?;
    let url = format!("https://www.luogu.com.cn/record/list?user={uid}&page=1&_contentOnly=1");
    let cookie = format!("_uid={uid}; __client_id={client_id}");

    let response = client
        .get(url)
        .header(reqwest::header::COOKIE, cookie)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .map_err(|e| {
            if e.is_timeout() {
                "Luogu connection failed: request timed out".to_string()
            } else {
                format!("Luogu connection failed: network error: {e}")
            }
        })?;

    let status = response.status();
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Err("Luogu connection failed: Cookie may be invalid or expired".to_string());
    }
    if !status.is_success() {
        return Err(format!(
            "Luogu connection failed: server returned HTTP {}",
            status.as_u16()
        ));
    }

    let json = response
        .json::<JsonValue>()
        .map_err(|e| format!("Luogu connection failed: cannot parse response JSON: {e}"))?;
    parse_luogu_submission_list(&json)
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
    fetch_luogu_submission_list(uid, client_id)
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
    fn rejects_unexpected_luogu_submission_json() {
        let json = serde_json::json!({ "currentData": {} });

        assert!(parse_luogu_submission_list(&json)
            .unwrap_err()
            .contains("unexpected submissions JSON structure"));
    }
}
