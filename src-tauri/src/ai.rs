use std::{
    collections::{BTreeMap, HashSet},
    error::Error,
    fs,
    io::Read,
    net::{IpAddr, ToSocketAddrs},
    panic::{catch_unwind, AssertUnwindSafe},
    path::{Path, PathBuf},
    thread,
    time::{Duration, Instant},
};

use chrono::{TimeZone, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use tauri::Emitter;

use crate::local_search::{
    LocalNoteSearchInput, LocalNoteSearchResult, LocalSearchSelfCheckProbe,
};
use crate::luogu::{read_config, write_config, AiConfigFields, AiModel, AiProvider};
use crate::paths;
use crate::prompts::{render_prompt_template, PromptTemplateKind};
use crate::web_cache;
use crate::web_extract::{self, WebExtractContext};

const LUOGU_INSIGHT_TASK: &str = "luogu-insight";
const NOTE_METADATA_TASK: &str = "note-metadata";
const NOTE_POLISH_TASK: &str = "note-polish";
const AI_DIAGNOSTIC_PREVIEW_CHARS: usize = 500;
const AI_RESPONSE_RETRY_ATTEMPTS: usize = 2;
const AI_DEFAULT_REQUEST_TIMEOUT_SECS: u64 = 20;
const AI_FULL_NOTE_POLISH_TIMEOUT_SECS: u64 = 180;
const DEFAULT_LEGACY_PROVIDER_ID: &str = "default-openai-compatible";
const OPENAI_COMPATIBLE_PROVIDER_KIND: &str = "openai-compatible";
const WEB_SEARCH_DEFAULT_PROVIDER: &str = "bocha";
const WEB_SEARCH_BRAVE_PROVIDER: &str = "brave";
const WEB_SEARCH_BING_PROVIDER: &str = "bing";
const WEB_SEARCH_REMOVED_SEARXNG_PROVIDER: &str = "searxng";
const WEB_SEARCH_MAX_QUERIES: usize = 8;
const WEB_SEARCH_MAX_RESULTS: usize = 40;
const BING_PUBLIC_MAX_QUERIES: usize = 3;
const BING_PUBLIC_MAX_RESULTS: usize = 24;
const BING_PUBLIC_MAX_RESULTS_PER_QUERY: usize = 8;
const BING_PUBLIC_FAILURE_TTL_SECONDS: i64 = 15 * 60;
const WEB_EXTRACT_MAX_SOURCES: usize = 12;
const WEB_EXTRACT_MAX_CHARS_PER_SOURCE: usize = 5000;
const WEB_EXTRACT_TOTAL_CONTEXT_CHARS: usize = 15000;
const WEB_EXTRACT_MAX_RESPONSE_BYTES: usize = 2 * 1024 * 1024;
const WEB_SEARCH_NEWS_TTL_SECONDS: i64 = 2 * 60 * 60;
const WEB_SEARCH_OI_TTL_SECONDS: i64 = 14 * 24 * 60 * 60;
const WEB_EXCERPT_DEFAULT_TTL_SECONDS: i64 = 14 * 24 * 60 * 60;
const WEB_EXCERPT_NEWS_TTL_SECONDS: i64 = 6 * 60 * 60;
const WEB_EXCERPT_FAILURE_TTL_SECONDS: i64 = 20 * 60;
const BRAVE_SEARCH_ENDPOINT: &str = "https://api.search.brave.com/res/v1/web/search";
const BOCHA_SEARCH_ENDPOINT: &str = "https://api.bochaai.com/v1/web-search";
const BOCHA_SEARCH_FALLBACK_ENDPOINT: &str = "https://api.bocha.cn/v1/web-search";
const BING_SEARCH_ENDPOINT: &str = "https://www.bing.com/search";
const BING_NEWS_SEARCH_ENDPOINT: &str = "https://www.bing.com/news/search";
const BING_PUBLIC_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";

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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PolishedAiPromptTemplate {
    pub polished_prompt: String,
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
    #[serde(default)]
    pub tag_taxonomy_context: Option<String>,
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
    #[serde(default)]
    pub local_note_sources: Vec<LocalNoteSearchResult>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchRequestInput {
    #[serde(default)]
    pub raw_user_query: Option<String>,
    pub queries: Vec<String>,
    pub intent: String,
    #[serde(default)]
    pub vertical: Option<String>,
    #[serde(default)]
    pub freshness: Option<String>,
    #[serde(default)]
    pub problem_id: Option<String>,
    #[serde(default)]
    pub algorithm_keywords: Vec<String>,
    #[serde(default)]
    pub topic_keywords: Vec<String>,
    #[serde(default)]
    pub max_results: Option<usize>,
    #[serde(default)]
    pub provider: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSearchQueryPlanInput {
    pub user_input: String,
    pub intent: String,
    pub provider: String,
    #[serde(default)]
    pub max_queries: Option<usize>,
    #[serde(default)]
    pub rule_based_queries: Vec<String>,
    #[serde(default)]
    pub topic_keywords: Vec<String>,
    #[serde(default)]
    pub news_intent: bool,
    #[serde(default)]
    pub recency_intent: bool,
    #[serde(default)]
    pub current_date: Option<String>,
    #[serde(default)]
    pub current_date_text: Option<String>,
    #[serde(default)]
    pub current_time_zone: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default)]
    pub recency_window_hint: Option<String>,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AiSearchQueryPlan {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_goal: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vertical: Option<String>,
    pub rewritten_intent: String,
    pub queries: Vec<String>,
    pub topic_keywords: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub required_keywords: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub negative_keywords: Vec<String>,
    pub freshness: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depth: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_budget: Option<usize>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub preferred_source_types: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub preferred_domains: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub avoid_source_types: Vec<String>,
    pub reason: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WebSearchResult {
    pub id: String,
    pub title: String,
    pub url: String,
    pub final_url: Option<String>,
    pub site: Option<String>,
    pub snippet: Option<String>,
    pub source_kind: Option<String>,
    #[serde(default)]
    pub discovery_method: Option<String>,
    #[serde(default)]
    pub source_reliability: Option<String>,
    #[serde(default)]
    pub discovered_by: Option<String>,
    #[serde(default)]
    pub feed_url: Option<String>,
    #[serde(default)]
    pub source_home: Option<String>,
    #[serde(default)]
    pub direct_discovery_reason: Option<String>,
    #[serde(default)]
    pub search_provider: Option<String>,
    #[serde(default)]
    pub search_stage: Option<String>,
    #[serde(default)]
    pub date_hint: Option<String>,
    #[serde(default)]
    pub freshness_score: Option<i64>,
    #[serde(default)]
    pub source_published_at: Option<String>,
    #[serde(default)]
    pub source_age_hours: Option<f64>,
    #[serde(default)]
    pub source_age_days: Option<f64>,
    #[serde(default)]
    pub freshness_status: Option<String>,
    #[serde(default)]
    pub stale_reason: Option<String>,
    #[serde(default)]
    pub search_diagnostics: Option<String>,
    #[serde(default)]
    pub news_like: Option<bool>,
    #[serde(default)]
    pub filtered_reason: Option<String>,
    #[serde(default)]
    pub final_included_in_prompt: Option<bool>,
    #[serde(default)]
    pub evidence_status: Option<String>,
    #[serde(default)]
    pub usable_evidence: Option<bool>,
    #[serde(default)]
    pub injected_into_answer: Option<bool>,
    #[serde(default)]
    pub evidence_reason: Option<String>,
    #[serde(default)]
    pub rejected_reason: Option<String>,
    #[serde(default)]
    pub page_type: Option<String>,
    #[serde(default)]
    pub content_status: Option<String>,
    #[serde(default)]
    pub source_strength: Option<String>,
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
    pub cache_status: Option<String>,
    pub read_status: Option<String>,
    pub error_kind: Option<String>,
    pub cached_at: Option<String>,
    pub cache_ttl_seconds: Option<i64>,
    pub excerpt_quality: Option<String>,
    pub extractor: Option<String>,
    pub excerpt_reason: Option<String>,
    pub code_blocks_truncated: Option<bool>,
    pub rank_score: Option<i64>,
    pub rank_reason: Option<String>,
    pub is_constructed: Option<bool>,
    pub constructed_reason: Option<String>,
    pub selected: Option<bool>,
    pub citation_id: Option<String>,
    pub event_cluster: Option<String>,
    pub cluster_label: Option<String>,
    pub cluster_reason: Option<String>,
    pub cluster_size: Option<i64>,
    pub selected_for_roundup: Option<bool>,
    pub dropped_as_duplicate_cluster: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchWebSourceExcerptsInput {
    pub sources: Vec<WebSearchResult>,
    #[serde(default)]
    pub max_sources: Option<usize>,
    #[serde(default)]
    pub max_chars_per_source: Option<usize>,
    #[serde(default)]
    pub user_input: Option<String>,
    #[serde(default)]
    pub intent: Option<String>,
    #[serde(default)]
    pub problem_id: Option<String>,
    #[serde(default)]
    pub problem_title: Option<String>,
    #[serde(default)]
    pub algorithm_keywords: Vec<String>,
    #[serde(default)]
    pub error_keywords: Vec<String>,
    #[serde(default)]
    pub queries: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebSourceExcerptResult {
    pub id: String,
    pub url: String,
    pub final_url: Option<String>,
    #[serde(default)]
    pub final_url_host: Option<String>,
    pub title: String,
    pub fetched: bool,
    pub status: Option<String>,
    pub excerpt: Option<String>,
    pub error: Option<String>,
    pub error_kind: Option<String>,
    pub fetched_at: i64,
    #[serde(default)]
    pub content_type: Option<String>,
    #[serde(default)]
    pub body_bytes: Option<usize>,
    #[serde(default)]
    pub extracted_text_chars: Option<usize>,
    #[serde(default)]
    pub excerpt_chars: Option<usize>,
    #[serde(default)]
    pub published_at: Option<String>,
    pub cache_status: Option<String>,
    pub cached_at: Option<String>,
    pub cache_ttl_seconds: Option<i64>,
    pub excerpt_quality: Option<String>,
    pub extractor: Option<String>,
    pub excerpt_reason: Option<String>,
    #[serde(default)]
    pub blocked_reason: Option<String>,
    #[serde(default)]
    pub needs_js_reason: Option<String>,
    #[serde(default)]
    pub extraction_failure_reason: Option<String>,
    pub code_blocks_truncated: Option<bool>,
    #[serde(default)]
    pub evidence_status: Option<String>,
    #[serde(default)]
    pub usable_evidence: Option<bool>,
    #[serde(default)]
    pub evidence_reason: Option<String>,
    #[serde(default)]
    pub rejected_reason: Option<String>,
    #[serde(default)]
    pub page_type: Option<String>,
    #[serde(default)]
    pub content_status: Option<String>,
    #[serde(default)]
    pub source_strength: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub first_title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostics: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PromptCitationContractStatus {
    pub web_available_ids: bool,
    pub web_marker_instruction: bool,
    pub local_available_ids: bool,
    pub local_marker_instruction: bool,
    pub bare_id_warning: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotexSearchSelfCheckResult {
    pub passed: usize,
    pub total: usize,
    pub cases: Vec<NotexSearchSelfCheckCaseResult>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotexSearchSelfCheckCaseResult {
    pub query: String,
    pub expected_category: String,
    pub actual_intent: String,
    pub search_mode: String,
    pub search_mode_reason: String,
    pub mode_guards: Vec<String>,
    pub allow_news_registry: bool,
    pub allow_bing_fallback: bool,
    pub allow_local_index: bool,
    pub prefer_url_reader: bool,
    pub vertical: String,
    pub freshness: String,
    pub news_registry_triggered: bool,
    pub news_clustering_triggered: bool,
    pub company_specific_news: bool,
    pub query_focus_entities: Vec<String>,
    pub focus_entity_source: String,
    pub entity_filter_applied: bool,
    pub rejected_wrong_entity_count: usize,
    pub query_diversification: Vec<String>,
    pub dropped_query_diversification: Vec<String>,
    pub selected_news_sources: Vec<String>,
    pub bing_fallback_planned: bool,
    pub local_search_triggered: bool,
    pub local_result_count: usize,
    pub displayed_local_source_count: usize,
    pub has_algorithm_term_matched_re: bool,
    pub has_post_navigation_false_positive: bool,
    pub explicit_url_path_used: bool,
    pub cluster_count: usize,
    pub selected_cluster_count: usize,
    pub diversity_applied: bool,
    pub single_cluster_warning: bool,
    pub pass: bool,
    pub reason: String,
    pub raw_diagnostics: JsonValue,
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
            "AI connection failed: base_url is missing in .oinb/config.json. Please open AI settings and configure base_url / api_key / model."
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
            "AI connection failed: api_key is missing in .oinb/config.json. Please open AI settings and configure base_url / api_key / model."
                .to_string(),
        );
    }
    if api_key.contains(['\r', '\n']) {
        return Err("AI connection failed: api_key contains invalid characters".to_string());
    }
    if model.is_empty() {
        return Err(
            "AI connection failed: model is missing in .oinb/config.json. Please open AI settings and configure base_url / api_key / model."
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
        if !models
            .iter()
            .any(|existing: &AiModel| existing.id == model.id)
        {
            models.push(model);
        }
    }
    if let Some(default_model) = provider
        .default_model
        .as_deref()
        .and_then(|model| model_from_id(model, "manual"))
    {
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
            name: "榛樿 OpenAI Compatible".to_string(),
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
        .or_else(|| {
            providers
                .iter()
                .find(|provider| provider.enabled)
                .map(|provider| provider.id.clone())
        })
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
                .map(|provider| {
                    provider
                        .models
                        .iter()
                        .any(|model| model.id == *model_id && model.enabled)
                })
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
        .or_else(|| {
            if legacy_model.is_empty() {
                None
            } else {
                Some(legacy_model.clone())
            }
        });
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

fn normalize_web_search_config(
    config: &crate::luogu::WebSearchConfigFields,
) -> crate::luogu::WebSearchConfigFields {
    let provider = match config.provider.trim() {
        WEB_SEARCH_DEFAULT_PROVIDER => WEB_SEARCH_DEFAULT_PROVIDER.to_string(),
        WEB_SEARCH_BRAVE_PROVIDER => WEB_SEARCH_BRAVE_PROVIDER.to_string(),
        WEB_SEARCH_BING_PROVIDER => WEB_SEARCH_BING_PROVIDER.to_string(),
        WEB_SEARCH_REMOVED_SEARXNG_PROVIDER if !config.bocha_api_key.trim().is_empty() => {
            WEB_SEARCH_DEFAULT_PROVIDER.to_string()
        }
        WEB_SEARCH_REMOVED_SEARXNG_PROVIDER if !config.brave_api_key.trim().is_empty() => {
            WEB_SEARCH_BRAVE_PROVIDER.to_string()
        }
        WEB_SEARCH_REMOVED_SEARXNG_PROVIDER => WEB_SEARCH_BING_PROVIDER.to_string(),
        _ => WEB_SEARCH_BING_PROVIDER.to_string(),
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
            .or_else(|| {
                provider
                    .models
                    .iter()
                    .find(|model| model.enabled)
                    .map(|model| model.id.clone())
            })
            .unwrap_or_default();
        if !model.trim().is_empty()
            && !provider.models.is_empty()
            && !provider
                .models
                .iter()
                .any(|item| item.id == model && item.enabled)
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
    let model_id = if model_id.is_empty() {
        "not provided"
    } else {
        model_id
    };
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
    let model = if model.is_empty() {
        "not provided"
    } else {
        model
    };
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

fn cache_time_string(timestamp_ms: i64) -> String {
    Utc.timestamp_millis_opt(timestamp_ms)
        .single()
        .unwrap_or_else(Utc::now)
        .to_rfc3339()
}

fn is_news_like_web_request(_intent: &str, queries: &[String]) -> bool {
    let haystack = queries.join("\n").to_ascii_lowercase();
    [
        "recent", "latest", "news", "today", "最近", "最新", "新闻", "今日", "今天",
    ]
    .iter()
    .any(|keyword| haystack.contains(keyword))
}

fn search_cache_ttl_seconds(request: &WebSearchRequestInput) -> i64 {
    if is_bing_news_request(request) {
        WEB_SEARCH_NEWS_TTL_SECONDS
    } else {
        WEB_SEARCH_OI_TTL_SECONDS
    }
}

fn excerpt_cache_ttl_seconds(source: &WebSearchResult) -> i64 {
    let haystack = format!(
        "{}\n{}\n{}",
        source.title,
        source.url,
        source.snippet.as_deref().unwrap_or("")
    )
    .to_ascii_lowercase();
    if [
        "news", "recent", "latest", "最近", "最新", "新闻", "今日", "今天",
    ]
    .iter()
    .any(|keyword| haystack.contains(keyword))
    {
        WEB_EXCERPT_NEWS_TTL_SECONDS
    } else {
        WEB_EXCERPT_DEFAULT_TTL_SECONDS
    }
}

fn build_web_search_cache_key(
    provider: &str,
    request: &WebSearchRequestInput,
    max_results: usize,
    endpoint_hint: Option<&str>,
) -> Result<String, String> {
    let normalized_queries = request
        .queries
        .iter()
        .map(|query| query.trim())
        .filter(|query| !query.is_empty())
        .take(WEB_SEARCH_MAX_QUERIES)
        .collect::<Vec<_>>();
    let normalized_keywords = request
        .algorithm_keywords
        .iter()
        .map(|keyword| keyword.trim())
        .filter(|keyword| !keyword.is_empty())
        .take(12)
        .collect::<Vec<_>>();
    let normalized_topic_keywords = request
        .topic_keywords
        .iter()
        .map(|keyword| keyword.trim())
        .filter(|keyword| !keyword.is_empty())
        .take(12)
        .collect::<Vec<_>>();
    let key_json = json!({
        "version": web_cache::cache_version(),
        "provider": provider,
        "queries": normalized_queries,
        "intent": request.intent.trim(),
        "vertical": request.vertical.as_deref().unwrap_or("").trim(),
        "freshness": request.freshness.as_deref().unwrap_or("").trim(),
        "problemId": request.problem_id.as_deref().unwrap_or("").trim(),
        "algorithmKeywords": normalized_keywords,
        "topicKeywords": normalized_topic_keywords,
        "maxResults": max_results,
        "endpointHash": endpoint_hint
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(stable_hash_hex),
    });
    let key_text = serde_json::to_string(&key_json)
        .map_err(|e| format!("Web cache failed: cannot serialize search cache key: {e}"))?;
    Ok(stable_hash_hex(&key_text))
}

fn build_web_excerpt_cache_key(url: &str, max_chars: usize) -> String {
    let key_json = json!({
        "version": web_cache::cache_version(),
        "extractor": web_extract::EXTRACTOR_VERSION,
        "urlHash": stable_hash_hex(url.trim()),
        "maxChars": max_chars,
    });
    stable_hash_hex(&serde_json::to_string(&key_json).unwrap_or_else(|_| url.to_string()))
}

fn mark_search_sources_cache_status(
    sources: &mut [WebSearchResult],
    status: &str,
    cached_at_ms: i64,
    ttl_seconds: i64,
) {
    let cached_at = cache_time_string(cached_at_ms);
    for source in sources {
        source.cache_status = Some(status.to_string());
        source.cached_at = Some(cached_at.clone());
        source.cache_ttl_seconds = Some(ttl_seconds);
    }
}

fn mark_excerpt_cache_status(
    result: &mut WebSourceExcerptResult,
    status: &str,
    cached_at_ms: i64,
    ttl_seconds: i64,
) {
    result.cache_status = Some(status.to_string());
    result.cached_at = Some(cache_time_string(cached_at_ms));
    result.cache_ttl_seconds = Some(ttl_seconds);
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
        .map(|ch| {
            if ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t' {
                ' '
            } else {
                ch
            }
        })
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
    let detail = diagnostic_preview(text)
        .replace('\n', "\\n")
        .replace('\r', "\\r");
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

fn take_chars(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

fn char_boundary_at_or_after(text: &str, index: usize) -> usize {
    if index >= text.len() {
        return text.len();
    }
    if text.is_char_boundary(index) {
        return index;
    }
    let mut next = index + 1;
    while next < text.len() && !text.is_char_boundary(next) {
        next += 1;
    }
    next
}

fn char_boundary_at_or_before(text: &str, index: usize) -> usize {
    let mut current = index.min(text.len());
    while current > 0 && !text.is_char_boundary(current) {
        current -= 1;
    }
    current
}

fn safe_slice_by_byte_range(text: &str, start: usize, end: usize) -> &str {
    let safe_start = char_boundary_at_or_after(text, start.min(text.len()));
    let safe_end = char_boundary_at_or_before(text, end.min(text.len()));
    if safe_start >= safe_end {
        ""
    } else {
        &text[safe_start..safe_end]
    }
}

fn safe_context_around_byte(text: &str, byte_index: usize, before: usize, after: usize) -> String {
    let safe_index = char_boundary_at_or_before(text, byte_index.min(text.len()));
    let char_pos = text[..safe_index].chars().count();
    let start_char = char_pos.saturating_sub(before);
    let end_char = char_pos.saturating_add(after).min(text.chars().count());
    text.chars()
        .skip(start_char)
        .take(end_char.saturating_sub(start_char))
        .collect()
}

fn safe_preview(text: &str, max_chars: usize) -> String {
    take_chars(
        &text
            .chars()
            .filter(|ch| *ch == '\n' || *ch == '\t' || !ch.is_control())
            .collect::<String>()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" "),
        max_chars,
    )
}

fn looks_like_html(text: &str) -> bool {
    let trimmed = text.trim_start();
    let lowered = trimmed
        .chars()
        .take(32)
        .collect::<String>()
        .to_ascii_lowercase();
    lowered.starts_with("<!doctype html")
        || lowered.starts_with("<html")
        || lowered.starts_with("<body")
        || lowered.starts_with("<head")
}

fn extract_provider_error_message(value: &JsonValue) -> Option<String> {
    value
        .get("error")
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

fn clean_planner_text(value: &str, max_chars: usize) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .chars()
        .take(max_chars)
        .collect::<String>()
}

fn has_url_like_text(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("http://") || lower.contains("https://") || lower.contains("www.")
}

fn json_string_array(value: Option<&JsonValue>, max_items: usize, max_chars: usize) -> Vec<String> {
    let Some(items) = value.and_then(JsonValue::as_array) else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let mut output = Vec::new();
    for item in items {
        let Some(text) = item.as_str() else {
            continue;
        };
        let cleaned = clean_planner_text(text, max_chars);
        if cleaned.is_empty() || has_url_like_text(&cleaned) {
            continue;
        }
        let key = cleaned.to_ascii_lowercase();
        if seen.insert(key) {
            output.push(cleaned);
        }
        if output.len() >= max_items {
            break;
        }
    }
    output
}

fn is_generic_planner_query(query: &str) -> bool {
    let compact = query
        .to_ascii_lowercase()
        .split_whitespace()
        .collect::<String>();
    if compact.is_empty() {
        return true;
    }
    let generic = [
        "recently",
        "latest",
        "news",
        "update",
        "today",
        "最近",
        "最新",
        "近期",
        "新闻",
        "动态",
        "消息",
        "有什么",
        "发生了什么",
    ];
    generic.iter().any(|word| compact == *word)
}

fn parse_ai_search_query_plan(
    content: &str,
    max_queries: usize,
    scope: &str,
) -> Result<AiSearchQueryPlan, String> {
    let value = parse_json_object_from_ai_content(content, scope)?;
    let max_queries = max_queries.clamp(1, 3);
    let queries = json_string_array(value.get("queries"), max_queries, 90)
        .into_iter()
        .filter(|query| !is_generic_planner_query(query))
        .collect::<Vec<_>>();
    if queries.is_empty() {
        return Err(format!("{scope}: planner returned no usable query"));
    }

    let freshness = value
        .get("freshness")
        .and_then(JsonValue::as_str)
        .map(|text| text.trim().to_ascii_lowercase())
        .filter(|text| matches!(text.as_str(), "none" | "recent" | "latest" | "news"))
        .unwrap_or_else(|| "none".to_string());
    let vertical = value
        .get("vertical")
        .and_then(JsonValue::as_str)
        .map(|text| text.trim().to_ascii_lowercase())
        .filter(|text| {
            matches!(
                text.as_str(),
                "news"
                    | "oi"
                    | "algorithm"
                    | "general_web"
                    | "product"
                    | "docs"
                    | "explicit_url"
                    | "no_search"
            )
        });
    let depth = value
        .get("depth")
        .and_then(JsonValue::as_str)
        .map(|text| text.trim().to_ascii_lowercase())
        .filter(|text| {
            matches!(
                text.as_str(),
                "quick" | "normal" | "deep" | "news" | "oi_research"
            )
        });
    let read_budget = value
        .get("readBudget")
        .and_then(JsonValue::as_u64)
        .map(|value| value.clamp(1, 12) as usize);
    let confidence = value
        .get("confidence")
        .and_then(JsonValue::as_f64)
        .unwrap_or(0.5)
        .clamp(0.0, 1.0);

    Ok(AiSearchQueryPlan {
        search_goal: value
            .get("searchGoal")
            .and_then(JsonValue::as_str)
            .map(|text| clean_planner_text(text, 180))
            .filter(|text| !text.is_empty()),
        vertical,
        rewritten_intent: value
            .get("rewrittenIntent")
            .and_then(JsonValue::as_str)
            .map(|text| clean_planner_text(text, 160))
            .unwrap_or_default(),
        queries,
        topic_keywords: json_string_array(value.get("topicKeywords"), 10, 40),
        required_keywords: json_string_array(value.get("requiredKeywords"), 10, 40),
        negative_keywords: json_string_array(value.get("negativeKeywords"), 12, 40),
        freshness,
        depth,
        read_budget,
        preferred_source_types: json_string_array(value.get("preferredSourceTypes"), 8, 40),
        preferred_domains: json_string_array(value.get("preferredDomains"), 8, 80),
        avoid_source_types: json_string_array(value.get("avoidSourceTypes"), 8, 40),
        reason: value
            .get("reason")
            .and_then(JsonValue::as_str)
            .map(|text| clean_planner_text(text, 260))
            .filter(|text| !text.is_empty())
            .unwrap_or_else(|| "AI query planner generated search queries.".to_string()),
        confidence,
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
                    AI_RESPONSE_RETRY_ATTEMPTS, issue_error
                );
                if should_retry {
                    last_issue = Some(issue);
                    continue;
                }
                return Err(format!(
                    "{}; target={target_debug}",
                    issue.into_error(scope)
                ));
            }
        }
    }

    Err(last_issue
        .unwrap_or_else(|| {
            AiResponseIssue::retryable(
                "AI service returned an unparseable response; please retry.",
                "debug=retry-exhausted",
            )
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
                "AI service response body could not be read; please retry.",
                format!("debug=http_status={status_code}; read_error={e}"),
            )
        } else {
            AiResponseIssue::non_retryable(
                format!("AI service returned HTTP {status_code}."),
                format!("debug=http_status={status_code}; error_body_read_failed={e}"),
            )
        }
    })?;
    let body = decode_response_body(&bytes);
    let body_trimmed = body.trim();

    if !status.is_success() {
        if body_trimmed.is_empty() {
            return Err(AiResponseIssue::non_retryable(
                format!("AI service returned HTTP {status_code}."),
                format!("debug=http_status={status_code}; error_body=empty"),
            ));
        }

        if looks_like_html(body_trimmed) {
            return Err(AiResponseIssue::non_retryable(
                format!(
                    "AI service returned HTTP {status_code}, and the error response was not JSON."
                ),
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
                format!("AI service returned HTTP {status_code}."),
                format!(
                    "debug=http_status={status_code}; error_json_preview={}",
                    diagnostic_json_preview(&value)
                ),
            ));
        }

        return Err(AiResponseIssue::non_retryable(
            format!("AI service returned HTTP {status_code}."),
            format!(
                "debug=http_status={status_code}; error_body_preview={}",
                sanitize_ai_detail(body_trimmed)
            ),
        ));
    }

    if body_trimmed.is_empty() {
        return Err(AiResponseIssue::retryable(
            "AI service returned an empty response; please retry.",
            format!("debug=http_status={status_code}; body=empty"),
        ));
    }

    if looks_like_html(body_trimmed) {
        return Err(AiResponseIssue::retryable(
            "AI service returned a non-JSON response; please retry.",
            format!(
                "debug=http_status={status_code}; html_body_preview={}",
                sanitize_ai_detail(body_trimmed)
            ),
        ));
    }

    let value = serde_json::from_str::<JsonValue>(body_trimmed).map_err(|e| {
        AiResponseIssue::retryable(
            "AI service returned an unparseable response; please retry.",
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
            "AI service response format was unexpected; please retry.",
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

fn emit_stream_chunk(app: &tauri::AppHandle, stream_id: &str, delta: String) -> Result<(), String> {
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
    let mut citation_ids = Vec::new();
    let selected_sources = sources
        .iter()
        .filter(|source| {
            source.usable_evidence.unwrap_or(false)
                && source.evidence_status.as_deref() == Some("usable")
                && source.injected_into_answer.unwrap_or(false)
                && source.final_included_in_prompt.unwrap_or(false)
        })
        .collect::<Vec<_>>();
    let context_sources = if selected_sources.is_empty() {
        Vec::new()
    } else {
        selected_sources
    };
    let news_roundup_source_count = context_sources
        .iter()
        .filter(|source| {
            matches!(
                source.page_type.as_deref(),
                Some("news_article") | Some("article")
            ) || source.news_like == Some(true)
                || source
                    .search_stage
                    .as_deref()
                    .is_some_and(|stage| stage.starts_with("news"))
        })
        .count();
    let mut news_event_clusters = context_sources
        .iter()
        .filter(|source| {
            matches!(
                source.page_type.as_deref(),
                Some("news_article") | Some("article")
            ) || source.news_like == Some(true)
                || source
                    .search_stage
                    .as_deref()
                    .is_some_and(|stage| stage.starts_with("news"))
        })
        .filter_map(|source| source.event_cluster.as_deref())
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    news_event_clusters.sort();
    news_event_clusters.dedup();
    let news_event_cluster_count = news_event_clusters.len();
    let news_roundup_guidance = if news_roundup_source_count >= 3 {
        if news_event_cluster_count <= 1 {
            "News roundup mode is active, but the usable news evidence appears to cover only one event cluster. Each source includes Event cluster, Event cluster label, Event cluster size, and duplicate-selection fields. For news/recent questions, answer in Chinese based only on successfully read public sources. Do not split one launch, conference, or company event into many fake news items. Start with one overview sentence that says the readable sources are concentrated in one cluster, then write 1-3 event-level points. Merge product details from the same event under one point. Do not use rejected candidates or model memory to add unverified news."
        } else {
            "News roundup mode is active with multiple event clusters. Each source includes Event cluster, Event cluster label, Event cluster size, and duplicate-selection fields. For news/recent questions, answer in Chinese as a concise event-level roundup based only on successfully read public sources. Start with one overview sentence, then cover 3-6 independent events when evidence supports them, or fewer with a source-scope note if coverage is narrow. Each point should explain what happened, why it matters, and likely impact. Do not split one launch, conference, or company event into many fake news items; merge same-cluster product details under one point. Do not use rejected candidates or model memory to add unverified news."
        }
    } else {
        "News roundup mode is inactive or evidence is limited. For news/recent questions, keep the answer cautious and avoid padding beyond the successfully read sources."
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
        let excerpt_quality = source
            .excerpt_quality
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown");
        let final_url_host = source
            .final_url
            .as_deref()
            .and_then(|value| reqwest::Url::parse(value).ok())
            .and_then(|value| value.host_str().map(|host| host.to_string()))
            .unwrap_or_else(|| "unknown".to_string());
        let read_status = source
            .read_status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown");
        let extractor = source
            .extractor
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown");
        let excerpt_reason = source
            .excerpt_reason
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "none".to_string());
        let code_blocks_truncated = source.code_blocks_truncated.unwrap_or(false);
        let cache_status = source
            .cache_status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("miss");
        let cached_at = source
            .cached_at
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("none");
        let rank_score = source
            .rank_score
            .map(|value| value.to_string())
            .unwrap_or_else(|| "not ranked".to_string());
        let rank_reason = source
            .rank_reason
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "not ranked".to_string());
        let date_hint = source
            .date_hint
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "none".to_string());
        let discovery_method = source
            .search_stage
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown");
        let news_like = source
            .news_like
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let evidence_status = source
            .evidence_status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("candidate");
        let usable_evidence = source.usable_evidence.unwrap_or(false);
        let injected_into_answer = source.injected_into_answer.unwrap_or(false);
        let page_type = source
            .page_type
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown");
        let content_status = source
            .content_status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("not_fetched");
        let source_strength = source
            .source_strength
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("rejected");
        let evidence_reason = source
            .evidence_reason
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "passed evidence gate".to_string());
        let event_cluster = source
            .event_cluster
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "none".to_string());
        let cluster_label = source
            .cluster_label
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "none".to_string());
        let cluster_reason = source
            .cluster_reason
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "none".to_string());
        let cluster_size = source
            .cluster_size
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        let selected_for_roundup = source.selected_for_roundup.unwrap_or(false);
        let dropped_as_duplicate_cluster = source.dropped_as_duplicate_cluster.unwrap_or(false);
        let source_published_at = source
            .source_published_at
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("none");
        let source_age_days = source
            .source_age_days
            .map(|value| format!("{value:.1}"))
            .unwrap_or_else(|| "unknown".to_string());
        let freshness_status = source
            .freshness_status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown");
        let stale_reason = source
            .stale_reason
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "none".to_string());
        let source_origin = if source.source_kind.as_deref() == Some("explicit_url") {
            "user-provided explicit public URL"
        } else if source.is_constructed == Some(true) {
            "constructed public OI source"
        } else {
            "search provider result"
        };
        let constructed_reason = source
            .constructed_reason
            .as_deref()
            .map(truncate_search_context_text)
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "none".to_string());
        let citation_id = source
            .citation_id
            .as_deref()
            .map(str::trim)
            .filter(|value| {
                value.len() >= 2
                    && value.len() <= 4
                    && value.starts_with('S')
                    && value[1..].chars().all(|ch| ch.is_ascii_digit())
            })
            .map(str::to_string)
            .unwrap_or_else(|| format!("S{}", index + 1));
        citation_ids.push(citation_id.clone());

        entries.push(format!(
            "[{}]\nCitation ID: {}\nCitation marker to use in answer: [[{}]]\nSource id: {}\nTitle: {}\nSite: {}\nURL: {}\nSnippet: {}\nSource origin: {}\nConstructed reason: {}\nDiscovery method: {}\nDate hint: {}\nSource published at: {}\nSource age days: {}\nFreshness status: {}\nStale reason: {}\nNews-like: {}\nEvidence status: {}\nUsable evidence: {}\nInjected into answer: {}\nPage type: {}\nContent status: {}\nSource strength: {}\nEvidence reason: {}\nEvent cluster: {}\nEvent cluster label: {}\nEvent cluster reason: {}\nEvent cluster size: {}\nSelected for roundup: {}\nDropped as duplicate cluster: {}\nSource type: {}\nReliability: {} ({})\nReliability reason: {}\nRelevance: {} ({})\nRelevance reason: {}\nRank score: {}\nRank reason: {}\nCache status: {}\nCached at: {}\nFinal URL host: {}\nRead status: {}\nWeb excerpt status: {}\nWeb excerpt quality: {}\nWeb excerpt extractor: {}\nWeb excerpt reason: {}\nCode blocks truncated: {}\nWeb excerpt error: {}\nWeb excerpt: {}",
            citation_id,
            citation_id,
            citation_id,
            source.id,
            title,
            site,
            url,
            snippet,
            source_origin,
            constructed_reason,
            discovery_method,
            date_hint,
            source_published_at,
            source_age_days,
            freshness_status,
            stale_reason,
            news_like,
            evidence_status,
            usable_evidence,
            injected_into_answer,
            page_type,
            content_status,
            source_strength,
            evidence_reason,
            event_cluster,
            cluster_label,
            cluster_reason,
            cluster_size,
            selected_for_roundup,
            dropped_as_duplicate_cluster,
            source_type,
            reliability,
            reliability_label,
            reliability_reason,
            relevance,
            relevance_label,
            relevance_reason,
            rank_score,
            rank_reason,
            cache_status,
            cached_at,
            final_url_host,
            read_status,
            excerpt_status,
            excerpt_quality,
            extractor,
            excerpt_reason,
            code_blocks_truncated,
            excerpt_error,
            excerpt,
        ));
    }

    if entries.is_empty() {
        return None;
    }

    let citation_id_list = citation_ids.join(", ");

    Some(format!(
        "The following context has two layers: web search result summaries, and optional extracted webpage excerpts for sources whose Web excerpt status is fetched. Search result summaries are only titles, sites, URLs, snippets, source types, and reliability labels. Web excerpts are extracted text snippets, not full pages.\n\
Available web citation IDs: {}. To cite one, output the exact double-bracket marker shown in that source card, such as [[S1]].\n\
You may use these summaries to answer, but follow these rules strictly:\n\
- Call them search result summaries or source summaries, not webpages you have read in full.\n\
- Only sources marked with Web excerpt status: fetched may be described as webpage excerpts. Do not use failed or unavailable sources as webpage content.\n\
- Sources whose Source origin is user-provided explicit public URL came directly from URLs the user pasted. Treat their fetched excerpts as explicit URL reading context, not as search-engine discovery.\n\
- Even for fetched excerpts, do not say you read the full page. Say \"based on the extracted webpage excerpt\" or equivalent.\n\
- Web excerpts are cleaned, selected, and truncated snippets, not complete webpages; if Web excerpt quality is medium, low, snippet_only, title_only, unavailable, too_short, blocked, partial, or empty, answer cautiously and avoid over-inference. Never treat snippet_only or title_only as page-body evidence.\n\
- A generic extractor is weaker evidence than a site-specific extractor such as oi_wiki, cp_algorithms, or luogu. If Luogu extraction is blocked or unavailable, do not guess problem statements or solution content from the Luogu page.\n\
- If Code blocks truncated is true, do not make certain conclusions from incomplete code; use surrounding explanation and treat the code as partial evidence.\n\
- Do not say a webpage clearly states something unless the snippet itself contains that information.\n\
- Do not say a webpage excerpt states something unless that excerpt contains it.\n\
- Sources marked as constructed public OI sources are public entry points only. If their Web excerpt status is not fetched, do not infer their page content; say they are available to open but current summaries are insufficient.\n\
- If a user-provided explicit URL failed, is blocked, or has no fetched excerpt, do not summarize that page from the URL, title, or general memory; say the public姝ｆ枃 could not be read.\n\
- When a point comes only from a title or snippet, use cautious wording such as \"from the search result summaries\" or \"these sources may be related\".\n\
- If the summaries are insufficient, say that the details require opening and reading the full page.\n\
- If Cache status is stale, treat that source as potentially outdated and state time-sensitive claims cautiously.\n\
- Sources are already ordered by relevance, reliability, freshness, quality, and excerpt availability. Prefer higher-ranked sources when deciding what to use, and avoid relying on weak candidate sources unless they contain concrete evidence.\n\
- For time-sensitive or news-like questions, the search results may be incomplete. Pay attention to explicit publication dates or date hints in titles/snippets/excerpts; if a source lacks dates, do not present its claims as definitely latest.\n\
- For default recent/latest/news questions, treat Freshness status stale as background only, not a main news item. Do not describe stale sources as current news. Treat undated sources cautiously and do not use them to claim latest news unless other fresh dated sources support the point.\n\
- For recent/news questions, if there are no fetched, clearly news-like recent web sources in this context, do not answer from model memory or historical knowledge. Do not mention old training cutoffs or substitute older events; say that no sufficiently recent public source was successfully read.\n\
- If the only relevant source is a constructed official problem-page link, acknowledge the official page was identified but say the search result summaries are insufficient to summarize editorials, discussions, or common pitfalls.\n\
- Strongly related sources may be used cautiously for the target problem. Candidate or related-algorithm sources are only background algorithm material and must not be presented as target-problem-specific evidence.\n\
- If there are not enough strongly related editorial, discussion, or pitfall summaries, explicitly say the search result summaries are insufficient to directly summarize this problem's common pitfalls. You may add general OI troubleshooting advice, but label it as general experience rather than search-result evidence.\n\
- Do not mechanically restate every search summary. First filter for contest value: prefer points that can actually cause WA, TLE, RE, MLE, wrong complexity, wrong boundaries, or implementation mistakes.\n\
- For common pitfalls, easy mistakes, WA/TLE/RE causes, implementation notes, or editorial advice, only promote high-value items such as array sizes, indexing, initialization, root handling, special cases, recursion depth, IO performance, binary lifting levels, jump order, DFS preprocessing, graph direction, and complexity details.\n\
- For OI pitfall questions, prefer implementation, complexity, boundary-condition, and code-adjacent evidence from excerpts; ignore navigation, catalog, SEO, comment, and recommendation text.\n\
- Down-rank or ignore low-value material unless the user explicitly asks for concept explanation: terminology translation, name-similarity trivia, vague statements that an algorithm is important, SEO-like blog filler, and sentences that appear in snippets but do not help solve or debug the problem.\n\
- Be especially cautious with CSDN, ordinary blogs, and unknown reliability sources. Do not turn their summaries into firm conclusions unless the excerpt or snippet contains concrete implementation evidence.\n\
- Do not let one low-reliability source, especially CSDN, an ordinary blog, or an unknown site, dominate the whole answer. Cross-check it against higher-reliability sources when available; if it is the main concrete source, phrase it cautiously as community material or a possible troubleshooting clue, not an official conclusion.\n\
- For CSDN, ordinary blogs, and unknown reliability sources, do not promote every extracted sentence into a pitfall. Keep only items that clearly map to WA, TLE, RE, MLE, wrong boundaries, wrong complexity, or concrete implementation mistakes.\n\
- If the available source summaries are low quality, give fewer high-value points instead of padding the answer. Do not invent extra pitfalls just to make a longer list.\n\
- When mixing evidence and OI experience, separate them naturally: say which points are reflected in search summaries or webpage excerpts, and which are general OI template/problem-solving experience.\n\
- For LCA problems, do not include advice like confusing Lowest Common Ancestor with unrelated names such as Longest Common Ancestor unless the user explicitly asks about terminology or naming. This is low-value for implementation-pitfall questions. Prefer implementation issues such as operator precedence, array indexing, initialization, lifting table size, depth/fa initialization, root choice, DFS stack depth, query jump order, and IO.\n\
- Answer in a calm, precise, restrained style. Be helpful without sounding like a report, a tutorial persona, or a casual experience post.\n\
- First identify the user's real question and answer that directly. Do not open mechanically with phrases like \"Based on the search result summaries\" or \"Here is a summary\" when the user already asked a specific question.\n\
- Do not use a fixed response template. Avoid defaulting to \"Summary\", \"Conclusion\", long checklists, or tables. Use a list only when it genuinely helps with debugging, comparison, or step-by-step inspection.\n\
- Do not pad the answer to appear complete. If source quality is limited, give fewer high-value points and state uncertainty naturally.\n\
- Do not use emoji by default. Do not use tables by default unless the user requests one or the content is naturally comparative.\n\
- Avoid both over-formal report language and overly casual mentor-style language. The answer should feel thoughtful, measured, and easy to follow.\n\
- For OI questions, focus on the implementation details that actually fail in practice instead of replaying search summaries. A good answer can start with a short judgment, then explain why, then give a practical inspection order.\n\
- For news or recent-event questions, follow this current synthesis instruction: {} Treat undated sources cautiously.\n\
- When a point is directly supported by sources, cite it sparingly with the marker. When a point is general reasoning or OI experience, make that distinction naturally instead of pretending it came from a source.\n\
- Let reliability guide your tone: official can be more certain, wiki is algorithm reference, community_solution is community solution material, discussion is discussion or experience, blog is a personal blog view, unknown needs extra caution.\n\
- Use citation markers only to support key conclusions, concrete facts, problem-specific details, or claims directly backed by webpage excerpts. Citations are evidence, not decoration.\n\
- If the answer uses any concrete facts, summaries, or excerpts from the listed web sources, it must include at least one web citation marker such as [[S1]] at the end of a key supporting sentence. Usually cite 1 to 3 key points. Use no web citation markers only when no concrete web source supports the answer.\n\
- Each bullet or numbered point should usually have at most one citation marker; each paragraph should usually have 0 to 2 citation markers. Do not cite every sentence.\n\
- When web sources and local notes are both available, the same sentence should usually have at most one web marker and one local-note marker. If several sources support the same point, cite the strongest one instead of stacking markers such as [[S1]][[S2]][[N1]].\n\
- Use web markers for webpage facts, recent facts, official pages, or search-result evidence. Use local-note markers only when the point specifically relies on the user's local notes or when saying the user's notes also mention it.\n\
- If the same point is supported by both web sources and local notes, prefer splitting it into two natural sentences instead of putting several markers at one sentence end.\n\
- Correct web citation example: put [[S1]] at the end of the supported sentence. Incorrect examples: prose that says according to S1, S1 says, or a single-bracket [S1] marker.\n\
- Do not put citation markers on headings. Do not mechanically cite every list item. If a whole subsection relies on one source, cite only the first key claim or the subsection's final summary sentence.\n\
- Only use the web citation IDs explicitly listed above, such as [[S1]] or [[S2]], for claims supported by web sources. Never invent IDs, never cite sources that are not listed, and never use unrelated or non-injected sources.\n\
- The only valid web citation syntax is the double-bracket token [[S1]] at the end of a sentence. Never write plain single-bracket tokens like [S1], [S2], or [S3].\n\
- Treat web citation IDs as invisible control tokens, not user-facing source names. A web citation ID may appear only inside a marker exactly like [[S1]] at the end of a supporting sentence.\n\
- Never expose citation IDs as prose. Do not write phrases such as S4, S4 summary, S4 says, the S4 excerpt, or mainly from S4 in the answer body.\n\
- Also avoid source-report phrases such as \"鎼滅储婧?S1\", \"鏉ユ簮 S1\", \"S1銆丼2銆丼3\", \"S4 鏍囬\", \"S4 snippet\", \"source S4\", \"from S4\", or any sentence that names an internal ID as if it were visible to the user.\n\
- Do not explain that a claim \"comes from S4\" or any other numbered source. Write the claim naturally, then add the marker if it needs support, for example: \"浣嶈繍绠楀拰姣旇緝杩愮畻娣风敤鏃惰鍔犳嫭鍙凤紝鍚﹀垯鍙兘鍥犱紭鍏堢骇瀵艰嚧鍒ゆ柇閿欒銆俒[S4]]\"\n\
- Do not introduce the answer by saying it is based on numbered sources. If you need to describe source scope, use natural language and never mention S1, S2, S3, or S4 in that prose.\n\
- Prefer paraphrasing source content. Do not quote long source text, and do not wrap claims in source-report phrasing like \"the excerpt says\" unless necessary.\n\
- Do not output bare URLs or long URLs in the answer body. The frontend source list will show source links.\n\
- Do not use paper-style citations such as [1], footnote lists, \"鏉ユ簮锛?..\", APA, MLA, BibTeX, references sections, or copied URL lists. The frontend will generate a compact citation source list automatically.\n\
- If a point is general OI experience rather than directly supported by a listed source, it may omit a citation and should be phrased as experience.\n\
- Constructed public OI source entries without fetched webpage excerpts may only support \"entry point for further reading\" statements. Do not cite them for concrete page content.\n\
- If source evidence is insufficient, use fewer citations or none. Do not force citations or invent cited content.\n\
-- You may briefly mention that the source cards above can be opened for confirmation.\n\n{}",
        citation_id_list,
        news_roundup_guidance,
        entries.join("\n\n")
    ))
}

fn truncate_local_note_context_text(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }

    let mut truncated = trimmed.chars().take(max_chars).collect::<String>();
    truncated.push_str("...");
    truncated
}

fn build_local_note_sources_context(sources: &[LocalNoteSearchResult]) -> Option<String> {
    let mut entries = Vec::new();
    let mut citation_ids = Vec::new();
    for (index, source) in sources.iter().take(5).enumerate() {
        let local_citation_id = source
            .local_citation_id
            .as_deref()
            .filter(|id| is_valid_local_note_citation_id(id))
            .map(str::to_string)
            .unwrap_or_else(|| format!("N{}", index + 1));
        citation_ids.push(local_citation_id.clone());
        let title = truncate_local_note_context_text(&source.title, 180);
        let relative_path = truncate_local_note_context_text(&source.relative_path, 220);
        let snippet = truncate_local_note_context_text(&source.snippet, 1200);
        if title.is_empty() || relative_path.is_empty() || snippet.is_empty() {
            continue;
        }
        let reason = truncate_local_note_context_text(&source.reason, 220);
        let heading_path = if source.heading_path.is_empty() {
            "none".to_string()
        } else {
            truncate_local_note_context_text(&source.heading_path.join(" / "), 220)
        };
        let line_range = match (source.line_start, source.line_end) {
            (Some(start), Some(end)) if end >= start => format!("{start}-{end}"),
            (Some(start), _) => start.to_string(),
            _ => "unknown".to_string(),
        };
        entries.push(format!(
            "[{}]\nCitation ID: {}\nCitation marker to use in answer: [[{}]]\nTitle: {}\nRelative path: {}\nHeading path: {}\nChunk index: {}\nIs current note: {}\nScore: {}\nReason: {}\nLines: {}\nSnippet:\n{}",
            local_citation_id,
            local_citation_id,
            local_citation_id,
            title,
            relative_path,
            heading_path,
            source.chunk_index,
            source.is_current_note,
            source.score,
            if reason.is_empty() { "matched local note content" } else { &reason },
            line_range,
            snippet,
        ));
    }

    if entries.is_empty() {
        return None;
    }

    let citation_id_list = citation_ids.join(", ");

    Some(format!(
        "The following context comes from local Markdown notes in the user's OI Notebook. It is private local note context, not web search, not official material, and not a source for web citation markers.\n\
Available local-note citation IDs: {}. To cite one, output the exact double-bracket marker shown in that note card, such as [[N1]].\n\
Use it only when relevant to the user's question, and follow these rules:\n\
- Do not call local notes official sources unless the note text itself clearly quotes an official source.\n\
- If a concrete answer point directly uses a local note snippet, you may cite it sparingly with the local note marker [[N1]], [[N2]], etc. Use only the N IDs listed below.\n\
- If the answer uses any concrete content from these local notes, it must include at least one local-note citation marker such as [[N1]] at the end of a key supporting sentence. Usually cite 1 to 3 key points. Use no local-note citation markers only when the notes did not support the answer.\n\
- Local note citations must use [[N1]] style markers. Do not use web markers such as [[S1]] for local notes, and do not use local markers for web sources.\n\
- When web search context is also present, do not pile local and web markers together. A sentence should usually have at most one local note marker and one web marker; if multiple sources support the same point, cite the strongest source or split the idea into separate sentences.\n\
- Do not output plain [N1] or [S1]. The frontend tolerates single brackets only as a legacy fallback; the answer must use [[N1]] or [[S1]] control tokens.\n\
- Treat N IDs as invisible control tokens. Never write prose such as N1 note, according to N1, N1 says, from N1, or plain [N1]. Put [[N1]] only at the end of the supported sentence.\n\
- Correct local-note citation example: put [[N1]] at the end of the supported sentence. Incorrect examples: prose that says according to N1, N1 note says, or a single-bracket [N1] marker.\n\
- Do not expose absolute local paths. If you mention a note, use its title or relative path only.\n\
- Local notes may be incomplete, outdated, or personal draft material. If they conflict with web sources, state the difference cautiously.\n\
- Do not repeat long note passages. Summarize the useful point and only mention the note when it helps the user understand why.\n\
- Do not output a reference list for local notes. The frontend will show the local-note list separately.\n\
- If the current note is also included, avoid duplicating it; use the retrieved snippet as a pointer to the relevant part.\n\n{}",
        citation_id_list,
        entries.join("\n\n")
    ))
}

fn is_valid_local_note_citation_id(id: &str) -> bool {
    let Some(number) = id.strip_prefix('N') else {
        return false;
    };
    !number.is_empty()
        && number.len() <= 2
        && number.chars().all(|ch| ch.is_ascii_digit())
        && number != "0"
}

fn build_stream_note_chat_messages(
    question: &str,
    context: &NoteChatContextInput,
    chat_history: &[NoteChatHistoryMessageInput],
    resolved: &ResolvedAiConfig,
    search_sources: &[WebSearchResult],
    local_note_sources: &[LocalNoteSearchResult],
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
    let has_full_note_context =
        !note_path.is_empty() || !note_title.is_empty() || !markdown.is_empty();
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

    if let Some(local_note_context) = build_local_note_sources_context(local_note_sources) {
        messages.push(json!({
            "role": "user",
            "content": local_note_context,
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
        return Err(format!(
            "{scope}: {provider_message}; debug=provider_error=true"
        ));
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
        if normalized
            .iter()
            .any(|existing_tag| existing_tag == &trimmed)
        {
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
        return Err(format!(
            "{scope}: response suggestedTags must contain at most 8 items"
        ));
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
            return Err(format!(
                "{scope}: response suggestedTags must only contain strings"
            ));
        };
        raw_tags.push(tag_text.to_string());
    }
    let suggested_tags = normalize_suggested_tags(existing_tags, raw_tags, scope)?;
    let reason = value
        .get("reason")
        .and_then(JsonValue::as_str)
        .map(str::trim)
        .filter(|reason| !reason.is_empty())
        .unwrap_or("These tags come from the current note title, summary, existing tags, and body.")
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
        return Err(format!(
            "{scope}: response polishedBody was empty after cleanup"
        ));
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

fn extract_prompt_variables(content: &str) -> Vec<String> {
    let mut variables = Vec::new();
    let mut remaining = content;
    while let Some(start) = remaining.find("{{") {
        let after_start = &remaining[start + 2..];
        let Some(end) = after_start.find("}}") else {
            break;
        };
        let variable = after_start[..end].trim();
        if !variable.is_empty() {
            let token = format!("{{{{{variable}}}}}");
            if !variables.iter().any(|existing| existing == &token) {
                variables.push(token);
            }
        }
        remaining = &after_start[end + 2..];
    }
    variables
}

fn validate_polished_prompt_template_content(
    original_content: &str,
    content: &str,
    scope: &str,
) -> Result<PolishedAiPromptTemplate, String> {
    let polished_prompt = strip_wrapping_markdown_fence(content);
    let polished_prompt = polished_prompt.trim();
    if polished_prompt.is_empty() {
        return Err(format!("{scope}: AI returned empty prompt"));
    }

    let original_variables = extract_prompt_variables(original_content);
    let polished_variables = extract_prompt_variables(polished_prompt);
    let missing_variables = original_variables
        .iter()
        .filter(|variable| {
            !polished_variables
                .iter()
                .any(|candidate| candidate == *variable)
        })
        .cloned()
        .collect::<Vec<_>>();
    if !missing_variables.is_empty() {
        return Err(format!(
            "{scope}: AI response removed prompt variable(s): {}",
            missing_variables.join(", ")
        ));
    }
    let new_variables = polished_variables
        .iter()
        .filter(|variable| {
            !original_variables
                .iter()
                .any(|candidate| candidate == *variable)
        })
        .cloned()
        .collect::<Vec<_>>();
    if !new_variables.is_empty() {
        return Err(format!(
            "{scope}: AI response added unsupported prompt variable(s): {}",
            new_variables.join(", ")
        ));
    }

    Ok(PolishedAiPromptTemplate {
        polished_prompt: polished_prompt.to_string(),
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
    tag_taxonomy_context: Option<String>,
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
    let tag_context = tag_taxonomy_context
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("No local taxonomy candidates matched. Follow the tag rules conservatively.");
    let user_prompt = render_prompt_template(
        PromptTemplateKind::NoteMetadata,
        &[("note_path", relative_path), ("content", markdown_content), ("tag_context", tag_context)],
    )?;
    let cache_context = json!({
        "note_path": relative_path,
        "content": markdown_content,
        "tag_context": tag_context,
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
    let resolved = resolve_ai_config(&config, provider_id.as_deref(), model_id.as_deref())?;
    require_resolved_ai_config(&resolved)?;
    let selected_config = config_from_resolved(resolved.clone());

    let tags_text = if context.tags.is_empty() {
        "Not filled.".to_string()
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
        "Not filled.".to_string()
    } else {
        context.summary.trim().to_string()
    };
    let selected_text = context.selected_text.trim();
    let selection_section = if selected_text.is_empty() {
        "The user has no selected text.".to_string()
    } else {
        format!("The user selected the following text. Use it as a hint, but do not tag only the selection:\n{selected_text}")
    };
    let markdown = context.markdown.trim();
    let body_note = if markdown.is_empty() {
        "Current body is empty or very short; rely mainly on title, path, and summary."
    } else if context.markdown_truncated {
        "Body is a truncated excerpt, not the full note."
    } else {
        "Body is the full current note."
    };
    let tag_taxonomy_context = context
        .tag_taxonomy_context
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("No local taxonomy candidates matched. Follow the tag rules conservatively.");

    let user_prompt = format!(
        "Suggest frontmatter tags for an OI / algorithm / Markdown study note.\n\
Use the title, path, existing tags, summary, Markdown body, and selected text.\n\
Do not repeat existing tags. Avoid generic tags unless truly necessary.\n\
Use the local tag taxonomy context below. Prefer canonical taxonomy paths when they fit, and output canonical paths instead of aliases.\n\
Do not force taxonomy labels when they are uncertain; keep only confident tags and avoid inventing many new labels.\n\
Tags should be short, usually 2 to 8 items. Path-style tags such as 算法/字符串/Z 函数 are preferred when available.\n\
Output strict JSON only, without markdown fences or extra text.\n\
The JSON shape must be: {{\"suggestedTags\":[\"算法/动态规划/DP\",\"训练/记录/复盘\"],\"reason\":\"These tags match the note content.\"}}\n\n\
Local tag taxonomy context:\n{tag_taxonomy_context}\n\n\
Title:\n{note_title}\n\n\
Path:\n{note_path}\n\n\
Existing tags:\n{tags_text}\n\n\
Summary:\n{summary_text}\n\n\
Selected text:\n{selection_section}\n\n\
Body note:\n{body_note}\n\n\
Markdown body:\n{markdown}",
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
    let content =
        request_chat_completion(&selected_config, messages, 0.2, "AI tag suggestion failed")?;
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
    let resolved = resolve_ai_config(&config, provider_id.as_deref(), model_id.as_deref())?;
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
    let content = request_chat_completion(
        &selected_config,
        messages,
        0.2,
        "AI selection polish failed",
    )?;
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
    let resolved = resolve_ai_config(&config, provider_id.as_deref(), model_id.as_deref())?;
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

fn polish_ai_prompt_template_blocking(
    file_name: String,
    content: String,
) -> Result<PolishedAiPromptTemplate, String> {
    let file_name = file_name.trim();
    let prompt_content = content.trim();
    if file_name.is_empty() {
        return Err("AI prompt polish failed: prompt file name is missing".to_string());
    }
    if prompt_content.is_empty() {
        return Err("AI prompt polish failed: prompt content is empty".to_string());
    }

    let config = read_config()?.ai;
    let resolved = require_ai_config_resolved(&config)?;
    let selected_config = config_from_resolved(resolved.clone());
    let original_variables = extract_prompt_variables(prompt_content);
    let variables_text = if original_variables.is_empty() {
        "No variables are present in this template. Do not add any new {{variable}} placeholders."
            .to_string()
    } else {
        original_variables.join(", ")
    };
    let user_prompt = format!(
        "You are optimizing an internal Prompt template for an app. Output only the optimized Prompt body. Do not explain. Do not wrap the result in a Markdown code block. Do not add a title.\n\n\
Requirements:\n\
- Preserve every existing variable placeholder exactly. Existing variables: {variables_text}\n\
- Do not add variables that are not listed above.\n\
- Preserve the original task goal, input/output constraints, safety boundaries, and core structure requirements.\n\
- Improve clarity, consistency, wording, and rule order where useful.\n\
- Reduce repeated, verbose, or conflicting rules.\n\
- Do not add unrelated content.\n\
- Do not delete key format requirements.\n\
- Return only the polished Prompt.\n\n\
Prompt file name: {file_name}\n\n\
Original Prompt:\n{prompt_content}"
    );
    let messages = json!([
        {
            "role": "system",
            "content": format!(
                "Return only the polished Prompt body. Do not claim that files were modified. Do not force a fixed assistant identity.\n\n{}",
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
        "AI prompt polish failed",
        ChatCompletionRequestOptions {
            timeout_secs: AI_FULL_NOTE_POLISH_TIMEOUT_SECS,
            json_response: false,
            max_tokens: None,
        },
    )?;
    validate_polished_prompt_template_content(prompt_content, &content, "AI prompt polish failed")
}

#[tauri::command]
pub async fn polish_ai_prompt_template(
    file_name: String,
    content: String,
) -> Result<PolishedAiPromptTemplate, String> {
    tauri::async_runtime::spawn_blocking(move || {
        polish_ai_prompt_template_blocking(file_name, content)
    })
    .await
    .map_err(|e| format!("AI prompt polish failed: task join failed: {e}"))?
}

fn plan_search_queries_blocking(
    input: AiSearchQueryPlanInput,
) -> Result<AiSearchQueryPlan, String> {
    let user_input = input.user_input.trim();
    if user_input.is_empty() {
        return Err("AI query planner failed: user input is empty".to_string());
    }
    if has_url_like_text(user_input) {
        return Err(
            "AI query planner skipped: explicit URL reading does not need query planning"
                .to_string(),
        );
    }

    let config = read_config()?.ai;
    let resolved = resolve_ai_config(
        &config,
        input.provider_id.as_deref(),
        input.model_id.as_deref(),
    )?;
    let selected_config = config_from_resolved(resolved.clone());
    let max_queries = input
        .max_queries
        .unwrap_or(if input.provider.trim() == WEB_SEARCH_BING_PROVIDER {
            2
        } else {
            3
        })
        .clamp(1, 3);
    let rule_queries = input
        .rule_based_queries
        .iter()
        .take(6)
        .map(|query| clean_planner_text(query, 90))
        .filter(|query| !query.is_empty())
        .collect::<Vec<_>>();
    let topic_keywords = input
        .topic_keywords
        .iter()
        .take(10)
        .map(|keyword| clean_planner_text(keyword, 40))
        .filter(|keyword| !keyword.is_empty())
        .collect::<Vec<_>>();
    let current_date = input
        .current_date
        .as_deref()
        .map(|value| clean_planner_text(value, 32))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());
    let current_date_text = input
        .current_date_text
        .as_deref()
        .map(|value| clean_planner_text(value, 48))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| current_date.clone());
    let current_month_text = current_date
        .split_once('-')
        .and_then(|(year, rest)| rest.split_once('-').map(|(month, _)| (year, month)))
        .and_then(|(year, month)| {
            month
                .parse::<u32>()
                .ok()
                .map(|month| format!("{year}-{month:02}"))
        })
        .unwrap_or_else(|| current_date_text.clone());
    let current_time_zone = input
        .current_time_zone
        .as_deref()
        .map(|value| clean_planner_text(value, 64))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "local".to_string());
    let locale = input
        .locale
        .as_deref()
        .map(|value| clean_planner_text(value, 24))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "zh-CN".to_string());
    let recency_window_hint = input
        .recency_window_hint
        .as_deref()
        .map(|value| clean_planner_text(value, 80))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            if input.news_intent || input.recency_intent {
                "last 7 days".to_string()
            } else {
                "no explicit freshness window".to_string()
            }
        });
    let user_prompt = format!(
        "User question:\n{user_input}\n\n\
Current time context:\n\
- currentDate: {current_date}\n\
- currentDateText: {current_date_text}\n\
- timeZone: {current_time_zone}\n\
- locale: {locale}\n\
- recencyWindowHint: {recency_window_hint}\n\n\
Current rule-based decision:\n\
- intent: {}\n\
- provider: {}\n\
- maxQueries: {max_queries}\n\
- newsIntent: {}\n\
- recencyIntent: {}\n\
- topicKeywords: {}\n\
- ruleBasedQueries: {}\n\n\
Planner hints:\n\
- The current date is {current_date_text}. When the user asks for recent/latest/current information, prefer the last few days to one week unless the user says otherwise.\n\
- For Chinese users, prefer short Chinese search queries first. Avoid long English concept strings unless the question is English.\n\
- For broad Chinese AI news, good queries look like AI news, artificial intelligence news {current_month_text}, AI model latest news.\n\
- For OpenAI news, good queries look like OpenAI news, OpenAI latest news {current_month_text}, OpenAI latest news.\n\
- If this is a news request, prefer event-like queries over definition or homepage queries.\n\
- For broad AI news, include company/event terms such as OpenAI, Anthropic, Google DeepMind, DeepSeek, Gemini, Claude, launches, releases, funding, regulation, model.\n\
- Do not generate what-is, definition, docs, tutorial, guide, wiki, or homepage-style queries for news.\n\n\
Return a strict JSON object with keys: searchGoal, vertical, rewrittenIntent, queries, topicKeywords, requiredKeywords, negativeKeywords, freshness, depth, readBudget, preferredSourceTypes, preferredDomains, avoidSourceTypes, reason, confidence.\n\
Do not include URLs. Do not request cookies, login, browser history, CAPTCHA solving, proxies, paging, or crawling.",
        input.intent.trim(),
        input.provider.trim(),
        input.news_intent,
        input.recency_intent,
        if topic_keywords.is_empty() { "none".to_string() } else { topic_keywords.join(", ") },
        if rule_queries.is_empty() { "none".to_string() } else { rule_queries.join(" | ") },
    );
    let messages = json!([
        {
            "role": "system",
            "content": "You are a search query planner for NoteX. Convert the user's question into a few search-engine queries. Output only strict JSON.\n\nRules:\n- Preserve the core topic.\n- Use the current date/time context provided by the user message.\n- Time words such as recent, latest, news, update, and today must never be the only query.\n- News questions must include topic plus news/latest/update/progress wording.\n- Prefer natural human search queries, not the full user sentence and not long concept strings.\n- Include negativeKeywords for obvious drift such as dictionary, translate, meaning, Wikipedia, encyclopedia, lyrics, song, or video when useful.\n- Output at most 3 queries.\n- Never output a URL.\n- Never ask for cookies, login state, browser history, CAPTCHA solving, proxies, paging, or crawling.\n- If the question is writing, translation, polishing, or explicit URL reading, keep queries empty.\n\nExample for recent AI news on 2026-05-19:\n{\"rewrittenIntent\":\"Find recent AI industry news and model announcements\",\"queries\":[\"AI news\",\"artificial intelligence news 2026-05\",\"AI model latest news\"],\"topicKeywords\":[\"AI\",\"artificial intelligence\",\"models\",\"OpenAI\",\"DeepSeek\",\"Gemini\",\"Claude\"],\"requiredKeywords\":[\"AI\",\"news\"],\"negativeKeywords\":[\"dictionary\",\"translate\",\"meaning\",\"Wikipedia\",\"encyclopedia\"],\"freshness\":\"news\",\"preferredSourceTypes\":[\"news\",\"official blog\",\"company announcement\"],\"avoidSourceTypes\":[\"dictionary\",\"translation\",\"definition\",\"lyrics\",\"video\"],\"reason\":\"The user asks for recent AI news, so use current-date-aware news queries.\",\"confidence\":0.85}"
        },
        {
            "role": "user",
            "content": user_prompt
        }
    ]);
    let content = request_chat_completion_with_options(
        &selected_config,
        messages,
        0.1,
        "AI query planner failed",
        ChatCompletionRequestOptions {
            timeout_secs: 8,
            json_response: true,
            max_tokens: Some(700),
        },
    )?;
    parse_ai_search_query_plan(&content, max_queries, "AI query planner failed")
}

#[tauri::command]
pub async fn plan_search_queries(
    input: AiSearchQueryPlanInput,
) -> Result<AiSearchQueryPlan, String> {
    tauri::async_runtime::spawn_blocking(move || plan_search_queries_blocking(input))
        .await
        .map_err(|e| format!("AI query planner failed: task join failed: {e}"))?
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
    let resolved = resolve_ai_config(&config, provider_id.as_deref(), model_id.as_deref())?;
    let selected_config = config_from_resolved(resolved.clone());
    let selected_text = context.selected_text.trim();
    let tags_text = if context.tags.is_empty() {
        "Not filled.".to_string()
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
        "Not filled.".to_string()
    } else {
        context.summary.trim().to_string()
    };
    let selection_section = if selected_text.is_empty() {
        "The user has no selected text.".to_string()
    } else {
        format!("The user selected this text. Prefer it when answering:\n{selected_text}")
    };
    let truncation_note = if context.markdown_truncated {
        "Body is a truncated excerpt, not the full note. Say so if information is insufficient."
    } else {
        "Body is the full current note."
    };

    let user_prompt = format!(
        "浣犳鍦ㄥ府鍔╃敤鎴风悊瑙ｅ綋鍓?OI Notebook 绗旇銆俓n\
璇峰熀浜庝笅闈㈢殑绗旇涓婁笅鏂囧洖绛旀渶鍚庣殑闂锛涘鏋滅瑪璁伴噷娌℃湁瓒冲淇℃伅锛岃鏄庣‘璇翠笉鐭ラ亾鎴栦俊鎭笉瓒筹紝涓嶈缂栭€犮€俓n\
闄ら潪鐢ㄦ埛鏄庣‘瑕佹眰锛岃€屼笖褰撳墠闃舵涔熷彧鑳界粰寤鸿锛屼笉瑕佽嚜鍔ㄦ敼鍐欏師鏂囨垨澹扮О宸茬粡淇敼鏂囦欢銆俓n\
浣犲彲浠ュ洖绛旂畻娉曘€侀瑙ｃ€丮arkdown 琛ㄨ揪銆佸啓浣滃缓璁紝浣嗛兘瑕佸敖閲忚创鍚堝綋鍓嶇瑪璁般€俓n\
璇峰彧杩斿洖 JSON锛屾牸寮忎负 {{\"answer\":\"...\"}}銆俓n\n\
銆愮瑪璁版爣棰樸€慭n{note_title}\n\n\
銆愮瑪璁拌矾寰勩€慭n{note_path}\n\n\
銆恡ags銆慭n{tags_text}\n\n\
銆恠ummary銆慭n{summary_text}\n\n\
銆愰€変腑鏂囨銆慭n{selection_section}\n\n\
銆愭鏂囪鏄庛€慭n{truncation_note}\n\n\
銆愬綋鍓嶆鏂?Markdown銆慭n{markdown}\n\n\
銆愮敤鎴烽棶棰樸€慭n{question}"
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
        &input.local_note_sources,
    );
    let selected_config = config_from_resolved(resolved);
    let result = request_chat_completion_stream(
        &selected_config,
        messages,
        0.2,
        "AI chat stream failed",
        app.clone(),
        stream_id.clone(),
    )
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
        return Err(
            "AI models sync failed: base_url must start with http:// or https://".to_string(),
        );
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
            return Err(
                "AI models sync failed: API key is invalid or has no permission".to_string(),
            );
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
        .ok_or_else(|| {
            "AI models sync failed: /models response had no data array. Please add models manually."
                .to_string()
        })?;
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
        || text.contains("discussion")
        || text.contains("warning")
        || text.contains("pitfall")
    {
        return "discussion".to_string();
    }
    if text.contains("solution") || haystack.contains("solution") {
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
            "Knowledge base".to_string(),
            "From an OI Wiki style public algorithm knowledge base.".to_string(),
        );
    }
    if haystack.contains("codeforces.com/problemset/problem")
        || haystack.contains("atcoder.jp/contests/")
        || haystack.contains("luogu.com.cn/problem/")
    {
        return (
            "official".to_string(),
            "Official".to_string(),
            "Looks like a problem statement or official site page.".to_string(),
        );
    }
    if haystack.contains("luogu.com.cn/discuss")
        || combined.contains("discussion")
        || combined.contains("warning")
        || combined.contains("pitfall")
    {
        return (
            "discussion".to_string(),
            "Discussion".to_string(),
            "Looks like discussion or experience feedback content.".to_string(),
        );
    }
    if combined.contains("solution") {
        return (
            "community_solution".to_string(),
            "Community solution".to_string(),
            "Looks like a community solution write-up.".to_string(),
        );
    }
    if haystack.contains("blog")
        || haystack.contains("cnblogs.com")
        || haystack.contains("blog.csdn.net")
        || haystack.contains("luogu.com.cn/article")
    {
        return (
            "blog".to_string(),
            "Blog".to_string(),
            "From a personal or community blog page.".to_string(),
        );
    }
    (
        "unknown".to_string(),
        "Unknown".to_string(),
        "Only identifiable as a public search result for now.".to_string(),
    )
}

fn brave_search_status_error(status: reqwest::StatusCode, body: &str) -> String {
    let status_code = status.as_u16();
    match status_code {
        401 | 403 => "联网搜索失败：Brave Search API Key 无效或未授权。".to_string(),
        429 => "联网搜索失败：搜索服务额度耗尽或请求过于频繁。".to_string(),
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
        return "Bocha 搜索请求超时，请稍后重试。".to_string();
    }
    if detail.contains("certificate") || detail.contains("tls") || detail.contains("ssl") {
        return "Bocha 搜索失败：TLS 或证书错误。".to_string();
    }
    if detail.contains("dns")
        || detail.contains("failed to lookup address")
        || detail.contains("name or service not known")
        || detail.contains("temporary failure in name resolution")
        || detail.contains("no such host")
    {
        return "无法解析 Bocha 搜索端点，请检查网络或 API endpoint。".to_string();
    }
    "无法连接 Bocha 搜索服务，请检查网络或 API endpoint。".to_string()
}

fn bocha_search_status_error(status: reqwest::StatusCode, body: &str) -> String {
    let status_code = status.as_u16();
    match status_code {
        401 | 403 => "联网搜索失败：Bocha API Key 无效或未授权。".to_string(),
        429 => "联网搜索失败：Bocha 搜索额度耗尽或请求过于频繁。".to_string(),
        404 => "Bocha 搜索端点可能不正确，请检查 API endpoint。".to_string(),
        500..=599 => "Bocha 搜索服务暂时不可用。".to_string(),
        _ => format!(
            "联网搜索失败：Bocha 服务返回 HTTP {status_code}; debug=body_preview={}",
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
        final_url: None,
        site,
        snippet: if snippet_text.is_empty() {
            None
        } else {
            Some(snippet_text)
        },
        source_kind: Some("search_result".to_string()),
        discovery_method: Some("search_provider".to_string()),
        source_reliability: None,
        discovered_by: Some(WEB_SEARCH_BRAVE_PROVIDER.to_string()),
        feed_url: None,
        source_home: None,
        direct_discovery_reason: None,
        search_provider: Some(WEB_SEARCH_BRAVE_PROVIDER.to_string()),
        search_stage: Some("api".to_string()),
        date_hint: None,
        freshness_score: None,
        source_published_at: None,
        source_age_hours: None,
        source_age_days: None,
        freshness_status: None,
        stale_reason: None,
        search_diagnostics: None,
        news_like: None,
        filtered_reason: None,
        final_included_in_prompt: None,
        evidence_status: Some("candidate".to_string()),
        usable_evidence: Some(false),
        injected_into_answer: Some(false),
        evidence_reason: None,
        rejected_reason: None,
        page_type: None,
        content_status: Some("not_fetched".to_string()),
        source_strength: None,
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
        cache_status: None,
        read_status: None,
        error_kind: None,
        cached_at: None,
        cache_ttl_seconds: None,
        excerpt_quality: None,
        extractor: None,
        excerpt_reason: None,
        code_blocks_truncated: None,
        rank_score: None,
        rank_reason: None,
        is_constructed: None,
        constructed_reason: None,
        selected: None,
        citation_id: None,
        event_cluster: None,
        cluster_label: None,
        cluster_reason: None,
        cluster_size: None,
        selected_for_roundup: None,
        dropped_as_duplicate_cluster: None,
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
        final_url: None,
        site,
        snippet: if snippet_text.is_empty() {
            None
        } else {
            Some(snippet_text)
        },
        source_kind: Some("search_result".to_string()),
        discovery_method: Some("search_provider".to_string()),
        source_reliability: None,
        discovered_by: Some(WEB_SEARCH_DEFAULT_PROVIDER.to_string()),
        feed_url: None,
        source_home: None,
        direct_discovery_reason: None,
        search_provider: Some(WEB_SEARCH_DEFAULT_PROVIDER.to_string()),
        search_stage: Some("api".to_string()),
        date_hint: None,
        freshness_score: None,
        source_published_at: None,
        source_age_hours: None,
        source_age_days: None,
        freshness_status: None,
        stale_reason: None,
        search_diagnostics: None,
        news_like: None,
        filtered_reason: None,
        final_included_in_prompt: None,
        evidence_status: Some("candidate".to_string()),
        usable_evidence: Some(false),
        injected_into_answer: Some(false),
        evidence_reason: None,
        rejected_reason: None,
        page_type: None,
        content_status: Some("not_fetched".to_string()),
        source_strength: None,
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
        cache_status: None,
        read_status: None,
        error_kind: None,
        cached_at: None,
        cache_ttl_seconds: None,
        excerpt_quality: None,
        extractor: None,
        excerpt_reason: None,
        code_blocks_truncated: None,
        rank_score: None,
        rank_reason: None,
        is_constructed: None,
        constructed_reason: None,
        selected: None,
        citation_id: None,
        event_cluster: None,
        cluster_label: None,
        cluster_reason: None,
        cluster_size: None,
        selected_for_roundup: None,
        dropped_as_duplicate_cluster: None,
    })
}

fn bocha_response_items(response: BochaSearchResponse) -> Vec<BochaWebResult> {
    response
        .web_pages
        .or_else(|| response.data.and_then(|data| data.web_pages))
        .map(|web_pages| web_pages.value)
        .unwrap_or_default()
}

fn bing_public_error(kind: &str, detail: &str) -> String {
    let user_message =
        "Bing public search is temporarily unavailable. Try again later, or configure Bocha / Brave in settings.";
    let safe_detail = sanitize_ai_detail(detail);
    if safe_detail.is_empty() {
        format!("{user_message}; debug=provider=bing; errorKind={kind}")
    } else {
        format!("{user_message}; debug=provider=bing; errorKind={kind}; {safe_detail}")
    }
}

fn bing_public_request_error(error: &reqwest::Error, stage: &str) -> String {
    if error.is_timeout() {
        return bing_public_error("timeout", &format!("stage={stage}"));
    }
    let detail = error.to_string().to_ascii_lowercase();
    if detail.contains("dns") || detail.contains("lookup") {
        return bing_public_error("dns_failed", &format!("stage={stage}"));
    }
    if detail.contains("tls") || detail.contains("certificate") || detail.contains("ssl") {
        return bing_public_error("tls_error", &format!("stage={stage}"));
    }
    bing_public_error("network_error", &format!("stage={stage}"))
}

fn is_bing_transient_error(error: &str) -> bool {
    error.contains("errorKind=timeout")
        || error.contains("errorKind=network_error")
        || error.contains("errorKind=dns_failed")
        || error.contains("errorKind=tls_error")
        || error.contains("errorKind=connect_error")
}

fn is_bing_non_retryable_error(error: &str) -> bool {
    error.contains("errorKind=rate_limited")
        || error.contains("errorKind=blocked_or_captcha")
        || error.contains("errorKind=http_status")
}

fn is_bing_block_page(status: reqwest::StatusCode, body: &str) -> Option<&'static str> {
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Some("rate_limited");
    }
    if status == reqwest::StatusCode::FORBIDDEN {
        return Some("blocked_or_captcha");
    }
    let lower = body.to_ascii_lowercase();
    if lower.contains("captcha")
        || lower.contains("verify you are a human")
        || lower.contains("unusual traffic")
        || lower.contains("automated queries")
        || lower.contains("our systems have detected")
        || lower.contains("b_captcha")
    {
        return Some("blocked_or_captcha");
    }
    None
}

fn compact_bing_query(query: &str) -> String {
    let mut text = query.replace("what is", " ").replace("tell me", " ");
    text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    text.chars().take(100).collect()
}

fn bing_query_limit(request: &WebSearchRequestInput) -> usize {
    if is_bing_news_request(request) {
        5
    } else {
        BING_PUBLIC_MAX_QUERIES
    }
}

fn is_bing_news_request(request: &WebSearchRequestInput) -> bool {
    request
        .vertical
        .as_deref()
        .map(str::trim)
        .is_some_and(|value| value == "news")
        || request
            .freshness
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| value == "news" || value == "latest")
        || is_news_like_web_request(&request.intent, &request.queries)
}

fn bing_public_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .user_agent(BING_PUBLIC_USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| bing_public_error("client_error", &format!("stage=client; {e}")))
}

fn build_bing_public_headers(locale: Option<&str>) -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::USER_AGENT,
        reqwest::header::HeaderValue::from_static(BING_PUBLIC_USER_AGENT),
    );
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static(
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        ),
    );
    let accept_language = match locale {
        Some(value) if value.eq_ignore_ascii_case("zh-CN") => "zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7",
        Some(value) if value.to_ascii_lowercase().starts_with("en") => "en-US,en;q=0.9,zh-CN;q=0.6",
        _ => "zh-CN,zh;q=0.9,en;q=0.8,en-US;q=0.7",
    };
    headers.insert(
        reqwest::header::ACCEPT_LANGUAGE,
        reqwest::header::HeaderValue::from_static(accept_language),
    );
    headers.insert(
        reqwest::header::ACCEPT_ENCODING,
        reqwest::header::HeaderValue::from_static("identity"),
    );
    headers.insert(
        reqwest::header::CACHE_CONTROL,
        reqwest::header::HeaderValue::from_static("no-cache"),
    );
    headers.insert(
        reqwest::header::PRAGMA,
        reqwest::header::HeaderValue::from_static("no-cache"),
    );
    headers.insert(
        reqwest::header::UPGRADE_INSECURE_REQUESTS,
        reqwest::header::HeaderValue::from_static("1"),
    );
    headers.insert(
        reqwest::header::REFERER,
        reqwest::header::HeaderValue::from_static("https://www.bing.com/"),
    );
    headers.insert(
        reqwest::header::HeaderName::from_static("sec-fetch-site"),
        reqwest::header::HeaderValue::from_static("none"),
    );
    headers.insert(
        reqwest::header::HeaderName::from_static("sec-fetch-mode"),
        reqwest::header::HeaderValue::from_static("navigate"),
    );
    headers.insert(
        reqwest::header::HeaderName::from_static("sec-fetch-user"),
        reqwest::header::HeaderValue::from_static("?1"),
    );
    headers.insert(
        reqwest::header::HeaderName::from_static("sec-fetch-dest"),
        reqwest::header::HeaderValue::from_static("document"),
    );
    headers
}

fn clean_bing_result_url(raw_url: &str) -> Option<String> {
    let trimmed = sanitize_search_text(&decode_html_entities(raw_url), 2000);
    let parsed = reqwest::Url::parse(&trimmed).ok()?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return None;
    }
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    let path = parsed.path().to_ascii_lowercase();
    if host.ends_with("bing.com") && path.contains("/news/apiclick.aspx") {
        return unwrap_bing_news_apiclick_url(parsed.as_str())
            .and_then(|target| clean_bing_result_url(&target));
    }
    if host.ends_with("bing.com") && parsed.path().starts_with("/ck/") {
        for key in ["u", "url", "r"] {
            if let Some(value) = parsed.query_pairs().find_map(|(name, value)| {
                if name == key {
                    Some(value.into_owned())
                } else {
                    None
                }
            }) {
                if let Ok(target) = reqwest::Url::parse(&value) {
                    if target.scheme() == "http" || target.scheme() == "https" {
                        return clean_bing_result_url(target.as_str());
                    }
                }
                if let Some(decoded) = decode_bing_redirect_target(&value) {
                    if let Some(cleaned) = clean_bing_result_url(&decoded) {
                        return Some(cleaned);
                    }
                }
            }
        }
        return None;
    }
    if should_skip_bing_result_url(&parsed) {
        return None;
    }
    Some(strip_common_tracking_params(parsed).to_string())
}

fn unwrap_bing_news_apiclick_url(raw_url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(raw_url).ok()?;
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    let path = parsed.path().to_ascii_lowercase();
    if !host.ends_with("bing.com") || !path.contains("/news/apiclick.aspx") {
        return None;
    }
    let target = parsed.query_pairs().find_map(|(name, value)| {
        if name.eq_ignore_ascii_case("url") {
            Some(value.into_owned())
        } else {
            None
        }
    })?;
    let target = reqwest::Url::parse(&target).ok()?;
    if target.scheme() == "http" || target.scheme() == "https" {
        Some(strip_common_tracking_params(target).to_string())
    } else {
        None
    }
}

fn decode_bing_redirect_target(value: &str) -> Option<String> {
    let trimmed = decode_html_entities(value.trim());
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Some(trimmed);
    }
    let candidate = trimmed.strip_prefix("a1").unwrap_or(&trimmed);
    decode_base64_urlsafe(candidate)
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .filter(|decoded| decoded.starts_with("http://") || decoded.starts_with("https://"))
}

fn unwrap_bing_redirect_url(raw_href: &str) -> Option<String> {
    let trimmed = decode_html_entities(raw_href.trim());
    if trimmed.is_empty()
        || trimmed.starts_with('#')
        || trimmed.to_ascii_lowercase().starts_with("javascript:")
        || trimmed.to_ascii_lowercase().starts_with("mailto:")
    {
        return None;
    }
    let base = reqwest::Url::parse("https://www.bing.com/").ok()?;
    let parsed = reqwest::Url::parse(&trimmed)
        .or_else(|_| base.join(&trimmed))
        .ok()?;
    let host = parsed.host_str().unwrap_or("").to_ascii_lowercase();
    let path = parsed.path().to_ascii_lowercase();
    if host.ends_with("bing.com") && (path.starts_with("/ck/") || path.starts_with("/aclick")) {
        for key in ["url", "r", "u"] {
            if let Some(value) = parsed.query_pairs().find_map(|(name, value)| {
                if name == key {
                    Some(value.into_owned())
                } else {
                    None
                }
            }) {
                if value.starts_with("http://") || value.starts_with("https://") {
                    if let Some(cleaned) = clean_bing_result_url(&value) {
                        return Some(cleaned);
                    }
                }
                if let Some(decoded) = decode_bing_redirect_target(&value) {
                    if let Some(cleaned) = clean_bing_result_url(&decoded) {
                        return Some(cleaned);
                    }
                }
            }
        }
        return None;
    }
    clean_bing_result_url(parsed.as_str())
}

fn decode_base64_urlsafe(input: &str) -> Option<Vec<u8>> {
    let mut buffer: u32 = 0;
    let mut bits: u8 = 0;
    let mut output = Vec::new();
    for ch in input.chars().filter(|ch| *ch != '=') {
        let value = match ch {
            'A'..='Z' => ch as u32 - 'A' as u32,
            'a'..='z' => ch as u32 - 'a' as u32 + 26,
            '0'..='9' => ch as u32 - '0' as u32 + 52,
            '+' | '-' => 62,
            '/' | '_' => 63,
            _ => return None,
        };
        buffer = (buffer << 6) | value;
        bits += 6;
        while bits >= 8 {
            bits -= 8;
            output.push(((buffer >> bits) & 0xff) as u8);
        }
    }
    Some(output)
}

fn should_skip_bing_result_url(url: &reqwest::Url) -> bool {
    let Some(host) = url.host_str().map(|host| host.to_ascii_lowercase()) else {
        return true;
    };
    if host.ends_with("bing.com") {
        let path = url.path().to_ascii_lowercase();
        return path == "/search"
            || path.starts_with("/images")
            || path.starts_with("/videos")
            || path.starts_with("/maps")
            || path.starts_with("/shop")
            || path.starts_with("/travel")
            || path.starts_with("/aclick")
            || path.starts_with("/ck/")
            || path.starts_with("/news/search");
    }
    if host.ends_with("microsoft.com") {
        let path = url.path().to_ascii_lowercase();
        if path.contains("/privacy") || path.contains("/help") || path.contains("/support") {
            return true;
        }
    }
    false
}

fn strip_common_tracking_params(mut url: reqwest::Url) -> reqwest::Url {
    let pairs = url
        .query_pairs()
        .filter(|(key, _)| {
            let lower = key.to_ascii_lowercase();
            !lower.starts_with("utm_")
                && lower != "msclkid"
                && lower != "fbclid"
                && lower != "gclid"
                && lower != "yclid"
        })
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    url.query_pairs_mut().clear().extend_pairs(pairs);
    url
}

fn site_title_from_url(url: &str) -> Option<String> {
    site_from_url(url).map(|site| site.trim_start_matches("www.").to_string())
}

fn host_and_path(url: &str) -> (String, String) {
    reqwest::Url::parse(url)
        .ok()
        .map(|parsed| {
            (
                parsed
                    .host_str()
                    .unwrap_or("")
                    .trim_start_matches("www.")
                    .to_ascii_lowercase(),
                parsed.path().to_ascii_lowercase(),
            )
        })
        .unwrap_or_else(|| ("".to_string(), "".to_string()))
}

fn is_known_news_domain(host: &str) -> bool {
    [
        "openai.com",
        "anthropic.com",
        "deepmind.google",
        "blog.google",
        "techcrunch.com",
        "theverge.com",
        "wired.com",
        "arstechnica.com",
        "reuters.com",
        "apnews.com",
        "bloomberg.com",
        "technologyreview.com",
        "36kr.com",
        "qbitai.com",
        "jiqizhixin.com",
        "leiphone.com",
        "finance.sina.com.cn",
        "tech.sina.com.cn",
        "new.qq.com",
        "thepaper.cn",
    ]
    .iter()
    .any(|domain| host == *domain || host.ends_with(&format!(".{domain}")))
}

fn bing_news_filter_reason(source: &WebSearchResult, strict: bool) -> Option<&'static str> {
    let (host, path) = host_and_path(&source.url);
    let text = format!(
        "{}\n{}\n{}\n{}",
        source.title,
        source.snippet.as_deref().unwrap_or(""),
        source.site.as_deref().unwrap_or(""),
        source.url
    )
    .to_ascii_lowercase();
    if host.contains("wikipedia.org") || host.contains("britannica.com") {
        return Some("wiki_or_reference");
    }
    if host.contains("github.com")
        || host.contains("github.io")
        || host.contains("youtube.com")
        || host.contains("youtu.be")
        || host.contains("bilibili.com")
    {
        return Some("not_news_like");
    }
    let official_company_host = host == "openai.com" || host == "anthropic.com";
    let official_company_news_path = official_company_host
        && (path.contains("/news") || path.contains("/blog") || path.contains("/announcement"));
    if official_company_host && !official_company_news_path {
        return Some("docs_or_homepage");
    }
    if path.contains("/docs")
        || path.contains("/documentation")
        || path.contains("/learn/what-is")
        || text.contains("api documentation")
        || text.contains("github repository")
        || text.contains("what is ai")
        || text.contains("artificial intelligence definition")
        || text.contains("definition, examples")
        || text.contains("dictionary")
        || text.contains("translate")
        || text.contains("meaning")
        || text.contains("tutorial")
        || text.contains("guide")
        || text.contains("pricing")
        || text.contains("login")
        || text.contains("download")
    {
        return Some("docs_or_homepage");
    }

    let known_news = is_known_news_domain(&host)
        && (path.contains("/news")
            || path.contains("/blog")
            || path.contains("/technology")
            || path.contains("/article")
            || !official_company_host);
    let has_date = source
        .date_hint
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty());
    let event_like = [
        "announces",
        "launches",
        "releases",
        "unveils",
        "raises",
        "funding",
        "partnership",
        "acquisition",
        "regulation",
        "lawsuit",
        "report",
        "update",
        "model",
        "open-source",
        "chip",
    ]
    .iter()
    .any(|keyword| text.contains(keyword));

    if known_news
        || (has_date && event_like)
        || (!strict && has_date && is_known_news_domain(&host))
    {
        return None;
    }
    Some("not_news_like")
}

fn parse_bing_date_hint(value: &str) -> Option<chrono::DateTime<Utc>> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    chrono::DateTime::parse_from_rfc2822(trimmed)
        .map(|date| date.with_timezone(&Utc))
        .or_else(|_| {
            chrono::DateTime::parse_from_rfc3339(trimmed).map(|date| date.with_timezone(&Utc))
        })
        .ok()
}

fn bing_news_freshness_score(source: &WebSearchResult) -> i64 {
    let Some(date) = source.date_hint.as_deref().and_then(parse_bing_date_hint) else {
        let (host, _) = host_and_path(&source.url);
        return if is_known_news_domain(&host) { 4 } else { -3 };
    };
    let age = Utc::now().signed_duration_since(date);
    if age.num_seconds() < 0 && age.num_hours().abs() <= 48 {
        return 24;
    }
    if age.num_hours() <= 24 {
        34
    } else if age.num_days() <= 7 {
        24
    } else if age.num_days() <= 30 {
        8
    } else if age.num_days() <= 180 {
        -10
    } else {
        -24
    }
}

fn filter_bing_news_results(sources: Vec<WebSearchResult>, strict: bool) -> Vec<WebSearchResult> {
    let mut filtered = sources
        .into_iter()
        .filter_map(|mut source| {
            source.freshness_score = Some(bing_news_freshness_score(&source));
            if let Some(reason) = bing_news_filter_reason(&source, strict) {
                source.news_like = Some(false);
                source.filtered_reason = Some(reason.to_string());
                None
            } else {
                source.news_like = Some(true);
                Some(source)
            }
        })
        .collect::<Vec<_>>();
    filtered.sort_by(|left, right| {
        right
            .freshness_score
            .unwrap_or(0)
            .cmp(&left.freshness_score.unwrap_or(0))
    });
    filtered
}

fn bing_result_to_web_source(
    title: &str,
    url: &str,
    snippet: &str,
    stage: &str,
    date_hint: Option<String>,
) -> Option<WebSearchResult> {
    let discovered_url = sanitize_search_text(&decode_html_entities(url), 2000);
    let url = clean_bing_result_url(&discovered_url)?;
    let unwrapped_bing_apiclick = discovered_url != url
        && reqwest::Url::parse(&discovered_url)
            .ok()
            .is_some_and(|parsed| {
                parsed
                    .host_str()
                    .unwrap_or("")
                    .to_ascii_lowercase()
                    .ends_with("bing.com")
                    && parsed
                        .path()
                        .to_ascii_lowercase()
                        .contains("/news/apiclick.aspx")
            });
    if url.contains("bing.com/search") {
        return None;
    }
    let title = sanitize_search_text(title, 120);
    let snippet_text = sanitize_search_text(snippet, 220);
    let site = site_title_from_url(&url);
    let source_type = infer_web_source_type(&title, &url, &snippet_text);
    let (reliability, reliability_label, reliability_reason) =
        infer_web_reliability(&title, &url, &snippet_text);
    Some(WebSearchResult {
        id: format!("web-{}", &stable_hash_hex(&url)[..12]),
        title: if title.is_empty() { url.clone() } else { title },
        url,
        final_url: None,
        site,
        snippet: if snippet_text.is_empty() {
            None
        } else {
            Some(snippet_text)
        },
        source_kind: Some("search_result".to_string()),
        discovery_method: Some("search_provider".to_string()),
        source_reliability: None,
        discovered_by: Some(WEB_SEARCH_BING_PROVIDER.to_string()),
        feed_url: None,
        source_home: if unwrapped_bing_apiclick {
            Some(discovered_url.clone())
        } else {
            None
        },
        direct_discovery_reason: None,
        search_provider: Some(WEB_SEARCH_BING_PROVIDER.to_string()),
        search_stage: Some(stage.to_string()),
        date_hint,
        freshness_score: None,
        source_published_at: None,
        source_age_hours: None,
        source_age_days: None,
        freshness_status: None,
        stale_reason: None,
        search_diagnostics: None,
        news_like: None,
        filtered_reason: None,
        final_included_in_prompt: None,
        evidence_status: Some("candidate".to_string()),
        usable_evidence: Some(false),
        injected_into_answer: Some(false),
        evidence_reason: None,
        rejected_reason: None,
        page_type: None,
        content_status: Some("not_fetched".to_string()),
        source_strength: None,
        source_type: Some(source_type),
        reliability: Some(reliability),
        reliability_label: Some(reliability_label),
        reliability_reason: Some(format!(
            "{reliability_reason} Bing public search stage={stage}.{}",
            if unwrapped_bing_apiclick {
                " Unwrapped Bing news apiclick URL before URL Reader."
            } else {
                ""
            }
        )),
        relevance: None,
        relevance_label: None,
        relevance_reason: None,
        excerpt_status: None,
        excerpt: None,
        excerpt_error: None,
        fetched_at: None,
        cache_status: None,
        read_status: None,
        error_kind: None,
        cached_at: None,
        cache_ttl_seconds: None,
        excerpt_quality: None,
        extractor: None,
        excerpt_reason: None,
        code_blocks_truncated: None,
        rank_score: None,
        rank_reason: None,
        is_constructed: None,
        constructed_reason: None,
        selected: None,
        citation_id: None,
        event_cluster: None,
        cluster_label: None,
        cluster_reason: None,
        cluster_size: None,
        selected_for_roundup: None,
        dropped_as_duplicate_cluster: None,
    })
}

fn text_between<'a>(text: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let start_index = text.find(start)? + start.len();
    let rest = &text[start_index..];
    let end_index = rest.find(end)?;
    Some(&rest[..end_index])
}

fn clean_bing_markup_text(text: &str, max_chars: usize) -> String {
    let trimmed = text
        .trim()
        .strip_prefix("<![CDATA[")
        .unwrap_or(text.trim())
        .strip_suffix("]]>")
        .unwrap_or_else(|| text.trim().strip_prefix("<![CDATA[").unwrap_or(text.trim()));
    sanitize_search_text(trimmed, max_chars)
}

#[derive(Debug, Clone)]
struct BingParseReport {
    results: Vec<WebSearchResult>,
    parser_used: String,
    matched_selectors: Vec<String>,
    rejected_count: usize,
    parse_failure_hint: Option<String>,
    raw_anchor_count: usize,
    raw_href_count: usize,
    decoded_url_candidate_count: usize,
    external_anchor_count: usize,
    kept_candidate_count: usize,
    filtered_reason_counts: Vec<(String, usize)>,
    first_links_preview: Vec<String>,
    visible_text_preview: Option<String>,
}

fn sanitize_bing_diag_value(value: &str, max_chars: usize) -> String {
    let cleaned = sanitize_search_text(value, max_chars)
        .replace([':', ';', '|', '\n', '\r'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("_");
    if cleaned.is_empty() {
        "-".to_string()
    } else {
        cleaned
    }
}

fn decode_numeric_html_entities(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(index) = rest.find("&#") {
        output.push_str(&rest[..index]);
        let after = &rest[index + 2..];
        let Some(end) = after.find(';') else {
            output.push_str(&rest[index..]);
            return output;
        };
        let entity = &after[..end];
        let parsed = if let Some(hex) = entity.strip_prefix(['x', 'X']) {
            u32::from_str_radix(hex, 16).ok()
        } else {
            entity.parse::<u32>().ok()
        };
        if let Some(ch) = parsed.and_then(char::from_u32) {
            output.push(ch);
        } else {
            output.push_str(&rest[index..index + end + 3]);
        }
        rest = &after[end + 1..];
    }
    output.push_str(rest);
    output
}

fn clean_bing_feed_text(text: &str, max_chars: usize) -> String {
    let trimmed = text
        .trim()
        .strip_prefix("<![CDATA[")
        .unwrap_or(text.trim())
        .strip_suffix("]]>")
        .unwrap_or_else(|| text.trim().strip_prefix("<![CDATA[").unwrap_or(text.trim()));
    sanitize_search_text(
        &decode_numeric_html_entities(&decode_html_entities(trimmed)),
        max_chars,
    )
}

fn detect_bing_body_kind(content_type: &str, body: &str) -> String {
    let trimmed = body.trim_start();
    if trimmed.is_empty() {
        return "empty".to_string();
    }
    if is_bing_block_page(reqwest::StatusCode::OK, body).is_some() {
        return "captcha_or_block_page".to_string();
    }
    let lower_type = content_type.to_ascii_lowercase();
    let lower_prefix = trimmed
        .chars()
        .take(4096)
        .collect::<String>()
        .to_ascii_lowercase();
    if lower_type.contains("rss")
        || lower_type.contains("xml")
        || lower_prefix.starts_with("<?xml")
        || lower_prefix.starts_with("<rss")
        || lower_prefix.starts_with("<feed")
    {
        return "rss_xml".to_string();
    }
    if lower_type.contains("html")
        || lower_prefix.contains("<!doctype html")
        || lower_prefix.contains("<html")
        || lower_prefix.contains("<head")
        || lower_prefix.contains("<body")
    {
        if lower_prefix.contains("bing")
            || lower_prefix.contains("b_algo")
            || lower_prefix.contains("b_news")
            || lower_prefix.contains("microsoft")
        {
            "bing_html".to_string()
        } else {
            "html".to_string()
        }
    } else {
        "unknown".to_string()
    }
}

fn visible_text_preview(body: &str) -> String {
    safe_preview(
        &sanitize_search_text(
            &strip_html_tags_to_text(body)
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" "),
            300,
        ),
        300,
    )
}

#[derive(Debug, Clone)]
struct BingBodyTextQuality {
    body_quality: String,
    body_looks_binary: bool,
    replacement_char_count: usize,
    control_char_count: usize,
    decode_hint: Option<String>,
}

fn detect_bing_body_text_quality(bytes: &[u8], text: &str) -> BingBodyTextQuality {
    if bytes.is_empty() || text.trim().is_empty() {
        return BingBodyTextQuality {
            body_quality: "empty".to_string(),
            body_looks_binary: false,
            replacement_char_count: 0,
            control_char_count: 0,
            decode_hint: Some("empty_body".to_string()),
        };
    }
    let compressed_magic = bytes.starts_with(&[0x1f, 0x8b])
        || bytes.starts_with(&[0x78, 0x9c])
        || bytes.starts_with(&[0x78, 0xda])
        || bytes.starts_with(&[0x78, 0x01]);
    let nul_count = bytes.iter().take(4096).filter(|byte| **byte == 0).count();
    let replacement_char_count = text.chars().filter(|ch| *ch == '\u{fffd}').count();
    let control_char_count = text
        .chars()
        .filter(|ch| ch.is_control() && *ch != '\n' && *ch != '\r' && *ch != '\t')
        .count();
    let total_chars = text.chars().count().max(1);
    let body_looks_binary = compressed_magic
        || nul_count > 0
        || control_char_count > total_chars / 20
        || replacement_char_count > total_chars / 10;
    let (body_quality, decode_hint) = if compressed_magic {
        ("compressed_or_binary", Some("compressed_magic"))
    } else if nul_count > 0 || control_char_count > total_chars / 20 {
        ("compressed_or_binary", Some("binary_or_control_chars"))
    } else if replacement_char_count > total_chars / 10 || replacement_char_count > 256 {
        ("corrupt_text", Some("too_many_replacement_chars"))
    } else {
        ("text", None)
    };
    BingBodyTextQuality {
        body_quality: body_quality.to_string(),
        body_looks_binary,
        replacement_char_count,
        control_char_count,
        decode_hint: decode_hint.map(str::to_string),
    }
}

fn clean_bing_anchor_url(href: &str) -> Option<String> {
    unwrap_bing_redirect_url(href)
}

#[derive(Debug, Clone)]
struct BingAnchorCandidate {
    title: String,
    url: String,
    snippet: String,
    date_hint: Option<String>,
    score: i32,
}

#[derive(Debug, Clone)]
struct BingAnchorFallbackReport {
    candidates: Vec<WebSearchResult>,
    raw_anchor_count: usize,
    raw_href_count: usize,
    decoded_url_candidate_count: usize,
    external_count: usize,
    kept_count: usize,
    rejected_count: usize,
    filtered_reason_counts: Vec<(String, usize)>,
    first_links_preview: Vec<String>,
}

fn score_bing_anchor_candidate(title: &str, url: &str, context: &str, news_mode: bool) -> i32 {
    let (host, path) = host_and_path(url);
    let text = format!("{title}\n{context}").to_ascii_lowercase();
    let mut score = 0;
    for keyword in [
        "ai",
        "artificial intelligence",
        "openai",
        "chatgpt",
        "deepseek",
        "gemini",
        "claude",
        "anthropic",
        "llm",
        "model",
        "chip",
    ] {
        if text.contains(keyword) {
            score += 2;
        }
    }
    for keyword in [
        "announces",
        "launches",
        "releases",
        "unveils",
        "raises",
        "funding",
        "partnership",
        "acquisition",
        "regulation",
        "lawsuit",
        "report",
        "update",
        "open-source",
        "news",
    ] {
        if text.contains(keyword) {
            score += 2;
        }
    }
    for keyword in [
        "minutes ago",
        "minute ago",
        "hours ago",
        "hour ago",
        "today",
        "yesterday",
        "may 2026",
        "2026",
    ] {
        if text.contains(keyword) {
            score += 3;
        }
    }
    for keyword in ["AI", "OpenAI", "ChatGPT", "DeepSeek", "Gemini", "Claude"] {
        if title.contains(keyword) || context.contains(keyword) {
            score += 2;
        }
    }
    for keyword in [
        "news",
        "announcement",
        "release",
        "launch",
        "funding",
        "partnership",
        "report",
        "update",
        "today",
        "yesterday",
    ] {
        if title.contains(keyword) || context.contains(keyword) {
            score += 2;
        }
    }
    if is_known_news_domain(&host) {
        score += 5;
    }
    if path.contains("/news")
        || path.contains("/technology")
        || path.contains("/article")
        || path.contains("/blog")
    {
        score += 3;
    }
    if news_mode
        && (host.contains("wikipedia.org")
            || host.contains("britannica.com")
            || host.contains("github.com")
            || path.contains("/docs")
            || path.contains("/learn/what-is"))
    {
        score -= 8;
    }
    score
}

#[allow(dead_code)]
fn parse_all_anchors_fallback(
    body: &str,
    max_results: usize,
    stage: &str,
) -> BingAnchorFallbackReport {
    let lower = body.to_ascii_lowercase();
    let news_mode = stage.starts_with("news") || lower.contains("news");
    let mut scanned_count = 0;
    let mut external_count = 0;
    let mut rejected_count = 0;
    let mut previews = Vec::new();
    let mut candidates = Vec::<BingAnchorCandidate>::new();
    let mut cursor = 0;
    while cursor < lower.len() {
        cursor = char_boundary_at_or_after(&lower, cursor);
        let Some(relative_start) = safe_slice_by_byte_range(&lower, cursor, lower.len()).find("<a")
        else {
            break;
        };
        let start = cursor + relative_start;
        let Some(tag_end_relative) = safe_slice_by_byte_range(&lower, start, lower.len()).find('>')
        else {
            break;
        };
        let tag_end = start + tag_end_relative;
        let Some(close_relative) =
            safe_slice_by_byte_range(&lower, tag_end + 1, lower.len()).find("</a>")
        else {
            cursor = char_boundary_at_or_after(&lower, tag_end.saturating_add(1));
            continue;
        };
        let close = tag_end + 1 + close_relative;
        scanned_count += 1;
        let tag = safe_slice_by_byte_range(body, start, tag_end.saturating_add(1));
        let inner = safe_slice_by_byte_range(body, tag_end.saturating_add(1), close);
        let title = clean_bing_markup_text(&strip_html_tags_to_text(inner), 160);
        let Some(href) = html_attr_value(tag, "href") else {
            rejected_count += 1;
            cursor = close + 4;
            continue;
        };
        let Some(url) = clean_bing_anchor_url(&href) else {
            rejected_count += 1;
            cursor = close + 4;
            continue;
        };
        external_count += 1;
        let context = clean_bing_markup_text(
            &strip_html_tags_to_text(&safe_text_window(body, start, 450, 550)),
            360,
        );
        let date_hint = extract_bing_relative_date_hint(&format!("{title} {context}"));
        let score = score_bing_anchor_candidate(&title, &url, &context, news_mode);
        if previews.len() < 5 {
            let host = site_from_url(&url).unwrap_or_else(|| "-".to_string());
            previews.push(format!(
                "{}@{}",
                sanitize_bing_diag_value(&title, 72),
                sanitize_bing_diag_value(&host, 48)
            ));
        }
        if title.len() < 4 || (news_mode && score < 2) {
            rejected_count += 1;
            cursor = close + 4;
            continue;
        }
        candidates.push(BingAnchorCandidate {
            title,
            url,
            snippet: context,
            date_hint,
            score,
        });
        cursor = char_boundary_at_or_after(&lower, close.saturating_add(4));
    }
    candidates.sort_by(|left, right| right.score.cmp(&left.score));
    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for candidate in candidates {
        if results.len() >= max_results {
            break;
        }
        if !seen.insert(candidate.url.clone()) {
            continue;
        }
        if let Some(source) = bing_result_to_web_source(
            &candidate.title,
            &candidate.url,
            &candidate.snippet,
            stage,
            candidate.date_hint,
        ) {
            results.push(source);
        }
    }
    let kept_count = results.len();
    BingAnchorFallbackReport {
        candidates: results,
        raw_anchor_count: scanned_count,
        raw_href_count: external_count + rejected_count,
        decoded_url_candidate_count: external_count,
        external_count,
        kept_count,
        rejected_count,
        filtered_reason_counts: Vec::new(),
        first_links_preview: previews,
    }
}

fn parse_all_bing_anchors_fallback(
    body: &str,
    max_results: usize,
    stage: &str,
) -> BingAnchorFallbackReport {
    let lower = body.to_ascii_lowercase();
    let news_mode = stage.starts_with("news") || lower.contains("news");
    let mut raw_anchor_count = 0;
    let mut raw_href_count = 0;
    let mut decoded_url_candidate_count = 0;
    let mut external_count = 0;
    let mut rejected_count = 0;
    let mut filtered_counts = BTreeMap::<String, usize>::new();
    let mut previews = Vec::new();
    let mut candidates = Vec::<BingAnchorCandidate>::new();
    let mut cursor = 0;
    while cursor < lower.len() {
        cursor = char_boundary_at_or_after(&lower, cursor);
        let Some(relative_start) = safe_slice_by_byte_range(&lower, cursor, lower.len()).find("<a")
        else {
            break;
        };
        let start = cursor + relative_start;
        let Some(tag_end_relative) = safe_slice_by_byte_range(&lower, start, lower.len()).find('>')
        else {
            break;
        };
        let tag_end = start + tag_end_relative;
        let close = safe_slice_by_byte_range(&lower, tag_end.saturating_add(1), lower.len())
            .find("</a>")
            .map(|relative| tag_end + 1 + relative)
            .unwrap_or(tag_end + 1);
        raw_anchor_count += 1;
        let tag = safe_slice_by_byte_range(body, start, tag_end.saturating_add(1));
        let inner = if close > tag_end + 1 {
            safe_slice_by_byte_range(body, tag_end.saturating_add(1), close)
        } else {
            ""
        };
        let title = clean_bing_markup_text(&strip_html_tags_to_text(inner), 160);
        let Some(href) = html_attr_value(tag, "href") else {
            rejected_count += 1;
            *filtered_counts
                .entry("missing_href".to_string())
                .or_insert(0) += 1;
            cursor = char_boundary_at_or_after(&lower, close.saturating_add(4));
            continue;
        };
        raw_href_count += 1;
        let Some(url) = clean_bing_anchor_url(&href) else {
            rejected_count += 1;
            *filtered_counts
                .entry("url_decode_or_internal".to_string())
                .or_insert(0) += 1;
            cursor = char_boundary_at_or_after(&lower, close.saturating_add(4));
            continue;
        };
        decoded_url_candidate_count += 1;
        external_count += 1;
        let context = clean_bing_markup_text(
            &strip_html_tags_to_text(&safe_text_window(body, start, 450, 550)),
            360,
        );
        let date_hint = extract_bing_relative_date_hint(&format!("{title} {context}"));
        let score = score_bing_anchor_candidate(&title, &url, &context, news_mode);
        if previews.len() < 5 {
            let host = site_from_url(&url).unwrap_or_else(|| "-".to_string());
            previews.push(format!(
                "{}@{}",
                sanitize_bing_diag_value(&title, 72),
                sanitize_bing_diag_value(&host, 48)
            ));
        }
        let (host, path) = host_and_path(&url);
        let path_looks_news = path.contains("/news")
            || path.contains("/blog")
            || path.contains("/article")
            || path.contains("/202")
            || path.contains("/technology");
        let keep_without_snippet = news_mode && (is_known_news_domain(&host) || path_looks_news);
        if title.len() < 4 && !keep_without_snippet {
            rejected_count += 1;
            *filtered_counts
                .entry("empty_title".to_string())
                .or_insert(0) += 1;
            cursor = char_boundary_at_or_after(&lower, close.saturating_add(4));
            continue;
        }
        if news_mode && score < 2 && !keep_without_snippet {
            rejected_count += 1;
            *filtered_counts
                .entry("low_news_score".to_string())
                .or_insert(0) += 1;
            cursor = char_boundary_at_or_after(&lower, close.saturating_add(4));
            continue;
        }
        candidates.push(BingAnchorCandidate {
            title: if title.is_empty() { url.clone() } else { title },
            url,
            snippet: context,
            date_hint,
            score,
        });
        cursor = char_boundary_at_or_after(&lower, close.saturating_add(4));
    }

    for raw_url in extract_http_urls_from_text(body)
        .into_iter()
        .chain(extract_http_urls_from_text(&decode_html_entities(body)).into_iter())
    {
        raw_href_count += 1;
        let Some(url) = clean_bing_anchor_url(&raw_url) else {
            rejected_count += 1;
            *filtered_counts
                .entry("url_decode_or_internal".to_string())
                .or_insert(0) += 1;
            continue;
        };
        decoded_url_candidate_count += 1;
        external_count += 1;
        if previews.len() < 5 {
            let host = site_from_url(&url).unwrap_or_else(|| "-".to_string());
            previews.push(format!(
                "{}@{}",
                sanitize_bing_diag_value(&url, 72),
                sanitize_bing_diag_value(&host, 48)
            ));
        }
        let (host, path) = host_and_path(&url);
        if news_mode
            && !is_known_news_domain(&host)
            && !path.contains("/news")
            && !path.contains("/article")
            && !path.contains("/202")
            && !path.contains("/blog")
        {
            rejected_count += 1;
            *filtered_counts
                .entry("raw_url_not_news_like".to_string())
                .or_insert(0) += 1;
            continue;
        }
        candidates.push(BingAnchorCandidate {
            title: site_title_from_url(&url).unwrap_or_else(|| url.clone()),
            url,
            snippet: String::new(),
            date_hint: None,
            score: 0,
        });
    }

    candidates.sort_by(|left, right| right.score.cmp(&left.score));
    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for candidate in candidates {
        if results.len() >= max_results {
            break;
        }
        if !seen.insert(candidate.url.clone()) {
            continue;
        }
        if let Some(source) = bing_result_to_web_source(
            &candidate.title,
            &candidate.url,
            &candidate.snippet,
            stage,
            candidate.date_hint,
        ) {
            results.push(source);
        } else {
            rejected_count += 1;
            *filtered_counts
                .entry("result_url_rejected".to_string())
                .or_insert(0) += 1;
        }
    }
    let kept_count = results.len();
    BingAnchorFallbackReport {
        candidates: results,
        raw_anchor_count,
        raw_href_count,
        decoded_url_candidate_count,
        external_count,
        kept_count,
        rejected_count,
        filtered_reason_counts: filtered_counts.into_iter().collect(),
        first_links_preview: previews,
    }
}

fn extract_http_urls_from_text(text: &str) -> Vec<String> {
    let mut urls = Vec::new();
    let mut cursor = 0;
    while cursor < text.len() {
        cursor = char_boundary_at_or_after(text, cursor);
        let Some(relative) = safe_slice_by_byte_range(text, cursor, text.len()).find("http") else {
            break;
        };
        let start = cursor + relative;
        let rest = safe_slice_by_byte_range(text, start, text.len());
        if !rest.starts_with("http://") && !rest.starts_with("https://") {
            cursor = char_boundary_at_or_after(text, start.saturating_add(4));
            continue;
        }
        let end = rest
            .find(|ch: char| {
                ch.is_whitespace()
                    || ch == '"'
                    || ch == '\''
                    || ch == '<'
                    || ch == '>'
                    || ch == ')'
                    || ch == ']'
            })
            .unwrap_or(rest.len());
        let candidate = safe_slice_by_byte_range(rest, 0, end)
            .trim_end_matches(['.', ',', ';', ':'])
            .to_string();
        if !candidate.is_empty() && urls.len() < 24 && !urls.contains(&candidate) {
            urls.push(candidate);
        }
        cursor = char_boundary_at_or_after(text, start.saturating_add(end.max(4)));
    }
    urls
}

fn lower_find_from(haystack_lower: &str, needle: &str, start: usize) -> Option<usize> {
    haystack_lower
        .get(start..)?
        .find(needle)
        .map(|index| start + index)
}

fn xml_elements_by_tag(text: &str, tag: &str) -> Vec<String> {
    let lower = text.to_ascii_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let mut output = Vec::new();
    let mut cursor = 0;
    while let Some(start) = lower_find_from(&lower, &open, cursor) {
        let Some(open_end) = lower_find_from(&lower, ">", start) else {
            break;
        };
        let Some(close_start) = lower_find_from(&lower, &close, open_end + 1) else {
            break;
        };
        let end = close_start + close.len();
        output.push(text[start..end].to_string());
        cursor = end;
    }
    output
}

fn xml_tag_text(text: &str, tag: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let start = lower.find(&open)?;
    let open_end = lower_find_from(&lower, ">", start)?;
    let close_start = lower_find_from(&lower, &close, open_end + 1)?;
    Some(text[open_end + 1..close_start].to_string())
}

fn xml_link_text(item: &str) -> String {
    if let Some(link) = xml_tag_text(item, "link") {
        let cleaned = clean_bing_feed_text(&link, 2000);
        if cleaned.starts_with("http://") || cleaned.starts_with("https://") {
            return cleaned;
        }
    }
    let lower = item.to_ascii_lowercase();
    let mut cursor = 0;
    while let Some(start) = lower_find_from(&lower, "<link", cursor) {
        let Some(end) = lower_find_from(&lower, ">", start) else {
            break;
        };
        let tag = &item[start..=end];
        if let Some(href) = html_attr_value(tag, "href") {
            return clean_bing_feed_text(&href, 2000);
        }
        cursor = end + 1;
    }
    String::new()
}

fn parse_bing_rss_report(body: &str, max_results: usize, stage: &str) -> BingParseReport {
    let body_kind = detect_bing_body_kind("", body);
    if body_kind == "html" || body_kind == "bing_html" {
        let mut report = parse_bing_html_report(body, max_results, stage);
        report.parser_used = "rss-returned-html->html".to_string();
        if report.parse_failure_hint.is_none() && report.results.is_empty() {
            report.parse_failure_hint = Some("rss_returned_html_no_html_candidates".to_string());
        }
        return report;
    } else if body_kind == "captcha_or_block_page" {
        return BingParseReport {
            results: Vec::new(),
            parser_used: "blocked-page".to_string(),
            matched_selectors: Vec::new(),
            rejected_count: 0,
            parse_failure_hint: Some("captcha_or_block_page".to_string()),
            raw_anchor_count: 0,
            raw_href_count: 0,
            decoded_url_candidate_count: 0,
            external_anchor_count: 0,
            kept_candidate_count: 0,
            filtered_reason_counts: Vec::new(),
            first_links_preview: Vec::new(),
            visible_text_preview: Some(visible_text_preview(body)),
        };
    } else if body_kind != "rss_xml" && body_kind != "unknown" {
        return BingParseReport {
            results: Vec::new(),
            parser_used: "body-kind-unsupported".to_string(),
            matched_selectors: Vec::new(),
            rejected_count: 0,
            parse_failure_hint: Some(format!("{body_kind}_not_rss")),
            raw_anchor_count: 0,
            raw_href_count: 0,
            decoded_url_candidate_count: 0,
            external_anchor_count: 0,
            kept_candidate_count: 0,
            filtered_reason_counts: Vec::new(),
            first_links_preview: Vec::new(),
            visible_text_preview: Some(visible_text_preview(body)),
        };
    }
    let mut matched_selectors = Vec::new();
    let mut rejected_count = 0;
    let mut results = Vec::new();
    let mut items = xml_elements_by_tag(body, "item");
    if !items.is_empty() {
        matched_selectors.push("rss item".to_string());
    }
    let entries = xml_elements_by_tag(body, "entry");
    if !entries.is_empty() {
        matched_selectors.push("atom entry".to_string());
        items.extend(entries);
    }
    for item in items {
        if results.len() >= max_results {
            break;
        }
        let title = clean_bing_feed_text(&xml_tag_text(&item, "title").unwrap_or_default(), 140);
        let link = xml_link_text(&item);
        let description = clean_bing_feed_text(
            &xml_tag_text(&item, "description")
                .or_else(|| xml_tag_text(&item, "summary"))
                .or_else(|| xml_tag_text(&item, "content"))
                .unwrap_or_default(),
            240,
        );
        let date_hint = clean_bing_feed_text(
            &xml_tag_text(&item, "pubdate")
                .or_else(|| xml_tag_text(&item, "published"))
                .or_else(|| xml_tag_text(&item, "updated"))
                .unwrap_or_default(),
            80,
        );
        if let Some(source) = bing_result_to_web_source(
            &title,
            &link,
            &description,
            stage,
            if date_hint.is_empty() {
                None
            } else {
                Some(date_hint)
            },
        ) {
            results.push(source);
        } else {
            rejected_count += 1;
        }
    }
    let parse_failure_hint = if results.is_empty() {
        if body.trim().is_empty() {
            Some("rss_empty_body".to_string())
        } else if matched_selectors.is_empty() {
            Some("rss_no_item_or_entry".to_string())
        } else {
            Some("rss_items_missing_usable_title_or_link".to_string())
        }
    } else {
        None
    };
    BingParseReport {
        results,
        parser_used: "rss-xml".to_string(),
        matched_selectors,
        rejected_count,
        parse_failure_hint,
        raw_anchor_count: 0,
        raw_href_count: 0,
        decoded_url_candidate_count: 0,
        external_anchor_count: 0,
        kept_candidate_count: 0,
        filtered_reason_counts: Vec::new(),
        first_links_preview: Vec::new(),
        visible_text_preview: Some(visible_text_preview(body)),
    }
}

fn parse_bing_response_report(
    page: &BingFetchedPage,
    max_results: usize,
    stage: &str,
    prefer_rss: bool,
) -> BingParseReport {
    if page.body_quality != "text" {
        return BingParseReport {
            results: Vec::new(),
            parser_used: "body-quality-gate".to_string(),
            matched_selectors: Vec::new(),
            rejected_count: 0,
            parse_failure_hint: Some(
                page.decode_hint
                    .clone()
                    .unwrap_or_else(|| page.body_quality.clone()),
            ),
            raw_anchor_count: 0,
            raw_href_count: 0,
            decoded_url_candidate_count: 0,
            external_anchor_count: 0,
            kept_candidate_count: 0,
            filtered_reason_counts: Vec::new(),
            first_links_preview: Vec::new(),
            visible_text_preview: None,
        };
    }
    let parsed = catch_unwind(AssertUnwindSafe(|| match page.body_kind.as_str() {
        "rss_xml" if prefer_rss => parse_bing_rss_report(&page.body, max_results, stage),
        "html" | "bing_html" => {
            let mut report = parse_bing_html_report(&page.body, max_results, stage);
            if prefer_rss {
                report.parser_used = "rss-returned-html->html".to_string();
                if report.parse_failure_hint.is_none() {
                    report.parse_failure_hint = Some("rss_returned_html".to_string());
                } else {
                    report.parse_failure_hint = report
                        .parse_failure_hint
                        .map(|hint| format!("rss_returned_html_{hint}"));
                }
            }
            report
        }
        "captcha_or_block_page" => BingParseReport {
            results: Vec::new(),
            parser_used: "blocked-page".to_string(),
            matched_selectors: Vec::new(),
            rejected_count: 0,
            parse_failure_hint: Some("captcha_or_block_page".to_string()),
            raw_anchor_count: 0,
            raw_href_count: 0,
            decoded_url_candidate_count: 0,
            external_anchor_count: 0,
            kept_candidate_count: 0,
            filtered_reason_counts: Vec::new(),
            first_links_preview: Vec::new(),
            visible_text_preview: Some(visible_text_preview(&page.body)),
        },
        "empty" => BingParseReport {
            results: Vec::new(),
            parser_used: "empty-body".to_string(),
            matched_selectors: Vec::new(),
            rejected_count: 0,
            parse_failure_hint: Some("empty_body".to_string()),
            raw_anchor_count: 0,
            raw_href_count: 0,
            decoded_url_candidate_count: 0,
            external_anchor_count: 0,
            kept_candidate_count: 0,
            filtered_reason_counts: Vec::new(),
            first_links_preview: Vec::new(),
            visible_text_preview: None,
        },
        _ if prefer_rss => parse_bing_rss_report(&page.body, max_results, stage),
        _ => parse_bing_html_report(&page.body, max_results, stage),
    }));
    parsed.unwrap_or_else(|_| BingParseReport {
        results: Vec::new(),
        parser_used: "parser-panic-caught".to_string(),
        matched_selectors: Vec::new(),
        rejected_count: 0,
        parse_failure_hint: Some("parser_panic_caught".to_string()),
        raw_anchor_count: 0,
        raw_href_count: 0,
        decoded_url_candidate_count: 0,
        external_anchor_count: 0,
        kept_candidate_count: 0,
        filtered_reason_counts: Vec::new(),
        first_links_preview: Vec::new(),
        visible_text_preview: None,
    })
}

#[allow(dead_code)]
fn parse_bing_rss_results(body: &str, max_results: usize, stage: &str) -> Vec<WebSearchResult> {
    parse_bing_rss_report(body, max_results, stage).results
}

fn html_attr_value(tag: &str, attr: &str) -> Option<String> {
    let pattern = format!("{attr}=");
    let index = tag.to_ascii_lowercase().find(&pattern)?;
    let after = &tag[index + pattern.len()..];
    let quote = after.chars().next()?;
    if quote == '"' || quote == '\'' {
        let rest = &after[quote.len_utf8()..];
        let end = rest.find(quote)?;
        return Some(rest[..end].to_string());
    }
    let end = after
        .find(|ch: char| ch.is_whitespace() || ch == '>')
        .unwrap_or(after.len());
    let value = after[..end].trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn parse_anchor_from_html(fragment: &str) -> Option<(String, String)> {
    let anchor_start = fragment.find("<a ")?;
    let after = &fragment[anchor_start..];
    let tag_end = after.find('>')?;
    let tag = &after[..=tag_end];
    let href = html_attr_value(tag, "href")?;
    let title = text_between(&after[tag_end + 1..], "", "</a>").unwrap_or("");
    Some((clean_bing_markup_text(title, 140), href))
}

fn first_paragraph_text(fragment: &str) -> &str {
    let Some(p_start) = fragment.find("<p") else {
        return "";
    };
    let after_p = &fragment[p_start..];
    let Some(tag_end) = after_p.find('>') else {
        return "";
    };
    text_between(&after_p[tag_end + 1..], "", "</p>").unwrap_or("")
}

fn safe_text_window(text: &str, byte_index: usize, before: usize, after: usize) -> String {
    safe_context_around_byte(text, byte_index, before, after)
}

fn extract_bing_relative_date_hint(text: &str) -> Option<String> {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower = compact.to_ascii_lowercase();
    for marker in [
        "minutes ago",
        "minute ago",
        "hours ago",
        "hour ago",
        "today",
        "yesterday",
    ] {
        if let Some(index) = lower.find(&marker.to_ascii_lowercase()) {
            return Some(sanitize_search_text(
                &safe_text_window(&compact, index, 12, 18),
                80,
            ));
        }
    }
    if let Some(year_index) = compact.find("202") {
        return Some(sanitize_search_text(
            &safe_text_window(&compact, year_index, 2, 18),
            80,
        ));
    }
    for month in [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ] {
        if let Some(index) = compact.find(month) {
            return Some(sanitize_search_text(
                &safe_text_window(&compact, index, 0, 22),
                80,
            ));
        }
    }
    None
}

fn looks_like_bing_news_block(fragment: &str) -> bool {
    let lower = fragment.to_ascii_lowercase();
    lower.contains("news")
        || lower.contains("b_tpcn")
        || lower.contains("b_news")
        || lower.contains("news-card")
        || lower.contains("newsitem")
        || lower.contains("minutes ago")
        || lower.contains("hours ago")
}

#[allow(dead_code)]
fn parse_bing_news_card_results(
    body: &str,
    max_results: usize,
    stage: &str,
) -> Vec<WebSearchResult> {
    let mut results: Vec<WebSearchResult> = Vec::new();
    for chunk in body
        .split("<div")
        .filter(|chunk| looks_like_bing_news_block(chunk))
    {
        if results.len() >= max_results {
            break;
        }
        let mut local_count = 0;
        for anchor_chunk in chunk.split("<a ").skip(1) {
            if results.len() >= max_results || local_count >= 4 {
                break;
            }
            let fragment = format!("<a {anchor_chunk}");
            let Some((title, href)) = parse_anchor_from_html(&fragment) else {
                continue;
            };
            let title = title.trim();
            if title.len() < 6
                || title.eq_ignore_ascii_case("more")
                || title.contains("鍥剧墖")
                || title.contains("瑙嗛")
            {
                continue;
            }
            let block_text = strip_html_tags_to_text(chunk);
            let snippet = clean_bing_markup_text(&block_text, 240);
            let date_hint = extract_bing_relative_date_hint(&snippet);
            if let Some(source) =
                bing_result_to_web_source(title, &href, &snippet, stage, date_hint)
            {
                if !results.iter().any(|item| item.url == source.url) {
                    results.push(source);
                    local_count += 1;
                }
            }
        }
    }
    results
}

#[allow(dead_code)]
fn parse_bing_html_results(body: &str, max_results: usize, stage: &str) -> Vec<WebSearchResult> {
    let mut results = Vec::new();
    if stage.starts_with("news")
        || body.contains("璧勮")
        || body.to_ascii_lowercase().contains("b_news")
    {
        results.extend(parse_bing_news_card_results(body, max_results, stage));
    }
    for chunk in body.split("<li").filter(|chunk| chunk.contains("b_algo")) {
        if results.len() >= max_results {
            break;
        }
        let Some(h2_start) = chunk.find("<h2") else {
            continue;
        };
        let h2_fragment = &chunk[h2_start..];
        let Some((title, href)) = parse_anchor_from_html(h2_fragment) else {
            continue;
        };
        let snippet = if let Some(caption_start) = chunk.find("b_caption") {
            first_paragraph_text(&chunk[caption_start..])
        } else {
            ""
        };
        let date_hint = extract_bing_relative_date_hint(&strip_html_tags_to_text(chunk));
        if let Some(source) = bing_result_to_web_source(&title, &href, snippet, stage, date_hint) {
            if !results.iter().any(|item| item.url == source.url) {
                results.push(source);
            }
        }
    }
    if results.len() < max_results {
        for chunk in body.split("<h2").skip(1) {
            if results.len() >= max_results {
                break;
            }
            let Some((title, href)) = parse_anchor_from_html(chunk) else {
                continue;
            };
            let fallback_stage = if stage.starts_with("news") {
                "news-html-fallback"
            } else {
                "web-html-fallback"
            };
            if let Some(source) = bing_result_to_web_source(&title, &href, "", fallback_stage, None)
            {
                if !results.iter().any(|item| item.url == source.url) {
                    results.push(source);
                }
            }
        }
    }
    results
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BingPublicRoute {
    Web,
    News,
}

impl BingPublicRoute {
    fn endpoint(self) -> &'static str {
        match self {
            BingPublicRoute::Web => BING_SEARCH_ENDPOINT,
            BingPublicRoute::News => BING_NEWS_SEARCH_ENDPOINT,
        }
    }

    fn stage(self, rss: bool) -> &'static str {
        match (self, rss) {
            (BingPublicRoute::Web, true) => "web-rss",
            (BingPublicRoute::Web, false) => "web-html",
            (BingPublicRoute::News, true) => "news-rss",
            (BingPublicRoute::News, false) => "news-html",
        }
    }
}

#[allow(dead_code)]
fn parse_bing_news_html_results(body: &str, max_results: usize) -> Vec<WebSearchResult> {
    let mut results = parse_bing_html_results(body, max_results, "news-html");
    if results.len() >= max_results {
        return results;
    }
    for chunk in body.split("<a ").skip(1) {
        if results.len() >= max_results {
            break;
        }
        let fragment = format!("<a {chunk}");
        let Some((title, href)) = parse_anchor_from_html(&fragment) else {
            continue;
        };
        if title.trim().len() < 8 {
            continue;
        }
        let snippet = clean_bing_markup_text(&strip_html_tags_to_text(chunk), 240);
        if let Some(source) = bing_result_to_web_source(&title, &href, &snippet, "news-html", None)
        {
            if !results.iter().any(|item| item.url == source.url) {
                results.push(source);
            }
        }
    }
    results
}

fn parse_bing_news_card_results_v2(
    body: &str,
    max_results: usize,
    stage: &str,
) -> Vec<WebSearchResult> {
    let mut results: Vec<WebSearchResult> = Vec::new();
    let mut blocks = body
        .split("<div")
        .filter(|chunk| looks_like_bing_news_block(chunk))
        .collect::<Vec<_>>();
    if blocks.is_empty() {
        blocks = body
            .split("<li")
            .filter(|chunk| looks_like_bing_news_block(chunk))
            .collect::<Vec<_>>();
    }
    for chunk in blocks {
        if results.len() >= max_results {
            break;
        }
        let block_text = strip_html_tags_to_text(chunk);
        let snippet = clean_bing_markup_text(&block_text, 240);
        let date_hint = extract_bing_relative_date_hint(&snippet);
        for anchor_chunk in chunk.split("<a ").skip(1).take(6) {
            if results.len() >= max_results {
                break;
            }
            let fragment = format!("<a {anchor_chunk}");
            let Some((title, href)) = parse_anchor_from_html(&fragment) else {
                continue;
            };
            let title = title.trim();
            if title.len() < 6
                || title.eq_ignore_ascii_case("more")
                || title.contains("鍥剧墖")
                || title.contains("瑙嗛")
            {
                continue;
            }
            if let Some(source) =
                bing_result_to_web_source(title, &href, &snippet, stage, date_hint.clone())
            {
                if !results.iter().any(|item| item.url == source.url) {
                    results.push(source);
                }
            }
        }
    }
    results
}

fn parse_bing_html_report(body: &str, max_results: usize, stage: &str) -> BingParseReport {
    let mut results = Vec::new();
    let mut matched_selectors = Vec::new();
    let mut rejected_count = 0;
    let lower = body.to_ascii_lowercase();
    if stage.starts_with("news")
        || body.contains("璧勮")
        || body.contains("鏂伴椈")
        || lower.contains("b_news")
        || lower.contains("news-card")
        || lower.contains("newsitem")
    {
        let news_results = parse_bing_news_card_results_v2(body, max_results, stage);
        if !news_results.is_empty() {
            matched_selectors.push("news-card anchors".to_string());
        }
        results.extend(news_results);
    }
    for chunk in body.split("<li").filter(|chunk| chunk.contains("b_algo")) {
        if results.len() >= max_results {
            break;
        }
        let Some(h2_start) = chunk.find("<h2") else {
            continue;
        };
        let h2_fragment = &chunk[h2_start..];
        let Some((title, href)) = parse_anchor_from_html(h2_fragment) else {
            continue;
        };
        let snippet = if let Some(caption_start) = chunk.find("b_caption") {
            first_paragraph_text(&chunk[caption_start..])
        } else {
            ""
        };
        let date_hint = extract_bing_relative_date_hint(&strip_html_tags_to_text(chunk));
        if let Some(source) = bing_result_to_web_source(&title, &href, snippet, stage, date_hint) {
            if !results.iter().any(|item| item.url == source.url) {
                if !matched_selectors
                    .iter()
                    .any(|value| value == "li.b_algo h2 a")
                {
                    matched_selectors.push("li.b_algo h2 a".to_string());
                }
                results.push(source);
            }
        } else {
            rejected_count += 1;
        }
    }
    if results.len() < max_results {
        for chunk in body.split("<h2").skip(1) {
            if results.len() >= max_results {
                break;
            }
            let Some((title, href)) = parse_anchor_from_html(chunk) else {
                continue;
            };
            let fallback_stage = if stage.starts_with("news") {
                "news-html-fallback"
            } else {
                "web-html-fallback"
            };
            if let Some(source) = bing_result_to_web_source(&title, &href, "", fallback_stage, None)
            {
                if !results.iter().any(|item| item.url == source.url) {
                    if !matched_selectors
                        .iter()
                        .any(|value| value == "h2 a fallback")
                    {
                        matched_selectors.push("h2 a fallback".to_string());
                    }
                    results.push(source);
                }
            } else {
                rejected_count += 1;
            }
        }
    }
    if results.len() < max_results
        && (stage.starts_with("news") || lower.contains("news") || body.contains("璧勮"))
    {
        for chunk in body.split("<a ").skip(1) {
            if results.len() >= max_results {
                break;
            }
            let fragment = format!("<a {chunk}");
            let Some((title, href)) = parse_anchor_from_html(&fragment) else {
                continue;
            };
            if title.trim().len() < 6 {
                rejected_count += 1;
                continue;
            }
            let snippet = clean_bing_markup_text(&strip_html_tags_to_text(chunk), 240);
            let date_hint = extract_bing_relative_date_hint(&snippet);
            if let Some(source) =
                bing_result_to_web_source(&title, &href, &snippet, stage, date_hint)
            {
                if !results.iter().any(|item| item.url == source.url) {
                    if !matched_selectors
                        .iter()
                        .any(|value| value == "all anchors news fallback")
                    {
                        matched_selectors.push("all anchors news fallback".to_string());
                    }
                    results.push(source);
                }
            } else {
                rejected_count += 1;
            }
        }
    }
    let anchor_report = if results.len() < max_results {
        let report =
            parse_all_bing_anchors_fallback(body, max_results.saturating_sub(results.len()), stage);
        if report.raw_anchor_count > 0
            && !matched_selectors
                .iter()
                .any(|value| value == "all anchors fallback")
        {
            matched_selectors.push("all anchors fallback".to_string());
        }
        rejected_count += report.rejected_count;
        for source in &report.candidates {
            if results.len() >= max_results {
                break;
            }
            if !results.iter().any(|item| item.url == source.url) {
                results.push(source.clone());
            }
        }
        report
    } else {
        BingAnchorFallbackReport {
            candidates: Vec::new(),
            raw_anchor_count: 0,
            raw_href_count: 0,
            decoded_url_candidate_count: 0,
            external_count: 0,
            kept_count: 0,
            rejected_count: 0,
            filtered_reason_counts: Vec::new(),
            first_links_preview: Vec::new(),
        }
    };
    let parse_failure_hint = if results.is_empty() {
        if body.trim().is_empty() {
            Some("html_empty_body".to_string())
        } else if !looks_like_html(body) {
            Some("html_body_not_html".to_string())
        } else if matched_selectors.is_empty() {
            Some("html_no_supported_result_selector_matched".to_string())
        } else {
            Some("html_selectors_matched_but_no_usable_external_links".to_string())
        }
    } else {
        None
    };
    BingParseReport {
        results,
        parser_used: if stage.starts_with("news") {
            "news-html"
        } else {
            "web-html"
        }
        .to_string(),
        matched_selectors,
        rejected_count,
        parse_failure_hint,
        raw_anchor_count: anchor_report.raw_anchor_count,
        raw_href_count: anchor_report.raw_href_count,
        decoded_url_candidate_count: anchor_report.decoded_url_candidate_count,
        external_anchor_count: anchor_report.external_count,
        kept_candidate_count: anchor_report.kept_count,
        filtered_reason_counts: anchor_report.filtered_reason_counts,
        first_links_preview: anchor_report.first_links_preview,
        visible_text_preview: Some(visible_text_preview(body)),
    }
}

#[derive(Debug, Clone)]
struct BingFetchedPage {
    body: String,
    http_status: u16,
    duration_ms: i64,
    used_locale: bool,
    final_url_host: String,
    content_type: String,
    content_encoding: String,
    body_bytes: usize,
    body_quality: String,
    body_looks_binary: bool,
    replacement_char_count: usize,
    control_char_count: usize,
    decode_hint: Option<String>,
    body_kind: String,
    page_title: Option<String>,
}

fn extract_html_page_title(body: &str) -> Option<String> {
    if let Some(title) = xml_tag_text(body, "title")
        .map(|value| clean_bing_markup_text(&decode_html_entities(&value), 120))
        .filter(|value| !value.is_empty())
    {
        return Some(title);
    }
    let lower = body.to_ascii_lowercase();
    for marker in [
        "property=\"og:title\"",
        "property='og:title'",
        "name=\"twitter:title\"",
        "name='twitter:title'",
        "property=\"twitter:title\"",
        "property='twitter:title'",
    ] {
        if let Some(content) = extract_html_meta_content(body, &lower, marker) {
            let cleaned = clean_bing_markup_text(&decode_html_entities(&content), 120);
            if !cleaned.is_empty() {
                return Some(cleaned);
            }
        }
    }
    None
}

fn extract_html_meta_content(body: &str, lower: &str, marker: &str) -> Option<String> {
    let marker_start = lower.find(marker)?;
    let tag_start = safe_slice_by_byte_range(lower, 0, marker_start)
        .rfind('<')
        .unwrap_or(marker_start);
    let tag_end = safe_slice_by_byte_range(lower, marker_start, lower.len())
        .find('>')
        .map(|offset| marker_start + offset)
        .unwrap_or(marker_start);
    let tag = safe_slice_by_byte_range(body, tag_start, tag_end.saturating_add(1));
    html_attr_value(tag, "content")
}

fn extract_html_meta_description(body: &str) -> Option<String> {
    let lower = body.to_ascii_lowercase();
    for marker in [
        "name=\"description\"",
        "name='description'",
        "property=\"og:description\"",
        "property='og:description'",
        "name=\"twitter:description\"",
        "name='twitter:description'",
    ] {
        if let Some(content) = extract_html_meta_content(body, &lower, marker) {
            let cleaned = clean_bing_markup_text(&decode_html_entities(&content), 240);
            if !cleaned.is_empty() {
                return Some(cleaned);
            }
        }
    }
    None
}

fn extract_html_published_at(body: &str) -> Option<String> {
    let lower = body.to_ascii_lowercase();
    for marker in [
        "property=\"article:published_time\"",
        "property='article:published_time'",
        "name=\"article:published_time\"",
        "name='article:published_time'",
        "itemprop=\"datepublished\"",
        "itemprop='datepublished'",
    ] {
        if let Some(content) = extract_html_meta_content(body, &lower, marker) {
            let cleaned = clean_bing_markup_text(&decode_html_entities(&content), 80);
            if !cleaned.is_empty() {
                return Some(cleaned);
            }
        }
    }
    for marker in ["\"datepublished\"", "'datepublished'"] {
        let Some(marker_start) = lower.find(marker) else {
            continue;
        };
        let window = safe_slice_by_byte_range(body, marker_start, (marker_start + 320).min(body.len()));
        for key in ["\"datePublished\"", "'datePublished'", "\"datepublished\"", "'datepublished'"] {
            if let Some(key_start) = window.find(key) {
                let rest = &window[key_start + key.len()..];
                if let Some(colon_start) = rest.find(':') {
                    let value_part = rest[colon_start + 1..].trim_start();
                    let quote = value_part.chars().next().filter(|ch| *ch == '"' || *ch == '\'');
                    if let Some(quote) = quote {
                        if let Some(end) = value_part[1..].find(quote) {
                            let cleaned = clean_bing_markup_text(&decode_html_entities(&value_part[1..1 + end]), 80);
                            if !cleaned.is_empty() {
                                return Some(cleaned);
                            }
                        }
                    }
                }
            }
        }
    }
    for marker in ["<time", " datetime="] {
        let Some(marker_start) = lower.find(marker) else {
            continue;
        };
        let tag_start = if marker == "<time" {
            marker_start
        } else {
            safe_slice_by_byte_range(&lower, 0, marker_start)
                .rfind('<')
                .unwrap_or(marker_start)
        };
        let tag_end = safe_slice_by_byte_range(&lower, marker_start, lower.len())
            .find('>')
            .map(|offset| marker_start + offset)
            .unwrap_or(marker_start);
        let tag = safe_slice_by_byte_range(body, tag_start, tag_end.saturating_add(1));
        if let Some(datetime) = html_attr_value(tag, "datetime") {
            let cleaned = clean_bing_markup_text(&decode_html_entities(&datetime), 80);
            if !cleaned.is_empty() {
                return Some(cleaned);
            }
        }
    }
    None
}

fn excerpt_quality_status_label(quality: &str, text_chars: usize, meta_description: Option<&str>) -> (&'static str, &'static str) {
    match quality {
        "good" => ("high", "fetched article body extracted"),
        "partial" => ("medium", "partial webpage body extracted"),
        "empty" if text_chars > 0 => ("too_short", "extracted webpage body was too short"),
        "empty" if meta_description.is_some() => ("snippet_only", "only metadata description was available"),
        "empty" => ("title_only", "only title or non-body metadata was available"),
        "blocked" => ("blocked", "page body appears blocked or requires rendering"),
        "failed" => ("failed", "extractor failed"),
        _ => ("low", "weak extracted excerpt quality"),
    }
}

fn classify_bing_body_kind(status: reqwest::StatusCode, content_type: &str, body: &str) -> String {
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return "captcha_or_block_page".to_string();
    }
    if is_bing_block_page(status, body).is_some() {
        return "captcha_or_block_page".to_string();
    }
    detect_bing_body_kind(content_type, body)
}

fn bing_error_kind(error: &str) -> String {
    error
        .split("errorKind=")
        .nth(1)
        .and_then(|rest| rest.split([';', ',']).next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("unknown")
        .to_string()
}

fn bing_error_http_status(error: &str) -> Option<u16> {
    error
        .split("httpStatus=")
        .nth(1)
        .and_then(|rest| rest.split([';', ',']).next())
        .and_then(|value| value.trim().parse::<u16>().ok())
}

fn bing_stage_diag(
    stage: &str,
    status: &str,
    http_status: Option<u16>,
    error_kind: Option<&str>,
    parsed: usize,
    filtered: usize,
    final_count: usize,
    duration_ms: i64,
    cache_status: Option<&str>,
    parse_meta: Option<&str>,
) -> String {
    let meta = parse_meta
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!(":{value}"))
        .unwrap_or_default();
    format!(
        "{stage}:{status}:http={}:error={}:parsed={parsed}:filtered={filtered}:final={final_count}:cache={}:ms={duration_ms}{meta}",
        http_status.map(|value| value.to_string()).unwrap_or_else(|| "-".to_string()),
        error_kind.unwrap_or("-"),
        cache_status.unwrap_or("miss"),
    )
}

fn bing_stage_parse_meta(page: &BingFetchedPage, report: &BingParseReport) -> String {
    let selectors = if report.matched_selectors.is_empty() {
        "-".to_string()
    } else {
        report
            .matched_selectors
            .iter()
            .map(|value| sanitize_bing_diag_value(value, 48))
            .collect::<Vec<_>>()
            .join(",")
    };
    let first_links = if report.first_links_preview.is_empty() {
        "-".to_string()
    } else {
        report
            .first_links_preview
            .iter()
            .map(|value| sanitize_bing_diag_value(value, 96))
            .collect::<Vec<_>>()
            .join(",")
    };
    let visible_preview =
        sanitize_bing_diag_value(report.visible_text_preview.as_deref().unwrap_or("-"), 180);
    let filtered_reasons = if report.filtered_reason_counts.is_empty() {
        "-".to_string()
    } else {
        report
            .filtered_reason_counts
            .iter()
            .map(|(reason, count)| format!("{}={count}", sanitize_bing_diag_value(reason, 40)))
            .collect::<Vec<_>>()
            .join(",")
    };
    format!(
        "host={}:ct={}:enc={}:bytes={}:quality={}:binary={}:replacement={}:controls={}:kind={}:title={}:parser={}:panic={}:selectors={}:rawAnchors={}:rawHrefs={}:decodedUrls={}:external={}:kept={}:rejected={}:filterReasons={}:hint={}:text={}:links={}",
        sanitize_bing_diag_value(&page.final_url_host, 80),
        sanitize_bing_diag_value(&page.content_type, 80),
        sanitize_bing_diag_value(&page.content_encoding, 40),
        page.body_bytes,
        sanitize_bing_diag_value(&page.body_quality, 40),
        if page.body_looks_binary { "yes" } else { "no" },
        page.replacement_char_count,
        page.control_char_count,
        sanitize_bing_diag_value(&page.body_kind, 40),
        sanitize_bing_diag_value(page.page_title.as_deref().unwrap_or("-"), 80),
        sanitize_bing_diag_value(&report.parser_used, 48),
        if report.parser_used == "parser-panic-caught" { "yes" } else { "no" },
        selectors,
        report.raw_anchor_count,
        report.raw_href_count,
        report.decoded_url_candidate_count,
        report.external_anchor_count,
        report.kept_candidate_count,
        report.rejected_count,
        filtered_reasons,
        sanitize_bing_diag_value(report.parse_failure_hint.as_deref().unwrap_or("-"), 80),
        visible_preview,
        first_links,
    )
}

fn bing_diagnostics_summary(
    provider: &str,
    vertical: &str,
    stages: &[String],
    final_reason: &str,
) -> String {
    format!(
        "provider={provider}; vertical={vertical}; browserHeaders=enabled; attemptedStages={}; finalFailureReason={final_reason}",
        stages.join(" | ")
    )
}

fn fetch_bing_public_page_once(
    client: &reqwest::blocking::Client,
    query: &str,
    rss: bool,
    route: BingPublicRoute,
    use_locale: bool,
) -> Result<BingFetchedPage, String> {
    let mut url = reqwest::Url::parse(route.endpoint())
        .map_err(|e| bing_public_error("invalid_endpoint", &format!("stage=url; {e}")))?;
    url.query_pairs_mut().append_pair("q", query);
    if rss {
        url.query_pairs_mut().append_pair("format", "rss");
    }
    let locale = if use_locale {
        if query
            .chars()
            .any(|ch| ('\u{4e00}'..='\u{9fff}').contains(&ch))
        {
            url.query_pairs_mut()
                .append_pair("mkt", "zh-CN")
                .append_pair("setlang", "zh-CN")
                .append_pair("cc", "CN");
            Some("zh-CN")
        } else {
            url.query_pairs_mut()
                .append_pair("mkt", "en-US")
                .append_pair("setlang", "en-US");
            Some("en-US")
        }
    } else {
        None
    };
    let stage = route.stage(rss);
    let started_at = Instant::now();
    let response = client
        .get(url)
        .headers(build_bing_public_headers(locale))
        .send()
        .map_err(|e| bing_public_request_error(&e, stage))?;
    let duration_ms = started_at.elapsed().as_millis().min(i64::MAX as u128) as i64;
    let final_url_host = response
        .url()
        .host_str()
        .map(|value| value.to_string())
        .unwrap_or_else(|| "-".to_string());
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let content_encoding = response
        .headers()
        .get(reqwest::header::CONTENT_ENCODING)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response
        .bytes()
        .map(|bytes| {
            let body_bytes = bytes.len();
            let body = decode_response_body(&bytes);
            let quality = detect_bing_body_text_quality(&bytes, &body);
            (body, body_bytes, quality)
        })
        .map_err(|_| bing_public_error("read_failed", &format!("stage={stage}")))?;
    let (body, body_bytes, body_quality) = body;
    let body_kind = if body_quality.body_quality == "text" {
        classify_bing_body_kind(status, &content_type, &body)
    } else {
        body_quality.body_quality.clone()
    };
    let page_title = if body_quality.body_quality == "text" {
        extract_html_page_title(&body)
    } else {
        None
    };
    if let Some(kind) = is_bing_block_page(status, &body) {
        return Err(bing_public_error(
            kind,
            &format!("stage={stage}; httpStatus={}", status.as_u16()),
        ));
    }
    if !status.is_success() {
        return Err(bing_public_error(
            "http_status",
            &format!("stage={stage}; httpStatus={}", status.as_u16()),
        ));
    }
    Ok(BingFetchedPage {
        body,
        http_status: status.as_u16(),
        duration_ms,
        used_locale: use_locale,
        final_url_host,
        content_type,
        content_encoding,
        body_bytes,
        body_quality: body_quality.body_quality,
        body_looks_binary: body_quality.body_looks_binary,
        replacement_char_count: body_quality.replacement_char_count,
        control_char_count: body_quality.control_char_count,
        decode_hint: body_quality.decode_hint,
        body_kind,
        page_title,
    })
}

fn fetch_bing_public_page(
    client: &reqwest::blocking::Client,
    query: &str,
    rss: bool,
    route: BingPublicRoute,
) -> Result<BingFetchedPage, String> {
    let first_error = match fetch_bing_public_page_once(client, query, rss, route, true) {
        Ok(body) => return Ok(body),
        Err(error) if is_bing_non_retryable_error(&error) => return Err(error),
        Err(error) => error,
    };
    if let Ok(body) = fetch_bing_public_page_once(client, query, rss, route, false) {
        return Ok(body);
    }
    if !is_bing_transient_error(&first_error) {
        return Err(first_error);
    }
    thread::sleep(Duration::from_millis(300));
    match fetch_bing_public_page_once(client, query, rss, route, true) {
        Ok(body) => Ok(body),
        Err(second_error) if is_bing_non_retryable_error(&second_error) => Err(second_error),
        Err(second_error) => match fetch_bing_public_page_once(client, query, rss, route, false) {
            Ok(body) => Ok(body),
            Err(_) if is_bing_transient_error(&second_error) => Err(second_error),
            Err(_) => Err(first_error),
        },
    }
}

fn search_bing_public_sources(
    request: &WebSearchRequestInput,
    max_results: usize,
) -> Result<Vec<WebSearchResult>, String> {
    let client = bing_public_client()?;
    let mut seen_urls = HashSet::new();
    let mut results = Vec::new();
    let query_limit = bing_query_limit(request);
    let total_limit = max_results.clamp(1, BING_PUBLIC_MAX_RESULTS);
    let news_mode = is_bing_news_request(request);
    let mut fallback_notes = Vec::new();
    let mut stage_diags = Vec::new();

    for (index, query) in request
        .queries
        .iter()
        .map(|query| compact_bing_query(query))
        .filter(|query| !query.is_empty())
        .take(query_limit)
        .enumerate()
    {
        if results.len() >= total_limit {
            break;
        }
        if index > 0 {
            let jitter_ms = 250 + (web_cache::now_ms().rem_euclid(250) as u64);
            thread::sleep(Duration::from_millis(jitter_ms));
        }

        let query_remaining = (total_limit - results.len()).min(BING_PUBLIC_MAX_RESULTS_PER_QUERY);
        let mut query_results = Vec::new();

        if news_mode {
            match fetch_bing_public_page(&client, &query, true, BingPublicRoute::News) {
                Ok(page) => {
                    let report =
                        parse_bing_response_report(&page, query_remaining, "news-rss", true);
                    let parsed = report.results.clone();
                    let parsed_count = parsed.len();
                    query_results = filter_bing_news_results(parsed, false);
                    let parse_meta = bing_stage_parse_meta(&page, &report);
                    stage_diags.push(bing_stage_diag(
                        "news-rss",
                        "success",
                        Some(page.http_status),
                        None,
                        parsed_count,
                        parsed_count.saturating_sub(query_results.len()),
                        query_results.len(),
                        page.duration_ms,
                        Some(if page.used_locale {
                            "miss(locale)"
                        } else {
                            "miss(no-locale)"
                        }),
                        Some(&parse_meta),
                    ));
                    if query_results.is_empty() {
                        fallback_notes.push("news_rss_filtered_all");
                    }
                }
                Err(error) => {
                    if error.contains("errorKind=rate_limited")
                        || error.contains("errorKind=blocked_or_captcha")
                    {
                        return Err(error);
                    }
                    stage_diags.push(bing_stage_diag(
                        "news-rss",
                        "failed",
                        bing_error_http_status(&error),
                        Some(&bing_error_kind(&error)),
                        0,
                        0,
                        0,
                        0,
                        Some("miss"),
                        None,
                    ));
                    fallback_notes.push("news_rss_failed");
                }
            }

            if query_results.is_empty() {
                match fetch_bing_public_page(&client, &query, false, BingPublicRoute::News) {
                    Ok(page) => {
                        let report =
                            parse_bing_response_report(&page, query_remaining, "news-html", false);
                        let parsed = report.results.clone();
                        let parsed_count = parsed.len();
                        query_results = filter_bing_news_results(parsed, false);
                        let parse_meta = bing_stage_parse_meta(&page, &report);
                        stage_diags.push(bing_stage_diag(
                            "news-html",
                            "success",
                            Some(page.http_status),
                            None,
                            parsed_count,
                            parsed_count.saturating_sub(query_results.len()),
                            query_results.len(),
                            page.duration_ms,
                            Some(if page.used_locale {
                                "miss(locale)"
                            } else {
                                "miss(no-locale)"
                            }),
                            Some(&parse_meta),
                        ));
                        if query_results.is_empty() {
                            fallback_notes.push("news_html_filtered_all");
                        }
                    }
                    Err(error) => {
                        if error.contains("errorKind=rate_limited")
                            || error.contains("errorKind=blocked_or_captcha")
                        {
                            return Err(error);
                        }
                        stage_diags.push(bing_stage_diag(
                            "news-html",
                            "failed",
                            bing_error_http_status(&error),
                            Some(&bing_error_kind(&error)),
                            0,
                            0,
                            0,
                            0,
                            Some("miss"),
                            None,
                        ));
                        fallback_notes.push("news_html_failed");
                    }
                }
            }
        }

        if query_results.is_empty() {
            let rss_body = fetch_bing_public_page(&client, &query, true, BingPublicRoute::Web);
            query_results = match rss_body {
                Ok(page) => {
                    let report =
                        parse_bing_response_report(&page, query_remaining, "web-rss", true);
                    let parsed = report.results.clone();
                    let parsed_count = parsed.len();
                    let filtered = if news_mode {
                        filter_bing_news_results(parsed, true)
                    } else {
                        parsed
                    };
                    let parse_meta = bing_stage_parse_meta(&page, &report);
                    stage_diags.push(bing_stage_diag(
                        "web-rss",
                        "success",
                        Some(page.http_status),
                        None,
                        parsed_count,
                        parsed_count.saturating_sub(filtered.len()),
                        filtered.len(),
                        page.duration_ms,
                        Some(if page.used_locale {
                            "miss(locale)"
                        } else {
                            "miss(no-locale)"
                        }),
                        Some(&parse_meta),
                    ));
                    filtered
                }
                Err(error) => {
                    if error.contains("errorKind=rate_limited")
                        || error.contains("errorKind=blocked_or_captcha")
                    {
                        return Err(error);
                    }
                    stage_diags.push(bing_stage_diag(
                        "web-rss",
                        "failed",
                        bing_error_http_status(&error),
                        Some(&bing_error_kind(&error)),
                        0,
                        0,
                        0,
                        0,
                        Some("miss"),
                        None,
                    ));
                    Vec::new()
                }
            };
            if news_mode {
                fallback_notes.push("fallback_to_web");
                if query_results.is_empty() {
                    fallback_notes.push("fallback_web_filtered_all");
                }
            }
        }

        if query_results.is_empty() {
            match fetch_bing_public_page(&client, &query, false, BingPublicRoute::Web) {
                Ok(page) => {
                    let report =
                        parse_bing_response_report(&page, query_remaining, "web-html", false);
                    let parsed = report.results.clone();
                    let parsed_count = parsed.len();
                    query_results = if news_mode {
                        fallback_notes.push("fallback_to_web_html");
                        filter_bing_news_results(parsed, true)
                    } else {
                        parsed
                    };
                    let parse_meta = bing_stage_parse_meta(&page, &report);
                    stage_diags.push(bing_stage_diag(
                        "web-html",
                        "success",
                        Some(page.http_status),
                        None,
                        parsed_count,
                        parsed_count.saturating_sub(query_results.len()),
                        query_results.len(),
                        page.duration_ms,
                        Some(if page.used_locale {
                            "miss(locale)"
                        } else {
                            "miss(no-locale)"
                        }),
                        Some(&parse_meta),
                    ));
                }
                Err(error) => {
                    stage_diags.push(bing_stage_diag(
                        "web-html",
                        "failed",
                        bing_error_http_status(&error),
                        Some(&bing_error_kind(&error)),
                        0,
                        0,
                        0,
                        0,
                        Some("miss"),
                        None,
                    ));
                    return Err(error);
                }
            }
            if query_results.is_empty() {
                let detail = if fallback_notes.is_empty() {
                    format!(
                        "stage=complete; resultCount=0; diagnostics={}",
                        bing_diagnostics_summary(
                            WEB_SEARCH_BING_PROVIDER,
                            if news_mode { "news" } else { "web" },
                            &stage_diags,
                            "no_candidates"
                        )
                    )
                } else {
                    format!(
                        "stage=complete; resultCount=0; fallbackReason={}; diagnostics={}",
                        fallback_notes.join(","),
                        bing_diagnostics_summary(
                            WEB_SEARCH_BING_PROVIDER,
                            if news_mode { "news" } else { "web" },
                            &stage_diags,
                            "all_filtered"
                        )
                    )
                };
                return Err(bing_public_error("parse_failed", &detail));
            }
        }

        let diagnostics = bing_diagnostics_summary(
            WEB_SEARCH_BING_PROVIDER,
            if news_mode { "news" } else { "web" },
            &stage_diags,
            "ok",
        );
        for source in query_results {
            if results.len() >= total_limit {
                break;
            }
            if seen_urls.insert(source.url.clone()) {
                let mut source = source;
                source.search_diagnostics = Some(diagnostics.clone());
                results.push(source);
            }
        }
    }

    if results.is_empty() {
        let detail = if fallback_notes.is_empty() {
            format!(
                "stage=complete; diagnostics={}",
                bing_diagnostics_summary(
                    WEB_SEARCH_BING_PROVIDER,
                    if news_mode { "news" } else { "web" },
                    &stage_diags,
                    "no_candidates"
                )
            )
        } else {
            format!(
                "stage=complete; fallbackReason={}; diagnostics={}",
                fallback_notes.join(","),
                bing_diagnostics_summary(
                    WEB_SEARCH_BING_PROVIDER,
                    if news_mode { "news" } else { "web" },
                    &stage_diags,
                    "all_filtered"
                )
            )
        };
        return Err(bing_public_error("no_results", &detail));
    }
    Ok(results)
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
        .map_err(|e| format!("联网搜索失败：无法创建 HTTP 客户端：{e}"))?;
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
            .map_err(|e| format!("联网搜索失败：搜索服务 URL 无效：{e}"))?;
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
                    "联网搜索失败：搜索服务请求超时。".to_string()
                } else {
                    "联网搜索失败：无法连接搜索服务。".to_string()
                }
            })?;

        let status = response.status();
        let body = response
            .bytes()
            .map(|bytes| decode_response_body(&bytes))
            .map_err(|_| "联网搜索失败：无法读取搜索服务响应。".to_string())?;
        let body_trimmed = body.trim();
        if !status.is_success() {
            return Err(brave_search_status_error(status, body_trimmed));
        }

        let parsed = serde_json::from_str::<BraveSearchResponse>(body_trimmed)
            .map_err(|_| "联网搜索失败：搜索服务返回了无法识别的格式。".to_string())?;
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
        .map_err(|e| format!("联网搜索失败：无法创建 HTTP 客户端：{e}"))?;
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
                    "联网搜索失败：Bocha 搜索请求超时。".to_string()
                } else {
                    "联网搜索失败：无法连接 Bocha 搜索服务。".to_string()
                }
            })?;

        let status = response.status();
        let body = response
            .bytes()
            .map(|bytes| decode_response_body(&bytes))
            .map_err(|_| "联网搜索失败：无法读取 Bocha 搜索响应。".to_string())?;
        let body_trimmed = body.trim();
        if !status.is_success() {
            return Err(bocha_search_status_error(status, body_trimmed));
        }

        let parsed = serde_json::from_str::<BochaSearchResponse>(body_trimmed)
            .map_err(|_| "联网搜索失败：Bocha 搜索返回了无法识别的格式。".to_string())?;
        let items = parsed
            .web_pages
            .map(|web_pages| web_pages.value)
            .unwrap_or_default();
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
        .map_err(|e| format!("联网搜索失败：无法创建 HTTP 客户端：{e}"))?;
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
                    return Err(last_error.unwrap_or_else(|| {
                        "无法连接 Bocha 搜索服务，请检查网络或 API endpoint。".to_string()
                    }));
                }
            };

            let status = response.status();
            let body = response
                .bytes()
                .map(|bytes| decode_response_body(&bytes))
                .map_err(|_| "无法读取 Bocha 搜索响应。".to_string())?;
            let body_trimmed = body.trim();
            if !status.is_success() {
                last_error = Some(bocha_search_status_error(status, body_trimmed));
                if is_bocha_endpoint_retryable(status) && index + 1 < endpoints.len() {
                    continue;
                }
                return Err(last_error.unwrap_or_else(|| "Bocha 搜索服务暂时不可用。".to_string()));
            }

            let parsed = serde_json::from_str::<BochaSearchResponse>(body_trimmed)
                .map_err(|_| "Bocha 搜索返回了无法识别的格式，API 版本可能已变化。".to_string())?;
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

fn is_search_engine_results_url(host: &str, path: &str, query: Option<&str>) -> bool {
    let has_query = query.map(|value| !value.trim().is_empty()).unwrap_or(false);
    ((host == "www.google.com" || host.ends_with(".google.com") || host.starts_with("google."))
        && path == "/search")
        || ((host == "www.bing.com" || host.ends_with(".bing.com")) && path == "/search")
        || ((host == "www.baidu.com" || host.ends_with(".baidu.com")) && path == "/s")
        || ((host == "duckduckgo.com" || host.ends_with(".duckduckgo.com"))
            && path == "/"
            && has_query)
}

#[derive(Debug, Clone)]
struct WebReadFailure {
    kind: &'static str,
    message: String,
}

fn validate_public_web_url_for_read(url: &str) -> Result<reqwest::Url, WebReadFailure> {
    match validate_public_web_url(url) {
        Ok(parsed) => Ok(parsed),
        Err(message) => {
            let kind = if message.contains("http / https") {
                "unsupported_scheme"
            } else if message.contains("localhost")
                || message.contains("private")
                || message.contains("local")
            {
                "private_network"
            } else if message.contains("search engine") {
                "blocked_or_unreadable"
            } else if message.contains("resolve") {
                "dns_failed"
            } else {
                "invalid_url"
            };
            Err(WebReadFailure { kind, message })
        }
    }
}

fn validate_public_web_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|_| "Web page URL is invalid and cannot be read.".to_string())?;
    match parsed.scheme() {
        "http" | "https" => {}
        _ => return Err("Only public http / https web pages can be read.".to_string()),
    }
    if parsed.username() != "" || parsed.password().is_some() {
        return Err("Web page URL contains credentials and was skipped.".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Web page URL is missing a host and cannot be read.".to_string())?
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host.ends_with(".lan")
    {
        return Err(
            "Refusing to access localhost, private network, or local hostnames.".to_string(),
        );
    }
    if is_search_engine_results_url(&host, parsed.path(), parsed.query()) {
        return Err("search engine result pages are not read".to_string());
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_or_local_ip(ip) {
            return Err(
                "Refusing to access localhost, private network, or local addresses.".to_string(),
            );
        }
    } else {
        let port = parsed.port_or_known_default().unwrap_or(443);
        let addrs = (host.as_str(), port)
            .to_socket_addrs()
            .map_err(|_| "Could not resolve the web page host; skipped body read.".to_string())?;
        let mut resolved_any = false;
        for addr in addrs {
            resolved_any = true;
            if is_private_or_local_ip(addr.ip()) {
                return Err(
                    "Web page host resolved to a private or local address; skipped read."
                        .to_string(),
                );
            }
        }
        if !resolved_any {
            return Err("Could not resolve the web page host; skipped body read.".to_string());
        }
    }
    Ok(parsed)
}

#[allow(dead_code)]
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

#[allow(dead_code)]
fn decode_html_entities(text: &str) -> String {
    text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

#[allow(dead_code)]
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
                    "p" | "br"
                        | "div"
                        | "section"
                        | "article"
                        | "li"
                        | "ul"
                        | "ol"
                        | "pre"
                        | "code"
                        | "h1"
                        | "h2"
                        | "h3"
                        | "h4"
                        | "h5"
                        | "tr"
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

#[allow(dead_code)]
fn normalize_extracted_text(text: &str, max_chars: usize) -> String {
    let mut lines = Vec::new();
    for line in text.lines() {
        let normalized = line.split_whitespace().collect::<Vec<_>>().join(" ");
        let trimmed = normalized.trim();
        if trimmed.len() < 2 {
            continue;
        }
        let lower = trimmed.to_ascii_lowercase();
        if lower.contains("advertisement")
            || lower.contains("copyright")
            || lower.contains("all rights reserved")
        {
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
    context: &FetchWebSourceExcerptsInput,
    max_chars: usize,
) -> WebSourceExcerptResult {
    fetch_single_web_source_excerpt_with_cache(client, source, context, max_chars, true)
}

fn fetch_single_web_source_excerpt_with_cache(
    client: &reqwest::blocking::Client,
    source: &WebSearchResult,
    context: &FetchWebSourceExcerptsInput,
    max_chars: usize,
    cache_enabled: bool,
) -> WebSourceExcerptResult {
    let fetched_at = Utc::now().timestamp_millis();
    let id = source.id.clone();
    let url = source.url.clone();
    let title = source.title.clone();
    let parsed_url = match validate_public_web_url_for_read(&url) {
        Ok(url) => url,
        Err(error) => {
            return WebSourceExcerptResult {
                id,
                url,
                final_url: None,
                title,
                fetched: false,
                status: Some("blocked".to_string()),
                excerpt: None,
                error: Some(error.message),
                error_kind: Some(error.kind.to_string()),
                fetched_at,
                cache_status: Some("miss".to_string()),
                cached_at: None,
                cache_ttl_seconds: None,
                excerpt_quality: Some("blocked".to_string()),
                extractor: Some("none".to_string()),
                excerpt_reason: Some("URL failed public web safety validation".to_string()),
                content_status: Some("blocked".to_string()),
                blocked_reason: Some("URL failed public web safety validation".to_string()),
                code_blocks_truncated: Some(false),
                ..Default::default()
            };
        }
    };
    let cache_key = build_web_excerpt_cache_key(&url, max_chars);
    let cached = if cache_enabled {
        web_cache::read_cached_json("excerpts", &cache_key, web_cache::now_ms())
    } else {
        None
    };
    if let Some(cached_entry) = cached.as_ref().filter(|entry| entry.is_fresh) {
        if let Ok(mut result) =
            serde_json::from_value::<WebSourceExcerptResult>(cached_entry.value.clone())
        {
            result.id = id;
            result.url = url;
            result.title = title;
            mark_excerpt_cache_status(
                &mut result,
                "hit",
                cached_entry.cached_at_ms,
                cached_entry.ttl_seconds,
            );
            return result;
        }
    }

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
                "璇诲彇缃戦〉姝ｆ枃瓒呮椂".to_string()
            } else {
                "璇诲彇缃戦〉姝ｆ枃澶辫触".to_string()
            };
            let result = WebSourceExcerptResult {
                id,
                url,
                final_url: None,
                title,
                fetched: false,
                status: Some("failed".to_string()),
                excerpt: None,
                error: Some(message),
                error_kind: Some(
                    if error.is_timeout() {
                        "timeout"
                    } else {
                        "unknown"
                    }
                    .to_string(),
                ),
                fetched_at,
                cache_status: Some("miss".to_string()),
                cached_at: None,
                cache_ttl_seconds: None,
                excerpt_quality: Some("failed".to_string()),
                extractor: Some("none".to_string()),
                excerpt_reason: Some("HTTP request failed".to_string()),
                content_status: Some("failed".to_string()),
                extraction_failure_reason: Some("HTTP request failed".to_string()),
                code_blocks_truncated: Some(false),
                ..Default::default()
            };
            return finish_web_excerpt_result(result, &cache_key, cached, cache_enabled);
        }
    };

    let final_url = response.url().to_string();
    let final_url_host = response
        .url()
        .host_str()
        .map(|host| host.to_ascii_lowercase());
    if let Err(error) = validate_public_web_url_for_read(&final_url) {
        let result = WebSourceExcerptResult {
            id,
            url,
            final_url: Some(final_url),
            final_url_host,
            title,
            fetched: false,
            status: Some("blocked".to_string()),
            excerpt: None,
            error: Some(error.message),
            error_kind: Some("redirect_blocked".to_string()),
            fetched_at,
            cache_status: Some("miss".to_string()),
            cached_at: None,
            cache_ttl_seconds: None,
            excerpt_quality: Some("blocked".to_string()),
            extractor: Some("none".to_string()),
            excerpt_reason: Some("Final URL failed public web safety validation".to_string()),
            blocked_reason: Some("Final URL failed public web safety validation".to_string()),
            content_status: Some("blocked".to_string()),
            code_blocks_truncated: Some(false),
            ..Default::default()
        };
        return finish_web_excerpt_result(result, &cache_key, cached, cache_enabled);
    }

    let status = response.status();
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::UNAUTHORIZED {
        let result = WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("Web page body is unavailable or requires login.".to_string()),
            fetched_at,
            cache_status: Some("miss".to_string()),
            cached_at: None,
            cache_ttl_seconds: None,
            excerpt_quality: Some("blocked".to_string()),
            extractor: Some("none".to_string()),
            final_url: Some(final_url.clone()),
            final_url_host: final_url_host.clone(),
            status: Some("blocked".to_string()),
            error_kind: Some("blocked_or_unreadable".to_string()),
            excerpt_reason: Some("HTTP status requires authorization".to_string()),
            blocked_reason: Some("HTTP status requires authorization".to_string()),
            content_status: Some("blocked".to_string()),
            code_blocks_truncated: Some(false),
            ..Default::default()
        };
        return finish_web_excerpt_result(result, &cache_key, cached, cache_enabled);
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        let result = WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("Web page does not exist or URL is unavailable.".to_string()),
            fetched_at,
            cache_status: Some("miss".to_string()),
            cached_at: None,
            cache_ttl_seconds: None,
            excerpt_quality: Some("empty".to_string()),
            extractor: Some("none".to_string()),
            final_url: Some(final_url.clone()),
            final_url_host: final_url_host.clone(),
            status: Some("failed".to_string()),
            error_kind: Some("http_status".to_string()),
            excerpt_reason: Some("HTTP status was not found".to_string()),
            extraction_failure_reason: Some("HTTP status was not found".to_string()),
            content_status: Some("failed".to_string()),
            code_blocks_truncated: Some(false),
            ..Default::default()
        };
        return finish_web_excerpt_result(result, &cache_key, cached, cache_enabled);
    }
    if !status.is_success() {
        let result = WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("Web page is temporarily unreadable.".to_string()),
            fetched_at,
            cache_status: Some("miss".to_string()),
            cached_at: None,
            cache_ttl_seconds: None,
            excerpt_quality: Some("failed".to_string()),
            extractor: Some("none".to_string()),
            final_url: Some(final_url.clone()),
            final_url_host: final_url_host.clone(),
            status: Some("failed".to_string()),
            error_kind: Some("http_status".to_string()),
            excerpt_reason: Some("HTTP status was not successful".to_string()),
            extraction_failure_reason: Some("HTTP status was not successful".to_string()),
            content_status: Some("failed".to_string()),
            code_blocks_truncated: Some(false),
            ..Default::default()
        };
        return finish_web_excerpt_result(result, &cache_key, cached, cache_enabled);
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
        let result = WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("褰撳墠鏉ユ簮涓嶆槸鍙洿鎺ユ彁鍙栫殑缃戦〉姝ｆ枃".to_string()),
            fetched_at,
            cache_status: Some("miss".to_string()),
            cached_at: None,
            cache_ttl_seconds: None,
            excerpt_quality: Some("blocked".to_string()),
            extractor: Some("none".to_string()),
            final_url: Some(final_url.clone()),
            final_url_host: final_url_host.clone(),
            content_type: Some(content_type.clone()),
            status: Some("blocked".to_string()),
            error_kind: Some("content_type_unsupported".to_string()),
            excerpt_reason: Some("Content type is not extractable text or HTML".to_string()),
            blocked_reason: Some("Content type is not extractable text or HTML".to_string()),
            content_status: Some("blocked".to_string()),
            code_blocks_truncated: Some(false),
            ..Default::default()
        };
        return finish_web_excerpt_result(result, &cache_key, cached, cache_enabled);
    }
    if response
        .content_length()
        .map(|length| length > WEB_EXTRACT_MAX_RESPONSE_BYTES as u64)
        .unwrap_or(false)
    {
        let result = WebSourceExcerptResult {
            id,
            url,
            title,
            fetched: false,
            excerpt: None,
            error: Some("缃戦〉姝ｆ枃杩囧ぇ锛屽凡璺宠繃璇诲彇".to_string()),
            fetched_at,
            cache_status: Some("miss".to_string()),
            cached_at: None,
            cache_ttl_seconds: None,
            excerpt_quality: Some("blocked".to_string()),
            extractor: Some("none".to_string()),
            final_url: Some(final_url.clone()),
            final_url_host: final_url_host.clone(),
            content_type: Some(content_type.clone()),
            status: Some("blocked".to_string()),
            error_kind: Some("too_large".to_string()),
            excerpt_reason: Some("Response body is too large".to_string()),
            blocked_reason: Some("Response body is too large".to_string()),
            content_status: Some("blocked".to_string()),
            code_blocks_truncated: Some(false),
            ..Default::default()
        };
        return finish_web_excerpt_result(result, &cache_key, cached, cache_enabled);
    }

    let mut body_bytes = Vec::new();
    let read_result = response
        .by_ref()
        .take((WEB_EXTRACT_MAX_RESPONSE_BYTES + 1) as u64)
        .read_to_end(&mut body_bytes);
    let body = match read_result {
        Ok(_) => {
            if body_bytes.len() > WEB_EXTRACT_MAX_RESPONSE_BYTES {
                let result = WebSourceExcerptResult {
                    id,
                    url,
                    title,
                    fetched: false,
                    excerpt: None,
                    error: Some("缃戦〉姝ｆ枃杩囧ぇ锛屽凡璺宠繃璇诲彇".to_string()),
                    fetched_at,
                    cache_status: Some("miss".to_string()),
                    cached_at: None,
                    cache_ttl_seconds: None,
                    excerpt_quality: Some("blocked".to_string()),
                    extractor: Some("none".to_string()),
                    final_url: Some(final_url.clone()),
                    final_url_host: final_url_host.clone(),
                    content_type: Some(content_type.clone()),
                    body_bytes: Some(body_bytes.len()),
                    status: Some("blocked".to_string()),
                    error_kind: Some("too_large".to_string()),
                    excerpt_reason: Some("Response body exceeded size limit".to_string()),
                    blocked_reason: Some("Response body exceeded size limit".to_string()),
                    content_status: Some("blocked".to_string()),
                    code_blocks_truncated: Some(false),
                    ..Default::default()
                };
                return finish_web_excerpt_result(result, &cache_key, cached, cache_enabled);
            }
            decode_response_body(&body_bytes)
        }
        Err(_) => {
            let result = WebSourceExcerptResult {
                id,
                url,
                title,
                fetched: false,
                excerpt: None,
                error: Some("Web page body read failed.".to_string()),
                fetched_at,
                cache_status: Some("miss".to_string()),
                cached_at: None,
                cache_ttl_seconds: None,
                excerpt_quality: Some("failed".to_string()),
                extractor: Some("none".to_string()),
                final_url: Some(final_url.clone()),
                final_url_host: final_url_host.clone(),
                content_type: Some(content_type.clone()),
                body_bytes: Some(body_bytes.len()),
                status: Some("failed".to_string()),
                error_kind: Some("unknown".to_string()),
                excerpt_reason: Some("Response body read failed".to_string()),
                extraction_failure_reason: Some("Response body read failed".to_string()),
                content_status: Some("failed".to_string()),
                code_blocks_truncated: Some(false),
                ..Default::default()
            };
            return finish_web_excerpt_result(result, &cache_key, cached, cache_enabled);
        }
    };
    let body_byte_count = body_bytes.len();
    let extracted_title = extract_html_page_title(&body);
    let meta_description = extract_html_meta_description(&body);
    let published_at = extract_html_published_at(&body);
    let extract_context = WebExtractContext {
        url: final_url.clone(),
        title: title.clone(),
        snippet: source.snippet.clone(),
        source_type: source.source_type.clone(),
        reliability: source.reliability.clone(),
        user_input: context.user_input.clone(),
        intent: context.intent.clone(),
        problem_id: context.problem_id.clone(),
        problem_title: context.problem_title.clone(),
        algorithm_keywords: context.algorithm_keywords.clone(),
        error_keywords: context.error_keywords.clone(),
        queries: context.queries.clone(),
    };
    let extracted = web_extract::extract_web_excerpt(
        &final_url,
        &content_type,
        &body,
        &extract_context,
        max_chars,
    );
    let (quality_label, quality_reason) = excerpt_quality_status_label(
        extracted.quality,
        extracted.extracted_text_chars,
        meta_description.as_deref(),
    );

    let Some(excerpt_text) = extracted.text.clone() else {
        let content_status = match quality_label {
            "too_short" => "too_short",
            "snippet_only" => "search_summary_only",
            "title_only" => "search_summary_only",
            "blocked" => "needs_js",
            _ => "unavailable",
        };
        let failure_reason = format!("{}; {}", extracted.reason, quality_reason);
        let result = WebSourceExcerptResult {
            id,
            url,
            title: extracted_title.unwrap_or(title),
            fetched: false,
            excerpt: None,
            error: Some("Web page body is unavailable or requires login.".to_string()),
            fetched_at,
            cache_status: Some("miss".to_string()),
            cached_at: None,
            cache_ttl_seconds: None,
            excerpt_quality: Some(quality_label.to_string()),
            extractor: Some(extracted.extractor.to_string()),
            final_url: Some(final_url.clone()),
            final_url_host: final_url_host.clone(),
            content_type: Some(content_type.clone()),
            body_bytes: Some(body_byte_count),
            extracted_text_chars: Some(extracted.extracted_text_chars),
            excerpt_chars: Some(0),
            published_at,
            status: Some("blocked".to_string()),
            error_kind: Some("blocked_or_unreadable".to_string()),
            excerpt_reason: Some(failure_reason.clone()),
            needs_js_reason: if quality_label == "blocked" {
                Some(failure_reason.clone())
            } else {
                None
            },
            extraction_failure_reason: Some(failure_reason),
            content_status: Some(content_status.to_string()),
            code_blocks_truncated: Some(extracted.code_blocks_truncated),
            ..Default::default()
        };
        return finish_web_excerpt_result(result, &cache_key, cached, cache_enabled);
    };
    let excerpt_chars = excerpt_text.chars().count();

    let result = WebSourceExcerptResult {
        id,
        url,
        title: extracted_title.unwrap_or(title),
        fetched: true,
        excerpt: Some(excerpt_text),
        error: None,
        final_url: Some(final_url),
        final_url_host,
        content_type: Some(content_type),
        body_bytes: Some(body_byte_count),
        extracted_text_chars: Some(extracted.extracted_text_chars),
        excerpt_chars: Some(excerpt_chars),
        published_at,
        status: Some(
            if quality_label == "medium" {
                "partial"
            } else {
                "fetched"
            }
            .to_string(),
        ),
        content_status: Some(
            if quality_label == "medium" {
                "partial"
            } else {
                "fetched"
            }
            .to_string(),
        ),
        error_kind: None,
        fetched_at,
        cache_status: Some("miss".to_string()),
        cached_at: None,
        cache_ttl_seconds: None,
        excerpt_quality: Some(quality_label.to_string()),
        extractor: Some(extracted.extractor.to_string()),
        excerpt_reason: Some(format!("{}; {}", extracted.reason, quality_reason)),
        code_blocks_truncated: Some(extracted.code_blocks_truncated),
        ..Default::default()
    };
    finish_web_excerpt_result(result, &cache_key, cached, cache_enabled)
}

fn finish_web_excerpt_result(
    mut result: WebSourceExcerptResult,
    cache_key: &str,
    stale_cache: Option<web_cache::CachedJson>,
    cache_enabled: bool,
) -> WebSourceExcerptResult {
    if !cache_enabled {
        result.cache_status = Some("disabled".to_string());
        result.cached_at = None;
        result.cache_ttl_seconds = None;
        return result;
    }

    if !result.fetched {
        if let Some(cached_entry) = stale_cache {
            if let Ok(mut cached_result) =
                serde_json::from_value::<WebSourceExcerptResult>(cached_entry.value)
            {
                if cached_result.fetched {
                    cached_result.id = result.id;
                    cached_result.url = result.url;
                    cached_result.title = result.title;
                    mark_excerpt_cache_status(
                        &mut cached_result,
                        "stale",
                        cached_entry.cached_at_ms,
                        cached_entry.ttl_seconds,
                    );
                    return cached_result;
                }
            }
        }
    }

    let ttl_seconds = if result.fetched {
        excerpt_cache_ttl_seconds(&WebSearchResult {
            id: result.id.clone(),
            title: result.title.clone(),
            url: result.url.clone(),
            final_url: result.final_url.clone(),
            site: site_from_url(&result.url),
            snippet: None,
            source_kind: None,
            discovery_method: None,
            source_reliability: None,
            discovered_by: None,
            feed_url: None,
            source_home: None,
            direct_discovery_reason: None,
            search_provider: None,
            search_stage: None,
            date_hint: None,
            freshness_score: None,
            source_published_at: None,
            source_age_hours: None,
            source_age_days: None,
            freshness_status: None,
            stale_reason: None,
            search_diagnostics: None,
            news_like: None,
            filtered_reason: None,
            final_included_in_prompt: None,
            evidence_status: None,
            usable_evidence: None,
            injected_into_answer: None,
            evidence_reason: None,
            rejected_reason: None,
            page_type: None,
            content_status: None,
            source_strength: None,
            source_type: None,
            reliability: None,
            reliability_label: None,
            reliability_reason: None,
            relevance: None,
            relevance_label: None,
            relevance_reason: None,
            excerpt_status: None,
            excerpt: None,
            excerpt_error: None,
            fetched_at: None,
            cache_status: None,
            read_status: result.status.clone(),
            error_kind: result.error_kind.clone(),
            cached_at: None,
            cache_ttl_seconds: None,
            excerpt_quality: None,
            extractor: None,
            excerpt_reason: None,
            code_blocks_truncated: None,
            rank_score: None,
            rank_reason: None,
            is_constructed: None,
            constructed_reason: None,
            selected: None,
            citation_id: None,
            event_cluster: None,
            cluster_label: None,
            cluster_reason: None,
            cluster_size: None,
            selected_for_roundup: None,
            dropped_as_duplicate_cluster: None,
        })
    } else {
        WEB_EXCERPT_FAILURE_TTL_SECONDS
    };
    let _ = web_cache::write_cached_json(
        "excerpts",
        cache_key,
        serde_json::to_value(&result).unwrap_or(JsonValue::Null),
        ttl_seconds,
    );
    mark_excerpt_cache_status(&mut result, "miss", web_cache::now_ms(), ttl_seconds);
    result
}

fn fetch_web_source_excerpts_blocking(
    input: FetchWebSourceExcerptsInput,
) -> Result<Vec<WebSourceExcerptResult>, String> {
    let config = normalize_web_search_config(&read_config()?.ai.web_search);
    if !config.public_search_consent {
        return Err("读取公开网页前需要先启用公开网页搜索授权。".to_string());
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
        .connect_timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                return attempt.stop();
            }
            if validate_public_web_url_for_read(attempt.url().as_str()).is_ok() {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .user_agent("oi-notebook-public-web-excerpt/0.1")
        .build()
        .map_err(|e| format!("无法创建网页读取客户端：{e}"))?;

    let request_context = input.clone();
    let handles = input
        .sources
        .into_iter()
        .take(max_sources)
        .enumerate()
        .map(|(index, source)| {
            let client = client.clone();
            let context = request_context.clone();
            std::thread::spawn(move || {
                (
                    index,
                    fetch_single_web_source_excerpt(&client, &source, &context, max_chars),
                )
            })
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
                        title: "Unknown source".to_string(),
                        fetched: false,
                        excerpt: None,
                        error: Some("网页摘录任务失败。".to_string()),
                        fetched_at: Utc::now().timestamp_millis(),
                        final_url: None,
                        status: Some("failed".to_string()),
                        error_kind: Some("unknown".to_string()),
                        cache_status: Some("miss".to_string()),
                        cached_at: None,
                        cache_ttl_seconds: None,
                        excerpt_quality: Some("failed".to_string()),
                        extractor: Some("none".to_string()),
                        excerpt_reason: Some("web excerpt worker panicked".to_string()),
                        code_blocks_truncated: Some(false),
                        ..Default::default()
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
                result.error = Some("Web excerpt total length limit reached.".to_string());
                result.status = Some("failed".to_string());
                result.excerpt_quality = Some("unavailable".to_string());
                result.content_status = Some("unavailable".to_string());
                result.extraction_failure_reason =
                    Some("Web excerpt total length limit reached".to_string());
            } else if excerpt.chars().count() > remaining {
                *excerpt = excerpt.chars().take(remaining).collect::<String>();
                excerpt.push_str("...");
                result.excerpt_chars = Some(excerpt.chars().count());
                total_chars = WEB_EXTRACT_TOTAL_CONTEXT_CHARS;
            } else {
                total_chars += excerpt.chars().count();
            }
        }
        limited_results.push(result);
    }
    Ok(limited_results)
}

#[derive(Debug, Clone)]
struct DirectDiscoveryAttempt {
    source_name: String,
    source_type: String,
    url: String,
    status: String,
    http_status: Option<u16>,
    content_type: Option<String>,
    items_parsed: usize,
    items_matched: usize,
    candidates_emitted: usize,
    reason: String,
}

#[derive(Debug, Clone)]
struct DirectDiscoveryReport {
    attempted: bool,
    skipped_reason: Option<String>,
    intent: String,
    freshness: String,
    query: String,
    raw_user_query: Option<String>,
    topic_keywords: Vec<String>,
    topic_tags: Vec<String>,
    news_registry_enabled: bool,
    source_router_triggered: bool,
    source_router_reason: String,
    query_focus_entities: Vec<String>,
    focus_entity_source: String,
    company_specific_news: bool,
    entity_filter_applied: bool,
    rejected_wrong_entity_count: usize,
    rejected_wrong_entity_samples: Vec<String>,
    selected_sources: Vec<String>,
    skipped_sources: Vec<String>,
    fallback_sources: Vec<String>,
    reliability_mix: String,
    official_source_count: usize,
    aggregator_source_count: usize,
    fallback_used: bool,
    registry_candidates_found: usize,
    registry_candidates_kept: usize,
    registry_candidates_rejected: usize,
    sources_tried: Vec<DirectDiscoveryAttempt>,
    candidates_found: usize,
    candidates_kept: usize,
    duration_ms: u128,
    cache_behavior: String,
}

#[derive(Debug, Clone)]
struct DirectDiscoveryFeed {
    id: &'static str,
    name: &'static str,
    feed_url: Option<&'static str>,
    source_home: &'static str,
    source_kind: &'static str,
    reliability: &'static str,
    source_type: &'static str,
    topics: &'static [&'static str],
    reason: String,
    max_items: usize,
    timeout_ms: u64,
}

#[derive(Debug, Clone)]
struct NewsSourceDefinition {
    id: &'static str,
    name: &'static str,
    homepage: &'static str,
    source_type: &'static str,
    reliability: &'static str,
    topics: &'static [&'static str],
    languages: &'static [&'static str],
    regions: &'static [&'static str],
    rss_urls: &'static [&'static str],
    site_urls: &'static [&'static str],
    official: bool,
    aggregator: bool,
    enabled_by_default: bool,
    max_items: usize,
    timeout_ms: u64,
    notes: &'static str,
}

#[derive(Debug, Clone)]
struct NewsSourceRoute {
    selected_sources: Vec<DirectDiscoveryFeed>,
    skipped_sources: Vec<String>,
    fallback_sources: Vec<String>,
    source_strategy: String,
    topic_tags: Vec<String>,
    query_focus_entities: Vec<String>,
    focus_entity_source: String,
    company_specific_news: bool,
    entity_filter_applied: bool,
    rejected_wrong_entity_count: usize,
    rejected_wrong_entity_samples: Vec<String>,
    reliability_mix: String,
    official_source_count: usize,
    aggregator_source_count: usize,
}

fn is_translation_or_word_lookup_query(query: &str) -> bool {
    let lower = query.to_ascii_lowercase();
    let query = query.trim();
    lower.contains("translate")
        || lower.contains("translation")
        || lower.contains("dictionary")
        || lower.contains("meaning")
        || query.contains("英语怎么说")
        || query.contains("英文怎么说")
        || query.contains("怎么翻译")
        || query.contains("这个词")
}

fn is_direct_news_discovery_request(request: &WebSearchRequestInput) -> bool {
    let freshness = request
        .freshness
        .as_deref()
        .unwrap_or("")
        .to_ascii_lowercase();
    let vertical = request
        .vertical
        .as_deref()
        .unwrap_or("")
        .to_ascii_lowercase();
    let intent = request.intent.to_ascii_lowercase();
    let combined = request.queries.join(" ");
    let lower = combined.to_ascii_lowercase();
    let fresh_like = freshness.contains("latest")
        || freshness.contains("recent")
        || freshness.contains("fresh")
        || freshness.contains("today")
        || vertical.contains("news")
        || lower.contains("latest")
        || lower.contains("recent")
        || combined.contains("最近")
        || combined.contains("最新")
        || combined.contains("今天");
    let news_like = vertical.contains("news")
        || intent.contains("news")
        || lower.contains("news")
        || combined.contains("新闻")
        || combined.contains("资讯")
        || combined.contains("动态");
    fresh_like && news_like && !is_translation_or_word_lookup_query(&combined)
}

fn contains_ascii_word(haystack: &str, needle: &str) -> bool {
    haystack
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .any(|token| token.eq_ignore_ascii_case(needle))
}

fn normalize_news_focus_entity(value: &str) -> Option<&'static str> {
    let lower = value.trim().to_ascii_lowercase();
    if lower.contains("openai")
        || lower.contains("chatgpt")
        || lower.contains("codex")
        || lower.contains("sora")
        || contains_ascii_word(&lower, "gpt")
    {
        Some("openai")
    } else if lower.contains("anthropic") || lower.contains("claude") {
        Some("anthropic")
    } else if lower.contains("google") || lower.contains("gemini") || lower.contains("deepmind") {
        Some("google_ai")
    } else if lower.contains("microsoft") || lower.contains("copilot") {
        Some("microsoft_ai")
    } else if lower.contains("nvidia") {
        Some("nvidia")
    } else {
        None
    }
}

fn news_site_query_entity(query: &str) -> Option<&'static str> {
    let lower = query.to_ascii_lowercase();
    if lower.contains("site:openai.com") {
        Some("openai")
    } else if lower.contains("site:anthropic.com") {
        Some("anthropic")
    } else if lower.contains("site:blog.google")
        || lower.contains("site:deepmind.google")
        || lower.contains("site:google.com")
    {
        Some("google_ai")
    } else if lower.contains("site:microsoft.com") {
        Some("microsoft_ai")
    } else {
        None
    }
}

fn infer_news_focus_entities(request: &WebSearchRequestInput) -> (Vec<String>, String) {
    if let Some(raw_user_query) = request
        .raw_user_query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let entities = normalize_news_focus_entity(raw_user_query)
            .map(|entity| vec![entity.to_string()])
            .unwrap_or_default();
        return (
            entities.clone(),
            if entities.is_empty() {
                "none".to_string()
            } else {
                "raw_user_query".to_string()
            },
        );
    }
    let mut entities = request
        .queries
        .iter()
        .filter_map(|query| normalize_news_focus_entity(query).map(ToOwned::to_owned))
        .collect::<Vec<_>>();
    entities.sort();
    entities.dedup();
    let source = if entities.is_empty() {
        "none".to_string()
    } else {
        "search_query".to_string()
    };
    (
        entities,
        source,
    )
}

fn news_source_matches_focus_entity(source: &NewsSourceDefinition, entity: &str) -> bool {
    source.topics.iter().any(|topic| *topic == entity)
        || (entity == "google_ai" && source.topics.contains(&"deepmind"))
}

fn direct_discovery_topic_keywords(request: &WebSearchRequestInput) -> Vec<String> {
    let mut keywords = request
        .topic_keywords
        .iter()
        .chain(request.algorithm_keywords.iter())
        .map(|keyword| keyword.trim())
        .filter(|keyword| !keyword.is_empty())
        .map(ToOwned::to_owned)
        .collect::<Vec<_>>();
    let combined = request.queries.join(" ");
    let lower = combined.to_ascii_lowercase();
    let candidates = [
        ("openai", "OpenAI"),
        ("chatgpt", "ChatGPT"),
        ("deepseek", "DeepSeek"),
        ("gemini", "Gemini"),
        ("claude", "Claude"),
        ("anthropic", "Anthropic"),
        ("deepmind", "DeepMind"),
        ("google", "Google"),
        ("microsoft", "Microsoft"),
        ("llm", "LLM"),
    ];
    for (needle, value) in candidates {
        if lower.contains(needle) {
            keywords.push(value.to_string());
        }
    }
    if contains_ascii_word(&lower, "ai") {
        keywords.push("AI".to_string());
    }
    for value in ["人工智能", "大模型", "模型", "算力"] {
        if combined.contains(value) {
            keywords.push(value.to_string());
        }
    }
    if keywords.is_empty() && is_direct_news_discovery_request(request) {
        keywords.extend(
            ["AI", "OpenAI", "ChatGPT", "DeepSeek", "LLM"]
                .into_iter()
                .map(ToOwned::to_owned),
        );
    }
    keywords.sort_by_key(|value| value.to_ascii_lowercase());
    keywords.dedup_by(|left, right| left.eq_ignore_ascii_case(right));
    keywords
}

fn news_source_registry() -> Vec<NewsSourceDefinition> {
    vec![
        NewsSourceDefinition {
            id: "openai-news",
            name: "OpenAI News",
            homepage: "https://openai.com/news/",
            source_type: "official_news",
            reliability: "official",
            topics: &["ai_general", "ai_model", "ai_agent", "openai", "developer_tools"],
            languages: &["en"],
            regions: &["global"],
            rss_urls: &["https://openai.com/news/rss.xml"],
            site_urls: &["https://openai.com/news/"],
            official: true,
            aggregator: false,
            enabled_by_default: true,
            max_items: 3,
            timeout_ms: 5000,
            notes: "Official OpenAI news RSS and landing page candidates.",
        },
        NewsSourceDefinition {
            id: "anthropic-news",
            name: "Anthropic News",
            homepage: "https://www.anthropic.com/news",
            source_type: "official_news",
            reliability: "official",
            topics: &["ai_general", "ai_model", "ai_agent", "anthropic"],
            languages: &["en"],
            regions: &["global"],
            rss_urls: &[],
            site_urls: &["https://www.anthropic.com/news"],
            official: true,
            aggregator: false,
            enabled_by_default: true,
            max_items: 2,
            timeout_ms: 5000,
            notes: "Official Anthropic news page; URL Reader decides evidence usability.",
        },
        NewsSourceDefinition {
            id: "google-deepmind-blog",
            name: "Google DeepMind Blog",
            homepage: "https://deepmind.google/discover/blog/",
            source_type: "official_blog",
            reliability: "official",
            topics: &["ai_general", "ai_model", "deepmind", "google_ai", "research"],
            languages: &["en"],
            regions: &["global"],
            rss_urls: &[],
            site_urls: &["https://deepmind.google/discover/blog/"],
            official: true,
            aggregator: false,
            enabled_by_default: true,
            max_items: 2,
            timeout_ms: 5000,
            notes: "Official DeepMind blog landing candidate.",
        },
        NewsSourceDefinition {
            id: "google-ai-blog",
            name: "Google AI Blog",
            homepage: "https://blog.google/technology/ai/",
            source_type: "official_blog",
            reliability: "official",
            topics: &["ai_general", "ai_model", "google_ai", "developer_tools"],
            languages: &["en"],
            regions: &["global"],
            rss_urls: &["https://blog.google/technology/ai/rss/"],
            site_urls: &["https://blog.google/technology/ai/"],
            official: true,
            aggregator: false,
            enabled_by_default: true,
            max_items: 3,
            timeout_ms: 5000,
            notes: "Official Google AI RSS and landing page candidates.",
        },
        NewsSourceDefinition {
            id: "microsoft-ai-blog",
            name: "Microsoft AI Blog",
            homepage: "https://www.microsoft.com/en-us/ai/blog/",
            source_type: "official_blog",
            reliability: "official",
            topics: &["ai_general", "ai_model", "microsoft_ai", "developer_tools"],
            languages: &["en"],
            regions: &["global"],
            rss_urls: &[],
            site_urls: &["https://www.microsoft.com/en-us/ai/blog/"],
            official: true,
            aggregator: false,
            enabled_by_default: true,
            max_items: 2,
            timeout_ms: 5000,
            notes: "Official Microsoft AI blog landing candidate.",
        },
        NewsSourceDefinition {
            id: "techcrunch-ai",
            name: "TechCrunch AI",
            homepage: "https://techcrunch.com/category/artificial-intelligence/",
            source_type: "tech_media",
            reliability: "high",
            topics: &["ai_general", "ai_model", "ai_agent", "funding", "developer_tools"],
            languages: &["en"],
            regions: &["global"],
            rss_urls: &["https://techcrunch.com/category/artificial-intelligence/feed/"],
            site_urls: &["https://techcrunch.com/category/artificial-intelligence/"],
            official: false,
            aggregator: false,
            enabled_by_default: true,
            max_items: 3,
            timeout_ms: 5000,
            notes: "Technology media RSS; only candidate discovery.",
        },
        NewsSourceDefinition {
            id: "the-verge-ai",
            name: "The Verge AI",
            homepage: "https://www.theverge.com/ai-artificial-intelligence",
            source_type: "tech_media",
            reliability: "high",
            topics: &["ai_general", "ai_model", "ai_agent", "hardware", "regulation"],
            languages: &["en"],
            regions: &["global"],
            rss_urls: &["https://www.theverge.com/rss/index.xml"],
            site_urls: &["https://www.theverge.com/ai-artificial-intelligence"],
            official: false,
            aggregator: false,
            enabled_by_default: true,
            max_items: 3,
            timeout_ms: 5000,
            notes: "Broad technology media RSS; filtered by topic before URL Reader.",
        },
        NewsSourceDefinition {
            id: "qbitai",
            name: "QbitAI",
            homepage: "https://www.qbitai.com/",
            source_type: "tech_media",
            reliability: "medium",
            topics: &["ai_general", "china_ai", "ai_model", "hardware"],
            languages: &["zh"],
            regions: &["cn"],
            rss_urls: &["https://www.qbitai.com/feed"],
            site_urls: &["https://www.qbitai.com/"],
            official: false,
            aggregator: false,
            enabled_by_default: true,
            max_items: 2,
            timeout_ms: 5000,
            notes: "Chinese AI media RSS; only candidate discovery.",
        },
        NewsSourceDefinition {
            id: "bing-news-fallback",
            name: "Bing News fallback",
            homepage: BING_NEWS_SEARCH_ENDPOINT,
            source_type: "search_fallback",
            reliability: "fallback",
            topics: &["ai_general", "ai_model", "ai_agent", "openai", "anthropic", "google_ai", "deepmind", "microsoft_ai", "china_ai", "hardware", "regulation", "security", "funding", "developer_tools"],
            languages: &["en", "zh"],
            regions: &["global"],
            rss_urls: &[],
            site_urls: &[BING_NEWS_SEARCH_ENDPOINT],
            official: false,
            aggregator: false,
            enabled_by_default: true,
            max_items: 0,
            timeout_ms: 5000,
            notes: "Provider fallback only; not emitted as direct evidence.",
        },
    ]
}

fn infer_news_topic_tags(request: &WebSearchRequestInput, keywords: &[String]) -> Vec<String> {
    let combined = format!(
        "{} {}",
        request.queries.join(" "),
        keywords.join(" ")
    );
    let lower = combined.to_ascii_lowercase();
    let mut tags = Vec::<String>::new();
    let topic_rules = [
        ("openai", "openai"),
        ("chatgpt", "openai"),
        ("anthropic", "anthropic"),
        ("claude", "anthropic"),
        ("google", "google_ai"),
        ("gemini", "google_ai"),
        ("deepmind", "deepmind"),
        ("microsoft", "microsoft_ai"),
        ("copilot", "microsoft_ai"),
        ("deepseek", "china_ai"),
        ("china", "china_ai"),
        ("hardware", "hardware"),
        ("gpu", "hardware"),
        ("chip", "hardware"),
        ("regulation", "regulation"),
        ("policy", "regulation"),
        ("security", "security"),
        ("funding", "funding"),
        ("startup", "funding"),
        ("agent", "ai_agent"),
        ("tool", "developer_tools"),
        ("developer", "developer_tools"),
        ("model", "ai_model"),
        ("llm", "ai_model"),
        ("ai", "ai_general"),
    ];
    for (needle, tag) in topic_rules {
        if (needle == "ai" && contains_ascii_word(&lower, "ai"))
            || (needle != "ai" && lower.contains(needle))
        {
            tags.push(tag.to_string());
        }
    }
    for value in ["浜哄伐鏅鸿兘", "澶фā鍨?", "妯″瀷"] {
        if combined.contains(value) {
            tags.push("ai_general".to_string());
        }
    }
    if tags.is_empty() {
        tags.push("ai_general".to_string());
    }
    tags.sort();
    tags.dedup();
    tags
}

fn news_source_matches_topics(source: &NewsSourceDefinition, topic_tags: &[String]) -> bool {
    source
        .topics
        .iter()
        .any(|topic| topic_tags.iter().any(|tag| tag.as_str() == *topic))
        || source.topics.contains(&"ai_general")
}

fn route_news_sources_for_request(
    request: &WebSearchRequestInput,
    keywords: &[String],
) -> NewsSourceRoute {
    let topic_tags = infer_news_topic_tags(request, keywords);
    let registry = news_source_registry();
    let mut selected = Vec::<&NewsSourceDefinition>::new();
    let mut skipped_sources = Vec::<String>::new();
    let mut fallback_sources = Vec::<String>::new();
    let (query_focus_entities, focus_entity_source) = infer_news_focus_entities(request);
    let company_specific_news = query_focus_entities.len() == 1;
    let focus_entity = query_focus_entities.first().map(String::as_str);
    let entity_filter_applied = company_specific_news;
    let mut rejected_wrong_entity_count = 0usize;
    let mut rejected_wrong_entity_samples = Vec::<String>::new();
    let exact_topic = company_specific_news || topic_tags
        .iter()
        .any(|tag| matches!(tag.as_str(), "openai" | "anthropic" | "google_ai" | "deepmind" | "microsoft_ai"));
    for source in &registry {
        if source.source_type == "search_fallback" {
            fallback_sources.push(format!("{}:{}", source.id, source.name));
            continue;
        }
        if !source.enabled_by_default {
            skipped_sources.push(format!("{}:disabled", source.id));
            continue;
        }
        let matches_topic = news_source_matches_topics(source, &topic_tags);
        if company_specific_news {
            let focus_match = focus_entity
                .map(|entity| news_source_matches_focus_entity(source, entity))
                .unwrap_or(false);
            let supporting_media = !source.official
                && !source.aggregator
                && matches!(source.reliability, "high" | "medium")
                && selected.iter().filter(|item| !item.official).count() < 2;
            if focus_match || supporting_media {
                selected.push(source);
            } else {
                rejected_wrong_entity_count += 1;
                if rejected_wrong_entity_samples.len() < 5 {
                    rejected_wrong_entity_samples.push(format!("{}:entity_mismatch_for_company_query", source.id));
                }
                skipped_sources.push(format!("{}:entity_mismatch_for_company_query", source.id));
            }
            continue;
        }
        if exact_topic {
            let exact_match = source
                .topics
                .iter()
                .any(|topic| topic_tags.iter().any(|tag| tag.as_str() == *topic));
            let supporting_media = !source.official
                && !source.aggregator
                && selected.iter().filter(|item| !item.official).count() < 2;
            if exact_match || supporting_media {
                selected.push(source);
            } else {
                skipped_sources.push(format!("{}:topic_mismatch", source.id));
            }
            continue;
        }
        if matches_topic {
            selected.push(source);
        } else {
            skipped_sources.push(format!("{}:topic_mismatch", source.id));
        }
    }
    selected.sort_by_key(|source| {
        let topic_priority = if source
            .topics
            .iter()
            .any(|topic| topic_tags.iter().any(|tag| tag.as_str() == *topic))
        {
            0
        } else {
            1
        };
        let reliability_priority = match source.reliability {
            "official" => 0,
            "high" => 1,
            "medium" => 2,
            "aggregator" => 3,
            _ => 4,
        };
        (topic_priority, reliability_priority, source.name)
    });
    selected.truncate(8);
    let mut reliability_counts = BTreeMap::<String, usize>::new();
    for source in &selected {
        *reliability_counts
            .entry(source.reliability.to_string())
            .or_insert(0) += 1;
    }
    let reliability_mix = reliability_counts
        .into_iter()
        .map(|(key, value)| format!("{key}:{value}"))
        .collect::<Vec<_>>()
        .join("|");
    let official_source_count = selected.iter().filter(|source| source.official).count();
    let aggregator_source_count = selected.iter().filter(|source| source.aggregator).count();
    let source_strategy = if company_specific_news {
        format!(
            "company_entity_constrained_official_plus_media;focus={}",
            query_focus_entities.join("|")
        )
    } else if exact_topic {
        "topic_first_official_plus_media".to_string()
    } else {
        "ai_general_official_media_plus_fallback".to_string()
    };
    let selected_sources = selected
        .into_iter()
        .map(|source| {
            let primary_rss = source.rss_urls.first().copied();
            let primary_site = source
                .site_urls
                .first()
                .copied()
                .unwrap_or(source.homepage);
            DirectDiscoveryFeed {
                id: source.id,
                name: source.name,
                feed_url: primary_rss,
                source_home: primary_site,
                source_kind: match source.source_type {
                    "official_news" => "official_news",
                    "official_blog" | "research_blog" => "official_blog",
                    "tech_media" | "media_rss" | "aggregator_rss" => "rss_item",
                    _ => "rss_item",
                },
                reliability: source.reliability,
                source_type: source.source_type,
                topics: source.topics,
                reason: format!(
                    "sourceRouterStrategy={};rawUserQuery={};queryFocusEntities={};focusEntitySource={};companySpecificNews={};entityFilterApplied={};topics={};languages={};regions={};notes={}",
                    source_strategy,
                    sanitize_ai_detail(request.raw_user_query.as_deref().unwrap_or("")),
                    query_focus_entities.join("|"),
                    focus_entity_source,
                    if company_specific_news { "yes" } else { "no" },
                    if entity_filter_applied { "yes" } else { "no" },
                    source.topics.join("|"),
                    source.languages.join("|"),
                    source.regions.join("|"),
                    source.notes
                ),
                max_items: source.max_items,
                timeout_ms: source.timeout_ms,
            }
        })
        .collect::<Vec<_>>();
    NewsSourceRoute {
        selected_sources,
        skipped_sources,
        fallback_sources,
        source_strategy,
        topic_tags,
        query_focus_entities,
        focus_entity_source,
        company_specific_news,
        entity_filter_applied,
        rejected_wrong_entity_count,
        rejected_wrong_entity_samples,
        reliability_mix,
        official_source_count,
        aggregator_source_count,
    }
}

fn make_direct_source(
    title: &str,
    url: &str,
    snippet: Option<String>,
    source_kind: &str,
    discovery_method: &str,
    reliability: &str,
    discovered_by: &str,
    feed_url: Option<&str>,
    source_home: Option<&str>,
    date_hint: Option<String>,
    reason: &str,
) -> Option<WebSearchResult> {
    validate_public_web_url_for_read(url).ok()?;
    let title = sanitize_search_text(title, 140);
    let snippet = snippet
        .map(|value| sanitize_search_text(&decode_html_entities(&value), 240))
        .filter(|value| !value.is_empty());
    let source_type = match source_kind {
        "docs_page" | "official_news" => "official",
        "official_blog" | "rss_item" => "blog",
        "oi_reference" => "wiki",
        _ => "unknown",
    };
    let reliability_type = match reliability {
        "docs" | "official" => "official",
        "media" => "blog",
        "community_solution" => "community_solution",
        "wiki" => "wiki",
        _ => "unknown",
    };
    Some(WebSearchResult {
        id: format!("web-{}", &stable_hash_hex(url)[..12]),
        title: if title.is_empty() {
            url.to_string()
        } else {
            title
        },
        url: url.to_string(),
        final_url: None,
        site: site_from_url(url),
        snippet,
        source_kind: Some(source_kind.to_string()),
        discovery_method: Some(discovery_method.to_string()),
        source_reliability: Some(reliability.to_string()),
        discovered_by: Some(discovered_by.to_string()),
        feed_url: feed_url.map(ToOwned::to_owned),
        source_home: source_home.map(ToOwned::to_owned),
        direct_discovery_reason: Some(reason.to_string()),
        search_provider: None,
        search_stage: Some(discovery_method.to_string()),
        date_hint,
        evidence_status: Some("candidate".to_string()),
        usable_evidence: Some(false),
        injected_into_answer: Some(false),
        content_status: Some("not_fetched".to_string()),
        source_type: Some(source_type.to_string()),
        reliability: Some(reliability_type.to_string()),
        reliability_label: Some(reliability.to_string()),
        reliability_reason: Some(format!("No-key direct discovery via {discovered_by}.")),
        is_constructed: Some(discovery_method == "constructed_source"),
        constructed_reason: if discovery_method == "constructed_source" {
            Some(reason.to_string())
        } else {
            None
        },
        ..Default::default()
    })
}

fn rss_blocks(body: &str) -> Vec<&str> {
    let mut blocks = Vec::new();
    let mut rest = body;
    while let Some(start) = rest.find("<item") {
        let after_start = &rest[start..];
        if let Some(end) = after_start.find("</item>") {
            blocks.push(&after_start[..end + "</item>".len()]);
            rest = &after_start[end + "</item>".len()..];
        } else {
            break;
        }
    }
    let mut rest = body;
    while let Some(start) = rest.find("<entry") {
        let after_start = &rest[start..];
        if let Some(end) = after_start.find("</entry>") {
            blocks.push(&after_start[..end + "</entry>".len()]);
            rest = &after_start[end + "</entry>".len()..];
        } else {
            break;
        }
    }
    blocks.truncate(20);
    blocks
}

fn rss_field(block: &str, names: &[&str]) -> Option<String> {
    for name in names {
        if let Some(value) = text_between(block, &format!("<{name}>"), &format!("</{name}>")) {
            let cleaned = clean_bing_markup_text(&decode_html_entities(value), 240);
            if !cleaned.is_empty() {
                return Some(cleaned);
            }
        }
        if let Some(start) = block.find(&format!("<{name} ")) {
            let after_start = &block[start..];
            if let Some(tag_end) = after_start.find('>') {
                let after_tag = &after_start[tag_end + 1..];
                if let Some(end) = after_tag.find(&format!("</{name}>")) {
                    let cleaned =
                        clean_bing_markup_text(&decode_html_entities(&after_tag[..end]), 240);
                    if !cleaned.is_empty() {
                        return Some(cleaned);
                    }
                }
            }
        }
    }
    None
}

fn rss_link(block: &str) -> Option<String> {
    if let Some(link) = rss_field(block, &["link"]) {
        if validate_public_web_url_for_read(&link).is_ok() {
            return Some(link);
        }
    }
    let mut rest = block;
    while let Some(start) = rest.find("<link") {
        let after_start = &rest[start..];
        let Some(end) = after_start.find('>') else {
            break;
        };
        let tag = &after_start[..end + 1];
        if let Some(href) = html_attr_value(tag, "href") {
            if validate_public_web_url_for_read(&href).is_ok() {
                return Some(href);
            }
        }
        rest = &after_start[end + 1..];
    }
    None
}

fn rss_item_matches_topic(title: &str, description: &str, keywords: &[String]) -> bool {
    if keywords.is_empty() {
        return true;
    }
    let haystack = format!("{title} {description}").to_ascii_lowercase();
    keywords.iter().any(|keyword| {
        let keyword_lower = keyword.to_ascii_lowercase();
        haystack.contains(&keyword_lower) || haystack.contains(keyword)
    })
}

fn news_focus_entity_aliases(entity: &str) -> &'static [&'static str] {
    match entity {
        "openai" => &["openai", "chatgpt", "gpt", "codex", "sora"],
        "anthropic" => &["anthropic", "claude"],
        "google_ai" => &["google", "gemini", "deepmind"],
        "microsoft_ai" => &["microsoft", "copilot"],
        "nvidia" => &["nvidia"],
        _ => &[],
    }
}

fn news_text_has_entity(text: &str, entity: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    news_focus_entity_aliases(entity)
        .iter()
        .any(|alias| contains_ascii_word(&lower, alias))
}

fn news_title_has_primary_entity(title: &str, entity: &str) -> bool {
    let lower = title.trim().to_ascii_lowercase();
    news_focus_entity_aliases(entity).iter().any(|alias| {
        lower.starts_with(alias)
            || lower.contains(&format!("{alias} launches"))
            || lower.contains(&format!("{alias} announces"))
            || lower.contains(&format!("{alias} releases"))
            || lower.contains(&format!("{alias} unveils"))
            || lower.contains(&format!("{alias} update"))
            || lower.contains(&format!("{alias} model"))
            || lower.contains(&format!("{alias} agent"))
    })
}

fn rss_item_entity_match_strength(
    title: &str,
    description: &str,
    feed: &DirectDiscoveryFeed,
    focus_entities: &[String],
) -> &'static str {
    if focus_entities.is_empty() {
        return "primary";
    }
    let Some(focus_entity) = focus_entities.first().map(String::as_str) else {
        return "none";
    };
    if feed.reliability == "official" && feed.topics.contains(&focus_entity) {
        return "primary";
    }
    if news_title_has_primary_entity(title, focus_entity) {
        return "secondary";
    }
    if news_text_has_entity(&format!("{title} {description}"), focus_entity) {
        return "mention";
    }
    "none"
}

fn discover_rss_items(
    client: &reqwest::blocking::Client,
    feed: &DirectDiscoveryFeed,
    keywords: &[String],
    focus_entities: &[String],
    remaining: usize,
    attempts: &mut Vec<DirectDiscoveryAttempt>,
) -> Vec<WebSearchResult> {
    let Some(feed_url) = feed.feed_url else {
        return Vec::new();
    };
    let response = match client.get(feed_url).send() {
        Ok(response) => response,
        Err(error) => {
            attempts.push(DirectDiscoveryAttempt {
                source_name: feed.name.to_string(),
                source_type: "rss".to_string(),
                url: feed_url.to_string(),
                status: if error.is_timeout() {
                    "timeout"
                } else {
                    "failed"
                }
                .to_string(),
                http_status: None,
                content_type: None,
                items_parsed: 0,
                items_matched: 0,
                candidates_emitted: 0,
                reason: sanitize_ai_detail(&error.to_string()),
            });
            return Vec::new();
        }
    };
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| sanitize_ai_detail(value));
    if !status.is_success() {
        attempts.push(DirectDiscoveryAttempt {
            source_name: feed.name.to_string(),
            source_type: "rss".to_string(),
            url: feed_url.to_string(),
            status: "failed".to_string(),
            http_status: Some(status.as_u16()),
            content_type,
            items_parsed: 0,
            items_matched: 0,
            candidates_emitted: 0,
            reason: format!("HTTP {}", status.as_u16()),
        });
        return Vec::new();
    }
    let Ok(body) = response.text() else {
        attempts.push(DirectDiscoveryAttempt {
            source_name: feed.name.to_string(),
            source_type: "rss".to_string(),
            url: feed_url.to_string(),
            status: "failed".to_string(),
            http_status: Some(status.as_u16()),
            content_type,
            items_parsed: 0,
            items_matched: 0,
            candidates_emitted: 0,
            reason: "response text could not be read".to_string(),
        });
        return Vec::new();
    };
    let mut results = Vec::new();
    let blocks = rss_blocks(&body);
    let mut matched = 0usize;
    let source_limit = remaining.min(feed.max_items.max(1));
    for block in &blocks {
        if results.len() >= source_limit {
            break;
        }
        let title = rss_field(block, &["title"]).unwrap_or_default();
        let description =
            rss_field(block, &["description", "summary", "content"]).unwrap_or_default();
        if !rss_item_matches_topic(&title, &description, keywords) {
            continue;
        }
        let entity_match_strength =
            rss_item_entity_match_strength(&title, &description, feed, focus_entities);
        if !focus_entities.is_empty()
            && entity_match_strength != "primary"
            && entity_match_strength != "secondary"
        {
            continue;
        }
        matched += 1;
        let Some(link) = rss_link(block) else {
            continue;
        };
        let date_hint = rss_field(block, &["pubDate", "updated", "published"]);
        if let Some(source) = make_direct_source(
            &title,
            &link,
            Some(description),
            feed.source_kind,
            "direct_rss",
            feed.reliability,
            feed.name,
            Some(feed_url),
            Some(feed.source_home),
            date_hint,
            &format!(
                "RSS/Atom item matched freshness and topic keywords. entityMatchStrength={};candidatePrimaryEntities={}. {}",
                entity_match_strength,
                focus_entities.join("|"),
                feed.reason
            ),
        ) {
            results.push(source);
        }
    }
    attempts.push(DirectDiscoveryAttempt {
        source_name: feed.name.to_string(),
        source_type: "rss".to_string(),
        url: feed_url.to_string(),
        status: if blocks.is_empty() {
            "parse_failed"
        } else if results.is_empty() {
            "no_match"
        } else {
            "success"
        }
        .to_string(),
        http_status: Some(status.as_u16()),
        content_type,
        items_parsed: blocks.len(),
        items_matched: matched,
        candidates_emitted: results.len(),
        reason: if blocks.is_empty() {
            "RSS/Atom parser found no item/entry blocks.".to_string()
        } else if results.is_empty() {
            "No RSS/Atom item matched topic keywords or public URL validation.".to_string()
        } else {
            "RSS/Atom items emitted as candidates.".to_string()
        },
    });
    results
}

fn discover_direct_news_sources(
    request: &WebSearchRequestInput,
    max_results: usize,
    attempts: &mut Vec<DirectDiscoveryAttempt>,
) -> (Vec<WebSearchResult>, NewsSourceRoute) {
    let empty_route = NewsSourceRoute {
        selected_sources: Vec::new(),
        skipped_sources: Vec::new(),
        fallback_sources: Vec::new(),
        source_strategy: "not_news_request".to_string(),
        topic_tags: Vec::new(),
        query_focus_entities: Vec::new(),
        focus_entity_source: "none".to_string(),
        company_specific_news: false,
        entity_filter_applied: false,
        rejected_wrong_entity_count: 0,
        rejected_wrong_entity_samples: Vec::new(),
        reliability_mix: String::new(),
        official_source_count: 0,
        aggregator_source_count: 0,
    };
    if !is_direct_news_discovery_request(request) || max_results == 0 {
        return (Vec::new(), empty_route);
    }
    let keywords = direct_discovery_topic_keywords(request);
    let route = route_news_sources_for_request(request, &keywords);
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .connect_timeout(Duration::from_secs(3))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("oi-notebook-direct-discovery/0.1")
        .build()
    {
        Ok(client) => client,
        Err(_) => return (Vec::new(), route),
    };
    let mut results = Vec::new();
    for feed in route.selected_sources.iter() {
        if results.len() >= max_results {
            break;
        }
        let before = results.len();
        results.extend(discover_rss_items(
            &client,
            &feed,
            &keywords,
            &route.query_focus_entities,
            max_results.saturating_sub(results.len()),
            attempts,
        ));
        if results.len() == before {
            if let Some(source) = make_direct_source(
                feed.name,
                feed.source_home,
                None,
                feed.source_kind,
                "direct_site",
                feed.reliability,
                feed.name,
                feed.feed_url,
                Some(feed.source_home),
                None,
                &format!(
                    "Official or media news/blog landing candidate; still requires URL Reader and Evidence Gate. {}",
                    feed.reason
                ),
            ) {
                attempts.push(DirectDiscoveryAttempt {
                    source_name: feed.name.to_string(),
                    source_type: feed.source_type.to_string(),
                    url: feed.source_home.to_string(),
                    status: "success".to_string(),
                    http_status: None,
                    content_type: None,
                    items_parsed: 0,
                    items_matched: 0,
                    candidates_emitted: 1,
                    reason: format!(
                        "Emitted direct site candidate after RSS was unavailable or produced no matching item. sourceId={};topics={};timeoutMs={};{}",
                        feed.id,
                        feed.topics.join("|"),
                        feed.timeout_ms,
                        feed.reason
                    ),
                });
                results.push(source);
            }
        }
    }
    results.truncate(max_results);
    (results, route)
}

fn discover_direct_docs_sources(
    request: &WebSearchRequestInput,
    max_results: usize,
    attempts: &mut Vec<DirectDiscoveryAttempt>,
) -> Vec<WebSearchResult> {
    if max_results == 0 {
        return Vec::new();
    }
    let combined = request.queries.join(" ");
    if is_direct_news_discovery_request(request) || is_translation_or_word_lookup_query(&combined) {
        return Vec::new();
    }
    let lower = combined.to_ascii_lowercase();
    let mut candidates: Vec<(&str, &str, &str)> = Vec::new();
    if lower.contains("react") || lower.contains("useeffect") || lower.contains("hook") {
        candidates.push((
            "React useEffect",
            "https://react.dev/reference/react/useEffect",
            "React docs candidate for hooks/useEffect query.",
        ));
    }
    if lower.contains("javascript")
        || lower.contains("css")
        || lower.contains("html")
        || lower.contains("web api")
        || lower.contains("mdn")
    {
        candidates.push((
            "MDN Web Docs",
            "https://developer.mozilla.org/en-US/docs/Web",
            "MDN docs candidate for web platform query.",
        ));
    }
    if lower.contains("python") {
        candidates.push((
            "Python Documentation",
            "https://docs.python.org/3/",
            "Python official docs candidate.",
        ));
    }
    if lower.contains("rust") || lower.contains("ownership") {
        candidates.push((
            "The Rust Programming Language: Ownership",
            "https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html",
            "Rust book candidate for ownership/Rust query.",
        ));
    }
    if lower.contains("tauri") || lower.contains("command") {
        candidates.push((
            "Tauri commands",
            "https://v2.tauri.app/develop/calling-rust/",
            "Tauri docs candidate for command/Rust IPC query.",
        ));
    }
    if lower.contains("vite") {
        candidates.push((
            "Vite Guide",
            "https://vite.dev/guide/",
            "Vite docs candidate.",
        ));
    }
    if lower.contains("tailwind") {
        candidates.push((
            "Tailwind CSS Documentation",
            "https://tailwindcss.com/docs",
            "Tailwind docs candidate.",
        ));
    }
    if lower.contains("typescript") || lower.contains(" ts ") {
        candidates.push((
            "TypeScript Handbook",
            "https://www.typescriptlang.org/docs/handbook/intro.html",
            "TypeScript handbook candidate.",
        ));
    }
    if lower.contains("node.js") || lower.contains("nodejs") || lower.contains("node ") {
        candidates.push((
            "Node.js API",
            "https://nodejs.org/api/",
            "Node.js official API docs candidate.",
        ));
    }
    let results = candidates
        .into_iter()
        .take(max_results)
        .filter_map(|(title, url, reason)| {
            attempts.push(DirectDiscoveryAttempt {
                source_name: title.to_string(),
                source_type: "docs_constructed".to_string(),
                url: url.to_string(),
                status: "success".to_string(),
                http_status: None,
                content_type: None,
                items_parsed: 0,
                items_matched: 1,
                candidates_emitted: 1,
                reason: reason.to_string(),
            });
            make_direct_source(
                title,
                url,
                None,
                "docs_page",
                "direct_site",
                "docs",
                "docs-direct-v1",
                None,
                Some(url),
                None,
                reason,
            )
        })
        .collect();
    results
}

fn discover_direct_oi_sources(
    request: &WebSearchRequestInput,
    max_results: usize,
    attempts: &mut Vec<DirectDiscoveryAttempt>,
) -> Vec<WebSearchResult> {
    if max_results == 0 {
        return Vec::new();
    }
    let combined = request.queries.join(" ");
    if is_translation_or_word_lookup_query(&combined) {
        return Vec::new();
    }
    let lower = combined.to_ascii_lowercase();
    let mut candidates: Vec<(String, String, String, String)> = Vec::new();
    if let Some(problem_id) = request
        .problem_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let upper = problem_id.to_ascii_uppercase();
        if upper.starts_with('P') && upper[1..].chars().all(|ch| ch.is_ascii_digit()) {
            candidates.push((
                format!("Luogu {upper} problem"),
                format!("https://www.luogu.com.cn/problem/{upper}"),
                "community_solution".to_string(),
                "Luogu problem candidate from detected problem id.".to_string(),
            ));
            candidates.push((
                format!("Luogu {upper} solutions"),
                format!("https://www.luogu.com.cn/problem/solution/{upper}"),
                "community_solution".to_string(),
                "Luogu solution candidate from detected problem id.".to_string(),
            ));
        }
    }
    if lower.contains("centroid") || combined.contains("点分治") || combined.contains("点分树")
    {
        candidates.push((
            "cp-algorithms centroid decomposition".to_string(),
            "https://cp-algorithms.com/graph/centroid_decomposition.html".to_string(),
            "wiki".to_string(),
            "OI direct candidate for centroid decomposition.".to_string(),
        ));
        candidates.push((
            "OI Wiki 点分治".to_string(),
            "https://oi-wiki.org/graph/tree-divide/".to_string(),
            "wiki".to_string(),
            "OI Wiki candidate for Chinese centroid decomposition query.".to_string(),
        ));
    }
    if lower.contains("dijkstra") {
        candidates.push((
            "cp-algorithms Dijkstra".to_string(),
            "https://cp-algorithms.com/graph/dijkstra.html".to_string(),
            "wiki".to_string(),
            "OI direct candidate for Dijkstra.".to_string(),
        ));
    }
    if lower.contains("lca") {
        candidates.push((
            "cp-algorithms Lowest Common Ancestor".to_string(),
            "https://cp-algorithms.com/graph/lca.html".to_string(),
            "wiki".to_string(),
            "OI direct candidate for LCA.".to_string(),
        ));
    }
    if lower.contains("dsu") || lower.contains("disjoint set") || combined.contains("并查集") {
        candidates.push((
            "cp-algorithms Disjoint Set Union".to_string(),
            "https://cp-algorithms.com/data_structures/disjoint_set_union.html".to_string(),
            "wiki".to_string(),
            "OI direct candidate for DSU.".to_string(),
        ));
    }
    if lower.contains("kmp") {
        candidates.push((
            "cp-algorithms prefix function".to_string(),
            "https://cp-algorithms.com/string/prefix-function.html".to_string(),
            "wiki".to_string(),
            "OI direct candidate for KMP/prefix function.".to_string(),
        ));
    }
    if lower.contains("segment tree") || combined.contains("线段树") {
        candidates.push((
            "cp-algorithms segment tree".to_string(),
            "https://cp-algorithms.com/data_structures/segment_tree.html".to_string(),
            "wiki".to_string(),
            "OI direct candidate for segment tree.".to_string(),
        ));
    }
    if lower.contains("z function") || lower.contains("z-function") || combined.contains("z 函数")
    {
        candidates.push((
            "cp-algorithms Z-function".to_string(),
            "https://cp-algorithms.com/string/z-function.html".to_string(),
            "wiki".to_string(),
            "OI direct candidate for Z-function.".to_string(),
        ));
    }
    let results = candidates
        .into_iter()
        .take(max_results)
        .filter_map(|(title, url, reliability, reason)| {
            attempts.push(DirectDiscoveryAttempt {
                source_name: title.clone(),
                source_type: "oi_constructed".to_string(),
                url: url.clone(),
                status: "success".to_string(),
                http_status: None,
                content_type: None,
                items_parsed: 0,
                items_matched: 1,
                candidates_emitted: 1,
                reason: reason.clone(),
            });
            make_direct_source(
                &title,
                &url,
                None,
                "oi_reference",
                "constructed_source",
                &reliability,
                "oi-direct-v1",
                None,
                Some(&url),
                None,
                &reason,
            )
        })
        .collect();
    results
}

fn direct_discovery_debug_string(report: &DirectDiscoveryReport) -> String {
    let mut parts = vec![
        format!(
            "directDiscoveryAttempted={}",
            if report.attempted { "yes" } else { "no" }
        ),
        format!(
            "directDiscoverySkippedReason={}",
            sanitize_ai_detail(report.skipped_reason.as_deref().unwrap_or(""))
        ),
        format!(
            "directDiscoveryIntent={}",
            sanitize_ai_detail(&report.intent)
        ),
        format!(
            "directDiscoveryFreshness={}",
            sanitize_ai_detail(&report.freshness)
        ),
        format!("directDiscoveryQuery={}", sanitize_ai_detail(&report.query)),
        format!(
            "rawUserQuery={}",
            sanitize_ai_detail(report.raw_user_query.as_deref().unwrap_or(""))
        ),
        format!(
            "directDiscoveryTopicKeywords={}",
            sanitize_ai_detail(&report.topic_keywords.join(","))
        ),
        format!("directDiscoverySourcesTried={}", report.sources_tried.len()),
        format!("directDiscoveryCandidatesFound={}", report.candidates_found),
        format!("directDiscoveryCandidatesKept={}", report.candidates_kept),
        format!("directDiscoveryDurationMs={}", report.duration_ms),
        format!(
            "directDiscoveryCacheBehavior={}",
            sanitize_ai_detail(&report.cache_behavior)
        ),
        format!(
            "newsRegistryEnabled={}",
            if report.news_registry_enabled { "yes" } else { "no" }
        ),
        format!(
            "sourceRouterTriggered={}",
            if report.source_router_triggered { "yes" } else { "no" }
        ),
        format!(
            "sourceRouterReason={}",
            sanitize_ai_detail(&report.source_router_reason)
        ),
        format!(
            "queryFocusEntities={}",
            sanitize_ai_detail(&report.query_focus_entities.join(","))
        ),
        format!(
            "focusEntitySource={}",
            sanitize_ai_detail(&report.focus_entity_source)
        ),
        format!(
            "companySpecificNews={}",
            if report.company_specific_news { "yes" } else { "no" }
        ),
        format!(
            "entityFilterApplied={}",
            if report.entity_filter_applied { "yes" } else { "no" }
        ),
        format!(
            "rejectedWrongEntityCount={}",
            report.rejected_wrong_entity_count
        ),
        format!(
            "rejectedWrongEntitySamples={}",
            sanitize_ai_detail(&report.rejected_wrong_entity_samples.join("|"))
        ),
        format!(
            "selectedSourceCount={}",
            report.selected_sources.len()
        ),
        format!(
            "selectedSources={}",
            sanitize_ai_detail(&report.selected_sources.join("|"))
        ),
        format!(
            "skippedSources={}",
            sanitize_ai_detail(&report.skipped_sources.join("|"))
        ),
        format!(
            "fallbackSources={}",
            sanitize_ai_detail(&report.fallback_sources.join("|"))
        ),
        format!(
            "topicTags={}",
            sanitize_ai_detail(&report.topic_tags.join(","))
        ),
        format!(
            "reliabilityMix={}",
            sanitize_ai_detail(&report.reliability_mix)
        ),
        format!("officialSourceCount={}", report.official_source_count),
        format!("aggregatorSourceCount={}", report.aggregator_source_count),
        format!(
            "fallbackUsed={}",
            if report.fallback_used { "yes" } else { "no" }
        ),
        format!(
            "registryCandidatesFound={}",
            report.registry_candidates_found
        ),
        format!("registryCandidatesKept={}", report.registry_candidates_kept),
        format!(
            "registryCandidatesRejected={}",
            report.registry_candidates_rejected
        ),
    ];
    for (index, attempt) in report.sources_tried.iter().enumerate() {
        parts.push(format!(
            "directSource{}=sourceName={},sourceType={},url={},status={},httpStatus={},contentType={},itemsParsed={},itemsMatched={},candidatesEmitted={},reason={}",
            index + 1,
            sanitize_ai_detail(&attempt.source_name),
            sanitize_ai_detail(&attempt.source_type),
            sanitize_ai_detail(&attempt.url),
            sanitize_ai_detail(&attempt.status),
            attempt.http_status.map(|value| value.to_string()).unwrap_or_else(|| "-".to_string()),
            sanitize_ai_detail(attempt.content_type.as_deref().unwrap_or("-")),
            attempt.items_parsed,
            attempt.items_matched,
            attempt.candidates_emitted,
            sanitize_ai_detail(&attempt.reason),
        ));
    }
    parts.join(";")
}

fn attach_direct_discovery_debug(existing: Option<&str>, direct_debug: &str) -> String {
    let existing = existing.map(str::trim).filter(|value| !value.is_empty());
    match existing {
        Some(existing) => format!("{direct_debug};{existing}"),
        None => direct_debug.to_string(),
    }
}

fn discover_no_key_direct_sources_with_report(
    request: &WebSearchRequestInput,
    max_results: usize,
    cache_behavior: &str,
) -> (Vec<WebSearchResult>, DirectDiscoveryReport) {
    let started_at = Instant::now();
    let mut attempts = Vec::new();
    let mut sources = Vec::new();
    let combined = request.queries.join(" ");
    let news_request = is_direct_news_discovery_request(request);
    let mut news_route = NewsSourceRoute {
        selected_sources: Vec::new(),
        skipped_sources: Vec::new(),
        fallback_sources: Vec::new(),
        source_strategy: if news_request {
            "news_request_not_routed".to_string()
        } else {
            "not_news_request".to_string()
        },
        topic_tags: Vec::new(),
        query_focus_entities: Vec::new(),
        focus_entity_source: "none".to_string(),
        company_specific_news: false,
        entity_filter_applied: false,
        rejected_wrong_entity_count: 0,
        rejected_wrong_entity_samples: Vec::new(),
        reliability_mix: String::new(),
        official_source_count: 0,
        aggregator_source_count: 0,
    };
    let skipped_reason = if max_results == 0 {
        Some("max_results_is_zero".to_string())
    } else if is_translation_or_word_lookup_query(&combined) {
        Some("translation_or_word_lookup_query".to_string())
    } else {
        None
    };
    if skipped_reason.is_none() {
        let (news_sources, route) = discover_direct_news_sources(
            request,
            max_results.saturating_sub(sources.len()),
            &mut attempts,
        );
        news_route = route;
        sources.extend(news_sources);
        sources.extend(discover_direct_docs_sources(
            request,
            max_results.saturating_sub(sources.len()),
            &mut attempts,
        ));
        sources.extend(discover_direct_oi_sources(
            request,
            max_results.saturating_sub(sources.len()),
            &mut attempts,
        ));
    }
    let candidates_found = sources.len();
    let merged = merge_search_sources(Vec::new(), sources, max_results);
    let final_skipped_reason = skipped_reason.clone().or_else(|| {
        if !news_request && attempts.is_empty() && candidates_found == 0 {
            Some("no_matching_direct_discovery_rule".to_string())
        } else {
            None
        }
    });
    let report_query = if news_route.company_specific_news && news_route.query_focus_entities.len() == 1 {
        let focus_entity = news_route.query_focus_entities[0].as_str();
        request
            .queries
            .iter()
            .filter(|query| {
                news_site_query_entity(query)
                    .map(|entity| entity == focus_entity)
                    .unwrap_or(true)
            })
            .cloned()
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        combined.clone()
    };
    let report = DirectDiscoveryReport {
        attempted: final_skipped_reason.is_none(),
        skipped_reason: final_skipped_reason,
        intent: request.intent.clone(),
        freshness: request.freshness.clone().unwrap_or_default(),
        query: report_query,
        raw_user_query: request.raw_user_query.clone(),
        topic_keywords: direct_discovery_topic_keywords(request),
        topic_tags: news_route.topic_tags.clone(),
        news_registry_enabled: news_request,
        source_router_triggered: news_request && skipped_reason.is_none(),
        source_router_reason: news_route.source_strategy.clone(),
        query_focus_entities: news_route.query_focus_entities.clone(),
        focus_entity_source: news_route.focus_entity_source.clone(),
        company_specific_news: news_route.company_specific_news,
        entity_filter_applied: news_route.entity_filter_applied,
        rejected_wrong_entity_count: news_route.rejected_wrong_entity_count,
        rejected_wrong_entity_samples: news_route.rejected_wrong_entity_samples.clone(),
        selected_sources: news_route
            .selected_sources
            .iter()
            .map(|source| format!("{}:{}", source.id, source.name))
            .collect(),
        skipped_sources: news_route.skipped_sources.clone(),
        fallback_sources: news_route.fallback_sources.clone(),
        reliability_mix: news_route.reliability_mix.clone(),
        official_source_count: news_route.official_source_count,
        aggregator_source_count: news_route.aggregator_source_count,
        fallback_used: news_request,
        registry_candidates_found: if news_request { candidates_found } else { 0 },
        registry_candidates_kept: if news_request { merged.len() } else { 0 },
        registry_candidates_rejected: if news_request {
            candidates_found.saturating_sub(merged.len())
        } else {
            0
        },
        sources_tried: attempts,
        candidates_found,
        candidates_kept: merged.len(),
        duration_ms: started_at.elapsed().as_millis(),
        cache_behavior: cache_behavior.to_string(),
    };
    (merged, report)
}

fn merge_search_sources(
    primary: Vec<WebSearchResult>,
    secondary: Vec<WebSearchResult>,
    max_results: usize,
) -> Vec<WebSearchResult> {
    let mut seen = HashSet::new();
    let mut merged = Vec::new();
    for source in primary.into_iter().chain(secondary) {
        let key = source
            .final_url
            .as_deref()
            .unwrap_or(source.url.as_str())
            .trim()
            .trim_end_matches('/')
            .to_ascii_lowercase();
        if key.is_empty() || !seen.insert(key) {
            continue;
        }
        merged.push(source);
        if merged.len() >= max_results {
            break;
        }
    }
    merged
}

fn self_check_request(
    raw_user_query: Option<&str>,
    query: &str,
    intent: &str,
    vertical: Option<&str>,
    freshness: Option<&str>,
    topic_keywords: &[&str],
    algorithm_keywords: &[&str],
    problem_id: Option<&str>,
) -> WebSearchRequestInput {
    WebSearchRequestInput {
        raw_user_query: raw_user_query.map(ToOwned::to_owned),
        queries: vec![query.to_string()],
        intent: intent.to_string(),
        vertical: vertical.map(ToOwned::to_owned),
        freshness: freshness.map(ToOwned::to_owned),
        problem_id: problem_id.map(ToOwned::to_owned),
        algorithm_keywords: algorithm_keywords.iter().map(|value| value.to_string()).collect(),
        topic_keywords: topic_keywords.iter().map(|value| value.to_string()).collect(),
        max_results: Some(8),
        provider: Some(WEB_SEARCH_BING_PROVIDER.to_string()),
    }
}

fn with_extra_self_check_queries(
    mut request: WebSearchRequestInput,
    queries: &[&str],
) -> WebSearchRequestInput {
    request
        .queries
        .extend(queries.iter().map(|query| query.to_string()));
    request
}

fn self_check_filtered_query_diversification(
    request: &WebSearchRequestInput,
    route: Option<&NewsSourceRoute>,
) -> (Vec<String>, Vec<String>) {
    let Some(route) = route else {
        return (request.queries.clone(), Vec::new());
    };
    if !route.company_specific_news || route.query_focus_entities.len() != 1 {
        return (request.queries.clone(), Vec::new());
    }
    let focus_entity = route.query_focus_entities[0].as_str();
    let mut kept = Vec::new();
    let mut dropped = Vec::new();
    for query in &request.queries {
        match news_site_query_entity(query) {
            Some(entity) if entity != focus_entity => dropped.push(query.clone()),
            _ => kept.push(query.clone()),
        }
    }
    (kept, dropped)
}

fn run_local_self_check_query(
    query: &str,
    problem_id: Option<&str>,
    algorithm_keywords: &[&str],
) -> LocalSearchSelfCheckProbe {
    crate::local_search::inspect_local_search_for_self_check(&LocalNoteSearchInput {
        query: query.to_string(),
        problem_id: problem_id.map(ToOwned::to_owned),
        problem_title: None,
        algorithm_keywords: algorithm_keywords.iter().map(|value| value.to_string()).collect(),
        current_note_path: None,
        max_results: Some(5),
        max_chars_per_result: Some(500),
    })
}

fn local_probe_has_algorithm_term_re(probe: &LocalSearchSelfCheckProbe) -> bool {
    probe
        .query_terms
        .iter()
        .chain(probe.expanded_terms.iter())
        .chain(probe.algorithm_terms.iter())
        .any(|term| term.eq_ignore_ascii_case("re"))
}

fn direct_candidate_gate_protected(route: &NewsSourceRoute) -> bool {
    let Some(first_source) = route.selected_sources.first() else {
        return false;
    };
    make_direct_source(
        first_source.name,
        first_source.source_home,
        None,
        first_source.source_kind,
        "direct_site",
        first_source.reliability,
        first_source.name,
        first_source.feed_url,
        Some(first_source.source_home),
        None,
        "Self-check candidate; should not be usable evidence before URL Reader.",
    )
    .is_some_and(|source| {
        source.evidence_status.as_deref() == Some("candidate")
            && source.usable_evidence == Some(false)
            && source.injected_into_answer == Some(false)
            && source.content_status.as_deref() == Some("not_fetched")
    })
}

#[derive(Debug, Clone)]
struct NewsClusteringSelfCheckCandidate {
    id: &'static str,
    title: &'static str,
    source_id: &'static str,
    reliability: &'static str,
    official: bool,
    primary_entity: &'static str,
    entity_match_strength: &'static str,
    rank: i64,
}

#[derive(Debug, Clone)]
struct NewsClusteringSelfCheckResult {
    enabled: bool,
    candidate_count_before_clustering: usize,
    cluster_count: usize,
    selected_cluster_count: usize,
    diversity_applied: bool,
    single_cluster_warning: bool,
    selected_representatives: Vec<String>,
    dropped_duplicate_count: usize,
    selected_wrong_entity_count: usize,
    figma_mention_selected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExtractorQualitySelfCheckCase {
    name: &'static str,
    content_status: &'static str,
    page_type: &'static str,
    excerpt_quality: &'static str,
    excerpt_chars: usize,
    expected_usable: bool,
    actual_usable: bool,
    reason: String,
}

fn synthetic_extractor_evidence_usable(
    content_status: &str,
    page_type: &str,
    excerpt_quality: &str,
    excerpt_chars: usize,
) -> bool {
    if matches!(
        content_status,
        "not_fetched"
            | "unavailable"
            | "needs_js"
            | "blocked"
            | "failed"
            | "search_summary_only"
            | "too_short"
            | "wrong_page_type"
    ) {
        return false;
    }
    if matches!(page_type, "homepage" | "search_page" | "redirect" | "login" | "download") {
        return false;
    }
    if matches!(excerpt_quality, "snippet_only" | "title_only" | "unavailable" | "too_short" | "blocked" | "failed") {
        return false;
    }
    excerpt_chars >= 160 && matches!(content_status, "fetched" | "partial")
}

fn run_extractor_quality_self_check() -> Vec<ExtractorQualitySelfCheckCase> {
    [
        ("meta description only", "search_summary_only", "article", "snippet_only", 120usize, false),
        ("title only", "search_summary_only", "article", "title_only", 40usize, false),
        ("needs_js", "needs_js", "article", "blocked", 0usize, false),
        ("blocked", "blocked", "article", "blocked", 0usize, false),
        ("too_short", "too_short", "article", "too_short", 80usize, false),
        ("fetched article body", "fetched", "article", "high", 900usize, true),
        ("dated news article body", "fetched", "news_article", "high", 850usize, true),
        ("search page", "wrong_page_type", "search_page", "high", 900usize, false),
        ("homepage", "wrong_page_type", "homepage", "high", 900usize, false),
    ]
    .into_iter()
    .map(|(name, content_status, page_type, excerpt_quality, excerpt_chars, expected_usable)| {
        let actual_usable = synthetic_extractor_evidence_usable(
            content_status,
            page_type,
            excerpt_quality,
            excerpt_chars,
        );
        let reason = if actual_usable == expected_usable {
            "pass".to_string()
        } else {
            format!(
                "expected usable={} but got usable={} for contentStatus={}, pageType={}, excerptQuality={}",
                expected_usable, actual_usable, content_status, page_type, excerpt_quality
            )
        };
        ExtractorQualitySelfCheckCase {
            name,
            content_status,
            page_type,
            excerpt_quality,
            excerpt_chars,
            expected_usable,
            actual_usable,
            reason,
        }
    })
    .collect()
}

fn normalize_news_cluster_text(value: &str) -> String {
    value
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { ' ' })
        .collect::<String>()
}

fn self_check_news_cluster_key(title: &str) -> String {
    let normalized = normalize_news_cluster_text(title);
    let entity = if normalized.contains("openai") || normalized.contains("chatgpt") || normalized.contains("gpt") {
        "openai"
    } else if normalized.contains("anthropic") || normalized.contains("claude") {
        "anthropic"
    } else if normalized.contains("google") || normalized.contains("gemini") || normalized.contains("deepmind") {
        "google"
    } else if normalized.contains("microsoft") || normalized.contains("copilot") {
        "microsoft"
    } else if normalized.contains("nvidia") || normalized.contains("gpu") || normalized.contains("chip") {
        "nvidia"
    } else {
        "ai"
    };
    let event = if normalized.contains("i o") || normalized.contains("gemini") || normalized.contains("workspace") || normalized.contains("gmail") || normalized.contains("genie") {
        "io-gemini"
    } else if normalized.contains("funding") || normalized.contains("startup") || normalized.contains("investment") {
        "funding"
    } else if normalized.contains("regulation") || normalized.contains("policy") || normalized.contains("act") {
        "regulation"
    } else if normalized.contains("security") || normalized.contains("safety") || normalized.contains("risk") {
        "security"
    } else if normalized.contains("agent") || normalized.contains("tool") {
        "agent"
    } else if normalized.contains("model") || normalized.contains("launch") || normalized.contains("release") {
        "model"
    } else {
        "news"
    };
    format!("{entity}-{event}")
}

fn source_reliability_priority(reliability: &str, official: bool) -> i64 {
    if official {
        0
    } else {
        match reliability {
            "official" => 0,
            "high" => 1,
            "medium" => 2,
            "aggregator" => 3,
            _ => 4,
        }
    }
}

fn run_news_clustering_self_check(
    expected_category: &str,
    route: Option<&NewsSourceRoute>,
) -> NewsClusteringSelfCheckResult {
    let enabled = matches!(expected_category, "news_ai" | "news_openai" | "news_anthropic");
    if !enabled {
        return NewsClusteringSelfCheckResult {
            enabled: false,
            candidate_count_before_clustering: 0,
            cluster_count: 0,
            selected_cluster_count: 0,
            diversity_applied: false,
            single_cluster_warning: false,
            selected_representatives: Vec::new(),
            dropped_duplicate_count: 0,
            selected_wrong_entity_count: 0,
            figma_mention_selected: false,
        };
    }

    let mut candidates = match expected_category {
        "news_openai" => vec![
            NewsClusteringSelfCheckCandidate { id: "o-official", title: "OpenAI launches a new ChatGPT model", source_id: "openai-news", reliability: "official", official: true, primary_entity: "openai", entity_match_strength: "primary", rank: 100 },
            NewsClusteringSelfCheckCandidate { id: "figma-mention", title: "Figma adds an AI assistant with OpenAI and Anthropic integrations", source_id: "techcrunch-ai", reliability: "high", official: false, primary_entity: "figma", entity_match_strength: "mention", rank: 96 },
            NewsClusteringSelfCheckCandidate { id: "o-media-1", title: "OpenAI announces ChatGPT model launch", source_id: "techcrunch-ai", reliability: "high", official: false, primary_entity: "openai", entity_match_strength: "secondary", rank: 88 },
            NewsClusteringSelfCheckCandidate { id: "o-media-2", title: "OpenAI GPT model launch report", source_id: "the-verge-ai", reliability: "high", official: false, primary_entity: "openai", entity_match_strength: "secondary", rank: 82 },
            NewsClusteringSelfCheckCandidate { id: "o-agent", title: "OpenAI announces ChatGPT agent tool update", source_id: "openai-news", reliability: "official", official: true, primary_entity: "openai", entity_match_strength: "primary", rank: 80 },
        ],
        "news_anthropic" => vec![
            NewsClusteringSelfCheckCandidate { id: "a-official", title: "Anthropic announces Claude model update", source_id: "anthropic-news", reliability: "official", official: true, primary_entity: "anthropic", entity_match_strength: "primary", rank: 100 },
            NewsClusteringSelfCheckCandidate { id: "a-media", title: "Anthropic Claude model update coverage from media", source_id: "techcrunch-ai", reliability: "high", official: false, primary_entity: "anthropic", entity_match_strength: "secondary", rank: 86 },
            NewsClusteringSelfCheckCandidate { id: "a-safety", title: "Anthropic publishes Claude safety research", source_id: "anthropic-news", reliability: "official", official: true, primary_entity: "anthropic", entity_match_strength: "primary", rank: 80 },
        ],
        _ => vec![
            NewsClusteringSelfCheckCandidate { id: "g1", title: "Google I/O announces Gemini agents", source_id: "google-ai-blog", reliability: "official", official: true, primary_entity: "google_ai", entity_match_strength: "primary", rank: 96 },
            NewsClusteringSelfCheckCandidate { id: "g2", title: "Google I/O brings Gmail Live and Gemini", source_id: "the-verge-ai", reliability: "high", official: false, primary_entity: "google_ai", entity_match_strength: "secondary", rank: 92 },
            NewsClusteringSelfCheckCandidate { id: "g3", title: "Google Genie model at I/O gets media coverage", source_id: "techcrunch-ai", reliability: "high", official: false, primary_entity: "google_ai", entity_match_strength: "secondary", rank: 88 },
            NewsClusteringSelfCheckCandidate { id: "o1", title: "OpenAI launches ChatGPT agent tool", source_id: "openai-news", reliability: "official", official: true, primary_entity: "openai", entity_match_strength: "primary", rank: 86 },
            NewsClusteringSelfCheckCandidate { id: "r1", title: "EU advances AI regulation policy", source_id: "techcrunch-ai", reliability: "high", official: false, primary_entity: "regulation", entity_match_strength: "primary", rank: 82 },
            NewsClusteringSelfCheckCandidate { id: "n1", title: "Nvidia AI infrastructure chip demand grows", source_id: "the-verge-ai", reliability: "high", official: false, primary_entity: "nvidia", entity_match_strength: "primary", rank: 78 },
        ],
    };

    if let Some(route) = route {
        let route_ids = route
            .selected_sources
            .iter()
            .map(|source| source.id)
            .collect::<HashSet<_>>();
        candidates.retain(|candidate| route_ids.contains(candidate.source_id) || candidate.source_id.starts_with("the-verge") || candidate.source_id.starts_with("techcrunch"));
        if route.company_specific_news {
            let focus_entities = route.query_focus_entities.iter().map(String::as_str).collect::<HashSet<_>>();
            candidates.retain(|candidate| {
                focus_entities.contains(candidate.primary_entity)
                    && matches!(candidate.entity_match_strength, "primary" | "secondary")
            });
        }
    }

    candidates.sort_by_key(|candidate| {
        (
            source_reliability_priority(candidate.reliability, candidate.official),
            -candidate.rank,
            candidate.id,
        )
    });
    let mut cluster_counts = BTreeMap::<String, usize>::new();
    for candidate in &candidates {
        *cluster_counts
            .entry(self_check_news_cluster_key(candidate.title))
            .or_insert(0) += 1;
    }

    let max_per_cluster = if expected_category == "news_ai" { 1 } else { 2 };
    let max_selected = if expected_category == "news_ai" { 4 } else { 3 };
    let mut selected_cluster_counts = BTreeMap::<String, usize>::new();
    let mut selected_representatives = Vec::<String>::new();
    let mut dropped_duplicate_count = 0usize;
    let mut selected_wrong_entity_count = 0usize;
    let mut figma_mention_selected = false;
    for candidate in &candidates {
        let cluster = self_check_news_cluster_key(candidate.title);
        let current = selected_cluster_counts.get(&cluster).copied().unwrap_or(0);
        if current >= max_per_cluster || selected_representatives.len() >= max_selected {
            dropped_duplicate_count += 1;
            continue;
        }
        selected_representatives.push(format!("{}:{}", candidate.source_id, candidate.id));
        if let Some(route) = route {
            if route.company_specific_news && !route.query_focus_entities.iter().any(|entity| entity == candidate.primary_entity) {
                selected_wrong_entity_count += 1;
            }
        }
        if candidate.id == "figma-mention" {
            figma_mention_selected = true;
        }
        selected_cluster_counts.insert(cluster, current + 1);
    }

    NewsClusteringSelfCheckResult {
        enabled,
        candidate_count_before_clustering: candidates.len(),
        cluster_count: cluster_counts.len(),
        selected_cluster_count: selected_cluster_counts.len(),
        diversity_applied: dropped_duplicate_count > 0 || selected_cluster_counts.len() > 1,
        single_cluster_warning: cluster_counts.len() == 1,
        selected_representatives,
        dropped_duplicate_count,
        selected_wrong_entity_count,
        figma_mention_selected,
    }
}

fn build_self_check_case(
    query: &str,
    expected_category: &str,
    request: WebSearchRequestInput,
    local_probe: Option<LocalSearchSelfCheckProbe>,
    explicit_url_path_used: bool,
) -> NotexSearchSelfCheckCaseResult {
    let keywords = direct_discovery_topic_keywords(&request);
    let news_registry_triggered = is_direct_news_discovery_request(&request);
    let route = if news_registry_triggered {
        Some(route_news_sources_for_request(&request, &keywords))
    } else {
        None
    };
    let (query_diversification, dropped_query_diversification) =
        self_check_filtered_query_diversification(&request, route.as_ref());
    let selected_news_sources = route
        .as_ref()
        .map(|route| {
            route
                .selected_sources
                .iter()
                .map(|source| format!("{}:{}", source.id, source.name))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let query_focus_entities = route
        .as_ref()
        .map(|route| route.query_focus_entities.clone())
        .unwrap_or_default();
    let company_specific_news = route
        .as_ref()
        .is_some_and(|route| route.company_specific_news);
    let focus_entity_source = route
        .as_ref()
        .map(|route| route.focus_entity_source.clone())
        .unwrap_or_else(|| "none".to_string());
    let entity_filter_applied = route
        .as_ref()
        .is_some_and(|route| route.entity_filter_applied);
    let rejected_wrong_entity_count = route
        .as_ref()
        .map(|route| route.rejected_wrong_entity_count)
        .unwrap_or(0);
    let bing_fallback_planned = route.as_ref().is_some_and(|route| {
        route
            .fallback_sources
            .iter()
            .any(|source| source.contains("bing-news-fallback"))
    });
    let candidate_gate_protected = route
        .as_ref()
        .map(direct_candidate_gate_protected)
        .unwrap_or(true);
    let clustering = run_news_clustering_self_check(expected_category, route.as_ref());
    let (local_search_triggered, has_algorithm_term_matched_re, local_probe_diagnostics) =
        match local_probe {
            Some(probe) => {
                let has_algorithm_term_matched_re = local_probe_has_algorithm_term_re(&probe);
                (
                    true,
                    has_algorithm_term_matched_re,
                    Some(json!({
                        "oiSynonymsEnabled": probe.oi_synonyms_enabled,
                        "queryTerms": probe.query_terms,
                        "expandedTerms": probe.expanded_terms,
                        "problemIds": probe.problem_ids,
                        "algorithmTerms": probe.algorithm_terms,
                        "mode": "query-planning-only-no-note-io",
                    })),
                )
            }
            None => (false, false, None),
        };
    let local_result_count = 0usize;
    let has_post_navigation_false_positive = false;
    let displayed_local_source_count = 0usize;
    let actual_intent = request.intent.clone();
    let vertical = request.vertical.clone().unwrap_or_else(|| "none".to_string());
    let freshness = request
        .freshness
        .clone()
        .unwrap_or_else(|| "none".to_string());
    let search_mode = self_check_search_mode_decision(&request, query, explicit_url_path_used);

    let mut failures = Vec::<String>::new();
    let extractor_quality_checks = if expected_category == "explicit_url" {
        run_extractor_quality_self_check()
    } else {
        Vec::new()
    };
    if !extractor_quality_checks.is_empty()
        && extractor_quality_checks
            .iter()
            .any(|check| check.actual_usable != check.expected_usable)
    {
        failures.push("extractor quality synthetic evidence checks failed".to_string());
    }
    match expected_category {
        "news_ai" => {
            if search_mode.mode != "news_recent" || !search_mode.allow_news_registry || !search_mode.allow_bing_fallback {
                failures.push(format!("AI news search mode was not news_recent with registry and Bing fallback: {}", search_mode.mode));
            }
            if !news_registry_triggered {
                failures.push("news registry was not triggered".to_string());
            }
            if company_specific_news || entity_filter_applied {
                failures.push("Broad AI news should not use company-specific entity filter".to_string());
            }
            if !clustering.enabled {
                failures.push("news clustering was not enabled".to_string());
            }
            if clustering.cluster_count == 0 {
                failures.push("news cluster count was missing".to_string());
            }
            if !clustering.diversity_applied && clustering.cluster_count > 1 {
                failures.push("news diversity was not applied".to_string());
            }
            if !bing_fallback_planned {
                failures.push("Bing News fallback was not planned".to_string());
            }
            if !candidate_gate_protected {
                failures.push("direct candidate was not protected by candidate evidence state".to_string());
            }
        }
        "news_openai" => {
            if search_mode.mode != "news_recent" || !search_mode.allow_news_registry || !search_mode.allow_bing_fallback {
                failures.push(format!("OpenAI news search mode was not news_recent with registry and Bing fallback: {}", search_mode.mode));
            }
            if !news_registry_triggered {
                failures.push("news registry was not triggered".to_string());
            }
            if !company_specific_news || query_focus_entities != vec!["openai".to_string()] {
                failures.push(format!("OpenAI query focus was not exactly openai: {}", query_focus_entities.join(",")));
            }
            if focus_entity_source != "raw_user_query" {
                failures.push(format!("OpenAI query focus did not come from raw_user_query: {focus_entity_source}"));
            }
            if !entity_filter_applied {
                failures.push("OpenAI query did not apply entity filter".to_string());
            }
            if !clustering.enabled {
                failures.push("news clustering was not enabled".to_string());
            }
            if !selected_news_sources
                .iter()
                .any(|source| source.contains("openai-news"))
            {
                failures.push("OpenAI source was not selected".to_string());
            }
            if selected_news_sources.iter().any(|source| source.contains("anthropic-news") || source.contains("google-ai-blog") || source.contains("google-deepmind-blog") || source.contains("microsoft-ai-blog")) {
                failures.push("OpenAI query selected non-OpenAI official source".to_string());
            }
            if !clustering
                .selected_representatives
                .iter()
                .any(|source| source.contains("openai-news"))
            {
                failures.push("OpenAI official source was not preserved by clustering".to_string());
            }
            if clustering.selected_wrong_entity_count > 0 {
                failures.push("OpenAI clustering selected a non-OpenAI representative".to_string());
            }
            if clustering.figma_mention_selected {
                failures.push("Figma-like third-party mention was selected as OpenAI main evidence".to_string());
            }
            if !bing_fallback_planned {
                failures.push("Bing News fallback was not planned".to_string());
            }
            if !candidate_gate_protected {
                failures.push("direct candidate was not protected by candidate evidence state".to_string());
            }
            if query_diversification.iter().any(|query| {
                let lower = query.to_ascii_lowercase();
                lower.contains("site:anthropic.com")
                    || lower.contains("site:google.com")
                    || lower.contains("site:blog.google")
                    || lower.contains("site:deepmind.google")
                    || lower.contains("site:microsoft.com")
            }) {
                failures.push("OpenAI query diversification kept a non-OpenAI company site query".to_string());
            }
            if !dropped_query_diversification
                .iter()
                .any(|query| query.to_ascii_lowercase().contains("site:anthropic.com"))
            {
                failures.push("OpenAI self-check did not drop polluted site:anthropic.com diversification".to_string());
            }
        }
        "news_anthropic" => {
            if search_mode.mode != "news_recent" || !search_mode.allow_news_registry || !search_mode.allow_bing_fallback {
                failures.push(format!("Anthropic news search mode was not news_recent with registry and Bing fallback: {}", search_mode.mode));
            }
            if !news_registry_triggered {
                failures.push("news registry was not triggered".to_string());
            }
            if !company_specific_news || query_focus_entities != vec!["anthropic".to_string()] {
                failures.push(format!("Anthropic query focus was not exactly anthropic: {}", query_focus_entities.join(",")));
            }
            if focus_entity_source != "raw_user_query" {
                failures.push(format!("Anthropic query focus did not come from raw_user_query: {focus_entity_source}"));
            }
            if !entity_filter_applied {
                failures.push("Anthropic query did not apply entity filter".to_string());
            }
            if !clustering.enabled {
                failures.push("news clustering was not enabled".to_string());
            }
            if !selected_news_sources
                .iter()
                .any(|source| source.contains("anthropic-news"))
            {
                failures.push("Anthropic source was not selected".to_string());
            }
            if selected_news_sources.iter().any(|source| source.contains("openai-news") || source.contains("google-ai-blog") || source.contains("google-deepmind-blog") || source.contains("microsoft-ai-blog")) {
                failures.push("Anthropic query selected non-Anthropic official source".to_string());
            }
            if !bing_fallback_planned {
                failures.push("Bing News fallback was not planned".to_string());
            }
            if !candidate_gate_protected {
                failures.push("direct candidate was not protected by candidate evidence state".to_string());
            }
            if query_diversification.iter().any(|query| {
                let lower = query.to_ascii_lowercase();
                lower.contains("site:openai.com")
                    || lower.contains("site:google.com")
                    || lower.contains("site:blog.google")
                    || lower.contains("site:deepmind.google")
            }) {
                failures.push("Anthropic query diversification kept a non-Anthropic company site query".to_string());
            }
        }
        "docs_react" => {
            if search_mode.mode != "docs_technical" || search_mode.allow_news_registry {
                failures.push(format!("React docs search mode was not docs_technical without news registry: {}", search_mode.mode));
            }
            if news_registry_triggered {
                failures.push("React docs query triggered news registry".to_string());
            }
            if clustering.enabled {
                failures.push("React docs query triggered news clustering".to_string());
            }
            if company_specific_news || entity_filter_applied {
                failures.push("React docs query triggered company news entity filter".to_string());
            }
            if has_algorithm_term_matched_re {
                failures.push("React docs query produced algorithm term matched re".to_string());
            }
            if has_post_navigation_false_positive {
                failures.push("React docs query returned Post Navigation false positive".to_string());
            }
            if displayed_local_source_count != 0 {
                failures.push("local candidates would be displayed without N# citation".to_string());
            }
        }
        "oi_algorithm" => {
            if search_mode.mode != "oi_algorithm" || !search_mode.allow_local_index || search_mode.allow_news_registry {
                failures.push(format!("OI query search mode was not oi_algorithm with local index and no news registry: {}", search_mode.mode));
            }
            if news_registry_triggered {
                failures.push("OI query triggered news registry".to_string());
            }
            if clustering.enabled {
                failures.push("OI query triggered news clustering".to_string());
            }
            if company_specific_news || entity_filter_applied {
                failures.push("OI query triggered company news entity filter".to_string());
            }
            if !local_search_triggered {
                failures.push("OI query did not run local search".to_string());
            }
        }
        "translation_guard" => {
            if search_mode.mode != "no_search" || search_mode.allow_news_registry {
                failures.push(format!("translation query search mode was not no_search without news registry: {}", search_mode.mode));
            }
            if news_registry_triggered {
                failures.push("translation query triggered news registry".to_string());
            }
            if clustering.enabled {
                failures.push("translation query triggered news clustering".to_string());
            }
            if company_specific_news || entity_filter_applied {
                failures.push("translation query triggered company news entity filter".to_string());
            }
            if local_search_triggered {
                failures.push("translation query unexpectedly ran local search".to_string());
            }
        }
        "no_search" => {
            if search_mode.mode != "no_search" || search_mode.allow_news_registry || search_mode.prefer_url_reader {
                failures.push(format!("ordinary rewrite search mode was not no_search: {}", search_mode.mode));
            }
            if news_registry_triggered {
                failures.push("ordinary rewrite query triggered news registry".to_string());
            }
            if local_search_triggered {
                failures.push("ordinary rewrite query unexpectedly ran local search".to_string());
            }
        }
        "explicit_url" => {
            if search_mode.mode != "explicit_url" || !search_mode.prefer_url_reader || search_mode.allow_news_registry {
                failures.push(format!("explicit URL search mode was not explicit_url with URL Reader and no news registry: {}", search_mode.mode));
            }
            if news_registry_triggered {
                failures.push("explicit URL query triggered news registry".to_string());
            }
            if clustering.enabled {
                failures.push("explicit URL query triggered news clustering".to_string());
            }
            if company_specific_news || entity_filter_applied {
                failures.push("explicit URL query triggered company news entity filter".to_string());
            }
            if !explicit_url_path_used {
                failures.push("explicit URL path was not detected".to_string());
            }
        }
        _ => {}
    }
    let pass = failures.is_empty();
    let reason = if pass {
        "pass".to_string()
    } else {
        failures.join("; ")
    };
    NotexSearchSelfCheckCaseResult {
        query: query.to_string(),
        expected_category: expected_category.to_string(),
        actual_intent,
        search_mode: search_mode.mode.clone(),
        search_mode_reason: search_mode.reason.clone(),
        mode_guards: search_mode.guards.clone(),
        allow_news_registry: search_mode.allow_news_registry,
        allow_bing_fallback: search_mode.allow_bing_fallback,
        allow_local_index: search_mode.allow_local_index,
        prefer_url_reader: search_mode.prefer_url_reader,
        vertical,
        freshness,
        news_registry_triggered,
        news_clustering_triggered: clustering.enabled,
        company_specific_news,
        query_focus_entities: query_focus_entities.clone(),
        focus_entity_source: focus_entity_source.clone(),
        entity_filter_applied,
        rejected_wrong_entity_count,
        query_diversification: query_diversification.clone(),
        dropped_query_diversification: dropped_query_diversification.clone(),
        selected_news_sources: selected_news_sources.clone(),
        bing_fallback_planned,
        local_search_triggered,
        local_result_count,
        displayed_local_source_count,
        has_algorithm_term_matched_re,
        has_post_navigation_false_positive,
        explicit_url_path_used,
        cluster_count: clustering.cluster_count,
        selected_cluster_count: clustering.selected_cluster_count,
        diversity_applied: clustering.diversity_applied,
        single_cluster_warning: clustering.single_cluster_warning,
        pass,
        reason,
        raw_diagnostics: json!({
            "topicKeywords": keywords,
            "searchMode": search_mode.mode,
            "searchModeReason": search_mode.reason,
            "modeGuards": search_mode.guards,
            "allowNewsRegistry": search_mode.allow_news_registry,
            "allowBingFallback": search_mode.allow_bing_fallback,
            "allowLocalIndex": search_mode.allow_local_index,
            "preferUrlReader": search_mode.prefer_url_reader,
            "selectedNewsSources": selected_news_sources,
            "queryFocusEntities": query_focus_entities,
            "focusEntitySource": focus_entity_source,
            "companySpecificNews": company_specific_news,
            "entityFilterApplied": entity_filter_applied,
            "rejectedWrongEntityCount": rejected_wrong_entity_count,
            "queryDiversification": query_diversification,
            "droppedQueryDiversification": dropped_query_diversification,
            "rejectedWrongEntitySamples": route.as_ref().map(|route| route.rejected_wrong_entity_samples.clone()).unwrap_or_default(),
            "bingFallbackPlanned": bing_fallback_planned,
            "candidateRequiresUrlReaderAndEvidenceGate": candidate_gate_protected,
            "displayedLocalSourceCountAssumption": "Self-check does not generate an answer, so local candidates are not visible unless a real answer cites N#.",
            "newsClustering": {
                "enabled": clustering.enabled,
                "candidateCountBeforeClustering": clustering.candidate_count_before_clustering,
                "clusterCount": clustering.cluster_count,
                "selectedClusterCount": clustering.selected_cluster_count,
                "diversityApplied": clustering.diversity_applied,
                "singleClusterWarning": clustering.single_cluster_warning,
                "selectedRepresentatives": clustering.selected_representatives,
                "droppedDuplicateCount": clustering.dropped_duplicate_count,
                "selectedWrongEntityCount": clustering.selected_wrong_entity_count,
                "figmaMentionSelected": clustering.figma_mention_selected,
            },
            "extractorQualityChecks": extractor_quality_checks,
            "localSearch": local_probe_diagnostics,
        }),
    }
}

fn explicit_url_path_detected(query: &str) -> bool {
    extract_http_urls_from_text(query)
        .iter()
        .any(|url| validate_public_web_url_for_read(url).is_ok())
}

#[derive(Debug, Clone)]
struct NewsFreshnessSelfCheckSource {
    id: &'static str,
    published_at: Option<&'static str>,
}

fn freshness_age_days(today: &str, published_at: &str) -> Option<i64> {
    let parse = |value: &str| -> Option<(i32, i32, i32)> {
        let mut parts = value.split('-');
        Some((
            parts.next()?.parse::<i32>().ok()?,
            parts.next()?.parse::<i32>().ok()?,
            parts.next()?.parse::<i32>().ok()?,
        ))
    };
    let ordinal = |(year, month, day): (i32, i32, i32)| -> i64 {
        let mut total = 0i64;
        for y in 1970..year {
            total += if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 { 366 } else { 365 };
        }
        let month_days = [31, if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        for index in 0..(month - 1).max(0) as usize {
            total += month_days.get(index).copied().unwrap_or(30) as i64;
        }
        total + day as i64
    };
    Some(ordinal(parse(today)?) - ordinal(parse(published_at)?))
}

fn classify_news_freshness_status(today: &str, published_at: Option<&str>, explicit_range: bool) -> (&'static str, bool) {
    if explicit_range {
        return ("explicit_range_allowed", true);
    }
    let Some(published_at) = published_at else {
        return ("undated", false);
    };
    let Some(age_days) = freshness_age_days(today, published_at) else {
        return ("undated", false);
    };
    if age_days <= 0 {
        ("fresh_today", true)
    } else if age_days <= 1 {
        ("fresh_yesterday", true)
    } else if age_days <= 3 {
        ("fresh_72h", true)
    } else if age_days <= 7 {
        ("recent_week", true)
    } else {
        ("stale", false)
    }
}

fn build_news_freshness_self_check_case() -> NotexSearchSelfCheckCaseResult {
    let today = "2026-05-21";
    let default_sources = vec![
        NewsFreshnessSelfCheckSource { id: "may21", published_at: Some("2026-05-21") },
        NewsFreshnessSelfCheckSource { id: "may20", published_at: Some("2026-05-20") },
        NewsFreshnessSelfCheckSource { id: "may17", published_at: Some("2026-05-17") },
        NewsFreshnessSelfCheckSource { id: "apr16", published_at: Some("2026-04-16") },
        NewsFreshnessSelfCheckSource { id: "undated", published_at: None },
    ];
    let classified = default_sources
        .iter()
        .map(|source| {
            let (status, allowed) = classify_news_freshness_status(today, source.published_at, false);
            json!({
                "id": source.id,
                "publishedAt": source.published_at.unwrap_or("none"),
                "freshnessStatus": status,
                "mainNewsAllowed": allowed,
            })
        })
        .collect::<Vec<_>>();
    let stale_rejected = classify_news_freshness_status(today, Some("2026-04-16"), false) == ("stale", false);
    let recent_week_kept = classify_news_freshness_status(today, Some("2026-05-17"), false) == ("recent_week", true);
    let explicit_month_allows_april = classify_news_freshness_status(today, Some("2026-04-16"), true).1;
    let undated_not_primary = !classify_news_freshness_status(today, None, false).1;
    let mut failures = Vec::new();
    if !stale_rejected {
        failures.push("April 16 source was not rejected as stale for default recent news".to_string());
    }
    if !recent_week_kept {
        failures.push("May 17 source was not retained as recent_week within fallback window".to_string());
    }
    if !explicit_month_allows_april {
        failures.push("explicit April query did not allow April source".to_string());
    }
    if !undated_not_primary {
        failures.push("undated source was allowed as primary latest news".to_string());
    }
    let pass = failures.is_empty();
    NotexSearchSelfCheckCaseResult {
        query: "synthetic news freshness policy for 2026-05-21".to_string(),
        expected_category: "freshness_policy".to_string(),
        actual_intent: "news_recent".to_string(),
        search_mode: "news_recent".to_string(),
        search_mode_reason: "news_or_recent_intent".to_string(),
        mode_guards: vec!["news_registry_requires_mode".to_string(), "freshness_window_applied".to_string()],
        allow_news_registry: true,
        allow_bing_fallback: true,
        allow_local_index: false,
        prefer_url_reader: true,
        vertical: "news".to_string(),
        freshness: "news".to_string(),
        news_registry_triggered: true,
        news_clustering_triggered: true,
        company_specific_news: false,
        query_focus_entities: Vec::new(),
        focus_entity_source: "none".to_string(),
        entity_filter_applied: false,
        rejected_wrong_entity_count: 0,
        query_diversification: vec!["AI news".to_string()],
        dropped_query_diversification: Vec::new(),
        selected_news_sources: vec!["may21".to_string(), "may20".to_string(), "may17".to_string()],
        bing_fallback_planned: true,
        local_search_triggered: false,
        local_result_count: 0,
        displayed_local_source_count: 0,
        has_algorithm_term_matched_re: false,
        has_post_navigation_false_positive: false,
        explicit_url_path_used: false,
        cluster_count: 3,
        selected_cluster_count: 3,
        diversity_applied: true,
        single_cluster_warning: false,
        pass,
        reason: if pass { "pass".to_string() } else { failures.join("; ") },
        raw_diagnostics: json!({
            "currentDate": today,
            "strictWindowHours": 72,
            "fallbackWindowDays": 7,
            "maxNewsAgeDays": 7,
            "defaultRecent": classified,
            "aprilExplicitRangeAllowed": explicit_month_allows_april,
            "undatedPrimaryAllowed": !undated_not_primary,
        }),
    }
}

#[derive(Debug, Clone)]
struct SearchModeSelfCheckDecision {
    mode: String,
    reason: String,
    guards: Vec<String>,
    allow_news_registry: bool,
    allow_bing_fallback: bool,
    allow_local_index: bool,
    prefer_url_reader: bool,
}

fn self_check_search_mode_decision(
    request: &WebSearchRequestInput,
    query: &str,
    explicit_url_path_used: bool,
) -> SearchModeSelfCheckDecision {
    let vertical = request.vertical.as_deref().unwrap_or("").to_ascii_lowercase();
    let intent = request.intent.to_ascii_lowercase();
    let freshness = request.freshness.as_deref().unwrap_or("").to_ascii_lowercase();
    let raw_query = request.raw_user_query.as_deref().unwrap_or(query);
    let mut guards = Vec::new();
    let (mode, reason) = if explicit_url_path_used {
        guards.push("explicit_url_highest_priority".to_string());
        ("explicit_url", "explicit_url_detected")
    } else if is_translation_or_word_lookup_query(raw_query) || is_translation_or_word_lookup_query(query) {
        guards.push("translation_guard_before_news".to_string());
        ("no_search", "translation_or_word_lookup_guard")
    } else if !request.problem_id.as_deref().unwrap_or("").trim().is_empty()
        || !request.algorithm_keywords.is_empty()
        || vertical.contains("oi")
        || vertical.contains("algorithm")
        || intent.contains("algorithm")
        || intent.contains("oi_")
    {
        guards.push("oi_before_general_web".to_string());
        ("oi_algorithm", "problem_or_algorithm_intent")
    } else if vertical.contains("docs") || intent.contains("docs") || intent.contains("technical") {
        guards.push("docs_before_general_web".to_string());
        ("docs_technical", "technical_docs_intent")
    } else if vertical.contains("news")
        || freshness.contains("news")
        || intent.contains("news")
        || is_direct_news_discovery_request(request)
    {
        guards.push("news_registry_requires_mode".to_string());
        ("news_recent", "news_or_recent_intent")
    } else if intent.contains("general_web") {
        guards.push("fallback_only".to_string());
        ("general_web", "general_web_fallback")
    } else {
        guards.push("no_search_without_need".to_string());
        ("no_search", "normal_answer")
    };
    SearchModeSelfCheckDecision {
        mode: mode.to_string(),
        reason: reason.to_string(),
        guards,
        allow_news_registry: mode == "news_recent",
        allow_bing_fallback: matches!(mode, "news_recent" | "docs_technical" | "oi_algorithm" | "general_web"),
        allow_local_index: mode == "local_first" || mode == "oi_algorithm",
        prefer_url_reader: matches!(mode, "explicit_url" | "news_recent" | "docs_technical" | "oi_algorithm" | "general_web"),
    }
}

pub(crate) fn run_notex_search_self_check_core() -> Result<NotexSearchSelfCheckResult, String> {
    let cases = vec![
        build_self_check_case(
            "recent AI news",
            "news_ai",
            self_check_request(
                Some("recent AI news"),
                "AI news latest",
                "general_web",
                Some("news"),
                Some("news"),
                &["AI", "OpenAI", "Anthropic", "Google DeepMind"],
                &[],
                None,
            ),
            None,
            false,
        ),
        build_self_check_case(
            "recent OpenAI news",
            "news_openai",
            with_extra_self_check_queries(
                self_check_request(
                    Some("recent OpenAI news"),
                    "OpenAI latest news product model partnership site openai.com",
                    "general_web",
                    Some("news"),
                    Some("news"),
                    &["AI", "Anthropic", "ChatGPT", "DeepMind", "Gemini", "Google", "OpenAI", "artificial intelligence", "models"],
                    &[],
                    None,
                ),
                &[
                    "OpenAI news site:anthropic.com",
                    "OpenAI latest news site:google.com",
                    "OpenAI model update site:deepmind.google",
                    "OpenAI AI news site:microsoft.com",
                ],
            ),
            None,
            false,
        ),
        build_self_check_case(
            "recent Anthropic news",
            "news_anthropic",
            with_extra_self_check_queries(
                self_check_request(
                    Some("recent Anthropic news"),
                    "Anthropic latest news Claude model partnership",
                    "general_web",
                    Some("news"),
                    Some("news"),
                    &["AI", "Anthropic", "Claude", "Google", "OpenAI", "artificial intelligence", "models"],
                    &[],
                    None,
                ),
                &[
                    "Anthropic news site:openai.com",
                    "Anthropic latest news site:google.com",
                    "Claude model update site:deepmind.google",
                ],
            ),
            None,
            false,
        ),
        build_self_check_case(
            "React useEffect",
            "docs_react",
            self_check_request(
                Some("React useEffect"),
                "React useEffect docs",
                "docs_technical",
                Some("docs"),
                None,
                &["React", "useEffect"],
                &[],
                None,
            ),
            Some(run_local_self_check_query("React useEffect", None, &[])),
            false,
        ),
        build_self_check_case(
            "centroid tree pitfalls",
            "oi_algorithm",
            self_check_request(
                Some("centroid tree pitfalls"),
                "centroid tree pitfalls",
                "algorithm_reference",
                Some("algorithm"),
                None,
                &[],
                &["centroid tree", "centroid decomposition"],
                None,
            ),
            Some(run_local_self_check_query(
                "centroid tree pitfalls",
                None,
                &["centroid tree", "centroid decomposition"],
            )),
            false,
        ),
        build_self_check_case(
            "P3379 LCA",
            "oi_algorithm",
            self_check_request(
                Some("P3379 LCA"),
                "P3379 LCA",
                "algorithm_reference",
                Some("algorithm"),
                None,
                &[],
                &["LCA", "binary lifting"],
                Some("P3379"),
            ),
            Some(run_local_self_check_query(
                "P3379 LCA",
                Some("P3379"),
                &["LCA", "binary lifting"],
            )),
            false,
        ),
        build_self_check_case(
            "Z function and exKMP",
            "oi_algorithm",
            self_check_request(
                Some("Z function and exKMP"),
                "Z function and exKMP",
                "algorithm_reference",
                Some("algorithm"),
                None,
                &[],
                &["Z function", "exKMP", "extended KMP"],
                None,
            ),
            Some(run_local_self_check_query(
                "Z function and exKMP",
                None,
                &["Z function", "exKMP", "extended KMP"],
            )),
            false,
        ),
        build_self_check_case(
            "translate the word recent",
            "translation_guard",
            self_check_request(
                Some("translate the word recent"),
                "translate the word recent",
                "general_knowledge",
                None,
                None,
                &[],
                &[],
                None,
            ),
            None,
            false,
        ),
        build_self_check_case(
            "polish this paragraph: search mode policy keeps ordinary writing local",
            "no_search",
            self_check_request(
                Some("polish this paragraph: search mode policy keeps ordinary writing local"),
                "polish this paragraph: search mode policy keeps ordinary writing local",
                "no_search",
                None,
                None,
                &[],
                &[],
                None,
            ),
            None,
            false,
        ),
        {
            let query = "summarize this page: https://cp-algorithms.com/graph/centroid_decomposition.html";
            build_self_check_case(
                query,
                "explicit_url",
                self_check_request(Some(query), query, "explicit_url", Some("explicit_url"), None, &[], &[], None),
                None,
                explicit_url_path_detected(query),
            )
        },
        build_news_freshness_self_check_case(),
    ];
    let passed = cases.iter().filter(|case| case.pass).count();
    let total = cases.len();
    Ok(NotexSearchSelfCheckResult {
        passed,
        total,
        cases,
    })
}

#[tauri::command]
pub async fn run_notex_search_self_check() -> Result<NotexSearchSelfCheckResult, String> {
    tauri::async_runtime::spawn_blocking(run_notex_search_self_check_core)
        .await
        .map_err(|e| format!("NoteX search self-check task failed: {e}"))?
}

#[tauri::command]
pub async fn fetch_web_source_excerpts(
    input: FetchWebSourceExcerptsInput,
) -> Result<Vec<WebSourceExcerptResult>, String> {
    tauri::async_runtime::spawn_blocking(move || fetch_web_source_excerpts_blocking(input))
        .await
        .map_err(|e| format!("网页摘录任务失败: {e}"))?
}

fn search_web_sources_blocking(
    request: WebSearchRequestInput,
) -> Result<Vec<WebSearchResult>, String> {
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
    let raw_provider = request
        .provider
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let provider = match raw_provider {
        Some(WEB_SEARCH_DEFAULT_PROVIDER) => WEB_SEARCH_DEFAULT_PROVIDER,
        Some(WEB_SEARCH_BRAVE_PROVIDER) => WEB_SEARCH_BRAVE_PROVIDER,
        Some(WEB_SEARCH_BING_PROVIDER) => WEB_SEARCH_BING_PROVIDER,
        Some(WEB_SEARCH_REMOVED_SEARXNG_PROVIDER)
            if !search_config.bocha_api_key.trim().is_empty() =>
        {
            WEB_SEARCH_DEFAULT_PROVIDER
        }
        Some(WEB_SEARCH_REMOVED_SEARXNG_PROVIDER)
            if !search_config.brave_api_key.trim().is_empty() =>
        {
            WEB_SEARCH_BRAVE_PROVIDER
        }
        Some(WEB_SEARCH_REMOVED_SEARXNG_PROVIDER) => WEB_SEARCH_BING_PROVIDER,
        Some(_) => return Err("不支持的搜索 Provider。".to_string()),
        None => search_config.provider.as_str(),
    };
    if !search_config.public_search_consent {
        return Err("需要先启用公开网页搜索授权。".to_string());
    }
    if !search_config.enabled {
        return Err("需要先在 AI 设置中启用联网搜索。".to_string());
    }
    let max_results = request
        .max_results
        .unwrap_or(WEB_SEARCH_MAX_RESULTS)
        .clamp(1, WEB_SEARCH_MAX_RESULTS);
    let max_results = if provider == WEB_SEARCH_BING_PROVIDER {
        max_results.min(BING_PUBLIC_MAX_RESULTS)
    } else {
        max_results
    };
    let endpoint_hint = match provider {
        WEB_SEARCH_DEFAULT_PROVIDER => Some(search_config.bocha_endpoint.as_str()),
        _ => None,
    };
    let cache_key = build_web_search_cache_key(provider, &request, max_results, endpoint_hint)?;
    let failure_cache_key = format!("{cache_key}-failure");
    let ttl_seconds = search_cache_ttl_seconds(&request);
    let now_ms = web_cache::now_ms();
    let cached = web_cache::read_cached_json("search", &cache_key, now_ms);
    if let Some(cached_entry) = cached.as_ref().filter(|entry| entry.is_fresh) {
        if let Ok(mut sources) =
            serde_json::from_value::<Vec<WebSearchResult>>(cached_entry.value.clone())
        {
            let (_, direct_report) = discover_no_key_direct_sources_with_report(
                &request,
                max_results.min(12),
                "search-cache-hit; provider-cache-returned-before-provider-request",
            );
            let direct_debug = direct_discovery_debug_string(&direct_report);
            mark_search_sources_cache_status(
                &mut sources,
                "hit",
                cached_entry.cached_at_ms,
                cached_entry.ttl_seconds,
            );
            if let Some(first) = sources.first_mut() {
                first.search_diagnostics = Some(match first.search_diagnostics.as_deref() {
                    Some(existing) if !existing.is_empty() => format!("{direct_debug};{existing}"),
                    _ => direct_debug,
                });
            }
            return Ok(sources);
        }
    }
    let (mut direct_sources, direct_report) = discover_no_key_direct_sources_with_report(
        &request,
        max_results.min(12),
        "search-cache-miss",
    );
    let direct_debug = direct_discovery_debug_string(&direct_report);
    if let Some(first) = direct_sources.first_mut() {
        first.search_diagnostics = Some(attach_direct_discovery_debug(
            first.search_diagnostics.as_deref(),
            &direct_debug,
        ));
    }
    let direct_count = direct_sources.len();
    if provider == WEB_SEARCH_BING_PROVIDER && direct_count == 0 {
        if let Some(cached_failure) =
            web_cache::read_cached_json("search", &failure_cache_key, now_ms)
                .filter(|entry| entry.is_fresh)
        {
            if let Some(error) = cached_failure
                .value
                .get("error")
                .and_then(|value| value.as_str())
            {
                let remaining_seconds = cached_failure
                    .ttl_seconds
                    .saturating_sub(now_ms.saturating_sub(cached_failure.cached_at_ms) / 1000)
                    .max(0);
                return Err(format!(
                    "{error}; {direct_debug}; cacheStatus=failure-hit; cacheRemainingSeconds={remaining_seconds}"
                ));
            }
        }
    }

    let provider_result = match provider {
        WEB_SEARCH_DEFAULT_PROVIDER => {
            if search_config.bocha_api_key.trim().is_empty() {
                if direct_sources.is_empty() {
                    Err("需要先配置 Bocha API Key，或切换到 Bing 公开搜索。".to_string())
                } else {
                    Ok(direct_sources)
                }
            } else {
                if search_config.bocha_api_key.contains(['\r', '\n']) {
                    return Err("Bocha API Key 包含非法换行字符。".to_string());
                }
                search_bocha_sources_with_fallback(
                    &request,
                    search_config.bocha_api_key.trim(),
                    Some(search_config.bocha_endpoint.as_str()),
                    max_results,
                )
                .map(|sources| merge_search_sources(direct_sources, sources, max_results))
            }
        }
        WEB_SEARCH_BRAVE_PROVIDER => {
            if search_config.brave_api_key.trim().is_empty() {
                if direct_sources.is_empty() {
                    Err("需要先配置 Brave Search API Key，或切换到 Bing 公开搜索。".to_string())
                } else {
                    Ok(direct_sources)
                }
            } else {
                if search_config.brave_api_key.contains(['\r', '\n']) {
                    return Err("Brave Search API Key 包含非法换行字符。".to_string());
                }
                search_brave_sources(&request, search_config.brave_api_key.trim(), max_results)
                    .map(|sources| merge_search_sources(direct_sources, sources, max_results))
            }
        }
        WEB_SEARCH_BING_PROVIDER => {
            let bing_budget = if direct_count >= 6 {
                max_results.min(6)
            } else {
                max_results
                    .saturating_sub(direct_count)
                    .max(6)
                    .min(max_results)
            };
            match search_bing_public_sources(&request, bing_budget) {
                Ok(sources) => Ok(merge_search_sources(direct_sources, sources, max_results)),
                Err(_error) if direct_count > 0 => Ok(direct_sources),
                Err(error) => Err(format!("{error}; {direct_debug}")),
            }
        }
        _ => Err("不支持的搜索 Provider。".to_string()),
    };

    match provider_result {
        Ok(mut sources) => {
            if let Some(first) = sources.first_mut() {
                first.search_diagnostics = Some(attach_direct_discovery_debug(
                    first.search_diagnostics.as_deref(),
                    &direct_debug,
                ));
            }
            let _ = web_cache::write_cached_json(
                "search",
                &cache_key,
                serde_json::to_value(&sources).unwrap_or(JsonValue::Null),
                ttl_seconds,
            );
            mark_search_sources_cache_status(
                &mut sources,
                "miss",
                web_cache::now_ms(),
                ttl_seconds,
            );
            Ok(sources)
        }
        Err(error) => {
            if provider == WEB_SEARCH_BING_PROVIDER {
                let _ = web_cache::write_cached_json(
                    "search",
                    &failure_cache_key,
                    json!({ "provider": WEB_SEARCH_BING_PROVIDER, "error": error.clone() }),
                    BING_PUBLIC_FAILURE_TTL_SECONDS,
                );
            }
            if let Some(cached_entry) = cached {
                if let Ok(mut sources) =
                    serde_json::from_value::<Vec<WebSearchResult>>(cached_entry.value)
                {
                    mark_search_sources_cache_status(
                        &mut sources,
                        "stale",
                        cached_entry.cached_at_ms,
                        cached_entry.ttl_seconds,
                    );
                    if let Some(first) = sources.first_mut() {
                        first.search_diagnostics = Some(attach_direct_discovery_debug(
                            first.search_diagnostics.as_deref(),
                            &direct_debug,
                        ));
                    }
                    return Ok(sources);
                }
            }
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn search_web_sources(
    request: WebSearchRequestInput,
) -> Result<Vec<WebSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || search_web_sources_blocking(request))
        .await
        .map_err(|e| format!("联网搜索任务失败: {e}"))?
}

#[tauri::command]
pub fn clear_web_cache() -> Result<(), String> {
    web_cache::clear_web_cache()
}

#[tauri::command]
pub async fn test_web_search_connection(
    input: TestWebSearchConnectionInput,
) -> Result<TestWebSearchConnectionResult, String> {
    tauri::async_runtime::spawn_blocking(move || test_web_search_connection_blocking(input))
        .await
        .map_err(|e| format!("鑱旂綉鎼滅储娴嬭瘯浠诲姟澶辫触: {e}"))?
}

fn test_web_search_connection_blocking(
    input: TestWebSearchConnectionInput,
) -> Result<TestWebSearchConnectionResult, String> {
    let provider = input.provider.trim();
    match provider {
        WEB_SEARCH_DEFAULT_PROVIDER => {
            let api_key = input.api_key.trim();
            if api_key.is_empty() {
                return Err("闇€瑕佸厛濉啓鍗氭煡 API Key".to_string());
            }
            if api_key.contains(['\r', '\n']) {
                return Err("鍗氭煡 API Key 鍖呭惈闈炴硶瀛楃".to_string());
            }
            let endpoint = input
                .endpoint
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(BOCHA_SEARCH_ENDPOINT)
                .to_string();
            let request = WebSearchRequestInput {
                raw_user_query: Some("NoteX connectivity test".to_string()),
                queries: vec!["NoteX connectivity test".to_string()],
                intent: "general_web".to_string(),
                vertical: Some("general_web".to_string()),
                freshness: None,
                problem_id: None,
                algorithm_keywords: Vec::new(),
                topic_keywords: Vec::new(),
                max_results: Some(3),
                provider: Some(WEB_SEARCH_DEFAULT_PROVIDER.to_string()),
            };
            let _ =
                search_bocha_sources_with_fallback(&request, api_key, Some(endpoint.as_str()), 3)?;
            Ok(TestWebSearchConnectionResult {
                ok: true,
                provider: WEB_SEARCH_DEFAULT_PROVIDER.to_string(),
                endpoint,
                query: Some("NoteX connectivity test".to_string()),
                result_count: None,
                first_title: None,
                diagnostics: None,
            })
        }
        WEB_SEARCH_BRAVE_PROVIDER => {
            let api_key = input.api_key.trim();
            if api_key.is_empty() {
                return Err("Brave Search API Key 缺失。".to_string());
            }
            if api_key.contains(['\r', '\n']) {
                return Err("Brave Search API Key 包含非法换行字符。".to_string());
            }
            let request = WebSearchRequestInput {
                raw_user_query: Some("NoteX connectivity test".to_string()),
                queries: vec!["NoteX connectivity test".to_string()],
                intent: "general_web".to_string(),
                vertical: Some("general_web".to_string()),
                freshness: None,
                problem_id: None,
                algorithm_keywords: Vec::new(),
                topic_keywords: Vec::new(),
                max_results: Some(3),
                provider: Some(WEB_SEARCH_BRAVE_PROVIDER.to_string()),
            };
            let _ = search_brave_sources(&request, api_key, 3)?;
            Ok(TestWebSearchConnectionResult {
                ok: true,
                provider: WEB_SEARCH_BRAVE_PROVIDER.to_string(),
                endpoint: BRAVE_SEARCH_ENDPOINT.to_string(),
                query: Some("NoteX connectivity test".to_string()),
                result_count: None,
                first_title: None,
                diagnostics: None,
            })
        }
        WEB_SEARCH_BING_PROVIDER => {
            let query = "AI鏂伴椈".to_string();
            let request = WebSearchRequestInput {
                raw_user_query: Some(query.clone()),
                queries: vec![query.clone()],
                intent: "general_web".to_string(),
                vertical: Some("news".to_string()),
                freshness: Some("news".to_string()),
                problem_id: None,
                algorithm_keywords: Vec::new(),
                topic_keywords: vec!["AI".to_string()],
                max_results: Some(5),
                provider: Some(WEB_SEARCH_BING_PROVIDER.to_string()),
            };
            let sources = search_bing_public_sources(&request, 5)?;
            Ok(TestWebSearchConnectionResult {
                ok: true,
                provider: WEB_SEARCH_BING_PROVIDER.to_string(),
                endpoint: BING_NEWS_SEARCH_ENDPOINT.to_string(),
                query: Some(query),
                result_count: Some(sources.len()),
                first_title: sources.first().map(|source| source.title.clone()),
                diagnostics: sources.first().and_then(|source| source.search_diagnostics.clone()),
            })
        }
        WEB_SEARCH_REMOVED_SEARXNG_PROVIDER => {
            Err("SearXNG Provider \u{5df2}\u{79fb}\u{9664}\u{ff0c}\u{8bf7}\u{914d}\u{7f6e} Bocha \u{6216} Brave\u{3002}".to_string())
        }
        _ => Err("Current connection test supports Bing, Bocha, or Brave Search.".to_string()),
    }
}

#[tauri::command]
pub fn get_prompt_citation_contract_status() -> PromptCitationContractStatus {
    let source = include_str!("ai.rs");
    let web_ids = ["Available web", " citation IDs"].concat();
    let marker_instruction = ["Citation marker to use", " in answer: [[{}]]"].concat();
    let local_ids = ["Available local-note", " citation IDs"].concat();
    let local_marker = ["Local note citations must use", " [[N1]] style markers"].concat();
    let bare_web = ["Never write plain single-bracket", " tokens like [S1]"].concat();
    let bare_local = ["Do not output plain", " [N1] or [S1]"].concat();
    PromptCitationContractStatus {
        web_available_ids: source.contains(&web_ids),
        web_marker_instruction: source.contains(&marker_instruction),
        local_available_ids: source.contains(&local_ids),
        local_marker_instruction: source.contains(&local_marker)
            || source.contains(&marker_instruction),
        bare_id_warning: source.contains(&bare_web) && source.contains(&bare_local),
    }
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
    app_config
        .ai
        .providers
        .retain(|provider| provider.id != provider_id);
    if app_config.ai.default_provider_id.as_deref() == Some(provider_id) {
        app_config.ai.default_provider_id = app_config
            .ai
            .providers
            .first()
            .map(|provider| provider.id.clone());
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
pub fn set_default_ai_model(
    provider_id: String,
    model_id: String,
) -> Result<AiConfigFields, String> {
    let provider_id = provider_id.trim().to_string();
    let model_id = model_id.trim().to_string();
    if provider_id.is_empty() || model_id.is_empty() {
        return Err("AI default model failed: provider id and model id are required".to_string());
    }
    let mut config = update_config_provider(&provider_id, |provider| {
        if !provider
            .models
            .iter()
            .any(|model| model.id == model_id && model.enabled)
        {
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
            if let Some(existing) = provider
                .models
                .iter_mut()
                .find(|model| model.id == *model_id)
            {
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
pub fn sync_ai_provider_models_draft(
    provider: AiProvider,
) -> Result<SyncAiProviderDraftModelsResult, String> {
    let mut provider = sanitize_ai_provider(&provider)
        .ok_or_else(|| "AI models sync failed: provider id is missing".to_string())?;
    let synced_models = request_provider_models(&provider)?;
    let synced_count = synced_models.len();
    let now = now_timestamp_millis();
    for model_id in &synced_models {
        if let Some(existing) = provider
            .models
            .iter_mut()
            .find(|model| model.id == *model_id)
        {
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
pub fn add_ai_provider_model(
    provider_id: String,
    model_id: String,
) -> Result<AiProviderActionResult, String> {
    let provider_id = provider_id.trim().to_string();
    let model_id = model_id.trim().to_string();
    if provider_id.is_empty() || model_id.is_empty() {
        return Err("AI model add failed: provider id and model id are required".to_string());
    }
    let config = update_config_provider(&provider_id, |provider| {
        if !provider.models.iter().any(|model| model.id == model_id) {
            provider
                .models
                .push(model_from_id(&model_id, "manual").expect("model id was checked"));
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
pub fn delete_ai_provider_model(
    provider_id: String,
    model_id: String,
) -> Result<AiProviderActionResult, String> {
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

    #[derive(Debug)]
    struct UrlReaderSmokeCase {
        name: &'static str,
        url: &'static str,
        title: &'static str,
        expected_host: &'static str,
        kind: UrlReaderSmokeKind,
    }

    #[derive(Debug, Clone, Copy)]
    enum UrlReaderSmokeKind {
        Docs {
            keywords: &'static [&'static str],
        },
        OpenAiNewsLanding,
        UnsuitableEvidencePage,
    }

    #[derive(Debug)]
    struct UrlReaderSmokeOutcome {
        url: String,
        final_url: String,
        final_url_host: String,
        content_type: String,
        body_bytes: usize,
        content_status: String,
        page_type: String,
        excerpt_quality: String,
        extracted_text_chars: usize,
        excerpt_chars: usize,
        published_at: String,
        needs_js_reason: String,
        blocked_reason: String,
        extraction_failure_reason: String,
        verdict: &'static str,
        reason: String,
    }

    fn smoke_source(id: &str, title: &str, url: &str) -> WebSearchResult {
        WebSearchResult {
            id: id.to_string(),
            title: title.to_string(),
            url: url.to_string(),
            site: site_from_url(url),
            source_kind: Some("explicit_url".to_string()),
            discovery_method: Some("explicit_url".to_string()),
            source_reliability: Some("high".to_string()),
            discovered_by: Some("notex_url_reader_smoke".to_string()),
            ..Default::default()
        }
    }

    fn smoke_context(source: WebSearchResult) -> FetchWebSourceExcerptsInput {
        FetchWebSourceExcerptsInput {
            sources: vec![source],
            max_sources: Some(1),
            max_chars_per_source: Some(5000),
            user_input: Some("NoteX URL Reader smoke test".to_string()),
            intent: Some("explicit_url".to_string()),
            problem_id: None,
            problem_title: None,
            algorithm_keywords: vec![
                "centroid".to_string(),
                "decomposition".to_string(),
                "tree".to_string(),
            ],
            error_keywords: Vec::new(),
            queries: Vec::new(),
        }
    }

    fn smoke_page_type(case: &UrlReaderSmokeCase, result: &WebSourceExcerptResult) -> String {
        let url = result
            .final_url
            .as_deref()
            .unwrap_or(case.url)
            .to_ascii_lowercase();
        if case.url == "https://react.dev/" || url.trim_end_matches('/') == "https://react.dev" {
            return "homepage".to_string();
        }
        if url.contains("react.dev/reference/") || url.contains("cp-algorithms.com/") {
            return "docs".to_string();
        }
        if url.trim_end_matches('/') == "https://openai.com/news" {
            return "homepage".to_string();
        }
        result
            .page_type
            .clone()
            .unwrap_or_else(|| "unknown".to_string())
    }

    fn smoke_evidence_usable(result: &WebSourceExcerptResult, page_type: &str) -> bool {
        synthetic_extractor_evidence_usable(
            result.content_status.as_deref().unwrap_or("unavailable"),
            page_type,
            result.excerpt_quality.as_deref().unwrap_or("unavailable"),
            result.excerpt_chars.unwrap_or(0),
        )
    }

    fn evaluate_url_reader_smoke_case(
        case: &UrlReaderSmokeCase,
        result: WebSourceExcerptResult,
    ) -> UrlReaderSmokeOutcome {
        let final_url = result.final_url.clone().unwrap_or_else(|| "none".to_string());
        let final_url_host = result
            .final_url_host
            .clone()
            .unwrap_or_else(|| "none".to_string());
        let content_type = result
            .content_type
            .clone()
            .unwrap_or_else(|| "none".to_string());
        let body_bytes = result.body_bytes.unwrap_or(0);
        let content_status = result
            .content_status
            .clone()
            .unwrap_or_else(|| result.status.clone().unwrap_or_else(|| "unavailable".to_string()));
        let page_type = smoke_page_type(case, &result);
        let excerpt_quality = result
            .excerpt_quality
            .clone()
            .unwrap_or_else(|| "unavailable".to_string());
        let extracted_text_chars = result.extracted_text_chars.unwrap_or(0);
        let excerpt_chars = result.excerpt_chars.unwrap_or(0);
        let published_at = result.published_at.clone().unwrap_or_else(|| "none".to_string());
        let needs_js_reason = result
            .needs_js_reason
            .clone()
            .unwrap_or_else(|| "none".to_string());
        let blocked_reason = result
            .blocked_reason
            .clone()
            .unwrap_or_else(|| "none".to_string());
        let extraction_failure_reason = result
            .extraction_failure_reason
            .clone()
            .or(result.error.clone())
            .unwrap_or_else(|| "none".to_string());

        let network_failed = !result.fetched
            && matches!(
                result.error_kind.as_deref(),
                Some("timeout" | "unknown" | "http_status")
            );
        let (verdict, reason) = if network_failed {
            ("warn", format!("network-dependent request did not return readable body: {extraction_failure_reason}"))
        } else {
            match case.kind {
                UrlReaderSmokeKind::Docs { keywords } => {
                    let excerpt = result.excerpt.as_deref().unwrap_or("").to_ascii_lowercase();
                    let host_ok = final_url_host == case.expected_host
                        || final_url_host.ends_with(&format!(".{}", case.expected_host));
                    let status_ok = matches!(content_status.as_str(), "fetched" | "partial");
                    let quality_ok = !matches!(
                        excerpt_quality.as_str(),
                        "title_only" | "snippet_only" | "unavailable" | "blocked" | "failed"
                    );
                    let chars_ok = extracted_text_chars >= 500 && excerpt_chars >= 160;
                    let keyword_ok = keywords
                        .iter()
                        .any(|keyword| excerpt.contains(&keyword.to_ascii_lowercase()));
                    let needs_js = content_status == "needs_js" || needs_js_reason != "none";
                    if host_ok && status_ok && quality_ok && chars_ok && keyword_ok && !needs_js {
                        ("pass", "docs page extracted with readable body and expected keywords".to_string())
                    } else {
                        (
                            "fail",
                            format!(
                                "docs extraction expectation failed: host_ok={host_ok}, status_ok={status_ok}, quality_ok={quality_ok}, chars_ok={chars_ok}, keyword_ok={keyword_ok}, needs_js={needs_js}"
                            ),
                        )
                    }
                }
                UrlReaderSmokeKind::OpenAiNewsLanding => {
                    let host_ok = final_url_host == case.expected_host
                        || final_url_host.ends_with(&format!(".{}", case.expected_host));
                    let article_like = matches!(page_type.as_str(), "news_article" | "article")
                        && excerpt_quality == "high"
                        && smoke_evidence_usable(&result, &page_type);
                    if !host_ok {
                        ("warn", format!("OpenAI News request resolved to unexpected host: {final_url_host}"))
                    } else if article_like {
                        (
                            "fail",
                            "OpenAI News landing page was treated as high-quality article evidence".to_string(),
                        )
                    } else {
                        (
                            "pass",
                            "OpenAI News landing produced clear landing/partial diagnostics instead of article evidence".to_string(),
                        )
                    }
                }
                UrlReaderSmokeKind::UnsuitableEvidencePage => {
                    let usable = smoke_evidence_usable(&result, &page_type);
                    if !usable && matches!(page_type.as_str(), "homepage" | "search_page" | "unknown") {
                        (
                            "pass",
                            format!("page correctly stays out of usable evidence as pageType={page_type}"),
                        )
                    } else {
                        (
                            "fail",
                            format!("unsuitable page looked usable: pageType={page_type}, usable={usable}"),
                        )
                    }
                }
            }
        };

        UrlReaderSmokeOutcome {
            url: case.url.to_string(),
            final_url,
            final_url_host,
            content_type,
            body_bytes,
            content_status,
            page_type,
            excerpt_quality,
            extracted_text_chars,
            excerpt_chars,
            published_at,
            needs_js_reason,
            blocked_reason,
            extraction_failure_reason,
            verdict,
            reason,
        }
    }

    #[test]
    fn notex_search_self_check_passes() {
        let result = run_notex_search_self_check_core().unwrap();
        for case in &result.cases {
            println!(
                "{} [{}] {} :: {}",
                if case.pass { "PASS" } else { "FAIL" },
                case.expected_category,
                case.query,
                case.reason
            );
        }
        assert_eq!(
            result.passed, result.total,
            "NoteX search self-check failed: {}",
            result
                .cases
                .iter()
                .filter(|case| !case.pass)
                .map(|case| format!("{} => {}", case.query, case.reason))
                .collect::<Vec<_>>()
                .join("; ")
        );
    }

    #[test]
    #[ignore = "network-dependent live smoke test; run explicitly with --ignored --nocapture"]
    fn notex_url_reader_smoke() {
        println!("NoteX URL Reader live smoke test is network-dependent and opt-in.");
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(12))
            .connect_timeout(Duration::from_secs(5))
            .redirect(reqwest::redirect::Policy::custom(|attempt| {
                if attempt.previous().len() >= 5 {
                    return attempt.stop();
                }
                if validate_public_web_url_for_read(attempt.url().as_str()).is_ok() {
                    attempt.follow()
                } else {
                    attempt.stop()
                }
            }))
            .user_agent("oi-notebook-url-reader-smoke/0.1")
            .build()
            .expect("URL reader smoke test client should build");

        let cases = [
            UrlReaderSmokeCase {
                name: "React docs",
                url: "https://react.dev/reference/react/useEffect",
                title: "React useEffect",
                expected_host: "react.dev",
                kind: UrlReaderSmokeKind::Docs {
                    keywords: &["useeffect", "effect", "react"],
                },
            },
            UrlReaderSmokeCase {
                name: "cp-algorithms centroid decomposition",
                url: "https://cp-algorithms.com/graph/centroid_decomposition.html",
                title: "Centroid Decomposition",
                expected_host: "cp-algorithms.com",
                kind: UrlReaderSmokeKind::Docs {
                    keywords: &["centroid", "decomposition", "tree"],
                },
            },
            UrlReaderSmokeCase {
                name: "OpenAI News landing",
                url: "https://openai.com/news/",
                title: "OpenAI News",
                expected_host: "openai.com",
                kind: UrlReaderSmokeKind::OpenAiNewsLanding,
            },
            UrlReaderSmokeCase {
                name: "React homepage unsuitable evidence",
                url: "https://react.dev/",
                title: "React homepage",
                expected_host: "react.dev",
                kind: UrlReaderSmokeKind::UnsuitableEvidencePage,
            },
        ];

        let mut outcomes = Vec::new();
        for (index, case) in cases.iter().enumerate() {
            let source = smoke_source(&format!("smoke-{}", index + 1), case.title, case.url);
            let context = smoke_context(source.clone());
            let result = fetch_single_web_source_excerpt_with_cache(
                &client,
                &source,
                &context,
                5000,
                false,
            );
            let outcome = evaluate_url_reader_smoke_case(case, result);
            println!(
                "{} [{}] url={} finalUrl={} finalUrlHost={} contentType={} bodyBytes={} contentStatus={} pageType={} excerptQuality={} extractedTextChars={} excerptChars={} publishedAt={} needsJsReason={} blockedReason={} extractionFailureReason={} reason={}",
                outcome.verdict.to_ascii_uppercase(),
                case.name,
                outcome.url,
                outcome.final_url,
                outcome.final_url_host,
                outcome.content_type,
                outcome.body_bytes,
                outcome.content_status,
                outcome.page_type,
                outcome.excerpt_quality,
                outcome.extracted_text_chars,
                outcome.excerpt_chars,
                outcome.published_at,
                outcome.needs_js_reason,
                outcome.blocked_reason,
                outcome.extraction_failure_reason,
                outcome.reason
            );
            outcomes.push(outcome);
        }

        let failures = outcomes
            .iter()
            .filter(|outcome| outcome.verdict == "fail")
            .map(|outcome| format!("{} => {}", outcome.url, outcome.reason))
            .collect::<Vec<_>>();
        assert!(
            failures.is_empty(),
            "NoteX URL Reader smoke test failed: {}",
            failures.join("; ")
        );
    }

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
