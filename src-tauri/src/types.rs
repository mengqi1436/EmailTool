use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Provider {
    Outlook,
    Gmail,
    Qq,
    Netease,
    Imap,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AuthType {
    Password,
    Oauth2,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ResultType {
    Code,
    Link,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAccount {
    pub email: String,
    pub password: String,
    pub group_name: String,
    pub provider: Provider,
    pub auth_type: AuthType,
    pub account_type: String,
    pub imap_server: String,
    pub imap_port: i64,
    pub smtp_server: String,
    pub smtp_port: i64,
    pub client_id: Option<String>,
    pub refresh_token: Option<String>,
    pub folders: Vec<String>,
    pub has_aws_code: bool,
    pub remark: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportError {
    pub line: usize,
    pub message: String,
    pub raw: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub records: Vec<ImportedAccount>,
    pub errors: Vec<ImportError>,
    pub duplicates: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountFilter {
    pub status: Option<String>,
    pub group_name: Option<String>,
    pub query: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountRow {
    pub id: String,
    pub email: String,
    pub provider: Provider,
    pub auth_type: AuthType,
    pub account_type: String,
    pub group_name: String,
    pub status: String,
    pub legacy_status: String,
    pub imap_server: String,
    pub imap_port: i64,
    pub smtp_server: String,
    pub smtp_port: i64,
    pub folders: Vec<String>,
    pub has_aws_code: bool,
    pub remark: Option<String>,
    pub last_checked_at: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountUpdate {
    pub id: String,
    pub group_name: String,
    pub folders: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub is_setup: bool,
    pub is_unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailSample {
    pub sender: String,
    pub subject: String,
    pub body_text: String,
    pub body_html: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionCandidate {
    pub result_type: ResultType,
    pub value: String,
    pub preview: String,
    pub source: String,
    pub confidence: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub priority: i32,
    pub sender_includes: Vec<String>,
    pub subject_includes: Vec<String>,
    pub body_includes: Vec<String>,
    pub exclude_keywords: Vec<String>,
    pub code_regex: String,
    pub link_regex: String,
    pub link_text_includes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleTestResult {
    pub matched: bool,
    pub rule_id: String,
    pub rule_name: String,
    pub candidates: Vec<ExtractionCandidate>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultFilter {
    pub result_type: Option<ResultType>,
    pub query: Option<String>,
    pub only_new: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionResultRow {
    pub id: String,
    pub account_email: String,
    pub result_type: ResultType,
    pub preview: String,
    pub sender: String,
    pub subject: String,
    pub folder: String,
    pub received_at: String,
    pub rule_name: String,
    pub status: String,
    pub secret_ref: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorJob {
    pub id: String,
    pub label: String,
    pub status: String,
    pub progress: u8,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretBundle {
    pub password: Option<String>,
    pub client_id: Option<String>,
    pub refresh_token: Option<String>,
    pub result_value: Option<String>,
}
