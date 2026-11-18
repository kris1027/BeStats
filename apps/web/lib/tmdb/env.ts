import "server-only";
import { z } from "zod";

/**
 * The TMDB credential, read on the server and nowhere else.
 *
 * `server-only` makes an import of this file from a Client Component a build
 * failure rather than a leaked token (spec 0002, AC-2). The variable carries no
 * `NEXT_PUBLIC_` prefix, so Next never inlines it into the browser bundle.
 *
 * Validation is lazy and memoized rather than at module load. AC-1 asks for a
 * load time check, but `pnpm build` and the fixture test suite both run with no
 * token on purpose (the checks workflow says so), and a top level throw would
 * break both the moment a page imports this module. The point of AC-1 is
 * preserved: the failure names the missing variable instead of surfacing later
 * as a confusing TMDB 401.
 */
const tokenSchema = z
  .string()
  .min(
    1,
    "TMDB_READ_ACCESS_TOKEN is missing or empty. Copy .env.example to .env.local and paste your TMDB v4 Read Access Token.",
  );

let cachedToken: string | null = null;

/**
 * Returns the validated TMDB v4 Read Access Token.
 *
 * Called by the request client on every attempt; the result is memoized so the
 * validation cost is paid once per process.
 *
 * @returns The token.
 * @throws If the variable is missing or empty. The message names the variable
 * and never includes its value, so it is safe to log.
 */
export function getTmdbToken(): string {
  if (cachedToken !== null) return cachedToken;

  const parsed = tokenSchema.safeParse(process.env.TMDB_READ_ACCESS_TOKEN);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message);
  }

  cachedToken = parsed.data;
  return cachedToken;
}

/**
 * Drops the memoized token.
 *
 * Only the tests need this: without it, one test that stubs the variable would
 * decide the value every later test sees.
 */
export function resetTmdbTokenCache(): void {
  cachedToken = null;
}
