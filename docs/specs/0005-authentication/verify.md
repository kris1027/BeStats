# Verify: Authentication · spec 0005 · written 2026-09-22

_Steps derived from spec [0005](index.md) acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run `supabase start` and `pnpm dev` first. Confirmation and recovery messages land in the local
Supabase test inbox, not a real mailbox, so open that inbox rather than an email client. Google
sign in is deliberately absent from this feature; any Google step belongs to feature 20.

Two accounts are needed throughout: **A** and **B**, plus one address that has never signed up,
called **unknown** below.

## Commands

- [x] `pnpm typecheck` → passes
- [x] `pnpm lint:ci` → passes with no warnings
- [x] `pnpm test` → passes, including the new schema, path guard, `isSafeNextPath` and message mapping tests → AC-9, AC-11
- [x] `pnpm build` → `/shows` and `/movies` still listed as static; the auth pages may be dynamic → AC-14
- [x] `grep -rn "NEXT_PUBLIC_SITE_URL" --include="*.ts" --include="*.tsx" . | grep -v "lib/env.ts"` → no matches, the value is only read through `getPublicEnv()`
- [x] `grep -n "minimum_password_length\|enable_confirmations\|site_url\|additional_redirect_urls" supabase/config.toml` → length is `8`, confirmations `true`, site URL matches `NEXT_PUBLIC_SITE_URL`, and the allow list covers `/auth/callback`, not just the bare origin → AC-9, AC-23
- [x] `grep -n "sign_in_sign_ups\|email_sent" supabase/config.toml` → `sign_in_sign_ups = 30`, counted per five minute interval per IP address, and `email_sent = 2` per hour, the numbers AC-18 names. A different number fails this step → AC-18
- [x] `grep -rn "cookies()\|headers()\|draftMode()\|createClient" app/layout.tsx components/layout/` → the account slot module is the only match → AC-14
- [x] `grep -n "scope" app/\(auth\)/actions.ts` → `signOutAction` passes `scope: "local"` explicitly → AC-15
- [x] `grep -in "leaked\|pwned" supabase/config.toml` → comment only, no setting. Leaked password protection has no config key and does not run on the local stack, so AC-9's breach step below is reported unverified here and is checkable only against the hosted project once feature 20 switches it on → AC-9
- [x] `pnpm build && pnpm start -p 3100`, then `grep -rl "SERVICE_ROLE\|sb-.*-auth-token\|eyJ" .next/static` → no matches → AC-22
- [x] Same server: view source on `/sign-in` → the publishable key may appear, no access or refresh token does → AC-22
- [x] Same server: `curl -s localhost:3100/sign-in | grep -i "noindex"` → present, and the same on `/sign-up`, `/forgot-password`, `/reset-password`, `/check-email`, `/account` → AC-20

## The account lifecycle

- [x] Sign up as **A** with a valid password → lands on `/check-email`, the page shows A's address, no session cookie is set → AC-1
- [x] Open the test inbox, click A's confirmation link → lands on `/shows` signed in, the navbar shows the avatar letter and display name → AC-3
- [x] Click that same confirmation link a second time → lands on `/sign-in` with a plain message, no session → AC-3
- [x] Sign out, then sign in as **A** → lands on `/shows`, signed in → AC-4
- [x] Sign up as **B**, but do not confirm. Try to sign in as **B** with the correct password → refused, the message says the address needs confirming and offers a resend, no session → AC-6
- [x] Use the resend control on `/check-email` for **B** → a second message arrives, and it works → AC-1

## Neutral messaging

- [x] Sign up again with **A**'s address, which already exists → Supabase answers 422 `user_already_exists`, and the screen is identical to a fresh sign up: same redirect to `/check-email`, same wording, nothing says the address is taken. Confirm the test inbox receives nothing, which is the behaviour being hidden → AC-2
- [x] Time it: ten sign ups with fresh addresses and ten with **A**'s address, recording each response time. The two ranges must overlap. Record both ranges here → AC-2
- [x] Sign in as **A** with the wrong password, then with the **unknown** address → both show one identical message that names neither the address nor which field was wrong → AC-5
- [x] Request a password reset for **A**, then for **unknown** → both show the same confirmation, and neither reveals which one exists → AC-7

## Password rules

- [x] Sign up with a seven character password → refused, the message names the eight character rule, no user is created → AC-9
- [x] `pnpm test` → `lib/auth/supabase-error.test.ts` shows an `AuthWeakPasswordError` carrying the server's real wording and `reasons: ["pwned"]` classified as `passwordBreached`, and one with `reasons: ["length"]` as `passwordTooShort` → AC-9
- Moved to feature 20: sign up with a breached password such as `password123` on the hosted project → refused with the breach copy, no user created → AC-9
- [x] Repeat both on `/reset-password` and on the change password form on `/account` → same refusals, and the existing password is unchanged → AC-9, AC-16

## Recovery and change

- [x] Request a reset for **A**, open the link in the test inbox → lands on `/reset-password` with a recovery session → AC-7
- [x] Open `/reset-password` directly with no recovery session → the form renders, which is deliberate: the page reads no session, so it stays prerendered, and the action is the gate. Submit it → refused with the session expired copy, a `Request a new reset link` link, no write, and no success state → AC-7, AC-24
- [x] Sign in normally, then open `/reset-password` with that ordinary session and submit a new password → refused the same way, and the old password still signs in. This is the takeover path: without it, the current password check on `/account` can be walked around → AC-24
- [x] Set a new password → sent to `/sign-in` with a plain confirmation, not to `/account`, and not signed in. Sign in with the old password → refused. Sign in with the new one → succeeds → AC-8
- [x] Before that reset, sign in as **A** in a second browser. Right after the reset, refresh `/account` in the second browser: it may still show **A** in the navbar and on the page, which is accepted, but the change password form is gone, because the page's `getUser()` call is refused with `403 session_not_found`. Wait until its access token has expired (at most 600 seconds; decode the cookie's token and check `exp` if you want the exact moment), then refresh → signed out, because the refresh is refused → AC-8
- [x] After `supabase stop --no-backup` and `supabase start`, decode a freshly issued access token with `node -e 'console.log(JSON.parse(Buffer.from(process.argv[1].split(".")[1], "base64url")))' <access token>` → `exp` minus `iat` is 600, proving `jwt_expiry` took effect on the running stack → AC-8
- [x] Open the recovery link, set a password, then return to `/reset-password` in the same browser and try to set another → refused, because the session was spent. Without this the same link keeps setting passwords for the life of its session → AC-24
- [x] On `/account`, change the password with the correct current password → succeeds. Try again with a wrong current password → refused, the password is unchanged → AC-16
- [x] `pnpm test` → `lib/auth/identity.test.ts` covers the change password form's rendering condition for email only, Google only, both, empty and absent → AC-16
- Moved to feature 20: sign in with a Google only account and open `/account` → no change password form → AC-16
- Moved to feature 20: exceed the sign in rate limit by repeatedly submitting a wrong current password on `/account` → the limit fires, confirming the shared bucket is real → AC-16, AC-18

## The guard, both layers

- [x] Signed out, open `/account` → redirected to `/sign-in?next=/account`. Sign in → land on `/account`, not `/shows` → AC-10
- [x] Repeat for `/watchlist`, `/upcoming` and `/watched`, which have no pages yet → the redirect still fires, proving later features inherit the guard → AC-10
- [x] Sign in with `next` set to `https://evil.example`, then `//evil.example`, then `/\evil.example`, then `\/\/evil.example`, then `shows` → all five land on `/shows` → AC-11
- [x] Signed out, open `/account` → redirected with `next=/account`. From there click through to `/sign-up`, sign up, confirm from the inbox → land on `/account`, proving `next` survives the sign up detour → AC-10
- [x] Temporarily narrow the proxy matcher so `/account` is not matched, rebuild, then request `/account` with no cookie and again with a forged `sb-*-auth-token` cookie → no private data renders either time. Restore the matcher afterwards → AC-12
- [x] With the matcher still narrowed, invoke `changePasswordAction` from `/account` with no valid session → nothing is written and a visible error is returned → AC-12, AC-17

## Session expiry

- [x] Open `/account` in browser 1. In browser 2, sign in as **A** and revoke sessions, or wait for expiry. Submit the change password form in browser 1 → a visible error with a sign in link carrying `/account`, no success state, the password unchanged → AC-17

## Sign out scope

- [x] Sign in as **A** in two different browsers. Sign out in one → the other is still signed in on refresh → AC-15
- [x] After signing out, the navbar shows Sign in and `/account` redirects → AC-15

## Rate limits

- [x] `pnpm test` → `lib/auth/supabase-error.test.ts` shows a 429 and an `over_email_send_rate_limit` error both classified as `rateLimited` → AC-18
- Moved to feature 20: exceed `sign_in_sign_ups` from one IP address, thirty attempts inside five minutes → the form says the limit was reached and to try again later, not a generic failure. The bucket is per IP, so spreading the attempts over several addresses does not avoid it, and concentrating them on one address does not trip it any sooner → AC-18
- Moved to feature 20: exceed `email_sent`, two inside an hour, using the resend control → same, an honest message. This limit only bites once SMTP is configured → AC-18

## Navbar and rendering

- [x] Signed out, load `/shows` → the navbar shows Sign in; no signed in state is painted at any point → AC-13
- [x] Signed in, load `/shows` → the account area shows the avatar letter, the display name taken from the part of the address before the `@`, and Sign out. Fetch the same URL with the session cookie and read the raw HTML: the name and Sign out are in it, which is what proves the server produced them. Do not prove this with scripting switched off; the slot is a streamed Suspense chunk, so with no JavaScript the skeleton is all that shows, and that is accepted (AC-13, and see Consequences) → AC-13
- [x] Signed in on mobile width → the account block and Sign out sit inline in the bar. There is no menu button and no sheet; `mobile-menu-open.svg` belongs to feature 9, which wires `MobileMenuSheet` in once Watchlist, Upcoming and Watched exist → AC-13, AC-21
- [x] In `pnpm build` output, `/shows` and `/movies` are static, and the layout purity test passes, so the account slot is provably the only per request read in the shell → AC-14

## Interface and accessibility

- [x] Compare `/sign-in` against `desktop-sign-in-page.svg` and `mobile-sign-in-page.svg` → the card, heading, subheading, field labels, Forgot password link and Sign in button match. The Google button and the "or use your login" divider are absent by design → AC-21
- [x] `/sign-up`, `/check-email`, `/forgot-password`, `/reset-password` and `/account` reuse the same card, type scale and spacing → AC-21
- [x] Tab through every auth screen → every control is reachable in a sensible order with a visible focus ring, and touch targets meet the sizes in `components/AGENTS.md` → AC-21
- [x] Submit each form with an error → the message is associated with its field and announced, not colour only → AC-21
- [x] Each screen has a loading state during submission and no dead end: every error offers a way forward → AC-21

## Logging

- [x] Sign in wrongly, sign up, reset a password, and open a confirmation link, watching the server output → no password, token, cookie value or raw Supabase error object appears in any line → AC-19

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
- [x] `signUpAction`'s already registered signal → `422 user_already_exists`, which is what the installed Supabase returns and what AC-2 now names. The empty `identities` array is handled too, for versions that obfuscate instead; the 422 is the one that actually fires → AC-2
- [x] The confirmation and recovery link base comes from `NEXT_PUBLIC_SITE_URL` → the emailed links carry `redirect_to=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback` → AC-23
- [x] `/check-email`'s displayed address is echoed only after passing `emailSchema` → a non address query value renders no address rather than arbitrary text

## Not verified, and why

- **AC-9's breach branch.** Leaked password protection has no `supabase/config.toml` key: it is a dashboard setting on the hosted project (Authentication > Providers > Email) and is unavailable on the local stack. AC-9 now says so. The code classifies and reports the outcome; switching the setting on, and verifying this branch, belongs to feature 20.
- **AC-18's rate limits.** Configured at the numbers the spec names, and AC-18 now states what the knobs actually measure: `sign_in_sign_ups` per five minute interval per IP address, `email_sent` per hour. Not exercised to exhaustion.
- **Real email deliverability.** Proven against the local test inbox only, as the spec says. Feature 20 owns the real thing.

---

# Verify run · /check verify · 2026-09-22

_Independent re-run of the checklist above against a production build (`pnpm build` then `pnpm start`)
on the local Supabase stack, driven in a real browser. Ticks above are from this run. Ten steps are
left unticked; the four that matter are listed under **Failing** below, the rest are the ones the
checklist itself says to report rather than tick._

Setup: local stack already running (auth container confirmed carrying `GOTRUE_PASSWORD_MIN_LENGTH=8`,
`GOTRUE_MAILER_AUTOCONFIRM=false`, allow list including `/auth/callback`). The app was built and
served on port 3000 with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`NEXT_PUBLIC_SITE_URL` set in the shell, so `.env.local`'s cloud project was not touched. Accounts
used: `a-0922a@`, `b-0922b@`, `c-0922c@`, `d-0922d@example.com`, all in the local stack only.

Checks: `pnpm typecheck` passes · `pnpm lint:ci` passes with no warnings · `pnpm test` 226 passed in
30 files · `pnpm build` lists `/shows` and `/movies` as partial prerender and `/account` as dynamic.

AC-2 timing, twenty runs interleaved: fresh addresses 1242 to 1256ms, A's existing address 1243 to
1255ms. The ranges overlap almost exactly.

## Failing

- **`next` is lost on the sign in to sign up detour** (step under _The guard, both layers_, AC-10).
  From `/sign-in?next=%2Faccount`, the "Create an account" link goes to a bare `/sign-up`, so the
  confirmation email carries `next=%2Fshows` and the person lands on `/shows`. The flow itself
  supports it: `/sign-up?next=%2Faccount` carries the value all the way through. The two cross links
  at `app/(auth)/sign-in/page.tsx:39` and `app/(auth)/sign-up/page.tsx:33` are hard coded.
- **`/reset-password` opened with no recovery session renders the form** (step under _Recovery and
  change_, AC-7). The action refuses correctly and writes nothing, so this is not a security hole,
  but the checklist asks for a redirect and the page deliberately does not do one. Either the page
  gains the redirect or the step is rewritten to match the documented choice.
- **JavaScript disabled shows no account control at all** (step under _Navbar and rendering_, AC-13).
  The signed in markup is genuinely in the server HTML, so AC-13's "produced on the server" holds;
  but the account slot arrives as a streamed Suspense chunk, so with scripting off the navbar shows
  only the skeleton, neither Sign in nor the account.
- **There is no menu sheet to open** (step under _Navbar and rendering_, AC-13, AC-21).
  `MobileMenuSheet` is used only by `/showcase`; the real navbar puts the account block inline at
  mobile width. `mobile-menu-open.svg` draws a sheet holding Watchlist, Upcoming, Watched and the
  account block, and those links belong to feature 9, so this step probably belongs there too.

## Blocked, not failed

- **AC-18 at runtime.** The numbers are in `supabase/config.toml` as specced, but the local stack
  does not apply them: the auth container carries no sign in or sign up limit variable at all and
  `GOTRUE_RATE_LIMIT_EMAIL_SENT=360000`. Forty wrong sign in attempts in a row all returned 400, no
  429. So both rate limit steps, and the shared bucket step on `/account`, are unverifiable here and
  belong with feature 20 on the hosted project.
- **AC-9's breach branch** and **AC-16's provider only branch**, both as the checklist already says.
- **Loading states during submission** were not exercised in this run.

## Worth a look in /check review

- The session cookie `sb-127-auth-token` is set with `httpOnly: false`, the `@supabase/ssr` default,
  so any script on the page can read the access and refresh token.
- Deleting the session rows out of `auth.sessions` did not stop a change password write: the access
  token stayed acceptable to the auth server until expiry. AC-17 is proven for a missing cookie, not
  for a server side revoke.
- A failed sign up clears the email field, so the address has to be typed again.

---

# Settled by /architect · 2026-09-22

The four failures above were taken through `/architect` the same day. Three were the checklist expecting
something the build had deliberately not done, and those steps are rewritten above; one was a real hole, and it
became a new acceptance criterion. Nothing here is ticked, because the fix is not built yet.

- **The recovery form accepted any session.** Signing in normally and submitting `/reset-password` set a new
  password with no current password asked for, proven in a browser: the old password stopped authenticating.
  Now **AC-24**, gated on the `amr` claim, with two new steps under _Recovery and change_. Build plan step 7.
- **`next` dropped on the sign in to sign up detour.** Also build plan step 7. Its step above stays as written.
- **`/reset-password` renders with no recovery session**: accepted, the action is the gate. Step rewritten.
- **No account control with scripting off**: accepted, the markup is server produced. Step rewritten to prove it
  from the served HTML.
- **The mobile menu sheet**: moved to feature 9 with the links that fill it. Step rewritten to describe the bar
  as it actually is.

---

# Verify run 2 · /check verify · 2026-09-22

_Re run after the step 7 corrections, against a production build on the local stack, driven by a headless
Chromium script. Six steps newly ticked above. Verdict: FAIL, three items below._

Checks: `pnpm typecheck` passes · `pnpm lint:ci` passes · `pnpm test` 232 passed in 30 files · `pnpm build`
lists `/shows` and `/movies` as partial prerender · no secret or `eyJhbGciOi` literal in `.next/static`.

## Failing

- **A second browser still looks signed in after a reset** (AC-8). After the reset signs out globally, browser 2
  refreshed `/account` and still got the navbar name, Sign out, and "You are signed in as …". It can no longer
  write (the change password form disappears, and Auth answers `403 session_not_found`), but it paints as signed
  in until the access token expires, up to `jwt_expiry = 3600` seconds. `getClaims()` verifies the token locally,
  so it never learns the session was revoked.
- **A replayed recovery cookie gets the wrong copy** (AC-24, AC-21). Cookies captured from a recovery session,
  replayed after that session was spent: nothing is written, but the form says "Something went wrong on our
  side" with no reset link, logged as `outcome: unexpected`, not the session expired copy AC-24 names.
- **Mobile bar overflows with a long name** (AC-21). At 390px, signed in as `v2-detour-1790103186962`, the page
  scrolls sideways by 4px and Sign out sits flush with the right edge (box ends at x 394).

## Still blocked

AC-18 rate limits (not applied by the local stack), AC-9 breach branch (hosted only), AC-16 provider only branch
(unit tested only). Loading states: pending label and disabled button seen on sign up, sign in, forgot password,
reset and resend; the change password form on `/account` was not probed.

## Worth a look in /check review

- Resetting to the current password logs `outcome: unexpected`; `same_password` is not in `classifyAuthError`.

---

# Settled by /architect · 2026-09-22 (run 2)

- **A second browser still looks signed in after a reset** (AC-8): accepted with a bound. `getClaims()` checks the
  token locally, so no page can see a revocation until the token expires, and Row Level Security has the same
  blind spot for a direct API call. The token lifetime drops to `jwt_expiry = 600`, AC-8 now promises writes
  refused at once and signed out within that lifetime, and the step above is rewritten to match. Build plan step 8.
  The hosted project needs the same value in feature 20.
- The replayed recovery cookie copy and the mobile overflow were not part of this run and remain open above.

---

# Verify run 3 · /check verify · 2026-09-22

_Re run after build plan steps 7 and 8, against a production build on a freshly restarted local stack
(auth container carries `GOTRUE_JWT_EXP=600`), driven by a headless Chromium script. Four steps newly
ticked above. Verdict: BLOCKED. Every step this environment can run passes; the five left unticked
need the hosted project or feature 20._

Checks: `pnpm typecheck` passes · `pnpm lint:ci` passes · `pnpm test` 235 passed in 31 files · `pnpm build`
lists `/shows` and `/movies` as partial prerender, `/account` and `/auth/callback` dynamic · no secret or
`eyJhbGciOi` literal in `.next/static`.

## Closed since run 2

- **`next` across the detour** (AC-10). `/account` → `/sign-in?next=%2Faccount`, whose footer link is
  `/sign-up?next=%2Faccount`, whose own footer link back is `/sign-in?next=%2Faccount`. Sign up, confirm, land
  on `/account`. With `next` set to `//evil.example`, `https://evil.example` or `/\evil.example`, the cross link
  is a bare `/sign-up`.
- **Recovery gate** (AC-24). A password session (`amr` method `password`) submitting `/reset-password` gets the
  session expired copy and `Request a new reset link`, and the old password still signs in. After a real
  reset, a second attempt in the same browser and a replay of the captured recovery cookies in a new browser
  both get the session expired copy; "Something went wrong" no longer appears.
- **Reset outcome** (AC-8). Lands on `/sign-in?notice=password-reset` with the notice, no auth cookie left, the
  navbar shows Sign in. Old password refused, new one signs in, the attempted third password was never set.
- **Second browser** (AC-8). Token `exp - iat` is 600. Right after the reset, `/account` still paints the
  account in the navbar but the change password form is gone. Once the token expired, `/account` redirected to
  `/sign-in?next=%2Faccount` and `/shows` showed Sign in.
- **Mobile bar** (AC-21). At 390px with a 35 character local part, `scrollWidth` is 390, Sign out ends at x 374
  and is 44px tall; the name is screen reader only below `md`.
- **Loading state on `/account`** (AC-21). With the POST held for 1.5s the button reads `Saving…` and is
  disabled; the wrong current password then shows its message.

## Still blocked

AC-9 breach branch (hosted only), AC-16 provider only branch (no Google identity until feature 20), and the three
rate limit steps under AC-16 and AC-18 (the local stack does not apply those limits).

## Worth a look in /check review

- A wrong current password on `/account` logs `outcome: invalid_credentials`, while the screen correctly shows
  the wrong current password copy. The log and the screen disagree.
- Signing in over an existing, longer session left a stale `sb-127-auth-token` chunk in the cookie jar (the
  decoded value was the new session followed by leftover bytes). `@supabase/ssr` tolerated it here.

---

# Settled by /architect · 2026-09-22 (run 3)

Every step this environment can run passed in verify run 3. The five left over need the hosted project, so they
move to feature 20's verify and are marked `Moved to feature 20` above, with no checkbox, so they no longer hold
this feature open. In their place, two new `pnpm test` steps prove our side is ready for the errors those steps
would produce: a 429 and a breach refusal each reach the right copy. Those tests do not exist yet; they are build
plan step 9. Step 9 also fixes a real bug found while settling this: the classifier looks for `pwned` in the message,
but the Auth server's breach refusal never says it, so a breached password would get the eight character copy. The AC-16 rendering condition step is ticked, because verify run 3's `pnpm test` ran that suite.


---

# Verify run 4 · /check verify · 2026-09-22

_Checked the two steps still open, both from build plan step 9. Verdict: FAIL, because step 9 is not built yet.
Nothing newly ticked._

Checks: `pnpm typecheck` passes · `pnpm lint:ci` passes · `pnpm test` 235 passed in 31 files.

## Failing

- **The breach branch still reads the message** (AC-9). `classifyAuthError` still matches `pwned|breach|leaked`
  against the message. A scratch probe gave it an `AuthWeakPasswordError` with the server's real wording and
  `reasons: ["pwned"]`: it returned `password_too_short`, not `password_breached`. The `reasons` check step 9
  names is not there.
- **The mapping tests do not exist** (AC-9, AC-18). `lib/auth/supabase-error.test.ts` covers only the session
  cases. The same probe showed that the 429 and `over_email_send_rate_limit` cases already classify as
  `rate_limited`, and `reasons: ["length"]` as `password_too_short`. So only the breach fix and the four
  committed tests are owed.

The browser flows were not driven again. Nothing they touch has changed since run 3.

---

# Verify run 5 · /check verify · 2026-09-22

_Re run after build plan step 9. Verdict: PASS. The last two steps are ticked above, so every step this
environment can run is now ticked. What is left is marked `Moved to feature 20` and has no checkbox._

Checks: `pnpm typecheck` passes · `pnpm lint:ci` passes · `pnpm test` 239 passed in 31 files, and the seven
`supabase-error.test.ts` cases pass, including the 429, the email send limit, the breach refusal read from
`reasons` (using the server's real wording), and the length refusal · `pnpm build` compiles, with `/shows` and
`/movies` partial prerender.

Against the running local stack: the raw Auth response to a seven character sign up is
`422 weak_password` with `weak_password.reasons: ["length"]`. The real SDK error from that response goes through
`classifyAuthError` as `password_too_short`, so the move to `reasons` changes nothing for the case the local
stack can produce. On a production build at `/sign-up`, the same password is refused with
"Your password needs at least 8 characters." bound to the invalid field. The app's own schema catches it before
Auth is called, so the breach branch still can only be seen on the hosted project (feature 20).

# Steps added by /develop · 2026-09-22 (session cookie flags)

_From build plan item 10, the fresh model review correction. Start every step from a cleared cookie jar: the
library skips rewriting a cookie whose value has not changed, so an older session stays script readable until
its next refresh. If `.env.local` points at the cloud project, start `pnpm dev` with `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to the local stack for that one process._

## UI / manual

- [ ] Sign in at `/sign-in?next=%2Faccount` → lands on `/account`; the `Set-Cookie` for `sb-127-auth-token` on the
  POST shows `HttpOnly; SameSite=lax`, and `document.cookie` is empty on `/account` and on `/shows` → AC-25
- [ ] Signed in, move the session's `expires_at` into the past and load `/account` → the page renders signed in,
  the access token has rotated, and the proxy's `Set-Cookie` on that GET carries `HttpOnly` → AC-25
- [ ] Sign out → the removal cookie (`Max-Age=0`) also carries `HttpOnly`, no `sb-` cookie remains, and
  `/account` redirects to `/sign-in?next=%2Faccount` → AC-25
- [ ] Request a reset at `/forgot-password` → every code verifier cookie on that POST carries `HttpOnly`. Open the
  link from Mailpit → `/auth/callback` sets `sb-127-auth-token` with `HttpOnly`, lands on `/reset-password`, and
  saving a new password lands on `/sign-in` with the reset notice → AC-25, AC-8
- [ ] Sign up a new address → the code verifier cookies are `HttpOnly`. Open the confirmation link → lands on
  `/shows` signed in, with an `HttpOnly` session cookie and an empty `document.cookie` → AC-25

## Commands

- [ ] `pnpm vitest run lib/supabase` → `cookie-options.test.ts` proves `secure` is false on an `http` site URL and
  true on an `https` one; `cookie-boundary.test.ts` passes → AC-25
- [ ] Temporarily drop `cookieOptions: sessionCookieOptions()` from `proxy.ts`, or the `options` argument from its
  `response.cookies.set`, then run `cookie-boundary.test.ts` → it fails. Restore the file afterwards → AC-25

## Acceptance-criteria coverage

- AC-25 is covered by every step above. The `Secure` half on a real `https` origin is carried by feature 20's
  verify (spec 0005, Consequences).
