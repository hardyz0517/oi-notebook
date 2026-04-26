mod notes;

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
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
