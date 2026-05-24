import { describe, expect, it } from "vitest";
import { testRuleAgainstSample, chooseBestRule } from "./rules";
import type { ExtractionRule, EmailSample } from "./types";

const baseSample: EmailSample = {
  sender: "security@example.com",
  subject: "Login approval code 441199",
  bodyText: "Open https://example.com/auth/login?ticket=zz and enter 441199.",
  bodyHtml: '<a href="https://example.com/auth/login?ticket=zz">Approve login</a>',
};

const genericRule: ExtractionRule = {
  id: "generic",
  name: "通用验证码",
  enabled: true,
  priority: 10,
  senderIncludes: [],
  subjectIncludes: [],
  bodyIncludes: [],
  excludeKeywords: [],
  codeRegex: "\\b\\d{6}\\b",
  linkRegex: "https?://[^\\s\"'<>]+",
  linkTextIncludes: [],
};

const exactRule: ExtractionRule = {
  ...genericRule,
  id: "exact",
  name: "登录审批",
  priority: 90,
  subjectIncludes: ["approval"],
  bodyIncludes: ["ticket"],
};

describe("rules", () => {
  it("tests a rule against an email sample and returns extracted candidates", () => {
    const result = testRuleAgainstSample(exactRule, baseSample);

    expect(result.matched).toBe(true);
    expect(result.candidates.map((candidate) => candidate.value)).toContain("441199");
  });

  it("selects the highest priority enabled matching rule", () => {
    const rule = chooseBestRule([genericRule, exactRule], baseSample);

    expect(rule?.id).toBe("exact");
  });

  it("excludes rules with blocked keywords", () => {
    const blocked: ExtractionRule = {
      ...exactRule,
      id: "blocked",
      priority: 100,
      excludeKeywords: ["login approval"],
    };

    expect(chooseBestRule([blocked, genericRule], baseSample)?.id).toBe("generic");
  });
});
