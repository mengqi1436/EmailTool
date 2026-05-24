import type { EmailSample, ExtractionCandidate, ResultType } from "./types";

const CODE_PATTERN = /(?<![a-z0-9])([a-z0-9]{4,8}|\d{4,8})(?![a-z0-9])/gi;
const LINK_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const HREF_PATTERN = /href=["'](https?:\/\/[^"']+)["']/gi;
const TRACKING_PARAMS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]);

export function extractCandidates(sample: EmailSample): ExtractionCandidate[] {
  const seen = new Set<string>();
  const candidates: ExtractionCandidate[] = [];

  collectCodes(sample.subject, "subject", candidates, seen, 96);
  collectCodes(sample.bodyText, "body", candidates, seen, 84);
  collectLinks(sample.bodyText, "body", candidates, seen, 88);
  collectHtmlLinks(sample.bodyHtml ?? "", candidates, seen);

  return candidates.sort((left, right) => right.confidence - left.confidence || left.value.localeCompare(right.value));
}

export function maskSecretPreview(value: string, type: ResultType): string {
  if (type === "code") {
    if (value.length <= 4) return "*".repeat(value.length);
    return `${value.slice(0, 2)}****${value.slice(-2)}`;
  }

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}?...`;
  } catch {
    return value.length > 18 ? `${value.slice(0, 18)}...` : value;
  }
}

export function sanitizeLink(value: string): string {
  const decoded = decodeHtmlEntities(value).replace(/[).,;]+$/g, "");

  try {
    const url = new URL(decoded);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return decoded;
  }
}

function collectCodes(
  value: string,
  source: ExtractionCandidate["source"],
  candidates: ExtractionCandidate[],
  seen: Set<string>,
  baseConfidence: number,
) {
  const searchable = stripLinks(value);
  for (const match of searchable.matchAll(CODE_PATTERN)) {
    const code = match[1];
    if (!isLikelyCode(code)) continue;

    const key = `code:${code.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({
      type: "code",
      value: code,
      preview: maskSecretPreview(code, "code"),
      source,
      confidence: baseConfidence + codeContextBoost(value, match.index ?? 0),
    });
  }
}

function collectLinks(
  value: string,
  source: ExtractionCandidate["source"],
  candidates: ExtractionCandidate[],
  seen: Set<string>,
  baseConfidence: number,
) {
  for (const match of value.matchAll(LINK_PATTERN)) {
    pushLinkCandidate(match[0], source, candidates, seen, baseConfidence);
  }
}

function collectHtmlLinks(html: string, candidates: ExtractionCandidate[], seen: Set<string>) {
  for (const match of html.matchAll(HREF_PATTERN)) {
    const linkText = extractAnchorText(html, match.index ?? 0);
    const boost = /verify|confirm|approve|login|sign|auth|认证|验证|登录/i.test(linkText) ? 10 : 0;
    pushLinkCandidate(match[1], "html", candidates, seen, 90 + boost);
  }
}

function pushLinkCandidate(
  rawValue: string,
  source: ExtractionCandidate["source"],
  candidates: ExtractionCandidate[],
  seen: Set<string>,
  confidence: number,
) {
  const link = sanitizeLink(rawValue);
  const key = `link:${link}`;
  if (seen.has(key)) return;
  seen.add(key);

  candidates.push({
    type: "link",
    value: link,
    preview: maskSecretPreview(link, "link"),
    source,
    confidence,
  });
}

function isLikelyCode(value: string): boolean {
  if (/^\d{4,8}$/.test(value)) return true;
  if (/^(?=.*\d)(?=.*[a-z])[a-z0-9]{6,8}$/i.test(value)) return true;
  return false;
}

function codeContextBoost(text: string, index: number): number {
  const window = text.slice(Math.max(0, index - 24), index + 32).toLowerCase();
  if (/code|验证码|verification|verify|otp|pin/.test(window)) return 8;
  return 0;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function extractAnchorText(html: string, hrefIndex: number): string {
  const close = html.indexOf("</a>", hrefIndex);
  const openEnd = html.indexOf(">", hrefIndex);
  if (close === -1 || openEnd === -1 || close <= openEnd) return "";
  return html.slice(openEnd + 1, close);
}

function stripLinks(value: string): string {
  return value.replace(LINK_PATTERN, " ");
}
