mod notes;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            notes::list_notes,
            notes::read_note,
            notes::write_note,
            notes::delete_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
