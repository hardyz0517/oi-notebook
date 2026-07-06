import type {
  OiEvidenceSummaryItem,
  OiProblemPlatform,
  OiSkillPermissionRequest,
  OiSkillReadModel,
  OiSourceRole,
  OiSourceSummary,
} from "@/lib/oi-skills";
import type { EvidenceItem, EvidenceStoreRecord } from "@/lib/research-engine";

export type CreateOiSkillPreviewReadModelInput = {
  problem: {
    title: string;
    problemId: string;
    problemUrl?: string;
  };
  evidenceRecords: EvidenceStoreRecord[];
  permissionRequests: OiSkillPermissionRequest[];
};

const FIXED_PREVIEW_AT = new Date(0).toISOString();
const DETERMINISTIC_PREVIEW_LIMITATION = "deterministic_preview_only";
const NO_COPY_LIMITATION = "do_not_copy_source_text";

const inferPlatform = (problemId: string, url?: string): OiProblemPlatform => {
  const text = `${problemId} ${url ?? ""}`.toLowerCase();

  if (text.includes("luogu") || /^p\d+$/i.test(problemId)) return "luogu";
  if (text.includes("codeforces")) return "codeforces";
  if (text.includes("atcoder")) return "atcoder";
  if (text.includes("cses")) return "cses";

  return "manual";
};

const inferSourceRole = (item: EvidenceItem): OiSourceRole => {
  const text = `${item.url} ${item.title}`.toLowerCase();

  if (item.sourceType === "community" || item.sourceType === "forum") {
    return text.includes("warning") || text.includes("discussion") ? "discussion-warning" : "community-solution";
  }
  if (text.includes("oi-wiki") || text.includes("cp-algorithms")) return "algorithm-reference";
  if (text.includes("editorial") || text.includes("solution") || text.includes("题解")) {
    return item.sourceType === "official" ? "official-editorial" : "community-solution";
  }
  if (item.sourceType === "official" || text.includes("/problem/")) return "problem-statement";

  return "unknown";
};

const itemLimitations = (item: EvidenceItem, role: OiSourceRole): string[] => {
  const limitations = item.warnings.map((warning) => String(warning));
  if (role === "community-solution" || role === "discussion-warning") {
    limitations.push(NO_COPY_LIMITATION);
  }
  return Array.from(new Set(limitations));
};

const toEvidenceSummary = (item: EvidenceItem): OiEvidenceSummaryItem | null => {
  if (!item.canCite || item.evidenceStrength === "none" || item.status === "unusable") {
    return null;
  }

  const role = inferSourceRole(item);
  return {
    evidenceId: item.evidenceId,
    sourceId: item.candidateId,
    role,
    title: item.title,
    excerpt: item.excerptMarkdown,
    citationId: item.evidenceId,
    limitations: itemLimitations(item, role),
  };
};

const toSources = (evidence: OiEvidenceSummaryItem[], records: EvidenceStoreRecord[]): OiSourceSummary[] => {
  const sourceById = new Map<string, OiSourceSummary>();

  for (const item of evidence) {
    const sourceItem = records
      .flatMap((record) => record.packet.evidenceItems)
      .find((candidate) => candidate.candidateId === item.sourceId);

    sourceById.set(item.sourceId, {
      sourceId: item.sourceId,
      role: item.role,
      title: item.title,
      url: sourceItem?.url,
      status: item.limitations.length > 0 ? "degraded" : "usable",
      warning: item.limitations.includes(NO_COPY_LIMITATION) ? NO_COPY_LIMITATION : undefined,
    });
  }

  return Array.from(sourceById.values());
};

export const createOiSkillPreviewReadModel = (
  input: CreateOiSkillPreviewReadModelInput,
): OiSkillReadModel => {
  const invocation = {
    invocationId: `skill:research-problem:${input.problem.problemId}`,
    skillId: "research-problem" as const,
    problemRef: {
      platform: inferPlatform(input.problem.problemId, input.problem.problemUrl),
      problemId: input.problem.problemId,
      title: input.problem.title,
      url: input.problem.problemUrl,
    },
    mode: "preview" as const,
  };
  const evidence = input.evidenceRecords
    .flatMap((record) => record.packet.evidenceItems)
    .map(toEvidenceSummary)
    .filter((item): item is OiEvidenceSummaryItem => item !== null);
  const sources = toSources(evidence, input.evidenceRecords);

  if (evidence.length === 0) {
    return {
      invocation,
      status: "degraded",
      problemRef: invocation.problemRef,
      sources,
      evidence,
      solutionOutline: null,
      permissionRequests: input.permissionRequests,
      traceEvents: [{
        id: `${invocation.invocationId}:no-evidence`,
        type: "skill.evidence.mapped",
        at: FIXED_PREVIEW_AT,
        message: "No citeable evidence was available for the OI skill contract preview.",
      }],
      limitations: ["no_evidence"],
    };
  }

  const hasCommunityEvidence = evidence.some((item) => item.limitations.includes(NO_COPY_LIMITATION));
  const outlineLimitations = hasCommunityEvidence
    ? [DETERMINISTIC_PREVIEW_LIMITATION, NO_COPY_LIMITATION]
    : [DETERMINISTIC_PREVIEW_LIMITATION];

  return {
    invocation,
    status: "completed",
    problemRef: invocation.problemRef,
    sources,
    evidence,
    solutionOutline: {
      status: "preview",
      algorithm: "Evidence-backed solution outline preview is available.",
      proofSketch: "This deterministic preview only summarizes cited evidence relationships.",
      complexity: { time: "unknown", memory: "unknown" },
      implementationNotes: ["Use cited evidence before making solution claims."],
      pitfalls: hasCommunityEvidence ? ["Do not copy community solution wording."] : [],
      citationIds: evidence.map((item) => item.citationId),
      limitations: outlineLimitations,
    },
    permissionRequests: input.permissionRequests,
    traceEvents: [{
      id: `${invocation.invocationId}:evidence-mapped`,
      type: "skill.evidence.mapped",
      at: FIXED_PREVIEW_AT,
      message: "Mapped research evidence into the OI skill contract preview read model.",
    }],
    limitations: outlineLimitations,
  };
};
