import * as z from "zod/mini";

/** The one sessionStorage key the background uses. */
export const CONTINUITY_KEY = "bestats:film-scene";

/** Scene seconds; far beyond any real tab, and finite for the shaders. */
export const MAX_SCENE_TIME = 1_000_000;

/** The scene clock, in scene seconds, as it crosses to the worker in `init`. */
export const sceneTimeSchema = z
  .number()
  .check(z.gte(0), z.lte(MAX_SCENE_TIME));

const storedSchema = z.object({ time: sceneTimeSchema });

/** The slice of `Storage` this module uses, injected so tests can fake it. */
type TimeStore = Pick<Storage, "getItem" | "setItem">;

function sessionStore(): TimeStore | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

/**
 * The scene time a previous document in this tab left behind, or null on the
 * tab's first load (prompts/film-scene-continuity.md, decision 1).
 *
 * Null also covers storage that is missing, blocked, throwing or holding
 * anything but a valid time: the background is decoration, so every one of
 * those quietly falls back to the intro from time 0.
 */
export function readSceneTime(
  store: TimeStore | null = sessionStore(),
): number | null {
  try {
    const raw = store?.getItem(CONTINUITY_KEY);
    if (!raw) return null;
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.time : null;
  } catch {
    return null;
  }
}

/**
 * Saves the scene time for the next document in this tab (decision 3). A
 * full or blocked store is ignored for the same reason a bad read is.
 */
export function saveSceneTime(
  time: number,
  store: TimeStore | null = sessionStore(),
): void {
  if (!sceneTimeSchema.safeParse(time).success) return;
  try {
    store?.setItem(CONTINUITY_KEY, JSON.stringify({ time }));
  } catch {
    // Quota or privacy mode: the next load plays the intro instead.
  }
}
