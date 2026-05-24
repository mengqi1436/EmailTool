export type Provider = "outlook" | "gmail" | "qq" | "netease" | "imap";

export type AuthType = "password" | "oauth2";

export type AccountStatus = "healthy" | "pending" | "warning" | "failed" | "idle" | "polling";

export type ResultType = "code" | "link";

export interface ImportedAccount {
  email: string;
  password: string;
  groupName: string;
  provider: Provider;
  authType: AuthType;
  accountType: "普通" | "OAuth2";
  imapServer: string;
  imapPort: number;
  smtpServer: string;
  smtpPort: number;
  clientId?: string;
  refreshToken?: string;
  folders: string[];
  hasAwsCode: boolean;
  remark?: string;
}

export interface ImportError {
  line: number;
  message: string;
  raw: string;
}

export interface ImportResult {
  records: ImportedAccount[];
  errors: ImportError[];
  duplicates: string[];
}

export interface EmailSample {
  sender: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}

export interface ExtractionCandidate {
  type: ResultType;
  value: string;
  preview: string;
  source: "subject" | "body" | "html";
  confidence: number;
}

export interface ExtractionRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  senderIncludes: string[];
  subjectIncludes: string[];
  bodyIncludes: string[];
  excludeKeywords: string[];
  codeRegex: string;
  linkRegex: string;
  linkTextIncludes: string[];
}

export interface RuleTestResult {
  matched: boolean;
  ruleId: string;
  ruleName: string;
  candidates: ExtractionCandidate[];
  reason?: string;
}

export interface AccountRow {
  id: string;
  email: string;
  provider: Provider;
  authType: AuthType;
  accountType: "普通" | "OAuth2";
  groupName: string;
  status: AccountStatus;
  legacyStatus: "未检测" | "正常" | "异常";
  imapServer: string;
  imapPort: number;
  smtpServer: string;
  smtpPort: number;
  folders: string[];
  hasAwsCode: boolean;
  remark?: string;
  lastCheckedAt?: string;
  error?: string;
}

export interface AccountFilter {
  status?: AccountStatus;
  groupName?: string;
  query?: string;
}

export interface AccountUpdate {
  id: string;
  groupName: string;
  folders: string[];
}

export interface VaultStatus {
  isSetup: boolean;
  isUnlocked: boolean;
}

export interface ExtractionResultRow {
  id: string;
  accountEmail: string;
  resultType: ResultType;
  preview: string;
  sender: string;
  subject: string;
  folder: string;
  receivedAt: string;
  ruleName: string;
  status: "new" | "seen" | "expired";
}

export interface ResultFilter {
  resultType?: ResultType;
  query?: string;
  onlyNew?: boolean;
}

export interface MonitorJob {
  id: string;
  label: string;
  status: AccountStatus;
  progress: number;
  detail: string;
}
