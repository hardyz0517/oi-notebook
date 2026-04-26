mod notes;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            notes::list_notes,
            notes::read_note,
            notes::write_note,
            notes::delete_note,
            notes::rename_note,
        ])
        .setup(|app| {
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
