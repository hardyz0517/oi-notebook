import { describe, expect, it } from "vitest";

import { beginFloatingPanelPointerSession } from "./floatingPanelInteraction";

type Rect = { left: number; top: number };

function createPointerEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    preventDefaultCalls: 0,
    stopPropagationCalls: 0,
    preventDefault() {
      this.preventDefaultCalls += 1;
    },
    stopPropagation() {
      this.stopPropagationCalls += 1;
    },
  };
}

describe("floatingPanelInteraction", () => {
  it("owns pointer lifecycle, temporary DOM styles, movement, and cleanup", () => {
    const startEvent = createPointerEvent(10, 20);
    const bodyStyle = { userSelect: "text", cursor: "auto" };
    const panel = {
      style: {
        transition: "opacity 150ms",
        animation: "fade 150ms",
        willChange: "opacity",
      },
    };
    const listeners = new Map<string, EventListener>();
    const removed: string[] = [];
    const applied: Rect[] = [];
    const committed: Rect[] = [];

    beginFloatingPanelPointerSession<Rect>({
      event: startEvent,
      bodyStyle,
      panel,
      windowTarget: {
        addEventListener: (type, listener) => listeners.set(type, listener),
        removeEventListener: (type) => removed.push(type),
      },
      startRect: { left: 1, top: 2 },
      cursor: "grabbing",
      panelWillChange: "left, top",
      getNextRect: ({ startRect, deltaX, deltaY }) => ({
        left: startRect.left + deltaX,
        top: startRect.top + deltaY,
      }),
      getFinalRect: (rect) => ({ left: Math.max(0, rect.left), top: Math.max(0, rect.top) }),
      applyRect: (rect) => applied.push(rect),
      onCommit: (rect) => committed.push(rect),
    });

    expect(startEvent.preventDefaultCalls).toBe(1);
    expect(startEvent.stopPropagationCalls).toBe(1);
    expect(bodyStyle).toEqual({ userSelect: "none", cursor: "grabbing" });
    expect(panel.style).toMatchObject({
      transition: "none",
      animation: "none",
      willChange: "left, top",
    });
    expect(Array.from(listeners.keys()).sort()).toEqual(["pointercancel", "pointermove", "pointerup"]);

    listeners.get("pointermove")?.(createPointerEvent(14, 17) as unknown as Event);
    expect(applied).toEqual([{ left: 5, top: -1 }]);

    listeners.get("pointerup")?.({} as Event);
    expect(committed).toEqual([{ left: 5, top: 0 }]);
    expect(bodyStyle).toEqual({ userSelect: "text", cursor: "auto" });
    expect(panel.style.transition).toBe("opacity 150ms");
    expect(panel.style.animation).toBe("fade 150ms");
    expect(panel.style.willChange).toBe("opacity");
    expect(removed.sort()).toEqual(["pointercancel", "pointermove", "pointerup"]);
  });
});
