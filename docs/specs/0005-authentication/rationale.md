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
