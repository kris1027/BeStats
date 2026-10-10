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
