# Warm page background

## Goal

Replace the page background behind every route with the fixed background layer from the Claude Design file `Home Page Parallax.dc.html` (project `14e58cb9-d0fc-4943-a8d2-59c5ad7d226c`). That layer is a warm red to near black gradient, three large soft blobs that drift, diagonal pinstripes, a dark wash, a vignette and a film grain. It moves with time, scroll and the mouse. The teal WebGL film strip scene (prompts/film-strip-background.md) is removed entirely. Nothing else on any page changes.

## Inspected

- **Design file.** The background is the first `position:fixed; inset:0` child of the root. Its layers, in paint order:
  1. `data-page-bg`: `linear-gradient(165deg, oklch(0.30 0.12 22) 0%, oklch(0.16 0.05 20) 45%, oklch(0.10 0.01 40) 100%)`. It is 140% tall from `top:-10%`.
  2. Three `data-blob` circles, each a radial gradient to transparent at 65%:
     - Red: `oklch(0.45 0.18 25 / .60)`, 70vw, at `-15vw, -20vh`, blur 20px.
     - Amber: `oklch(0.78 0.14 75 / .30)`, 65vw, at `right -20vw, 20vh`, blur 24px.
     - Deep red: `oklch(0.32 0.13 18 / .60)`, 80vw, at `10vw, 60vh`, blur 28px.
  3. `data-stripes`: `repeating-linear-gradient(135deg, rgba(255,255,255,.045) 0 2px, transparent 2px 14px)`, with an 80px bleed.
  4. A wash of `rgba(11,8,7,.42)`.
  5. A vignette: `radial-gradient(120% 90% at 50% 40%, transparent 45%, rgba(5,3,2,.75) 100%)`.
  6. Grain: an SVG `feTurbulence` tile at `opacity:.07; mix-blend-mode:overlay`, `inset:-50%`.
  7. Two `data-depth` layers (0.12, 0.35) of amber glows `rgba(220,150,70,.10–.12)` blur 30–40px and orbs `rgba(245,200,130,.12–.16)`, placed at 120–520vh.

  Motion, in `tick()`:
  - Page gradient: `translate(-mx*10, -(scroll/docMax)*vh*0.3)`.
  - Each blob: `dx = sin(t*.13+ph)*60 - mx*d*200`, `dy = cos(t*.11+ph)*50 - (scroll/docMax)*vh*d*2.5 - my*d*120`, `scale(1 + sin(t*.09+i)*.06)`, with `d` 0.05, 0.12, 0.2 and `ph` 0, 2, 4.
  - Stripes: offset modulo their 19.799px period, so they never run out.
  - The pointer is eased at 0.06 per frame, and reduced motion zeroes everything.
- **`support.js`** is the design tool's runtime only. There is nothing to port.
- **`components/layout/page-background.tsx`**: a fixed `-z-10`, `h-lvh`, `aria-hidden` Server Component with `page-gradient`, `PageBackgroundCanvas` and `page-vignette`.
- **`components/layout/page-background-canvas.tsx`** (+ test): the client island that idles, then imports `lib/film-scene/start.ts`.
- **`lib/film-scene/`**: 23 files (the WebGL2 scene, worker, clock, continuity, budget, palette, shaders and their tests). Only the canvas island and its test import them, and `next.config.ts` has no worker setup for them.
- **`app/globals.css`**:
  - The teal tokens `--color-page-*` (4), `--color-film-*` (6), `--color-light-*` (3) and `--color-bokeh-*` (4).
  - The `page-gradient` and `page-vignette` utilities.
  - `landing-blob` and `landing-orb`, tinted from `--color-bokeh-4` and `--color-bokeh-2`.
- **`components/catalog/catalog-landing.tsx`**: `LandingBlobs` is the design's two depth layers, already moved by `LandingParallax` (`data-depth`).
- **`app/glass-contrast.test.ts`**: assumes the background's brightest pixel is capped at the luminance where `--muted-foreground` keeps 4.5:1 (0.0541). Today the WebGL shader enforces that cap. Nothing does once the scene is gone.
- **`app/showcase/page.tsx`**: the "Page background" section with 17 teal swatches and two previews, one of them `PageBackgroundCanvas still`.
- **`app/layout.tsx`** and **`app/layout.test.ts`**: `<PageBackground />` comes first in `<body>`, and stays there.
- **`components/AGENTS.md`**: lines 19 and 34 describe the teal tokens and the film scene.

## Skills used

- `mattpocock-skills:grilling`, for the decisions below.
- No Next.js cache, Supabase or database skill applies: this is a presentational change in the shell, with no data and no request state.

## Decisions (settled with the owner on 2026-10-18)

1. **Every route.** The new layer is the single site background. `lib/film-scene/`, `PageBackgroundCanvas` and their tests are deleted.
2. **Only the fixed layer.** That's the gradient, blobs, stripes, wash, vignette and grain. The landing's `LandingBlobs` keep their place, markup and motion, retinted to the design's amber. Not taken from the design:
   - its hero placeholder, header gradient or card stripe fills;
   - its warm text colours;
   - its `#0b0807` page colour (`--background` stays `#000`).
3. **Tokens.** The design's colours become background-only tokens in `globals.css`, written in `oklch` exactly as the design has them. All 17 teal tokens are removed. The amber blob is near the TMDB rating amber, but it is a separate background-only token and never carries meaning.
4. **Motion.** All of the design's motion comes across on every route, driven by one small client component.
   - The pointer counts only from a fine pointer (`pointerType === "mouse"`).
   - The loop pauses with the tab, because rAF stops in a hidden tab.
   - Under reduced motion it does not run and every node is reset.
   - The static layer is server HTML and is the first paint.
5. **Performance over pixel fidelity.** The blobs' `filter: blur()` is replaced by a radial gradient with a softer falloff that looks the same, so no large filtered layer is repainted under the frosted plates. The grain stays unless profiling shows it costs frames while scrolling, in which case it is dropped and that is reported.
6. **Contrast wins.** The background's brightest possible pixel must keep `--muted-foreground` at 4.5:1. A new test replaces the shader cap. If the design's values fail it, the wash is darkened first and the glow and orb alphas lowered second, keeping every hue.
7. **Process.** Same branch (`feat/home-parallax-landing`), this plan first, then small commits.

### Contrast, measured before building

Composited in sRGB from the design's values, at the worst point: the gradient's top stop, with the red and amber blobs both at their centres, plus stripes and wash.

| Stack | Luminance | Muted text ratio |
|---|---|---|
| Gradient + stripes + wash | 0.0130 | 7.44 |
| + red blob | 0.0226 | 6.45 |
| + amber blob | 0.0346 | 5.54 |
| + red and amber blobs | 0.0440 | 4.99 |
| + both blobs, a glow `.12` and an orb `.16` | 0.1073 | **2.98** |

The design's blobs pass on their own. Its glows and orbs fail wherever one drifts over the two brightest blobs. The test assumes that worst overlap, because the two depth layers move at different speeds and do cross.

The starting values I'll build with:

- **Wash `.60`**, darker than the design's `.42`.
- **Glow `.06`** and **orb `.08`**, down from about `.12` and `.16`.

They give a worst pixel of 0.0485. The grain's overlay contribution is added in the test, so the final numbers may move by a step. Whatever passes is recorded here at the end of the build.

## Expected files

New:
- `components/layout/page-background-motion.tsx` (client) and `page-background-motion.test.tsx`: the rAF driver. It writes `transform` to `[data-page-bg]`, `[data-page-blob]` and `[data-page-stripes]` inside its own root, so it is independent of `LandingParallax`.
- `app/page-background-contrast.test.ts`: parses the background tokens and alphas from `globals.css`, composites the worst stack (gradient's brightest stop, every subset of blobs, stripes, wash, glow, orb, grain at full overlay strength) and asserts it is at or below the muted text ceiling.

Changed:
- `app/globals.css`:
  - Remove the teal tokens.
  - Add `--color-page-top`, `--color-page-mid` and `--color-page-deep` (gradient), `--color-page-blob-red`, `--color-page-blob-amber` and `--color-page-blob-deep`, `--color-page-wash`, `--color-page-shade` (vignette edge), `--color-page-glow` and `--color-page-orb`.
  - Utilities: `page-gradient` (rewritten), `page-blob`, `page-stripes`, `page-wash`, `page-vignette` (rewritten) and `page-grain`, plus the alphas as tokens the test reads.
  - `landing-blob` and `landing-orb` move onto `--color-page-glow` and `--color-page-orb`.
- `lib/color/contrast.ts` and its test: `channelsFromOklch()`, OKLCH to gamma sRGB, clamped.
- `components/layout/page-background.tsx` and its test: the new layers, wrapped in `PageBackgroundMotion`.
- `app/glass-contrast.test.ts`: its `PEAK` comment names the new test as what holds the cap. The value is unchanged.
- `app/showcase/page.tsx`: the section shows the new swatches and a static preview of the layers in a box. It exports the layers as `PageBackgroundLayers` from `page-background.tsx` so the preview reuses them without motion.
- `components/AGENTS.md`, lines 19 and 34: describe the warm tokens and the new layer.
- `prompts/film-strip-background.md`, `prompts/ambient-background.md` and `prompts/film-scene-continuity.md`: one "Superseded by prompts/warm-page-background.md" line at the top.

Deleted:
- `lib/film-scene/` (all files).
- `components/layout/page-background-canvas.tsx` and `.test.tsx`.

## Requirements and acceptance criteria

- **AC-1.** Every route shows the warm layer behind its content. It is fixed, `-z-10`, `h-lvh`, `aria-hidden`, `pointer-events-none`, and contains nothing focusable.
- **AC-2.** The gradient, blobs, stripes, wash, vignette and grain are in the prerendered HTML. `/shows` and `/movies` keep their static shells (`pnpm build` lists them as partially prerendered, as today).
- **AC-3.** With motion allowed:
  - Blobs drift slowly without input.
  - Gradient, blobs and stripes move with scroll by page progress.
  - With a mouse, everything leans away from the pointer, eased.
  - Touch and pen input move nothing.
- **AC-4.** Under `prefers-reduced-motion: reduce`, no frame loop runs and no inline transform remains. Switching the setting live starts or stops it.
- **AC-5.** The stripes never show an edge at any scroll position.
- **AC-6.** `app/page-background-contrast.test.ts` passes. Muted text keeps 4.5:1 over the brightest possible pixel, and `app/glass-contrast.test.ts` still passes.
- **AC-7.** No teal background token, `film-scene` import or WebGL context remains (`rg` finds none outside `prompts/`).
- **AC-8.** The landing's glows and orbs are warm, and still move with `LandingParallax` as before.
- **AC-9.** `/showcase` shows the new swatches and a static preview, and no longer imports the canvas.
- **AC-10.** Scrolling a long page (a full season page, and the landing) stays smooth with the frosted plates over the moving layer. I'll check this in the browser performance panel and report what I see.

## Security and privacy

None in scope: no data, no request state, no new dependency, and no external request. The grain is an inline SVG data URI.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`.

## Manual test steps

1. Run `pnpm dev:docker` and open `/shows`. The background is warm red at the top left, fading to near black, with faint diagonal pinstripes and grain.
2. Wait 10 seconds without touching anything. The soft red and amber blobs drift slowly.
3. Scroll the landing to the bottom. The gradient and blobs slide up gently, the stripes keep moving, and the amber orbs pass at two speeds.
4. Move the mouse from corner to corner. The layers lean away, easing in.
5. Open `/shows/1399`, `/watchlist`, `/sign-in` and `/privacy`. Each has the same background, and nothing teal remains.
6. In DevTools, turn on Rendering → Emulate `prefers-reduced-motion: reduce`. Everything stops and snaps back to rest. Turn it off and the motion resumes.
7. In DevTools device mode (touch), scroll: there's no pointer lean, and the scroll motion stays.
8. Open `/showcase` → Page background: the new swatches and a still preview.
9. Performance panel: record a scroll on a season page and check for no long frames from paint.

## Commits

1. `docs(prompts): plan the warm page background`
2. `feat(ui): add the warm page background tokens and utilities` (globals, oklch parser, contrast test)
3. `feat(layout): draw the warm page background and remove the film scene`
4. `feat(showcase): show the warm page background`
5. `docs: record the warm page background and supersede the film strip plans`

## As built (2026-10-18)

- The starting values held: wash `60%`, glow `6%`, orb `8%`, every other strength the design's. `app/page-background-contrast.test.ts`, with the grain at its brightest noise, passes them, and fails at the design's `42%` wash (3.63:1) and at `55%` (4.28:1).
- Every blob's `filter: blur()` is gone (decision 5). The grain stays: a scripted 180 frame scroll on `/privacy` in the dev build measured a median frame of 8.3ms and a slowest of 9.4ms, on a 120Hz display with no dropped frames. This was not a full performance trace.
- Added at the owner's request after the first look: the landing hero's artwork was too see-through over the new background. Its masks now start later, so more of the image stays opaque: bottom `mask-b-from-75%` (was 55%), left `lg:mask-l-from-70%` (was 40%), right `min-[1600px]:mask-r-from-90%` (was 83%). The title shade (`from-background/70`) is unchanged.
- `app/layout-purity.test.ts` now lists `page-background-motion.tsx` in place of the canvas island.
