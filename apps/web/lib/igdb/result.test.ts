import { describe, expect, it } from "vitest";
import {
  IgdbError,
  type IgdbErrorKind,
  IgdbValidationError,
  isIgdbNotFound,
} from "./errors";
import { failureProfile, toFailure, unwrap } from "./result";

/**
 * How a failure crosses the `use cache` boundary (spec 0023, AC-7). The
 * cached read returns a plain object; `unwrap` rebuilds the error with its
 * kind, so `isIgdbNotFound` still works on the far side.
 */

const KINDS: IgdbErrorKind[] = [
  "not_found",
  "unauthorized",
  "rate_limited",
  "timeout",
  "upstream",
  "bad_response",
];

describe("toFailure and unwrap", () => {
  it.each(KINDS)(
    "round trips a %s error with its kind, status and endpoint",
    (kind) => {
      const original = new IgdbError(kind, "games", "It failed.", 503);

      const failure = toFailure(original);
      // What a cache stores must survive JSON, the way Next serializes it.
      const cached = JSON.parse(JSON.stringify(failure));
      const rebuilt = (() => {
        try {
          unwrap({ ok: false, failure: cached });
        } catch (error) {
          return error;
        }
      })();

      expect(rebuilt).toBeInstanceOf(IgdbError);
      expect(rebuilt).toMatchObject({
        kind,
        status: 503,
        endpoint: "games",
        message: "It failed.",
        name: "IgdbError",
      });
    },
  );

  it("keeps a null status as null", () => {
    expect(toFailure(new IgdbError("timeout", "token", "Slow."))).toEqual({
      kind: "timeout",
      status: null,
      endpoint: "token",
      message: "Slow.",
    });
  });

  it("rethrows anything that is not an IgdbError, so it is never cached", () => {
    const crash = new TypeError("boom");
    expect(() => toFailure(crash)).toThrow(crash);
    const invalid = new IgdbValidationError("page", "Bad page.");
    expect(() => toFailure(invalid)).toThrow(invalid);
  });

  it("hands back the value of a success", () => {
    const value = { id: 1942 };
    expect(unwrap({ ok: true, value })).toBe(value);
  });

  it("keeps isIgdbNotFound true after the round trip", () => {
    const failure = toFailure(new IgdbError("not_found", "games", "Missing."));
    let rebuilt: unknown;
    try {
      unwrap({ ok: false, failure });
    } catch (error) {
      rebuilt = error;
    }
    expect(isIgdbNotFound(rebuilt)).toBe(true);
  });
});

describe("failureProfile", () => {
  it.each([
    ["timeout", "seconds"],
    ["rate_limited", "seconds"],
    ["upstream", "seconds"],
    ["not_found", "minutes"],
    ["unauthorized", "minutes"],
    ["bad_response", "minutes"],
  ] as const)("caches a %s failure for %s", (kind, profile) => {
    expect(failureProfile(kind)).toBe(profile);
  });
});

describe("isIgdbNotFound", () => {
  it.each(KINDS.filter((kind) => kind !== "not_found"))(
    "is false for a %s error, so an outage never becomes a 404",
    (kind) => {
      expect(isIgdbNotFound(new IgdbError(kind, "games", "x"))).toBe(false);
    },
  );

  it("is false for a look alike that is not an IgdbError", () => {
    const fake = Object.assign(new Error("x"), { kind: "not_found" });
    expect(isIgdbNotFound(fake)).toBe(false);
    expect(isIgdbNotFound({ kind: "not_found" })).toBe(false);
    expect(isIgdbNotFound(null)).toBe(false);
  });
});
