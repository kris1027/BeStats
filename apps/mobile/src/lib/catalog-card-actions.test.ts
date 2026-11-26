import { CARD_STATE_CHUNK, cardStateChunks } from "./card-states";
import {
  gameCardMarks,
  gameCardMenu,
  movieCardMarks,
  movieCardMenu,
  showCardMarks,
  showCardMenu,
} from "./catalog-card-actions";

const TODAY = "2026-11-24";
const RELEASED = "2026-01-10";
const UNRELEASED = "2027-03-01";
const EMPTY_MOVIE = { planned: false, watchedAt: null, rating: null };
const WATCHED = "2026-11-01T10:00:00.000Z";

/** covers: prompts/mobile-look-card-actions.md, decisions 2, 8 and 9 */
describe("movie card menu", () => {
  it("offers Plan and Mark watched on a released movie with no state", () => {
    expect(movieCardMenu(EMPTY_MOVIE, RELEASED, TODAY)).toEqual([
      {
        id: "plan",
        title: "Plan",
        destructive: false,
        disabled: false,
        write: { kind: "watchlist", value: true, clears: "planned" },
      },
      {
        id: "watched",
        title: "Mark watched",
        destructive: false,
        disabled: false,
        write: { kind: "watched", value: true },
      },
    ]);
  });

  it("turns each action into its removal once it holds", () => {
    const planned = movieCardMenu(
      { ...EMPTY_MOVIE, planned: true },
      RELEASED,
      TODAY,
    );
    expect(planned[0]).toMatchObject({
      title: "Remove from plan",
      destructive: true,
      write: { kind: "watchlist", value: false },
    });
    const watched = movieCardMenu(
      { ...EMPTY_MOVIE, watchedAt: WATCHED, rating: 8 },
      RELEASED,
      TODAY,
    );
    expect(watched[1]).toMatchObject({
      title: "Remove watched mark",
      destructive: true,
      write: { kind: "watched", value: false, clears: "unwatched" },
    });
  });

  it("keeps Mark watched off before the release day, but a mark can go", () => {
    expect(movieCardMenu(EMPTY_MOVIE, UNRELEASED, TODAY)[1]?.disabled).toBe(
      true,
    );
    expect(movieCardMenu(EMPTY_MOVIE, null, TODAY)[1]?.disabled).toBe(true);
    expect(
      movieCardMenu(
        { ...EMPTY_MOVIE, watchedAt: WATCHED },
        UNRELEASED,
        TODAY,
      )[1]?.disabled,
    ).toBe(false);
    expect(movieCardMenu(EMPTY_MOVIE, TODAY, TODAY)[1]?.disabled).toBe(false);
  });

  it("marks a planned movie, and a watched one with its score", () => {
    expect(
      movieCardMarks({ ...EMPTY_MOVIE, planned: true }, RELEASED, TODAY),
    ).toEqual({
      bookmark: true,
      watched: false,
      score: null,
      community: true,
      pill: null,
      words: ["Planned"],
    });
    expect(
      movieCardMarks(
        { planned: false, watchedAt: WATCHED, rating: 8 },
        RELEASED,
        TODAY,
      ),
    ).toEqual({
      bookmark: false,
      watched: true,
      score: 8,
      community: true,
      pill: null,
      words: ["Watched", "Your score 8"],
    });
    expect(movieCardMarks(EMPTY_MOVIE, RELEASED, TODAY).words).toEqual([]);
  });

  it("marks an Upcoming planned movie as the web does: release pill, no TMDB badge", () => {
    const upcoming = movieCardMarks(
      { ...EMPTY_MOVIE, planned: true },
      UNRELEASED,
      TODAY,
    );
    expect(upcoming).toMatchObject({ bookmark: true, community: false });
    expect(upcoming.pill?.text).toBe("Mar 1, 2027");
    expect(
      movieCardMarks({ ...EMPTY_MOVIE, planned: true }, null, TODAY).pill?.text,
    ).toBe("Date TBA");
    // A movie with no state sits on no page, so the catalog card is unchanged.
    expect(movieCardMarks(EMPTY_MOVIE, UNRELEASED, TODAY)).toMatchObject({
      community: true,
      pill: null,
    });
  });
});

describe("show card menu", () => {
  const show = {
    tracked: false,
    progress: null,
    seasonRatings: [],
    showRating: 7.5,
  };

  it("offers Track, then Stop tracking", () => {
    expect(showCardMenu(show)).toEqual([
      {
        id: "tracking",
        title: "Track",
        destructive: false,
        disabled: false,
        write: true,
      },
    ]);
    expect(showCardMenu({ ...show, tracked: true })[0]).toMatchObject({
      title: "Stop tracking",
      destructive: true,
      write: false,
    });
  });

  it("marks a tracked show with the bookmark only, never a rating", () => {
    expect(showCardMarks({ ...show, tracked: true })).toEqual({
      bookmark: true,
      watched: false,
      score: null,
      community: true,
      pill: null,
      words: ["Tracking"],
    });
    expect(showCardMarks(show).bookmark).toBe(false);
  });
});

describe("game card menu", () => {
  it("offers Want to play, even before release", () => {
    for (const date of [RELEASED, UNRELEASED, null]) {
      expect(gameCardMenu({ status: null, rating: null }, date, TODAY)).toEqual(
        [
          {
            id: "status",
            title: "Want to play",
            destructive: false,
            disabled: false,
            write: { kind: "status", value: "want_to_play" },
          },
        ],
      );
    }
  });

  it("offers removal for any status", () => {
    for (const status of ["want_to_play", "playing", "finished"] as const) {
      expect(gameCardMenu({ status, rating: null }, RELEASED, TODAY)).toEqual([
        {
          id: "status",
          title: "Remove from your games",
          destructive: true,
          disabled: false,
          write: { kind: "status", value: null },
        },
      ]);
    }
  });

  it("marks Want to play with the bookmark and a started game with its pill and score", () => {
    expect(
      gameCardMarks({ status: "want_to_play", rating: null }, RELEASED, TODAY),
    ).toEqual({
      bookmark: true,
      watched: false,
      score: null,
      community: true,
      pill: null,
      words: ["Want to play"],
    });
    expect(
      gameCardMarks({ status: "finished", rating: 9 }, RELEASED, TODAY),
    ).toEqual({
      bookmark: false,
      watched: false,
      score: 9,
      community: true,
      pill: { text: "Finished", label: "Finished", isDate: false },
      words: ["Your score 9"],
    });
    expect(
      gameCardMarks({ status: "playing", rating: null }, RELEASED, TODAY).score,
    ).toBe(null);
  });

  it("adds the release pill to an unreleased Want to play game, as the web does", () => {
    expect(
      gameCardMarks({ status: "want_to_play", rating: null }, UNRELEASED, TODAY)
        .pill?.text,
    ).toBe("Mar 1, 2027");
    expect(
      gameCardMarks({ status: null, rating: null }, UNRELEASED, TODAY).pill,
    ).toBe(null);
  });
});

describe("card state chunks (R6)", () => {
  it("slices ids by page so a new page never moves an earlier slice", () => {
    const first = Array.from({ length: CARD_STATE_CHUNK }, (_, i) => i + 1);
    const both = [...first, ...first.map((id) => id + 100)];
    expect(cardStateChunks(first)).toEqual([first]);
    expect(cardStateChunks(both)[0]).toEqual(first);
    expect(cardStateChunks(both)).toHaveLength(2);
    expect(cardStateChunks([3, 3, 4])).toEqual([[3, 4]]);
  });

  it("keeps a later slice's ids when a title repeats across pages", () => {
    const first = Array.from({ length: CARD_STATE_CHUNK }, (_, i) => i + 1);
    const second = [1, ...first.slice(1).map((id) => id + 100)];
    const chunks = cardStateChunks([...first, ...second]);
    expect(chunks[0]).toEqual(first);
    expect(chunks[1]).toEqual(second);
    expect(cardStateChunks([])).toEqual([]);
  });
});
