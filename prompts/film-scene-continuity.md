# Film strip background plays its intro once per tab

## Goal

The film strip background (prompts/film-strip-background.md) should start once and then keep going. After the first load in a browser tab, a full page load must not replay the intro. That covers a reload, a typed URL, and the return from OAuth or an email link. The strips continue from the pose they had and appear without the 1.6s fade. A rebuild after a resize across the compact breakpoint continues the same way. A new tab gets the intro once (owner, 2026-10-11).

## Inspected code and findings

- `app/layout.tsx` renders `PageBackground` in the root layout, so it already persists across client navigation. I checked this in the running app (`pnpm dev:docker`, Playwright): `/shows` → `/movies` → `/shows/{id}` → Back → `/sign-in` → `/privacy` kept the same canvas, created one worker, and the window state survived.
- What restarts it is a full document load. `components/layout/page-background-canvas.tsx` waits for idle, then `lib/film-scene/start.ts` creates a fresh canvas at opacity 0 and fades it in (`FADE`). `lib/film-scene/clock.ts` starts `time` at 0, so the strips always begin from the same pose.
- `start.ts` also calls `start()` again when a resize crosses the budget breakpoint. That rebuild currently restarts from time 0 with the fade too.
- `worker.ts` / `messages.ts`: the page and the worker exchange `init/resize/visible/motion` messages, and the worker answers with `ready/failed/lost`.

## Skills used

None of the listed skills apply; this is client-side animation code with no Next.js caching or Supabase surface.

## Decisions and assumptions

1. **sessionStorage, per tab** (owner). One key, `bestats:film-scene`, holds `{ time }`, the scene clock in scene seconds. Every read and write is wrapped in try/catch and validated with `zod/mini`. If storage is missing, blocked, or holds a bad value, the page behaves exactly as today: intro from time 0.
2. **The clock reports its time.** `createClock` takes a `startTime` and an `onTime` callback. While the clock runs, `onTime` fires at most once per real second, and once more when the clock stops (hidden tab, reduced motion, dispose). In the worker this becomes a new reply, `{ type: "time", time }`. `init` gets a validated `time` field.
3. **The page saves what it last heard.** `start.ts` keeps the latest time in memory and writes it to sessionStorage on each report, so a crash or a killed tab still leaves a recent value. A reload loses at most about one second of scene time (0.25s of motion), which can't be seen across a reload.
4. **No fade when resuming.** If a saved time existed at start, or the scene is being rebuilt after a resize, the first frame is revealed with no transition. Only the very first start in a tab fades in. Reduced motion already reveals without a transition.
5. **Unchanged:** the idle-time import. The scene still stays off the critical path, so on a reload the gradient and vignette paint first and the strips appear (without a fade) once the browser is idle, usually a few hundred milliseconds.
6. **`/showcase` still frame is excluded.** `still` scenes neither read nor write the key, so the showcase preview can't move the live background's clock.

## Expected files

- `lib/film-scene/continuity.ts` (new) and `continuity.test.ts`: read and save the stored time, safely.
- `lib/film-scene/clock.ts`, `clock.test.ts`: `startTime`, throttled `onTime`.
- `lib/film-scene/run.ts`: pass `startTime` / `onTime` through `RunOptions`.
- `lib/film-scene/messages.ts`, `messages.test.ts`: `time` on `init`, the `time` reply.
- `lib/film-scene/worker.ts`: forward `onTime` as a message.
- `lib/film-scene/start.ts`: load the stored time, track the latest, skip the fade when resuming.
- `prompts/film-strip-background.md`: one As built line pointing here.

## Requirements and acceptance criteria

- **AC-1:** The first load in a tab fades the scene in from time 0, as today.
- **AC-2:** A later full load in the same tab starts the clock from the last reported time and reveals with no transition.
- **AC-3:** A rebuild across the compact breakpoint continues from the current time with no fade.
- **AC-4:** With storage blocked, throwing, or holding junk, the scene behaves as in AC-1 and throws nothing.
- **AC-5:** In-app navigation still never restarts the scene (unchanged; re-checked).
- **AC-6:** The `/showcase` still frame never reads or writes the key.
- **AC-7:** Hidden tab and reduced motion behaviour are unchanged: no frames are requested while hidden, and one still frame is drawn under reduced motion.

## Security considerations

Only a number is stored, and only in this tab's sessionStorage. There is no user data, no network request, and no new environment value. The stored value and the new worker message are both Zod validated.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Manual test steps

1. `pnpm dev:docker`, open `/shows` in a new tab: the strips fade in once.
2. Wait 10 seconds and reload: the strips appear without a fade, in a later pose than the first load's opening frame.
3. Click around (`/movies`, a title, Back): nothing restarts.
4. Resize the window across 768px: the strips rebuild at the other density without a fade or a jump back to the opening pose.
5. Open `/shows` in a second new tab: it fades in once (per tab).
6. DevTools → Application → Session storage: `bestats:film-scene` holds `{"time": …}`. Set it to `"junk"` and reload: the intro plays, no console errors.
7. `/showcase`: the still frame shows; the session storage value doesn't change because of it.
