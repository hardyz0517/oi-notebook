import { describe, expect, it } from "vitest";

import {
  DEFAULT_LUOGU_IMPORT_RULES,
  buildLuoguImportRuleRowModels,
  isLuoguRuleControlDisabled,
  type LuoguImportRuleBusyState,
} from "./luoguImportRules";

describe("luoguImportRules settings model", () => {
  it("builds rule row models with current values and stable option order", () => {
    const rows = buildLuoguImportRuleRowModels({
      ...DEFAULT_LUOGU_IMPORT_RULES,
      submitFilter: "includeNonAc",
      defaultSaveLocation: "custom",
      includeSourceCode: true,
    });

    expect(rows.map((row) => row.id)).toEqual([
      "submitFilter",
      "problemIdFilter",
      "sameProblemStrategy",
      "importedProblemPolicy",
      "missingInsightStrategy",
      "scanResultVisibility",
      "defaultSaveLocation",
      "writeStrategy",
      "defaultDraftStatus",
      "includeSourceCode",
    ]);
    expect(rows.find((row) => row.id === "submitFilter")?.value).toBe("includeNonAc");
    expect(rows.find((row) => row.id === "defaultSaveLocation")?.value).toBe("custom");
    expect(rows.find((row) => row.id === "includeSourceCode")?.value).toBe("yes");
    expect(rows.find((row) => row.id === "sameProblemStrategy")?.options.map((option) => option.value)).toEqual([
      "latestAc",
      "allAc",
      "manual",
    ]);
  });

  it("derives rule control disabled state from any busy task", () => {
    const idle: LuoguImportRuleBusyState = {
      isLoadingConfig: false,
      isTestingConnection: false,
      isScanningPreview: false,
      isPreparingSelected: false,
      isWritingPrepared: false,
      isSyncing: false,
    };

    expect(isLuoguRuleControlDisabled(idle)).toBe(false);
    expect(isLuoguRuleControlDisabled({ ...idle, isLoadingConfig: true })).toBe(true);
    expect(isLuoguRuleControlDisabled({ ...idle, isTestingConnection: true })).toBe(true);
    expect(isLuoguRuleControlDisabled({ ...idle, isScanningPreview: true })).toBe(true);
    expect(isLuoguRuleControlDisabled({ ...idle, isPreparingSelected: true })).toBe(true);
    expect(isLuoguRuleControlDisabled({ ...idle, isWritingPrepared: true })).toBe(true);
    expect(isLuoguRuleControlDisabled({ ...idle, isSyncing: true })).toBe(true);
  });
});
