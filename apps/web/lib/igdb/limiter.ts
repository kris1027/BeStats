import "server-only";
import { IGDB_MAX_OPEN, IGDB_MIN_SPACING_MS } from "./constants";

/**
 * The in process request limiter (spec 0023, AC-6).
 *
 * A slot pool plus a minimum spacing between starts: at most `maxOpen`
 * requests are open at once and no two start closer than `minSpacingMs`. That
 * one mechanism keeps a burst under IGDB's 4 a second and its open request
 * limit together. A caller waits at most its own bound for a slot and then
 * fails without sending anything, so a queue can never hold a render for long.
 *
 * It bounds one server instance, not the fleet; spec 0023 accepts that gap and
 * lets 429 retries absorb it.
 */

/** Hands a slot back. Calling it twice is harmless. */
export type ReleaseSlot = () => void;

/** Raised when no slot came free within the caller's bound. */
export class SlotWaitExceeded extends Error {
  constructor() {
    super("No IGDB request slot came free in time");
    this.name = "SlotWaitExceeded";
  }
}

export type Limiter = {
  acquire(maxWaitMs: number): Promise<ReleaseSlot>;
};

type Waiter = {
  resolve: (release: ReleaseSlot) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Builds a limiter. Exported for the tests, which build their own with small
 * numbers; the client uses the shared instance below.
 */
export function createLimiter({
  maxOpen = IGDB_MAX_OPEN,
  minSpacingMs = IGDB_MIN_SPACING_MS,
}: {
  maxOpen?: number;
  minSpacingMs?: number;
} = {}): Limiter {
  const queue: Waiter[] = [];
  let open = 0;
  let lastStartAt = Number.NEGATIVE_INFINITY;
  let pumpTimer: ReturnType<typeof setTimeout> | null = null;

  function pump(): void {
    if (pumpTimer !== null) return;
    while (queue.length > 0 && open < maxOpen) {
      const waitMs = lastStartAt + minSpacingMs - Date.now();
      if (waitMs > 0) {
        pumpTimer = setTimeout(() => {
          pumpTimer = null;
          pump();
        }, waitMs);
        return;
      }
      const waiter = queue.shift() as Waiter;
      clearTimeout(waiter.timer);
      open++;
      lastStartAt = Date.now();
      let released = false;
      waiter.resolve(() => {
        if (released) return;
        released = true;
        open--;
        pump();
      });
    }
  }

  return {
    acquire(maxWaitMs) {
      return new Promise<ReleaseSlot>((resolve, reject) => {
        const waiter: Waiter = {
          resolve,
          timer: setTimeout(() => {
            const index = queue.indexOf(waiter);
            if (index !== -1) queue.splice(index, 1);
            reject(new SlotWaitExceeded());
          }, maxWaitMs),
        };
        queue.push(waiter);
        pump();
      });
    },
  };
}

let shared = createLimiter();

/** The one limiter every IGDB request goes through. */
export function igdbLimiter(): Limiter {
  return shared;
}

/** A fresh shared limiter, so one test's queue never leaks into the next. */
export function resetIgdbLimiter(): void {
  shared = createLimiter();
}
