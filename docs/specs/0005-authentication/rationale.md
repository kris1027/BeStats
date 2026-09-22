# 0005. Authentication: reasoning and options

The build spec is in [index.md](index.md). This file holds the decision record: why the shape was chosen, what was weighed against it, and the two premise concerns raised during the design.

## Context

> ⚠️ Premise note: feature 6's done when line promises sign in with either method, but Google sign in cannot be verified without a Google OAuth client, which belongs to feature 20 in slice 8. Left as written, a slice 1 feature could not close until a slice 8 feature landed, which inverts the build order and would either stall slice 1 or produce a false claim that Google works. The right framing is that feature 6 owns email and password end to end, and Google joins feature 20 alongside the other provider configuration. The scope row is being narrowed accordingly, and this is enrolled as a follow up.

> ⚠️ Premise note: the sign in artboard labels its field "Email or username" and the signed in navbar shows the name `kris1027`, which implies a stored username and a profiles table. Nothing else in the product needs one: `AGENTS.md` section 7 fixes sign in on email and password, section 8 permits a profile table only when the interface needs fields the auth account lacks, and there are no public profiles in the MVP. Building one would add a table, its policies, a uniqueness rule, a sign up step and, for username sign in, a server side lookup that turns a username into an email, which is exactly the address enumeration surface the rest of this design closes. The right framing is to read the artboard's name as a display name and derive it from the email, and to correct the field label to "Email". Agreed during the design.

BeStats has a public catalog and a private tracking layer. The database half of the private layer already exists and is finished: spec [0001](../0001-user-tracking-schema-and-rls/index.md) put three tables behind row level security whose every predicate compares `auth.uid()` against a `user_id` column. Those policies are inert until something actually establishes who `auth.uid()` is. Nothing does yet. There is no sign in, no session beyond the refresh that [proxy.ts](../../../proxy.ts) performs, and no private route. This feature supplies the missing half.

Several forces shape the answer. `AGENTS.md` section 11 states plainly that a private page redirect is an experience measure and not the security boundary, which rules out any design where the redirect is the only guard. Section 5 asks that application mutations go through Server Actions or Route Handlers following one consistent pattern, and this is the first feature in the project to write one, so whatever shape it picks becomes the pattern features 8, 9, 12 and 14 copy. `cacheComponents` is on and feature 5 has just established that the public catalog prerenders and navigates instantly, so a signed in state in the root layout is a direct threat to work that shipped a week ago.

The delivery constraint is real too. Feature 6 sits in slice 1, the thin end to end thread, while provider setup sits in slice 8. Anything that needs a Google Cloud console, a real SMTP provider or a deployed origin cannot be verified now without dragging slice 8 forward. The honest options are to build it and mark it unverified, or to move it. `AGENTS.md` section 13 forbids substituting a mock only check for a claimed live integration result, which makes "build it and claim it works" unavailable.

Finally, this is a GA tier feature guarding private data, and the auth forms are the most abusable surface the app will ever expose. Whatever it does about weak passwords, address enumeration and repeated attempts is a decision, not an afterthought.

## Options considered

### Option 1: Supabase browser client in Client Components

The canonical Supabase quickstart. The sign in form is a Client Component that calls `supabase.auth.signInWithPassword` directly using the publishable key, and the library writes the session cookies from the browser.

**Pros**:

- Least code, and it is what almost every Supabase and Next.js tutorial shows, so it is the easiest thing for a future reader to recognise.
- Instant client side validation feedback with no round trip.

**Cons**:

- The session token is handled by client JavaScript, so any cross site scripting bug anywhere in the app becomes a session theft.
- It makes the project's very first mutation a client side one, which is the opposite of the pattern `AGENTS.md` section 5 asks for and which every later tracking write must follow.
- The forms stop working entirely without JavaScript.

### Option 2: Server Actions throughout, plus one callback Route Handler

Every mutation, sign up, sign in, resend, reset request, reset, change password and sign out, is a Server Action using the request scoped server client. Zod validates the form data. One Route Handler at `/auth/callback` exchanges the token in an email link for a session. The browser calls Supabase Auth never.

**Pros**:

- No token is ever exposed to client JavaScript, which removes a whole class of session theft.
- It establishes the mutation pattern the rest of the private features inherit, in the exact shape section 5 describes.
- Progressive enhancement comes free: the forms post and work with JavaScript disabled.
- Input validation happens on the server, where it cannot be skipped, with the same Zod schema reused in the client for early feedback.

**Cons**:

- More moving parts than Option 1: a result type, `useActionState` wiring in each form, and a separate callback route.
- Every validation failure Zod cannot judge locally, such as a breached password, costs a round trip before the person sees the message.

### Option 3: Plain form posts to Route Handlers

Forms post to `/auth/sign-in` and similar handlers, which set cookies and redirect.

**Pros**:

- Works without JavaScript, and the request flow is about as legible as it gets.
- Nothing framework specific to learn.

**Cons**:

- The error round trip has to be hand built, through a flash cookie or a query parameter, which is exactly what Server Actions and `useActionState` already solve.
- It splits auth away from the Server Action pattern every other mutation in the app will use, so the project would carry two shapes for the same job.

## Rationale

Option 2 wins on the force that matters most here: this is the project's first mutation, and whatever it does sets the pattern for every private write that follows. Section 5 names Server Actions or Route Handlers and asks for consistency, and Server Actions carry error state back to the form without hand rolled plumbing, which Route Handlers do not. Option 1's client side call would have made the pattern a client one, and every later tracking write would then either copy a weaker shape or contradict it.

The security argument reinforces rather than drives it. Keeping the token off the client removes a category of failure entirely rather than mitigating it, which is worth the extra wiring in a GA tier feature guarding private data.

The two layer guard follows straight from `AGENTS.md` section 11. The proxy redirect exists so a signed out visitor sees a sign in page instead of an error, and the server side recheck exists because the redirect can be bypassed by anything that does not go through the matcher. Neither substitutes for the other, and Postgres row level security sits underneath both as the layer that cannot be bypassed at all.

The navbar deserved its own thought because it is the one place this feature can quietly undo feature 5. Making the layout dynamic would have been two lines and would have opted the entire public catalog out of prerendering. Reading the session in the browser would have kept the catalog static but flashed the signed out state on every load, and `components/AGENTS.md` already rules it out. The Suspense boundary keeps both properties: the shell is static and the account slot is server rendered, at the cost of a brief skeleton for signed in users. That cost is visible and small; the alternatives are invisible and large.

On passwords, the choice of eight characters plus breach screening over the Supabase default of six with no screening follows current guidance that length and breach checking do more than character class rules. It costs a little friction at sign up and closes the most common real attack, credential stuffing with passwords already known to be compromised. The screening half of that only exists on the hosted project, so until feature 20 switches it on, the eight character minimum is carrying this alone. Twelve was considered and rejected as disproportionate for an app holding watch history and no payment or health data.

On enumeration, the neutral wording is genuinely worse for the honest person who mistypes their address, and that was weighed. The deciding factor is that the alternative turns three public forms into a membership lookup for any address, on a feature carrying a GA tag. The confusion is recoverable; the leak is not.

Neutral wording alone is not enough, which a cross check of this spec caught. Supabase's `signUp` does not behave identically for a new address and an existing confirmed one: the installed version (CLI 2.117) refuses with a 422 carrying the code `user_already_exists`, and older or differently configured versions instead return no error and a user with an empty `identities` array. Either way no message is sent. A build that only matched the copy would leak through that response and the absent email, and would also be measurably faster on the existing address branch. The action therefore detects that case explicitly and pads it. The pad narrows the timing signal rather than eliminating it, which is the proportionate answer for an app holding watch history; a constant time implementation would be the right call for money or health data and is not warranted here.

On which Supabase call resolves the session, `getClaims()` is the default everywhere, through one `requireUser()` helper, because it verifies the token locally and is already what the proxy uses. `/account` is the single exception: AC-16 needs the identities list, which the claims do not carry, so it makes one `getUser()` call and uses that response for both the address and the form's rendering condition. That is one exception with a stated reason rather than two interchangeable habits.

On abuse limits, Supabase already caps failed sign ins and email sends at its auth endpoints, and the stack today has no shared state that could hold a counter of our own. Writing one would either be wrong on a serverless deployment or be the first piece of infrastructure the project runs, for a problem the platform already handles. Recording the configured numbers and surfacing the resulting error honestly is the proportionate answer. A captcha remains available to feature 20 if abuse ever shows up.

On Google, the engineer chose to defer it entirely rather than ship a code path that cannot be exercised. That is the more honest of the two, and it forces the artboard question into the open: the button is omitted rather than disabled, for the same reason feature 5 left the search field out of the navbar instead of drawing a box that does nothing. A disabled button that says "coming soon" reads as broken; an absent one reads as a page that has not grown that feature yet.

## Evidence

### What `design/` actually specifies

Sixteen references exist. Four bear on this feature.

- `desktop-sign-in-page.svg` and `mobile-sign-in-page.svg`: "Welcome back", "Sign in to keep track of what you watch.", "Continue with Google", "or use your login", "Login", "Email or username", "Password", "Enter your password", "Forgot password?", "Sign in". Identical text at both widths.
- `desktop-navbar-signed-in.svg`: brand, the two media tabs, a search field, "Watchlist", "Upcoming", "Watched", an avatar reading `K`, the name `kris1027`, and "Sign out".
- `mobile-menu-open.svg`: the same private links and account block inside the menu sheet that `components/layout/mobile-menu-sheet.tsx` already ships.

There is no reference for sign up, for the check your email state, for forgot password, for reset password or for an account page. Per `AGENTS.md` section 3, those screens are built by adapting the sign in card, its type scale and its spacing, and that adaptation is approved through this spec.

The search field in the signed in navbar belongs to feature 11 and stays out, consistent with the reasoning already recorded in `components/layout/navbar.tsx`.

### What already exists in the repository

- [proxy.ts](../../../proxy.ts) refreshes the session on every matched request and deliberately contains no redirect, with a comment saying route protection belongs to this feature. The guard is added here, alongside the refresh that is already correct.
- [lib/supabase/server.ts](../../../lib/supabase/server.ts) and [lib/supabase/client.ts](../../../lib/supabase/client.ts) exist. This feature uses the server one; the browser one stays unused by auth.
- [lib/env.ts](../../../lib/env.ts) validates public environment values lazily with Zod, so a build with no Supabase project configured still succeeds. `NEXT_PUBLIC_SITE_URL` joins it there rather than being read from `process.env` anywhere.
- `components/layout/mobile-menu-sheet.tsx`, `components/ui/button.tsx`, `components/ui/input.tsx`, `components/skeleton.tsx` and `components/state-panel.tsx` all exist and cover what these screens need. No new primitive is expected.
- `security-boundary.test.ts` and `design-tokens-boundary.test.ts` already enforce the secret and colour boundaries that AC-22 and AC-21 rely on.

### What the cross check changed

An independent read of the first draft found twelve places where a builder would have had to invent an answer, and three acceptance criteria that asserted something nothing in the verify steps could fail. All were applied. The ones that changed the design rather than just filling a blank:

- The AC-2 enumeration claim was wrong as written, for the reason given in the Rationale above.
- `isSafeNextPath` had to reject backslash forms, not only the double slash, because browsers normalise `/\evil.example` to a protocol relative URL.
- The account slot cannot be imported into `MobileMenuSheet`, which is a Client Component. It is rendered once in the layout and passed in as children.
- AC-18 was self proving: it said to check against whatever limits happened to be configured, so it could not fail. The numbers are now fixed in the criterion itself.
- AC-14's second sentence was unverifiable, so it gained a layout purity test.
- AC-16's negative branch cannot be exercised until Google exists, which the criterion now says rather than implying a browser check that would always be skipped.

The weakest remaining point is recorded honestly in Consequences: the second guard layer depends on every future private surface calling `requireUser()`, and nothing enforces that yet. It is enrolled as a follow up to settle before feature 9 adds the next private page.

### The rate limit question

Supabase's auth rate limits are project configuration, not code, and the numbers differ between a local stack and a cloud project. What they measure is fixed by Supabase and not by us: `sign_in_sign_ups` counts per five minute interval per IP address, and there is no per address sign in limit to configure, so AC-18 names the buckets that exist rather than the ones an earlier draft wished for. Leaked password protection is not in this file at all; it is a hosted dashboard setting, which is why AC-9's breach branch cannot be proven locally. The verify steps therefore read the configured values rather than asserting a constant, so the check stays true when feature 20 sets the cloud project up.

### What the verify run changed, 2026-09-22

`/check verify` ran the whole checklist against a production build on the local stack and found four steps that
did not pass. Three were the checklist expecting something the build had deliberately not done, and one was a
real hole. All four were settled here rather than left in the verify file as open failures.

**The recovery form accepted any session.** `resetPasswordAction` checked only that a session existed, not that it
came from a recovery link, and `secure_password_change` is `false`, so Supabase did not ask either. Signing in
normally, opening `/reset-password` and setting a new password worked: the old password stopped authenticating
and the new one started, with the current password never asked for. That makes AC-16's current password check on
`/account` decorative, since anyone holding a session cookie can take the same account over through the other
form. The spec's own API table already said this action needs a recovery session, so the code had drifted from
the spec rather than the spec being unclear.

The gate chosen is the `amr` claim, which the same `getClaims()` call already returns: a recovery exchange
produces `[{ method: "recovery" }]` and an ordinary sign in produces `[{ method: "password" }]`, both confirmed by
decoding real tokens from the installed version. It costs no extra network call, needs no configuration kept in
step between the local stack and the cloud project, and lives in the action, which this design already treats as
the boundary. Turning on `secure_password_change` was the runner up: it puts the rule in the platform, which is
stronger, but it also changes what `changePasswordAction` has to do and is a second setting to mirror in the
hosted project. It is enrolled as feature 20 hardening behind our own check, not instead of it.

**`/reset-password` opened directly still renders its form.** The page reads no session on purpose, which is what
keeps it prerendered, and the action refuses the write. With AC-24 in place that refusal is now a real gate, so
the verify step was rewritten to expect the refusal it actually gets, plus the offer of a fresh reset link, rather
than a redirect. A redirect would have cost the route its prerender to improve a case that ends safely either way.

**With scripting off the navbar shows neither state.** The account slot is streamed inside a Suspense boundary, so
a browser with no JavaScript keeps the fallback skeleton. The markup is genuinely server produced, which is what
AC-13 asks for, and the served HTML proves it, so the step now proves it from the HTML instead of from a scripting
off render. Dropping the boundary would fix the no JavaScript navbar and cost `/shows` and `/movies` their
prerendered shells, which is a bad trade for a case where `/account` itself still works. A `<noscript>` Sign in
link was weighed and refused: it would show Sign in to a signed in visitor with no script there to correct it.

**There is no menu sheet to open.** The step assumed the mobile navbar opens the sheet the artboards draw, and it
does not; `MobileMenuSheet` is wired only into `/showcase`. The sheet's contents are Watchlist, Upcoming and
Watched, which belong to feature 9, so the step moved there with them, and the missing menu button is now recorded
in Consequences as a deliberate deviation rather than being left to look like an oversight.

### What the cross check added, 2026-09-22

A fresh model read the updated spec against the code. It found four things; the first changed a criterion.

**The gate covered the moment, not the session.** AC-24 as first written checked `amr` at submission time and said
nothing about what becomes of the recovery session afterwards. `amr` is a property of the session, not of the
request, so it keeps reading `recovery` through every background refresh. Reproduced in a browser: open one
recovery link, set a password, return to `/reset-password` in the same tab, set another, and the second one takes,
with no current password asked either time. On a shared device that is a standing takeover capability that
outlives the reset it was issued for.

The fix chosen is to spend the session: a successful reset signs out globally and sends the person to `/sign-in`.
Ending every session is also the right thing for a recovery, since it removes anyone else already inside the
account. It costs one password entry and it rewrote AC-8, which had promised the person stays signed in. Signing
out this browser only was the runner up, and was refused because it leaves a stolen session alive on the one
account where someone is actively proving they lost control. Keeping them signed in and refusing a second reset
was refused because the only places to record "this session already spent its reset" are a cookie the browser can
delete or a new table this feature deliberately does not add.

**No home was named for the check.** The project has no mocking pattern; every test in `lib/auth/` covers a pure
function, which is why AC-16's rendering condition became `hasPasswordIdentity` in `lib/auth/identity.ts`. The
spec asked for a unit test over the claim shapes without naming anything to test, so the gate would have been
written inline and then been untestable. `isRecoverySession()` now lives beside its sibling, and `identity.ts` and
`supabase-error.ts` were backfilled into the Supporting modules list, where both were missing despite existing.

**The `next` fix was not one line.** Both cross links sit in the panel footer, outside the Suspense boundary that
streams the form, which is exactly what keeps the card and footer prerendered; each page's doc comment says so.
Reading `searchParams` for the footer therefore forces a structural choice the spec had not made. The footer now
gets its own boundary with the un parameterised link as its fallback, which looks identical, so nothing shifts and
the card stays static.

**The claim shape was under specified.** The installed SDK types `amr` as `AMREntry[] | string[] | undefined`.
Decoded tokens from this version use the object form, but the pure function takes all of it and treats absent,
empty and unknown as not a recovery session, so the failure direction is refusal.

### How long a revoked session keeps working, 2026-09-22

Verify run 2 found that after a reset signs out globally, a second browser still renders as signed in. It cannot
change anything through Auth, which answers `403 session_not_found`, but the navbar and `/account` both resolve the
user through `getClaims()`, which checks the access token's signature and expiry locally and never asks Auth
whether the session still exists. So the second browser looks signed in until its token expires, which was up to
`jwt_expiry = 3600` seconds. The checklist step expecting it to be signed out on the next refresh could not pass.

The first thing worth knowing is that this is not only about what the page shows. PostgREST, which serves every
table read and write behind Row Level Security, also accepts any unexpired token with a valid signature. So anyone
who copied the access token can keep reading and writing that account's rows directly, whatever our pages do.
The session cookie is readable by script (`httpOnly: false`, the `@supabase/ssr` default), which makes copying it
the realistic threat a reset is meant to end. (At the time. The fresh model review on the same day made the cookie `HttpOnly`,
AC-25; copying a token by other means, such as malware or a shared machine, is what the window still bounds.)

Options weighed:

- **Shorten the token lifetime to 600 seconds and state the window in AC-8 (chosen).** It is the only option that
  bounds the direct API window as well as the screen, it needs one configuration value and no code, and it keeps
  the design's choice of a local check. Cost: a refresh every ten minutes per active session instead of every hour,
  which the proxy already performs. Much shorter lifetimes multiply refresh traffic and make small clock differences between servers matter, so ten minutes is a middle value rather than the floor.
- **`getUser()` on every render.** The second browser would read signed out on its next refresh, and Server Actions
  would notice a revoke. Refused because the navbar slot renders on every page, catalog included, so it adds a round
  trip to Auth to every page view, and it still leaves the direct API window at a full token lifetime. It fixes the
  appearance, not the exposure.
- **Both.** The screen updates at once and the API window is ten minutes. Refused as the highest cost for a gain,
  the immediate repaint, that matters little when writes are already refused.
- **Only rewrite AC-8, keep 3600.** Honest, but an hour of API access after someone recovered their account
  specifically to shut an intruder out is too long when shortening it is one line.

Why the bound is the token's own lifetime and not more, checked against the installed auth-js 2.116: the client
refreshes a session only once it is within a 90 second margin of `exp` (`EXPIRY_MARGIN_MS`, three ticks of 30
seconds). If that refresh fails while the access token is still unexpired, the SDK keeps serving the old session
rather than signing out early; once `exp` passes, there is nothing to keep, and the next request renders signed out.
So the window ends at the token's real `exp`, at most 600 seconds after it was issued. A later auth-js version could
change that behaviour, which is why the verify step checks the outcome in a browser rather than trusting this note.

A session check inside the database (policies or a PostgREST pre request hook comparing the token's `session_id`
against `auth.sessions`) would close the window entirely. It is recorded in Consequences as the fix to reach for if
the private data here ever becomes sensitive, not built now: it adds a lookup to every policy evaluation and a
dependency on the auth schema for a watch tracking app.

### Steps the local stack cannot run (verify run 3, 2026-09-22)

Verify run 3 passed every step it could run and left five blocked: the breach refusal (AC-9), the Google only
account on `/account` (AC-16), and three rate limit steps (AC-16, AC-18). Each needs something only the hosted
project has: leaked password protection, a Google identity, or rate limits the local Auth container actually
applies. Run 1 showed the last one plainly: forty wrong sign ins in a row, every one a 400, never a 429.

Options weighed:

- **Move the runtime steps to feature 20 and add mapping tests here (chosen).** Feature 20 stands up the hosted
  project, so it is the first place these steps can run at all. What this feature owns is our half: turning the
  error Supabase sends into the right message. Today that half is only partly tested (the copy renders, but nothing
  proves a 429 or a breach refusal reaches it), so four cases in `supabase-error.test.ts` close the gap cheaply.
- **Move them with no new tests.** Cheaper, but the classifier's 429 and `pwned` branches would stay unproven by
  anything until feature 20, and the breach branch matches on message text, the most fragile kind of check.
- **Keep them here.** Honest, but feature 6 would sit blocked until feature 20, holding up `/test` and the fresh
  model review for work this feature cannot do.

Settling this turned up a real bug. `classifyAuthError` spots a breach by matching `pwned|breach|leaked` in the
message, but the installed Auth server's refusal reads "Password is known to be weak and easy to guess, please
choose a different one." (found in the running container's binary), so a breached password would show the eight
character copy. The reliable signal is the `reasons` list auth-js attaches to `AuthWeakPasswordError`, where a
breach is `pwned`. Step 9 switches to it, and the new test uses the server's real wording so a regression to
message matching fails.

### The session cookie was readable by script (fresh model review, 2026-09-22)

The review found that neither `createServerClient` call passed `cookieOptions`, so both fell back to
`@supabase/ssr`'s `DEFAULT_COOKIE_OPTIONS`, whose `httpOnly` is `false` (read from the installed package,
`dist/module/utils/constants.js`). Verify runs 1 and 3 had both noticed the flag and left it for review. The spec's
own Consequences said a cross site scripting bug could not steal a session, and as shipped it could, through
`document.cookie`.

Options weighed:

- **Make the cookie `HttpOnly`, and `Secure` on an `https` site URL (chosen).** It makes the stated guarantee true
  with one shared options object and no change to any flow, because every read and write of the session already
  happens on the server: Server Actions, the callback Route Handler and the proxy. The library default of `false`
  exists for apps that use the browser client, and this one chose not to (Option 2). Cost: the browser client in
  `lib/supabase/client.ts` cannot see a session, which nothing needs today.
- **Keep the default and correct the claim.** Honest, and it keeps the browser client usable, but it leaves the
  refresh token, which lives far longer than the ten minute access token, one script injection away from a copy
  that survives the page. That is the most valuable thing in the cookie, and nothing in the design needs it exposed.

`Secure` is derived from `NEXT_PUBLIC_SITE_URL` rather than from `NODE_ENV`. A production build served on
`http://localhost:3000` would otherwise set a `Secure` cookie that some browsers refuse over plain `http`, and the
deployed origin, which is always `https`, would get the flag regardless of how the build was made.

The same review found the open redirect that AC-11 now names. `isSafeNextPath` judged the raw characters, but the
URL parser deletes tab, line feed and carriage return before it resolves, so `/\t/evil.example` became
`//evil.example`. `/debug` fixed it the same day by refusing every control character; the criterion was widened to
match, since a path with a control character in it is never a real BeStats path.

