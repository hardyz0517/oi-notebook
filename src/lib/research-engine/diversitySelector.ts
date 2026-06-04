import type {
  CandidateCluster,
  CandidateRejectReason,
  DiversitySelectionConfig,
  DiversitySelectionResult,
  NormalizedCandidate,
} from "./types";

const clusterKey = (candidate: NormalizedCandidate): string => {
  const titleTerms = candidate.normalizedTitle
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
  return `${candidate.queryPurpose}:${candidate.sourceType}:${titleTerms || candidate.canonical.path}`;
};

const buildClusters = (candidates: NormalizedCandidate[]): CandidateCluster[] => {
  const clusters = new Map<string, NormalizedCandidate[]>();
  for (const candidate of candidates) {
    const key = clusterKey(candidate);
    clusters.set(key, [...(clusters.get(key) ?? []), candidate]);
  }
  return [...clusters.entries()].map(([key, items], index) => ({
    id: `cluster-${index + 1}`,
    key,
    candidateIds: items.map((item) => item.id),
    representativeId: items[0]?.id ?? "",
    hosts: [...new Set(items.map((item) => item.canonical.normalizedHost))],
    sourceTypes: [...new Set(items.map((item) => item.sourceType))],
  }));
};

export const selectDiverseCandidates = (
  candidates: NormalizedCandidate[],
  config: DiversitySelectionConfig,
): DiversitySelectionResult => {
  const selected: NormalizedCandidate[] = [];
  const rejected: Array<{ candidate: NormalizedCandidate; reason: CandidateRejectReason }> = [];
  const decisions: DiversitySelectionResult["decisions"] = [];
  const hostCounts = new Map<string, number>();
  const selectedClusters = new Set<string>();
  const clusters = buildClusters(candidates);
  const clusterByCandidate = new Map<string, string>();
  for (const cluster of clusters) {
    for (const candidateId of cluster.candidateIds) clusterByCandidate.set(candidateId, cluster.id);
  }

  const preferred = [...candidates].sort((left, right) => {
    const leftPreferred = config.preferredSourceTypes.includes(left.sourceType) ? 1 : 0;
    const rightPreferred = config.preferredSourceTypes.includes(right.sourceType) ? 1 : 0;
    return rightPreferred - leftPreferred || (right.rank?.total ?? 0) - (left.rank?.total ?? 0) || left.originalIndex - right.originalIndex;
  });

  for (const candidate of preferred) {
    if (selected.length >= config.maxSelected) {
      rejected.push({ candidate, reason: "diversity_limit" });
      decisions.push({ candidateId: candidate.id, selected: false, reason: "max_selected_reached" });
      continue;
    }
    const host = candidate.canonical.normalizedHost;
    const hostCount = hostCounts.get(host) ?? 0;
    if (hostCount >= config.perHostLimit) {
      rejected.push({ candidate, reason: "excessive_same_host" });
      decisions.push({ candidateId: candidate.id, selected: false, reason: "per_host_limit" });
      continue;
    }
    const candidateCluster = clusterByCandidate.get(candidate.id);
    const alreadyRepresented = candidateCluster ? selectedClusters.has(candidateCluster) : false;
    const isPreferred = config.preferredSourceTypes.includes(candidate.sourceType);
    if (alreadyRepresented && !isPreferred && selectedClusters.size >= config.minClusterRepresentatives) {
      rejected.push({ candidate, reason: "diversity_limit" });
      decisions.push({ candidateId: candidate.id, selected: false, reason: "cluster_already_represented" });
      continue;
    }
    selected.push(candidate);
    hostCounts.set(host, hostCount + 1);
    if (candidateCluster) selectedClusters.add(candidateCluster);
    decisions.push({ candidateId: candidate.id, selected: true, reason: isPreferred ? "preferred_source_selected" : "diverse_candidate_selected" });
  }

  return { selected, rejected, clusters, decisions };
};
