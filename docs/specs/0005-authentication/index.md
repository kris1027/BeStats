# 0005. Authentication with Supabase email and password

**Date**: 2026-09-22
**Status**: Proposed

Scope feature: [6. Authentication](../../scope/scope.md) · GA tier

## Summary

This decides how people get an account in BeStats and how the app knows who is asking. Supabase Auth owns identity, and every form posts to a Server Action (a function that runs on the server, called straight from a form) so no session token is ever handled in the browser. Sign up requires a confirmed email address and a password of at least eight characters that has not appeared in a known breach. Private pages are protected twice over: the proxy redirects a signed out visitor for a clean experience, and every server read and write rechecks the session itself, because the redirect is convenience and the recheck is the real boundary. Google sign in is deliberately not built here; it moves to feature 20 with the rest of the provider setup, so this feature ships email and password only.

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
- **AC-2**: Signing up with an address that already has a confirmed account produces an outcome indistinguishable from AC-1. Supabase returns a user with an empty `identities` array and sends no message in that case, so the action detects it, redirects to `/check-email` exactly as for a new address, and pads the branch so its response time falls inside the range the real path produces. Measured over ten runs of each, the two ranges overlap.
- **AC-3**: Opening the confirmation link from the email marks the address confirmed, creates a session, and lands the person signed in. A link that is expired or already used lands on `/sign-in` with a plain message and no session.
- **AC-4**: Signing in with a confirmed address and the correct password creates a session and redirects to the validated `next` path, or to `/shows` when there is none.
- **AC-5**: A wrong password and an address with no account produce one identical message that names neither the address nor the field at fault.
- **AC-6**: Signing in with a correct password on an unconfirmed address is refused, says the address still needs confirming, and offers a resend path. No session is created.
- **AC-7**: Requesting a password reset shows the same confirmation whether or not the address has an account. When it does, the emailed link lands on `/reset-password` with a recovery session and nowhere else.
- **AC-8**: Setting a new password on `/reset-password` succeeds, signs the person in, and the previous password no longer works.
- **AC-9**: A password shorter than eight characters, or one Supabase's leaked password protection rejects, is refused with a message naming the specific rule, and no account is created and no password changed.
- **AC-10**: A signed out request for any private path is redirected to `/sign-in?next=<path>`, and signing in from there lands on that exact path.
- **AC-11**: A `next` value is honoured only when it begins with exactly one forward slash and its second character is neither a slash nor a backslash. An absolute URL, a protocol relative value (`//evil.example`), a backslash form the browser normalises to one (`/\evil.example`, `\/\/evil.example`), and a bare relative value are all discarded, and the person lands on `/shows`.
- **AC-12**: Every private Server Component and every Server Action resolves the user through the single `requireUser()` helper, which verifies the session itself rather than trusting the proxy. With the proxy bypassed entirely, a request carrying no cookie or a forged cookie still renders no private data and writes nothing.
- **AC-13**: The navbar renders Sign in when signed out, and the avatar letter, the display name and Sign out when signed in. Both are produced on the server, so no wrong state is ever painted first and then corrected.
- **AC-14**: `/shows` and `/movies` still report as prerendered static shells in `pnpm build`. The account slot is the only code in the shared layout tree that reads a request scoped value, proven by a test that fails if `cookies()`, `headers()`, `draftMode()` or a Supabase server client appears in `app/layout.tsx` or in any layout level component outside the account slot module.
- **AC-15**: Sign out ends the session in the current browser only and returns to `/shows`. A session in a second browser for the same account remains signed in.
- **AC-16**: The change password form on `/account` requires the current password, enforces the same rules as AC-9 on the new one, and is rendered only for an account carrying an identity with provider `email`. The negative branch cannot be exercised in this feature, because no provider only account can exist until feature 20 adds Google, so it is covered by a unit test over the rendering condition rather than a browser step.
- **AC-17**: A Server Action invoked with an expired or revoked session writes nothing and returns a visible error offering a sign in link that carries the current path. No success state is ever shown for a write that did not happen.
- **AC-18**: The configured limits are the ones this spec names: thirty sign in attempts per hour per address and two emails per hour, written into `supabase/config.toml` and reproduced in the verify steps. Exceeding either shows a message saying the limit was reached and inviting a retry later, not a generic failure. A build that changes those numbers without changing this criterion fails it.
- **AC-19**: No log line emitted by any auth path contains a password, an access or refresh token, a cookie value, or an email confirmation or recovery token.
- **AC-20**: Every auth screen and the account page are excluded from search indexing.
- **AC-21**: Every auth screen is fully operable by keyboard with a visible focus ring, meets the touch target sizes in `components/AGENTS.md`, and reuses the sign in artboard's card, type scale and spacing at both mobile and desktop widths.
- **AC-22**: The Supabase publishable key is the only Supabase credential present in the browser bundle. No service role key and no access or refresh token appears in served HTML or client JavaScript.
- **AC-23**: Confirmation and recovery links are built from `NEXT_PUBLIC_SITE_URL`, and the Supabase redirect allow list matches it exactly. A redirect target outside that list is refused by Supabase.

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
| `resetPasswordAction` | Server Action | `password:string` (req) | redirect to `/account` | recovery session | no recovery session, weak or breached password |
| `changePasswordAction` | Server Action | `currentPassword:string` (req), `password:string` (req) | `status: "success"` | signed in | no session (AC-17), wrong current password, weak or breached password, rate limited |
| `signOutAction` | Server Action | none | redirect to `/shows` | signed in | none that change the outcome, sign out is idempotent |
| `/auth/callback` | GET | `token_hash:string`, `type:"signup" \| "recovery"`, `next:string` (opt) | 303 redirect with a session cookie set: validated `next` or `/shows` for `signup`, `/reset-password` for `recovery` | none | expired or used token, unknown or absent `type`, all redirect to `/sign-in` with a plain message |

`type` accepts `signup` and `recovery` only. `email_change` is not accepted, because nothing in this feature changes an address; adding it is a later decision, not a build detail.

Routes: `/sign-in`, `/sign-up`, `/check-email`, `/forgot-password`, `/reset-password` are public pages in the `app/(auth)/` route group. `/account` is private at `app/account/page.tsx`. `/auth/callback` is a Route Handler at `app/auth/callback/route.ts`, not a page.

Supporting modules, named here so they are not invented:

- `lib/auth/user.ts`: `requireUser()` and `getOptionalUser()`. Both resolve the session through `supabase.auth.getClaims()`, the same call the proxy already makes, which verifies the JWT locally rather than over the network. `requireUser()` redirects to `/sign-in?next=<current path>` when there is none; `getOptionalUser()` returns null. `/account` additionally calls `getUser()` once, because the identities list AC-16 needs is not in the claims.
- `lib/auth/private-paths.ts`: `PRIVATE_PATH_PREFIXES` and `isPrivatePath()`.
- `lib/auth/next-path.ts`: `isSafeNextPath()`.
- `lib/auth/messages.ts`: one enum of outcome codes mapped to the copy shown, so the neutral wording in AC-2, AC-5 and AC-7 is written once and cannot drift between forms.
- `lib/auth/log.ts`: one enum of event names and outcome classes. It is the only thing auth paths log through, which is how AC-19 stays true by construction rather than by review.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| navbar account slot | display name (`kris1027` in the artboard) | the part of `auth.users.email` before the `@`, derived at render time, never stored |
| navbar account slot | avatar letter (`K` in the artboard) | first character of that display name, uppercased; falls back to `?` if the email is somehow empty |
| navbar account slot | signed in or signed out | `getOptionalUser()` in the slot's server component, which uses `getClaims()` |
| `/account` | the signed in address | `auth.users.email` via `supabase.auth.getUser()`, the one place a network call is made, because the identities list is needed anyway |
| `/account` | whether to render the change password form | whether that `getUser()` response carries an identity with provider `email`; a provider only account has none |
| `signInAction` | the path to land on | the `next` query param, passed as a hidden form field, accepted only when `isSafeNextPath` returns true, else `/shows` |
| `signUpAction` | whether the address was already registered | `data.user.identities` being an empty array, which is how Supabase signals it without sending a message; the branch still redirects to `/check-email` and pads its timing (AC-2) |
| `signUpAction` | the path to carry through confirmation | the same `next` value, threaded from `/sign-in` to `/sign-up`, into `/check-email`, and out of the callback, validated by `isSafeNextPath` each time it is read |
| `/auth/callback` | where to send the person after a valid token | `/shows` or the validated `next` for `type=signup`, `/reset-password` for `type=recovery`; any other `type` is refused |
| `changePasswordAction` | whether the current password is right | a `signInWithPassword` call against the session's own address. This deliberately draws on the same rate limit bucket as sign in, so repeated guessing at the current password is limited too |
| every form | which field an error belongs to | the `fieldErrors` map on `AuthActionState`, keyed by the input's name |
| proxy guard | which paths are private | `PRIVATE_PATH_PREFIXES`, one exported constant in `lib/auth/private-paths.ts`, seeded with `/account`, `/watchlist`, `/upcoming`, `/watched` so features 9, 14 and 15 inherit the guard |
| `signUpAction`, `requestPasswordResetAction` | the absolute link base in the email | `NEXT_PUBLIC_SITE_URL`, passed as `emailRedirectTo` or `redirectTo`, and matched by the Supabase redirect allow list |
| every action | the user id any later write is attributed to | the verified session on the server, never a form field; this is what spec 0001's RLS predicates compare against |
| every action | the rate limited message | the Supabase error's status and code, mapped to our own copy in one place so wording stays consistent |
| `/check-email` | the address to display | the `email` query param, echoed only after passing the same Zod email schema, so the page cannot be used to render arbitrary text |

**Key invariants**:

- The user id used for any read or write is always derived from the verified session on the server. No form field, header, or query parameter can influence it. This is what spec 0001's row level security depends on.
- A session cookie is written only by the proxy or by a Server Action or Route Handler, never by client JavaScript.
- No response tells the caller whether an address has an account (AC-2, AC-5, AC-7).
- A redirect target is either a path beginning with exactly one forward slash whose next character is neither a slash nor a backslash, or it is discarded. Validation happens at every point the value is read, never once at the start of a multi step journey.
- The password rules are defined once, in a shared Zod schema, and the Supabase project configuration is set to match, so neither layer can silently be weaker than the other.
- An unconfirmed account can hold no session.

**Security model**:

- Public: `/sign-in`, `/sign-up`, `/check-email`, `/forgot-password`, `/reset-password`, `/auth/callback`, and the whole catalog.
- Private, owner only: `/account` and, from later features, `/watchlist`, `/upcoming`, `/watched`. Two independent layers, as `AGENTS.md` section 11 requires. The proxy redirects for experience; each server read and write rechecks the session for real, and Postgres row level security refuses cross user rows regardless of either.
- Secrets: only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL` may reach the browser. The service role key is not used anywhere in this feature, which keeps `security-boundary.test.ts` meaningful.
- No compliance regime applies. The only personal data held is the email address, which Supabase stores.
- Logging: auth paths log the event name and outcome class only. Never a password, token, cookie or the raw Supabase error object, which can carry one (AC-19).

**Configuration required**:

- `NEXT_PUBLIC_SITE_URL`: the absolute origin used to build the links inside confirmation and recovery emails. `http://localhost:3000` locally, the real origin on Vercel. Read through `getPublicEnv()` in [lib/env.ts](../../../lib/env.ts), validated as a URL, and added to `.env.example`.
- `supabase/config.toml`, under `[auth]`: `site_url` set to `NEXT_PUBLIC_SITE_URL`, and `additional_redirect_urls` covering the callback path itself rather than the bare origin, since Supabase matches the whole redirect URL. Use `["<site url>/auth/callback", "<site url>/**"]`. Also `enable_confirmations = true`, `minimum_password_length = 8`, leaked password protection enabled, and the two rate limits AC-18 names: thirty sign in attempts per hour per address and two emails per hour.
- Leaked password protection asks HaveIBeenPwned for a hash prefix from the Supabase Auth container, so it needs outbound network access even on the local stack. AC-9's breach case cannot be checked with the machine offline, and the verify steps say so rather than letting a silent pass look like a real one.
- No new third party account is needed. Google credentials are explicitly out of scope and belong to feature 20.

**Critical test scenarios** (each maps to an acceptance criterion):

- Happy path: sign up, open the message in the local test inbox, confirm, land signed in, open `/account`, change the password, sign out, sign back in with the new password. Verifies **AC-1**, **AC-3**, **AC-4**, **AC-8**, **AC-15**, **AC-16**.
- Failure case: a Server Action called with a session that was revoked after the page rendered writes nothing and returns a visible error carrying a sign in link. Verifies **AC-17**.
- Failure case: the confirmation link is opened a second time after it has been used. Verifies **AC-3**.
- Auth and permission: a request for `/account` with no cookie, and again with a forged cookie, with the proxy matcher disabled so only the server side recheck stands. Both render no private data. Verifies **AC-12**.
- Enumeration: signing up with a taken address, signing in with an unknown address, and requesting a reset for an unknown address each produce output identical to the corresponding real case. Verifies **AC-2**, **AC-5**, **AC-7**.
- Redirect safety: `next` set to `https://evil.example`, to `//evil.example`, and to `shows` each land on `/shows`. Verifies **AC-11**.
- Prerender: `pnpm build` output still lists `/shows` and `/movies` as static. Verifies **AC-14**.

## Build plan

Ordered as Tracer Bullet, the project's build approach: a single thin thread through configuration, a Server Action, a session cookie, a guarded private page and a real browser first, then one strand thickened at a time, each strand end to end on its own.

1. Configuration and shared rules. Add `NEXT_PUBLIC_SITE_URL` to `lib/env.ts` and `.env.example`; set the `[auth]` block in `supabase/config.toml` (confirmations on, minimum length eight, leaked password protection on, site URL, the callback aware redirect allow list, and the two rate limits); confirm whether the local stack and the cloud project use an asymmetric JWT signing key, since that is what makes `getClaims()` a local verification rather than a network call; then write the shared Zod schemas, `AuthActionState`, `isSafeNextPath` with its backslash cases, `lib/auth/messages.ts` and `lib/auth/log.ts`. Satisfies **AC-9**, **AC-11**, **AC-18**, **AC-23**.
2. The thin thread, verified in a running browser. `/sign-in` in the `app/(auth)/` group, built from the artboard without the Google button; `signInAction` and `signOutAction` (the latter passing `scope: "local"` explicitly, never relying on the client default); a private `/account` page showing the address; `PRIVATE_PATH_PREFIXES`; the proxy guard with its `next` parameter; and `requireUser()` in `lib/auth/user.ts`, which every private surface from here on calls. Satisfies **AC-4**, **AC-5**, **AC-10**, **AC-12**, **AC-15**.
3. The navbar account slot. One server component that reads the session, rendered once in the layout inside a Suspense boundary whose fallback is the existing skeleton, and passed as children into both the desktop navbar and `MobileMenuSheet`. It cannot be imported by the sheet directly, because the sheet is a Client Component. Add the layout purity test AC-14 names, and confirm in `pnpm build` that `/shows` and `/movies` are still static. Satisfies **AC-13**, **AC-14**.
4. The sign up strand. `/sign-up`, `/check-email` with its resend control, the `/auth/callback` Route Handler for the `signup` token type, the `identities` empty array branch with its timing pad, the `next` value threaded through the whole detour, and the neutral wording drawn from `lib/auth/messages.ts`. Verified against the local test inbox. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-6**.
5. The recovery strand. `/forgot-password`, the `recovery` branch of the callback, `/reset-password` gated on a recovery session, and the change password form on `/account`, which verifies the current password through `signInWithPassword` and renders only when a password identity exists. Satisfies **AC-7**, **AC-8**, **AC-16**.
6. Hardening and proof. Expired session handling in every action, `noindex` on the auth routes, the logging rule applied and checked, the Vitest suite over the schemas, the path guard, `isSafeNextPath`, the message mapping and the AC-16 rendering condition, the accessibility tests in the shape `components/` already uses, a browser pass over all flows, and the full checks including the bundle inspection. Satisfies **AC-17**, **AC-19**, **AC-20**, **AC-21**, **AC-22**.

## Consequences

**Positive**:

- The browser never holds a Supabase Auth token, so a cross site scripting bug cannot steal a session from JavaScript.
- Every mutation in the app now follows one shape, the Server Action, which features 8, 9, 12 and 14 inherit rather than invent.
- The Suspense boundary keeps the whole public catalog prerendered, so the instant navigation feature 5 established survives the arrival of a signed in state.
- `PRIVATE_PATH_PREFIXES` means features 9, 14 and 15 are guarded the day their routes exist, rather than each remembering to add itself.
- No new table, no migration, and nothing derived is stored, so there is nothing that can drift out of step with the auth account.

**Negative and tradeoffs**:

- The sign in page visibly diverges from its artboard until feature 20, because the Google button and its divider are omitted rather than faked. That is a deliberate, recorded exception to `AGENTS.md` section 3.
- Feature 6 cannot by itself satisfy the original promise of both sign in methods. The scope row's done when line is being narrowed to email and password, and Google moves to feature 20.
- Server Actions mean a network round trip for every validation failure that the Zod schema does not catch first, such as a breached password, which Supabase alone can judge.
- Neutral messaging is measurably worse for the honest person who mistyped their address. They get no hint. This is the price of not making the forms an address lookup tool.
- The navbar's Suspense boundary adds a small, visible skeleton on first load for signed in users, where a fully dynamic layout would paint the avatar immediately.
- The second layer of the guard rests on every future private surface remembering to call `requireUser()`. Nothing in the type system or the linter enforces it, unlike the proxy matcher and unlike row level security. A private page added in feature 9 or 15 that forgets the call would fail silently. This is a real weakness of the design and is enrolled as a follow up rather than waved away.
- AC-2's timing defence is a pad, not a constant time implementation. It narrows the signal rather than removing it, which is the proportionate answer for a watch tracking app and would not be for something holding money or health data.
- Email delivery is proven only against the local test inbox. Real deliverability stays unverified until feature 20, and the spec says so rather than implying otherwise.

**Neutral**:

- A nested `AGENTS.md` for the auth area will be worth writing once the code lands, in the shape `lib/tmdb/` and `components/` already use.
- Account deletion is not built. When it arrives it needs an elevated server side call, which is the first thing in the app that would use one, so it deserves its own decision.
- The rate limits are Supabase's, which means changing them is a project configuration change, not a code change.

## Follow-up

- [ ] Update `docs/scope/scope.md` feature 6 so its done when line covers email and password only, and move Google sign in into feature 20's line. Agreed during this design.
- [ ] Feature 20 must create the Google OAuth client, add the provider to `supabase/config.toml` and the cloud project, restore the Google button and its divider to `/sign-in` and `/sign-up` in the slot this spec reserves, set `NEXT_PUBLIC_SITE_URL` and the redirect allow list for the deployed origin, and verify real email delivery.
- [ ] Confirm that Supabase still links an email identity and a Google identity by verified email under the installed version before feature 20 relies on it, rather than assuming the current default holds.
- [ ] Consider a `lib/auth/AGENTS.md` once this ships, covering the `AuthActionState` shape, the neutral message rule and the two layer guard, so later features do not re derive them.
- [ ] Find a way to enforce that every private Server Component and Server Action calls `requireUser()`, so a forgotten call is a failing check rather than a silent leak. A boundary test in the shape of `security-boundary.test.ts` walking the private route directories is the cheapest candidate. Worth settling before feature 9 adds the next private page.
- [ ] Confirm the JWT signing key type on both the local stack and the cloud project. If either still uses the legacy shared secret, `getClaims()` makes a network call and the reasoning behind choosing it over `getUser()` weakens, though the security properties are unchanged.
- [ ] Account deletion, and what it should do to the cascading tracking data, is undesigned. Worth its own spec before anyone asks for it.
