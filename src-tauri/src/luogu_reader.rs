use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReadLuoguProblemContentInput {
    pub problem_id: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReadLuoguProblemContentResult {
    pub problem_id: String,
    pub kind: String,
    pub url: String,
    pub fetched: bool,
    pub status: String,
    pub title: String,
    pub excerpt: String,
    pub excerpt_chars: usize,
    pub source_role: String,
    pub luogu_cookie_used: bool,
    pub luogu_cookie_available: bool,
    pub permission_required: bool,
    pub error: Option<String>,
}

pub(crate) fn read_luogu_problem_content_blocking(
    input: ReadLuoguProblemContentInput,
    cookie_config: Option<(&str, &str)>,
) -> Result<ReadLuoguProblemContentResult, String> {
    let problem_id = normalize_luogu_problem_id_for_read(&input.problem_id)?;
    let kind = normalize_luogu_read_kind(&input.kind);
    let cookie_available = cookie_config.is_some();
    let client = luogu_http_client()?;

    let (status, body) = send_luogu_content_request(&client, &problem_id, &kind, None)?;
    let mut cookie_used = false;
    let (status, body) = if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        if let Some((uid, client_id)) = cookie_config {
            cookie_used = true;
            send_luogu_content_request(
                &client,
                &problem_id,
                &kind,
                Some(luogu_cookie(uid, client_id)),
            )?
        } else {
            return Ok(luogu_permission_result(
                &problem_id,
                &kind,
                cookie_available,
                false,
                "Luogu login state is unavailable or permission is insufficient.".to_string(),
            ));
        }
    } else {
        (status, body)
    };

    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Ok(luogu_permission_result(
            &problem_id,
            &kind,
            cookie_available,
            cookie_used,
            "Luogu login state is unavailable or permission is insufficient.".to_string(),
        ));
    }
    if !status.is_success() {
        return Ok(ReadLuoguProblemContentResult {
            problem_id: problem_id.clone(),
            kind: kind.clone(),
            url: luogu_problem_display_url(&problem_id, &kind),
            fetched: false,
            status: "http_non_2xx".to_string(),
            title: String::new(),
            excerpt: String::new(),
            excerpt_chars: 0,
            source_role: luogu_source_role(&kind),
            luogu_cookie_used: cookie_used,
            luogu_cookie_available: cookie_available,
            permission_required: false,
            error: Some(format!(
                "Luogu reader failed: server returned HTTP {}",
                status.as_u16()
            )),
        });
    }

    match extract_luogu_content(&problem_id, &kind, &body) {
        Ok((title, excerpt)) => {
            let excerpt = excerpt.chars().take(12_000).collect::<String>();
            Ok(ReadLuoguProblemContentResult {
                problem_id: problem_id.clone(),
                kind: kind.clone(),
                url: luogu_problem_display_url(&problem_id, &kind),
                fetched: true,
                status: "fetched".to_string(),
                title,
                excerpt_chars: excerpt.chars().count(),
                excerpt,
                source_role: luogu_source_role(&kind),
                luogu_cookie_used: cookie_used,
                luogu_cookie_available: cookie_available,
                permission_required: false,
                error: None,
            })
        }
        Err(error) => Ok(ReadLuoguProblemContentResult {
            problem_id: problem_id.clone(),
            kind: kind.clone(),
            url: luogu_problem_display_url(&problem_id, &kind),
            fetched: false,
            status: "parse_failed".to_string(),
            title: String::new(),
            excerpt: String::new(),
            excerpt_chars: 0,
            source_role: luogu_source_role(&kind),
            luogu_cookie_used: cookie_used,
            luogu_cookie_available: cookie_available,
            permission_required: false,
            error: Some(error),
        }),
    }
}

fn luogu_http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("oi-notebook/0.1")
        .build()
        .map_err(|e| format!("Luogu reader failed: cannot create HTTP client: {e}"))
}

fn luogu_cookie(uid: &str, client_id: &str) -> String {
    format!("_uid={uid}; __client_id={client_id}")
}

fn luogu_request_error(scope: &str, error: reqwest::Error) -> String {
    if error.is_timeout() {
        format!("{scope}: 请求超时")
    } else {
        format!("{scope}: 网络失败")
    }
}

fn normalize_luogu_problem_id_for_read(problem_id: &str) -> Result<String, String> {
    let trimmed = problem_id.trim().to_ascii_uppercase();
    if trimmed.len() < 4 || trimmed.len() > 7 || !trimmed.starts_with('P') {
        return Err("Luogu reader failed: problem_id must look like P1001".to_string());
    }
    if !trimmed[1..].chars().all(|ch| ch.is_ascii_digit()) {
        return Err("Luogu reader failed: problem_id must look like P1001".to_string());
    }
    Ok(trimmed)
}

fn normalize_luogu_read_kind(kind: &str) -> String {
    match kind.trim().to_ascii_lowercase().as_str() {
        "solution" | "solutions" | "editorial" => "solution".to_string(),
        "discussion" | "discuss" | "comments" => "discussion".to_string(),
        _ => "problem".to_string(),
    }
}

fn luogu_problem_content_url(problem_id: &str, kind: &str) -> String {
    match kind {
        "solution" => {
            format!("https://www.luogu.com.cn/problem/solution/{problem_id}?_contentOnly=1")
        }
        "discussion" => {
            format!("https://www.luogu.com.cn/discuss/lists?forumname={problem_id}&_contentOnly=1")
        }
        _ => format!("https://www.luogu.com.cn/problem/{problem_id}?_contentOnly=1"),
    }
}

fn luogu_problem_display_url(problem_id: &str, kind: &str) -> String {
    match kind {
        "solution" => format!("https://www.luogu.com.cn/problem/solution/{problem_id}"),
        "discussion" => format!("https://www.luogu.com.cn/discuss/lists?forumname={problem_id}"),
        _ => format!("https://www.luogu.com.cn/problem/{problem_id}"),
    }
}

fn luogu_source_role(kind: &str) -> String {
    match kind {
        "solution" => "community_solution".to_string(),
        "discussion" => "discussion_warning".to_string(),
        _ => "problem_statement".to_string(),
    }
}

fn luogu_permission_result(
    problem_id: &str,
    kind: &str,
    cookie_available: bool,
    cookie_used: bool,
    error: String,
) -> ReadLuoguProblemContentResult {
    ReadLuoguProblemContentResult {
        problem_id: problem_id.to_string(),
        kind: kind.to_string(),
        url: luogu_problem_display_url(problem_id, kind),
        fetched: false,
        status: "permission_required".to_string(),
        title: String::new(),
        excerpt: String::new(),
        excerpt_chars: 0,
        source_role: luogu_source_role(kind),
        luogu_cookie_used: cookie_used,
        luogu_cookie_available: cookie_available,
        permission_required: true,
        error: Some(error),
    }
}

fn html_entity_decode_minimal(value: &str) -> String {
    value
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#x22;", "\"")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&#39;", "'")
}

fn extract_luogu_lentille_json(html: &str) -> Option<JsonValue> {
    let marker = r#"<script id="lentille-context" type="application/json">"#;
    let start = html.find(marker)? + marker.len();
    let rest = &html[start..];
    let end = rest.find("</script>")?;
    let raw = html_entity_decode_minimal(rest[..end].trim());
    serde_json::from_str::<JsonValue>(&raw).ok()
}

fn luogu_json_text_at(value: &JsonValue, pointers: &[&str]) -> Option<String> {
    pointers
        .iter()
        .find_map(|pointer| value.pointer(pointer).and_then(JsonValue::as_str))
        .map(ToOwned::to_owned)
}

fn push_luogu_json_text(parts: &mut Vec<String>, label: &str, value: Option<String>) {
    if let Some(text) = value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
    {
        parts.push(format!("## {label}\n\n{text}"));
    }
}

fn collect_luogu_strings(value: &JsonValue, output: &mut Vec<String>, limit: usize) {
    if output.len() >= limit {
        return;
    }
    match value {
        JsonValue::String(text) => {
            let trimmed = text.trim();
            if trimmed.len() >= 8 {
                output.push(trimmed.to_string());
            }
        }
        JsonValue::Array(items) => {
            for item in items {
                collect_luogu_strings(item, output, limit);
                if output.len() >= limit {
                    break;
                }
            }
        }
        JsonValue::Object(map) => {
            for (key, item) in map {
                let key_lower = key.to_ascii_lowercase();
                if key_lower.contains("html")
                    || key_lower.contains("avatar")
                    || key_lower.contains("image")
                {
                    continue;
                }
                collect_luogu_strings(item, output, limit);
                if output.len() >= limit {
                    break;
                }
            }
        }
        _ => {}
    }
}

fn extract_luogu_problem_statement(problem_id: &str, json: &JsonValue) -> (String, String) {
    let problem = json
        .pointer("/data/problem")
        .or_else(|| json.pointer("/currentData/problem"))
        .unwrap_or(json);
    let title = luogu_json_text_at(problem, &["/name", "/contenu/name"])
        .unwrap_or_else(|| problem_id.to_string());
    let mut parts = vec![format!("# {problem_id} {title}")];
    let contenu = problem.pointer("/contenu").unwrap_or(problem);
    push_luogu_json_text(
        &mut parts,
        "Problem Background",
        luogu_json_text_at(contenu, &["/background"]),
    );
    push_luogu_json_text(
        &mut parts,
        "Problem Statement",
        luogu_json_text_at(contenu, &["/description"]),
    );
    push_luogu_json_text(
        &mut parts,
        "Input Format",
        luogu_json_text_at(contenu, &["/inputFormat", "/input"]),
    );
    push_luogu_json_text(
        &mut parts,
        "Output Format",
        luogu_json_text_at(contenu, &["/outputFormat", "/output"]),
    );
    push_luogu_json_text(&mut parts, "Hints", luogu_json_text_at(contenu, &["/hint"]));
    if let Some(samples) = contenu.pointer("/samples").and_then(JsonValue::as_array) {
        for (index, sample) in samples.iter().take(3).enumerate() {
            let input = luogu_json_text_at(sample, &["/input"]).unwrap_or_default();
            let output = luogu_json_text_at(sample, &["/output"]).unwrap_or_default();
            if !input.trim().is_empty() || !output.trim().is_empty() {
                parts.push(format!(
                    "## Sample {}\n\nInput:\n{}\n\nOutput:\n{}",
                    index + 1,
                    input.trim(),
                    output.trim()
                ));
            }
        }
    }
    (title, parts.join("\n\n"))
}

fn extract_luogu_generic_content(
    problem_id: &str,
    kind: &str,
    json: &JsonValue,
) -> (String, String) {
    let title = match kind {
        "solution" => format!("{problem_id} solutions"),
        "discussion" => format!("{problem_id} discussions"),
        _ => problem_id.to_string(),
    };
    let mut strings = Vec::new();
    collect_luogu_strings(json, &mut strings, 80);
    let filtered = strings
        .into_iter()
        .filter(|text| {
            let lower = text.to_ascii_lowercase();
            !lower.starts_with("http://")
                && !lower.starts_with("https://")
                && !lower.contains("fecdn.luogu")
                && text != problem_id
        })
        .take(24)
        .collect::<Vec<_>>();
    let body = if filtered.is_empty() {
        String::new()
    } else {
        format!("# {title}\n\n{}", filtered.join("\n\n"))
    };
    (title, body)
}

fn extract_luogu_content(
    problem_id: &str,
    kind: &str,
    body: &str,
) -> Result<(String, String), String> {
    let json = if body.trim_start().starts_with('{') {
        serde_json::from_str::<JsonValue>(body).ok()
    } else {
        extract_luogu_lentille_json(body)
    }
    .ok_or_else(|| {
        "Luogu reader failed: response did not contain readable JSON data".to_string()
    })?;

    let (title, excerpt) = if kind == "problem" {
        extract_luogu_problem_statement(problem_id, &json)
    } else {
        extract_luogu_generic_content(problem_id, kind, &json)
    };
    if excerpt.trim().len() < 80 {
        return Err("Luogu reader failed: extracted content is too short".to_string());
    }
    Ok((title, excerpt))
}

fn send_luogu_content_request(
    client: &reqwest::blocking::Client,
    problem_id: &str,
    kind: &str,
    cookie: Option<String>,
) -> Result<(StatusCode, String), String> {
    let mut request = client
        .get(luogu_problem_content_url(problem_id, kind))
        .header(reqwest::header::ACCEPT, "application/json, text/html")
        .header(
            reqwest::header::REFERER,
            luogu_problem_display_url(problem_id, "problem"),
        )
        .header(reqwest::header::ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9,en;q=0.7")
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .header(reqwest::header::PRAGMA, "no-cache");
    if let Some(cookie) = cookie {
        request = request.header(reqwest::header::COOKIE, cookie);
    }
    let response = request
        .send()
        .map_err(|e| luogu_request_error("Luogu reader failed", e))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|_| "Luogu reader failed: response body is unreadable".to_string())?;
    Ok((status, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_reader_problem_id_and_kind() {
        assert_eq!(
            normalize_luogu_problem_id_for_read(" p1001 ").unwrap(),
            "P1001"
        );
        assert!(normalize_luogu_problem_id_for_read("CF100A").is_err());
        assert_eq!(normalize_luogu_read_kind("solutions"), "solution");
        assert_eq!(normalize_luogu_read_kind("comments"), "discussion");
        assert_eq!(normalize_luogu_read_kind("problem"), "problem");
    }

    #[test]
    fn builds_reader_urls_and_roles() {
        assert_eq!(
            luogu_problem_content_url("P1001", "problem"),
            "https://www.luogu.com.cn/problem/P1001?_contentOnly=1"
        );
        assert_eq!(
            luogu_problem_content_url("P1001", "solution"),
            "https://www.luogu.com.cn/problem/solution/P1001?_contentOnly=1"
        );
        assert_eq!(
            luogu_problem_display_url("P1001", "discussion"),
            "https://www.luogu.com.cn/discuss/lists?forumname=P1001"
        );
        assert_eq!(luogu_source_role("problem"), "problem_statement");
        assert_eq!(luogu_source_role("solution"), "community_solution");
    }

    #[test]
    fn extracts_problem_content_from_json() {
        let body = serde_json::json!({
            "currentData": {
                "problem": {
                    "name": "A+B Problem",
                    "contenu": {
                        "background": "背景足够长，能够参与正文提取和预览。",
                        "description": "给定两个整数，输出它们的和。这里的描述足够长，避免被短内容过滤。",
                        "inputFormat": "输入包含两个整数 a 和 b。",
                        "outputFormat": "输出一个整数，表示 a+b。",
                        "samples": [{ "input": "1 2", "output": "3" }]
                    }
                }
            }
        })
        .to_string();

        let (title, excerpt) = extract_luogu_content("P1001", "problem", &body).unwrap();

        assert_eq!(title, "A+B Problem");
        assert!(excerpt.contains("# P1001 A+B Problem"));
        assert!(excerpt.contains("Problem Statement"));
        assert!(excerpt.contains("Sample 1"));
    }

    #[test]
    fn extracts_generic_content_from_lentille_html() {
        let json = serde_json::json!({
            "currentData": {
                "solutions": [
                    { "content": "这是一段足够长的题解正文，用来测试通用内容提取路径。" },
                    { "content": "https://fecdn.luogu.com.cn/avatar.png" },
                    { "author": { "name": "writer" } }
                ],
                "discussion": "另一段足够长的讨论内容，用来保证正文不会为空。"
            }
        })
        .to_string()
        .replace('"', "&quot;");
        let html = format!(
            r#"<html><script id="lentille-context" type="application/json">{json}</script></html>"#
        );

        let (title, excerpt) = extract_luogu_content("P1001", "solution", &html).unwrap();

        assert_eq!(title, "P1001 solutions");
        assert!(excerpt.contains("题解正文"));
        assert!(!excerpt.contains("fecdn.luogu"));
    }

    #[test]
    fn rejects_unreadable_or_too_short_reader_content() {
        assert!(extract_luogu_content("P1001", "problem", "not json")
            .unwrap_err()
            .contains("readable JSON"));
        assert!(
            extract_luogu_content("P1001", "solution", r#"{"data":"short"}"#)
                .unwrap_err()
                .contains("too short")
        );
    }
}
