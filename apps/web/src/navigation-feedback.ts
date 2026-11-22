/** A shared underline follows the pointer; content changes only on release. */
export function installNavigationFeedback(root: Document, selector = ".quiet-tabs") {
  const active = ".on,.is-on,.is-current,.is-active,.active,.current,[aria-selected='true'],[aria-pressed='true']";
  const groups = new Map<HTMLElement, () => void>();
  const reduced = root.defaultView!.matchMedia("(prefers-reduced-motion: reduce)");

  function attach(group: HTMLElement) {
    const marker = root.createElement("div");
    marker.className = "navigation-indicator";
    marker.setAttribute("aria-hidden", "true");
    group.append(marker);
    group.dataset.navFeedback = "true";
    let frame = 0;
    let keyboardInput = false;
    let suppressClick = false;
    let suppressTimer = 0;
    let gesture: { id: number; x: number; y: number; dragging: boolean; button: HTMLButtonElement; rects: { button: HTMLButtonElement; rect: DOMRect }[] } | null = null;
    const buttons = () => Array.from(group.children).filter((el): el is HTMLButtonElement => el instanceof HTMLButtonElement);
    const current = () => buttons().find(button => button.matches(active));
    const paint = (button?: HTMLButtonElement, immediate = false, center?: number) => {
      marker.style.transitionDuration = immediate || keyboardInput || reduced.matches ? "0ms" : "180ms";
      marker.hidden = !button;
      if (!button) return;
      const box = group.getBoundingClientRect();
      // offset dimensions do not shrink with the pressed button's transform.
      const x = center === undefined ? button.offsetLeft : center - box.left + group.scrollLeft - button.offsetWidth / 2;
      marker.style.transform = `translate3d(${x}px,${button.offsetTop + button.offsetHeight - 2}px,0) scaleX(${button.offsetWidth})`;
    };
    const sync = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        group.dataset.navOverflow = group.scrollWidth > group.clientWidth + 2 ? "true" : "false";
        if (!gesture) paint(current());
      });
    };
    const release = () => {
      if (!gesture) return;
      const id = gesture.id;
      for (const button of buttons()) delete button.dataset.navPressed;
      gesture = null;
      if (group.hasPointerCapture(id)) group.releasePointerCapture(id);
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || gesture) return;
      const button = (event.target as Element).closest("button");
      if (!(button instanceof HTMLButtonElement) || button.parentElement !== group || button.disabled) return;
      keyboardInput = false;
      clearTimeout(suppressTimer); suppressClick = false;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false, button,
        rects: buttons().filter(b => !b.disabled).map(button => ({ button, rect: button.getBoundingClientRect() })) };
      button.dataset.navPressed = "true";
      paint(button);
    };
    const move = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
        // Overflowing rows retain the browser's horizontal scrolling gesture.
        if (Math.abs(dy) >= Math.abs(dx) || group.dataset.navOverflow === "true") { release(); paint(current()); return; }
        gesture.dragging = true;
        group.setPointerCapture(event.pointerId);
      }
      event.preventDefault();
      const nearest = gesture.rects.reduce((best, item) => {
        const distance = (r: DOMRect) => Math.hypot(event.clientX - (r.left + r.width / 2), event.clientY - (r.top + r.height / 2));
        return distance(item.rect) < distance(best.rect) ? item : best;
      });
      if (gesture.button !== nearest.button) {
        delete gesture.button.dataset.navPressed;
        gesture.button = nearest.button;
        nearest.button.dataset.navPressed = "true";
      }
      const row = gesture.rects.filter(item => Math.abs(item.rect.top - nearest.rect.top) < 4);
      const min = Math.min(...row.map(item => item.rect.left + item.rect.width / 2));
      const max = Math.max(...row.map(item => item.rect.right - item.rect.width / 2));
      paint(nearest.button, true, Math.max(min, Math.min(max, event.clientX)));
    };
    const up = (event: PointerEvent) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const { dragging, button } = gesture;
      release();
      if (dragging) {
        // The programmatic click uses the existing React action exactly once.
        button.click();
        suppressClick = true;
        suppressTimer = window.setTimeout(() => { suppressClick = false; }, 500);
      }
      sync();
    };
    const cancel = (event: PointerEvent) => {
      if (gesture?.id !== event.pointerId) return;
      release(); paint(current());
    };
    const lostCapture = (event: PointerEvent) => {
      // Touch starts with implicit capture on the button. Moving capture to
      // the row emits a bubbling loss from that button, not a cancelled drag.
      if (event.target === group) cancel(event);
    };
    const click = (event: MouseEvent) => {
      if (suppressClick && event.isTrusted && event.detail > 0) {
        suppressClick = false; event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    const keyboard = () => { keyboardInput = true; release(); marker.style.transitionDuration = "0ms"; };
    const resize = new ResizeObserver(sync);
    resize.observe(group);
    for (const button of buttons()) resize.observe(button);
    const changes = new MutationObserver(records => {
      if (records.every(record => record.target === marker)) return;
      for (const button of buttons()) resize.observe(button);
      sync();
    });
    changes.observe(group, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-selected", "aria-pressed", "disabled"] });
    group.addEventListener("pointerdown", down);
    group.addEventListener("pointermove", move);
    root.addEventListener("pointerup", up);
    root.addEventListener("pointercancel", cancel);
    group.addEventListener("lostpointercapture", lostCapture);
    group.addEventListener("click", click, true);
    group.addEventListener("keydown", keyboard);
    paint(current(), true); sync();
    groups.set(group, () => {
      release(); cancelAnimationFrame(frame); clearTimeout(suppressTimer);
      changes.disconnect(); resize.disconnect(); marker.remove();
      delete group.dataset.navFeedback; delete group.dataset.navOverflow;
      group.removeEventListener("pointerdown", down); group.removeEventListener("pointermove", move);
      root.removeEventListener("pointerup", up); root.removeEventListener("pointercancel", cancel);
      group.removeEventListener("lostpointercapture", lostCapture); group.removeEventListener("click", click, true);
      group.removeEventListener("keydown", keyboard);
    });
  }
  const discover = () => {
    for (const [group, cleanup] of groups) if (!group.isConnected) { cleanup(); groups.delete(group); }
    for (const group of root.querySelectorAll<HTMLElement>(selector)) if (!groups.has(group)) attach(group);
  };
  const additions = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node => node instanceof HTMLElement && !node.matches(".navigation-indicator")))) discover();
  });
  discover(); additions.observe(root.body, { childList: true, subtree: true });
  return () => { additions.disconnect(); for (const cleanup of groups.values()) cleanup(); groups.clear(); };
}
