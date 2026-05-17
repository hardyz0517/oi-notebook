const EXCERPT_MIN_GOOD_CHARS: usize = 700;
const EXCERPT_MIN_PARTIAL_CHARS: usize = 160;
const CODE_BLOCK_MAX_CHARS: usize = 900;

pub const EXTRACTOR_VERSION: &str = "public-html-relevant-v2";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebExtractContext {
    pub url: String,
    pub title: String,
    pub snippet: Option<String>,
    pub source_type: Option<String>,
    pub reliability: Option<String>,
    pub user_input: Option<String>,
    pub intent: Option<String>,
    pub problem_id: Option<String>,
    pub problem_title: Option<String>,
    pub algorithm_keywords: Vec<String>,
    pub error_keywords: Vec<String>,
    pub queries: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebExtractResult {
    pub text: Option<String>,
    pub quality: &'static str,
    pub extractor: &'static str,
    pub reason: String,
    pub code_blocks_truncated: bool,
}

#[derive(Debug, Clone)]
struct Chunk {
    text: String,
    score: i32,
    index: usize,
}

pub fn extract_web_excerpt(
    url: &str,
    content_type: &str,
    body: &str,
    context: &WebExtractContext,
    max_chars: usize,
) -> WebExtractResult {
    if content_type.contains("text/plain") {
        return extract_plain_text_excerpt(body, context, max_chars);
    }

    let lower_url = url.to_ascii_lowercase();
    if lower_url.contains("oi-wiki.org") {
        return extract_site_excerpt(body, context, max_chars, "oi_wiki", &OI_WIKI_MAIN_HINTS);
    }
    if lower_url.contains("cp-algorithms.com") || lower_url.contains("e-maxx.ru") {
        return extract_site_excerpt(
            body,
            context,
            max_chars,
            "cp_algorithms",
            &CP_ALGORITHMS_MAIN_HINTS,
        );
    }
    if lower_url.contains("luogu.com.cn/problem/") {
        return extract_luogu_excerpt(body, context, max_chars);
    }
    extract_generic_excerpt(body, context, max_chars)
}

const OI_WIKI_MAIN_HINTS: &[&str] = &[
    "md-content__inner",
    "md-typeset",
    "theme-default-content",
    "markdown-body",
    "article",
    "main",
    "content",
];

const CP_ALGORITHMS_MAIN_HINTS: &[&str] = &[
    "md-content__inner",
    "md-typeset",
    "article",
    "main",
    "content",
    "page-content",
];

const GENERIC_MAIN_HINTS: &[&str] = &[
    "article",
    "post-content",
    "entry-content",
    "markdown-body",
    "main",
    "content",
    "post",
];

const LUOGU_MAIN_HINTS: &[&str] = &[
    "problem-content",
    "solution-content",
    "markdown-body",
    "lg-article",
    "article",
    "main",
];

fn extract_plain_text_excerpt(
    body: &str,
    context: &WebExtractContext,
    max_chars: usize,
) -> WebExtractResult {
    let text = normalize_text(body);
    let selected = select_relevant_chunks(&text, context, max_chars, false);
    quality_result(selected, "generic", "plain text source")
}

fn extract_site_excerpt(
    html: &str,
    context: &WebExtractContext,
    max_chars: usize,
    extractor: &'static str,
    hints: &[&str],
) -> WebExtractResult {
    let (main_html, used_main) = pick_main_html(html, hints);
    let (text, code_truncated) = html_to_structured_text(&main_html, true);
    let selected = select_relevant_chunks(&text, context, max_chars, should_weight_code(context));
    let reason = if used_main {
        "site main content extracted"
    } else {
        "site extractor fell back to cleaned page text"
    };
    let mut result = quality_result(selected, extractor, reason);
    result.code_blocks_truncated = code_truncated || result.code_blocks_truncated;
    result
}

fn extract_luogu_excerpt(
    html: &str,
    context: &WebExtractContext,
    max_chars: usize,
) -> WebExtractResult {
    let (main_html, used_main) = pick_main_html(html, LUOGU_MAIN_HINTS);
    if !used_main {
        return WebExtractResult {
            text: None,
            quality: "blocked",
            extractor: "luogu",
            reason: "Luogu page body is unavailable in static HTML or requires page rendering"
                .to_string(),
            code_blocks_truncated: false,
        };
    }
    let (text, code_truncated) = html_to_structured_text(&main_html, true);
    let selected = select_relevant_chunks(&text, context, max_chars, should_weight_code(context));
    if selected.chars().count() < EXCERPT_MIN_PARTIAL_CHARS {
        return WebExtractResult {
            text: None,
            quality: "blocked",
            extractor: "luogu",
            reason: "Luogu public HTML did not expose enough readable problem or solution text"
                .to_string(),
            code_blocks_truncated: code_truncated,
        };
    }
    let mut result = quality_result(selected, "luogu", "Luogu static readable content extracted");
    result.code_blocks_truncated = code_truncated || result.code_blocks_truncated;
    result
}

fn extract_generic_excerpt(
    html: &str,
    context: &WebExtractContext,
    max_chars: usize,
) -> WebExtractResult {
    let (main_html, used_main) = pick_main_html(html, GENERIC_MAIN_HINTS);
    let (text, code_truncated) = html_to_structured_text(&main_html, true);
    let selected = select_relevant_chunks(&text, context, max_chars, should_weight_code(context));
    let reason = if used_main {
        "generic main content extracted"
    } else {
        "generic cleaned page text extracted"
    };
    let mut result = quality_result(selected, "generic", reason);
    result.code_blocks_truncated = code_truncated || result.code_blocks_truncated;
    result
}

fn quality_result(text: String, extractor: &'static str, reason: &str) -> WebExtractResult {
    let count = text.chars().count();
    let quality = if count >= EXCERPT_MIN_GOOD_CHARS {
        "good"
    } else if count >= EXCERPT_MIN_PARTIAL_CHARS {
        "partial"
    } else {
        "empty"
    };
    WebExtractResult {
        text: if quality == "empty" { None } else { Some(text) },
        quality,
        extractor,
        reason: reason.to_string(),
        code_blocks_truncated: false,
    }
}

fn pick_main_html(html: &str, hints: &[&str]) -> (String, bool) {
    let cleaned = remove_low_value_html(html);
    for hint in hints {
        if let Some(container) = extract_container_by_hint(&cleaned, hint) {
            if container.chars().count() > 300 {
                return (container, true);
            }
        }
    }
    (cleaned, false)
}

fn remove_low_value_html(html: &str) -> String {
    let mut cleaned = strip_comments(html);
    for tag in [
        "script", "style", "nav", "footer", "header", "aside", "iframe", "noscript", "svg",
        "canvas", "form",
    ] {
        cleaned = strip_html_tag_blocks(cleaned, tag);
    }
    for hint in [
        "toc",
        "sidebar",
        "comment",
        "comments",
        "advert",
        "ads",
        "recommend",
        "related",
        "copyright",
        "footer",
        "header",
        "navbar",
        "menu",
        "breadcrumb",
        "pagination",
    ] {
        cleaned = strip_attribute_hint_blocks(cleaned, hint);
    }
    cleaned
}

fn strip_comments(html: &str) -> String {
    let mut result = html.to_string();
    loop {
        let Some(start) = result.find("<!--") else {
            break;
        };
        let Some(relative_end) = result[start + 4..].find("-->") else {
            result.replace_range(start..result.len(), " ");
            break;
        };
        let end = start + 4 + relative_end + 3;
        result.replace_range(start..end, " ");
    }
    result
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

fn strip_attribute_hint_blocks(mut html: String, hint: &str) -> String {
    loop {
        let lower = html.to_ascii_lowercase();
        let Some(hint_index) = lower.find(hint) else {
            break;
        };
        let Some(start) = lower[..hint_index].rfind('<') else {
            break;
        };
        let tag_name = lower[start + 1..]
            .split(|ch: char| ch.is_whitespace() || ch == '>' || ch == '/')
            .next()
            .unwrap_or("");
        if tag_name.is_empty() || matches!(tag_name, "html" | "body" | "main" | "article") {
            break;
        }
        let end_tag = format!("</{tag_name}>");
        if let Some(relative_end) = lower[hint_index..].find(&end_tag) {
            let end = hint_index + relative_end + end_tag.len();
            html.replace_range(start..end, " ");
        } else if let Some(relative_close) = lower[hint_index..].find('>') {
            let end = hint_index + relative_close + 1;
            html.replace_range(start..end, " ");
        } else {
            break;
        }
    }
    html
}

fn extract_container_by_hint(html: &str, hint: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let hint_index = lower.find(hint)?;
    let start = lower[..hint_index].rfind('<')?;
    let tag_name = lower[start + 1..]
        .split(|ch: char| ch.is_whitespace() || ch == '>' || ch == '/')
        .next()
        .unwrap_or("");
    if tag_name.is_empty() {
        return None;
    }
    let close = format!("</{tag_name}>");
    let relative_end = lower[hint_index..].find(&close)?;
    let end = hint_index + relative_end + close.len();
    Some(html[start..end].to_string())
}

fn html_to_structured_text(html: &str, keep_code: bool) -> (String, bool) {
    let mut text = String::with_capacity(html.len());
    let mut tag = String::new();
    let mut in_tag = false;
    let mut in_code = false;
    let mut current_code = String::new();
    let mut code_truncated = false;

    for ch in html.chars() {
        if ch == '<' {
            if in_code && !current_code.is_empty() {
                text.push_str(&flush_code_block(&current_code, &mut code_truncated));
                current_code.clear();
            }
            in_tag = true;
            tag.clear();
            continue;
        }
        if in_tag {
            if ch == '>' {
                let name = tag
                    .trim()
                    .trim_start_matches('/')
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();
                let closing = tag.trim_start().starts_with('/');
                if matches!(name.as_str(), "pre" | "code") {
                    in_code = keep_code && !closing;
                    if closing {
                        text.push('\n');
                    }
                }
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
                        | "h1"
                        | "h2"
                        | "h3"
                        | "h4"
                        | "h5"
                        | "tr"
                        | "table"
                ) {
                    text.push('\n');
                }
                in_tag = false;
            } else if tag.len() < 160 {
                tag.push(ch);
            }
            continue;
        }
        if in_code {
            current_code.push(ch);
        } else {
            text.push(ch);
        }
    }
    if in_code && !current_code.is_empty() {
        text.push_str(&flush_code_block(&current_code, &mut code_truncated));
    }
    (normalize_text(&decode_html_entities(&text)), code_truncated)
}

fn flush_code_block(code: &str, code_truncated: &mut bool) -> String {
    let normalized = decode_html_entities(code)
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut kept = trimmed
        .chars()
        .take(CODE_BLOCK_MAX_CHARS)
        .collect::<String>();
    if trimmed.chars().count() > CODE_BLOCK_MAX_CHARS {
        *code_truncated = true;
        kept.push_str("\n[code block truncated]");
    }
    format!("\n[code]\n{kept}\n[/code]\n")
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

fn normalize_text(text: &str) -> String {
    let mut lines = Vec::new();
    let mut previous = String::new();
    for line in text.lines() {
        let normalized = line.split_whitespace().collect::<Vec<_>>().join(" ");
        let trimmed = normalized.trim();
        if trimmed.len() < 2 {
            continue;
        }
        let lower = trimmed.to_ascii_lowercase();
        if is_low_value_line(&lower) || trimmed == previous {
            continue;
        }
        previous = trimmed.to_string();
        lines.push(trimmed.to_string());
    }
    lines.join("\n")
}

fn is_low_value_line(lower: &str) -> bool {
    lower.contains("copyright")
        || lower.contains("all rights reserved")
        || lower.contains("powered by")
        || lower.contains("cookie")
        || lower.contains("privacy policy")
        || lower.contains("terms of service")
        || lower.contains("advertisement")
        || lower.contains("sponsored")
        || lower.contains("recommended")
        || lower.contains("related articles")
        || lower.contains("share this")
        || lower.contains("sign in")
        || lower.contains("log in")
}

fn select_relevant_chunks(
    text: &str,
    context: &WebExtractContext,
    max_chars: usize,
    weight_code: bool,
) -> String {
    let lines = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    let keywords = build_keywords(context);
    let mut chunks = Vec::new();
    for (index, window) in lines.chunks(2).enumerate() {
        let chunk_text = window.join("\n");
        let score = score_chunk(&chunk_text, &keywords, context, weight_code);
        chunks.push(Chunk {
            text: chunk_text,
            score,
            index,
        });
    }

    chunks.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.index.cmp(&b.index)));
    let min_score = if keywords.is_empty() { 0 } else { 2 };
    let mut selected = chunks
        .iter()
        .filter(|chunk| chunk.score >= min_score)
        .take(8)
        .cloned()
        .collect::<Vec<_>>();
    if selected.is_empty() {
        selected = chunks.into_iter().take(8).collect::<Vec<_>>();
    }
    selected.sort_by_key(|chunk| chunk.index);

    let mut result = String::new();
    for chunk in selected {
        if result.chars().count() >= max_chars {
            break;
        }
        if !result.is_empty() {
            result.push_str("\n---\n");
        }
        result.push_str(&chunk.text);
    }
    if result.chars().count() > max_chars {
        let mut truncated = result.chars().take(max_chars).collect::<String>();
        truncated.push_str("...");
        truncated
    } else {
        result
    }
}

fn score_chunk(
    text: &str,
    keywords: &[String],
    context: &WebExtractContext,
    weight_code: bool,
) -> i32 {
    let lower = text.to_ascii_lowercase();
    let mut score = 0;
    for keyword in keywords {
        if !keyword.is_empty() && lower.contains(keyword) {
            score += if keyword.len() >= 4 { 5 } else { 3 };
        }
    }
    for keyword in [
        "wa",
        "tle",
        "re",
        "mle",
        "pitfall",
        "注意",
        "常见",
        "复杂度",
        "实现",
        "边界",
        "初始化",
        "递归",
        "code",
        "implementation",
        "complexity",
    ] {
        if lower.contains(&keyword.to_ascii_lowercase()) {
            score += 2;
        }
    }
    if is_news_context(context) {
        for keyword in ["recent", "latest", "news", "today", "update", "announce"] {
            if lower.contains(keyword) {
                score += 3;
            }
        }
        if lower.contains("[code]") {
            score -= 8;
        }
    } else if weight_code && lower.contains("[code]") {
        score += 4;
    }
    if lower.len() < 80 {
        score -= 2;
    }
    score
}

fn build_keywords(context: &WebExtractContext) -> Vec<String> {
    let mut values = Vec::new();
    for value in [
        context.user_input.as_deref(),
        context.problem_id.as_deref(),
        context.problem_title.as_deref(),
        context.title.as_str().into(),
        context.snippet.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        push_keyword_tokens(&mut values, value);
    }
    for value in context
        .algorithm_keywords
        .iter()
        .chain(context.error_keywords.iter())
        .chain(context.queries.iter())
    {
        push_keyword_tokens(&mut values, value);
    }
    values.sort();
    values.dedup();
    values
}

fn push_keyword_tokens(values: &mut Vec<String>, text: &str) {
    for token in text
        .split(|ch: char| {
            ch.is_whitespace()
                || matches!(
                    ch,
                    ',' | '.' | ';' | ':' | '/' | '\\' | '|' | '(' | ')' | '[' | ']' | '{' | '}'
                )
        })
        .map(str::trim)
        .filter(|token| token.chars().count() >= 2)
    {
        let lower = token.to_ascii_lowercase();
        if !is_stop_token(&lower) {
            values.push(lower);
        }
    }
}

fn is_stop_token(token: &str) -> bool {
    matches!(
        token,
        "http"
            | "https"
            | "www"
            | "com"
            | "html"
            | "wiki"
            | "blog"
            | "source"
            | "search"
            | "result"
            | "latest"
            | "recent"
            | "news"
    )
}

fn should_weight_code(context: &WebExtractContext) -> bool {
    !is_news_context(context)
        && (context
            .user_input
            .as_deref()
            .unwrap_or("")
            .to_ascii_lowercase()
            .contains("实现")
            || context.error_keywords.iter().any(|keyword| {
                matches!(keyword.to_ascii_uppercase().as_str(), "WA" | "TLE" | "RE" | "MLE")
            }))
}

fn is_news_context(context: &WebExtractContext) -> bool {
    let haystack = [
        context.intent.as_deref().unwrap_or(""),
        context.user_input.as_deref().unwrap_or(""),
        &context.queries.join(" "),
    ]
    .join(" ")
    .to_ascii_lowercase();
    ["news", "recent", "latest", "today", "update", "announce"]
        .iter()
        .any(|keyword| haystack.contains(keyword))
        || haystack.contains("新闻")
        || haystack.contains("最近")
        || haystack.contains("最新")
}
