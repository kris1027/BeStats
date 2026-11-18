/**
 * The neighbour walk both library controls use when a card is about to leave
 * its grid (spec 0014, AC-16, carried into spec 0020, AC-9 and AC-17): the
 * next card first, else the previous one, so the focus stays in reading order
 * and never drops to the page.
 *
 * @param item The leaving card's `li`.
 * @param selector What counts as a focus target inside a neighbour.
 * @returns The first neighbour's target, or null when neither has one.
 */
export function neighbourCardTarget(
  item: Element | null | undefined,
  selector: string,
): HTMLElement | null {
  for (const neighbour of [
    item?.nextElementSibling,
    item?.previousElementSibling,
  ]) {
    const target = neighbour?.querySelector<HTMLElement>(selector);
    if (target) return target;
  }
  return null;
}

/**
 * The element with `id` on the page being shown. After a client navigation
 * between library pages Next keeps the page left behind mounted but hidden
 * (React's `Activity`, `display: none`), so its heading and card links still
 * carry the same ids, and `getElementById` can return the hidden copy, which
 * cannot take the focus (spec 0008, AC-16; prompts/library-page-urls.md).
 * Every library focus move looks its target up here instead.
 *
 * @returns The first copy outside a hidden subtree, or null when every copy
 * is hidden, so the focus is never sent somewhere it cannot land.
 */
export function shownElementById(id: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(
    `[id="${id}"]`,
  )) {
    if (!isHidden(element)) return element;
  }
  return null;
}

/** Hidden by CSS; where `checkVisibility` is missing, by an inline `display: none`. */
function isHidden(element: HTMLElement): boolean {
  if (typeof element.checkVisibility === "function") {
    return !element.checkVisibility();
  }
  return element.closest('[style*="display: none"]') !== null;
}
