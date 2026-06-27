use std::{fs, path::Path};

use chrono::{DateTime, Duration, Utc};
use serde_yaml::{Mapping, Value};
use walkdir::WalkDir;

use crate::path_safety;

use super::{NoteSearchResult, SearchFrontmatter, SearchNote};

#[derive(Debug, Default)]
pub(crate) struct ParsedSearchQuery {
    pub(crate) terms: Vec<String>,
    pub(crate) tags: Vec<String>,
    pub(crate) sources: Vec<String>,
    pub(crate) recent: bool,
}

fn yaml_string(mapping: &Mapping, key: &str) -> String {
    mapping
        .get(Value::String(key.to_string()))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
        .to_string()
}

fn yaml_tags(mapping: &Mapping) -> Vec<String> {
    mapping
        .get(Value::String("tags".to_string()))
        .and_then(Value::as_sequence)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|tag| !tag.is_empty())
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn parse_yaml_datetime(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|datetime| datetime.with_timezone(&Utc))
}

pub(crate) fn parse_search_frontmatter(yaml: &str) -> SearchFrontmatter {
    let Ok(Value::Mapping(mapping)) = serde_yaml::from_str::<Value>(yaml) else {
        return SearchFrontmatter::default();
    };

    let created = parse_yaml_datetime(&yaml_string(&mapping, "created"));
    let updated = parse_yaml_datetime(&yaml_string(&mapping, "updated"));

    SearchFrontmatter {
        title: yaml_string(&mapping, "title"),
        tags: yaml_tags(&mapping),
        source: yaml_string(&mapping, "source"),
        summary: yaml_string(&mapping, "summary"),
        created,
        updated,
    }
}

pub(crate) fn split_search_frontmatter(content: &str) -> (SearchFrontmatter, String) {
    let after_open = if content.starts_with("---\r\n") {
        &content[5..]
    } else if content.starts_with("---\n") {
        &content[4..]
    } else {
        return (SearchFrontmatter::default(), content.to_string());
    };

    let bytes = after_open.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\n' {
            let rest = &bytes[i + 1..];
            if rest.starts_with(b"---\r\n") {
                return (
                    parse_search_frontmatter(&after_open[..i]),
                    after_open[i + 6..].to_string(),
                );
            }
            if rest.starts_with(b"---\n") {
                return (
                    parse_search_frontmatter(&after_open[..i]),
                    after_open[i + 5..].to_string(),
                );
            }
            if rest == b"---" || rest == b"---\r" {
                return (parse_search_frontmatter(&after_open[..i]), String::new());
            }
        }
        i += 1;
    }

    (SearchFrontmatter::default(), content.to_string())
}

pub(crate) fn parse_search_query(query: &str) -> ParsedSearchQuery {
    let mut parsed = ParsedSearchQuery::default();

    for raw in query.split_whitespace() {
        let token = raw.trim();
        if token.is_empty() {
            continue;
        }

        if token.eq_ignore_ascii_case("@recent") {
            parsed.recent = true;
        } else if let Some(tag) = token.strip_prefix("tag:") {
            if !tag.trim().is_empty() {
                parsed.tags.push(tag.trim().to_lowercase());
            }
        } else if let Some(source) = token.strip_prefix("source:") {
            if !source.trim().is_empty() {
                parsed.sources.push(source.trim().to_lowercase());
            }
        } else {
            parsed.terms.push(token.to_lowercase());
        }
    }

    parsed
}

fn best_note_date(note: &SearchNote) -> DateTime<Utc> {
    note.frontmatter
        .updated
        .or(note.frontmatter.created)
        .unwrap_or(note.modified)
}

fn is_recent(note: &SearchNote, now: DateTime<Utc>) -> bool {
    best_note_date(note) >= now - Duration::days(7)
}

pub(crate) fn fallback_title(path: &str) -> String {
    path.rsplit('/')
        .next()
        .unwrap_or(path)
        .strip_suffix(".md")
        .unwrap_or_else(|| path.rsplit('/').next().unwrap_or(path))
        .to_string()
}

fn contains_lower(haystack: &str, needle: &str) -> bool {
    haystack.to_lowercase().contains(needle)
}

pub(crate) fn score_search_note(
    note: &SearchNote,
    query: &ParsedSearchQuery,
    now: DateTime<Utc>,
) -> Option<i64> {
    if query.recent && !is_recent(note, now) {
        return None;
    }

    for tag in &query.tags {
        if !note
            .frontmatter
            .tags
            .iter()
            .any(|candidate| candidate.to_lowercase().contains(tag))
        {
            return None;
        }
    }

    for source in &query.sources {
        if !note.frontmatter.source.to_lowercase().contains(source) {
            return None;
        }
    }

    let title = if note.frontmatter.title.is_empty() {
        fallback_title(&note.path)
    } else {
        note.frontmatter.title.clone()
    };

    let mut score = 0_i64;

    for term in &query.terms {
        let mut matched = false;

        if contains_lower(&title, term) {
            score += 100;
            matched = true;
        }
        if note
            .frontmatter
            .tags
            .iter()
            .any(|tag| contains_lower(tag, term))
            || contains_lower(&note.frontmatter.source, term)
        {
            score += 60;
            matched = true;
        }
        if contains_lower(&note.frontmatter.summary, term) || contains_lower(&note.path, term) {
            score += 40;
            matched = true;
        }
        if contains_lower(&note.body, term) {
            score += 10;
            matched = true;
        }

        if !matched {
            return None;
        }
    }

    if query.terms.is_empty() && query.tags.is_empty() && query.sources.is_empty() && !query.recent
    {
        score += 1;
    }

    let age_hours = (now - best_note_date(note)).num_hours().max(0);
    score += (168 - age_hours).clamp(0, 168) / 24;

    Some(score)
}

pub(crate) fn make_excerpt(note: &SearchNote, query: &ParsedSearchQuery) -> String {
    let body = note
        .body
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    let source = query
        .terms
        .iter()
        .find_map(|term| {
            body.lines()
                .find(|line| line.to_lowercase().contains(term))
                .map(ToString::to_string)
        })
        .unwrap_or(body);

    source.chars().take(120).collect()
}

fn read_search_note(canonical_notes_dir: &Path, path: &Path) -> Result<SearchNote, String> {
    let relative = path
        .strip_prefix(canonical_notes_dir)
        .map_err(|_| format!("无法计算相对路径: {path:?}"))?;
    let path_str = relative
        .to_str()
        .ok_or_else(|| format!("路径包含非 UTF-8 字符: {path:?}"))?
        .replace('\\', "/");

    let content =
        fs::read_to_string(path).map_err(|e| format!("读取笔记失败 ({path_str}): {e}"))?;
    let metadata =
        fs::metadata(path).map_err(|e| format!("读取文件元数据失败 ({path_str}): {e}"))?;
    let modified_time = metadata
        .modified()
        .map_err(|e| format!("读取文件修改时间失败 ({path_str}): {e}"))?;
    let modified: DateTime<Utc> = modified_time.into();
    let (frontmatter, body) = split_search_frontmatter(&content);

    Ok(SearchNote {
        path: path_str,
        body,
        modified,
        frontmatter,
    })
}

pub(crate) fn search_notes_in_dir(
    notes_dir: &Path,
    query: &str,
) -> Result<Vec<NoteSearchResult>, String> {
    fs::create_dir_all(notes_dir).map_err(|e| format!("创建 notes 目录失败: {e}"))?;

    let canonical_notes_dir = path_safety::canonicalize_base_dir(notes_dir)?;
    let parsed_query = parse_search_query(query);
    let now = Utc::now();
    let mut scored = Vec::new();

    for entry in WalkDir::new(&canonical_notes_dir)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'))
    {
        let entry = entry.map_err(|e| format!("遍历 notes 目录失败: {e}"))?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }

        let note = read_search_note(&canonical_notes_dir, path)?;
        if let Some(score) = score_search_note(&note, &parsed_query, now) {
            scored.push((score, best_note_date(&note), note));
        }
    }

    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| b.1.cmp(&a.1))
            .then_with(|| a.2.path.cmp(&b.2.path))
    });

    Ok(scored
        .into_iter()
        .take(20)
        .map(|(_, date, note)| {
            let excerpt = make_excerpt(&note, &parsed_query);
            let title = if note.frontmatter.title.is_empty() {
                fallback_title(&note.path)
            } else {
                note.frontmatter.title
            };
            let summary = note.frontmatter.summary;

            NoteSearchResult {
                path: note.path,
                title,
                date: date.to_rfc3339(),
                tags: note.frontmatter.tags,
                summary,
                excerpt,
            }
        })
        .collect())
}
