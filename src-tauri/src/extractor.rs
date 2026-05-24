use crate::types::{EmailSample, ExtractionCandidate, ResultType};
use regex::Regex;
use std::collections::HashSet;

pub fn extract_candidates(sample: &EmailSample) -> Vec<ExtractionCandidate> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();

    collect_codes(&sample.subject, "subject", 96, &mut seen, &mut candidates);
    collect_codes(&strip_links(&sample.body_text), "body", 84, &mut seen, &mut candidates);
    collect_links(&sample.body_text, "body", 88, &mut seen, &mut candidates);
    collect_html_links(sample.body_html.as_deref().unwrap_or_default(), &mut seen, &mut candidates);

    candidates.sort_by(|left, right| right.confidence.cmp(&left.confidence).then(left.value.cmp(&right.value)));
    candidates
}

pub fn mask_secret_preview(value: &str, result_type: &ResultType) -> String {
    match result_type {
        ResultType::Code => {
            if value.chars().count() <= 4 {
                "*".repeat(value.chars().count())
            } else {
                format!("{}****{}", &value[..2], &value[value.len() - 2..])
            }
        }
        ResultType::Link => url::Url::parse(value)
            .map(|url| format!("{}{}?...", url.origin().unicode_serialization(), url.path()))
            .unwrap_or_else(|_| {
                if value.len() > 18 {
                    format!("{}...", &value[..18])
                } else {
                    value.to_string()
                }
            }),
    }
}

pub fn sanitize_link(value: &str) -> String {
    let trimmed = decode_entities(value).trim_end_matches([')', '.', ',', ';']).to_string();
    let Ok(mut url) = url::Url::parse(&trimmed) else {
        return trimmed;
    };

    let tracking = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
    let pairs = url
        .query_pairs()
        .filter(|(key, _)| !tracking.contains(&key.to_lowercase().as_str()))
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect::<Vec<_>>();
    url.query_pairs_mut().clear().extend_pairs(pairs);
    url.to_string()
}

fn collect_codes(
    text: &str,
    source: &str,
    base_confidence: i32,
    seen: &mut HashSet<String>,
    candidates: &mut Vec<ExtractionCandidate>,
) {
    let regex = Regex::new(r"(?i)(^|[^a-z0-9])([a-z0-9]{4,8}|\d{4,8})([^a-z0-9]|$)").expect("valid code regex");
    for capture in regex.captures_iter(text) {
        let Some(value) = capture.get(2).map(|item| item.as_str()) else {
            continue;
        };
        if !is_likely_code(value) {
            continue;
        }
        let key = format!("code:{}", value.to_lowercase());
        if !seen.insert(key) {
            continue;
        }
        candidates.push(ExtractionCandidate {
            result_type: ResultType::Code,
            value: value.to_string(),
            preview: mask_secret_preview(value, &ResultType::Code),
            source: source.to_string(),
            confidence: base_confidence,
        });
    }
}

fn collect_links(
    text: &str,
    source: &str,
    base_confidence: i32,
    seen: &mut HashSet<String>,
    candidates: &mut Vec<ExtractionCandidate>,
) {
    let regex = Regex::new(r#"https?://[^\s"'<>]+"#).expect("valid link regex");
    for match_item in regex.find_iter(text) {
        push_link(match_item.as_str(), source, base_confidence, seen, candidates);
    }
}

fn collect_html_links(html: &str, seen: &mut HashSet<String>, candidates: &mut Vec<ExtractionCandidate>) {
    let regex = Regex::new(r#"href=["'](https?://[^"']+)["']"#).expect("valid href regex");
    for capture in regex.captures_iter(html) {
        if let Some(value) = capture.get(1).map(|item| item.as_str()) {
            push_link(value, "html", 90, seen, candidates);
        }
    }
}

fn push_link(
    value: &str,
    source: &str,
    confidence: i32,
    seen: &mut HashSet<String>,
    candidates: &mut Vec<ExtractionCandidate>,
) {
    let link = sanitize_link(value);
    let key = format!("link:{link}");
    if !seen.insert(key) {
        return;
    }
    candidates.push(ExtractionCandidate {
        result_type: ResultType::Link,
        preview: mask_secret_preview(&link, &ResultType::Link),
        value: link,
        source: source.to_string(),
        confidence,
    });
}

fn is_likely_code(value: &str) -> bool {
    Regex::new(r"^\d{4,8}$").expect("valid numeric regex").is_match(value)
        || Regex::new(r"(?i)^(?=.*\d)(?=.*[a-z])[a-z0-9]{6,8}$")
            .expect("valid alphanumeric regex")
            .is_match(value)
}

fn strip_links(value: &str) -> String {
    Regex::new(r#"https?://[^\s"'<>]+"#)
        .expect("valid strip regex")
        .replace_all(value, " ")
        .to_string()
}

fn decode_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_code_and_sanitized_link() {
        let sample = EmailSample {
            sender: "AWS".to_string(),
            subject: "Code 839204".to_string(),
            body_text: "Use 839204 at https://example.com/verify?token=abc&utm_source=x".to_string(),
            body_html: None,
        };
        let candidates = extract_candidates(&sample);
        assert!(candidates.iter().any(|item| item.value == "839204"));
        assert!(candidates.iter().any(|item| item.value == "https://example.com/verify?token=abc"));
    }
}
