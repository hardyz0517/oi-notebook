type ColumnResizePointerEvent = {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
};

type ColumnResizeWindowTarget = {
  addEventListener: (type: "pointermove" | "pointerup" | "pointercancel", listener: EventListener) => void;
  removeEventListener: (type: "pointermove" | "pointerup" | "pointercancel", listener: EventListener) => void;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
};

type ColumnResizeBodyStyle = {
  userSelect: string;
  cursor: string;
};

type ColumnResizeBodyClassList = {
  add: (value: string) => void;
  remove: (value: string) => void;
};

export interface ColumnResizeSessionInput {
  event: ColumnResizePointerEvent;
  cursor: string;
  onMove: (event: PointerEvent) => void;
  onFinish: () => void;
  onAnimationFrame?: (event: PointerEvent) => void;
  bodyStyle?: ColumnResizeBodyStyle;
  bodyClassList?: ColumnResizeBodyClassList;
  windowTarget?: ColumnResizeWindowTarget;
}

export function beginColumnResizeSession(input: ColumnResizeSessionInput): void {
  const bodyStyle = input.bodyStyle ?? document.body.style;
  const bodyClassList = input.bodyClassList ?? document.body.classList;
  const windowTarget = input.windowTarget ?? window;
  const previousUserSelect = bodyStyle.userSelect;
  const previousCursor = bodyStyle.cursor;
  const previousAnimationFrame = windowTarget.requestAnimationFrame?.bind(windowTarget) ?? window.requestAnimationFrame.bind(window);
  const previousCancelAnimationFrame = windowTarget.cancelAnimationFrame?.bind(windowTarget) ?? window.cancelAnimationFrame.bind(window);
  let rafHandle: number | null = null;
  let latestMoveEvent: PointerEvent | null = null;

  input.event.preventDefault();

  bodyStyle.userSelect = "none";
  bodyStyle.cursor = input.cursor;
  bodyClassList.add("app-column-resizing");

  const cleanup = () => {
    if (rafHandle !== null) {
      previousCancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    bodyStyle.userSelect = previousUserSelect;
    bodyStyle.cursor = previousCursor;
    bodyClassList.remove("app-column-resizing");
  };

  const handlePointerMove: EventListener = (event) => {
    const moveEvent = event as PointerEvent;
    moveEvent.preventDefault();
    latestMoveEvent = moveEvent;
    input.onMove(moveEvent);

    if (!input.onAnimationFrame || rafHandle !== null) {
      return;
    }

    rafHandle = previousAnimationFrame(() => {
      rafHandle = null;
      const frameEvent = latestMoveEvent;
      latestMoveEvent = null;
      if (frameEvent) {
        input.onAnimationFrame?.(frameEvent);
      }
    });
  };

  const finishPointerSession: EventListener = () => {
    if (rafHandle !== null) {
      previousCancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    const frameEvent = latestMoveEvent;
    latestMoveEvent = null;
    if (frameEvent && input.onAnimationFrame) {
      input.onAnimationFrame(frameEvent);
    }
    cleanup();
    windowTarget.removeEventListener("pointermove", handlePointerMove);
    windowTarget.removeEventListener("pointerup", finishPointerSession);
    windowTarget.removeEventListener("pointercancel", finishPointerSession);
    input.onFinish();
  };

  windowTarget.addEventListener("pointermove", handlePointerMove);
  windowTarget.addEventListener("pointerup", finishPointerSession);
  windowTarget.addEventListener("pointercancel", finishPointerSession);
}
