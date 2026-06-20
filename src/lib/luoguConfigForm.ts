import type { LuoguConfig } from "./api";

export interface LuoguConfigFormState {
  uid: string;
  clientId: string;
  lastSubmissionId: string;
  aiConfigured: boolean;
}

export interface LuoguConfigFormInput {
  uid: string;
  clientId: string;
  lastSubmissionId: string;
}

export interface LuoguAccountSettingsViewInput {
  isLoadingConfig: boolean;
  isSavingConfig: boolean;
  isTestingConnection: boolean;
}

export interface LuoguAccountSettingsView {
  isOpenSettingsDisabled: boolean;
  showOpenSettingsSpinner: boolean;
}

export type LuoguConfigSavePayloadResult =
  | {
    ok: true;
    config: Pick<LuoguConfig, "luogu">;
  }
  | {
    ok: false;
    error: string;
  };

export function isLuoguAiConfigured(config: LuoguConfig): boolean {
  return (
    config.ai.base_url.trim() !== "" &&
    config.ai.api_key.trim() !== "" &&
    config.ai.model.trim() !== ""
  );
}

export function buildLuoguConfigFormState(config: LuoguConfig): LuoguConfigFormState {
  return {
    uid: config.luogu.uid,
    clientId: config.luogu.client_id,
    lastSubmissionId: config.luogu.last_submission_id === null ? "" : String(config.luogu.last_submission_id),
    aiConfigured: isLuoguAiConfigured(config),
  };
}

export function deriveLuoguAccountSettingsView(input: LuoguAccountSettingsViewInput): LuoguAccountSettingsView {
  return {
    isOpenSettingsDisabled: input.isLoadingConfig || input.isSavingConfig || input.isTestingConnection,
    showOpenSettingsSpinner: input.isLoadingConfig,
  };
}

export function buildLuoguConfigSavePayload(input: LuoguConfigFormInput): LuoguConfigSavePayloadResult {
  const lastSubmissionId = input.lastSubmissionId.trim();
  const parsedLastSubmissionId = lastSubmissionId === "" ? null : Number(lastSubmissionId);
  if (
    parsedLastSubmissionId !== null &&
    (!Number.isInteger(parsedLastSubmissionId) || parsedLastSubmissionId < 0)
  ) {
    return { ok: false, error: "last_submission_id 必须是非负整数或留空" };
  }

  return {
    ok: true,
    config: {
      luogu: {
        uid: input.uid.trim(),
        client_id: input.clientId.trim(),
        last_submission_id: parsedLastSubmissionId,
      },
    },
  };
}
