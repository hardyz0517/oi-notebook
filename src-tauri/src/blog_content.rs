use serde::Serialize;
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

const EXCERPT_LIMIT: usize = 180;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BlogNote {
    pub(crate) title: String,
    pub(crate) relative_path: String,
    pub(crate) summary: String,
    pub(crate) excerpt: String,
    pub(crate) tags: Vec<String>,
    pub(crate) category: String,
    pub(crate) collections: Vec<String>,
    pub(crate) created: Option<String>,
    pub(crate) updated: Option<String>,
    pub(crate) date: String,
    pub(crate) sort_key: String,
    pub(crate) draft: bool,
}

impl BlogNote {
    pub(crate) fn display_summary(&self) -> &str {
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
#[serde(rename_all = "camelCase")]
struct BlogNoteApiResponse {
    relative_path: String,
    category: String,
    title: String,
    tags: Vec<String>,
    collections: Vec<String>,
    created: Option<String>,
    updated: Option<String>,
    date: String,
    draft: bool,
    summary: String,
    metadata: NoteFrontmatter,
    body: String,
}

#[derive(Debug, Clone, Default, Serialize)]
pub(crate) struct NoteFrontmatter {
    pub(crate) title: Option<String>,
    pub(crate) summary: Option<String>,
    pub(crate) tags: Vec<String>,
    pub(crate) collection: Vec<String>,
    pub(crate) collections: Vec<String>,
    pub(crate) category: Option<String>,
    pub(crate) updated: Option<String>,
    pub(crate) created: Option<String>,
    pub(crate) draft: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct BlogNoteDetail {
    pub(crate) note: BlogNote,
    pub(crate) metadata: NoteFrontmatter,
    pub(crate) markdown_body: String,
}

pub(crate) fn render_notes_api_json() -> Result<String, String> {
    let notes_dir = crate::paths::notes_dir()?;
    let notes = scan_notes_dir(&notes_dir)?;
    serialize_notes_api_json(notes)
}

pub(crate) fn render_note_api_json(note_path: &Path, notes_dir: &Path) -> Result<String, String> {
    let detail = read_blog_note_detail(notes_dir, note_path)?;
    serialize_note_api_json(detail)
}

pub(crate) fn serialize_notes_api_json(notes: Vec<BlogNote>) -> Result<String, String> {
    serde_json::to_string(&BlogNotesApiResponse { notes })
        .map_err(|e| format!("Failed to serialize notes API response: {e}"))
}

pub(crate) fn serialize_note_api_json(detail: BlogNoteDetail) -> Result<String, String> {
    let note = detail.note;
    serde_json::to_string(&BlogNoteApiResponse {
        relative_path: note.relative_path,
        category: note.category,
        title: note.title,
        tags: note.tags,
        collections: note.collections,
        created: note.created,
        updated: note.updated,
        date: note.date,
        draft: note.draft,
        summary: note.summary,
        metadata: detail.metadata,
        body: detail.markdown_body,
    })
    .map_err(|e| format!("Failed to serialize note API response: {e}"))
}

pub(crate) fn scan_notes_dir(notes_dir: &Path) -> Result<Vec<BlogNote>, String> {
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

pub(crate) fn is_markdown_file(path: &Path) -> bool {
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

pub(crate) fn read_blog_note_detail(root: &Path, path: &Path) -> Result<BlogNoteDetail, String> {
    let markdown = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read note {}: {e}", path.display()))?;
    let (frontmatter, body) = split_frontmatter(&markdown);
    let mut metadata = frontmatter.map(parse_frontmatter).unwrap_or_default();
    metadata.collections = effective_collections(&metadata);
    let note = blog_note_from_parts(root, path, body, metadata.clone());

    Ok(BlogNoteDetail {
        note,
        metadata,
        markdown_body: body.to_string(),
    })
}

fn blog_note_from_content(root: &Path, path: &Path, content: &str) -> Result<BlogNote, String> {
    let (frontmatter, body) = split_frontmatter(content);
    let parsed = frontmatter.map(parse_frontmatter).unwrap_or_default();
    Ok(blog_note_from_parts(root, path, body, parsed))
}

fn blog_note_from_parts(root: &Path, path: &Path, body: &str, parsed: NoteFrontmatter) -> BlogNote {
    let relative_path = note_relative_path(root, path);
    let category = note_category(&relative_path);
    let fallback_title = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let modified_key = modified_sort_key(path);
    let collections = effective_collections(&parsed);
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
    BlogNote {
        title: parsed.title.unwrap_or(fallback_title),
        relative_path,
        summary,
        excerpt,
        tags: parsed.tags,
        category,
        collections,
        created,
        updated,
        date,
        sort_key,
        draft: parsed.draft,
    }
}

fn note_relative_path(root: &Path, path: &Path) -> String {
    if let Ok(relative) = path.strip_prefix(root) {
        return relative.to_string_lossy().replace('\\', "/");
    }

    let canonical_root = root.canonicalize().ok();
    let canonical_path = path.canonicalize().ok();

    canonical_path
        .as_deref()
        .and_then(|path| {
            canonical_root
                .as_deref()
                .and_then(|root| path.strip_prefix(root).ok())
        })
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
            "category" => parsed.category = parse_scalar(value),
            "collection" => {
                let (collections, next_index) = parse_string_list(&lines, index, value);
                parsed.collection = collections;
                index = next_index;
            }
            "collections" => {
                let (collections, next_index) = parse_string_list(&lines, index, value);
                parsed.collections = collections;
                index = next_index;
            }
            "tags" => {
                if value.starts_with('[') && value.ends_with(']') {
                    parsed.tags = parse_inline_tags(value);
                } else if value.is_empty() {
                    let (tags, next_index) = parse_block_tags(&lines, index + 1);
                    parsed.tags = tags;
                    index = next_index.saturating_sub(1);
                } else if let Some(tags) = parse_scalar(value) {
                    parsed.tags = parse_legacy_tags_string(&tags);
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

fn parse_legacy_tags_string(value: &str) -> Vec<String> {
    value
        .split(',')
        .filter_map(parse_scalar)
        .filter(|tag| !tag.is_empty())
        .collect()
}

fn parse_string_list(lines: &[&str], index: usize, value: &str) -> (Vec<String>, usize) {
    if value.starts_with('[') && value.ends_with(']') {
        return (parse_inline_tags(value), index);
    }

    if value.is_empty() {
        let (values, next_index) = parse_block_tags(lines, index + 1);
        return (values, next_index.saturating_sub(1));
    }

    (parse_scalar(value).into_iter().collect(), index)
}

fn effective_collections(frontmatter: &NoteFrontmatter) -> Vec<String> {
    let mut collections = Vec::new();

    for collection in frontmatter
        .collection
        .iter()
        .chain(frontmatter.collections.iter())
    {
        push_collection(&mut collections, collection);
    }

    if let Some(category) = &frontmatter.category {
        push_collection(&mut collections, category);
    }

    for tag in &frontmatter.tags {
        if let Some(collection) = collection_from_tag(tag) {
            push_collection(&mut collections, collection);
        }
    }

    if collections.is_empty() {
        collections.push("未归档".to_string());
    }

    collections
}

fn collection_from_tag(tag: &str) -> Option<&str> {
    let tag = tag.trim();
    if let Some(collection) = tag
        .strip_prefix("文集:")
        .or_else(|| tag.strip_prefix("文集："))
    {
        return Some(collection);
    }

    let lower = tag.to_ascii_lowercase();
    if lower.starts_with("collection:") {
        return Some(&tag["collection:".len()..]);
    }
    if lower.starts_with("collection：") {
        return Some(&tag["collection：".len()..]);
    }

    None
}

fn push_collection(collections: &mut Vec<String>, value: &str) {
    let collection = value.trim();
    if collection.is_empty()
        || collections
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(collection))
    {
        return;
    }

    collections.push(collection.to_string());
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

        if let Some(value) = trimmed.strip_prefix('-') {
            if let Some(tag) = parse_scalar(value.trim()) {
                if !tag.is_empty() {
                    tags.push(tag);
                }
            }
        } else {
            break;
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

#[cfg(test)]
mod tests {
    use super::*;
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

        let serde_yaml_block = parse_frontmatter(
            r#"
title: Serde YAML block
tags:
- 算法/字符串/Z 函数
- DP
summary: keep parsing following fields
"#,
        );
        assert_eq!(serde_yaml_block.tags, vec!["算法/字符串/Z 函数", "DP"]);
        assert_eq!(
            serde_yaml_block.summary.as_deref(),
            Some("keep parsing following fields")
        );

        let legacy_string = parse_frontmatter(
            r#"
title: Legacy string
tags: "算法/字符串/Z 函数, DP"
"#,
        );
        assert_eq!(legacy_string.tags, vec!["算法/字符串/Z 函数", "DP"]);
    }

    #[test]
    fn parses_and_normalizes_collections() {
        let scalar = parse_frontmatter("collection: 题解");
        assert_eq!(effective_collections(&scalar), vec!["题解"]);

        let block = parse_frontmatter(
            r#"
collection:
  - 题解
  - 集训日志
"#,
        );
        assert_eq!(effective_collections(&block), vec!["题解", "集训日志"]);

        let plural = parse_frontmatter(
            r#"
collections:
  - 题解
  - 集训日志
"#,
        );
        assert_eq!(effective_collections(&plural), vec!["题解", "集训日志"]);

        let inline = parse_frontmatter("collection: [题解, 集训日志]");
        assert_eq!(effective_collections(&inline), vec!["题解", "集训日志"]);

        let compatible_sources = parse_frontmatter(
            r#"
category: 技巧
tags:
  - 文集:复盘
  - collection:杂谈
  - DP
"#,
        );
        assert_eq!(
            effective_collections(&compatible_sources),
            vec!["技巧", "复盘", "杂谈"]
        );
        assert_eq!(
            compatible_sources.tags,
            vec!["文集:复盘", "collection:杂谈", "DP"]
        );

        let deduplicated = parse_frontmatter(
            r#"
collection: 题解
collections:
  - 题解
  - 集训日志
category: 题解
tags:
  - 文集:集训日志
"#,
        );
        assert_eq!(
            effective_collections(&deduplicated),
            vec!["题解", "集训日志"]
        );

        assert_eq!(
            effective_collections(&NoteFrontmatter::default()),
            vec!["未归档"]
        );
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
        assert_eq!(notes[0].collections, vec!["未归档"]);
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
collections: [review, diary]
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
        assert_eq!(
            notes[0]["collections"],
            serde_json::json!(["review", "diary"])
        );
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
    fn serializes_note_api_json_with_body_and_metadata() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();
        fs::create_dir_all(notes_dir.join("tricks")).unwrap();
        let note_path = notes_dir.join("tricks/detail.md");
        fs::write(
            &note_path,
            r#"---
title: API Detail
tags:
  - dp
  - "中文"
collection: [solutions, training]
summary: "A summary"
created: 2026-05-01T00:00:00+08:00
updated: 2026-05-06T00:00:00+08:00
draft: true
---

## Body title

Body with "quotes" and <unsafe>.
"#,
        )
        .unwrap();

        let detail = read_blog_note_detail(notes_dir, &note_path).unwrap();
        let json = serialize_note_api_json(detail).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(value["relativePath"], "tricks/detail.md");
        assert_eq!(value["category"], "tricks");
        assert_eq!(value["title"], "API Detail");
        assert_eq!(value["tags"], serde_json::json!(["dp", "中文"]));
        assert_eq!(
            value["collections"],
            serde_json::json!(["solutions", "training"])
        );
        assert_eq!(value["created"], "2026-05-01T00:00:00+08:00");
        assert_eq!(value["updated"], "2026-05-06T00:00:00+08:00");
        assert_eq!(value["date"], "2026-05-06T00:00:00+08:00");
        assert_eq!(value["draft"], true);
        assert_eq!(value["summary"], "A summary");
        assert_eq!(value["metadata"]["title"], "API Detail");
        assert_eq!(value["metadata"]["summary"], "A summary");
        assert_eq!(value["metadata"]["tags"], serde_json::json!(["dp", "中文"]));
        assert_eq!(
            value["metadata"]["collections"],
            serde_json::json!(["solutions", "training"])
        );
        assert_eq!(value["metadata"]["created"], "2026-05-01T00:00:00+08:00");
        assert_eq!(value["metadata"]["updated"], "2026-05-06T00:00:00+08:00");
        assert_eq!(value["metadata"]["draft"], true);
        assert!(value["body"].as_str().unwrap().contains("## Body title"));
        assert!(!value["body"]
            .as_str()
            .unwrap()
            .contains("title: API Detail"));
        assert!(json.contains(r#"\"quotes\""#));
    }

    #[test]
    fn serializes_note_api_json_with_canonical_path_as_relative_path() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();
        fs::create_dir_all(notes_dir.join("tricks")).unwrap();
        let note_path = notes_dir.join("tricks/detail.md");
        fs::write(&note_path, "# Detail").unwrap();

        let detail = read_blog_note_detail(notes_dir, &note_path.canonicalize().unwrap()).unwrap();
        let json = serialize_note_api_json(detail).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(value["relativePath"], "tricks/detail.md");
    }
}
