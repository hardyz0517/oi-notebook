use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use crate::{path_safety, paths};

const GRAPH_DIR: &str = ".oinb/graph";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphNode {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphEdge {
    pub from: String,
    pub to: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub source: String,
    pub confidence: f64,
    pub refs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphFrontmatterFields {
    pub title: Option<String>,
    pub asset_type: Option<String>,
    pub kind: Option<String>,
    pub topics: Vec<String>,
    pub related_problems: Vec<String>,
    pub problem_id: Option<String>,
    pub collection_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphCache {
    pub nodes: Vec<KnowledgeGraphNode>,
    pub edges: Vec<KnowledgeGraphEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraphResult {
    pub graph: KnowledgeGraphCache,
    pub rebuilt: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
struct KnowledgeGraphCacheFile {
    nodes: Vec<KnowledgeGraphNode>,
    edges: Vec<KnowledgeGraphEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
struct KnowledgeGraphFileEntry {
    relative_path: String,
    title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
struct KnowledgeGraphFrontmatterFile {
    #[serde(rename = "type")]
    asset_type: Option<String>,
    kind: Option<String>,
    title: Option<String>,
    topics: Option<Vec<String>>,
    related_problems: Option<Vec<String>>,
    problem_id: Option<String>,
    collection_id: Option<String>,
}

fn normalize_relative_path(relative_path: &str) -> Result<String, String> {
    path_safety::normalize_relative_path(relative_path)
        .map_err(|issue| match issue {
            path_safety::RelativePathIssue::Empty => "路径不能为空".to_string(),
            path_safety::RelativePathIssue::Absolute => "路径不能是绝对路径".to_string(),
            path_safety::RelativePathIssue::Traversal => "路径不能包含 . 或 .. 段".to_string(),
        })
}

fn notes_root_dir() -> Result<PathBuf, String> {
    paths::notes_dir()
}

fn graph_dir(notes_root: &Path) -> PathBuf {
    notes_root.join(GRAPH_DIR)
}

fn graph_nodes_path(notes_root: &Path) -> PathBuf {
    graph_dir(notes_root).join("nodes.json")
}

fn graph_edges_path(notes_root: &Path) -> PathBuf {
    graph_dir(notes_root).join("edges.json")
}

fn graph_batches_path(notes_root: &Path) -> PathBuf {
    graph_dir(notes_root).join("batches.json")
}

fn should_skip_dir(entry: &walkdir::DirEntry) -> bool {
    if !entry.file_type().is_dir() {
        return false;
    }

    let name = entry.file_name().to_string_lossy();
    name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" || name == "build"
}

fn normalize_list(values: Option<Vec<String>>) -> Vec<String> {
    let mut seen = BTreeSet::new();
    let mut result = Vec::new();
    for value in values.unwrap_or_default() {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.to_string()) {
            result.push(trimmed.to_string());
        }
    }
    result
}

fn parse_frontmatter_block(markdown: &str) -> Option<(KnowledgeGraphFrontmatterFields, &str)> {
    let after_open = if let Some(rest) = markdown.strip_prefix("---\r\n") {
        rest
    } else if let Some(rest) = markdown.strip_prefix("---\n") {
        rest
    } else {
        return None;
    };

    let bytes = after_open.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'\n' {
            let rest = &after_open[index + 1..];
            if let Some(body) = rest.strip_prefix("---\r\n") {
                let yaml = &after_open[..index];
                let parsed = serde_yaml::from_str::<KnowledgeGraphFrontmatterFile>(yaml).ok()?;
                return Some((into_frontmatter_fields(parsed), body));
            }
            if let Some(body) = rest.strip_prefix("---\n") {
                let yaml = &after_open[..index];
                let parsed = serde_yaml::from_str::<KnowledgeGraphFrontmatterFile>(yaml).ok()?;
                return Some((into_frontmatter_fields(parsed), body));
            }
            if rest == "---" || rest == "---\r" {
                let yaml = &after_open[..index];
                let parsed = serde_yaml::from_str::<KnowledgeGraphFrontmatterFile>(yaml).ok()?;
                return Some((into_frontmatter_fields(parsed), ""));
            }
        }
        index += 1;
    }

    None
}

fn into_frontmatter_fields(file: KnowledgeGraphFrontmatterFile) -> KnowledgeGraphFrontmatterFields {
    KnowledgeGraphFrontmatterFields {
        title: file.title.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()),
        asset_type: file.asset_type.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()),
        kind: file.kind.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()),
        topics: normalize_list(file.topics),
        related_problems: normalize_list(file.related_problems),
        problem_id: file.problem_id.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()),
        collection_id: file.collection_id.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()),
    }
}

pub fn extract_problem_ids(markdown: &str) -> Vec<String> {
    let mut ids = BTreeSet::new();
    let bytes = markdown.as_bytes();
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'P' {
            let mut cursor = index + 1;
            while cursor < bytes.len() && bytes[cursor].is_ascii_digit() {
                cursor += 1;
            }
            if cursor > index + 1 {
                let candidate = &markdown[index..cursor];
                ids.insert(candidate.to_string());
            }
        }
        index += 1;
    }

    ids.into_iter().collect()
}

pub fn extract_wikilinks(markdown: &str) -> Vec<String> {
    let mut links = BTreeSet::new();
    let bytes = markdown.as_bytes();
    let mut index = 0;
    while index + 3 < bytes.len() {
        if &bytes[index..index + 2] == b"[[" {
            if let Some(close) = markdown[index + 2..].find("]]") {
                let target = markdown[index + 2..index + 2 + close]
                    .split('|')
                    .next()
                    .unwrap_or("")
                    .trim();
                if !target.is_empty() {
                    links.insert(target.to_string());
                }
                index += close + 4;
                continue;
            }
        }
        index += 1;
    }

    links.into_iter().collect()
}

pub fn extract_graph_frontmatter(markdown: &str) -> Option<KnowledgeGraphFrontmatterFields> {
    parse_frontmatter_block(markdown).map(|(fields, _)| fields)
}

fn problem_node(problem_id: &str, relative_path: &str) -> KnowledgeGraphNode {
    KnowledgeGraphNode {
        id: format!("problem:{problem_id}"),
        kind: "problem".to_string(),
        title: problem_id.to_string(),
        refs: vec![relative_path.to_string()],
    }
}

fn topic_node(topic: &str, relative_path: &str) -> KnowledgeGraphNode {
    KnowledgeGraphNode {
        id: format!("topic:{topic}"),
        kind: "topic".to_string(),
        title: topic.to_string(),
        refs: vec![relative_path.to_string()],
    }
}

fn asset_node(relative_path: &str, title: &str) -> KnowledgeGraphNode {
    KnowledgeGraphNode {
        id: format!("asset:{relative_path}"),
        kind: "asset".to_string(),
        title: if title.trim().is_empty() {
            relative_path.to_string()
        } else {
            title.trim().to_string()
        },
        refs: vec![relative_path.to_string()],
    }
}

fn edge(
    from: String,
    to: String,
    kind: &str,
    source: &str,
    confidence: f64,
    relative_path: &str,
) -> KnowledgeGraphEdge {
    KnowledgeGraphEdge {
        from,
        to,
        kind: kind.to_string(),
        source: source.to_string(),
        confidence,
        refs: vec![relative_path.to_string()],
    }
}

fn build_graph_for_markdown(relative_path: &str, markdown: &str) -> (Vec<KnowledgeGraphNode>, Vec<KnowledgeGraphEdge>) {
    let frontmatter = extract_graph_frontmatter(markdown).unwrap_or_default();
    let title = frontmatter
        .title
        .clone()
        .or_else(|| frontmatter.collection_id.clone())
        .or_else(|| frontmatter.problem_id.clone())
        .or_else(|| frontmatter.kind.clone())
        .or_else(|| frontmatter.asset_type.clone())
        .unwrap_or_else(|| relative_path.to_string());
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let asset_id = format!("asset:{relative_path}");

    nodes.push(asset_node(relative_path, &title));

    if let Some(asset_type) = frontmatter.asset_type.clone() {
        let node_id = format!("type:{asset_type}");
        nodes.push(KnowledgeGraphNode {
            id: node_id.clone(),
            kind: "type".to_string(),
            title: asset_type,
            refs: vec![relative_path.to_string()],
        });
        edges.push(edge(
            asset_id.clone(),
            node_id,
            "related_to",
            "frontmatter",
            1.0,
            relative_path,
        ));
    }

    if let Some(kind) = frontmatter.kind.clone() {
        let node_id = format!("kind:{kind}");
        nodes.push(KnowledgeGraphNode {
            id: node_id.clone(),
            kind: "kind".to_string(),
            title: kind,
            refs: vec![relative_path.to_string()],
        });
        edges.push(edge(
            asset_id.clone(),
            node_id,
            "related_to",
            "frontmatter",
            1.0,
            relative_path,
        ));
    }

    let mut problem_ids = BTreeSet::new();
    for problem_id in frontmatter.related_problems.clone() {
        problem_ids.insert(problem_id);
    }
    if let Some(problem_id) = frontmatter.problem_id.clone() {
        problem_ids.insert(problem_id);
    }

    for problem_id in problem_ids.clone() {
        let node = problem_node(&problem_id, relative_path);
        let node_id = node.id.clone();
        nodes.push(node);
        edges.push(edge(
            asset_id.clone(),
            node_id.clone(),
            "mentions",
            "frontmatter",
            1.0,
            relative_path,
        ));
    }

    for problem_id in extract_problem_ids(markdown) {
        if problem_ids.contains(&problem_id) {
            continue;
        }
        let node = problem_node(&problem_id, relative_path);
        let node_id = node.id.clone();
        nodes.push(node);
        edges.push(edge(
            asset_id.clone(),
            node_id.clone(),
            "mentions",
            "problem_id_match",
            1.0,
            relative_path,
        ));
    }

    let mut topics = BTreeSet::new();
    for topic in frontmatter.topics.clone() {
        topics.insert(topic);
    }

    for topic in frontmatter.topics {
        let node = topic_node(&topic, relative_path);
        let node_id = node.id.clone();
        nodes.push(node);
        edges.push(edge(
            asset_id.clone(),
            node_id,
            "related_to",
            "frontmatter",
            1.0,
            relative_path,
        ));
    }

    for topic in extract_wikilinks(markdown) {
        if topics.contains(&topic) {
            continue;
        }
        let node = topic_node(&topic, relative_path);
        let node_id = node.id.clone();
        nodes.push(node);
        edges.push(edge(
            asset_id.clone(),
            node_id,
            "related_to",
            "wikilink",
            0.9,
            relative_path,
        ));
    }

    if let Some(collection_id) = frontmatter.collection_id {
        let collection_node = KnowledgeGraphNode {
            id: format!("collection:{collection_id}"),
            kind: "collection".to_string(),
            title: collection_id.clone(),
            refs: vec![relative_path.to_string()],
        };
        edges.push(edge(
            asset_id.clone(),
            collection_node.id.clone(),
            "related_to",
            "frontmatter",
            1.0,
            relative_path,
        ));
        nodes.push(collection_node);
    }

    (nodes, edges)
}

fn scan_markdown_files(notes_root: &Path) -> Result<Vec<(String, String)>, String> {
    let mut files = Vec::new();
    for entry in WalkDir::new(notes_root).into_iter().filter_entry(|entry| !should_skip_dir(entry)) {
        let entry = entry.map_err(|e| format!("扫描知识库失败：{e}"))?;
        if !entry.file_type().is_file() {
            continue;
        }
        if entry.path().extension().and_then(|value| value.to_str()) != Some("md") {
            continue;
        }
        let relative = entry
            .path()
            .strip_prefix(notes_root)
            .map_err(|e| format!("计算相对路径失败：{e}"))?
            .to_string_lossy()
            .replace('\\', "/");
        let markdown = fs::read_to_string(entry.path())
            .map_err(|e| format!("读取 Markdown 失败：{}: {e}", entry.path().display()))?;
        files.push((relative, markdown));
    }
    Ok(files)
}

fn read_cache<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let text = fs::read_to_string(path).map_err(|e| format!("读取缓存失败：{}: {e}", path.display()))?;
    serde_json::from_str(&text)
        .map(Some)
        .map_err(|e| format!("解析缓存失败：{}: {e}", path.display()))
}

fn write_cache<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建图谱缓存目录失败：{}: {e}", parent.display()))?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|e| format!("序列化缓存失败：{e}"))?;
    fs::write(path, text).map_err(|e| format!("写入缓存失败：{}: {e}", path.display()))
}

fn rebuild_graph(notes_root: &Path) -> Result<KnowledgeGraphResult, String> {
    fs::create_dir_all(notes_root)
        .map_err(|e| format!("创建知识库根目录失败：{}: {e}", notes_root.display()))?;
    let mut node_map: BTreeMap<String, KnowledgeGraphNode> = BTreeMap::new();
    let mut edge_map: BTreeSet<(String, String, String, String)> = BTreeSet::new();
    let mut edges = Vec::new();

    for (relative_path, markdown) in scan_markdown_files(notes_root)? {
        let (file_nodes, file_edges) = build_graph_for_markdown(&relative_path, &markdown);
        for node in file_nodes {
            node_map.entry(node.id.clone()).or_insert(node);
        }
        for edge in file_edges {
            let dedupe_key = (
                edge.from.clone(),
                edge.to.clone(),
                edge.kind.clone(),
                edge.source.clone(),
            );
            if edge_map.insert(dedupe_key) {
                edges.push(edge);
            }
        }
    }

    let graph = KnowledgeGraphCache {
        nodes: node_map.into_values().collect(),
        edges,
    };

    write_cache(&graph_nodes_path(notes_root), &graph.nodes)?;
    write_cache(&graph_edges_path(notes_root), &graph.edges)?;
    write_cache(
        &graph_batches_path(notes_root),
        &Vec::<KnowledgeGraphFileEntry>::new(),
    )?;

    Ok(KnowledgeGraphResult { graph, rebuilt: true })
}

fn load_graph(notes_root: &Path) -> Result<KnowledgeGraphResult, String> {
    let nodes = read_cache::<Vec<KnowledgeGraphNode>>(&graph_nodes_path(notes_root))?.unwrap_or_default();
    let edges = read_cache::<Vec<KnowledgeGraphEdge>>(&graph_edges_path(notes_root))?.unwrap_or_default();
    Ok(KnowledgeGraphResult {
        graph: KnowledgeGraphCache { nodes, edges },
        rebuilt: false,
    })
}

pub fn rebuild_knowledge_graph_in(notes_root: &Path) -> Result<KnowledgeGraphResult, String> {
    rebuild_graph(notes_root)
}

pub fn get_knowledge_graph_in(notes_root: &Path) -> Result<KnowledgeGraphResult, String> {
    load_graph(notes_root)
}

#[tauri::command]
pub fn rebuild_knowledge_graph() -> Result<KnowledgeGraphResult, String> {
    let notes_root = notes_root_dir()?;
    rebuild_graph(&notes_root)
}

#[tauri::command]
pub fn get_knowledge_graph() -> Result<KnowledgeGraphResult, String> {
    let notes_root = notes_root_dir()?;
    load_graph(&notes_root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn problem_id_scan_deduplicates_and_handles_prefixes() {
        let markdown = "P3803 P3803 [[FFT]] P1001A P1001";
        let ids = extract_problem_ids(markdown);
        assert_eq!(ids, vec!["P1001".to_string(), "P3803".to_string()]);
    }

    #[test]
    fn wikilink_scan_keeps_unique_targets() {
        let markdown = "[[FFT]] [[FFT]] [[P3803]]";
        let links = extract_wikilinks(markdown);
        assert_eq!(links, vec!["FFT".to_string(), "P3803".to_string()]);
    }

    #[test]
    fn frontmatter_scanner_extracts_core_knowledge_fields() {
        let markdown = concat!(
            "---\n",
            "type: fragment\n",
            "kind: problem-note\n",
            "topics:\n",
            "  - FFT\n",
            "related_problems:\n",
            "  - P3803\n",
            "problem_id: P3803\n",
            "collection_id: collection/2026-06-28\n",
            "---\n",
            "正文"
        );
        let fields = extract_graph_frontmatter(markdown).expect("frontmatter should parse");
        assert_eq!(fields.asset_type.as_deref(), Some("fragment"));
        assert_eq!(fields.kind.as_deref(), Some("problem-note"));
        assert_eq!(fields.topics, vec!["FFT".to_string()]);
        assert_eq!(fields.related_problems, vec!["P3803".to_string()]);
        assert_eq!(fields.problem_id.as_deref(), Some("P3803"));
        assert_eq!(fields.collection_id.as_deref(), Some("collection/2026-06-28"));
    }

    #[test]
    fn graph_builder_emits_type_and_kind_nodes_from_frontmatter() {
        let markdown = concat!(
            "---\n",
            "type: fragment\n",
            "kind: problem-note\n",
            "title: P3803 FFT 复习\n",
            "---\n",
            "正文"
        );
        let (nodes, edges) = build_graph_for_markdown("fragments/p3803.md", markdown);
        assert!(nodes.iter().any(|node| node.id == "type:fragment"));
        assert!(nodes.iter().any(|node| node.id == "kind:problem-note"));
        assert!(edges.iter().any(|edge| edge.source == "frontmatter"));
    }

    #[test]
    fn rebuild_graph_writes_cache_files() {
        let dir = tempdir().unwrap();
        let notes_root = dir.path().join("notes");
        fs::create_dir_all(notes_root.join("fragments")).unwrap();
        fs::write(
            notes_root.join("fragments").join("p3803.md"),
            concat!(
                "---\n",
                "type: fragment\n",
                "kind: problem-note\n",
                "title: P3803 FFT 复习\n",
                "topics:\n",
                "  - FFT\n",
                "related_problems:\n",
                "  - P3803\n",
                "problem_id: P3803\n",
                "collection_id: collection/2026-06-28\n",
                "---\n",
                "P3803 [[FFT]]"
            ),
        )
        .unwrap();

        let result = rebuild_graph(&notes_root).unwrap();
        assert!(result.graph.nodes.iter().any(|node| node.id == "problem:P3803"));
        assert!(result.graph.nodes.iter().any(|node| node.id == "topic:FFT"));
        assert!(result.graph.edges.iter().any(|edge| edge.source == "frontmatter"));
        assert!(result.graph.edges.iter().any(|edge| edge.source == "wikilink"));
        assert!(notes_root.join(".oinb/graph/nodes.json").exists());
        assert!(notes_root.join(".oinb/graph/edges.json").exists());
        assert!(notes_root.join(".oinb/graph/batches.json").exists());
    }

    #[test]
    fn get_graph_reads_cache_when_present() {
        let dir = tempdir().unwrap();
        let notes_root = dir.path().join("notes");
        fs::create_dir_all(notes_root.join(".oinb/graph")).unwrap();
        fs::write(
            notes_root.join(".oinb/graph/nodes.json"),
            serde_json::to_string_pretty(&Vec::<KnowledgeGraphNode>::new()).unwrap(),
        )
        .unwrap();
        fs::write(
            notes_root.join(".oinb/graph/edges.json"),
            serde_json::to_string_pretty(&Vec::<KnowledgeGraphEdge>::new()).unwrap(),
        )
        .unwrap();

        let result = load_graph(&notes_root).unwrap();
        assert!(result.graph.nodes.is_empty());
        assert!(result.graph.edges.is_empty());
    }

    #[test]
    fn scan_skips_oinb_directory() {
        let dir = tempdir().unwrap();
        let notes_root = dir.path().join("notes");
        fs::create_dir_all(notes_root.join(".oinb/graph")).unwrap();
        fs::write(notes_root.join(".oinb/graph").join("hidden.md"), "P9999 [[Hidden]]").unwrap();
        fs::create_dir_all(notes_root.join("visible")).unwrap();
        fs::write(notes_root.join("visible").join("visible.md"), "P3803").unwrap();

        let result = rebuild_graph(&notes_root).unwrap();
        assert!(result.graph.nodes.iter().any(|node| node.id == "problem:P3803"));
        assert!(!result.graph.nodes.iter().any(|node| node.id == "problem:P9999"));
    }
}
