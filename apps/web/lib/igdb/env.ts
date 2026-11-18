import "server-only";
import { z } from "zod";
import { IgdbError } from "./errors";

/**
 * The Twitch app credentials IGDB needs, read on the server and nowhere else
 * (spec 0023, AC-1, AC-2; root `AGENTS.md` §11 and "Commands and repo facts").
 *
 * `server-only` makes a Client Component import a build failure, and neither
 * variable carries a `NEXT_PUBLIC_` prefix, so Next never inlines them. This is
 * the only file that names them; `security-boundary.test.ts` fails otherwise.
 *
 * Validation is lazy and memoized, as in `lib/tmdb/env.ts`: `pnpm build` and
 * `pnpm test` run with neither variable set, and a top level throw would break
 * both. A missing value raises an `IgdbError` of kind `unauthorized` (AC-4), so
 * it crosses the cache boundary as a result and a page shows its error state
 * instead of crashing. The message names the variable, never its value.
 */
const CLIENT_ID_VARIABLE = "IGDB_CLIENT_ID";
const CLIENT_SECRET_VARIABLE = "IGDB_CLIENT_SECRET";

function requiredSchema(variable: string) {
  return z
    .string()
    .trim()
    .min(
      1,
      `${variable} is missing or empty. Copy .env.example to .env.local and paste your Twitch application's credentials.`,
    );
}

export type IgdbCredentials = { clientId: string; clientSecret: string };

let cached: IgdbCredentials | null = null;

function read(variable: string): string {
  const parsed = requiredSchema(variable).safeParse(process.env[variable]);
  if (!parsed.success) {
    throw new IgdbError(
      "unauthorized",
      "token",
      parsed.error.issues[0].message,
    );
  }
  return parsed.data;
}

/**
 * Returns the validated client id and secret.
 *
 * @throws {IgdbError} `unauthorized`, naming the missing variable.
 */
export function getIgdbCredentials(): IgdbCredentials {
  if (cached !== null) return cached;
  cached = {
    clientId: read(CLIENT_ID_VARIABLE),
    clientSecret: read(CLIENT_SECRET_VARIABLE),
  };
  return cached;
}

/** Drops the memo, so one test's stubbed variables never decide the next's. */
export function resetIgdbCredentialsCache(): void {
  cached = null;
}
