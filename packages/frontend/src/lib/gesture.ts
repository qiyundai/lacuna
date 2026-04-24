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

  function start(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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
  }

  function move(e: PointerEvent) {
    // Cancel if pointer moved significantly (accidental drag)
    if (Math.abs(e.movementX) > 8 || Math.abs(e.movementY) > 8) cancel();
  }

  node.addEventListener('pointerdown', start);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointermove', move);

  return {
    destroy() {
      node.removeEventListener('pointerdown', start);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('pointermove', move);
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
  let lastWheelTime = 0;

  function touchStart(e: TouchEvent) {
    startY = e.touches[0]!.clientY;
  }

  function touchEnd(e: TouchEvent) {
    const deltaY = startY - e.changedTouches[0]!.clientY;
    if (deltaY > threshold) onSwipeDown?.();
    else if (deltaY < -threshold) onSwipeUp?.();
  }

  function wheel(e: WheelEvent) {
    const now = Date.now();
    if (now - lastWheelTime < 800) return; // debounce
    lastWheelTime = now;
    if (e.deltaY > 80) onSwipeDown?.();
    else if (e.deltaY < -80) onSwipeUp?.();
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
