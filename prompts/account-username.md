# Account username

No spec: an account feature decided in grilling (2026-10-11, rounds 1 to 3). It adds the first `profiles` table, which section 8 of `AGENTS.md` allows once the UI needs a field the auth account does not hold, and it reverses the "no `profiles` table" note in `lib/auth/AGENTS.md` and `lib/auth/identity.ts`. Branch `feat/account-username`.

## Goal

Every account can have a **username**: chosen on the sign up form, changeable on `/account` at most once every 7 days, shown in the navbar in place of the email derived name.

- 2 to 30 characters, ASCII letters, digits, `_`, `.` and `-`; no spaces; never starting or ending with `.` or `-`.
- Unique ignoring case (`Kris` and `kris` are the same name), stored as typed.
- A short reserved list (`admin`, `bestats`, ...) is refused.
- Not shown to anyone but its owner: there are still no public profiles (section 7).

## Inspected code

- `app/(auth)/sign-up/sign-up-form.tsx`, `page.tsx` and their tests: email and password fields, `useActionState(signUpAction)`, field errors through `AuthActionState.fieldErrors`.
- `app/(auth)/actions.ts`, `signUpAction`:
  - parses `signUpSchema`, then calls `supabase.auth.signUp`;
  - with `NEXT_PUBLIC_AUTH_EMAIL_DELIVERY=off` (production) a session comes back and it redirects to `next`;
  - with delivery on, it pads every answer to `SIGN_UP_PAD_MS` (1200 ms).
- `supabase/config.toml`: `enable_confirmations = false`, so a sign up returns a session; Google is not enabled.
- `app/account/page.tsx`: `instant = false`, `requireUser()`, an identity card with Sign out, then `ChangePasswordForm` in its own glass section. `app/account/actions.ts`, `changePasswordAction`: the pattern for an `/account` Server Action (Zod, `getOptionalUser()`, a returned `AuthActionState`, never a redirect).
- `lib/auth/schemas.ts`: the one place for input rules, with constants exported so a test can compare them with the database.
- `lib/auth/action-state.ts` (`AuthField`, `failure`, `fromZodError`, `success`) and `lib/auth/messages.ts` (`AUTH_OUTCOME`, all copy).
- `lib/auth/identity.ts`: `displayName(email)` and `avatarLetter(email)`, pure, used only by `components/layout/account-slot.tsx`.
- `lib/auth/user.ts`: `getOptionalUser` is `cache()`d and JWT only; the navbar slot renders twice (desktop and mobile) inside Suspense in `app/layout.tsx`.
- `supabase/schemas/02-06*.sql`: the declarative source of truth; migrations are written by hand from them. `04-policies.sql` revokes everything from `anon`/`public`/`authenticated` and grants back only what is needed, and narrows every trigger function.
- `supabase/tests/140-security-sweep.test.sql`: in `public`, no `security definer` function, no function `anon` can execute, every table with RLS forced, an owner policy for each of the four commands for `authenticated` only, and a `user_id` that references `auth.users` on delete cascade.
- `app/privacy/page.tsx` ("Account data: your email address, and your password ...") and `lib/legal/operator.ts` (`LEGAL_LAST_UPDATED`).

## Skills

- `supabase-postgres-best-practices` and `supabase` for the table, constraints, trigger, function, grants, migration and pgTAP.
- `next-dev-loop` for the running app check.

## Decisions (settled in grilling, 2026-10-11)

1. **Where it shows** (Q1): the navbar account button, the avatar letter and the `/account` header use the username; with none, they fall back to `displayName(email)` as today.
2. **Uniqueness** (Q2): unique index on `lower(username)`; stored as typed.
3. **Format** (Q3): `^[A-Za-z0-9_.-]{2,30}$`, not starting or ending with `.` or `-`. ASCII only, so no look-alike names.
4. **Sign up** (Q4): the field is required.
5. **Accounts without one** (Q5): existing accounts and, later, Google accounts are not forced; they keep the fallback and can set one on `/account`.
6. **The weekly lock** (Q6):
   - rolling: 7 days (168 hours) after the last change;
   - the first set, at sign up or on `/account`, starts the clock;
   - saving the identical name is a no-op and does not restart it;
   - a case-only change (`kris` to `Kris`) counts as a change.
7. **Enforcement in the database** (Q7, revised in round 3 to fit the security sweep): `profiles` is an ordinary owner-only RLS table. Format, reserved names, uniqueness and the lock are table rules (constraints and a trigger), so they hold for a direct API write too. No `security definer` writer.
8. **Reserved names** (Q8): `admin`, `administrator`, `root`, `support`, `help`, `bestats`, `system`, `moderator`, `staff`, `official`, `tmdb`, `api`, `account`, `null`, `undefined`. Defined once in TypeScript and once in SQL, and a test keeps the two equal.
9. **Sign up order** (Q9, Q16): check availability, then `signUp`, then insert the profile as the new user. No trigger on `auth.users`.
10. **Availability check** (Q10, Q16): on submit only. It needs one named exception to the sweep, `public.username_available(text) returns boolean`, `security definer`, callable by `anon` and `authenticated`, returning only true or false. The sweep lists it by its exact signature as its only exception. That someone can learn a name is in use is accepted.
11. **Unconfirmed accounts** (Q11): they keep their name. Accepted; confirmation is off.
12. **Navbar read** (Q12): one `cache()`d profile read per request inside the existing Suspense boundary.
13. **`/account` form** (Q13): a "Username" section between the identity card and Change password; see Design.
14. **Privacy** (Q14): policy text and `LEGAL_LAST_UPDATED` change in this PR.
15. **Deletion** (Q15): `on delete cascade` from `auth.users` frees the name.
16. **Timing pad** (Q17): a taken username is refused before `signUp`, unpadded. The pad is unchanged for the email address branches.

## Design

### Database

`supabase/schemas/02-tables.sql`:

```sql
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  username_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format_check
    check (username ~ '^[A-Za-z0-9_.-]{2,30}$' and username !~ '^[.-]|[.-]$'),
  constraint profiles_username_reserved_check
    check (lower(username) <> all (array['admin', ...]))
);
create unique index profiles_username_lower_key on public.profiles (lower(username));
```

`supabase/schemas/03-triggers.sql`: the existing `set_updated_at` trigger, plus `guard_username_change()`, `before insert or update`, security invoker, empty `search_path`:

- **insert**: `new.username_changed_at := now()`, whatever the client sent.
- **update, same username** (exact compare): `new.username_changed_at := old.username_changed_at`, so the timestamp can't be rewound by writing it directly.
- **update, different username**: if `old.username_changed_at > now() - interval '7 days'`, raise `username_locked` (`errcode 'P0001'`); otherwise `new.username_changed_at := now()`.
- **`user_id`**: cannot change (`new.user_id := old.user_id`); the update policy's `with check` also pins it to `auth.uid()`.

`supabase/schemas/04-policies.sql`:

- RLS enabled and forced.
- Owner policies (`user_id = (select auth.uid())`) for select, insert, update and delete, for `authenticated` only, matching the sweep.
- Grants: `revoke all` from `anon`, `public` and `authenticated`, then `grant select, insert, update` to `authenticated`. **No delete grant**: deleting and re-inserting the row would reset the lock. The delete policy stays so the sweep's shape holds; the privilege layer refuses first. pgTAP proves a delete fails.
- `guard_username_change()` narrowed like the other trigger functions.

`supabase/schemas/05-functions.sql`:

```sql
create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = ''
as $$ select not exists (select 1 from public.profiles where lower(username) = lower(p_username)) $$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
```

It reads only that one column, returns only a boolean, and the sign up action alone calls it.

Migration `supabase/migrations/20261011120000_account_username.sql`, written by hand from the schema files. It only adds objects, so it is backward compatible: the deployed app ignores the new table.

`supabase/tests/140-security-sweep.test.sql`: the definer and anon execute assertions exclude exactly `public.username_available(text)`, with a comment saying why. A new assertion fails if that function ever stops returning `boolean`.

### TypeScript

- `lib/auth/username.ts` (pure, no `server-only`):
  - `USERNAME_MIN = 2`, `USERNAME_MAX = 30`, `RESERVED_USERNAMES`, `USERNAME_CHANGE_INTERVAL_MS`;
  - `usernameSchema` (Zod: `trim()`, then the format rules with one message each);
  - `usernameUnlocksAt(changedAt): Date` and `isUsernameLocked(changedAt, now): boolean`.
- `lib/auth/schemas.ts`: `signUpSchema` gains `username: usernameSchema`; a new `changeUsernameSchema`.
- `lib/auth/action-state.ts`: `AuthField` gains `"username"`; `values` may carry `username` back too, so a refused sign up keeps what was typed.
- `lib/auth/messages.ts`:
  - `usernameTaken`: "That username is taken." Also used for reserved names, so the list isn't revealed one name at a time.
  - `usernameLocked`: "You can change your username once a week."
  - `usernameUnchanged`: no message, a quiet success.
  - `usernameTakenAfterSignUp`: "Your account is ready, but that username was just taken. Choose another."
- `lib/auth/profile.ts` (`server-only`): `getOwnProfile = cache(...)` returns `{ username, usernameChangedAt } | null`. A read error returns `null` and is logged without user data, so the navbar never breaks over it.
- `lib/auth/identity.ts`: `displayName(email, username?)` and `avatarLetter(email, username?)` prefer the username. The "no `profiles` table" comment is rewritten.

### Sign up

`signUpAction` order:

1. Parse.
2. `rpc('username_available')`. If false, `failure(usernameTaken, ["username"])` with email and username kept. An RPC error is reported as `signUpUnavailable`, never treated as available.
3. `signUp`, unchanged.
4. If there is a session: `insert into profiles (user_id, username)`.
   - A unique violation (`23505`), from two people choosing the same name at once, redirects to `/account?username=taken`, which shows the `usernameTakenAfterSignUp` notice above an empty, enabled Username field.
   - Any other error redirects to `/account` with the field empty; the account exists and the name can be set there.
5. Redirect as today.

With no session (confirmation on in some other environment), the username is not stored and is set on `/account`; a known limitation, not reachable with today's config.

The form gets a Username input before the email:

- `autocomplete="username"`, `autocapitalize="none"`, `spellcheck=false`;
- hint text "2 to 30 characters: letters, numbers, _ . -";
- `aria-describedby` on the error.

### /account

The page reads `getOwnProfile()`.

- The identity card says "Signed in as **{username}** ({email})", or the email alone when there is no username.
- A new "Username" glass section, the same shell as Change password, holds `ChangeUsernameForm`, a client form on `useActionState(changeUsernameAction)`:
  - **No username yet**: an empty, enabled field, "Choose a username" and Save.
  - **Unlocked**: the current name prefilled, enabled, with Save.
  - **Locked**: the field disabled with the current name, Save disabled, and "You can change it again on {date and time}". The time is formatted in the browser's own time zone by a small client `<LocalDateTime>` that renders the ISO value on the server and formats it after mount, because the server does not know the viewer's zone and a date alone can be hours off.
  - **Success**: "Username updated." The form then shows the locked state; the action calls `refresh()` (or `revalidatePath`, whichever the installed Next.js docs say a Server Action uses under `cacheComponents`) so the navbar updates.
- `changeUsernameAction`:
  - Zod first, then `getOptionalUser()`; a missing session returns `sessionExpired`, as change password does.
  - An upsert on `user_id`. The trigger decides the lock and the no-op.
  - `23505` maps to `usernameTaken`, `P0001 username_locked` to `usernameLocked`, a `23514` check violation (a reserved name or a format the Zod check missed) to `usernameTaken` or `invalidInput`, and anything else to the generic unavailable message.
  - Never a redirect.

### Navbar

`AccountSlot` reads `getOwnProfile()` after `getOptionalUser()` and passes the username into `displayName` and `avatarLetter`. The read sits inside the existing Suspense boundaries, so `/shows` and `/movies` keep their prerendered shells; `app/layout.test.ts` keeps passing because the read lives in the slot.

### Privacy

"Account data: your email address, **the username you choose**, and your password ..." `LEGAL_LAST_UPDATED = "2026-10-11"`. No new processor.

## Expected files

- `supabase/schemas/02-tables.sql`, `03-triggers.sql`, `04-policies.sql`, `05-functions.sql`
- `supabase/migrations/20261011120000_account_username.sql`
- `supabase/tests/170-profiles-username.test.sql` (new), `140-security-sweep.test.sql`, and `010`/`020` if they list tables by name
- `lib/supabase/database.types.ts` (regenerated with `pnpm db:types`)
- `lib/auth/username.ts` + test, `profile.ts`, `schemas.ts` + test, `action-state.ts`, `messages.ts` + test, `identity.ts` + test, `AGENTS.md`
- `app/(auth)/actions.ts` + test, `app/(auth)/sign-up/sign-up-form.tsx` + test
- `app/account/page.tsx`, `actions.ts` + test, `change-username-form.tsx` (new) + test
- `components/layout/account-slot.tsx`, a small `LocalDateTime` client component
- `app/privacy/page.tsx`, `lib/legal/operator.ts`
- `AGENTS.md` (section 8 user account note, the repo facts line), `docs/scope/scope.md` via `/sync`

## Requirements

- R1: a username matches the format, is unique ignoring case, and is not reserved, enforced by the database for any writer.
- R2: a second change within 7 days of the last one is refused by the database; the identical name is a no-op that does not move the clock.
- R3: only the owner can read, insert or update their row; nobody can delete it; `anon` can read nothing.
- R4: `username_available` is the only `security definer` and the only anon callable function in `public`, and it returns only a boolean.
- R5: sign up requires a valid username and refuses a taken one before creating the account.
- R6: `/account` sets, changes and shows the lock state of the username; accounts without one see an empty field.
- R7: the navbar shows the username, or the email name without one.
- R8: Zod and SQL rules (min, max, pattern, reserved list) cannot drift: a test reads both.

## Security

- The user id always comes from the session (`auth.uid()` in policies, `getOptionalUser()` in actions), never from form data.
- The availability function reveals only whether a name is in use (accepted, Q10), and sits behind the existing auth rate limit and Vercel Firewall rule for sign up.
- No elevated key is used; the one definer function is read only and narrow.
- Usernames are rendered as text by React, never as HTML; the ASCII pattern rules out look-alike and invisible characters.
- No username, email or token goes into logs.

## Acceptance criteria

1. Signing up with `kris_01` creates the account and the profile, and the navbar shows `kris_01`.
2. Signing up with `KRIS_01` afterwards is refused on the Username field with "That username is taken.", no account is created, and the typed email and username are kept.
3. `a`, `has space`, `-dash`, `dot.`, `émile`, a 31 character name and `Admin` are refused by the form; the same values written directly through the API as the owner are refused by the database.
4. On `/account`, a fresh account (name set at sign up) sees the field locked with the unlock date and time; after moving `username_changed_at` back 8 days in the database it can change the name once, then is locked again.
5. Saving the identical name succeeds quietly and does not move the unlock time.
6. An account with no profile row sees an empty field, can set a name immediately, and is then locked.
7. User B cannot read, insert, update or delete user A's profile row through the API; `anon` cannot read the table; nobody can delete their own row.
8. Signed out, `username_available` answers true or false and nothing else.
9. `/shows` and `/movies` are still prerendered (build output), and the navbar falls back to the email name when the profile read fails.
10. `/privacy` lists the username and shows the new last updated date.

## Automated checks

- `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- `supabase db reset`, then `pnpm test:db`; the reset comes first, see the pgTAP memory.
- `pnpm db:types:check`.
- `pnpm build`.

## Remote migration

The migration only adds objects, so per `docs/deploy.md` it is pushed with `supabase db push` before the PR is merged, once you approve that step. No `config push` is needed.

## Manual test steps

Run against the local stack with `pnpm dev:docker`.

1. Open `/sign-up` and try `a`, `has space` and `admin` as the username. Each is refused under the Username field and keeps what you typed.
2. Sign up with `tester_one` and a new email. You land signed in, and the navbar shows `tester_one` with the avatar letter `T`.
3. Open `/account`. It reads "Signed in as tester_one", and the Username field is disabled with "You can change it again on {date about a week ahead, your local time}".
4. In Studio (or psql), set `username_changed_at = now() - interval '8 days'` for that row and reload `/account`. The field is enabled.
5. Save `Tester_One`. You see "Username updated.", the field locks again and the navbar shows `Tester_One`.
6. Sign out, then sign up with `TESTER_ONE` and another email. You get "That username is taken." and no account is created (check the Auth users list).
7. Delete one account's profile row in Studio and reload `/account` as that user. The field is empty and enabled, and the navbar falls back to the email name. Set a name and it saves and locks.
8. Narrow the window to 375 px and repeat step 3. The section fits, the field and button have 44 px targets, and focus is visible when you tab through.
9. Open `/privacy` and check that the username line and the 2026-10-11 date are there.

## Amendment (2026-10-11): two column `/account`

Asked after implementation: settings in a two column grid.

- **Layout:** from `lg` (1024 px) up, the page is a grid with two columns. On the left, two rows: the Account card, then the Username card. On the right, the Change password card spans both rows and stretches to their full height. Below `lg` it stays one column in today's order: Account, Username, Change password.
- **Width:** the container grows from `max-w-[480px]` to `lg:max-w-[984px]`, two 480 px columns and the existing 24 px gap (`gap-6`), so each card keeps today's width and no form gets wider than it is now. At `md` two columns would leave about 360 px per card with `md:px-10`, which is too tight, hence `lg`.
- **No password card:** a Google only account has none. The grid then keeps one column at 480 px as today, rather than an empty right column. The "could not load your password settings" card takes the password card's place in the right column when it shows.
- **Unchanged:** every card's content, spacing and glass classes; only the wrapper and the right card's grid placement change.

Files: `app/account/page.tsx`. Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, then the page at 1280 px and 375 px in the running app.
