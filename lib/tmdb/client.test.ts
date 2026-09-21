import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  installFetchMock,
  restoreFetchMock,
  TEST_TOKEN,
  timeoutError,
} from "./__fixtures__/helpers";
import { tmdbRequest } from "./client";
import { TMDB_MAX_ATTEMPTS } from "./constants";
import { TmdbError } from "./errors";

/**
 * The request client is where every TMDB failure is decided, so these tests are
 * the contract scope features 7 onwards build their error states on
 * (spec 0002, AC-3, AC-10 to AC-12, AC-21).
 */

const schema = z.object({ id: z.number() });

afterEach(() => {
  restoreFetchMock();
  vi.restoreAllMocks();
});

describe("authentication and the request URL", () => {
  it("sends the token as a Bearer header and never in the URL", async () => {
    const fetchMock = installFetchMock([{ body: { id: 1 } }]);

    await tmdbRequest("/movie/1", {}, schema);

    expect(fetchMock.headers().Authorization).toBe(`Bearer ${TEST_TOKEN}`);
    expect(fetchMock.calls[0].url).not.toContain(TEST_TOKEN);
    expect(fetchMock.url().searchParams.get("api_key")).toBeNull();
  });

  it("asks for English metadata on every request", async () => {
    const fetchMock = installFetchMock([{ body: { id: 1 } }]);

    await tmdbRequest("/movie/1", {}, schema);

    expect(fetchMock.url().searchParams.get("language")).toBe("en-US");
  });

  it("drops undefined query values instead of sending the string", async () => {
    const fetchMock = installFetchMock([{ body: { id: 1 } }]);

    await tmdbRequest("/movie/1", { year: undefined, page: 2 }, schema);

    expect(fetchMock.url().searchParams.has("year")).toBe(false);
    expect(fetchMock.url().searchParams.get("page")).toBe("2");
  });

  it("carries an abort signal, so no request can hang a render", async () => {
    const fetchMock = installFetchMock([{ body: { id: 1 } }]);

    await tmdbRequest("/movie/1", {}, schema);

    const signal = fetchMock.calls[0].init.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });
});

describe("error mapping", () => {
  it("maps a 404 to not_found and makes exactly one attempt", async () => {
    const fetchMock = installFetchMock([{ status: 404, body: {} }]);

    const error = await tmdbRequest("/movie/1", {}, schema).catch((e) => e);

    expect(error).toBeInstanceOf(TmdbError);
    expect(error.kind).toBe("not_found");
    expect(error.status).toBe(404);
    expect(error.endpoint).toBe("/movie/1");
    expect(fetchMock.attempts).toBe(1);
  });

  it("maps a 401 to unauthorized and does not retry it", async () => {
    const fetchMock = installFetchMock([{ status: 401, body: {} }]);

    const error = await tmdbRequest("/movie/1", {}, schema).catch((e) => e);

    expect(error.kind).toBe("unauthorized");
    expect(fetchMock.attempts).toBe(1);
  });

  it("maps an aborted request to timeout without retrying it", async () => {
    const fetchMock = installFetchMock([{ throws: timeoutError() }]);

    const error = await tmdbRequest("/movie/1", {}, schema).catch((e) => e);

    expect(error.kind).toBe("timeout");
    expect(fetchMock.attempts).toBe(1);
  });

  it("raises bad_response when a required field is missing, with nothing partial", async () => {
    installFetchMock([{ body: { title: "no id here" } }]);

    const error = await tmdbRequest("/movie/1", {}, schema).catch((e) => e);

    expect(error).toBeInstanceOf(TmdbError);
    expect(error.kind).toBe("bad_response");
  });

  it("treats a body that is not JSON as an upstream problem", async () => {
    installFetchMock([{ status: 200, text: "<html>maintenance</html>" }]);

    const error = await tmdbRequest("/movie/1", {}, schema).catch((e) => e);

    expect(error.kind).toBe("upstream");
  });

  it("ignores unknown keys TMDB adds, rather than failing the read", async () => {
    installFetchMock([
      { body: { id: 7, a_field_tmdb_added_later: true, nested: { x: 1 } } },
    ]);

    await expect(tmdbRequest("/movie/7", {}, schema)).resolves.toEqual({
      id: 7,
    });
  });
});

describe("retries", () => {
  it("retries a 429 and returns the data on the next attempt", async () => {
    const fetchMock = installFetchMock([
      { status: 429, headers: { "retry-after": "0" } },
      { body: { id: 3 } },
    ]);

    await expect(tmdbRequest("/movie/3", {}, schema)).resolves.toEqual({
      id: 3,
    });
    expect(fetchMock.attempts).toBe(2);
  });

  it("waits the Retry-After the response asked for", async () => {
    const delays: number[] = [];
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: () => void,
      ms?: number,
    ) => {
      delays.push(ms ?? 0);
      callback();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout);
    installFetchMock([
      { status: 429, headers: { "retry-after": "2" } },
      { body: { id: 3 } },
    ]);

    await tmdbRequest("/movie/3", {}, schema);

    expect(delays[0]).toBe(2000);
  });

  it("stops at the pinned attempt ceiling on a persistent 500", async () => {
    const fetchMock = installFetchMock([{ status: 500, body: {} }]);

    const error = await tmdbRequest("/movie/1", {}, schema).catch((e) => e);

    expect(error.kind).toBe("upstream");
    expect(fetchMock.attempts).toBe(TMDB_MAX_ATTEMPTS);
    expect(TMDB_MAX_ATTEMPTS).toBe(3);
  });

  it("retries a network level failure", async () => {
    const fetchMock = installFetchMock([
      { throws: new TypeError("fetch failed") },
      { body: { id: 9 } },
    ]);

    await expect(tmdbRequest("/movie/9", {}, schema)).resolves.toEqual({
      id: 9,
    });
    expect(fetchMock.attempts).toBe(2);
  });
});

describe("logging", () => {
  it("logs a structured record on failure and never the credential", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installFetchMock([{ status: 500, body: {} }]);

    await tmdbRequest("/movie/1", {}, schema).catch(() => {});

    const lines = warn.mock.calls.map(([line]) => String(line));
    expect(lines.length).toBe(TMDB_MAX_ATTEMPTS);
    const first = JSON.parse(lines[0]);
    expect(first).toMatchObject({
      event: "tmdb_request_retry",
      endpoint: "/movie/1",
      status: 500,
      kind: "upstream",
      attempt: 1,
    });
    expect(typeof first.elapsedMs).toBe("number");
    for (const line of lines) {
      expect(line).not.toContain(TEST_TOKEN);
      expect(line.toLowerCase()).not.toContain("authorization");
    }
  });

  it("logs nothing for a successful read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installFetchMock([{ body: { id: 1 } }]);

    await tmdbRequest("/movie/1", {}, schema);

    expect(warn).not.toHaveBeenCalled();
  });
});
