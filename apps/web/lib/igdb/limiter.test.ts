import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installIgdbMock,
  restoreIgdbMock,
  settle,
} from "./__fixtures__/helpers";
import { igdbRequest } from "./client";
import type { IgdbError } from "./errors";
import { createLimiter, type ReleaseSlot, SlotWaitExceeded } from "./limiter";
import { recordsSchema } from "./schemas";

/**
 * The limiter: 4 open at once, starts 250 ms apart, and a bounded wait that
 * fails unsent (spec 0023, AC-6).
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(restoreIgdbMock);

describe("createLimiter", () => {
  it("spaces starts at least 250 ms apart", async () => {
    const limiter = createLimiter();
    const startedAt: number[] = [];
    for (let i = 0; i < 4; i++) {
      void limiter.acquire(5_000).then((release) => {
        startedAt.push(Date.now());
        release();
      });
    }
    await vi.runAllTimersAsync();

    expect(startedAt).toHaveLength(4);
    for (let i = 1; i < startedAt.length; i++) {
      expect(startedAt[i] - startedAt[i - 1]).toBeGreaterThanOrEqual(250);
    }
  });

  it("keeps at most 4 open, and opens the next as one is released", async () => {
    const limiter = createLimiter();
    const held: ReleaseSlot[] = [];
    for (let i = 0; i < 5; i++) {
      void limiter.acquire(60_000).then((release) => held.push(release));
    }
    await vi.advanceTimersByTimeAsync(5_000);
    expect(held).toHaveLength(4);

    held[0]();
    held[0]();
    await vi.advanceTimersByTimeAsync(300);
    expect(held).toHaveLength(5);
  });

  it("rejects a caller that waited past its bound", async () => {
    const limiter = createLimiter({ maxOpen: 1 });
    await limiter.acquire(5_000);

    const { error } = await settle(limiter.acquire(5_000));

    expect(error).toBeInstanceOf(SlotWaitExceeded);
  });
});

describe("the client behind the limiter", () => {
  it("fails a request as rate_limited, unsent, after 5 seconds without a slot", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const mock = installIgdbMock({ igdb: [{ hangs: true }] });
    // Hold every slot with requests that never answer (no abort timer fires
    // here, because AbortSignal.timeout is not on fake timers).
    const blockers = Array.from({ length: 4 }, () =>
      igdbRequest("games", "fields name; limit 1;", recordsSchema).catch(
        () => null,
      ),
    );
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mock.igdbCalls).toHaveLength(4);

    const queued = igdbRequest("games", "fields name; limit 1;", recordsSchema);
    const outcome = queued.then(
      () => null,
      (error: IgdbError) => error,
    );
    await vi.advanceTimersByTimeAsync(5_000);

    const error = await outcome;
    expect(error?.kind).toBe("rate_limited");
    expect(mock.igdbCalls).toHaveLength(4);
    void blockers;
  });
});
