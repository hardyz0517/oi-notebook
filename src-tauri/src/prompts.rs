use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;

use crate::paths;

const LUOGU_INSIGHT_PROMPT: &str = "luogu-insight.md";
const NOTE_METADATA_PROMPT: &str = "note-metadata.md";
const NOTE_POLISH_PROMPT: &str = "note-polish.md";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PromptTemplateKind {
    LuoguInsight,
    NoteMetadata,
    NotePolish,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplateSummary {
    pub file_name: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplateContent {
    pub file_name: String,
    pub content: String,
}

impl PromptTemplateKind {
    pub(crate) fn file_name(self) -> &'static str {
        match self {
            Self::LuoguInsight => LUOGU_INSIGHT_PROMPT,
            Self::NoteMetadata => NOTE_METADATA_PROMPT,
            Self::NotePolish => NOTE_POLISH_PROMPT,
        }
    }

    fn display_name(self) -> &'static str {
        match self {
            Self::LuoguInsight => "洛谷 insight 整理",
            Self::NoteMetadata => "当前笔记元数据补全",
            Self::NotePolish => "当前笔记全文润色",
        }
    }

    fn default_content(self) -> &'static str {
        match self {
            Self::LuoguInsight => DEFAULT_LUOGU_INSIGHT_PROMPT,
            Self::NoteMetadata => DEFAULT_NOTE_METADATA_PROMPT,
            Self::NotePolish => DEFAULT_NOTE_POLISH_PROMPT,
        }
    }
}

const PROMPT_KINDS: [PromptTemplateKind; 3] = [
    PromptTemplateKind::LuoguInsight,
    PromptTemplateKind::NoteMetadata,
    PromptTemplateKind::NotePolish,
];

const DEFAULT_LUOGU_INSIGHT_PROMPT: &str = r#"You are an OI competitive programming notebook assistant.

Return only strict JSON. Do not use markdown fences around the JSON.
Do not ask for, output, or mention API keys, base URLs, cookies, or other secrets.

Required JSON schema:
{
  "should_import": boolean,
  "title": string,
  "tags": string[],
  "difficulty": string,
  "summary": string,
  "draft": boolean,
  "body": string
}

Task:
Turn the candidate comment into a reusable OI learning note.
The note is mainly for recording tricks, insights, pitfalls, implementation reminders, debugging lessons, or useful function / template / API usage patterns.

This is NOT a full solution writer.
The output should usually be a short technique card, insight card, pitfall card, or usage note.

Import policy:
- Return should_import=true if the comment contains a reusable trick, insight, pitfall, implementation detail, debugging lesson, function usage pattern, or technique that can help future training.
- Return should_import=false if the comment is too vague, purely emotional, only says it passed/failed, only records meaningless progress, or has no reusable learning value.
- Do not import overly broad remarks such as "注意 long long" unless the comment clearly explains where, why, or under what condition it matters.

Content policy:
- Only organize and clarify information supported by the candidate comment and the given problem metadata.
- Do not invent missing algorithms, proofs, transitions, complete solutions, code details, or complexity analysis.
- You may make light, reasonable generalizations directly implied by the comment, such as turning a specific pitfall into a future self-check point.
- Focus on making clear:
  1. what the trick / pitfall / insight is;
  2. when it applies;
  3. how it can be used;
  4. what to check next time.
- If the comment contains multiple independent points, separate them with Markdown level-2 headings (`##`).
- If one point has internal subpoints, use level-3 headings (`###`).
- If the comment contains both tricks and pitfalls, separate them clearly.
- If the comment is about a function, template, library API, or coding pattern, explain its usage scenario and common mistakes.

Body style:
- body must be Markdown.
- Use clear headings freely, such as:
  - ## 技巧
  - ## 启发
  - ## 坑点
  - ## 用法
  - ## 自查
- Do not force the same headings every time; choose headings that fit the comment.
- Keep it concise and useful. Usually 80-300 Chinese characters.
- If the comment contains several meaningful independent points, it may be longer, but avoid padding.
- Do not write report-like language.
- Do not say "本文介绍了", "本题主要考察", or similar filler.
- Do not write a complete editorial unless the comment itself already contains enough details.

Title:
- title should be professional, concise, and clear.
- If the comment contains only one main point, summarize that point as the title.
- If the comment contains multiple independent points, use a title like "{{problem_title}} 的若干体会" or "{{problem_id}} 的若干技巧与坑点".
- For techniques or algorithms with standard names, use their standard names, such as "点分树", "李超线段树", "倍增", "树状数组", "离散化", "换根 DP", "单调栈".
- Avoid vague or overly casual titles.
- Do not simply copy the problem title unless it is genuinely the best title.

Tags:
- tags must contain 2-5 concise items when should_import=true.
- Tags should include both:
  1. algorithm / technique tags, such as "线段树", "点分树", "离散化", "DP";
  2. type / purpose tags, such as "技巧", "坑点", "实现细节", "调试", "函数用法".
- Prefer specific tags over broad tags.
- Avoid overly broad tags such as "学习", "算法", "题解" unless no better tag exists.
- Do not include duplicate or near-duplicate tags.

Other fields:
- difficulty should use Problem difficulty if provided; otherwise use an empty string.
- summary should be one concise Chinese sentence describing the note value.
- draft should default to true unless the comment clearly says it is publish-ready.

Problem ID: {{problem_id}}
Problem title: {{problem_title}}
Problem difficulty: {{problem_difficulty}}
Problem tags: {{problem_tags}}
Submission ID: {{submission_id}}

Problem statement excerpt, if available:
{{problem_statement_excerpt}}

Candidate comment:
{{candidate_comment}}
"#;

const DEFAULT_NOTE_METADATA_PROMPT: &str = r#"You are an OI competitive programming notebook metadata assistant.

Return only strict JSON. Do not use markdown fences.
Do not ask for, output, or mention API keys, base URLs, cookies, or other secrets.

Required JSON schema:
{
  "title": string,
  "tags": string[],
  "summary": string
}

Rules:
- Generate metadata only from the current note content.
- category describes the note kind, such as 题解, 技巧, 学习, 杂谈, or 项目日志.
- tags describe knowledge points, training use, source, stage, project, and related dimensions.
- Prefer canonical taxonomy paths from the local tag context when they fit.
- Normalize aliases to canonical paths, for example 拓展 KMP / exKMP -> 算法/字符串/Z 函数, and 李超树 -> 算法/数据结构/李超线段树.
- tags should contain only confident labels. Do not invent many labels just to fill the list.
- summary must be one concise sentence.
- title may be improved, but keep it factual and not exaggerated.
- Do not rewrite or polish the note body.
- Do not return Markdown, only JSON.

Note relative path: {{note_path}}

Local tag taxonomy context:
{{tag_context}}

Current markdown content:
{{content}}
"#;

const DEFAULT_NOTE_POLISH_PROMPT: &str = r#"You are an OI competitive programming notebook writing assistant.

Return only strict JSON. Do not use markdown fences.
Do not ask for, output, or mention API keys, base URLs, cookies, or other secrets.

Required JSON schema:
{
  "polished_body": string
}

Rules:
- Polish only the Markdown body provided by the user.
- Preserve the existing Markdown structure.
- Do not change the content inside fenced code blocks.
- Do not change math formulas, including inline $...$ and block $$...$$ formulas.
- Do not delete links, images, or tables.
- Do not invent new solution ideas, proof details, algorithms, or examples.
- Make the wording clearer and more suitable for OI note review.
- Return only JSON, not Markdown outside JSON.

Note relative path: {{note_path}}

Markdown body to polish:
{{body}}
"#;

fn prompts_dir() -> Result<PathBuf, String> {
    Ok(paths::oinb_dir()?.join("prompts"))
}

fn prompt_kind_from_file_name(file_name: &str) -> Result<PromptTemplateKind, String> {
    match file_name.trim() {
        LUOGU_INSIGHT_PROMPT => Ok(PromptTemplateKind::LuoguInsight),
        NOTE_METADATA_PROMPT => Ok(PromptTemplateKind::NoteMetadata),
        NOTE_POLISH_PROMPT => Ok(PromptTemplateKind::NotePolish),
        _ => Err("Prompt failed: unknown prompt file".to_string()),
    }
}

fn ensure_prompt_file(prompts_dir: &Path, kind: PromptTemplateKind) -> Result<PathBuf, String> {
    fs::create_dir_all(prompts_dir)
        .map_err(|e| format!("Prompt failed: cannot create .oinb/prompts directory: {e}"))?;

    let prompt_path = prompts_dir.join(kind.file_name());
    if !prompt_path.exists() {
        fs::write(&prompt_path, kind.default_content())
            .map_err(|e| format!("Prompt failed: cannot write default prompt: {e}"))?;
    }

    Ok(prompt_path)
}

fn read_prompt_template_from_dir(
    prompts_dir: &Path,
    kind: PromptTemplateKind,
) -> Result<String, String> {
    let prompt_path = ensure_prompt_file(prompts_dir, kind)?;
    fs::read_to_string(prompt_path).map_err(|e| format!("Prompt failed: cannot read prompt: {e}"))
}

pub(crate) fn render_prompt_template(
    kind: PromptTemplateKind,
    variables: &[(&str, &str)],
) -> Result<String, String> {
    let prompts_dir = prompts_dir()?;
    render_prompt_template_from_dir(&prompts_dir, kind, variables)
}

fn render_prompt_template_from_dir(
    prompts_dir: &Path,
    kind: PromptTemplateKind,
    variables: &[(&str, &str)],
) -> Result<String, String> {
    let mut prompt = read_prompt_template_from_dir(prompts_dir, kind)?;
    for (key, value) in variables {
        prompt = prompt.replace(&format!("{{{{{key}}}}}"), value);
    }
    Ok(prompt)
}

fn list_prompt_templates_from_dir(
    prompts_dir: &Path,
) -> Result<Vec<PromptTemplateSummary>, String> {
    PROMPT_KINDS
        .iter()
        .map(|kind| {
            ensure_prompt_file(prompts_dir, *kind)?;
            Ok(PromptTemplateSummary {
                file_name: kind.file_name().to_string(),
                display_name: kind.display_name().to_string(),
            })
        })
        .collect()
}

pub(crate) fn ensure_default_prompts() -> Result<(), String> {
    let prompts_dir = prompts_dir()?;
    for kind in PROMPT_KINDS {
        ensure_prompt_file(&prompts_dir, kind)?;
    }
    Ok(())
}

fn save_prompt_template_to_dir(
    prompts_dir: &Path,
    file_name: &str,
    content: &str,
) -> Result<(), String> {
    let kind = prompt_kind_from_file_name(file_name)?;
    fs::create_dir_all(prompts_dir)
        .map_err(|e| format!("Prompt failed: cannot create .oinb/prompts directory: {e}"))?;
    fs::write(prompts_dir.join(kind.file_name()), content)
        .map_err(|e| format!("Prompt failed: cannot save prompt: {e}"))
}

#[tauri::command]
pub fn list_ai_prompts() -> Result<Vec<PromptTemplateSummary>, String> {
    list_prompt_templates_from_dir(&prompts_dir()?)
}

#[tauri::command]
pub fn read_ai_prompt(file_name: String) -> Result<PromptTemplateContent, String> {
    let kind = prompt_kind_from_file_name(&file_name)?;
    let content = read_prompt_template_from_dir(&prompts_dir()?, kind)?;
    Ok(PromptTemplateContent {
        file_name: kind.file_name().to_string(),
        content,
    })
}

#[tauri::command]
pub fn save_ai_prompt(file_name: String, content: String) -> Result<(), String> {
    save_prompt_template_to_dir(&prompts_dir()?, &file_name, &content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use tempfile::tempdir;

    #[test]
    fn creates_default_prompts_when_listing() {
        let dir = tempdir().unwrap();
        let prompts_dir = dir.path().join("prompts");

        let prompts = list_prompt_templates_from_dir(&prompts_dir).unwrap();

        assert_eq!(prompts.len(), 3);
        assert!(prompts_dir.join(LUOGU_INSIGHT_PROMPT).exists());
        assert!(prompts_dir.join(NOTE_METADATA_PROMPT).exists());
        assert!(prompts_dir.join(NOTE_POLISH_PROMPT).exists());
    }

    #[test]
    fn ensure_prompt_file_does_not_overwrite_existing_prompt() {
        let dir = tempdir().unwrap();
        let prompts_dir = dir.path().join("prompts");
        fs::create_dir_all(&prompts_dir).unwrap();
        fs::write(prompts_dir.join(NOTE_METADATA_PROMPT), "custom metadata prompt").unwrap();

        ensure_prompt_file(&prompts_dir, PromptTemplateKind::NoteMetadata).unwrap();

        assert_eq!(
            fs::read_to_string(prompts_dir.join(NOTE_METADATA_PROMPT)).unwrap(),
            "custom metadata prompt"
        );
    }

    #[test]
    fn renders_prompt_variables() {
        let dir = tempdir().unwrap();
        let prompts_dir = dir.path().join("prompts");
        fs::create_dir_all(&prompts_dir).unwrap();
        fs::write(
            prompts_dir.join(NOTE_METADATA_PROMPT),
            "Path={{note_path}}\nContent={{content}}\nMissing={{missing}}",
        )
        .unwrap();

        let rendered = render_prompt_template_from_dir(
            &prompts_dir,
            PromptTemplateKind::NoteMetadata,
            &[("note_path", "tricks/a.md"), ("content", "# A")],
        )
        .unwrap();

        assert!(rendered.contains("Path=tricks/a.md"));
        assert!(rendered.contains("Content=# A"));
        assert!(rendered.contains("Missing={{missing}}"));
    }

    #[test]
    fn rejects_unknown_prompt_file() {
        assert!(prompt_kind_from_file_name("../config.json").is_err());
        assert!(prompt_kind_from_file_name("other.md").is_err());
    }

    #[test]
    fn saves_only_known_prompt_files() {
        let dir = tempdir().unwrap();
        let prompts_dir = dir.path().join("prompts");
        save_prompt_template_to_dir(&prompts_dir, NOTE_POLISH_PROMPT, "custom").unwrap();

        assert_eq!(
            fs::read_to_string(prompts_dir.join(NOTE_POLISH_PROMPT)).unwrap(),
            "custom"
        );
    }

    #[test]
    fn default_prompts_do_not_contain_secret_placeholders() {
        let defaults = HashMap::from([
            (LUOGU_INSIGHT_PROMPT, DEFAULT_LUOGU_INSIGHT_PROMPT),
            (NOTE_METADATA_PROMPT, DEFAULT_NOTE_METADATA_PROMPT),
            (NOTE_POLISH_PROMPT, DEFAULT_NOTE_POLISH_PROMPT),
        ]);

        for (file_name, content) in defaults {
            assert!(!content.contains("{{api_key}}"), "{file_name}");
            assert!(!content.contains("{{base_url}}"), "{file_name}");
        }
    }
}
