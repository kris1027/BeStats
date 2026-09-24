import { describe, expect, it } from "vitest";

import { parseSeasonNumber, parseTmdbId } from "./ids";

/** covers: spec 0006, AC-8 */
describe("parseTmdbId", () => {
  it("accepts a canonical positive integer", () => {
    expect(parseTmdbId("550")).toBe(550);
    expect(parseTmdbId("1")).toBe(1);
  });

  it("accepts the largest id an integer column holds", () => {
    expect(parseTmdbId("2147483647")).toBe(2147483647);
  });

  it("refuses one past it, which the pattern alone would let through", () => {
    expect(parseTmdbId("2147483648")).toBeNull();
    expect(parseTmdbId("9999999999")).toBeNull();
  });

  it.each([
    "",
    "0",
    "0123",
    "-2",
    "+550",
    "550.0",
    "5e2",
    "abc",
    "550abc",
    " 550",
    "12345678901",
    "550\n",
    "٥٥٠",
    "５５０",
  ])("refuses %j", (segment) => {
    expect(parseTmdbId(segment)).toBeNull();
  });
});

/** covers: spec 0009, AC-13 */
describe("parseSeasonNumber", () => {
  it("accepts specials and canonical season numbers", () => {
    expect(parseSeasonNumber("0")).toBe(0);
    expect(parseSeasonNumber("1")).toBe(1);
    expect(parseSeasonNumber("42")).toBe(42);
    expect(parseSeasonNumber("9999")).toBe(9999);
  });

  it.each([
    "",
    "00",
    "01",
    "-1",
    "+1",
    "1.0",
    "1e1",
    "10000",
    "abc",
    " 1",
    "١",
  ])("refuses %j", (segment) => {
    expect(parseSeasonNumber(segment)).toBeNull();
  });
});
