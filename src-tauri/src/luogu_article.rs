use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

use crate::luogu::{read_config, require_luogu_config};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LuoguArticleMetadata {
    pub lid: Option<String>,
    pub title: String,
    pub category: i64,
    pub status: i64,
    pub top: i64,
    pub solution_for: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LuoguArticleSnapshot {
    pub metadata: LuoguArticleMetadata,
    pub content: String,
    pub can_edit: bool,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareLuoguArticlePushInput {
    pub lid: Option<String>,
    pub title: String,
    pub category: i64,
    pub status: i64,
    pub top: i64,
    pub solution_for: String,
    pub body: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushLuoguArticleInput {
    pub lid: Option<String>,
    pub title: String,
    pub category: i64,
    pub status: i64,
    pub top: i64,
    pub solution_for: String,
    pub body: String,
    pub expected_remote_content: Option<String>,
}

fn luogu_cookie(uid: &str, client_id: &str) -> String {
    format!("_uid={uid}; __client_id={client_id}")
}

fn article_url(lid: &str) -> String {
    format!("https://www.luogu.com/article/{lid}")
}

fn article_edit_url(lid: &str) -> String {
    format!("https://www.luogu.com/article/{lid}/edit")
}

fn article_submit_url(lid: Option<&str>) -> String {
    match lid {
        Some(lid) => format!("https://www.luogu.com.cn/article/{lid}/editSubmit"),
        None => "https://www.luogu.com.cn/article/_newSubmit".to_string(),
    }
}

fn article_submit_referer(lid: Option<&str>) -> String {
    match lid {
        Some(lid) => format!("https://www.luogu.com.cn/article/{lid}/edit"),
        None => "https://www.luogu.com.cn/".to_string(),
    }
}

fn normalize_article_category(category: i64) -> i64 {
    if category > 0 {
        category
    } else {
        1
    }
}

fn normalize_article_status(status: i64) -> i64 {
    if status > 0 {
        status
    } else {
        2
    }
}

fn normalize_article_solution_for(category: i64, solution_for: &str) -> String {
    if normalize_article_category(category) == 2 {
        let trimmed = solution_for.trim();
        if !trimmed.is_empty() && trimmed.chars().all(|ch| ch.is_ascii_digit()) {
            return format!("P{trimmed}");
        }
        let mut chars = trimmed.chars();
        if matches!(chars.next(), Some('p' | 'P')) && chars.all(|ch| ch.is_ascii_digit()) {
            return format!("P{}", &trimmed[1..]);
        }
        trimmed.to_string()
    } else {
        String::new()
    }
}

fn submitted_article_snapshot(lid: &str, input: &PushLuoguArticleInput) -> LuoguArticleSnapshot {
    LuoguArticleSnapshot {
        metadata: LuoguArticleMetadata {
            lid: Some(lid.to_string()),
            title: input.title.clone(),
            category: normalize_article_category(input.category),
            status: normalize_article_status(input.status),
            top: input.top,
            solution_for: normalize_article_solution_for(input.category, &input.solution_for),
        },
        content: input.body.clone(),
        can_edit: true,
        url: Some(article_url(lid)),
    }
}

fn request_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("Luogu article sync failed: cannot create HTTP client: {e}"))
}

fn csrf_token_from_html(html: &str) -> Result<String, String> {
    let marker = r#"<meta name="csrf-token" content=""#;
    let start = html
        .find(marker)
        .ok_or_else(|| "Luogu article sync failed: csrf token not found".to_string())?
        + marker.len();
    let end = html[start..]
        .find('"')
        .ok_or_else(|| "Luogu article sync failed: csrf token not found".to_string())?
        + start;
    Ok(html[start..end].to_string())
}

fn lentille_context_json(html: &str) -> Result<serde_json::Value, String> {
    let marker = r#"<script id="lentille-context" type="application/json">"#;
    let start = html
        .find(marker)
        .ok_or_else(|| "Luogu article sync failed: lentille context not found".to_string())?
        + marker.len();
    let end = html[start..]
        .find("</script>")
        .ok_or_else(|| "Luogu article sync failed: lentille context not found".to_string())?
        + start;
    serde_json::from_str(&html[start..end])
        .map_err(|e| format!("Luogu article sync failed: cannot parse lentille context: {e}"))
}

fn status_error(scope: &str, status: StatusCode) -> String {
    match status {
        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
            format!("{scope}: Luogu Cookie 可能已失效，请重新复制 _uid 和 __client_id。")
        }
        StatusCode::NOT_FOUND => format!("{scope}: 远端文章不存在"),
        _ => format!("{scope}: server returned HTTP {}", status.as_u16()),
    }
}

fn status_error_with_body(scope: &str, status: StatusCode, body: &str) -> String {
    if let Some(error) = submit_response_error(body) {
        return error;
    }

    let base = status_error(scope, status);
    let snippet: String = body.chars().take(240).collect();
    if snippet.trim().is_empty() {
        base
    } else {
        format!("{base}: {}", snippet.trim())
    }
}

fn submit_response_error(body: &str) -> Option<String> {
    let value = serde_json::from_str::<serde_json::Value>(body).ok()?;
    let status = value.get("status").and_then(|v| v.as_i64())?;
    if status < 400 {
        return None;
    }

    let message = value
        .get("errorMessage")
        .or_else(|| value.get("message"))
        .or_else(|| value.get("error"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("Luogu returned an error");
    let field_details = value
        .get("errorData")
        .and_then(|data| data.get("fields"))
        .and_then(|fields| fields.as_array())
        .map(|fields| {
            fields
                .iter()
                .filter_map(|field| {
                    let name = field.get("name").and_then(|v| v.as_str())?;
                    let field_message = field
                        .get("message")
                        .and_then(|v| v.as_str())
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or("Invalid value");
                    let value = field
                        .get("value")
                        .and_then(|v| {
                            v.as_str()
                                .map(str::to_string)
                                .or_else(|| Some(v.to_string()))
                        })
                        .unwrap_or_default();
                    if value.is_empty() {
                        Some(format!("{name}: {field_message}"))
                    } else {
                        Some(format!("{name}={value}: {field_message}"))
                    }
                })
                .collect::<Vec<_>>()
                .join("; ")
        })
        .filter(|details| !details.is_empty());
    let suffix = field_details
        .map(|details| format!(" {details}"))
        .unwrap_or_default();
    Some(format!(
        "Luogu article sync failed: server returned status {status}: {message}{suffix}"
    ))
}

fn read_article_snapshot_from_html(html: &str) -> Result<LuoguArticleSnapshot, String> {
    let ctx = lentille_context_json(html)?;
    let article = ctx
        .get("data")
        .and_then(|data| data.get("article"))
        .ok_or_else(|| "Luogu article sync failed: article payload missing".to_string())?;

    let lid = article
        .get("lid")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let title = article
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let content = article
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let can_edit = article
        .get("canEdit")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let category = article
        .get("category")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let status = article.get("status").and_then(|v| v.as_i64()).unwrap_or(0);
    let top = article.get("top").and_then(|v| v.as_i64()).unwrap_or(2);
    let solution_for = article
        .get("solutionFor")
        .and_then(|v| {
            v.get("pid")
                .and_then(|pid| pid.as_str())
                .map(|pid| pid.to_string())
                .or_else(|| v.as_str().map(|pid| pid.to_string()))
        })
        .unwrap_or_default();

    Ok(LuoguArticleSnapshot {
        metadata: LuoguArticleMetadata {
            lid: lid.clone(),
            title,
            category,
            status,
            top,
            solution_for,
        },
        content,
        can_edit,
        url: lid.as_deref().map(article_url),
    })
}

fn article_lid_from_submit_response(body: &str) -> Result<String, String> {
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        let candidates = [
            value.get("lid"),
            value.get("data").and_then(|data| data.get("lid")),
            value
                .get("data")
                .and_then(|data| data.get("article"))
                .and_then(|article| article.get("lid")),
            value.get("article").and_then(|article| article.get("lid")),
        ];
        if let Some(lid) = candidates
            .into_iter()
            .flatten()
            .find_map(|candidate| candidate.as_str().map(str::to_string))
        {
            return Ok(lid);
        }
    }

    if let Some(start) = body.find("/article/") {
        let rest = &body[start + "/article/".len()..];
        let lid: String = rest
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric())
            .collect();
        if !lid.is_empty() {
            return Ok(lid);
        }
    }

    Err("Luogu article sync failed: cannot find article id in submit response".to_string())
}

fn fetch_article_html(url: &str, cookie: Option<String>) -> Result<String, String> {
    let client = request_client()?;
    let mut request = client.get(url);
    if let Some(cookie) = cookie {
        request = request.header(reqwest::header::COOKIE, cookie);
    }

    let response = request
        .send()
        .map_err(|e| format!("Luogu article sync failed: network error: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(status_error("Luogu article sync failed", status));
    }

    response
        .text()
        .map_err(|e| format!("Luogu article sync failed: cannot read response body: {e}"))
}

fn article_snapshot_with_cookie(
    lid: &str,
    cookie: Option<String>,
    edit: bool,
) -> Result<LuoguArticleSnapshot, String> {
    let url = if edit {
        article_edit_url(lid)
    } else {
        article_url(lid)
    };
    let html = fetch_article_html(&url, cookie)?;
    read_article_snapshot_from_html(&html)
}

#[tauri::command]
pub fn get_luogu_article(lid: String) -> Result<LuoguArticleSnapshot, String> {
    article_snapshot_with_cookie(&lid, None, false)
}

#[tauri::command]
pub fn prepare_luogu_article_push(
    input: PrepareLuoguArticlePushInput,
) -> Result<LuoguArticleSnapshot, String> {
    let config = read_config()?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let cookie = luogu_cookie(uid, client_id);

    if let Some(lid) = input.lid.as_deref() {
        article_snapshot_with_cookie(lid, Some(cookie), true)
    } else {
        Ok(LuoguArticleSnapshot {
            metadata: LuoguArticleMetadata {
                lid: None,
                title: input.title,
                category: normalize_article_category(input.category),
                status: normalize_article_status(input.status),
                top: input.top,
                solution_for: normalize_article_solution_for(input.category, &input.solution_for),
            },
            content: input.body,
            can_edit: true,
            url: Some(article_submit_referer(None)),
        })
    }
}

#[tauri::command]
pub fn push_luogu_article(input: PushLuoguArticleInput) -> Result<LuoguArticleSnapshot, String> {
    let config = read_config()?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let cookie = luogu_cookie(uid, client_id);
    let client = request_client()?;
    let target = article_submit_url(input.lid.as_deref());
    let referer = article_submit_referer(input.lid.as_deref());
    let html = if let Some(lid) = input.lid.as_deref() {
        fetch_article_html(&article_edit_url(lid), Some(cookie.clone()))?
    } else {
        fetch_article_html("https://www.luogu.com.cn/", Some(cookie.clone()))?
    };
    let csrf = csrf_token_from_html(&html)?;

    if let (Some(_lid), Some(expected_remote_content)) = (
        input.lid.as_deref(),
        input.expected_remote_content.as_deref(),
    ) {
        let current_snapshot = read_article_snapshot_from_html(&html)?;
        if current_snapshot.content != expected_remote_content {
            return Err("Luogu article sync failed: remote article has changed".to_string());
        }
    }

    let payload = serde_json::json!({
        "title": input.title,
        "category": normalize_article_category(input.category),
        "content": input.body,
        "solutionFor": normalize_article_solution_for(input.category, &input.solution_for),
        "status": normalize_article_status(input.status),
        "top": input.top,
        "csrf-token": csrf,
    });

    let response = client
        .post(target)
        .header(reqwest::header::COOKIE, cookie.clone())
        .header(reqwest::header::REFERER, referer)
        .header("X-CSRF-TOKEN", csrf)
        .json(&payload)
        .send()
        .map_err(|e| format!("Luogu article sync failed: network error: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .map_err(|e| format!("Luogu article sync failed: cannot read response body: {e}"))?;
    if !status.is_success() {
        return Err(status_error_with_body(
            "Luogu article sync failed",
            status,
            &body,
        ));
    }
    if let Some(error) = submit_response_error(&body) {
        return Err(error);
    }

    let lid = input
        .lid
        .as_deref()
        .map(str::to_string)
        .or_else(|| article_lid_from_submit_response(&body).ok())
        .ok_or_else(|| "Luogu article sync failed: cannot find created article id".to_string())?;
    Ok(submitted_article_snapshot(&lid, &input))
}

#[tauri::command]
pub fn pull_luogu_article(lid: String) -> Result<LuoguArticleSnapshot, String> {
    let config = read_config()?;
    let (uid, client_id) = require_luogu_config(&config)?;
    let cookie = luogu_cookie(uid, client_id);
    article_snapshot_with_cookie(&lid, Some(cookie), true)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_HTML: &str = r#"
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta name="csrf-token" content="token-123">
</head>
<body>
  <script id="lentille-context" type="application/json">{"data":{"article":{"lid":"s58xwevf","title":"Remote title","category":1,"content":"Body","status":0,"top":2,"solutionFor":{"pid":"P1234"},"canEdit":true}}}</script>
</body>
</html>
"#;

    #[test]
    fn extracts_csrf_token_from_html() {
        assert_eq!(csrf_token_from_html(SAMPLE_HTML).unwrap(), "token-123");
    }

    #[test]
    fn parses_article_snapshot_from_lentille_context() {
        let snapshot = read_article_snapshot_from_html(SAMPLE_HTML).unwrap();
        assert_eq!(snapshot.metadata.lid.as_deref(), Some("s58xwevf"));
        assert_eq!(snapshot.metadata.title, "Remote title");
        assert_eq!(snapshot.metadata.category, 1);
        assert_eq!(snapshot.metadata.status, 0);
        assert_eq!(snapshot.metadata.top, 2);
        assert_eq!(snapshot.metadata.solution_for, "P1234");
        assert_eq!(snapshot.content, "Body");
        assert!(snapshot.can_edit);
        assert_eq!(
            snapshot.url.as_deref(),
            Some("https://www.luogu.com/article/s58xwevf")
        );
    }

    #[test]
    fn builds_article_urls_on_luogu_com_domain() {
        assert_eq!(
            article_url("s58xwevf"),
            "https://www.luogu.com/article/s58xwevf"
        );
        assert_eq!(
            article_edit_url("s58xwevf"),
            "https://www.luogu.com/article/s58xwevf/edit"
        );
    }

    #[test]
    fn builds_article_submit_urls_on_luogu_cn_domain() {
        assert_eq!(
            article_submit_url(None),
            "https://www.luogu.com.cn/article/_newSubmit"
        );
        assert_eq!(
            article_submit_url(Some("s58xwevf")),
            "https://www.luogu.com.cn/article/s58xwevf/editSubmit"
        );
        assert_eq!(article_submit_referer(None), "https://www.luogu.com.cn/");
        assert_eq!(
            article_submit_referer(Some("s58xwevf")),
            "https://www.luogu.com.cn/article/s58xwevf/edit"
        );
    }

    #[test]
    fn normalizes_invalid_article_submit_fields() {
        assert_eq!(normalize_article_category(0), 1);
        assert_eq!(normalize_article_category(2), 2);
        assert_eq!(normalize_article_status(0), 2);
        assert_eq!(normalize_article_status(1), 1);
        assert_eq!(normalize_article_solution_for(1, "P1001"), "");
        assert_eq!(normalize_article_solution_for(2, " P1001 "), "P1001");
        assert_eq!(normalize_article_solution_for(2, "1114"), "P1114");
    }

    #[test]
    fn builds_submitted_article_snapshot_from_input() {
        let input = PushLuoguArticleInput {
            lid: None,
            title: "Created title".to_string(),
            category: 2,
            status: 2,
            top: 2,
            solution_for: "1114".to_string(),
            body: "Created body".to_string(),
            expected_remote_content: None,
        };

        let snapshot = submitted_article_snapshot("created123", &input);
        assert_eq!(snapshot.metadata.lid.as_deref(), Some("created123"));
        assert_eq!(snapshot.metadata.title, "Created title");
        assert_eq!(snapshot.metadata.category, 2);
        assert_eq!(snapshot.metadata.status, 2);
        assert_eq!(snapshot.metadata.top, 2);
        assert_eq!(snapshot.metadata.solution_for, "P1114");
        assert_eq!(snapshot.content, "Created body");
        assert!(snapshot.can_edit);
        assert_eq!(
            snapshot.url.as_deref(),
            Some("https://www.luogu.com/article/created123")
        );
    }

    #[test]
    fn extracts_article_lid_from_submit_response() {
        assert_eq!(
            article_lid_from_submit_response(
                r#"{"status":200,"data":{"article":{"lid":"abc123"}}}"#
            )
            .unwrap(),
            "abc123"
        );
        assert_eq!(
            article_lid_from_submit_response(r#"{"status":200,"data":{"lid":"def456"}}"#).unwrap(),
            "def456"
        );
        assert_eq!(
            article_lid_from_submit_response(
                r#"{"redirect":"https://www.luogu.com.cn/article/ghi789"}"#
            )
            .unwrap(),
            "ghi789"
        );
    }

    #[test]
    fn includes_response_body_snippet_for_server_errors() {
        assert_eq!(
            status_error_with_body(
                "Luogu article sync failed",
                StatusCode::INTERNAL_SERVER_ERROR,
                "bad payload"
            ),
            "Luogu article sync failed: server returned HTTP 500: bad payload"
        );
    }

    #[test]
    fn parses_luogu_form_errors_from_http_error_body() {
        assert_eq!(
            status_error_with_body(
                "Luogu article sync failed",
                StatusCode::BAD_REQUEST,
                r#"{"status":400,"errorMessage":"Form is not valid.","errorData":{"fields":[{"name":"status","value":"0","message":"Invalid value"}]}}"#
            ),
            "Luogu article sync failed: server returned status 400: Form is not valid. status=0: Invalid value"
        );
    }

    #[test]
    fn detects_business_errors_in_submit_response() {
        assert_eq!(
            submit_response_error(r#"{"status":500,"errorMessage":"invalid csrf"}"#).as_deref(),
            Some("Luogu article sync failed: server returned status 500: invalid csrf")
        );
        assert!(submit_response_error(r#"{"status":200,"data":{"lid":"abc123"}}"#).is_none());
    }

    #[test]
    fn includes_luogu_form_field_errors_in_submit_response() {
        assert_eq!(
            submit_response_error(
                r#"{"status":400,"errorMessage":"Form is not valid.","errorData":{"fields":[{"name":"category","value":"0","message":"Invalid value"}]}}"#
            )
            .as_deref(),
            Some("Luogu article sync failed: server returned status 400: Form is not valid. category=0: Invalid value")
        );
    }

    #[test]
    fn maps_status_codes_to_stable_errors() {
        assert!(
            status_error("Luogu article sync failed", StatusCode::UNAUTHORIZED)
                .contains("Cookie 可能已失效")
        );
        assert_eq!(
            status_error("Luogu article sync failed", StatusCode::NOT_FOUND),
            "Luogu article sync failed: 远端文章不存在"
        );
        assert_eq!(
            status_error("Luogu article sync failed", StatusCode::BAD_GATEWAY),
            "Luogu article sync failed: server returned HTTP 502"
        );
    }

    #[test]
    fn detects_remote_content_changes_before_push() {
        let input = PushLuoguArticleInput {
            lid: Some("s58xwevf".to_string()),
            title: "Remote title".to_string(),
            category: 1,
            status: 0,
            top: 2,
            solution_for: "P1234".to_string(),
            body: "new body".to_string(),
            expected_remote_content: Some("different body".to_string()),
        };

        let err = if let Some(expected) = input.expected_remote_content.as_deref() {
            let snapshot = read_article_snapshot_from_html(SAMPLE_HTML).unwrap();
            if snapshot.content != expected {
                Err("Luogu article sync failed: remote article has changed".to_string())
            } else {
                Ok(())
            }
        } else {
            Ok(())
        };

        assert_eq!(
            err.unwrap_err(),
            "Luogu article sync failed: remote article has changed"
        );
    }
}
