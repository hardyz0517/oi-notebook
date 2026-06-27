use std::path::{Component, Path};

pub(crate) fn is_safe_note_relative_path(relative_path: &str) -> bool {
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

pub(crate) fn is_safe_asset_request_relative_path(relative_path: &str) -> bool {
    if relative_path.is_empty() || relative_path.contains('\\') || relative_path.contains('\0') {
        return false;
    }

    let path = Path::new(relative_path);
    path.components()
        .all(|component| matches!(component, Component::Normal(_)))
}

pub(crate) fn is_safe_static_request_relative_path(relative_path: &str) -> bool {
    if relative_path.is_empty() || relative_path.contains('\\') || relative_path.contains('\0') {
        return false;
    }

    let path = Path::new(relative_path);
    path.components()
        .all(|component| matches!(component, Component::Normal(_)))
}

pub(crate) fn asset_content_type(relative_path: &str) -> Option<&'static str> {
    let extension = Path::new(relative_path)
        .extension()
        .and_then(|extension| extension.to_str())?;

    match extension.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

pub(crate) fn static_asset_content_type(relative_path: &str) -> &'static str {
    let extension = Path::new(relative_path)
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default();

    match extension.to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "map" => "application/json; charset=utf-8",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn note_paths_reject_assets_and_traversal() {
        assert!(is_safe_note_relative_path("tricks/demo.md"));
        assert!(!is_safe_note_relative_path("assets/ignored.md"));
        assert!(!is_safe_note_relative_path("../tricks/demo.md"));
        assert!(!is_safe_note_relative_path("/tricks/demo.md"));
    }

    #[test]
    fn asset_and_static_paths_stay_normalized() {
        assert!(is_safe_asset_request_relative_path("demo.png"));
        assert!(!is_safe_asset_request_relative_path("a/../b.png"));
        assert!(is_safe_static_request_relative_path("assets/index.js"));
        assert!(!is_safe_static_request_relative_path("assets\\index.js"));
    }

    #[test]
    fn maps_content_types() {
        assert_eq!(asset_content_type("a.png"), Some("image/png"));
        assert_eq!(
            static_asset_content_type("a.css"),
            "text/css; charset=utf-8"
        );
    }
}
