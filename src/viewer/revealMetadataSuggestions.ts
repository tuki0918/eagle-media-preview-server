/** Reveal mobile suggestions by scrolling only the details panel, keeping the input visible. */
export function revealMetadataSuggestions(input: HTMLElement, list: HTMLElement) {
  if (!(window.matchMedia?.("(max-width: 540px)").matches ?? window.innerWidth <= 540)) return;
  const panel = list.closest<HTMLElement>(".preview-info");
  if (!panel) return;

  const panelBounds = panel.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
  const handleHeight = panel.querySelector(".preview-info-handle")?.getBoundingClientRect().height ?? 0;
  const top = Math.max(panelBounds.top, viewportTop) + handleHeight + 8;
  const bottom = Math.min(panelBounds.bottom, viewportBottom) - 16;
  if (bottom <= top) return;

  const inputTop = input.getBoundingClientRect().top;
  const overflow = list.getBoundingClientRect().bottom - bottom;
  const delta = inputTop < top ? inputTop - top : Math.min(Math.max(0, overflow), inputTop - top);
  if (Math.abs(delta) < 1) return;
  panel.scrollBy({ top: delta, behavior: "auto" });
}
