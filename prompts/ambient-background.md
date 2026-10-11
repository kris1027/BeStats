# Ambient background on every page

> Superseded on 2026-10-11 by [film-strip-background.md](film-strip-background.md). The code this plan describes has been removed.

## Goal

Add the animated background from the Claude Design file `BeStats Background.dc.html` behind every page. It has four layers: an undulating wave of points, outlined "screens" drifting toward the viewer, slow dust and a vignette, with a slight camera parallax that follows the pointer. The background is lit in the personal score cyan (`--color-score-personal`, the colour of the selected tab and the user's rating), not the design's `#5ee6ff`. It must cost the catalog pages nothing measurable in load time, interactivity or battery.

## Inspected code and sources

- **The design file** (`BeStats Background.dc.html`, read through Claude Design): a Three.js r149 scene loaded from unpkg.
  - A 140 × 90 point grid displaced by three sine terms in the vertex shader, additive, distance faded.
  - 26 planes with edge outlines, moved and faded on the CPU every frame.
  - 600 dust points.
  - `FogExp2`, a radial vignette `div` above the canvas, and a camera that lerps toward the pointer.
  - The preview markup (navbar, grid, Space Grotesk) is only a stand-in for the app and is not built.
- **`support.js`**: the Claude Design canvas runtime. Nothing in it ships.
- **`app/layout.tsx`**: the root shell. The body is `flex min-h-full flex-col` on `bg-background` (#000). `app/layout.test.ts` and `app/layout-purity.test.ts` lock its structure, and nothing in the shell may read request state.
- **`app/globals.css`**: `--color-score-personal: #50c6e5`, the `glass-selected-personal` tab, and the rule that this file is the only place a colour may be written (`design-tokens-boundary.test.ts`).
- **`components/AGENTS.md`**: the three meaning colours, the client boundary list, the reduced motion precedent (`skeleton-pulse` stops entirely), and the fact that `/showcase` must track UI changes.
- **Context7, Next.js docs**:
  - Turbopack bundles `new Worker(new URL("./x.ts", import.meta.url))` as its own chunk.
  - Client Components can sit in a Server Component layout without making it dynamic.
  - Lazy loading (`next/dynamic` / `import()`) keeps code out of the initial bundle.

## Skills used

`next-dev-loop` to verify the running app, and `next-cache-components-optimizer` guidance to confirm `/shows`, `/movies` and `/movies/[id]` keep their static shells. No Supabase skill: there is no data change.

## Decisions and assumptions

1. **No Three.js.** The scene uses three primitives, a point cloud, quads and lines, so a hand-written WebGL2 renderer of about 4 KB gzipped replaces roughly 160 KB of Three.js. No new dependency.
2. **The GPU animates everything, and the CPU sends one uniform per frame.**
   - The wave is already computed in a shader.
   - The panels become instanced quads, and each instance's position is computed from `time` in the vertex shader: `z = mod(z0 + v·t, 38) − 30`, with the design's fades. That removes the design's per frame JavaScript loop over 26 meshes and 52 materials.
   - Dust turns on a single rotation uniform.
   - Fog moves into the fragment shaders. The vignette stays a CSS layer (decision 8), so it is also the whole background before and without WebGL2.
   - Four draw calls in total: the wave, the panel fills, the panel outlines and the dust.
   - Every fragment is capped under the luminance `--muted-foreground` allows (AC-10), and the layers blend with `MAX` rather than adding, so overlapping points cannot sum past the cap. Over the black page this matches the design's additive and alpha blending wherever layers do not overlap.
3. **Off the main thread.** When the browser supports `OffscreenCanvas` in a worker, the canvas is transferred with `transferControlToOffscreen()` and rendered in a dedicated worker. React hydration and scroll then never compete with the animation. Without that support, the same renderer module runs on the main thread. The renderer has no DOM access, so one module serves both.
4. **Painted late and outside the critical path.**
   - The layout renders a server side `<div>` with the static vignette gradient and an empty host `<div>` (`aria-hidden`, `pointer-events: none`, `position: fixed`, behind the content). The first paint is the same black page as today, plus the vignette.
   - The `<canvas>` is created in the browser when the scene mounts, not rendered by the server: once its control is transferred to a worker it can never be transferred again, and a canvas React kept across a Strict Mode remount would throw.
   - The client island loads its renderer with `import()` in `requestIdleCallback` (falling back to `setTimeout`) after hydration, then fades the canvas in over 600 ms.
   - Nothing shifts layout or touches LCP, and the island reads no request state, so every route keeps its prerendered shell.
5. **Budgets** (stated as acceptance criteria below):
   - Device pixel ratio capped at 1.5 (the design used 2).
   - Below 768px, or with a coarse pointer, half the wave grid (70 × 45) and 14 panels.
   - The loop pauses on `visibilitychange` (hidden tab) and resumes cleanly with no time jump.
   - Pointer moves are forwarded throttled to one per animation frame.
   - Resizes go through a `ResizeObserver`, which rechooses the budget. Crossing the compact breakpoint rebuilds the scene at the other density, because its geometry is uploaded once; any other resize only resizes the canvas, picking up a changed pixel ratio.
6. **Reduced motion.** Under `prefers-reduced-motion: reduce`, one still frame is drawn and nothing animates, including the parallax. This follows the `skeleton-pulse` precedent of stopping motion rather than slowing it. The setting is watched live.
7. **Failure is silent and safe.** No WebGL2, a failed shader compile or a lost context (`webglcontextlost`) leaves only the static vignette, which is today's black page. The background never errors in the console in normal use and never blocks the page.
   - A worker that can never draw (Safari 16 has `OffscreenCanvas` without WebGL on it) replies `failed`, and the page tries the main thread once.
   - A context lost after drawing replies `lost`, and the page gives up rather than rebuilding anywhere: whatever took the GPU away would take the next context too. A resize never revives a scene that was given up.
8. **Colours come from `globals.css` only.**
   - At mount, the island reads `--color-score-personal` and `--background` with `getComputedStyle` and passes them to the renderer as uniforms, so changing the token recolours the background.
   - The design's two neutral greys (the wave's low colour and the dust) become new tokens, `--color-backdrop-wave` and `--color-backdrop-dust`, read the same way.
   - The vignette is a new `@utility backdrop-vignette` built from `--background`.
9. **The cyan stays a meaning colour.** The owner asked for the background to borrow it, which is a second deliberate exception, beside the selected tab. It is recorded in `components/AGENTS.md`. Personal ratings stay distinguishable because the background is faint (the design's opacities: wave alpha at most 0.6 under fog, panel fill 0.04, outline 0.4) and every rating badge sits on an opaque plate.
10. **Kept from the app, not the design.** The page background stays `#000` (spec 0004), not the design's `#07080b`, and the font stays Inter, not Space Grotesk. The design's fog colour becomes `--background`.
11. **Legibility.**
    - Body text on flat black (headings, the "Ordered by…" line, legal pages) now sits over faint points.
    - The vignette darkens the edges and the fog darkens the distance.
    - Contrast is checked at the brightest pixel behind `text-muted-foreground`. Measured on 2026-10-11 (`/privacy`, 1440 × 900, content hidden, 20 frames): before the cap, wave points stacking at the horizon reached relative luminance 0.20 (1.8:1) and panel outlines about 3.8:1, while 99.998% of pixels already passed. The owner chose to cap the peaks rather than dim the whole scene (decision 2). After the cap the worst pixel measured 0.044, which is 5.0:1.
    - Glass surfaces keep their opaque plates, so nothing on artwork changes.
12. **Scope.** Every route through the root layout: catalog, title, library, auth, legal, 404 and `/showcase`. The OG image route is untouched. The title page hero backdrop already covers the background where it paints.

## Expected files

- `components/layout/ambient-background.tsx` (Server Component): the fixed vignette layer plus `<AmbientCanvas />`.
- `components/layout/ambient-canvas.tsx` (new client boundary, `"use client"`): renders the host and, when the browser is idle, imports `lib/backdrop/mount.ts`. Its `still` flag, passed only by `/showcase`, draws the reduced motion frame for every visitor.
- `lib/backdrop/mount.ts`: creates the canvas, reads the tokens, applies the motion and size budgets, then either transfers to the worker or lazy loads the renderer on the main thread. Handles visibility, pointer, resize and reduced motion, and cleans up on unmount.
- `lib/backdrop/backdrop.ts` and `lib/backdrop/loop.ts`: the renderer plus its clock, shared by the worker and the main thread; `lib/backdrop/camera.ts`: the projection and view matrices.
- `lib/backdrop/renderer.ts`: the pure WebGL2 scene. It takes a canvas, a budget and a colour set, and exposes `draw(frame)`, `resize` and `dispose`. It has no DOM access and no `server-only`.
- `lib/backdrop/shaders.ts`: the GLSL ES 3.00 sources, with fog and the vignette inside.
- `lib/backdrop/params.ts`: pure functions that choose the budget (grid size, panel count, DPR) from the viewport, pointer and motion preference, plus seeded panel and dust layouts so the server and tests stay deterministic.
- `lib/backdrop/colors.ts`: parses the computed CSS colour strings into sRGB channels from 0 to 1, the values the design's shaders received; there is no linear conversion, because the design's Three.js r149 renderer wrote its output unconverted. It also derives the luminance cap from `--muted-foreground`.
- `lib/backdrop/worker.ts` and `lib/backdrop/protocol.ts`: the worker entry and its messages (`init`, `resize`, `pointer`, `visible`, `motion`), validated with Zod; the worker replies `ready`, `failed` or `lost`. There is no `dispose` message: the page terminates the worker, which releases its context with it.
- `app/globals.css`: `--color-backdrop-wave`, `--color-backdrop-dust` and `@utility backdrop-vignette`.
- `app/layout.tsx`: render `<AmbientBackground />` first inside `<body>`. The background is fixed at `-z-10`, which paints above the body's black (propagated to the viewport) and below everything else, so the shell content needs no `relative isolate`.
- Tests:
  - `lib/backdrop/params.test.ts`, `lib/backdrop/colors.test.ts` (including the AC-10 cap), `lib/backdrop/protocol.test.ts`, `lib/backdrop/camera.test.ts`.
  - `lib/backdrop/loop.test.ts`: reduced motion draws once and a hidden tab pauses.
  - `lib/backdrop/backdrop.test.ts`: no WebGL2 or a failed link draws nothing, and a lost context is reported, but not the scene's own release of it.
  - `components/layout/ambient-canvas.test.tsx`: the worker and main thread paths, both failures and both losses leaving only the vignette, the breakpoint rebuild, pointer moves under reduced motion, the `still` flag, and unmount.
  - `components/layout/ambient-background.test.tsx`: hidden from assistive technology and the pointer, the vignette before anything loads.
  - `app/layout.test.ts`: renders exactly once and `aria-hidden`.
  - `app/layout-purity.test.ts`: the new shell files join the scanned tree.
- `app/showcase/page.tsx`: an "Ambient background" entry showing the tokens and the reduced motion still frame (`<AmbientCanvas still />`).
- `components/AGENTS.md`: the new client boundary, the second cyan exception, and the motion and performance rules.

## Requirements and acceptance criteria

- **AC-1:** Every page rendered by the root layout shows the background behind its content, and nothing in it is focusable, announced, or able to catch a pointer event.
- **AC-2:** The background's accent is `--color-score-personal`. No colour literal appears outside `globals.css` (`design-tokens-boundary.test.ts` passes).
- **AC-3:** No new runtime dependency. The renderer chunk is not in any route's initial JavaScript, and loads only after hydration.
- **AC-4:** `/shows`, `/movies` and `/movies/[id]` keep the same prerender markers in the `pnpm build` route table as on `main`.
- **AC-5:** With `prefers-reduced-motion: reduce`, exactly one frame is drawn and the pointer moves nothing.
- **AC-6:** A hidden tab requests no animation frames, and returning resumes without a jump.
- **AC-7:** Without WebGL2, or after context loss, the page shows the static vignette with no thrown error.
- **AC-8:** The pixel ratio is at most 1.5, and the mobile budget applies below 768px or with a coarse pointer.
- **AC-9:** Where `OffscreenCanvas` is supported, rendering happens in a worker. Otherwise it happens on the main thread with identical output.
- **AC-10:** `text-muted-foreground` keeps at least 4.5:1 against the brightest background pixel behind it.
- **AC-11:** Layout and scrolling are unchanged. The navbar still scrolls away, the footer still pins to the bottom, and nothing shifts when the canvas fades in.

## Security considerations

- No user data, no network request (no unpkg, no CDN script), and no new environment value.
- Worker messages are validated with Zod and come only from our own island.
- No request state is read, so nothing private can enter a shared cache.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`. Compare the route table markers with `main` (AC-4), and check the build output to confirm the renderer and worker are separate chunks (AC-3).

## Manual test steps

1. `git switch -c feat/ambient-background`, then `pnpm dev`, and open `/shows`. The page paints black with the vignette. Within about a second the wave, panels and dust fade in, in the personal cyan. Moving the mouse tilts the scene slightly.
2. Open a movie, `/watchlist`, `/sign-in`, `/privacy` and a bad URL (the 404). The background is behind each one.
3. DevTools → Rendering → emulate `prefers-reduced-motion: reduce`. The scene freezes into a still frame.
4. Switch to another tab for 10 seconds and come back. The Performance panel shows no frames while hidden, and the animation resumes smoothly.
5. Device toolbar at iPhone width: lighter scene, smooth scrolling, and the navbar and footer behave as before.
6. DevTools → Sources → Threads: a `worker` thread runs the renderer (Chrome, Safari 17+, Firefox).
7. In the console, run `document.querySelector('canvas').getContext('webgl2')`. Alternatively, block WebGL with `chrome://flags` or Safari's Develop menu and reload: only the vignette shows, with no errors.
8. Tab through the navbar. Focus never lands on the background, and a screen reader announces nothing new.
9. Open `/showcase` and check the Ambient background entry.
