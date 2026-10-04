# lib/auth

Authentication rules shared by every auth surface: the forms in `app/(auth)/`, `app/account/`, the callback in `app/auth/callback/`, the navbar account slot, and `proxy.ts`. Governed by spec [0005](../../docs/specs/0005-authentication/index.md).

## Files

- `user.ts`: `requireUser()` for every private Server Component and Server Action, `getOptionalUser()` where signed out is a normal state (today only the navbar slot). Both verify with `getClaims()`, never `getSession()`.
- `private-paths.ts`: `PRIVATE_PATH_PREFIXES`, the one list the proxy guards. A new private route registers here; never restate the prefixes elsewhere (`proxy.test.ts` checks).
- `next-path.ts`: `isSafeNextPath()` / `safeNextPath()`. Call it at every read of a `next` value (query string, hidden field, header, email link), not once per journey.
- `action-state.ts`: `AuthActionState`, the shape every auth Server Action returns.
- `messages.ts`: every message an auth surface shows, keyed by `AUTH_OUTCOME`.
- `supabase-error.ts`: `classifyAuthError()`, the only code that touches a raw Supabase error. It matches on `error.code` (and `reasons` for weak passwords), never message text.
- `log.ts`: `logAuthEvent()`, the only way an auth path writes to the log.
- `schemas.ts`: the email and password Zod rules. `MINIMUM_PASSWORD_LENGTH` must equal `minimum_password_length` in `supabase/config.toml`.
- `identity.ts`: pure display derivations (name, avatar letter). Nothing is stored, and there is no `profiles` table.

## Rules

- The proxy redirect is a convenience. The boundary is `requireUser()` inside the page or action, plus Row Level Security (`AGENTS.md` section 11). The proxy redirects only `GET`; a Server Action POST is never redirected, it is refused inside the action.
- A new `"use server"` file, or a new export from a private one, registers in `private-actions-boundary.test.ts` at the repo root with a valid call; the suite fails until it does, and proves every private action refuses a missing session before it opens a database client.
- Auth Server Actions return `AuthActionState` and never throw, except `redirect()`, which is always called outside any `try`.
- Copy comes from `messages.ts` only. Sign in, sign up and reset must never reveal whether an address has an account; the unconfirmed address outcome is the one exception.
- While `getAuthEmailDelivery()` is `off` (production today), sign up does say when an address already has an account, with a link to sign in (spec 0018 AC-12), and every email surface (resend, recovery, `/check-email`) shows a notice or refuses on the server instead of calling Supabase. Write `on` and `off` tests for any new auth surface that mentions email.
- Logs carry an event and an outcome class only: no address, password, token, cookie or link.
- The browser never calls Supabase Auth. Session cookies are `HttpOnly` through `sessionCookieOptions()` in `lib/supabase/cookie-options.ts`, shared by the server client and the proxy.
- When a form links to another auth page, carry the typed email and `next` along; the receiving page validates both again.

_Drafted by /sync from the introducing change, worth a quick human pass._
