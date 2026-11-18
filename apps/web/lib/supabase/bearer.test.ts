import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * covers: spec 0033, AC-4, AC-9 (no token, a malformed one, the publishable
 * key as a token, an expired one)
 *
 * Supabase Auth is the boundary, so `getClaims` is replaced; what is checked
 * is what this module does with its answer.
 */
const getClaims = vi.fn();
const createClient = vi.fn((..._args: unknown[]) => ({ auth: { getClaims } }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  }),
}));

const { readBearerToken, verifyBearer } = await import("./bearer");

const TOKEN = "aaa.bbb.ccc";

afterEach(() => vi.clearAllMocks());

describe("readBearerToken", () => {
  it("reads a bearer JWT", () => {
    expect(readBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it("refuses every other shape", () => {
    for (const header of [
      null,
      "",
      TOKEN,
      `bearer ${TOKEN}`,
      `Basic ${TOKEN}`,
      "Bearer not-a-jwt",
      `Bearer ${TOKEN} extra`,
    ]) {
      expect(readBearerToken(header)).toBeNull();
    }
  });
});

describe("verifyBearer", () => {
  it("returns the sub of an authenticated token and a client carrying it", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "user-a", role: "authenticated" } },
      error: null,
    });
    const user = await verifyBearer(`Bearer ${TOKEN}`);
    expect(user?.userId).toBe("user-a");
    expect(getClaims).toHaveBeenCalledWith(TOKEN);
    const options = createClient.mock.calls[0]?.[2] as {
      global: { headers: Record<string, string> };
      auth: { persistSession: boolean };
    };
    expect(options.global.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(options.auth.persistSession).toBe(false);
  });

  it("refuses no header without asking Supabase", async () => {
    await expect(verifyBearer(null)).resolves.toBeNull();
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("refuses the publishable key used as a token (anon role)", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { sub: "", role: "anon" } },
      error: null,
    });
    await expect(verifyBearer(`Bearer ${TOKEN}`)).resolves.toBeNull();
  });

  it("refuses an expired or forged token", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("expired") });
    await expect(verifyBearer(`Bearer ${TOKEN}`)).resolves.toBeNull();
  });

  it("refuses a token with no subject", async () => {
    getClaims.mockResolvedValue({
      data: { claims: { role: "authenticated" } },
      error: null,
    });
    await expect(verifyBearer(`Bearer ${TOKEN}`)).resolves.toBeNull();
  });

  it("answers null when verification throws", async () => {
    getClaims.mockRejectedValue(new Error("network"));
    await expect(verifyBearer(`Bearer ${TOKEN}`)).resolves.toBeNull();
  });
});
