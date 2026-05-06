use std::{
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};

use tauri::{AppHandle, Manager};

static APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
static LOCAL_BLOG_DIST_DIR: OnceLock<PathBuf> = OnceLock::new();

pub(crate) fn init_app_data_dir(app: &AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;
    let _ = APP_DATA_DIR.set(app_data_dir);

    let local_blog_dist_dir = if cfg!(debug_assertions) {
        repo_root()?.join("local-blog").join("dist")
    } else {
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to resolve resource directory: {e}"))?;
        let candidates = [
            resource_dir.join("local-blog").join("dist"),
            resource_dir.join("dist"),
        ];
        candidates
            .iter()
            .find(|candidate| candidate.is_dir())
            .cloned()
            .unwrap_or_else(|| candidates[0].clone())
    };
    let _ = LOCAL_BLOG_DIST_DIR.set(local_blog_dist_dir);
    Ok(())
}

pub(crate) fn repo_root() -> Result<PathBuf, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Cannot resolve repo root from CARGO_MANIFEST_DIR".to_string())
}

pub(crate) fn data_root() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        repo_root()
    } else {
        APP_DATA_DIR
            .get()
            .cloned()
            .ok_or_else(|| "App data directory was not initialized".to_string())
    }
}

pub(crate) fn notes_dir() -> Result<PathBuf, String> {
    Ok(data_root()?.join("notes"))
}

pub(crate) fn oinb_dir() -> Result<PathBuf, String> {
    Ok(data_root()?.join(".oinb"))
}

pub(crate) fn site_dir() -> Result<Option<PathBuf>, String> {
    if cfg!(debug_assertions) {
        Ok(Some(repo_root()?.join("site")))
    } else {
        Ok(None)
    }
}

pub(crate) fn local_blog_dist_dir() -> Result<PathBuf, String> {
    if let Some(path) = LOCAL_BLOG_DIST_DIR.get() {
        return Ok(path.clone());
    }

    if cfg!(debug_assertions) {
        return Ok(repo_root()?.join("local-blog").join("dist"));
    }

    Err("Local blog dist directory was not initialized".to_string())
}

pub(crate) fn ensure_data_dirs() -> Result<(), String> {
    let notes_dir = notes_dir()?;
    fs::create_dir_all(&notes_dir).map_err(|e| format!("Failed to create notes directory: {e}"))?;
    for subdir in ["inbox", "tricks", "problems", "luogu", "assets"] {
        fs::create_dir_all(notes_dir.join(subdir))
            .map_err(|e| format!("Failed to create notes/{subdir} directory: {e}"))?;
    }

    let oinb_dir = oinb_dir()?;
    fs::create_dir_all(&oinb_dir).map_err(|e| format!("Failed to create .oinb directory: {e}"))?;
    fs::create_dir_all(oinb_dir.join("prompts"))
        .map_err(|e| format!("Failed to create .oinb/prompts directory: {e}"))?;
    fs::create_dir_all(oinb_dir.join("ai-cache"))
        .map_err(|e| format!("Failed to create .oinb/ai-cache directory: {e}"))?;

    Ok(())
}
