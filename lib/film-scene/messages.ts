import * as z from "zod/mini";

import type { SceneBudget } from "./budget";
import { sceneTimeSchema } from "./continuity";
import type { ScenePalette } from "./palette";

/**
 * The messages between the page and the background worker
 * (prompts/film-strip-background.md, decision 7).
 *
 * `zod/mini` rather than `zod`: the worker is its own chunk, and the full
 * build would be most of its size. Only our own island posts to the worker,
 * but the worker still validates every message, as AGENTS.md section 6 asks
 * of every structured input.
 */

const unit = z.number().check(z.gte(0), z.lte(1));
const rgb = z.tuple([unit, unit, unit]);
const size = z.number().check(z.gte(0), z.lte(100_000));
const pixelRatio = z.number().check(z.gt(0), z.lte(4));
const count = (max: number) => z.number().check(z.int(), z.gte(0), z.lte(max));

// Each schema is typed as the shape it validates, so a field added to
// `SceneBudget` or `ScenePalette` and missed here fails the type check.

/** A `SceneBudget` as it crosses to the worker in `init`. */
const budgetSchema: z.ZodMiniType<SceneBudget> = z.object({
  strips: count(3),
  // Two vertices per step, and the indices are 16 bit.
  segments: count(10_000),
  bokeh: count(1_000),
  pixelRatio,
});

const paletteSchema: z.ZodMiniType<ScenePalette> = z.object({
  glow: rgb,
  fog: rgb,
  filmBase: rgb,
  filmWindow: rgb,
  filmShadow: rgb,
  filmEdge: rgb,
  filmRail: rgb,
  filmGlow: rgb,
  lightAmbient: rgb,
  lightKey: rgb,
  lightRim: rgb,
  bokeh1: rgb,
  bokeh2: rgb,
  bokeh3: rgb,
  bokeh4: rgb,
  text: rgb,
});

const offscreenCanvas = z.custom<OffscreenCanvas>(
  (value) =>
    typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas,
);

/**
 * Every message the page may post to the worker. The worker parses each one
 * against this and drops anything else.
 */
export const toWorkerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("init"),
    canvas: offscreenCanvas,
    width: size,
    height: size,
    budget: budgetSchema,
    palette: paletteSchema,
    reducedMotion: z.boolean(),
    visible: z.boolean(),
    time: sceneTimeSchema,
  }),
  z.object({
    type: z.literal("resize"),
    width: size,
    height: size,
    pixelRatio,
  }),
  z.object({ type: z.literal("visible"), visible: z.boolean() }),
  z.object({ type: z.literal("motion"), reduced: z.boolean() }),
]);

/** A message the page posts to the worker, checked by `toWorkerSchema`. */
export type ToWorker = z.infer<typeof toWorkerSchema>;

/**
 * The worker's replies. `failed` means it could never draw (Safari 16 has
 * `OffscreenCanvas` without WebGL on it), so the page tries the main thread.
 * `lost` means it drew and then lost its context, and the page gives up on
 * the scene (decision 7): whatever took the GPU away would take it from the
 * main thread too. `time` is the clock's periodic report, which the page
 * keeps so the next full load can carry on from it
 * (prompts/film-scene-continuity.md).
 */
export type FromWorker =
  | { type: "ready" }
  | { type: "failed" }
  | { type: "lost" }
  | { type: "time"; time: number };
