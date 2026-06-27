import { describe, expect, it } from "vitest";
import {
  formatZoomLabel,
  getBlogStatusLabel,
  getEditorViewModeLabel,
  getLuoguImportCenterAccountLabel,
  getLuoguSettingsStatusDescription,
  getLuoguSettingsStatusTone,
  getLuoguStatusLabel,
  getSaveStatusLabel,
} from "./appStatusLabels";

describe("appStatusLabels", () => {
  it("formats save status labels", () => {
    expect(getSaveStatusLabel({ hasActiveEditorDocument: false, isSavingNote: false, isDirty: false })).toBe("未选择文件");
    expect(getSaveStatusLabel({ hasActiveEditorDocument: true, isSavingNote: true, isDirty: true })).toBe("保存中");
    expect(getSaveStatusLabel({ hasActiveEditorDocument: true, isSavingNote: false, isDirty: true })).toBe("未保存");
    expect(getSaveStatusLabel({ hasActiveEditorDocument: true, isSavingNote: false, isDirty: false })).toBe("已保存");
  });

  it("formats blog status labels", () => {
    expect(getBlogStatusLabel(true)).toBe("重启中");
    expect(getBlogStatusLabel(false)).toBe("打开 / 重启");
  });

  it("formats Luogu status labels", () => {
    expect(getLuoguStatusLabel({ hasLoadedLuoguConfigStatus: false, isLoadingLuoguConfig: false, isConfigured: false, hasConnectionError: false })).toBe("读取中");
    expect(getLuoguStatusLabel({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: true, isConfigured: true, hasConnectionError: false })).toBe("读取中");
    expect(getLuoguStatusLabel({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: false, isConfigured: false, hasConnectionError: false })).toBe("未配置");
    expect(getLuoguStatusLabel({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: false, isConfigured: true, hasConnectionError: true })).toBe("连接失败");
    expect(getLuoguStatusLabel({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: false, isConfigured: true, hasConnectionError: false })).toBe("已配置");
  });

  it("formats Luogu status descriptions and tones", () => {
    expect(getLuoguSettingsStatusTone({ hasLoadedLuoguConfigStatus: false, isLoadingLuoguConfig: false, isConfigured: false, hasConnectionError: false })).toContain("border-sky");
    expect(getLuoguSettingsStatusTone({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: false, isConfigured: false, hasConnectionError: false })).toContain("border-amber");
    expect(getLuoguSettingsStatusTone({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: false, isConfigured: true, hasConnectionError: true })).toContain("border-red");
    expect(getLuoguSettingsStatusTone({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: false, isConfigured: true, hasConnectionError: false })).toContain("border-emerald");

    expect(getLuoguSettingsStatusDescription({ hasLoadedLuoguConfigStatus: false, isLoadingLuoguConfig: false, isConfigured: false, hasConnectionError: false, hasConnectionResult: false })).toBe("正在读取本机洛谷配置。");
    expect(getLuoguSettingsStatusDescription({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: false, isConfigured: false, hasConnectionError: false, hasConnectionResult: false })).toContain("_uid");
    expect(getLuoguSettingsStatusDescription({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: false, isConfigured: true, hasConnectionError: true, hasConnectionResult: false })).toBe("最近一次测试连接失败，请检查 Cookie 后重试。");
    expect(getLuoguSettingsStatusDescription({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: false, isConfigured: true, hasConnectionError: false, hasConnectionResult: true })).toBe("最近测试正常。");
    expect(getLuoguSettingsStatusDescription({ hasLoadedLuoguConfigStatus: true, isLoadingLuoguConfig: false, isConfigured: true, hasConnectionError: false, hasConnectionResult: false })).toBe("账号 Cookie 已保存，可手动测试连接。");
  });

  it("formats Luogu import account labels", () => {
    expect(getLuoguImportCenterAccountLabel(true, false)).toBe("读取中");
    expect(getLuoguImportCenterAccountLabel(false, true)).toBe("已连接");
    expect(getLuoguImportCenterAccountLabel(false, false)).toBe("未配置");
  });

  it("formats editor view mode and zoom labels", () => {
    expect(getEditorViewModeLabel("split")).toBe("双栏");
    expect(getEditorViewModeLabel("editor")).toBe("仅编辑");
    expect(getEditorViewModeLabel("preview")).toBe("仅预览");
    expect(formatZoomLabel(1.254)).toBe("125%");
  });
});
