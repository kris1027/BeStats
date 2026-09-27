/**
 * The PostgREST error code for a token whose `iat` is later than PostgREST's
 * own clock.
 */
export const JWT_ISSUED_AT_FUTURE = "PGRST303";

/**
 * `PGRST303` covers every JWT claims failure, an expired token included, so
 * the message is what singles out the clock skew. Retrying an expired token
 * would only delay the 401 the caller has to act on.
 */
const ISSUED_AT_FUTURE_MESSAGE = /issued at future/i;

/**
 * How long to wait before each retry. PostgREST reads its clock from a cache
 * that can lag Supabase Auth by about a second and applies no leeway to `iat`,
 * so the waits add up to a little more than that.
 */
export const JWT_SKEW_RETRY_DELAYS_MS = [500, 1000] as const;

/**
 * Wraps `fetch` so a request PostgREST rejects as "JWT issued at future" is
 * sent again after a short wait.
 *
 * A token minted by sign in or by the proxy's refresh is used by the very next
 * render, often within the same second. PostgREST then sometimes answers 401
 * `PGRST303`, and every read on that render showed its failed state (the
 * "Status unavailable" pill, a missing rating) although nothing was wrong
 * (supabase/supabase#49655, #50651). The rejection happens before the request
 * reaches the database, so sending a write again cannot apply it twice. Any
 * other response, including every other 401, is returned untouched.
 *
 * Every attempt must be able to send the body again. A `Request` input is
 * cloned per attempt, and a stream in `init.body` is read into a buffer once,
 * up front. `init` is otherwise passed on as given, rather than folded into a
 * `Request`, which would drop the `next` options Next.js reads from it.
 *
 * @param baseFetch The fetch to wrap, `globalThis.fetch` in the app.
 * @param wait How to wait between attempts; tests pass a fake.
 * @returns A fetch with the same signature.
 */
export function withJwtSkewRetry(
  baseFetch: typeof fetch,
  wait: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): typeof fetch {
  return async (input, originalInit) => {
    const init =
      originalInit?.body instanceof ReadableStream
        ? {
            ...originalInit,
            body: await new Response(originalInit.body).arrayBuffer(),
          }
        : originalInit;
    const attempt = () =>
      baseFetch(input instanceof Request ? input.clone() : input, init);
    let response = await attempt();
    for (const delay of JWT_SKEW_RETRY_DELAYS_MS) {
      if (!(await isIssuedAtFuture(response))) return response;
      await wait(delay);
      response = await attempt();
    }
    return response;
  };
}

async function isIssuedAtFuture(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    const body: unknown = await response.clone().json();
    return (
      typeof body === "object" &&
      body !== null &&
      "code" in body &&
      body.code === JWT_ISSUED_AT_FUTURE &&
      "message" in body &&
      typeof body.message === "string" &&
      ISSUED_AT_FUTURE_MESSAGE.test(body.message)
    );
  } catch {
    return false;
  }
}
