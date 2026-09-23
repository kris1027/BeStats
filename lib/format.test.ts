import { describe, expect, it } from "vitest";

import {
  formatRuntime,
  formatVoteCount,
  languageName,
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
