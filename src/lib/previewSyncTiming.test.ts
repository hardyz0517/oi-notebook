import { describe, expect, it } from "vitest";
import {
  getCommittedMarkdownSyncDelayMs,
  getPreviewMarkdownSyncDelayMs,
} from "./previewSyncTiming";

describe("previewSyncTiming", () => {
  it("keeps committed markdown sync fast for small documents and cheap parses", () => {
    expect(getCommittedMarkdownSyncDelayMs(2_000, 39)).toBe(50);
  });

  it("uses a medium committed markdown delay for common document sizes", () => {
    expect(getCommittedMarkdownSyncDelayMs(15_000, 89)).toBe(90);
  });

  it("backs off committed markdown sync for large documents or slow parses", () => {
    expect(getCommittedMarkdownSyncDelayMs(25_000, 30)).toBe(160);
    expect(getCommittedMarkdownSyncDelayMs(3_000, 120)).toBe(160);
  });

  it("uses a fallback committed markdown delay between the fast and slow ranges", () => {
    expect(getCommittedMarkdownSyncDelayMs(20_000, 90)).toBe(120);
  });

  it("keeps preview markdown sync quick for small documents", () => {
    expect(getPreviewMarkdownSyncDelayMs(2_999, 200)).toBe(25);
  });

  it("adjusts medium preview markdown sync by the last parse cost", () => {
    expect(getPreviewMarkdownSyncDelayMs(3_000, 89)).toBe(65);
    expect(getPreviewMarkdownSyncDelayMs(3_000, 90)).toBe(90);
  });

  it("backs off preview markdown sync for large documents or slow parses", () => {
    expect(getPreviewMarkdownSyncDelayMs(25_000, 30)).toBe(150);
    expect(getPreviewMarkdownSyncDelayMs(12_000, 120)).toBe(150);
  });

  it("uses a fallback preview markdown delay between the medium and slow ranges", () => {
    expect(getPreviewMarkdownSyncDelayMs(12_000, 119)).toBe(120);
  });
});
