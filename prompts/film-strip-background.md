# Film strip background on every page

## Goal

Replace the ambient background (prompts/ambient-background.md: point wave, drifting screens, dust) with the Claude Design file `BeStats Background v2.dc.html`, and remove every piece of the old one: code, tokens, tests and showcase entry. The new scene has these layers:

- A teal radial gradient.
- Three lit film strips coiled into helices, each with a sprocket rail, dark frame windows and punched holes, scrolling along their length while they spin and bob.
- About 70 soft bokeh discs rising slowly.
- A vignette.
- No cursor following: the design's pointer parallax was dropped at the owner's request (decision 13).

It must cost the catalog pages nothing measurable in load time, interactivity or battery.

## Inspected code and sources

- **The design file** (read through Claude Design): a Three.js r149 scene loaded from unpkg. It has these parts:
  - A `CanvasTexture` film frame, 360 × 256: base `#0e6a80`, a window gradient `#01090c → #05303a → #01090c`, a `#4fe0ff` window border, `#3fd8ff` rails, and 4 × 2 rounded sprocket holes cut out with `destination-out`.
  - Ribbon geometry, 400 segments, swept along a `CatmullRomCurve3` helix of 61 points (radius bulging by `1 + 0.25·sin(πt)`). Its `u` coordinate repeats once every `1.4 × width`.
  - `MeshStandardMaterial`: roughness 0.35, metalness 0.35, emissive `#1fb8d8` at 0.28 through the same map, double sided, `alphaTest: 0.5`.
  - Lights: ambient `#145060` at 0.45, directional key `#a8f4ff` at 0.9 from (4, 8, 6), and point rim `#2fd8ff` at 1.4 from (-3, 2, 5) with a range of 30. `Fog(#010a10, 8, 22)`.
  - A strip layout table of up to four entries. Each entry gives a frustum relative screen position (`fx`, `fy`), a depth, a tilt, a spin, and a texture run speed.
  - 70 additive sprites in four tints (`#8ff0ff`, `#c9f8ff`, `#fff`, `#4fd8f0`). 30% of them are large and faint, the rest small and bright. They rise and wrap at y = ±8, and their opacity breathes.
  - Props: `speed` 0.25, `strips` 3, `bokeh` 70.
  - The background `div` is `radial-gradient(ellipse at 25% 15%, #04303a, #021820 45%, #010a10 80%, #000306)`. The vignette `div` is `radial-gradient(ellipse at 50% 45%, rgba(0,4,6,.15), rgba(0,4,6,.55) 60%, rgba(0,2,4,.95))`.
  - Pointer parallax lerps 0.02 per frame. Under reduced motion, time stops. The canvas fades in over 1.6 s.
- **`support.js`**: the Claude Design canvas runtime. Nothing in it ships.
- **The old background, all removed:**
  - `components/layout/ambient-background.tsx` and `ambient-canvas.tsx`, with their tests.
  - `lib/backdrop/*`, 16 files.
  - `--color-backdrop-wave`, `--color-backdrop-dust` and `@utility backdrop-vignette` in `app/globals.css`.
  - The "Ambient background" section of `app/showcase/page.tsx`.
  - Its entries in `app/layout.tsx`, `app/layout.test.ts`, `app/layout-purity.test.ts` and `components/AGENTS.md`.
- **`app/layout.tsx`**: the root shell, and the rule that nothing in it reads request state. **`app/globals.css`**: the only home of colour literals (`design-tokens-boundary.test.ts`). `--background` is `#000`, and `--muted-foreground` is `#a8adbc`.
- **Context7:**
  - three.js manual: OffscreenCanvas with a main thread fallback, and resource disposal.
  - Next.js docs: lazy loading with `import()` keeps a library out of the initial bundle, and Turbopack resolves `new Worker(new URL("./x.ts", import.meta.url))` into its own chunk.
  - What this means here: hand-written WebGL2 in a worker, imported after hydration, with every buffer, program and texture deleted on dispose.

## Skills used

`next-dev-loop` to verify the running app. `next-cache-components-optimizer` guidance to confirm that `/shows`, `/movies` and `/movies/[id]` keep their static shells. No Supabase skill is needed: there is no data change.

## Decisions (owner answers, 2026-10-11) and assumptions

1. **Hand-written WebGL2, no three.js** (owner). No new dependency. Two programs and `strips + 1` draw calls a frame:
   - **Strips.** One ribbon mesh per strip, built once on the CPU from the helix: Catmull-Rom sampling, then the design's side vector `up − tan·(up·tan)`. The spin, bob, sway and texture scroll are uniforms per strip. The film frame is computed procedurally in the fragment shader from `uv`: the rails, the window with its vertical gradient and border, and rounded rectangle sprocket holes that `discard`, which is the design's `alphaTest`. So there is no texture upload and no 2D canvas in the worker. The lighting approximates `MeshStandardMaterial` with Lambert diffuse plus GGX-lite specular from the key and the rim light, plus ambient and emissive. Linear fog runs from 8 to 22.
   - **Bokeh.** One instanced quad draw. Each instance gets a seeded position, size, tint, base opacity, phase and velocity. The rise, the wrap and the breathing opacity are all computed in the vertex shader from `time`, so the CPU loop over 70 sprites is gone. The disc profile is the design's radial gradient stops, computed analytically.
   - The CPU sends a handful of uniforms per frame and nothing else.
2. **Rebuilt fresh under new names** (owner). Everything of the old background is deleted. The delivery guarantees are rebuilt and retested: idle import, a worker with a main thread fallback, reduced motion, a hidden tab pause and silent failure.
   - New names: `components/layout/page-background.tsx`, `components/layout/page-background-canvas.tsx` and `lib/film-scene/`.
   - `prompts/ambient-background.md` stays as the historical record, with one line on top pointing here.
3. **The design's teal palette, as backdrop-only tokens** (owner). All new tokens go in `@theme` in `globals.css` and are read at mount with `getComputedStyle`. None is written in a shader.
   - Gradient: `--color-backdrop-glow` `#04303a`, `--color-backdrop-mid` `#021820`, `--color-backdrop-deep` `#010a10` (also the fog), and `--color-backdrop-abyss` `#000306`.
   - Film: `--color-film-base` `#0e6a80`, `--color-film-window` `#05303a`, `--color-film-shadow` `#01090c`, `--color-film-edge` `#4fe0ff`, `--color-film-rail` `#3fd8ff` and `--color-film-glow` `#1fb8d8`.
   - Lights: `--color-light-ambient` `#145060`, `--color-light-key` `#a8f4ff` and `--color-light-rim` `#2fd8ff`.
   - Bokeh: `--color-bokeh-1` to `--color-bokeh-4`, `#8ff0ff`, `#c9f8ff`, `#ffffff` and `#4fd8f0`.
   - The gradient and the vignette are CSS utilities (`backdrop-gradient`, `backdrop-vignette`) on server rendered layers. They are therefore the first paint, and the whole background where WebGL2 is missing.
   - The page's `--background` stays `#000`. The OG image, the theme colour metadata (`lib/seo/theme-tokens.ts`) and the plates are untouched. The teal shows only in the fixed background layer.
4. **The personal cyan exception ends.** The background no longer borrows `--color-score-personal`, so `components/AGENTS.md` drops that exception and keeps the selected tab as the only one. The design's cyans are distinct tokens. Every rating badge still sits on an opaque plate, so a score never reads as part of the scene.
5. **The contrast cap is kept** (owner). Every fragment of both programs is clamped to the peak luminance at which `text-muted-foreground` keeps 4.5:1. The value is derived from the token at mount, with the old 0.85 margin. Bokeh uses `MAX` blending instead of additive, so overlapping discs cannot add up past the cap. Over the dark teal this matches additive blending wherever discs do not overlap. The brightest parts of the design, the `#4fe0ff` window border and the white bokeh cores, render slightly dimmer than the design file.
6. **Painted late and outside the critical path.**
   - The server renders the fixed layer: the gradient, an empty host `div` and the vignette, all `aria-hidden` and `pointer-events: none`.
   - The client island renders only the host. When the browser is idle (`requestIdleCallback`, falling back to `setTimeout`), it imports `lib/film-scene/start.ts`, which creates the `<canvas>` in the browser. The canvas is never rendered by React, because once its control is transferred to a worker it can never be transferred again.
   - The canvas fades in over 1.6 s, as in the design, after its second frame.
   - Nothing shifts layout or touches LCP, and every route keeps its prerendered shell.
7. **Off the main thread.** Where `OffscreenCanvas` supports WebGL2 in a worker, the canvas is transferred and drawn in `lib/film-scene/worker.ts`. Otherwise the same scene module runs on the main thread: it has no DOM access. Worker messages are `init`, `resize`, `pointer`, `visible` and `motion`, validated with Zod; replies are `ready`, `failed` and `lost`. A worker that replies `failed` causes one main thread attempt. A context lost after drawing gives up for good.
8. **Budgets.**
   - The pixel ratio is capped at 1.5 (the design used 2).
   - Below 768px, or with a coarse pointer: 2 strips at 240 ribbon segments and 35 bokeh. Otherwise: 3 strips at 400 segments and 70 bokeh.
   - The speed is fixed at the design's 0.25.
   - The loop pauses on `visibilitychange` and resumes without a time jump.
   - A `ResizeObserver` re-places the strips, whose screen position depends on the aspect ratio. Crossing the compact breakpoint rebuilds the scene at the other budget.
   - Bokeh and strip layouts come from a seeded PRNG, so they are deterministic in tests and across remounts.
9. **Reduced motion.** Under `prefers-reduced-motion: reduce`, one still frame is drawn and nothing moves. The setting is watched live.
10. **Failure is silent.** No WebGL2, a failed compile or link, or a lost context leaves the CSS gradient and vignette, with nothing thrown and nothing logged.
11. **Kept from the app, not the design.** The font stays Inter, not Space Grotesk. The design's preview markup is not built.
12. **Scope.** Every route through the root layout. The OG image route is untouched, and the title page hero still paints over the background where it draws.
13. **No cursor following** (owner, 2026-10-11, after the first build). The design's pointer parallax is removed: the camera is fixed at (0, 0, 10), its view matrix is computed once, there is no `pointer` worker message, and no `pointermove` listener is added on any device.

## Expected files

**Deleted:** `components/layout/ambient-background.tsx`, `ambient-background.test.tsx`, `ambient-canvas.tsx`, `ambient-canvas.test.tsx`, and all of `lib/backdrop/`.

**New:**
- `components/layout/page-background.tsx` (Server Component): the fixed gradient layer, the canvas host and the vignette.
- `components/layout/page-background-canvas.tsx` (`"use client"`): idle import of `start.ts`, plus cleanup. Its `still` prop is used only by `/showcase`.
- `lib/film-scene/budget.ts`: pure. It chooses strips, segments, bokeh and pixel ratio from the viewport, the pointer and the DPR.
- `lib/film-scene/layout.ts`: pure. It holds the design's strip table, the helix and ribbon builders, frustum placement for an aspect ratio, and the seeded bokeh instances.
- `lib/film-scene/palette.ts`: reads and parses the tokens into sRGB 0 to 1, and computes the luminance cap from `--muted-foreground`.
- `lib/film-scene/shaders.ts`: the GLSL ES 3.00 sources for the strip and bokeh programs, with fog, lighting, the procedural film and the cap.
- `lib/film-scene/matrices.ts`: the perspective, look-at and per-strip model matrices.
- `lib/film-scene/scene.ts`: the WebGL2 scene, with `draw(frame)`, `resize`, `place(aspect)` and `dispose`. `dispose` deletes every buffer, VAO and program.
- `lib/film-scene/clock.ts`: the frame loop, covering reduced motion, the hidden tab pause and the time based lerp.
- `lib/film-scene/run.ts` (added while building): scene plus clock on one canvas, with context loss reporting. It is the piece the worker and the main thread share.
- `lib/film-scene/messages.ts` and `worker.ts`: the Zod protocol and the worker entry.
- `lib/film-scene/start.ts`: creates the canvas, reads the tokens, chooses the budget, starts the worker or the main thread path, and wires visibility, resize and motion.

**Changed:**
- `app/globals.css`: remove the old tokens and utility; add the new tokens plus `@utility backdrop-gradient` and the new `@utility backdrop-vignette`.
- `app/layout.tsx` and its JSDoc: `<PageBackground />` first in `<body>`.
- `app/layout.test.ts` and `app/layout-purity.test.ts`: the new names.
- `app/showcase/page.tsx`: a "Page background" section with the token swatches and the still frame.
- `components/AGENTS.md`: the client boundary list, the end of the cyan exception, and the background rules under the new names.
- `prompts/ambient-background.md`: a "Superseded by prompts/film-strip-background.md" line.

**Tests (new):**
- `budget.test.ts`: full, compact, coarse pointer and the DPR cap.
- `layout.test.ts`: the helix point count and bounds, the ribbon vertex, uv and index counts, the frustum placement for 16:9 and 9:16, and seeded bokeh determinism.
- `palette.test.ts`: token parsing, plus the cap keeping 4.5:1 for `#a8adbc`.
- `messages.test.ts`: valid and invalid messages.
- `clock.test.ts`: reduced motion draws once, a hidden tab requests no frames and resumes without a jump, and the lerp does not depend on frame rate.
- `scene.test.ts`: no WebGL2 or a failed link draws nothing, one draw call per strip plus one for the bokeh, depth writes back on before each clear, and dispose deletes its resources.
- `run.test.ts`: a lost context is reported, but the scene's own dispose is not.
- `page-background-canvas.test.tsx`: the worker and main thread paths, both kinds of failure and of loss, the breakpoint rebuild, pointer moves sending nothing, `still`, and unmount.
- `page-background.test.tsx`: `aria-hidden`, `pointer-events-none`, and the gradient and vignette present before anything loads.

## Requirements and acceptance criteria

- **AC-1:** Every page rendered by the root layout shows the background behind its content. Nothing in it is focusable, announced, or able to catch a pointer event.
- **AC-2:** No trace of the old background remains: `rg -i "lib/backdrop|ambient-(canvas|background)|backdrop-wave|backdrop-dust"` finds nothing outside `prompts/`.
- **AC-3:** Every colour comes from `globals.css` tokens, and `design-tokens-boundary.test.ts` passes.
- **AC-4:** No new runtime dependency. The scene chunk and the worker are absent from every route's initial JavaScript, and load only after hydration.
- **AC-5:** `/shows`, `/movies` and `/movies/[id]` keep the same prerender markers in the `pnpm build` route table as on `main`.
- **AC-6:** With `prefers-reduced-motion: reduce`, exactly one frame is drawn.
- **AC-14:** Nothing in the scene follows the cursor or a touch. No pointer listener is added and the camera is fixed.
- **AC-7:** A hidden tab requests no animation frames, and returning resumes without a jump.
- **AC-8:** Without WebGL2, or after a context loss, the page shows the CSS gradient and vignette with no thrown error.
- **AC-9:** The pixel ratio is at most 1.5, and the compact budget applies below 768px or with a coarse pointer.
- **AC-10:** Where `OffscreenCanvas` supports it, rendering happens in a worker; otherwise on the main thread with the same output.
- **AC-11:** `text-muted-foreground` keeps at least 4.5:1 over the brightest background pixel. This is measured in the running app on `/privacy` at 1440 × 900 with the content hidden.
- **AC-12:** Layout and scrolling are unchanged. The navbar still scrolls away, the footer still pins to the bottom, and nothing shifts when the canvas fades in.
- **AC-13:** At a glance, the scene matches the design: three coiled film strips (upper right, lower left, and a small distant one at the bottom), rising bokeh, the teal gradient brighter at the upper left, and the vignette.

## Security considerations

- No user data, no network request (no unpkg or CDN script, no web font), and no new environment value.
- Worker messages are Zod validated and come only from our own island.
- No request state is read, so nothing private can enter a shared cache.

## Automated checks

- `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`.
- Compare the route table markers with `main` (AC-5).
- Confirm in the build output that the scene and worker are separate chunks (AC-4).
- Run the AC-2 `rg` sweep.

## Manual test steps

1. `git switch -c feat/film-strip-background`, then `pnpm dev`, and open `/shows`. The page paints in the teal gradient with the vignette, and within about two seconds the film strips and bokeh fade in. Moving the mouse changes nothing.
2. Open a movie, `/watchlist`, `/sign-in`, `/privacy` and a bad URL (the 404). The background is behind each one.
3. DevTools → Rendering → emulate `prefers-reduced-motion: reduce`. The scene freezes.
4. Switch to another tab for 10 seconds and come back. The Performance panel shows no frames while hidden, and the animation resumes smoothly.
5. Device toolbar at iPhone width: two strips, fewer bokeh, smooth scrolling, and the navbar and footer behave as before.
6. DevTools → Sources → Threads: a worker thread runs the scene.
7. Disable WebGL (Chrome `--disable-webgl`, or Safari's Develop menu) and reload. Only the gradient and vignette show, with no console errors.
8. Tab through the navbar. Focus never lands on the background.
9. Open `/showcase` and check the Page background section: the swatches and the still frame.

## As built (2026-10-11)

- The design's table had a fourth strip, used only when its `strips` prop was 4. The app has no such prop, so only the three default strips are kept.
- Found in the running app: `gl.clear` respects `depthMask`, and the bokeh pass leaves it off. So every frame after the first kept the previous frame's depth. A redrawn still frame then lost its strips, and moving strips flickered. The mask is now turned back on before the clear, and `scene.test.ts` guards it.
- Measured on `/privacy` at 1440 × 900 with the content hidden (three frames over 13 s): the brightest pixel's luminance is 0.0206, so muted text keeps 6.64:1 (AC-11).
- Chunks: the worker is about 7.5 KB gzipped, including `zod/mini`, and the main thread scene about 5.7 KB. Neither is referenced by any prerendered page.
