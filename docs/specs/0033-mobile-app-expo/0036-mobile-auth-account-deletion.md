# 0036. Mobile auth and account deletion

**Date**: 2026-11-18

## Summary

The app signs in with email and password through Supabase, the same as the web, and keeps the session in the phone's secure storage. Password reset links can open the app on a path made only for it, but reset stays hidden on both apps while production sends no email. Both apps gain self serve account deletion, which Apple requires, done by a small Postgres function that can only delete the caller's own account, so the project still never uses the service role key.

## Decision

### Sign in methods (v1)

Email and password only, using the rules in `lib/auth/schemas.ts` (core) and the existing Supabase project settings. Sign up follows the steps in child 0035 (availability check, `signUp`, then `PUT /api/v1/me/profile`). Google and Sign in with Apple ship later, together, on web and mobile.

### Session storage and token refresh

- `@supabase/supabase-js` in `apps/mobile` with `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`, and the storage adapter from Supabase's Expo guide: a random encryption key in `expo-secure-store` (iOS Keychain, Android Keystore) and the AES encrypted session in AsyncStorage, because a full session can exceed SecureStore's value size limit.
- `AppState`: call `supabase.auth.startAutoRefresh()` when the app becomes active and `stopAutoRefresh()` otherwise, as the guide shows.
- Every API call gets its token from one `getAccessToken()` that calls `supabase.auth.getSession()` and relies on the library's own lock. The app calls `refreshSession()` only after a server 401 (below), never on its own, because Supabase rotates refresh tokens and two refreshes racing can sign the user out.
- On a 401 from `/api/v1/me/*`: call `refreshAfterUnauthorized(rejectedToken)`, which returns the current token if another call already rotated it, and otherwise runs one `refreshSession()` shared by every call that failed together (a phone can hold a token it believes valid that the server refuses, such as with a clock behind, so `getSession()` alone would resend it). Retry the request once with that token, and if there is none or it fails again sign out with a visible "Your session expired, sign in again" notice. Never a silent failure (AGENTS.md section 11). Decided 2026-11-18 (prompts/mobile-tracer-review-fixes.md).
- Public env, read through one validated `getPublicEnv()` in `apps/mobile`: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_AUTH_EMAIL_DELIVERY`, mirroring the web's `NEXT_PUBLIC_*` values. These are public by design.

### Password reset and deep links

- **Production sends no email today** (`NEXT_PUBLIC_AUTH_EMAIL_DELIVERY=off` in `docs/deploy.md`), so there is no password reset on web or mobile. This is accepted for v1: mobile hides Forgot password while `EXPO_PUBLIC_AUTH_EMAIL_DELIVERY` is off, exactly as the web does. Turning email delivery on stays its own decision (spec 0018), with its processor and legal page changes.
- So that reset works the day email is turned on, the deep link plumbing ships with v1:
  - Reset uses PKCE (a one time proof stored on the device that asked for the reset), so a code can only be exchanged where it was requested (see `app/auth/callback/route.ts`). The app therefore uses its own path: it calls `resetPasswordForEmail` with `redirectTo` set to `https://<site>/reset-password/app`, built by a core helper using the same `safeNextPath` rule as the web. The web keeps `/auth/callback` for itself, so a reset asked on the web never opens the app.
  - The Universal Link and App Link paths in v1 are exactly `/reset-password/app` and the title paths (`/movies/*`, `/shows/*`, `/games/*`) for shared links. Library routes and every other path stay on the web. On it, the app calls `exchangeCodeForSession` and shows the new password screen. When the app is not installed, the web serves a small page at `/reset-password/app` saying to open the link on the phone that asked for it.
  - `apps/web` serves `public/.well-known/apple-app-site-association` and `public/.well-known/assetlinks.json` with `Content-Type: application/json` set in `next.config.ts` headers (the Apple file has no extension), and `proxy.ts` excludes `.well-known` from its matcher (read `app/AGENTS.md` first).
  - Required inputs that exist only after setup: the Apple Team ID (for the AASA `appIDs`, `<TeamID>.com.kris1027.bestats`) and the SHA-256 fingerprint of the Android app signing key (from `eas credentials` and the first Play upload). Until then those files ship with only the title paths filled in for development builds.
  - Supabase `additional_redirect_urls` gains `https://<site>/reset-password/app` and its local twin; that config reaches the cloud only through `supabase config push`, run once approved.

### Account deletion (both apps)

- New migration (from `supabase/schemas/`): `public.delete_own_account()` returns void, `security definer`, `set search_path = ''`, owner `postgres`. It raises if `auth.uid()` is null, then deletes `from auth.users where id = auth.uid()`. The five user tables reference `auth.users (id) on delete cascade` (checked 2026-11-18, no `restrict`), so every mark, rating, tracked show, game row and the profile go with it. BeStats stores nothing in Supabase Storage, so no owned objects block the delete.
- Before the spec is built further, a pgTAP test on the local stack proves that a `postgres` owned security definer function can delete from `auth.users`. If it can't, stop and come back to `/architect`; do not reach for the service role.
- Grants: `revoke execute ... from public, anon`; `grant execute ... to authenticated`.
- Web: a Delete account section on `/account` (its layout is approved in its own build plan, AGENTS.md section 3) calling a Server Action. Mobile: a Delete account screen calling `POST /api/v1/me/account/delete` with `{ confirm: "DELETE" }`. Both make you type `DELETE`, call the same command, then sign out locally.
- `supabase/AGENTS.md` and `tests/140-security-sweep.test.sql` name this as the second security definer exception beside `username_available`.
- `/privacy` and `/terms` change from "deletion by email" to the self serve flow, with `LEGAL_LAST_UPDATED` updated in the same PR. The same privacy change adds the mobile app section of spec 0033 AC-15 (Expo in `PROCESSORS` for EAS Update).

### Offline cache and sign out

- TanStack Query persists catalog queries and `/api/v1/me/*` reads to AsyncStorage, `maxAge` 24 hours, `gcTime` at least as long, `buster` set to the app version so an update drops old shapes. Tokens never go in this cache.
- The persisted `me` data is private data at rest. Sign out, an expired session and account deletion all call `queryClient.clear()` and remove the persisted store, so the next person on a shared phone never sees the previous library.
- `@react-native-community/netinfo` drives the offline banner. Offline, the last loaded library and title pages show with the banner; writes fail visibly with Retry (no queued writes).
- Optimistic writes: a mark updates the screen at once and reverts with the error message when the server refuses it.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Delete account | whose account | `auth.uid()` inside the function, from the caller's JWT; the function takes no argument |
| Any mobile API call | access token | `getAccessToken()` reading the secure session store, refreshed only by `supabase-js` |
| Reset in app | the session for the new password | the code in the `/reset-password/app` link, exchanged with the verifier this device stored |
| Forgot password visible | whether reset can work | `EXPO_PUBLIC_AUTH_EMAIL_DELIVERY` |
| Offline banner | connection state | NetInfo |

### Key invariants

- No file in the workspace names the service role key; `security-boundary.test.ts` keeps proving it.
- `delete_own_account()` can only ever delete the caller; `anon` cannot execute it.
- A failed deletion shows an error and keeps the user signed in; the UI never claims success before the call returns (AGENTS.md section 11).
- After sign out or deletion, no private data remains in the app's cache.

### Security model

The function runs with elevated rights but takes no input, so its whole effect is fixed to the caller. pgTAP proves: `anon` gets a permission error; user A calling it removes only A's auth row and every A row in all five tables, and none of B's. Tokens live encrypted at rest; the persisted query cache is wiped on every sign out.

### Critical test scenarios

- Sign in on the phone, kill the app, reopen: still signed in; the AsyncStorage value is the encrypted session (no readable token in it), and its key is in `expo-secure-store`.
- Two requests hit 401 at once: one refresh happens, both retry once, the user stays signed in.
- Delete account on mobile: 204, signed out, cache empty, signing in again fails, and pgTAP shows the cascade removed every row.
- `anon` calling `delete_own_account()` through PostgREST gets a permission error.
- With email delivery off, Forgot password is hidden; with it on in a local build, a reset requested in the app opens `/reset-password/app` in the app and sets a new password.

**Rationale (short)**: Apple guideline 5.1.1(v) requires in app account deletion for any app with sign up. The engineer first preferred a server route using an admin key, but spec 0001 AC-15 and `security-boundary.test.ts` ban that key everywhere, so a security definer function bound to `auth.uid()` meets the store rule without loosening the security model. Email and password only keeps v1 free of Apple's rule that a third party sign in on iOS requires Sign in with Apple too. A dedicated `/reset-password/app` path avoids guessing which device holds the PKCE proof.
