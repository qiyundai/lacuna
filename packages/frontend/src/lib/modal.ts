// Full-screen overlays live outside the translated spaces and retain keyboard focus.
export function modal(node: HTMLElement, options: { dismiss?: () => void } = {}) {
  const previous = document.activeElement as HTMLElement | null;
  document.body.appendChild(node);
  node.focus();
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.stopPropagation(); options.dismiss?.(); }
    if (event.key !== 'Tab') return;
    const controls = [...node.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]')];
    const first = controls[0] ?? node, last = controls.at(-1) ?? node;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === node)) { event.preventDefault(); first.focus(); }
  }
  node.addEventListener('keydown', keydown);
  return { destroy() { node.removeEventListener('keydown', keydown); node.remove(); if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true }); } };
}
