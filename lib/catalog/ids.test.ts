import { describe, expect, it } from "vitest";

import { parseMovieId } from "./ids";

/** covers: spec 0006, AC-8 */
describe("parseMovieId", () => {
  it("accepts a canonical positive integer", () => {
    expect(parseMovieId("550")).toBe(550);
    expect(parseMovieId("1")).toBe(1);
  });

  it("accepts the largest id an integer column holds", () => {
    expect(parseMovieId("2147483647")).toBe(2147483647);
  });

  it("refuses one past it, which the pattern alone would let through", () => {
    expect(parseMovieId("2147483648")).toBeNull();
    expect(parseMovieId("9999999999")).toBeNull();
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
    expect(parseMovieId(segment)).toBeNull();
  });
});
