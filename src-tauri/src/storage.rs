use crate::rules::default_rules;
use crate::types::{
    AccountFilter, AccountRow, AccountUpdate, AuthType, ExtractionResultRow, ExtractionRule, ImportedAccount, Provider,
    ResultFilter, ResultType,
};
use chrono::Utc;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use uuid::Uuid;

pub struct Storage {
    db_path: PathBuf,
}

impl Storage {
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let storage = Self { db_path };
        storage.init()?;
        Ok(storage)
    }

    pub fn upsert_account(&self, account: &ImportedAccount, secret_ref: &str) -> Result<(), String> {
        let conn = self.connection()?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            r#"
            INSERT INTO accounts
                (id, email, provider, auth_type, account_type, group_name, imap_server, imap_port, smtp_server, smtp_port,
                 folders_json, status, legacy_status, has_aws_code, remark, last_check_at, last_cursor, secret_ref, error, created_at, updated_at)
            VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'pending', '未检测', ?12, ?13, NULL, NULL, ?14, NULL, ?15, ?15)
            ON CONFLICT(email) DO UPDATE SET
                provider = excluded.provider,
                auth_type = excluded.auth_type,
                account_type = excluded.account_type,
                group_name = excluded.group_name,
                imap_server = excluded.imap_server,
                imap_port = excluded.imap_port,
                smtp_server = excluded.smtp_server,
                smtp_port = excluded.smtp_port,
                folders_json = excluded.folders_json,
                secret_ref = excluded.secret_ref,
                status = 'pending',
                legacy_status = '未检测',
                has_aws_code = excluded.has_aws_code,
                remark = excluded.remark,
                error = NULL,
                updated_at = excluded.updated_at
            "#,
            params![
                Uuid::new_v4().to_string(),
                &account.email,
                provider_key(&account.provider),
                auth_key(&account.auth_type),
                &account.account_type,
                &account.group_name,
                &account.imap_server,
                account.imap_port,
                &account.smtp_server,
                account.smtp_port,
                serde_json::to_string(&account.folders).map_err(|err| err.to_string())?,
                if account.has_aws_code { 1 } else { 0 },
                &account.remark,
                secret_ref,
                now
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn account_exists(&self, email: &str) -> Result<bool, String> {
        let conn = self.connection()?;
        let mut stmt = conn
            .prepare("SELECT 1 FROM accounts WHERE lower(email) = lower(?1) LIMIT 1")
            .map_err(|err| err.to_string())?;
        let mut rows = stmt.query(params![email]).map_err(|err| err.to_string())?;
        rows.next().map_err(|err| err.to_string()).map(|row| row.is_some())
    }

    pub fn list_accounts(&self, filter: AccountFilter) -> Result<Vec<AccountRow>, String> {
        let conn = self.connection()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, email, provider, auth_type, account_type, group_name, status, legacy_status,
                        imap_server, imap_port, smtp_server, smtp_port, folders_json, has_aws_code, remark, last_check_at, error
                 FROM accounts ORDER BY updated_at DESC",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let folders_json: String = row.get(12)?;
                Ok(AccountRow {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    provider: parse_provider(&row.get::<_, String>(2)?),
                    auth_type: parse_auth_type(&row.get::<_, String>(3)?),
                    account_type: row.get(4)?,
                    group_name: row.get(5)?,
                    status: row.get(6)?,
                    legacy_status: row.get(7)?,
                    imap_server: row.get(8)?,
                    imap_port: row.get(9)?,
                    smtp_server: row.get(10)?,
                    smtp_port: row.get(11)?,
                    folders: serde_json::from_str(&folders_json).unwrap_or_else(|_| vec!["INBOX".to_string(), "Junk".to_string()]),
                    has_aws_code: row.get::<_, i64>(13)? == 1,
                    remark: row.get(14)?,
                    last_checked_at: row.get(15)?,
                    error: row.get(16)?,
                })
            })
            .map_err(|err| err.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?;

        Ok(rows
            .into_iter()
            .filter(|row| filter.status.as_ref().map(|status| &row.status == status).unwrap_or(true))
            .filter(|row| filter.group_name.as_ref().map(|group| &row.group_name == group).unwrap_or(true))
            .filter(|row| {
                filter
                    .query
                    .as_ref()
                    .map(|query| row.email.contains(query) || row.group_name.contains(query))
                    .unwrap_or(true)
            })
            .collect())
    }

    pub fn update_account(&self, account: AccountUpdate) -> Result<(), String> {
        let conn = self.connection()?;
        conn.execute(
            "UPDATE accounts SET group_name = ?1, folders_json = ?2, updated_at = ?3 WHERE id = ?4",
            params![
                account.group_name,
                serde_json::to_string(&account.folders).map_err(|err| err.to_string())?,
                Utc::now().to_rfc3339(),
                account.id
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn delete_accounts(&self, ids: Vec<String>) -> Result<(), String> {
        let conn = self.connection()?;
        for id in ids {
            conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])
                .map_err(|err| err.to_string())?;
        }
        Ok(())
    }

    pub fn update_account_status(&self, id: &str, status: &str, error: Option<&str>) -> Result<(), String> {
        let conn = self.connection()?;
        let legacy_status = match status {
            "healthy" | "idle" | "polling" => "正常",
            "failed" | "warning" => "异常",
            _ => "未检测",
        };
        conn.execute(
            "UPDATE accounts SET status = ?1, legacy_status = ?2, error = ?3, last_check_at = ?4, updated_at = ?4 WHERE id = ?5",
            params![status, legacy_status, error, Utc::now().to_rfc3339(), id],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn list_rules(&self) -> Result<Vec<ExtractionRule>, String> {
        let conn = self.connection()?;
        let mut stmt = conn
            .prepare("SELECT payload FROM rules ORDER BY priority DESC, name ASC")
            .map_err(|err| err.to_string())?;
        let rules = stmt
            .query_map([], |row| {
                let payload: String = row.get(0)?;
                serde_json::from_str::<ExtractionRule>(&payload)
                    .map_err(|err| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(err)))
            })
            .map_err(|err| err.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?;

        Ok(rules)
    }

    pub fn save_rule(&self, mut rule: ExtractionRule) -> Result<ExtractionRule, String> {
        if rule.id.trim().is_empty() {
            rule.id = Uuid::new_v4().to_string();
        }
        let conn = self.connection()?;
        conn.execute(
            r#"
            INSERT INTO rules (id, name, enabled, priority, payload, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                enabled = excluded.enabled,
                priority = excluded.priority,
                payload = excluded.payload,
                updated_at = excluded.updated_at
            "#,
            params![
                &rule.id,
                &rule.name,
                if rule.enabled { 1 } else { 0 },
                rule.priority,
                serde_json::to_string(&rule).map_err(|err| err.to_string())?,
                Utc::now().to_rfc3339()
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(rule)
    }

    pub fn delete_rule(&self, id: &str) -> Result<(), String> {
        let conn = self.connection()?;
        conn.execute("DELETE FROM rules WHERE id = ?1", params![id])
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn insert_result(
        &self,
        account: &AccountRow,
        result_type: ResultType,
        preview: String,
        sender: String,
        subject: String,
        folder: String,
        rule_name: String,
        secret_ref: String,
    ) -> Result<ExtractionResultRow, String> {
        let row = ExtractionResultRow {
            id: Uuid::new_v4().to_string(),
            account_email: account.email.clone(),
            result_type,
            preview,
            sender,
            subject,
            folder,
            received_at: Utc::now().to_rfc3339(),
            rule_name,
            status: "new".to_string(),
            secret_ref,
        };
        let conn = self.connection()?;
        conn.execute(
            r#"
            INSERT INTO extraction_results
                (id, account_email, result_type, preview, sender, subject, folder, received_at, rule_name, status, secret_ref)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                &row.id,
                &row.account_email,
                result_type_key(&row.result_type),
                &row.preview,
                &row.sender,
                &row.subject,
                &row.folder,
                &row.received_at,
                &row.rule_name,
                &row.status,
                &row.secret_ref
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(row)
    }

    pub fn list_results(&self, filter: ResultFilter) -> Result<Vec<ExtractionResultRow>, String> {
        let conn = self.connection()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, account_email, result_type, preview, sender, subject, folder, received_at, rule_name, status, secret_ref FROM extraction_results ORDER BY received_at DESC",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ExtractionResultRow {
                    id: row.get(0)?,
                    account_email: row.get(1)?,
                    result_type: parse_result_type(&row.get::<_, String>(2)?),
                    preview: row.get(3)?,
                    sender: row.get(4)?,
                    subject: row.get(5)?,
                    folder: row.get(6)?,
                    received_at: row.get(7)?,
                    rule_name: row.get(8)?,
                    status: row.get(9)?,
                    secret_ref: row.get(10)?,
                })
            })
            .map_err(|err| err.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?;

        Ok(rows
            .into_iter()
            .filter(|row| filter.result_type.as_ref().map(|kind| &row.result_type == kind).unwrap_or(true))
            .filter(|row| filter.only_new.map(|only_new| !only_new || row.status == "new").unwrap_or(true))
            .filter(|row| {
                filter
                    .query
                    .as_ref()
                    .map(|query| row.account_email.contains(query) || row.subject.contains(query) || row.sender.contains(query))
                    .unwrap_or(true)
            })
            .collect())
    }

    pub fn find_result(&self, id: &str) -> Result<Option<ExtractionResultRow>, String> {
        Ok(self
            .list_results(ResultFilter {
                result_type: None,
                query: None,
                only_new: None,
            })?
            .into_iter()
            .find(|row| row.id == id))
    }

    fn init(&self) -> Result<(), String> {
        let conn = self.connection()?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                provider TEXT NOT NULL,
                auth_type TEXT NOT NULL,
                account_type TEXT NOT NULL DEFAULT '普通',
                group_name TEXT NOT NULL,
                imap_server TEXT NOT NULL DEFAULT '',
                imap_port INTEGER NOT NULL DEFAULT 993,
                smtp_server TEXT NOT NULL DEFAULT '',
                smtp_port INTEGER NOT NULL DEFAULT 465,
                folders_json TEXT NOT NULL,
                status TEXT NOT NULL,
                legacy_status TEXT NOT NULL DEFAULT '未检测',
                has_aws_code INTEGER NOT NULL DEFAULT 0,
                remark TEXT,
                last_check_at TEXT,
                last_cursor TEXT,
                secret_ref TEXT NOT NULL,
                error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                priority INTEGER NOT NULL,
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS extraction_results (
                id TEXT PRIMARY KEY,
                account_email TEXT NOT NULL,
                result_type TEXT NOT NULL,
                preview TEXT NOT NULL,
                sender TEXT NOT NULL,
                subject TEXT NOT NULL,
                folder TEXT NOT NULL,
                received_at TEXT NOT NULL,
                rule_name TEXT NOT NULL,
                status TEXT NOT NULL,
                secret_ref TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS monitor_jobs (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                status TEXT NOT NULL,
                progress INTEGER NOT NULL,
                detail TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            "#,
        )
        .map_err(|err| err.to_string())?;

        ensure_account_column(&conn, "account_type", "TEXT NOT NULL DEFAULT '普通'")?;
        ensure_account_column(&conn, "imap_server", "TEXT NOT NULL DEFAULT ''")?;
        ensure_account_column(&conn, "imap_port", "INTEGER NOT NULL DEFAULT 993")?;
        ensure_account_column(&conn, "smtp_server", "TEXT NOT NULL DEFAULT ''")?;
        ensure_account_column(&conn, "smtp_port", "INTEGER NOT NULL DEFAULT 465")?;
        ensure_account_column(&conn, "legacy_status", "TEXT NOT NULL DEFAULT '未检测'")?;
        ensure_account_column(&conn, "has_aws_code", "INTEGER NOT NULL DEFAULT 0")?;
        ensure_account_column(&conn, "remark", "TEXT")?;

        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('max_idle_connections', '80')", [])
            .map_err(|err| err.to_string())?;
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('poll_workers', '10')", [])
            .map_err(|err| err.to_string())?;
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('inbox_poll_seconds', '60')", [])
            .map_err(|err| err.to_string())?;
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('junk_poll_seconds', '120')", [])
            .map_err(|err| err.to_string())?;
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('font_size', '13')", [])
            .map_err(|err| err.to_string())?;
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('language', 'zh')", [])
            .map_err(|err| err.to_string())?;

        if self.list_rules()?.is_empty() {
            for rule in default_rules() {
                self.save_rule(rule)?;
            }
        }
        Ok(())
    }

    fn connection(&self) -> Result<Connection, String> {
        Connection::open(&self.db_path).map_err(|err| err.to_string())
    }
}

fn provider_key(provider: &Provider) -> &'static str {
    match provider {
        Provider::Outlook => "outlook",
        Provider::Gmail => "gmail",
        Provider::Qq => "qq",
        Provider::Netease => "netease",
        Provider::Imap => "imap",
    }
}

fn parse_provider(value: &str) -> Provider {
    match value {
        "outlook" => Provider::Outlook,
        "gmail" => Provider::Gmail,
        "qq" => Provider::Qq,
        "netease" => Provider::Netease,
        _ => Provider::Imap,
    }
}

fn auth_key(auth_type: &AuthType) -> &'static str {
    match auth_type {
        AuthType::Password => "password",
        AuthType::Oauth2 => "oauth2",
    }
}

fn parse_auth_type(value: &str) -> AuthType {
    if value == "oauth2" {
        AuthType::Oauth2
    } else {
        AuthType::Password
    }
}

fn result_type_key(result_type: &ResultType) -> &'static str {
    match result_type {
        ResultType::Code => "code",
        ResultType::Link => "link",
    }
}

fn parse_result_type(value: &str) -> ResultType {
    if value == "link" {
        ResultType::Link
    } else {
        ResultType::Code
    }
}

fn ensure_account_column(conn: &Connection, name: &str, definition: &str) -> Result<(), String> {
    let mut stmt = conn.prepare("PRAGMA table_info(accounts)").map_err(|err| err.to_string())?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;

    if !columns.iter().any(|column| column == name) {
        conn.execute(&format!("ALTER TABLE accounts ADD COLUMN {name} {definition}"), [])
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}
