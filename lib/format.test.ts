import { describe, expect, it } from "vitest";

import {
  formatAirDate,
  formatAirSpan,
  formatEpisodeCount,
  formatPersonalScore,
  formatRuntime,
  formatVoteCount,
  languageName,
  seasonMetaParts,
  truncateAtWord,
} from "./format";

describe("formatRuntime · covers spec 0006 AC-3", () => {
  it("shows hours and minutes", () => {
    expect(formatRuntime(139)).toBe("2h 19m");
  });

  it("drops the hours under an hour", () => {
    expect(formatRuntime(45)).toBe("45m");
  });

  it("drops the minutes on the hour", () => {
    expect(formatRuntime(120)).toBe("2h");
    expect(formatRuntime(60)).toBe("1h");
  });
});

describe("formatVoteCount · covers spec 0006 AC-7", () => {
  it("groups thousands with a comma", () => {
    expect(formatVoteCount(12345)).toBe("12,345 votes");
  });

  it("is singular at one", () => {
    expect(formatVoteCount(1)).toBe("1 vote");
  });

  it("is plural otherwise", () => {
    expect(formatVoteCount(2)).toBe("2 votes");
  });
});

describe("languageName · covers spec 0006 AC-5", () => {
  it("names a known language in English", () => {
    expect(languageName("fr")).toBe("French");
    expect(languageName("ja")).toBe("Japanese");
  });

  it("falls back to the code when the runtime does not know it", () => {
    expect(languageName("xx")).toBe("xx");
    expect(languageName("not a code")).toBe("not a code");
  });
});

describe("truncateAtWord · covers spec 0006 AC-12", () => {
  it("returns text that fits unchanged", () => {
    expect(truncateAtWord("Short.", 160)).toBe("Short.");
    const exact = "a".repeat(160);
    expect(truncateAtWord(exact, 160)).toBe(exact);
  });

  it("cuts at a word boundary and stays within the limit", () => {
    const text =
      "A ticking-time-bomb insomniac and a slippery soap salesman channel primal male aggression into a shocking new form of therapy.";
    const result = truncateAtWord(text, 40);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result).toBe("A ticking-time-bomb insomniac and a…");
  });

  it("trims trailing punctuation before the ellipsis", () => {
    expect(truncateAtWord("One two, three four five", 10)).toBe("One two…");
  });

  it("cuts text one character over the limit", () => {
    const text = `${"word ".repeat(32)}x`;
    expect(text.length).toBe(161);

    const result = truncateAtWord(text, 160);

    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith("word…")).toBe(true);
  });

  it("treats a newline as a word boundary", () => {
    expect(truncateAtWord("First line\nsecond line", 15)).toBe("First line…");
  });

  it("cuts hard when there is no whitespace to cut at", () => {
    const result = truncateAtWord("x".repeat(200), 160);
    expect(result).toBe(`${"x".repeat(159)}…`);
    expect(result.length).toBe(160);
  });
});

describe("formatPersonalScore · covers spec 0007 AC-10", () => {
  it("reads Not rated when there is no score, never zero", () => {
    expect(formatPersonalScore(null)).toBe("Not rated");
  });

  it.each([
    [1, "1"],
    [8, "8"],
    [10, "10"],
  ])("shows the integer score %s with no decimal", (value, expected) => {
    expect(formatPersonalScore(value)).toBe(expected);
  });

  it("rounds a calculated average to one decimal for display only", () => {
    expect(formatPersonalScore(7.25)).toBe("7.3");
    expect(formatPersonalScore(6.666)).toBe("6.7");
  });

  it("keeps a one decimal average that rounds to a whole number as x.0", () => {
    // 7.96 is an average, not an integer score, so it keeps the decimal that
    // tells the two apart.
    expect(formatPersonalScore(7.96)).toBe("8.0");
  });
});

describe("formatAirSpan · covers spec 0009 AC-4", () => {
  const span = (
    firstAirYear: number | null,
    lastAirYear: number | null,
    status: string,
  ) => formatAirSpan({ firstAirYear, lastAirYear, status });

  it("closes the span for an ended or canceled show", () => {
    expect(span(2008, 2013, "Ended")).toBe("2008–2013");
    expect(span(2019, 2020, "Canceled")).toBe("2019–2020");
  });

  it("shows one year when it ended the year it began", () => {
    expect(span(2016, 2016, "Ended")).toBe("2016");
  });

  it("stays open while something has aired and it has not ended", () => {
    expect(span(2011, 2024, "Returning Series")).toBe("2011–present");
    expect(span(2011, 2024, "")).toBe("2011–present");
  });

  it("shows only the first year when nothing has aired", () => {
    expect(span(2027, null, "Planned")).toBe("2027");
    expect(span(2027, null, "Ended")).toBe("2027");
  });

  it("is absent with no first air year", () => {
    expect(span(null, 2013, "Ended")).toBeNull();
  });

  it("compares the status exactly", () => {
    expect(span(2008, 2013, "ended")).toBe("2008–present");
  });
});

describe("formatEpisodeCount · covers spec 0009 AC-7", () => {
  it("counts in words", () => {
    expect(formatEpisodeCount(0)).toBe("No episodes listed yet");
    expect(formatEpisodeCount(1)).toBe("1 episode");
    expect(formatEpisodeCount(13)).toBe("13 episodes");
  });
});

describe("seasonMetaParts · covers spec 0009 AC-7", () => {
  it("joins the year and the count, leaving a missing year out", () => {
    expect(seasonMetaParts("2009-03-08", 13)).toEqual(["2009", "13 episodes"]);
    expect(seasonMetaParts(null, 0)).toEqual(["No episodes listed yet"]);
  });

  it("leaves out a year it cannot read rather than guessing one", () => {
    expect(seasonMetaParts("", 1)).toEqual(["1 episode"]);
    expect(seasonMetaParts("soon", 2)).toEqual(["2 episodes"]);
  });
});

describe("formatAirDate · covers spec 0009 AC-10", () => {
  it("formats TMDB's calendar date in en-US", () => {
    expect(formatAirDate("2013-03-03")).toBe("Mar 3, 2013");
    expect(formatAirDate("2008-01-20")).toBe("Jan 20, 2008");
  });

  it("never shifts the day with the server's timezone", () => {
    const original = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(formatAirDate("2013-01-01")).toBe("Jan 1, 2013");
    } finally {
      process.env.TZ = original;
    }
  });

  it("is null for a missing or malformed date", () => {
    expect(formatAirDate(null)).toBeNull();
    expect(formatAirDate("")).toBeNull();
    expect(formatAirDate("2013")).toBeNull();
    expect(formatAirDate("2013-02-30")).toBeNull();
    expect(formatAirDate("not a date")).toBeNull();
  });
});
