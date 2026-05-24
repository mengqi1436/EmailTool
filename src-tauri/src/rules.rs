use crate::extractor::{extract_candidates, mask_secret_preview, sanitize_link};
use crate::types::{EmailSample, ExtractionCandidate, ExtractionRule, ResultType, RuleTestResult};
use regex::Regex;

pub fn choose_best_rule(rules: &[ExtractionRule], sample: &EmailSample) -> Option<ExtractionRule> {
    let mut matches = rules
        .iter()
        .filter(|rule| test_rule_against_sample(rule, sample).matched)
        .cloned()
        .collect::<Vec<_>>();
    matches.sort_by(|left, right| right.priority.cmp(&left.priority).then(left.name.cmp(&right.name)));
    matches.into_iter().next()
}

pub fn test_rule_against_sample(rule: &ExtractionRule, sample: &EmailSample) -> RuleTestResult {
    if !rule.enabled {
        return empty(rule, "规则已停用");
    }

    let combined = normalize(&format!(
        "{}\n{}\n{}\n{}",
        sample.sender,
        sample.subject,
        sample.body_text,
        sample.body_html.clone().unwrap_or_default()
    ));

    if rule
        .exclude_keywords
        .iter()
        .any(|keyword| !keyword.trim().is_empty() && combined.contains(&normalize(keyword)))
    {
        return empty(rule, "命中排除关键词");
    }
    if !all_included(&sample.sender, &rule.sender_includes) {
        return empty(rule, "发件人不匹配");
    }
    if !all_included(&sample.subject, &rule.subject_includes) {
        return empty(rule, "标题不匹配");
    }
    if !all_included(&format!("{}\n{}", sample.body_text, sample.body_html.clone().unwrap_or_default()), &rule.body_includes) {
        return empty(rule, "正文不匹配");
    }

    let candidates = extract_by_rule(rule, sample);
    RuleTestResult {
        matched: !candidates.is_empty(),
        rule_id: rule.id.clone(),
        rule_name: rule.name.clone(),
        reason: if candidates.is_empty() {
            Some("规则条件匹配，但没有提取到结果".to_string())
        } else {
            None
        },
        candidates,
    }
}

pub fn default_rules() -> Vec<ExtractionRule> {
    vec![ExtractionRule {
        id: "default-generic".to_string(),
        name: "通用验证码和认证链接".to_string(),
        enabled: true,
        priority: 10,
        sender_includes: vec![],
        subject_includes: vec![],
        body_includes: vec![],
        exclude_keywords: vec![],
        code_regex: r"\b\d{4,8}\b".to_string(),
        link_regex: r#"https?://[^\s"'<>]+"#.to_string(),
        link_text_includes: vec!["verify".to_string(), "confirm".to_string(), "验证".to_string(), "登录".to_string()],
    }]
}

fn extract_by_rule(rule: &ExtractionRule, sample: &EmailSample) -> Vec<ExtractionCandidate> {
    let body = format!("{}\n{}\n{}", sample.subject, sample.body_text, sample.body_html.clone().unwrap_or_default());
    let mut candidates = Vec::new();

    for value in match_all_safe(&body, &rule.code_regex) {
        candidates.push(ExtractionCandidate {
            result_type: ResultType::Code,
            preview: mask_secret_preview(&value, &ResultType::Code),
            value,
            source: "body".to_string(),
            confidence: 100 + rule.priority,
        });
    }

    for value in match_all_safe(&body, &rule.link_regex) {
        let link = sanitize_link(&value);
        candidates.push(ExtractionCandidate {
            result_type: ResultType::Link,
            preview: mask_secret_preview(&link, &ResultType::Link),
            value: link,
            source: "body".to_string(),
            confidence: 92 + rule.priority,
        });
    }

    if candidates.is_empty() {
        extract_candidates(sample)
            .into_iter()
            .map(|mut candidate| {
                candidate.confidence += rule.priority;
                candidate
            })
            .collect()
    } else {
        candidates.sort_by(|left, right| right.confidence.cmp(&left.confidence));
        candidates.dedup_by(|left, right| left.result_type == right.result_type && left.value == right.value);
        candidates
    }
}

fn match_all_safe(value: &str, pattern: &str) -> Vec<String> {
    if pattern.trim().is_empty() {
        return vec![];
    }
    let Ok(regex) = Regex::new(pattern) else {
        return vec![];
    };
    regex
        .captures_iter(value)
        .filter_map(|capture| capture.get(1).or_else(|| capture.get(0)).map(|item| item.as_str().to_string()))
        .collect()
}

fn all_included(value: &str, needles: &[String]) -> bool {
    let normalized = normalize(value);
    needles
        .iter()
        .all(|needle| needle.trim().is_empty() || normalized.contains(&normalize(needle)))
}

fn normalize(value: &str) -> String {
    value.to_lowercase().trim().to_string()
}

fn empty(rule: &ExtractionRule, reason: &str) -> RuleTestResult {
    RuleTestResult {
        matched: false,
        rule_id: rule.id.clone(),
        rule_name: rule.name.clone(),
        candidates: vec![],
        reason: Some(reason.to_string()),
    }
}
