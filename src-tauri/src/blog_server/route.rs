use super::{
    API_BLOG_CONFIG_ROUTE, API_NOTES_ROUTE, API_NOTE_ROUTE, ASSET_ROUTE_PREFIX, LEGACY_BLOG_ROUTE,
    LEGACY_BLOG_ROUTE_PREFIX, LOCAL_BLOG_ROUTE, LOCAL_BLOG_ROUTE_PREFIX, NOTE_ROUTE_PREFIX,
};

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum BlogRoute {
    BlogConfigApi,
    NotesApi,
    NoteApi,
    NotesAsset,
    LocalBlogRedirect,
    LocalBlogStatic,
    LegacyBlogRedirect,
    LegacyBlogIndex,
    LegacyNoteDetail,
    LocalBlogIndex,
    NotFound,
}

pub(crate) fn blog_route_for_path(path: &str) -> BlogRoute {
    if path == API_BLOG_CONFIG_ROUTE {
        return BlogRoute::BlogConfigApi;
    }

    if path == API_NOTES_ROUTE {
        return BlogRoute::NotesApi;
    }

    if path == API_NOTE_ROUTE {
        return BlogRoute::NoteApi;
    }

    if path.starts_with(ASSET_ROUTE_PREFIX) {
        return BlogRoute::NotesAsset;
    }

    if path == LOCAL_BLOG_ROUTE {
        return BlogRoute::LocalBlogRedirect;
    }

    if path.starts_with(LOCAL_BLOG_ROUTE_PREFIX) {
        return BlogRoute::LocalBlogStatic;
    }

    if path == LEGACY_BLOG_ROUTE {
        return BlogRoute::LegacyBlogRedirect;
    }

    if path == LEGACY_BLOG_ROUTE_PREFIX {
        return BlogRoute::LegacyBlogIndex;
    }

    if path.starts_with(NOTE_ROUTE_PREFIX) {
        return BlogRoute::LegacyNoteDetail;
    }

    if path == "/" {
        return BlogRoute::LocalBlogIndex;
    }

    BlogRoute::NotFound
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_route_does_not_shadow_existing_routes() {
        assert_eq!(
            blog_route_for_path("/api/blog-config"),
            BlogRoute::BlogConfigApi
        );
        assert_eq!(blog_route_for_path("/api/notes"), BlogRoute::NotesApi);
        assert_eq!(blog_route_for_path("/api/note"), BlogRoute::NoteApi);
        assert_eq!(
            blog_route_for_path("/assets/demo.png"),
            BlogRoute::NotesAsset
        );
        assert_eq!(
            blog_route_for_path("/local-blog"),
            BlogRoute::LocalBlogRedirect
        );
        assert_eq!(
            blog_route_for_path("/local-blog/"),
            BlogRoute::LocalBlogStatic
        );
        assert_eq!(
            blog_route_for_path("/legacy-blog"),
            BlogRoute::LegacyBlogRedirect
        );
        assert_eq!(
            blog_route_for_path("/legacy-blog/"),
            BlogRoute::LegacyBlogIndex
        );
        assert_eq!(
            blog_route_for_path("/note/tricks/demo.md"),
            BlogRoute::LegacyNoteDetail
        );
        assert_eq!(blog_route_for_path("/"), BlogRoute::LocalBlogIndex);
        assert_eq!(blog_route_for_path("/missing"), BlogRoute::NotFound);
    }
}
