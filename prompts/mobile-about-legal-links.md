# Privacy Policy and Terms of Service links on About

## Goal

About in the iPhone app links to the live `/privacy` and `/terms` pages. PR kris1027/BeStats#89 said they would open an error page, but the "Website off, API on" firewall rule lets both through (checked 2026-11-21: `/` answers 403, `/privacy` and `/terms` 200). Step 6 still owes the privacy text changes (Expo in `PROCESSORS`, `LEGAL_LAST_UPDATED`) and the store labels; this adds only the links.

## Inspected

- `apps/mobile/src/screens/about-screen.tsx`: app name and version panel, TMDB and IGDB panels; `LogoLink` opens a site with `Linking.openURL` (expo-linking).
- `apps/mobile/src/screens/account-screen.tsx`: `AboutRow`, a 44pt panel row with a `›` chevron, shown signed in and out.
- `apps/mobile/src/lib/env.ts` and `src/lib/api.ts`: `EXPO_PUBLIC_API_BASE_URL` is the deployment's origin (`https://bestats-app.vercel.app` in production, the LAN `:3000` in development, both serving `/privacy` and `/terms`).
- `packages/core/src/legal/operator.ts`: `TMDB_HOME_URL`, `IGDB_HOME_URL`, the other legal facts.
- `apps/web/components/layout/site-footer.tsx`: the web labels, "Privacy Policy" and "Terms of Service".
- `docs/deploy.md` section 5: the firewall rule's allow list and its check line.

## Skills used

None beyond the repo rules: no schema, route or Supabase change.

## Decisions and assumptions (agreed in the grilling round, 2026-11-21)

1. **Now, on `feat/mobile-offline-about`** (PR #89), as one small commit. Not pushed until you say so.
2. **URL = `EXPO_PUBLIC_API_BASE_URL` + path.** The paths are new core constants `PRIVACY_PATH = "/privacy"` and `TERMS_PATH = "/terms"` in `legal/operator.ts`, beside the home URLs. No new env var. This assumes the API and the website share one origin, which the JSDoc says.
3. **`Linking.openURL`** to Safari, like the logos. No `expo-web-browser`, no new native code, no rebuild.
4. **Two rows below the TMDB and IGDB panels**, "Privacy Policy" and "Terms of Service" (the web footer's labels), styled like `AboutRow` (panel row, 44pt, `›`), `accessibilityRole="link"` with a hint naming the page. About is public, so they show signed in and out.
5. **Guard in docs.** `docs/deploy.md` section 5 gains a line: the app's About (and later the store listings) links to `/privacy` and `/terms`, so the firewall rule must keep both. A test can't see the firewall.
6. **PR #89 description.** The 403 bullet becomes "About links to /privacy and /terms (both reachable through the firewall)", and the About bullet under What changed mentions the links.
7. The web footer keeps its own `href="/privacy"` literals; moving it onto the core constants would be an unasked refactor.

## Expected files

- `packages/core/src/legal/operator.ts`: `PRIVACY_PATH`, `TERMS_PATH` with JSDoc.
- `apps/mobile/src/screens/about-screen.tsx`: a `LegalLink` row component and the two rows. JSDoc updated.
- `apps/mobile/src/screens/about-screen.test.tsx`: both rows render. Pressing each calls `Linking.openURL` with the API base URL plus its path.
- `docs/deploy.md`: one line in section 5.
- `prompts/mobile-about-legal-links.md`: this plan.

## Requirements

- Signed in or out, About shows "Privacy Policy" and "Terms of Service" below the attribution panels. Each is a 44pt link that opens `${EXPO_PUBLIC_API_BASE_URL}/privacy` or `/terms` in Safari.
- No new dependency, no native change, no web change.

## Security considerations

The URL is built only from the app's own public config and fixed paths, so there's no user input in it. Nothing private is sent: Safari loads a public page.

## Acceptance criteria

- The About test finds both links by role and name, and asserts the exact URLs passed to `openURL`.
- On the simulator, tapping each row opens the page in Safari (against the local `:3000` in development).

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`. No `pnpm build`: no web route, config or server code changes.

## Manual test

1. With Metro and `pnpm dev:docker` running, open Account → About on the simulator.
2. Below the IGDB panel, see "Privacy Policy" and "Terms of Service" rows with chevrons.
3. Tap "Privacy Policy": Safari opens `http://192.168.33.19:3000/privacy` and shows the Privacy Policy. Go back, then tap "Terms of Service": the terms page opens.
4. In production builds the same rows open `https://bestats-app.vercel.app/privacy` and `/terms`, which answer 200 today (`curl -s -o /dev/null -w "%{http_code}" https://bestats-app.vercel.app/privacy`).
