# Mobile 5d1: sign up, account screen and account deletion (feature 28, spec 0033 Build plan step 5, fourth slice, first half)

## Goal

Give the app its own way in and its own way out. You can create an account on the phone, see and change your username on a real Account screen, and delete your account yourself, on the phone and on the web `/account` page. Deletion is the store requirement (Apple guideline 5.1.1(v)) that keeps the app shippable, and it runs through one small Postgres function bound to the caller, so the project still never uses the service role key.

Slice 5d was cut in two (agreed 2026-11-21):

- **5d1 (this plan)**: sign up, account screen, deletion on web and mobile with its migration, the privacy and terms text for self serve deletion. Satisfies **AC-12** and the deletion half of **AC-15**.
- 5d2: the persisted offline cache and its wipe, the offline banner, About with attribution (**AC-13**, **AC-14**).
- 5e: deep links (**AC-16**).

## Inspected code

- Spec 0033 `index.md` (AC-12 to AC-15, Build plan steps 5 and 6), child 0035 (`/me/profile`, `POST /me/account/delete`, Sign up on mobile) and child 0036 (Account deletion, Value sourcing, Critical test scenarios). The decision is fully recorded, so no spec change is needed.
- `supabase/tests/200-delete-own-account-proof.test.sql`: the proof already passed in step 3, so the function body is known to work as `postgres` owned security definer.
- `supabase/schemas/05-functions.sql` (`username_available`, the one security definer today), `supabase/AGENTS.md`, `tests/140-security-sweep.test.sql` (the named exception list).
- Web: `app/account/{page,actions}.tsx`, `app/(auth)/actions.ts` (`signUpAction`, `signOutAction`), `lib/auth/commands/username.ts`, `app/api/v1/me/profile/route.ts`, `lib/api/v1/{with-v1,tracking}.ts`, `app/privacy/page.tsx`, `app/terms/page.tsx` and their tests.
- Core: `auth/{schemas,messages,username}.ts`, `api/v1/profile.ts`, `legal/operator.ts` (`PROCESSORS`, `LEGAL_LAST_UPDATED`, `DELETION_DAYS`).
- Mobile: `sign-in.tsx`, `(tabs)/(index,search,library,account)/account.tsx` (the placeholder), `lib/{session,supabase,api,auth-errors,query-client}.ts(x)`, `components/{glass-button,notice,centered-state}.tsx`, `global.css` (`--color-destructive` exists).

## Skills used

`supabase-postgres-best-practices` and `supabase` (the function, grants, migration from the declarative schema), `expo-router` (the new sign up modal and the delete screen in the Account stack), `tanstack-query` (profile read and write), `react-native-testing`, `vitest`. I'll check the Expo SDK 58 docs for any API the earlier slices didn't touch.

## Decisions and assumptions

Layouts with no native precedent are marked "needs your approval here" (AGENTS.md section 3).

1. **The function, exactly as spec 0036 says.** `public.delete_own_account()` returns void, `language plpgsql`, `security definer`, `set search_path = ''`, owner `postgres`; raises `42501` "not signed in" when `auth.uid()` is null, then `delete from auth.users where id = auth.uid()`. Grants: `revoke all ... from public, anon, authenticated`; `grant execute ... to authenticated`. Written in `supabase/schemas/05-functions.sql`, the migration generated with `supabase db diff` (never written by hand).
2. **pgTAP.** The proof test becomes the real test `200-delete-own-account.test.sql` against `public.delete_own_account()` (same nine checks plus: the function takes no argument, and `authenticated` but not `anon` holds execute). `140-security-sweep.test.sql` names it as the second exception beside `username_available`, and the check that `anon` can execute only `username_available` stays.
3. **One command, two callers.** `deleteOwnAccountCommand(deps)` in `apps/web/lib/auth/commands/account.ts` runs `rpc("delete_own_account")` with the caller's client and returns `{ ok: true }` or `{ ok: false, error }`. The route `POST /api/v1/me/account/delete` (bearer, body `{ confirm: "DELETE" }` from a new core schema `v1AccountDeleteBodySchema`, 204 on success, 400 for a wrong confirm, 401, 500) and the web `deleteAccountAction` both call it, as every other v1 route mirrors its action (child 0035, Mapping to actions).
4. **The word `DELETE` and the copy live in core** (`auth/messages.ts`: `DELETE_ACCOUNT_CONFIRM_WORD`, the heading, the warning text, the failure message), so both apps say the same thing.
5. **Mobile Account tab (needs your approval here).** Signed in, one scrolling screen of glass panels, top to bottom:
   - **Header**: your username in bold (or your email while unclaimed), your email under it, and Sign out.
   - **Username**: the field with Save, `GET /me/profile` filling it and the weekly lock line from `usernameChangeableAt`; `PUT /me/profile` saves it, a 409 shows the server's message under the field. While the username is null, this panel comes first with the "Choose a username" line, and after a sign up whose name was taken, the `ACCOUNT_NOTICES.usernameTaken` notice.
   - **Delete account**: a row in `--color-destructive` text that pushes the Delete account screen inside the Account stack.
   - Signed out stays as today: the "You're not signed in" panel with Sign in, plus a Create account button.
   - Change password is not in 5d1. The web keeps it; on the phone it would sign in again with the current password, which replaces the session, and I'd rather not mix that with this slice. I'll list it as a follow up. Say so if you want it here.
6. **Mobile Delete account screen (needs your approval here).** A plain screen titled Delete account: the warning text (every mark, rating, tracked show, game and your username go, and this cannot be undone), a field labeled "Type DELETE to confirm" with autocapitalize on, and a destructive Delete my account button, disabled until the field is exactly `DELETE`. While the call runs the button shows its spinner and the screen ignores Back. On 204: `signOutLocally()`, `clearPrivateQueries()`, return to the Account tab root, and a toast "Your account was deleted." On any failure: the error under the button, still signed in, nothing wiped (spec 0036, Key invariants). A 401 follows the existing expired session path.
7. **Web Delete account section (needs your approval here).** A fourth panel on `/account`, same `PANEL` card, under Username in the left column: heading Delete account, the same warning text, a `Type DELETE to confirm` input and a destructive `Button` (`variant="destructive"` if the shadcn button has it, else the existing destructive token on the button). `deleteAccountAction` validates with the same core schema, rechecks the session, runs the command, then `signOut({ scope: "local" })` and redirects to `/`. A failure returns the message in the form, never a redirect. Since the production website is off, this is checked on the local stack only.
8. **Sign up on mobile (needs your approval here).** A `sign-up.tsx` modal beside `sign-in.tsx`, reached from a "Create an account" link on the sign in modal and from the signed out Account tab. Fields: Username, Email, Password, the same rules (`signUpSchema`) and copy as the web. Steps as child 0035 says: validate, `rpc("username_available")` as anon (an error is never read as available), `supabase.auth.signUp`, then `PUT /me/profile`. A 409 on that last step keeps the account and opens the Account tab with the taken notice. `user_already_exists` shows "already registered" with a Sign in instead link. When `signUp` returns no session (confirmation on, unreachable with today's `enable_confirmations = false`), the app says sign up is unavailable, exactly like the web with delivery off; the confirm email path waits for deep links in 5e.
9. **Privacy and terms (AC-15, deletion half).** `/privacy` replaces "Account deletion works by email request today" and the retention line with the self serve flow (on `/account` and in the app's Account tab, effective at once; logs keep their stated window), and gains a short mobile app paragraph: the app talks to the same server and Supabase project, and loads images straight from TMDB's and IGDB's image services. `/terms` changes the same way. `LEGAL_LAST_UPDATED` moves to the merge day. **Expo is not added to `PROCESSORS` yet**: `expo-updates` is not installed, and the policy states only what the code does (spec 0017). It joins `PROCESSORS` in step 6 with EAS Update, as the Build plan lists. The privacy test that refuses "delete my account button" text changes to require the new text instead.
10. **Branch and commits:** `feat/mobile-account` off `main`. Small commits that each build: schema and migration with pgTAP; command, route and its tests; web section; mobile sign up; mobile account and delete screens; legal text; scope tick.
11. **Deploy order:** the migration goes to production with `supabase db push` before the PR merges (root AGENTS.md, Production), and only once you approve that step.

## Expected files

- `supabase/schemas/05-functions.sql`, `supabase/migrations/<ts>_delete_own_account.sql`, `supabase/tests/200-delete-own-account.test.sql` (replaces the proof), `supabase/tests/140-security-sweep.test.sql`.
- `packages/core/src/api/v1/account.ts` (+ test), `packages/core/src/auth/messages.ts`, `packages/core/src/legal/operator.ts`.
- `apps/web/lib/auth/commands/account.ts` (+ test), `apps/web/app/api/v1/me/account/delete/route.ts` (+ test), `apps/web/app/account/{actions.ts,page.tsx,delete-account-form.tsx}` (+ tests), `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx` and their tests, `apps/web/app/api/v1/routes.test.ts` (the route list).
- `apps/mobile/src/app/sign-up.tsx`, `apps/mobile/src/app/_layout.tsx` (register the modal), `apps/mobile/src/app/sign-in.tsx` (the link), `apps/mobile/src/app/(tabs)/(index,search,library,account)/account.tsx` and `account/delete.tsx`, `apps/mobile/src/screens/account-screen.tsx`, `apps/mobile/src/lib/account.ts` (profile and delete calls, keys under `"me"`), tests in `apps/mobile/src/__tests__/`.
- `docs/scope/scope.md`: split the 5d line into 5d1 and 5d2 and tick 5d1. `supabase/AGENTS.md` and `apps/mobile/AGENTS.md` changes go through `/sync`.

## Requirements

- Every state: loading, error with Retry, signed out; 44 point touch targets; VoiceOver labels; the delete button reports disabled and busy state (section 3).
- No false success: the account screen shows a saved username or a deletion only after the server confirms it (section 11).
- Copy comes from core so both apps match.

## Security considerations

- The function takes no input; its whole effect is `auth.uid()`, from the caller's verified JWT. `anon` cannot execute it. No service role key anywhere (`security-boundary.test.ts`).
- The route is bearer only, the action rechecks the session; neither takes a user ID from the client.
- After deletion, an old access token may still verify for up to an hour, but every write fails on the foreign key and every read returns nothing (child 0035, Security model).
- Sign up keeps the password between the phone and Supabase; BeStats' server never sees it.
- Deletion wipes every `"me"` query on the phone. The persisted cache does not exist yet; 5d2 adds it and wipes it on the same path.
- Logs: the route logs the outcome only, never the user's email.

## Acceptance criteria

- On the phone: create an account, see your username on the Account tab, change it, delete the account by typing `DELETE`; afterwards you are signed out, the library tab is empty and signed out, and signing in with the old password fails.
- On the web (local): the same deletion from `/account`.
- A failed deletion (server down) shows an error and keeps you signed in.
- pgTAP: the cascade removes every row of the caller in all five tables and none of anyone else's; `anon` gets a permission error; the sweep test names the exception.
- `/privacy` and `/terms` describe self serve deletion and the app, with the new `LEGAL_LAST_UPDATED`.

## Automated checks

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- `pnpm test:db` after `supabase db reset` (local stack via OrbStack).
- `pnpm api:local` cross user check, extended with: user B's token on `POST /me/account/delete` deletes only B.

## Manual test steps

1. Start the local stack (`orb start`, `pnpm exec supabase start`), `pnpm dev:docker`, then `npx expo start --dev-client` in `apps/mobile` and open the iOS Simulator build.
2. Account tab signed out: tap Create account, sign up with a new username, email and password. You land signed in, the Account tab shows your username.
3. Change the username, save, see the weekly lock line.
4. Mark a movie watched, then Account, Delete account. Type `delete` (lowercase): the button stays disabled. Type `DELETE`, delete. You see the toast, you are signed out, the Library tab asks you to sign in.
5. Try to sign in with the deleted account: it fails.
6. Stop the web server, sign in with another account, try to delete: an error shows and you stay signed in.
7. On the web at `http://localhost:3000/account`, repeat the deletion with a fresh account.
8. Open `/privacy` and `/terms` locally and read the new deletion and app text.
