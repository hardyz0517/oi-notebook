import { describe, expect, it } from "vitest";

import { combineMarkdown, isSnapshotDirty, splitLoadedMarkdown } from "./markdownDocument";

describe("markdownDocument", () => {
  it("splits closed frontmatter from the body", () => {
    const result = splitLoadedMarkdown("---\ntitle: A\n---\nBody");

    expect(result.frontmatterPrefix).toBe("---\ntitle: A\n---\n");
    expect(result.body).toBe("Body");
    expect(result.warning).toBeNull();
  });

  it("keeps unclosed frontmatter as body", () => {
    const result = splitLoadedMarkdown("---\ntitle: A\nBody");

    expect(result.frontmatterPrefix).toBe("");
    expect(result.body).toBe("---\ntitle: A\nBody");
    expect(result.warning).toContain("frontmatter");
  });

  it("detects dirty snapshots", () => {
    expect(isSnapshotDirty({ path: "a.md", frontmatterPrefix: "", markdown: "A" }, "a.md", "", "B")).toBe(true);
    expect(isSnapshotDirty({ path: "a.md", frontmatterPrefix: "", markdown: "A" }, "a.md", "", "A")).toBe(false);
  });

  it("treats missing paths as not dirty", () => {
    expect(isSnapshotDirty({ path: "a.md", frontmatterPrefix: "", markdown: "A" }, null, "", "B")).toBe(false);
  });

  it("combines frontmatter and body", () => {
    expect(combineMarkdown("---\na: b\n---\n", "Body")).toBe("---\na: b\n---\nBody");
  });
});
