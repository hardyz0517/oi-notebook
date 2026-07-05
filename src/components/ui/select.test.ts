import { describe, expect, it } from "vitest";

import { SELECT_CONTENT_LAYER_CLASS } from "./select";
import { UI_LAYER_ORDER } from "./layers";

describe("SelectContent layering", () => {
  it("renders above dialogs", () => {
    expect(UI_LAYER_ORDER.floatingContent).toBeGreaterThan(UI_LAYER_ORDER.dialogContent);
    expect(SELECT_CONTENT_LAYER_CLASS).toBe("z-[100]");
  });
});
