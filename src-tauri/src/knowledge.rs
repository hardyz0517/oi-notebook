use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet, VecDeque},
    fs,
    path::{Path, PathBuf},
};
use walkdir::WalkDir;

use crate::{path_safety, paths};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub classification_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub classification_confidence: Option<f64>,
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
    pub assets: Vec<KnowledgeAssetRow>,
    pub suggestions: Vec<KnowledgeRelationshipSuggestion>,
    pub review_slices: Vec<KnowledgeReviewSlice>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeAssetRow {
    pub id: String,
    #[serde(rename = "type")]
    pub row_type: String,
    pub asset_type: String,
    pub kind: String,
    pub title: String,
    pub date: String,
    pub topics: Vec<String>,
    pub related_problems: Vec<String>,
    pub source: String,
    pub created_from: String,
    pub review_priority: String,
    pub status: String,
    pub path: String,
    pub refs: Vec<String>,
    pub last_modified: String,
    pub relation_count: usize,
    pub missing_metadata_flags: Vec<String>,
    pub classification_reason: String,
    pub classification_confidence: f64,
    pub in_degree: usize,
    pub out_degree: usize,
    pub degree: usize,
    pub isolated: bool,
    pub component_id: usize,
    pub last_reviewed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeRelationshipSuggestion {
    pub id: String,
    pub kind: String,
    pub source: String,
    pub target: String,
    pub reason: String,
    pub refs: Vec<String>,
    pub preview: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeReviewSlice {
    pub asset_id: String,
    pub title: String,
    pub path: String,
    pub review_priority: String,
    pub status: String,
    pub kind: String,
    pub topics: Vec<String>,
    pub related_problems: Vec<String>,
    pub last_reviewed_at: Option<String>,
    pub score: f64,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriteKnowledgeAssetRequest {
    pub relative_path: String,
    pub markdown: String,
    pub overwrite: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WriteKnowledgeAssetResult {
    pub relative_path: String,
    pub written: bool,
    pub skipped: bool,
    pub error: Option<String>,
}

#[derive(Debug, Default)]
struct GraphBuildState {
    nodes: BTreeMap<String, KnowledgeGraphNode>,
    edge_keys: BTreeSet<(String, String, String, String)>,
    edges: Vec<KnowledgeGraphEdge>,
    assets: BTreeMap<String, AssetBuildRecord>,
}

#[derive(Debug, Clone, Default)]
struct AssetClassification {
    asset_type: String,
    reason: String,
    confidence: f64,
}

#[derive(Debug, Clone, Default)]
struct AssetBuildRecord {
    relative_path: String,
    frontmatter: KnowledgeFrontmatter,
    markdown: String,
    last_modified: String,
    classification: AssetClassification,
    body_problem_ids: Vec<String>,
    term_matches: Vec<String>,
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
    created_from: String,
    #[serde(default)]
    date: String,
    #[serde(default, rename = "review_priority")]
    review_priority: String,
    #[serde(default)]
    status: String,
    #[serde(default, rename = "last_reviewed_at")]
    last_reviewed_at: Option<String>,
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

fn normalize_relative_asset_path(relative_path: &str) -> Result<String, String> {
    path_safety::normalize_relative_path(relative_path).map_err(|issue| match issue {
        path_safety::RelativePathIssue::Empty => "knowledge path cannot be empty".to_string(),
        path_safety::RelativePathIssue::Absolute => {
            format!("knowledge path cannot be absolute: {relative_path}")
        }
        path_safety::RelativePathIssue::Traversal => {
            format!("knowledge path contains traversal: {relative_path}")
        }
    })
}

fn safe_knowledge_path(notes_dir: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative_asset_path(relative_path)?;
    path_safety::resolve_relative_path_within_base(notes_dir, &normalized)
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
    state
        .nodes
        .entry(node.id.clone())
        .and_modify(|existing| {
            for reference in &node.refs {
                if !existing.refs.contains(reference) {
                    existing.refs.push(reference.clone());
                }
            }
        })
        .or_insert(node);
}

fn add_edge(state: &mut GraphBuildState, edge: KnowledgeGraphEdge) {
    let key = (
        edge.from.clone(),
        edge.to.clone(),
        edge.edge_type.clone(),
        edge.source.clone(),
    );
    if state.edge_keys.insert(key.clone()) {
        state.edges.push(edge);
    } else if let Some(existing) = state.edges.iter_mut().find(|existing| {
        existing.from == key.0
            && existing.to == key.1
            && existing.edge_type == key.2
            && existing.source == key.3
    }) {
        for reference in edge.refs {
            if !existing.refs.contains(&reference) {
                existing.refs.push(reference);
            }
        }
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

fn clean_list(values: &[String]) -> Vec<String> {
    let mut output = Vec::new();
    for value in values {
        let value = value.trim();
        if !value.is_empty() && !output.iter().any(|existing| existing == value) {
            output.push(value.to_string());
        }
    }
    output
}

fn normalize_field(value: &str, fallback: &str) -> String {
    let value = value.trim();
    if value.is_empty() {
        fallback.to_string()
    } else {
        value.to_string()
    }
}

fn classify_asset(relative_path: &str, markdown: &str, frontmatter: &KnowledgeFrontmatter) -> AssetClassification {
    let explicit_type = frontmatter.r#type.trim();
    if matches!(explicit_type, "fragment" | "collection" | "article") {
        return AssetClassification {
            asset_type: explicit_type.to_string(),
            reason: "explicit_type".to_string(),
            confidence: 1.0,
        };
    }

    let path_lower = relative_path.replace('\\', "/").to_lowercase();
    let markdown_lower = markdown.to_lowercase();
    let has_problem = !extract_problem_ids(markdown).is_empty()
        || !frontmatter.problem_id.trim().is_empty()
        || !frontmatter.related_problems.is_empty()
        || !frontmatter.problems.is_empty();
    let has_solution_shape = markdown.contains("题解")
        || markdown.contains("题目描述")
        || markdown.contains("思路")
        || markdown_lower.contains("solution");

    if path_lower.contains("luogu") && (has_problem || has_solution_shape) {
        return AssetClassification {
            asset_type: "legacy-luogu-solution".to_string(),
            reason: "legacy_luogu_import".to_string(),
            confidence: 0.95,
        };
    }

    if has_problem || has_solution_shape {
        return AssetClassification {
            asset_type: "legacy-problem-note".to_string(),
            reason: "problem_note_signal".to_string(),
            confidence: 0.75,
        };
    }

    AssetClassification {
        asset_type: "legacy-note".to_string(),
        reason: "fallback_legacy_note".to_string(),
        confidence: 0.55,
    }
}

fn term_dictionary() -> Vec<&'static str> {
    vec![
        "FFT",
        "KMP",
        "DP",
        "LCA",
        "Dijkstra",
        "AC 自动机",
        "FHQ Treap",
        "线段树",
        "树状数组",
        "快速幂",
    ]
}

fn extract_term_matches(markdown: &str, declared_topics: &[String]) -> Vec<String> {
    let declared: BTreeSet<String> = declared_topics
        .iter()
        .map(|topic| topic.trim().to_lowercase())
        .collect();
    let markdown_lower = markdown.to_lowercase();
    let mut terms = Vec::new();
    for term in term_dictionary() {
        if declared.contains(&term.to_lowercase()) {
            continue;
        }
        if markdown_lower.contains(&term.to_lowercase()) && !terms.iter().any(|existing| existing == term) {
            terms.push(term.to_string());
        }
    }
    terms
}

fn add_asset_node(
    state: &mut GraphBuildState,
    relative_path: &str,
    frontmatter: &KnowledgeFrontmatter,
    classification: &AssetClassification,
) -> String {
    let asset_id = node_id_for_asset(relative_path);
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
            asset_type: Some(classification.asset_type.clone()),
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
            classification_reason: Some(classification.reason.clone()),
            classification_confidence: Some(classification.confidence),
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
                classification_reason: None,
                classification_confidence: None,
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
                classification_reason: None,
                classification_confidence: None,
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

#[cfg(test)]
fn build_graph_for_markdown(relative_path: &str, markdown: &str, state: &mut GraphBuildState) {
    build_graph_for_markdown_with_modified(relative_path, markdown, "", state);
}

fn build_graph_for_markdown_with_modified(
    relative_path: &str,
    markdown: &str,
    last_modified: &str,
    state: &mut GraphBuildState,
) {
    let frontmatter = parse_frontmatter(markdown);
    let classification = classify_asset(relative_path, markdown, &frontmatter);
    let asset_id = add_asset_node(state, relative_path, &frontmatter, &classification);

    let type_id = format!(
        "type:{}",
        if matches!(frontmatter.r#type.trim(), "fragment" | "collection" | "article") {
            frontmatter.r#type.trim()
        } else {
            classification.asset_type.as_str()
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
            classification_reason: None,
            classification_confidence: None,
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
                classification_reason: None,
                classification_confidence: None,
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

    let term_matches = extract_term_matches(markdown, &frontmatter.topics);
    add_topic_refs(state, &asset_id, relative_path, &term_matches);
    for topic in &term_matches {
        add_edge(
            state,
            graph_edge(
                &asset_id,
                &node_id_for_topic(topic),
                "mentions",
                "term_match",
                0.45,
                relative_path,
            ),
        );
    }

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
                classification_reason: None,
                classification_confidence: None,
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

    state.assets.insert(
        asset_id,
        AssetBuildRecord {
            relative_path: relative_path.to_string(),
            frontmatter,
            markdown: markdown.to_string(),
            last_modified: last_modified.to_string(),
            classification,
            body_problem_ids,
            term_matches,
        },
    );
}

fn edge_source_rank(source: &str) -> usize {
    match source {
        "frontmatter" => 0,
        "wikilink" => 1,
        "import_rule" => 2,
        "manual" => 3,
        "problem_id_match" => 4,
        "term_match" => 5,
        _ => 6,
    }
}

fn compute_degrees(edges: &[KnowledgeGraphEdge]) -> BTreeMap<String, (usize, usize)> {
    let mut degrees: BTreeMap<String, (usize, usize)> = BTreeMap::new();
    for edge in edges {
        if edge.to.starts_with("type:") || edge.to.starts_with("kind:") {
            continue;
        }
        degrees.entry(edge.from.clone()).or_default().1 += 1;
        degrees.entry(edge.to.clone()).or_default().0 += 1;
    }
    degrees
}

fn compute_components(nodes: &[KnowledgeGraphNode], edges: &[KnowledgeGraphEdge]) -> BTreeMap<String, usize> {
    let mut adjacency: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for node in nodes {
        adjacency.entry(node.id.clone()).or_default();
    }
    for edge in edges {
        adjacency.entry(edge.from.clone()).or_default().push(edge.to.clone());
        adjacency.entry(edge.to.clone()).or_default().push(edge.from.clone());
    }

    let mut components = BTreeMap::new();
    let mut component_id = 0;
    for node in nodes {
        if components.contains_key(&node.id) {
            continue;
        }
        let mut queue = VecDeque::from([node.id.clone()]);
        components.insert(node.id.clone(), component_id);
        while let Some(current) = queue.pop_front() {
            if let Some(neighbors) = adjacency.get(&current) {
                for neighbor in neighbors {
                    if components.contains_key(neighbor) {
                        continue;
                    }
                    components.insert(neighbor.clone(), component_id);
                    queue.push_back(neighbor.clone());
                }
            }
        }
        component_id += 1;
    }
    components
}

fn missing_metadata_flags(record: &AssetBuildRecord) -> Vec<String> {
    let mut flags = Vec::new();
    if record.frontmatter.title.trim().is_empty() {
        flags.push("missing_title".to_string());
    }
    if record.frontmatter.topics.is_empty() {
        flags.push("missing_topics".to_string());
    }
    if record.frontmatter.related_problems.is_empty() && record.frontmatter.problem_id.trim().is_empty() {
        flags.push("missing_related_problems".to_string());
    }
    if record.frontmatter.review_priority.trim().is_empty() {
        flags.push("missing_review_priority".to_string());
    }
    flags
}

fn asset_title(record: &AssetBuildRecord) -> String {
    normalize_field(&record.frontmatter.title, &record.relative_path)
}

fn build_asset_rows(
    records: &BTreeMap<String, AssetBuildRecord>,
    degrees: &BTreeMap<String, (usize, usize)>,
    components: &BTreeMap<String, usize>,
) -> Vec<KnowledgeAssetRow> {
    records
        .iter()
        .map(|(asset_id, record)| {
            let (in_degree, out_degree) = degrees.get(asset_id).copied().unwrap_or_default();
            let degree = in_degree + out_degree;
            KnowledgeAssetRow {
                id: asset_id.clone(),
                row_type: "asset".to_string(),
                asset_type: record.classification.asset_type.clone(),
                kind: normalize_field(&record.frontmatter.kind, "legacy-note"),
                title: asset_title(record),
                date: record.frontmatter.date.trim().to_string(),
                topics: clean_list(&record.frontmatter.topics),
                related_problems: clean_list(&record.frontmatter.related_problems),
                source: normalize_field(&record.frontmatter.source, "unknown"),
                created_from: normalize_field(&record.frontmatter.created_from, "unknown"),
                review_priority: normalize_field(&record.frontmatter.review_priority, "medium"),
                status: normalize_field(&record.frontmatter.status, "active"),
                path: record.relative_path.clone(),
                refs: vec![record.relative_path.clone()],
                last_modified: record.last_modified.clone(),
                relation_count: degree,
                missing_metadata_flags: missing_metadata_flags(record),
                classification_reason: record.classification.reason.clone(),
                classification_confidence: record.classification.confidence,
                in_degree,
                out_degree,
                degree,
                isolated: degree == 0,
                component_id: *components.get(asset_id).unwrap_or(&0),
                last_reviewed_at: record.frontmatter.last_reviewed_at.clone(),
            }
        })
        .collect()
}

fn suggestion_score(source: &str, frequency: usize, missing_bonus: f64, ambiguity_penalty: f64) -> f64 {
    let source_weight = match source {
        "frontmatter" => 2.0,
        "wikilink" => 1.7,
        "import_rule" => 1.5,
        "manual" => 1.4,
        "problem_id_match" => 1.2,
        "term_match" => 0.8,
        _ => 0.5,
    };
    let frequency_weight = (frequency as f64).min(5.0) * 0.2;
    source_weight + frequency_weight + missing_bonus - ambiguity_penalty
}

fn count_occurrences(haystack: &str, needle: &str) -> usize {
    if needle.is_empty() {
        return 0;
    }
    haystack.matches(needle).count()
}

fn build_suggestions(
    records: &BTreeMap<String, AssetBuildRecord>,
    asset_rows: &[KnowledgeAssetRow],
) -> Vec<KnowledgeRelationshipSuggestion> {
    let mut suggestions = Vec::new();
    for row in asset_rows {
        let Some(record) = records.get(&row.id) else {
            continue;
        };
        let mut declared_problem_values = record.frontmatter.related_problems.clone();
        if !record.frontmatter.problem_id.trim().is_empty() {
            declared_problem_values.push(record.frontmatter.problem_id.trim().to_string());
        }
        let declared_problems: BTreeSet<String> = declared_problem_values
            .iter()
            .map(|problem| problem.trim().to_string())
            .filter(|problem| !problem.is_empty())
            .collect();
        for problem_id in &record.body_problem_ids {
            if declared_problems.contains(problem_id) {
                continue;
            }
            suggestions.push(KnowledgeRelationshipSuggestion {
                id: format!("missing-related-problem:{}:problem:{problem_id}", row.id),
                kind: "missing_related_problem".to_string(),
                source: row.id.clone(),
                target: node_id_for_problem(problem_id),
                reason: format!("正文提到 {problem_id}，但 related_problems 未声明。"),
                refs: vec![record.relative_path.clone()],
                preview: preview_around(&record.markdown, problem_id),
                score: suggestion_score(
                    "problem_id_match",
                    count_occurrences(&record.markdown, problem_id),
                    0.8,
                    0.0,
                ),
            });
        }

        for topic in &record.term_matches {
            suggestions.push(KnowledgeRelationshipSuggestion {
                id: format!("missing-topic:{}:{}", row.id, node_id_for_topic(topic)),
                kind: "missing_topic".to_string(),
                source: row.id.clone(),
                target: node_id_for_topic(topic),
                reason: format!("正文提到 topic {topic}，但 topics 未声明。"),
                refs: vec![record.relative_path.clone()],
                preview: preview_around(&record.markdown, topic),
                score: suggestion_score(
                    "term_match",
                    count_occurrences(&record.markdown.to_lowercase(), &topic.to_lowercase()),
                    0.7,
                    0.2,
                ),
            });
        }

        if row.isolated {
            suggestions.push(KnowledgeRelationshipSuggestion {
                id: format!("isolated-asset:{}", row.id),
                kind: "isolated_asset".to_string(),
                source: row.id.clone(),
                target: row.id.clone(),
                reason: "该资产当前没有图谱关系，建议补充 topic、related_problems 或 wikilink。".to_string(),
                refs: vec![record.relative_path.clone()],
                preview: asset_title(record),
                score: suggestion_score("manual", 1, 0.6, 0.0),
            });
        }

        if row.asset_type == "legacy-luogu-solution" {
            suggestions.push(KnowledgeRelationshipSuggestion {
                id: format!("upgrade-legacy-luogu:{}", row.id),
                kind: "upgrade_legacy_luogu_solution".to_string(),
                source: row.id.clone(),
                target: row.id.clone(),
                reason: "旧洛谷题解可升级为 fragment/collection/article 知识资产。".to_string(),
                refs: vec![record.relative_path.clone()],
                preview: asset_title(record),
                score: suggestion_score("import_rule", 1, 0.5, 0.0),
            });
        }
    }
    suggestions.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.id.cmp(&b.id)));
    suggestions
}

fn preview_around(markdown: &str, needle: &str) -> String {
    let lower_markdown = markdown.to_lowercase();
    let lower_needle = needle.to_lowercase();
    let Some(byte_index) = lower_markdown.find(&lower_needle) else {
        return markdown.chars().take(80).collect();
    };
    let char_index = markdown[..byte_index].chars().count();
    let needle_chars = needle.chars().count();
    let start = char_index.saturating_sub(30);
    markdown
        .chars()
        .skip(start)
        .take(needle_chars + 80)
        .collect::<String>()
        .replace('\n', " ")
        .trim()
        .to_string()
}

fn build_review_slices(asset_rows: &[KnowledgeAssetRow]) -> Vec<KnowledgeReviewSlice> {
    let mut slices: Vec<KnowledgeReviewSlice> = asset_rows
        .iter()
        .map(|row| {
            let mut reasons = Vec::new();
            let mut score = 0.0;
            if row.review_priority == "high" {
                reasons.push("high_priority".to_string());
                score += 2.0;
            }
            if matches!(row.kind.as_str(), "mistake" | "template" | "template-note") {
                reasons.push("mistake_or_template".to_string());
                score += 1.5;
            }
            if row.last_reviewed_at.is_none() {
                reasons.push("not_reviewed".to_string());
                score += 0.6;
            }
            if row.isolated || !row.missing_metadata_flags.is_empty() {
                reasons.push("weak_metadata".to_string());
                score += 0.8;
            }
            if row.topics.len() + row.related_problems.len() >= 2 {
                reasons.push("repeated_topic_or_problem".to_string());
                score += 0.4;
            }

            KnowledgeReviewSlice {
                asset_id: row.id.clone(),
                title: row.title.clone(),
                path: row.path.clone(),
                review_priority: row.review_priority.clone(),
                status: row.status.clone(),
                kind: row.kind.clone(),
                topics: row.topics.clone(),
                related_problems: row.related_problems.clone(),
                last_reviewed_at: row.last_reviewed_at.clone(),
                score,
                reasons,
            }
        })
        .collect();
    slices.sort_by(|a, b| b.score.total_cmp(&a.score).then_with(|| a.title.cmp(&b.title)));
    slices
}

fn finalize_graph_state(state: GraphBuildState) -> KnowledgeGraphIndex {
    let nodes: Vec<KnowledgeGraphNode> = state.nodes.into_values().collect();
    let degrees = compute_degrees(&state.edges);
    let components = compute_components(&nodes, &state.edges);
    let asset_rows = build_asset_rows(&state.assets, &degrees, &components);
    let suggestions = build_suggestions(&state.assets, &asset_rows);
    let review_slices = build_review_slices(&asset_rows);
    KnowledgeGraphIndex {
        generated_at: Utc::now().to_rfc3339(),
        nodes,
        edges: state.edges,
        assets: asset_rows,
        suggestions,
        review_slices,
    }
}

fn build_local_graph(index: &KnowledgeGraphIndex, node_id: &str, hops: usize, limit: usize) -> KnowledgeGraphIndex {
    let hard_limit = limit.clamp(1, 120);
    let max_hops = hops.clamp(1, 2);
    let nodes_by_id: BTreeMap<String, KnowledgeGraphNode> = index
        .nodes
        .iter()
        .map(|node| (node.id.clone(), node.clone()))
        .collect();
    if !nodes_by_id.contains_key(node_id) {
        return KnowledgeGraphIndex::default();
    }

    let mut adjacency: BTreeMap<String, Vec<&KnowledgeGraphEdge>> = BTreeMap::new();
    for edge in &index.edges {
        adjacency.entry(edge.from.clone()).or_default().push(edge);
        adjacency.entry(edge.to.clone()).or_default().push(edge);
    }
    for edges in adjacency.values_mut() {
        edges.sort_by(|a, b| {
            edge_source_rank(&a.source)
                .cmp(&edge_source_rank(&b.source))
                .then_with(|| a.to.cmp(&b.to))
        });
    }

    let mut selected = BTreeSet::from([node_id.to_string()]);
    let mut queue = VecDeque::from([(node_id.to_string(), 0usize)]);
    while let Some((current, depth)) = queue.pop_front() {
        if depth >= max_hops || selected.len() >= hard_limit {
            continue;
        }
        if let Some(edges) = adjacency.get(&current) {
            for edge in edges {
                let neighbor = if edge.from == current { &edge.to } else { &edge.from };
                if selected.contains(neighbor) || !nodes_by_id.contains_key(neighbor) {
                    continue;
                }
                selected.insert(neighbor.clone());
                queue.push_back((neighbor.clone(), depth + 1));
                if selected.len() >= hard_limit {
                    break;
                }
            }
        }
    }

    let mut nodes: Vec<KnowledgeGraphNode> = selected
        .iter()
        .filter_map(|id| nodes_by_id.get(id).cloned())
        .collect();
    nodes.sort_by(|a, b| a.id.cmp(&b.id));
    let edges: Vec<KnowledgeGraphEdge> = index
        .edges
        .iter()
        .filter(|edge| selected.contains(&edge.from) && selected.contains(&edge.to))
        .cloned()
        .collect();
    let assets = index
        .assets
        .iter()
        .filter(|asset| selected.contains(&asset.id))
        .cloned()
        .collect();

    KnowledgeGraphIndex {
        generated_at: index.generated_at.clone(),
        nodes,
        edges,
        assets,
        suggestions: Vec::new(),
        review_slices: Vec::new(),
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
        let last_modified = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .map(chrono::DateTime::<Utc>::from)
            .map(|modified| modified.to_rfc3339())
            .unwrap_or_default();
        build_graph_for_markdown_with_modified(&relative_path, &markdown, &last_modified, &mut state);
    }

    Ok(finalize_graph_state(state))
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

fn write_knowledge_asset_to_notes_dir(
    notes_dir: &Path,
    request: WriteKnowledgeAssetRequest,
) -> Result<WriteKnowledgeAssetResult, String> {
    fs::create_dir_all(notes_dir).map_err(|e| format!("create notes dir failed: {e}"))?;

    let relative_path = normalize_relative_asset_path(&request.relative_path)?;
    let path = safe_knowledge_path(notes_dir, &relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create knowledge parent failed: {e}"))?;
    }

    if path.exists() && !request.overwrite {
        return Ok(WriteKnowledgeAssetResult {
            relative_path,
            written: false,
            skipped: true,
            error: None,
        });
    }

    fs::write(&path, request.markdown.as_bytes())
        .map_err(|e| format!("write knowledge asset failed ({relative_path}): {e}"))?;

    Ok(WriteKnowledgeAssetResult {
        relative_path,
        written: true,
        skipped: false,
        error: None,
    })
}

#[tauri::command]
pub fn get_knowledge_graph() -> Result<KnowledgeGraphIndex, String> {
    Ok(read_graph_cache()?.unwrap_or_default())
}

#[tauri::command]
pub fn get_knowledge_assets() -> Result<Vec<KnowledgeAssetRow>, String> {
    Ok(get_knowledge_graph()?.assets)
}

#[tauri::command]
pub fn get_knowledge_local_graph(
    node_id: String,
    hops: Option<usize>,
    limit: Option<usize>,
) -> Result<KnowledgeGraphIndex, String> {
    let index = get_knowledge_graph()?;
    Ok(build_local_graph(
        &index,
        &node_id,
        hops.unwrap_or(1),
        limit.unwrap_or(80),
    ))
}

#[tauri::command]
pub fn get_knowledge_relationship_suggestions() -> Result<Vec<KnowledgeRelationshipSuggestion>, String> {
    Ok(get_knowledge_graph()?.suggestions)
}

#[tauri::command]
pub fn get_knowledge_review_slices() -> Result<Vec<KnowledgeReviewSlice>, String> {
    Ok(get_knowledge_graph()?.review_slices)
}

#[tauri::command]
pub fn rebuild_knowledge_graph() -> Result<KnowledgeGraphIndex, String> {
    let index = collect_graph(&paths::notes_dir()?)?;
    write_graph_cache(&index)?;
    Ok(index)
}

#[tauri::command]
pub fn write_knowledge_asset(request: WriteKnowledgeAssetRequest) -> Result<WriteKnowledgeAssetResult, String> {
    let notes_dir = paths::notes_dir()?;
    write_knowledge_asset_to_notes_dir(&notes_dir, request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn test_node(id: &str, node_type: &str) -> KnowledgeGraphNode {
        KnowledgeGraphNode {
            id: id.to_string(),
            node_type: node_type.to_string(),
            title: id.to_string(),
            refs: Vec::new(),
            asset_type: None,
            kind: None,
            source: None,
            classification_reason: None,
            classification_confidence: None,
        }
    }

    fn test_edge(from: &str, to: &str, edge_type: &str, source: &str) -> KnowledgeGraphEdge {
        KnowledgeGraphEdge {
            from: from.to_string(),
            to: to.to_string(),
            edge_type: edge_type.to_string(),
            source: source.to_string(),
            confidence: 1.0,
            refs: Vec::new(),
        }
    }

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
    fn legacy_classification_distinguishes_luogu_problem_and_plain_notes() {
        let mut state = GraphBuildState::default();
        build_graph_for_markdown(
            "luogu/P3803.md",
            "# P3803 多项式乘法\n\n## 题目描述\n\n洛谷 P3803 题解。",
            &mut state,
        );
        build_graph_for_markdown(
            "daily/random.md",
            "# 随手记\n\n今天复习了一点字符串。",
            &mut state,
        );

        let luogu = state.nodes.get("asset:luogu/P3803.md").unwrap();
        assert_eq!(luogu.asset_type.as_deref(), Some("legacy-luogu-solution"));
        assert_eq!(luogu.classification_reason.as_deref(), Some("legacy_luogu_import"));
        assert!(luogu.classification_confidence.unwrap() >= 0.9);

        let plain = state.nodes.get("asset:daily/random.md").unwrap();
        assert_eq!(plain.asset_type.as_deref(), Some("legacy-note"));
        assert_eq!(plain.classification_reason.as_deref(), Some("fallback_legacy_note"));
    }

    #[test]
    fn edge_dedupe_merges_refs_for_same_relationship() {
        let mut state = GraphBuildState::default();
        add_edge(
            &mut state,
            graph_edge("asset:a.md", "problem:P1000", "mentions", "problem_id_match", 1.0, "a.md"),
        );
        add_edge(
            &mut state,
            graph_edge("asset:a.md", "problem:P1000", "mentions", "problem_id_match", 1.0, "b.md"),
        );

        assert_eq!(state.edges.len(), 1);
        assert_eq!(state.edges[0].refs, vec!["a.md", "b.md"]);
    }

    #[test]
    fn local_graph_uses_k_hop_bfs_and_node_limit() {
        let index = KnowledgeGraphIndex {
            generated_at: "2026-06-30T00:00:00Z".to_string(),
            nodes: vec![
                test_node("asset:a.md", "asset"),
                test_node("topic:FFT", "topic"),
                test_node("problem:P3803", "problem"),
                test_node("asset:b.md", "asset"),
            ],
            edges: vec![
                test_edge("asset:a.md", "topic:FFT", "related_to", "frontmatter"),
                test_edge("topic:FFT", "asset:b.md", "mentions", "term_match"),
                test_edge("asset:a.md", "problem:P3803", "mentions", "problem_id_match"),
            ],
            assets: Vec::new(),
            suggestions: Vec::new(),
            review_slices: Vec::new(),
        };

        let one_hop = build_local_graph(&index, "asset:a.md", 1, 80);
        assert!(one_hop.nodes.iter().any(|node| node.id == "topic:FFT"));
        assert!(!one_hop.nodes.iter().any(|node| node.id == "asset:b.md"));

        let two_hop = build_local_graph(&index, "asset:a.md", 2, 2);
        assert_eq!(two_hop.nodes.len(), 2);
        assert!(two_hop.nodes.iter().any(|node| node.id == "asset:a.md"));
    }

    #[test]
    fn suggestions_score_problem_mentions_and_isolated_assets() {
        let mut state = GraphBuildState::default();
        build_graph_for_markdown(
            "knowledge/fragments/a.md",
            "---\ntype: fragment\ntitle: A\ntopics: [FFT]\n---\n正文提到 P3803 和 FFT，但 related_problems 为空。",
            &mut state,
        );
        build_graph_for_markdown(
            "knowledge/fragments/isolated.md",
            "---\ntype: fragment\ntitle: Isolated\n---\n没有任何关联。",
            &mut state,
        );
        let index = finalize_graph_state(state);

        assert!(index
            .suggestions
            .iter()
            .any(|suggestion| suggestion.kind == "missing_related_problem"
                && suggestion.target == "problem:P3803"
                && suggestion.score > 1.0));
        assert!(index
            .suggestions
            .iter()
            .any(|suggestion| suggestion.kind == "isolated_asset"
                && suggestion.source == "asset:knowledge/fragments/isolated.md"));
    }

    #[test]
    fn review_slices_include_priority_reason_and_metadata_weakness() {
        let mut state = GraphBuildState::default();
        build_graph_for_markdown(
            "knowledge/fragments/mistake.md",
            "---\ntype: fragment\nkind: mistake\ntitle: Wrong FFT\nreview_priority: high\nstatus: active\n---\n复习。",
            &mut state,
        );
        let index = finalize_graph_state(state);

        let slice = index
            .review_slices
            .iter()
            .find(|slice| slice.asset_id == "asset:knowledge/fragments/mistake.md")
            .unwrap();
        assert!(slice.reasons.contains(&"high_priority".to_string()));
        assert!(slice.reasons.contains(&"mistake_or_template".to_string()));
        assert!(slice.reasons.contains(&"weak_metadata".to_string()));
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

    fn smoke_yaml_list(values: &[&str]) -> String {
        if values.is_empty() {
            "[]".to_string()
        } else {
            format!("[{}]", values.join(", "))
        }
    }

    fn smoke_fragment_markdown(title: &str, problem: &str, topics: &[&str], collection_path: &str) -> String {
        format!(
            concat!(
                "---\n",
                "type: fragment\n",
                "kind: problem-note\n",
                "title: \"{title}\"\n",
                "date: \"2026-07-01\"\n",
                "topics: {topics}\n",
                "related_problems: [{problem}]\n",
                "source: luogu\n",
                "created_from: training-center\n",
                "review_priority: medium\n",
                "status: active\n",
                "problem_id: {problem}\n",
                "collection_id: \"{collection_path}\"\n",
                "---\n\n",
                "## 一句话题意\n\n",
                "{problem} smoke 题意。\n\n",
                "## 核心考点\n\n",
                "{topics}\n\n",
                "## 坑点 / 错因\n\n",
                "保留最小验收数据。\n\n",
                "## 复习提示\n\n",
                "从临时 notes root 读回。\n",
            ),
            title = title,
            problem = problem,
            topics = smoke_yaml_list(topics),
            collection_path = collection_path,
        )
    }

    fn smoke_collection_markdown(fragment_paths: &[&str]) -> String {
        format!(
            concat!(
                "---\n",
                "type: collection\n",
                "kind: daily-log\n",
                "title: \"P2-D 临时 notes smoke\"\n",
                "date: \"2026-07-01\"\n",
                "topics: [FFT, 数论, 图论]\n",
                "related_problems: [P3803, P3383, P3379]\n",
                "source: luogu\n",
                "created_from: training-center\n",
                "review_priority: medium\n",
                "status: active\n",
                "problems: [P3803, P3383, P3379]\n",
                "fragments: {fragments}\n",
                "articles: []\n",
                "---\n\n",
                "## 训练概览\n\n",
                "P2-D smoke collection writes one collection and five fragments.\n\n",
                "## 新增片段\n\n",
                "{fragment_lines}\n\n",
                "## 跳过项\n\n",
                "- skipped:item-without-comment\n",
            ),
            fragments = smoke_yaml_list(fragment_paths),
            fragment_lines = fragment_paths
                .iter()
                .map(|path| format!("- {path}"))
                .collect::<Vec<_>>()
                .join("\n"),
        )
    }

    #[test]
    fn p2_temp_notes_smoke_writes_rebuilds_and_reads_minimal_dataset() {
        let dir = tempdir().unwrap();
        let notes = dir.path().join("notes");
        fs::create_dir_all(&notes).unwrap();

        let collection_path = "knowledge/collections/p2-d-temp-smoke.md";
        let fragment_paths = [
            "knowledge/fragments/p2-d-temp-smoke/P3803.md",
            "knowledge/fragments/p2-d-temp-smoke/P3383.md",
            "knowledge/fragments/p2-d-temp-smoke/P3379.md",
            "knowledge/fragments/p2-d-temp-smoke/P1001.md",
            "knowledge/fragments/p2-d-temp-smoke/P1002.md",
        ];
        let fragments = [
            smoke_fragment_markdown("P3803 FFT smoke", "P3803", &["FFT"], collection_path),
            smoke_fragment_markdown("P3383 数论 smoke", "P3383", &["数论"], collection_path),
            smoke_fragment_markdown("P3379 图论 smoke", "P3379", &["图论"], collection_path),
            smoke_fragment_markdown("P1001 FFT trick smoke", "P1001", &["FFT"], collection_path),
            smoke_fragment_markdown("P1002 图论复习 smoke", "P1002", &["图论"], collection_path),
        ];

        let collection_result = write_knowledge_asset_to_notes_dir(
            &notes,
            WriteKnowledgeAssetRequest {
                relative_path: collection_path.to_string(),
                markdown: smoke_collection_markdown(&fragment_paths),
                overwrite: true,
            },
        )
        .unwrap();
        assert!(collection_result.written);

        for (path, markdown) in fragment_paths.iter().zip(fragments) {
            let result = write_knowledge_asset_to_notes_dir(
                &notes,
                WriteKnowledgeAssetRequest {
                    relative_path: (*path).to_string(),
                    markdown,
                    overwrite: true,
                },
            )
            .unwrap();
            assert!(result.written);
        }

        let duplicate_result = write_knowledge_asset_to_notes_dir(
            &notes,
            WriteKnowledgeAssetRequest {
                relative_path: fragment_paths[0].to_string(),
                markdown: "duplicate smoke".to_string(),
                overwrite: false,
            },
        )
        .unwrap();
        assert!(duplicate_result.skipped);

        let failure = write_knowledge_asset_to_notes_dir(
            &notes,
            WriteKnowledgeAssetRequest {
                relative_path: "../escape.md".to_string(),
                markdown: "escape".to_string(),
                overwrite: true,
            },
        );
        assert!(failure.is_err());

        let index = collect_graph(&notes).unwrap();
        let local_graph = build_local_graph(&index, &node_id_for_asset(collection_path), 1, 80);

        assert_eq!(index.assets.iter().filter(|asset| asset.asset_type == "collection").count(), 1);
        assert_eq!(index.assets.iter().filter(|asset| asset.asset_type == "fragment").count(), 5);
        for topic in ["FFT", "数论", "图论"] {
            assert!(index.nodes.iter().any(|node| node.id == node_id_for_topic(topic)));
        }
        for problem in ["P3803", "P3383", "P3379"] {
            assert!(index.nodes.iter().any(|node| node.id == node_id_for_problem(problem)));
        }
        assert!(index
            .edges
            .iter()
            .any(|edge| edge.from == node_id_for_asset(collection_path)
                && edge.to == node_id_for_asset(fragment_paths[0])
                && edge.edge_type == "contains"));
        assert!(local_graph
            .nodes
            .iter()
            .any(|node| node.id == node_id_for_asset(fragment_paths[0])));
        assert!(index
            .review_slices
            .iter()
            .any(|slice| slice.path == fragment_paths[0]));
    }

    #[test]
    fn knowledge_asset_path_rejects_traversal() {
        let dir = tempdir().unwrap();
        let notes = dir.path().join("notes");
        fs::create_dir_all(&notes).unwrap();

        assert!(safe_knowledge_path(&notes, "../escape.md").is_err());
    }

    #[test]
    fn knowledge_asset_path_stays_inside_notes_root() {
        let dir = tempdir().unwrap();
        let notes = dir.path().join("notes");
        fs::create_dir_all(&notes).unwrap();

        let path = safe_knowledge_path(&notes, "knowledge/fragments/p3803.md").unwrap();
        assert!(path.starts_with(notes.canonicalize().unwrap()));
    }
}
