import { useMemo } from "react";

import type {
  PrepareLuoguSubmissionNoteResult,
  PreviewLuoguSubmission,
  PreviewLuoguSubmissionsResult,
  WriteLuoguPreparedNoteResult,
} from "@/lib/api";
import {
  getLuoguSubmissionCandidateReason,
  getLuoguSubmissionCandidateState,
  isLuoguProblemIdAllowedByRules,
  type LuoguSubmissionCandidateState,
} from "@/components/settings/pages/luoguImportDomain";
import type { LuoguImportRules } from "@/components/settings/pages/luoguImportRules";

export interface LuoguScanResultStats {
  total: number;
  candidateCount: number;
  skippedCount: number;
  acCount: number;
  nonAcCount: number;
  oldSubmissionCount: number;
  sameProblemOldAcCount: number;
}

export interface LuoguImportControllerInput {
  luoguPreviewResult: PreviewLuoguSubmissionsResult | null;
  luoguImportRules: LuoguImportRules;
  selectedLuoguSubmissionIds: Set<string>;
  skippedLuoguSubmissionIds: Set<string>;
  luoguPreparedNotesById: Record<string, PrepareLuoguSubmissionNoteResult>;
  luoguWriteResultsById: Record<string, WriteLuoguPreparedNoteResult>;
  reviewSelectedLuoguSubmissionIds: Set<string>;
  currentlyPreparingLuoguId: string | null;
  activeLuoguPreparedPreviewId: string | null;
}

export interface LuoguImportController {
  luoguSubmissionCandidateStates: Record<string, LuoguSubmissionCandidateState>;
  luoguCurrentCandidateCount: number;
  luoguScanResultStats: LuoguScanResultStats;
  luoguSelectableSubmissionIds: string[];
  displayedLuoguPreviewSubmissions: PreviewLuoguSubmission[];
  selectedLuoguSelectableCount: number;
  areAllLuoguSelectableSubmissionsSelected: boolean;
  isLuoguSelectableSelectionMixed: boolean;
  selectedLuoguImportCount: number;
  preparedLuoguNotes: PrepareLuoguSubmissionNoteResult[];
  writableLuoguPreparedNotes: PrepareLuoguSubmissionNoteResult[];
  hasReusableLuoguPreparedPreview: (submissionId: string) => boolean;
  selectedLuoguPreviewSubmissions: PreviewLuoguSubmission[];
  luoguPrepareQueueSubmissions: PreviewLuoguSubmission[];
  luoguReusablePreviewCount: number;
  luoguReadyPreviewSubmissions: PreviewLuoguSubmission[];
  currentlyPreparingLuoguSubmission: PreviewLuoguSubmission | null;
  activeLuoguPreparedPreviewCandidate: PrepareLuoguSubmissionNoteResult | undefined;
  activeLuoguPreparedPreview: PrepareLuoguSubmissionNoteResult | null;
}

function isReusablePreparedLuoguPreview(prepared: PrepareLuoguSubmissionNoteResult | undefined): boolean {
  return Boolean(
    prepared &&
      !prepared.skipped &&
      prepared.markdown.trim() !== "" &&
      prepared.suggestedRelativePath.trim() !== "",
  );
}

function isReadyPreparedLuoguPreview(prepared: PrepareLuoguSubmissionNoteResult | undefined): boolean {
  return Boolean(
    prepared &&
      !prepared.skipped &&
      prepared.aiStatus !== "failed" &&
      prepared.markdown.trim() !== "" &&
      prepared.suggestedRelativePath.trim() !== "",
  );
}

export function useLuoguImportController(input: LuoguImportControllerInput): LuoguImportController {
  const {
    luoguPreviewResult,
    luoguImportRules,
    selectedLuoguSubmissionIds,
    skippedLuoguSubmissionIds,
    luoguPreparedNotesById,
    luoguWriteResultsById,
    reviewSelectedLuoguSubmissionIds,
    currentlyPreparingLuoguId,
    activeLuoguPreparedPreviewId,
  } = input;

  const luoguSubmissionCandidateStates = useMemo(() => {
    const submissions = luoguPreviewResult?.submissions ?? [];
    return Object.fromEntries(
      submissions.map((submission) => [
        submission.submissionId,
        getLuoguSubmissionCandidateState(
          submission,
          submissions,
          luoguImportRules,
          luoguPreviewResult?.lastSubmissionId ?? null,
          skippedLuoguSubmissionIds,
        ),
      ]),
    ) as Record<string, LuoguSubmissionCandidateState>;
  }, [luoguImportRules, luoguPreviewResult, skippedLuoguSubmissionIds]);

  const luoguCurrentCandidateCount = Object.values(luoguSubmissionCandidateStates).filter(
    (state) => state.canSelect,
  ).length;

  const luoguScanResultStats = useMemo<LuoguScanResultStats>(() => {
    const submissions = luoguPreviewResult?.submissions ?? [];
    const states = submissions.map((submission) => luoguSubmissionCandidateStates[submission.submissionId] ?? { canSelect: false, defaultSelected: false, statusLabel: submission.statusLabel });
    const reasons = submissions.map((submission) =>
      getLuoguSubmissionCandidateReason(
        submission,
        submissions,
        luoguImportRules,
        luoguPreviewResult?.lastSubmissionId ?? null,
        skippedLuoguSubmissionIds,
      ),
    );
    const candidateCount = states.filter((state) => state.canSelect).length;
    return {
      total: submissions.length,
      candidateCount,
      skippedCount: Math.max(0, submissions.length - candidateCount),
      acCount: submissions.filter((submission) => submission.isAc).length,
      nonAcCount: submissions.filter((submission) => !submission.isAc).length,
      oldSubmissionCount: reasons.filter((reason) => reason === "sameProblemOldAcSkipped" || reason === "sameProblemOldAcManual").length,
      sameProblemOldAcCount: reasons.filter((reason) => reason === "sameProblemOldAcSkipped" || reason === "sameProblemOldAcManual").length,
    };
  }, [luoguImportRules, luoguPreviewResult, luoguSubmissionCandidateStates, skippedLuoguSubmissionIds]);

  const luoguSelectableSubmissionIds = useMemo(
    () =>
      luoguPreviewResult?.submissions
        .filter((submission) => luoguSubmissionCandidateStates[submission.submissionId]?.canSelect)
        .map((submission) => submission.submissionId) ?? [],
    [luoguPreviewResult, luoguSubmissionCandidateStates],
  );

  const displayedLuoguPreviewSubmissions = useMemo(
    () => {
      const submissions = luoguPreviewResult?.submissions ?? [];
      const allowedSubmissions = submissions.filter((submission) =>
        isLuoguProblemIdAllowedByRules(submission.problemId, luoguImportRules),
      );
      if (luoguImportRules.scanResultVisibility !== "hideSkipped") return allowedSubmissions;
      return allowedSubmissions.filter((submission) => luoguSubmissionCandidateStates[submission.submissionId]?.canSelect);
    },
    [luoguImportRules, luoguPreviewResult, luoguSubmissionCandidateStates],
  );

  const selectedLuoguSelectableCount = useMemo(
    () => luoguSelectableSubmissionIds.filter((submissionId) => selectedLuoguSubmissionIds.has(submissionId)).length,
    [luoguSelectableSubmissionIds, selectedLuoguSubmissionIds],
  );

  const areAllLuoguSelectableSubmissionsSelected =
    luoguSelectableSubmissionIds.length > 0 && selectedLuoguSelectableCount === luoguSelectableSubmissionIds.length;
  const isLuoguSelectableSelectionMixed =
    selectedLuoguSelectableCount > 0 && selectedLuoguSelectableCount < luoguSelectableSubmissionIds.length;
  const selectedLuoguImportCount = selectedLuoguSubmissionIds.size;

  const preparedLuoguNotes = useMemo(
    () => Object.values(luoguPreparedNotesById).filter(isReusablePreparedLuoguPreview),
    [luoguPreparedNotesById],
  );

  const writableLuoguPreparedNotes = useMemo(
    () => preparedLuoguNotes.filter(
      (prepared) => reviewSelectedLuoguSubmissionIds.has(prepared.submissionId) && !luoguWriteResultsById[prepared.submissionId],
    ),
    [luoguWriteResultsById, preparedLuoguNotes, reviewSelectedLuoguSubmissionIds],
  );

  const hasReusableLuoguPreparedPreview = (submissionId: string): boolean =>
    isReusablePreparedLuoguPreview(luoguPreparedNotesById[submissionId]);

  const selectedLuoguPreviewSubmissions = useMemo(
    () => luoguPreviewResult?.submissions.filter((submission) => selectedLuoguSubmissionIds.has(submission.submissionId)) ?? [],
    [luoguPreviewResult, selectedLuoguSubmissionIds],
  );

  const luoguPrepareQueueSubmissions = useMemo(
    () =>
      selectedLuoguPreviewSubmissions.filter((submission) => {
        const candidateState = luoguSubmissionCandidateStates[submission.submissionId];
        return (
          candidateState?.canSelect &&
          !skippedLuoguSubmissionIds.has(submission.submissionId) &&
          !isReusablePreparedLuoguPreview(luoguPreparedNotesById[submission.submissionId])
        );
      }),
    [selectedLuoguPreviewSubmissions, luoguSubmissionCandidateStates, skippedLuoguSubmissionIds, luoguPreparedNotesById],
  );

  const luoguReusablePreviewCount = selectedLuoguPreviewSubmissions.filter((submission) =>
    isReusablePreparedLuoguPreview(luoguPreparedNotesById[submission.submissionId]),
  ).length;

  const luoguReadyPreviewSubmissions = useMemo(
    () =>
      selectedLuoguPreviewSubmissions.filter((submission) =>
        isReadyPreparedLuoguPreview(luoguPreparedNotesById[submission.submissionId]),
      ),
    [selectedLuoguPreviewSubmissions, luoguPreparedNotesById],
  );

  const currentlyPreparingLuoguSubmission = useMemo(
    () => selectedLuoguPreviewSubmissions.find((submission) => submission.submissionId === currentlyPreparingLuoguId) ?? null,
    [currentlyPreparingLuoguId, selectedLuoguPreviewSubmissions],
  );

  const activeLuoguPreparedPreviewCandidate =
    activeLuoguPreparedPreviewId && luoguReadyPreviewSubmissions.some((submission) => submission.submissionId === activeLuoguPreparedPreviewId)
      ? luoguPreparedNotesById[activeLuoguPreparedPreviewId]
      : undefined;

  const activeLuoguPreparedPreview =
    activeLuoguPreparedPreviewCandidate ??
    (luoguReadyPreviewSubmissions[0] ? luoguPreparedNotesById[luoguReadyPreviewSubmissions[0].submissionId] : undefined) ??
    null;

  return {
    luoguSubmissionCandidateStates,
    luoguCurrentCandidateCount,
    luoguScanResultStats,
    luoguSelectableSubmissionIds,
    displayedLuoguPreviewSubmissions,
    selectedLuoguSelectableCount,
    areAllLuoguSelectableSubmissionsSelected,
    isLuoguSelectableSelectionMixed,
    selectedLuoguImportCount,
    preparedLuoguNotes,
    writableLuoguPreparedNotes,
    hasReusableLuoguPreparedPreview,
    selectedLuoguPreviewSubmissions,
    luoguPrepareQueueSubmissions,
    luoguReusablePreviewCount,
    luoguReadyPreviewSubmissions,
    currentlyPreparingLuoguSubmission,
    activeLuoguPreparedPreviewCandidate,
    activeLuoguPreparedPreview,
  };
}
