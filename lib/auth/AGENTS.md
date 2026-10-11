# lib/auth

Authentication rules shared by every auth surface: the forms in `app/(auth)/`, `app/account/`, the callback in `app/auth/callback/`, the navbar account slot, and `proxy.ts`. Governed by spec [0005](../../docs/specs/0005-authentication/index.md).

## Files

- `user.ts`: `requireUser()` for every private page, which redirects a signed out visitor. `getOptionalUser()` everywhere signed out is a state to handle rather than redirect: the navbar slot, the signed in parts of public pages, `getOwnProfile()`, and every Server Action, which answers an ended session with a returned state and writes nothing (spec 0005 AC-17). Both verify with `getClaims()`, never `getSession()`.
- `private-paths.ts`: `PRIVATE_PATH_PREFIXES`, the one list the proxy guards. A new private route registers here; never restate the prefixes elsewhere (`proxy.test.ts` checks).
- `next-path.ts`: `isSafeNextPath()` / `safeNextPath()`. Call it at every read of a `next` value (query string, hidden field, header, email link), not once per journey.
- `action-state.ts`: `AuthActionState`, the shape every auth Server Action returns.
- `messages.ts`: every message an auth surface shows, keyed by `AUTH_OUTCOME`.
- `supabase-error.ts`: `classifyAuthError()` and `classifyProfileWriteError()`, the only code that touches a raw Supabase error. They match on `error.code` (and `reasons` for weak passwords), never message text; the weekly username lock raises its own SQLSTATE, `BS002`, for that reason.
- `log.ts`: `logAuthEvent()`, the only way an auth path writes to the log.
- `schemas.ts`: the email and password Zod rules. `MINIMUM_PASSWORD_LENGTH` must equal `minimum_password_length` in `supabase/config.toml`.
- `identity.ts`: pure display derivations (name, avatar letter). The username, when there is one, is passed in; otherwise the email name is used.
- `username.ts`: the username Zod rule, reserved list and weekly lock helpers. Must match the `profiles` checks in `supabase/schemas/02-tables.sql` (`username.test.ts` checks). The database is the judge: the trigger `guard_username_change` owns the lock and the timestamp.
- `profile.ts`: `getOwnProfile()`, the `cache()`d read of the signed in account's `profiles` row, used by the navbar slot, `/account` and `changeUsernameAction`. A failed read returns null so the navbar falls back, never breaks.

## Rules

- The proxy redirect is a convenience. The boundary is the session check inside the page or action (`requireUser()` or `getOptionalUser()`), plus Row Level Security (`AGENTS.md` section 11). The proxy redirects only `GET`; a Server Action POST is never redirected, it is refused inside the action.
- A new `"use server"` file, or a new export from a private one, registers in `private-actions-boundary.test.ts` at the repo root with a valid call; the suite fails until it does, and proves every private action refuses a missing session before it opens a database client.
- Auth Server Actions return `AuthActionState` and never throw, except `redirect()`, which is always called outside any `try`.
- Copy comes from `messages.ts` only. Sign in, sign up and reset must never reveal whether an address has an account; the unconfirmed address outcome is the one exception.
- While `getAuthEmailDelivery()` is `off` (production today), sign up does say when an address already has an account, with a link to sign in (spec 0018 AC-12), and every email surface (resend, recovery, `/check-email`) shows a notice or refuses on the server instead of calling Supabase. Write `on` and `off` tests for any new auth surface that mentions email.
- Logs carry an event and an outcome class only: no address, password, token, cookie or link.
- The browser never calls Supabase Auth. Session cookies are `HttpOnly` through `sessionCookieOptions()` in `lib/supabase/cookie-options.ts`, shared by the server client and the proxy.
- When a form links to another auth page, carry the typed email and `next` along; the receiving page validates both again.

_Drafted by /sync from the introducing change, worth a quick human pass._
