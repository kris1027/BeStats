import { describe, expect, it, vi } from "vitest";

import {
  JWT_SKEW_RETRY_DELAYS_MS,
  withJwtSkewRetry,
} from "@/lib/supabase/jwt-skew-retry";

/**
 * Regression: the first render after sign in showed "Status unavailable"
 * because PostgREST answered the fresh token with 401 `PGRST303` ("JWT issued
 * at future"). The same request a moment later succeeds, so the server client
 * retries that one rejection and nothing else.
 */

const issuedAtFuture = () =>
  Response.json(
    {
      code: "PGRST303",
      details: null,
      hint: null,
      message: "JWT issued at future",
    },
    { status: 401 },
  );
const ok = () => Response.json([{ status: "watching" }]);
const noWait = () => Promise.resolve();

function fetchReturning(...responses: Response[]) {
  const base = vi.fn<typeof fetch>();
  for (const response of responses) base.mockResolvedValueOnce(response);
  return base;
}

describe("withJwtSkewRetry", () => {
  it("returns a successful response without retrying", async () => {
    const base = fetchReturning(ok());
    const response = await withJwtSkewRetry(base, noWait)("http://x/rest");

    expect(response.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("sends the same request again after a PGRST303 rejection", async () => {
    const base = fetchReturning(issuedAtFuture(), ok());
    const wait = vi.fn(noWait);
    const init = { method: "POST", body: '{"p_show_id":1396}' };

    const response = await withJwtSkewRetry(base, wait)("http://x/rest", init);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ status: "watching" }]);
    expect(base).toHaveBeenNthCalledWith(2, "http://x/rest", init);
    expect(wait).toHaveBeenCalledWith(JWT_SKEW_RETRY_DELAYS_MS[0]);
  });

  it("gives up after the last retry and returns the rejection", async () => {
    const base = fetchReturning(
      issuedAtFuture(),
      issuedAtFuture(),
      issuedAtFuture(),
    );

    const response = await withJwtSkewRetry(base, noWait)("http://x/rest");

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("PGRST303");
    expect(base).toHaveBeenCalledTimes(JWT_SKEW_RETRY_DELAYS_MS.length + 1);
  });

  it("does not retry any other 401", async () => {
    const expired = Response.json(
      { code: "PGRST301", message: "JWT expired" },
      { status: 401 },
    );
    const base = fetchReturning(expired);

    const response = await withJwtSkewRetry(base, noWait)("http://x/rest");

    expect((await response.json()).code).toBe("PGRST301");
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 401 whose body is not JSON", async () => {
    const base = fetchReturning(new Response("Unauthorized", { status: 401 }));

    const response = await withJwtSkewRetry(base, noWait)("http://x/rest");

    expect(await response.text()).toBe("Unauthorized");
    expect(base).toHaveBeenCalledTimes(1);
  });
});
