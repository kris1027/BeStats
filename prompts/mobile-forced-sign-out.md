# Mobile: a refused local sign out leaves the app signed in

## Goal

Fix the second bug found in the simulator recheck of prompts/mobile-sign-out-spinner.md. When the session expires and its refresh token is revoked, the app shows "Your session expired, sign in again." but stays signed in:

- Home still reads "Signed in as …".
- The movie screen keeps its tracking pill instead of "Sign in to track".

An expired session must always end in a signed-out app with the notice, and must never leave private state behind (AGENTS.md section 11; spec 0033, AC-13; child 0036).

## Inspected code

- `apps/mobile/src/lib/session.tsx`:
  - The expired-session handler runs `supabase.auth.signOut({ scope: "local" }).catch(() => {})`.
  - It relies on the `SIGNED_OUT` event to set the session to null.
  - The user-chosen `signOut()` falls back to a local sign-out only in `.catch`.
- supabase-js 2.116.0, `GoTrueClient._signOut`:
  - It first loads the session through `_useSession`. If that load returns an error other than "session missing" (here the failed refresh of an expired, revoked session), it returns `{ error }` straight away, so `_removeSession()` never runs and no `SIGNED_OUT` event fires.
  - `signOut` returns its error instead of throwing, so neither `.catch` in our code ever runs.
- `__loadSession` in the same version keeps a session in storage when a refresh fails while the access token is still valid. When the refresh succeeds or fails depends on the auto-refresh timer. That's why the first simulator run did reach the sign-in screen and the second didn't.
- `createClient`'s `auth.storageKey` is a public option (`lib/types.d.ts`). The library reads the session from storage under that key on every `getSession()`.
- `apps/mobile/src/lib/session-storage.ts`: `removeItem(key)` deletes both the encrypted blob (AsyncStorage) and its key (SecureStore).
- `apps/mobile/src/app/movies/[id].tsx`: the watched mutation's `onError` calls `setQueryData(previous)` to roll back. After a sign-out wipe, that recreates the private `"me"` query.

## Skills used

`supabase` (auth-js sign-out and session storage behaviour), `tanstack-query`, `react-native-testing`.

## Decisions

1. **One forced local sign-out, owned by `supabase.ts`.**
   - A new `signOutLocally()` calls `auth.signOut({ scope: "local" })`.
   - If that returns an error or throws, it removes the stored session itself with `encryptedSessionStorage.removeItem(SESSION_STORAGE_KEY)`.
   - `SESSION_STORAGE_KEY` is a new explicit `auth.storageKey` ("bestats-auth") passed to `createClient`, so the key is ours and not a library internal.
   - The function never throws.
   - This is a deliberate local deletion, not a refresh, so the rule against calling `refreshSession()` elsewhere is untouched.
2. **The provider never waits on the library's event.**
   - The expired-session handler calls `signOutLocally()`, then sets the session to null itself, wipes the private cache and sets the notice. The `SIGNED_OUT` listener stays for every other source, such as a refresh failing in the background.
   - The user-chosen `signOut()` tries a global sign-out and falls back to `signOutLocally()` when that returns an error, not only when it throws. It then sets the session to null and wipes the private cache the same way.
3. **No private state comes back after the wipe.** The watched mutation's `onError` skips the rollback when the error is `unauthenticated`, since the wipe already removed that state. Every other error still rolls back, as today.
4. **Existing local sessions sign out once.** Changing the storage key signs out every session already stored under the old default key. No store build exists yet, so this only affects development and simulator installs.

## Expected files

- `apps/mobile/src/lib/supabase.ts` (+ `supabase.test.ts` cases).
- `apps/mobile/src/lib/session.tsx`, plus a new `session.test.tsx`.
- `apps/mobile/src/app/movies/[id].tsx` and `src/__tests__/movie-screen.test.tsx`.
- `apps/mobile/AGENTS.md`: the forced sign-out and storage key line.
- `docs/specs/0033-mobile-app-expo/0036-mobile-auth-account-deletion.md`: one line saying a refused local sign-out is forced by removing the stored session.

## Requirements and acceptance criteria

1. **`signOutLocally()` falls back to removing the stored session.** If `auth.signOut` returns an error or throws, it removes the session stored under `SESSION_STORAGE_KEY`. If it succeeds, nothing extra is removed (unit tests).
2. **The expired-session handler always ends signed out.** Even when the local sign-out is refused, the provider exposes `session: null`, the notice "Your session expired, sign in again.", and an empty private cache (provider test).
3. **A user-chosen sign-out always ends signed out.** When the global sign-out returns an error, the provider falls back to a local one and still ends with `session: null` (provider test).
4. **No private state after an unauthenticated write.** After a write fails as `unauthenticated`, no `"me"` query is left in the cache, and the screen shows "Sign in to track" (movie-screen test).
5. **Other errors still roll back.** A write that fails for any other reason still puts the pill back (existing test).

## Security considerations

- The forced path deletes both the encrypted session blob and its Keychain or Keystore key. It never logs or reads a token.
- The app ends signed out even when the server could not be reached to revoke anything. That's the safe direction: the user just signs in again.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`. No web or database change.

## Manual test steps

1. Run `pnpm dev:docker`, then `npx expo start --dev-client` in `apps/mobile`.
2. In the iOS Simulator, sign in as the seed user and open movie 603. The first launch after this change starts signed out, because the storage key is new.
3. Revoke the user's sessions (`POST /auth/v1/logout?scope=global` on the local stack) and wait about 10 minutes for the token to expire.
4. Tap Watched. Expect "Your session expired, sign in again.", and the pill area shows "Sign in to track".
5. Go back. Home redirects to Sign in with the same notice.
6. Kill and reopen the app. It stays signed out.
