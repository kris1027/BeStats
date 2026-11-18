import "server-only";

import {
  V1_ERROR_MESSAGES,
  V1_ERROR_STATUS,
  type V1ErrorBody,
  type V1ErrorCode,
} from "@bestats/core/api/v1/errors";
import {
  APP_VERSION_HEADER,
  checkAppVersion,
} from "@bestats/core/api/v1/version";
import type { NextRequest } from "next/server";

import { type BearerUser, verifyBearer } from "@/lib/supabase/bearer";

/** What every `me` route answers: private to its caller, never stored. */
export const PRIVATE_NO_STORE = "private, no-store";

/** What every error, 426 included, answers on a public route. */
const NO_STORE = "no-store";

/** A refusal a handler returns instead of a body. */
export type V1Failure = {
  kind: "failure";
  code: V1ErrorCode;
  /** The action's own error word, for a tracking write (spec 0033, AC-5). */
  reason?: string;
  /** Overrides the default English copy for `code`. */
  message?: string;
};

/** A success a handler returns: the JSON body, and its status (200 default). */
export type V1Success = { kind: "success"; body: unknown; status?: number };

export type V1Outcome = V1Success | V1Failure;

/** Builds a success outcome. */
export function v1Ok(body: unknown, status = 200): V1Success {
  return { kind: "success", body, status };
}

/** Builds a failure outcome. */
export function v1Fail(
  code: V1ErrorCode,
  extra: { reason?: string; message?: string } = {},
): V1Failure {
  return { kind: "failure", code, ...extra };
}

type RouteContext = { params: Promise<Record<string, string | string[]>> };

type HandlerInput = {
  request: NextRequest;
  params: Record<string, string | string[]>;
};

type PublicOptions = {
  /** The route name used in log lines, for example `movies.get`. */
  name: string;
  auth: "public";
  /** The `Cache-Control` a success answers with. */
  cache: string;
  /** Only `/api/v1/config` skips the version check. */
  skipVersionCheck?: boolean;
  handler: (input: HandlerInput) => Promise<V1Outcome>;
};

type BearerOptions = {
  name: string;
  auth: "bearer";
  handler: (input: HandlerInput & { user: BearerUser }) => Promise<V1Outcome>;
};

/** Marks a handler as built by `withV1`, which the coverage test checks. */
export const V1_HANDLER = Symbol.for("bestats.v1.handler");

/**
 * The one wrapper every `/api/v1` handler is exported through (spec 0033,
 * AC-4; child 0035, `withV1`). In order it:
 *
 * 1. checks `X-BeStats-App-Version`: missing or malformed answers 400, below
 *    `MIN_APP_VERSION` answers 426 with `no-store` (only `/config` skips it),
 *    and nothing varies on the header, so a cached success is never an
 *    upgrade page;
 * 2. for a `bearer` route, verifies the token and answers 401 without one, so
 *    the user ID only ever comes from the verified `sub` claim (AGENTS.md
 *    section 5);
 * 3. runs the handler, which parses its own inputs with the core schemas;
 * 4. answers `{ error: { code, message } }` on any refusal, and sets
 *    `Cache-Control`: the route's public value on success, `no-store` on an
 *    error, and `private, no-store` on every `me` answer (AGENTS.md
 *    section 11);
 * 5. logs only the route name and the error code, never a header, token or
 *    body.
 *
 * A handler that throws answers 500 `internal`, never a stack or message.
 */
export function withV1(options: PublicOptions | BearerOptions) {
  const handle = async (
    request: NextRequest,
    context: RouteContext,
  ): Promise<Response> => {
    const failCache = options.auth === "bearer" ? PRIVATE_NO_STORE : NO_STORE;

    const skipVersion = options.auth === "public" && options.skipVersionCheck;
    if (!skipVersion) {
      const version = checkAppVersion(request.headers.get(APP_VERSION_HEADER));
      if (version === "invalid") {
        return failureResponse(v1Fail("invalid_input"), failCache);
      }
      if (version === "upgrade_required") {
        return failureResponse(v1Fail("upgrade_required"), failCache);
      }
    }

    try {
      const params = await context.params;
      if (options.auth === "bearer") {
        const user = await verifyBearer(request.headers.get("authorization"));
        if (!user) {
          return failureResponse(v1Fail("unauthenticated"), PRIVATE_NO_STORE);
        }
        const outcome = await options.handler({ request, params, user });
        return toResponse(options.name, outcome, PRIVATE_NO_STORE, failCache);
      }
      const outcome = await options.handler({ request, params });
      return toResponse(options.name, outcome, options.cache, failCache);
    } catch {
      // The error is dropped on purpose: its message can carry request
      // details that must not reach a log line (AGENTS.md section 11).
      logV1Failure(options.name, "internal");
      return failureResponse(v1Fail("internal"), failCache);
    }
  };
  return Object.assign(handle, { [V1_HANDLER]: true as const });
}

function toResponse(
  name: string,
  outcome: V1Outcome,
  successCache: string,
  failCache: string,
): Response {
  if (outcome.kind === "success") {
    return Response.json(outcome.body, {
      status: outcome.status ?? 200,
      headers: { "Cache-Control": successCache },
    });
  }
  if (V1_ERROR_STATUS[outcome.code] >= 500) logV1Failure(name, outcome.code);
  return failureResponse(outcome, failCache);
}

function failureResponse(failure: V1Failure, cache: string): Response {
  const body: V1ErrorBody = {
    error: {
      code: failure.code,
      message: failure.message ?? V1_ERROR_MESSAGES[failure.code],
      ...(failure.reason ? { reason: failure.reason } : {}),
    },
  };
  return Response.json(body, {
    status: V1_ERROR_STATUS[failure.code],
    headers: { "Cache-Control": cache },
  });
}

/** The only log line `/api/v1` writes: a route name and an error code. */
function logV1Failure(name: string, code: V1ErrorCode): void {
  console.warn(`api_v1.${name} failed ${code}`);
}
