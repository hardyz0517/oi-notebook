mod frontmatter;
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
        stop_blog_server(self);
    }
}

fn site_dir() -> Option<PathBuf> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.parent()?;
    Some(repo_root.join("site"))
}

fn start_blog_server(state: &BlogServerState) {
    let Some(site_dir) = site_dir() else {
        eprintln!("无法定位仓库根目录，跳过启动 Astro dev server");
        return;
    };

    if !site_dir.is_dir() {
        eprintln!(
            "site 目录不存在，跳过启动 Astro dev server：{}",
            site_dir.display()
        );
        return;
    }

    let mut child_guard = match state.child.lock() {
        Ok(guard) => guard,
        Err(e) => {
            eprintln!("无法获取 Astro dev server 状态锁，跳过启动：{e}");
            return;
        }
    };

    if child_guard.is_some() {
        return;
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
        }
        Err(e) => {
            eprintln!("启动 Astro dev server 失败：{e}");
        }
    }
}

fn stop_blog_server(state: &BlogServerState) {
    let mut child = match state.child.lock() {
        Ok(mut guard) => guard.take(),
        Err(e) => {
            eprintln!("无法获取 Astro dev server 状态锁，跳过清理：{e}");
            return;
        }
    };

    if let Some(child) = child.as_mut() {
        match child.try_wait() {
            Ok(Some(_status)) => {}
            Ok(None) => {
                if let Err(e) = child.kill() {
                    eprintln!("停止 Astro dev server 失败：{e}");
                }
                if let Err(e) = child.wait() {
                    eprintln!("等待 Astro dev server 退出失败：{e}");
                }
            }
            Err(e) => {
                eprintln!("检查 Astro dev server 状态失败：{e}");
            }
        }
    }
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
            notes::delete_note,
            notes::rename_note,
        ])
        .setup(|app| {
            start_blog_server(&app.state::<BlogServerState>());

            #[cfg(desktop)]
            {
                let toggle_shortcut = Shortcut::new(
                    Some(Modifiers::CONTROL | Modifiers::ALT),
                    Code::Space,
                );
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

                let show_main = MenuItem::with_id(app, "show-main", "显示主窗口", true, None::<&str>)?;
                let show_quick = MenuItem::with_id(app, "show-quick", "显示速记", true, None::<&str>)?;
                let separator = PredefinedMenuItem::separator(app)?;
                let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

                let menu = Menu::with_items(app, &[&show_main, &show_quick, &separator, &quit])?;

                let _tray = TrayIconBuilder::with_id("main-tray")
                    .tooltip("OI Notebook")
                    .icon(app.default_window_icon().cloned().expect("default window icon should be present"))
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
                            stop_blog_server(&app.state::<BlogServerState>());
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
