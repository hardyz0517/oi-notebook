import type {
  FreshnessRequirement,
  ResearchLanguage,
  ResearchSearchRequest,
  SearchMode,
  SearchPolicyDecision,
  SearchRiskLevel,
  SearchVertical,
} from "./types";

const URL_PATTERN = /https?:\/\/[^\s<>"')]+/i;
const CJK_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;
const LATIN_PATTERN = /[a-z]/i;

const RECENT_PATTERN = /最近|最新|今天|昨日|昨天|现在|当前|刚刚|这几天|近况|动态|新闻|消息|current|latest|recent|today|yesterday|news|breaking/i;
const TRANSLATION_PATTERN = /英语怎么说|英文怎么说|怎么翻译|翻译成|这个词|润色|改写|作文|translate|translation|word meaning|how to say/i;
const OFFLINE_ONLY_PATTERN = /不用联网|不要联网|离线解释|只要离线|凭常识|不要搜索|no web|offline only/i;
const RUMOR_PATTERN = /死了吗|去世了吗|死亡|去世|辟谣|传闻|谣言|被抓|刑事|犯罪|确诊|重病|医疗事故|暴雷|诈骗|破产|逮捕|逝世|died|dead|death|rumou?r|fact.?check|arrested|criminal|medical|bankrupt/i;
const CURRENT_FACT_PATTERN = /价格|汇率|版本|政策|法规|赛事|比分|公司动态|发布会|财报|融资|收购|裁员|price|exchange rate|version|policy|regulation|score|earnings|acquisition|layoff/i;
const OI_PATTERN = /(?:^|\b)(?:P\d{3,6}|CF\d+[A-Z]?|AT_[A-Z0-9_]+)(?:\b|$)|洛谷|题号|题解|复杂度|边界情况|实现坑|常见坑|倍增|最近公共祖先|点分树|树剖|线段树|树状数组|最短路|网络流|动态规划|背包|LCA|WA|TLE|MLE|AC 自动机/i;
const TECH_DOC_PATTERN = /React|useEffect|Vite|Tauri|command|Rust crate|crate API|API 文档|配置|config|TypeScript|JavaScript|Node\.?js|Next\.?js|Vue|Svelte|Cargo|serde|reqwest/i;
const STABLE_EXPLANATION_PATTERN = /是什么|解释|概念|原理|为什么|举例|证明|what is|explain|meaning of/i;

const clampConfidence = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(2))));

const detectLocale = (question: string, hint?: ResearchSearchRequest["locale"]): ResearchLanguage => {
  if (hint === "zh" || hint === "en" || hint === "mixed") return hint;
  const hasCjk = CJK_PATTERN.test(question);
  const hasLatin = LATIN_PATTERN.test(question);
  if (hasCjk && hasLatin) return "mixed";
  if (hasCjk) return "zh";
  return "en";
};

const unique = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
};

const cleanFocusEntity = (value: string): string =>
  value
    .replace(/^(最近|最新|今天|昨天|现在|当前|帮我|请问)\s*/i, "")
    .replace(/\s*(有什么新闻|有什么消息|是什么|怎么写|怎么做|实现坑|常见实现坑|题解|死了吗|去世了吗)$/i, "")
    .trim();

const extractFocusEntities = (question: string, mode: SearchMode): string[] => {
  const url = question.match(URL_PATTERN)?.[0];
  if (url) return [url];

  const problemIds = question.match(/\b(?:P\d{3,6}|CF\d+[A-Z]?|AT_[A-Z0-9_]+)\b/gi) ?? [];
  const latinNames = question.match(/\b[A-Z][A-Za-z0-9.+#-]{1,30}(?:\s+[A-Z][A-Za-z0-9.+#-]{1,30}){0,2}\b/g) ?? [];
  const cjkNames = question.match(/[\u4e00-\u9fff]{2,8}(?=死了吗|去世了吗|死亡|去世|最新|新闻|消息|公司|版本|汇率|价格|实现坑|题解|怎么写|是什么|$)/g) ?? [];
  const oiTerms = question.match(/LCA|点分树|最近公共祖先|倍增|Tauri command|React useEffect|useEffect/gi) ?? [];

  const candidates = unique([...problemIds, ...oiTerms, ...latinNames, ...cjkNames].map(cleanFocusEntity));
  if (candidates.length > 0) return candidates.slice(0, 6);

  if (mode === "news_recent" || mode === "general_web" || mode === "rumor_check") {
    return [question.replace(RECENT_PATTERN, "").replace(CURRENT_FACT_PATTERN, "").trim()].filter(Boolean).slice(0, 1);
  }
  return [];
};

const decision = (
  request: ResearchSearchRequest,
  partial: {
    needSearch: boolean;
    mode: SearchMode;
    risk: SearchRiskLevel;
    freshness: FreshnessRequirement;
    vertical: SearchVertical;
    reason: string;
    guards: string[];
    confidence: number;
  },
): SearchPolicyDecision => {
  const question = request.userQuestion.trim();
  const locale = detectLocale(question, request.locale);
  const focusEntities = extractFocusEntities(question, partial.mode);
  const mustUseEvidence = partial.needSearch && partial.mode !== "no_search";
  return {
    ...partial,
    locale,
    mixedLanguage: locale === "mixed",
    focusEntities,
    confidence: clampConfidence(partial.confidence),
    mustUseEvidence,
    evidenceRequirement: partial.risk === "high" ? "strong" : mustUseEvidence ? "medium" : "none",
    future: {},
  };
};

export const buildSearchPolicyDecision = (request: ResearchSearchRequest): SearchPolicyDecision => {
  const question = request.userQuestion.trim();
  const guards: string[] = [];

  if (!question) {
    return decision(request, {
      needSearch: false,
      mode: "no_search",
      risk: "low",
      freshness: "stable",
      vertical: "no_search",
      reason: "empty_question",
      guards: ["empty_input"],
      confidence: 1,
    });
  }

  if (URL_PATTERN.test(question)) {
    return decision(request, {
      needSearch: true,
      mode: "explicit_url",
      risk: "medium",
      freshness: RECENT_PATTERN.test(question) ? "latest" : "stable",
      vertical: "explicit_url",
      reason: "explicit_url_detected",
      guards: ["explicit_url_highest_priority"],
      confidence: 1,
    });
  }

  const translationLike = TRANSLATION_PATTERN.test(question);
  const offlineOnly = OFFLINE_ONLY_PATTERN.test(question);
  if (translationLike || offlineOnly) {
    guards.push(translationLike ? "translation_or_editing_before_recency" : "offline_only_user_request");
    return decision(request, {
      needSearch: false,
      mode: "no_search",
      risk: "low",
      freshness: "stable",
      vertical: "no_search",
      reason: translationLike ? "translation_editing_or_word_lookup_is_offline" : "user_requested_offline_answer",
      guards,
      confidence: 0.95,
    });
  }

  const rumorLike = RUMOR_PATTERN.test(question);
  if (rumorLike) {
    return decision(request, {
      needSearch: true,
      mode: "rumor_check",
      risk: "high",
      freshness: "current",
      vertical: "news",
      reason: "high_risk_current_claim_requires_strong_evidence",
      guards: ["high_risk_requires_search", "strong_evidence_required"],
      confidence: 0.95,
    });
  }

  const oiLike = OI_PATTERN.test(question);
  if (oiLike) {
    return decision(request, {
      needSearch: true,
      mode: "oi_algorithm",
      risk: "medium",
      freshness: "stable",
      vertical: "oi_algorithm",
      reason: "oi_algorithm_or_problem_discussion",
      guards: ["oi_terms_before_general_web", "short_re_token_requires_word_boundary"],
      confidence: 0.88,
    });
  }

  const docsLike = TECH_DOC_PATTERN.test(question);
  if (docsLike) {
    return decision(request, {
      needSearch: true,
      mode: "docs_technical",
      risk: "medium",
      freshness: "stable",
      vertical: "docs_technical",
      reason: "technical_docs_or_api_reference",
      guards: ["docs_before_recent_general_web"],
      confidence: 0.84,
    });
  }

  const currentLike = RECENT_PATTERN.test(question) || CURRENT_FACT_PATTERN.test(question);
  if (currentLike) {
    const freshness: FreshnessRequirement = /今天|现在|当前|汇率|价格|today|current|exchange rate|price/i.test(question)
      ? "current"
      : /最新|latest|版本|version/i.test(question)
        ? "latest"
        : "recent";
    return decision(request, {
      needSearch: true,
      mode: /新闻|news|动态|announcements?/i.test(question) ? "news_recent" : "general_web",
      risk: "medium",
      freshness,
      vertical: /新闻|news|动态|announcements?/i.test(question) ? "news" : "general_web",
      reason: "time_sensitive_or_current_fact",
      guards: ["recency_terms_after_translation_guard"],
      confidence: 0.86,
    });
  }

  if (STABLE_EXPLANATION_PATTERN.test(question)) {
    return decision(request, {
      needSearch: false,
      mode: "no_search",
      risk: "low",
      freshness: "stable",
      vertical: "no_search",
      reason: "stable_explanation_can_be_answered_offline",
      guards: ["stable_knowledge_default_no_search"],
      confidence: 0.78,
    });
  }

  return decision(request, {
    needSearch: false,
    mode: "no_search",
    risk: "low",
    freshness: "stable",
    vertical: "no_search",
    reason: "no_search_signal_detected",
    guards: ["default_no_search"],
    confidence: 0.68,
  });
};
