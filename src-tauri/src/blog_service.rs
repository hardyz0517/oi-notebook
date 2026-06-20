use crate::luogu::{
    default_blog_subtitle, default_blog_title, read_config, BlogConfigFields,
};

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct BlogConfigApiResponse {
    pub(crate) title: String,
    pub(crate) subtitle: String,
}

#[derive(Debug, Serialize)]
struct BlogErrorApiResponse<'a> {
    error: &'a str,
}

pub(crate) fn effective_blog_config(config: BlogConfigFields) -> BlogConfigApiResponse {
    let title = config.title.trim();
    let subtitle = config.subtitle.trim();

    BlogConfigApiResponse {
        title: if title.is_empty() {
            default_blog_title()
        } else {
            title.to_string()
        },
        subtitle: if subtitle.is_empty() {
            default_blog_subtitle()
        } else {
            subtitle.to_string()
        },
    }
}

pub(crate) fn read_effective_blog_config() -> BlogConfigApiResponse {
    read_config()
        .map(|config| effective_blog_config(config.blog))
        .unwrap_or_else(|_| effective_blog_config(BlogConfigFields::default()))
}

pub(crate) fn render_blog_config_api_json() -> Result<String, String> {
    serde_json::to_string(&read_effective_blog_config())
        .map_err(|e| format!("Failed to serialize blog config API response: {e}"))
}

pub(crate) fn render_json_error(message: &str) -> String {
    serde_json::to_string(&BlogErrorApiResponse { error: message })
        .unwrap_or_else(|_| r#"{"error":"Failed to serialize error response."}"#.to_string())
}
