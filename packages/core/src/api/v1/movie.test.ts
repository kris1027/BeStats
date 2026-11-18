import { describe, expect, it } from "vitest";

import { TRACKING_MESSAGES } from "../../tracking/messages";
import type { MovieTrackingResult } from "../../tracking/types";
import { V1_ERROR_STATUS } from "./errors";
import {
  MOVIE_ERROR_TO_V1,
  movieErrorFromReason,
  movieIdParamSchema,
  v1MovieWriteOkSchema,
} from "./movie";

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
