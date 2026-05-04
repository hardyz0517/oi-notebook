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
    let trimmed = content.trim();
    let json_text = if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        &trimmed[start..=end]
    } else {
        trimmed
    };
    let value: JsonValue = serde_json::from_str(json_text)
        .map_err(|_| "AI connection failed: response was not valid JSON".to_string())?;

    value
        .get("ok")
        .and_then(JsonValue::as_bool)
        .ok_or_else(|| "AI connection failed: response JSON did not contain boolean ok".to_string())
}

fn test_ai_connection_with_config(
    config: &AiConfigFields,
) -> Result<TestAiConnectionResult, String> {
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
            "messages": [
                {
                    "role": "system",
                    "content": "Return only strict JSON. No markdown."
                },
                {
                    "role": "user",
                    "content": "Return exactly {\"ok\": true}."
                }
            ],
            "temperature": 0
        }))
        .send()
        .map_err(|e| {
            if e.is_timeout() {
                "AI connection failed: request timed out".to_string()
            } else {
                "AI connection failed: network error".to_string()
            }
        })?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "AI connection failed: server returned HTTP {}",
            status.as_u16()
        ));
    }

    let body = response
        .json::<ChatCompletionResponse>()
        .map_err(|_| "AI connection failed: response format was unexpected".to_string())?;
    let content = body
        .choices
        .first()
        .map(|choice| choice.message.content.as_str())
        .ok_or_else(|| "AI connection failed: response did not include a choice".to_string())?;
    let ok = parse_ai_ok_response(content)?;

    if !ok {
        return Err("AI connection failed: model returned ok=false".to_string());
    }

    Ok(TestAiConnectionResult {
        model: model.to_string(),
        ok,
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
