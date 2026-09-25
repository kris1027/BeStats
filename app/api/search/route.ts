import { type NextRequest, NextResponse } from "next/server";

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
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const parsed = quickSearchRequestSchema.safeParse({
    type: searchParams.get("type"),
    q: searchParams.get("q"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { type, q } = parsed.data;
  try {
    const page = await readSearchPage(type, q, { page: 1 });
    return NextResponse.json(toQuickSearchResponse(type, page), {
      headers: { "Cache-Control": SUCCESS_CACHE },
    });
  } catch (error) {
    if (!(error instanceof TmdbError)) throw error;
    return NextResponse.json(
      { error: "upstream", kind: error.kind },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
