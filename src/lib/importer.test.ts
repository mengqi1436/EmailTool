import { describe, expect, it } from "vitest";
import { parseAccountImport } from "./importer";

describe("parseAccountImport", () => {
  it("parses legacy newline and dollar separated account records", () => {
    const result = parseAccountImport(
      "one@qq.com----app-pass$two@outlook.com----pass----client-id----refresh-token",
    );

    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      email: "one@qq.com",
      provider: "qq",
      authType: "password",
      password: "app-pass",
    });
    expect(result.records[1]).toMatchObject({
      email: "two@outlook.com",
      provider: "outlook",
      authType: "oauth2",
      accountType: "OAuth2",
      imapServer: "imap-mail.outlook.com",
      smtpServer: "smtp-mail.outlook.com",
      clientId: "client-id",
      refreshToken: "refresh-token",
    });
    expect(result.errors).toEqual([]);
  });

  it("parses CSV rows and reports duplicates without dropping the first record", () => {
    const result = parseAccountImport(
      "email,password,group,client_id,refresh_token\nsame@gmail.com,p1,默认分组,,\nsame@gmail.com,p2,备用,,",
    );

    expect(result.records).toHaveLength(2);
    expect(result.duplicates).toEqual(["same@gmail.com"]);
    expect(result.records[0].groupName).toBe("默认分组");
    expect(result.records[1].groupName).toBe("备用");
  });

  it("keeps original project provider server defaults", () => {
    const result = parseAccountImport("mail@126.com----secret\nuser@yahoo.com----secret");

    expect(result.records[0]).toMatchObject({
      provider: "netease",
      imapServer: "imap.126.com",
      smtpServer: "smtp.126.com",
      folders: ["INBOX", "垃圾邮件"],
    });
    expect(result.records[1]).toMatchObject({
      provider: "imap",
      imapServer: "imap.mail.yahoo.com",
      smtpServer: "smtp.mail.yahoo.com",
    });
  });

  it("returns line-scoped errors for malformed records", () => {
    const result = parseAccountImport("not-an-email----x\nvalid@163.com----secret");

    expect(result.records).toHaveLength(1);
    expect(result.errors).toEqual([
      {
        line: 1,
        message: "邮箱地址格式无效",
        raw: "not-an-email----x",
      },
    ]);
  });
});
