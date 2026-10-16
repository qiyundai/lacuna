// Hold detection — fires onHold after durationMs of continuous pointer contact
export function holdDetector(
  node: HTMLElement,
  {
    onHold,
    onHoldStart,
    onHoldCancel,
    durationMs = 600,
  }: {
    onHold: () => void;
    onHoldStart?: () => void;
    onHoldCancel?: () => void;
    durationMs?: number;
  }
): { destroy: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let holding = false;
  let pointerId: number | null = null;
  let startX = 0, startY = 0;

  function start(e: PointerEvent) {
    if (pointerId !== null || (e.target as Element)?.closest('button, a')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = e.clientX; startY = e.clientY;
    if (e.pointerType !== 'mouse') {
      e.preventDefault();
      // Claim exclusive pointer ownership so Android can't interpret the
      // ongoing contact as a text-selection gesture.
      try { node.setPointerCapture(e.pointerId); } catch {}
    }
    holding = false;
    onHoldStart?.();
    timer = setTimeout(() => {
      holding = true;
      onHold();
    }, durationMs);
  }

  function cancel() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!holding) onHoldCancel?.();
    holding = false;
    pointerId = null;
  }

  function move(e: PointerEvent) {
    // Cancel if pointer moved significantly (accidental drag)
    if (e.pointerId === pointerId && (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8)) cancel();
  }

  function preventContextMenu(e: Event) {
    e.preventDefault();
  }

  function preventSelect(e: Event) {
    e.preventDefault();
  }

  node.addEventListener('pointerdown', start);
  window.addEventListener('pointerup', cancel);
  window.addEventListener('pointercancel', cancel);
  node.addEventListener('lostpointercapture', cancel);
  node.addEventListener('pointermove', move);
  node.addEventListener('contextmenu', preventContextMenu);
  node.addEventListener('selectstart', preventSelect);

  return {
    destroy() {
      node.removeEventListener('pointerdown', start);
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
      node.removeEventListener('lostpointercapture', cancel);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('contextmenu', preventContextMenu);
      node.removeEventListener('selectstart', preventSelect);
      if (timer) clearTimeout(timer);
    },
  };
}

// Swipe detection — fires onSwipeDown / onSwipeUp based on touch or wheel
export function swipeDetector(
  node: HTMLElement,
  {
    onSwipeDown,
    onSwipeUp,
    threshold = 60,
  }: {
    onSwipeDown?: () => void;
    onSwipeUp?: () => void;
    threshold?: number;
  }
): { destroy: () => void } {
  let startY = 0;
  let startX = 0;
  let target: Element | null = null;
  let scrollStarts = new Map<HTMLElement, number>();
  let lastWheelTime = 0;

  function touchStart(e: TouchEvent) {
    if (e.touches.length !== 1) { target = null; return; }
    target = e.target as Element;
    startY = e.touches[0]!.clientY;
    startX = e.touches[0]!.clientX;
    scrollStarts = new Map();
    for (let el: Element | null = target; el && el !== node; el = el.parentElement) {
      if (el instanceof HTMLElement) scrollStarts.set(el, el.scrollTop);
    }
  }

  function touchEnd(e: TouchEvent) {
    if (!target || !e.changedTouches[0]) return;
    const deltaY = startY - e.changedTouches[0]!.clientY;
    if (Math.abs(startX - e.changedTouches[0].clientX) >= Math.abs(deltaY) || consumesScroll(target, deltaY, scrollStarts)) return;
    if (deltaY > threshold) onSwipeDown?.();
    else if (deltaY < -threshold) onSwipeUp?.();
  }

  function wheel(e: WheelEvent) {
    if (consumesScroll(e.target as Element, e.deltaY) || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const now = Date.now();
    if (now - lastWheelTime < 800) return; // debounce
    if (e.deltaY > 30) { lastWheelTime = now; onSwipeDown?.(); }
    else if (e.deltaY < -30) { lastWheelTime = now; onSwipeUp?.(); }
  }

  function consumesScroll(element: Element, delta: number, starts?: Map<HTMLElement, number>): boolean {
    if (element.closest('button, a, input, textarea, [role="dialog"]')) return true;
    for (let el: Element | null = element; el && el !== node; el = el.parentElement) {
      if (el instanceof HTMLElement && /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) {
        const top = starts?.get(el) ?? el.scrollTop;
        if (delta < 0 && top > 0) return true;
        if (delta > 0 && top + el.clientHeight < el.scrollHeight - 1) return true;
      }
    }
    return false;
  }

  node.addEventListener('touchstart', touchStart, { passive: true });
  node.addEventListener('touchend', touchEnd, { passive: true });
  node.addEventListener('wheel', wheel, { passive: true });

  return {
    destroy() {
      node.removeEventListener('touchstart', touchStart);
      node.removeEventListener('touchend', touchEnd);
      node.removeEventListener('wheel', wheel);
    },
  };
}
