import { describe, expect, it } from "vitest";
import {
  buildLuoguConfigFormState,
  buildLuoguConfigSavePayload,
  isLuoguAiConfigured,
} from "./luoguConfigForm";
import type { LuoguConfig } from "./api";
import { DEFAULT_WEB_SEARCH_CONFIG } from "./aiWebSearch";

const baseConfig: LuoguConfig = {
  ai: {
    base_url: " https://api.example.test ",
    api_key: " key ",
    model: " model ",
    chat_response_style: "compact",
    web_search: DEFAULT_WEB_SEARCH_CONFIG,
    providers: [],
    default_provider_id: null,
    default_model_id: null,
  },
  luogu: {
    uid: "10001",
    client_id: "client-id",
    last_submission_id: 42,
  },
  blog: {
    title: "OI Notebook",
    subtitle: "Notes",
  },
};

describe("luoguConfigForm", () => {
  it("builds editable form state from loaded config", () => {
    expect(buildLuoguConfigFormState(baseConfig)).toEqual({
      uid: "10001",
      clientId: "client-id",
      lastSubmissionId: "42",
      aiConfigured: true,
    });
  });

  it("formats empty last submission ids for the form", () => {
    expect(buildLuoguConfigFormState({
      ...baseConfig,
      luogu: { ...baseConfig.luogu, last_submission_id: null },
    }).lastSubmissionId).toBe("");
  });

  it("builds save payloads from trimmed form input", () => {
    expect(buildLuoguConfigSavePayload({
      uid: " 10001 ",
      clientId: " client-id ",
      lastSubmissionId: " 42 ",
    })).toEqual({
      ok: true,
      config: {
        luogu: {
          uid: "10001",
          client_id: "client-id",
          last_submission_id: 42,
        },
      },
    });
  });

  it("allows blank last submission ids", () => {
    expect(buildLuoguConfigSavePayload({
      uid: "10001",
      clientId: "client-id",
      lastSubmissionId: " ",
    })).toEqual({
      ok: true,
      config: {
        luogu: {
          uid: "10001",
          client_id: "client-id",
          last_submission_id: null,
        },
      },
    });
  });

  it("rejects invalid last submission ids", () => {
    expect(buildLuoguConfigSavePayload({
      uid: "10001",
      clientId: "client-id",
      lastSubmissionId: "1.5",
    })).toEqual({
      ok: false,
      error: "last_submission_id 必须是非负整数或留空",
    });

    expect(buildLuoguConfigSavePayload({
      uid: "10001",
      clientId: "client-id",
      lastSubmissionId: "-1",
    }).ok).toBe(false);
  });

  it("requires all AI connection fields before reporting AI configured", () => {
    expect(isLuoguAiConfigured(baseConfig)).toBe(true);
    expect(isLuoguAiConfigured({
      ...baseConfig,
      ai: { ...baseConfig.ai, api_key: " " },
    })).toBe(false);
  });
});
