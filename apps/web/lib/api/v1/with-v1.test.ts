import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { v1ErrorBodySchema } from "@bestats/core/api/v1/errors";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * covers: spec 0033, AC-4, AC-8, AC-9; child 0035, withV1 (its Zod parse of
 * path, query and body, and its logging rule: every failure, structurally)
 */
const verifyBearer = vi.fn();
vi.mock("@/lib/supabase/bearer", () => ({ verifyBearer }));

const { v1Fail, v1Ok, withV1, V1_HANDLER } = await import("./with-v1");

const TOKEN = "header.payload.signature";
const ctx = (params: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
});

function request(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/v1/test", { headers });
}

const publicRoute = withV1({
  name: "test.public",
  auth: "public",
  cache: "public, s-maxage=300",
  handler: async () => v1Ok({ hello: "world" }),
});

const meRoute = withV1({
  name: "test.me",
  auth: "bearer",
  handler: async ({ user }) => v1Ok({ id: user.userId }),
});

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  warn.mockRestore();
});

async function errorCode(response: Response) {
  return v1ErrorBodySchema.parse(await response.json()).error.code;
}

describe("the version check", () => {
  it("answers 400 without a valid header", async () => {
    for (const headers of [{}, { "X-BeStats-App-Version": "1.0" }] as Record<
      string,
      string
    >[]) {
      const response = await publicRoute(request(headers), ctx());
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe("invalid_input");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it("answers 426 below the minimum, never cached", async () => {
    const response = await publicRoute(
      request({ "X-BeStats-App-Version": "0.9.0" }),
      ctx(),
    );
    expect(response.status).toBe(426);
    expect(await errorCode(response)).toBe("upgrade_required");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBeNull();
  });

  it("can be skipped for the config route only by its option", async () => {
    const config = withV1({
      name: "test.config",
      auth: "public",
      cache: "public, s-maxage=60",
      skipVersionCheck: true,
      handler: async () => v1Ok({}),
    });
    expect((await config(request(), ctx())).status).toBe(200);
  });
});

describe("public routes", () => {
  it("answer the route's public cache on success", async () => {
    const response = await publicRoute(
      request({ "X-BeStats-App-Version": "1.0.0" }),
      ctx(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, s-maxage=300");
    expect(await response.json()).toEqual({ hello: "world" });
  });

  it("answer no-store on a refusal", async () => {
    const route = withV1({
      name: "test.fail",
      auth: "public",
      cache: "public, s-maxage=300",
      handler: async () => v1Fail("catalog_unavailable"),
    });
    const response = await route(
      request({ "X-BeStats-App-Version": "1.0.0" }),
      ctx(),
    );
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answer 500 internal when a handler throws, with no detail", async () => {
    const route = withV1({
      name: "test.throw",
      auth: "public",
      cache: "public, s-maxage=300",
      handler: async () => {
        throw new Error("secret detail");
      },
    });
    const response = await route(
      request({ "X-BeStats-App-Version": "1.0.0" }),
      ctx(),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});

describe("bearer routes", () => {
  it("answer 401 private, no-store when the token does not verify", async () => {
    verifyBearer.mockResolvedValue(null);
    const response = await meRoute(
      request({
        "X-BeStats-App-Version": "1.0.0",
        Authorization: `Bearer ${TOKEN}`,
      }),
      ctx(),
    );
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe("unauthenticated");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("hand the handler the verified user and answer private, no-store", async () => {
    verifyBearer.mockResolvedValue({ userId: "user-a", client: {} });
    const response = await meRoute(
      request({
        "X-BeStats-App-Version": "1.0.0",
        Authorization: `Bearer ${TOKEN}`,
      }),
      ctx(),
    );
    expect(verifyBearer).toHaveBeenCalledWith(`Bearer ${TOKEN}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "user-a" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("keep the 426 private on a me route", async () => {
    const response = await meRoute(
      request({ "X-BeStats-App-Version": "0.1.0" }),
      ctx(),
    );
    expect(response.status).toBe(426);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("never log the token, header or body on a failure", async () => {
    verifyBearer.mockResolvedValue({ userId: "user-a", client: {} });
    const route = withV1({
      name: "test.me.throw",
      auth: "bearer",
      handler: async () => {
        throw new Error(TOKEN);
      },
    });
    await route(
      new NextRequest("http://localhost/api/v1/test", {
        method: "PUT",
        body: JSON.stringify({ watched: true, note: "private body" }),
        headers: {
          "X-BeStats-App-Version": "1.0.0",
          Authorization: `Bearer ${TOKEN}`,
        },
      }),
      ctx(),
    );
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain(
      JSON.stringify({ event: "api_v1.test.me.throw", outcome: "internal" }),
    );
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("private body");
  });

  it("are marked as built by withV1", () => {
    expect((meRoute as unknown as Record<symbol, unknown>)[V1_HANDLER]).toBe(
      true,
    );
  });
});

describe("input parsing", () => {
  const handler = vi.fn(async () => v1Ok({}));
  const route = withV1({
    name: "test.parse",
    auth: "public",
    cache: "no-store",
    input: {
      params: z.object({ id: z.coerce.number().int().positive() }),
      query: z.object({ page: z.coerce.number().int().min(1) }),
      body: z.object({ watched: z.boolean() }),
    },
    handler,
  });

  function call(id: string, page: string, body: string) {
    return route(
      new NextRequest(`http://localhost/api/v1/test?page=${page}`, {
        method: "PUT",
        body,
        headers: { "X-BeStats-App-Version": "1.0.0" },
      }),
      ctx({ id }),
    );
  }

  it("hands the handler parsed values", async () => {
    const response = await call("603", "2", JSON.stringify({ watched: true }));
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          params: { id: 603 },
          query: { page: 2 },
          body: { watched: true },
        },
      }),
    );
  });

  it("answers 400 before the handler for any bad part", async () => {
    for (const [id, page, body] of [
      ["abc", "1", JSON.stringify({ watched: true })],
      ["603", "0", JSON.stringify({ watched: true })],
      ["603", "1", JSON.stringify({ watched: "yes" })],
      ["603", "1", "not json"],
      // A repeated single value is refused, never one copy picked.
      ["603", "1&page=2", JSON.stringify({ watched: true })],
    ]) {
      const response = await call(id, page, body);
      expect(response.status, `${id} ${page} ${body}`).toBe(400);
      expect(await errorCode(response)).toBe("invalid_input");
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("hands a repeated query key over as an array, as search's genre", async () => {
    const queryHandler = vi.fn(async () => v1Ok({}));
    const repeated = withV1({
      name: "test.repeat",
      auth: "public",
      cache: "no-store",
      input: {
        query: z.object({ genre: z.array(z.string()), q: z.string() }),
      },
      handler: queryHandler,
    });
    const response = await repeated(
      new NextRequest("http://localhost/api/v1/test?genre=28&genre=12&q=x", {
        headers: { "X-BeStats-App-Version": "1.0.0" },
      }),
      ctx(),
    );
    expect(response.status).toBe(200);
    expect(queryHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { query: { genre: ["28", "12"], q: "x" } },
      }),
    );
  });

  it("checks the token before parsing a me route", async () => {
    verifyBearer.mockResolvedValue(null);
    const meHandler = vi.fn(async () => v1Ok({}));
    const me = withV1({
      name: "test.me.parse",
      auth: "bearer",
      input: { params: z.object({ id: z.coerce.number() }) },
      handler: meHandler,
    });
    const response = await me(
      request({ "X-BeStats-App-Version": "1.0.0" }),
      ctx({ id: "abc" }),
    );
    expect(response.status).toBe(401);
    expect(meHandler).not.toHaveBeenCalled();
  });
});

describe("logging", () => {
  const logged = () => warn.mock.calls.flat().join(" ");

  it("logs a refused token as an auth event, without the token", async () => {
    verifyBearer.mockResolvedValue(null);
    await meRoute(
      request({
        "X-BeStats-App-Version": "1.0.0",
        Authorization: `Bearer ${TOKEN}`,
      }),
      ctx(),
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(logged()).toContain('"event":"auth.bearer"');
    expect(logged()).not.toContain(TOKEN);
  });

  it("logs every 4xx and 5xx once, by route name and code only", async () => {
    await publicRoute(request({ "X-BeStats-App-Version": "0.9.0" }), ctx());
    const missing = withV1({
      name: "test.missing",
      auth: "public",
      cache: "no-store",
      handler: async () => v1Fail("not_found"),
    });
    await missing(request({ "X-BeStats-App-Version": "1.0.0" }), ctx());
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      JSON.stringify({
        event: "api_v1.test.public",
        outcome: "upgrade_required",
      }),
      JSON.stringify({ event: "api_v1.test.missing", outcome: "not_found" }),
    ]);
  });

  it("logs nothing on success", async () => {
    await publicRoute(request({ "X-BeStats-App-Version": "1.0.0" }), ctx());
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("every /api/v1 handler", () => {
  const root = fileURLToPath(new URL("../../../app/api/v1", import.meta.url));

  function routeFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return routeFiles(path);
      return entry === "route.ts" ? [path] : [];
    });
  }

  it("is exported through withV1", () => {
    const files = routeFiles(root);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const methods = [
        ...source.matchAll(
          /export\s+(?:async\s+)?(?:const|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b(\s*=\s*withV1\()?/g,
        ),
      ];
      expect(methods.length, file).toBeGreaterThan(0);
      for (const method of methods) {
        expect(method[2], `${file} ${method[1]}`).toBeDefined();
      }
    }
  });

  /**
   * Spec 0035, Caching: the `Cache-Control` each public route answers on
   * success, by its folder under `app/api/v1`. Shows and seasons are short
   * because air dates and status are time sensitive (AGENTS.md section 12).
   * A new public route fails here until it is added.
   */
  const PUBLIC_CACHE: Record<string, string> = {
    config: "public, s-maxage=60",
    "shows/[id]": "public, s-maxage=60",
    "shows/[id]/seasons/[n]": "public, s-maxage=60",
    genres: "public, s-maxage=86400",
    search: "public, s-maxage=300, stale-while-revalidate=600",
    "lists/[type]/[list]": "public, s-maxage=300, stale-while-revalidate=600",
    "movies/[id]": "public, s-maxage=300, stale-while-revalidate=600",
    "games/[id]": "public, s-maxage=300, stale-while-revalidate=600",
  };

  it("sets the cache spec 0035 names for each route", () => {
    const seen = new Set<string>();
    for (const file of routeFiles(root)) {
      const route = file
        .slice(root.length + 1)
        .replace(/[\\/]route\.ts$/, "")
        .replaceAll("\\", "/");
      const source = readFileSync(file, "utf8");
      const auths = [...source.matchAll(/auth:\s*"(\w+)"/g)].map((m) => m[1]);
      const caches = [...source.matchAll(/cache:\s*"([^"]+)"/g)].map(
        (m) => m[1],
      );
      expect(auths.length, route).toBeGreaterThan(0);

      if (route === "me" || route.startsWith("me/")) {
        // `withV1` answers every bearer route `private, no-store`, success
        // and error alike, and a bearer route takes no `cache` option.
        expect(new Set(auths), route).toEqual(new Set(["bearer"]));
        expect(caches, route).toEqual([]);
        continue;
      }
      expect(new Set(auths), route).toEqual(new Set(["public"]));
      expect(route in PUBLIC_CACHE, `${route} has no expected cache`).toBe(
        true,
      );
      for (const cache of caches)
        expect(cache, route).toBe(PUBLIC_CACHE[route]);
      expect(caches.length, route).toBe(auths.length);
      seen.add(route);
    }
    expect([...seen].sort()).toEqual(Object.keys(PUBLIC_CACHE).sort());
  });
});
