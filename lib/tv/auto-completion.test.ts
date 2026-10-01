import { describe, expect, it } from "vitest";

import type { TmdbShowStatus } from "@/lib/tmdb/types";

import {
  type CompletionRead,
  type CompletionRow,
  type CompletionTrigger,
  completionVerdict,
  isFinishedShowStatus,
  MAX_COMPLETION_EPISODE_IDS,
  mayChange,
} from "./auto-completion";

/**
 * covers: spec 0015, AC-1, AC-2, AC-14
 *
 * One test per row of the `completionVerdict` table, plus every branch of
 * "finished and watched": the status wording, an incomplete or failed read,
 * nothing aired, specials, and upcoming or undated episodes.
 */
const today = "2026-09-30";

const episodes = [
  { id: 101, seasonNumber: 1, episodeNumber: 1, airDate: "2026-01-01" },
  { id: 102, seasonNumber: 1, episodeNumber: 2, airDate: "2026-01-08" },
  { id: 201, seasonNumber: 2, episodeNumber: 1, airDate: "2026-09-30" },
];

/** Every aired regular episode watched. */
const allWatched = new Set([101, 102, 201]);
const oneLeft = new Set([101, 102]);

function read(
  overrides: Partial<NonNullable<CompletionRead>> = {},
): NonNullable<CompletionRead> {
  return { episodes, complete: true, showStatus: "Ended", ...overrides };
}

const watchingSystem: CompletionRow = { status: "watching", source: "system" };
const watchingUser: CompletionRow = { status: "watching", source: "user" };
const completedSystem: CompletionRow = {
  status: "completed",
  source: "system",
};
const completedUser: CompletionRow = { status: "completed", source: "user" };

const visit: CompletionTrigger = { kind: "visit" };
const newWatch: CompletionTrigger = {
  kind: "write",
  newlyWatchedRegular: true,
};
const otherWrite: CompletionTrigger = {
  kind: "write",
  newlyWatchedRegular: false,
};

const complete = { kind: "complete", episodeIds: [101, 102, 201] };

describe("isFinishedShowStatus (AC-1)", () => {
  it.each<TmdbShowStatus>(["Ended", "Canceled"])("%s is finished", (status) => {
    expect(isFinishedShowStatus(status)).toBe(true);
  });

  // A variant spelling such as `ended` never reaches here: the normalizer
  // maps it to "" (`showStatusOf` in lib/tmdb/normalize.ts).
  it.each<TmdbShowStatus>([
    "Returning Series",
    "In Production",
    "Planned",
    "Pilot",
    "",
  ])("%j is ongoing", (status) => {
    expect(isFinishedShowStatus(status)).toBe(false);
  });
});

describe("completionVerdict, watching and system (AC-2)", () => {
  it.each([visit, newWatch, otherWrite])(
    "completes a finished and watched show on %j",
    (trigger) => {
      expect(
        completionVerdict(read(), watchingSystem, trigger, allWatched, today),
      ).toEqual(complete);
    },
  );

  it("does nothing while an aired regular episode is unwatched", () => {
    expect(
      completionVerdict(read(), watchingSystem, visit, oneLeft, today),
    ).toEqual({ kind: "none" });
  });

  it("does nothing when TMDB says the show is ongoing", () => {
    expect(
      completionVerdict(
        read({ showStatus: "Returning Series" }),
        watchingSystem,
        visit,
        allWatched,
        today,
      ),
    ).toEqual({ kind: "none" });
  });

  it("completes a Canceled show as well as an Ended one", () => {
    expect(
      completionVerdict(
        read({ showStatus: "Canceled" }),
        watchingSystem,
        visit,
        allWatched,
        today,
      ),
    ).toEqual(complete);
  });
});

describe("completionVerdict, watching and user (AC-2, AC-14)", () => {
  it("completes only on a write that newly watched a regular episode", () => {
    expect(
      completionVerdict(read(), watchingUser, newWatch, allWatched, today),
    ).toEqual(complete);
  });

  it.each([otherWrite, visit])("does nothing on %j", (trigger) => {
    expect(
      completionVerdict(read(), watchingUser, trigger, allWatched, today),
    ).toEqual({ kind: "none" });
  });
});

describe("completionVerdict, completed and system (AC-2)", () => {
  it("reopens on a visit once an episode is unwatched", () => {
    expect(
      completionVerdict(read(), completedSystem, visit, oneLeft, today),
    ).toEqual({ kind: "reopen", episodeIds: [101, 102, 201] });
  });

  it("reopens on a visit once a new regular episode has aired", () => {
    const withNew = read({
      episodes: [
        ...episodes,
        { id: 202, seasonNumber: 2, episodeNumber: 2, airDate: today },
      ],
    });
    expect(
      completionVerdict(withNew, completedSystem, visit, allWatched, today),
    ).toEqual({ kind: "reopen", episodeIds: [101, 102, 201, 202] });
  });

  it("reopens on a visit when TMDB no longer says Ended", () => {
    expect(
      completionVerdict(
        read({ showStatus: "Returning Series" }),
        completedSystem,
        visit,
        allWatched,
        today,
      ),
    ).toEqual({ kind: "reopen", episodeIds: null });
  });

  it("sends each aired regular id once for the database to confirm (AC-16)", () => {
    const mixed = read({
      showStatus: "Canceled",
      episodes: [
        ...episodes,
        { id: 101, seasonNumber: 1, episodeNumber: 1, airDate: "2026-01-01" },
        { id: 1, seasonNumber: 0, episodeNumber: 1, airDate: "2026-01-01" },
        { id: 301, seasonNumber: 3, episodeNumber: 1, airDate: "2027-01-01" },
        { id: 302, seasonNumber: 3, episodeNumber: 2, airDate: null },
      ],
    });
    expect(
      completionVerdict(mixed, completedSystem, visit, oneLeft, today),
    ).toEqual({ kind: "reopen", episodeIds: [101, 102, 201] });
  });

  it("does not reopen a finished show past the id cap", () => {
    const huge = read({
      episodes: Array.from(
        { length: MAX_COMPLETION_EPISODE_IDS + 1 },
        (_, i) => ({
          id: i + 1,
          seasonNumber: 1,
          episodeNumber: i + 1,
          airDate: "2026-01-01",
        }),
      ),
    });
    expect(
      completionVerdict(huge, completedSystem, visit, new Set(), today),
    ).toEqual({ kind: "none" });
  });

  it("stays put on a visit while still finished and watched", () => {
    expect(
      completionVerdict(read(), completedSystem, visit, allWatched, today),
    ).toEqual({ kind: "none" });
  });

  it.each([newWatch, otherWrite])(
    "leaves reopening to the trigger on %j",
    (trigger) => {
      expect(
        completionVerdict(read(), completedSystem, trigger, oneLeft, today),
      ).toEqual({ kind: "none" });
    },
  );
});

describe("completionVerdict, every other row (AC-2, AC-14)", () => {
  const others: CompletionRow[] = [
    null,
    completedUser,
    { status: "on_hold", source: "user" },
    { status: "on_hold", source: "system" },
    { status: "dropped", source: "user" },
    { status: "want_to_watch", source: "user" },
    { status: "want_to_watch", source: "system" },
  ];

  it.each(others)("%j never changes", (row) => {
    for (const trigger of [visit, newWatch, otherWrite]) {
      for (const watched of [allWatched, oneLeft]) {
        expect(completionVerdict(read(), row, trigger, watched, today)).toEqual(
          { kind: "none" },
        );
      }
    }
  });
});

describe("completionVerdict, a read that cannot decide (AC-1, AC-2)", () => {
  it.each([watchingSystem, watchingUser, completedSystem])(
    "an incomplete read never completes or reopens %j",
    (row) => {
      for (const watched of [allWatched, oneLeft]) {
        expect(
          completionVerdict(
            read({ complete: false }),
            row,
            row?.status === "completed" ? visit : newWatch,
            watched,
            today,
          ),
        ).toEqual({ kind: "none" });
      }
    },
  );

  it.each([watchingSystem, completedSystem])(
    "a failed read changes nothing for %j",
    (row) => {
      for (const watched of [allWatched, oneLeft]) {
        expect(completionVerdict(null, row, visit, watched, today)).toEqual({
          kind: "none",
        });
      }
    },
  );
});

describe("completionVerdict, what counts (AC-1)", () => {
  it("never finishes a show with nothing aired", () => {
    const upcoming = read({
      episodes: [
        { id: 101, seasonNumber: 1, episodeNumber: 1, airDate: "2027-01-01" },
      ],
    });
    expect(
      completionVerdict(upcoming, watchingSystem, visit, new Set(), today),
    ).toEqual({ kind: "none" });
  });

  it("reopens rather than keeps a Completed whose episodes are all unaired", () => {
    expect(
      completionVerdict(
        read({ episodes: [] }),
        completedSystem,
        visit,
        new Set(),
        today,
      ),
    ).toEqual({ kind: "reopen", episodeIds: null });
  });

  it("ignores specials and upcoming or undated episodes, watched or not", () => {
    const mixed = read({
      episodes: [
        ...episodes,
        { id: 1, seasonNumber: 0, episodeNumber: 1, airDate: "2026-01-01" },
        { id: 202, seasonNumber: 2, episodeNumber: 2, airDate: "2026-10-01" },
        { id: 203, seasonNumber: 2, episodeNumber: 3, airDate: null },
      ],
    });
    expect(
      completionVerdict(mixed, watchingSystem, visit, allWatched, today),
    ).toEqual(complete);
    expect(
      completionVerdict(
        mixed,
        watchingSystem,
        visit,
        new Set([1, 202, 203, 101, 102]),
        today,
      ),
    ).toEqual({ kind: "none" });
  });

  it("sends each eligible id once, in season then episode order", () => {
    const repeated = read({ episodes: [episodes[2], ...episodes] });
    expect(
      completionVerdict(repeated, watchingSystem, visit, allWatched, today),
    ).toEqual(complete);
  });

  it("never completes a show past the id limit", () => {
    const long = Array.from(
      { length: MAX_COMPLETION_EPISODE_IDS + 1 },
      (_, index) => ({
        id: index + 1,
        seasonNumber: 1,
        episodeNumber: index + 1,
        airDate: "2020-01-01",
      }),
    );
    expect(
      completionVerdict(
        read({ episodes: long }),
        watchingSystem,
        visit,
        new Set(long.map((episode) => episode.id)),
        today,
      ),
    ).toEqual({ kind: "none" });
  });
});

describe("completionVerdict, the date boundary (AC-1)", () => {
  const finale = { id: 301, seasonNumber: 3, episodeNumber: 1 };

  it("waits for an episode airing today (UTC) to be watched", () => {
    const airsToday = read({
      episodes: [...episodes, { ...finale, airDate: today }],
    });
    expect(
      completionVerdict(airsToday, watchingSystem, visit, allWatched, today),
    ).toEqual({ kind: "none" });
  });

  it("completes without an episode that airs tomorrow", () => {
    const airsTomorrow = read({
      episodes: [...episodes, { ...finale, airDate: "2026-10-01" }],
    });
    expect(
      completionVerdict(airsTomorrow, watchingSystem, visit, allWatched, today),
    ).toEqual(complete);
  });
});

describe("completionVerdict, the id limit boundary (AC-3)", () => {
  it("still completes a show with exactly the most ids the database takes", () => {
    const longest = Array.from(
      { length: MAX_COMPLETION_EPISODE_IDS },
      (_, index) => ({
        id: index + 1,
        seasonNumber: 1,
        episodeNumber: index + 1,
        airDate: "2020-01-01",
      }),
    );
    const verdict = completionVerdict(
      read({ episodes: longest }),
      watchingSystem,
      visit,
      new Set(longest.map((episode) => episode.id)),
      today,
    );
    expect(verdict.kind).toBe("complete");
    expect(verdict.kind === "complete" && verdict.episodeIds).toHaveLength(
      MAX_COMPLETION_EPISODE_IDS,
    );
  });
});

describe("mayChange, the row and trigger gate (AC-2, AC-14)", () => {
  const onVisit: CompletionTrigger = { kind: "visit" };
  const finishing: CompletionTrigger = {
    kind: "write",
    newlyWatchedRegular: true,
  };
  const notFinishing: CompletionTrigger = {
    kind: "write",
    newlyWatchedRegular: false,
  };

  it.each<[string, CompletionRow, CompletionTrigger, boolean]>([
    ["no row", null, onVisit, false],
    [
      "system Watching, visit",
      { status: "watching", source: "system" },
      onVisit,
      true,
    ],
    [
      "system Watching, any write",
      { status: "watching", source: "system" },
      notFinishing,
      true,
    ],
    [
      "user Watching, visit",
      { status: "watching", source: "user" },
      onVisit,
      false,
    ],
    [
      "user Watching, other write",
      { status: "watching", source: "user" },
      notFinishing,
      false,
    ],
    [
      "user Watching, finishing write",
      { status: "watching", source: "user" },
      finishing,
      true,
    ],
    [
      "system Completed, visit",
      { status: "completed", source: "system" },
      onVisit,
      true,
    ],
    [
      "system Completed, write",
      { status: "completed", source: "system" },
      finishing,
      false,
    ],
    [
      "user Completed, visit",
      { status: "completed", source: "user" },
      onVisit,
      false,
    ],
    [
      "On Hold, finishing write",
      { status: "on_hold", source: "user" },
      finishing,
      false,
    ],
    ["Dropped, visit", { status: "dropped", source: "system" }, onVisit, false],
  ])("%s", (_name, row, trigger, expected) => {
    expect(mayChange(row, trigger)).toBe(expected);
  });
});
