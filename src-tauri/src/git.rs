use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    process::{Command, Output},
};

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CommitNoteStatus {
    Committed,
    NoChanges,
}

fn repo_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "无法从 CARGO_MANIFEST_DIR 获取项目根目录".to_string())
}

fn notes_dir(repo_root: &Path) -> PathBuf {
    repo_root.join("notes")
}

fn git_output(repo_root: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .args(args)
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("执行 git 命令失败（git {}）：{e}", args.join(" ")))
}

fn output_text(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => "无输出".to_string(),
    }
}

fn git_success(repo_root: &Path, args: &[&str]) -> Result<Output, String> {
    let output = git_output(repo_root, args)?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(format!(
            "git {} 失败：{}",
            args.join(" "),
            output_text(&output)
        ))
    }
}

fn safe_note_pathspec(repo_root: &Path, relative_path: &str) -> Result<String, String> {
    let normalized = relative_path.replace('\\', "/");

    if normalized.is_empty() {
        return Err("Git 提交失败：笔记路径不能为空".to_string());
    }

    if Path::new(&normalized).is_absolute()
        || normalized.starts_with('/')
        || relative_path.starts_with('\\')
    {
        return Err(format!("Git 提交失败：非法笔记路径 '{relative_path}'"));
    }

    for segment in normalized.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(format!("Git 提交失败：非法笔记路径 '{relative_path}'"));
        }
    }

    let canonical_notes = notes_dir(repo_root)
        .canonicalize()
        .map_err(|e| format!("Git 提交失败：无法解析 notes 目录路径：{e}"))?;
    let target = canonical_notes.join(&normalized);
    let canonical_target = target
        .canonicalize()
        .map_err(|e| format!("Git 提交失败：无法解析笔记路径 '{relative_path}'：{e}"))?;

    if !canonical_target.starts_with(&canonical_notes) {
        return Err(format!(
            "Git 提交失败：笔记路径 '{relative_path}' 越界到 notes 目录之外"
        ));
    }

    Ok(format!("notes/{normalized}"))
}

fn safe_asset_pathspec(repo_root: &Path, relative_path: &str) -> Result<String, String> {
    let normalized = relative_path.replace('\\', "/");

    if !normalized.starts_with("assets/") {
        return Err(format!(
            "Git 提交失败：自动提交的图片必须位于 notes/assets/ 下：'{relative_path}'"
        ));
    }

    safe_note_pathspec(repo_root, &normalized)
}

fn reset_paths(repo_root: &Path, pathspecs: &[String]) -> Result<(), String> {
    let mut args = vec!["reset", "--"];
    for pathspec in pathspecs {
        args.push(pathspec.as_str());
    }
    git_success(repo_root, &args).map(|_| ())
}

fn cached_names(repo_root: &Path) -> Result<Vec<String>, String> {
    let staged = git_success(repo_root, &["diff", "--cached", "--name-only"])?;
    Ok(String::from_utf8_lossy(&staged.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

/// 自动提交刚保存的单个 notes 文件，以及本轮粘贴生成的 notes/assets 图片。
///
/// 只允许 add `notes/{relative_path}` 和显式传入的 `notes/assets/...` pathspec。
/// 如果暂存区已有内容，会直接拒绝，避免把用户手动 staged 的内容带进自动 commit。
#[tauri::command]
pub fn commit_note(
    relative_path: String,
    extra_paths: Option<Vec<String>>,
) -> Result<CommitNoteStatus, String> {
    let repo_root = repo_root()?;
    let note_pathspec = safe_note_pathspec(&repo_root, &relative_path)?;
    let mut allowed_pathspecs = BTreeSet::new();
    allowed_pathspecs.insert(note_pathspec);

    for extra_path in extra_paths.unwrap_or_default() {
        allowed_pathspecs.insert(safe_asset_pathspec(&repo_root, &extra_path)?);
    }

    let pathspecs: Vec<String> = allowed_pathspecs.into_iter().collect();

    let staged_names = cached_names(&repo_root)?;
    if !staged_names.is_empty() {
        return Err(format!(
            "暂存区已有内容，已跳过自动提交：{}",
            staged_names.join(", ")
        ));
    }

    let mut add_args = vec!["add", "--"];
    for pathspec in &pathspecs {
        add_args.push(pathspec.as_str());
    }
    if let Err(add_error) = git_success(&repo_root, &add_args) {
        let reset_result = reset_paths(&repo_root, &pathspecs);
        if let Err(reset_error) = reset_result {
            return Err(format!("{add_error}；并且清理本次暂存失败：{reset_error}"));
        }
        return Err(add_error);
    }

    let staged_after_add = cached_names(&repo_root)?;
    let allowed_staged: BTreeSet<&str> = pathspecs.iter().map(String::as_str).collect();
    let staged_allowed = staged_after_add
        .iter()
        .all(|name| allowed_staged.contains(name.as_str()));

    if !staged_allowed {
        let reset_result = reset_paths(&repo_root, &pathspecs);
        let error = format!(
            "自动提交只允许暂存本次保存的笔记和本轮粘贴图片，但当前暂存区包含：{}",
            staged_after_add.join(", ")
        );
        if let Err(reset_error) = reset_result {
            return Err(format!("{error}；并且清理本次暂存失败：{reset_error}"));
        }
        return Err(error);
    }

    let mut diff_args = vec!["diff", "--cached", "--quiet", "--"];
    for pathspec in &pathspecs {
        diff_args.push(pathspec.as_str());
    }
    let diff = git_output(&repo_root, &diff_args)?;

    match diff.status.code() {
        Some(0) => Ok(CommitNoteStatus::NoChanges),
        Some(1) => {
            let message = format!("note: update {relative_path}");
            match git_success(&repo_root, &["commit", "-m", &message]) {
                Ok(_) => Ok(CommitNoteStatus::Committed),
                Err(commit_error) => {
                    let reset_result = reset_paths(&repo_root, &pathspecs);
                    if let Err(reset_error) = reset_result {
                        return Err(format!(
                            "{commit_error}；并且清理本次暂存失败：{reset_error}"
                        ));
                    }
                    Err(commit_error)
                }
            }
        }
        _ => {
            let diff_error = format!("git diff --cached --quiet 失败：{}", output_text(&diff));
            let reset_result = reset_paths(&repo_root, &pathspecs);
            if let Err(reset_error) = reset_result {
                return Err(format!("{diff_error}；并且清理本次暂存失败：{reset_error}"));
            }
            Err(diff_error)
        }
    }
}

/// 手动同步 Git 到远端 main 分支。
///
/// 只执行 `git push origin main`。push 前要求暂存区为空，避免用户手动 staged
/// 的内容处于未处理状态时继续同步远端。
#[tauri::command]
pub fn push_git() -> Result<(), String> {
    let repo_root = repo_root()?;

    let staged_names = cached_names(&repo_root)?;
    if !staged_names.is_empty() {
        return Err(format!(
            "暂存区已有内容，已跳过 Git 同步：{}",
            staged_names.join(", ")
        ));
    }

    git_success(&repo_root, &["push", "origin", "main"]).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn temp_repo_with_note(relative_path: &str) -> (tempfile::TempDir, PathBuf) {
        let dir = tempdir().unwrap();
        let note_path = dir.path().join("notes").join(relative_path);
        fs::create_dir_all(note_path.parent().unwrap()).unwrap();
        fs::write(&note_path, "test").unwrap();
        (dir, note_path)
    }

    fn temp_repo_with_asset(relative_path: &str) -> (tempfile::TempDir, PathBuf) {
        let dir = tempdir().unwrap();
        let asset_path = dir.path().join("notes").join(relative_path);
        fs::create_dir_all(asset_path.parent().unwrap()).unwrap();
        fs::write(&asset_path, "image").unwrap();
        (dir, asset_path)
    }

    #[test]
    fn pathspec_accepts_nested_note() {
        let (dir, _) = temp_repo_with_note("tricks/qpow.md");
        assert_eq!(
            safe_note_pathspec(dir.path(), "tricks/qpow.md").unwrap(),
            "notes/tricks/qpow.md"
        );
    }

    #[test]
    fn pathspec_normalizes_backslashes() {
        let (dir, _) = temp_repo_with_note("tricks/qpow.md");
        assert_eq!(
            safe_note_pathspec(dir.path(), "tricks\\qpow.md").unwrap(),
            "notes/tricks/qpow.md"
        );
    }

    #[test]
    fn pathspec_rejects_parent_traversal() {
        let (dir, _) = temp_repo_with_note("tricks/qpow.md");
        assert!(safe_note_pathspec(dir.path(), "../README.md").is_err());
    }

    #[test]
    fn pathspec_rejects_absolute_path() {
        let (dir, _) = temp_repo_with_note("tricks/qpow.md");
        assert!(safe_note_pathspec(dir.path(), "/tmp/note.md").is_err());
    }

    #[test]
    fn asset_pathspec_accepts_assets_path() {
        let (dir, _) = temp_repo_with_asset("assets/paste.png");
        assert_eq!(
            safe_asset_pathspec(dir.path(), "assets/paste.png").unwrap(),
            "notes/assets/paste.png"
        );
    }

    #[test]
    fn asset_pathspec_rejects_non_asset_path() {
        let (dir, _) = temp_repo_with_note("tricks/qpow.md");
        assert!(safe_asset_pathspec(dir.path(), "tricks/qpow.md").is_err());
    }
}
