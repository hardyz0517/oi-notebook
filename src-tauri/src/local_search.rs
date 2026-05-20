use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::paths;

const INDEX_VERSION: u32 = 3;
const DEFAULT_MAX_RESULTS: usize = 5;
const MAX_RESULTS_LIMIT: usize = 8;
const DEFAULT_MAX_CHARS_PER_RESULT: usize = 900;
const MAX_CHARS_PER_RESULT_LIMIT: usize = 1200;
const MAX_NOTE_FILE_BYTES: u64 = 1024 * 1024;
const MAX_SCANNED_FILES: usize = 1500;
const MIN_RESULT_SCORE: i64 = 22;
const MAX_CODE_CHARS_PER_BLOCK: usize = 500;
const MAX_INDEX_CHUNKS_PER_NOTE: usize = 80;
const MIN_INDEX_CHUNK_CHARS: usize = 220;
const TARGET_INDEX_CHUNK_CHARS: usize = 900;
const MAX_INDEX_CHUNK_CHARS: usize = 1200;
const MAX_INDEX_SEARCHABLE_CHARS: usize = 1600;
const MAX_RESULTS_PER_NOTE: usize = 3;

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
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub heading_path: Vec<String>,
    #[serde(default)]
    pub chunk_index: usize,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub matched_terms: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub detected_problem_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub detected_algorithm_terms: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diagnostics: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_citation_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalNoteIndexStatus {
    exists: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    version: Option<u32>,
    current_version: u32,
    status: String,
    note_count: usize,
    chunk_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<u64>,
    readable: bool,
    writable: bool,
    approx_size_bytes: u64,
    path_label: String,
    sample_relative_paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_error: Option<String>,
}

#[derive(Debug, Clone, Default)]
struct NoteFrontmatter {
    title: String,
    tags: Vec<String>,
    summary: String,
}

#[derive(Debug, Clone)]
struct SearchTerms {
    terms: Vec<String>,
    expanded_terms: Vec<String>,
    specific_terms: HashSet<String>,
    problem_ids: Vec<String>,
    algorithm_terms: Vec<String>,
    general_news_query: bool,
    oi_synonyms_enabled: bool,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct ScoredNote {
    note: IndexedNote,
    score: i64,
    reasons: Vec<String>,
}

#[derive(Debug, Clone)]
struct ScoredChunk {
    note: IndexedNote,
    chunk: IndexedChunk,
    score: i64,
    reasons: Vec<String>,
    matched_terms: Vec<String>,
    is_current_note: bool,
}

#[derive(Debug, Clone)]
struct NoteFileMeta {
    path: PathBuf,
    relative_path: String,
    modified_secs: u64,
    size: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalNoteIndex {
    version: u32,
    updated_at: u64,
    notes: Vec<IndexedNote>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedNote {
    relative_path: String,
    modified_secs: u64,
    size: u64,
    title: String,
    tags: Vec<String>,
    summary: String,
    frontmatter_text: String,
    headings: Vec<String>,
    chunks: Vec<IndexedChunk>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexedChunk {
    chunk_id: String,
    chunk_index: usize,
    heading_path: Vec<String>,
    text_preview: String,
    searchable_text: String,
    text: String,
    normalized_text: String,
    line_start: usize,
    line_end: usize,
    is_code: bool,
    detected_problem_ids: Vec<String>,
    detected_algorithm_terms: Vec<String>,
}

#[tauri::command]
pub async fn search_local_notes(
    input: LocalNoteSearchInput,
) -> Result<Vec<LocalNoteSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || search_local_notes_blocking(input))
        .await
        .map_err(|e| format!("Local note search task failed: {e}"))?
}

#[tauri::command]
pub async fn rebuild_local_note_index() -> Result<LocalNoteIndexStatus, String> {
    tauri::async_runtime::spawn_blocking(rebuild_local_note_index_blocking)
        .await
        .map_err(|e| format!("Local note index rebuild task failed: {e}"))?
}

#[tauri::command]
pub fn get_local_note_index_status() -> LocalNoteIndexStatus {
    let mut status = LocalNoteIndexStatus {
        exists: false,
        version: None,
        current_version: INDEX_VERSION,
        status: "missing".to_string(),
        note_count: 0,
        chunk_count: 0,
        updated_at: None,
        readable: false,
        writable: false,
        approx_size_bytes: 0,
        path_label: ".oinb/local-index/".to_string(),
        sample_relative_paths: Vec::new(),
        last_error: None,
    };

    let index_path = match local_index_path() {
        Ok(path) => path,
        Err(e) => {
            status.last_error = Some(e);
            return status;
        }
    };
    let Some(index_dir) = index_path.parent() else {
        status.last_error = Some("local index directory is unavailable".to_string());
        return status;
    };

    status.exists = index_path.exists();
    status.writable = if index_dir.exists() {
        probe_writable(index_dir).unwrap_or_else(|e| {
            status.last_error = Some(e);
            false
        })
    } else {
        false
    };

    if !status.exists {
        return status;
    }

    match fs::metadata(&index_path) {
        Ok(metadata) => status.approx_size_bytes = metadata.len(),
        Err(e) => {
            status.last_error = Some(format!("metadata failed: {e}"));
            return status;
        }
    }

    match read_index_file_unchecked(&index_path) {
        Ok(index) => {
            status.readable = true;
            status.version = Some(index.version);
            status.status = if index.version == INDEX_VERSION {
                "ready".to_string()
            } else {
                "stale".to_string()
            };
            if index.version != INDEX_VERSION {
                status.last_error = Some(format!(
                    "version mismatch: found {}, expected {}",
                    index.version, INDEX_VERSION
                ));
            }
            status.updated_at = Some(index.updated_at);
            status.note_count = index.notes.len();
            status.chunk_count = index.notes.iter().map(|note| note.chunks.len()).sum();
            status.sample_relative_paths = index
                .notes
                .iter()
                .take(3)
                .map(|note| note.relative_path.clone())
                .collect();
        }
        Err(e) => {
            status.status = "error".to_string();
            status.last_error = Some(e);
        }
    }

    status
}

fn rebuild_local_note_index_blocking() -> Result<LocalNoteIndexStatus, String> {
    let notes_dir = paths::notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;
    let canonical_notes_dir = notes_dir
        .canonicalize()
        .map_err(|e| format!("Failed to resolve notes directory: {e}"))?;
    let mut notes = build_index_from_scan(&canonical_notes_dir)?;
    notes.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    let index = LocalNoteIndex {
        version: INDEX_VERSION,
        updated_at: now_secs(),
        notes,
    };
    write_index_file(&local_index_path()?, &index)?;
    Ok(get_local_note_index_status())
}

fn probe_writable(dir: &Path) -> Result<bool, String> {
    let probe = dir.join(".diagnostic-probe.tmp");
    fs::write(&probe, b"ok").map_err(|e| format!("write probe failed: {e}"))?;
    fs::remove_file(&probe).map_err(|e| format!("remove probe failed: {e}"))?;
    Ok(true)
}

fn search_local_notes_blocking(
    input: LocalNoteSearchInput,
) -> Result<Vec<LocalNoteSearchResult>, String> {
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
    let search_terms = build_search_terms(&input);
    if search_terms.terms.is_empty() || search_terms.general_news_query {
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

    let indexed_notes = load_or_update_index(&canonical_notes_dir).unwrap_or_else(|e| {
        eprintln!("Local note index unavailable, falling back to direct scan: {e}");
        build_index_from_scan(&canonical_notes_dir).unwrap_or_default()
    });

    let mut scored = indexed_notes
        .into_iter()
        .flat_map(|note| {
            let is_current_note = current_note_path
                .as_deref()
                .map(|current| current.eq_ignore_ascii_case(&note.relative_path))
                .unwrap_or(false);
            score_note_chunks(note, is_current_note, &search_terms)
        })
        .collect::<Vec<_>>();

    scored.sort_by(|a, b| {
        b.score
            .cmp(&a.score)
            .then_with(|| a.note.relative_path.cmp(&b.note.relative_path))
            .then_with(|| a.chunk.chunk_index.cmp(&b.chunk.chunk_index))
    });

    let searched_chunks = scored.len();
    let mut per_note_count: HashMap<String, usize> = HashMap::new();
    let mut results = Vec::new();
    let mut same_note_dedup_applied = false;

    for scored_chunk in scored {
        if results.len() >= max_results {
            break;
        }
        let note_count = per_note_count
            .entry(scored_chunk.note.relative_path.clone())
            .or_insert(0);
        if *note_count >= MAX_RESULTS_PER_NOTE {
            same_note_dedup_applied = true;
            continue;
        }
        *note_count += 1;

        let snippet = prepare_snippet_block(&scored_chunk.chunk.text, max_chars_per_result);
        if snippet.trim().is_empty() {
            continue;
        }
        let relative_path = scored_chunk.note.relative_path;
        let diagnostics = local_search_diagnostics(
            &search_terms,
            searched_chunks,
            scored_chunk.score,
            same_note_dedup_applied,
            scored_chunk.is_current_note,
        );
        results.push(LocalNoteSearchResult {
            id: stable_local_chunk_id(&relative_path, &scored_chunk.chunk.chunk_id),
            title: scored_chunk.note.title,
            path: relative_path.clone(),
            relative_path,
            snippet,
            score: scored_chunk.score,
            reason: summarize_reasons(&scored_chunk.reasons),
            line_start: Some(scored_chunk.chunk.line_start),
            line_end: Some(scored_chunk.chunk.line_end),
            is_current_note: scored_chunk.is_current_note,
            heading_path: scored_chunk.chunk.heading_path,
            chunk_index: scored_chunk.chunk.chunk_index,
            matched_terms: scored_chunk.matched_terms,
            detected_problem_ids: scored_chunk.chunk.detected_problem_ids,
            detected_algorithm_terms: scored_chunk.chunk.detected_algorithm_terms,
            diagnostics: Some(diagnostics),
            local_citation_id: None,
        });
    }

    Ok(results)
}

fn load_or_update_index(notes_dir: &Path) -> Result<Vec<IndexedNote>, String> {
    let index_path = local_index_path()?;
    let existing_index = read_index_file(&index_path).unwrap_or_else(|e| {
        eprintln!("Local note index will be rebuilt: {e}");
        LocalNoteIndex {
            version: INDEX_VERSION,
            updated_at: 0,
            notes: Vec::new(),
        }
    });

    let file_metas = collect_markdown_files(notes_dir)?;
    let file_meta_by_path = file_metas
        .into_iter()
        .map(|meta| (meta.relative_path.clone(), meta))
        .collect::<HashMap<_, _>>();
    let mut existing_by_path = existing_index
        .notes
        .into_iter()
        .map(|note| (note.relative_path.clone(), note))
        .collect::<HashMap<_, _>>();
    let mut notes = Vec::new();

    for (relative_path, meta) in &file_meta_by_path {
        if let Some(existing) = existing_by_path.remove(relative_path) {
            if existing.modified_secs == meta.modified_secs && existing.size == meta.size {
                notes.push(existing);
                continue;
            }
        }
        if let Some(indexed) = index_note_file(meta) {
            notes.push(indexed);
        }
    }

    notes.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    let next_index = LocalNoteIndex {
        version: INDEX_VERSION,
        updated_at: now_secs(),
        notes: notes.clone(),
    };
    if let Err(e) = write_index_file(&index_path, &next_index) {
        eprintln!("Failed to write local note index: {e}");
    }
    Ok(notes)
}

fn build_index_from_scan(notes_dir: &Path) -> Result<Vec<IndexedNote>, String> {
    Ok(collect_markdown_files(notes_dir)?
        .iter()
        .filter_map(index_note_file)
        .collect())
}

fn local_index_path() -> Result<PathBuf, String> {
    Ok(paths::oinb_dir()?
        .join("local-index")
        .join("notes-index.json"))
}

fn read_index_file(path: &Path) -> Result<LocalNoteIndex, String> {
    let index = read_index_file_unchecked(path)?;
    if index.version != INDEX_VERSION {
        return Err(format!(
            "version mismatch: found {}, expected {}",
            index.version, INDEX_VERSION
        ));
    }
    Ok(index)
}

fn read_index_file_unchecked(path: &Path) -> Result<LocalNoteIndex, String> {
    let bytes = fs::read(path).map_err(|e| format!("read failed: {e}"))?;
    serde_json::from_slice::<LocalNoteIndex>(&bytes).map_err(|e| format!("parse failed: {e}"))
}

fn write_index_file(path: &Path, index: &LocalNoteIndex) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create index dir failed: {e}"))?;
    }
    let bytes = serde_json::to_vec(index).map_err(|e| format!("serialize failed: {e}"))?;
    fs::write(path, bytes).map_err(|e| format!("write failed: {e}"))
}

fn collect_markdown_files(notes_dir: &Path) -> Result<Vec<NoteFileMeta>, String> {
    let mut files = Vec::new();
    for entry in WalkDir::new(notes_dir)
        .min_depth(1)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| should_visit_entry(entry.path()))
    {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if entry.file_type().is_symlink() {
            continue;
        }
        let path = entry.path();
        if !path.is_file() || !is_markdown_path(path) {
            continue;
        }
        if files.len() >= MAX_SCANNED_FILES {
            break;
        }
        let Ok(metadata) = fs::metadata(path) else {
            continue;
        };
        if metadata.len() > MAX_NOTE_FILE_BYTES {
            continue;
        }
        let Some(relative_path) = relative_note_path(path, notes_dir) else {
            continue;
        };
        files.push(NoteFileMeta {
            path: path.to_path_buf(),
            relative_path,
            modified_secs: metadata_modified_secs(&metadata),
            size: metadata.len(),
        });
    }
    Ok(files)
}

fn index_note_file(meta: &NoteFileMeta) -> Option<IndexedNote> {
    let content = fs::read_to_string(&meta.path).ok()?;
    let (frontmatter, body, frontmatter_text) = split_frontmatter(&content);
    let title = if frontmatter.title.trim().is_empty() {
        fallback_title(&meta.relative_path)
    } else {
        frontmatter.title.trim().to_string()
    };
    let chunks = split_markdown_chunks(&meta.relative_path, &body)
        .into_iter()
        .take(MAX_INDEX_CHUNKS_PER_NOTE)
        .enumerate()
        .map(|(chunk_index, block)| {
            let text = truncate_chars(&block.text, MAX_INDEX_CHUNK_CHARS);
            let heading_text = block.heading_path.join(" ");
            let searchable_text = truncate_chars(
                &[
                    title.as_str(),
                    &meta.relative_path,
                    &frontmatter.summary,
                    &frontmatter.tags.join(" "),
                    &heading_text,
                    &text,
                ]
                .join("\n"),
                MAX_INDEX_SEARCHABLE_CHARS,
            );
            let normalized_text = normalize_text_for_search(&searchable_text);
            let detected_problem_ids = detect_problem_ids(&searchable_text);
            let detected_algorithm_terms = detect_algorithm_terms(&normalized_text);
            IndexedChunk {
                chunk_id: stable_chunk_id(
                    &meta.relative_path,
                    &block.heading_path,
                    chunk_index,
                    &text,
                ),
                chunk_index,
                heading_path: block.heading_path,
                text_preview: truncate_chars(&text, 360),
                searchable_text,
                text,
                normalized_text,
                line_start: block.start_line,
                line_end: block.end_line,
                is_code: block.is_code,
                detected_problem_ids,
                detected_algorithm_terms,
            }
        })
        .collect::<Vec<_>>();
    Some(IndexedNote {
        relative_path: meta.relative_path.clone(),
        modified_secs: meta.modified_secs,
        size: meta.size,
        title,
        tags: frontmatter.tags,
        summary: frontmatter.summary,
        frontmatter_text,
        headings: extract_headings(&body),
        chunks,
    })
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
        return (
            NoteFrontmatter::default(),
            normalized.to_string(),
            String::new(),
        );
    }

    let after_marker = if let Some(value) = normalized.strip_prefix("---\r\n") {
        value
    } else if let Some(value) = normalized.strip_prefix("---\n") {
        value
    } else {
        normalized
    };
    let Some(end_index) = after_marker.find("\n---") else {
        return (
            NoteFrontmatter::default(),
            normalized.to_string(),
            String::new(),
        );
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

fn build_search_terms(input: &LocalNoteSearchInput) -> SearchTerms {
    let combined = [
        input.query.as_str(),
        input.problem_id.as_deref().unwrap_or(""),
        input.problem_title.as_deref().unwrap_or(""),
        &input.algorithm_keywords.join(" "),
    ]
    .join(" ");
    let combined_normalized = normalize_text_for_search(&combined);
    let general_news_query = is_general_news_query(&combined_normalized);
    let problem_ids = detect_problem_ids(&combined);
    let oi_synonyms_enabled = should_enable_oi_synonyms(input, &combined_normalized, &problem_ids);
    let algorithm_terms = if oi_synonyms_enabled {
        detect_algorithm_terms(&combined_normalized)
    } else {
        Vec::new()
    };

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
    for token in tokenize_query(&combined_normalized) {
        if is_allowed_search_token(&token, oi_synonyms_enabled) {
            push_term(&mut terms, &token);
        }
    }
    let mut expanded_terms = Vec::new();
    if oi_synonyms_enabled {
        for group in oi_alias_groups() {
            if group
                .iter()
                .any(|alias| term_matches(&combined_normalized, alias))
            {
                for alias in group.iter().copied() {
                    push_term(&mut terms, alias);
                    push_term(&mut expanded_terms, alias);
                }
            }
        }
        for keyword in known_algorithm_terms()
            .iter()
            .chain(oi_known_algorithm_terms().iter())
        {
            if term_matches(&combined_normalized, keyword) && is_allowed_search_token(&normalize_term(keyword), true) {
                push_term(&mut terms, keyword);
                push_term(&mut expanded_terms, keyword);
            }
        }
    }
    for problem_id in &problem_ids {
        push_term(&mut terms, problem_id);
    }
    for algorithm_term in &algorithm_terms {
        push_term(&mut terms, algorithm_term);
    }

    let mut seen = HashSet::new();
    let terms = terms
        .into_iter()
        .map(|term| normalize_term(&term))
        .filter(|term| is_allowed_search_token(term, oi_synonyms_enabled) && !is_low_value_term(term))
        .filter(|term| seen.insert(term.clone()))
        .take(32)
        .collect::<Vec<_>>();
    let mut expanded_seen = HashSet::new();
    let expanded_terms = expanded_terms
        .into_iter()
        .map(|term| normalize_term(&term))
        .filter(|term| is_allowed_search_token(term, oi_synonyms_enabled) && !is_low_value_term(term))
        .filter(|term| expanded_seen.insert(term.clone()))
        .take(24)
        .collect::<Vec<_>>();
    let specific_terms = terms
        .iter()
        .filter(|term| {
            looks_specific(term, oi_synonyms_enabled) || problem_ids.iter().any(|id| normalize_term(id) == **term)
        })
        .cloned()
        .collect::<HashSet<_>>();

    SearchTerms {
        terms,
        expanded_terms,
        specific_terms,
        problem_ids,
        algorithm_terms,
        general_news_query,
        oi_synonyms_enabled,
    }
}

fn push_term(terms: &mut Vec<String>, value: &str) {
    let normalized = normalize_term(value);
    if !normalized.is_empty() {
        terms.push(normalized);
    }
}

fn normalize_term(value: &str) -> String {
    normalize_text_for_search(value).trim().to_string()
}

fn normalize_text_for_search(value: &str) -> String {
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

#[allow(dead_code)]
fn algorithm_alias_groups() -> &'static [&'static [&'static str]] {
    &[
        &["点分树", "动态点分治", "点分治"],
        &["lca", "最近公共祖先", "倍增"],
        &["dijkstra", "最短路", "单源最短路"],
        &["dsu", "并查集"],
        &["bit", "树状数组"],
        &["线段树", "segment tree"],
        &["kmp", "字符串匹配"],
    ]
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
        "动态点分治",
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

fn oi_alias_groups() -> &'static [&'static [&'static str]] {
    &[
        &["点分树", "centroid tree", "动态点分治", "震波"],
        &["点分治", "centroid decomposition", "重心分治"],
        &[
            "树链剖分",
            "hld",
            "heavy light decomposition",
            "heavy-light decomposition",
        ],
        &["最近公共祖先", "lca", "倍增", "binary lifting"],
        &["并查集", "dsu", "union find", "union-find"],
        &["树状数组", "bit", "fenwick", "fenwick tree"],
        &["线段树", "线段树模板", "segment tree"],
        &["kmp", "前缀函数", "prefix function"],
        &["z 函数", "z函数", "z-function", "z function"],
        &["扩展 kmp", "exkmp", "扩展kmp"],
        &["dijkstra", "最短路", "单源最短路"],
        &["tarjan", "scc", "强连通分量", "割点", "桥"],
        &["二分图", "matching", "二分图匹配"],
        &["网络流", "maxflow", "max flow", "dinic"],
        &["单调队列", "monotonic queue"],
        &["单调栈", "monotonic stack"],
    ]
}

fn oi_known_algorithm_terms() -> &'static [&'static str] {
    &[
        "P3379",
        "LCA",
        "最近公共祖先",
        "倍增",
        "Dijkstra",
        "最短路",
        "点分树",
        "动态点分治",
        "点分治",
        "并查集",
        "DSU",
        "树状数组",
        "BIT",
        "线段树",
        "KMP",
        "Z 函数",
        "Z函数",
        "exKMP",
        "扩展 KMP",
        "Tarjan",
        "SCC",
        "网络流",
        "Dinic",
        "常见坑",
        "实现",
        "复杂度",
        "初始化",
        "边界",
    ]
}

fn term_matches(normalized_haystack: &str, needle: &str) -> bool {
    let normalized = normalize_term(needle);
    if normalized.is_empty() {
        return false;
    }
    if needs_ascii_boundaries(&normalized) {
        return ascii_bounded_match_count(normalized_haystack, &normalized) > 0;
    }
    normalized_haystack.contains(&normalized)
}

fn term_match_count(normalized_haystack: &str, needle: &str) -> usize {
    let normalized = normalize_term(needle);
    if normalized.is_empty() {
        return 0;
    }
    if needs_ascii_boundaries(&normalized) {
        return ascii_bounded_match_count(normalized_haystack, &normalized);
    }
    normalized_haystack.matches(&normalized).count()
}

fn needs_ascii_boundaries(term: &str) -> bool {
    term.chars()
        .any(|ch| ch.is_ascii_alphanumeric())
}

fn is_ascii_word_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn ascii_bounded_match_count(haystack: &str, needle: &str) -> usize {
    if needle.is_empty() {
        return 0;
    }
    let haystack_bytes = haystack.as_bytes();
    let needle_bytes = needle.as_bytes();
    let mut count = 0;
    let mut start = 0;
    while let Some(offset) = haystack[start..].find(needle) {
        let index = start + offset;
        let before_ok = index == 0 || !is_ascii_word_char(haystack_bytes[index - 1]);
        let after_index = index + needle_bytes.len();
        let after_ok = after_index >= haystack_bytes.len() || !is_ascii_word_char(haystack_bytes[after_index]);
        if before_ok && after_ok {
            count += 1;
        }
        start = after_index;
    }
    count
}

fn is_allowed_search_token(term: &str, oi_synonyms_enabled: bool) -> bool {
    let normalized = normalize_term(term);
    if normalized.is_empty() {
        return false;
    }
    let char_count = normalized.chars().count();
    if normalized.chars().all(|ch| ch.is_ascii_alphanumeric()) && char_count < 3 {
        return oi_synonyms_enabled && matches!(normalized.as_str(), "z");
    }
    char_count >= 2
}

fn should_enable_oi_synonyms(
    input: &LocalNoteSearchInput,
    combined_normalized: &str,
    problem_ids: &[String],
) -> bool {
    if input.problem_id.as_deref().is_some_and(|value| !value.trim().is_empty())
        || !problem_ids.is_empty()
        || input.algorithm_keywords.iter().any(|keyword| !keyword.trim().is_empty())
    {
        return true;
    }

    oi_alias_groups()
        .iter()
        .flat_map(|group| group.iter().copied())
        .chain(known_algorithm_terms().iter().copied())
        .chain(oi_known_algorithm_terms().iter().copied())
        .filter(|term| is_clear_algorithm_query_term(term))
        .any(|term| term_matches(combined_normalized, term))
}

fn is_clear_algorithm_query_term(term: &str) -> bool {
    let normalized = normalize_term(term);
    if normalized.is_empty() || is_low_value_term(&normalized) {
        return false;
    }
    if normalized.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        return normalized.chars().count() >= 3 && !matches!(normalized.as_str(), "tle" | "mle");
    }
    normalized.chars().count() >= 2
}

fn detect_algorithm_terms(normalized_text: &str) -> Vec<String> {
    let mut terms = Vec::new();
    for group in oi_alias_groups() {
        if group
            .iter()
            .any(|alias| term_matches(normalized_text, alias))
        {
            for alias in group.iter().copied() {
                push_term(&mut terms, alias);
            }
        }
    }
    for term in known_algorithm_terms()
        .iter()
        .chain(oi_known_algorithm_terms().iter())
    {
        if term_matches(normalized_text, term) {
            push_term(&mut terms, term);
        }
    }
    dedup_limited(terms, 24)
}

fn detect_problem_ids(value: &str) -> Vec<String> {
    let mut ids = Vec::new();
    for raw in value.split(|ch: char| !ch.is_ascii_alphanumeric() && ch != '_' && ch != '-') {
        let token = raw.trim_matches(|ch: char| ch == '_' || ch == '-');
        if token.len() < 3 {
            continue;
        }
        let upper = token.to_ascii_uppercase();
        if is_luogu_problem_id(&upper)
            || is_codeforces_problem_id(&upper)
            || is_atcoder_problem_id(&upper)
            || is_spoj_problem_id(&upper)
        {
            ids.push(upper);
        }
    }
    dedup_limited(ids, 12)
}

fn is_luogu_problem_id(token: &str) -> bool {
    token
        .strip_prefix('P')
        .map(|rest| rest.len() >= 3 && rest.chars().all(|ch| ch.is_ascii_digit()))
        .unwrap_or(false)
}

fn is_codeforces_problem_id(token: &str) -> bool {
    let digit_count = token.chars().take_while(|ch| ch.is_ascii_digit()).count();
    digit_count >= 3
        && digit_count < token.len()
        && token[digit_count..]
            .chars()
            .all(|ch| ch.is_ascii_alphabetic() || ch.is_ascii_digit())
}

fn is_atcoder_problem_id(token: &str) -> bool {
    token.starts_with("AT_")
        || token.starts_with("ABC")
        || token.starts_with("ARC")
        || token.starts_with("AGC")
}

fn is_spoj_problem_id(token: &str) -> bool {
    token.len() >= 4
        && token.len() <= 16
        && token
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit())
        && token.chars().any(|ch| ch.is_ascii_digit())
        && token.chars().any(|ch| ch.is_ascii_uppercase())
}

fn dedup_limited(values: Vec<String>, limit: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .filter(|value| seen.insert(value.to_ascii_lowercase()))
        .take(limit)
        .collect()
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
            | "结合"
            | "联网"
            | "最近"
            | "最新"
            | "新闻"
            | "消息"
            | "资料"
            | "内容"
            | "回答"
            | "常见"
            | "哪里"
            | "容易"
            | "树"
            | "图"
    )
}

fn is_general_news_query(combined: &str) -> bool {
    let has_real_news_word = [
        "最近", "最新", "新闻", "消息", "今天", "这周", "近期", "latest", "recent", "news",
    ]
    .iter()
    .any(|word| combined.contains(&normalize_term(word)));
    let has_real_oi_signal = oi_known_algorithm_terms()
        .iter()
        .any(|term| combined.contains(&normalize_term(term)))
        || ["信息学", "竞赛", "洛谷", "题解", "oi", "acm", "icpc"]
            .iter()
            .any(|term| combined.contains(term));
    if has_real_news_word {
        return !has_real_oi_signal;
    }
    let has_news_word = [
        "最近", "最新", "新闻", "消息", "今天", "这周", "近期", "ai news",
    ]
    .iter()
    .any(|word| combined.contains(&normalize_term(word)));
    if !has_news_word {
        return false;
    }
    let has_local_oi_signal = known_algorithm_terms()
        .iter()
        .any(|term| combined.contains(&normalize_term(term)))
        || ["信息学", "竞赛", "洛谷", "oi", "acm", "icpc"]
            .iter()
            .any(|term| combined.contains(term));
    !has_local_oi_signal
}

fn score_note_chunks(
    note: IndexedNote,
    is_current_note: bool,
    search_terms: &SearchTerms,
) -> Vec<ScoredChunk> {
    let title = normalize_text_for_search(&note.title);
    let path = normalize_text_for_search(&note.relative_path);
    let frontmatter = normalize_text_for_search(&note.frontmatter_text);
    let tags = normalize_text_for_search(&note.tags.join(" "));
    let summary = normalize_text_for_search(&note.summary);
    let headings = normalize_text_for_search(&note.headings.join(" "));
    let note_modified_secs = note.modified_secs;
    let mut scored_chunks = Vec::new();

    for chunk in note.chunks.iter().cloned() {
        let mut score = 0i64;
        let mut reasons = Vec::new();
        let mut matched_terms = Vec::new();
        let heading_text = normalize_text_for_search(&chunk.heading_path.join(" "));
        let chunk_text = &chunk.normalized_text;

        for problem_id in &search_terms.problem_ids {
            let normalized_id = normalize_term(problem_id);
            if !normalized_id.is_empty()
                && (path.contains(&normalized_id)
                    || title.contains(&normalized_id)
                    || chunk_text.contains(&normalized_id))
            {
                score += 90;
                reasons.push(format!("problem id matched {problem_id}"));
                matched_terms.push(problem_id.clone());
            }
        }

        for term in &search_terms.terms {
            let term_weight = if search_terms.specific_terms.contains(term) {
                2
            } else {
                1
            };
            let is_expanded = search_terms
                .expanded_terms
                .iter()
                .any(|expanded| expanded == term);
            if term_matches(&title, term) {
                score += 34 * term_weight;
                reasons.push(format!("title matched {term}"));
                matched_terms.push(term.clone());
            }
            if term_matches(&tags, term) {
                score += 30 * term_weight;
                reasons.push(format!("tag matched {term}"));
                matched_terms.push(term.clone());
            }
            if term_matches(&heading_text, term) {
                score += 28 * term_weight;
                reasons.push(format!("heading matched {term}"));
                matched_terms.push(term.clone());
            } else if term_matches(&headings, term) {
                score += 12 * term_weight;
                reasons.push(format!("other heading matched {term}"));
                matched_terms.push(term.clone());
            }
            if term_matches(&summary, term) || term_matches(&frontmatter, term) {
                score += 18 * term_weight;
                reasons.push(format!("frontmatter matched {term}"));
                matched_terms.push(term.clone());
            }
            if term_matches(&path, term) {
                score += 16 * term_weight;
                reasons.push(format!("path matched {term}"));
                matched_terms.push(term.clone());
            }
            let matches = term_match_count(chunk_text, term).min(5) as i64;
            if matches > 0 {
                let body_weight = if is_expanded { 3 } else { 5 };
                score += matches * body_weight * term_weight as i64;
                reasons.push(format!("chunk matched {term}"));
                matched_terms.push(term.clone());
            }
        }

        if search_terms.oi_synonyms_enabled {
            for algorithm_term in &search_terms.algorithm_terms {
                if chunk
                    .detected_algorithm_terms
                    .iter()
                    .any(|detected| normalize_term(detected) == normalize_term(algorithm_term))
                {
                    score += 18;
                    reasons.push(format!("algorithm term matched {algorithm_term}"));
                    matched_terms.push(algorithm_term.clone());
                }
            }
        }

        if is_current_note && score > 0 {
            score += 8;
            reasons.push("current note boost".to_string());
        }
        if note_modified_secs > 0 && score > 0 {
            score += 1;
        }
        if chunk.is_code {
            score -= 8;
            if query_looks_like_template(search_terms) {
                score += 12;
                reasons.push("code/template query boost".to_string());
            }
        }
        let chunk_len = chunk.text.chars().count();
        if chunk_len < 80 {
            score -= 10;
        }
        if !search_terms.specific_terms.is_empty()
            && !matched_terms
                .iter()
                .any(|term| search_terms.specific_terms.contains(&normalize_term(term)))
        {
            score -= 12;
        }

        let matched_terms = dedup_limited(matched_terms, 16);
        if score >= MIN_RESULT_SCORE {
            scored_chunks.push(ScoredChunk {
                note: note.clone(),
                chunk,
                score,
                reasons,
                matched_terms,
                is_current_note,
            });
        }
    }

    scored_chunks
}

#[allow(dead_code)]
fn score_note(
    note: IndexedNote,
    is_current_note: bool,
    search_terms: &SearchTerms,
) -> Option<ScoredNote> {
    let title = normalize_text_for_search(&note.title);
    let path = normalize_text_for_search(&note.relative_path);
    let frontmatter = normalize_text_for_search(&note.frontmatter_text);
    let tags = normalize_text_for_search(&note.tags.join(" "));
    let summary = normalize_text_for_search(&note.summary);
    let headings = normalize_text_for_search(&note.headings.join(" "));

    let mut score = 0i64;
    let mut reasons = Vec::new();
    let mut matched_specific = false;

    for term in &search_terms.terms {
        let term_weight = if search_terms.specific_terms.contains(term) {
            2
        } else {
            1
        };
        if title.contains(term) {
            score += 34 * term_weight;
            reasons.push(format!("标题命中 {term}"));
            matched_specific |= search_terms.specific_terms.contains(term);
        }
        if tags.contains(term) {
            score += 30 * term_weight;
            reasons.push(format!("标签命中 {term}"));
            matched_specific |= search_terms.specific_terms.contains(term);
        }
        if summary.contains(term) || frontmatter.contains(term) {
            score += 22 * term_weight;
            reasons.push(format!("摘要命中 {term}"));
            matched_specific |= search_terms.specific_terms.contains(term);
        }
        if headings.contains(term) {
            score += 20 * term_weight;
            reasons.push(format!("标题段命中 {term}"));
            matched_specific |= search_terms.specific_terms.contains(term);
        }
        if path.contains(term) {
            score += 16 * term_weight;
            reasons.push(format!("路径命中 {term}"));
            matched_specific |= search_terms.specific_terms.contains(term);
        }
        let body_matches = note
            .chunks
            .iter()
            .map(|chunk| chunk.normalized_text.matches(term).count())
            .sum::<usize>()
            .min(6) as i64;
        if body_matches > 0 {
            score += body_matches * 4 * term_weight as i64;
            reasons.push(format!("正文命中 {term}"));
            matched_specific |= search_terms.specific_terms.contains(term);
        }
    }

    if is_current_note && score > 0 {
        score += 6;
        reasons.push("当前笔记轻微加权".to_string());
    }

    if !matched_specific && !search_terms.specific_terms.is_empty() {
        score -= 12;
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

fn looks_specific(term: &str, oi_synonyms_enabled: bool) -> bool {
    term.chars().any(|ch| ch.is_ascii_digit())
        || term.chars().count() >= 4
        || (oi_synonyms_enabled
            && (oi_alias_groups()
                .iter()
                .flat_map(|group| group.iter().copied())
                .any(|known| normalize_term(known) == term)
                || known_algorithm_terms()
                    .iter()
                    .chain(oi_known_algorithm_terms().iter())
                    .any(|known| normalize_term(known) == term)))
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

#[allow(dead_code)]
fn build_snippet(
    chunks: &[IndexedChunk],
    search_terms: &SearchTerms,
    max_chars: usize,
) -> (String, Option<usize>, Option<usize>) {
    if chunks.is_empty() {
        return (String::new(), None, None);
    }

    let mut scored_chunks = chunks
        .iter()
        .enumerate()
        .map(|(index, chunk)| (score_chunk(chunk, search_terms), index, chunk))
        .collect::<Vec<_>>();
    scored_chunks.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));

    let mut selected_indices = scored_chunks
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
        let chunk = &chunks[index];
        let prepared = prepare_snippet_block(&chunk.text, max_chars.saturating_sub(used_chars));
        if prepared.trim().is_empty() {
            continue;
        }
        used_chars += prepared.chars().count();
        line_start = Some(line_start.map_or(chunk.line_start, |current: usize| {
            current.min(chunk.line_start)
        }));
        line_end =
            Some(line_end.map_or(chunk.line_end, |current: usize| current.max(chunk.line_end)));
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
    is_code: bool,
    heading_path: Vec<String>,
}

fn split_markdown_chunks(relative_path: &str, body: &str) -> Vec<TextBlock> {
    let mut chunks = Vec::new();
    let mut heading_path: Vec<String> = Vec::new();
    let mut current = Vec::new();
    let mut current_start = 1usize;
    let mut current_end = 1usize;
    let mut current_has_non_code = false;
    let mut current_is_code_only = true;
    let mut in_code = false;
    let mut code_chars = 0usize;
    let mut code_truncated = false;

    let flush = |chunks: &mut Vec<TextBlock>,
                 current: &mut Vec<String>,
                 current_start: usize,
                 current_end: usize,
                 heading_path: &[String],
                 current_has_non_code: bool,
                 current_is_code_only: bool| {
        let text = current.join("\n").trim().to_string();
        if text.is_empty() {
            current.clear();
            return;
        }
        chunks.push(TextBlock {
            text,
            start_line: current_start,
            end_line: current_end.max(current_start),
            is_code: current_is_code_only && !current_has_non_code,
            heading_path: heading_path.to_vec(),
        });
        current.clear();
    };

    for (line_index, line) in body.lines().enumerate() {
        let line_no = line_index + 1;
        let trimmed = line.trim();
        let heading = parse_markdown_heading(trimmed);

        if !in_code {
            if let Some((level, title)) = heading {
                if !current.is_empty() {
                    flush(
                        &mut chunks,
                        &mut current,
                        current_start,
                        current_end,
                        &heading_path,
                        current_has_non_code,
                        current_is_code_only,
                    );
                }
                let depth = level.min(3);
                if heading_path.len() >= depth {
                    heading_path.truncate(depth - 1);
                }
                heading_path.push(title);
                current_start = line_no;
                current_end = line_no;
                current_has_non_code = true;
                current_is_code_only = false;
                current.push(line.to_string());
                continue;
            }

            if trimmed.is_empty() {
                if current_chars(&current) >= MIN_INDEX_CHUNK_CHARS {
                    flush(
                        &mut chunks,
                        &mut current,
                        current_start,
                        current_end,
                        &heading_path,
                        current_has_non_code,
                        current_is_code_only,
                    );
                    current_has_non_code = false;
                    current_is_code_only = true;
                    current_start = line_no + 1;
                    current_end = line_no + 1;
                } else if !current.is_empty() {
                    current.push(String::new());
                    current_end = line_no;
                } else {
                    current_start = line_no + 1;
                    current_end = line_no + 1;
                }
                continue;
            }
        }

        let fence = trimmed.starts_with("```") || trimmed.starts_with("~~~");
        if fence {
            in_code = !in_code;
            if current.is_empty() {
                current_start = line_no;
            }
            current.push(line.to_string());
            current_end = line_no;
            current_is_code_only &= !current_has_non_code;
            if !in_code {
                code_chars = 0;
                code_truncated = false;
            }
            continue;
        }

        if current.is_empty() {
            current_start = line_no;
            current_is_code_only = in_code;
        }

        if in_code {
            let line_chars = line.chars().count();
            if code_chars + line_chars > MAX_CODE_CHARS_PER_BLOCK {
                if !code_truncated {
                    current.push("[code block truncated]".to_string());
                    code_truncated = true;
                }
                current_end = line_no;
                continue;
            }
            code_chars += line_chars;
        } else {
            current_has_non_code = true;
            current_is_code_only = false;
        }

        current.push(line.to_string());
        current_end = line_no;

        if current_chars(&current) >= TARGET_INDEX_CHUNK_CHARS {
            flush(
                &mut chunks,
                &mut current,
                current_start,
                current_end,
                &heading_path,
                current_has_non_code,
                current_is_code_only,
            );
            current_has_non_code = false;
            current_is_code_only = true;
            current_start = line_no + 1;
            current_end = line_no + 1;
        }
    }

    if !current.is_empty() {
        flush(
            &mut chunks,
            &mut current,
            current_start,
            current_end,
            &heading_path,
            current_has_non_code,
            current_is_code_only,
        );
    }

    if chunks.is_empty() && !body.trim().is_empty() {
        chunks.push(TextBlock {
            text: truncate_chars(body.trim(), MAX_INDEX_CHUNK_CHARS),
            start_line: 1,
            end_line: body.lines().count().max(1),
            is_code: false,
            heading_path: vec![fallback_title(relative_path)],
        });
    }

    chunks
}

fn current_chars(lines: &[String]) -> usize {
    lines.iter().map(|line| line.chars().count() + 1).sum()
}

fn parse_markdown_heading(trimmed: &str) -> Option<(usize, String)> {
    let level = trimmed.chars().take_while(|ch| *ch == '#').count();
    if !(1..=3).contains(&level) {
        return None;
    }
    let rest = trimmed.get(level..)?.trim();
    if rest.is_empty() || rest.starts_with('#') {
        return None;
    }
    Some((level, rest.trim_matches('#').trim().to_string()))
}

#[allow(dead_code)]
fn split_blocks(body: &str) -> Vec<TextBlock> {
    let mut blocks = Vec::new();
    let mut current = Vec::new();
    let mut start_line = 1usize;
    let mut in_code = false;
    let mut current_is_code = false;

    for (line_index, line) in body.lines().enumerate() {
        let line_no = line_index + 1;
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            if !current.is_empty() && !in_code {
                blocks.push(TextBlock {
                    text: current.join("\n"),
                    start_line,
                    end_line: line_no.saturating_sub(1).max(start_line),
                    is_code: current_is_code,
                    heading_path: Vec::new(),
                });
                current.clear();
            }
            if current.is_empty() {
                start_line = line_no;
                current_is_code = true;
            }
            in_code = !in_code;
            current.push(line.to_string());
            if !in_code {
                blocks.push(TextBlock {
                    text: current.join("\n"),
                    start_line,
                    end_line: line_no.max(start_line),
                    is_code: true,
                    heading_path: Vec::new(),
                });
                current.clear();
                current_is_code = false;
                start_line = line_no + 1;
            }
            continue;
        }
        if !in_code && trimmed.is_empty() {
            if !current.is_empty() {
                blocks.push(TextBlock {
                    text: current.join("\n"),
                    start_line,
                    end_line: line_no.saturating_sub(1).max(start_line),
                    is_code: current_is_code,
                    heading_path: Vec::new(),
                });
                current.clear();
                current_is_code = false;
            }
            start_line = line_no + 1;
            continue;
        }
        if current.is_empty() {
            start_line = line_no;
            current_is_code = in_code;
        }
        current.push(line.to_string());
    }
    if !current.is_empty() {
        let end_line = body.lines().count().max(start_line);
        blocks.push(TextBlock {
            text: current.join("\n"),
            start_line,
            end_line,
            is_code: current_is_code,
            heading_path: Vec::new(),
        });
    }
    blocks
}

#[allow(dead_code)]
fn score_chunk(chunk: &IndexedChunk, search_terms: &SearchTerms) -> i64 {
    let mut score = 0i64;
    for term in &search_terms.terms {
        let matches = chunk.normalized_text.matches(term).count().min(4) as i64;
        if matches > 0 {
            score += matches
                * if search_terms.specific_terms.contains(term) {
                    9
                } else {
                    4
                };
        }
    }
    if chunk.normalized_text.contains("wa")
        || chunk.normalized_text.contains("tle")
        || chunk.normalized_text.contains("re")
        || chunk.normalized_text.contains("复杂度")
        || chunk.normalized_text.contains("实现")
        || chunk.normalized_text.contains("注意")
        || chunk.normalized_text.contains("坑")
        || chunk.normalized_text.contains("初始化")
        || chunk.normalized_text.contains("边界")
    {
        score += 6;
    }
    if chunk.is_code {
        score += 2;
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
    let mut code_truncated = false;
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
                if !code_truncated {
                    output.push_str("[code block truncated]\n");
                    code_truncated = true;
                }
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
    let mut trimmed = output
        .trim()
        .chars()
        .take(remaining_chars)
        .collect::<String>();
    if output.chars().count() > remaining_chars {
        trimmed.push_str("...");
    }
    trimmed
}

fn extract_headings(body: &str) -> Vec<String> {
    body.lines()
        .filter_map(|line| {
            let trimmed = line.trim_start();
            if !trimmed.starts_with('#') {
                return None;
            }
            Some(trimmed.trim_start_matches('#').trim().to_string())
        })
        .filter(|heading| !heading.is_empty())
        .take(24)
        .collect()
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let mut truncated = value.chars().take(max_chars).collect::<String>();
    truncated.push_str("...");
    truncated
}

fn query_looks_like_template(search_terms: &SearchTerms) -> bool {
    search_terms.terms.iter().any(|term| {
        matches!(
            term.as_str(),
            "模板" | "template" | "代码" | "code" | "实现"
        )
    })
}

fn local_search_diagnostics(
    search_terms: &SearchTerms,
    searched_chunks: usize,
    top_score: i64,
    same_note_dedup_applied: bool,
    current_note_boost_applied: bool,
) -> String {
    format!(
        "localIndexVersion={}; queryTerms={}; expandedTerms={}; problemIds={}; algorithmTerms={}; searchedChunks={}; topChunkScore={}; sameNoteDedupApplied={}; currentNoteBoostApplied={}",
        INDEX_VERSION,
        search_terms.terms.join("|"),
        search_terms.expanded_terms.join("|"),
        search_terms.problem_ids.join("|"),
        search_terms.algorithm_terms.join("|"),
        searched_chunks,
        top_score,
        same_note_dedup_applied,
        current_note_boost_applied,
    )
}

#[allow(dead_code)]
fn stable_local_note_id(relative_path: &str) -> String {
    let mut hash = 1469598103934665603u64;
    for byte in relative_path.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1099511628211);
    }
    format!("local-note-{hash:016x}")
}

fn stable_chunk_id(
    relative_path: &str,
    heading_path: &[String],
    chunk_index: usize,
    text: &str,
) -> String {
    let seed = format!(
        "{}|{}|{}|{}",
        relative_path,
        heading_path.join(">"),
        chunk_index,
        text
    );
    let mut hash = 1469598103934665603u64;
    for byte in seed.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1099511628211);
    }
    format!("chunk-{hash:016x}")
}

fn stable_local_chunk_id(relative_path: &str, chunk_id: &str) -> String {
    let mut hash = 1469598103934665603u64;
    for byte in format!("{relative_path}|{chunk_id}").as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(1099511628211);
    }
    format!("local-note-chunk-{hash:016x}")
}

fn metadata_modified_secs(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0)
}
