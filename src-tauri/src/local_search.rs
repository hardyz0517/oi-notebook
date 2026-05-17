use std::{
    collections::HashSet,
    fs,
    path::Path,
};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::paths;

const DEFAULT_MAX_RESULTS: usize = 5;
const MAX_RESULTS_LIMIT: usize = 8;
const DEFAULT_MAX_CHARS_PER_RESULT: usize = 900;
const MAX_CHARS_PER_RESULT_LIMIT: usize = 1200;
const MAX_NOTE_FILE_BYTES: u64 = 1024 * 1024;
const MAX_SCANNED_FILES: usize = 1500;
const MIN_RESULT_SCORE: i64 = 14;
const MAX_CODE_CHARS_PER_BLOCK: usize = 500;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNoteSearchInput {
    pub query: String,
    #[serde(default)]
    pub problem_id: Option<String>,
    #[serde(default)]
    pub problem_title: Option<String>,
    #[serde(default)]
    pub algorithm_keywords: Vec<String>,
    #[serde(default)]
    pub current_note_path: Option<String>,
    #[serde(default)]
    pub max_results: Option<usize>,
    #[serde(default)]
    pub max_chars_per_result: Option<usize>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNoteSearchResult {
    pub id: String,
    pub title: String,
    pub path: String,
    pub relative_path: String,
    pub snippet: String,
    pub score: i64,
    pub reason: String,
    pub line_start: Option<usize>,
    pub line_end: Option<usize>,
    pub is_current_note: bool,
}

#[derive(Debug, Clone, Default)]
struct NoteFrontmatter {
    title: String,
    tags: Vec<String>,
    summary: String,
}

#[derive(Debug, Clone)]
struct NoteCandidate {
    relative_path: String,
    title: String,
    body: String,
    frontmatter_text: String,
    tags: Vec<String>,
    summary: String,
    is_current_note: bool,
}

#[derive(Debug, Clone)]
struct ScoredNote {
    note: NoteCandidate,
    score: i64,
    reasons: Vec<String>,
}

#[tauri::command]
pub async fn search_local_notes(
    input: LocalNoteSearchInput,
) -> Result<Vec<LocalNoteSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || search_local_notes_blocking(input))
        .await
        .map_err(|e| format!("Local note search task failed: {e}"))?
}

fn search_local_notes_blocking(input: LocalNoteSearchInput) -> Result<Vec<LocalNoteSearchResult>, String> {
    let query = input.query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let max_results = input
        .max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, MAX_RESULTS_LIMIT);
    let max_chars_per_result = input
        .max_chars_per_result
        .unwrap_or(DEFAULT_MAX_CHARS_PER_RESULT)
        .clamp(300, MAX_CHARS_PER_RESULT_LIMIT);
    let terms = build_search_terms(&input);
    if terms.is_empty() {
        return Ok(Vec::new());
    }

    let notes_dir = paths::notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;
    let canonical_notes_dir = notes_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve notes directory: {e}"))?;
    let current_note_path = input
        .current_note_path
        .as_deref()
        .and_then(normalize_relative_note_path);

    let mut scanned_files = 0usize;
    let mut scored = Vec::new();

    for entry in WalkDir::new(&canonical_notes_dir)
        .min_depth(1)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| should_visit_entry(entry.path()))
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() || !is_markdown_path(path) {
            continue;
        }
        scanned_files += 1;
        if scanned_files > MAX_SCANNED_FILES {
            break;
        }
        let Ok(metadata) = fs::metadata(path) else {
            continue;
        };
        if metadata.len() > MAX_NOTE_FILE_BYTES {
            continue;
        }

        let relative_path = match relative_note_path(path, &canonical_notes_dir) {
            Some(value) => value,
            None => continue,
        };
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        let (frontmatter, body, frontmatter_text) = split_frontmatter(&content);
        let title = if frontmatter.title.trim().is_empty() {
            fallback_title(&relative_path)
        } else {
            frontmatter.title.trim().to_string()
        };
        let is_current_note = current_note_path
            .as_deref()
            .map(|current| current.eq_ignore_ascii_case(&relative_path))
            .unwrap_or(false);
        let note = NoteCandidate {
            relative_path,
            title,
            body,
            frontmatter_text,
            tags: frontmatter.tags,
            summary: frontmatter.summary,
            is_current_note,
        };
        if let Some(scored_note) = score_note(note, &terms) {
            scored.push(scored_note);
        }
    }

    scored.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| b.note.is_current_note.cmp(&a.note.is_current_note))
            .then_with(|| a.note.relative_path.cmp(&b.note.relative_path))
    });

    Ok(scored
        .into_iter()
        .take(max_results)
        .filter_map(|scored_note| {
            let (snippet, line_start, line_end) =
                build_snippet(&scored_note.note.body, &terms, max_chars_per_result);
            if snippet.trim().is_empty() {
                return None;
            }
            let relative_path = scored_note.note.relative_path;
            Some(LocalNoteSearchResult {
                id: stable_local_note_id(&relative_path),
                title: scored_note.note.title,
                path: relative_path.clone(),
                relative_path,
                snippet,
                score: scored_note.score,
                reason: summarize_reasons(&scored_note.reasons),
                line_start,
                line_end,
                is_current_note: scored_note.note.is_current_note,
            })
        })
        .collect())
}

fn should_visit_entry(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    if name.starts_with('.') {
        return false;
    }
    !matches!(
        name.to_ascii_lowercase().as_str(),
        ".git" | ".oinb" | "node_modules" | "target" | "dist" | "build" | ".vite"
    )
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown"))
        .unwrap_or(false)
}

fn relative_note_path(path: &Path, notes_dir: &Path) -> Option<String> {
    path.strip_prefix(notes_dir)
        .ok()?
        .to_str()
        .map(|value| value.replace('\\', "/"))
}

fn normalize_relative_note_path(value: &str) -> Option<String> {
    let normalized = value.trim().replace('\\', "/");
    if normalized.is_empty()
        || normalized.starts_with('/')
        || normalized.contains('\0')
        || normalized.split('/').any(|part| part == "..")
    {
        return None;
    }
    Some(normalized)
}

fn split_frontmatter(content: &str) -> (NoteFrontmatter, String, String) {
    let normalized = content.strip_prefix('\u{feff}').unwrap_or(content);
    if !normalized.starts_with("---\n") && !normalized.starts_with("---\r\n") {
        return (NoteFrontmatter::default(), normalized.to_string(), String::new());
    }

    let after_marker = if let Some(value) = normalized.strip_prefix("---\r\n") {
        value
    } else if let Some(value) = normalized.strip_prefix("---\n") {
        value
    } else {
        normalized
    };
    let Some(end_index) = after_marker.find("\n---") else {
        return (NoteFrontmatter::default(), normalized.to_string(), String::new());
    };
    let frontmatter_text = &after_marker[..end_index];
    let body_start = end_index + "\n---".len();
    let body = after_marker
        .get(body_start..)
        .unwrap_or("")
        .trim_start_matches(['\r', '\n'])
        .to_string();

    (
        parse_frontmatter_text(frontmatter_text),
        body,
        frontmatter_text.to_string(),
    )
}

fn parse_frontmatter_text(text: &str) -> NoteFrontmatter {
    let mut parsed = NoteFrontmatter::default();
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("title:") {
            parsed.title = trim_yaml_scalar(value);
        } else if let Some(value) = trimmed.strip_prefix("summary:") {
            parsed.summary = trim_yaml_scalar(value);
        } else if let Some(value) = trimmed.strip_prefix("tags:") {
            parsed.tags.extend(parse_tags_inline(value));
        } else if trimmed.starts_with('-') && !parsed.tags.is_empty() {
            let tag = trim_yaml_scalar(trimmed.trim_start_matches('-'));
            if !tag.is_empty() {
                parsed.tags.push(tag);
            }
        }
    }
    parsed.tags.sort();
    parsed.tags.dedup();
    parsed
}

fn trim_yaml_scalar(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .trim()
        .to_string()
}

fn parse_tags_inline(value: &str) -> Vec<String> {
    let trimmed = value.trim();
    if trimmed.starts_with('[') && trimmed.ends_with(']') {
        return trimmed
            .trim_start_matches('[')
            .trim_end_matches(']')
            .split(',')
            .map(trim_yaml_scalar)
            .filter(|tag| !tag.is_empty())
            .collect();
    }
    let tag = trim_yaml_scalar(trimmed);
    if tag.is_empty() {
        Vec::new()
    } else {
        vec![tag]
    }
}

fn fallback_title(relative_path: &str) -> String {
    let file_name = relative_path
        .rsplit('/')
        .next()
        .unwrap_or(relative_path)
        .trim_end_matches(".markdown")
        .trim_end_matches(".md");
    file_name.replace(['-', '_'], " ")
}

fn build_search_terms(input: &LocalNoteSearchInput) -> Vec<String> {
    let mut terms = Vec::new();
    push_term(&mut terms, &input.query);
    if let Some(problem_id) = &input.problem_id {
        push_term(&mut terms, problem_id);
    }
    if let Some(problem_title) = &input.problem_title {
        push_term(&mut terms, problem_title);
    }
    for keyword in &input.algorithm_keywords {
        push_term(&mut terms, keyword);
    }

    let combined = [
        input.query.as_str(),
        input.problem_id.as_deref().unwrap_or(""),
        input.problem_title.as_deref().unwrap_or(""),
        &input.algorithm_keywords.join(" "),
    ]
    .join(" ")
    .to_lowercase();
    for keyword in known_algorithm_terms() {
        if combined.contains(&keyword.to_lowercase()) {
            push_term(&mut terms, keyword);
        }
    }
    for token in tokenize_query(&combined) {
        push_term(&mut terms, &token);
    }

    let mut seen = HashSet::new();
    terms
        .into_iter()
        .map(|term| normalize_term(&term))
        .filter(|term| term.chars().count() >= 2 && !is_low_value_term(term))
        .filter(|term| seen.insert(term.clone()))
        .take(24)
        .collect()
}

fn push_term(terms: &mut Vec<String>, value: &str) {
    let normalized = normalize_term(value);
    if !normalized.is_empty() {
        terms.push(normalized);
    }
}

fn normalize_term(value: &str) -> String {
    value.trim().to_lowercase()
}

fn tokenize_query(value: &str) -> Vec<String> {
    value
        .split(|ch: char| {
            ch.is_whitespace()
                || matches!(
                    ch,
                    ',' | '.'
                        | ';'
                        | ':'
                        | '，'
                        | '。'
                        | '；'
                        | '：'
                        | '?'
                        | '？'
                        | '!'
                        | '！'
                        | '('
                        | ')'
                        | '（'
                        | '）'
                        | '['
                        | ']'
                        | '【'
                        | '】'
                        | '/'
                        | '\\'
                        | '|'
                )
        })
        .map(str::trim)
        .filter(|token| token.chars().count() >= 2)
        .map(str::to_string)
        .collect()
}

fn known_algorithm_terms() -> &'static [&'static str] {
    &[
        "P3379",
        "LCA",
        "最近公共祖先",
        "倍增",
        "Dijkstra",
        "最短路",
        "点分树",
        "点分治",
        "并查集",
        "DSU",
        "树状数组",
        "BIT",
        "线段树",
        "KMP",
        "WA",
        "TLE",
        "RE",
        "MLE",
        "常见坑",
        "实现",
        "复杂度",
        "初始化",
        "边界",
    ]
}

fn is_low_value_term(term: &str) -> bool {
    matches!(
        term,
        "题解"
            | "算法"
            | "学习"
            | "笔记"
            | "总结"
            | "模板"
            | "问题"
            | "哪些"
            | "有什么"
            | "如何"
            | "怎么"
            | "我的"
            | "一下"
            | "联网"
            | "最近"
            | "新闻"
            | "消息"
    )
}

fn score_note(note: NoteCandidate, terms: &[String]) -> Option<ScoredNote> {
    let title = note.title.to_lowercase();
    let path = note.relative_path.to_lowercase();
    let frontmatter = note.frontmatter_text.to_lowercase();
    let tags = note.tags.join(" ").to_lowercase();
    let summary = note.summary.to_lowercase();
    let body = note.body.to_lowercase();

    let mut score = 0i64;
    let mut reasons = Vec::new();
    for term in terms {
        let term_weight = if looks_specific(term) { 2 } else { 1 };
        if title.contains(term) {
            score += 24 * term_weight;
            reasons.push(format!("title matched {term}"));
        }
        if path.contains(term) {
            score += 18 * term_weight;
            reasons.push(format!("path matched {term}"));
        }
        if tags.contains(term) {
            score += 18 * term_weight;
            reasons.push(format!("tag matched {term}"));
        }
        if frontmatter.contains(term) || summary.contains(term) {
            score += 12 * term_weight;
            reasons.push(format!("metadata matched {term}"));
        }
        let body_matches = body.matches(term).count().min(6) as i64;
        if body_matches > 0 {
            score += body_matches * 5 * term_weight as i64;
            reasons.push(format!("body matched {term}"));
        }
    }
    if note.is_current_note && score > 0 {
        score += 8;
        reasons.push("current note boost".to_string());
    }
    if score >= MIN_RESULT_SCORE {
        Some(ScoredNote {
            note,
            score,
            reasons,
        })
    } else {
        None
    }
}

fn looks_specific(term: &str) -> bool {
    term.chars().any(|ch| ch.is_ascii_digit())
        || term.chars().count() >= 4
        || known_algorithm_terms()
            .iter()
            .any(|known| known.eq_ignore_ascii_case(term))
}

fn summarize_reasons(reasons: &[String]) -> String {
    let mut seen = HashSet::new();
    reasons
        .iter()
        .filter(|reason| seen.insert((*reason).clone()))
        .take(4)
        .cloned()
        .collect::<Vec<_>>()
        .join("; ")
}

fn build_snippet(body: &str, terms: &[String], max_chars: usize) -> (String, Option<usize>, Option<usize>) {
    let blocks = split_blocks(body);
    if blocks.is_empty() {
        return (String::new(), None, None);
    }

    let mut scored_blocks = blocks
        .iter()
        .enumerate()
        .map(|(index, block)| (score_block(block, terms), index, block))
        .collect::<Vec<_>>();
    scored_blocks.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));

    let mut selected_indices = scored_blocks
        .iter()
        .filter(|(score, _, _)| *score > 0)
        .take(3)
        .map(|(_, index, _)| *index)
        .collect::<Vec<_>>();
    if selected_indices.is_empty() {
        selected_indices.push(0);
    }
    selected_indices.sort_unstable();
    selected_indices.dedup();

    let mut parts = Vec::new();
    let mut used_chars = 0usize;
    let mut line_start = None;
    let mut line_end = None;
    for index in selected_indices {
        let block = &blocks[index];
        let prepared = prepare_snippet_block(&block.text, max_chars.saturating_sub(used_chars));
        if prepared.trim().is_empty() {
            continue;
        }
        used_chars += prepared.chars().count();
        line_start = Some(line_start.map_or(block.start_line, |current: usize| current.min(block.start_line)));
        line_end = Some(line_end.map_or(block.end_line, |current: usize| current.max(block.end_line)));
        parts.push(prepared);
        if used_chars >= max_chars {
            break;
        }
    }

    (parts.join("\n---\n"), line_start, line_end)
}

#[derive(Debug, Clone)]
struct TextBlock {
    text: String,
    start_line: usize,
    end_line: usize,
}

fn split_blocks(body: &str) -> Vec<TextBlock> {
    let mut blocks = Vec::new();
    let mut current = Vec::new();
    let mut start_line = 1usize;
    let mut in_code = false;

    for (line_index, line) in body.lines().enumerate() {
        let line_no = line_index + 1;
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            if !current.is_empty() {
                blocks.push(TextBlock {
                    text: current.join("\n"),
                    start_line,
                    end_line: line_no.saturating_sub(1).max(start_line),
                });
                current.clear();
            }
            in_code = !in_code;
            start_line = line_no;
            current.push(line.to_string());
            continue;
        }
        if !in_code && trimmed.is_empty() {
            if !current.is_empty() {
                blocks.push(TextBlock {
                    text: current.join("\n"),
                    start_line,
                    end_line: line_no.saturating_sub(1).max(start_line),
                });
                current.clear();
            }
            start_line = line_no + 1;
            continue;
        }
        if current.is_empty() {
            start_line = line_no;
        }
        current.push(line.to_string());
    }
    if !current.is_empty() {
        let end_line = body.lines().count().max(start_line);
        blocks.push(TextBlock {
            text: current.join("\n"),
            start_line,
            end_line,
        });
    }
    blocks
}

fn score_block(block: &TextBlock, terms: &[String]) -> i64 {
    let text = block.text.to_lowercase();
    let mut score = 0i64;
    for term in terms {
        let matches = text.matches(term).count().min(4) as i64;
        if matches > 0 {
            score += matches * if looks_specific(term) { 8 } else { 4 };
        }
    }
    if text.contains("wa")
        || text.contains("tle")
        || text.contains("re")
        || text.contains("复杂度")
        || text.contains("实现")
        || text.contains("注意")
        || text.contains("坑")
    {
        score += 6;
    }
    if text.trim_start().starts_with("```") || text.trim_start().starts_with("~~~") {
        score += 3;
    }
    score
}

fn prepare_snippet_block(text: &str, remaining_chars: usize) -> String {
    if remaining_chars == 0 {
        return String::new();
    }
    let mut output = String::new();
    let mut in_code = false;
    let mut code_chars = 0usize;
    for line in text.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_code = !in_code;
            output.push_str(line);
            output.push('\n');
            continue;
        }
        if in_code {
            let line_chars = line.chars().count();
            if code_chars + line_chars > MAX_CODE_CHARS_PER_BLOCK {
                output.push_str("[code block truncated]\n");
                continue;
            }
            code_chars += line_chars;
        }
        output.push_str(line);
        output.push('\n');
        if output.chars().count() >= remaining_chars {
            break;
        }
    }
    let mut trimmed = output.trim().chars().take(remaining_chars).collect::<String>();
    if output.chars().count() > remaining_chars {
        trimmed.push_str("...");
    }
    trimmed
}

fn stable_local_note_id(relative_path: &str) -> String {
    let mut hash = 1469598103934665603u64;
    for byte in relative_path.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1099511628211);
    }
    format!("local-note-{hash:016x}")
}
