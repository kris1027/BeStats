import { v1ErrorBodySchema } from "@bestats/core/api/v1/errors";
import { NextRequest } from "next/server";

/**
 * Shared test plumbing for the `/api/v1` route tests: request builders and a
 * fake PostgREST client that records every call. The boundaries each test
 * mocks itself (`vi.mock` must sit in the test file to be hoisted).
 */
export const VERSION = { "X-BeStats-App-Version": "1.0.0" };
export const AUTH = { ...VERSION, Authorization: "Bearer a.b.c" };

export const calls: { method: string; args: unknown[] }[] = [];

let results: { data: unknown; error: unknown }[] = [];

/**
 * Queues what the next awaited queries resolve to, in order; the last one
 * repeats. One result is the common case.
 */
export function setDbResult(...next: { data: unknown; error: unknown }[]) {
  results = next;
}

export function resetDb() {
  calls.length = 0;
  results = [{ data: null, error: null }];
}

const METHODS = [
  "from",
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
  "eq",
  "neq",
  "in",
  "is",
  "not",
  "gte",
  "lte",
  "order",
  "range",
  "limit",
  "rpc",
  "single",
  "maybeSingle",
];

export function fakeClient() {
  const chain: Record<string, unknown> = {};
  for (const method of METHODS) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return chain;
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: stands in for a thenable PostgREST builder.
  chain.then = (resolve: (value: unknown) => unknown) => {
    const next = results.length > 1 ? results.shift() : results[0];
    return resolve(next);
  };
  // A plain object, not the thenable chain: `getClient` is async, and awaiting
  // a thenable would resolve it to a query result.
  return { from: chain.from, rpc: chain.rpc } as never;
}

export const ctx = (params: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
});

export function req(
  path: string,
  headers: Record<string, string>,
  init: { method?: string; body?: unknown } = {},
) {
  return new NextRequest(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export async function errorOf(response: Response) {
  return v1ErrorBodySchema.parse(await response.json()).error;
}
