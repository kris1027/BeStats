import { describe, expect, it } from "vitest";
import { isTmdbNotFound, TmdbError } from "./errors";
import { failureProfile, toFailure, unwrap } from "./result";

/**
 * Regression cover for the `use cache` boundary bug.
 *
 * A `TmdbError` thrown out of a cached scope reached callers as a plain
 * `Error`: no prototype, no `kind`. Two callers branch on that kind, the
 * `isTmdbNotFound` check a page uses to call `notFound()` and the `not_found`
 * test in `batch.ts` that fills `missingIds`, so both silently took the wrong
 * branch in the running app while the fixture suite stayed green.
 *
 * These cases pin the flatten and rebuild pair that fixes it. They cannot
 * execute a real cache boundary, which needs the built app, so the boundary
 * itself stays a runtime step in the spec's `verify.md`.
 */
describe("TMDB failure envelope", () => {
  it("rebuilds an error that still answers isTmdbNotFound · covers AC-10, AC-26", () => {
    const original = new TmdbError(
      "not_found",
      "/movie/999999999",
      "TMDB responded 404 for /movie/999999999",
      404,
    );

    const rebuilt = (() => {
      try {
        unwrap({ ok: false, failure: toFailure(original) });
      } catch (error) {
        return error;
      }
    })();

    expect(isTmdbNotFound(rebuilt)).toBe(true);
    expect(rebuilt).toBeInstanceOf(TmdbError);
  });

  it("carries every kind across, not just not_found · covers AC-19", () => {
    const kinds = [
      "not_found",
      "unauthorized",
      "rate_limited",
      "timeout",
      "upstream",
      "bad_response",
    ] as const;

    for (const kind of kinds) {
      const original = new TmdbError(
        kind,
        "/movie/550",
        `failed: ${kind}`,
        500,
      );
      let rebuilt: unknown;
      try {
        unwrap({ ok: false, failure: toFailure(original) });
      } catch (error) {
        rebuilt = error;
      }

      expect(rebuilt).toBeInstanceOf(TmdbError);
      expect((rebuilt as TmdbError).kind).toBe(kind);
      expect((rebuilt as TmdbError).status).toBe(500);
      expect((rebuilt as TmdbError).endpoint).toBe("/movie/550");
      expect((rebuilt as TmdbError).message).toBe(`failed: ${kind}`);
    }
  });

  it("is a plain object, so a cache entry can hold it", () => {
    const failure = toFailure(
      new TmdbError("timeout", "/tv/1396", "timed out", null),
    );

    expect(failure.constructor).toBe(Object);
    expect(JSON.parse(JSON.stringify(failure))).toEqual(failure);
  });

  it("lets a non TMDB error throw rather than disguising it as a TMDB kind", () => {
    const bug = new TypeError("cannot read property of undefined");

    expect(() => toFailure(bug)).toThrow(bug);
  });

  it("returns the value untouched on success", () => {
    const value = { id: 550, title: "Fight Club" };

    expect(unwrap({ ok: true, value })).toBe(value);
  });
});

describe("failureProfile", () => {
  it("caches a transient failure for seconds, so a retry really retries · covers spec 0006 AC-10", () => {
    expect(failureProfile("timeout")).toBe("seconds");
    expect(failureProfile("rate_limited")).toBe("seconds");
    expect(failureProfile("upstream")).toBe("seconds");
  });

  it("caches a settled failure for minutes · covers spec 0006 AC-10", () => {
    expect(failureProfile("not_found")).toBe("minutes");
    expect(failureProfile("unauthorized")).toBe("minutes");
    expect(failureProfile("bad_response")).toBe("minutes");
  });
});
