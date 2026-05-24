use crate::monitor::MonitorRuntime;
use crate::storage::Storage;
use crate::vault::SecretVault;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub storage: Mutex<Storage>,
    pub vault: Mutex<SecretVault>,
    pub monitor: Mutex<MonitorRuntime>,
}

impl AppState {
    pub fn new(app_dir: PathBuf) -> Result<Self, String> {
        let storage = Storage::new(app_dir.join("email-auth-manager.sqlite3"))?;
        let vault = SecretVault::new(app_dir.join("vault.enc"));
        Ok(Self {
            storage: Mutex::new(storage),
            vault: Mutex::new(vault),
            monitor: Mutex::new(MonitorRuntime::new()),
        })
    }
}
