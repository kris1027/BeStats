import { z } from "zod";

/**
 * `GET /api/v1/config` (spec 0033, child 0035): what an app checks before
 * anything else, so it can show the update screen even when its own version
 * header would be refused everywhere else.
 */
export const v1ConfigSchema = z.object({
  minAppVersion: z.string(),
  apiVersion: z.literal(1),
});

export type V1Config = z.infer<typeof v1ConfigSchema>;
