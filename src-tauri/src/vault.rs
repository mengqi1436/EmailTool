use crate::types::SecretBundle;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
struct VaultFile {
    salt: String,
    nonce: String,
    ciphertext: String,
}

pub struct SecretVault {
    path: PathBuf,
    unlocked: bool,
    key: Option<[u8; 32]>,
    salt: Option<Vec<u8>>,
    records: HashMap<String, SecretBundle>,
}

impl SecretVault {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            unlocked: false,
            key: None,
            salt: None,
            records: HashMap::new(),
        }
    }

    pub fn is_setup(&self) -> bool {
        self.path.exists()
    }

    pub fn is_unlocked(&self) -> bool {
        self.unlocked
    }

    pub fn setup(&mut self, password: &str) -> Result<(), String> {
        validate_password(password)?;
        if self.is_setup() {
            return Err("保险库已初始化，请使用主密码解锁".to_string());
        }

        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }

        let mut salt = vec![0u8; 16];
        OsRng.fill_bytes(&mut salt);
        let key = derive_key(password, &salt)?;

        self.records.clear();
        self.key = Some(key);
        self.salt = Some(salt);
        self.unlocked = true;
        self.save()
    }

    pub fn unlock(&mut self, password: &str) -> Result<(), String> {
        validate_password(password)?;
        let file = read_vault_file(&self.path)?;
        let salt = STANDARD.decode(file.salt).map_err(|err| err.to_string())?;
        let nonce = STANDARD.decode(file.nonce).map_err(|err| err.to_string())?;
        let ciphertext = STANDARD.decode(file.ciphertext).map_err(|err| err.to_string())?;
        let key = derive_key(password, &salt)?;
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
        let plaintext = cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|_| "保险库密码错误或文件已损坏".to_string())?;
        let records = serde_json::from_slice::<HashMap<String, SecretBundle>>(&plaintext).map_err(|err| err.to_string())?;

        self.records = records;
        self.key = Some(key);
        self.salt = Some(salt);
        self.unlocked = true;
        Ok(())
    }

    pub fn lock(&mut self) {
        self.records.clear();
        self.key = None;
        self.unlocked = false;
    }

    pub fn set(&mut self, key: String, bundle: SecretBundle) -> Result<(), String> {
        self.ensure_unlocked()?;
        self.records.insert(key, bundle);
        self.save()
    }

    pub fn get(&self, key: &str) -> Result<Option<SecretBundle>, String> {
        self.ensure_unlocked()?;
        Ok(self.records.get(key).cloned())
    }

    pub fn remove(&mut self, key: &str) -> Result<(), String> {
        self.ensure_unlocked()?;
        self.records.remove(key);
        self.save()
    }

    fn save(&self) -> Result<(), String> {
        self.ensure_unlocked()?;
        let key = self.key.ok_or_else(|| "保险库未解锁".to_string())?;
        let salt = self.salt.clone().ok_or_else(|| "保险库缺少 salt".to_string())?;
        let mut nonce = vec![0u8; 12];
        OsRng.fill_bytes(&mut nonce);
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
        let plaintext = serde_json::to_vec(&self.records).map_err(|err| err.to_string())?;
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), plaintext.as_ref())
            .map_err(|_| "保险库加密失败".to_string())?;
        let file = VaultFile {
            salt: STANDARD.encode(salt),
            nonce: STANDARD.encode(nonce),
            ciphertext: STANDARD.encode(ciphertext),
        };
        let payload = serde_json::to_vec_pretty(&file).map_err(|err| err.to_string())?;
        std::fs::write(&self.path, payload).map_err(|err| err.to_string())
    }

    fn ensure_unlocked(&self) -> Result<(), String> {
        if self.unlocked {
            Ok(())
        } else {
            Err("保险库未解锁".to_string())
        }
    }
}

fn read_vault_file(path: &PathBuf) -> Result<VaultFile, String> {
    let payload = std::fs::read(path).map_err(|_| "保险库尚未初始化".to_string())?;
    serde_json::from_slice(&payload).map_err(|err| err.to_string())
}

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|err| err.to_string())?;
    Ok(key)
}

fn validate_password(password: &str) -> Result<(), String> {
    if password.chars().count() < 6 {
        Err("主密码至少需要 6 位".to_string())
    } else {
        Ok(())
    }
}
