import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Activity,
  Archive,
  Bell,
  Check,
  Clipboard,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Filter,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Lock,
  MailCheck,
  MoreHorizontal,
  Moon,
  Monitor,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Square,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, isTauriRuntime } from "./lib/api";
import { cn } from "./lib/cn";
import { parseAccountImport } from "./lib/importer";
import type {
  AccountRow,
  EmailSample,
  ExtractionResultRow,
  ExtractionRule,
  ImportResult,
  MonitorJob,
  ResultType,
  RuleTestResult,
  VaultStatus,
} from "./lib/types";

type View = "task" | "accounts" | "rules" | "history" | "settings";
type ThemePreference = "system" | "dark" | "light";
type ResolvedTheme = "dark" | "light";

const emptyRule: ExtractionRule = {
  id: "",
  name: "新提取规则",
  enabled: true,
  priority: 50,
  senderIncludes: [],
  subjectIncludes: [],
  bodyIncludes: [],
  excludeKeywords: [],
  codeRegex: "\\b\\d{4,8}\\b",
  linkRegex: "https?://[^\\s\"'<>]+",
  linkTextIncludes: [],
};

const sampleEmail: EmailSample = {
  sender: "security@example.com",
  subject: "Login approval code 441199",
  bodyText: "Open https://example.com/auth/login?ticket=zz and enter 441199.",
  bodyHtml: '<a href="https://example.com/auth/login?ticket=zz">Approve login</a>',
};

const initialVaultStatus: VaultStatus = {
  isSetup: false,
  isUnlocked: false,
};

function getInitialThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  const savedTheme = window.localStorage.getItem("email-manager-theme");
  if (savedTheme === "system" || savedTheme === "dark" || savedTheme === "light") {
    return savedTheme;
  }

  return "system";
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
}

export default function App() {
  const [view, setView] = useState<View>("task");
  const [themePreference, setThemePreference] = useState<ThemePreference>(getInitialThemePreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);
  const [unlocked, setUnlocked] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus>(initialVaultStatus);
  const [vaultStatusLoaded, setVaultStatusLoaded] = useState(false);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [results, setResults] = useState<ExtractionResultRow[]>([]);
  const [rules, setRules] = useState<ExtractionRule[]>([]);
  const [jobs, setJobs] = useState<MonitorJob[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ExtractionRule>(emptyRule);
  const [busy, setBusy] = useState(false);
  const desktopRuntime = isTauriRuntime();
  const selectedResult = results.find((result) => result.id === selectedResultId) ?? results[0] ?? null;
  const resolvedTheme = themePreference === "system" ? systemTheme : themePreference;

  async function reload() {
    if (!desktopRuntime) {
      setAccounts([]);
      setRules([]);
      setResults([]);
      setJobs([]);
      setSelectedResultId(null);
      return;
    }

    const [nextAccounts, nextRules, nextResults, nextJobs] = await Promise.all([
      api.listAccounts({}),
      api.listRules(),
      api.listResults({}),
      api.monitorStart(),
    ]);
    setAccounts(nextAccounts);
    setRules(nextRules);
    setResults(nextResults);
    setJobs(nextJobs);
    setSelectedResultId((current) => current ?? nextResults[0]?.id ?? null);
  }

  useEffect(() => {
    reload().catch(console.error);
  }, [desktopRuntime]);

  useEffect(() => {
    let cancelled = false;

    async function loadVaultStatus() {
      if (!desktopRuntime) {
        setVaultStatus(initialVaultStatus);
        setUnlocked(false);
        setVaultStatusLoaded(true);
        return;
      }

      setVaultStatusLoaded(false);
      try {
        const status = await api.vaultStatus();
        if (cancelled) return;
        setVaultStatus(status);
        setUnlocked(status.isUnlocked);
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setVaultStatus(initialVaultStatus);
        setUnlocked(false);
      } finally {
        if (!cancelled) {
          setVaultStatusLoaded(true);
        }
      }
    }

    void loadVaultStatus();
    return () => {
      cancelled = true;
    };
  }, [desktopRuntime]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!media) return undefined;

    const updateSystemTheme = () => setSystemTheme(media.matches ? "light" : "dark");
    updateSystemTheme();
    media.addEventListener("change", updateSystemTheme);
    return () => media.removeEventListener("change", updateSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themePreference = themePreference;
    document.documentElement.style.colorScheme = resolvedTheme;
    window.localStorage.setItem("email-manager-theme", themePreference);
  }, [resolvedTheme, themePreference]);

  async function refreshAll() {
    setBusy(true);
    try {
      const nextJobs = await api.refreshAll();
      setJobs(nextJobs);
      setResults(await api.listResults({}));
      setAccounts(await api.listAccounts({}));
    } finally {
      setBusy(false);
    }
  }

  async function toggleMonitor(next: boolean) {
    setJobs(next ? await api.monitorStart() : await api.monitorStop());
  }

  async function saveRule(rule: ExtractionRule) {
    const saved = await api.saveRule(rule);
    setRules(await api.listRules());
    setEditingRule(saved);
    setRuleOpen(false);
  }

  return (
    <div className="app-frame">
      <RuntimeRequiredDialog open={!desktopRuntime} />
      <VaultDialog
        open={desktopRuntime && vaultStatusLoaded && !unlocked}
        isSetup={vaultStatus.isSetup}
        onUnlock={async (password) => {
          const ok = await api.vaultUnlock(password);
          setUnlocked(ok);
          setVaultStatus({ isSetup: true, isUnlocked: ok });
          return ok;
        }}
        onSetup={async (password) => {
          const ok = await api.vaultSetup(password);
          setUnlocked(ok);
          setVaultStatus({ isSetup: ok, isUnlocked: ok });
          return ok;
        }}
      />
      <ImportAccountsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={async (payload) => {
          const result = await api.importAccounts(payload);
          setAccounts(await api.listAccounts({}));
          return result;
        }}
      />
      <RuleEditorDialog
        open={ruleOpen}
        onOpenChange={setRuleOpen}
        rule={editingRule}
        onSave={saveRule}
      />

      <aside className="rail" aria-label="主导航">
        <div className="brand-mark">
          <MailCheck size={22} />
        </div>
        <NavButton active={view === "task"} label="任务中心" icon={<LayoutDashboard />} onClick={() => setView("task")} />
        <NavButton active={view === "accounts"} label="账号" icon={<Inbox />} onClick={() => setView("accounts")} />
        <NavButton active={view === "rules"} label="规则" icon={<ShieldCheck />} onClick={() => setView("rules")} />
        <NavButton active={view === "history"} label="历史" icon={<Archive />} onClick={() => setView("history")} />
        <div className="rail-spacer" />
        <NavButton active={view === "settings"} label="设置" icon={<Settings />} onClick={() => setView("settings")} />
        <button
          className="icon-button subtle"
          aria-label="锁定保险库"
          title="锁定保险库"
          onClick={() =>
            api.vaultLock().then(() => {
              setUnlocked(false);
              setVaultStatus((current) => ({ ...current, isSetup: true, isUnlocked: false }));
            })
          }
        >
          <Lock size={18} />
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Email Auth Manager</p>
            <h1>{viewTitle(view)}</h1>
          </div>
          <div className="topbar-actions">
            <ThemeControl preference={themePreference} resolvedTheme={resolvedTheme} onChange={setThemePreference} />
            <StatusSummary accounts={accounts} results={results} />
            <button className="toolbar-button" onClick={() => setImportOpen(true)}>
              <Plus size={17} />
              导入账号
            </button>
            <button className="toolbar-button primary" onClick={refreshAll} disabled={busy}>
              <RefreshCw size={17} className={cn(busy && "spin")} />
              立即刷新
            </button>
          </div>
        </header>

        {view === "task" && (
          <TaskCenter
            accounts={accounts}
            results={results}
            jobs={jobs}
            selectedResult={selectedResult}
            onSelectResult={(id) => setSelectedResultId(id)}
            onRefreshAll={refreshAll}
            onToggleMonitor={toggleMonitor}
          />
        )}
        {view === "accounts" && <AccountsPage accounts={accounts} onRefreshAccount={(id) => api.refreshAccount(id).then(setJobs)} />}
        {view === "rules" && (
          <RulesPage
            rules={rules}
            onCreate={() => {
              setEditingRule(emptyRule);
              setRuleOpen(true);
            }}
            onEdit={(rule) => {
              setEditingRule(rule);
              setRuleOpen(true);
            }}
            onDelete={async (id) => {
              await api.deleteRule(id);
              setRules(await api.listRules());
            }}
          />
        )}
        {view === "history" && <HistoryPage results={results} onSelect={setSelectedResultId} />}
        {view === "settings" && <SettingsPage jobs={jobs} runtime={desktopRuntime ? "Tauri Desktop" : "需要 Tauri 桌面运行时"} />}
      </main>
    </div>
  );
}

function viewTitle(view: View) {
  return {
    task: "任务中心",
    accounts: "账号管理",
    rules: "提取规则",
    history: "命中历史",
    settings: "运行设置",
  }[view];
}

function NavButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button className={cn("nav-button", active && "active")} aria-label={label} title={label} onClick={onClick}>
      {icon}
    </button>
  );
}

function ThemeControl({
  preference,
  resolvedTheme,
  onChange,
}: {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  onChange: (preference: ThemePreference) => void;
}) {
  const options: Array<{ value: ThemePreference; label: string; icon: React.ReactNode; title: string }> = [
    { value: "system", label: "系统", icon: <Monitor size={15} />, title: `跟随系统：当前${resolvedTheme === "dark" ? "暗色" : "亮色"}` },
    { value: "light", label: "亮色", icon: <Sun size={15} />, title: "固定亮色主题" },
    { value: "dark", label: "暗色", icon: <Moon size={15} />, title: "固定暗色主题" },
  ];

  return (
    <div className="theme-segment" role="group" aria-label="主题模式">
      {options.map((option) => (
        <button
          key={option.value}
          className={cn("theme-option", preference === option.value && "active")}
          type="button"
          aria-pressed={preference === option.value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function StatusSummary({ accounts, results }: { accounts: AccountRow[]; results: ExtractionResultRow[] }) {
  const healthy = accounts.filter((account) => ["idle", "polling", "healthy"].includes(account.status)).length;
  const fresh = results.filter((result) => result.status === "new").length;
  return (
    <div className="status-summary">
      <span>
        <Activity size={15} /> {healthy}/{accounts.length}
      </span>
      <span>
        <Bell size={15} /> {fresh}
      </span>
    </div>
  );
}

function TaskCenter({
  accounts,
  results,
  jobs,
  selectedResult,
  onSelectResult,
  onRefreshAll,
  onToggleMonitor,
}: {
  accounts: AccountRow[];
  results: ExtractionResultRow[];
  jobs: MonitorJob[];
  selectedResult: ExtractionResultRow | null;
  onSelectResult: (id: string) => void;
  onRefreshAll: () => void;
  onToggleMonitor: (running: boolean) => void;
}) {
  const stats = [
    { label: "账号", value: accounts.length, detail: "100-500 规模优化", tone: "neutral" },
    { label: "新命中", value: results.filter((result) => result.status === "new").length, detail: "验证码 / 认证链接", tone: "good" },
    { label: "异常", value: accounts.filter((account) => ["warning", "failed"].includes(account.status)).length, detail: "需要处理", tone: "warn" },
  ];

  return (
    <section className="task-grid">
      <div className="primary-column">
        <div className="run-strip">
          <div>
            <p className="eyebrow">Monitor</p>
            <strong>IDLE 优先，轮询回退</strong>
          </div>
          <div className="run-actions">
            <button className="icon-text-button" onClick={() => onToggleMonitor(true)}>
              <Play size={16} /> 启动
            </button>
            <button className="icon-text-button" onClick={() => onToggleMonitor(false)}>
              <Square size={16} /> 停止
            </button>
            <button className="icon-text-button strong" onClick={onRefreshAll}>
              <RefreshCw size={16} /> 刷新
            </button>
          </div>
        </div>

        <div className="stat-row">
          {stats.map((stat) => (
            <div className={cn("metric", stat.tone)} key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </div>
          ))}
        </div>

        <div className="panel results-stream">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Live Results</p>
              <h2>实时结果流</h2>
            </div>
            <button className="icon-button" aria-label="筛选结果" title="筛选结果">
              <Filter size={17} />
            </button>
          </div>
          <div className="result-list">
            {results.length > 0 ? (
              results.map((result) => (
                <ResultItem
                  key={result.id}
                  result={result}
                  selected={selectedResult?.id === result.id}
                  onClick={() => onSelectResult(result.id)}
                />
              ))
            ) : (
              <EmptyState
                icon={<Bell size={22} />}
                title="等待真实命中"
                description="演示结果已移除。启动桌面端并导入账号后，这里会显示验证码和认证链接。"
              />
            )}
          </div>
        </div>

        <div className="job-grid">
          {jobs.length > 0 ? (
            jobs.map((job) => (
              <div className="job-tile" key={job.id}>
                <div className="job-top">
                  <span>{job.label}</span>
                  <StatusPill status={job.status} />
                </div>
                <div className="progress-track">
                  <span style={{ width: `${job.progress}%` }} />
                </div>
                <p>{job.detail}</p>
              </div>
            ))
          ) : (
            <EmptyState
              icon={<Activity size={22} />}
              title="暂无 worker 活动"
              description="监听启动后会显示 IDLE 连接、轮询 worker 和失败退避状态。"
              compact
            />
          )}
        </div>
      </div>

      <ResultDetail result={selectedResult} />
    </section>
  );
}

function ResultItem({ result, selected, onClick }: { result: ExtractionResultRow; selected: boolean; onClick: () => void }) {
  return (
    <button className={cn("result-item", selected && "selected")} onClick={onClick}>
      <div className="result-kind">{result.resultType === "code" ? <KeyRound size={16} /> : <ExternalLink size={16} />}</div>
      <div className="result-main">
        <div className="result-row">
          <strong>{result.preview}</strong>
          <time>{formatTime(result.receivedAt)}</time>
        </div>
        <p>{result.subject}</p>
        <small>
          {result.accountEmail} · {result.folder} · {result.ruleName}
        </small>
      </div>
    </button>
  );
}

function ResultDetail({ result }: { result: ExtractionResultRow | null }) {
  const [revealed, setRevealed] = useState("");

  useEffect(() => {
    setRevealed("");
  }, [result?.id]);

  if (!result) {
    return (
      <aside className="panel detail-panel empty">
        <Database size={32} />
        <p>暂无命中结果</p>
      </aside>
    );
  }

  return (
    <aside className="panel detail-panel">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Inspector</p>
          <h2>结果详情</h2>
        </div>
        <StatusPill status={result.status} />
      </div>
      <div className="secret-box">
        <span>{result.resultType === "code" ? "验证码" : "认证链接"}</span>
        <strong>{revealed || result.preview}</strong>
      </div>
      <dl className="meta-list">
        <div>
          <dt>账号</dt>
          <dd>{result.accountEmail}</dd>
        </div>
        <div>
          <dt>发件人</dt>
          <dd>{result.sender}</dd>
        </div>
        <div>
          <dt>标题</dt>
          <dd>{result.subject}</dd>
        </div>
        <div>
          <dt>规则</dt>
          <dd>{result.ruleName}</dd>
        </div>
      </dl>
      <div className="detail-actions">
        <button className="toolbar-button" onClick={() => api.revealResult(result.id).then(setRevealed)}>
          <Search size={16} /> 显示
        </button>
        <button className="toolbar-button" onClick={() => api.copyResult(result.id).then(setRevealed)}>
          <Copy size={16} /> 复制
        </button>
        <button className="toolbar-button primary" disabled={result.resultType !== "link"} onClick={() => api.openResult(result.id).then(setRevealed)}>
          <ExternalLink size={16} /> 打开
        </button>
      </div>
    </aside>
  );
}

function AccountsPage({ accounts, onRefreshAccount }: { accounts: AccountRow[]; onRefreshAccount: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(
    () => accounts.filter((account) => `${account.email} ${account.groupName} ${account.status}`.includes(query)),
    [accounts, query],
  );
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 8,
  });

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Accounts</p>
          <h2>账号队列</h2>
        </div>
        <label className="search-box">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索账号、分组或状态" />
        </label>
      </div>
      <div className="table-header accounts">
        <span>邮箱</span>
        <span>Provider</span>
        <span>文件夹</span>
        <span>状态</span>
        <span>操作</span>
      </div>
      <div className="virtual-table" ref={parentRef}>
        {filtered.length > 0 ? (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const account = filtered[item.index];
              return (
                <div
                  className="table-row accounts"
                  key={account.id}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <div>
                    <strong>{account.email}</strong>
                    <small>{account.groupName}</small>
                  </div>
                  <span>{account.provider}</span>
                  <span>{account.folders.join(", ")}</span>
                  <StatusPill status={account.status} />
                  <button className="icon-button" aria-label={`刷新 ${account.email}`} title="刷新账号" onClick={() => onRefreshAccount(account.id)}>
                    <RefreshCw size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Inbox size={22} />}
            title={accounts.length > 0 ? "没有匹配账号" : "暂无真实账号"}
            description={accounts.length > 0 ? "调整搜索关键词后再查看。" : "通过批量导入添加邮箱，导入后才会建立监听任务。"}
          />
        )}
      </div>
    </section>
  );
}

function RulesPage({
  rules,
  onCreate,
  onEdit,
  onDelete,
}: {
  rules: ExtractionRule[];
  onCreate: () => void;
  onEdit: (rule: ExtractionRule) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Rules</p>
          <h2>规则编辑器</h2>
        </div>
        <button className="toolbar-button primary" onClick={onCreate}>
          <Plus size={16} /> 新建规则
        </button>
      </div>
      <div className="rule-grid">
        {rules.length > 0 ? (
          rules.map((rule) => (
            <article className="rule-card" key={rule.id}>
              <div className="rule-card-head">
                <div>
                  <strong>{rule.name}</strong>
                  <small>Priority {rule.priority}</small>
                </div>
                <StatusPill status={rule.enabled ? "healthy" : "pending"} />
              </div>
              <p>{rule.subjectIncludes.concat(rule.senderIncludes, rule.bodyIncludes).filter(Boolean).join(" · ") || "泛用匹配"}</p>
              <div className="rule-actions">
                <button className="icon-text-button" onClick={() => onEdit(rule)}>
                  <FileText size={15} /> 编辑
                </button>
                <button className="icon-button danger" aria-label="删除规则" title="删除规则" onClick={() => onDelete(rule.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))
        ) : (
          <EmptyState
            icon={<ShieldCheck size={22} />}
            title="暂无提取规则"
            description="创建规则后，监听结果会按优先级提取验证码或认证链接。"
          />
        )}
      </div>
    </section>
  );
}

function HistoryPage({ results, onSelect }: { results: ExtractionResultRow[]; onSelect: (id: string) => void }) {
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">History</p>
          <h2>命中历史</h2>
        </div>
      </div>
      <div className="history-list">
        {results.length > 0 ? (
          results.map((result) => (
            <button className="history-row" key={result.id} onClick={() => onSelect(result.id)}>
              <span>{result.resultType}</span>
              <strong>{result.preview}</strong>
              <small>{result.accountEmail}</small>
              <time>{formatTime(result.receivedAt)}</time>
            </button>
          ))
        ) : (
          <EmptyState
            icon={<Archive size={22} />}
            title="暂无历史记录"
            description="真实邮件命中后会写入本地索引，原文仍保存在保险库。"
          />
        )}
      </div>
    </section>
  );
}

function SettingsPage({ jobs, runtime }: { jobs: MonitorJob[]; runtime: string }) {
  return (
    <section className="settings-grid">
      <div className="panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Runtime</p>
            <h2>运行参数</h2>
          </div>
        </div>
        <div className="settings-list">
          <SettingLine label="运行时" value={runtime} />
          <SettingLine label="活跃 IDLE 上限" value="80" />
          <SettingLine label="轮询 worker" value="10" />
          <SettingLine label="收件箱轮询" value="60s" />
          <SettingLine label="垃圾箱轮询" value="120s" />
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading compact">
          <div>
            <p className="eyebrow">Workers</p>
            <h2>队列状态</h2>
          </div>
        </div>
        <div className="settings-list">
          {jobs.length > 0 ? (
            jobs.map((job) => (
              <SettingLine key={job.id} label={job.label} value={job.detail} />
            ))
          ) : (
            <EmptyState
              icon={<Activity size={22} />}
              title="队列未启动"
              description="启动监听后，这里会显示 worker 状态和最近错误。"
              compact
            />
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyState({
  icon,
  title,
  description,
  compact = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("empty-state", compact && "compact")}>
      <div className="empty-state-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function SettingLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RuntimeRequiredDialog({ open }: { open: boolean }) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card runtime-dialog">
          <div className="vault-header">
            <div className="dialog-icon vault-icon">
              <Monitor size={23} />
            </div>
            <div className="vault-title-block">
              <p className="dialog-kicker">Desktop Runtime</p>
              <Dialog.Title>需要桌面运行时</Dialog.Title>
              <Dialog.Description>
                演示数据已移除。账号、监听、规则、结果和保险库操作现在只连接本机 Tauri 后端。
              </Dialog.Description>
            </div>
          </div>
          <div className="runtime-command">
            <span>开发启动</span>
            <strong>npm run tauri dev</strong>
          </div>
          <p className="runtime-note">浏览器预览只保留界面结构，不再模拟真实邮箱数据。</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function VaultDialog({
  open,
  isSetup,
  onUnlock,
  onSetup,
}: {
  open: boolean;
  isSetup: boolean;
  onUnlock: (password: string) => Promise<boolean>;
  onSetup: (password: string) => Promise<boolean>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pendingAction, setPendingAction] = useState<"setup" | "unlock" | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError("");
      setPendingAction(null);
    }
  }, [open]);

  async function runVaultAction(action: "setup" | "unlock", handler: (password: string) => Promise<boolean>) {
    const nextPassword = password.trim();
    if (nextPassword.length < 6) {
      setError("主密码至少需要 6 位");
      return;
    }

    setPendingAction(action);
    setError("");
    try {
      const ok = await handler(nextPassword);
      if (!ok) {
        setError("操作未完成，请确认主密码后重试");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card vault-dialog">
          <div className="vault-header">
            <div className="dialog-icon vault-icon">
              <Lock size={23} />
            </div>
            <div className="vault-title-block">
              <p className="dialog-kicker">Local Secure Vault</p>
              <Dialog.Title>{isSetup ? "解锁本地保险库" : "初始化本地保险库"}</Dialog.Title>
              <Dialog.Description>
                {isSetup
                  ? "请输入主密码解锁本机保险库。邮箱凭据、refresh token、验证码和认证链接原文只在本机加密保存。"
                  : "首次使用需要设置主密码。初始化后再次进入只允许解锁，不会重复创建保险库。"}
              </Dialog.Description>
            </div>
          </div>
          <div className="vault-body">
            <label className="field vault-field">
              <span>主密码</span>
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !pendingAction) {
                    void runVaultAction(isSetup ? "unlock" : "setup", isSetup ? onUnlock : onSetup);
                  }
                }}
                aria-invalid={Boolean(error)}
                autoFocus
              />
            </label>
            {error && <p className="form-error">{error}</p>}
          </div>
          <div className="vault-actions single">
            {isSetup ? (
              <button
                className={cn("toolbar-button primary", pendingAction === "unlock" && "loading")}
                disabled={Boolean(pendingAction)}
                aria-busy={pendingAction === "unlock"}
                onClick={() => void runVaultAction("unlock", onUnlock)}
              >
                <KeyRound size={16} /> {pendingAction === "unlock" ? "解锁中" : "解锁"}
              </button>
            ) : (
              <button
                className={cn("toolbar-button primary", pendingAction === "setup" && "loading")}
                disabled={Boolean(pendingAction)}
                aria-busy={pendingAction === "setup"}
                onClick={() => void runVaultAction("setup", onSetup)}
              >
                <ShieldCheck size={16} /> {pendingAction === "setup" ? "初始化中" : "初始化"}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ImportAccountsDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (payload: string) => Promise<ImportResult>;
}) {
  const [payload, setPayload] = useState("");
  const preview = useMemo(() => parseAccountImport(payload), [payload]);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card import-dialog">
          <Dialog.Title>批量导入账号</Dialog.Title>
          <Dialog.Description>兼容 email----password----client_id----refresh_token，也支持 CSV 表头。</Dialog.Description>
          <textarea
            className="import-textarea"
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            placeholder="user@qq.com----授权码&#10;user@outlook.com----pass----client_id----refresh_token"
          />
          <div className="import-preview">
            <span>{preview.records.length} 条有效</span>
            <span>{preview.duplicates.length} 条重复</span>
            <span>{preview.errors.length} 条错误</span>
          </div>
          {preview.errors[0] && <p className="form-error">第 {preview.errors[0].line} 行：{preview.errors[0].message}</p>}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="toolbar-button">取消</button>
            </Dialog.Close>
            <button
              className="toolbar-button primary"
              onClick={async () => {
                await onImport(payload);
                onOpenChange(false);
                setPayload("");
              }}
            >
              <Clipboard size={16} /> 导入
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RuleEditorDialog({
  open,
  onOpenChange,
  rule,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: ExtractionRule;
  onSave: (rule: ExtractionRule) => Promise<void>;
}) {
  const [draft, setDraft] = useState(rule);
  const [testResult, setTestResult] = useState<RuleTestResult | null>(null);

  useEffect(() => {
    setDraft(rule);
    setTestResult(null);
  }, [rule, open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card rule-dialog">
          <Dialog.Title>规则编辑器</Dialog.Title>
          <div className="rule-form-grid">
            <label className="field">
              <span>名称</span>
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label className="field">
              <span>优先级</span>
              <input
                type="number"
                value={draft.priority}
                onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}
              />
            </label>
            <label className="field">
              <span>发件人关键词</span>
              <input value={draft.senderIncludes.join(",")} onChange={(event) => setDraft({ ...draft, senderIncludes: splitTags(event.target.value) })} />
            </label>
            <label className="field">
              <span>标题关键词</span>
              <input value={draft.subjectIncludes.join(",")} onChange={(event) => setDraft({ ...draft, subjectIncludes: splitTags(event.target.value) })} />
            </label>
            <label className="field wide">
              <span>验证码正则</span>
              <input value={draft.codeRegex} onChange={(event) => setDraft({ ...draft, codeRegex: event.target.value })} />
            </label>
            <label className="field wide">
              <span>链接正则</span>
              <input value={draft.linkRegex} onChange={(event) => setDraft({ ...draft, linkRegex: event.target.value })} />
            </label>
            <div className="switch-line">
              <span>启用规则</span>
              <Switch.Root className="switch" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}>
                <Switch.Thumb className="switch-thumb" />
              </Switch.Root>
            </div>
          </div>
          <div className="rule-test-box">
            <button className="icon-text-button" onClick={() => api.testRule(draft, sampleEmail).then(setTestResult)}>
              <Check size={15} /> 测试样例
            </button>
            {testResult && (
              <span>
                {testResult.matched ? "命中" : "未命中"} · {testResult.candidates.map((candidate) => candidate.preview).join(", ") || testResult.reason}
              </span>
            )}
          </div>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="toolbar-button">取消</button>
            </Dialog.Close>
            <button className="toolbar-button primary" onClick={() => onSave(draft)}>
              <Save size={16} /> 保存
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className={cn("status-pill", status)}>{statusLabel(status)}</span>;
}

function statusLabel(status: string) {
  return (
    {
      healthy: "正常",
      idle: "监听",
      polling: "轮询",
      pending: "等待",
      warning: "警告",
      failed: "失败",
      new: "新",
      seen: "已看",
      expired: "过期",
    }[status] ?? status
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
