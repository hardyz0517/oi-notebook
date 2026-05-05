use crate::paths;

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
const NOTE_ROUTE_PREFIX: &str = "/note/";

#[derive(Debug, Clone)]
struct BlogNote {
    title: String,
    relative_path: String,
    summary: String,
    tags: Vec<String>,
    date: String,
    sort_key: String,
}

#[derive(Debug, Default)]
struct NoteFrontmatter {
    title: Option<String>,
    summary: Option<String>,
    tags: Vec<String>,
    updated: Option<String>,
    created: Option<String>,
}

#[derive(Debug, Clone)]
struct BlogNoteDetail {
    note: BlogNote,
    markdown: String,
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

    if path == "/" {
        let body = render_index_page();
        write_response(&mut stream, 200, "OK", &body);
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

    let body = render_404_page("This preview server only serves / and /note/{path}.");
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

fn render_note_detail_page(request_path: &str) -> Result<String, String> {
    let notes_dir = paths::notes_dir()?;
    let note_path = resolve_note_request_path(&notes_dir, request_path)?;
    let detail = read_blog_note_detail(&notes_dir, &note_path)?;
    Ok(render_detail_page(&detail))
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

    Ok(BlogNoteDetail { note, markdown })
}

fn blog_note_from_content(root: &Path, path: &Path, content: &str) -> Result<BlogNote, String> {
    let (frontmatter, body) = split_frontmatter(&content);
    let parsed = frontmatter.map(parse_frontmatter).unwrap_or_default();
    let relative_path = note_relative_path(root, path);
    let fallback_title = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let modified_key = modified_sort_key(path);
    let date = parsed
        .updated
        .clone()
        .or(parsed.created.clone())
        .unwrap_or_else(|| modified_key.clone());

    Ok(BlogNote {
        title: parsed.title.unwrap_or(fallback_title),
        relative_path,
        summary: parsed
            .summary
            .unwrap_or_else(|| excerpt_from_markdown(body)),
        tags: parsed.tags,
        sort_key: parsed
            .updated
            .or(parsed.created)
            .unwrap_or_else(|| modified_key.clone()),
        date,
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
        summary = escape_html(&note.summary),
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

    let summary = if detail.note.summary.is_empty() {
        "No summary yet.".to_string()
    } else {
        escape_html(&detail.note.summary)
    };

    format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{title} - OI Notebook Blog</title>
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
    </style>
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
        <pre class="markdown-source">{markdown}</pre>
      </article>
    </main>
  </body>
</html>"#,
        date = escape_html(&detail.note.date),
        title = escape_html(&detail.note.title),
        path = escape_html(&detail.note.relative_path),
        tags = tags,
        summary = summary,
        markdown = escape_html(&detail.markdown)
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
        assert!(notes[0].summary.contains("Demo body"));
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
    fn renders_detail_markdown_as_escaped_source() {
        let detail = BlogNoteDetail {
            note: BlogNote {
                title: "Danger".to_string(),
                relative_path: "tricks/danger.md".to_string(),
                summary: "<summary>".to_string(),
                tags: vec!["<tag>".to_string()],
                date: "2026-05-05".to_string(),
                sort_key: "2026-05-05".to_string(),
            },
            markdown: "# Hi\n<script>alert(1)</script>".to_string(),
        };

        let html = render_detail_page(&detail);
        assert!(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assert!(html.contains("&lt;summary&gt;"));
        assert!(html.contains("#&lt;tag&gt;"));
        assert!(!html.contains("<script>alert(1)</script>"));
    }
}
