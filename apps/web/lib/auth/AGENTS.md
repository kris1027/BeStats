# lib/auth

Authentication rules shared by every auth surface: the forms in `app/(auth)/`, `app/account/`, the callback in `app/auth/callback/`, the navbar account slot, and `proxy.ts`. Governed by spec [0005](../../../../docs/specs/0005-authentication/index.md).

## Files

Since spec 0034 the pure files below (`private-paths.ts`, `next-path.ts`, `action-state.ts`, `identity.ts`, `messages.ts`, `schemas.ts`, `username.ts`) live in `packages/core/src/auth/` and are imported as `@bestats/core/auth/<file>`; `user.ts`, `profile.ts`, `log.ts` and `supabase-error.ts` stay here.

- `user.ts`: `requireUser()` for every private page, which redirects a signed out visitor. `getOptionalUser()` everywhere signed out is a state to handle rather than redirect: the navbar slot, the signed in parts of public pages, `getOwnProfile()`, and every Server Action, which answers an ended session with a returned state and writes nothing (spec 0005 AC-17). Both verify with `getClaims()`, never `getSession()`.
- `private-paths.ts`: `PRIVATE_PATH_PREFIXES`, the one list the proxy guards. A new private route registers here; never restate the prefixes elsewhere (`proxy.test.ts` checks).
- `next-path.ts`: `isSafeNextPath()` / `safeNextPath()`. Call it at every read of a `next` value (query string, hidden field, header, email link), not once per journey.
- `action-state.ts`: `AuthActionState`, the shape every auth Server Action returns.
- `messages.ts`: every message an auth surface shows, keyed by `AUTH_OUTCOME`.
- `supabase-error.ts`: `classifyAuthError()` and `classifyProfileWriteError()`, the only code that touches a raw Supabase error. `classifyAuthError()` passes the error's code, status, weak password `reasons` and the missing session flag to core's `classifyAuthFailure()` (`@bestats/core/auth/auth-error`, with `isAlreadyRegistered()`), the rule the app runs too. Matching is on `code`, never message text; the weekly username lock raises its own SQLSTATE, `BS002`, for that reason.
- `log.ts`: `logAuthEvent()`, the only way an auth path writes to the log.
- `schemas.ts`: the email and password Zod rules. `MINIMUM_PASSWORD_LENGTH` must equal `minimum_password_length` in `supabase/config.toml`.
- `identity.ts`: pure display derivations (name, avatar letter). The username, when there is one, is passed in; otherwise the email name is used.
- `username.ts`: the username Zod rule, reserved list and weekly lock helpers. Must match the `profiles` checks in `supabase/schemas/02-tables.sql` (`username.test.ts` checks). The database is the judge: the trigger `guard_username_change` owns the lock and the timestamp.
- `profile.ts`: `getOwnProfile()`, the `cache()`d read of the signed in account's `profiles` row, used by the navbar slot, `/account` and `changeUsernameAction`. A failed read returns null so the navbar falls back, never breaks.
- `commands/account.ts`: `deleteOwnAccountCommand`, shared by `deleteAccountAction` and `POST /api/v1/me/account/delete`; it calls `delete_own_account()` with no argument and returns the outcome class of a refusal for the caller to log.
- `commands/username.ts`: `readProfileRow`, `claimUsernameCommand` and `changeUsernameCommand`, the username read and writes shared by sign up, `/account` and `GET`/`PUT /api/v1/me/profile` (spec 0035). Like the tracking commands, they take `{ userId, getClient }` and never read cookies or the session.

## Rules

- The proxy redirect is a convenience. The boundary is the session check inside the page or action (`requireUser()` or `getOptionalUser()`), plus Row Level Security (`AGENTS.md` section 11). The proxy redirects only `GET`; a Server Action POST is never redirected, it is refused inside the action.
- `/api/v1/me/*` has no cookie: `withV1` finds the user through `verifyBearer()` in `lib/supabase/bearer.ts`, which verifies the token with `getClaims(jwt)`, accepts only the `authenticated` role (so the publishable key used as a token fails) and takes the user ID from `sub`. Its client uses the publishable key with the caller's token, never an elevated key. Never use `getOptionalUser()` in a v1 route.
- A new `"use server"` file, or a new export from a private one, registers in `private-actions-boundary.test.ts` at the web app root (`apps/web/`) with a valid call; the suite fails until it does, and proves every private action refuses a missing session before it opens a database client.
- Auth Server Actions return `AuthActionState` and never throw, except `redirect()`, which is always called outside any `try`.
- Copy comes from `messages.ts` only. Sign in, sign up and reset must never reveal whether an address has an account; the unconfirmed address outcome is the one exception.
- `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY` (`on` or `off`, unset meaning `off`) is read only through `getAuthEmailDelivery()` in `lib/env.ts`, kept apart from `getPublicEnv()` so previews with no Supabase variables still build. Being `NEXT_PUBLIC_`, a change takes a redeploy.
- Auth redirect URLs and providers are set per environment in `supabase/config.toml` and reach production through `supabase config push` ([docs/deploy.md](../../../../docs/deploy.md)). Before turning email delivery `on`, verify confirmation and password recovery mail end to end.
- While `getAuthEmailDelivery()` is `off` (production today), sign up does say when an address already has an account, with a link to sign in (spec 0018 AC-12), and every email surface (resend, recovery, `/check-email`) shows a notice or refuses on the server instead of calling Supabase. Write `on` and `off` tests for any new auth surface that mentions email.
- `?notice=` on `/sign-in` is read only through core's `signInNoticeCopy`, which both apps use, so a query string can never put its own text on the page.
- `/reset-password/app` is where a reset asked from the phone lands in a browser: static, no form, and it never exchanges the code, because the app's PKCE proof stays on the phone. Web resets keep `/auth/callback`.
- Logs carry an event and an outcome class only: no address, password, token, cookie or link.
- The browser never calls Supabase Auth. Session cookies are `HttpOnly` through `sessionCookieOptions()` in `lib/supabase/cookie-options.ts`, shared by the server client and the proxy.
- When a form links to another auth page, carry the typed email and `next` along; the receiving page validates both again.

_Drafted by /sync from the introducing change, worth a quick human pass._
