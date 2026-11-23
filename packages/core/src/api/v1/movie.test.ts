import { describe, expect, it } from "vitest";

import { TRACKING_MESSAGES } from "../../tracking/messages";
import type { MovieTrackingResult } from "../../tracking/types";
import { V1_ERROR_STATUS } from "./errors";
import {
  MOVIE_ERROR_TO_V1,
  movieErrorFromReason,
  movieIdParamSchema,
  v1MovieSchema,
  v1MovieWriteOkSchema,
} from "./movie";
import { v1ShowSchema } from "./show";

describe("movieIdParamSchema", () => {
  it("accepts a positive integer id", () => {
    expect(movieIdParamSchema.parse("603")).toBe(603);
  });

  it("refuses anything else", () => {
    for (const value of ["0", "-1", "1.5", "abc", "", "99999999999"]) {
      expect(movieIdParamSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("MOVIE_ERROR_TO_V1", () => {
  it("maps every action error to a known v1 code", () => {
    for (const error of Object.keys(TRACKING_MESSAGES)) {
      const code = MOVIE_ERROR_TO_V1[error as keyof typeof MOVIE_ERROR_TO_V1];
      expect(V1_ERROR_STATUS[code]).toBeTypeOf("number");
      expect(movieErrorFromReason(error)).toBe(error);
    }
  });

  it("answers 409 for the release gate", () => {
    expect(V1_ERROR_STATUS[MOVIE_ERROR_TO_V1.not_released]).toBe(409);
  });
});

describe("v1MovieWriteOkSchema", () => {
  it("parses both success shapes of the action's result", () => {
    const plain: MovieTrackingResult = { ok: true };
    const cleared: MovieTrackingResult = {
      ok: true,
      cleared: { watchedAt: "2026-11-01T10:00:00+00:00", rating: 8 },
    };
    expect(v1MovieWriteOkSchema.parse(plain)).toEqual(plain);
    expect(v1MovieWriteOkSchema.parse(cleared)).toEqual(cleared);
  });
});

/**
 * covers: prompts/mobile-look-title-pages.md, decisions 2 and 3: the Facts,
 * crew and cast fields are part of the contract, a value the catalog lacks
 * travels as null rather than 0, and a failed show cast is null.
 */
describe("the title reads' Facts and crew fields", () => {
  const company = { id: 1, name: "Fox 2000 Pictures", logoUrl: null };

  it("carries the movie's Facts and writers, budget and revenue nullable", () => {
    const shape = v1MovieSchema.shape;
    expect(shape.originalLanguage.safeParse("en").success).toBe(true);
    expect(shape.budget.safeParse(null).success).toBe(true);
    expect(shape.revenue.safeParse(null).success).toBe(true);
    expect(shape.budget.safeParse(63_000_000).success).toBe(true);
    expect(shape.productionCompanies.safeParse([company]).success).toBe(true);
    expect(shape.writers.safeParse(["Jim Uhls"]).success).toBe(true);
  });

  it("carries the show's Facts, and a cast that is null when its read failed", () => {
    const shape = v1ShowSchema.shape;
    expect(shape.networks.safeParse([company]).success).toBe(true);
    expect(shape.productionCompanies.safeParse([]).success).toBe(true);
    expect(shape.cast.safeParse(null).success).toBe(true);
  });

  it("requires every new field, so a route that drops one fails its parse", () => {
    for (const key of [
      "originalLanguage",
      "budget",
      "revenue",
      "productionCompanies",
      "writers",
    ] as const) {
      expect(v1MovieSchema.shape[key].safeParse(undefined).success).toBe(false);
    }
    for (const key of ["networks", "productionCompanies", "cast"] as const) {
      expect(v1ShowSchema.shape[key].safeParse(undefined).success).toBe(false);
    }
  });
});
