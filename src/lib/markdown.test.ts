import { describe, expect, it } from "vitest";

import { renderMarkdownForTheme } from "./markdown";

describe("markdown rendering", () => {
  it("strips frontmatter before rendering", async () => {
    const html = await renderMarkdownForTheme("---\ntitle: A\n---\n# Body", "light");

    expect(html).toContain("<h1>Body</h1>");
    expect(html).not.toContain("title: A");
  });

  it("removes dangerous html tags and unsafe attributes", async () => {
    const html = await renderMarkdownForTheme(
      '<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n[ok](https://example.com)',
      "light",
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onclick");
    expect(html).toContain("<a>x</a>");
    expect(html).toContain('href="https://example.com"');
  });

  it("renders callout directives", async () => {
    const html = await renderMarkdownForTheme(":::info\nHello\n:::", "light");

    expect(html).toContain("oi-callout");
    expect(html).toContain("oi-callout-info");
    expect(html).toContain("Hello");
  });

  it("renders cute table directives with attributes", async () => {
    const html = await renderMarkdownForTheme("::cute-table{tuack=3}\n\n| A |\n| - |\n| B |", "light");

    expect(html).toContain("oi-cute-table");
    expect(html).toContain("oi-cute-table-tuack-split-3");
    expect(html).toContain('data-tuack-split="3"');
  });

  it("merges table cells marked with caret and greater-than markers", async () => {
    const html = await renderMarkdownForTheme("| > | A |\n| - | - |\n| C | D |\n| ^ | E |", "light");

    expect(html).toContain('colspan="2"');
    expect(html).toContain('rowspan="2">C</td>');
    expect(html).not.toContain("<td>^</td>");
    expect(html).not.toContain("<th>></th>");
  });
});
