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
        .ok_or_else(|| "Cannot resolve repo root from CARGO_MANIFEST_DIR".to_string())
}

fn notes_dir(repo_root: &Path) -> PathBuf {
    repo_root.join("notes")
}

fn git_output(repo_root: &Path, args: &[&str]) -> Result<Output, String> {
    Command::new("git")
        .args(args)
        .current_dir(repo_root)
        .output()
        .map_err(|e| format!("Failed to run git {}: {e}", args.join(" ")))
}

fn output_text(output: &Output) -> String {
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    match (stdout.is_empty(), stderr.is_empty()) {
        (false, false) => format!("{stdout}\n{stderr}"),
        (false, true) => stdout,
        (true, false) => stderr,
        (true, true) => "no output".to_string(),
    }
}

fn git_success(repo_root: &Path, args: &[&str]) -> Result<Output, String> {
    let output = git_output(repo_root, args)?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(format!(
            "git {} failed: {}",
            args.join(" "),
            output_text(&output)
        ))
    }
}

fn normalize_note_relative_path(relative_path: &str) -> Result<String, String> {
    let normalized = relative_path.replace('\\', "/");

    if normalized.is_empty() {
        return Err("Git commit failed: note path cannot be empty".to_string());
    }

    if Path::new(&normalized).is_absolute()
        || normalized.starts_with('/')
        || relative_path.starts_with('\\')
    {
        return Err(format!(
            "Git commit failed: illegal note path '{relative_path}'"
        ));
    }

    for segment in normalized.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(format!(
                "Git commit failed: illegal note path '{relative_path}'"
            ));
        }
    }

    Ok(normalized)
}

fn safe_note_pathspec_allow_missing(
    repo_root: &Path,
    relative_path: &str,
) -> Result<String, String> {
    let normalized = normalize_note_relative_path(relative_path)?;
    let canonical_notes = notes_dir(repo_root)
        .canonicalize()
        .map_err(|e| format!("Git commit failed: cannot resolve notes directory: {e}"))?;
    let target = canonical_notes.join(&normalized);

    if !target.starts_with(&canonical_notes) {
        return Err(format!(
            "Git commit failed: note path '{relative_path}' escapes notes directory"
        ));
    }

    Ok(format!("notes/{normalized}"))
}

fn safe_note_pathspec(repo_root: &Path, relative_path: &str) -> Result<String, String> {
    let pathspec = safe_note_pathspec_allow_missing(repo_root, relative_path)?;
    let normalized = pathspec
        .strip_prefix("notes/")
        .ok_or_else(|| format!("Git commit failed: illegal note path '{relative_path}'"))?;

    let canonical_notes = notes_dir(repo_root)
        .canonicalize()
        .map_err(|e| format!("Git commit failed: cannot resolve notes directory: {e}"))?;
    let canonical_target = canonical_notes
        .join(normalized)
        .canonicalize()
        .map_err(|e| {
            format!("Git commit failed: cannot resolve note path '{relative_path}': {e}")
        })?;

    if !canonical_target.starts_with(&canonical_notes) {
        return Err(format!(
            "Git commit failed: note path '{relative_path}' escapes notes directory"
        ));
    }

    Ok(pathspec)
}

fn safe_asset_pathspec(repo_root: &Path, relative_path: &str) -> Result<String, String> {
    let normalized = relative_path.replace('\\', "/");

    if !normalized.starts_with("assets/") {
        return Err(format!(
            "Git commit failed: auto-committed image must be under notes/assets/: '{relative_path}'"
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

fn parse_nul_separated_paths(bytes: &[u8]) -> Vec<String> {
    bytes
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .map(|path| String::from_utf8_lossy(path).into_owned())
        .collect()
}

fn cached_names(repo_root: &Path) -> Result<Vec<String>, String> {
    let staged = git_success(repo_root, &["diff", "--cached", "--name-only", "-z"])?;
    Ok(parse_nul_separated_paths(&staged.stdout))
}

fn git_tracks_pathspec(repo_root: &Path, pathspec: &str) -> Result<bool, String> {
    let output = git_output(repo_root, &["ls-files", "--error-unmatch", "--", pathspec])?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(format!(
            "git ls-files --error-unmatch failed: {}",
            output_text(&output)
        )),
    }
}

fn ensure_staging_area_empty(repo_root: &Path, action: &str) -> Result<(), String> {
    let staged_names = cached_names(repo_root)?;
    if !staged_names.is_empty() {
        return Err(format!(
            "Staging area is not empty; skipped {action}: {}",
            staged_names.join(", ")
        ));
    }

    Ok(())
}

fn stage_allowed_pathspecs(
    repo_root: &Path,
    pathspecs: &[String],
    context: &str,
) -> Result<(), String> {
    let mut add_args = vec!["add", "--"];
    for pathspec in pathspecs {
        add_args.push(pathspec.as_str());
    }

    if let Err(add_error) = git_success(repo_root, &add_args) {
        if let Err(reset_error) = reset_paths(repo_root, pathspecs) {
            return Err(format!(
                "{add_error}; also failed to clean this auto-staged change: {reset_error}"
            ));
        }
        return Err(add_error);
    }

    let staged_after_add = cached_names(repo_root)?;
    let allowed_staged: BTreeSet<&str> = pathspecs.iter().map(String::as_str).collect();
    let staged_allowed = staged_after_add
        .iter()
        .all(|name| allowed_staged.contains(name.as_str()));

    if !staged_allowed {
        let error = format!(
            "{context} may only stage the requested pathspecs, but staging area contains: {}",
            staged_after_add.join(", ")
        );
        if let Err(reset_error) = reset_paths(repo_root, pathspecs) {
            return Err(format!(
                "{error}; also failed to clean this auto-staged change: {reset_error}"
            ));
        }
        return Err(error);
    }

    Ok(())
}

fn commit_staged_pathspecs(
    repo_root: &Path,
    pathspecs: &[String],
    message: &str,
) -> Result<(), String> {
    let mut diff_args = vec!["diff", "--cached", "--quiet", "--"];
    for pathspec in pathspecs {
        diff_args.push(pathspec.as_str());
    }
    let diff = git_output(repo_root, &diff_args)?;

    match diff.status.code() {
        Some(0) => {
            if let Err(reset_error) = reset_paths(repo_root, pathspecs) {
                return Err(format!(
                    "Git commit failed: no staged changes for requested pathspecs; also failed to clean this auto-staged change: {reset_error}"
                ));
            }
            Err("Git commit failed: no staged changes for requested pathspecs".to_string())
        }
        Some(1) => match git_success(repo_root, &["commit", "-m", message]) {
            Ok(_) => Ok(()),
            Err(commit_error) => {
                if let Err(reset_error) = reset_paths(repo_root, pathspecs) {
                    return Err(format!(
                        "{commit_error}; also failed to clean this auto-staged change: {reset_error}"
                    ));
                }
                Err(commit_error)
            }
        },
        _ => {
            let diff_error = format!("git diff --cached --quiet failed: {}", output_text(&diff));
            if let Err(reset_error) = reset_paths(repo_root, pathspecs) {
                return Err(format!(
                    "{diff_error}; also failed to clean this auto-staged change: {reset_error}"
                ));
            }
            Err(diff_error)
        }
    }
}

/// Auto-commit the just-saved note and optional pasted image assets.
///
/// This only stages explicit `notes/{relative_path}` and `notes/assets/...`
/// pathspecs. If anything is already staged, it refuses to commit so user
/// staged changes are never swept into an automatic commit.
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

    ensure_staging_area_empty(&repo_root, "auto note commit")?;
    stage_allowed_pathspecs(&repo_root, &pathspecs, "Auto note commit")?;

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
                    if let Err(reset_error) = reset_paths(&repo_root, &pathspecs) {
                        return Err(format!(
                            "{commit_error}; also failed to clean this auto-staged change: {reset_error}"
                        ));
                    }
                    Err(commit_error)
                }
            }
        }
        _ => {
            let diff_error = format!("git diff --cached --quiet failed: {}", output_text(&diff));
            if let Err(reset_error) = reset_paths(&repo_root, &pathspecs) {
                return Err(format!(
                    "{diff_error}; also failed to clean this auto-staged change: {reset_error}"
                ));
            }
            Err(diff_error)
        }
    }
}

#[tauri::command]
pub fn commit_deleted_note(relative_path: String) -> Result<CommitNoteStatus, String> {
    let repo_root = repo_root()?;
    let pathspecs = vec![safe_note_pathspec_allow_missing(
        &repo_root,
        &relative_path,
    )?];
    if !git_tracks_pathspec(&repo_root, &pathspecs[0])? {
        return Ok(CommitNoteStatus::NoChanges);
    }

    let message = format!("note: delete {relative_path}");

    ensure_staging_area_empty(&repo_root, "auto delete note commit")?;
    stage_allowed_pathspecs(&repo_root, &pathspecs, "Auto delete note commit")?;
    commit_staged_pathspecs(&repo_root, &pathspecs, &message)?;
    Ok(CommitNoteStatus::Committed)
}

#[tauri::command]
pub fn commit_renamed_note(old_path: String, new_path: String) -> Result<(), String> {
    let repo_root = repo_root()?;
    let pathspecs = vec![
        safe_note_pathspec_allow_missing(&repo_root, &old_path)?,
        safe_note_pathspec(&repo_root, &new_path)?,
    ];
    let message = format!("note: rename {old_path} to {new_path}");

    ensure_staging_area_empty(&repo_root, "auto rename note commit")?;
    stage_allowed_pathspecs(&repo_root, &pathspecs, "Auto rename note commit")?;
    commit_staged_pathspecs(&repo_root, &pathspecs, &message)
}

/// Manually push the current main branch to origin.
///
/// This only runs `git push origin main`. It refuses to push while the staging
/// area is non-empty, but it allows unrelated untracked files to remain local.
#[tauri::command]
pub fn push_git() -> Result<(), String> {
    let repo_root = repo_root()?;

    ensure_staging_area_empty(&repo_root, "Git push")?;

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
    fn parses_nul_separated_unicode_paths() {
        let bytes = b"notes/luogu/P1234-\xe5\x8c\xba\xe9\x97\xb4.md\0notes/assets/a.png\0";

        assert_eq!(
            parse_nul_separated_paths(bytes),
            vec![
                "notes/luogu/P1234-区间.md".to_string(),
                "notes/assets/a.png".to_string(),
            ]
        );
    }

    #[test]
    fn git_tracks_deleted_tracked_path_but_not_untracked_path() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("notes").join("tricks")).unwrap();
        git_success(dir.path(), &["init"]).unwrap();

        let tracked_path = dir.path().join("notes").join("tricks").join("tracked.md");
        fs::write(&tracked_path, "test").unwrap();
        git_success(dir.path(), &["add", "--", "notes/tricks/tracked.md"]).unwrap();
        fs::remove_file(&tracked_path).unwrap();

        assert!(git_tracks_pathspec(dir.path(), "notes/tricks/tracked.md").unwrap());
        assert!(!git_tracks_pathspec(dir.path(), "notes/tricks/untracked.md").unwrap());
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
    fn missing_pathspec_accepts_deleted_note() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("notes").join("tricks")).unwrap();
        assert_eq!(
            safe_note_pathspec_allow_missing(dir.path(), "tricks/deleted.md").unwrap(),
            "notes/tricks/deleted.md"
        );
    }

    #[test]
    fn missing_pathspec_rejects_parent_traversal() {
        let dir = tempdir().unwrap();
        fs::create_dir_all(dir.path().join("notes")).unwrap();
        assert!(safe_note_pathspec_allow_missing(dir.path(), "../README.md").is_err());
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
