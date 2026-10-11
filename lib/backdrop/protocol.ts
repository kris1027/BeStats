import * as z from "zod/mini";

import type { BackdropColors } from "./colors";
import type { BackdropBudget } from "./params";

/**
 * The messages between the page and the background worker
 * (prompts/ambient-background.md, decision 3).
 *
 * `zod/mini` rather than `zod`: the worker is its own chunk, and the full
 * build would be most of its size. Only our own island posts to the worker,
 * but the worker still validates every message, as AGENTS.md section 6 asks
 * of every structured input.
 */

const unit = z.number().check(z.gte(0), z.lte(1));
const rgb = z.tuple([unit, unit, unit]);
const count = z.number().check(z.int(), z.gte(0), z.lte(20_000));
const size = z.number().check(z.gte(0), z.lte(100_000));

const pixelRatio = z.number().check(z.gt(0), z.lte(4));

// Each schema is typed as the shape it validates, so a field added to
// `BackdropBudget` or `BackdropColors` and missed here fails the type check.

/** A `BackdropBudget` as it crosses to the worker in `init`. */
const budgetSchema: z.ZodMiniType<BackdropBudget> = z.object({
  gridWidth: count,
  gridDepth: count,
  spacing: z.number().check(z.gt(0), z.lte(10)),
  panels: count,
  dust: count,
  pixelRatio,
});

const colorsSchema: z.ZodMiniType<BackdropColors> = z.object({
  accent: rgb,
  background: rgb,
  wave: rgb,
  dust: rgb,
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
    colors: colorsSchema,
    reducedMotion: z.boolean(),
    visible: z.boolean(),
  }),
  z.object({
    type: z.literal("resize"),
    width: size,
    height: size,
    pixelRatio,
  }),
  z.object({
    type: z.literal("pointer"),
    x: z.number().check(z.gte(-1), z.lte(1)),
    y: z.number().check(z.gte(-1), z.lte(1)),
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
 * the scene, as decision 7 asks: whatever took the GPU away would take it from
 * the main thread too.
 */
export type FromWorker =
  | { type: "ready" }
  | { type: "failed" }
  | { type: "lost" };
