import { describe, expect, it } from "vitest";

import { airStatus, todayUtc } from "./air-status";

/**
 * covers: spec 0011, AC-3
 *
 * The one eligibility rule. The boundary is the UTC calendar day, so the
 * cases sit on yesterday, today and tomorrow, plus the two ways a date can be
 * missing.
 */
describe("todayUtc", () => {
  it("is the UTC date, whatever the local zone would say", () => {
    expect(todayUtc(new Date("2026-09-25T23:59:59Z"))).toBe("2026-09-25");
    expect(todayUtc(new Date("2026-09-26T00:00:00Z"))).toBe("2026-09-26");
    expect(todayUtc(new Date("2026-09-25T20:00:00-05:00"))).toBe("2026-09-26");
  });
});

describe("airStatus", () => {
  const today = "2026-09-25";

  it.each([
    ["2026-09-24", "aired"],
    ["2026-09-25", "aired"],
    ["2026-09-26", "upcoming"],
    ["1999-01-01", "aired"],
    ["2031-01-01", "upcoming"],
  ] as const)("%s is %s", (date, status) => {
    expect(airStatus(date, today)).toBe(status);
  });

  it.each([
    ["no date", null],
    ["an empty string", ""],
    ["a rolled over date", "2013-02-30"],
    ["a month 13", "2013-13-01"],
    ["a timestamp", "2013-02-03T00:00:00Z"],
    ["a short year", "13-02-03"],
  ])("%s is unknown", (_, date) => {
    expect(airStatus(date, today)).toBe("unknown");
  });
});

describe("the UTC midnight boundary (spec 0011, Value sourcing: today)", () => {
  it("flips an episode dated the new day from upcoming to aired at 00:00 UTC", () => {
    const before = todayUtc(new Date("2026-09-25T23:59:59.999Z"));
    const after = todayUtc(new Date("2026-09-26T00:00:00.000Z"));
    expect(airStatus("2026-09-26", before)).toBe("upcoming");
    expect(airStatus("2026-09-26", after)).toBe("aired");
  });

  it("does not flip at local midnight in a zone behind UTC", () => {
    // 00:30 on the 26th in New York is already 04:30 UTC; 23:30 on the 25th
    // there is 03:30 UTC on the 26th. Both are the UTC day 26.
    const lateLocal = todayUtc(new Date("2026-09-25T23:30:00-04:00"));
    expect(airStatus("2026-09-26", lateLocal)).toBe("aired");
  });

  it("does not flip at local midnight in a zone ahead of UTC", () => {
    // 00:30 on the 26th in Tokyo is still 15:30 UTC on the 25th.
    const earlyLocal = todayUtc(new Date("2026-09-26T00:30:00+09:00"));
    expect(airStatus("2026-09-26", earlyLocal)).toBe("upcoming");
  });
});
