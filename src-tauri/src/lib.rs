mod accounts;
mod commands;
mod extractor;
mod monitor;
mod rules;
mod state;
mod storage;
mod types;
mod vault;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_dir)?;

            let salt_path = app_dir.join("stronghold-salt");
            app.handle()
                .plugin(tauri_plugin_stronghold::Builder::with_argon2(&salt_path).build())?;

            let state = state::AppState::new(app_dir)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_status,
            commands::vault_setup,
            commands::vault_unlock,
            commands::vault_lock,
            commands::accounts_import,
            commands::accounts_list,
            commands::accounts_update,
            commands::accounts_delete,
            commands::monitor_start,
            commands::monitor_stop,
            commands::monitor_refresh_account,
            commands::monitor_refresh_all,
            commands::rules_list,
            commands::rules_save,
            commands::rules_delete,
            commands::rules_test,
            commands::results_list,
            commands::result_reveal,
            commands::result_copy,
            commands::result_open_link
        ])
        .run(tauri::generate_context!())
        .expect("failed to run email auth manager");
}
