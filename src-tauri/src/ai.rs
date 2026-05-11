use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};

use crate::luogu::{read_config, write_config, AiConfigFields};
use crate::paths;
use crate::prompts::{render_prompt_template, PromptTemplateKind};

const LUOGU_INSIGHT_TASK: &str = "luogu-insight";
const NOTE_METADATA_TASK: &str = "note-metadata";
const NOTE_POLISH_TASK: &str = "note-polish";
const AI_DIAGNOSTIC_PREVIEW_CHARS: usize = 500;
const AI_RESPONSE_RETRY_ATTEMPTS: usize = 2;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TestAiConnectionResult {
    pub model: String,
    pub ok: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct OrganizeLuoguInsightInput {
    pub problem_id: String,
    pub problem_title: String,
    pub submission_id: String,
    pub candidate_comment: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedNoteMetadata {
    pub title: String,
    pub tags: Vec<String>,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PolishedNoteBody {
    pub polished_body: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteChatContextInput {
    pub note_title: String,
    pub note_path: String,
    pub tags: Vec<String>,
    pub summary: String,
    pub selected_text: String,
    pub markdown: String,
    pub markdown_truncated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NoteChatAnswer {
    pub answer: String,
    pub model: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AiResponseIssueKind {
    RetryableMalformedResponse,
    NonRetryable,
}

#[derive(Debug, Clone)]
struct AiResponseIssue {
    kind: AiResponseIssueKind,
    message: String,
    debug: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) struct OrganizedLuoguInsight {
    pub should_import: bool,
    pub title: String,
    pub tags: Vec<String>,
    pub difficulty: String,
    pub summary: String,
    pub draft: bool,
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
struct AiCacheFile {
    created_at: String,
    task: String,
    model: String,
    response_json: JsonValue,
}

fn require_ai_config(config: &AiConfigFields) -> Result<(&str, &str, &str), String> {
    let base_url = config.base_url.trim().trim_end_matches('/');
    let api_key = config.api_key.trim();
    let model = config.model.trim();

    if base_url.is_empty() {
        return Err(
            "AI connection failed: base_url is missing in .oinb/config.json. 当前版本的 AI 配置保存在本机数据目录的 .oinb/config.json；release/安装版不会读取开发目录里的 .oinb/config.json，需要重新配置。请打开 AI 设置填写 base_url / api_key / model。"
                .to_string(),
        );
    }
    if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
        return Err(
            "AI connection failed: base_url must start with http:// or https://".to_string(),
        );
    }
    if api_key.is_empty() {
        return Err(
            "AI connection failed: api_key is missing in .oinb/config.json. 当前版本的 AI 配置保存在本机数据目录的 .oinb/config.json；release/安装版不会读取开发目录里的 .oinb/config.json，需要重新配置。请打开 AI 设置填写 base_url / api_key / model。"
                .to_string(),
        );
    }
    if api_key.contains(['\r', '\n']) {
        return Err("AI connection failed: api_key contains invalid characters".to_string());
    }
    if model.is_empty() {
        return Err(
            "AI connection failed: model is missing in .oinb/config.json. 当前版本的 AI 配置保存在本机数据目录的 .oinb/config.json；release/安装版不会读取开发目录里的 .oinb/config.json，需要重新配置。请打开 AI 设置填写 base_url / api_key / model。"
                .to_string(),
        );
    }

    Ok((base_url, api_key, model))
}

fn ai_cache_dir() -> Result<PathBuf, String> {
    Ok(paths::oinb_dir()?.join("ai-cache"))
}

fn stable_hash_hex(content: &str) -> String {
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x00000100000001b3;
    let mut first = FNV_OFFSET;
    let mut second = FNV_OFFSET ^ 0x9e3779b97f4a7c15;

    for byte in content.as_bytes() {
        first ^= u64::from(*byte);
        first = first.wrapping_mul(FNV_PRIME);
        second ^= u64::from(*byte).rotate_left(1);
        second = second
            .wrapping_mul(FNV_PRIME)
            .rotate_left(5)
            .wrapping_add(0x517cc1b727220a95);
    }

    format!("{first:016x}{second:016x}")
}

fn build_ai_cache_key(
    task: &str,
    config: &AiConfigFields,
    prompt: &str,
    context: JsonValue,
) -> Result<String, String> {
    let (base_url, _, model) = require_ai_config(config)?;
    let key_json = json!({
        "task": task,
        "model": model,
        "base_url_hash": stable_hash_hex(base_url),
        "prompt": prompt,
        "context": context,
    });
    let key_text = serde_json::to_string(&key_json)
        .map_err(|e| format!("AI cache failed: cannot serialize cache key: {e}"))?;

    Ok(stable_hash_hex(&key_text))
}

fn ai_cache_path(
    task: &str,
    config: &AiConfigFields,
    prompt: &str,
    context: JsonValue,
) -> Result<PathBuf, String> {
    let key = build_ai_cache_key(task, config, prompt, context)?;
    Ok(ai_cache_dir()?.join(format!("{task}-{key}.json")))
}

fn read_ai_cache(cache_path: &Path) -> Option<JsonValue> {
    let content = fs::read_to_string(cache_path).ok()?;
    let value = serde_json::from_str::<JsonValue>(&content).ok()?;
    value.get("response_json").cloned()
}

fn write_ai_cache(
    cache_path: &Path,
    task: &str,
    config: &AiConfigFields,
    response_json: &JsonValue,
) -> Result<(), String> {
    let (_, _, model) = require_ai_config(config)?;
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("AI cache failed: cannot create .oinb/ai-cache directory: {e}"))?;
    }

    let cache = AiCacheFile {
        created_at: Utc::now().to_rfc3339(),
        task: task.to_string(),
        model: model.to_string(),
        response_json: response_json.clone(),
    };
    let content = serde_json::to_string_pretty(&cache)
        .map_err(|e| format!("AI cache failed: cannot serialize cache file: {e}"))?;
    fs::write(cache_path, format!("{content}\n"))
        .map_err(|e| format!("AI cache failed: cannot write cache file: {e}"))
}

fn diagnostic_preview(text: &str) -> String {
    let normalized = text
        .chars()
        .map(|ch| if ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t' { ' ' } else { ch })
        .collect::<String>();
    let preview = normalized
        .chars()
        .take(AI_DIAGNOSTIC_PREVIEW_CHARS)
        .collect::<String>();
    if normalized.chars().count() > AI_DIAGNOSTIC_PREVIEW_CHARS {
        format!("{preview}...")
    } else {
        preview
    }
}

fn diagnostic_json_preview(value: &JsonValue) -> String {
    match serde_json::to_string(value) {
        Ok(text) => diagnostic_preview(&text),
        Err(_) => "<cannot serialize JSON preview>".to_string(),
    }
}

fn sanitize_ai_detail(text: &str) -> String {
    let detail = diagnostic_preview(text).replace('\n', "\\n").replace('\r', "\\r");
    if detail.is_empty() {
        "<empty>".to_string()
    } else {
        detail
    }
}

fn decode_response_body(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes).into_owned();
    text.trim_start_matches('\u{feff}').to_string()
}

fn looks_like_html(text: &str) -> bool {
    let trimmed = text.trim_start();
    let lowered = trimmed.chars().take(32).collect::<String>().to_ascii_lowercase();
    lowered.starts_with("<!doctype html")
        || lowered.starts_with("<html")
        || lowered.starts_with("<body")
        || lowered.starts_with("<head")
}

fn extract_provider_error_message(value: &JsonValue) -> Option<String> {
    value.get("error")
        .and_then(|error| error.get("message"))
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|message| !message.is_empty())
        .map(ToOwned::to_owned)
}

fn extract_chat_content(value: &JsonValue) -> Option<String> {
    let content = value
        .get("choices")
        .and_then(JsonValue::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))?;

    if let Some(text) = content.as_str() {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    if let Some(parts) = content.as_array() {
        let mut text_parts = Vec::new();
        for part in parts {
            let Some(part_type) = part.get("type").and_then(JsonValue::as_str) else {
                continue;
            };
            if part_type != "text" {
                continue;
            }
            let Some(text) = part.get("text").and_then(JsonValue::as_str) else {
                continue;
            };
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                text_parts.push(trimmed.to_string());
            }
        }
        if !text_parts.is_empty() {
            return Some(text_parts.join("\n"));
        }
    }

    None
}

impl AiResponseIssue {
    fn retryable(message: impl Into<String>, debug: impl Into<String>) -> Self {
        Self {
            kind: AiResponseIssueKind::RetryableMalformedResponse,
            message: message.into(),
            debug: debug.into(),
        }
    }

    fn non_retryable(message: impl Into<String>, debug: impl Into<String>) -> Self {
        Self {
            kind: AiResponseIssueKind::NonRetryable,
            message: message.into(),
            debug: debug.into(),
        }
    }

    fn is_retryable(&self) -> bool {
        self.kind == AiResponseIssueKind::RetryableMalformedResponse
    }

    fn into_error(self, scope: &str) -> String {
        if self.debug.is_empty() {
            format!("{scope}: {}", self.message)
        } else {
            format!("{scope}: {}; {}", self.message, self.debug)
        }
    }
}

fn chat_response_shape(value: &JsonValue) -> String {
    let choices = value.get("choices");
    let has_choices = choices.and_then(JsonValue::as_array).is_some();
    let first_choice = choices
        .and_then(JsonValue::as_array)
        .and_then(|items| items.first());
    let message = first_choice.and_then(|choice| choice.get("message"));
    let has_message = message.is_some();
    let content = message.and_then(|message| message.get("content"));
    let has_content = content.and_then(JsonValue::as_str).is_some();

    format!("choices={has_choices}, message={has_message}, content={has_content}")
}

fn parse_ai_ok_response(content: &str) -> Result<bool, String> {
    let value = parse_json_object_from_ai_content(content, "AI connection failed")?;

    value
        .get("ok")
        .and_then(JsonValue::as_bool)
        .ok_or_else(|| "AI connection failed: response JSON did not contain boolean ok".to_string())
}

fn parse_json_object_from_ai_content(content: &str, scope: &str) -> Result<JsonValue, String> {
    let trimmed = content.trim();
    let json_text = if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        &trimmed[start..=end]
    } else {
        trimmed
    };

    serde_json::from_str(json_text).map_err(|e| {
        format!(
            "{scope}: response JSON parse failed: {e}; content_preview={}",
            diagnostic_preview(content)
        )
    })
}

fn request_chat_completion(
    config: &AiConfigFields,
    messages: JsonValue,
    temperature: f32,
    scope: &str,
) -> Result<String, String> {
    let (base_url, api_key, model) = require_ai_config(config)?;
    let url = format!("{base_url}/chat/completions");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("AI connection failed: cannot create HTTP client: {e}"))?;

    let request_body = json!({
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "response_format": { "type": "json_object" }
    });

    let mut last_issue: Option<AiResponseIssue> = None;

    for attempt in 1..=AI_RESPONSE_RETRY_ATTEMPTS {
        let response = client
            .post(&url)
            .bearer_auth(api_key)
            .header(reqwest::header::ACCEPT, "application/json")
            .json(&request_body)
            .send()
            .map_err(|e| {
                if e.is_timeout() {
                    format!("{scope}: request timed out")
                } else {
                    format!("{scope}: network error")
                }
            })?;

        match parse_chat_completion_response(response) {
            Ok(content) => return Ok(content),
            Err(issue) => {
                let should_retry = issue.is_retryable() && attempt < AI_RESPONSE_RETRY_ATTEMPTS;
                eprintln!(
                    "{scope}: attempt {attempt}/{} failed: {}",
                    AI_RESPONSE_RETRY_ATTEMPTS,
                    issue.clone().into_error(scope)
                );
                if should_retry {
                    last_issue = Some(issue);
                    continue;
                }
                return Err(issue.into_error(scope));
            }
        }
    }

    Err(last_issue
        .unwrap_or_else(|| {
            AiResponseIssue::retryable("AI 服务返回了无法解析的响应，请重试。", "debug=retry-exhausted")
        })
        .into_error(scope))
}

fn parse_chat_completion_response(
    response: reqwest::blocking::Response,
) -> Result<String, AiResponseIssue> {
    let status = response.status();
    let status_code = status.as_u16();
    let bytes = response.bytes().map_err(|e| {
        if status.is_success() {
            AiResponseIssue::retryable(
                "AI 服务响应体读取失败，请重试。",
                format!("debug=http_status={status_code}; read_error={e}"),
            )
        } else {
            AiResponseIssue::non_retryable(
                format!("AI 服务返回了 HTTP {status_code}。"),
                format!("debug=http_status={status_code}; error_body_read_failed={e}"),
            )
        }
    })?;
    let body = decode_response_body(&bytes);
    let body_trimmed = body.trim();

    if !status.is_success() {
        if body_trimmed.is_empty() {
            return Err(AiResponseIssue::non_retryable(
                format!("AI 服务返回了 HTTP {status_code}。"),
                format!("debug=http_status={status_code}; error_body=empty"),
            ));
        }

        if looks_like_html(body_trimmed) {
            return Err(AiResponseIssue::non_retryable(
                format!("AI 服务返回了 HTTP {status_code}，且错误响应不是 JSON。"),
                format!(
                    "debug=http_status={status_code}; error_body_preview={}",
                    sanitize_ai_detail(body_trimmed)
                ),
            ));
        }

        if let Ok(value) = serde_json::from_str::<JsonValue>(body_trimmed) {
            if let Some(provider_message) = extract_provider_error_message(&value) {
                return Err(AiResponseIssue::non_retryable(
                    provider_message,
                    format!("debug=http_status={status_code}; provider_error=true"),
                ));
            }
            return Err(AiResponseIssue::non_retryable(
                format!("AI 服务返回了 HTTP {status_code}。"),
                format!(
                    "debug=http_status={status_code}; error_json_preview={}",
                    diagnostic_json_preview(&value)
                ),
            ));
        }

        return Err(AiResponseIssue::non_retryable(
            format!("AI 服务返回了 HTTP {status_code}。"),
            format!(
                "debug=http_status={status_code}; error_body_preview={}",
                sanitize_ai_detail(body_trimmed)
            ),
        ));
    }

    if body_trimmed.is_empty() {
        return Err(AiResponseIssue::retryable(
            "AI 服务返回空响应，请重试。",
            format!("debug=http_status={status_code}; body=empty"),
        ));
    }

    if looks_like_html(body_trimmed) {
        return Err(AiResponseIssue::retryable(
            "AI 服务返回了非 JSON 响应，请重试。",
            format!(
                "debug=http_status={status_code}; html_body_preview={}",
                sanitize_ai_detail(body_trimmed)
            ),
        ));
    }

    let value = serde_json::from_str::<JsonValue>(body_trimmed).map_err(|e| {
        AiResponseIssue::retryable(
            "AI 服务返回了无法解析的响应，请重试。",
            format!(
                "debug=http_status={status_code}; json_parse_error={e}; body_preview={}",
                sanitize_ai_detail(body_trimmed)
            ),
        )
    })?;

    if let Some(provider_message) = extract_provider_error_message(&value) {
        return Err(AiResponseIssue::non_retryable(
            provider_message,
            format!("debug=http_status={status_code}; provider_error=true"),
        ));
    }

    let shape = chat_response_shape(&value);
    extract_chat_content(&value).ok_or_else(|| {
        AiResponseIssue::retryable(
            "AI 服务响应格式不符合预期，请重试。",
            format!(
                "debug=http_status={status_code}; {shape}; body_preview={}",
                diagnostic_json_preview(&value)
            ),
        )
    })
}

fn test_ai_connection_with_config(
    config: &AiConfigFields,
) -> Result<TestAiConnectionResult, String> {
    let messages = json!([
        {
            "role": "system",
            "content": "Return only strict JSON. No markdown."
        },
        {
            "role": "user",
            "content": "Return exactly {\"ok\": true}."
        }
    ]);
    let content = request_chat_completion(config, messages, 0.0, "AI connection failed")?;
    let ok = parse_ai_ok_response(&content)?;
    let (_, _, model) = require_ai_config(config)?;

    if !ok {
        return Err("AI connection failed: model returned ok=false".to_string());
    }

    Ok(TestAiConnectionResult {
        model: model.to_string(),
        ok,
    })
}

fn validate_organized_luogu_insight(
    value: JsonValue,
    scope: &str,
) -> Result<OrganizedLuoguInsight, String> {
    let insight: OrganizedLuoguInsight = serde_json::from_value(value)
        .map_err(|_| format!("{scope}: response JSON schema was unexpected"))?;

    if !insight.should_import {
        return Ok(insight);
    }

    if insight.title.trim().is_empty() {
        return Err(format!("{scope}: response title was empty"));
    }
    if insight.tags.len() < 2 || insight.tags.len() > 5 {
        return Err(format!("{scope}: response tags must contain 2-5 items"));
    }
    if insight.tags.iter().any(|tag| tag.trim().is_empty()) {
        return Err(format!("{scope}: response tags contained an empty item"));
    }
    if insight.body.trim().is_empty() {
        return Err(format!("{scope}: response body was empty"));
    }

    Ok(insight)
}

fn normalize_metadata_tags(tags: Vec<String>, scope: &str) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();

    for tag in tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !normalized.iter().any(|existing| existing == trimmed) {
            normalized.push(trimmed.to_string());
        }
        if normalized.len() == 5 {
            break;
        }
    }

    if normalized.len() < 3 {
        return Err(format!(
            "{scope}: response tags must contain 3-5 non-empty items"
        ));
    }

    Ok(normalized)
}

fn validate_generated_note_metadata(
    value: JsonValue,
    scope: &str,
) -> Result<GeneratedNoteMetadata, String> {
    let title = value
        .get("title")
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .ok_or_else(|| format!("{scope}: response title was missing or empty"))?
        .to_string();
    let summary = value
        .get("summary")
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|summary| !summary.is_empty())
        .ok_or_else(|| format!("{scope}: response summary was missing or empty"))?
        .to_string();
    let tags_value = value
        .get("tags")
        .and_then(JsonValue::as_array)
        .ok_or_else(|| format!("{scope}: response tags must be an array"))?;
    let mut raw_tags = Vec::new();
    for tag in tags_value {
        let Some(tag_text) = tag.as_str() else {
            return Err(format!("{scope}: response tags must only contain strings"));
        };
        raw_tags.push(tag_text.to_string());
    }
    let tags = normalize_metadata_tags(raw_tags, scope)?;

    Ok(GeneratedNoteMetadata {
        title,
        tags,
        summary,
    })
}

fn markdown_body_without_frontmatter(markdown: &str) -> &str {
    let Some(after_open) = markdown.strip_prefix("---") else {
        return markdown;
    };
    let after_open = after_open
        .strip_prefix("\r\n")
        .or_else(|| after_open.strip_prefix('\n'));
    let Some(after_open) = after_open else {
        return markdown;
    };

    let mut offset = markdown.len() - after_open.len();
    for line in after_open.split_inclusive('\n') {
        let line_without_newline = line.trim_end_matches(['\r', '\n']);
        if line_without_newline.trim() == "---" {
            return &markdown[offset + line.len()..];
        }
        offset += line.len();
    }

    markdown
}

fn validate_polished_note_body(value: JsonValue, scope: &str) -> Result<PolishedNoteBody, String> {
    let polished_body = value
        .get("polished_body")
        .and_then(JsonValue::as_str)
        .filter(|body| !body.trim().is_empty())
        .ok_or_else(|| {
            format!(
                "{scope}: response JSON schema failed: polished_body was missing or empty; json_preview={}",
                diagnostic_json_preview(&value)
            )
        })?
        .to_string();

    Ok(PolishedNoteBody { polished_body })
}

fn validate_note_chat_answer(value: JsonValue, scope: &str) -> Result<String, String> {
    value
        .get("answer")
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|answer| !answer.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| {
            format!(
                "{scope}: response JSON schema failed: answer was missing or empty; json_preview={}",
                diagnostic_json_preview(&value)
            )
        })
}

pub(crate) fn organize_luogu_insight(
    config: &AiConfigFields,
    input: &OrganizeLuoguInsightInput,
) -> Result<OrganizedLuoguInsight, String> {
    let user_prompt = render_prompt_template(
        PromptTemplateKind::LuoguInsight,
        &[
            ("problem_id", input.problem_id.trim()),
            ("problem_title", input.problem_title.trim()),
            ("submission_id", input.submission_id.trim()),
            ("candidate_comment", input.candidate_comment.trim()),
        ],
    )?;
    let cache_context = json!({
        "problem_id": input.problem_id.trim(),
        "problem_title": input.problem_title.trim(),
        "submission_id": input.submission_id.trim(),
        "candidate_comment": input.candidate_comment.trim(),
    });
    let cache_path = ai_cache_path(
        LUOGU_INSIGHT_TASK,
        config,
        &user_prompt,
        cache_context.clone(),
    )?;
    if let Some(value) = read_ai_cache(&cache_path) {
        if let Ok(insight) = validate_organized_luogu_insight(value, "Luogu AI insight failed") {
            return Ok(insight);
        }
    }

    let messages = json!([
        {
            "role": "system",
            "content": "Return only strict JSON. Do not use markdown fences."
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion(config, messages, 0.2, "Luogu AI insight failed")?;
    let value = parse_json_object_from_ai_content(&content, "Luogu AI insight failed")?;
    let insight = validate_organized_luogu_insight(value.clone(), "Luogu AI insight failed")?;
    let _ = write_ai_cache(&cache_path, LUOGU_INSIGHT_TASK, config, &value);

    Ok(insight)
}

#[tauri::command]
pub fn generate_note_metadata(
    relative_path: String,
    markdown_content: String,
) -> Result<GeneratedNoteMetadata, String> {
    let relative_path = relative_path.trim();
    let markdown_content = markdown_content.trim();
    if relative_path.is_empty() {
        return Err("AI metadata failed: note path is missing".to_string());
    }
    if markdown_content.is_empty() {
        return Err("AI metadata failed: note content is empty".to_string());
    }

    let config = read_config()?.ai;
    let user_prompt = render_prompt_template(
        PromptTemplateKind::NoteMetadata,
        &[("note_path", relative_path), ("content", markdown_content)],
    )?;
    let cache_context = json!({
        "note_path": relative_path,
        "content": markdown_content,
    });
    let cache_path = ai_cache_path(
        NOTE_METADATA_TASK,
        &config,
        &user_prompt,
        cache_context.clone(),
    )?;
    if let Some(value) = read_ai_cache(&cache_path) {
        if let Ok(metadata) = validate_generated_note_metadata(value, "AI metadata failed") {
            return Ok(metadata);
        }
    }

    let messages = json!([
        {
            "role": "system",
            "content": "Return only strict JSON. Do not use markdown fences."
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion(&config, messages, 0.2, "AI metadata failed")?;
    let value = parse_json_object_from_ai_content(&content, "AI metadata failed")?;
    let metadata = validate_generated_note_metadata(value.clone(), "AI metadata failed")?;
    let _ = write_ai_cache(&cache_path, NOTE_METADATA_TASK, &config, &value);

    Ok(metadata)
}

#[tauri::command]
pub fn polish_note_body(
    relative_path: String,
    markdown_content: String,
) -> Result<PolishedNoteBody, String> {
    let relative_path = relative_path.trim();
    if relative_path.is_empty() {
        return Err("AI polish failed: note path is missing".to_string());
    }
    if markdown_content.trim().is_empty() {
        return Err("AI polish failed: note content is empty".to_string());
    }

    let body = markdown_body_without_frontmatter(&markdown_content);
    if body.trim().is_empty() {
        return Err("AI polish failed: note body is empty".to_string());
    }

    let config = read_config()?.ai;
    let user_prompt = render_prompt_template(
        PromptTemplateKind::NotePolish,
        &[("note_path", relative_path), ("body", body)],
    )?;
    let cache_context = json!({
        "note_path": relative_path,
        "body": body,
    });
    let cache_path = ai_cache_path(
        NOTE_POLISH_TASK,
        &config,
        &user_prompt,
        cache_context.clone(),
    )?;
    let cache_diagnostic = if let Some(value) = read_ai_cache(&cache_path) {
        match validate_polished_note_body(value, "AI polish failed") {
            Ok(polished) => {
                return Ok(polished);
            }
            Err(e) => {
                format!("cache=hit-invalid ({e})")
            }
        }
    } else if cache_path.exists() {
        "cache=hit-unreadable-or-corrupt".to_string()
    } else {
        "cache=miss".to_string()
    };

    let messages = json!([
        {
            "role": "system",
            "content": "Return only strict JSON. Do not use markdown fences."
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion(&config, messages, 0.2, "AI polish failed")
        .map_err(|e| format!("{e}; source=fresh-request; {cache_diagnostic}"))?;
    let value = parse_json_object_from_ai_content(&content, "AI polish failed")
        .map_err(|e| format!("{e}; http_status=2xx; source=fresh-request; {cache_diagnostic}"))?;
    let polished = validate_polished_note_body(value.clone(), "AI polish failed")
        .map_err(|e| format!("{e}; http_status=2xx; source=fresh-request; {cache_diagnostic}"))?;
    let _ = write_ai_cache(&cache_path, NOTE_POLISH_TASK, &config, &value);

    Ok(polished)
}

#[tauri::command]
pub fn chat_with_current_note(
    question: String,
    context: NoteChatContextInput,
) -> Result<NoteChatAnswer, String> {
    let question = question.trim();
    if question.is_empty() {
        return Err("AI chat failed: question is empty".to_string());
    }

    let note_path = context.note_path.trim();
    if note_path.is_empty() {
        return Err("AI chat failed: note path is missing".to_string());
    }

    let note_title = context.note_title.trim();
    if note_title.is_empty() {
        return Err("AI chat failed: note title is missing".to_string());
    }

    let markdown = context.markdown.trim();
    if markdown.is_empty() {
        return Err("AI chat failed: note content is empty".to_string());
    }

    let config = read_config()?.ai;
    let selected_text = context.selected_text.trim();
    let tags_text = if context.tags.is_empty() {
        "未填写".to_string()
    } else {
        context
            .tags
            .iter()
            .map(|tag| tag.trim())
            .filter(|tag| !tag.is_empty())
            .collect::<Vec<_>>()
            .join(", ")
    };
    let summary_text = if context.summary.trim().is_empty() {
        "未填写".to_string()
    } else {
        context.summary.trim().to_string()
    };
    let selection_section = if selected_text.is_empty() {
        "用户当前没有选中文段。".to_string()
    } else {
        format!("这是用户当前选中的内容，请优先参考：\n{selected_text}")
    };
    let truncation_note = if context.markdown_truncated {
        "正文是截断后的节选，不是整篇全文。若信息不足，请明确说明。"
    } else {
        "正文是当前笔记的完整内容。"
    };

    let user_prompt = format!(
        "你正在帮助用户理解当前 OI Notebook 笔记。\n\
请基于下面的笔记上下文回答最后的问题；如果笔记里没有足够信息，请明确说不知道或信息不足，不要编造。\n\
除非用户明确要求，而且当前阶段也只能给建议，不要自动改写原文或声称已经修改文件。\n\
你可以回答算法、题解、Markdown 表达、写作建议，但都要尽量贴合当前笔记。\n\
请只返回 JSON，格式为 {{\"answer\":\"...\"}}。\n\n\
【笔记标题】\n{note_title}\n\n\
【笔记路径】\n{note_path}\n\n\
【tags】\n{tags_text}\n\n\
【summary】\n{summary_text}\n\n\
【选中文段】\n{selection_section}\n\n\
【正文说明】\n{truncation_note}\n\n\
【当前正文 Markdown】\n{markdown}\n\n\
【用户问题】\n{question}"
    );
    let messages = json!([
        {
            "role": "system",
            "content": "You are an OI Notebook assistant. Return only strict JSON with an answer field. Do not use markdown fences."
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion(&config, messages, 0.2, "AI chat failed")?;
    let value = parse_json_object_from_ai_content(&content, "AI chat failed")?;
    let answer = validate_note_chat_answer(value, "AI chat failed")?;
    let (_, _, model) = require_ai_config(&config)?;

    Ok(NoteChatAnswer {
        answer,
        model: model.to_string(),
    })
}

#[tauri::command]
pub fn get_ai_config() -> Result<AiConfigFields, String> {
    Ok(read_config()?.ai)
}

#[tauri::command]
pub fn save_ai_config(config: AiConfigFields) -> Result<(), String> {
    let mut app_config = read_config()?;
    app_config.ai = AiConfigFields {
        base_url: config.base_url.trim().trim_end_matches('/').to_string(),
        api_key: config.api_key.trim().to_string(),
        model: config.model.trim().to_string(),
    };
    write_config(&app_config)
}

#[tauri::command]
pub fn test_ai_connection() -> Result<TestAiConnectionResult, String> {
    let config = read_config()?;
    test_ai_connection_with_config(&config.ai)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_ai_ok_json() {
        assert!(parse_ai_ok_response(r#"{"ok": true}"#).unwrap());
    }

    #[test]
    fn parses_ai_ok_json_inside_extra_text() {
        assert!(parse_ai_ok_response("```json\n{\"ok\": true}\n```").unwrap());
    }

    #[test]
    fn rejects_ai_ok_response_without_boolean_ok() {
        assert!(parse_ai_ok_response(r#"{"ok": "true"}"#).is_err());
    }

    #[test]
    fn validates_organized_luogu_insight_json() {
        let value = json!({
            "should_import": true,
            "title": "P1000 insight",
            "tags": ["math", "trick"],
            "difficulty": "",
            "summary": "Remember the boundary.",
            "draft": true,
            "body": "## Insight\n\nRemember the boundary."
        });

        let insight = validate_organized_luogu_insight(value, "test").unwrap();

        assert!(insight.should_import);
        assert_eq!(insight.tags, vec!["math", "trick"]);
        assert!(insight.draft);
    }

    #[test]
    fn allows_ai_to_decline_luogu_import() {
        let value = json!({
            "should_import": false,
            "title": "",
            "tags": [],
            "difficulty": "",
            "summary": "",
            "draft": true,
            "body": ""
        });

        let insight = validate_organized_luogu_insight(value, "test").unwrap();

        assert!(!insight.should_import);
    }

    #[test]
    fn rejects_importable_luogu_insight_with_too_few_tags() {
        let value = json!({
            "should_import": true,
            "title": "P1000 insight",
            "tags": ["math"],
            "difficulty": "",
            "summary": "Remember the boundary.",
            "draft": true,
            "body": "## Insight\n\nRemember the boundary."
        });

        assert!(validate_organized_luogu_insight(value, "test")
            .unwrap_err()
            .contains("tags must contain 2-5 items"));
    }

    #[test]
    fn validates_generated_note_metadata_json() {
        let value = json!({
            "title": "Monotonic Queue DP",
            "tags": ["DP", "monotonic queue", "optimization"],
            "summary": "Uses a monotonic queue to optimize a DP transition."
        });

        let metadata = validate_generated_note_metadata(value, "test").unwrap();

        assert_eq!(metadata.title, "Monotonic Queue DP");
        assert_eq!(metadata.tags, vec!["DP", "monotonic queue", "optimization"]);
        assert_eq!(
            metadata.summary,
            "Uses a monotonic queue to optimize a DP transition."
        );
    }

    #[test]
    fn trims_deduplicates_and_limits_metadata_tags() {
        let tags = normalize_metadata_tags(
            vec![
                " DP ".to_string(),
                "graph".to_string(),
                "DP".to_string(),
                "".to_string(),
                "shortest path".to_string(),
                "Dijkstra".to_string(),
                "priority queue".to_string(),
                "extra".to_string(),
            ],
            "test",
        )
        .unwrap();

        assert_eq!(
            tags,
            vec!["DP", "graph", "shortest path", "Dijkstra", "priority queue"]
        );
    }

    #[test]
    fn rejects_metadata_with_too_few_tags_after_normalization() {
        let value = json!({
            "title": "Tiny note",
            "tags": ["DP", "DP", " "],
            "summary": "A tiny note."
        });

        assert!(validate_generated_note_metadata(value, "test")
            .unwrap_err()
            .contains("3-5"));
    }

    #[test]
    fn extracts_body_after_frontmatter() {
        let markdown = "---\ntitle: Test\n---\n\n## Body\n\ncontent";

        assert_eq!(
            markdown_body_without_frontmatter(markdown),
            "\n## Body\n\ncontent"
        );
    }

    #[test]
    fn leaves_markdown_without_frontmatter_unchanged() {
        let markdown = "# Title\n\ncontent";

        assert_eq!(markdown_body_without_frontmatter(markdown), markdown);
    }

    #[test]
    fn validates_polished_note_body_json() {
        let value = json!({
            "polished_body": "## Insight\n\nA clearer explanation."
        });

        let polished = validate_polished_note_body(value, "test").unwrap();

        assert_eq!(
            polished.polished_body,
            "## Insight\n\nA clearer explanation."
        );
    }

    #[test]
    fn rejects_empty_polished_note_body() {
        let value = json!({
            "polished_body": "   "
        });

        assert!(validate_polished_note_body(value, "test")
            .unwrap_err()
            .contains("polished_body"));
    }

    #[test]
    fn requires_base_url_api_key_and_model() {
        let config = AiConfigFields::default();

        assert!(require_ai_config(&config)
            .unwrap_err()
            .contains("base_url is missing"));
    }

    #[test]
    fn trims_base_url_slash_for_required_config() {
        let config = AiConfigFields {
            base_url: "https://api.example.com/v1/".to_string(),
            api_key: "secret".to_string(),
            model: "model".to_string(),
        };

        let (base_url, _, model) = require_ai_config(&config).unwrap();

        assert_eq!(base_url, "https://api.example.com/v1");
        assert_eq!(model, "model");
    }

    #[test]
    fn same_input_generates_same_cache_key() {
        let config = AiConfigFields {
            base_url: "https://api.example.com/v1".to_string(),
            api_key: "secret-one".to_string(),
            model: "model-a".to_string(),
        };
        let context = json!({
            "note_path": "tricks/a.md",
            "content": "# A"
        });

        let first =
            build_ai_cache_key(NOTE_METADATA_TASK, &config, "prompt", context.clone()).unwrap();
        let second = build_ai_cache_key(NOTE_METADATA_TASK, &config, "prompt", context).unwrap();

        assert_eq!(first, second);
    }

    #[test]
    fn prompt_change_changes_cache_key() {
        let config = AiConfigFields {
            base_url: "https://api.example.com/v1".to_string(),
            api_key: "secret-one".to_string(),
            model: "model-a".to_string(),
        };
        let context = json!({
            "note_path": "tricks/a.md",
            "content": "# A"
        });

        let first =
            build_ai_cache_key(NOTE_METADATA_TASK, &config, "prompt one", context.clone()).unwrap();
        let second =
            build_ai_cache_key(NOTE_METADATA_TASK, &config, "prompt two", context).unwrap();

        assert_ne!(first, second);
    }

    #[test]
    fn model_change_changes_cache_key() {
        let mut config = AiConfigFields {
            base_url: "https://api.example.com/v1".to_string(),
            api_key: "secret-one".to_string(),
            model: "model-a".to_string(),
        };
        let context = json!({
            "note_path": "tricks/a.md",
            "content": "# A"
        });

        let first =
            build_ai_cache_key(NOTE_METADATA_TASK, &config, "prompt", context.clone()).unwrap();
        config.model = "model-b".to_string();
        let second = build_ai_cache_key(NOTE_METADATA_TASK, &config, "prompt", context).unwrap();

        assert_ne!(first, second);
    }

    #[test]
    fn cache_json_does_not_contain_api_key() {
        let config = AiConfigFields {
            base_url: "https://api.example.com/v1".to_string(),
            api_key: "secret-one".to_string(),
            model: "model-a".to_string(),
        };
        let cache = AiCacheFile {
            created_at: "2026-05-05T00:00:00Z".to_string(),
            task: NOTE_METADATA_TASK.to_string(),
            model: config.model.clone(),
            response_json: json!({
                "title": "A",
                "tags": ["DP", "graph", "trick"],
                "summary": "A short summary."
            }),
        };

        let serialized = serde_json::to_string(&cache).unwrap();

        assert!(!serialized.contains(&config.api_key));
        assert!(!serialized.contains("api_key"));
        assert!(!serialized.contains("base_url"));
    }
}
