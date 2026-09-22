# Review, feat/authentication, 2026-09-22

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 49 files, branch vs `main` (merge base `e5f9b254`) plus uncommitted working tree changes
**Verdict**: Blocked

## Summary

This change builds spec 0005's full email/password authentication surface: Server Actions for
sign up, sign in, sign out, password reset and change, the `/auth/callback` route handler, the
private `/account` page, the navbar account slot, and the `requireUser()`/proxy double guard. The
work is unusually well documented (JSDoc explaining *why*, not just *what*) and the neutral-message,
recovery-session-gate and layout-purity guarantees are genuinely well tested. `pnpm typecheck`,
`pnpm lint:ci`, `pnpm test` (279/279) and `pnpm build` all pass as claimed in `verify.md`. However,
the redirect-safety check the whole feature leans on for its open-redirect defense (AC-11) has a
concrete bypass using tab/CR/LF characters, confirmed reproducible end to end against the actual
`/auth/callback` redirect construction — that alone blocks merge. A second, cheaper-to-fix gap
(the session cookie is not `httpOnly`, contradicting the spec's own stated XSS defense) and two
areas of thin automated coverage on the most security-relevant code round out the findings.

## Blockers

### 🔴 `isSafeNextPath` lets a tab/CR/LF-prefixed `next` value redirect off-site, `lib/auth/next-path.ts:19-32`

**Problem**: `isSafeNextPath` only rejects a `next` value whose second character is `/` or `\`.
It does not reject ASCII tab (`\t`), carriage return (`\r`) or line feed (`\n`). The WHATWG URL
parser every browser (and Node's own `URL`) implements strips tab/CR/LF from a URL string before
resolving it, so `/\t/evil.example` resolves to `//evil.example`, i.e. a protocol-relative URL that
leaves the site — exactly the class of bug the existing backslash check was written to close, just
with a different stripped character. Confirmed with Node's `URL`:

```
new URL("/\t/evil.example", "http://localhost:3000").href
// -> "http://evil.example/"
```

And confirmed against the actual code path in `app/auth/callback/route.ts:87`
(`NextResponse.redirect(new URL(destination, origin), 303)`): a query string of
`?next=%2F%09%2Fevil.example` decodes to `"/\t/evil.example"`, passes `isSafeNextPath`, and
`new URL(destination, origin)` resolves to `http://evil.example/` — reproduced with the project's
own installed `@supabase/ssr`-adjacent Node runtime, no browser needed. The same bypass reaches
`signInAction`'s `redirect(safeNextPath(next))` at `app/(auth)/actions.ts:239`, `requireUser()`'s
header-derived path, and the value `AuthCrossLink` echoes into an `<a href>`.

**Why it matters**: This defeats AC-11 and the "Key invariants" bullet in spec 0005 promising a
redirect target is either a safe path or discarded. A crafted, legitimate-looking link such as
`https://bestats.example/sign-in?next=%2F%09%2Fevil.example` survives validation, and after a real
sign-in (or after a genuine confirmation email the victim receives and opens, via the sign-up
detour) the freshly authenticated victim is redirected straight to an attacker-controlled origin.
This is the canonical login-flow open-redirect-into-phishing pattern the AC exists to prevent, and
it is trivially craftable by anyone, no account required.

**Suggested fix**: Reject any control character (not just `/` and `\`) anywhere in the value before
accepting it — e.g. test the whole string against a small whitelist of allowed characters, or
explicitly reject any codepoint below `0x20` plus DEL, rather than inspecting only `value[1]`. Add
regression cases for `"/\t/evil.example"`, `"/\r/evil.example"`, `"/\n/evil.example"` and
`"/\r\n/evil.example"` to `lib/auth/next-path.test.ts`, which currently covers only the backslash
forms.

## Major

### 🟠 Session cookie is not `httpOnly`, contradicting the spec's own stated XSS defense, `lib/supabase/server.ts:27`, `proxy.ts:53`

**Problem**: Neither `createServerClient` call passes `cookieOptions: { httpOnly: true }`, so both
fall back to `@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS`, which sets `httpOnly: false` (confirmed by
reading the installed package: `node_modules/.pnpm/@supabase+ssr@0.12.7.../dist/module/utils/constants.js`).
The access and refresh tokens are therefore readable by any JavaScript running on the page via
`document.cookie`.

**Why it matters**: Spec 0005's Consequences section states as a positive: "The browser never holds
a Supabase Auth token, so a cross site scripting bug cannot steal a session from JavaScript." That
claim is false as shipped — the token is sitting in a script-readable cookie. This feature's own
architecture never uses the browser Supabase client for auth (`lib/supabase/client.ts` is unused by
anything in this diff), so there is no functional reason `httpOnly: true` would break anything here;
it was already flagged as "worth a look" in two separate `/check verify` runs (verify run and verify
run 3, "Worth a look in /check review") and never acted on or explicitly deferred.

**Suggested fix**: Pass `cookieOptions: { httpOnly: true }` to both `createServerClient` calls,
verify sign-in/out and the proxy refresh still work (the server clients never read `document.cookie`,
so this should be transparent), and if a client component ever needs the session cookie in a later
feature, revisit then rather than leaving the gap open now.

### 🟠 `app/auth/callback/route.ts` has no automated test coverage

**Problem**: The route handler carries the feature's most security-relevant branching — refusing an
unissued `type`, choosing between the PKCE `code` and `token_hash` exchange, deciding the recovery
vs. confirmation destination, and building the redirect target — and none of it has a Vitest file.
It is the exact function where the Blocker above lives, and a test suite exercising `next` handling
here would very likely have caught it.

**Why it matters**: `TEST_SIGNAL = configured` (Vitest is the project's safety net), and this is
branching, security-relevant logic per the review guide's own bar for a Major. Coverage today is
manual browser steps recorded in `verify.md`, which is real but does not run on every future change.

**Suggested fix**: Add `app/auth/callback/route.test.ts` mocking `@/lib/supabase/server` the way
`app/(auth)/actions.test.ts` already does, covering: an unissued `type` is refused before any token
is spent; `code` and `token_hash`+`type` both exchange correctly; a recovery link never honours
`next`; and (once the Blocker is fixed) that a hostile `next` cannot reach the redirect target.

### 🟠 Five of six `app/(auth)/actions.ts` Server Actions are untested

**Problem**: `app/(auth)/actions.test.ts` exists and is thorough, but it covers only
`resetPasswordAction`. `signUpAction`, `resendConfirmationAction`, `signInAction`, `signOutAction`
and `requestPasswordResetAction` have no unit tests. In particular, AC-2's enumeration defense —
the `addressAlreadyRegistered` detection (`user_already_exists` code vs. the empty-`identities`
signal) and the `SIGN_UP_PAD_MS` timing pad in `signUpAction` — is entirely unverified by
automation; the only evidence it works is a one-time manual timing measurement recorded in
`verify.md`, which a future refactor could silently break with nothing to catch it.

**Why it matters**: This is exactly the kind of branching, security-relevant logic the review guide
calls out as at least a Major gap when `TEST_SIGNAL = configured`. The existing `resetPasswordAction`
test file already establishes the mocking pattern (`vi.mock("@/lib/supabase/server", ...)`, a
`RedirectSignal` for asserting `redirect()` targets), so extending it is low-friction.

**Suggested fix**: Extend `app/(auth)/actions.test.ts` (or a sibling file) with cases for: the
`user_already_exists` and empty-`identities` branches both landing on `/check-email` with the pad
applied; `signInAction`'s neutral failure vs. the unconfirmed-address exception; `signOutAction`
passing `scope: "local"`; and `requestPasswordResetAction`'s neutral response regardless of outcome.

## Minor

### 🟡 `classifyAuthError` has no case for Supabase's `same_password` code, `lib/auth/supabase-error.ts:40-63`

**Problem**: `same_password` is a real, documented Supabase Auth error code (confirmed in the
installed `@supabase/auth-js` `ErrorCode` type) that `updateUser` can return when someone submits
the password they already have — a realistic scenario on both `/reset-password` (someone recovering
an account they didn't actually forget the password to) and the `/account` change-password form. The
`switch` in `classifyAuthError` has no case for it, so it falls to `default` and reports
`AUTH_OUTCOME.unexpected`, showing "Something went wrong on our side. Please try again." and logging
`outcome: unexpected` for what is actually a well-understood, expected refusal.

**Why it matters**: A plausible, non-error user action gets a generic failure message and a
misleading log entry instead of clear guidance ("choose a different password from your current
one"). This was already surfaced as "worth a look" in the verify run 2 notes and not addressed.

**Suggested fix**: Add a `same_password` outcome (or fold it into an existing one with matching
copy) and a corresponding case in the `switch`, plus a `supabase-error.test.ts` case.

### 🟡 `app/account/actions.ts`'s `changePasswordAction` has no unit test

Non-trivial branching (rate limit vs. wrong current password vs. session expired vs. a successful
change) with no automated coverage, unlike its sibling `resetPasswordAction`. Lower severity than
the sign-up/sign-in gap above because `AGENTS.md`-mandated ownership (deriving the user from
`getOptionalUser()`, never a form field) is straightforward here and less likely to regress silently,
but still worth a test given the account-takeover stakes the file's own doc comment names.

## Strengths

- The JSDoc throughout genuinely explains *why*, per `AGENTS.md`'s convention, not just what — the
  comments on `SIGN_UP_PAD_MS`, `isRecoverySession`, and the proxy's GET-only guard read like design
  notes, not restatements of the code.
- `lib/auth/messages.ts`'s neutral-wording tests (`messages.test.ts`) are excellent: they assert the
  *absence* of leaking phrases ("no account", "already registered", `@`) rather than just checking
  specific strings, which is the right shape for an enumeration-defense guarantee.
- `app/layout-purity.test.ts` and `proxy.test.ts` lock in two silent-failure-mode invariants (the
  `cacheComponents` static shell, and never redirecting a Server Action POST) as source assertions
  that will actually catch a regression, where a rendered test would not.
- AC-24's recovery-session gate (`isRecoverySession`, fails closed on every shape but the one form
  actually observed from the Auth server) and its test suite are a careful piece of defense-in-depth
  reasoning, and `app/(auth)/actions.test.ts` verifies the write order (`updateUser` before
  `signOut`), not just the end state.
- `pnpm typecheck`, `pnpm lint:ci`, `pnpm test` (279/279 across 35 files) and `pnpm build` all pass
  as independently re-run for this review, matching the counts claimed in `verify.md`'s final run.

## Test coverage

Well covered: `lib/auth/schemas.ts`, `lib/auth/messages.ts`, `lib/auth/identity.ts`,
`lib/auth/private-paths.ts`, `lib/auth/supabase-error.ts` (aside from `same_password`),
`components/auth/auth-field.tsx`, `components/auth/auth-feedback.tsx`,
`components/auth/auth-cross-link.tsx`, the navbar/account-slot Suspense wiring, and
`resetPasswordAction`. `lib/auth/next-path.ts` is covered but missing the control-character cases
that would have caught the Blocker above. Not covered at all: `app/auth/callback/route.ts` (the
route with the most security-relevant branching in the change), and five of six exported Server
Actions in `app/(auth)/actions.ts` plus `changePasswordAction` in `app/account/actions.ts` — see the
Major/Minor findings above.
