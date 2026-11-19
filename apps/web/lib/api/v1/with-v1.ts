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
import { AUTH_OUTCOME } from "@bestats/core/auth/messages";
import type { NextRequest } from "next/server";
import type { z } from "zod";

import { AUTH_EVENT, logAuthEvent } from "@/lib/auth/log";
import { type BearerUser, verifyBearer } from "@/lib/supabase/bearer";

import { logV1Failure } from "./log";

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

/**
 * Builds a success outcome. Handlers return an outcome rather than a
 * `Response`, so only `withV1` sets status and cache headers and no `me`
 * answer can reach a shared cache (AGENTS.md section 11).
 */
export function v1Ok(body: unknown, status = 200): V1Success {
  return { kind: "success", body, status };
}

/**
 * Builds a failure outcome from a closed error code, so a handler can never
 * put raw upstream error text in a body (AGENTS.md section 11).
 */
export function v1Fail(
  code: V1ErrorCode,
  extra: { reason?: string; message?: string } = {},
): V1Failure {
  return { kind: "failure", code, ...extra };
}

type RouteContext = { params: Promise<Record<string, string | string[]>> };

/** The core Zod schemas a route reads its path, query and body through. */
export type V1InputSchemas = {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
};

/** What each declared schema parsed to; an undeclared part is absent. */
type ParsedInput<S extends V1InputSchemas> = {
  [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never;
};

type HandlerInput<S extends V1InputSchemas> = {
  request: NextRequest;
  /** Every input the route declared, already parsed (child 0035). */
  input: ParsedInput<S>;
};

type PublicOptions<S extends V1InputSchemas> = {
  /** The route name used in log lines, for example `movies.get`. */
  name: string;
  auth: "public";
  /** The `Cache-Control` a success answers with. */
  cache: string;
  /** Only `/api/v1/config` skips the version check. */
  skipVersionCheck?: boolean;
  /** The schemas the handler's `input` is parsed with. */
  input?: S;
  handler: (input: HandlerInput<S>) => Promise<V1Outcome>;
};

type BearerOptions<S extends V1InputSchemas> = {
  name: string;
  auth: "bearer";
  input?: S;
  handler: (
    input: HandlerInput<S> & { user: BearerUser },
  ) => Promise<V1Outcome>;
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
 * 3. parses the path, query and body with the core schemas the route
 *    declares in `input`, answering 400 `invalid_input` before the handler
 *    runs, so a handler can only ever read parsed values (AGENTS.md
 *    section 11);
 * 4. runs the handler and answers `{ error: { code, message } }` on any
 *    refusal, and sets `Cache-Control`: the route's public value on success,
 *    `no-store` on an error, and `private, no-store` on every `me` answer
 *    (AGENTS.md section 11);
 * 5. logs every failure through the structural helpers: a refused token
 *    through `logAuthEvent`, anything else through `logV1Failure`, never a
 *    header, token or body.
 *
 * A handler that throws answers 500 `internal`, never a stack or message.
 */
export function withV1<S extends V1InputSchemas = Record<never, never>>(
  options: PublicOptions<S> | BearerOptions<S>,
) {
  const handle = async (
    request: NextRequest,
    context: RouteContext,
  ): Promise<Response> => {
    const failCache = options.auth === "bearer" ? PRIVATE_NO_STORE : NO_STORE;
    const fail = (failure: V1Failure) => {
      logV1Failure(options.name, failure.code);
      return failureResponse(failure, failCache);
    };

    const skipVersion = options.auth === "public" && options.skipVersionCheck;
    if (!skipVersion) {
      const version = checkAppVersion(request.headers.get(APP_VERSION_HEADER));
      if (version === "invalid") return fail(v1Fail("invalid_input"));
      if (version === "upgrade_required") {
        return fail(v1Fail("upgrade_required"));
      }
    }

    try {
      let outcome: V1Outcome;
      let successCache: string;
      if (options.auth === "bearer") {
        const user = await verifyBearer(request.headers.get("authorization"));
        if (!user) {
          logAuthEvent(
            AUTH_EVENT.bearer,
            "refused",
            AUTH_OUTCOME.sessionExpired,
          );
          return failureResponse(v1Fail("unauthenticated"), PRIVATE_NO_STORE);
        }
        const input = await parseInput(options.input, request, context);
        if (!input) return fail(v1Fail("invalid_input"));
        outcome = await options.handler({ request, input, user });
        successCache = PRIVATE_NO_STORE;
      } else {
        const input = await parseInput(options.input, request, context);
        if (!input) return fail(v1Fail("invalid_input"));
        outcome = await options.handler({ request, input });
        successCache = options.cache;
      }
      if (outcome.kind === "failure") return fail(outcome);
      return Response.json(outcome.body, {
        status: outcome.status ?? 200,
        headers: { "Cache-Control": successCache },
      });
    } catch {
      // The error is dropped on purpose: its message can carry request
      // details that must not reach a log line (AGENTS.md section 11).
      return fail(v1Fail("internal"));
    }
  };
  return Object.assign(handle, { [V1_HANDLER]: true as const });
}

/**
 * Parses each declared part with its schema; null when any part fails. The
 * body is read only when a schema asks for it, and an unreadable body counts
 * as a failed parse rather than a 500.
 */
async function parseInput<S extends V1InputSchemas>(
  schemas: S | undefined,
  request: NextRequest,
  context: RouteContext,
): Promise<ParsedInput<S> | null> {
  const parsed: Record<string, unknown> = {};
  if (schemas?.params) {
    const result = schemas.params.safeParse(await context.params);
    if (!result.success) return null;
    parsed.params = result.data;
  }
  if (schemas?.query) {
    const result = schemas.query.safeParse(
      queryRecord(request.nextUrl.searchParams),
    );
    if (!result.success) return null;
    parsed.query = result.data;
  }
  if (schemas?.body) {
    const result = schemas.body.safeParse(
      await request.json().catch(() => undefined),
    );
    if (!result.success) return null;
    parsed.body = result.data;
  }
  return parsed as ParsedInput<S>;
}

/**
 * The query as the web's `searchParams` record has it: a key given once is a
 * string, a repeated key an array. Search's `genre` and `platform` repeat by
 * design, and every other schema expects a string, so a repeated `ids` or
 * `page` fails its parse with 400 rather than one value being picked
 * silently (AGENTS.md section 11).
 */
function queryRecord(
  params: URLSearchParams,
): Record<string, string | string[]> {
  const record: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    record[key] = values.length === 1 ? values[0] : values;
  }
  return record;
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
