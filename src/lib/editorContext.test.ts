import { describe, expect, it } from "vitest";
import { extractCursorParagraph } from "./editorContext";

describe("editorContext", () => {
  it("returns null when there is no cursor or body text", () => {
    expect(extractCursorParagraph("Body", null)).toBeNull();
    expect(extractCursorParagraph("   \n  ", 0)).toBeNull();
  });

  it("extracts the paragraph around the cursor", () => {
    const markdown = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.";
    expect(extractCursorParagraph(markdown, markdown.indexOf("paragraph."))).toEqual({
      text: "First paragraph.",
      isCode: false,
    });
  });

  it("clamps cursor offsets to the document range", () => {
    expect(extractCursorParagraph("Only paragraph", 999)).toEqual({
      text: "Only paragraph",
      isCode: false,
    });
  });

  it("extracts a fenced code block when the cursor is inside it", () => {
    const markdown = "Intro\n\n```cpp\nint main() {}\n```\n\nOutro";
    expect(extractCursorParagraph(markdown, markdown.indexOf("main"))).toEqual({
      text: "```cpp\nint main() {}\n```",
      isCode: true,
    });
  });

  it("extracts an unclosed fenced code block through the end of the document", () => {
    const markdown = "Intro\n\n~~~\npartial";
    expect(extractCursorParagraph(markdown, markdown.indexOf("partial"))).toEqual({
      text: "~~~\npartial",
      isCode: true,
    });
  });
});
