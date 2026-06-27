type FloatingPanelPointerEvent = {
  clientX: number;
  clientY: number;
  preventDefault: () => void;
};

type FloatingPanelStartEvent = FloatingPanelPointerEvent & {
  stopPropagation: () => void;
};

type FloatingPanelWindowTarget = {
  addEventListener: (type: "pointermove" | "pointerup" | "pointercancel", listener: EventListener) => void;
  removeEventListener: (type: "pointermove" | "pointerup" | "pointercancel", listener: EventListener) => void;
};

type FloatingPanelBodyStyle = {
  userSelect: string;
  cursor: string;
};

type FloatingPanelElement = {
  style: {
    transition: string;
    animation: string;
    willChange: string;
  };
};

export interface FloatingPanelPointerRectInput<TRect> {
  startRect: TRect;
  deltaX: number;
  deltaY: number;
  event: PointerEvent;
}

export interface FloatingPanelPointerSessionInput<TRect> {
  event: FloatingPanelStartEvent;
  startRect: TRect;
  cursor: string;
  panelWillChange: string;
  panel: FloatingPanelElement | null;
  getNextRect: (input: FloatingPanelPointerRectInput<TRect>) => TRect;
  getFinalRect: (rect: TRect) => TRect;
  applyRect: (rect: TRect) => void;
  onCommit: (rect: TRect) => void;
  bodyStyle?: FloatingPanelBodyStyle;
  windowTarget?: FloatingPanelWindowTarget;
}

export function beginFloatingPanelPointerSession<TRect>(
  input: FloatingPanelPointerSessionInput<TRect>,
): void {
  const bodyStyle = input.bodyStyle ?? document.body.style;
  const windowTarget = input.windowTarget ?? window;
  const { event, panel, startRect } = input;
  const startX = event.clientX;
  const startY = event.clientY;
  const previousUserSelect = bodyStyle.userSelect;
  const previousCursor = bodyStyle.cursor;
  const previousPanelTransition = panel?.style.transition ?? "";
  const previousPanelAnimation = panel?.style.animation ?? "";
  const previousPanelWillChange = panel?.style.willChange ?? "";
  let latestRect = startRect;

  event.preventDefault();
  event.stopPropagation();

  bodyStyle.userSelect = "none";
  bodyStyle.cursor = input.cursor;
  if (panel) {
    panel.style.transition = "none";
    panel.style.animation = "none";
    panel.style.willChange = input.panelWillChange;
  }

  const handlePointerMove: EventListener = (event) => {
    const moveEvent = event as PointerEvent;
    moveEvent.preventDefault();
    latestRect = input.getNextRect({
      startRect,
      deltaX: moveEvent.clientX - startX,
      deltaY: moveEvent.clientY - startY,
      event: moveEvent,
    });
    input.applyRect(latestRect);
  };

  const finishPointerSession: EventListener = () => {
    const finalRect = input.getFinalRect(latestRect);
    latestRect = finalRect;
    input.applyRect(finalRect);
    bodyStyle.userSelect = previousUserSelect;
    bodyStyle.cursor = previousCursor;
    if (panel) {
      panel.style.transition = previousPanelTransition;
      panel.style.animation = previousPanelAnimation;
      panel.style.willChange = previousPanelWillChange;
    }
    windowTarget.removeEventListener("pointermove", handlePointerMove);
    windowTarget.removeEventListener("pointerup", finishPointerSession);
    windowTarget.removeEventListener("pointercancel", finishPointerSession);
    input.onCommit(finalRect);
  };

  windowTarget.addEventListener("pointermove", handlePointerMove);
  windowTarget.addEventListener("pointerup", finishPointerSession);
  windowTarget.addEventListener("pointercancel", finishPointerSession);
}
