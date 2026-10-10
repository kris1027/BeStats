import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { failure, IDLE_STATE } from "@/lib/auth/action-state";
import { AUTH_OUTCOME } from "@/lib/auth/messages";

/**
 * Scope feature 19, AGENTS.md section 13 items 3 and 4: private data is
 * unavailable without a valid session, including through a direct request.
 *
 * A Server Action is a public POST endpoint whatever page renders its form,
 * and the proxy deliberately never redirects one (`lib/auth/AGENTS.md`). So
 * the refusal has to live inside each action. Every module's own tests prove
 * that for the actions it had when they were written; this file proves it for
 * every private action that exists, by enumerating the exports at run time.
 * A new action that is not listed below fails the suite until someone writes
 * down the call that proves it refuses a missing session.
 *
 * The session, the database, TMDB and the cache are the boundaries replaced.
 */
const getOptionalUser = vi.fn();
const requireUser = vi.fn();
vi.mock("@/lib/auth/user", () => ({ getOptionalUser, requireUser }));

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh }));

const loadMovie = vi.fn();
vi.mock("@/app/movies/[id]/load-movie", () => ({ loadMovie }));
const loadShow = vi.fn();
vi.mock("@/app/shows/[id]/load-show", () => ({ loadShow }));
const loadSeason = vi.fn();
vi.mock("@/app/shows/[id]/season/[number]/load-season", () => ({
  loadSeason,
}));
const applyAutoCompletion = vi.fn();
vi.mock("@/lib/tracking/auto-completion", () => ({ applyAutoCompletion }));

const movieActions = await import("@/app/movies/actions");
const showActions = await import("@/app/shows/actions");
const accountActions = await import("@/app/account/actions");

/** Valid arguments for each action, so the session check is what refuses. */
const SHOW = 1396;
const MOVIE = 550;

function passwordForm(): FormData {
  const form = new FormData();
  form.set("currentPassword", "the-current-Passw0rd");
  form.set("password", "a-fresh-Passw0rd-for-tests");
  return form;
}

const TRACKING_REFUSAL = { ok: false, error: "session_expired" };

/**
 * Every private action, its valid call, and the refusal it must return. Keyed
 * by module so the completeness check below can compare against the real
 * exports.
 */
const PRIVATE_ACTIONS: Record<
  string,
  {
    module: Record<string, unknown>;
    calls: Record<string, () => Promise<unknown>>;
    refusal: unknown;
  }
> = {
  "app/movies/actions.ts": {
    module: movieActions,
    refusal: TRACKING_REFUSAL,
    calls: {
      setMovieWatchlist: () => movieActions.setMovieWatchlist(MOVIE, true),
      setMovieWatched: () => movieActions.setMovieWatched(MOVIE, true),
      setMovieRating: () => movieActions.setMovieRating(MOVIE, 8),
      restoreMovieWatchlist: () => movieActions.restoreMovieWatchlist(MOVIE),
      restoreMovieWatched: () =>
        movieActions.restoreMovieWatched(
          MOVIE,
          "2026-09-23T12:16:58.070024+00:00",
          7,
        ),
    },
  },
  "app/shows/actions.ts": {
    module: showActions,
    refusal: TRACKING_REFUSAL,
    calls: {
      setEpisodeWatched: () =>
        showActions.setEpisodeWatched(SHOW, 1, 62085, true),
      undoEpisodeMark: () =>
        showActions.undoEpisodeMark(
          SHOW,
          62085,
          "2026-09-25T23:30:00.123456+00:00",
        ),
      setEpisodeRating: () => showActions.setEpisodeRating(SHOW, 1, 62085, 8),
      setSeasonWatched: () => showActions.setSeasonWatched(SHOW, 1, true),
      undoSeasonWatched: () =>
        showActions.undoSeasonWatched(SHOW, {
          kind: "unmark",
          episodeIds: [62085],
        }),
      trackShow: () => showActions.trackShow(SHOW),
      untrackShow: () => showActions.untrackShow(SHOW),
      restoreShowTracking: () =>
        showActions.restoreShowTracking(SHOW, {
          trackedAt: "2026-09-01T10:00:00+00:00",
        }),
    },
  },
  "app/account/actions.ts": {
    module: accountActions,
    refusal: failure(AUTH_OUTCOME.sessionExpired),
    calls: {
      changePasswordAction: () =>
        accountActions.changePasswordAction(IDLE_STATE, passwordForm()),
    },
  },
};

/**
 * Server Action modules that are public on purpose: sign in, sign up, reset
 * and sign out exist for a visitor with no session (spec 0005).
 */
const PUBLIC_ACTION_FILES = ["app/(auth)/actions.ts"];

const EXCLUDED_DIRS = new Set(["node_modules", "docs", "design", "public"]);

/** Every `.ts`/`.tsx` file under a directory that declares "use server". */
function serverActionFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry) || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...serverActionFiles(path));
    } else if (
      [".ts", ".tsx"].includes(extname(path)) &&
      !/\.test\.tsx?$/.test(path) &&
      /^\s*["']use server["']/m.test(readFileSync(path, "utf8"))
    ) {
      found.push(path);
    }
  }
  return found;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getOptionalUser.mockResolvedValue(null);
  requireUser.mockRejectedValue(new Error("requireUser redirects"));
  loadMovie.mockResolvedValue({ kind: "found", movie: { id: MOVIE } });
  loadShow.mockResolvedValue({ kind: "found", show: { id: SHOW } });
  loadSeason.mockResolvedValue({
    kind: "found",
    show: { id: SHOW },
    season: {
      seasonNumber: 1,
      episodes: [{ id: 62085, episodeNumber: 1, airDate: "2020-01-01" }],
    },
  });
  applyAutoCompletion.mockResolvedValue({ changed: null });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

describe("the private Server Action registry", () => {
  it("knows every file that declares Server Actions", () => {
    const known = [...Object.keys(PRIVATE_ACTIONS), ...PUBLIC_ACTION_FILES];
    expect(serverActionFiles(".").sort()).toEqual(known.sort());
  });

  it.each(Object.entries(PRIVATE_ACTIONS))(
    "lists every function %s exports",
    (_, { module, calls }) => {
      const exported = Object.entries(module)
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name);
      expect(exported.sort()).toEqual(Object.keys(calls).sort());
    },
  );
});

const everyCall = Object.entries(PRIVATE_ACTIONS).flatMap(
  ([file, { calls, refusal }]) =>
    Object.entries(calls).map(
      ([name, call]) => [`${file} ${name}`, call, refusal] as const,
    ),
);

describe("a private Server Action called with no session", () => {
  it.each(everyCall)(
    "%s refuses with session_expired",
    async (_, call, refusal) => {
      expect(await call()).toEqual(refusal);
    },
  );

  it.each(everyCall)(
    "%s never opens a database client or refreshes the page",
    async (_, call) => {
      await call();
      expect(createClient).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
      expect(applyAutoCompletion).not.toHaveBeenCalled();
    },
  );

  it.each(everyCall)(
    "%s really asked for the session, so the refusal is not a parse error",
    async (_, call) => {
      await call();
      expect(getOptionalUser).toHaveBeenCalled();
    },
  );
});
