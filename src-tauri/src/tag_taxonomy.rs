use std::{collections::HashMap, fs, io::ErrorKind, path::Path};

use serde::{Deserialize, Serialize};

use crate::paths;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagTaxonomyEntry {
    pub id: String,
    pub path: Vec<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deprecated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_to: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagTaxonomyConfig {
    pub version: u32,
    #[serde(default)]
    pub entries: Vec<TagTaxonomyEntry>,
    #[serde(default)]
    pub aliases: HashMap<String, String>,
    #[serde(default)]
    pub hidden_ids: Vec<String>,
    #[serde(default)]
    pub order_overrides: HashMap<String, i32>,
    #[serde(default)]
    pub merges: HashMap<String, String>,
}

impl Default for TagTaxonomyConfig {
    fn default() -> Self {
        Self {
            version: 1,
            entries: Vec::new(),
            aliases: HashMap::new(),
            hidden_ids: Vec::new(),
            order_overrides: HashMap::new(),
            merges: HashMap::new(),
        }
    }
}

fn read_tag_taxonomy_config_from_path(config_path: &Path) -> Result<TagTaxonomyConfig, String> {
    if !config_path.exists() {
        return Ok(TagTaxonomyConfig::default());
    }

    let content = fs::read_to_string(config_path)
        .map_err(|e| format!("Tag taxonomy failed: cannot read config file: {e}"))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Tag taxonomy failed: cannot parse config file: {e}"))
}

fn write_tag_taxonomy_config_to_path(
    config_path: &Path,
    config: &TagTaxonomyConfig,
) -> Result<(), String> {
    validate_tag_taxonomy_config(config)?;

    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Tag taxonomy failed: cannot create .oinb directory: {e}"))?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Tag taxonomy failed: cannot serialize config: {e}"))?;
    fs::write(config_path, format!("{content}\n"))
        .map_err(|e| format!("Tag taxonomy failed: cannot write config file: {e}"))
}

fn validate_tag_taxonomy_config(config: &TagTaxonomyConfig) -> Result<(), String> {
    if config.version == 0 {
        return Err("Tag taxonomy config version must be at least 1.".to_string());
    }

    for entry in &config.entries {
        if entry.id.trim().is_empty() {
            return Err("Tag taxonomy entry id cannot be empty.".to_string());
        }
        if entry.path.is_empty() {
            return Err(format!(
                "Tag taxonomy entry '{}' path cannot be empty.",
                entry.id
            ));
        }
        if entry.path.iter().any(|segment| segment.trim().is_empty()) {
            return Err(format!(
                "Tag taxonomy entry '{}' path cannot contain empty segments.",
                entry.id
            ));
        }
    }

    if config.aliases.keys().any(|key| key.trim().is_empty()) {
        return Err("Tag taxonomy alias key cannot be empty.".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn get_tag_taxonomy_config() -> Result<TagTaxonomyConfig, String> {
    read_tag_taxonomy_config_from_path(&paths::tag_taxonomy_config_path()?)
}

#[tauri::command]
pub fn save_tag_taxonomy_config(config: TagTaxonomyConfig) -> Result<(), String> {
    write_tag_taxonomy_config_to_path(&paths::tag_taxonomy_config_path()?, &config)
}

#[tauri::command]
pub fn reset_tag_taxonomy_config() -> Result<TagTaxonomyConfig, String> {
    let config_path = paths::tag_taxonomy_config_path()?;
    match fs::remove_file(&config_path) {
        Ok(()) => {}
        Err(e) if e.kind() == ErrorKind::NotFound => {}
        Err(e) => {
            return Err(format!(
                "Tag taxonomy failed: cannot reset config file: {e}"
            ));
        }
    }

    Ok(TagTaxonomyConfig::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn missing_config_returns_default() {
        let dir = tempdir().unwrap();
        let config_path = dir.path().join("tag-taxonomy.json");

        assert_eq!(
            read_tag_taxonomy_config_from_path(&config_path).unwrap(),
            TagTaxonomyConfig::default()
        );
    }

    #[test]
    fn writes_pretty_json_with_frontend_field_names() {
        let dir = tempdir().unwrap();
        let config_path = dir.path().join(".oinb").join("tag-taxonomy.json");
        let config = TagTaxonomyConfig {
            version: 1,
            hidden_ids: vec!["algorithm.string.kmp".to_string()],
            order_overrides: HashMap::from([("algorithm.string.z-function".to_string(), 10)]),
            entries: vec![TagTaxonomyEntry {
                id: "user.example".to_string(),
                path: vec![
                    "Algorithm".to_string(),
                    "String".to_string(),
                    "Example".to_string(),
                ],
                aliases: vec!["Old Name".to_string()],
                order: Some(100),
                source: Some("user".to_string()),
                hidden: Some(false),
                deprecated: Some(false),
                merge_to: Some("algorithm.string.z-function".to_string()),
            }],
            aliases: HashMap::from([(
                "exKMP".to_string(),
                "algorithm.string.z-function".to_string(),
            )]),
            merges: HashMap::new(),
        };

        write_tag_taxonomy_config_to_path(&config_path, &config).unwrap();
        let raw = fs::read_to_string(&config_path).unwrap();

        assert!(raw.contains("\"hiddenIds\""));
        assert!(raw.contains("\"orderOverrides\""));
        assert!(raw.contains("\"mergeTo\""));
        assert!(raw.ends_with('\n'));
        assert_eq!(read_tag_taxonomy_config_from_path(&config_path).unwrap(), config);
    }

    #[test]
    fn rejects_invalid_config() {
        let invalid = TagTaxonomyConfig {
            version: 0,
            ..TagTaxonomyConfig::default()
        };

        assert!(validate_tag_taxonomy_config(&invalid).is_err());

        let invalid = TagTaxonomyConfig {
            version: 1,
            entries: vec![TagTaxonomyEntry {
                id: " ".to_string(),
                path: vec!["Algorithm".to_string()],
                aliases: Vec::new(),
                order: None,
                source: None,
                hidden: None,
                deprecated: None,
                merge_to: None,
            }],
            ..TagTaxonomyConfig::default()
        };

        assert!(validate_tag_taxonomy_config(&invalid).is_err());
    }
}
