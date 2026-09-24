import { describe, expect, it } from "vitest";

import { SHOW_CAST_LIMIT } from "./constants";
import { normalizeCast, normalizeShowCast, resolveOverview } from "./normalize";

/**
 * covers: spec 0006, AC-4, AC-5
 *
 * The fixture tests in `reads.test.ts` prove the fallback end to end on real
 * payloads. These pin the edges of the choice itself, where a wrong branch
 * would show a guessed language or invent an overview.
 */
describe("resolveOverview", () => {
  const french = { iso_639_1: "fr", data: { overview: "Un texte." } };

  it("prefers English, trimmed, even when the original language has one", () => {
    expect(resolveOverview("  An overview.  ", "fr", [french])).toEqual({
      overview: "An overview.",
      overviewLanguage: "en",
    });
  });

  it("treats a blank English overview as missing and falls back", () => {
    expect(resolveOverview(" \n ", "fr", [french])).toEqual({
      overview: "Un texte.",
      overviewLanguage: "fr",
    });
  });

  it.each([null, undefined])(
    "is absent, not invented, when translations are %s",
    (translations) => {
      expect(resolveOverview(null, "fr", translations)).toEqual({
        overview: null,
        overviewLanguage: null,
      });
    },
  );

  it("skips a matching entry with no data and uses the next one", () => {
    const result = resolveOverview("", "fr", [
      { iso_639_1: "fr", data: null },
      { iso_639_1: "fr", data: { overview: null } },
      { iso_639_1: "fr", data: { overview: "Le bon texte." } },
    ]);

    expect(result).toEqual({
      overview: "Le bon texte.",
      overviewLanguage: "fr",
    });
  });

  it("keeps the first usable match, so the choice is stable across reads", () => {
    const result = resolveOverview(null, "fr", [
      { iso_639_1: "fr", data: { overview: "Premier." } },
      { iso_639_1: "fr", data: { overview: "Second." } },
    ]);

    expect(result.overview).toBe("Premier.");
  });

  it("matches the language code exactly", () => {
    const result = resolveOverview(null, "fr", [
      { iso_639_1: "FR", data: { overview: "Majuscules." } },
    ]);

    expect(result).toEqual({ overview: null, overviewLanguage: null });
  });
});

/**
 * covers: spec 0006, AC-6
 *
 * TMDB lists an actor once per role (Peter Sellers three times in Dr.
 * Strangelove), so the cast row keys on the credit, never the person.
 */
describe("normalizeCast", () => {
  const credit = { id: 7, name: "Peter Sellers", profile_path: null };

  it("keeps a distinct credit id for each role the same person plays", () => {
    const cast = normalizeCast([
      { ...credit, credit_id: "a", character: "Mandrake", order: 0 },
      { ...credit, credit_id: "b", character: "Muffley", order: 1 },
    ]);

    expect(cast.map((member) => member.creditId)).toEqual(["a", "b"]);
    expect(cast.map((member) => member.personId)).toEqual([7, 7]);
  });

  it("still gives each role its own id when TMDB sends none", () => {
    const cast = normalizeCast([
      { ...credit, order: 0 },
      { ...credit, order: 1 },
    ]);

    expect(new Set(cast.map((member) => member.creditId)).size).toBe(2);
  });
});

/**
 * covers: spec 0009, AC-8
 *
 * `reads.test.ts` proves the order and the role choice on the real Breaking
 * Bad payload. These pin the edges a real payload rarely shows: missing
 * counts, missing order, missing character and a huge cast.
 */
describe("normalizeShowCast", () => {
  const person = (
    id: number,
    total: number | null,
    order: number | null,
    roles: {
      credit_id: string;
      character?: string | null;
      episode_count?: number | null;
    }[] = [
      { credit_id: `c${id}`, character: `Role ${id}`, episode_count: total },
    ],
  ) => ({
    id,
    name: `Person ${id}`,
    profile_path: null,
    total_episode_count: total,
    order,
    roles,
  });

  it("returns an empty cast when TMDB sends none", () => {
    expect(normalizeShowCast(null)).toEqual([]);
    expect(normalizeShowCast(undefined)).toEqual([]);
  });

  it("sorts a person with no order after the ordered ones on the same count", () => {
    const cast = normalizeShowCast([
      person(1, 10, null),
      person(2, 10, 5),
      person(3, 10, 0),
    ]);

    expect(cast.map((member) => member.personId)).toEqual([3, 2, 1]);
  });

  it("treats a missing episode count as zero, never as the most", () => {
    const cast = normalizeShowCast([person(1, null, 0), person(2, 1, 9)]);

    expect(cast.map((member) => member.personId)).toEqual([2, 1]);
  });

  it("prefers a counted role over one with no count", () => {
    const [member] = normalizeShowCast([
      person(1, 5, 0, [
        { credit_id: "none", character: "Cameo", episode_count: null },
        { credit_id: "main", character: "Lead", episode_count: 5 },
      ]),
    ]);

    expect(member).toMatchObject({ creditId: "main", character: "Lead" });
  });

  it("leaves a missing character empty rather than inventing one", () => {
    const [member] = normalizeShowCast([
      person(1, 3, 0, [{ credit_id: "x", character: null, episode_count: 3 }]),
    ]);

    expect(member?.character).toBe("");
  });

  it("keeps no private sort field in the result", () => {
    const [member] = normalizeShowCast([person(1, 3, 0)]);

    expect(member).not.toHaveProperty("totalEpisodes");
  });

  it(`cuts a long cast to ${SHOW_CAST_LIMIT}, keeping the most episodes`, () => {
    const many = Array.from({ length: 40 }, (_, i) => person(i + 1, i, i));

    const cast = normalizeShowCast(many);

    expect(cast).toHaveLength(SHOW_CAST_LIMIT);
    expect(cast[0]?.personId).toBe(40);
    expect(cast.at(-1)?.personId).toBe(40 - SHOW_CAST_LIMIT + 1);
  });
});
