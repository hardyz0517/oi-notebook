use std::{
    collections::HashSet,
    error::Error,
    fs,
    io::Read,
    net::{IpAddr, ToSocketAddrs},
    path::{Path, PathBuf},
    time::Duration,
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use tauri::Emitter;

use crate::luogu::{read_config, write_config, AiConfigFields, AiModel, AiProvider};
use crate::paths;
use crate::prompts::{render_prompt_template, PromptTemplateKind};

const LUOGU_INSIGHT_TASK: &str = "luogu-insight";
const NOTE_METADATA_TASK: &str = "note-metadata";
const NOTE_POLISH_TASK: &str = "note-polish";
const AI_DIAGNOSTIC_PREVIEW_CHARS: usize = 500;
const AI_RESPONSE_RETRY_ATTEMPTS: usize = 2;
const AI_DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 20;
const AI_FULL_NOTE_POLISH_TIMEOUT_SECS: u64 = 180;
const DEFAULT_LEGACY_PROVIDER_ID: &str = "default-openai-compatible";
const OPENAI_COMPATIBLE_PROVIDER_KIND: &str = "openai-compatible";
const WEB_SEARCH_DEFAULT_PROVIDER: &str = "brave";
const WEB_SEARCH_COMPAT_PROVIDER: &str = "bocha";
const WEB_SEARCH_MAX_QUERIES: usize = 8;
const WEB_SEARCH_MAX_RESULTS: usize = 40;
const WEB_EXTRACT_MAX_SOURCES: usize = 3;
const WEB_EXTRACT_MAX_CHARS_PER_SOURCE: usize = 5000;
const WEB_EXTRACT_TOTAL_CONTEXT_CHARS: usize = 15000;
const WEB_EXTRACT_MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const BRAVE_SEARCH_ENDPOINT: &str = "https://api.search.brave.com/res/v1/web/search";
const BOCHA_SEARCH_ENDPOINT: &str = "https://api.bochaai.com/v1/web-search";
const BOCHA_SEARCH_FALLBACK_ENDPOINT: &str = "https://api.bocha.cn/v1/web-search";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TestAiConnectionResult {
    pub model: String,
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderActionResult {
    pub provider: AiProvider,
    pub config: AiConfigFields,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncAiProviderModelsResult {
    pub provider: AiProvider,
    pub synced_count: usize,
    pub config: AiConfigFields,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncAiProviderDraftModelsResult {
    pub provider: AiProvider,
    pub synced_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TestAiProviderResult {
    pub provider_id: String,
    pub ok: bool,
    pub model_count: usize,
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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NoteTagSuggestion {
    pub suggested_tags: Vec<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PolishedSelectedText {
    pub polished_text: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PolishedFullNote {
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteChatHistoryMessageInput {
    pub role: String,
    pub text: String,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteChatStreamInput {
    pub stream_id: String,
    pub question: String,
    pub context: NoteChatContextInput,
    #[serde(default)]
    pub chat_history: Vec<NoteChatHistoryMessageInput>,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub model_id: Option<String>,
    #[serde(default)]
    pub web_search_mode: Option<String>,
    #[serde(default)]
    pub web_search_enabled: bool,
    #[serde(default)]
    pub search_decision: Option<JsonValue>,
    #[serde(default)]
    pub search_sources: Vec<WebSearchResult>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchRequestInput {
    pub queries: Vec<String>,
    pub intent: String,
    #[serde(default)]
    pub problem_id: Option<String>,
    #[serde(default)]
    pub max_results: Option<usize>,
    #[serde(default)]
    pub provider: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    pub id: String,
    pub title: String,
    pub url: String,
    pub site: Option<String>,
    pub snippet: Option<String>,
    pub source_type: Option<String>,
    pub reliability: Option<String>,
    pub reliability_label: Option<String>,
    pub reliability_reason: Option<String>,
    pub relevance: Option<String>,
    pub relevance_label: Option<String>,
    pub relevance_reason: Option<String>,
    pub excerpt_status: Option<String>,
    pub excerpt: Option<String>,
    pub excerpt_error: Option<String>,
    pub fetched_at: Option<i64>,
    pub selected: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchWebSourceExcerptsInput {
    pub sources: Vec<WebSearchResult>,
    #[serde(default)]
    pub max_sources: Option<usize>,
    #[serde(default)]
    pub max_chars_per_source: Option<usize>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebSourceExcerptResult {
    pub id: String,
    pub url: String,
    pub title: String,
    pub fetched: bool,
    pub excerpt: Option<String>,
    pub error: Option<String>,
    pub fetched_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct BraveSearchResponse {
    web: Option<BraveWebResults>,
}

#[derive(Debug, Clone, Deserialize)]
struct BraveWebResults {
    results: Vec<BraveWebResult>,
}

#[derive(Debug, Clone, Deserialize)]
struct BraveWebResult {
    title: Option<String>,
    url: Option<String>,
    description: Option<String>,
    profile: Option<BraveResultProfile>,
}

#[derive(Debug, Clone, Deserialize)]
struct BraveResultProfile {
    name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct BochaSearchResponse {
    #[serde(rename = "webPages")]
    web_pages: Option<BochaWebPages>,
    data: Option<BochaSearchData>,
}

#[derive(Debug, Clone, Deserialize)]
struct BochaSearchData {
    #[serde(rename = "webPages")]
    web_pages: Option<BochaWebPages>,
}

#[derive(Debug, Clone, Deserialize)]
struct BochaWebPages {
    value: Vec<BochaWebResult>,
}

#[derive(Debug, Clone, Deserialize)]
struct BochaWebResult {
    id: Option<String>,
    name: Option<String>,
    url: Option<String>,
    snippet: Option<String>,
    summary: Option<String>,
    #[serde(rename = "siteName")]
    site_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestWebSearchConnectionInput {
    pub provider: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub endpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TestWebSearchConnectionResult {
    pub ok: bool,
    pub provider: String,
    pub endpoint: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteChatStreamChunkPayload {
    stream_id: String,
    delta: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteChatStreamDonePayload {
    stream_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteChatStreamErrorPayload {
    stream_id: String,
    message: String,
    detail: Option<String>,
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

#[derive(Debug, Clone, Copy)]
struct ChatCompletionRequestOptions {
    timeout_secs: u64,
    json_response: bool,
    max_tokens: Option<u32>,
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

#[allow(dead_code)]
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct ResolvedAiConfig {
    provider_id: Option<String>,
    provider_name: Option<String>,
    provider_kind: Option<String>,
    base_url: String,
    api_key: String,
    model: String,
    model_name: Option<String>,
}

fn now_timestamp_millis() -> i64 {
    Utc::now().timestamp_millis()
}

fn normalize_ai_base_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/').to_string();
    if trimmed.is_empty() || trimmed.ends_with("/v1") {
        return trimmed;
    }
    format!("{trimmed}/v1")
}

fn model_from_id(model_id: &str, source: &str) -> Option<AiModel> {
    let id = model_id.trim();
    if id.is_empty() {
        return None;
    }
    Some(AiModel {
        id: id.to_string(),
        name: None,
        enabled: true,
        supports_stream: true,
        source: source.to_string(),
        updated_at: Some(now_timestamp_millis()),
    })
}

fn sanitize_ai_model(model: &AiModel) -> Option<AiModel> {
    let id = model.id.trim();
    if id.is_empty() {
        return None;
    }
    Some(AiModel {
        id: id.to_string(),
        name: model
            .name
            .as_ref()
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty()),
        enabled: model.enabled,
        supports_stream: model.supports_stream,
        source: if model.source.trim().is_empty() {
            "manual".to_string()
        } else {
            model.source.trim().to_string()
        },
        updated_at: model.updated_at,
    })
}

fn sanitize_ai_provider(provider: &AiProvider) -> Option<AiProvider> {
    let id = provider.id.trim();
    if id.is_empty() {
        return None;
    }
    let mut models = Vec::new();
    for model in provider.models.iter().filter_map(sanitize_ai_model) {
        if !models.iter().any(|existing: &AiModel| existing.id == model.id) {
            models.push(model);
        }
    }
    if let Some(default_model) = provider.default_model.as_deref().and_then(|model| model_from_id(model, "manual")) {
        if !models.iter().any(|model| model.id == default_model.id) {
            models.push(default_model);
        }
    }
    Some(AiProvider {
        id: id.to_string(),
        name: if provider.name.trim().is_empty() {
            "OpenAI Compatible".to_string()
        } else {
            provider.name.trim().to_string()
        },
        kind: OPENAI_COMPATIBLE_PROVIDER_KIND.to_string(),
        base_url: normalize_ai_base_url(&provider.base_url),
        api_key: provider.api_key.trim().to_string(),
        enabled: provider.enabled,
        default_model: provider
            .default_model
            .as_ref()
            .map(|model| model.trim().to_string())
            .filter(|model| !model.is_empty()),
        models,
        created_at: provider.created_at,
        updated_at: provider.updated_at,
    })
}

fn normalize_ai_config(config: &AiConfigFields) -> AiConfigFields {
    let now = now_timestamp_millis();
    let legacy_base_url = normalize_ai_base_url(&config.base_url);
    let legacy_api_key = config.api_key.trim().to_string();
    let legacy_model = config.model.trim().to_string();
    let mut providers = config
        .providers
        .iter()
        .filter_map(sanitize_ai_provider)
        .collect::<Vec<_>>();

    if providers.is_empty()
        && (!legacy_base_url.is_empty() || !legacy_api_key.is_empty() || !legacy_model.is_empty())
    {
        providers.push(AiProvider {
            id: config
                .default_provider_id
                .as_deref()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .unwrap_or(DEFAULT_LEGACY_PROVIDER_ID)
                .to_string(),
            name: "默认 OpenAI Compatible".to_string(),
            kind: OPENAI_COMPATIBLE_PROVIDER_KIND.to_string(),
            base_url: legacy_base_url.clone(),
            api_key: legacy_api_key.clone(),
            enabled: true,
            default_model: if legacy_model.is_empty() {
                None
            } else {
                Some(legacy_model.clone())
            },
            models: model_from_id(&legacy_model, "manual").into_iter().collect(),
            created_at: Some(now),
            updated_at: Some(now),
        });
    }

    let default_provider_id = config
        .default_provider_id
        .as_deref()
        .map(str::trim)
        .filter(|id| providers.iter().any(|provider| provider.id == *id))
        .map(ToOwned::to_owned)
        .or_else(|| providers.iter().find(|provider| provider.enabled).map(|provider| provider.id.clone()))
        .or_else(|| providers.first().map(|provider| provider.id.clone()));
    let default_provider = default_provider_id
        .as_deref()
        .and_then(|id| providers.iter().find(|provider| provider.id == id));
    let default_model_id = config
        .default_model_id
        .as_deref()
        .map(str::trim)
        .filter(|model_id| {
            default_provider
                .map(|provider| provider.models.iter().any(|model| model.id == *model_id && model.enabled))
                .unwrap_or(false)
        })
        .map(ToOwned::to_owned)
        .or_else(|| default_provider.and_then(|provider| provider.default_model.clone()))
        .or_else(|| {
            default_provider.and_then(|provider| {
                provider
                    .models
                    .iter()
                    .find(|model| model.enabled)
                    .map(|model| model.id.clone())
            })
        })
        .or_else(|| if legacy_model.is_empty() { None } else { Some(legacy_model.clone()) });
    let (base_url, api_key, model) = match default_provider {
        Some(provider) => (
            provider.base_url.clone(),
            provider.api_key.clone(),
            default_model_id.clone().unwrap_or_default(),
        ),
        None => (legacy_base_url, legacy_api_key, legacy_model),
    };

    AiConfigFields {
        base_url,
        api_key,
        model,
        providers,
        default_provider_id,
        default_model_id,
        web_search: normalize_web_search_config(&config.web_search),
    }
}

fn normalize_web_search_config(config: &crate::luogu::WebSearchConfigFields) -> crate::luogu::WebSearchConfigFields {
    let provider = match config.provider.trim() {
        WEB_SEARCH_DEFAULT_PROVIDER => WEB_SEARCH_DEFAULT_PROVIDER.to_string(),
        WEB_SEARCH_COMPAT_PROVIDER => WEB_SEARCH_COMPAT_PROVIDER.to_string(),
        _ if !config.brave_api_key.trim().is_empty() => WEB_SEARCH_DEFAULT_PROVIDER.to_string(),
        _ => WEB_SEARCH_COMPAT_PROVIDER.to_string(),
    };
    crate::luogu::WebSearchConfigFields {
        enabled: config.enabled,
        provider,
        brave_api_key: config.brave_api_key.trim().to_string(),
        bocha_api_key: config.bocha_api_key.trim().to_string(),
        bocha_endpoint: if config.bocha_endpoint.trim().is_empty() {
            BOCHA_SEARCH_ENDPOINT.to_string()
        } else {
            config.bocha_endpoint.trim().to_string()
        },
        public_search_consent: config.public_search_consent,
    }
}

fn resolve_ai_config(
    config: &AiConfigFields,
    provider_id: Option<&str>,
    model_id: Option<&str>,
) -> Result<ResolvedAiConfig, String> {
    let normalized = normalize_ai_config(config);
    let selected_provider_id = provider_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(ToOwned::to_owned)
        .or(normalized.default_provider_id.clone());
    let selected_model_id = model_id
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(ToOwned::to_owned)
        .or(normalized.default_model_id.clone());

    if let Some(provider_id) = selected_provider_id.as_deref() {
        let provider = normalized
            .providers
            .iter()
            .find(|provider| provider.id == provider_id)
            .ok_or_else(|| "AI connection failed: selected provider does not exist".to_string())?;
        if !provider.enabled {
            return Err("AI connection failed: selected provider is disabled".to_string());
        }
        let model = selected_model_id
            .or_else(|| provider.default_model.clone())
            .or_else(|| provider.models.iter().find(|model| model.enabled).map(|model| model.id.clone()))
            .unwrap_or_default();
        if !model.trim().is_empty()
            && !provider.models.is_empty()
            && !provider.models.iter().any(|item| item.id == model && item.enabled)
        {
            return Err("AI connection failed: selected model does not exist".to_string());
        }
        let selected_model = provider.models.iter().find(|item| item.id == model);
        return Ok(ResolvedAiConfig {
            provider_id: Some(provider.id.clone()),
            provider_name: Some(provider.name.clone()),
            provider_kind: Some(provider.kind.clone()),
            base_url: provider.base_url.clone(),
            api_key: provider.api_key.clone(),
            model,
            model_name: selected_model.and_then(|item| item.name.clone()),
        });
    }

    Ok(ResolvedAiConfig {
        provider_id: None,
        provider_name: None,
        provider_kind: None,
        base_url: normalized.base_url,
        api_key: normalized.api_key,
        model: selected_model_id.unwrap_or(normalized.model),
        model_name: None,
    })
}

fn require_resolved_ai_config(resolved: &ResolvedAiConfig) -> Result<(&str, &str, &str), String> {
    let base_url = resolved.base_url.trim().trim_end_matches('/');
    let api_key = resolved.api_key.trim();
    let model = resolved.model.trim();

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

fn require_ai_config_resolved(config: &AiConfigFields) -> Result<ResolvedAiConfig, String> {
    let resolved = resolve_ai_config(config, None, None)?;
    require_resolved_ai_config(&resolved)?;
    Ok(resolved)
}

fn config_from_resolved(resolved: ResolvedAiConfig) -> AiConfigFields {
    AiConfigFields {
        base_url: resolved.base_url,
        api_key: resolved.api_key,
        model: resolved.model,
        providers: Vec::new(),
        default_provider_id: resolved.provider_id,
        default_model_id: None,
        web_search: crate::luogu::WebSearchConfigFields::default(),
    }
}

fn build_model_identity_context(resolved: &ResolvedAiConfig) -> String {
    let provider_text = resolved
        .provider_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .or(resolved.provider_id.as_deref())
        .unwrap_or("not provided");
    let provider_kind = resolved
        .provider_kind
        .as_deref()
        .map(str::trim)
        .filter(|kind| !kind.is_empty())
        .unwrap_or("not provided");
    let model_id = resolved.model.trim();
    let model_id = if model_id.is_empty() { "not provided" } else { model_id };
    let model_name = resolved
        .model_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("not provided");

    format!(
        "Visible model configuration:\n\
- provider: {provider_text}\n\
- provider kind: {provider_kind}\n\
- model id: {model_id}\n\
- model display name: {model_name}\n\
If the user asks what model you are, answer from this visible provider/model configuration. Do not claim to be a fixed model, company, or OI Notebook-branded identity. If the provider is OpenAI-compatible, custom, or a relay, explain that the actual underlying model routing depends on the service provider and cannot be independently verified from this chat. Never reveal or invent API keys, Authorization headers, cookies, or base URLs."
    )
}

fn ai_request_target_debug(resolved: &ResolvedAiConfig) -> String {
    let provider = resolved
        .provider_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .or(resolved.provider_id.as_deref())
        .unwrap_or("not provided");
    let model = resolved.model.trim();
    let model = if model.is_empty() { "not provided" } else { model };
    format!(
        "provider={}; model={}",
        sanitize_ai_detail(provider),
        sanitize_ai_detail(model)
    )
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
    let resolved = require_ai_config_resolved(config)?;
    let base_url = resolved.base_url.trim().trim_end_matches('/');
    let model = resolved.model.trim();
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
    let resolved = require_ai_config_resolved(config)?;
    let model = resolved.model.trim();
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

fn extract_stream_delta(value: &JsonValue) -> Option<String> {
    let delta = value
        .get("choices")
        .and_then(JsonValue::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("delta"))?;
    let content = delta.get("content")?;

    if let Some(text) = content.as_str() {
        if !text.is_empty() {
            return Some(text.to_string());
        }
    }

    if let Some(parts) = content.as_array() {
        let mut text_parts = Vec::new();
        for part in parts {
            if let Some(text) = part.get("text").and_then(JsonValue::as_str) {
                if !text.is_empty() {
                    text_parts.push(text.to_string());
                }
                continue;
            }
            if let Some(text) = part.as_str() {
                if !text.is_empty() {
                    text_parts.push(text.to_string());
                }
            }
        }
        if !text_parts.is_empty() {
            return Some(text_parts.join(""));
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
    request_chat_completion_with_options(
        config,
        messages,
        temperature,
        scope,
        ChatCompletionRequestOptions {
            timeout_secs: AI_DEFAULT_REQUEST_TIMEOUT_SECS,
            json_response: true,
            max_tokens: None,
        },
    )
}

fn request_chat_completion_with_options(
    config: &AiConfigFields,
    messages: JsonValue,
    temperature: f32,
    scope: &str,
    options: ChatCompletionRequestOptions,
) -> Result<String, String> {
    let resolved = require_ai_config_resolved(config)?;
    let (base_url, api_key, model) = require_resolved_ai_config(&resolved)?;
    let target_debug = ai_request_target_debug(&resolved);
    let url = format!("{base_url}/chat/completions");
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(options.timeout_secs))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("AI connection failed: cannot create HTTP client: {e}"))?;

    let mut request_body = json!({
        "model": model,
        "messages": messages,
        "temperature": temperature
    });
    if let JsonValue::Object(body) = &mut request_body {
        if options.json_response {
            body.insert(
                "response_format".to_string(),
                json!({ "type": "json_object" }),
            );
        }
        if let Some(max_tokens) = options.max_tokens {
            body.insert("max_tokens".to_string(), json!(max_tokens));
        }
    }

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
                    format!(
                        "{scope}: request timed out after {}s; debug={target_debug}",
                        options.timeout_secs
                    )
                } else {
                    format!("{scope}: network error; debug={target_debug}; error={e}")
                }
            })?;

        match parse_chat_completion_response(response) {
            Ok(content) => return Ok(content),
            Err(issue) => {
                let should_retry = issue.is_retryable() && attempt < AI_RESPONSE_RETRY_ATTEMPTS;
                let issue_error = issue.clone().into_error(scope);
                eprintln!(
                    "{scope}: attempt {attempt}/{} failed: {}; target={target_debug}",
                    AI_RESPONSE_RETRY_ATTEMPTS,
                    issue_error
                );
                if should_retry {
                    last_issue = Some(issue);
                    continue;
                }
                return Err(format!("{}; target={target_debug}", issue.into_error(scope)));
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

fn split_ai_error_detail(message: String) -> (String, Option<String>) {
    let detail_start = message.find("; debug=");
    match detail_start {
        Some(index) => (
            message[..index].trim().to_string(),
            Some(message[index + 2..].trim().to_string()),
        ),
        None => (message, None),
    }
}

fn emit_stream_chunk(
    app: &tauri::AppHandle,
    stream_id: &str,
    delta: String,
) -> Result<(), String> {
    app.emit(
        "ai-chat-stream-chunk",
        NoteChatStreamChunkPayload {
            stream_id: stream_id.to_string(),
            delta,
        },
    )
    .map_err(|e| format!("AI chat stream failed: cannot emit chunk: {e}"))
}

fn emit_stream_done(app: &tauri::AppHandle, stream_id: &str) -> Result<(), String> {
    app.emit(
        "ai-chat-stream-done",
        NoteChatStreamDonePayload {
            stream_id: stream_id.to_string(),
        },
    )
    .map_err(|e| format!("AI chat stream failed: cannot emit done: {e}"))
}

fn emit_stream_error(app: &tauri::AppHandle, stream_id: &str, error: String) {
    let (message, detail) = split_ai_error_detail(error);
    let _ = app.emit(
        "ai-chat-stream-error",
        NoteChatStreamErrorPayload {
            stream_id: stream_id.to_string(),
            message,
            detail,
        },
    );
}

fn truncate_chat_history_text(text: &str) -> String {
    const MAX_HISTORY_MESSAGE_CHARS: usize = 1600;

    let trimmed = text.trim();
    if trimmed.chars().count() <= MAX_HISTORY_MESSAGE_CHARS {
        return trimmed.to_string();
    }

    let mut truncated = trimmed
        .chars()
        .take(MAX_HISTORY_MESSAGE_CHARS)
        .collect::<String>();
    truncated.push_str("\n[truncated]");
    truncated
}

fn truncate_search_context_text(text: &str) -> String {
    const MAX_SEARCH_CONTEXT_CHARS: usize = 420;

    let trimmed = text.trim();
    if trimmed.chars().count() <= MAX_SEARCH_CONTEXT_CHARS {
        return trimmed.to_string();
    }

    let mut truncated = trimmed
        .chars()
        .take(MAX_SEARCH_CONTEXT_CHARS)
        .collect::<String>();
    truncated.push_str("...");
    truncated
}

fn truncate_web_excerpt_text(text: &str) -> String {
    const MAX_WEB_EXCERPT_CONTEXT_CHARS: usize = 5000;

    let trimmed = text.trim();
    if trimmed.chars().count() <= MAX_WEB_EXCERPT_CONTEXT_CHARS {
        return trimmed.to_string();
    }

    let mut truncated = trimmed
        .chars()
        .take(MAX_WEB_EXCERPT_CONTEXT_CHARS)
        .collect::<String>();
    truncated.push_str("...");
    truncated
}

fn build_search_sources_context(sources: &[WebSearchResult]) -> Option<String> {
    let mut entries = Vec::new();
    let selected_sources = sources
        .iter()
        .filter(|source| source.selected.unwrap_or(false))
        .collect::<Vec<_>>();
    let context_sources = if selected_sources.is_empty() {
        sources.iter().collect::<Vec<_>>()
    } else {
        selected_sources
    };

    for (index, source) in context_sources.into_iter().take(8).enumerate() {
        let title = truncate_search_context_text(&source.title);
        let url = truncate_search_context_text(&source.url);
        if title.is_empty() || url.is_empty() {
            continue;
        }
        let site = source
            .site
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "unknown site".to_string());
        let snippet = source
            .snippet
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "no snippet provided".to_string());
        let source_type = source
            .source_type
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown");
        let reliability = source
            .reliability
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown");
        let reliability_label = source
            .reliability_label
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "unknown".to_string());
        let reliability_reason = source
            .reliability_reason
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "not enough metadata to judge".to_string());
        let relevance = source
            .relevance
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("strong");
        let relevance_label = source
            .relevance_label
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "strongly related".to_string());
        let relevance_reason = source
            .relevance_reason
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "kept by relevance filter".to_string());
        let excerpt_status = source
            .excerpt_status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("not_requested");
        let excerpt_error = source
            .excerpt_error
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "none".to_string());
        let excerpt = source
            .excerpt
            .as_deref()
            .map(truncate_web_excerpt_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "no webpage excerpt available".to_string());

        entries.push(format!(
            "Result {}:\nTitle: {}\nSite: {}\nURL: {}\nSnippet: {}\nSource type: {}\nReliability: {} ({})\nReliability reason: {}\nRelevance: {} ({})\nRelevance reason: {}\nWeb excerpt status: {}\nWeb excerpt error: {}\nWeb excerpt: {}",
            index + 1,
            title,
            site,
            url,
            snippet,
            source_type,
            reliability,
            reliability_label,
            reliability_reason,
            relevance,
            relevance_label,
            relevance_reason,
            excerpt_status,
            excerpt_error,
            excerpt,
        ));
    }

    if entries.is_empty() {
        return None;
    }

    Some(format!(
        "The following context has two layers: web search result summaries, and optional extracted webpage excerpts for sources whose Web excerpt status is fetched. Search result summaries are only titles, sites, URLs, snippets, source types, and reliability labels. Web excerpts are extracted text snippets, not full pages.\n\
You may use these summaries to answer, but follow these rules strictly:\n\
- Call them search result summaries or source summaries, not webpages you have read in full.\n\
- Only sources marked with Web excerpt status: fetched may be described as webpage excerpts. Do not use failed or unavailable sources as webpage content.\n\
- Even for fetched excerpts, do not say you read the full page. Say \"based on the extracted webpage excerpt\" or equivalent.\n\
- Do not say a webpage clearly states something unless the snippet itself contains that information.\n\
- Do not say a webpage excerpt states something unless that excerpt contains it.\n\
- When a point comes only from a title or snippet, use cautious wording such as \"from the search result summaries\" or \"these sources may be related\".\n\
- If the summaries are insufficient, say that the details require opening and reading the full page.\n\
- If the only relevant source is a constructed official problem-page link, acknowledge the official page was identified but say the search result summaries are insufficient to summarize editorials, discussions, or common pitfalls.\n\
- Strongly related sources may be used cautiously for the target problem. Candidate or related-algorithm sources are only background algorithm material and must not be presented as target-problem-specific evidence.\n\
- If there are not enough strongly related editorial, discussion, or pitfall summaries, explicitly say the search result summaries are insufficient to directly summarize this problem's common pitfalls. You may add general OI troubleshooting advice, but label it as general experience rather than search-result evidence.\n\
- Do not mechanically restate every search summary. First filter for contest value: prefer points that can actually cause WA, TLE, RE, MLE, wrong complexity, wrong boundaries, or implementation mistakes.\n\
- For common pitfalls, easy mistakes, WA/TLE/RE causes, implementation notes, or editorial advice, only promote high-value items such as array sizes, indexing, initialization, root handling, special cases, recursion depth, IO performance, binary lifting levels, jump order, DFS preprocessing, graph direction, and complexity details.\n\
- Down-rank or ignore low-value material unless the user explicitly asks for concept explanation: terminology translation, name-similarity trivia, vague statements that an algorithm is important, SEO-like blog filler, and sentences that appear in snippets but do not help solve or debug the problem.\n\
- Be especially cautious with CSDN, ordinary blogs, and unknown reliability sources. Do not turn their summaries into firm conclusions unless the excerpt or snippet contains concrete implementation evidence.\n\
- If the available source summaries are low quality, give fewer high-value points instead of padding the answer. Do not invent extra pitfalls just to make a longer list.\n\
- When mixing evidence and OI experience, separate them naturally: say which points are reflected in search summaries or webpage excerpts, and which are general OI template/problem-solving experience.\n\
- For LCA problems, do not include advice like confusing Lowest Common Ancestor with unrelated names such as Longest Common Ancestor unless the user explicitly asks about terminology. Prefer implementation issues such as lifting table size, depth/fa initialization, root choice, DFS stack depth, query jump order, and IO.\n\
- Answer like an experienced OI teammate summarizing useful practice, not like a search-result report.\n\
- Let reliability guide your tone: official can be more certain, wiki is algorithm reference, community_solution is community solution material, discussion is discussion or experience, blog is a personal blog view, unknown needs extra caution.\n\
- Do not create formal citation numbers or pretend there are verified citations.\n\
- You may briefly mention that the source cards above can be opened for confirmation.\n\n{}",
        entries.join("\n\n")
    ))
}

fn build_stream_note_chat_messages(
    question: &str,
    context: &NoteChatContextInput,
    chat_history: &[NoteChatHistoryMessageInput],
    resolved: &ResolvedAiConfig,
    search_sources: &[WebSearchResult],
) -> JsonValue {
    let tags_text = if context.tags.is_empty() {
        "not provided".to_string()
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
        "not provided".to_string()
    } else {
        context.summary.trim().to_string()
    };
    let note_title = context.note_title.trim();
    let note_path = context.note_path.trim();
    let markdown = context.markdown.trim();
    let selected_text = context.selected_text.trim();
    let has_full_note_context = !note_path.is_empty() || !note_title.is_empty() || !markdown.is_empty();
    let context_prompt = if has_full_note_context {
        let selection_section = if selected_text.is_empty() {
            "The user has no selected text.".to_string()
        } else {
            format!("The user selected this text. Prefer it when relevant:\n{selected_text}")
        };
        let truncation_note = if markdown.is_empty() {
            "The current note body is empty."
        } else if context.markdown_truncated {
            "The markdown body was truncated on the client. Say when the available context is insufficient."
        } else {
            "The markdown body is the current full note body."
        };

        format!(
            "You are helping the user understand and improve the current OI Notebook note.\n\
Answer based on the current note context when it is relevant. If the note does not contain enough information, say so clearly instead of inventing details.\n\
Do not claim you changed the file. If the user asks for edits, provide suggestions only in this chat.\n\n\
Note title:\n{note_title}\n\n\
Note path:\n{note_path}\n\n\
Tags:\n{tags_text}\n\n\
Summary:\n{summary_text}\n\n\
Selected text:\n{selection_section}\n\n\
Markdown note:\n{truncation_note}\n\n{markdown}\n\n\
The following conversation may contain previous user goals. The note above is the latest optional note context for the next user question.",
        )
    } else if !selected_text.is_empty() {
        format!(
            "The full current note context is not attached to this request. The user explicitly provided this local text from the editor, such as a selection or cursor paragraph. Use only this local text when it is relevant, and do not claim you can read the rest of the note.\n\n\
Local editor text:\n{selected_text}\n\n\
The following conversation may contain previous user goals."
        )
    } else {
        "There is no current note context attached to this request. Answer as a general helpful assistant inside OI Notebook, using any relevant recent conversation below. Do not claim you can read or modify a note unless the user provides one.".to_string()
    };
    let model_identity_context = build_model_identity_context(resolved);

    let mut messages = vec![
        json!({
            "role": "system",
            "content": format!(
                "You are running inside OI Notebook and helping the user with OI study, Markdown notes, algorithms, writing, and general questions. Answer honestly, directly, and clearly in helpful Markdown. Use the current note context when present, otherwise answer as a normal assistant. Do not force a fixed assistant identity.\n\n{model_identity_context}"
            )
        }),
        json!({
            "role": "user",
            "content": context_prompt
        }),
    ];

    for message in chat_history.iter().take(10) {
        let role = match message.role.trim() {
            "user" => "user",
            "assistant" => "assistant",
            _ => continue,
        };
        let content = truncate_chat_history_text(&message.text);
        if content.is_empty() {
            continue;
        }

        messages.push(json!({
            "role": role,
            "content": content,
        }));
    }

    if let Some(search_context) = build_search_sources_context(search_sources) {
        messages.push(json!({
            "role": "user",
            "content": search_context,
        }));
    }

    messages.push(json!({
        "role": "user",
        "content": format!("User question:\n{question}"),
    }));

    JsonValue::Array(messages)
}

fn parse_stream_line(line: &str, scope: &str) -> Result<Option<String>, String> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with(':') {
        return Ok(None);
    }
    let Some(data) = trimmed.strip_prefix("data:") else {
        return Ok(None);
    };
    let data = data.trim();
    if data.is_empty() {
        return Ok(None);
    }
    if data == "[DONE]" {
        return Err("__AI_STREAM_DONE__".to_string());
    }
    if looks_like_html(data) {
        return Err(format!(
            "{scope}: AI service returned a non JSON stream chunk; debug=chunk_preview={}",
            sanitize_ai_detail(data)
        ));
    }

    let value = serde_json::from_str::<JsonValue>(data).map_err(|e| {
        format!(
            "{scope}: AI service returned an unreadable stream chunk; debug=json_parse_error={e}; chunk_preview={}",
            sanitize_ai_detail(data)
        )
    })?;

    if let Some(provider_message) = extract_provider_error_message(&value) {
        return Err(format!("{scope}: {provider_message}; debug=provider_error=true"));
    }

    Ok(extract_stream_delta(&value))
}

async fn request_chat_completion_stream(
    config: &AiConfigFields,
    messages: JsonValue,
    temperature: f32,
    scope: &str,
    app: tauri::AppHandle,
    stream_id: String,
) -> Result<(), String> {
    let resolved = require_ai_config_resolved(config)?;
    let (base_url, api_key, model) = require_resolved_ai_config(&resolved)?;
    let url = format!("{base_url}/chat/completions");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("AI connection failed: cannot create HTTP client: {e}"))?;
    let request_body = json!({
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": true
    });

    let mut response = client
        .post(&url)
        .bearer_auth(api_key)
        .header(reqwest::header::ACCEPT, "text/event-stream")
        .json(&request_body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                format!("{scope}: request timed out")
            } else {
                format!("{scope}: network error")
            }
        })?;

    let status = response.status();
    let status_code = status.as_u16();
    if !status.is_success() {
        let body = response
            .bytes()
            .await
            .map(|bytes| decode_response_body(&bytes))
            .unwrap_or_else(|e| format!("<failed to read error body: {e}>"));
        let body_trimmed = body.trim();
        if let Ok(value) = serde_json::from_str::<JsonValue>(body_trimmed) {
            if let Some(provider_message) = extract_provider_error_message(&value) {
                return Err(format!(
                    "{scope}: {provider_message}; debug=http_status={status_code}; provider_error=true"
                ));
            }
        }
        return Err(format!(
            "{scope}: AI service returned HTTP {status_code}; debug=error_body_preview={}",
            sanitize_ai_detail(body_trimmed)
        ));
    }

    let mut buffer = String::new();
    let mut emitted_any_delta = false;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("{scope}: stream interrupted; debug={e}"))?
    {
        buffer.push_str(&decode_response_body(&chunk));
        while let Some(newline_index) = buffer.find('\n') {
            let line = buffer[..newline_index].trim_end_matches('\r').to_string();
            buffer.drain(..=newline_index);
            match parse_stream_line(&line, scope) {
                Ok(Some(delta)) => {
                    emitted_any_delta = true;
                    emit_stream_chunk(&app, &stream_id, delta)?;
                }
                Ok(None) => {}
                Err(done) if done == "__AI_STREAM_DONE__" => {
                    emit_stream_done(&app, &stream_id)?;
                    return Ok(());
                }
                Err(e) => return Err(e),
            }
        }
    }

    let trailing = buffer.trim();
    if !trailing.is_empty() {
        match parse_stream_line(trailing, scope) {
            Ok(Some(delta)) => {
                emitted_any_delta = true;
                emit_stream_chunk(&app, &stream_id, delta)?;
            }
            Ok(None) => {}
            Err(done) if done == "__AI_STREAM_DONE__" => {
                emit_stream_done(&app, &stream_id)?;
                return Ok(());
            }
            Err(e) => return Err(e),
        }
    }

    if !emitted_any_delta {
        return Err(format!(
            "{scope}: AI service returned an empty stream; debug=http_status={status_code}"
        ));
    }

    emit_stream_done(&app, &stream_id)
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
    let resolved = require_ai_config_resolved(config)?;
    let model = resolved.model.trim();

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

fn normalize_suggested_tags(
    existing_tags: &[String],
    suggested_tags: Vec<String>,
    scope: &str,
) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    let existing = existing_tags
        .iter()
        .map(|tag| tag.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();

    for tag in suggested_tags {
        let trimmed = tag.split_whitespace().collect::<Vec<_>>().join(" ");
        if trimmed.is_empty() {
            continue;
        }
        if existing.iter().any(|existing_tag| existing_tag == &trimmed) {
            continue;
        }
        if normalized.iter().any(|existing_tag| existing_tag == &trimmed) {
            continue;
        }
        normalized.push(trimmed);
        if normalized.len() == 8 {
            break;
        }
    }

    if normalized.is_empty() {
        return Ok(normalized);
    }

    if normalized.len() > 8 {
        return Err(format!("{scope}: response suggestedTags must contain at most 8 items"));
    }

    Ok(normalized)
}

fn validate_note_tag_suggestion(
    value: JsonValue,
    existing_tags: &[String],
    scope: &str,
) -> Result<NoteTagSuggestion, String> {
    let tags_value = value
        .get("suggestedTags")
        .and_then(JsonValue::as_array)
        .ok_or_else(|| {
            format!(
                "{scope}: response JSON schema failed: suggestedTags must be an array; json_preview={}",
                diagnostic_json_preview(&value)
            )
        })?;
    let mut raw_tags = Vec::new();
    for tag in tags_value {
        let Some(tag_text) = tag.as_str() else {
            return Err(format!("{scope}: response suggestedTags must only contain strings"));
        };
        raw_tags.push(tag_text.to_string());
    }
    let suggested_tags = normalize_suggested_tags(existing_tags, raw_tags, scope)?;
    let reason = value
        .get("reason")
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|reason| !reason.is_empty())
        .unwrap_or("这些标签来自当前笔记的标题、摘要、已有标签和正文内容。")
        .to_string();

    Ok(NoteTagSuggestion {
        suggested_tags,
        reason,
    })
}

fn validate_polished_selected_text(
    value: JsonValue,
    scope: &str,
) -> Result<PolishedSelectedText, String> {
    let polished_text = value
        .get("polishedText")
        .and_then(JsonValue::as_str)
        .filter(|text| !text.trim().is_empty())
        .ok_or_else(|| {
            format!(
                "{scope}: response JSON schema failed: polishedText was missing or empty; json_preview={}",
                diagnostic_json_preview(&value)
            )
        })?
        .to_string();

    Ok(PolishedSelectedText { polished_text })
}

fn strip_wrapping_markdown_fence(value: &str) -> String {
    let trimmed = value.trim();
    let Some(after_open) = trimmed.strip_prefix("```") else {
        return value.to_string();
    };
    let Some(close_index) = after_open.rfind("```") else {
        return value.to_string();
    };
    if !after_open[close_index + 3..].trim().is_empty() {
        return value.to_string();
    }

    let inner = &after_open[..close_index];
    let inner = if let Some(newline_index) = inner.find('\n') {
        let first_line = inner[..newline_index].trim();
        if first_line.is_empty()
            || first_line.eq_ignore_ascii_case("markdown")
            || first_line.eq_ignore_ascii_case("md")
            || first_line.eq_ignore_ascii_case("text")
        {
            &inner[newline_index + 1..]
        } else {
            inner
        }
    } else {
        inner
    };

    inner.trim_matches(['\r', '\n']).to_string()
}

fn validate_polished_full_note(value: JsonValue, scope: &str) -> Result<PolishedFullNote, String> {
    let raw_body = value
        .get("polishedBody")
        .and_then(JsonValue::as_str)
        .filter(|body| !body.trim().is_empty())
        .ok_or_else(|| {
            format!(
                "{scope}: response JSON schema failed: polishedBody was missing or empty; json_preview={}",
                diagnostic_json_preview(&value)
            )
        })?;
    let polished_body = strip_wrapping_markdown_fence(raw_body);
    if polished_body.trim().is_empty() {
        return Err(format!("{scope}: response polishedBody was empty after cleanup"));
    }

    Ok(PolishedFullNote { polished_body })
}

fn parse_polished_full_note_content(
    content: &str,
    scope: &str,
) -> Result<PolishedFullNote, String> {
    if let Ok(value) = parse_json_object_from_ai_content(content, scope) {
        if let Ok(result) = validate_polished_full_note(value, scope) {
            return Ok(result);
        }
    }

    let polished_body = strip_wrapping_markdown_fence(content);
    let polished_body = polished_body.trim();
    if polished_body.is_empty() {
        return Err(format!("{scope}: AI returned empty polished body"));
    }

    Ok(PolishedFullNote {
        polished_body: polished_body.to_string(),
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

fn suggest_note_tags_blocking(
    context: NoteChatContextInput,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> Result<NoteTagSuggestion, String> {
    let note_path = context.note_path.trim();
    if note_path.is_empty() {
        return Err("AI tag suggestion failed: note path is missing".to_string());
    }

    let config = read_config()?.ai;
    let resolved = resolve_ai_config(
        &config,
        provider_id.as_deref(),
        model_id.as_deref(),
    )?;
    require_resolved_ai_config(&resolved)?;
    let selected_config = config_from_resolved(resolved.clone());

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
    let selected_text = context.selected_text.trim();
    let selection_section = if selected_text.is_empty() {
        "用户当前没有选中文段。".to_string()
    } else {
        format!("用户当前选中的内容如下，可参考但不要只围绕选区生成标签：\n{selected_text}")
    };
    let markdown = context.markdown.trim();
    let body_note = if markdown.is_empty() {
        "当前正文为空或上下文很少，请主要基于标题、路径和 summary 谨慎建议。"
    } else if context.markdown_truncated {
        "正文是截断后的节选，不是整篇全文。"
    } else {
        "正文是当前笔记的完整内容。"
    };

    let user_prompt = format!(
        "你要为一篇 OI / 算法 / Markdown 学习笔记建议 frontmatter tags。\n\
请结合标题、路径、已有 tags、summary、正文 Markdown 和选中文段。\n\
不要重复已有 tags。不要生成太泛的标签，例如“学习”“笔记”“算法”，除非确实必要。\n\
优先生成具体标签，例如：动态规划、单调队列、最短路、树形 DP、数学、洛谷、题解、模板、调试、复杂度分析。\n\
tags 应简短，建议 2 到 8 个。保留中文标签风格，除非正文里明显使用英文术语。\n\
只输出严格 JSON，不要使用 markdown code fence，不要输出额外文本。\n\
JSON 格式必须是：{{\"suggestedTags\":[\"动态规划\",\"单调队列\"],\"reason\":\"这些标签对应笔记中的状态转移和队列优化内容。\"}}\n\n\
【标题】\n{note_title}\n\n\
【路径】\n{note_path}\n\n\
【已有 tags】\n{tags_text}\n\n\
【summary】\n{summary_text}\n\n\
【选中文段】\n{selection_section}\n\n\
【正文说明】\n{body_note}\n\n\
【正文 Markdown】\n{markdown}",
        note_title = context.note_title.trim(),
    );
    let messages = json!([
        {
            "role": "system",
            "content": format!(
                "Return only strict JSON with suggestedTags and reason fields. Do not use markdown fences. Do not claim that files were modified.\n\n{}",
                build_model_identity_context(&resolved)
            )
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion(&selected_config, messages, 0.2, "AI tag suggestion failed")?;
    let value = parse_json_object_from_ai_content(&content, "AI tag suggestion failed")?;
    validate_note_tag_suggestion(value, &context.tags, "AI tag suggestion failed")
}

#[tauri::command]
pub async fn suggest_note_tags(
    context: NoteChatContextInput,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> Result<NoteTagSuggestion, String> {
    tauri::async_runtime::spawn_blocking(move || {
        suggest_note_tags_blocking(context, provider_id, model_id)
    })
    .await
    .map_err(|e| format!("AI tag suggestion failed: task join failed: {e}"))?
}

fn polish_selected_text_blocking(
    context: NoteChatContextInput,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> Result<PolishedSelectedText, String> {
    let selected_text = context.selected_text.trim();
    if selected_text.is_empty() {
        return Err("AI selection polish failed: selected text is empty".to_string());
    }

    let config = read_config()?.ai;
    let resolved = resolve_ai_config(
        &config,
        provider_id.as_deref(),
        model_id.as_deref(),
    )?;
    require_resolved_ai_config(&resolved)?;
    let selected_config = config_from_resolved(resolved.clone());

    let tags_text = if context.tags.is_empty() {
        "Not provided".to_string()
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
        "Not provided".to_string()
    } else {
        context.summary.trim().to_string()
    };
    let note_title = if context.note_title.trim().is_empty() {
        "Not provided"
    } else {
        context.note_title.trim()
    };

    let user_prompt = format!(
        "Polish the selected text from an OI / competitive programming Markdown note.\n\
Only polish the selected text. Do not modify the note title, tags, summary, path, or frontmatter.\n\
Return only strict JSON. Do not use markdown code fences. Do not add an explanation.\n\
The JSON schema must be: {{\"polishedText\":\"...\"}}\n\n\
Writing requirements:\n\
- Preserve the original meaning, terms, formulas, Markdown structure, and links.\n\
- If the selection contains fenced code blocks or inline code, keep code content unchanged by default.\n\
- You may polish prose around code blocks, but do not rewrite code logic.\n\
- If the original text is already clear, make only light improvements.\n\
- Do not add a title or extra sections unless they already exist in the selected text.\n\n\
Light note context:\n\
Title: {note_title}\n\
Tags: {tags_text}\n\
Summary: {summary_text}\n\n\
Selected text:\n{selected_text}"
    );
    let messages = json!([
        {
            "role": "system",
            "content": format!(
                "Return only strict JSON with a polishedText field. Do not claim that files were modified. Do not force a fixed assistant identity.\n\n{}",
                build_model_identity_context(&resolved)
            )
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion(&selected_config, messages, 0.2, "AI selection polish failed")?;
    let value = parse_json_object_from_ai_content(&content, "AI selection polish failed")?;
    validate_polished_selected_text(value, "AI selection polish failed")
}

#[tauri::command]
pub async fn polish_selected_text(
    context: NoteChatContextInput,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> Result<PolishedSelectedText, String> {
    tauri::async_runtime::spawn_blocking(move || {
        polish_selected_text_blocking(context, provider_id, model_id)
    })
    .await
    .map_err(|e| format!("AI selection polish failed: task join failed: {e}"))?
}

fn polish_full_note_blocking(
    context: NoteChatContextInput,
    instruction: String,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> Result<PolishedFullNote, String> {
    let note_path = context.note_path.trim();
    if note_path.is_empty() {
        return Err("AI full note polish failed: note path is missing".to_string());
    }
    let markdown_body = context.markdown.trim();
    if markdown_body.is_empty() {
        return Err("AI full note polish failed: note body is empty".to_string());
    }

    let config = read_config()?.ai;
    let resolved = resolve_ai_config(
        &config,
        provider_id.as_deref(),
        model_id.as_deref(),
    )?;
    require_resolved_ai_config(&resolved)?;
    let selected_config = config_from_resolved(resolved.clone());

    let tags_text = if context.tags.is_empty() {
        "Not provided".to_string()
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
        "Not provided".to_string()
    } else {
        context.summary.trim().to_string()
    };
    let note_title = if context.note_title.trim().is_empty() {
        "Not provided"
    } else {
        context.note_title.trim()
    };
    let instruction_text = if instruction.trim().is_empty() {
        "No extra instruction.".to_string()
    } else {
        instruction.trim().to_string()
    };

    let user_prompt = format!(
        "Polish the full Markdown body of one OI / competitive programming note.\n\
Only polish the body text provided below. Do not create, edit, or output frontmatter.\n\
Do not modify the note title, tags, summary, path, or any metadata.\n\
Return only the polished Markdown body. Do not wrap it in a markdown code fence. Do not add an explanation.\n\
Writing requirements:\n\
- Preserve Markdown structure, formulas, tables, links, headings, lists, and important derivations.\n\
- Preserve fenced code blocks, inline code, code comments, problem IDs, problem names, complexity conclusions, and core algorithm names.\n\
- Do not rewrite code logic.\n\
- Polish wording, sentence flow, and obvious awkward phrasing only where useful.\n\
- Keep the user's original style. Do not turn concise notes into template-like AI prose.\n\
- Do not add vague filler, generic conclusions, or high-frequency AI-style endings.\n\
- Do not delete important reasoning or expand short expressions into long explanations without need.\n\n\
Light note context:\n\
Title: {note_title}\n\
Path: {note_path}\n\
Tags: {tags_text}\n\
Summary: {summary_text}\n\
Extra instruction: {instruction_text}\n\n\
Markdown body to polish:\n{markdown_body}"
    );
    let messages = json!([
        {
            "role": "system",
            "content": format!(
                "Return only the polished Markdown body. Do not claim that files were modified. Do not force a fixed assistant identity.\n\n{}",
                build_model_identity_context(&resolved)
            )
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion_with_options(
        &selected_config,
        messages,
        0.2,
        "AI full note polish failed",
        ChatCompletionRequestOptions {
            timeout_secs: AI_FULL_NOTE_POLISH_TIMEOUT_SECS,
            json_response: false,
            max_tokens: None,
        },
    )?;
    parse_polished_full_note_content(&content, "AI full note polish failed")
}

#[tauri::command]
pub async fn polish_full_note(
    context: NoteChatContextInput,
    instruction: String,
    provider_id: Option<String>,
    model_id: Option<String>,
) -> Result<PolishedFullNote, String> {
    tauri::async_runtime::spawn_blocking(move || {
        polish_full_note_blocking(context, instruction, provider_id, model_id)
    })
    .await
    .map_err(|e| format!("AI full note polish failed: task join failed: {e}"))?
}

#[tauri::command]
pub fn chat_with_current_note(
    question: String,
    context: NoteChatContextInput,
    provider_id: Option<String>,
    model_id: Option<String>,
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
    let resolved = resolve_ai_config(
        &config,
        provider_id.as_deref(),
        model_id.as_deref(),
    )?;
    let selected_config = config_from_resolved(resolved.clone());
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
            "content": format!(
                "You are running inside OI Notebook and helping the user with the current note. Return only strict JSON with an answer field. Do not use markdown fences. Do not force a fixed assistant identity.\n\n{}",
                build_model_identity_context(&resolved)
            )
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion(&selected_config, messages, 0.2, "AI chat failed")?;
    let value = parse_json_object_from_ai_content(&content, "AI chat failed")?;
    let answer = validate_note_chat_answer(value, "AI chat failed")?;
    let resolved = require_ai_config_resolved(&selected_config)?;
    let model = resolved.model.trim();

    Ok(NoteChatAnswer {
        answer,
        model: model.to_string(),
    })
}

#[tauri::command]
pub async fn chat_with_current_note_stream(
    app: tauri::AppHandle,
    input: NoteChatStreamInput,
) -> Result<(), String> {
    let stream_id = input.stream_id.trim().to_string();
    if stream_id.is_empty() {
        return Err("AI chat stream failed: stream id is missing".to_string());
    }

    let question = input.question.trim().to_string();
    if question.is_empty() {
        let error = "AI chat stream failed: question is empty".to_string();
        emit_stream_error(&app, &stream_id, error.clone());
        return Err(error);
    }

    let config = match read_config().map(|config| config.ai) {
        Ok(config) => config,
        Err(error) => {
            emit_stream_error(&app, &stream_id, error.clone());
            return Err(error);
        }
    };
    let resolved = match resolve_ai_config(
        &config,
        input.provider_id.as_deref(),
        input.model_id.as_deref(),
    )
    .and_then(|resolved| {
        require_resolved_ai_config(&resolved)?;
        Ok(resolved)
    }) {
        Ok(resolved) => resolved,
        Err(error) => {
            emit_stream_error(&app, &stream_id, error.clone());
            return Err(error);
        }
    };
    let search_sources = if input.web_search_enabled {
        input.search_sources.as_slice()
    } else {
        &[]
    };
    let messages = build_stream_note_chat_messages(
        &question,
        &input.context,
        &input.chat_history,
        &resolved,
        search_sources,
    );
    let selected_config = config_from_resolved(resolved);
    let result =
        request_chat_completion_stream(&selected_config, messages, 0.2, "AI chat stream failed", app.clone(), stream_id.clone())
            .await;

    if let Err(error) = result {
        emit_stream_error(&app, &stream_id, error.clone());
        return Err(error);
    }

    Ok(())
}

fn request_provider_models(provider: &AiProvider) -> Result<Vec<String>, String> {
    let base_url = provider.base_url.trim().trim_end_matches('/');
    let api_key = provider.api_key.trim();
    if base_url.is_empty() {
        return Err("AI models sync failed: base_url is missing".to_string());
    }
    if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
        return Err("AI models sync failed: base_url must start with http:// or https://".to_string());
    }
    if api_key.is_empty() {
        return Err("AI models sync failed: api_key is missing".to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("AI models sync failed: cannot create HTTP client: {e}"))?;
    let response = client
        .get(format!("{base_url}/models"))
        .bearer_auth(api_key)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .map_err(|e| {
            if e.is_timeout() {
                "AI models sync failed: request timed out".to_string()
            } else {
                "AI models sync failed: network error".to_string()
            }
        })?;
    let status = response.status();
    let status_code = status.as_u16();
    let body = response
        .bytes()
        .map(|bytes| decode_response_body(&bytes))
        .unwrap_or_else(|e| format!("<failed to read response body: {e}>"));
    let body_trimmed = body.trim();
    if !status.is_success() {
        if status_code == 401 || status_code == 403 {
            return Err("AI models sync failed: API key is invalid or has no permission".to_string());
        }
        return Err(format!(
            "AI models sync failed: service returned HTTP {status_code}; debug=body_preview={}",
            sanitize_ai_detail(body_trimmed)
        ));
    }

    let value = serde_json::from_str::<JsonValue>(body_trimmed)
        .map_err(|_| "AI models sync failed: service did not return OpenAI-compatible JSON. Please add models manually.".to_string())?;
    let data = value
        .get("data")
        .and_then(JsonValue::as_array)
        .ok_or_else(|| "AI models sync failed: /models response had no data array. Please add models manually.".to_string())?;
    let mut model_ids = Vec::new();
    for item in data {
        let Some(id) = item.get("id").and_then(JsonValue::as_str).map(str::trim) else {
            continue;
        };
        if !id.is_empty() && !model_ids.iter().any(|existing| existing == id) {
            model_ids.push(id.to_string());
        }
    }
    if model_ids.is_empty() {
        return Err("AI models sync failed: /models returned no usable model id. Please add models manually.".to_string());
    }

    Ok(model_ids)
}

fn update_config_provider<F>(provider_id: &str, mut update: F) -> Result<AiConfigFields, String>
where
    F: FnMut(&mut AiProvider) -> Result<(), String>,
{
    let mut app_config = read_config()?;
    app_config.ai = normalize_ai_config(&app_config.ai);
    let provider = app_config
        .ai
        .providers
        .iter_mut()
        .find(|provider| provider.id == provider_id)
        .ok_or_else(|| "AI provider failed: provider does not exist".to_string())?;
    update(provider)?;
    provider.updated_at = Some(now_timestamp_millis());
    app_config.ai = normalize_ai_config(&app_config.ai);
    write_config(&app_config)?;
    Ok(app_config.ai)
}

fn sanitize_search_text(text: &str, max_chars: usize) -> String {
    let mut output = String::new();
    let mut in_tag = false;
    for ch in text.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }
    output
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(max_chars)
        .collect()
}

fn site_from_url(url: &str) -> Option<String> {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(ToOwned::to_owned))
}

fn infer_web_source_type(title: &str, url: &str, snippet: &str) -> String {
    let haystack = format!("{title}\n{url}\n{snippet}").to_ascii_lowercase();
    let text = format!("{title}\n{snippet}");
    if haystack.contains("oi-wiki.org") {
        return "wiki".to_string();
    }
    if haystack.contains("codeforces.com/problemset/problem")
        || haystack.contains("atcoder.jp/contests/")
    {
        return "official".to_string();
    }
    if haystack.contains("luogu.com.cn/problem/") {
        return "problem".to_string();
    }
    if haystack.contains("luogu.com.cn/discuss")
        || text.contains("讨论")
        || text.contains("警示后人")
        || text.contains("常见坑")
    {
        return "discussion".to_string();
    }
    if text.contains("题解") || haystack.contains("solution") {
        return "solution".to_string();
    }
    if haystack.contains("blog")
        || haystack.contains("cnblogs.com")
        || haystack.contains("blog.csdn.net")
        || haystack.contains("luogu.com.cn/article")
    {
        return "blog".to_string();
    }
    "unknown".to_string()
}

fn infer_web_reliability(title: &str, url: &str, snippet: &str) -> (String, String, String) {
    let haystack = format!("{title}\n{url}\n{snippet}").to_ascii_lowercase();
    let combined = format!("{title}\n{snippet}");
    if haystack.contains("oi-wiki.org") {
        return (
            "wiki".to_string(),
            "知识库".to_string(),
            "来自 OI Wiki 这类公开算法知识库".to_string(),
        );
    }
    if haystack.contains("codeforces.com/problemset/problem")
        || haystack.contains("atcoder.jp/contests/")
        || haystack.contains("luogu.com.cn/problem/")
    {
        return (
            "official".to_string(),
            "官方".to_string(),
            "看起来是题面或官方站点页面".to_string(),
        );
    }
    if haystack.contains("luogu.com.cn/discuss")
        || combined.contains("讨论")
        || combined.contains("警示后人")
        || combined.contains("常见坑")
    {
        return (
            "discussion".to_string(),
            "讨论".to_string(),
            "更像讨论区或经验反馈内容".to_string(),
        );
    }
    if combined.contains("题解") {
        return (
            "community_solution".to_string(),
            "社区题解".to_string(),
            "更像社区整理的题解内容".to_string(),
        );
    }
    if haystack.contains("blog")
        || haystack.contains("cnblogs.com")
        || haystack.contains("blog.csdn.net")
        || haystack.contains("luogu.com.cn/article")
    {
        return (
            "blog".to_string(),
            "博客".to_string(),
            "来自个人或社区博客页面".to_string(),
        );
    }
    (
        "unknown".to_string(),
        "未知".to_string(),
        "仅能判断为公开搜索结果，暂时无法可靠归类".to_string(),
    )
}

fn brave_search_status_error(status: reqwest::StatusCode, body: &str) -> String {
    let status_code = status.as_u16();
    match status_code {
        401 | 403 => "联网搜索失败：Brave Search API Key 无效或没有权限".to_string(),
        429 => "联网搜索失败：搜索服务配额不足或请求过快".to_string(),
        _ => format!(
            "联网搜索失败：搜索服务返回 HTTP {status_code}; debug=body_preview={}",
            sanitize_ai_detail(body)
        ),
    }
}

fn bocha_candidate_endpoints(endpoint: Option<&str>) -> Vec<String> {
    let normalized = endpoint
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(BOCHA_SEARCH_ENDPOINT);
    let mut candidates = vec![normalized.to_string()];
    if normalized == BOCHA_SEARCH_ENDPOINT {
        candidates.push(BOCHA_SEARCH_FALLBACK_ENDPOINT.to_string());
    } else if normalized == BOCHA_SEARCH_FALLBACK_ENDPOINT {
        candidates.push(BOCHA_SEARCH_ENDPOINT.to_string());
    }
    candidates
}

fn bocha_error_chain(error: &reqwest::Error) -> String {
    let mut chain = error.to_string();
    let mut source = error.source();
    while let Some(item) = source {
        chain.push_str(": ");
        chain.push_str(&item.to_string());
        source = item.source();
    }
    chain.to_ascii_lowercase()
}

fn is_bocha_endpoint_retryable(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::NOT_FOUND
}

fn is_bocha_connectivity_retryable(error: &reqwest::Error) -> bool {
    if error.is_timeout() {
        return false;
    }
    let detail = bocha_error_chain(error);
    error.is_connect()
        && (detail.contains("dns")
            || detail.contains("failed to lookup address")
            || detail.contains("name or service not known")
            || detail.contains("temporary failure in name resolution")
            || detail.contains("no such host")
            || detail.contains("connection refused")
            || detail.contains("connection reset")
            || detail.contains("invalid url"))
}

fn bocha_request_error(error: &reqwest::Error) -> String {
    let detail = bocha_error_chain(error);
    if error.is_timeout() {
        return "连接博查搜索服务超时，请检查网络或稍后重试".to_string();
    }
    if detail.contains("certificate") || detail.contains("tls") || detail.contains("ssl") {
        return "连接博查搜索服务时出现安全连接错误".to_string();
    }
    if detail.contains("dns")
        || detail.contains("failed to lookup address")
        || detail.contains("name or service not known")
        || detail.contains("temporary failure in name resolution")
        || detail.contains("no such host")
    {
        return "无法解析博查搜索服务域名，请检查网络或 API Endpoint".to_string();
    }
    "无法连接博查搜索服务，请检查网络或 API Endpoint".to_string()
}

fn bocha_search_status_error(status: reqwest::StatusCode, body: &str) -> String {
    let status_code = status.as_u16();
    match status_code {
        401 | 403 => "联网搜索失败：博查 API Key 无效或没有权限".to_string(),
        429 => "联网搜索失败：博查搜索额度不足或请求过快".to_string(),
        404 => "博查搜索接口地址可能不正确，请检查 API Endpoint".to_string(),
        500..=599 => "博查搜索服务暂时不可用".to_string(),
        _ => format!(
            "联网搜索失败：博查搜索服务返回 HTTP {status_code}; debug=body_preview={}",
            sanitize_ai_detail(body)
        ),
    }
}

fn brave_result_to_web_source(result: BraveWebResult) -> Option<WebSearchResult> {
    let url = result.url?.trim().to_string();
    if url.is_empty() {
        return None;
    }
    let title = sanitize_search_text(result.title.as_deref().unwrap_or(&url), 120);
    let snippet_text = sanitize_search_text(result.description.as_deref().unwrap_or(""), 220);
    let site = result
        .profile
        .and_then(|profile| profile.name)
        .map(|name| sanitize_search_text(&name, 80))
        .filter(|name| !name.is_empty())
        .or_else(|| site_from_url(&url));
    let source_type = infer_web_source_type(&title, &url, &snippet_text);
    let (reliability, reliability_label, reliability_reason) =
        infer_web_reliability(&title, &url, &snippet_text);
    let id = format!("web-{}", &stable_hash_hex(&url)[..12]);

    Some(WebSearchResult {
        id,
        title: if title.is_empty() { url.clone() } else { title },
        url,
        site,
        snippet: if snippet_text.is_empty() { None } else { Some(snippet_text) },
        source_type: Some(source_type),
        reliability: Some(reliability),
        reliability_label: Some(reliability_label),
        reliability_reason: Some(reliability_reason),
        relevance: None,
        relevance_label: None,
        relevance_reason: None,
        excerpt_status: None,
        excerpt: None,
        excerpt_error: None,
        fetched_at: None,
        selected: None,
    })
}

fn bocha_result_to_web_source(result: BochaWebResult) -> Option<WebSearchResult> {
    let url = result.url?.trim().to_string();
    if url.is_empty() {
        return None;
    }
    let title = sanitize_search_text(result.name.as_deref().unwrap_or(&url), 120);
    let snippet_source = result
        .summary
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or(result.snippet.as_deref())
        .unwrap_or("");
    let snippet_text = sanitize_search_text(snippet_source, 220);
    let site = result
        .site_name
        .as_deref()
        .map(|name| sanitize_search_text(name, 80))
        .filter(|name| !name.is_empty())
        .or_else(|| site_from_url(&url));
    let source_type = infer_web_source_type(&title, &url, &snippet_text);
    let (reliability, reliability_label, reliability_reason) =
        infer_web_reliability(&title, &url, &snippet_text);
    let id = result
        .id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("web-{}", &stable_hash_hex(&url)[..12]));

    Some(WebSearchResult {
        id,
        title: if title.is_empty() { url.clone() } else { title },
        url,
        site,
        snippet: if snippet_text.is_empty() { None } else { Some(snippet_text) },
        source_type: Some(source_type),
        reliability: Some(reliability),
        reliability_label: Some(reliability_label),
        reliability_reason: Some(reliability_reason),
        relevance: None,
        relevance_label: None,
        relevance_reason: None,
        excerpt_status: None,
        excerpt: None,
        excerpt_error: None,
        fetched_at: None,
        selected: None,
    })
}

fn bocha_response_items(response: BochaSearchResponse) -> Vec<BochaWebResult> {
    response
        .web_pages
        .or_else(|| response.data.and_then(|data| data.web_pages))
        .map(|web_pages| web_pages.value)
        .unwrap_or_default()
}

fn search_brave_sources(
    request: &WebSearchRequestInput,
    api_key: &str,
    max_results: usize,
) -> Result<Vec<WebSearchResult>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("联网搜索失败：无法创建 HTTP client: {e}"))?;
    let mut seen_urls = HashSet::new();
    let mut results = Vec::new();
    let per_query_count = max_results.clamp(1, 10).to_string();

    for query in request
        .queries
        .iter()
        .map(|query| query.trim())
        .filter(|query| !query.is_empty())
        .take(WEB_SEARCH_MAX_QUERIES)
    {
        if results.len() >= max_results {
            break;
        }
        let mut url = reqwest::Url::parse(BRAVE_SEARCH_ENDPOINT)
            .map_err(|e| format!("联网搜索失败：搜索服务 URL 无效: {e}"))?;
        url.query_pairs_mut()
            .append_pair("q", query)
            .append_pair("count", per_query_count.as_str())
            .append_pair("country", "cn")
            .append_pair("search_lang", "zh-hans");
        let response = client
            .get(url)
            .header(reqwest::header::ACCEPT, "application/json")
            .header("X-Subscription-Token", api_key)
            .send()
            .map_err(|e| {
                if e.is_timeout() {
                    "联网搜索失败：搜索服务请求超时".to_string()
                } else {
                    "联网搜索失败：网络请求失败".to_string()
                }
            })?;

        let status = response.status();
        let body = response
            .bytes()
            .map(|bytes| decode_response_body(&bytes))
            .map_err(|_| "联网搜索失败：搜索服务响应读取失败".to_string())?;
        let body_trimmed = body.trim();
        if !status.is_success() {
            return Err(brave_search_status_error(status, body_trimmed));
        }

        let parsed = serde_json::from_str::<BraveSearchResponse>(body_trimmed)
            .map_err(|_| "联网搜索失败：搜索服务返回格式异常".to_string())?;
        let items = parsed.web.map(|web| web.results).unwrap_or_default();
        for item in items {
            if results.len() >= max_results {
                break;
            }
            let Some(source) = brave_result_to_web_source(item) else {
                continue;
            };
            if seen_urls.insert(source.url.clone()) {
                results.push(source);
            }
        }
    }

    Ok(results)
}

#[allow(dead_code)]
fn search_bocha_sources(
    request: &WebSearchRequestInput,
    api_key: &str,
    endpoint: Option<&str>,
    max_results: usize,
) -> Result<Vec<WebSearchResult>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("联网搜索失败：无法创建 HTTP client: {e}"))?;
    let mut seen_urls = HashSet::new();
    let mut results = Vec::new();
    let per_query_count = max_results.clamp(1, 10);
    let _ = endpoint;

    for query in request
        .queries
        .iter()
        .map(|query| query.trim())
        .filter(|query| !query.is_empty())
        .take(WEB_SEARCH_MAX_QUERIES)
    {
        if results.len() >= max_results {
            break;
        }

        let response = client
            .post(BOCHA_SEARCH_ENDPOINT)
            .header(reqwest::header::ACCEPT, "application/json")
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .bearer_auth(api_key)
            .json(&json!({
                "query": query,
                "freshness": "noLimit",
                "summary": true,
                "count": per_query_count,
            }))
            .send()
            .map_err(|e| {
                if e.is_timeout() {
                    "联网搜索失败：博查搜索请求超时".to_string()
                } else {
                    "联网搜索失败：无法连接博查搜索服务".to_string()
                }
            })?;

        let status = response.status();
        let body = response
            .bytes()
            .map(|bytes| decode_response_body(&bytes))
            .map_err(|_| "联网搜索失败：博查搜索响应读取失败".to_string())?;
        let body_trimmed = body.trim();
        if !status.is_success() {
            return Err(bocha_search_status_error(status, body_trimmed));
        }

        let parsed = serde_json::from_str::<BochaSearchResponse>(body_trimmed)
            .map_err(|_| "联网搜索失败：博查搜索返回格式异常".to_string())?;
        let items = parsed.web_pages.map(|web_pages| web_pages.value).unwrap_or_default();
        for item in items {
            if results.len() >= max_results {
                break;
            }
            let Some(source) = bocha_result_to_web_source(item) else {
                continue;
            };
            if seen_urls.insert(source.url.clone()) {
                results.push(source);
            }
        }
    }

    Ok(results)
}

fn search_bocha_sources_with_fallback(
    request: &WebSearchRequestInput,
    api_key: &str,
    endpoint: Option<&str>,
    max_results: usize,
) -> Result<Vec<WebSearchResult>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("联网搜索失败：无法创建 HTTP client: {e}"))?;
    let mut seen_urls = HashSet::new();
    let mut results = Vec::new();
    let per_query_count = max_results.clamp(1, 10);
    let endpoints = bocha_candidate_endpoints(endpoint);

    for query in request
        .queries
        .iter()
        .map(|query| query.trim())
        .filter(|query| !query.is_empty())
        .take(WEB_SEARCH_MAX_QUERIES)
    {
        if results.len() >= max_results {
            break;
        }

        let mut last_error: Option<String> = None;

        for (index, candidate_endpoint) in endpoints.iter().enumerate() {
            let response = client
                .post(candidate_endpoint)
                .header(reqwest::header::ACCEPT, "application/json")
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .bearer_auth(api_key)
                .json(&json!({
                    "query": query,
                    "freshness": "noLimit",
                    "summary": true,
                    "count": per_query_count,
                }))
                .send();

            let response = match response {
                Ok(response) => response,
                Err(error) => {
                    last_error = Some(bocha_request_error(&error));
                    if is_bocha_connectivity_retryable(&error) && index + 1 < endpoints.len() {
                        continue;
                    }
                    return Err(last_error.unwrap_or_else(|| "无法连接博查搜索服务，请检查网络或 API Endpoint".to_string()));
                }
            };

            let status = response.status();
            let body = response
                .bytes()
                .map(|bytes| decode_response_body(&bytes))
                .map_err(|_| "博查搜索响应读取失败".to_string())?;
            let body_trimmed = body.trim();
            if !status.is_success() {
                last_error = Some(bocha_search_status_error(status, body_trimmed));
                if is_bocha_endpoint_retryable(status) && index + 1 < endpoints.len() {
                    continue;
                }
                return Err(last_error.unwrap_or_else(|| "博查搜索服务暂时不可用".to_string()));
            }

            let parsed = serde_json::from_str::<BochaSearchResponse>(body_trimmed)
                .map_err(|_| "博查搜索返回格式异常，可能是接口版本变化".to_string())?;
            let items = bocha_response_items(parsed);
            for item in items {
                if results.len() >= max_results {
                    break;
                }
                let Some(source) = bocha_result_to_web_source(item) else {
                    continue;
                };
                if seen_urls.insert(source.url.clone()) {
                    results.push(source);
                }
            }
            last_error = None;
            break;
        }

        if let Some(error) = last_error {
            return Err(error);
        }
    }

    Ok(results)
}

fn is_private_or_local_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(value) => {
            value.is_private()
                || value.is_loopback()
                || value.is_link_local()
                || value.is_broadcast()
                || value.is_documentation()
                || value.octets()[0] == 0
        }
        IpAddr::V6(value) => {
            value.is_loopback()
                || value.is_unspecified()
                || value.is_unique_local()
                || value.is_unicast_link_local()
        }
    }
}

fn validate_public_web_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|_| "网页地址无效，无法读取正文".to_string())?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("只允许读取公开 http / https 网页".to_string()),
    }
    if parsed.username() != "" || parsed.password().is_some() {
        return Err("网页地址包含认证信息，已跳过读取".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "网页地址缺少域名，无法读取正文".to_string())?
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host.ends_with(".lan")
    {
        return Err("不会访问 localhost、内网或本地域名".to_string());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_or_local_ip(ip) {
            return Err("不会访问 localhost、内网或本地地址".to_string());
        }
    } else {
        let port = parsed.port_or_known_default().unwrap_or(443);
        let addrs = (host.as_str(), port)
            .to_socket_addrs()
            .map_err(|_| "无法解析网页域名，已跳过正文读取".to_string())?;
        let mut resolved_any = false;
        for addr in addrs {
            resolved_any = true;
            if is_private_or_local_ip(addr.ip()) {
                return Err("网页域名解析到内网或本地地址，已跳过读取".to_string());
            }
        }
        if !resolved_any {
            return Err("无法解析网页域名，已跳过正文读取".to_string());
        }
    }
    Ok(parsed)
}

fn strip_html_tag_blocks(mut html: String, tag: &str) -> String {
    let start_tag = format!("<{tag}");
    let end_tag = format!("</{tag}>");
    loop {
        let lower = html.to_ascii_lowercase();
        let Some(start) = lower.find(&start_tag) else {
            break;
        };
        let Some(relative_end) = lower[start..].find(&end_tag) else {
            html.replace_range(start..html.len(), " ");
            break;
        };
        let end = start + relative_end + end_tag.len();
        html.replace_range(start..end, " ");
    }
    html
}

fn decode_html_entities(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

fn strip_html_tags_to_text(html: &str) -> String {
    let mut cleaned = html.to_string();
    for tag in [
        "script", "style", "nav", "footer", "header", "aside", "iframe", "noscript", "svg",
        "canvas", "form",
    ] {
        cleaned = strip_html_tag_blocks(cleaned, tag);
    }
    let mut text = String::with_capacity(cleaned.len());
    let mut in_tag = false;
    let mut tag_name = String::new();
    for ch in cleaned.chars() {
        if ch == '<' {
            in_tag = true;
            tag_name.clear();
            continue;
        }
        if in_tag {
            if ch == '>' {
                let name = tag_name
                    .trim_start_matches('/')
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if matches!(
                    name.as_str(),
                    "p" | "br" | "div" | "section" | "article" | "li" | "ul" | "ol" | "pre"
                        | "code" | "h1" | "h2" | "h3" | "h4" | "h5" | "tr"
                ) {
                    text.push('\n');
                }
                in_tag = false;
            } else if tag_name.len() < 32 {
                tag_name.push(ch);
            }
            continue;
        }
        text.push(ch);
    }
    decode_html_entities(&text)
}

fn normalize_extracted_text(text: &str, max_chars: usize) -> String {
    let mut lines = Vec::new();
    for line in text.lines() {
        let normalized = line.split_whitespace().collect::<Vec<_>>().join(" ");
        let trimmed = normalized.trim();
        if trimmed.len() < 2 {
            continue;
        }
        let lower = trimmed.to_ascii_lowercase();
        if lower.contains("广告") || lower.contains("copyright") || lower.contains("版权所有") {
            continue;
        }
        lines.push(trimmed.to_string());
    }
    let mut result = lines.join("\n");
    if result.chars().count() > max_chars {
        result = result.chars().take(max_chars).collect::<String>();
        result.push_str("...");
    }
    result
}

fn fetch_single_web_source_excerpt(
    client: &reqwest::blocking::Client,
    source: &WebSearchResult,
    max_chars: usize,
) -> WebSourceExcerptResult {
    let fetched_at = Utc::now().timestamp_millis();
    let id = source.id.clone();
    let url = source.url.clone();
    let title = source.title.clone();
    let parsed_url = match validate_public_web_url(&url) {
        Ok(url) => url,
        Err(error) => {
            return WebSourceExcerptResult {
                id,
                url,
                title,
                fetched: false,
                excerpt: None,
                error: Some(error),
                fetched_at,
            };
        }
    };

    let mut response = match client
        .get(parsed_url)
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.1",
        )
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            let message = if error.is_timeout() {
                "读取网页正文超时".to_string()
            } else {
                "读取网页正文失败".to_string()
            };
            return WebSourceExcerptResult {
                id,
                url,
                title,
                fetched: false,
                excerpt: None,
                error: Some(message),
                fetched_at,
            };
        }
    };

    let status = response.status();
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::UNAUTHORIZED {
        return WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("网页正文不可用或需要登录".to_string()),
            fetched_at,
        };
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        return WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("网页不存在或地址不可用".to_string()),
            fetched_at,
        };
    }
    if !status.is_success() {
        return WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("网页暂时不可读取".to_string()),
            fetched_at,
        };
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if content_type.contains("application/pdf")
        || content_type.starts_with("image/")
        || content_type.starts_with("video/")
        || content_type.starts_with("audio/")
        || content_type.contains("application/octet-stream")
    {
        return WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("当前来源不是可直接提取的网页正文".to_string()),
            fetched_at,
        };
    }
    if response
        .content_length()
        .map(|length| length > WEB_EXTRACT_MAX_RESPONSE_BYTES as u64)
        .unwrap_or(false)
    {
        return WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("网页正文过大，已跳过读取".to_string()),
            fetched_at,
        };
    }

    let mut body_bytes = Vec::new();
    let read_result = response
        .by_ref()
        .take((WEB_EXTRACT_MAX_RESPONSE_BYTES + 1) as u64)
        .read_to_end(&mut body_bytes);
    let body = match read_result {
        Ok(_) => {
            if body_bytes.len() > WEB_EXTRACT_MAX_RESPONSE_BYTES {
                return WebSourceExcerptResult {
                    id,
                    url,
                    title,
                    fetched: false,
                    excerpt: None,
                    error: Some("网页正文过大，已跳过读取".to_string()),
                    fetched_at,
                };
            }
            decode_response_body(&body_bytes)
        }
        Err(_) => {
            return WebSourceExcerptResult {
                id,
                url,
                title,
                fetched: false,
                excerpt: None,
                error: Some("网页正文读取失败".to_string()),
                fetched_at,
            };
        }
    };
    let extracted = if content_type.contains("text/plain") {
        normalize_extracted_text(&body, max_chars)
    } else {
        normalize_extracted_text(&strip_html_tags_to_text(&body), max_chars)
    };

    if extracted.chars().count() < 120 {
        return WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("网页正文不可用或需要登录".to_string()),
            fetched_at,
        };
    }

    WebSourceExcerptResult {
        id,
        url,
        title,
        fetched: true,
        excerpt: Some(extracted),
        error: None,
        fetched_at,
    }
}

fn fetch_web_source_excerpts_blocking(
    input: FetchWebSourceExcerptsInput,
) -> Result<Vec<WebSourceExcerptResult>, String> {
    let config = normalize_web_search_config(&read_config()?.ai.web_search);
    if !config.public_search_consent {
        return Err("需要先授权公开网页搜索".to_string());
    }

    let max_sources = input
        .max_sources
        .unwrap_or(WEB_EXTRACT_MAX_SOURCES)
        .clamp(1, WEB_EXTRACT_MAX_SOURCES);
    let max_chars = input
        .max_chars_per_source
        .unwrap_or(WEB_EXTRACT_MAX_CHARS_PER_SOURCE)
        .clamp(500, WEB_EXTRACT_MAX_CHARS_PER_SOURCE);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("oi-notebook-public-web-excerpt/0.1")
        .build()
        .map_err(|e| format!("无法创建网页读取 client: {e}"))?;

    let handles = input
        .sources
        .into_iter()
        .take(max_sources)
        .enumerate()
        .map(|(index, source)| {
            let client = client.clone();
            std::thread::spawn(move || (index, fetch_single_web_source_excerpt(&client, &source, max_chars)))
        })
        .collect::<Vec<_>>();
    let mut results = Vec::new();
    for handle in handles {
        match handle.join() {
            Ok(result) => results.push(result),
            Err(_) => {
                results.push((
                    usize::MAX,
                    WebSourceExcerptResult {
                        id: "unknown".to_string(),
                        url: "".to_string(),
                        title: "未知来源".to_string(),
                        fetched: false,
                        excerpt: None,
                        error: Some("网页摘录任务失败".to_string()),
                        fetched_at: Utc::now().timestamp_millis(),
                    },
                ));
            }
        }
    }
    results.sort_by_key(|(index, _)| *index);

    let mut total_chars = 0usize;
    let mut limited_results = Vec::new();
    for (_, mut result) in results {
        if let Some(excerpt) = result.excerpt.as_mut() {
            let remaining = WEB_EXTRACT_TOTAL_CONTEXT_CHARS.saturating_sub(total_chars);
            if remaining == 0 {
                result.fetched = false;
                result.excerpt = None;
                result.error = Some("网页摘录总长度已达上限".to_string());
            } else if excerpt.chars().count() > remaining {
                *excerpt = excerpt.chars().take(remaining).collect::<String>();
                excerpt.push_str("...");
                total_chars = WEB_EXTRACT_TOTAL_CONTEXT_CHARS;
            } else {
                total_chars += excerpt.chars().count();
            }
        }
        limited_results.push(result);
    }
    Ok(limited_results)
}

#[tauri::command]
pub async fn fetch_web_source_excerpts(
    input: FetchWebSourceExcerptsInput,
) -> Result<Vec<WebSourceExcerptResult>, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_web_source_excerpts_blocking(input))
        .await
        .map_err(|e| format!("网页摘录任务失败: {e}"))?
}

fn search_web_sources_blocking(request: WebSearchRequestInput) -> Result<Vec<WebSearchResult>, String> {
    let provider = request
        .provider
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(WEB_SEARCH_DEFAULT_PROVIDER);
    let queries = request
        .queries
        .iter()
        .map(|query| query.trim())
        .filter(|query| !query.is_empty())
        .take(WEB_SEARCH_MAX_QUERIES)
        .collect::<Vec<_>>();
    if queries.is_empty() {
        return Ok(Vec::new());
    }

    let app_config = read_config()?;
    let search_config = normalize_web_search_config(&app_config.ai.web_search);
    if !search_config.public_search_consent {
        return Err("需要先授权公开网页搜索".to_string());
    }
    if !search_config.enabled {
        return Err("需要在 AI 设置中配置搜索服务".to_string());
    }

    let max_results = request
        .max_results
        .unwrap_or(WEB_SEARCH_MAX_RESULTS)
        .clamp(1, WEB_SEARCH_MAX_RESULTS);
    match provider {
        WEB_SEARCH_DEFAULT_PROVIDER => {
            if search_config.brave_api_key.trim().is_empty() {
                return Err("需要在 AI 设置中配置 Brave Search API Key".to_string());
            }
            if search_config.brave_api_key.contains(['\r', '\n']) {
                return Err("联网搜索失败：Brave Search API Key 包含非法字符".to_string());
            }
            search_brave_sources(&request, search_config.brave_api_key.trim(), max_results)
        }
        WEB_SEARCH_COMPAT_PROVIDER => {
            if search_config.bocha_api_key.trim().is_empty() {
                return Err("需要在 AI 设置中配置博查 API Key".to_string());
            }
            if search_config.bocha_api_key.contains(['\r', '\n']) {
                return Err("联网搜索失败：博查 API Key 包含非法字符".to_string());
            }
            search_bocha_sources_with_fallback(
                &request,
                search_config.bocha_api_key.trim(),
                Some(search_config.bocha_endpoint.as_str()),
                max_results,
            )
        }
        _ => Err("联网搜索失败：当前 Provider 不受支持".to_string()),
    }
}

#[tauri::command]
pub async fn search_web_sources(request: WebSearchRequestInput) -> Result<Vec<WebSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || search_web_sources_blocking(request))
        .await
        .map_err(|e| format!("联网搜索任务失败: {e}"))?
}

#[tauri::command]
pub fn test_web_search_connection(input: TestWebSearchConnectionInput) -> Result<TestWebSearchConnectionResult, String> {
    let provider = input.provider.trim();
    if provider != WEB_SEARCH_COMPAT_PROVIDER {
        return Err("当前测试连接只支持博查 Bocha".to_string());
    }
    let api_key = input.api_key.trim();
    if api_key.is_empty() {
        return Err("需要先填写博查 API Key".to_string());
    }
    if api_key.contains(['\r', '\n']) {
        return Err("博查 API Key 包含非法字符".to_string());
    }
    let endpoint = input
        .endpoint
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(BOCHA_SEARCH_ENDPOINT)
        .to_string();
    let request = WebSearchRequestInput {
        queries: vec!["P1000 洛谷".to_string()],
        intent: "general_web".to_string(),
        problem_id: None,
        max_results: Some(3),
        provider: Some(WEB_SEARCH_COMPAT_PROVIDER.to_string()),
    };
    let _ = search_bocha_sources_with_fallback(&request, api_key, Some(endpoint.as_str()), 3)?;
    Ok(TestWebSearchConnectionResult {
        ok: true,
        provider: WEB_SEARCH_COMPAT_PROVIDER.to_string(),
        endpoint,
    })
}

#[tauri::command]
pub fn get_ai_config() -> Result<AiConfigFields, String> {
    Ok(normalize_ai_config(&read_config()?.ai))
}

#[tauri::command]
pub fn save_ai_config(config: AiConfigFields) -> Result<(), String> {
    let mut app_config = read_config()?;
    app_config.ai = normalize_ai_config(&config);
    write_config(&app_config)
}

#[tauri::command]
pub fn test_ai_connection() -> Result<TestAiConnectionResult, String> {
    let config = read_config()?;
    test_ai_connection_with_config(&config.ai)
}

#[tauri::command]
pub fn save_ai_provider(provider: AiProvider) -> Result<AiProviderActionResult, String> {
    let provider = sanitize_ai_provider(&provider)
        .ok_or_else(|| "AI provider save failed: provider id is missing".to_string())?;
    let mut app_config = read_config()?;
    app_config.ai = normalize_ai_config(&app_config.ai);
    let mut saved_provider = provider.clone();
    let now = now_timestamp_millis();
    saved_provider.created_at = saved_provider.created_at.or(Some(now));
    saved_provider.updated_at = Some(now);

    if let Some(existing) = app_config
        .ai
        .providers
        .iter_mut()
        .find(|existing| existing.id == saved_provider.id)
    {
        *existing = saved_provider.clone();
    } else {
        app_config.ai.providers.push(saved_provider.clone());
    }
    if app_config.ai.default_provider_id.is_none() {
        app_config.ai.default_provider_id = Some(saved_provider.id.clone());
    }
    if app_config.ai.default_model_id.is_none() {
        app_config.ai.default_model_id = saved_provider.default_model.clone();
    }
    app_config.ai = normalize_ai_config(&app_config.ai);
    write_config(&app_config)?;
    let provider = app_config
        .ai
        .providers
        .iter()
        .find(|provider| provider.id == saved_provider.id)
        .cloned()
        .unwrap_or(saved_provider);
    Ok(AiProviderActionResult {
        provider,
        config: app_config.ai,
    })
}

#[tauri::command]
pub fn delete_ai_provider(provider_id: String) -> Result<AiConfigFields, String> {
    let provider_id = provider_id.trim();
    if provider_id.is_empty() {
        return Err("AI provider delete failed: provider id is missing".to_string());
    }
    let mut app_config = read_config()?;
    app_config.ai = normalize_ai_config(&app_config.ai);
    app_config.ai.providers.retain(|provider| provider.id != provider_id);
    if app_config.ai.default_provider_id.as_deref() == Some(provider_id) {
        app_config.ai.default_provider_id = app_config.ai.providers.first().map(|provider| provider.id.clone());
        app_config.ai.default_model_id = app_config
            .ai
            .providers
            .first()
            .and_then(|provider| provider.default_model.clone())
            .or_else(|| {
                app_config
                    .ai
                    .providers
                    .first()
                    .and_then(|provider| provider.models.first().map(|model| model.id.clone()))
            });
    }
    app_config.ai = normalize_ai_config(&app_config.ai);
    write_config(&app_config)?;
    Ok(app_config.ai)
}

#[tauri::command]
pub fn set_default_ai_model(provider_id: String, model_id: String) -> Result<AiConfigFields, String> {
    let provider_id = provider_id.trim().to_string();
    let model_id = model_id.trim().to_string();
    if provider_id.is_empty() || model_id.is_empty() {
        return Err("AI default model failed: provider id and model id are required".to_string());
    }
    let mut config = update_config_provider(&provider_id, |provider| {
        if !provider.models.iter().any(|model| model.id == model_id && model.enabled) {
            return Err("AI default model failed: model does not exist".to_string());
        }
        provider.default_model = Some(model_id.clone());
        Ok(())
    })?;
    config.default_provider_id = Some(provider_id);
    config.default_model_id = Some(model_id);
    let mut app_config = read_config()?;
    app_config.ai = normalize_ai_config(&config);
    write_config(&app_config)?;
    Ok(app_config.ai)
}

#[tauri::command]
pub fn sync_ai_provider_models(provider_id: String) -> Result<SyncAiProviderModelsResult, String> {
    let provider_id = provider_id.trim().to_string();
    if provider_id.is_empty() {
        return Err("AI models sync failed: provider id is missing".to_string());
    }
    let config = read_config()?.ai;
    let normalized = normalize_ai_config(&config);
    let provider = normalized
        .providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .cloned()
        .ok_or_else(|| "AI models sync failed: provider does not exist".to_string())?;
    let synced_models = request_provider_models(&provider)?;
    let synced_count = synced_models.len();
    let mut updated_config = update_config_provider(&provider_id, |provider| {
        let now = now_timestamp_millis();
        for model_id in &synced_models {
            if let Some(existing) = provider.models.iter_mut().find(|model| model.id == *model_id) {
                existing.enabled = true;
                existing.source = "synced".to_string();
                existing.updated_at = Some(now);
            } else {
                provider.models.push(AiModel {
                    id: model_id.clone(),
                    name: None,
                    enabled: true,
                    supports_stream: true,
                    source: "synced".to_string(),
                    updated_at: Some(now),
                });
            }
        }
        if provider.default_model.is_none() {
            provider.default_model = provider.models.first().map(|model| model.id.clone());
        }
        Ok(())
    })?;
    updated_config = normalize_ai_config(&updated_config);
    let provider = updated_config
        .providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .cloned()
        .ok_or_else(|| "AI models sync failed: provider was removed".to_string())?;
    Ok(SyncAiProviderModelsResult {
        provider,
        synced_count,
        config: updated_config,
    })
}

#[tauri::command]
pub fn sync_ai_provider_models_draft(provider: AiProvider) -> Result<SyncAiProviderDraftModelsResult, String> {
    let mut provider = sanitize_ai_provider(&provider)
        .ok_or_else(|| "AI models sync failed: provider id is missing".to_string())?;
    let synced_models = request_provider_models(&provider)?;
    let synced_count = synced_models.len();
    let now = now_timestamp_millis();
    for model_id in &synced_models {
        if let Some(existing) = provider.models.iter_mut().find(|model| model.id == *model_id) {
            existing.enabled = true;
            existing.source = "synced".to_string();
            existing.updated_at = Some(now);
        } else {
            provider.models.push(AiModel {
                id: model_id.clone(),
                name: None,
                enabled: true,
                supports_stream: true,
                source: "synced".to_string(),
                updated_at: Some(now),
            });
        }
    }
    if provider.default_model.is_none() {
        provider.default_model = provider.models.first().map(|model| model.id.clone());
    }
    Ok(SyncAiProviderDraftModelsResult {
        provider,
        synced_count,
    })
}

#[tauri::command]
pub fn test_ai_provider(provider_id: String) -> Result<TestAiProviderResult, String> {
    let provider_id = provider_id.trim().to_string();
    if provider_id.is_empty() {
        return Err("AI provider test failed: provider id is missing".to_string());
    }
    let config = normalize_ai_config(&read_config()?.ai);
    let provider = config
        .providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .ok_or_else(|| "AI provider test failed: provider does not exist".to_string())?;
    let models = request_provider_models(provider)?;
    Ok(TestAiProviderResult {
        provider_id,
        ok: true,
        model_count: models.len(),
    })
}

#[tauri::command]
pub fn test_ai_provider_draft(provider: AiProvider) -> Result<TestAiProviderResult, String> {
    let provider = sanitize_ai_provider(&provider)
        .ok_or_else(|| "AI provider test failed: provider id is missing".to_string())?;
    let models = request_provider_models(&provider)?;
    Ok(TestAiProviderResult {
        provider_id: provider.id,
        ok: true,
        model_count: models.len(),
    })
}

#[tauri::command]
pub fn add_ai_provider_model(provider_id: String, model_id: String) -> Result<AiProviderActionResult, String> {
    let provider_id = provider_id.trim().to_string();
    let model_id = model_id.trim().to_string();
    if provider_id.is_empty() || model_id.is_empty() {
        return Err("AI model add failed: provider id and model id are required".to_string());
    }
    let config = update_config_provider(&provider_id, |provider| {
        if !provider.models.iter().any(|model| model.id == model_id) {
            provider.models.push(model_from_id(&model_id, "manual").expect("model id was checked"));
        }
        if provider.default_model.is_none() {
            provider.default_model = Some(model_id.clone());
        }
        Ok(())
    })?;
    let provider = config
        .providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .cloned()
        .ok_or_else(|| "AI model add failed: provider was removed".to_string())?;
    Ok(AiProviderActionResult { provider, config })
}

#[tauri::command]
pub fn delete_ai_provider_model(provider_id: String, model_id: String) -> Result<AiProviderActionResult, String> {
    let provider_id = provider_id.trim().to_string();
    let model_id = model_id.trim().to_string();
    if provider_id.is_empty() || model_id.is_empty() {
        return Err("AI model delete failed: provider id and model id are required".to_string());
    }
    let config = update_config_provider(&provider_id, |provider| {
        provider.models.retain(|model| model.id != model_id);
        if provider.default_model.as_deref() == Some(model_id.as_str()) {
            provider.default_model = provider.models.first().map(|model| model.id.clone());
        }
        Ok(())
    })?;
    let provider = config
        .providers
        .iter()
        .find(|provider| provider.id == provider_id)
        .cloned()
        .ok_or_else(|| "AI model delete failed: provider was removed".to_string())?;
    Ok(AiProviderActionResult { provider, config })
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
            ..AiConfigFields::default()
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
            ..AiConfigFields::default()
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
            ..AiConfigFields::default()
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
            ..AiConfigFields::default()
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
            ..AiConfigFields::default()
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
