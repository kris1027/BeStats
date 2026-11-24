import { describe, expect, it } from "vitest";

import {
  V1_MORE_LIKE_THIS_LIMIT,
  v1SimilarGamesSchema,
  v1TitleExtrasSchema,
} from "./extras";

const item = {
  id: 1,
  title: "Dune",
  year: 2021,
  releaseDate: "2021-09-15",
  posterUrl: null,
  communityRating: 7.8,
};

describe("v1TitleExtrasSchema", () => {
  it("accepts a title with nothing for the country", () => {
    const body = {
      region: { code: "US", name: "United States" },
      trailer: null,
      ageRating: null,
      watch: null,
      recommendations: [],
    };
    expect(v1TitleExtrasSchema.parse(body)).toEqual(body);
  });

  it("refuses more recommendations than the row shows", () => {
    const body = {
      region: { code: "US", name: "United States" },
      trailer: { key: "dQw4w9WgXcQ", name: "Trailer" },
      ageRating: "PG-13",
      watch: { link: null, stream: [], free: [], rentOrBuy: [] },
      recommendations: Array.from(
        { length: V1_MORE_LIKE_THIS_LIMIT + 1 },
        (_, index) => ({ ...item, id: index + 1 }),
      ),
    };
    expect(v1TitleExtrasSchema.safeParse(body).success).toBe(false);
  });
});

describe("v1SimilarGamesSchema", () => {
  it("accepts cards", () => {
    expect(
      v1SimilarGamesSchema.parse({ results: [item] }).results,
    ).toHaveLength(1);
  });
});
