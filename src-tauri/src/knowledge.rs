use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};
use walkdir::WalkDir;

use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub title: String,
    pub refs: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphEdge {
    pub from: String,
    pub to: String,
    #[serde(rename = "type")]
    pub edge_type: String,
    pub source: String,
    pub confidence: f64,
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphIndex {
    pub generated_at: String,
    pub nodes: Vec<KnowledgeGraphNode>,
    pub edges: Vec<KnowledgeGraphEdge>,
}

#[derive(Debug, Default)]
struct GraphBuildState {
    nodes: BTreeMap<String, KnowledgeGraphNode>,
    edge_keys: BTreeSet<(String, String, String, String)>,
    edges: Vec<KnowledgeGraphEdge>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct KnowledgeFrontmatter {
    #[serde(default)]
    r#type: String,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    topics: Vec<String>,
    #[serde(default, rename = "related_problems")]
    related_problems: Vec<String>,
    #[serde(default)]
    source: String,
    #[serde(default, rename = "created_from")]
    _created_from: String,
    #[serde(default)]
    problem_id: String,
    #[serde(default)]
    collection_id: String,
    #[serde(default)]
    problems: Vec<String>,
    #[serde(default)]
    fragments: Vec<String>,
    #[serde(default)]
    articles: Vec<String>,
}

fn graph_root() -> Result<PathBuf, String> {
    Ok(paths::oinb_dir()?.join("graph"))
}

fn graph_nodes_path() -> Result<PathBuf, String> {
    Ok(graph_root()?.join("nodes.json"))
}

fn graph_edges_path() -> Result<PathBuf, String> {
    Ok(graph_root()?.join("edges.json"))
}

fn graph_summary_path() -> Result<PathBuf, String> {
    Ok(graph_root()?.join("summary.json"))
}

fn graph_batches_path() -> Result<PathBuf, String> {
    Ok(graph_root()?.join("batches.json"))
}

fn normalize_relative_path(path: &Path, base: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(base)
        .map_err(|_| format!("Failed to make path relative: {}", path.display()))?;
    Ok(relative
        .to_str()
        .ok_or_else(|| format!("Path contains non-UTF-8 characters: {}", path.display()))?
        .replace('\\', "/"))
}

fn should_skip_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| {
            name.starts_with('.')
                || name.eq_ignore_ascii_case("node_modules")
                || name.eq_ignore_ascii_case("target")
                || name.eq_ignore_ascii_case("dist")
                || name.eq_ignore_ascii_case("build")
        })
        .unwrap_or(false)
}

fn split_frontmatter(content: &str) -> (Option<&str>, &str) {
    let after_open = if let Some(rest) = content.strip_prefix("---\r\n") {
        rest
    } else if let Some(rest) = content.strip_prefix("---\n") {
        rest
    } else {
        return (None, content);
    };

    let bytes = after_open.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'\n' {
            let rest = &after_open[index + 1..];
            if let Some(body) = rest.strip_prefix("---\r\n") {
                return (Some(&after_open[..index]), body);
            }
            if let Some(body) = rest.strip_prefix("---\n") {
                return (Some(&after_open[..index]), body);
            }
            if rest == "---" || rest == "---\r" {
                return (Some(&after_open[..index]), "");
            }
        }
        index += 1;
    }

    (None, content)
}

fn parse_frontmatter(content: &str) -> KnowledgeFrontmatter {
    let (yaml, _) = split_frontmatter(content);
    yaml.and_then(|frontmatter| serde_yaml::from_str(frontmatter).ok())
        .unwrap_or_default()
}

fn node_id_for_asset(relative_path: &str) -> String {
    format!("asset:{relative_path}")
}

fn node_id_for_problem(problem_id: &str) -> String {
    format!("problem:{problem_id}")
}

fn node_id_for_topic(topic: &str) -> String {
    format!("topic:{topic}")
}

fn add_node(state: &mut GraphBuildState, node: KnowledgeGraphNode) {
    state.nodes.entry(node.id.clone()).or_insert(node);
}

fn add_edge(state: &mut GraphBuildState, edge: KnowledgeGraphEdge) {
    let key = (
        edge.from.clone(),
        edge.to.clone(),
        edge.edge_type.clone(),
        edge.source.clone(),
    );
    if state.edge_keys.insert(key) {
        state.edges.push(edge);
    }
}

fn graph_edge(
    from: &str,
    to: &str,
    edge_type: &str,
    source: &str,
    confidence: f64,
    relative_path: &str,
) -> KnowledgeGraphEdge {
    KnowledgeGraphEdge {
        from: from.to_string(),
        to: to.to_string(),
        edge_type: edge_type.to_string(),
        source: source.to_string(),
        confidence,
        refs: vec![relative_path.to_string()],
    }
}

fn add_asset_node(state: &mut GraphBuildState, relative_path: &str, frontmatter: &KnowledgeFrontmatter) -> String {
    let asset_id = node_id_for_asset(relative_path);
    let asset_type = if frontmatter.r#type.trim().is_empty() {
        "legacy-note".to_string()
    } else {
        frontmatter.r#type.trim().to_string()
    };
    add_node(
        state,
        KnowledgeGraphNode {
            id: asset_id.clone(),
            node_type: "asset".to_string(),
            title: if frontmatter.title.trim().is_empty() {
                relative_path.to_string()
            } else {
                frontmatter.title.trim().to_string()
            },
            refs: vec![relative_path.to_string()],
            asset_type: Some(asset_type),
            kind: if frontmatter.kind.trim().is_empty() {
                None
            } else {
                Some(frontmatter.kind.trim().to_string())
            },
            source: if frontmatter.source.trim().is_empty() {
                None
            } else {
                Some(frontmatter.source.trim().to_string())
            },
        },
    );
    asset_id
}

fn add_problem_refs(state: &mut GraphBuildState, asset_id: &str, relative_path: &str, ids: &[String], source: &str) {
    for problem_id in ids {
        let problem_id = problem_id.trim();
        if problem_id.is_empty() {
            continue;
        }
        let node_id = node_id_for_problem(problem_id);
        add_node(
            state,
            KnowledgeGraphNode {
                id: node_id.clone(),
                node_type: "problem".to_string(),
                title: problem_id.to_string(),
                refs: vec![relative_path.to_string()],
                asset_type: None,
                kind: None,
                source: None,
            },
        );
        add_edge(
            state,
            graph_edge(asset_id, &node_id, "mentions", source, 1.0, relative_path),
        );
    }
}

fn add_topic_refs(state: &mut GraphBuildState, asset_id: &str, relative_path: &str, topics: &[String]) {
    for topic in topics {
        let topic = topic.trim();
        if topic.is_empty() {
            continue;
        }
        let node_id = node_id_for_topic(topic);
        add_node(
            state,
            KnowledgeGraphNode {
                id: node_id.clone(),
                node_type: "topic".to_string(),
                title: topic.to_string(),
                refs: vec![relative_path.to_string()],
                asset_type: None,
                kind: None,
                source: None,
            },
        );
        add_edge(
            state,
            graph_edge(asset_id, &node_id, "related_to", "frontmatter", 1.0, relative_path),
        );
    }
}

pub fn extract_problem_ids(markdown: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let mut current = String::new();

    for ch in markdown.chars() {
        if ch.is_ascii_alphanumeric() {
            current.push(ch);
            continue;
        }
        if let Some(problem) = normalize_problem_token(&current) {
            if !ids.contains(&problem) {
                ids.push(problem);
            }
        }
        current.clear();
    }

    if let Some(problem) = normalize_problem_token(&current) {
        if !ids.contains(&problem) {
            ids.push(problem);
        }
    }

    ids
}

fn normalize_problem_token(token: &str) -> Option<String> {
    let token = token.trim();
    if token.len() < 2 || !token.starts_with('P') {
        return None;
    }
    let digits = &token[1..];
    if digits.chars().all(|ch| ch.is_ascii_digit()) {
        Some(token.to_string())
    } else {
        None
    }
}

pub fn extract_wikilinks(markdown: &str) -> Vec<String> {
    let mut links = Vec::new();
    let bytes = markdown.as_bytes();
    let mut index = 0;
    while index + 3 < bytes.len() {
        if &bytes[index..index + 2] == b"[[" {
            if let Some(end) = markdown[index + 2..].find("]]") {
                let target = markdown[index + 2..index + 2 + end]
                    .split('|')
                    .next()
                    .unwrap_or("")
                    .trim();
                if !target.is_empty() && !links.iter().any(|existing| existing == target) {
                    links.push(target.to_string());
                }
                index += end + 4;
                continue;
            }
        }
        index += 1;
    }
    links
}

fn build_graph_for_markdown(relative_path: &str, markdown: &str, state: &mut GraphBuildState) {
    let frontmatter = parse_frontmatter(markdown);
    let asset_id = add_asset_node(state, relative_path, &frontmatter);

    let type_id = format!(
        "type:{}",
        if frontmatter.r#type.trim().is_empty() {
            "legacy-note"
        } else {
            frontmatter.r#type.trim()
        }
    );
    add_node(
        state,
        KnowledgeGraphNode {
            id: type_id.clone(),
            node_type: "type".to_string(),
            title: type_id.trim_start_matches("type:").to_string(),
            refs: vec![relative_path.to_string()],
            asset_type: None,
            kind: None,
            source: None,
        },
    );
    add_edge(
        state,
        graph_edge(&asset_id, &type_id, "related_to", "frontmatter", 1.0, relative_path),
    );

    if !frontmatter.kind.trim().is_empty() {
        let kind_id = format!("kind:{}", frontmatter.kind.trim());
        add_node(
            state,
            KnowledgeGraphNode {
                id: kind_id.clone(),
                node_type: "kind".to_string(),
                title: frontmatter.kind.trim().to_string(),
                refs: vec![relative_path.to_string()],
                asset_type: None,
                kind: None,
                source: None,
            },
        );
        add_edge(
            state,
            graph_edge(&asset_id, &kind_id, "related_to", "frontmatter", 1.0, relative_path),
        );
    }

    let mut frontmatter_problem_ids = Vec::new();
    if !frontmatter.problem_id.trim().is_empty() {
        frontmatter_problem_ids.push(frontmatter.problem_id.clone());
    }
    frontmatter_problem_ids.extend(frontmatter.related_problems.clone());
    frontmatter_problem_ids.extend(frontmatter.problems.clone());
    frontmatter_problem_ids.sort();
    frontmatter_problem_ids.dedup();
    add_problem_refs(
        state,
        &asset_id,
        relative_path,
        &frontmatter_problem_ids,
        "frontmatter",
    );

    let mut body_problem_ids = extract_problem_ids(markdown);
    body_problem_ids.retain(|problem_id| !frontmatter_problem_ids.contains(problem_id));
    add_problem_refs(
        state,
        &asset_id,
        relative_path,
        &body_problem_ids,
        "problem_id_match",
    );

    add_topic_refs(state, &asset_id, relative_path, &frontmatter.topics);

    if !frontmatter.collection_id.trim().is_empty() {
        let collection_id = format!("collection:{}", frontmatter.collection_id.trim());
        add_node(
            state,
            KnowledgeGraphNode {
                id: collection_id.clone(),
                node_type: "collection".to_string(),
                title: frontmatter.collection_id.trim().to_string(),
                refs: vec![relative_path.to_string()],
                asset_type: None,
                kind: None,
                source: None,
            },
        );
        add_edge(
            state,
            graph_edge(&asset_id, &collection_id, "derived_from", "frontmatter", 1.0, relative_path),
        );
    }

    for fragment in &frontmatter.fragments {
        let target = format!("asset:{}", fragment.trim());
        add_edge(
            state,
            graph_edge(&asset_id, &target, "contains", "frontmatter", 1.0, relative_path),
        );
    }

    for article in &frontmatter.articles {
        let target = format!("asset:{}", article.trim());
        add_edge(
            state,
            graph_edge(&asset_id, &target, "contains", "frontmatter", 1.0, relative_path),
        );
    }

    for link in extract_wikilinks(markdown) {
        let target = format!("asset:{link}");
        add_edge(
            state,
            graph_edge(&asset_id, &target, "links_to", "wikilink", 0.8, relative_path),
        );
    }
}

fn collect_graph(notes_root: &Path) -> Result<KnowledgeGraphIndex, String> {
    fs::create_dir_all(notes_root)
        .map_err(|e| format!("Failed to create notes directory: {e}"))?;
    let canonical_notes_root = notes_root
        .canonicalize()
        .map_err(|e| format!("Failed to resolve notes root: {e}"))?;
    let mut state = GraphBuildState::default();

    for entry in WalkDir::new(&canonical_notes_root)
        .into_iter()
        .filter_entry(|entry| !should_skip_dir(entry.path()))
    {
        let entry = entry.map_err(|e| format!("Failed to scan notes directory: {e}"))?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }

        let relative_path = normalize_relative_path(path, &canonical_notes_root)?;
        let markdown = fs::read_to_string(path)
            .map_err(|e| format!("Failed to read markdown file {}: {e}", path.display()))?;
        build_graph_for_markdown(&relative_path, &markdown, &mut state);
    }

    Ok(KnowledgeGraphIndex {
        generated_at: Utc::now().to_rfc3339(),
        nodes: state.nodes.into_values().collect(),
        edges: state.edges,
    })
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create graph cache directory {}: {e}", parent.display()))?;
    }
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| format!("Failed to encode graph cache: {e}"))?;
    fs::write(path, bytes).map_err(|e| format!("Failed to write graph cache {}: {e}", path.display()))
}

fn write_graph_cache(index: &KnowledgeGraphIndex) -> Result<(), String> {
    write_json_file(&graph_nodes_path()?, &index.nodes)?;
    write_json_file(&graph_edges_path()?, &index.edges)?;
    write_json_file(&graph_batches_path()?, &Vec::<String>::new())?;
    write_json_file(&graph_summary_path()?, index)?;
    Ok(())
}

fn read_graph_cache() -> Result<Option<KnowledgeGraphIndex>, String> {
    let path = graph_summary_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(&path).map_err(|e| format!("Failed to read graph cache: {e}"))?;
    serde_json::from_slice::<KnowledgeGraphIndex>(&bytes)
        .map(Some)
        .map_err(|e| format!("Failed to decode graph cache: {e}"))
}

#[tauri::command]
pub fn get_knowledge_graph() -> Result<KnowledgeGraphIndex, String> {
    Ok(read_graph_cache()?.unwrap_or_default())
}

#[tauri::command]
pub fn rebuild_knowledge_graph() -> Result<KnowledgeGraphIndex, String> {
    let index = collect_graph(&paths::notes_dir()?)?;
    write_graph_cache(&index)?;
    Ok(index)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn extract_problem_ids_deduplicates_problem_mentions() {
        let ids = extract_problem_ids("P3803 and P3803, plus P3383.");
        assert_eq!(ids, vec!["P3803", "P3383"]);
    }

    #[test]
    fn extract_wikilinks_deduplicates_targets_and_strips_aliases() {
        let links = extract_wikilinks("[[FFT]] [[FFT|fast transform]] [[P3803]]");
        assert_eq!(links, vec!["FFT", "P3803"]);
    }

    #[test]
    fn graph_scans_fragment_frontmatter_problem_topic_and_wikilink() {
        let mut state = GraphBuildState::default();
        build_graph_for_markdown(
            "knowledge/fragments/p3803.md",
            concat!(
                "---\n",
                "type: fragment\n",
                "kind: problem-note\n",
                "title: P3803 FFT\n",
                "topics: [FFT]\n",
                "related_problems: [P3803]\n",
                "source: luogu\n",
                "created_from: training-center\n",
                "problem_id: P3803\n",
                "collection_id: knowledge/collections/batch.md\n",
                "---\n",
                "See [[knowledge/collections/batch.md]] and P3803.\n",
            ),
            &mut state,
        );

        assert!(state.nodes.contains_key("asset:knowledge/fragments/p3803.md"));
        assert!(state.nodes.contains_key("problem:P3803"));
        assert!(state.nodes.contains_key("topic:FFT"));
        assert!(state.nodes.contains_key("type:fragment"));
        assert!(state.nodes.contains_key("kind:problem-note"));
        assert!(state.edges.iter().any(|edge| edge.edge_type == "links_to"));
    }

    #[test]
    fn collect_graph_skips_oinb_directory() {
        let dir = tempdir().unwrap();
        let notes = dir.path().join("notes");
        fs::create_dir_all(notes.join(".oinb")).unwrap();
        fs::write(notes.join(".oinb/cache.md"), "P9999").unwrap();
        fs::create_dir_all(notes.join("knowledge/fragments")).unwrap();
        fs::write(notes.join("knowledge/fragments/p3803.md"), "P3803").unwrap();

        let index = collect_graph(&notes).unwrap();
        assert!(index.nodes.iter().any(|node| node.id == "problem:P3803"));
        assert!(!index.nodes.iter().any(|node| node.id == "problem:P9999"));
    }
}
