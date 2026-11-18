import { z } from "zod";

/**
 * Every error `/api/v1` can answer, with its HTTP status (spec 0033, child
 * 0035, Errors). A closed list, so the app branches on a code and never on a
 * message, and no raw Supabase, TMDB or IGDB error text can reach a phone
 * (AGENTS.md section 11).
 */
export const V1_ERROR_STATUS = {
  invalid_input: 400,
  unauthenticated: 401,
  not_found: 404,
  not_released: 409,
  conflict: 409,
  upgrade_required: 426,
  rate_limited: 429,
  internal: 500,
  catalog_unavailable: 502,
} as const;

export type V1ErrorCode = keyof typeof V1_ERROR_STATUS;

export const v1ErrorCodeSchema = z.enum(
  Object.keys(V1_ERROR_STATUS) as [V1ErrorCode, ...V1ErrorCode[]],
);

/**
 * The one error body every v1 route answers: `{ error: { code, message } }`.
 * A tracking write adds `reason`, the Server Action's own error word, so the
 * app can rebuild the exact result the web gets (spec 0033, AC-5).
 */
export const v1ErrorBodySchema = z.object({
  error: z.object({
    code: v1ErrorCodeSchema,
    message: z.string(),
    reason: z.string().optional(),
  }),
});

export type V1ErrorBody = z.infer<typeof v1ErrorBodySchema>;

/**
 * What the app shows when a request never reached the server. It has no v1
 * code because no server answered; it lives here so both apps' copy stays in
 * core (AGENTS.md section 11: a failure is always visible).
 */
export const V1_NETWORK_MESSAGE =
  "You're offline. Check your connection and try again.";

/** The English copy for the errors no tracking or auth message covers. */
export const V1_ERROR_MESSAGES: Record<V1ErrorCode, string> = {
  invalid_input: "That request wasn't valid.",
  unauthenticated: "Your session expired, sign in again.",
  not_found: "We couldn't find that.",
  not_released: "You can mark this once it's released.",
  conflict: "That change was refused.",
  upgrade_required: "Update BeStats to keep going.",
  rate_limited: "Too many requests. Try again in a minute.",
  internal: "Something went wrong. Try again.",
  catalog_unavailable: "Couldn't reach the catalog. Try again.",
};
