import { extractCandidates, maskSecretPreview, sanitizeLink } from "./extractor";
import type { EmailSample, ExtractionCandidate, ExtractionRule, RuleTestResult } from "./types";

export function chooseBestRule(rules: ExtractionRule[], sample: EmailSample): ExtractionRule | null {
  return [...rules]
    .filter((rule) => testRuleAgainstSample(rule, sample).matched)
    .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name))[0] ?? null;
}

export function testRuleAgainstSample(rule: ExtractionRule, sample: EmailSample): RuleTestResult {
  if (!rule.enabled) {
    return emptyResult(rule, "规则已停用");
  }

  const haystack = normalize([sample.sender, sample.subject, sample.bodyText, sample.bodyHtml ?? ""].join("\n"));
  if (rule.excludeKeywords.some((keyword) => keyword.trim() && haystack.includes(normalize(keyword)))) {
    return emptyResult(rule, "命中排除关键词");
  }
  if (!allIncluded(sample.sender, rule.senderIncludes)) return emptyResult(rule, "发件人不匹配");
  if (!allIncluded(sample.subject, rule.subjectIncludes)) return emptyResult(rule, "标题不匹配");
  if (!allIncluded(`${sample.bodyText}\n${sample.bodyHtml ?? ""}`, rule.bodyIncludes)) return emptyResult(rule, "正文不匹配");

  const candidates = extractByRule(rule, sample);
  return {
    matched: candidates.length > 0,
    ruleId: rule.id,
    ruleName: rule.name,
    candidates,
    reason: candidates.length > 0 ? undefined : "规则条件匹配，但没有提取到结果",
  };
}

function extractByRule(rule: ExtractionRule, sample: EmailSample): ExtractionCandidate[] {
  const candidates: ExtractionCandidate[] = [];
  const seen = new Set<string>();
  const body = `${sample.subject}\n${sample.bodyText}\n${sample.bodyHtml ?? ""}`;

  for (const value of matchAllSafe(body, rule.codeRegex)) {
    const key = `code:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      type: "code",
      value,
      preview: maskSecretPreview(value, "code"),
      source: sample.subject.includes(value) ? "subject" : "body",
      confidence: 100 + rule.priority,
    });
  }

  for (const value of matchAllSafe(body, rule.linkRegex)) {
    const link = sanitizeLink(value);
    const key = `link:${link}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      type: "link",
      value: link,
      preview: maskSecretPreview(link, "link"),
      source: sample.bodyHtml?.includes(value) ? "html" : "body",
      confidence: 92 + rule.priority,
    });
  }

  if (candidates.length === 0) {
    return extractCandidates(sample).map((candidate) => ({
      ...candidate,
      confidence: candidate.confidence + rule.priority,
    }));
  }

  return candidates.sort((left, right) => right.confidence - left.confidence);
}

function allIncluded(value: string, needles: string[]): boolean {
  const normalized = normalize(value);
  return needles.every((needle) => !needle.trim() || normalized.includes(normalize(needle)));
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function matchAllSafe(value: string, pattern: string): string[] {
  if (!pattern.trim()) return [];
  try {
    const regex = new RegExp(pattern, "gi");
    return [...value.matchAll(regex)].map((match) => match[1] ?? match[0]).filter(Boolean);
  } catch {
    return [];
  }
}

function emptyResult(rule: ExtractionRule, reason: string): RuleTestResult {
  return {
    matched: false,
    ruleId: rule.id,
    ruleName: rule.name,
    candidates: [],
    reason,
  };
}
