use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use crate::paths;

const WEB_CACHE_ROOT: &str = "web-cache";
const WEB_CACHE_VERSION: u32 = 1;
const CLEANUP_SAMPLE_LIMIT: usize = 32;

#[derive(Debug, Clone)]
pub struct CachedJson {
    pub value: JsonValue,
    pub cached_at_ms: i64,
    pub ttl_seconds: i64,
    pub is_fresh: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WebCacheEntry {
    version: u32,
    cached_at_ms: i64,
    ttl_seconds: i64,
    value: JsonValue,
}

pub fn cache_version() -> u32 {
    WEB_CACHE_VERSION
}

pub fn web_cache_dir() -> Result<PathBuf, String> {
    Ok(paths::oinb_dir()?.join(WEB_CACHE_ROOT))
}

pub fn ensure_web_cache_dirs() -> Result<(), String> {
    let root = web_cache_dir()?;
    fs::create_dir_all(root.join("search"))
        .map_err(|e| format!("Failed to create .oinb/web-cache/search directory: {e}"))?;
    fs::create_dir_all(root.join("excerpts"))
        .map_err(|e| format!("Failed to create .oinb/web-cache/excerpts directory: {e}"))?;
    Ok(())
}

pub fn clear_web_cache() -> Result<(), String> {
    let root = web_cache_dir()?;
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|e| format!("Failed to clear .oinb/web-cache: {e}"))?;
    }
    ensure_web_cache_dirs()
}

pub fn read_cached_json(bucket: &str, key: &str, now_ms: i64) -> Option<CachedJson> {
    let path = cache_file_path(bucket, key).ok()?;
    let text = fs::read_to_string(path).ok()?;
    let entry = serde_json::from_str::<WebCacheEntry>(&text).ok()?;
    if entry.version != WEB_CACHE_VERSION || entry.ttl_seconds <= 0 {
        return None;
    }
    let age_ms = now_ms.saturating_sub(entry.cached_at_ms);
    let ttl_ms = entry.ttl_seconds.saturating_mul(1000);
    Some(CachedJson {
        value: entry.value,
        cached_at_ms: entry.cached_at_ms,
        ttl_seconds: entry.ttl_seconds,
        is_fresh: age_ms <= ttl_ms,
    })
}

pub fn write_cached_json(
    bucket: &str,
    key: &str,
    value: JsonValue,
    ttl_seconds: i64,
) -> Result<(), String> {
    ensure_web_cache_dirs()?;
    cleanup_expired_bucket(bucket);
    let path = cache_file_path(bucket, key)?;
    let entry = WebCacheEntry {
        version: WEB_CACHE_VERSION,
        cached_at_ms: now_ms(),
        ttl_seconds,
        value,
    };
    let text = serde_json::to_string_pretty(&entry)
        .map_err(|e| format!("Failed to serialize web cache entry: {e}"))?;
    fs::write(path, text).map_err(|e| format!("Failed to write web cache entry: {e}"))
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

fn cache_file_path(bucket: &str, key: &str) -> Result<PathBuf, String> {
    if !is_safe_name(bucket) || !is_safe_name(key) {
        return Err("Invalid web cache key".to_string());
    }
    Ok(web_cache_dir()?.join(bucket).join(format!("{key}.json")))
}

fn cleanup_expired_bucket(bucket: &str) {
    if !is_safe_name(bucket) {
        return;
    }
    let Ok(dir) = web_cache_dir().map(|root| root.join(bucket)) else {
        return;
    };
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let now = now_ms();
    for entry in entries.filter_map(Result::ok).take(CLEANUP_SAMPLE_LIMIT) {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        if should_remove_cache_file(&path, now) {
            let _ = fs::remove_file(path);
        }
    }
}

fn should_remove_cache_file(path: &Path, now_ms: i64) -> bool {
    let Ok(text) = fs::read_to_string(path) else {
        return false;
    };
    let Ok(entry) = serde_json::from_str::<WebCacheEntry>(&text) else {
        return true;
    };
    if entry.version != WEB_CACHE_VERSION || entry.ttl_seconds <= 0 {
        return true;
    }
    now_ms.saturating_sub(entry.cached_at_ms) > entry.ttl_seconds.saturating_mul(1000)
}

fn is_safe_name(value: &str) -> bool {
    !value.is_empty()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}
