# apps/mobile

The BeStats iOS and Android app (`@bestats/mobile`): Expo SDK 58, Expo Router, NativeWind v5 and TanStack Query. It shares its rules with the web through `@bestats/core` and reads the catalog and the user's state only through `/api/v1` on the web project. Governed by spec [0033](../../docs/specs/0033-mobile-app-expo/index.md) (children 0035 and 0036); the root `AGENTS.md` sections 1 to 14 apply here too.

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Run these from `apps/mobile` (the repo uses pnpm; lint is Biome from the repo root, never `expo lint` or ESLint):

```bash
npx expo install <package>  # ALWAYS use instead of pnpm add for runtime deps: resolves SDK-compatible versions
npx expo start --dev-client # Metro for the development build
pnpm typecheck              # tsc --noEmit
pnpm test                   # jest-expo + React Native Testing Library v14
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

From the repo root, `pnpm typecheck`, `pnpm test` and `pnpm lint` cover this app too. Run them before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `npx eas-cli@latest <command>`; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

- The EAS project is `@kris1027dev/bestats` (`extra.eas.projectId` in `app.json`); bundle and package ID `com.kris1027.bestats`, which can never change after the first store upload.
- `eas.json` profiles: `development` (device dev client), `development-simulator` (iOS Simulator, needs no Apple developer account), `production`.
- A development build loads its JavaScript from Metro on your Mac, so it reads `.env.local`; a store build needs the `EXPO_PUBLIC_*` values set in EAS.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Files

- `src/app/`: screens only (`_layout.tsx`, `index.tsx`, `sign-in.tsx`, `movies/[id].tsx`). Route paths mirror the web's (`/movies/[id]`, later `/shows/...`, `/games/...` and the library routes from core).
- `src/lib/env.ts`: `getPublicEnv()`, the only reader of `process.env.EXPO_PUBLIC_*` (literal property access, validated lazily). Values are public by design; no secret ever takes an `EXPO_PUBLIC_` name (`security-boundary.test.ts`).
- `src/lib/supabase.ts` and `session-storage.ts`: the one Supabase client, its session AES encrypted in AsyncStorage with the key in `expo-secure-store`; `AppState` starts and stops auto refresh. `getAccessToken()` is the token source. `refreshSession()` runs only in `refreshAfterUnauthorized()`, after a server 401, single flight and skipped when another call already rotated the token; never call it anywhere else (rotating refresh tokens can race and sign the user out).
- `src/lib/session.tsx`: `SessionProvider` and `useSession()`. Sign out and an expired session call `clearPrivateQueries()` (`src/lib/query-client.ts`): every `"me"` query and every mutation go, public catalog queries stay. Never `queryClient.clear()`: it cancels the reload of a query an open screen observes and leaves that screen spinning.
- `src/lib/api.ts`: `apiRequest()`, the only caller of `/api/v1`. It sends `X-BeStats-App-Version` from `app.json`'s `version`, parses every answer with its core schema, retries a `me` call once after a 401, then signs out with a visible notice. Errors are `ApiError` carrying the v1 code and `reason`.
- `src/lib/movies.ts`: query keys and the movie calls. Private keys start with `"me"` so they can be cleared together.
- `src/theme/token-vars.ts` and `src/global.css`: colour tokens (see Styling).

## BeStats rules

- The phone never holds a catalog key and never runs a rule the server owns: the release gate, library placement and every write go through `/api/v1`. Pure rules come from `@bestats/core`, never a copy (spec 0033, shared contracts).
- The UI only shows the server's confirmed state or an optimistic one it reverts with the error message; never a false success (root section 11). A screen covers loading, error with Retry, empty, missing image and signed out states.
- Copy comes from core's message files (`tracking/messages.ts`, `auth/messages.ts`) so both apps say the same thing.
- The query cache is in memory only until the persisted offline cache lands (spec 0033 step 5, AC-13); when it does, it must be wiped on every sign out.

## Styling

- NativeWind `5.0.0-rc.1` with `react-native-css` `3.1.0-rc.1`, pinned exactly, with this app's own Tailwind `4.1.12`, `@tailwindcss/postcss` `4.1.12` and `lightningcss` `1.30.1` as NativeWind's setup asks. The web keeps its own Tailwind; don't unify them. rc.1 was tested by NativeWind on Expo 57; it runs on our Expo 58 (checked in the simulator), but recheck on every SDK or RC bump. Uniwind is the spec's named fallback.
- No colour literal here (`design-tokens-boundary.test.ts`). `global.css` names each colour token as `--color-x: var(--bs-color-x)`, and `TOKEN_VARS` supplies the values from `@bestats/core/tokens.generated` through `VariableContextProvider` in the root layout. After `pnpm tokens` adds a colour, add its line to `global.css` (`token-vars.test.ts` fails until you do). oklch tokens are left out, since React Native cannot draw them.
- Metro rewrites `tsconfig.json` to include `nativewind-env.d.ts` on start; keep that change.

## Tests

- Jest with the `jest-expo` preset and React Native Testing Library v14 (always `await render(...)`), set up in `jest.setup.ts` (native module stand ins such as AsyncStorage). Screens render through `renderRouter` from `expo-router/testing-library`.
- `jest.mock` factories may only reference variables named `mock…`.
- TypeScript 6 loads no global types by default, so `tsconfig.json` lists `jest` and `node` in `types`.

## Agent skills

- [expo-router](../../.agents/skills/expo-router/): `expo/skills`, routes, stacks, links, tabs and sheets.
- [expo-dev-client](../../.agents/skills/expo-dev-client/): `expo/skills`, development builds locally and on EAS.
- [expo-design-system](../../.agents/skills/expo-design-system/): `expo/skills`, theme tokens and component structure.
- [eas-app-stores](../../.agents/skills/eas-app-stores/): `expo/skills`, store builds, signing and submission.
- [eas-update](../../.agents/skills/eas-update/): `expo/skills`, over the air updates, channels and runtime versions.
- [expo-upgrade](../../.agents/skills/expo-upgrade/): `expo/skills`, SDK upgrades and dependency fixes.
- [vercel-react-native-skills](../../.agents/skills/vercel-react-native-skills/): `vercel-labs/agent-skills`, React Native and Expo performance practices.
- [react-native-best-practices](../../.agents/skills/react-native-best-practices/): `callstackincubator/agent-skills`, FPS, TTI, bundle size and re-renders.
- [tanstack-query](../../.agents/skills/tanstack-query/): `tanstack-skills/tanstack-skills`, queries, mutations and caching.
- [react-native-testing](../../.agents/skills/react-native-testing/): `callstack/react-native-testing-library`, RNTL v14 tests.
- [debug-nw](../../.agents/skills/debug-nw/): `nativewind/nativewind`, debugging a NativeWind v5 RC setup (dependencies, Metro, PostCSS, CSS, runtime).
- [nativewind-preview-to-rc](../../.agents/skills/nativewind-preview-to-rc/): `nativewind/nativewind`, moving between NativeWind v5 preview and RC releases.
- MCP servers: Expo MCP `https://mcp.expo.dev/mcp` (recommended; live EAS builds and Expo docs)

_Drafted by /sync from the introducing change, worth a quick human pass._
