use crate::types::{AccountRow, MonitorJob};
use std::collections::HashMap;

pub struct MonitorRuntime {
    running: bool,
    jobs: HashMap<String, MonitorJob>,
}

impl MonitorRuntime {
    pub fn new() -> Self {
        Self {
            running: false,
            jobs: HashMap::new(),
        }
    }

    pub fn start(&mut self, accounts: &[AccountRow]) -> Vec<MonitorJob> {
        self.running = true;
        self.jobs.clear();
        for account in accounts {
            self.jobs.insert(
                account.id.clone(),
                MonitorJob {
                    id: account.id.clone(),
                    label: account.email.clone(),
                    status: if account.provider == crate::types::Provider::Outlook {
                        "polling".to_string()
                    } else {
                        "idle".to_string()
                    },
                    progress: 0,
                    detail: "等待新认证邮件".to_string(),
                },
            );
        }
        self.list()
    }

    pub fn stop(&mut self) -> Vec<MonitorJob> {
        self.running = false;
        for job in self.jobs.values_mut() {
            job.status = "pending".to_string();
            job.detail = "监听已停止".to_string();
            job.progress = 0;
        }
        self.list()
    }

    pub fn mark_refreshing(&mut self, account: &AccountRow) -> MonitorJob {
        let job = MonitorJob {
            id: account.id.clone(),
            label: account.email.clone(),
            status: "polling".to_string(),
            progress: 50,
            detail: "正在扫描收件箱和垃圾箱".to_string(),
        };
        self.jobs.insert(account.id.clone(), job.clone());
        job
    }

    pub fn mark_ready(&mut self, account: &AccountRow, detail: String) -> MonitorJob {
        let job = MonitorJob {
            id: account.id.clone(),
            label: account.email.clone(),
            status: if self.running { "idle".to_string() } else { "pending".to_string() },
            progress: 100,
            detail,
        };
        self.jobs.insert(account.id.clone(), job.clone());
        job
    }

    pub fn mark_warning(&mut self, account: &AccountRow, detail: String) -> MonitorJob {
        let job = MonitorJob {
            id: account.id.clone(),
            label: account.email.clone(),
            status: "warning".to_string(),
            progress: 100,
            detail,
        };
        self.jobs.insert(account.id.clone(), job.clone());
        job
    }

    pub fn list(&self) -> Vec<MonitorJob> {
        let mut jobs = self.jobs.values().cloned().collect::<Vec<_>>();
        jobs.sort_by(|left, right| left.label.cmp(&right.label));
        jobs
    }
}
