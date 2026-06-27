use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RelativePathIssue {
    Empty,
    Absolute,
    Traversal,
}

pub(crate) fn normalize_relative_path(relative_path: &str) -> Result<String, RelativePathIssue> {
    let normalized = relative_path.replace('\\', "/");

    if normalized.is_empty() {
        return Err(RelativePathIssue::Empty);
    }

    if normalized.starts_with('/')
        || relative_path.starts_with('\\')
        || Path::new(&normalized).is_absolute()
    {
        return Err(RelativePathIssue::Absolute);
    }

    for segment in normalized.split('/') {
        if segment.is_empty() || segment == "." || segment == ".." {
            return Err(RelativePathIssue::Traversal);
        }
    }

    Ok(normalized)
}

pub(crate) fn canonicalize_base_dir(base_dir: &Path) -> Result<PathBuf, String> {
    base_dir
        .canonicalize()
        .map_err(|e| format!("无法解析目录路径：{e}"))
}

pub(crate) fn path_is_within_base(candidate: &Path, canonical_base: &Path) -> bool {
    candidate.starts_with(canonical_base)
}

pub(crate) fn resolve_relative_path_within_base(
    base_dir: &Path,
    normalized_relative_path: &str,
) -> Result<PathBuf, String> {
    let canonical_base = canonicalize_base_dir(base_dir)?;
    let candidate = canonical_base.join(normalized_relative_path);

    if !path_is_within_base(&candidate, &canonical_base) {
        return Err("路径越界到基准目录之外".to_string());
    }

    Ok(candidate)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn reject_empty_path() {
        assert_eq!(
            normalize_relative_path("").unwrap_err(),
            RelativePathIssue::Empty
        );
    }

    #[test]
    fn reject_absolute_path() {
        assert_eq!(
            normalize_relative_path("/absolute/path.md").unwrap_err(),
            RelativePathIssue::Absolute
        );
    }

    #[test]
    fn reject_traversal_path() {
        assert_eq!(
            normalize_relative_path("tricks/../../escape.md").unwrap_err(),
            RelativePathIssue::Traversal
        );
    }

    #[test]
    fn normalize_backslashes_to_slashes() {
        assert_eq!(
            normalize_relative_path("tricks\\qpow.md").unwrap(),
            "tricks/qpow.md"
        );
    }

    #[test]
    fn keep_candidate_inside_notes_base() {
        let dir = tempdir().unwrap();
        let notes_dir = dir.path().join("notes");
        let sibling = dir.path().join("notes_extra").join("draft.md");
        std::fs::create_dir_all(&notes_dir).unwrap();
        std::fs::create_dir_all(sibling.parent().unwrap()).unwrap();

        let canonical_notes = canonicalize_base_dir(&notes_dir).unwrap();
        assert!(path_is_within_base(
            &canonical_notes.join("tricks/qpow.md"),
            &canonical_notes
        ));
        assert!(!path_is_within_base(&sibling, &canonical_notes));
    }
}
