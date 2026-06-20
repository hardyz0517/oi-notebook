import { describe, expect, it } from "vitest";
import { toApiError } from "./apiError";

describe("apiError", () => {
  it("keeps Error instances unchanged", () => {
    const error = new Error("boom");
    expect(toApiError(error)).toBe(error);
  });

  it("converts string errors to Error instances", () => {
    const error = toApiError("backend failed");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("backend failed");
  });

  it("stringifies non-error values", () => {
    expect(toApiError(404).message).toBe("404");
    expect(toApiError(null).message).toBe("null");
  });
});
