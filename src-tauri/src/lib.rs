mod frontmatter;
mod git;
mod notes;

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct BlogServerState {
    child: Mutex<Option<Child>>,
}

impl BlogServerState {
    fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }
}

impl Drop for BlogServerState {
    fn drop(&mut self) {
        if let Err(e) = stop_blog_server(self) {
            eprintln!("清理 Astro dev server 失败：{e}");
        }
    }
}

fn site_dir() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent()?;
    Some(repo_root.join("site"))
}

fn start_blog_server(state: &BlogServerState) -> Result<(), String> {
    let Some(site_dir) = site_dir() else {
        return Err("无法定位仓库根目录，无法启动 Astro dev server".to_string());
    };

    if !site_dir.is_dir() {
        return Err(format!(
            "site 目录不存在，无法启动 Astro dev server：{}",
            site_dir.display()
        ));
    }

    let mut child_guard = match state.child.lock() {
        Ok(guard) => guard,
        Err(e) => return Err(format!("无法获取 Astro dev server 状态锁：{e}")),
    };

    if child_guard.is_some() {
        return Ok(());
    }

    match Command::new("pnpm.cmd")
        .args(["dev", "--host", "127.0.0.1", "--port", "4321"])
        .current_dir(&site_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => {
            *child_guard = Some(child);
            Ok(())
        }
        Err(e) => Err(format!("启动 Astro dev server 失败：{e}")),
    }
}

fn stop_blog_server(state: &BlogServerState) -> Result<(), String> {
    let mut child = match state.child.lock() {
        Ok(mut guard) => guard.take(),
        Err(e) => return Err(format!("无法获取 Astro dev server 状态锁：{e}")),
    };

    if let Some(child) = child.as_mut() {
        match child.try_wait() {
            Ok(Some(_status)) => {}
            Ok(None) => {
                stop_blog_server_child(child)?;
            }
            Err(e) => return Err(format!("检查 Astro dev server 状态失败：{e}")),
        }
    }

    Ok(())
}

#[cfg(windows)]
fn stop_blog_server_child(child: &mut Child) -> Result<(), String> {
    let pid = child.id().to_string();
    match Command::new("taskkill")
        .args(["/PID", &pid, "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
    {
        Ok(status) if status.success() => {}
        Ok(status) => {
            if let Err(kill_error) = child.kill() {
                return Err(format!(
                    "taskkill 清理 Astro dev server 进程树失败，状态码：{status}；fallback kill 也失败：{kill_error}"
                ));
            }
            let _ = child.wait();
            return Err(format!(
                "taskkill 清理 Astro dev server 进程树失败，状态码：{status}"
            ));
        }
        Err(taskkill_error) => {
            if let Err(kill_error) = child.kill() {
                return Err(format!(
                    "执行 taskkill 清理 Astro dev server 进程树失败：{taskkill_error}；fallback kill 也失败：{kill_error}"
                ));
            }
            let _ = child.wait();
            return Err(format!(
                "执行 taskkill 清理 Astro dev server 进程树失败：{taskkill_error}"
            ));
        }
    }

    if let Err(e) = child.wait() {
        return Err(format!("等待 Astro dev server 退出失败：{e}"));
    }

    Ok(())
}

#[cfg(not(windows))]
fn stop_blog_server_child(child: &mut Child) -> Result<(), String> {
    if let Err(e) = child.kill() {
        return Err(format!("停止 Astro dev server 失败：{e}"));
    }
    if let Err(e) = child.wait() {
        return Err(format!("等待 Astro dev server 退出失败：{e}"));
    }

    Ok(())
}

#[tauri::command]
fn open_blog() -> Result<(), String> {
    tauri_plugin_opener::open_url("http://localhost:4321", None::<&str>)
        .map_err(|e| format!("打开本地博客失败：{e}"))
}

#[tauri::command]
fn restart_blog_server(state: tauri::State<'_, BlogServerState>) -> Result<(), String> {
    stop_blog_server(&state)?;
    start_blog_server(&state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BlogServerState::new())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            notes::list_notes,
            notes::read_note,
            notes::write_note,
            notes::save_note_asset,
            notes::delete_note,
            notes::rename_note,
            git::commit_note,
            git::push_git,
            open_blog,
            restart_blog_server,
        ])
        .setup(|app| {
            if let Err(e) = start_blog_server(&app.state::<BlogServerState>()) {
                eprintln!("{e}");
            }

            #[cfg(desktop)]
            {
                let toggle_shortcut =
                    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space);
                let toggle_shortcut_clone = toggle_shortcut;

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if shortcut == &toggle_shortcut_clone
                                && event.state() == ShortcutState::Pressed
                            {
                                if let Some(window) = app.get_webview_window("quick-note") {
                                    match window.is_visible() {
                                        Ok(true) => {
                                            let _ = window.hide();
                                        }
                                        Ok(false) => {
                                            let _ = window.center();
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                        Err(e) => {
                                            eprintln!("无法获取 quick-note 窗口可见状态：{e}");
                                        }
                                    }
                                } else {
                                    eprintln!("找不到 quick-note 窗口");
                                }
                            }
                        })
                        .build(),
                )?;

                let _ = app.global_shortcut().unregister(toggle_shortcut);
                app.global_shortcut().register(toggle_shortcut)?;

                let show_main =
                    MenuItem::with_id(app, "show-main", "显示主窗口", true, None::<&str>)?;
                let show_quick =
                    MenuItem::with_id(app, "show-quick", "显示速记", true, None::<&str>)?;
                let separator = PredefinedMenuItem::separator(app)?;
                let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

                let menu = Menu::with_items(app, &[&show_main, &show_quick, &separator, &quit])?;

                let _tray = TrayIconBuilder::with_id("main-tray")
                    .tooltip("OI Notebook")
                    .icon(
                        app.default_window_icon()
                            .cloned()
                            .expect("default window icon should be present"),
                    )
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "show-main" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                                let _ = window.unminimize();
                            }
                        }
                        "show-quick" => {
                            if let Some(window) = app.get_webview_window("quick-note") {
                                let _ = window.center();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            if let Err(e) = stop_blog_server(&app.state::<BlogServerState>()) {
                                eprintln!("清理 Astro dev server 失败：{e}");
                            }
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            if let Some(window) = app.get_webview_window("main") {
                                match window.is_visible() {
                                    Ok(true) => {
                                        let _ = window.hide();
                                    }
                                    Ok(false) => {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                        let _ = window.unminimize();
                                    }
                                    Err(e) => {
                                        eprintln!("无法获取主窗口可见状态：{e}");
                                    }
                                }
                            }
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
