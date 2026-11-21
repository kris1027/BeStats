import { createHmac } from "node:crypto";

import { v1LibrarySchema } from "@bestats/core/api/v1/library";
import { v1ProfileSchema } from "@bestats/core/api/v1/profile";
import { v1SeasonStateSchema } from "@bestats/core/api/v1/show";
import { v1TitlesSchema } from "@bestats/core/api/v1/titles";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import gameFixture from "@/lib/igdb/__fixtures__/game-1942.json";
import { normalizeGame } from "@/lib/igdb/normalize";
import movieFixture from "@/lib/tmdb/__fixtures__/movie-550.json";
import seasonFixture from "@/lib/tmdb/__fixtures__/season-1396-1.json";
import showFixture from "@/lib/tmdb/__fixtures__/tv-1396.json";
import {
  normalizeMovie,
  normalizeSeasonDetail,
  normalizeTvShow,
} from "@/lib/tmdb/normalize";

import { ctx, req, VERSION } from "./test-kit";

/**
 * covers: AGENTS.md section 11 (one user cannot read or change another's
 * data, including through direct requests); spec 0033, AC-9; spec 0035,
 * Security model
 *
 * Mocked bearer tests cannot prove RLS, so this suite runs the real route
 * handlers, the real `verifyBearer` and the real Postgres policies against
 * the local Supabase stack, signed in as the two seeded users. Only the
 * catalog is replaced (a released movie and game, and Breaking Bad's first
 * season), since TMDB and IGDB have nothing to do with who owns a row.
 *
 * Opt in, never part of `pnpm test`: run `pnpm api:local`, which starts the
 * stack's env and runs this file alone. It cleans up every row it writes,
 * so the pgTAP suite still finds a clean seed.
 */
const MOVIE = normalizeMovie(movieFixture as never);
// The fixture's game under an id the seed never uses: the seed already has
// 1942 rows for both users, and the clean up below deletes this game's rows.
const GAME = { ...normalizeGame(gameFixture[0] as never), id: 7346 };
const SHOW = normalizeTvShow(showFixture as never);
const SEASON = normalizeSeasonDetail(seasonFixture as never, 1396);
const MOVIE_ID = MOVIE.id;
const GAME_ID = GAME.id;
const SHOW_ID = SHOW.id;
// User A's seeded Breaking Bad S1 rows (supabase/seed.sql): 62085 and 62086
// watched and rated, 62087 neither. B tracks the show but has no episodes.
const A_EPISODES = [62085, 62086, 62087];

vi.mock("@/lib/tmdb/load-movie", () => ({
  loadMovie: async () => ({ kind: "found", movie: MOVIE }),
}));
vi.mock("@/lib/igdb/load-game", () => ({
  loadGame: async () => ({ kind: "found", game: GAME }),
  readGameIncludingHidden: async () => ({ kind: "found", game: GAME }),
}));
vi.mock("@/lib/tmdb/load-show", () => ({
  loadShow: async () => ({ kind: "found", show: SHOW }),
}));
vi.mock("@/lib/tmdb/load-season", () => ({
  loadSeason: async () => ({ kind: "found", show: SHOW, season: SEASON }),
}));
vi.mock("@/lib/tmdb", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getMovieSummaries: async (ids: number[]) => ({
    found: ids.includes(MOVIE_ID) ? [MOVIE] : [],
    missingIds: ids.filter((id) => id !== MOVIE_ID),
    failedIds: [],
  }),
}));
vi.mock("@/lib/igdb", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getGamesByIds: async (ids: number[]) => ({
    found: ids.includes(GAME_ID) ? [GAME] : [],
    missingIds: ids.filter((id) => id !== GAME_ID),
  }),
}));

const watched = await import("./me/movies/[id]/watched/route");
const watchedRestore = await import("./me/movies/[id]/watched/restore/route");
const rating = await import("./me/movies/[id]/rating/route");
const game = await import("./me/games/[id]/route");
const titles = await import("./me/titles/route");
const library = await import("./me/library/route");
const episode = await import("./me/episodes/[episodeId]/route");
const seasonState = await import("./me/shows/[id]/seasons/[n]/route");
const seasonWatched = await import("./me/shows/[id]/seasons/[n]/watched/route");
const seasonRestore = await import(
  "./me/shows/[id]/seasons/[n]/watched/restore/route"
);
const tracking = await import("./me/shows/[id]/tracking/route");
const trackingRestore = await import("./me/shows/[id]/tracking/restore/route");
const profile = await import("./me/profile/route");
const accountDelete = await import("./me/account/delete/route");

// Set by `scripts/api-local.sh` from `supabase status`, never from a file.
const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const JWT_SECRET = process.env.API_LOCAL_JWT_SECRET ?? "";

/** Signs in a seeded user (supabase/seed.sql) and returns its access token. */
async function tokenFor(email: string, password: string): Promise<string> {
  const client = createClient(API_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) throw new Error(`sign in failed: ${email}`);
  return data.session.access_token;
}

/**
 * A client acting as the user the token belongs to, under RLS, for the
 * checks and clean ups no v1 route offers (tracking rows, B's own episode
 * rows). Never an elevated role (AGENTS.md section 5).
 */
function clientAs(token: string) {
  return createClient(API_URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * The token with its claims changed and signed again with the local stack's
 * legacy JWT secret. The stack signs sessions with ES256 and never exposes
 * that private key, but its Auth server still verifies HS256 tokens signed
 * with this secret, so it sees a well formed, correctly signed token and
 * judges it on its claims alone (the control case below proves it).
 */
function resigned(token: string, change: Record<string, unknown>): string {
  const payload = token.split(".")[1];
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  const head = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...claims, ...change })).toString(
    "base64url",
  );
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${signature}`;
}

let tokenA = "";
let tokenB = "";
const auth = (token: string) => ({
  ...VERSION,
  Authorization: `Bearer ${token}`,
});
const movieCtx = ctx({ id: String(MOVIE_ID) });
const gameCtx = ctx({ id: String(GAME_ID) });

async function json(response: Response) {
  return { status: response.status, body: await response.json() };
}

async function titlesOf(token: string) {
  const { status, body } = await json(
    await titles.GET(
      req(
        `/api/v1/me/titles?ids=movie:${MOVIE_ID},game:${GAME_ID}`,
        auth(token),
      ),
      ctx(),
    ),
  );
  expect(status).toBe(200);
  return v1TitlesSchema.parse(body);
}

async function seasonOf(token: string) {
  const { status, body } = await json(
    await seasonState.GET(
      req(`/api/v1/me/shows/${SHOW_ID}/seasons/1`, auth(token)),
      ctx({ id: String(SHOW_ID), n: "1" }),
    ),
  );
  expect(status).toBe(200);
  return v1SeasonStateSchema.parse(body).episodes;
}

async function tracks(token: string): Promise<boolean> {
  const { data, error } = await clientAs(token)
    .from("user_show_state")
    .select("show_id")
    .eq("show_id", SHOW_ID);
  if (error) throw new Error("tracking read failed");
  return data.length > 0;
}

async function usernameOf(token: string): Promise<string | null> {
  const { status, body } = await json(
    await profile.GET(req("/api/v1/me/profile", auth(token)), ctx()),
  );
  expect(status).toBe(200);
  return v1ProfileSchema.parse(body).username;
}

async function cleanUp(token: string) {
  await rating.PUT(
    req(`/api/v1/me/movies/${MOVIE_ID}/rating`, auth(token), {
      method: "PUT",
      body: { rating: null },
    }),
    movieCtx,
  );
  await watched.PUT(
    req(`/api/v1/me/movies/${MOVIE_ID}/watched`, auth(token), {
      method: "PUT",
      body: { watched: false },
    }),
    movieCtx,
  );
  await game.DELETE(
    req(`/api/v1/me/games/${GAME_ID}`, auth(token), { method: "DELETE" }),
    gameCtx,
  );
}

/** B's Breaking Bad state back to the seed: tracked, no S1 episodes. */
async function cleanUpShowB(token: string) {
  await clientAs(token)
    .from("user_episode_state")
    .delete()
    .eq("show_id", SHOW_ID)
    .eq("season_number", 1);
  if (!(await tracks(token))) {
    await tracking.PUT(
      req(`/api/v1/me/shows/${SHOW_ID}/tracking`, auth(token), {
        method: "PUT",
      }),
      ctx({ id: String(SHOW_ID) }),
    );
  }
}

beforeAll(async () => {
  if (!API_URL || !KEY || !JWT_SECRET) {
    throw new Error("Run this suite with `pnpm api:local` (local stack env).");
  }
  tokenA = await tokenFor("user-a@example.test", "password-a");
  tokenB = await tokenFor("user-b@example.test", "password-b");
  await cleanUp(tokenA);
  await cleanUp(tokenB);
  await cleanUpShowB(tokenB);
});

afterAll(async () => {
  await cleanUp(tokenA);
  await cleanUp(tokenB);
  await cleanUpShowB(tokenB);
});

describe("tokens that are not a signed in user", () => {
  it.each([
    ["no token", () => VERSION],
    ["the publishable key", () => auth(KEY)],
    ["a malformed token", () => auth("not-a-jwt")],
    [
      "a tampered token",
      () => {
        const [head, payload, signature] = tokenA.split(".");
        const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
        const forged = Buffer.from(
          JSON.stringify({
            ...claims,
            sub: "22222222-2222-2222-2222-222222222222",
          }),
        ).toString("base64url");
        return auth(`${head}.${forged}.${signature}`);
      },
    ],
    [
      "an expired token",
      () => {
        const now = Math.floor(Date.now() / 1000);
        return auth(resigned(tokenA, { iat: now - 3600, exp: now - 60 }));
      },
    ],
  ])("answers %s with 401 on read and write", async (_name, headers) => {
    const read = await titles.GET(
      req(`/api/v1/me/titles?ids=movie:${MOVIE_ID}`, headers()),
      ctx(),
    );
    expect(read.status).toBe(401);
    const write = await watched.PUT(
      req(`/api/v1/me/movies/${MOVIE_ID}/watched`, headers(), {
        method: "PUT",
        body: { watched: true },
      }),
      movieCtx,
    );
    expect(write.status).toBe(401);
  });
});

it("accepts the same re-signed token before it expires", async () => {
  // Control for "an expired token": only `exp` differs, so its 401 comes
  // from the expiry, not from a signature the stack refuses.
  const now = Math.floor(Date.now() / 1000);
  const fresh = await titles.GET(
    req(
      `/api/v1/me/titles?ids=movie:${MOVIE_ID}`,
      auth(resigned(tokenA, { iat: now, exp: now + 300 })),
    ),
    ctx(),
  );
  expect(fresh.status).toBe(200);
});

describe("user B against user A's rows", () => {
  let clearedA: unknown;

  it("lets A mark, score and list a movie and a game", async () => {
    const mark = await watched.PUT(
      req(`/api/v1/me/movies/${MOVIE_ID}/watched`, auth(tokenA), {
        method: "PUT",
        body: { watched: true },
      }),
      movieCtx,
    );
    expect(mark.status).toBe(200);
    const score = await rating.PUT(
      req(`/api/v1/me/movies/${MOVIE_ID}/rating`, auth(tokenA), {
        method: "PUT",
        body: { rating: 8 },
      }),
      movieCtx,
    );
    expect(score.status).toBe(200);
    const status = await game.PUT(
      req(`/api/v1/me/games/${GAME_ID}`, auth(tokenA), {
        method: "PUT",
        body: { status: "finished" },
      }),
      gameCtx,
    );
    expect(status.status).toBe(200);

    const a = await titlesOf(tokenA);
    expect(a[`movie:${MOVIE_ID}`]).toMatchObject({ rating: 8 });
    expect(a[`game:${GAME_ID}`]).toMatchObject({ status: "finished" });
  });

  it("shows B none of A's state through /me/titles", async () => {
    const b = await titlesOf(tokenB);
    expect(b[`movie:${MOVIE_ID}`]).toEqual({
      planned: false,
      watchedAt: null,
      rating: null,
    });
    expect(b[`game:${GAME_ID}`]).toEqual({ status: null, rating: null });
  });

  it("shows B none of A's titles through /me/library", async () => {
    for (const query of [
      "type=movie&path=/watched",
      "type=game&path=/finished",
    ]) {
      const { status, body } = await json(
        await library.GET(
          req(`/api/v1/me/library?${query}`, auth(tokenB)),
          ctx(),
        ),
      );
      expect(status, query).toBe(200);
      expect(v1LibrarySchema.parse(body).entries, query).toEqual([]);
    }
    const { body } = await json(
      await library.GET(
        req("/api/v1/me/library?type=movie&path=/watched", auth(tokenA)),
        ctx(),
      ),
    );
    // A also has the seeded 603 (supabase/seed.sql).
    expect(v1LibrarySchema.parse(body).entries.map((e) => e.id)).toContain(
      MOVIE_ID,
    );
  });

  it("changes nothing of A's when B clears the same titles", async () => {
    await rating.PUT(
      req(`/api/v1/me/movies/${MOVIE_ID}/rating`, auth(tokenB), {
        method: "PUT",
        body: { rating: null },
      }),
      movieCtx,
    );
    await watched.PUT(
      req(`/api/v1/me/movies/${MOVIE_ID}/watched`, auth(tokenB), {
        method: "PUT",
        body: { watched: false },
      }),
      movieCtx,
    );
    await game.DELETE(
      req(`/api/v1/me/games/${GAME_ID}`, auth(tokenB), { method: "DELETE" }),
      gameCtx,
    );

    const a = await titlesOf(tokenA);
    expect(a[`movie:${MOVIE_ID}`]).toMatchObject({ rating: 8 });
    expect(a[`movie:${MOVIE_ID}`]).not.toMatchObject({ watchedAt: null });
    expect(a[`game:${GAME_ID}`]).toMatchObject({ status: "finished" });
  });

  it("never restores A's mark from A's own Undo posted by B", async () => {
    const unmark = await json(
      await watched.PUT(
        req(`/api/v1/me/movies/${MOVIE_ID}/watched`, auth(tokenA), {
          method: "PUT",
          body: { watched: false },
        }),
        movieCtx,
      ),
    );
    expect(unmark.status).toBe(200);
    // The app adds the kind and the id it sent (spec 0035, Undo).
    expect(unmark.body.cleared).toMatchObject({ rating: 8 });
    clearedA = {
      kind: "movie_watched",
      movieId: MOVIE_ID,
      ...unmark.body.cleared,
    };

    await watchedRestore.POST(
      req(`/api/v1/me/movies/${MOVIE_ID}/watched/restore`, auth(tokenB), {
        method: "POST",
        body: { cleared: clearedA },
      }),
      movieCtx,
    );
    // Whatever B's restore answered, it could only touch B's own row.
    const a = await titlesOf(tokenA);
    expect(a[`movie:${MOVIE_ID}`]).toMatchObject({
      watchedAt: null,
      rating: null,
    });

    // A's own Undo still works, so the state B posted was a real one.
    const restore = await watchedRestore.POST(
      req(`/api/v1/me/movies/${MOVIE_ID}/watched/restore`, auth(tokenA), {
        method: "POST",
        body: { cleared: clearedA },
      }),
      movieCtx,
    );
    expect(restore.status).toBe(200);
    expect((await titlesOf(tokenA))[`movie:${MOVIE_ID}`]).toMatchObject({
      rating: 8,
    });
  });
});

describe("user B against user A's shows, episodes and seasons", () => {
  const showCtx = ctx({ id: String(SHOW_ID) });
  const seasonCtx = ctx({ id: String(SHOW_ID), n: "1" });
  const episodeCtx = (id: number) => ctx({ episodeId: String(id) });

  it("changes nothing of A's when B marks, scores and clears A's episodes", async () => {
    const before = await seasonOf(tokenA);
    expect(before.map((e) => e.episodeId)).toEqual(A_EPISODES);

    const writes: [number, object][] = [
      [62085, { watched: true }],
      [62085, { rating: 3 }],
      [62086, { watched: false }],
      [62086, { rating: null }],
    ];
    for (const [id, change] of writes) {
      const response = await episode.PUT(
        req(`/api/v1/me/episodes/${id}`, auth(tokenB), {
          method: "PUT",
          body: { showId: SHOW_ID, season: 1, ...change },
        }),
        episodeCtx(id),
      );
      expect(response.status, JSON.stringify(change)).toBe(200);
    }
    const unmark = await seasonWatched.PUT(
      req(`/api/v1/me/shows/${SHOW_ID}/seasons/1/watched`, auth(tokenB), {
        method: "PUT",
        body: { watched: false, episodeIds: A_EPISODES },
      }),
      seasonCtx,
    );
    expect(unmark.status).toBe(200);

    expect(await seasonOf(tokenA)).toEqual(before);
    // B sees only the row its own score created, never A's three.
    expect((await seasonOf(tokenB)).map((e) => e.episodeId)).toEqual([62085]);
  });

  it("never restores A's season from A's own Undo posted by B", async () => {
    const before = await seasonOf(tokenA);
    const watchedIds = before
      .filter((e) => e.watchedAt !== null)
      .map((e) => e.episodeId);
    const unmark = await json(
      await seasonWatched.PUT(
        req(`/api/v1/me/shows/${SHOW_ID}/seasons/1/watched`, auth(tokenA), {
          method: "PUT",
          body: { watched: false, episodeIds: watchedIds },
        }),
        seasonCtx,
      ),
    );
    expect(unmark.status).toBe(200);
    expect(unmark.body.undo).toMatchObject({ kind: "restore" });
    const cleared = {
      kind: "season",
      showId: SHOW_ID,
      seasonNumber: 1,
      undo: unmark.body.undo,
    };

    await seasonRestore.POST(
      req(
        `/api/v1/me/shows/${SHOW_ID}/seasons/1/watched/restore`,
        auth(tokenB),
        {
          method: "POST",
          body: { cleared },
        },
      ),
      seasonCtx,
    );
    const afterB = await seasonOf(tokenA);
    expect(afterB.every((e) => e.watchedAt === null)).toBe(true);

    // A's own Undo puts the seed back exactly, marks and dates alike.
    const restore = await seasonRestore.POST(
      req(
        `/api/v1/me/shows/${SHOW_ID}/seasons/1/watched/restore`,
        auth(tokenA),
        {
          method: "POST",
          body: { cleared },
        },
      ),
      seasonCtx,
    );
    expect(restore.status).toBe(200);
    expect(await seasonOf(tokenA)).toEqual(before);
  });

  it("leaves A tracking the show when B stops tracking it", async () => {
    expect(await tracks(tokenA)).toBe(true);
    expect(await tracks(tokenB)).toBe(true);

    const stop = await json(
      await tracking.DELETE(
        req(`/api/v1/me/shows/${SHOW_ID}/tracking`, auth(tokenB), {
          method: "DELETE",
        }),
        showCtx,
      ),
    );
    expect(stop.status).toBe(200);
    expect(await tracks(tokenB)).toBe(false);
    expect(await tracks(tokenA)).toBe(true);

    // B's own Undo brings back B's own row, with its seeded date.
    const restore = await trackingRestore.POST(
      req(`/api/v1/me/shows/${SHOW_ID}/tracking/restore`, auth(tokenB), {
        method: "POST",
        body: {
          cleared: {
            kind: "show_tracking",
            showId: SHOW_ID,
            undo: stop.body.undo,
          },
        },
      }),
      showCtx,
    );
    expect(restore.status).toBe(200);
    expect(await tracks(tokenB)).toBe(true);
  });
});

describe("user B against user A's profile", () => {
  // Read only on purpose: `authenticated` may never delete a `profiles` row
  // (supabase/tests/170), so a claimed name would outlive this suite and
  // break the clean seed pgTAP needs. Row isolation itself is pgTAP 170's
  // "A cannot read B"; this proves the route reads through the caller's own
  // session.
  it("answers each user its own (unclaimed) username, never the other's", async () => {
    const { count, error } = await clientAs(tokenA)
      .from("profiles")
      .select("user_id", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count, "the seed has no profiles").toBe(0);
    expect(await usernameOf(tokenA)).toBeNull();
    expect(await usernameOf(tokenB)).toBeNull();
  });

  it("refuses an invalid username from B with 400 and writes nothing", async () => {
    const response = await profile.PUT(
      req("/api/v1/me/profile", auth(tokenB), {
        method: "PUT",
        body: { username: "a b" },
      }),
      ctx(),
    );
    expect(response.status).toBe(400);
    expect(await usernameOf(tokenB)).toBeNull();
  });
});

describe("a throwaway user deleting their own account", () => {
  // A fresh account rather than a seeded one, so the seed pgTAP needs stays
  // whole; the deletion itself is the clean up. Confirmations are off in the
  // local stack, so sign up returns a session at once.
  it("removes only the caller, through the route, and never A's rows", async () => {
    const email = `delete-${Date.now()}@example.test`;
    const password = "a-throwaway-Passw0rd-for-tests";
    const signUp = await createClient(API_URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.signUp({ email, password });
    const token = signUp.data.session?.access_token;
    if (!token) throw new Error("sign up returned no session");

    const before = await titlesOf(tokenA);

    const refused = await accountDelete.POST(
      req("/api/v1/me/account/delete", auth(token), {
        method: "POST",
        body: { confirm: "delete" },
      }),
      ctx(),
    );
    expect(refused.status).toBe(400);

    const deleted = await accountDelete.POST(
      req("/api/v1/me/account/delete", auth(token), {
        method: "POST",
        body: { confirm: "DELETE" },
      }),
      ctx(),
    );
    expect(deleted.status).toBe(204);

    await expect(tokenFor(email, password)).rejects.toThrow();
    expect(await titlesOf(tokenA)).toEqual(before);
    expect(await tokenFor("user-a@example.test", "password-a")).toBeTruthy();
  });
});
