use crate::types::{AuthType, ImportError, ImportResult, ImportedAccount, Provider};
use regex::Regex;
use std::collections::HashSet;

pub fn parse_account_import(payload: &str) -> ImportResult {
    let text = payload.trim();
    if text.is_empty() {
        return ImportResult {
            records: vec![],
            errors: vec![],
            duplicates: vec![],
        };
    }

    let raw_records = if looks_like_csv(text) {
        parse_csv(text)
    } else {
        parse_legacy(text)
    };

    let mut records = Vec::new();
    let mut errors = Vec::new();
    let mut seen = HashSet::new();
    let mut duplicates = HashSet::new();

    for row in raw_records {
        if !is_valid_email(&row.email) {
            errors.push(ImportError {
                line: row.line,
                message: "邮箱地址格式无效".to_string(),
                raw: row.raw,
            });
            continue;
        }

        if row.password.is_empty() && row.refresh_token.is_none() {
            errors.push(ImportError {
                line: row.line,
                message: "缺少密码或 refresh_token".to_string(),
                raw: row.raw,
            });
            continue;
        }

        let email = row.email.to_lowercase();
        if !seen.insert(email.clone()) {
            duplicates.insert(email.clone());
        }

        let provider = detect_provider(&email);
        let auth_type = if row.client_id.is_some() && row.refresh_token.is_some() {
            AuthType::Oauth2
        } else {
            AuthType::Password
        };
        let (imap_server, smtp_server) = detect_servers(&email);
        let account_type = match &auth_type {
            AuthType::Oauth2 => "OAuth2",
            AuthType::Password => "普通",
        };

        records.push(ImportedAccount {
            email,
            password: row.password,
            group_name: row.group_name.unwrap_or_else(|| "默认分组".to_string()),
            provider: provider.clone(),
            auth_type,
            account_type: account_type.to_string(),
            imap_server,
            imap_port: 993,
            smtp_server,
            smtp_port: 465,
            client_id: row.client_id,
            refresh_token: row.refresh_token,
            folders: default_folders(&provider),
            has_aws_code: false,
            remark: None,
        });
    }

    let mut duplicates = duplicates.into_iter().collect::<Vec<_>>();
    duplicates.sort();

    ImportResult {
        records,
        errors,
        duplicates,
    }
}

pub fn detect_provider(email: &str) -> Provider {
    let domain = email.split('@').last().unwrap_or("").to_lowercase();
    if domain.starts_with("outlook.") || domain.starts_with("hotmail.") || domain.starts_with("live.") || domain == "msn.com" {
        Provider::Outlook
    } else if domain == "gmail.com" {
        Provider::Gmail
    } else if domain == "qq.com" {
        Provider::Qq
    } else if matches!(domain.as_str(), "163.com" | "126.com" | "yeah.net") {
        Provider::Netease
    } else {
        Provider::Imap
    }
}

pub fn default_folders(provider: &Provider) -> Vec<String> {
    match provider {
        Provider::Gmail => vec!["INBOX".to_string(), "[Gmail]/Spam".to_string()],
        Provider::Netease => vec!["INBOX".to_string(), "垃圾邮件".to_string()],
        Provider::Qq | Provider::Outlook | Provider::Imap => vec!["INBOX".to_string(), "Junk".to_string()],
    }
}

pub fn detect_servers(email: &str) -> (String, String) {
    let domain = email.split('@').last().unwrap_or("").to_lowercase();
    match domain.as_str() {
        "outlook.com" | "hotmail.com" | "live.com" => ("imap-mail.outlook.com".to_string(), "smtp-mail.outlook.com".to_string()),
        "gmail.com" => ("imap.gmail.com".to_string(), "smtp.gmail.com".to_string()),
        "qq.com" => ("imap.qq.com".to_string(), "smtp.qq.com".to_string()),
        "163.com" => ("imap.163.com".to_string(), "smtp.163.com".to_string()),
        "126.com" => ("imap.126.com".to_string(), "smtp.126.com".to_string()),
        "sina.com" => ("imap.sina.com".to_string(), "smtp.sina.com".to_string()),
        "yahoo.com" => ("imap.mail.yahoo.com".to_string(), "smtp.mail.yahoo.com".to_string()),
        _ => (format!("imap.{domain}"), format!("smtp.{domain}")),
    }
}

fn looks_like_csv(text: &str) -> bool {
    text.lines()
        .next()
        .map(|line| line.to_lowercase().contains("email") && line.contains(','))
        .unwrap_or(false)
}

fn parse_legacy(text: &str) -> Vec<RawAccount> {
    text.split(|ch| ch == '\n' || ch == '$')
        .enumerate()
        .filter_map(|(index, raw)| {
            let raw = raw.trim();
            if raw.is_empty() {
                return None;
            }
            let parts = raw.split("----").map(str::trim).collect::<Vec<_>>();
            Some(RawAccount {
                line: index + 1,
                raw: raw.to_string(),
                email: parts.get(0).unwrap_or(&"").to_string(),
                password: parts.get(1).unwrap_or(&"").to_string(),
                group_name: None,
                client_id: non_empty(parts.get(2).copied()),
                refresh_token: non_empty(parts.get(3).copied()),
            })
        })
        .collect()
}

fn parse_csv(text: &str) -> Vec<RawAccount> {
    let lines = text.lines().filter(|line| !line.trim().is_empty()).collect::<Vec<_>>();
    if lines.is_empty() {
        return vec![];
    }

    let header = split_csv_line(lines[0])
        .into_iter()
        .map(|part| part.trim().to_lowercase())
        .collect::<Vec<_>>();

    lines
        .into_iter()
        .skip(1)
        .enumerate()
        .map(|(index, raw)| {
            let values = split_csv_line(raw);
            let value = |name: &str| -> String {
                header
                    .iter()
                    .position(|key| key == name)
                    .and_then(|position| values.get(position))
                    .map(|value| value.trim().to_string())
                    .unwrap_or_default()
            };
            let group_name = value("group");
            let client_id = value("client_id");
            let refresh_token = value("refresh_token");

            RawAccount {
                line: index + 2,
                raw: raw.to_string(),
                email: value("email"),
                password: value("password"),
                group_name: non_empty_owned(group_name),
                client_id: non_empty_owned(client_id),
                refresh_token: non_empty_owned(refresh_token),
            }
        })
        .collect()
}

fn split_csv_line(line: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '"' if chars.peek() == Some(&'"') => {
                current.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => {
                result.push(current);
                current = String::new();
            }
            _ => current.push(ch),
        }
    }
    result.push(current);
    result
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn non_empty_owned(value: String) -> Option<String> {
    if value.trim().is_empty() {
        None
    } else {
        Some(value.trim().to_string())
    }
}

fn is_valid_email(value: &str) -> bool {
    let regex = Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$").expect("valid email regex");
    regex.is_match(value.trim())
}

struct RawAccount {
    line: usize,
    raw: String,
    email: String,
    password: String,
    group_name: Option<String>,
    client_id: Option<String>,
    refresh_token: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_legacy_oauth_record() {
        let result = parse_account_import("user@outlook.com----pass----cid----refresh");
        assert_eq!(result.records.len(), 1);
        assert_eq!(result.records[0].provider, Provider::Outlook);
        assert_eq!(result.records[0].auth_type, AuthType::Oauth2);
    }

    #[test]
    fn reports_invalid_email() {
        let result = parse_account_import("broken----pass");
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].message, "邮箱地址格式无效");
    }
}
