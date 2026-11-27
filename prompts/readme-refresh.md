# Plan: a README with the BeStats logo and a livelier first screen

## Goal

The README opens with a plain `# BeStats` heading and reads like a manual from the first line. Open it with the brand lockup from the app's launch animation (the three bars and "BeStats") and a first screen that shows what the app is, while the developer sections keep their content.

## Inspected code

- `README.md`: 199 lines; heading, Checks badge, intro, paused-website blockquote, "What it does" bullets, 8-image screenshot gallery (`docs/screenshots/mobile-*.jpg`), development status, local setup, commands, deployment, repository map, working on BeStats, credits, license.
- `packages/core/src/brand/mark.ts`: `LAUNCH_BARS` (design px 7 wide, 4 gap, heights 12/20/30, radius 2) and `LAUNCH_WORDMARK` (34 px bold, -1 letter spacing, 10 px gap between bars and "Be").
- `apps/mobile/src/components/launch-overlay.tsx`: the final frame is the bars plus "Be" + "Stats" as one word, bottom aligned so the word's baseline sits on the bars' bottom edge, all in `color-brand-mark` on `color-background`.
- `apps/web/app/globals.css`: `--color-brand-mark: #ffffff`, `--background: #000000`.
- `apps/mobile/assets/fonts/Inter_700Bold.ttf` (OFL, `OFL.txt` beside it).

## Skills

`mattpocock-skills:grill-me` (decisions below). No framework docs apply: GitHub Markdown only (`<picture>` with `prefers-color-scheme`, `> [!NOTE]` alerts, Mermaid, `<details>`).

## Decisions (agreed 2026-11-27)

1. The logo is a static, hand-built SVG of the launch animation's final frame, from the numbers in `mark.ts`, committed in `docs/brand/`. No generator script.
2. Two files: white on transparent for GitHub's dark theme and black on transparent for the light theme, switched by `<picture>` with `prefers-color-scheme`.
3. "BeStats" is outlined to vector paths in Inter Bold (bundled, OFL), so every viewer sees the same glyphs. No live text, no SF Pro.
4. The logo replaces `# BeStats` as `<h1 align="center">` with `alt="BeStats"`, about 280 px wide.
5. Branch `feat/readme-logo`, small `docs:` commits, PR with the `docs` label, assignee kris1027, BeStats project status In review.
6. Restructure: the top half becomes a showcase, the developer sections keep their content with light tidying.
7. Centred tagline under the logo: "Track every show, movie and game you watch and play: episodes, ratings and what's next."
8. A centred badge row: Checks plus shields.io `flat-square` badges for Next.js 16, Expo, Supabase, TypeScript and Platform: iOS.
9. Under the tagline, a centred row of 3 existing screenshots: Shows Up next, Show page, Game page. The full 8-image gallery stays lower down.
10. "What it does" becomes a 3-column Shows | Movies | Games table, with the shared features (catalog, search, library, separate ratings) as a short list under it.
11. No emoji.
12. The paused-website notice becomes a two-line `> [!NOTE]`; its Netlify and Vercel details move to Deployment.
13. A Mermaid diagram under "How it fits together", before Local setup: mobile app to `/api/v1` (Next.js on Netlify), web pages, TMDB, IGDB, Supabase.
14. The three ways to run the mobile app fold into `<details>`; the commands table stays open.

## Expected files

- `docs/brand/bestats-logo-dark.svg` (white, for dark theme), `docs/brand/bestats-logo-light.svg` (black, for light theme).
- `README.md`.
- `prompts/readme-refresh.md` (this plan).

The outlines are made once with a throwaway script in the scratchpad (opentype.js or fontTools reading `Inter_700Bold.ttf`); the script is not committed.

## Requirements

- Bars, gap, heights, radii, bar-to-word gap and letter spacing follow `mark.ts` exactly (scaled uniformly); the word's baseline sits on the bars' bottom edge.
- Every fact in the README stays true and nothing is invented: no store link, no Android claim, no Google sign in claim.
- Screenshot alt texts stay descriptive; the logo has `alt="BeStats"`.
- Links in the README still resolve.
- Legal facts are unchanged (license, credits, TMDB/IGDB mentions); the hash-checked logos in `apps/web/public/` are untouched.

## Security

None: documentation only. shields.io badges carry only public names, no private data.

## Acceptance criteria

- On github.com, in light and dark themes, the README opens with the logo (dark marks on light, light marks on dark), tagline, badges and 3 screenshots, all centred.
- The logo matches the launch animation's final frame in proportions.
- The NOTE alert, the feature table and the Mermaid diagram render; the mobile run options are collapsed.
- All the developer content from before is still present.

## Automated checks

`pnpm lint`, `pnpm typecheck`, `pnpm test` (the legal boundary test reads repo files).

## Manual test steps

1. Open both SVGs in a browser on white and black backgrounds and compare with a simulator screenshot of the launch frame.
2. Render the README with GitHub's Markdown API (`gh api markdown`) or view the pushed branch on github.com in light and dark themes.
3. Check every relative link and image path in the README exists.
