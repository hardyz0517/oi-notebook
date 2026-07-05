import { describe, expect, it } from "vitest";

import { UI_LAYER_ORDER } from "./layers";

describe("UI layer scale", () => {
  it("keeps portal floating content above dialog content", () => {
    expect(UI_LAYER_ORDER.floatingContent).toBeGreaterThan(UI_LAYER_ORDER.dialogContent);
  });

  it("keeps transient feedback above interactive floating content", () => {
    expect(UI_LAYER_ORDER.tooltip).toBeGreaterThan(UI_LAYER_ORDER.floatingContent);
    expect(UI_LAYER_ORDER.toast).toBeGreaterThan(UI_LAYER_ORDER.tooltip);
  });
});
