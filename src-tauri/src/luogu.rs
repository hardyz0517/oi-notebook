use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use serde::Serialize;
use serde_yaml::{Mapping, Value};

use crate::frontmatter;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLuoguInsightResult {
    pub relative_path: String,
}

#[derive(Debug, Default)]
struct InsightFrontmatter {
    title: Option<String>,
    tags: Vec<String>,
    difficulty: Option<String>,
    summary: Option<String>,
    draft: Option<bool>,
}

#[derive(Debug)]
struct InsightBlock {
    frontmatter: InsightFrontmatter,
    body: String,
}

fn repo_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Cannot resolve repo root from CARGO_MANIFEST_DIR".to_string())
}

fn get_notes_dir() -> Result<PathBuf, String> {
    Ok(repo_root()?.join("notes"))
}

fn normalize_problem_id(problem_id: &str) -> Result<String, String> {
    let trimmed = problem_id.trim();
    if trimmed.is_empty() {
        return Err("Luogu import failed: problem id cannot be empty".to_string());
    }

    let digits = trimmed
        .strip_prefix('P')
        .or_else(|| trimmed.strip_prefix('p'))
        .unwrap_or(trimmed);

    if digits.is_empty() || !digits.chars().all(|ch| ch.is_ascii_digit()) {
        return Err(format!(
            "Luogu import failed: problem id must look like P1234 or 1234, got '{problem_id}'"
        ));
    }

    Ok(format!("P{digits}"))
}

fn safe_title_for_filename(title: &str, fallback: &str) -> String {
    const MAX_LEN: usize = 64;

    let mut result = String::new();
    let mut previous_was_space = false;

    for ch in title.trim().chars() {
        let replacement = match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => None,
            ch if ch.is_control() => None,
            ch if ch.is_whitespace() => Some('-'),
            ch => Some(ch),
        };

        if let Some(ch) = replacement {
            if ch == '-' {
                if !previous_was_space && !result.is_empty() {
                    result.push('-');
                }
                previous_was_space = true;
            } else {
                result.push(ch);
                previous_was_space = false;
            }
        }

        if result.chars().count() >= MAX_LEN {
            break;
        }
    }

    let trimmed = result.trim_matches(['.', '-', ' ']).to_string();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed
    }
}

fn extract_oinb_insight(source_code: &str) -> Result<String, String> {
    let marker = "/* @oinb-insight";
    let start = source_code
        .find(marker)
        .ok_or_else(|| "Luogu import failed: cannot find /* @oinb-insight ... */ block".to_string())?;
    let content_start = start + marker.len();
    let rest = &source_code[content_start..];
    let end = rest
        .find("*/")
        .ok_or_else(|| "Luogu import failed: @oinb-insight block is not closed with */".to_string())?;

    Ok(rest[..end].trim().to_string())
}

fn yaml_string(mapping: &Mapping, key: &str) -> Option<String> {
    mapping
        .get(Value::String(key.to_string()))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn yaml_bool(mapping: &Mapping, key: &str) -> Option<bool> {
    mapping
        .get(Value::String(key.to_string()))
        .and_then(Value::as_bool)
}

fn yaml_tags(mapping: &Mapping) -> Vec<String> {
    let Some(value) = mapping.get(Value::String("tags".to_string())) else {
        return Vec::new();
    };

    match value {
        Value::Sequence(items) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        Value::String(value) => value
            .split(',')
            .map(str::trim)
            .filter(|tag| !tag.is_empty())
            .map(ToOwned::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}

fn split_insight_frontmatter(insight: &str) -> Result<InsightBlock, String> {
    let normalized = insight.replace("\r\n", "\n").replace('\r', "\n");
    let Some(rest) = normalized.strip_prefix("---\n") else {
        return Ok(InsightBlock {
            frontmatter: InsightFrontmatter::default(),
            body: normalized.trim().to_string(),
        });
    };

    let Some(end_index) = rest.find("\n---") else {
        return Err("Luogu import failed: insight frontmatter is not closed with ---".to_string());
    };

    let yaml_text = &rest[..end_index];
    let after_yaml = &rest[end_index + "\n---".len()..];
    let body = after_yaml.trim_start_matches('\n').trim().to_string();

    let value: Value = serde_yaml::from_str(yaml_text)
        .map_err(|e| format!("Luogu import failed: cannot parse insight frontmatter: {e}"))?;
    let mapping = value
        .as_mapping()
        .ok_or_else(|| "Luogu import failed: insight frontmatter must be a YAML mapping".to_string())?;

    Ok(InsightBlock {
        frontmatter: InsightFrontmatter {
            title: yaml_string(mapping, "title"),
            tags: yaml_tags(mapping),
            difficulty: yaml_string(mapping, "difficulty"),
            summary: yaml_string(mapping, "summary"),
            draft: yaml_bool(mapping, "draft"),
        },
        body,
    })
}

fn yaml_quote(value: &str) -> String {
    serde_yaml::to_string(value)
        .unwrap_or_else(|_| "\"\"".to_string())
        .trim()
        .trim_start_matches("---")
        .trim()
        .to_string()
}

fn tags_yaml(tags: &[String]) -> String {
    if tags.is_empty() {
        "[]".to_string()
    } else {
        let values = tags
            .iter()
            .map(|tag| yaml_quote(tag))
            .collect::<Vec<_>>()
            .join(", ");
        format!("[{values}]")
    }
}

fn build_note_markdown(
    problem_id: &str,
    problem_title: &str,
    submission_id: &str,
    insight: InsightBlock,
) -> String {
    let title = insight
        .frontmatter
        .title
        .as_deref()
        .unwrap_or_else(|| problem_title.trim());
    let difficulty = insight.frontmatter.difficulty.as_deref().unwrap_or("");
    let summary = insight.frontmatter.summary.as_deref().unwrap_or("");
    let draft = insight.frontmatter.draft.unwrap_or(false);
    let body = insight.body.trim();

    let mut markdown = format!(
        "---\ntitle: {}\ntags: {}\ndifficulty: {}\nsource: {}\nsummary: {}\ndraft: {}\nluogu_submission: {}\n---\n\n",
        yaml_quote(title),
        tags_yaml(&insight.frontmatter.tags),
        yaml_quote(difficulty),
        yaml_quote(&format!("luogu-{problem_id}")),
        yaml_quote(summary),
        draft,
        yaml_quote(submission_id.trim()),
    );

    if !body.is_empty() {
        markdown.push_str(body);
        markdown.push_str("\n\n");
    }

    markdown.push_str("## Links\n\n");
    markdown.push_str(&format!(
        "- Original problem: https://www.luogu.com.cn/problem/{problem_id}\n"
    ));
    markdown.push_str(&format!(
        "- AC submission: https://www.luogu.com.cn/record/{}\n",
        submission_id.trim()
    ));

    markdown
}

fn import_luogu_insight_to_notes_dir(
    notes_dir: &Path,
    problem_id: &str,
    problem_title: &str,
    submission_id: &str,
    source_code: &str,
) -> Result<ImportLuoguInsightResult, String> {
    let problem_id = normalize_problem_id(problem_id)?;
    if problem_title.trim().is_empty() {
        return Err("Luogu import failed: problem title cannot be empty".to_string());
    }
    if submission_id.trim().is_empty() {
        return Err("Luogu import failed: submission id cannot be empty".to_string());
    }

    let insight_text = extract_oinb_insight(source_code)?;
    let insight = split_insight_frontmatter(&insight_text)?;
    let title = insight
        .frontmatter
        .title
        .as_deref()
        .unwrap_or_else(|| problem_title.trim());
    let safe_title = safe_title_for_filename(title, &problem_id);
    let relative_path = format!("luogu/{problem_id}-{safe_title}.md");
    let target_path = notes_dir.join(&relative_path);

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Luogu import failed: cannot create notes/luogu directory: {e}"))?;
    }

    let markdown = build_note_markdown(&problem_id, problem_title, submission_id, insight);
    let (final_content, warning) = frontmatter::process_for_write(&markdown, &relative_path);
    if let Some(warning) = warning {
        return Err(format!(
            "Luogu import failed: generated frontmatter warning for {relative_path}: {warning}"
        ));
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target_path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                format!("Luogu import failed: note already exists: {relative_path}")
            } else {
                format!("Luogu import failed: cannot create note {relative_path}: {e}")
            }
        })?;

    file.write_all(final_content.as_bytes())
        .map_err(|e| format!("Luogu import failed: cannot write note {relative_path}: {e}"))?;

    Ok(ImportLuoguInsightResult { relative_path })
}

#[tauri::command]
pub fn import_luogu_insight(
    problem_id: String,
    problem_title: String,
    submission_id: String,
    source_code: String,
) -> Result<ImportLuoguInsightResult, String> {
    let notes_dir = get_notes_dir()?;
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("Luogu import failed: cannot create notes directory: {e}"))?;

    import_luogu_insight_to_notes_dir(
        &notes_dir,
        &problem_id,
        &problem_title,
        &submission_id,
        &source_code,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_source() -> String {
        r#"
int main() { return 0; }

/* @oinb-insight
---
title: Interval Coverage
tags: [difference, construction]
difficulty: improve+
summary: Find the difference-array view.
draft: true
---

## Insight

Use a difference array.
*/
"#
        .to_string()
    }

    #[test]
    fn extracts_oinb_insight_block() {
        let block = extract_oinb_insight(&sample_source()).unwrap();
        assert!(block.contains("title: Interval Coverage"));
        assert!(block.contains("## Insight"));
        assert!(!block.contains("@oinb-insight"));
    }

    #[test]
    fn missing_insight_block_returns_error() {
        assert!(extract_oinb_insight("int main() {}").is_err());
    }

    #[test]
    fn safe_filename_removes_windows_invalid_chars() {
        assert_eq!(
            safe_title_for_filename("  a <b>: c / d  ", "P1000"),
            "a-b-c-d"
        );
        assert_eq!(safe_title_for_filename("///", "P1000"), "P1000");
    }

    #[test]
    fn generated_frontmatter_uses_insight_fields() {
        let insight = split_insight_frontmatter(&extract_oinb_insight(&sample_source()).unwrap())
            .unwrap();
        let markdown = build_note_markdown("P1234", "Fallback", "987654", insight);

        assert!(markdown.contains("title: Interval Coverage"));
        assert!(markdown.contains("tags: [difference, construction]"));
        assert!(markdown.contains("difficulty: improve+"));
        assert!(markdown.contains("source: luogu-P1234"));
        assert!(markdown.contains("summary: Find the difference-array view."));
        assert!(markdown.contains("draft: true"));
        assert!(markdown.contains("luogu_submission: '987654'"));
        assert!(markdown.contains("https://www.luogu.com.cn/problem/P1234"));
        assert!(markdown.contains("https://www.luogu.com.cn/record/987654"));
    }

    #[test]
    fn import_does_not_overwrite_existing_file() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path();

        let first = import_luogu_insight_to_notes_dir(
            notes_dir,
            "1234",
            "Fallback",
            "987654",
            &sample_source(),
        )
        .unwrap();
        assert_eq!(first.relative_path, "luogu/P1234-Interval-Coverage.md");

        let second = import_luogu_insight_to_notes_dir(
            notes_dir,
            "P1234",
            "Fallback",
            "987654",
            &sample_source(),
        );
        assert!(second.unwrap_err().contains("already exists"));
    }
}
