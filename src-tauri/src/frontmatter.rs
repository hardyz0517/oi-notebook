//! 笔记 frontmatter 的解析、生成与增量更新。
//!
//! ## 已知行为
//!
//! 1. **YAML block style 改写**：经过 update_timestamp 重写后，序列化会使用
//!    block style。例如 `tags: [DP, 线段树]` 会被改写成：
//!    ```yaml
//!    tags:
//!    - DP
//!    - 线段树
//!    ```
//!    这是 serde_yaml 0.9 默认 emitter 行为，无法关闭。不影响 YAML 语义，
//!    但首次保存使用 inline style 的现有笔记会产生 git diff 噪音。
//!    建议手写 frontmatter 时直接用 block style。
//!
//! 2. **不支持 UTF-8 BOM 开头**：若 content 以 BOM (\xEF\xBB\xBF) 开头，
//!    has_frontmatter 会判否，build_default 会在 BOM 前插 frontmatter，
//!    导致 BOM 卡在中间。当前所有写入入口（CodeMirror / textarea）均不产生
//!    BOM，未观察到该问题；后续若遇到再处理。

use chrono::Local;
use serde_yaml::Mapping;

/// 主入口：根据 content 是否已有 frontmatter，走首次写入或增量保存两条路径。
///
/// 返回 (final_content, warning)：
/// - Ok 路径：(写入文件的内容, None)
/// - 容错路径：(content 原样, Some(警告字符串)) ── 绝不覆盖用户数据
pub fn process_for_write(content: &str, relative_path: &str) -> (String, Option<String>) {
    if !has_frontmatter(content) {
        let fm = build_default(content, relative_path);
        return (fm + content, None);
    }

    match split_frontmatter(content) {
        None => (
            content.to_string(),
            Some("frontmatter 分隔符未闭合，内容原样写入".to_string()),
        ),
        Some((yaml_str, body)) => match update_timestamp(yaml_str) {
            Err(e) => (
                content.to_string(),
                Some(format!("frontmatter YAML 解析失败（{e}），内容原样写入")),
            ),
            Ok(new_yaml) => (format!("---\n{}---\n{}", new_yaml, body), None),
        },
    }
}

/// 判断 content 是否已有 frontmatter（以 ---\n 或 ---\r\n 开头）。
fn has_frontmatter(content: &str) -> bool {
    content.starts_with("---\n") || content.starts_with("---\r\n")
}

/// 拆分 frontmatter：返回 (yaml_str, body)。
///
/// yaml_str 是两个 --- 之间的纯 yaml 内容（不含分隔符行本身）。
/// body 是第二个 --- 之后的正文部分。
///
/// 在字节层面搜索，无正则依赖。处理 \n 和 \r\n 两种行尾。
/// \n（0x0A）在 UTF-8 中只作为单字节出现，用字节索引对字符串切片是安全的。
fn split_frontmatter(content: &str) -> Option<(&str, &str)> {
    // 跳过开头的 ---\n 或 ---\r\n
    let after_open = if content.starts_with("---\r\n") {
        &content[5..]
    } else if content.starts_with("---\n") {
        &content[4..]
    } else {
        return None;
    };

    let bytes = after_open.as_bytes();

    // 特殊情况：yaml 段为空（after_open 直接以 --- 开头）
    if bytes.starts_with(b"---\r\n") {
        return Some(("", &after_open[5..]));
    }
    if bytes.starts_with(b"---\n") {
        return Some(("", &after_open[4..]));
    }
    if bytes == b"---" || bytes == b"---\r" {
        return Some(("", ""));
    }

    // 搜索 \n--- 后跟 \r\n、\n 或 EOF（文件末尾无换行符的情况）
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\n' {
            let rest = &bytes[i + 1..];
            if rest.starts_with(b"---\r\n") {
                return Some((&after_open[..i], &after_open[i + 6..]));
            }
            if rest.starts_with(b"---\n") {
                return Some((&after_open[..i], &after_open[i + 5..]));
            }
            if rest == b"---" || rest == b"---\r" {
                return Some((&after_open[..i], ""));
            }
        }
        i += 1;
    }

    None
}

/// 构造默认 frontmatter（含首尾 ---\n），用于首次写入时插到 content 最前面。
fn build_default(content: &str, relative_path: &str) -> String {
    let now = Local::now();
    let now_rfc3339 = now.to_rfc3339();

    let title = infer_title(content, relative_path, &now.format("%Y-%m-%d %H:%M").to_string());

    // draft：仅 inbox/ 开头的一级子目录为 true
    let draft = relative_path.starts_with("inbox/");

    // serde_yaml::Mapping 基于 IndexMap，保持插入顺序（不按字母排序）
    let mut mapping = Mapping::new();
    mapping.insert("title".into(), title.into());
    mapping.insert("tags".into(), serde_yaml::Value::Sequence(vec![]));
    mapping.insert("difficulty".into(), "".into());
    mapping.insert("source".into(), "".into());
    mapping.insert("created".into(), now_rfc3339.clone().into());
    mapping.insert("updated".into(), now_rfc3339.into());
    mapping.insert("summary".into(), "".into());
    mapping.insert("draft".into(), draft.into());

    let yaml_output = serde_yaml::to_string(&mapping).unwrap_or_default();
    // serde_yaml::to_string 输出带 "---\n" 前缀，去掉后由调用方包裹分隔符
    let yaml_content = yaml_output.strip_prefix("---\n").unwrap_or(&yaml_output);

    format!("---\n{yaml_content}---\n")
}

/// 推导默认标题：正文首行优先，其次文件名，最后使用未命名 fallback。
fn infer_title(content: &str, relative_path: &str, fallback_time: &str) -> String {
    let first_line = content.lines().next().unwrap_or("").trim();
    let raw_title = if first_line.is_empty() {
        filename_stem(relative_path)
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| format!("未命名 {fallback_time}"))
    } else {
        strip_markdown_h1_prefix(first_line).to_string()
    };

    raw_title.chars().take(40).collect()
}

/// 兼容 / 和 \ 两种分隔符，从相对路径取文件名并去掉 .md 后缀。
fn filename_stem(relative_path: &str) -> Option<String> {
    let filename = relative_path
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .trim();

    if filename.is_empty() {
        return None;
    }

    Some(
        filename
            .strip_suffix(".md")
            .unwrap_or(filename)
            .to_string(),
    )
}

/// 若正文首行是 Markdown 一级标题，去掉开头的 # 和后续空白。
fn strip_markdown_h1_prefix(line: &str) -> &str {
    line.strip_prefix('#')
        .map(str::trim_start)
        .filter(|title| !title.is_empty())
        .unwrap_or(line)
}

/// 解析已有 yaml，只更新 updated 字段，序列化回字符串（不含 ---\n 前缀）。
///
/// 用 serde_yaml::Mapping（IndexMap 语义）保证字段顺序不变。
/// 对 already-existing key 调用 insert 会在原位置更新值，不移动顺序。
fn update_timestamp(yaml_str: &str) -> Result<String, String> {
    // 空 yaml 段（---\n---\n 格式）当作空 Mapping 处理，只添加 updated
    let mut mapping: Mapping = if yaml_str.trim().is_empty() {
        Mapping::new()
    } else {
        serde_yaml::from_str(yaml_str).map_err(|e| format!("YAML 解析失败：{e}"))?
    };

    let now = Local::now().to_rfc3339();
    mapping.insert(
        serde_yaml::Value::String("updated".to_string()),
        serde_yaml::Value::String(now),
    );

    let yaml_output = serde_yaml::to_string(&mapping)
        .map_err(|e| format!("YAML 序列化失败：{e}"))?;

    // 去掉 serde_yaml 添加的 "---\n" 前缀；确保末尾有 \n 以便拼 ---\n 分隔符
    let yaml_content = yaml_output
        .strip_prefix("---\n")
        .unwrap_or(&yaml_output)
        .to_string();

    if yaml_content.ends_with('\n') {
        Ok(yaml_content)
    } else {
        Ok(yaml_content + "\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 辅助：从 final_content 里解析 frontmatter 为 Mapping
    fn parse_frontmatter(content: &str) -> Mapping {
        let (yaml_str, _) = split_frontmatter(content).expect("should have frontmatter");
        serde_yaml::from_str(yaml_str).expect("yaml should be valid")
    }

    // 辅助：从 Mapping 里取 string 字段
    fn get_str<'a>(m: &'a Mapping, key: &str) -> &'a str {
        m.get(key)
            .unwrap_or_else(|| panic!("key '{key}' not found"))
            .as_str()
            .unwrap_or_else(|| panic!("key '{key}' is not a string"))
    }

    // ── Test 1：空内容 → title 从文件名推导 ─────────────────────────────────────

    #[test]
    fn empty_content_uses_filename_as_title() {
        let (final_content, warning) = process_for_write("", "tricks/快速幂.md");
        assert!(warning.is_none());
        assert!(final_content.starts_with("---\n"));
        let m = parse_frontmatter(&final_content);
        assert_eq!(get_str(&m, "title"), "快速幂");
        assert!(m.get("tags").unwrap().as_sequence().unwrap().is_empty());
        assert_eq!(get_str(&m, "difficulty"), "");
        assert_eq!(get_str(&m, "source"), "");
        assert!(get_str(&m, "created").contains('T'));
        assert!(get_str(&m, "updated").contains('T'));
        assert_eq!(get_str(&m, "summary"), "");
        assert!(!m.get("draft").unwrap().as_bool().unwrap());
        // 正文部分为空
        let (_, body) = split_frontmatter(&final_content).unwrap();
        assert_eq!(body, "");
    }

    #[test]
    fn empty_content_accepts_windows_style_path_for_title() {
        let (final_content, warning) = process_for_write("", "tricks\\快速幂.md");
        assert!(warning.is_none());
        let m = parse_frontmatter(&final_content);
        assert_eq!(get_str(&m, "title"), "快速幂");
    }

    // ── Test 2：首行有内容 → title 取首行 ────────────────────────────────────────

    #[test]
    fn first_line_becomes_title() {
        let content = "快速幂算法\n\n正文内容";
        let (final_content, warning) = process_for_write(content, "tricks/test.md");
        assert!(warning.is_none());
        let m = parse_frontmatter(&final_content);
        assert_eq!(get_str(&m, "title"), "快速幂算法");
        // 原始 content 完整出现在 final 末尾（首次写入是 fm + content）
        assert!(final_content.ends_with(content));
    }

    #[test]
    fn markdown_h1_first_line_becomes_plain_title() {
        let content = "# 快速幂算法\n\n正文内容";
        let (final_content, warning) = process_for_write(content, "tricks/test.md");
        assert!(warning.is_none());
        let m = parse_frontmatter(&final_content);
        assert_eq!(get_str(&m, "title"), "快速幂算法");
    }

    // ── Test 3：首行 51 个中文字符 → 截断到 40 字符，UTF-8 不坏 ─────────────────

    #[test]
    fn title_truncated_at_40_unicode_chars() {
        let first_line = "甲".repeat(51);
        let content = format!("{first_line}\n正文");
        let (final_content, warning) = process_for_write(&content, "tricks/test.md");
        assert!(warning.is_none());
        let m = parse_frontmatter(&final_content);
        let title = get_str(&m, "title");
        assert_eq!(title.chars().count(), 40, "title should be 40 chars, got {}", title.chars().count());
        assert_eq!(title, "甲".repeat(40));
        assert!(String::from_utf8(title.as_bytes().to_vec()).is_ok(), "title must be valid UTF-8");
    }

    #[test]
    fn filename_title_truncated_at_40_unicode_chars() {
        let filename = format!("tricks/{}.md", "乙".repeat(51));
        let (final_content, warning) = process_for_write("", &filename);
        assert!(warning.is_none());
        let m = parse_frontmatter(&final_content);
        let title = get_str(&m, "title");
        assert_eq!(title.chars().count(), 40, "title should be 40 chars, got {}", title.chars().count());
        assert_eq!(title, "乙".repeat(40));
    }

    // ── Test 4：inbox/ 路径 → draft: true ────────────────────────────────────────

    #[test]
    fn inbox_path_sets_draft_true() {
        let (final_content, warning) = process_for_write("速记内容", "inbox/quick-2026-04-27-10-00-00.md");
        assert!(warning.is_none());
        let m = parse_frontmatter(&final_content);
        assert!(m.get("tags").unwrap().as_sequence().unwrap().is_empty());
        assert_eq!(get_str(&m, "difficulty"), "");
        assert_eq!(get_str(&m, "source"), "");
        assert!(get_str(&m, "created").contains('T'));
        assert!(get_str(&m, "updated").contains('T'));
        assert_eq!(get_str(&m, "summary"), "");
        assert!(m.get("draft").unwrap().as_bool().unwrap(), "inbox/ should set draft=true");
    }

    // ── Test 5：tricks/ 路径 → draft: false ──────────────────────────────────────

    #[test]
    fn tricks_path_sets_draft_false() {
        let (final_content, warning) = process_for_write("快速幂", "tricks/qpow.md");
        assert!(warning.is_none());
        let m = parse_frontmatter(&final_content);
        assert!(!m.get("draft").unwrap().as_bool().unwrap(), "tricks/ should set draft=false");
    }

    // ── Test 6：顶层路径 → draft: false ──────────────────────────────────────────

    #[test]
    fn toplevel_path_sets_draft_false() {
        let (final_content, warning) = process_for_write("顶层笔记", "note.md");
        assert!(warning.is_none());
        let m = parse_frontmatter(&final_content);
        assert!(!m.get("draft").unwrap().as_bool().unwrap(), "toplevel should set draft=false");
    }

    // ── Test 7：已有合法 frontmatter → updated 更新，其他字段保留，字段顺序不变 ──

    #[test]
    fn existing_frontmatter_updates_only_timestamp() {
        let content = concat!(
            "---\n",
            "title: 测试笔记\n",
            "created: 2026-01-01T00:00:00+08:00\n",
            "updated: 2026-01-01T00:00:00+08:00\n",
            "tags:\n",
            "- DP\n",
            "difficulty: 普及+\n",
            "source: manual\n",
            "summary: 原摘要\n",
            "draft: false\n",
            "---\n",
            "正文内容"
        );
        let (new_content, warning) = process_for_write(content, "tricks/test.md");
        assert!(warning.is_none());
        assert_ne!(new_content, content, "updated field should have changed");

        let m = parse_frontmatter(&new_content);
        assert_eq!(get_str(&m, "title"), "测试笔记");
        assert_eq!(get_str(&m, "created"), "2026-01-01T00:00:00+08:00", "created must not change");
        assert_ne!(get_str(&m, "updated"), "2026-01-01T00:00:00+08:00", "updated must change");

        let tags = m.get("tags").unwrap().as_sequence().unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].as_str().unwrap(), "DP");

        assert_eq!(get_str(&m, "difficulty"), "普及+", "difficulty must not change");
        assert_eq!(get_str(&m, "source"), "manual", "source must not change");
        assert_eq!(get_str(&m, "summary"), "原摘要", "summary must not change");
        assert!(!m.get("draft").unwrap().as_bool().unwrap());

        let (_, body) = split_frontmatter(&new_content).unwrap();
        assert_eq!(body, "正文内容");

        // 字段顺序断言：serde_yaml::Mapping 基于 IndexMap，insert 已有 key 不改变位置
        let title_idx   = new_content.find("title:").unwrap();
        let tags_idx    = new_content.find("tags:").unwrap();
        let difficulty_idx = new_content.find("difficulty:").unwrap();
        let source_idx = new_content.find("source:").unwrap();
        let created_idx = new_content.find("created:").unwrap();
        let updated_idx = new_content.find("updated:").unwrap();
        let summary_idx = new_content.find("summary:").unwrap();
        let draft_idx   = new_content.find("draft:").unwrap();
        assert!(title_idx   < created_idx, "title should keep its original position before created");
        assert!(created_idx < updated_idx, "created should come before updated");
        assert!(updated_idx < tags_idx,    "updated should keep its original position before tags");
        assert!(tags_idx    < difficulty_idx, "tags should come before difficulty");
        assert!(difficulty_idx < source_idx, "difficulty should come before source");
        assert!(source_idx < summary_idx, "source should come before summary");
        assert!(summary_idx < draft_idx, "summary should come before draft");
    }

    // ── Test 8：已有可选字段（difficulty/source）→ 保存后可选字段保留 ─────────────

    #[test]
    fn optional_fields_are_preserved() {
        let content = concat!(
            "---\n",
            "title: 测试\n",
            "created: 2026-01-01T00:00:00+08:00\n",
            "updated: 2026-01-01T00:00:00+08:00\n",
            "tags: []\n",
            "draft: false\n",
            "difficulty: 省选\n",
            "source: luogu-P1234\n",
            "---\n",
            "正文"
        );
        let (new_content, warning) = process_for_write(content, "tricks/test.md");
        assert!(warning.is_none());
        let m = parse_frontmatter(&new_content);
        assert_eq!(get_str(&m, "difficulty"), "省选", "difficulty should be preserved");
        assert_eq!(get_str(&m, "source"), "luogu-P1234", "source should be preserved");
    }

    // ── Test 9a：缺第二个 --- → warning，原内容不变 ──────────────────────────────

    #[test]
    fn missing_closing_delimiter_returns_warning() {
        let content = "---\ntitle: 测试\n没有第二个 --- 的正文\n";
        let (result, warning) = process_for_write(content, "tricks/test.md");
        assert_eq!(result, content, "content must be returned as-is");
        let w = warning.expect("warning should be Some");
        assert!(w.contains("分隔符"), "warning should mention '分隔符', got: {w}");
    }

    // ── Test 9b：yaml 语法错误（未闭合的 flow sequence）→ warning，原内容不变 ─────

    #[test]
    fn invalid_yaml_syntax_returns_warning() {
        let content = "---\nthis: [invalid\n---\n正文";
        let (result, warning) = process_for_write(content, "tricks/test.md");
        assert_eq!(result, content, "content must be returned as-is");
        let w = warning.expect("warning should be Some");
        assert!(w.contains("解析失败"), "warning should mention '解析失败', got: {w}");
    }

    // ── Test 9c：yaml 缩进损坏 → warning，原内容不变 ─────────────────────────────

    #[test]
    fn yaml_indent_error_returns_warning() {
        let content = "---\ntitle: 测试\n  bad:\n indent: wrong\n---\n正文";
        let (result, warning) = process_for_write(content, "tricks/test.md");
        assert_eq!(result, content, "content must be returned as-is");
        let w = warning.expect("warning should be Some");
        assert!(w.contains("解析失败"), "warning should mention '解析失败', got: {w}");
    }

    // ── Test 7b：update_timestamp 对已有 key 是原位更新，不追加新行 ───────────────

    #[test]
    fn update_timestamp_replaces_in_place_not_appends() {
        let yaml_str = "title: 测试\nupdated: 2020-01-01T00:00:00+08:00\ndraft: false\n";
        let result = update_timestamp(yaml_str).unwrap();
        let count = result.matches("updated:").count();
        assert_eq!(count, 1, "updated should appear exactly once, got {count}\nresult:\n{result}");
        let title_idx   = result.find("title:").unwrap();
        let updated_idx = result.find("updated:").unwrap();
        let draft_idx   = result.find("draft:").unwrap();
        assert!(title_idx < updated_idx, "title should come before updated");
        assert!(updated_idx < draft_idx, "updated should come before draft");
    }

    // ── Test 10：时间字段格式正确，能被 chrono 反向解析 ──────────────────────────

    #[test]
    fn timestamps_are_valid_rfc3339() {
        let (final_content, _) = process_for_write("任意内容", "tricks/test.md");
        let m = parse_frontmatter(&final_content);
        let created = get_str(&m, "created");
        let updated = get_str(&m, "updated");
        assert!(
            chrono::DateTime::parse_from_rfc3339(created).is_ok(),
            "created should be valid RFC3339: {created}"
        );
        assert!(
            chrono::DateTime::parse_from_rfc3339(updated).is_ok(),
            "updated should be valid RFC3339: {updated}"
        );
    }
}
