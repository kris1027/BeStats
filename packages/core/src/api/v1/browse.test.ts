import { describe, expect, it } from "vitest";

import {
  nextPageOf,
  v1GenresQuerySchema,
  v1ListParamsSchema,
  v1PageQuerySchema,
  v1PlatformsSchema,
  v1SearchSchema,
} from "./browse";
import { v1LibraryEntrySchema, v1LibraryQuerySchema } from "./library";

/** covers: spec 0035, API surface (`/genres`, `/search`, `/lists`, `/me/library`) */
describe("v1PageQuerySchema", () => {
  it("reads a missing page as 1, as the web does", () => {
    expect(v1PageQuerySchema.parse(undefined)).toBe(1);
    expect(v1PageQuerySchema.parse("3")).toBe(3);
  });

  it.each(["0", "", "501", "1.5", "x"])("refuses %j", (value) => {
    expect(v1PageQuerySchema.safeParse(value).success).toBe(false);
  });
});

describe("v1PlatformsSchema", () => {
  it("takes a list of id and name pairs, and refuses a missing list", () => {
    expect(
      v1PlatformsSchema.parse({ platforms: [{ id: 6, name: "PC" }] }),
    ).toEqual({ platforms: [{ id: 6, name: "PC" }] });
    expect(v1PlatformsSchema.safeParse({}).success).toBe(false);
  });
});

describe("query schemas", () => {
  it("takes only the three catalogs", () => {
    expect(v1GenresQuerySchema.safeParse({ type: "game" }).success).toBe(true);
    expect(v1GenresQuerySchema.safeParse({ type: "music" }).success).toBe(
      false,
    );
  });

  it("refuses a list slug that is not a slug", () => {
    expect(
      v1ListParamsSchema.safeParse({ type: "movie", list: "top-rated" })
        .success,
    ).toBe(true);
    expect(
      v1ListParamsSchema.safeParse({ type: "movie", list: "../x" }).success,
    ).toBe(false);
  });

  it("takes only a library route as the library path", () => {
    expect(
      v1LibraryQuerySchema.parse({ type: "tv", path: "/up-next" }),
    ).toEqual({ type: "tv", path: "/up-next", page: 1 });
    expect(
      v1LibraryQuerySchema.safeParse({ type: "tv", path: "/search" }).success,
    ).toBe(false);
  });
});

describe("nextPageOf", () => {
  it("counts to a known last page", () => {
    expect(nextPageOf(1, 3)).toBe(2);
    expect(nextPageOf(3, 3)).toBeNull();
    expect(nextPageOf(1, 0)).toBeNull();
  });

  it("follows the catalog's has more flag when it sent no count", () => {
    expect(nextPageOf(4, null, true)).toBe(5);
    expect(nextPageOf(4, null, false)).toBeNull();
  });
});

describe("v1SearchSchema", () => {
  it("parses a filtered search page with its scanned range", () => {
    const body = {
      type: "movie",
      mode: "filtered_search",
      page: 1,
      pageSize: 24,
      results: [],
      total: 140,
      totalIsExact: false,
      nextPage: 6,
      scanned: { fromIndex: 1, toIndex: 100 },
    };
    expect(v1SearchSchema.parse(body)).toEqual(body);
  });
});

describe("v1LibraryEntrySchema", () => {
  const movie = {
    type: "movie",
    id: 603,
    path: "/movies/603",
    user: { planned: true, watchedAt: null, rating: null },
  };

  it("keeps a missing card apart from a failed read", () => {
    expect(
      v1LibraryEntrySchema.parse({ ...movie, card: { kind: "missing" } }).card,
    ).toEqual({ kind: "missing" });
    expect(
      v1LibraryEntrySchema.parse({ ...movie, card: null }).card,
    ).toBeNull();
  });

  it("refuses a user state of another type", () => {
    expect(
      v1LibraryEntrySchema.safeParse({
        ...movie,
        user: { status: "playing", rating: null },
        card: null,
      }).success,
    ).toBe(false);
  });
});
