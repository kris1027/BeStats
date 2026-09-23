# 0005. Authentication with Supabase email and password

**Date**: 2026-09-22
**Status**: Accepted

Scope feature: [6. Authentication](../../scope/scope.md) · GA tier

## Summary

This decides how people get an account in BeStats and how the app knows who is asking. Supabase Auth owns identity, and every form posts to a Server Action (a function that runs on the server, called straight from a form) so no session token is ever handled in the browser. Sign up requires a confirmed email address and a password of at least eight characters, and, on the hosted project, one that has not appeared in a known breach. Private pages are protected twice over: the proxy redirects a signed out visitor for a clean experience, and every server read and write rechecks the session itself, because the redirect is convenience and the recheck is the real boundary. Google sign in is deliberately not built here; it moves to feature 20 with the rest of the provider setup, so this feature ships email and password only.

## Requirements

**User stories**:

- As a visitor, I want to create an account with my email address and confirm it, so that I can start tracking what I watch and nobody else can claim my address.
- As a returning user, I want to sign in and land on the page I was trying to reach, so that signing in does not lose my place.
- As a user who forgot my password, I want to set a new one from a link sent to my inbox, so that I am never locked out of my own history.
- As a signed in user, I want a clear account page where I can see which address I am signed in as, change my password and sign out, so that I stay in control of the account.
- As any visitor, I want the forms never to tell a stranger whether an address has an account here, so that my membership is not discoverable.
- As a developer, I want private data to be unreachable without a valid session even if the redirect is bypassed, so that a routing mistake is never a data leak.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: Signing up with a new address and a valid password creates an unconfirmed user in `auth.users`, creates no session, and lands the person on `/check-email` showing the address the message went to and a resend control.
- **AC-2**: Signing up with an address that already has a confirmed account produces an outcome indistinguishable from AC-1. The installed Supabase Auth (CLI 2.117) refuses that call with a 422 carrying the code `user_already_exists` and sends no message, so the action treats that code as the already registered signal, redirects to `/check-email` exactly as for a new address, and pads the branch so its response time falls inside the range the real path produces. Older and differently configured versions obfuscate instead, returning no error and a user with an empty `identities` array. Both signals are handled, because which one arrives is a property of the Auth server rather than of our code, and either one surfacing as an ordinary error would print "already registered" on the page and hand out a membership oracle. Measured over ten runs of each, the two ranges overlap.
- **AC-3**: Opening the confirmation link from the email marks the address confirmed, creates a session, and lands the person signed in. A link that is expired or already used lands on `/sign-in` with a plain message and no session.
- **AC-4**: Signing in with a confirmed address and the correct password creates a session and redirects to the validated `next` path, or to `/shows` when there is none.
- **AC-5**: A wrong password and an address with no account produce one identical message that names neither the address nor the field at fault.
- **AC-6**: Signing in with a correct password on an unconfirmed address is refused, says the address still needs confirming, and offers a resend path. No session is created.
- **AC-7**: Requesting a password reset shows the same confirmation whether or not the address has an account. When it does, the emailed link lands on `/reset-password` with a recovery session and nowhere else.
- **AC-8**: Setting a new password on `/reset-password` succeeds, ends every session for that account, and sends the person to `/sign-in` with a plain confirmation. The previous password no longer works, and the new one does. They are not left signed in: a recovery session is proof of email control, not of knowing a password, and ending every session is also what someone recovering an account wants, since it removes anyone else who was already in it. "Ends every session" has two parts with different timing. Immediately: every session and refresh token for the account is revoked, and any Auth call that looks the session up, such as `getUser()`, answers `403 session_not_found`. In another browser that makes the change password form on `/account` disappear, since its rendering condition comes from `getUser()`, with no message saying why; that silence is accepted as part of the window. A password change from there is still blocked, but by the current password check, not by the revocation: whoever types the new password is simply signing in fresh, which is not the intruder this protects against. Within one access token lifetime, which is `jwt_expiry = 600` seconds: another browser still carrying an unexpired access token keeps rendering as signed in, because `getClaims()` checks that token locally and cannot see a revocation. Its next request after the token expires tries to refresh, the refresh is refused, and it renders signed out. The same window applies to anyone holding a copied access token and calling the Supabase API directly, since Row Level Security checks only the token's signature and expiry. Ten minutes is the bound this spec accepts.
- **AC-9**: A password shorter than eight characters is refused with a message naming that rule, and no account is created and no password changed. The same holds for a password Supabase's leaked password protection rejects, wherever that protection is switched on. It has no `supabase/config.toml` key: it is a hosted project setting, under Authentication > Providers > Email in the dashboard, and the local CLI stack cannot run it at all. So this feature proves the breach branch in two halves it can reach: a unit test that a `weak_password` error whose `reasons` include `pwned` classifies as the breach outcome, whatever its message says, and one without `pwned` as the length outcome. The runtime half, a real breached password refused by the hosted Auth server, moves to feature 20's verify, together with switching the setting on.
- **AC-10**: A signed out request for any private path is redirected to `/sign-in?next=<path>`, and signing in from there lands on that exact path.
- **AC-11**: A `next` value is honoured only when it begins with exactly one forward slash, its second character is neither a slash nor a backslash, and it contains no control character (U+0000 to U+001F, or U+007F). The last rule exists because the URL parser deletes tab, line feed and carriage return wherever they appear, so `/\t/evil.example` passes a character by character check and then resolves to `//evil.example`. An absolute URL, a protocol relative value (`//evil.example`), a backslash form the browser normalises to one (`/\evil.example`, `\/\/evil.example`), a value carrying a control character, and a bare relative value are all discarded, and the person lands on `/shows`. Every value accepted must still resolve to the site's own origin through `new URL(value, origin)`, which is how the callback route uses it.
- **AC-12**: Every private Server Component and every Server Action resolves the user through the single `requireUser()` helper, which verifies the session itself rather than trusting the proxy. With the proxy bypassed entirely, a request carrying no cookie or a forged cookie still renders no private data and writes nothing.
- **AC-13**: The navbar renders Sign in when signed out, and the avatar letter, the display name and Sign out when signed in. Both are produced on the server, so no wrong state is ever painted first and then corrected. "Produced on the server" is proven from the served HTML, not from a render with scripting switched off: the account slot arrives as a streamed Suspense chunk, so a browser with no JavaScript keeps showing the fallback skeleton. That is accepted, because the markup is genuinely server produced, `/account` itself works with no JavaScript, and the alternative costs AC-14.
- **AC-14**: `/shows` and `/movies` still report as prerendered static shells in `pnpm build`. The account slot is the only code in the shared layout tree that reads a request scoped value, proven by a test that fails if `cookies()`, `headers()`, `draftMode()` or a Supabase server client appears in `app/layout.tsx` or in any layout level component outside the account slot module.
- **AC-15**: Sign out ends the session in the current browser only and returns to `/shows`. A session in a second browser for the same account remains signed in.
- **AC-16**: The change password form on `/account` requires the current password, enforces the same rules as AC-9 on the new one, and is rendered only for an account carrying an identity with provider `email`. The negative branch cannot be exercised in this feature, because no provider only account can exist until feature 20 adds Google, so it is covered by a unit test over the rendering condition rather than a browser step, and the browser step moves to feature 20's verify, where a Google only account first exists. Wrong current password attempts count against Supabase's sign in limit (AC-18); proving that at runtime moves to feature 20 with the rest of AC-18.
- **AC-17**: A Server Action invoked with an expired or revoked session writes nothing and returns a visible error offering a sign in link that carries the current path. No success state is ever shown for a write that did not happen.
- **AC-18**: The configured limits are the ones this spec names, written into `supabase/config.toml` under `[auth.rate_limit]` and reproduced in the verify steps: `sign_in_sign_ups = 30`, which Supabase counts per five minute interval per IP address and not per address, and `email_sent = 2`, counted per hour and only in effect once SMTP is configured. Supabase exposes no per address sign in limit, so this criterion cannot ask for one. Exceeding either shows a message saying the limit was reached and inviting a retry later, not a generic failure. A build that changes those numbers without changing this criterion fails it. The local CLI stack does not apply these limits (verify run 1 saw forty wrong sign ins in a row answered 400, never 429), so this feature proves the criterion in the two halves it can reach: the configured numbers, by reading `supabase/config.toml`, and the message, by a unit test that a 429 and an `over_email_send_rate_limit` error both classify as the rate limited outcome. Exhausting the real limits moves to feature 20's verify, on the hosted project.
- **AC-19**: No log line emitted by any auth path contains a password, an access or refresh token, a cookie value, or an email confirmation or recovery token.
- **AC-20**: Every auth screen and the account page are excluded from search indexing.
- **AC-21**: Every auth screen is fully operable by keyboard with a visible focus ring, meets the touch target sizes in `components/AGENTS.md`, and reuses the sign in artboard's card, type scale and spacing at both mobile and desktop widths.
- **AC-22**: The Supabase publishable key is the only Supabase credential present in the browser bundle. No service role key and no access or refresh token appears in served HTML or client JavaScript.
- **AC-23**: Confirmation and recovery links are built from `NEXT_PUBLIC_SITE_URL`, and the Supabase redirect allow list matches it exactly. A redirect target outside that list is refused by Supabase.
- **AC-24**: Setting a password on `/reset-password` requires a session that came from a recovery link. `resetPasswordAction` reads the `amr` claim (the list of methods that authenticated this session) and refuses anything whose method is not `recovery`, with the same session expired copy and the same offer of a fresh reset link. An ordinary signed in session is refused there, so the current password check AC-16 puts on `/account` cannot be walked around by visiting the recovery form instead. The gate covers the session as well as the moment: a recovery session spends itself on one successful reset, because the action then signs out globally (AC-8). Without that, `amr` keeps saying `recovery` for the life of the session, and the same browser can set another password, and another, with no current password ever asked. An `amr` claim that is absent, empty, or carries a method other than `recovery` is refused, including the bare string form the SDK's own type allows.
- **AC-25**: Every cookie the Supabase server clients write, the session cookie and its chunks as well as the PKCE code verifier, carries `HttpOnly`, and carries `Secure` whenever `NEXT_PUBLIC_SITE_URL` is `https`. On a signed in page, `document.cookie` contains no `sb-` cookie. Both clients, the one in [lib/supabase/server.ts](../../../lib/supabase/server.ts) and the one in [proxy.ts](../../../proxy.ts), take these options from one shared definition, so the proxy's refresh cannot quietly write the cookie back without them. `@supabase/ssr` 0.12.7 merges `cookieOptions` into every cookie it hands to `setAll`: each chunk, the code verifier, and the removal cookies on sign out. The `@supabase/ssr` default is `httpOnly: false`, and nothing in this app needs script to read the session, because the browser client is never used for auth (the Decision).

## Decision

**Chosen option**: Option 2: Supabase Auth driven entirely through Server Actions, with one callback Route Handler.

Every authentication mutation is a Server Action that uses the request scoped server client from [lib/supabase/server.ts](../../../lib/supabase/server.ts) and validates its input with Zod, and a single Route Handler at `/auth/callback` turns the token in an email link into a session. The browser never calls Supabase Auth and never holds a token.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `next-cache-components-optimizer` (`vercel/next.js`, `.agents/skills/next-cache-components-optimizer/`) · `next-dev-loop` (`vercel/next.js`, `.agents/skills/next-dev-loop/`) · `vitest` (`.agents/skills/vitest/`)

## Rationale

Reasoning, the options weighed and the premise note: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

This feature adds no tables and ships no migration. Identity lives entirely in the schema Supabase Auth owns, and the three tracking tables from spec [0001](../0001-user-tracking-schema-and-rls/index.md) already point at it.

| Entity | Owner | Key | Relevant fields | Relationships |
|---|---|---|---|---|
| `auth.users` | Supabase Auth | `id` uuid | `email` (unique, required), `email_confirmed_at` (nullable), `encrypted_password` (nullable for a provider only account), `last_sign_in_at` | referenced by all three tracking tables |
| `auth.identities` | Supabase Auth | `(provider, provider_id)` | `provider`, `user_id`, `email` | N:1 to `auth.users`, joined by verified email |
| `user_movie_state` | this project, exists | `(user_id, movie_id)` | unchanged | 1:N from `auth.users`, `on delete cascade` |
| `user_show_state` | this project, exists | `(user_id, show_id)` | unchanged | 1:N from `auth.users`, `on delete cascade` |
| `user_episode_state` | this project, exists | `(user_id, episode_id)` | unchanged | 1:N from `auth.users`, `on delete cascade` |

There is no `profiles` table. `AGENTS.md` section 8 permits one only when the interface genuinely needs fields the auth account does not carry, and nothing in `design/` does: the navbar's name and avatar letter are both derived from the email at render time. Nothing derived is stored, so nothing can go stale.

**State transitions**:

The account, as far as this feature is concerned:

```
(none) --sign up--> unconfirmed --confirmation link--> confirmed
unconfirmed --sign in--> refused, stays unconfirmed (AC-6)
confirmed --sign in--> confirmed, session active
confirmed --recovery link--> confirmed, recovery session (may only set a password)
confirmed, recovery session --password set--> confirmed, every refresh token revoked (AC-8)
other browser, unexpired access token --reset elsewhere--> still paints signed in, Auth refuses its writes
other browser --access token expires, refresh refused--> signed out (within 600 seconds, AC-8)
confirmed --sign out--> confirmed, no session in this browser
```

The session itself: absent, active, or expired. The proxy refreshes an active session on every matched request, which is the only place a refresh happens. An expired session is treated as absent everywhere else (AC-17).

**API surface**:

Server Actions live in `app/(auth)/actions.ts` and `app/account/actions.ts`. Every one returns the same result object rather than throwing, so the form can render the message:

```ts
type AuthActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "currentPassword", string>>;
};
```

`fieldErrors` is what lets AC-21 associate a message with its input. One shape for every action, so no form invents its own.

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `signUpAction` | Server Action | `email:string` (req), `password:string` (req), `next:string` (opt) | redirect to `/check-email?email=<address>&next=<path>` | none | invalid input, weak or breached password, rate limited |
| `resendConfirmationAction` | Server Action | `email:string` (req) | `status: "success"` with neutral copy | none | rate limited |
| `signInAction` | Server Action | `email:string` (req), `password:string` (req), `next:string` (opt) | redirect to validated `next` or `/shows` | none | bad credentials (neutral), unconfirmed address, rate limited |
| `requestPasswordResetAction` | Server Action | `email:string` (req) | `status: "success"`, identical copy either way | none | rate limited |
| `resetPasswordAction` | Server Action | `password:string` (req) | global sign out, then redirect to `/sign-in` with a plain confirmation | recovery session, checked through the `amr` claim, not merely a session (AC-24) | no session, a session that is not a recovery one, weak or breached password |
| `changePasswordAction` | Server Action | `currentPassword:string` (req), `password:string` (req) | `status: "success"` | signed in | no session (AC-17), wrong current password, weak or breached password, rate limited |
| `signOutAction` | Server Action | none | redirect to `/shows` | signed in | none that change the outcome, sign out is idempotent |
| `/auth/callback` | GET | either `code:string` (PKCE), or `token_hash:string` plus `type:"signup" \| "email" \| "recovery"`; `next:string` (opt) | 303 redirect with a session cookie set: validated `next` or `/shows` for a confirmation, `/reset-password` for `recovery` | none | expired or used token, neither shape present, a `type` we do not issue, all redirect to `/sign-in` with a plain message |

Two link shapes arrive here and both are accepted, because which one Supabase sends is a property of the email template rather than of our code. The stock confirmation and recovery templates use `{{ .ConfirmationURL }}`, which points at Supabase's own `/auth/v1/verify`; that endpoint spends the token and then redirects here with a PKCE `code`, which is exchanged for a session against the code verifier cookie this server set when it called `signUp` or `resetPasswordForEmail`. A template customised to `{{ .TokenHash }}` points straight here with `token_hash` and `type`, which is verified with `verifyOtp`. Earlier drafts of this spec named only the second shape, which the stock templates do not send.

A `code` link carries no `type`, so the journey is carried in our own `type` parameter, baked into the `redirect_to` when the recovery email is requested. That is what keeps a recovery link landing on the password form and nowhere else. Accepted `type` values are `signup`, `email` and `recovery`. `email_change` is refused in both shapes, because nothing in this feature changes an address; adding it is a later decision, not a build detail.

Routes: `/sign-in`, `/sign-up`, `/check-email`, `/forgot-password`, `/reset-password` are public pages in the `app/(auth)/` route group. `/account` is private at `app/account/page.tsx`. `/auth/callback` is a Route Handler at `app/auth/callback/route.ts`, not a page.

Supporting modules, named here so they are not invented:

- `lib/auth/user.ts`: `requireUser()` and `getOptionalUser()`. Both resolve the session through `supabase.auth.getClaims()`, the same call the proxy already makes. With an asymmetric JWT signing key it verifies the JWT locally rather than over the network; on a project still using the legacy shared secret it asks the Auth server instead. `requireUser()` redirects to `/sign-in?next=<current path>` when there is none; `getOptionalUser()` returns null. `/account` additionally calls `getUser()` once, because the identities list AC-16 needs is not in the claims.
- `lib/auth/identity.ts`: the pure functions read off a user or a claim, so each is unit testable without a Supabase client, which is the only way this project tests anything (there is no mocking pattern in the repo). `displayName()` and `avatarLetter()` for the navbar, `hasPasswordIdentity()` for AC-16's rendering condition, and `isRecoverySession()` for AC-24, which takes the `amr` claim and answers whether this session came from a recovery link. Keep the check here rather than inline in the action, for the same reason `hasPasswordIdentity` is here.
- `lib/auth/supabase-error.ts`: `classifyAuthError()`, the one place a Supabase error becomes one of our outcome codes.
- `lib/auth/private-paths.ts`: `PRIVATE_PATH_PREFIXES` and `isPrivatePath()`.
- `lib/auth/next-path.ts`: `isSafeNextPath()`.
- `lib/auth/messages.ts`: one enum of outcome codes mapped to the copy shown, so the neutral wording in AC-2, AC-5 and AC-7 is written once and cannot drift between forms.
- `lib/auth/log.ts`: one enum of event names and outcome classes. It is the only thing auth paths log through, which is how AC-19 stays true by construction rather than by review.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| navbar account slot | display name (`kris1027` in the artboard) | the part of `auth.users.email` before the `@`, derived at render time, never stored |
| navbar account slot | avatar letter (`K` in the artboard) | first character of that display name, uppercased; falls back to `?` if the email is somehow empty |
| navbar account slot | signed in or signed out | `getOptionalUser()` in the slot's server component, which uses `getClaims()`. With an asymmetric signing key this is a local check, so a session revoked elsewhere still reads as signed in until its access token expires, at most `jwt_expiry = 600` seconds (AC-8) |
| `/account` | the signed in address | `auth.users.email` via `supabase.auth.getUser()`, the one place a network call is made, because the identities list is needed anyway |
| `/account` | whether to render the change password form | whether that `getUser()` response carries an identity with provider `email`; a provider only account has none |
| `signInAction` | the path to land on | the `next` query param, passed as a hidden form field, accepted only when `isSafeNextPath` returns true, else `/shows` |
| `signUpAction` | whether the address was already registered | the `user_already_exists` code on the 422 the installed Supabase returns, or, on a version that obfuscates instead, an empty `data.user.identities` array with no error; either way the branch redirects to `/check-email` and pads its timing (AC-2) |
| `signUpAction` | the path to carry through confirmation | the same `next` value, threaded from `/sign-in` to `/sign-up`, into `/check-email`, and out of the callback, validated by `isSafeNextPath` each time it is read |
| `/auth/callback` | where to send the person after a valid token | `/shows` or the validated `next` for a confirmation, `/reset-password` when our own `type=recovery` is present; a `type` we do not issue is refused before any token is spent |
| `resetPasswordAction` | whether this session came from a recovery link | the `amr` claim in the same `getClaims()` response, read through `isRecoverySession()`. It carries `[{ method: "recovery" }]` after a recovery exchange and `[{ method: "password" }]` after an ordinary sign in, both confirmed against the installed version. The SDK types it as `AMREntry[] \| string[] \| undefined`, so the function handles the bare string form and treats absent or empty as not a recovery session. Checked locally, so the gate costs no extra network call |
| `changePasswordAction` | whether the current password is right | a `signInWithPassword` call against the session's own address. This deliberately draws on the same rate limit bucket as sign in, so repeated guessing at the current password is limited too |
| every form | which field an error belongs to | the `fieldErrors` map on `AuthActionState`, keyed by the input's name |
| proxy guard | which paths are private | `PRIVATE_PATH_PREFIXES`, one exported constant in `lib/auth/private-paths.ts`, seeded with `/account`, `/watchlist`, `/upcoming`, `/watched` so features 9, 14 and 15 inherit the guard |
| `signUpAction`, `requestPasswordResetAction` | the absolute link base in the email | `NEXT_PUBLIC_SITE_URL`, passed as `emailRedirectTo` or `redirectTo`, and matched by the Supabase redirect allow list |
| every action | the user id any later write is attributed to | the verified session on the server, never a form field; this is what spec 0001's RLS predicates compare against |
| every action | the rate limited message | the Supabase error's status and code, mapped to our own copy in one place so wording stays consistent |
| `/check-email` | the address to display | the `email` query param, echoed only after passing the same Zod email schema, so the page cannot be used to render arbitrary text |

**Key invariants**:

- The user id used for any read or write is always derived from the verified session on the server. No form field, header, or query parameter can influence it. This is what spec 0001's row level security depends on.
- A session cookie is written only by the proxy or by a Server Action or Route Handler, never by client JavaScript, and it is `HttpOnly`, so client JavaScript cannot read it either (AC-25).
- No response tells the caller whether an address has an account (AC-2, AC-5, AC-7).
- A redirect target is either a path beginning with exactly one forward slash whose next character is neither a slash nor a backslash and which holds no control character, or it is discarded. Validation happens at every point the value is read, never once at the start of a multi step journey.
- The password rules are defined once, in a shared Zod schema, and the Supabase project configuration is set to match, so neither layer can silently be weaker than the other.
- An unconfirmed account can hold no session.
- A password is set without the current password only from a recovery session. Every other path to a new password asks for the current one first (AC-16, AC-24).

**Security model**:

- Public: `/sign-in`, `/sign-up`, `/check-email`, `/forgot-password`, `/reset-password`, `/auth/callback`, and the whole catalog.
- Private, owner only: `/account` and, from later features, `/watchlist`, `/upcoming`, `/watched`. Two independent layers, as `AGENTS.md` section 11 requires. The proxy redirects for experience; each server read and write rechecks the session for real, and Postgres row level security refuses cross user rows regardless of either.
- Account takeover from a stolen session: `/account` asks for the current password before changing it, and `/reset-password` accepts only a recovery session (AC-24). Without that second gate, whoever holds a session cookie can set a new password at `/reset-password` and never needs the old one, which makes the check on `/account` decorative. `/reset-password` stays a public page with no session read of its own: the gate lives in the action, where the write happens.
- Secrets: only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` may reach the browser. The service role key is not used anywhere in this feature, which keeps `security-boundary.test.ts` meaningful.
- No compliance regime applies. The only personal data held is the email address, which Supabase stores.
- Logging: auth paths log the event name and outcome class only. Never a password, token, cookie or the raw Supabase error object, which can carry one (AC-19).

**Configuration required**:

- `NEXT_PUBLIC_SITE_URL`: the absolute origin used to build the links inside confirmation and recovery emails. `http://localhost:3000` locally, the real origin on Vercel. Read through `getPublicEnv()` in [lib/env.ts](../../../lib/env.ts), validated as a URL, and added to `.env.example`.
- `supabase/config.toml`, under `[auth]`: `site_url` set to `NEXT_PUBLIC_SITE_URL`, and `additional_redirect_urls` covering the callback path itself rather than the bare origin, since Supabase matches the whole redirect URL. Use `["<site url>/auth/callback", "<site url>/**"]`. Also `enable_confirmations = true`, `minimum_password_length = 8`, and the two rate limits AC-18 names: `sign_in_sign_ups = 30` per five minute interval per IP address, and `email_sent = 2` per hour. Also `jwt_expiry = 600`, down from the 3600 default, because the access token lifetime is the longest a revoked session keeps working anywhere that checks the token locally: our navbar and private pages through `getClaims()`, and Row Level Security for a direct API call (AC-8). This key governs the local stack only; the hosted project sets it separately (its access token expiry setting in the dashboard, whose exact location should be confirmed then, or `supabase config push`), and mirroring it there is feature 20's work.
- Leaked password protection has no `supabase/config.toml` key at all. It is a hosted project setting (Authentication > Providers > Email in the dashboard), where the Auth service asks HaveIBeenPwned for a hash prefix, and the local CLI stack does not offer it. AC-9's breach branch therefore cannot be exercised locally and is reported unverified rather than passed; switching it on in the cloud project is feature 20's work.
- No new third party account is needed. Google credentials are explicitly out of scope and belong to feature 20.

**Critical test scenarios** (each maps to an acceptance criterion):

- Happy path: sign up, open the message in the local test inbox, confirm, land signed in, open `/account`, change the password, sign out, sign back in with the new password. Verifies **AC-1**, **AC-3**, **AC-4**, **AC-8**, **AC-15**, **AC-16**.
- Failure case: a Server Action called with a session that was revoked after the page rendered writes nothing and returns a visible error carrying a sign in link. Verifies **AC-17**.
- Failure case: the confirmation link is opened a second time after it has been used. Verifies **AC-3**.
- Auth and permission: a request for `/account` with no cookie, and again with a forged cookie, with the proxy matcher disabled so only the server side recheck stands. Both render no private data. Verifies **AC-12**.
- Enumeration: signing up with a taken address, signing in with an unknown address, and requesting a reset for an unknown address each produce output identical to the corresponding real case. Verifies **AC-2**, **AC-5**, **AC-7**.
- Redirect safety: `next` set to `https://evil.example`, to `//evil.example`, to `/%09/evil.example` (a tab), and to `shows` each land on `/shows`. Verifies **AC-11**.
- Cookie flags: after signing in, the response's `Set-Cookie` for every `sb-` cookie shows `HttpOnly`, and `document.cookie` in the page shows none of them. Sign out, a proxy refresh and the callback still work. Verifies **AC-25**.
- Prerender: `pnpm build` output still lists `/shows` and `/movies` as static. Verifies **AC-14**.

## Build plan

Ordered as Tracer Bullet, the project's build approach: a single thin thread through configuration, a Server Action, a session cookie, a guarded private page and a real browser first, then one strand thickened at a time, each strand end to end on its own.

1. Configuration and shared rules. Add `NEXT_PUBLIC_SITE_URL` to `lib/env.ts` and `.env.example`; set the `[auth]` block in `supabase/config.toml` (confirmations on, minimum length eight, site URL, the callback aware redirect allow list, and the two rate limits, noting in place that leaked password protection is not configurable here); confirm whether the local stack and the cloud project use an asymmetric JWT signing key, since that is what makes `getClaims()` a local verification rather than a network call; then write the shared Zod schemas, `AuthActionState`, `isSafeNextPath` with its backslash cases, `lib/auth/messages.ts` and `lib/auth/log.ts`. Satisfies **AC-9**, **AC-11**, **AC-18**, **AC-23**.
2. The thin thread, verified in a running browser. `/sign-in` in the `app/(auth)/` group, built from the artboard without the Google button; `signInAction` and `signOutAction` (the latter passing `scope: "local"` explicitly, never relying on the client default); a private `/account` page showing the address; `PRIVATE_PATH_PREFIXES`; the proxy guard with its `next` parameter; and `requireUser()` in `lib/auth/user.ts`, which every private surface from here on calls. Satisfies **AC-4**, **AC-5**, **AC-10**, **AC-12**, **AC-15**.
3. The navbar account slot. One server component that reads the session, rendered once in the layout inside a Suspense boundary whose fallback is the existing skeleton, and passed as children into both the desktop navbar and `MobileMenuSheet`. It cannot be imported by the sheet directly, because the sheet is a Client Component. Add the layout purity test AC-14 names, and confirm in `pnpm build` that `/shows` and `/movies` are still static. Satisfies **AC-13**, **AC-14**.
4. The sign up strand. `/sign-up`, `/check-email` with its resend control, the `/auth/callback` Route Handler covering both the PKCE `code` shape the stock template sends and the `token_hash` plus `type` shape, the already registered branch with its timing pad, the `next` value threaded through the whole detour, and the neutral wording drawn from `lib/auth/messages.ts`. Verified against the local test inbox. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-6**.
5. The recovery strand. `/forgot-password`, the `recovery` branch of the callback, `/reset-password` gated on a recovery session, and the change password form on `/account`, which verifies the current password through `signInWithPassword` and renders only when a password identity exists. Satisfies **AC-7**, **AC-8**, **AC-16**.
6. Hardening and proof. Expired session handling in every action, `noindex` on the auth routes, the logging rule applied and checked, the Vitest suite over the schemas, the path guard, `isSafeNextPath`, the message mapping and the AC-16 rendering condition, the accessibility tests in the shape `components/` already uses, a browser pass over all flows, and the full checks including the bundle inspection. Satisfies **AC-17**, **AC-19**, **AC-20**, **AC-21**, **AC-22**.
7. Corrections from the verify run. Three things, all found by `/check verify` on 2026-09-22 and all proven in a running browser rather than reasoned about.

   **The recovery gate.** Add `isRecoverySession()` to `lib/auth/identity.ts` and call it in `resetPasswordAction` right after `getClaims()`, refusing with the existing session expired outcome so the copy and the `Request a new reset link` affordance the form already renders are reused; no UI work is needed. Unit test it over five inputs: the recovery object form, the password object form, the bare string form, an empty array and `undefined`, with only the first passing. Today the action checks only that a session exists, and an ordinary signed in user can set a new password there without the current one.

   **Spending the recovery session.** On a successful write, call `signOut({ scope: "global" })` before redirecting, and send the person to `/sign-in` with a plain confirmation instead of to `/account`. Without this the gate covers only the moment: the same recovery session sets a second password, and a third, for as long as it lives, which was reproduced by resetting twice from one link. This changes what AC-8 promises, so the copy on the landing page is part of the task, not an afterthought.

   **`next` through the sign up detour.** The two cross links between `/sign-in` and `/sign-up` are hard coded and drop the value; everything downstream already carries it. Both links sit in the panel footer, deliberately outside the Suspense boundary that streams the form, which is what keeps the card and footer prerendered. Give the footer its own boundary whose fallback is the same link without `next`: identical to look at, so nothing shifts, and the card stays static. Do not move the footer inside the form's boundary, and update the doc comment in each `page.tsx`, which currently says the footer link needs no request scoped value.

   Satisfies **AC-24**, rewrites **AC-8**, and closes the sign up half of **AC-10**.
8. The revocation window, from verify run 2. Set `jwt_expiry = 600` in `supabase/config.toml` and replace its stock comment with the reason: it bounds how long a revoked session keeps working wherever the token is checked locally (AC-8). Restart the local stack so the Auth container picks it up, The stack must be stopped with `supabase stop --no-backup` and then started again, because a plain `supabase start` reuses the running Auth container and keeps the old `[auth]` values, which the build run already paid for once. Confirm it took two ways: `docker exec supabase_auth_BeStats env | grep JWT_EXP` shows `600`, and decoding a freshly issued access token with `node -e 'console.log(JSON.parse(Buffer.from(process.argv[1].split(".")[1], "base64url")))' <access token>` shows `exp` minus `iat` equal to 600. No application code changes: `getOptionalUser()` and `requireUser()` stay on `getClaims()`, and the proxy's existing refresh is what turns an expired, revoked session into a signed out one. Rewrite the second browser step in `verify.md` to the two part promise (writes refused at once, signed out after expiry). Satisfies **AC-8**.
9. The mapping tests, from verify run 3. Five verify steps cannot run on the local stack, and they move to feature 20. What stays here is proof that our side is ready for the errors those steps would produce. First fix the breach branch of `classifyAuthError`. It matches the message against `pwned|breach|leaked`, but the installed Auth server's breach refusal reads "Password is known to be weak and easy to guess, please choose a different one.", which contains none of them (read from the running container's binary on 2026-09-22), so a breached password today shows the eight character copy. auth-js carries the real signal: it throws an `AuthWeakPasswordError` whose `reasons` list holds `pwned` for a breach. Classify on `isAuthWeakPasswordError(error) && error.reasons.includes("pwned")` and drop the message match. Then extend `lib/auth/supabase-error.test.ts` with these cases: an `AuthApiError` with status 429 and an `over_email_send_rate_limit` error both classify as `rateLimited`; an `AuthWeakPasswordError` with the server's real wording and `reasons: ["pwned"]` classifies as `passwordBreached`; one with `reasons: ["length"]` classifies as `passwordTooShort`. The copy for each outcome is already covered by the rendering tests in `components/auth/`, so no UI test is added. Satisfies the local half of **AC-9** and **AC-18**.
10. Corrections from the fresh model review, 2026-09-22. Two things.

    **Control characters in `next`.** Already fixed by `/debug` on the same day: `isSafeNextPath` in [lib/auth/next-path.ts](../../../lib/auth/next-path.ts) refuses any control character before its slash checks, and `next-path.test.ts` covers tab, line feed, carriage return, a tab hiding a backslash and a null character, plus a check that every accepted value resolves to the site's own origin. Nothing is left to build here; confirm it in the verify run.

    **Session cookie flags.** Add one exported function in `lib/supabase/` that returns `{ httpOnly: true, secure: <NEXT_PUBLIC_SITE_URL is https> }`, reading the site URL through `getPublicEnv()`, and call it once per client as `cookieOptions` to `createServerClient` in both `lib/supabase/server.ts` and `proxy.ts`. It must be a function, not a module level constant: a constant calls `getPublicEnv()` at import time and breaks a build with no environment configured. It returns those two keys only, never `name` (the library turns it into the storage key), `maxAge` (the library always overrides it) or `domain` (it triggers extra host only clears). Derive `Secure` from the site URL, not from `NODE_ENV`, so `pnpm start` on `http://localhost:3000` still gets a cookie in every browser, and the deployed `https` origin always gets `Secure`. Note that `NEXT_PUBLIC_SITE_URL` is inlined when the app is built, so `Secure` follows the URL the build was made with, not the origin it is served from: a build made with an `https` site URL and served on `http://localhost` breaks sign in on Safari, which refuses a `Secure` cookie over plain `http`. Leave `sameSite` and `path` at the library's `lax` and `/`, which are already right. Leave `lib/supabase/client.ts` in place, since `AGENTS.md` documents it, and add one sentence to its JSDoc saying it cannot see the session while the cookie is `HttpOnly`, pointing at this spec. Unit test the function over an `http` and an `https` site URL. Add a boundary test, in the shape of `layout-purity.test.ts`, that walks `app/`, `lib/`, `components/` and `proxy.ts` rather than naming two files, so a third call site cannot slip past it, and fails when: any `createServerClient(` call does not pass `cookieOptions` from the shared function; any `setAll` does not forward `options` into `cookieStore.set` or `response.cookies.set` (the `request.cookies.set` at the top of the proxy's `setAll` is exempt, since it only feeds the rest of the same request and never reaches the browser); or any file other than its own test imports `lib/supabase/client.ts`. Verify in the running app, starting from a fresh sign in with the cookie jar cleared, that sign in, sign out, the proxy refresh after `jwt_expiry`, the confirmation callback and the recovery callback all still work, and that `document.cookie` is empty of `sb-` cookies. A fresh jar matters: the library skips rewriting a cookie whose value has not changed, so a session from before the change stays readable by script until its next refresh. Satisfies **AC-25** and **AC-11**.

## Consequences

**Positive**:

- The browser never handles a Supabase Auth token in script. The token rides in an `HttpOnly` cookie (AC-25), so a cross site scripting bug cannot read the session and copy it elsewhere. It can still act as the user from inside the open page for as long as the page is open, which no cookie flag prevents; that is what the Content Security Policy and output escaping are for, not this spec.
- Every mutation in the app now follows one shape, the Server Action, which features 8, 9, 12 and 14 inherit rather than invent.
- The Suspense boundary keeps the whole public catalog prerendered, so the instant navigation feature 5 established survives the arrival of a signed in state.
- `PRIVATE_PATH_PREFIXES` means features 9, 14 and 15 are guarded the day their routes exist, rather than each remembering to add itself.
- No new table, no migration, and nothing derived is stored, so there is nothing that can drift out of step with the auth account.

**Negative and tradeoffs**:

- The sign in page visibly diverges from its artboard until feature 20, because the Google button and its divider are omitted rather than faked. That is a deliberate, recorded exception to `AGENTS.md` section 3.
- Feature 6 cannot by itself satisfy the original promise of both sign in methods. The scope row's done when line is being narrowed to email and password, and Google moves to feature 20.
- Server Actions mean a network round trip for every validation failure that the Zod schema does not catch first, such as a breached password, which Supabase alone can judge.
- A revoked session keeps looking signed in for up to ten minutes. After a reset, or any global sign out, another browser still shows the account name and Sign out until its access token expires, and anyone holding a copied access token can read and write that account's rows through the Supabase API for the same window, because Row Level Security checks only the token's signature and expiry. Auth itself refuses the old session at once, so the password cannot be changed from there. `getUser()` on every render was weighed and refused: it would fix what the screen shows at the price of a round trip to Auth on every page view, catalog included, and would still leave the direct API window open. Ten minutes is proportionate for a watch tracking app. If private data here ever becomes sensitive, the fix is a session check inside the database (comparing the token's `session_id` against `auth.sessions`), not in the pages.
- The shorter token lifetime means each active tab refreshes its session every ten minutes instead of every hour. The proxy already does this on the next request, so it costs Auth calls, not code.
- Recovering a password now ends every session for that account and asks the person to sign in with the password they just chose, rather than dropping them straight into `/account`. One extra step, and any other device they were signed in on is signed out. That is deliberate, and it is the behaviour someone recovering an account wants, but it is a real cost for the common case where nothing was wrong except a forgotten password. AC-15's local only rule is untouched: it governs the Sign out button, and a recovery is not that.
- `lib/supabase/client.ts`, the browser client, sees no session while the cookie is `HttpOnly`. Nothing uses it today, and the Decision already rejects it for auth. A later feature that wants it with a session (Realtime, for example) has to reopen AC-25 in its own spec and say what it trades, rather than switching the flag off in passing.
- Neutral messaging is measurably worse for the honest person who mistyped their address. They get no hint. This is the price of not making the forms an address lookup tool.
- The navbar's Suspense boundary adds a small, visible skeleton on first load for signed in users, where a fully dynamic layout would paint the avatar immediately. With scripting switched off the skeleton is all there is: the streamed chunk never gets placed, so the navbar shows neither Sign in nor the account. Accepted deliberately (AC-13). A `<noscript>` Sign in link was weighed and refused, because it would show Sign in to a signed in visitor with nothing to correct it, and `/account` is reachable and fully usable with no JavaScript.
- The mobile navbar has no menu button, so `mobile-menu-open.svg` has nothing to open. `MobileMenuSheet` exists from feature 5 but is wired only into `/showcase`. The sheet the artboard draws holds Watchlist, Upcoming and Watched, which arrive with feature 9, so the account block sits inline in the bar until then. A second recorded exception to `AGENTS.md` section 3, in the same spirit as the Google button, and feature 9 carries the step that proves it.
- The second layer of the guard rests on every future private surface remembering to call `requireUser()`. Nothing in the type system or the linter enforces it, unlike the proxy matcher and unlike row level security. A private page added in feature 9 or 15 that forgets the call would fail silently. This is a real weakness of the design and is enrolled as a follow up rather than waved away.
- AC-2's timing defence is a pad, not a constant time implementation. It narrows the signal rather than removing it, which is the proportionate answer for a watch tracking app and would not be for something holding money or health data.
- Email delivery is proven only against the local test inbox. Real deliverability stays unverified until feature 20, and the spec says so rather than implying otherwise.

**Neutral**:

- A nested `AGENTS.md` for the auth area will be worth writing once the code lands, in the shape `lib/tmdb/` and `components/` already use.
- Account deletion is not built. When it arrives it needs an elevated server side call, which is the first thing in the app that would use one, so it deserves its own decision.
- The rate limits are Supabase's, which means changing them is a project configuration change, not a code change.

## Follow-up

- [x] Update `docs/scope/scope.md` feature 6 so its done when line covers email and password only, and move Google sign in into feature 20's line. Agreed during this design.
- [ ] Feature 20 should also consider `secure_password_change = true`, which makes Supabase itself refuse a password write from a session that neither came from a recovery link nor signed in recently. It is defence behind AC-24's own check rather than a replacement for it, and it needs mirroring in the hosted project's settings and re verifying against `changePasswordAction`, which re checks the current password by signing in again.
- [ ] Feature 9 inherits the mobile menu sheet step moved out of this feature's `verify.md`, and with it the menu button the mobile artboards draw. Wiring `MobileMenuSheet` into the real navbar belongs there, where Watchlist, Upcoming and Watched give it contents.
- [ ] Feature 20 must set the hosted project's access token expiry to 600 seconds to match `supabase/config.toml`, and re run the second browser step of AC-8 there. The hosted default is 3600, which silently restores the hour long window.
- [ ] Feature 20's verify should confirm on the deployed `https` origin that every `sb-` cookie carries both `HttpOnly` and `Secure` (AC-25). Locally the site URL is `http`, so `Secure` is only proven by the unit test until then. A session signed in before the deploy keeps its old, script readable cookie until its first refresh, at most `jwt_expiry = 600` seconds later, so check with a fresh sign in.
- [ ] Feature 20 must switch leaked password protection on in the hosted project (Authentication > Providers > Email), which is the only place it exists, and verify AC-9's breach branch there. It cannot be proven on the local stack.
- [ ] Feature 20's verify inherits the five steps moved out of this feature's `verify.md` on 2026-09-22: the breach refusal (AC-9), the change password form absent for a Google only account (AC-16), wrong current passwords hitting the sign in limit (AC-16, AC-18), and exhausting `sign_in_sign_ups` and `email_sent` (AC-18). Each needs the hosted project, and the last needs real SMTP.
- [ ] Feature 20 must create the Google OAuth client, add the provider to `supabase/config.toml` and the cloud project, restore the Google button and its divider to `/sign-in` and `/sign-up` in the slot this spec reserves, set `NEXT_PUBLIC_SITE_URL` and the redirect allow list for the deployed origin, and verify real email delivery.
- [ ] Confirm that Supabase still links an email identity and a Google identity by verified email under the installed version before feature 20 relies on it, rather than assuming the current default holds.
- [ ] Consider a `lib/auth/AGENTS.md` once this ships, covering the `AuthActionState` shape, the neutral message rule and the two layer guard, so later features do not re derive them.
- [ ] Find a way to enforce that every private Server Component and Server Action calls `requireUser()`, so a forgotten call is a failing check rather than a silent leak. A boundary test in the shape of `security-boundary.test.ts` walking the private route directories is the cheapest candidate. Worth settling before feature 9 adds the next private page.
- [ ] Confirm the JWT signing key type on both the local stack and the cloud project. If either still uses the legacy shared secret, `getClaims()` makes a network call and the reasoning behind choosing it over `getUser()` weakens, though the security properties are unchanged.
- [ ] Account deletion, and what it should do to the cascading tracking data, is undesigned. Worth its own spec before anyone asks for it.
