import { accountTypeForAuth, defaultFoldersForProvider, detectAuthType, detectProvider, detectServers, isValidEmail } from "./provider";
import type { ImportedAccount, ImportError, ImportResult } from "./types";

interface CsvRow {
  email: string;
  password: string;
  group?: string;
  client_id?: string;
  refresh_token?: string;
}

export function parseAccountImport(payload: string): ImportResult {
  const text = payload.trim();
  if (!text) {
    return { records: [], errors: [], duplicates: [] };
  }

  const rows = looksLikeCsv(text) ? parseCsv(text) : parseLegacy(text);
  const errors: ImportError[] = [];
  const records: ImportedAccount[] = [];
  const seen = new Map<string, number>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    if (!isValidEmail(row.email)) {
      errors.push({ line: row.line, message: "邮箱地址格式无效", raw: row.raw });
      continue;
    }

    if (!row.password && !row.refreshToken) {
      errors.push({ line: row.line, message: "缺少密码或 refresh_token", raw: row.raw });
      continue;
    }

    const email = row.email.toLowerCase();
    const provider = detectProvider(email);
    const authType = detectAuthType(row.clientId, row.refreshToken);
    const servers = detectServers(email);

    if (seen.has(email)) {
      duplicates.add(email);
    }
    seen.set(email, row.line);

    records.push({
      email,
      password: row.password,
      groupName: row.groupName || "默认分组",
      provider,
      authType,
      accountType: accountTypeForAuth(authType),
      ...servers,
      clientId: row.clientId || undefined,
      refreshToken: row.refreshToken || undefined,
      folders: defaultFoldersForProvider(provider),
      hasAwsCode: false,
    });
  }

  return {
    records,
    errors,
    duplicates: [...duplicates].sort(),
  };
}

function looksLikeCsv(text: string): boolean {
  const firstLine = text.split(/\r?\n/, 1)[0].toLowerCase();
  return firstLine.includes("email") && firstLine.includes(",");
}

interface RawRecord {
  line: number;
  raw: string;
  email: string;
  password: string;
  groupName?: string;
  clientId?: string;
  refreshToken?: string;
}

function parseLegacy(text: string): RawRecord[] {
  return text
    .split(/\r?\n|\$/)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter((item) => item.raw.length > 0)
    .map(({ raw, line }) => {
      const [email = "", password = "", clientId = "", refreshToken = ""] = raw.split("----").map((part) => part.trim());
      return { line, raw, email, password, clientId, refreshToken };
    });
}

function parseCsv(text: string): RawRecord[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const header = splitCsvLine(lines[0]).map((item) => item.trim().toLowerCase());

  return lines.slice(1).map((raw, index) => {
    const values = splitCsvLine(raw);
    const row = header.reduce<CsvRow>((acc, key, keyIndex) => {
      const normalized = key.trim().toLowerCase();
      if (["email", "password", "group", "client_id", "refresh_token"].includes(normalized)) {
        acc[normalized as keyof CsvRow] = values[keyIndex]?.trim() ?? "";
      }
      return acc;
    }, { email: "", password: "" });

    return {
      line: index + 2,
      raw,
      email: row.email ?? "",
      password: row.password ?? "",
      groupName: row.group ?? "",
      clientId: row.client_id ?? "",
      refreshToken: row.refresh_token ?? "",
    };
  });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  result.push(current);
  return result;
}
