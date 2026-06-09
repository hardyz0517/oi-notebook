import type { EvidencePortfolioGateStatus } from "./evidencePortfolioGate";
import type { EvidenceQualityAssessment, EvidenceQualityTier } from "./evidenceQuality";
import type { CoverageFacet, ResearchPlanIntent } from "./researchPlanTypes";

export type NewsSynthesisAnswerMode = "normal" | "cautious" | "failed";

export type NewsSynthesisItemConfidence = "high" | "medium" | "low";

export type NewsSynthesisItem = {
  facet: string;
  facetLabel: string;
  eventTitle: string;
  summaryHint: string;
  sources: string[];
  dateSignal?: string;
  confidence: NewsSynthesisItemConfidence;
};

export type NewsSynthesisPlan = {
  answerMode: NewsSynthesisAnswerMode;
  topic: string;
  coveredFacets: string[];
  missingFacets: string[];
  newsItems: NewsSynthesisItem[];
  limitations: string[];
  selectedEvidenceIds: string[];
  selectedEvidenceByFacet: Record<string, string[]>;
  evidenceQualityDistribution: Record<EvidenceQualityTier, number>;
  downgradedEvidenceCount: number;
  backgroundEvidenceCount: number;
  concreteNewsEvidenceCount: number;
  missingEvidenceFacets: string[];
  duplicateEventMergedCount: number;
  synthesisPlanItemCount: number;
  freshEvidenceCount: number;
  staleEvidenceCount: number;
  unknownDateEvidenceCount: number;
  backgroundOnlyCount: number;
  freshnessLimitations: string[];
};

export type NewsSynthesisPlanInput = {
  intent: ResearchPlanIntent;
  topic: string;
  facets: CoverageFacet[];
  gateStatus: EvidencePortfolioGateStatus;
  gateReason?: string;
  assessments: EvidenceQualityAssessment[];
  evidenceQualityDistribution: Record<EvidenceQualityTier, number>;
  downgradedEvidenceCount: number;
  backgroundEvidenceCount: number;
  concreteNewsEvidenceCount: number;
  freshEvidenceCount?: number;
  staleEvidenceCount?: number;
  unknownDateEvidenceCount?: number;
  backgroundOnlyCount?: number;
  freshnessLimitations?: string[];
  candidateShortage?: boolean;
};

const NEWS_INTENTS = new Set<ResearchPlanIntent>(["entity_news", "broad_topic_news", "broad_news_digest"]);

const confidenceFor = (assessment: EvidenceQualityAssessment, sourceCount: number): NewsSynthesisItemConfidence => {
  if (assessment.evidenceQualityTier === "high" && sourceCount >= 2) return "high";
  if (assessment.evidenceQualityTier === "high" || assessment.evidenceQualityTier === "medium") return "medium";
  return "low";
};

const eventTitleFrom = (assessment: EvidenceQualityAssessment): string => {
  const hint = assessment.summaryHint ?? "";
  const firstClause = hint.split(/(?<=[.!?])\s+/)[0]?.trim();
  if (firstClause && firstClause.length <= 140) return firstClause;
  return assessment.eventKey.split(":").slice(1).join(":").replace(/-/g, " ").slice(0, 140) || assessment.facetLabel;
};

const canBeCoreNewsEvidence = (assessment: EvidenceQualityAssessment, newsIntent: boolean): boolean => {
  if (!assessment.hasBodyExcerpt || !assessment.summaryHint) return false;
  if (!newsIntent) return assessment.evidenceQualityTier !== "low";
  if (assessment.freshnessStatus !== "fresh" || !assessment.isRecentEnough) return false;
  if (assessment.evidenceQualityTier !== "high" && assessment.evidenceQualityTier !== "medium") return false;
  if (assessment.sourceRole === "index_page" || assessment.sourceRole === "background_context" || assessment.sourceRole === "weak_candidate") return false;
  if (assessment.sourceRole === "analysis_report") return assessment.hasConcreteEvent && assessment.hasDateSignal;
  return assessment.hasConcreteEvent;
};

const sortAssessments = (items: EvidenceQualityAssessment[]): EvidenceQualityAssessment[] =>
  [...items].sort((left, right) =>
    right.evidenceQualityScore - left.evidenceQualityScore ||
    Number(right.hasDateSignal) - Number(left.hasDateSignal) ||
    Number(right.hasConcreteEvent) - Number(left.hasConcreteEvent),
  );

const facetLabel = (facets: CoverageFacet[], id: string): string =>
  facets.find((facet) => facet.id === id)?.label ?? id;

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

const buildItem = (assessment: EvidenceQualityAssessment, sources: string[]): NewsSynthesisItem => ({
  facet: assessment.facet,
  facetLabel: assessment.facetLabel,
  eventTitle: eventTitleFrom(assessment),
  summaryHint: assessment.summaryHint ?? "",
  sources,
  dateSignal: assessment.dateSignal,
  confidence: confidenceFor(assessment, sources.length),
});

const selectForBroadTopic = (
  input: NewsSynthesisPlanInput,
  eligible: EvidenceQualityAssessment[],
): { items: NewsSynthesisItem[]; selected: string[]; selectedByFacet: Record<string, string[]>; duplicateMerged: number } => {
  const items: NewsSynthesisItem[] = [];
  const selected: string[] = [];
  const selectedByFacet: Record<string, string[]> = {};
  const usedHosts = new Set<string>();
  let duplicateMerged = 0;
  for (const facet of input.facets) {
    const facetCandidates = sortAssessments(eligible.filter((item) => item.facet === facet.id));
    const chosen: EvidenceQualityAssessment[] = [];
    for (const candidate of facetCandidates) {
      if (chosen.length >= 2) break;
      if (chosen.some((item) => item.eventKey === candidate.eventKey)) {
        duplicateMerged += 1;
        continue;
      }
      if (chosen.length > 0 && usedHosts.has(candidate.host) && facetCandidates.some((item) => !usedHosts.has(item.host))) continue;
      chosen.push(candidate);
      usedHosts.add(candidate.host);
    }
    for (const candidate of chosen) {
      const sameEventSources = unique(facetCandidates
        .filter((item) => item.eventKey === candidate.eventKey && item.evidenceId !== candidate.evidenceId)
        .slice(0, 1)
        .map((item) => item.evidenceId));
      const sources = unique([candidate.evidenceId, ...sameEventSources]);
      items.push(buildItem(candidate, sources));
      selected.push(...sources);
      selectedByFacet[facet.id] = unique([...(selectedByFacet[facet.id] ?? []), ...sources]);
    }
  }
  return { items, selected: unique(selected), selectedByFacet, duplicateMerged };
};

const selectForEventList = (
  eligible: EvidenceQualityAssessment[],
  maxItems: number,
): { items: NewsSynthesisItem[]; selected: string[]; selectedByFacet: Record<string, string[]>; duplicateMerged: number } => {
  const sorted = sortAssessments(eligible);
  const items: NewsSynthesisItem[] = [];
  const selected: string[] = [];
  const selectedByFacet: Record<string, string[]> = {};
  const usedEvents = new Set<string>();
  const usedHosts = new Set<string>();
  let duplicateMerged = 0;

  for (const candidate of sorted) {
    if (items.length >= maxItems) break;
    if (usedEvents.has(candidate.eventKey)) {
      duplicateMerged += 1;
      continue;
    }
    if (usedHosts.has(candidate.host) && sorted.some((item) => !usedHosts.has(item.host) && !usedEvents.has(item.eventKey))) continue;
    const sameEventSources = unique(sorted
      .filter((item) => item.eventKey === candidate.eventKey && item.evidenceId !== candidate.evidenceId)
      .slice(0, 2)
      .map((item) => item.evidenceId));
    const sources = unique([candidate.evidenceId, ...sameEventSources]);
    items.push(buildItem(candidate, sources));
    selected.push(...sources);
    selectedByFacet[candidate.facet] = unique([...(selectedByFacet[candidate.facet] ?? []), ...sources]);
    usedEvents.add(candidate.eventKey);
    usedHosts.add(candidate.host);
  }
  return { items, selected: unique(selected), selectedByFacet, duplicateMerged };
};

export const buildNewsSynthesisPlan = (
  input: NewsSynthesisPlanInput,
): NewsSynthesisPlan => {
  const newsIntent = NEWS_INTENTS.has(input.intent);
  const eligible = input.assessments.filter((assessment) => canBeCoreNewsEvidence(assessment, newsIntent));
  const selection = !newsIntent
    ? selectForEventList(eligible, input.intent === "technical_docs" || input.intent === "official_reference" ? 4 : 6)
    : input.intent === "broad_topic_news"
      ? selectForBroadTopic(input, eligible)
      : selectForEventList(eligible, input.intent === "broad_news_digest" ? 8 : 6);
  const answerMode: NewsSynthesisAnswerMode = input.gateStatus === "failed" || (newsIntent && selection.items.length === 0)
    ? "failed"
    : input.gateStatus === "cautious"
      ? "cautious"
      : "normal";
  const coveredFacets = unique(selection.items.map((item) => item.facet));
  const intendedFacetIds = input.facets.map((facet) => facet.id);
  const missingEvidenceFacets = intendedFacetIds.filter((id) => !coveredFacets.includes(id));
  const limitations = [
    input.gateStatus === "failed" ? `evidence_gate_failed:${input.gateReason ?? "insufficient_evidence"}` : undefined,
    input.gateStatus === "cautious" ? "source coverage is limited; answer must be cautious and not claim full coverage" : undefined,
    newsIntent && selection.items.length === 0 ? "no fresh concrete body-excerpt news item survived quality and freshness selection" : undefined,
    input.candidateShortage ? "candidate shortage limited the reading queue" : undefined,
    missingEvidenceFacets.length > 0 ? `missing facet body evidence: ${missingEvidenceFacets.map((id) => facetLabel(input.facets, id)).join(", ")}` : undefined,
    input.backgroundEvidenceCount > 0 ? "background, index, or analysis sources were downgraded and are not treated as concrete latest news items" : undefined,
    ...(input.freshnessLimitations ?? []),
    selection.items.length === 0 && input.gateStatus !== "failed" && !newsIntent ? "no concrete body-excerpt news item survived quality selection" : undefined,
  ].filter((item): item is string => Boolean(item));

  return {
    answerMode,
    topic: input.topic,
    coveredFacets,
    missingFacets: missingEvidenceFacets,
    newsItems: selection.items,
    limitations,
    selectedEvidenceIds: selection.selected,
    selectedEvidenceByFacet: selection.selectedByFacet,
    evidenceQualityDistribution: input.evidenceQualityDistribution,
    downgradedEvidenceCount: input.downgradedEvidenceCount,
    backgroundEvidenceCount: input.backgroundEvidenceCount,
    concreteNewsEvidenceCount: input.concreteNewsEvidenceCount,
    missingEvidenceFacets,
    duplicateEventMergedCount: selection.duplicateMerged,
    synthesisPlanItemCount: selection.items.length,
    freshEvidenceCount: input.freshEvidenceCount ?? selection.selected.length,
    staleEvidenceCount: input.staleEvidenceCount ?? 0,
    unknownDateEvidenceCount: input.unknownDateEvidenceCount ?? 0,
    backgroundOnlyCount: input.backgroundOnlyCount ?? input.backgroundEvidenceCount,
    freshnessLimitations: input.freshnessLimitations ?? [],
  };
};
