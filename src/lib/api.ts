import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  AccountFilter,
  AccountRow,
  AccountUpdate,
  EmailSample,
  ExtractionResultRow,
  ExtractionRule,
  ImportResult,
  MonitorJob,
  ResultFilter,
  RuleTestResult,
  VaultStatus,
} from "./types";

const DESKTOP_RUNTIME_MESSAGE = "真实邮箱数据功能需要在 Tauri 桌面端运行，请使用 npm run tauri dev 或桌面安装包启动。";

export class DesktopRuntimeError extends Error {
  constructor() {
    super(DESKTOP_RUNTIME_MESSAGE);
    this.name = "DesktopRuntimeError";
  }
}

export const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    throw new DesktopRuntimeError();
  }

  return invoke<T>(command, args);
}

export const api = {
  vaultStatus(): Promise<VaultStatus> {
    return invokeDesktop("vault_status");
  },

  vaultSetup(password: string): Promise<boolean> {
    return invokeDesktop("vault_setup", { password });
  },

  vaultUnlock(password: string): Promise<boolean> {
    return invokeDesktop("vault_unlock", { password });
  },

  vaultLock(): Promise<boolean> {
    return invokeDesktop("vault_lock");
  },

  importAccounts(payload: string): Promise<ImportResult> {
    return invokeDesktop("accounts_import", { payload });
  },

  listAccounts(filter: AccountFilter = {}): Promise<AccountRow[]> {
    return invokeDesktop("accounts_list", { filter });
  },

  updateAccount(account: AccountUpdate): Promise<boolean> {
    return invokeDesktop("accounts_update", { account });
  },

  deleteAccounts(ids: string[]): Promise<boolean> {
    return invokeDesktop("accounts_delete", { ids });
  },

  monitorStart(): Promise<MonitorJob[]> {
    return invokeDesktop("monitor_start");
  },

  monitorStop(): Promise<MonitorJob[]> {
    return invokeDesktop("monitor_stop");
  },

  refreshAll(): Promise<MonitorJob[]> {
    return invokeDesktop("monitor_refresh_all");
  },

  refreshAccount(id: string): Promise<MonitorJob[]> {
    return invokeDesktop("monitor_refresh_account", { id });
  },

  listRules(): Promise<ExtractionRule[]> {
    return invokeDesktop("rules_list");
  },

  saveRule(rule: ExtractionRule): Promise<ExtractionRule> {
    return invokeDesktop("rules_save", { rule });
  },

  deleteRule(id: string): Promise<boolean> {
    return invokeDesktop("rules_delete", { id });
  },

  testRule(rule: ExtractionRule, sampleEmail: EmailSample): Promise<RuleTestResult> {
    return invokeDesktop("rules_test", { rule, sampleEmail });
  },

  listResults(filter: ResultFilter = {}): Promise<ExtractionResultRow[]> {
    return invokeDesktop("results_list", { filter });
  },

  revealResult(id: string): Promise<string> {
    return invokeDesktop("result_reveal", { id });
  },

  async copyResult(id: string): Promise<string> {
    return invokeDesktop("result_copy", { id });
  },

  async openResult(id: string): Promise<string> {
    const url = await invokeDesktop<string>("result_open_link", { id });
    await openUrl(url);
    return url;
  },
};
