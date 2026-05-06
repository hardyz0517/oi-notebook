use crate::paths;

use serde::Serialize;
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Component, Path, PathBuf},
    sync::Mutex,
    thread::{self, JoinHandle},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const BLOG_ADDR: &str = "127.0.0.1:4321";
const EXCERPT_LIMIT: usize = 180;
const API_NOTES_ROUTE: &str = "/api/notes";
const ASSET_ROUTE_PREFIX: &str = "/assets/";
const NOTE_ROUTE_PREFIX: &str = "/note/";
const KATEX_CSS_URL: &str = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css";
const KATEX_JS_URL: &str = "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js";
const KATEX_AUTO_RENDER_JS_URL: &str =
    "https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js";

#[derive(PartialEq)]
enum ListKind {
    Ordered,
    Unordered,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BlogNote {
    title: String,
    relative_path: String,
    summary: String,
    excerpt: String,
    tags: Vec<String>,
    category: String,
    created: Option<String>,
    updated: Option<String>,
    date: String,
    sort_key: String,
    draft: bool,
}

impl BlogNote {
    fn display_summary(&self) -> &str {
        if self.summary.is_empty() {
            &self.excerpt
        } else {
            &self.summary
        }
    }
}

#[derive(Debug, Serialize)]
struct BlogNotesApiResponse {
    notes: Vec<BlogNote>,
}

#[derive(Debug, Serialize)]
struct BlogErrorApiResponse<'a> {
    error: &'a str,
}

#[derive(Debug, Default)]
struct NoteFrontmatter {
    title: Option<String>,
    summary: Option<String>,
    tags: Vec<String>,
    updated: Option<String>,
    created: Option<String>,
    draft: bool,
}

#[derive(Debug, Clone)]
struct BlogNoteDetail {
    note: BlogNote,
    markdown_body: String,
}

#[derive(Debug, Clone)]
struct BlogAsset {
    path: PathBuf,
    content_type: &'static str,
}

pub(crate) struct ProductionBlogServer {
    handle: Mutex<Option<JoinHandle<()>>>,
}

impl ProductionBlogServer {
    pub(crate) fn new() -> Self {
        Self {
            handle: Mutex::new(None),
        }
    }

    pub(crate) fn ensure_running(&self) -> Result<(), String> {
        let mut handle_guard = self
            .handle
            .lock()
            .map_err(|e| format!("Failed to lock local blog server state: {e}"))?;

        if handle_guard.is_some() {
            return Ok(());
        }

        let listener = TcpListener::bind(BLOG_ADDR)
            .map_err(|e| format!("Failed to start local blog server at http://{BLOG_ADDR}: {e}"))?;

        let handle = thread::Builder::new()
            .name("oinb-blog-list-server".to_string())
            .spawn(move || {
                for stream in listener.incoming() {
                    match stream {
                        Ok(stream) => handle_connection(stream),
                        Err(e) => eprintln!("Local blog server connection failed: {e}"),
                    }
                }
            })
            .map_err(|e| format!("Failed to spawn local blog server thread: {e}"))?;

        *handle_guard = Some(handle);
        Ok(())
    }
}

fn handle_connection(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));

    let mut buffer = [0; 2048];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(bytes_read) => bytes_read,
        Err(e) => {
            eprintln!("Failed to read local blog request: {e}");
            return;
        }
    };

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let first_line = request.lines().next().unwrap_or("");
    let Some(path) = request_path(first_line) else {
        let body = render_error_page("Unsupported request.");
        write_response(&mut stream, 400, "Bad Request", &body);
        return;
    };

    if path == API_NOTES_ROUTE {
        match render_notes_api_json() {
            Ok(body) => write_json_response(&mut stream, 200, "OK", &body),
            Err(message) => {
                let body = render_json_error(&message);
                write_json_response(&mut stream, 500, "Internal Server Error", &body);
            }
        }
        return;
    }

    if path == "/" {
        let body = render_index_page();
        write_response(&mut stream, 200, "OK", &body);
        return;
    }

    if path.starts_with(ASSET_ROUTE_PREFIX) {
        match read_asset_response(path) {
            Ok((content_type, body)) => {
                write_binary_response(&mut stream, 200, "OK", content_type, &body)
            }
            Err(message) => {
                let body = render_404_page(&message);
                write_response(&mut stream, 404, "Not Found", &body);
            }
        }
        return;
    }

    if path.starts_with(NOTE_ROUTE_PREFIX) {
        match render_note_detail_page(path) {
            Ok(body) => write_response(&mut stream, 200, "OK", &body),
            Err(message) => {
                let body = render_404_page(&message);
                write_response(&mut stream, 404, "Not Found", &body);
            }
        }
        return;
    }

    let body =
        render_404_page("This preview server only serves /, /note/{path}, and /assets/{path}.");
    write_response(&mut stream, 404, "Not Found", &body);
}

fn request_path(first_line: &str) -> Option<&str> {
    let mut parts = first_line.split_whitespace();
    let method = parts.next()?;
    let path = parts.next()?;

    if method != "GET" {
        return None;
    }

    Some(path.split('?').next().unwrap_or(path))
}

fn render_index_page() -> String {
    match paths::notes_dir().and_then(|notes_dir| scan_notes_dir(&notes_dir)) {
        Ok(notes) => render_notes_page(&notes, None),
        Err(e) => render_notes_page(&[], Some(&e)),
    }
}

fn render_notes_api_json() -> Result<String, String> {
    let notes_dir = paths::notes_dir()?;
    let notes = scan_notes_dir(&notes_dir)?;
    serialize_notes_api_json(notes)
}

fn serialize_notes_api_json(notes: Vec<BlogNote>) -> Result<String, String> {
    serde_json::to_string(&BlogNotesApiResponse { notes })
        .map_err(|e| format!("Failed to serialize notes API response: {e}"))
}

fn render_json_error(message: &str) -> String {
    serde_json::to_string(&BlogErrorApiResponse { error: message })
        .unwrap_or_else(|_| r#"{"error":"Failed to serialize error response."}"#.to_string())
}

fn render_note_detail_page(request_path: &str) -> Result<String, String> {
    let notes_dir = paths::notes_dir()?;
    let note_path = resolve_note_request_path(&notes_dir, request_path)?;
    let detail = read_blog_note_detail(&notes_dir, &note_path)?;
    Ok(render_detail_page(&detail))
}

fn read_asset_response(request_path: &str) -> Result<(&'static str, Vec<u8>), String> {
    let notes_dir = paths::notes_dir()?;
    let asset = resolve_asset_request_path(&notes_dir, request_path)?;
    let body = fs::read(&asset.path)
        .map_err(|e| format!("Failed to read asset {}: {e}", asset.path.display()))?;

    Ok((asset.content_type, body))
}

fn scan_notes_dir(notes_dir: &Path) -> Result<Vec<BlogNote>, String> {
    if !notes_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut notes = Vec::new();
    collect_notes(notes_dir, notes_dir, &mut notes)?;
    notes.sort_by(|a, b| {
        b.sort_key
            .cmp(&a.sort_key)
            .then_with(|| a.relative_path.cmp(&b.relative_path))
    });
    Ok(notes)
}

fn collect_notes(root: &Path, dir: &Path, notes: &mut Vec<BlogNote>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read notes directory: {e}"))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read notes directory entry: {e}"))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Failed to read note file type: {e}"))?;

        if file_type.is_dir() {
            if is_assets_dir(root, &path) {
                continue;
            }
            collect_notes(root, &path, notes)?;
            continue;
        }

        if file_type.is_file() && is_markdown_file(&path) {
            notes.push(read_blog_note(root, &path)?);
        }
    }

    Ok(())
}

fn is_assets_dir(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root)
        .ok()
        .and_then(|relative| relative.components().next())
        .map(|component| component.as_os_str().eq_ignore_ascii_case("assets"))
        .unwrap_or(false)
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("md"))
        .unwrap_or(false)
}

fn read_blog_note(root: &Path, path: &Path) -> Result<BlogNote, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read note {}: {e}", path.display()))?;
    blog_note_from_content(root, path, &content)
}

fn read_blog_note_detail(root: &Path, path: &Path) -> Result<BlogNoteDetail, String> {
    let markdown = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read note {}: {e}", path.display()))?;
    let note = blog_note_from_content(root, path, &markdown)?;
    let (_frontmatter, body) = split_frontmatter(&markdown);

    Ok(BlogNoteDetail {
        note,
        markdown_body: body.to_string(),
    })
}

fn blog_note_from_content(root: &Path, path: &Path, content: &str) -> Result<BlogNote, String> {
    let (frontmatter, body) = split_frontmatter(&content);
    let parsed = frontmatter.map(parse_frontmatter).unwrap_or_default();
    let relative_path = note_relative_path(root, path);
    let category = note_category(&relative_path);
    let fallback_title = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let modified_key = modified_sort_key(path);
    let summary = parsed.summary.unwrap_or_default();
    let excerpt = if summary.is_empty() {
        excerpt_from_markdown(body)
    } else {
        summary.clone()
    };
    let updated = parsed.updated;
    let created = parsed.created;
    let date = updated
        .clone()
        .or(created.clone())
        .unwrap_or_else(|| modified_key.clone());
    let sort_key = updated
        .clone()
        .or(created.clone())
        .unwrap_or_else(|| modified_key.clone());

    Ok(BlogNote {
        title: parsed.title.unwrap_or(fallback_title),
        relative_path,
        summary,
        excerpt,
        tags: parsed.tags,
        category,
        created,
        updated,
        date,
        sort_key,
        draft: parsed.draft,
    })
}

fn resolve_note_request_path(notes_dir: &Path, request_path: &str) -> Result<PathBuf, String> {
    let encoded_path = request_path
        .strip_prefix(NOTE_ROUTE_PREFIX)
        .ok_or_else(|| "Unknown note route.".to_string())?;
    let relative_path = percent_decode_path(encoded_path)?;

    if !is_safe_note_relative_path(&relative_path) {
        return Err("Note path is not available.".to_string());
    }

    let candidate = notes_dir.join(Path::new(&relative_path));
    if !candidate.is_file() || !is_markdown_file(&candidate) {
        return Err("Note was not found.".to_string());
    }

    let root = notes_dir
        .canonicalize()
        .map_err(|e| format!("Could not verify notes directory: {e}"))?;
    let resolved = candidate
        .canonicalize()
        .map_err(|e| format!("Could not verify note path: {e}"))?;

    if !resolved.starts_with(&root) {
        return Err("Note path is not available.".to_string());
    }

    Ok(resolved)
}

fn resolve_asset_request_path(notes_dir: &Path, request_path: &str) -> Result<BlogAsset, String> {
    let encoded_path = request_path
        .strip_prefix(ASSET_ROUTE_PREFIX)
        .ok_or_else(|| "Unknown asset route.".to_string())?;
    let relative_path = percent_decode_path(encoded_path)?;

    if !is_safe_asset_request_relative_path(&relative_path) {
        return Err("Asset path is not available.".to_string());
    }

    let content_type = asset_content_type(&relative_path)
        .ok_or_else(|| "Asset type is not available.".to_string())?;
    let assets_dir = notes_dir.join("assets");
    let candidate = assets_dir.join(Path::new(&relative_path));

    if !candidate.is_file() {
        return Err("Asset was not found.".to_string());
    }

    let root = assets_dir
        .canonicalize()
        .map_err(|e| format!("Could not verify assets directory: {e}"))?;
    let resolved = candidate
        .canonicalize()
        .map_err(|e| format!("Could not verify asset path: {e}"))?;

    if !resolved.starts_with(&root) {
        return Err("Asset path is not available.".to_string());
    }

    Ok(BlogAsset {
        path: resolved,
        content_type,
    })
}

fn is_safe_note_relative_path(relative_path: &str) -> bool {
    if relative_path.is_empty()
        || relative_path.contains('\\')
        || relative_path.contains('\0')
        || !relative_path
            .rsplit('/')
            .next()
            .and_then(|file_name| Path::new(file_name).extension())
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.eq_ignore_ascii_case("md"))
            .unwrap_or(false)
    {
        return false;
    }

    let path = Path::new(relative_path);
    let mut components = path.components();
    let Some(first_component) = components.next() else {
        return false;
    };

    if matches!(
        first_component,
        Component::Prefix(_) | Component::RootDir | Component::CurDir | Component::ParentDir
    ) || first_component.as_os_str().eq_ignore_ascii_case("assets")
    {
        return false;
    }

    !components.any(|component| {
        matches!(
            component,
            Component::Prefix(_) | Component::RootDir | Component::CurDir | Component::ParentDir
        )
    })
}

fn is_safe_asset_request_relative_path(relative_path: &str) -> bool {
    if relative_path.is_empty() || relative_path.contains('\\') || relative_path.contains('\0') {
        return false;
    }

    let path = Path::new(relative_path);
    path.components()
        .all(|component| matches!(component, Component::Normal(_)))
}

fn asset_content_type(relative_path: &str) -> Option<&'static str> {
    let extension = Path::new(relative_path)
        .extension()
        .and_then(|extension| extension.to_str())?;

    match extension.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

fn note_detail_url(relative_path: &str) -> String {
    format!("{NOTE_ROUTE_PREFIX}{}", percent_encode_path(relative_path))
}

fn percent_encode_path(value: &str) -> String {
    let mut encoded = String::new();

    for byte in value.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                encoded.push(*byte as char)
            }
            byte => encoded.push_str(&format!("%{byte:02X}")),
        }
    }

    encoded
}

fn percent_decode_path(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("Note path is not valid.".to_string());
            }

            let high =
                hex_value(bytes[index + 1]).ok_or_else(|| "Note path is not valid.".to_string())?;
            let low =
                hex_value(bytes[index + 2]).ok_or_else(|| "Note path is not valid.".to_string())?;
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).map_err(|_| "Note path is not valid UTF-8.".to_string())
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn note_relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn note_category(relative_path: &str) -> String {
    relative_path
        .split('/')
        .next()
        .filter(|category| *category != relative_path)
        .unwrap_or("")
        .to_string()
}

fn modified_sort_key(path: &Path) -> String {
    let modified = fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let seconds = modified
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    format!("{seconds:020}")
}

fn split_frontmatter(content: &str) -> (Option<&str>, &str) {
    let Some(rest) = content.strip_prefix("---") else {
        return (None, content);
    };

    let rest = rest
        .strip_prefix("\r\n")
        .or_else(|| rest.strip_prefix('\n'));
    let Some(rest) = rest else {
        return (None, content);
    };

    for delimiter in ["\n---\r\n", "\n---\n"] {
        if let Some(index) = rest.find(delimiter) {
            let frontmatter = &rest[..index];
            let body = &rest[index + delimiter.len()..];
            return (Some(frontmatter), body);
        }
    }

    (None, content)
}

fn parse_frontmatter(frontmatter: &str) -> NoteFrontmatter {
    let lines: Vec<&str> = frontmatter.lines().collect();
    let mut parsed = NoteFrontmatter::default();
    let mut index = 0;

    while index < lines.len() {
        let line = lines[index].trim_end();
        let trimmed = line.trim_start();

        if trimmed.starts_with('#') || trimmed.is_empty() {
            index += 1;
            continue;
        }

        let Some((key, value)) = trimmed.split_once(':') else {
            index += 1;
            continue;
        };

        let key = key.trim();
        let value = value.trim();

        match key {
            "title" => parsed.title = parse_scalar(value),
            "summary" => parsed.summary = parse_scalar(value),
            "updated" => parsed.updated = parse_scalar(value),
            "created" => parsed.created = parse_scalar(value),
            "draft" => parsed.draft = parse_bool(value).unwrap_or(false),
            "tags" => {
                if value.starts_with('[') && value.ends_with(']') {
                    parsed.tags = parse_inline_tags(value);
                } else if value.is_empty() {
                    let (tags, next_index) = parse_block_tags(&lines, index + 1);
                    parsed.tags = tags;
                    index = next_index.saturating_sub(1);
                }
            }
            _ => {}
        }

        index += 1;
    }

    parsed
}

fn parse_bool(value: &str) -> Option<bool> {
    match strip_comment(value).trim().to_ascii_lowercase().as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

fn parse_scalar(value: &str) -> Option<String> {
    let value = strip_comment(value).trim();
    if value.is_empty() {
        return None;
    }

    Some(unquote(value).to_string())
}

fn strip_comment(value: &str) -> &str {
    let mut in_single_quote = false;
    let mut in_double_quote = false;

    for (index, ch) in value.char_indices() {
        match ch {
            '\'' if !in_double_quote => in_single_quote = !in_single_quote,
            '"' if !in_single_quote => in_double_quote = !in_double_quote,
            '#' if !in_single_quote && !in_double_quote => return &value[..index],
            _ => {}
        }
    }

    value
}

fn unquote(value: &str) -> &str {
    let trimmed = value.trim();
    if trimmed.len() >= 2 {
        let bytes = trimmed.as_bytes();
        if (bytes[0] == b'"' && bytes[trimmed.len() - 1] == b'"')
            || (bytes[0] == b'\'' && bytes[trimmed.len() - 1] == b'\'')
        {
            return &trimmed[1..trimmed.len() - 1];
        }
    }

    trimmed
}

fn parse_inline_tags(value: &str) -> Vec<String> {
    let inner = value.trim().trim_start_matches('[').trim_end_matches(']');
    inner
        .split(',')
        .filter_map(parse_scalar)
        .filter(|tag| !tag.is_empty())
        .collect()
}

fn parse_block_tags(lines: &[&str], start: usize) -> (Vec<String>, usize) {
    let mut tags = Vec::new();
    let mut index = start;

    while index < lines.len() {
        let line = lines[index];
        let trimmed = line.trim_start();

        if trimmed.is_empty() {
            index += 1;
            continue;
        }

        if !line.starts_with(' ') && !line.starts_with('\t') {
            break;
        }

        if let Some(value) = trimmed.strip_prefix('-') {
            if let Some(tag) = parse_scalar(value.trim()) {
                if !tag.is_empty() {
                    tags.push(tag);
                }
            }
        }

        index += 1;
    }

    (tags, index)
}

fn excerpt_from_markdown(body: &str) -> String {
    let mut plain = String::new();
    let mut in_code_block = false;

    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") {
            in_code_block = !in_code_block;
            continue;
        }
        if in_code_block || trimmed.is_empty() {
            continue;
        }

        let line = trimmed
            .trim_start_matches('#')
            .trim_start_matches('>')
            .trim_start_matches('-')
            .trim_start_matches('*')
            .trim_start();
        plain.push_str(line);
        plain.push(' ');
    }

    let collapsed = plain.split_whitespace().collect::<Vec<_>>().join(" ");
    truncate_chars(&collapsed, EXCERPT_LIMIT)
}

fn truncate_chars(value: &str, limit: usize) -> String {
    if value.chars().count() <= limit {
        return value.to_string();
    }

    let mut truncated = value.chars().take(limit).collect::<String>();
    truncated.push_str("...");
    truncated
}

fn render_markdown_body(body: &str) -> String {
    let mut html = String::new();
    let mut paragraph = Vec::new();
    let mut in_code_block = false;
    let mut code_lang = String::new();
    let mut code_content = String::new();
    let mut list_kind: Option<ListKind> = None;

    for line in body.lines() {
        let trimmed = line.trim();

        if in_code_block {
            if trimmed.starts_with("```") {
                html.push_str("<pre><code");
                if !code_lang.is_empty() {
                    html.push_str(&format!(r#" class="language-{}""#, escape_html(&code_lang)));
                }
                html.push('>');
                html.push_str(&escape_html(&code_content));
                html.push_str("</code></pre>");
                in_code_block = false;
                code_lang.clear();
                code_content.clear();
            } else {
                code_content.push_str(line);
                code_content.push('\n');
            }
            continue;
        }

        if trimmed.starts_with("```") {
            flush_paragraph(&mut html, &mut paragraph);
            close_list(&mut html, &mut list_kind);
            in_code_block = true;
            code_lang = trimmed.trim_start_matches("```").trim().to_string();
            continue;
        }

        if trimmed.is_empty() {
            flush_paragraph(&mut html, &mut paragraph);
            close_list(&mut html, &mut list_kind);
            continue;
        }

        if let Some((level, title)) = markdown_heading(trimmed) {
            flush_paragraph(&mut html, &mut paragraph);
            close_list(&mut html, &mut list_kind);
            html.push_str(&format!(
                "<h{level}>{}</h{level}>",
                render_inline_markdown(title)
            ));
            continue;
        }

        if let Some(item) = unordered_list_item(trimmed) {
            flush_paragraph(&mut html, &mut paragraph);
            open_list(&mut html, &mut list_kind, ListKind::Unordered);
            html.push_str(&format!("<li>{}</li>", render_inline_markdown(item)));
            continue;
        }

        if let Some(item) = ordered_list_item(trimmed) {
            flush_paragraph(&mut html, &mut paragraph);
            open_list(&mut html, &mut list_kind, ListKind::Ordered);
            html.push_str(&format!("<li>{}</li>", render_inline_markdown(item)));
            continue;
        }

        paragraph.push(trimmed.to_string());
    }

    if in_code_block {
        html.push_str("<pre><code");
        if !code_lang.is_empty() {
            html.push_str(&format!(r#" class="language-{}""#, escape_html(&code_lang)));
        }
        html.push('>');
        html.push_str(&escape_html(&code_content));
        html.push_str("</code></pre>");
    }

    flush_paragraph(&mut html, &mut paragraph);
    close_list(&mut html, &mut list_kind);

    html
}

fn flush_paragraph(html: &mut String, paragraph: &mut Vec<String>) {
    if paragraph.is_empty() {
        return;
    }

    let text = paragraph.join(" ");
    html.push_str(&format!("<p>{}</p>", render_inline_markdown(&text)));
    paragraph.clear();
}

fn open_list(html: &mut String, current: &mut Option<ListKind>, next: ListKind) {
    if current.as_ref() == Some(&next) {
        return;
    }

    close_list(html, current);
    match next {
        ListKind::Ordered => html.push_str("<ol>"),
        ListKind::Unordered => html.push_str("<ul>"),
    }
    *current = Some(next);
}

fn close_list(html: &mut String, current: &mut Option<ListKind>) {
    match current.take() {
        Some(ListKind::Ordered) => html.push_str("</ol>"),
        Some(ListKind::Unordered) => html.push_str("</ul>"),
        None => {}
    }
}

fn markdown_heading(line: &str) -> Option<(usize, &str)> {
    for level in (1..=3).rev() {
        let marker = "#".repeat(level);
        if let Some(title) = line.strip_prefix(&marker) {
            if let Some(title) = title.strip_prefix(' ') {
                return Some((level, title.trim()));
            }
        }
    }

    None
}

fn unordered_list_item(line: &str) -> Option<&str> {
    line.strip_prefix("- ").map(str::trim)
}

fn ordered_list_item(line: &str) -> Option<&str> {
    let (number, item) = line.split_once(". ")?;
    if number.is_empty() || !number.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }

    Some(item.trim())
}

fn render_inline_markdown(value: &str) -> String {
    let mut html = String::new();
    let mut index = 0;

    while index < value.len() {
        let rest = &value[index..];

        if let Some((consumed, rendered)) = render_inline_image(rest) {
            html.push_str(&rendered);
            index += consumed;
            continue;
        }

        if let Some((consumed, rendered)) = render_inline_link(rest) {
            html.push_str(&rendered);
            index += consumed;
            continue;
        }

        if let Some((consumed, rendered)) = render_delimited_inline(rest, "`", "code") {
            html.push_str(&rendered);
            index += consumed;
            continue;
        }

        if let Some((consumed, rendered)) = render_delimited_inline(rest, "**", "strong") {
            html.push_str(&rendered);
            index += consumed;
            continue;
        }

        if let Some((consumed, rendered)) = render_delimited_inline(rest, "*", "em") {
            html.push_str(&rendered);
            index += consumed;
            continue;
        }

        let ch = rest.chars().next().expect("rest is not empty");
        html.push_str(&escape_html(&ch.to_string()));
        index += ch.len_utf8();
    }

    html
}

fn render_delimited_inline(value: &str, delimiter: &str, tag: &str) -> Option<(usize, String)> {
    let inner_start = delimiter.len();
    if !value.starts_with(delimiter) {
        return None;
    }

    let inner_end = value[inner_start..].find(delimiter)? + inner_start;
    if inner_end == inner_start {
        return None;
    }

    let inner = &value[inner_start..inner_end];
    let consumed = inner_end + delimiter.len();
    Some((consumed, format!("<{tag}>{}</{tag}>", escape_html(inner))))
}

fn render_inline_link(value: &str) -> Option<(usize, String)> {
    if !value.starts_with('[') {
        return None;
    }

    let label_end = value.find("](")?;
    let url_start = label_end + 2;
    let url_end = value[url_start..].find(')')? + url_start;
    let label = &value[1..label_end];
    let url = &value[url_start..url_end];
    let consumed = url_end + 1;

    match safe_markdown_url(url) {
        Some(href) => Some((
            consumed,
            format!(
                r#"<a href="{}" rel="noopener noreferrer">{}</a>"#,
                escape_html_attribute(&href),
                escape_html(label)
            ),
        )),
        None => Some((consumed, escape_html(label))),
    }
}

fn render_inline_image(value: &str) -> Option<(usize, String)> {
    if !value.starts_with("![") {
        return None;
    }

    let alt_end = value.find("](")?;
    let url_start = alt_end + 2;
    let url_end = value[url_start..].find(')')? + url_start;
    let alt = &value[2..alt_end];
    let url = &value[url_start..url_end];
    let consumed = url_end + 1;

    match safe_markdown_asset_url(url) {
        Some(src) => Some((
            consumed,
            format!(
                r#"<img src="{}" alt="{}" loading="lazy">"#,
                escape_html_attribute(&src),
                escape_html_attribute(alt)
            ),
        )),
        None => Some((consumed, escape_html(alt))),
    }
}

fn safe_markdown_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Some(trimmed.to_string());
    }

    safe_markdown_asset_url(trimmed)
}

fn safe_markdown_asset_url(url: &str) -> Option<String> {
    let normalized = url.trim().replace('\\', "/");
    let lower = normalized.to_lowercase();

    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.contains('?')
        || normalized.contains('#')
        || lower.contains(':')
    {
        return None;
    }

    let mut without_current_dir = normalized.as_str();
    while let Some(rest) = without_current_dir.strip_prefix("./") {
        without_current_dir = rest;
    }

    let mut candidate = without_current_dir;
    while let Some(rest) = candidate.strip_prefix("../") {
        candidate = rest;
    }

    let asset_path = candidate.strip_prefix("assets/")?;
    if asset_path.is_empty() || !is_safe_asset_relative_path(asset_path) {
        return None;
    }

    Some(format!("/assets/{}", percent_encode_path(asset_path)))
}

fn is_safe_asset_relative_path(path: &str) -> bool {
    Path::new(path)
        .components()
        .all(|component| matches!(component, Component::Normal(_)))
}

fn render_notes_page(notes: &[BlogNote], error: Option<&str>) -> String {
    let mut content = String::new();

    if let Some(error) = error {
        content.push_str(&format!(
            r#"<section class="notice error"><strong>Could not scan notes.</strong><p>{}</p></section>"#,
            escape_html(error)
        ));
    }

    if notes.is_empty() {
        content.push_str(
            r#"<section class="empty"><p>No notes yet. Write a Markdown note in OI Notebook, then refresh this page.</p></section>"#,
        );
    } else {
        content.push_str(r#"<section class="note-list">"#);
        for note in notes {
            content.push_str(&render_note_card(note));
        }
        content.push_str("</section>");
    }

    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OI Notebook Blog</title>
    <style>
      :root {{
        color-scheme: light;
        --text: #191919;
        --muted: #666;
        --line: #e6e0d8;
        --accent: #8f3f46;
        --paper: #fffdf9;
        --background: #f7f4ef;
      }}

      * {{
        box-sizing: border-box;
      }}

      body {{
        margin: 0;
        color: var(--text);
        background: var(--background);
        font-family: Georgia, "Times New Roman", "Noto Serif SC", serif;
      }}

      main {{
        width: min(860px, calc(100vw - 40px));
        margin: 0 auto;
        padding: 56px 0 72px;
      }}

      header {{
        border-bottom: 1px solid var(--line);
        margin-bottom: 28px;
        padding-bottom: 18px;
      }}

      h1 {{
        margin: 0 0 8px;
        font-size: 40px;
        font-weight: 600;
        letter-spacing: 0;
        line-height: 1.1;
      }}

      .subtitle {{
        margin: 0;
        color: var(--muted);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
      }}

      .note-list {{
        display: grid;
        gap: 18px;
      }}

      article {{
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 22px;
      }}

      a {{
        color: var(--accent);
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
      }}

      article h2 {{
        margin: 0 0 8px;
        font-size: 24px;
        line-height: 1.25;
      }}

      .meta,
      .path,
      .tags {{
        color: var(--muted);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
      }}

      .path {{
        margin: 0 0 12px;
        word-break: break-word;
      }}

      .summary {{
        margin: 0 0 14px;
        color: #333;
        font-size: 16px;
        line-height: 1.65;
      }}

      .tags {{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }}

      .tag {{
        color: var(--accent);
      }}

      .empty,
      .notice {{
        background: var(--paper);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 22px;
      }}

      .notice.error {{
        border-color: #d9a6a6;
      }}

      .back-link {{
        display: inline-block;
        margin-bottom: 24px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 14px;
      }}

      .markdown-source {{
        overflow: auto;
        margin: 24px 0 0;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fffaf2;
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 13px;
        line-height: 1.65;
        white-space: pre-wrap;
        word-break: break-word;
      }}
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>OI Notebook Blog</h1>
        <p class="subtitle">Local preview from your Markdown notes. Refresh after saving to update this list.</p>
      </header>
      {content}
    </main>
  </body>
</html>"#
    )
}

fn render_note_card(note: &BlogNote) -> String {
    let tags = if note.tags.is_empty() {
        String::new()
    } else {
        format!(
            r#"<div class="tags">{}</div>"#,
            note.tags
                .iter()
                .map(|tag| format!(r#"<span class="tag">#{}</span>"#, escape_html(tag)))
                .collect::<Vec<_>>()
                .join("")
        )
    };

    format!(
        r#"<article>
  <div class="meta">{date}</div>
  <h2><a href="{href}">{title}</a></h2>
  <p class="path">{path}</p>
  <p class="summary">{summary}</p>
  {tags}
</article>"#,
        date = escape_html(&note.date),
        href = escape_html(&note_detail_url(&note.relative_path)),
        title = escape_html(&note.title),
        path = escape_html(&note.relative_path),
        summary = escape_html(note.display_summary()),
        tags = tags
    )
}

fn render_detail_page(detail: &BlogNoteDetail) -> String {
    let tags = if detail.note.tags.is_empty() {
        String::from(r#"<span class="tag">No tags</span>"#)
    } else {
        detail
            .note
            .tags
            .iter()
            .map(|tag| format!(r#"<span class="tag">#{}</span>"#, escape_html(tag)))
            .collect::<Vec<_>>()
            .join("")
    };

    let summary = if detail.note.display_summary().is_empty() {
        "No summary yet.".to_string()
    } else {
        escape_html(detail.note.display_summary())
    };
    let rendered_body = render_markdown_body(&detail.markdown_body);

    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{title} - OI Notebook Blog</title>
    <link rel="stylesheet" href="{katex_css}">
    <style>
      :root {{
        color-scheme: light;
        --text: #191919;
        --muted: #666;
        --line: #e6e0d8;
        --accent: #8f3f46;
        --paper: #fffdf9;
        --background: #f7f4ef;
      }}

      * {{
        box-sizing: border-box;
      }}

      body {{
        margin: 0;
        color: var(--text);
        background: var(--background);
        font-family: Georgia, "Times New Roman", "Noto Serif SC", serif;
      }}

      main {{
        width: min(860px, calc(100vw - 40px));
        margin: 0 auto;
        padding: 56px 0 72px;
      }}

      a {{
        color: var(--accent);
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
      }}

      h1 {{
        margin: 0 0 10px;
        font-size: 40px;
        font-weight: 600;
        letter-spacing: 0;
        line-height: 1.1;
      }}

      .back-link,
      .meta,
      .path,
      .tags {{
        color: var(--muted);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
      }}

      .back-link {{
        display: inline-block;
        margin-bottom: 24px;
      }}

      .path {{
        margin: 0 0 12px;
        word-break: break-word;
      }}

      .summary {{
        margin: 18px 0;
        color: #333;
        font-size: 16px;
        line-height: 1.65;
      }}

      .tags {{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 14px 0 0;
      }}

      .tag {{
        color: var(--accent);
      }}

      .markdown-source {{
        overflow: auto;
        margin: 28px 0 0;
        padding: 18px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fffaf2;
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 13px;
        line-height: 1.65;
        white-space: pre-wrap;
        word-break: break-word;
      }}

      .markdown-body {{
        margin: 28px 0 0;
        color: #242424;
        font-size: 17px;
        line-height: 1.75;
      }}

      .markdown-body h1,
      .markdown-body h2,
      .markdown-body h3 {{
        margin: 28px 0 12px;
        line-height: 1.25;
      }}

      .markdown-body h1 {{
        font-size: 30px;
      }}

      .markdown-body h2 {{
        font-size: 24px;
      }}

      .markdown-body h3 {{
        font-size: 20px;
      }}

      .markdown-body p {{
        margin: 0 0 16px;
      }}

      .markdown-body ul,
      .markdown-body ol {{
        margin: 0 0 16px;
        padding-left: 26px;
      }}

      .markdown-body pre {{
        overflow: auto;
        margin: 20px 0;
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: #fffaf2;
      }}

      .markdown-body code {{
        font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
        font-size: 0.9em;
      }}

      .markdown-body :not(pre) > code {{
        padding: 2px 5px;
        border: 1px solid var(--line);
        border-radius: 4px;
        background: #fffaf2;
      }}

      .markdown-body img {{
        display: block;
        max-width: 100%;
        height: auto;
        margin: 20px 0;
      }}

      details.source-details {{
        margin-top: 28px;
      }}

      details.source-details summary {{
        cursor: pointer;
        color: var(--muted);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
      }}
    </style>
    <script type="text/javascript">
      window.renderOinbMath = function () {{
        var markdownBody = document.querySelector(".markdown-body");
        if (!markdownBody || typeof renderMathInElement !== "function") return;

        renderMathInElement(markdownBody, {{
          delimiters: [
            {{ left: "$$", right: "$$", display: true }},
            {{ left: "$", right: "$", display: false }}
          ],
          throwOnError: false
        }});
      }};
    </script>
    <script defer src="{katex_js}"></script>
    <script defer src="{katex_auto_render_js}" onload="window.renderOinbMath && window.renderOinbMath()"></script>
  </head>
  <body>
    <main>
      <a class="back-link" href="/">Back to index</a>
      <article>
        <div class="meta">{date}</div>
        <h1>{title}</h1>
        <p class="path">{path}</p>
        <div class="tags">{tags}</div>
        <p class="summary">{summary}</p>
        <div class="markdown-body">{rendered_body}</div>
        <details class="source-details">
          <summary>Markdown source</summary>
          <pre class="markdown-source">{markdown}</pre>
        </details>
      </article>
    </main>
  </body>
</html>"#,
        date = escape_html(&detail.note.date),
        title = escape_html(&detail.note.title),
        path = escape_html(&detail.note.relative_path),
        tags = tags,
        summary = summary,
        rendered_body = rendered_body,
        markdown = escape_html(&detail.markdown_body),
        katex_css = KATEX_CSS_URL,
        katex_js = KATEX_JS_URL,
        katex_auto_render_js = KATEX_AUTO_RENDER_JS_URL
    )
}

fn render_error_page(message: &str) -> String {
    render_notes_page(&[], Some(message))
}

fn render_404_page(message: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Not Found - OI Notebook Blog</title>
    <style>
      body {{
        margin: 0;
        color: #191919;
        background: #f7f4ef;
        font-family: Georgia, "Times New Roman", "Noto Serif SC", serif;
      }}

      main {{
        width: min(760px, calc(100vw - 40px));
        margin: 0 auto;
        padding: 56px 0;
      }}

      a {{
        color: #8f3f46;
      }}

      section {{
        background: #fffdf9;
        border: 1px solid #e6e0d8;
        border-radius: 8px;
        padding: 22px;
      }}
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Note not found</h1>
        <p>{message}</p>
        <p><a href="/">Back to index</a></p>
      </section>
    </main>
  </body>
</html>"#,
        message = escape_html(message)
    )
}

fn escape_html(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());

    for ch in value.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(ch),
        }
    }

    escaped
}

fn escape_html_attribute(value: &str) -> String {
    escape_html(value)
}

fn write_response(stream: &mut TcpStream, status: u16, reason: &str, body: &str) {
    let body = body.as_bytes();
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );

    if let Err(e) = stream.write_all(response.as_bytes()) {
        eprintln!("Failed to write local blog response headers: {e}");
        return;
    }

    if let Err(e) = stream.write_all(body) {
        eprintln!("Failed to write local blog response body: {e}");
    }
}

fn write_json_response(stream: &mut TcpStream, status: u16, reason: &str, body: &str) {
    let body = body.as_bytes();
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );

    if let Err(e) = stream.write_all(response.as_bytes()) {
        eprintln!("Failed to write local blog JSON response headers: {e}");
        return;
    }

    if let Err(e) = stream.write_all(body) {
        eprintln!("Failed to write local blog JSON response body: {e}");
    }
}

fn write_binary_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    content_type: &str,
    body: &[u8],
) {
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );

    if let Err(e) = stream.write_all(response.as_bytes()) {
        eprintln!("Failed to write local blog binary response headers: {e}");
        return;
    }

    if let Err(e) = stream.write_all(body) {
        eprintln!("Failed to write local blog binary response body: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn parses_inline_and_block_tags() {
        let inline = parse_frontmatter(
            r#"
title: "Inline"
tags: [dp, "graph theory", 'math']
updated: 2026-05-05T12:00:00+08:00
"#,
        );
        assert_eq!(inline.title.as_deref(), Some("Inline"));
        assert_eq!(inline.tags, vec!["dp", "graph theory", "math"]);

        let block = parse_frontmatter(
            r#"
title: Block
tags:
  - dp
  - "shortest path"
summary: hi
"#,
        );
        assert_eq!(block.tags, vec!["dp", "shortest path"]);
        assert_eq!(block.summary.as_deref(), Some("hi"));
    }

    #[test]
    fn scans_notes_and_skips_assets() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();
        fs::create_dir_all(notes_dir.join("tricks")).unwrap();
        fs::create_dir_all(notes_dir.join("assets")).unwrap();
        fs::write(
            notes_dir.join("tricks/demo.md"),
            r#"---
title: Demo
tags: [dp, test]
created: 2026-05-01T00:00:00+08:00
---

# Demo body

This note becomes an excerpt.
"#,
        )
        .unwrap();
        fs::write(notes_dir.join("assets/ignored.md"), "# ignored").unwrap();

        let notes = scan_notes_dir(notes_dir).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].title, "Demo");
        assert_eq!(notes[0].relative_path, "tricks/demo.md");
        assert_eq!(notes[0].tags, vec!["dp", "test"]);
        assert_eq!(notes[0].summary, "");
        assert!(notes[0].excerpt.contains("Demo body"));
        assert_eq!(notes[0].category, "tricks");
        assert_eq!(
            notes[0].created.as_deref(),
            Some("2026-05-01T00:00:00+08:00")
        );
        assert_eq!(notes[0].updated, None);
        assert!(!notes[0].draft);
    }

    #[test]
    fn serializes_notes_api_json_with_required_fields() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();
        fs::create_dir_all(notes_dir.join("tricks")).unwrap();
        fs::create_dir_all(notes_dir.join("problems")).unwrap();
        fs::create_dir_all(notes_dir.join("assets")).unwrap();

        fs::write(
            notes_dir.join("tricks/escape.md"),
            r#"---
title: A "quote" <x>
tags:
  - 数学
  - "图论"
summary: "Use <unsafe> & quotes"
created: 2026-05-01T00:00:00+08:00
updated: 2026-05-06T00:00:00+08:00
draft: true
---

Body should not become excerpt because summary exists.
"#,
        )
        .unwrap();
        fs::write(
            notes_dir.join("problems/inline.md"),
            r#"---
title: Inline
tags: [dp, "字符串"]
created: 2026-05-05T00:00:00+08:00
---

Inline body excerpt.
"#,
        )
        .unwrap();
        fs::write(notes_dir.join("tricks/测试1.md"), "# 中文路径\n\n正文").unwrap();
        fs::write(notes_dir.join("assets/ignored.md"), "# ignored").unwrap();

        let notes = scan_notes_dir(notes_dir).unwrap();
        let json = serialize_notes_api_json(notes).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        let notes = value["notes"].as_array().unwrap();

        assert_eq!(notes.len(), 3);
        assert_eq!(notes[0]["relativePath"], "tricks/escape.md");
        assert_eq!(notes[0]["title"], r#"A "quote" <x>"#);
        assert_eq!(notes[0]["summary"], "Use <unsafe> & quotes");
        assert_eq!(notes[0]["excerpt"], "Use <unsafe> & quotes");
        assert_eq!(notes[0]["tags"], serde_json::json!(["数学", "图论"]));
        assert_eq!(notes[0]["category"], "tricks");
        assert_eq!(notes[0]["created"], "2026-05-01T00:00:00+08:00");
        assert_eq!(notes[0]["updated"], "2026-05-06T00:00:00+08:00");
        assert_eq!(notes[0]["date"], "2026-05-06T00:00:00+08:00");
        assert_eq!(notes[0]["sortKey"], "2026-05-06T00:00:00+08:00");
        assert_eq!(notes[0]["draft"], true);

        assert_eq!(notes[1]["relativePath"], "problems/inline.md");
        assert_eq!(notes[1]["tags"], serde_json::json!(["dp", "字符串"]));
        assert_eq!(notes[2]["relativePath"], "tricks/测试1.md");
        assert!(json.contains(r#"\"quote\""#));
    }

    #[test]
    fn api_route_does_not_shadow_existing_routes() {
        assert_eq!(
            request_path("GET /api/notes HTTP/1.1"),
            Some(API_NOTES_ROUTE)
        );
        assert_eq!(request_path("GET / HTTP/1.1"), Some("/"));
        assert_eq!(
            request_path("GET /note/tricks/demo.md HTTP/1.1"),
            Some("/note/tricks/demo.md")
        );
        assert_eq!(
            request_path("GET /assets/demo.png HTTP/1.1"),
            Some("/assets/demo.png")
        );
        assert_eq!(request_path("POST /api/notes HTTP/1.1"), None);
    }

    #[test]
    fn note_detail_urls_round_trip_unicode_paths() {
        let relative_path = "tricks/测试笔记.md";
        let url = note_detail_url(relative_path);

        assert_eq!(url, "/note/tricks/%E6%B5%8B%E8%AF%95%E7%AC%94%E8%AE%B0.md");
        assert_eq!(
            percent_decode_path(url.strip_prefix(NOTE_ROUTE_PREFIX).unwrap()).unwrap(),
            relative_path
        );
    }

    #[test]
    fn resolves_note_paths_safely() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();
        fs::create_dir_all(notes_dir.join("tricks")).unwrap();
        fs::create_dir_all(notes_dir.join("assets")).unwrap();
        fs::write(notes_dir.join("tricks/demo.md"), "# demo").unwrap();
        fs::write(notes_dir.join("assets/hidden.md"), "# hidden").unwrap();
        fs::write(notes_dir.join("tricks/demo.txt"), "text").unwrap();

        let resolved =
            resolve_note_request_path(notes_dir, "/note/tricks/demo.md").expect("safe path");
        assert!(resolved.ends_with(Path::new("tricks/demo.md")));

        assert!(resolve_note_request_path(notes_dir, "/note/../tricks/demo.md").is_err());
        assert!(resolve_note_request_path(notes_dir, "/note/assets/hidden.md").is_err());
        assert!(resolve_note_request_path(notes_dir, "/note/tricks/demo.txt").is_err());
    }

    #[test]
    fn renders_detail_markdown_body_without_frontmatter() {
        let detail = BlogNoteDetail {
            note: BlogNote {
                title: "Danger".to_string(),
                relative_path: "tricks/danger.md".to_string(),
                summary: "<summary>".to_string(),
                excerpt: "<summary>".to_string(),
                tags: vec!["<tag>".to_string()],
                category: "tricks".to_string(),
                created: None,
                updated: None,
                date: "2026-05-05".to_string(),
                sort_key: "2026-05-05".to_string(),
                draft: false,
            },
            markdown_body: "# Hi\n<script>alert(1)</script>".to_string(),
        };

        let html = render_detail_page(&detail);
        assert!(html.contains("<h1>Hi</h1>"));
        assert!(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assert!(html.contains("&lt;summary&gt;"));
        assert!(html.contains("#&lt;tag&gt;"));
        assert!(!html.contains("<script>alert(1)</script>"));
        assert!(!html.contains("title: Danger"));
    }

    #[test]
    fn detail_page_includes_katex_auto_render_assets() {
        let detail = BlogNoteDetail {
            note: BlogNote {
                title: "Math".to_string(),
                relative_path: "tricks/math.md".to_string(),
                summary: "Formula note".to_string(),
                excerpt: "Formula note".to_string(),
                tags: vec![],
                category: "tricks".to_string(),
                created: None,
                updated: None,
                date: "2026-05-06".to_string(),
                sort_key: "2026-05-06".to_string(),
                draft: false,
            },
            markdown_body: "Inline $a_i + b_i$ formula.".to_string(),
        };

        let html = render_detail_page(&detail);
        assert!(html.contains(KATEX_CSS_URL));
        assert!(html.contains(KATEX_JS_URL));
        assert!(html.contains(KATEX_AUTO_RENDER_JS_URL));
        assert!(html.contains("renderMathInElement(markdownBody"));
        assert!(html.contains(r#"document.querySelector(".markdown-body")"#));
        assert!(html.contains("throwOnError: false"));
    }

    #[test]
    fn renders_math_delimiters_for_client_katex_rendering() {
        let html = render_markdown_body(
            r#"Inline $a_i + b_i$ formula.

$$ f_i = max(f_{i - 1}, g_i) $$

<script>alert(1)</script>
"#,
        );

        assert!(html.contains("$a_i + b_i$"));
        assert!(html.contains("$$ f_i = max(f_{i - 1}, g_i) $$"));
        assert!(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assert!(!html.contains("<script>alert(1)</script>"));
    }

    #[test]
    fn renders_minimal_markdown_blocks_and_escapes_code() {
        let html = render_markdown_body(
            r#"# Title

Plain **bold** and *italic* with `code`.

- one
- two

1. first
2. second

```cpp
if (x < y) {
  cout << "<script>";
}
```
"#,
        );

        assert!(html.contains("<h1>Title</h1>"));
        assert!(html.contains("<strong>bold</strong>"));
        assert!(html.contains("<em>italic</em>"));
        assert!(html.contains("<code>code</code>"));
        assert!(html.contains("<ul><li>one</li><li>two</li></ul>"));
        assert!(html.contains("<ol><li>first</li><li>second</li></ol>"));
        assert!(html.contains(r#"<pre><code class="language-cpp">"#));
        assert!(html.contains("&lt;script&gt;"));
        assert!(!html.contains("<script>"));
    }

    #[test]
    fn renders_only_safe_markdown_links_and_images() {
        let html = render_markdown_body(
            r#"See [safe](https://example.com) and [bad](javascript:alert(1)).
![local](../assets/a.png)
![nested](../../assets/sub/b c.png)
![bad](javascript:alert(1))
![escape](../secret.png)
"#,
        );

        assert!(
            html.contains(r#"<a href="https://example.com" rel="noopener noreferrer">safe</a>"#)
        );
        assert!(html.contains("bad"));
        assert!(!html.contains("javascript:alert"));
        assert!(html.contains(r#"<img src="/assets/a.png" alt="local" loading="lazy">"#));
        assert!(html.contains(r#"<img src="/assets/sub/b%20c.png" alt="nested" loading="lazy">"#));
        assert!(!html.contains(r#"<img src="javascript"#));
        assert!(!html.contains("../secret.png"));
    }

    #[test]
    fn detail_page_renders_only_body_after_frontmatter_split() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();
        fs::create_dir_all(notes_dir.join("tricks")).unwrap();
        let note_path = notes_dir.join("tricks/detail.md");
        fs::write(
            &note_path,
            r#"---
title: Detail
tags: [render]
summary: Summary
---

## Body title
"#,
        )
        .unwrap();

        let detail = read_blog_note_detail(notes_dir, &note_path).unwrap();
        let html = render_detail_page(&detail);

        assert!(html.contains("<h2>Body title</h2>"));
        assert!(!html.contains("title: Detail"));
        assert!(!html.contains("tags: [render]"));
    }

    #[test]
    fn resolves_asset_paths_inside_notes_assets() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();
        fs::create_dir_all(notes_dir.join("assets/sub")).unwrap();
        fs::write(notes_dir.join("assets/demo.png"), b"png").unwrap();
        fs::write(notes_dir.join("assets/sub/a.png"), b"nested").unwrap();

        let asset = resolve_asset_request_path(notes_dir, "/assets/demo.png").unwrap();
        assert!(asset.path.ends_with(Path::new("assets/demo.png")));
        assert_eq!(asset.content_type, "image/png");

        let nested = resolve_asset_request_path(notes_dir, "/assets/sub/a.png").unwrap();
        assert!(nested.path.ends_with(Path::new("assets/sub/a.png")));
        assert_eq!(nested.content_type, "image/png");
    }

    #[test]
    fn rejects_asset_path_escape_and_non_assets_files() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();
        fs::create_dir_all(notes_dir.join("assets")).unwrap();
        fs::create_dir_all(notes_dir.join("tricks")).unwrap();
        fs::write(notes_dir.join("assets/demo.png"), b"png").unwrap();
        fs::write(notes_dir.join("tricks/other.png"), b"not asset").unwrap();

        assert!(resolve_asset_request_path(notes_dir, "/assets/../tricks/other.png").is_err());
        assert!(resolve_asset_request_path(notes_dir, "/assets/%2E%2E/tricks/other.png").is_err());
        assert!(resolve_asset_request_path(notes_dir, "/assets/sub\\a.png").is_err());
        assert!(resolve_asset_request_path(notes_dir, "/assets/%00.png").is_err());
        assert!(resolve_asset_request_path(notes_dir, "/assets/").is_err());
        assert!(resolve_asset_request_path(notes_dir, "/assets/C:/temp/a.png").is_err());
    }

    #[test]
    fn rejects_non_image_and_missing_assets() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();
        fs::create_dir_all(notes_dir.join("assets")).unwrap();
        fs::write(notes_dir.join("assets/readme.txt"), b"text").unwrap();

        assert!(resolve_asset_request_path(notes_dir, "/assets/readme.txt").is_err());
        assert!(resolve_asset_request_path(notes_dir, "/assets/missing.png").is_err());
    }

    #[test]
    fn maps_asset_content_types() {
        assert_eq!(asset_content_type("a.png"), Some("image/png"));
        assert_eq!(asset_content_type("a.jpg"), Some("image/jpeg"));
        assert_eq!(asset_content_type("a.jpeg"), Some("image/jpeg"));
        assert_eq!(asset_content_type("a.webp"), Some("image/webp"));
        assert_eq!(asset_content_type("a.gif"), Some("image/gif"));
        assert_eq!(asset_content_type("a.svg"), Some("image/svg+xml"));
        assert_eq!(asset_content_type("a.txt"), None);
    }
}
