import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";

// Mobile browsers hand native HTML5 drag-and-drop to the OS (Android) or WebKit's drag
// interaction (iOS), and the page often never receives dragover/drop. Touch drags are
// driven from touch events instead: long-press a row, move, release over a drop target.
const TRADE_DROP_DATE_ATTRIBUTE = "data-trade-drop-date";
export const TOUCH_DRAG_DELAY_MS = 400;
const TOUCH_DRAG_SLOP_PX = 10;
// Holding a drag this close to the top or bottom of the screen scrolls the page,
// faster the closer the finger gets, so off-screen calendar days can be reached.
const AUTO_SCROLL_EDGE_PX = 72;
const AUTO_SCROLL_MAX_STEP_PX = 14;

interface TouchDragState {
  tradeId: string;
  touchId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  dropDate: string | null;
  timer?: ReturnType<typeof setTimeout>;
  scrollFrame?: number;
}

interface TouchTradeDragOptions {
  enabled: boolean;
  onDragStart?: (tradeId: string) => void;
  onDragEnd?: () => void;
  onDropTargetChange?: (date: string | null) => void;
  onDrop?: (tradeId: string, date: string) => void;
}

function findTouch(list: TouchList, touchId: number) {
  return Array.from(list).find((touch) => touch.identifier === touchId);
}

function findDropDate(x: number, y: number) {
  const target = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>(`[${TRADE_DROP_DATE_ATTRIBUTE}]`);
  return target?.getAttribute(TRADE_DROP_DATE_ATTRIBUTE) ?? null;
}

function autoScrollStep({ y, startY }: TouchDragState) {
  const fromBottom = window.innerHeight - y;
  const scrollUp = y < fromBottom;
  // Only scroll the way the finger has moved since pickup, so picking up a row that
  // already sits near an edge doesn't scroll the page out from under it.
  if (scrollUp ? y >= startY : y <= startY) {
    return 0;
  }
  const edgeDistance = scrollUp ? y : fromBottom;
  if (edgeDistance >= AUTO_SCROLL_EDGE_PX) {
    return 0;
  }
  const closeness = Math.min(1, (AUTO_SCROLL_EDGE_PX - edgeDistance) / AUTO_SCROLL_EDGE_PX);
  const step = Math.ceil(closeness * AUTO_SCROLL_MAX_STEP_PX);
  return scrollUp ? -step : step;
}

export function useTouchTradeDrag({
  enabled,
  onDragStart,
  onDragEnd,
  onDropTargetChange,
  onDrop,
}: TouchTradeDragOptions) {
  const stateRef = useRef<TouchDragState | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const [touchDrag, setTouchDrag] = useState<{ tradeId: string; x: number; y: number } | null>(
    null
  );
  const callbacksRef = useRef({ onDragStart, onDragEnd, onDropTargetChange, onDrop });
  callbacksRef.current = { onDragStart, onDragEnd, onDropTargetChange, onDrop };

  const finish = useCallback(() => {
    const state = stateRef.current;
    stateRef.current = null;
    if (!state) {
      return;
    }
    clearTimeout(state.timer);
    if (state.scrollFrame !== undefined) {
      cancelAnimationFrame(state.scrollFrame);
    }
    if (state.active) {
      if (state.dropDate) {
        callbacksRef.current.onDropTargetChange?.(null);
      }
      callbacksRef.current.onDragEnd?.();
      setTouchDrag(null);
    }
  }, []);

  const updateDropTarget = useCallback((state: TouchDragState) => {
    const date = findDropDate(state.x, state.y);
    if (date !== state.dropDate) {
      state.dropDate = date;
      callbacksRef.current.onDropTargetChange?.(date);
    }
  }, []);

  // Runs every frame while the finger rests near an edge, since touchmove stops firing
  // when the finger is still. The page moves under the finger, so re-check the target.
  const autoScroll = useCallback(
    (state: TouchDragState) => {
      state.scrollFrame = undefined;
      const step = autoScrollStep(state);
      if (stateRef.current !== state || step === 0) {
        return;
      }
      window.scrollBy(0, step);
      updateDropTarget(state);
      state.scrollFrame = requestAnimationFrame(() => autoScroll(state));
    },
    [updateDropTarget]
  );

  const moveTo = useCallback(
    (state: TouchDragState, x: number, y: number) => {
      state.x = x;
      state.y = y;
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${x}px, ${y}px)`;
      }
      updateDropTarget(state);
      if (state.scrollFrame === undefined && autoScrollStep(state) !== 0) {
        state.scrollFrame = requestAnimationFrame(() => autoScroll(state));
      }
    },
    [autoScroll, updateDropTarget]
  );

  const handleRowTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLElement>, tradeId: string) => {
      finish();
      const target = event.target as HTMLElement;
      if (!enabled || event.touches.length !== 1 || target.closest("button")) {
        return;
      }
      const touch = event.touches[0];
      const state: TouchDragState = {
        tradeId,
        touchId: touch.identifier,
        startX: touch.clientX,
        startY: touch.clientY,
        x: touch.clientX,
        y: touch.clientY,
        active: false,
        dropDate: null,
      };
      state.timer = setTimeout(() => {
        if (stateRef.current !== state) {
          return;
        }
        state.active = true;
        setTouchDrag({ tradeId, x: state.x, y: state.y });
        callbacksRef.current.onDragStart?.(tradeId);
        moveTo(state, state.x, state.y);
      }, TOUCH_DRAG_DELAY_MS);
      stateRef.current = state;
    },
    [enabled, finish, moveTo]
  );

  // Listeners on the table body must exist before the touch starts and be non-passive,
  // otherwise the browser treats the gesture as a scroll and touchmove can't be cancelled.
  const [body, setBody] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!body) {
      return;
    }
    const handleTouchMove = (event: TouchEvent) => {
      const state = stateRef.current;
      const touch = state && findTouch(event.changedTouches, state.touchId);
      if (!state || !touch) {
        return;
      }
      if (!state.active) {
        state.x = touch.clientX;
        state.y = touch.clientY;
        if (
          Math.hypot(touch.clientX - state.startX, touch.clientY - state.startY) > TOUCH_DRAG_SLOP_PX
        ) {
          finish();
        }
        return;
      }
      event.preventDefault();
      moveTo(state, touch.clientX, touch.clientY);
    };
    const handleTouchEnd = (event: TouchEvent) => {
      const state = stateRef.current;
      const touch = state && findTouch(event.changedTouches, state.touchId);
      if (!state || !touch) {
        return;
      }
      if (!state.active) {
        finish();
        return;
      }
      // Suppress the click that would otherwise open the trade editor.
      event.preventDefault();
      const date = findDropDate(touch.clientX, touch.clientY);
      finish();
      if (date) {
        callbacksRef.current.onDrop?.(state.tradeId, date);
      }
    };
    body.addEventListener("touchmove", handleTouchMove, { passive: false });
    body.addEventListener("touchend", handleTouchEnd, { passive: false });
    body.addEventListener("touchcancel", finish);
    return () => {
      body.removeEventListener("touchmove", handleTouchMove);
      body.removeEventListener("touchend", handleTouchEnd);
      body.removeEventListener("touchcancel", finish);
    };
  }, [body, finish, moveTo]);

  useEffect(
    () => () => {
      clearTimeout(stateRef.current?.timer);
      if (stateRef.current?.scrollFrame !== undefined) {
        cancelAnimationFrame(stateRef.current.scrollFrame);
      }
    },
    []
  );

  return {
    bodyRef: setBody,
    ghostRef,
    touchDrag,
    // True while a finger is down on a row, so the native long-press drag can be cancelled.
    isTouchTracking: () => stateRef.current !== null,
    handleRowTouchStart,
  };
}
