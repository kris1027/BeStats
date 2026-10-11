import * as z from "zod/mini";

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

export const budgetSchema = z.object({
  gridWidth: count,
  gridDepth: count,
  spacing: z.number().check(z.gt(0), z.lte(10)),
  panels: count,
  dust: count,
  pixelRatio: z.number().check(z.gt(0), z.lte(4)),
});

const offscreenCanvas = z.custom<OffscreenCanvas>(
  (value) =>
    typeof OffscreenCanvas !== "undefined" && value instanceof OffscreenCanvas,
);

export const toWorkerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("init"),
    canvas: offscreenCanvas,
    width: size,
    height: size,
    budget: budgetSchema,
    colors: z.object({
      accent: rgb,
      background: rgb,
      wave: rgb,
      dust: rgb,
    }),
    reducedMotion: z.boolean(),
    visible: z.boolean(),
  }),
  z.object({
    type: z.literal("resize"),
    width: size,
    height: size,
    pixelRatio: z.number().check(z.gt(0), z.lte(4)),
  }),
  z.object({
    type: z.literal("pointer"),
    x: z.number().check(z.gte(-1), z.lte(1)),
    y: z.number().check(z.gte(-1), z.lte(1)),
  }),
  z.object({ type: z.literal("visible"), visible: z.boolean() }),
  z.object({ type: z.literal("motion"), reduced: z.boolean() }),
  z.object({ type: z.literal("dispose") }),
]);

export type ToWorker = z.infer<typeof toWorkerSchema>;

/** The worker's replies: drawn its first frame, or cannot draw at all. */
export type FromWorker = { type: "ready" } | { type: "failed" };
