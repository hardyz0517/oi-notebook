use chrono::Utc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveProviderRequestInput {
    pub request_id: String,
    pub provider_profile_id: String,
    pub model_profile_id: String,
    pub secret_ref: String,
    pub payload: LiveProviderRequestPayload,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveProviderRequestPayload {
    pub provider_payload_shape: String,
    pub messages_or_input: Vec<LiveProviderMessage>,
    pub stream: bool,
    pub safe_prompt_summary: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveProviderMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveProviderRequestOutput {
    pub request_id: String,
    pub events: Vec<LiveProviderRequestEvent>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveProviderRequestEvent {
    #[serde(rename = "type")]
    pub event_type: &'static str,
    pub sequence: u32,
    pub at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safe_detail: Option<String>,
}

fn safe_boundary_stub_event(sequence: u32, safe_detail: String) -> LiveProviderRequestEvent {
    LiveProviderRequestEvent {
        event_type: "provider.request.failed",
        sequence,
        at: Utc::now().to_rfc3339(),
        text: None,
        safe_detail: Some(safe_detail),
    }
}

#[tauri::command]
pub fn request_live_provider(input: LiveProviderRequestInput) -> LiveProviderRequestOutput {
    let message_count = input.payload.messages_or_input.len();
    let input_char_count: usize = input
        .payload
        .messages_or_input
        .iter()
        .map(|message| message.content.chars().count())
        .sum();
    let (system_count, user_count, assistant_count, other_role_count) =
        input
            .payload
            .messages_or_input
            .iter()
            .fold((0, 0, 0, 0), |counts, message| match message.role.as_str() {
                "system" => (counts.0 + 1, counts.1, counts.2, counts.3),
                "user" => (counts.0, counts.1 + 1, counts.2, counts.3),
                "assistant" => (counts.0, counts.1, counts.2 + 1, counts.3),
                _ => (counts.0, counts.1, counts.2, counts.3 + 1),
            });

    let safe_detail = if !input.secret_ref.starts_with("secret-ref:") {
        "Live provider boundary rejected a non-opaque secret reference.".to_string()
    } else {
        format!(
            "Safe boundary stub accepted request {} for provider {} and model {}; no live transport is enabled. Payload summary: {}; shape: {}; stream: {}; message count: {}; input chars: {}; role counts: system={}, user={}, assistant={}, other={}.",
            input.request_id,
            input.provider_profile_id,
            input.model_profile_id,
            input.payload.safe_prompt_summary,
            input.payload.provider_payload_shape,
            input.payload.stream,
            message_count,
            input_char_count,
            system_count,
            user_count,
            assistant_count,
            other_role_count,
        )
    };

    LiveProviderRequestOutput {
        request_id: input.request_id,
        events: vec![safe_boundary_stub_event(1, safe_detail)],
    }
}
