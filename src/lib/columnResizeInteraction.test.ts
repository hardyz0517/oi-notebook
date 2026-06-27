import { describe, expect, it } from "vitest";

import { beginColumnResizeSession } from "./columnResizeInteraction";

function createPointerEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    preventDefaultCalls: 0,
    preventDefault() {
      this.preventDefaultCalls += 1;
    },
  };
}

function createWindowTarget() {
  const listeners = new Map<string, EventListener>();
  const removed: string[] = [];
  const frames = new Map<number, FrameRequestCallback>();
  let nextHandle = 1;

  return {
    listeners,
    removed,
    windowTarget: {
      addEventListener: (type: "pointermove" | "pointerup" | "pointercancel", listener: EventListener) => {
        listeners.set(type, listener);
      },
      removeEventListener: (type: "pointermove" | "pointerup" | "pointercancel") => {
        removed.push(type);
      },
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        const handle = nextHandle;
        nextHandle += 1;
        frames.set(handle, callback);
        return handle;
      },
      cancelAnimationFrame: (handle: number) => {
        frames.delete(handle);
      },
    },
    flushFrame() {
      const entries = Array.from(frames.entries());
      frames.clear();
      for (const [, callback] of entries) {
        callback(0);
      }
    },
    hasPendingFrame() {
      return frames.size > 0;
    },
  };
}

function createBodyClassList() {
  return {
    values: new Set<string>(),
    add(value: string) {
      this.values.add(value);
    },
    remove(value: string) {
      this.values.delete(value);
    },
  };
}

describe("columnResizeInteraction", () => {
  it("drives the left sidebar resize lifecycle", () => {
    const startEvent = createPointerEvent(10, 20);
    const bodyStyle = { userSelect: "text", cursor: "auto" };
    const bodyClassList = createBodyClassList();
    const target = createWindowTarget();
    const applied: number[] = [];
    let finished = 0;

    beginColumnResizeSession({
      event: startEvent,
      cursor: "col-resize",
      bodyStyle,
      bodyClassList,
      windowTarget: target.windowTarget,
      onMove: (event) => {
        applied.push(event.clientX - startEvent.clientX);
      },
      onFinish: () => {
        finished += 1;
      },
    });

    expect(startEvent.preventDefaultCalls).toBe(1);
    expect(bodyStyle).toEqual({ userSelect: "none", cursor: "col-resize" });
    expect(bodyClassList.values.has("app-column-resizing")).toBe(true);

    target.listeners.get("pointermove")?.(createPointerEvent(25, 20) as unknown as Event);
    expect(applied).toEqual([15]);

    target.listeners.get("pointerup")?.({} as Event);
    expect(finished).toBe(1);
    expect(bodyStyle).toEqual({ userSelect: "text", cursor: "auto" });
    expect(bodyClassList.values.has("app-column-resizing")).toBe(false);
    expect(target.removed.sort()).toEqual(["pointercancel", "pointermove", "pointerup"]);
  });

  it("batches AI sidebar preview updates into one animation frame", () => {
    const startEvent = createPointerEvent(100, 20);
    const bodyStyle = { userSelect: "text", cursor: "auto" };
    const bodyClassList = createBodyClassList();
    const target = createWindowTarget();
    const moveEvents: number[] = [];
    const frameEvents: number[] = [];
    let finished = 0;

    beginColumnResizeSession({
      event: startEvent,
      cursor: "col-resize",
      bodyStyle,
      bodyClassList,
      windowTarget: target.windowTarget,
      onMove: (event) => {
        moveEvents.push(event.clientX);
      },
      onAnimationFrame: (event) => {
        frameEvents.push(event.clientX);
      },
      onFinish: () => {
        finished += 1;
      },
    });

    target.listeners.get("pointermove")?.(createPointerEvent(92, 20) as unknown as Event);
    target.listeners.get("pointermove")?.(createPointerEvent(80, 20) as unknown as Event);

    expect(moveEvents).toEqual([92, 80]);
    expect(frameEvents).toEqual([]);
    expect(target.hasPendingFrame()).toBe(true);

    target.flushFrame();
    expect(frameEvents).toEqual([80]);

    target.listeners.get("pointerup")?.({} as Event);
    expect(finished).toBe(1);
    expect(bodyStyle).toEqual({ userSelect: "text", cursor: "auto" });
    expect(bodyClassList.values.has("app-column-resizing")).toBe(false);
  });

  it("supports editor preview drags and pointercancel cleanup", () => {
    const startEvent = createPointerEvent(30, 15);
    const bodyStyle = { userSelect: "text", cursor: "auto" };
    const bodyClassList = createBodyClassList();
    const target = createWindowTarget();
    const ratios: number[] = [];
    let finished = 0;

    beginColumnResizeSession({
      event: startEvent,
      cursor: "col-resize",
      bodyStyle,
      bodyClassList,
      windowTarget: target.windowTarget,
      onMove: (event) => {
        ratios.push((event.clientX - 10) / 100);
      },
      onFinish: () => {
        finished += 1;
      },
    });

    target.listeners.get("pointermove")?.(createPointerEvent(60, 15) as unknown as Event);
    expect(ratios).toEqual([0.5]);

    target.listeners.get("pointercancel")?.({} as Event);
    expect(finished).toBe(1);
    expect(bodyStyle).toEqual({ userSelect: "text", cursor: "auto" });
    expect(bodyClassList.values.has("app-column-resizing")).toBe(false);
  });
});
