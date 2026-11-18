/**
 * Runs an async mapper over a list with a ceiling on how many run at once.
 *
 * Spec 0001 accepted an N+1 on list screens, so a watchlist of fifty titles is
 * fifty TMDB reads. Firing all fifty at once is how an app earns a 429 from
 * TMDB; this keeps a bounded number in flight instead. Results come back in
 * input order regardless of completion order, because a caller pairing results
 * with ids by position must not be surprised.
 *
 * This bounds one call inside one process. It is not a fleet wide limiter, and
 * spec 0002 records that gap as accepted at current traffic.
 *
 * @param items The inputs.
 * @param limit How many mapper calls may be in flight at once.
 * @param mapper The async work for one input.
 * @returns The results, in input order.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
