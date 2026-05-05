use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};

use crate::luogu::{read_config, write_config, AiConfigFields};

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

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    message: ChatCompletionMessage,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionMessage {
    content: String,
}

fn require_ai_config(config: &AiConfigFields) -> Result<(&str, &str, &str), String> {
    let base_url = config.base_url.trim().trim_end_matches('/');
    let api_key = config.api_key.trim();
    let model = config.model.trim();

    if base_url.is_empty() {
        return Err("AI connection failed: base_url is missing in .oinb/config.json".to_string());
    }
    if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
        return Err(
            "AI connection failed: base_url must start with http:// or https://".to_string(),
        );
    }
    if api_key.is_empty() {
        return Err("AI connection failed: api_key is missing in .oinb/config.json".to_string());
    }
    if api_key.contains(['\r', '\n']) {
        return Err("AI connection failed: api_key contains invalid characters".to_string());
    }
    if model.is_empty() {
        return Err("AI connection failed: model is missing in .oinb/config.json".to_string());
    }

    Ok((base_url, api_key, model))
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

    serde_json::from_str(json_text).map_err(|_| format!("{scope}: response was not valid JSON"))
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

    let response = client
        .post(url)
        .bearer_auth(api_key)
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&json!({
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "response_format": { "type": "json_object" }
        }))
        .send()
        .map_err(|e| {
            if e.is_timeout() {
                format!("{scope}: request timed out")
            } else {
                format!("{scope}: network error")
            }
        })?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("{scope}: server returned HTTP {}", status.as_u16()));
    }

    let body = response
        .json::<ChatCompletionResponse>()
        .map_err(|_| format!("{scope}: response format was unexpected"))?;
    body.choices
        .first()
        .map(|choice| choice.message.content.as_str())
        .ok_or_else(|| format!("{scope}: response did not include a choice"))
        .map(ToOwned::to_owned)
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

pub(crate) fn organize_luogu_insight(
    config: &AiConfigFields,
    input: &OrganizeLuoguInsightInput,
) -> Result<OrganizedLuoguInsight, String> {
    let system_prompt = r#"You are an OI competitive programming notebook assistant.
Return only strict JSON. Do not use markdown fences around the JSON.
Required JSON schema:
{
  "should_import": boolean,
  "title": string,
  "tags": string[],
  "difficulty": string,
  "summary": string,
  "draft": boolean,
  "body": string
}
Rules:
- Only organize the insight, idea, trick, pitfall, or lesson explicitly written in the user's comment.
- Do not invent a complete solution, proof, or missing algorithm details.
- If the comment has no clear reusable value, return should_import=false.
- body must be Markdown.
- tags must contain 2-5 concise items when should_import=true.
- draft should default to true unless the comment clearly says it is publish-ready."#;
    let user_prompt = format!(
        "Problem ID: {}\nProblem title: {}\nSubmission ID: {}\n\nCandidate comment:\n{}",
        input.problem_id.trim(),
        input.problem_title.trim(),
        input.submission_id.trim(),
        input.candidate_comment.trim()
    );
    let messages = json!([
        {
            "role": "system",
            "content": system_prompt
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion(config, messages, 0.2, "Luogu AI insight failed")?;
    let value = parse_json_object_from_ai_content(&content, "Luogu AI insight failed")?;

    validate_organized_luogu_insight(value, "Luogu AI insight failed")
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
    let system_prompt = r#"You are an OI competitive programming notebook metadata assistant.
Return only strict JSON. Do not use markdown fences.
Required JSON schema:
{
  "title": string,
  "tags": string[],
  "summary": string
}
Rules:
- Generate metadata only from the current note content.
- tags must contain 3-5 concise OI or algorithm oriented labels.
- summary must be one concise sentence.
- title may be improved, but keep it factual and not exaggerated.
- Do not rewrite or polish the note body.
- Do not return Markdown, only JSON."#;
    let user_prompt = format!(
        "Note relative path: {relative_path}\n\nCurrent markdown content:\n{markdown_content}"
    );
    let messages = json!([
        {
            "role": "system",
            "content": system_prompt
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion(&config, messages, 0.2, "AI metadata failed")?;
    let value = parse_json_object_from_ai_content(&content, "AI metadata failed")?;

    validate_generated_note_metadata(value, "AI metadata failed")
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
}
