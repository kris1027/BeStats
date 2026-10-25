import { type NextRequest, NextResponse } from "next/server";

import { getGamesLibrary } from "@/lib/env";
import { IgdbError, IgdbValidationError, searchGames } from "@/lib/igdb";
import { toGameQuickSearchResponse } from "@/lib/search/game-read";
import { quickSearchRequestSchema } from "@/lib/search/quick";
import { readSearchPage, toQuickSearchResponse } from "@/lib/search/read";
import { TmdbError } from "@/lib/tmdb";

/**
 * A shared CDN may keep a success for five minutes and serve it stale for ten
 * more while it refreshes. Safe because nothing here depends on who asked
 * (spec 0010, AC-20).
 */
const SUCCESS_CACHE = "public, s-maxage=300, stale-while-revalidate=600";

/**
 * The navbar's quick search: page 1 of TMDB search for one catalog, cut to
 * five rows (spec 0010, AC-20).
 *
 * Public and anonymous by design. It reads the two query parameters and
 * nothing else: no cookie, no header, no session, so one response is right
 * for everyone and a CDN may share it. `proxy.ts` skips `api/`, so no session
 * refresh can attach a `Set-Cookie` that would make it uncacheable. Every
 * input is validated before TMDB is asked, and the read goes through the
 * cached module read, so a popular query costs one TMDB request per cache
 * lifetime. Errors are never cached.
 *
 * `type=game` is accepted only while the games library is on, and the flag is
 * read only for that raw value; it reads the cached IGDB search page 1 at the
 * default 20 and returns its first five games (spec 0029, AC-17). A query
 * IGDB's cleaning refuses answers 400, never 500.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawType = searchParams.get("type");
  const parsed = quickSearchRequestSchema(
    rawType === "game" && getGamesLibrary() === "on",
  ).safeParse({ type: rawType, q: searchParams.get("q") });
  if (!parsed.success) return invalid();

  const { type, q } = parsed.data;
  try {
    const body =
      type === "game"
        ? toGameQuickSearchResponse(await searchGames({ query: q, page: 1 }))
        : toQuickSearchResponse(
            type,
            await readSearchPage(type, q, { page: 1 }),
          );
    return NextResponse.json(body, {
      headers: { "Cache-Control": SUCCESS_CACHE },
    });
  } catch (error) {
    if (error instanceof IgdbValidationError) return invalid();
    if (!(error instanceof TmdbError || error instanceof IgdbError)) {
      throw error;
    }
    return NextResponse.json(
      { error: "upstream", kind: error.kind },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function invalid() {
  return NextResponse.json(
    { error: "invalid" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
