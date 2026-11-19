import { v1LibrarySchema } from "@bestats/core/api/v1/library";
import { v1TitlesSchema } from "@bestats/core/api/v1/titles";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import gameFixture from "@/lib/igdb/__fixtures__/game-1942.json";
import { normalizeGame } from "@/lib/igdb/normalize";
import movieFixture from "@/lib/tmdb/__fixtures__/movie-550.json";
import { normalizeMovie } from "@/lib/tmdb/normalize";

import { ctx, req, VERSION } from "./test-kit";

/**
 * covers: AGENTS.md section 11 (one user cannot read or change another's
 * data, including through direct requests); spec 0033, AC-9; spec 0035,
 * Security model
 *
 * Mocked bearer tests cannot prove RLS, so this suite runs the real route
 * handlers, the real `verifyBearer` and the real Postgres policies against
 * the local Supabase stack, signed in as the two seeded users. Only the
 * catalog is replaced (a released movie and game), since TMDB and IGDB have
 * nothing to do with who owns a row.
 *
 * Opt in, never part of `pnpm test`: run `pnpm api:local`, which starts the
 * stack's env and runs this file alone. It cleans up every row it writes,
 * so the pgTAP suite still finds a clean seed.
 */
const MOVIE = normalizeMovie(movieFixture as never);
const GAME = normalizeGame(gameFixture[0] as never);
const MOVIE_ID = MOVIE.id;
const GAME_ID = GAME.id;

vi.mock("@/lib/tmdb/load-movie", () => ({
  loadMovie: async () => ({ kind: "found", movie: MOVIE }),
}));
vi.mock("@/lib/igdb/load-game", () => ({
  loadGame: async () => ({ kind: "found", game: GAME }),
  readGameIncludingHidden: async () => ({ kind: "found", game: GAME }),
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
const profile = await import("./me/profile/route");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Signs in a seeded user (supabase/seed.sql) and returns its access token. */
async function tokenFor(email: string, password: string): Promise<string> {
  const client = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) throw new Error(`sign in failed: ${email}`);
  return data.session.access_token;
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

beforeAll(async () => {
  if (!URL || !KEY) {
    throw new Error("Run this suite with `pnpm api:local` (local stack env).");
  }
  tokenA = await tokenFor("user-a@example.test", "password-a");
  tokenB = await tokenFor("user-b@example.test", "password-b");
  await cleanUp(tokenA);
  await cleanUp(tokenB);
});

afterAll(async () => {
  await cleanUp(tokenA);
  await cleanUp(tokenB);
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
