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

// Shake detection — DeviceMotion on mobile, Escape key on desktop
export function shakeDetector(onShake: () => void): { destroy: () => void } {
  let lastShake = 0;

  function handleMotion(e: DeviceMotionEvent) {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const magnitude = Math.sqrt(
      (acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2
    );
    const now = Date.now();
    if (magnitude > 20 && now - lastShake > 1000) {
      lastShake = now;
      onShake();
    }
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onShake();
  }

  window.addEventListener('keydown', handleKey);

  // DeviceMotion requires permission on iOS 13+
  if (typeof DeviceMotionEvent !== 'undefined') {
    if (typeof (DeviceMotionEvent as { requestPermission?: () => Promise<string> }).requestPermission === 'function') {
      // iOS — permission must be granted via user gesture; skip auto-register
    } else {
      window.addEventListener('devicemotion', handleMotion);
    }
  }

  return {
    destroy() {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('devicemotion', handleMotion);
    },
  };
}

// Request iOS DeviceMotion permission — call inside a user gesture handler
export async function requestMotionPermission(): Promise<boolean> {
  const DME = DeviceMotionEvent as { requestPermission?: () => Promise<string> };
  if (typeof DME.requestPermission !== 'function') return true;
  const result = await DME.requestPermission();
  return result === 'granted';
}
