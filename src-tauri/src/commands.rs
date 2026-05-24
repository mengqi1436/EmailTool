use crate::accounts::parse_account_import;
use crate::rules::test_rule_against_sample;
use crate::state::AppState;
use crate::types::{
    AccountFilter, AccountRow, AccountUpdate, EmailSample, ExtractionRule, ImportResult, MonitorJob, ResultFilter, RuleTestResult,
    SecretBundle, VaultStatus,
};
use std::collections::HashSet;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn vault_status(state: State<'_, AppState>) -> Result<VaultStatus, String> {
    let vault = state.vault.lock().map_err(|_| "保险库锁被占用".to_string())?;
    Ok(VaultStatus {
        is_setup: vault.is_setup(),
        is_unlocked: vault.is_unlocked(),
    })
}

#[tauri::command]
pub fn vault_setup(state: State<'_, AppState>, password: String) -> Result<bool, String> {
    let mut vault = state.vault.lock().map_err(|_| "保险库锁被占用".to_string())?;
    vault.setup(&password)?;
    Ok(vault.is_setup())
}

#[tauri::command]
pub fn vault_unlock(state: State<'_, AppState>, password: String) -> Result<bool, String> {
    let mut vault = state.vault.lock().map_err(|_| "保险库锁被占用".to_string())?;
    vault.unlock(&password)?;
    Ok(true)
}

#[tauri::command]
pub fn vault_lock(app: AppHandle, state: State<'_, AppState>) -> Result<bool, String> {
    let mut vault = state.vault.lock().map_err(|_| "保险库锁被占用".to_string())?;
    vault.lock();
    app.emit("vault:locked", true).map_err(|err| err.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn accounts_import(state: State<'_, AppState>, payload: String) -> Result<ImportResult, String> {
    let mut result = parse_account_import(&payload);
    if result.records.is_empty() {
        return Ok(result);
    }

    let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
    let mut vault = state.vault.lock().map_err(|_| "保险库锁被占用".to_string())?;
    let mut duplicate_set = result.duplicates.iter().cloned().collect::<HashSet<_>>();
    let mut seen_import = HashSet::new();
    let mut imported_records = Vec::new();

    for account in std::mem::take(&mut result.records) {
        if !seen_import.insert(account.email.clone()) || storage.account_exists(&account.email)? {
            duplicate_set.insert(account.email.clone());
            continue;
        }

        let secret_ref = format!("account:{}", account.email);
        vault.set(
            secret_ref.clone(),
            SecretBundle {
                password: if account.password.is_empty() {
                    None
                } else {
                    Some(account.password.clone())
                },
                client_id: account.client_id.clone(),
                refresh_token: account.refresh_token.clone(),
                result_value: None,
            },
        )?;
        storage.upsert_account(&account, &secret_ref)?;
        imported_records.push(account);
    }

    result.records = imported_records;
    result.duplicates = duplicate_set.into_iter().collect();
    result.duplicates.sort();
    Ok(result)
}

#[tauri::command]
pub fn accounts_list(state: State<'_, AppState>, filter: AccountFilter) -> Result<Vec<AccountRow>, String> {
    let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
    storage.list_accounts(filter)
}

#[tauri::command]
pub fn accounts_update(state: State<'_, AppState>, account: AccountUpdate) -> Result<bool, String> {
    let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
    storage.update_account(account)?;
    Ok(true)
}

#[tauri::command]
pub fn accounts_delete(state: State<'_, AppState>, ids: Vec<String>) -> Result<bool, String> {
    let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
    storage.delete_accounts(ids)?;
    Ok(true)
}

#[tauri::command]
pub fn monitor_start(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<MonitorJob>, String> {
    let accounts = {
        let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
        storage.list_accounts(AccountFilter {
            status: None,
            group_name: None,
            query: None,
        })?
    };
    let jobs = {
        let mut monitor = state.monitor.lock().map_err(|_| "监听器锁被占用".to_string())?;
        monitor.start(&accounts)
    };
    app.emit("monitor:worker-progress", &jobs).map_err(|err| err.to_string())?;
    Ok(jobs)
}

#[tauri::command]
pub fn monitor_stop(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<MonitorJob>, String> {
    let jobs = {
        let mut monitor = state.monitor.lock().map_err(|_| "监听器锁被占用".to_string())?;
        monitor.stop()
    };
    app.emit("monitor:worker-progress", &jobs).map_err(|err| err.to_string())?;
    Ok(jobs)
}

#[tauri::command]
pub fn monitor_refresh_account(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<Vec<MonitorJob>, String> {
    let account = {
        let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
        storage
            .list_accounts(AccountFilter {
                status: None,
                group_name: None,
                query: None,
            })?
            .into_iter()
            .find(|account| account.id == id)
            .ok_or_else(|| "账号不存在".to_string())?
    };
    refresh_one(&app, &state, &account)?;
    let monitor = state.monitor.lock().map_err(|_| "监听器锁被占用".to_string())?;
    Ok(monitor.list())
}

#[tauri::command]
pub fn monitor_refresh_all(app: AppHandle, state: State<'_, AppState>) -> Result<Vec<MonitorJob>, String> {
    let accounts = {
        let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
        storage.list_accounts(AccountFilter {
            status: None,
            group_name: None,
            query: None,
        })?
    };

    for account in &accounts {
        refresh_one(&app, &state, account)?;
    }

    let monitor = state.monitor.lock().map_err(|_| "监听器锁被占用".to_string())?;
    Ok(monitor.list())
}

#[tauri::command]
pub fn rules_list(state: State<'_, AppState>) -> Result<Vec<ExtractionRule>, String> {
    let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
    storage.list_rules()
}

#[tauri::command]
pub fn rules_save(state: State<'_, AppState>, rule: ExtractionRule) -> Result<ExtractionRule, String> {
    let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
    storage.save_rule(rule)
}

#[tauri::command]
pub fn rules_delete(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
    storage.delete_rule(&id)?;
    Ok(true)
}

#[tauri::command]
pub fn rules_test(rule: ExtractionRule, sample_email: EmailSample) -> Result<RuleTestResult, String> {
    Ok(test_rule_against_sample(&rule, &sample_email))
}

#[tauri::command]
pub fn results_list(state: State<'_, AppState>, filter: ResultFilter) -> Result<Vec<crate::types::ExtractionResultRow>, String> {
    let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
    storage.list_results(filter)
}

#[tauri::command]
pub fn result_reveal(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let row = {
        let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
        storage.find_result(&id)?.ok_or_else(|| "结果不存在".to_string())?
    };
    let vault = state.vault.lock().map_err(|_| "保险库锁被占用".to_string())?;
    vault
        .get(&row.secret_ref)?
        .and_then(|bundle| bundle.result_value)
        .ok_or_else(|| "保险库中找不到结果原文".to_string())
}

#[tauri::command]
pub fn result_copy(state: State<'_, AppState>, id: String) -> Result<String, String> {
    result_reveal(state, id)
}

#[tauri::command]
pub fn result_open_link(state: State<'_, AppState>, id: String) -> Result<String, String> {
    let value = result_reveal(state, id)?;
    if value.starts_with("http://") || value.starts_with("https://") {
        Ok(value)
    } else {
        Err("该结果不是认证链接".to_string())
    }
}

fn refresh_one(app: &AppHandle, state: &State<'_, AppState>, account: &AccountRow) -> Result<(), String> {
    {
        let mut monitor = state.monitor.lock().map_err(|_| "监听器锁被占用".to_string())?;
        let job = monitor.mark_refreshing(account);
        app.emit("monitor:worker-progress", job).map_err(|err| err.to_string())?;
    }

    let detail = "真实邮件协议客户端尚未接入，刷新不会生成模拟命中".to_string();
    {
        let storage = state.storage.lock().map_err(|_| "数据库锁被占用".to_string())?;
        storage.update_account_status(&account.id, "warning", Some(&detail))?;
    }
    {
        let mut monitor = state.monitor.lock().map_err(|_| "监听器锁被占用".to_string())?;
        let job = monitor.mark_warning(account, detail);
        app.emit("monitor:account-status", job).map_err(|err| err.to_string())?;
    }
    Ok(())
}
