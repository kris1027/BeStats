# Mobile look, slice 7: Account, auth and About

## Goal

The last slice of feature 29. The Account tab, the four auth modals and About take the web's look, and the one missing web feature on these screens comes back: Change password. You get the web's auth form content (a heading and a line under it, taller glass fields with a rim, a Show password eye, errors under the field they belong to) inside the native modals you already have, an Account tab with the large title and real glass panels, a restyled Delete account screen, a new Change password screen, and the icon key plus the `kris1027` credit on About. Feature 29, slice 7 in [docs/scope/scope.md](../docs/scope/scope.md); the feature's decisions are in [prompts/mobile-web-parity-foundation.md](mobile-web-parity-foundation.md) (Roadmap item 6). It also closes the Deferred item "Change password on the phone".

## Inspected

- `apps/mobile/src/screens/account-screen.tsx`: its `Panel` is still the old look (`border border-border bg-glass-plate-panel`, no rim, no sheen), the header panel repeats "Account" under a native "Account" title, and the username field uses `INPUT_CLASS` directly. No Change password.
- `apps/mobile/src/screens/delete-account-screen.tsx`: plain warning text, a `FormField`, the destructive `GlassButton`; Back locked while the call runs.
- `apps/mobile/src/screens/about-screen.tsx`: the same old `Panel`; version, TMDB and IGDB panels, Privacy and Terms rows. No icon key, no credit.
- `apps/mobile/src/components/form-field.tsx`: label, children, hint; `INPUT_CLASS` is 44pt with a flat border. The foundation left it "at its height until slice 7".
- `apps/mobile/src/app/sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`, `reset-password/app.tsx`: fields with no visibility toggle, one form level `Notice` for every error, no heading or description.
- `apps/mobile/src/app/_layout.tsx` (the four modals) and `(tabs)/(index,search,library,account)/_layout.tsx` (`account`, `account/delete`, `account/about`; `tabScreenLayout`).
- `apps/mobile/src/components/glass/plate.tsx` (`GlassPlate`, roles, rim, shadow), `chevron-row.tsx`, `notice.tsx`, `centered-state.tsx`, `icons/index.ts`, `theme/stack-options.tsx` (`largeTitleScreenOptions`).
- `apps/mobile/src/lib/supabase.ts` (the one persisting client), `lib/auth-errors.ts` (core's `classifyAuthFailure`), `lib/session.tsx`.
- Web: `components/auth/auth-field.tsx` (56px `glass glass-rim` input, eye toggle with Show and Hide password, hint and error bound to the field), `auth-panel.tsx` and the five auth pages' titles and descriptions, `app/account/change-password-form.tsx` and `changePasswordAction` (current password checked by `signInWithPassword`, then `updateUser`), `components/layout/icon-key.tsx` (eight entries), `site-footer.tsx` (the credit line).
- Core: `auth/action-state.ts` (`AuthActionState`, `failure`, `fromZodError`, `passwordFieldFor`), `auth/schemas.ts` (`changePasswordSchema`, `PASSWORD_HINT`), `auth/identity.ts` (`hasPasswordIdentity`), `legal/operator.ts` (`OPERATOR_HANDLE`, `OPERATOR_GITHUB_URL`).
- Tests: `__tests__/account-screens.test.tsx`, `__tests__/password-reset.test.tsx`, `screens/about-screen.test.tsx`.

## Skills used

`supabase` (a second, non persisting supabase-js client for the current password check, `signOut({ scope: "local" })`, `updateUser`), `expo-router` (the pushed screen, large title), `expo-design-system` (reuse `GlassPlate`, no new tokens), `react-native-testing` (RNTL v14). Before writing the client code, read the supabase-js docs for `signInWithPassword`, `signOut` scopes and `updateUser`; before the header code, the SDK 58 docs for `headerLargeTitle`, as `apps/mobile/AGENTS.md` asks.

## Decisions

1. **Change password checks the current password on a throwaway client** (your call, 2026-11-24). `lib/password.ts` reads your email from the app's session, creates a second supabase-js client with `persistSession: false`, `autoRefreshToken: false` and its own `storageKey`, and calls `signInWithPassword` with your current password on it. That client is then signed out with `scope: "local"`, which revokes only the session it just made, and thrown away. Only then does the app's own client call `updateUser({ password })`. So your session is never replaced (the reason it was deferred in 5d1), the password goes only to Supabase Auth and never to the BeStats server (as sign in on the phone already does), and guessing the current password shares sign in's rate limit, which is the web's reasoning in `changePasswordAction`. Other sessions are not signed out, the same as the web's change.
2. **Errors read as on the web.** Results use core's `AuthActionState`: `changePasswordSchema` failures through `fromZodError` (one message per field, before any request); a credentials refusal on the check marks Current password with "Your current password is not correct."; a rate limit or outage stays a form level message and marks no field; an `updateUser` refusal goes through `passwordFieldFor`. Success shows the web's "Your password has been changed." as a toast.
3. **Change password is a pushed screen** (your call, 2026-11-24): `/account/password`, opened by a "Change password" `ChevronRow` above Delete account. The row shows only when `hasPasswordIdentity(session.user.identities)` is true, so an account with no password never sees a control that cannot work (spec 0005, AC-16). The screen has three fields (Current password, New password with the `PASSWORD_HINT` hint, Confirm new password) and a Change password button. While it saves, the screen ignores Back, like Delete account. On success it clears the fields, goes back to Account and shows the toast. A missing session shows the signed out panel.
4. **One field component, the web's `AuthField`.** `FormField` renders its own `TextInput` and takes its props: 56pt tall on a `GlassPlate` control plate with the rim (the web's `h-14 glass glass-rim rounded-2xl`), label above, hint under it, the error under that in the destructive colour and announced. `secure` adds the eye button (44pt, "Show password" and "Hide password", pressed state for screen readers) that swaps `secureTextEntry`. `INPUT_CLASS` goes once nothing uses it. Every form in the app uses it: the four modals, Change password, Delete account and the username field.
5. **The auth modals keep their native header and get the web's content.** Under the header title, each modal shows the web panel's heading and line ("Welcome back" and "Sign in to keep track of what you watch.", "Create an account", "Forgot password", "Set a new password"), then the fields. No card around them: the modal is already the surface, and a card inside a sheet would stack two. Errors that belong to a field show under it; the rest stay in the form level `Notice`. All four sit in a `ScrollView` so the largest text size and the keyboard never hide the button.
6. **Copy moves to core, the web reads it.** The five auth panel titles and descriptions (`AUTH_PANEL_COPY`), the change password copy (`CHANGE_PASSWORD_COPY`: heading, field labels, the success line), the icon key labels (`ICON_KEY_LABELS`, in the web's order) and the credit line's words (`CREDIT_LINE_PREFIX` in `legal/operator.ts`, beside `OPERATOR_HANDLE`) move to core, and the web's pages, `ChangePasswordForm`, `IconKey` and `SiteFooter` read them. The web looks exactly the same.
7. **Account takes the large title** (`largeTitleScreenOptions("Account")`, the Search and Library header) and joins the bare list in `tabScreenLayout(["search", "library", "account"])`. Every Account state (loading, signed out, failed, signed in) sits in a `ScrollView` with `contentInsetAdjustmentBehavior="automatic"`, so nothing hides under the bar. The repeated "Account" heading in the header panel goes.
8. **Real glass panels.** Account's and About's `Panel` become one shared `GlassPanel` (`GlassPlate plate="panel"`, `radius-panel`, rim, shadow), the web's `PANEL`. Delete account puts the warning on that panel with a `TriangleAlertIcon` and the heading in the destructive colour, the web's Delete section, with the field and button below.
9. **About gets the icon key and the credit.** After the version panel, an "Icon key" panel lists the eight marks with the app's own icons (the amber and cyan stars, Plan, Planned, Mark watched, Watched, Next episode, Release date), icons hidden from screen readers and each entry read by its label. Below the legal rows, the line "© BeStats · Crafted with love by kris1027", with `kris1027` a link to `OPERATOR_GITHUB_URL` with a 44pt tap area (the web's 36px exception is not needed on a phone).

## Assumptions

- supabase-js allows a second client with persistence off and a different `storageKey` beside the app's client without either touching the other's session or auth events. The Change password test asserts the app's client never calls `signInWithPassword`, and the simulator pass checks the app stays signed in.
- Stored sessions carry `user.identities` (supabase-js returns them on sign in and keeps them on refresh). If one ever lacks them, the row stays hidden rather than showing a broken form, and the web still offers the change.

## Expected files

New:
- `apps/mobile/src/lib/password.ts` (`changePassword`) and `password.test.ts`.
- `apps/mobile/src/screens/change-password-screen.tsx`, `apps/mobile/src/app/(tabs)/(index,search,library,account)/account/password.tsx`.
- `apps/mobile/src/components/glass-panel.tsx` (`GlassPanel`), `apps/mobile/src/components/icon-key.tsx`.
- `apps/mobile/src/components/form-field.test.tsx`, `apps/mobile/src/__tests__/change-password.test.tsx`.

Changed:
- `apps/mobile/src/components/form-field.tsx`; `app/sign-in.tsx`, `sign-up.tsx`, `forgot-password.tsx`, `reset-password/app.tsx`; `screens/account-screen.tsx`, `delete-account-screen.tsx`, `about-screen.tsx`; `components/icons/index.ts` (`EyeIcon`, `EyeOffIcon`); `(tabs)/(index,search,library,account)/_layout.tsx`; `theme/stack-options.tsx`.
- Tests: `__tests__/account-screens.test.tsx`, `__tests__/password-reset.test.tsx`, `screens/about-screen.test.tsx`.
- Core: `packages/core/src/auth/messages.ts`, `legal/operator.ts`, a new `packages/core/src/catalog/icon-key.ts` (or beside the card labels), and their tests.
- Web (no visible change): the five `app/(auth)/*/page.tsx`, `app/account/change-password-form.tsx` and `page.tsx`, `components/layout/icon-key.tsx`, `site-footer.tsx`.
- `apps/mobile/AGENTS.md` (the field, Change password, About), `docs/scope/scope.md` (slice 7 ticks, the Deferred item closed).

## Requirements

1. The current password is checked before any change, and a wrong one changes nothing (spec 0005, AC-16). The app's own session is never replaced or signed out by the check; the check's session is revoked right after.
2. No password is logged, stored, sent to the BeStats server or kept in state after success (AGENTS.md section 11).
3. Change password shows only for an account with an email password, and never shows a success the server did not confirm; a missing or expired session says so (section 11).
4. Each field error is shown under its field and read with it by a screen reader; colour never carries it alone. Form level errors stay in the alert `Notice`.
5. Fields and the eye button are at least 44pt; the eye has a label that says what it does and a pressed state; at the largest text size no label or button is clipped and the submit button can be reached by scrolling.
6. Every Account, About and auth screen keeps its loading, signed out, error and empty states, none under the large title.
7. Copy is said once, in core; the web renders exactly as before (its tests pass unchanged apart from where they import the copy from).
8. No colour literal, no new token, no `BlurView` outside `components/glass/`, `Text` and `TextInput` only from `@/components/text` (boundary tests pass). The legal boundary test still finds the credit facts only in core's `operator.ts`.

## Build deviations (2026-11-24)

- **One refusal is said once.** A failure that marks a field (a taken username, a wrong current password) would have shown the same words under the field and again in the form's alert. `FormAlert` leaves the form alert out when a field already says those exact words; Zod's "Check the highlighted fields" summary still shows, as on the web.
- **`INPUT_CLASS` stays** for the filters sheet's platform search, which is a search box in a sheet, not a form field.
- **Forgot password's line** keeps the app's own ending, "Open it on this phone.", after core's description, since the link only works on the phone that asked.
- **The username field's server refusal** now shows under the field; a saved name still shows as an info `Notice`.
- Simulator pass on 2026-11-24 (iPhone 18 Pro, local stack): steps 2 to 10 pass; the full record is slice 7 in docs/scope/scope.md. It found two layout faults, fixed on the branch: the end of About, Change password and Delete account sat under the floating tab bar (now `contentInsetAdjustmentBehavior="automatic"`, as Home and the grids), and a wrapped `ChevronRow` label pushed its chevron into the edge at the largest text size (the label now shrinks). Step 11 (the web unchanged) is covered by the web's tests only; the production website is off.

## Security considerations

- The password check goes straight from the phone to Supabase Auth, as sign in does; no new route, no server code, no new processor. The throwaway client stores nothing (`persistSession: false`) and is signed out with `scope: "local"` in a `finally`, so a failed `updateUser` still revokes the check's session. `scope: "global"` is never used there, as it would end every session including the app's.
- `updateUser` runs as the signed in user with the publishable key under the existing auth settings (`secure_password_change` stays false, as on the web); there is no elevated key.
- Wrong guesses are limited by Supabase's sign in rate limit; the app shows a rate limit as a form level message and never marks the field for it, so a correct password is never called wrong.
- The fields use `autoComplete` and `textContentType` `password` and `newPassword`, so the system password manager can fill and save them.

## Acceptance criteria

- **AC-1**: Signed in with an email password, Account shows the large title, glass panels with a rim, and Change password, Delete account and About rows; signed out, the Sign in panel sits below the title.
- **AC-2**: Change password with a wrong current password marks that field "Your current password is not correct." and changes nothing; with mismatched new passwords it marks Confirm before any request.
- **AC-3**: With the right current password and a valid new one, the toast says "Your password has been changed.", you stay signed in, and signing out and in again works only with the new password.
- **AC-4**: Every auth modal shows the web's heading and line, 56pt glass fields, a working Show and Hide password eye on every password field, and each error under its own field.
- **AC-5**: Delete account shows the warning on a glass panel with the destructive heading and still deletes only after typing DELETE (its existing tests pass).
- **AC-6**: About shows the icon key with eight entries and the credit; tapping `kris1027` opens the GitHub profile.
- **AC-7**: The web's auth pages, `/account`, the footer key and credit look exactly as before.
- **AC-8**: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` and `npx expo-doctor` pass.

## Automated checks

From the repo root: `pnpm typecheck`, `pnpm lint`, `pnpm test` (new: `password.test.ts`, `change-password.test.tsx`, `form-field.test.tsx`; changed: account, password reset and About tests; core copy tests; the web's auth, account, footer and legal boundary tests), `pnpm build` (the web pages now import core copy). From `apps/mobile`: `npx expo-doctor`. No database change, so no `pnpm test:db`.

## Manual test steps

1. `orb start`, then `pnpm exec supabase start`; `pnpm dev:docker` from the repo root; from `apps/mobile`, `npx expo start --dev-client --clear` (move `apps/mobile/.env.development.local` aside for the simulator).
2. Signed out, open Account: a large "Account" title, the Sign in panel below it, Create account and About.
3. Open Sign in: "Welcome back" and its line under the header, tall glass fields. Tap the eye: the password shows and the label reads Hide password. Submit empty: the error sits under the field.
4. Open Create account, Forgot password (if delivery is on): same heading, fields and eye.
5. Sign in with a fresh local account. Account: the large title collapses on scroll, glass panels, and the rows Change password, Delete account, About.
6. Change password: type a wrong current password: the field says it is not correct. Type mismatched new passwords: Confirm says they don't match. Then do it right: the toast, back on Account, still signed in.
7. Sign out, sign in with the old password (refused), then with the new one (works).
8. Delete account: the warning panel with the red heading; the button arms only on DELETE (do not confirm unless you want to lose the account).
9. About: the icon key with its eight entries; tap `kris1027`: Safari opens the GitHub profile.
10. Set Larger Text to the maximum: sign in and Change password scroll to their buttons, nothing clipped.
11. Open the web's `/sign-in`, `/account` and the footer at 375px: unchanged.
