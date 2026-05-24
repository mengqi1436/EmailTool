import type { AuthType, Provider } from "./types";

const OUTLOOK_DOMAINS = ["outlook.", "hotmail.", "live.", "msn.com"];

const SERVER_MAP: Record<string, { imapServer: string; smtpServer: string; smtpPort?: number }> = {
  "outlook.com": { imapServer: "imap-mail.outlook.com", smtpServer: "smtp-mail.outlook.com" },
  "hotmail.com": { imapServer: "imap-mail.outlook.com", smtpServer: "smtp-mail.outlook.com" },
  "live.com": { imapServer: "imap-mail.outlook.com", smtpServer: "smtp-mail.outlook.com" },
  "gmail.com": { imapServer: "imap.gmail.com", smtpServer: "smtp.gmail.com" },
  "qq.com": { imapServer: "imap.qq.com", smtpServer: "smtp.qq.com" },
  "163.com": { imapServer: "imap.163.com", smtpServer: "smtp.163.com" },
  "126.com": { imapServer: "imap.126.com", smtpServer: "smtp.126.com" },
  "sina.com": { imapServer: "imap.sina.com", smtpServer: "smtp.sina.com" },
  "yahoo.com": { imapServer: "imap.mail.yahoo.com", smtpServer: "smtp.mail.yahoo.com" },
};

export function detectProvider(email: string): Provider {
  const domain = email.split("@").pop()?.toLowerCase() ?? "";

  if (OUTLOOK_DOMAINS.some((item) => domain === item || domain.startsWith(item))) {
    return "outlook";
  }
  if (domain === "gmail.com") return "gmail";
  if (domain === "qq.com") return "qq";
  if (["163.com", "126.com", "yeah.net"].includes(domain)) return "netease";

  return "imap";
}

export function detectAuthType(clientId?: string, refreshToken?: string): AuthType {
  return clientId?.trim() && refreshToken?.trim() ? "oauth2" : "password";
}

export function accountTypeForAuth(authType: AuthType): "普通" | "OAuth2" {
  return authType === "oauth2" ? "OAuth2" : "普通";
}

export function detectServers(email: string) {
  const domain = email.split("@").pop()?.toLowerCase() ?? "";
  const server = SERVER_MAP[domain] ?? {
    imapServer: `imap.${domain}`,
    smtpServer: `smtp.${domain}`,
  };

  return {
    imapServer: server.imapServer,
    imapPort: 993,
    smtpServer: server.smtpServer,
    smtpPort: server.smtpPort ?? 465,
  };
}

export function defaultFoldersForProvider(provider: Provider): string[] {
  if (provider === "gmail") return ["INBOX", "[Gmail]/Spam"];
  if (provider === "netease") return ["INBOX", "垃圾邮件"];
  if (provider === "qq") return ["INBOX", "Junk"];
  return ["INBOX", "Junk"];
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
