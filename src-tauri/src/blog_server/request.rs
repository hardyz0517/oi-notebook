pub(crate) fn request_target(first_line: &str) -> Option<&str> {
    let mut parts = first_line.split_whitespace();
    let method = parts.next()?;
    let path = parts.next()?;

    if method != "GET" {
        return None;
    }

    Some(path)
}

pub(crate) fn target_path(target: &str) -> &str {
    target.split('?').next().unwrap_or(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_get_request_target() {
        assert_eq!(
            request_target("GET /api/notes HTTP/1.1"),
            Some("/api/notes")
        );
    }

    #[test]
    fn rejects_non_get_request_target() {
        assert_eq!(request_target("POST /api/notes HTTP/1.1"), None);
    }

    #[test]
    fn strips_query_from_target_path() {
        assert_eq!(target_path("/api/note?path=a.md"), "/api/note");
    }
}
