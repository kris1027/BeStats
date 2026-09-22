# Verify: Authentication · spec 0005 · written 2026-09-22

_Steps derived from spec [0005](index.md) acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Nothing here is ticked yet, the feature is not built._

Run `supabase start` and `pnpm dev` first. Confirmation and recovery messages land in the local
Supabase test inbox, not a real mailbox, so open that inbox rather than an email client. Google
sign in is deliberately absent from this feature; any Google step belongs to feature 20.

Two accounts are needed throughout: **A** and **B**, plus one address that has never signed up,
called **unknown** below.

## Commands

- [ ] `pnpm typecheck` → passes
- [ ] `pnpm lint:ci` → passes with no warnings
- [ ] `pnpm test` → passes, including the new schema, path guard, `isSafeNextPath` and message mapping tests → AC-9, AC-11
- [ ] `pnpm build` → `/shows` and `/movies` still listed as static; the auth pages may be dynamic → AC-14
- [ ] `grep -rn "NEXT_PUBLIC_SITE_URL" --include="*.ts" --include="*.tsx" . | grep -v "lib/env.ts"` → no matches, the value is only read through `getPublicEnv()`
- [ ] `grep -n "minimum_password_length\|enable_confirmations\|site_url\|additional_redirect_urls" supabase/config.toml` → length is `8`, confirmations `true`, site URL matches `NEXT_PUBLIC_SITE_URL`, and the allow list covers `/auth/callback`, not just the bare origin → AC-9, AC-23
- [ ] `grep -n "rate_limit" supabase/config.toml` → thirty sign in attempts per hour per address and two emails per hour, the numbers AC-18 names. A different number fails this step → AC-18
- [ ] `grep -rn "cookies()\|headers()\|draftMode()\|createClient" app/layout.tsx components/layout/` → the account slot module is the only match → AC-14
- [ ] `grep -n "scope" app/\(auth\)/actions.ts` → `signOutAction` passes `scope: "local"` explicitly → AC-15
- [ ] Confirm the machine has outbound network access before the AC-9 breach step. Leaked password screening reaches HaveIBeenPwned from the Auth container, so offline it cannot be checked and must be reported unverified rather than passed → AC-9
- [ ] `pnpm build && pnpm start -p 3100`, then `grep -rl "SERVICE_ROLE\|sb-.*-auth-token\|eyJ" .next/static` → no matches → AC-22
- [ ] Same server: view source on `/sign-in` → the publishable key may appear, no access or refresh token does → AC-22
- [ ] Same server: `curl -s localhost:3100/sign-in | grep -i "noindex"` → present, and the same on `/sign-up`, `/forgot-password`, `/reset-password`, `/check-email`, `/account` → AC-20

## The account lifecycle

- [ ] Sign up as **A** with a valid password → lands on `/check-email`, the page shows A's address, no session cookie is set → AC-1
- [ ] Open the test inbox, click A's confirmation link → lands on `/shows` signed in, the navbar shows the avatar letter and display name → AC-3
- [ ] Click that same confirmation link a second time → lands on `/sign-in` with a plain message, no session → AC-3
- [ ] Sign out, then sign in as **A** → lands on `/shows`, signed in → AC-4
- [ ] Sign up as **B**, but do not confirm. Try to sign in as **B** with the correct password → refused, the message says the address needs confirming and offers a resend, no session → AC-6
- [ ] Use the resend control on `/check-email` for **B** → a second message arrives, and it works → AC-1

## Neutral messaging

- [ ] Sign up again with **A**'s address, which already exists → the screen is identical to a fresh sign up: same redirect to `/check-email`, same wording, nothing says the address is taken. Confirm the test inbox receives nothing, which is the behaviour being hidden → AC-2
- [ ] Time it: ten sign ups with fresh addresses and ten with **A**'s address, recording each response time. The two ranges must overlap. Record both ranges here → AC-2
- [ ] Sign in as **A** with the wrong password, then with the **unknown** address → both show one identical message that names neither the address nor which field was wrong → AC-5
- [ ] Request a password reset for **A**, then for **unknown** → both show the same confirmation, and neither reveals which one exists → AC-7

## Password rules

- [ ] Sign up with a seven character password → refused, the message names the eight character rule, no user is created → AC-9
- [ ] Sign up with a well known breached password such as `password123` → refused, the message says the password has appeared in a breach, no user is created → AC-9
- [ ] Repeat both on `/reset-password` and on the change password form on `/account` → same refusals, and the existing password is unchanged → AC-9, AC-16

## Recovery and change

- [ ] Request a reset for **A**, open the link in the test inbox → lands on `/reset-password` with a recovery session → AC-7
- [ ] Open `/reset-password` directly with no recovery session → refused, sent to `/forgot-password` or `/sign-in`, not a blank form → AC-7
- [ ] Set a new password → signed in, redirected to `/account`. Sign out, sign in with the old password → refused. Sign in with the new one → succeeds → AC-8
- [ ] On `/account`, change the password with the correct current password → succeeds. Try again with a wrong current password → refused, the password is unchanged → AC-16
- [ ] The change password form's rendering condition is covered by a unit test, not a browser step. No provider only account can exist until feature 20 adds Google, so the negative branch is untestable here and must be reported that way rather than ticked → AC-16
- [ ] Exceed the sign in rate limit by repeatedly submitting a wrong current password on `/account` → the limit fires, confirming the shared bucket is real → AC-16, AC-18

## The guard, both layers

- [ ] Signed out, open `/account` → redirected to `/sign-in?next=/account`. Sign in → land on `/account`, not `/shows` → AC-10
- [ ] Repeat for `/watchlist`, `/upcoming` and `/watched`, which have no pages yet → the redirect still fires, proving later features inherit the guard → AC-10
- [ ] Sign in with `next` set to `https://evil.example`, then `//evil.example`, then `/\evil.example`, then `\/\/evil.example`, then `shows` → all five land on `/shows` → AC-11
- [ ] Signed out, open `/account` → redirected with `next=/account`. From there click through to `/sign-up`, sign up, confirm from the inbox → land on `/account`, proving `next` survives the sign up detour → AC-10
- [ ] Temporarily narrow the proxy matcher so `/account` is not matched, rebuild, then request `/account` with no cookie and again with a forged `sb-*-auth-token` cookie → no private data renders either time. Restore the matcher afterwards → AC-12
- [ ] With the matcher still narrowed, invoke `changePasswordAction` from `/account` with no valid session → nothing is written and a visible error is returned → AC-12, AC-17

## Session expiry

- [ ] Open `/account` in browser 1. In browser 2, sign in as **A** and revoke sessions, or wait for expiry. Submit the change password form in browser 1 → a visible error with a sign in link carrying `/account`, no success state, the password unchanged → AC-17

## Sign out scope

- [ ] Sign in as **A** in two different browsers. Sign out in one → the other is still signed in on refresh → AC-15
- [ ] After signing out, the navbar shows Sign in and `/account` redirects → AC-15

## Rate limits

- [ ] Exceed the configured failed sign in limit for one address → the form says the limit was reached and to try again later, not a generic failure → AC-18
- [ ] Exceed the configured email send limit using the resend control → same, an honest message → AC-18

## Navbar and rendering

- [ ] Signed out, load `/shows` → the navbar shows Sign in; no signed in state is painted at any point → AC-13
- [ ] Signed in, load `/shows` → the account area shows the avatar letter, the display name taken from the part of the address before the `@`, and Sign out. Confirm with JavaScript disabled that the signed in state is still correct, which proves it is server rendered → AC-13
- [ ] Signed in on mobile width, open the menu sheet → the account block and Sign out appear there, matching `mobile-menu-open.svg` → AC-13, AC-21
- [ ] In `pnpm build` output, `/shows` and `/movies` are static, and the layout purity test passes, so the account slot is provably the only per request read in the shell → AC-14

## Interface and accessibility

- [ ] Compare `/sign-in` against `desktop-sign-in-page.svg` and `mobile-sign-in-page.svg` → the card, heading, subheading, field labels, Forgot password link and Sign in button match. The Google button and the "or use your login" divider are absent by design → AC-21
- [ ] `/sign-up`, `/check-email`, `/forgot-password`, `/reset-password` and `/account` reuse the same card, type scale and spacing → AC-21
- [ ] Tab through every auth screen → every control is reachable in a sensible order with a visible focus ring, and touch targets meet the sizes in `components/AGENTS.md` → AC-21
- [ ] Submit each form with an error → the message is associated with its field and announced, not colour only → AC-21
- [ ] Each screen has a loading state during submission and no dead end: every error offers a way forward → AC-21

## Logging

- [ ] Sign in wrongly, sign up, reset a password, and open a confirmation link, watching the server output → no password, token, cookie value or raw Supabase error object appears in any line → AC-19

---

# Build run · /develop · 2026-09-22

_Appended by `/develop`. The steps above are the design time checklist. These are the ones actually run against the local Supabase stack and a real browser during the build, with their results. `/check verify` should re-run them independently._

Setup used: `supabase start` with the stack **restarted** (`supabase stop --no-backup` first), because `supabase start` reuses a running auth container and silently keeps the old `[auth]` config. Confirm with `docker exec supabase_auth_BeStats env | grep PASSWORD_MIN` → `8`, not `6`. The app was run against the local stack by setting `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` in the shell, which take precedence over `.env.local`. `.env.local` points at the **cloud** project, where none of the `config.toml` settings apply.

## Commands

- [x] `pnpm typecheck` → passes
- [x] `pnpm lint:ci` → passes, no warnings
- [x] `pnpm test` → 226 passed, 30 files
- [x] `pnpm build` → `/shows` and `/movies` both listed as partial prerender (static shell); `/account` is dynamic by its `export const instant = false` → AC-14
- [x] `grep -rl "service_role\|sb_secret\|TMDB_READ_ACCESS_TOKEN" .next/static/` → no matches. No `eyJhbGciOi` token literal either → AC-22

## UI / manual

- [x] Sign up with a new address → lands on `/check-email?email=<address>` with a resend control; the message arrives in the test inbox → AC-1
- [x] Sign up with an address that already has an account → lands on `/check-email` identically. Timed ten runs of each: taken 1272 to 1301ms, new 1284 to 1296ms, ranges overlap → AC-2
- [x] Open the confirmation link → signed in, lands on the validated `next` (`/shows`); navbar shows the avatar letter, the name and Sign out → AC-3, AC-13
- [x] Open the same link a second time → `/sign-in` with "That link has expired or has already been used", no session → AC-3
- [x] Sign in with the right password → session created, lands on `next` or `/shows` → AC-4
- [x] Wrong password and an unknown address → one identical message, "Those details did not match an account", naming neither the address nor the field → AC-5
- [x] Sign in on an unconfirmed address with the correct password → refused, says the address needs confirming, offers the resend link, no session → AC-6
- [x] Request a reset for a known and an unknown address → identical copy both ways. The emailed link lands on `/reset-password` and nowhere else → AC-7
- [x] Set a new password → signed in, lands on `/account`; the previous password no longer signs in → AC-8
- [x] Password of five characters → refused, field marked `aria-invalid`, message "Your password needs at least 8 characters" bound by `aria-describedby` → AC-9, AC-21
- [x] Signed out request for `/account` and `/watchlist` → `307` to `/sign-in?next=%2Faccount` / `%2Fwatchlist`; signing in lands on that exact path → AC-10
- [x] `next` set to `https://evil.example`, `//evil.example`, `/\evil.example` and `shows` → every one lands on `/shows` → AC-11
- [x] **Proxy matcher replaced with a path that matches nothing**, then `/account` requested with no cookie and with a forged cookie → both still redirect and render no private data. Restore the matcher afterwards → AC-12
- [x] Navbar signed out shows Sign in; signed in shows `V`, `verify2` and Sign out, both produced on the server → AC-13
- [x] Sign out in browser 1 → browser 2, signed in to the same account, stays signed in → AC-15
- [x] `/account` renders the change password form for an email account; wrong current password is refused and marks that field; the right one succeeds → AC-16
- [x] Expire only the `sb-` cookies between rendering the change password form and submitting it → visible error "Your session has ended, so nothing was saved", a `Sign in again` link to `/sign-in?next=%2Faccount`, no success state, and the old password still works → AC-17
- [x] `<meta name="robots" content="noindex, nofollow">` on `/sign-in`, `/sign-up`, `/check-email`, `/reset-password` and `/account` → AC-20
- [x] Every auth log line emitted during the whole run is exactly `{event, result, outcome}`; no password, token, cookie, link or address in any of them → AC-19
- [x] Sign in at 390px wide → matches `design/mobile-sign-in-page.svg` for card, type scale and spacing, Google button deliberately absent → AC-21

## Value sourcing

One step per row of the spec's value sourcing table, exercising the edge that breaks if the source is wrong.

- [x] Navbar name and avatar letter come from the address at render time → `verify2@example.com` renders `verify2` and `V`. Unit tested for `a@`, `7even@` and an empty address → AC-13
- [x] `/account` address comes from `auth.users.email` via `getUser()` → shows `verify2@example.com` after the address is confirmed
- [x] The change password form's presence comes from an identity with provider `email` → unit tested for email only, Google only, both, empty and absent, because a provider only account cannot exist until feature 20 → AC-16
- [x] `signInAction`'s landing path comes from `next`, validated → the four hostile values above all fall back to `/shows`
- [x] `signUpAction`'s already registered signal → **not** the empty `identities` array the spec names. The installed Supabase returns `422 user_already_exists`. Both are handled; the 422 is the one that actually fires → AC-2
- [x] The confirmation and recovery link base comes from `NEXT_PUBLIC_SITE_URL` → the emailed links carry `redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback` → AC-23
- [x] `/check-email`'s displayed address is echoed only after passing `emailSchema` → a non address query value renders no address rather than arbitrary text

## Not verified, and why

- **AC-9's breach branch.** Leaked password protection has no `supabase/config.toml` key: it is a dashboard setting on the hosted project (Authentication > Providers > Email) and is unavailable on the local stack. The code classifies and reports the outcome; the setting itself belongs to feature 20.
- **AC-18's rate limits.** Configured at the numbers the spec names, but the knobs do not measure what AC-18 says: `sign_in_sign_ups` is per five minutes per IP address, not per hour per address, and Supabase exposes no per address sign in limit. Not exercised to exhaustion.
- **Real email deliverability.** Proven against the local test inbox only, as the spec says. Feature 20 owns the real thing.
