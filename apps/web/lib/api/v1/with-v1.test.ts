import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { v1ErrorBodySchema } from "@bestats/core/api/v1/errors";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0033, AC-4, AC-8, AC-9; child 0035, withV1 and its logging rule
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
    for (const headers of [{}, { "X-BeStats-App-Version": "1.0" }]) {
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
    expect(logged).toContain("api_v1.test.me.throw failed internal");
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("private body");
  });

  it("are marked as built by withV1", () => {
    expect((meRoute as unknown as Record<symbol, unknown>)[V1_HANDLER]).toBe(
      true,
    );
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
});
