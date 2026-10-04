import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SUPABASE_REGION } from "@/lib/legal/operator";

/**
 * The deployment is configured from the repo: `supabase config push` sends
 * `supabase/config.toml` to the hosted project, and Vercel reads `vercel.json`
 * (spec 0018, AC-7). So these files are the production auth settings, and a
 * stray edit here reaches the cloud on the next push. These tests pin the values
 * the spec fixed, so changing one is a deliberate act with a failing test, not
 * a quiet drift between the repo, `docs/deploy.md` and the hosted project.
 */

const ROOT = process.cwd();

type TomlValue = string | number | boolean | string[];
type TomlTables = Map<string, Map<string, TomlValue>>;

/**
 * Reads the flat subset of TOML `config.toml` uses: `[table]` headers and one
 * line `key = value` pairs, where every value is a JSON compatible string,
 * number, boolean or string array. No TOML parser is installed, and the file
 * never needs more than this.
 */
function readToml(path: string): TomlTables {
  const tables: TomlTables = new Map([["", new Map()]]);
  let current = tables.get("") as Map<string, TomlValue>;

  for (const raw of readFileSync(join(ROOT, path), "utf8").split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      current = new Map();
      tables.set(header[1], current);
      continue;
    }

    const pair = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    current.set(key, parseValue(value));
  }

  return tables;
}

function parseValue(value: string): TomlValue {
  for (const candidate of [value, value.replace(/\s+#.*$/, "")]) {
    try {
      return JSON.parse(candidate) as TomlValue;
    } catch {
      // Try the next shape, then keep the raw text.
    }
  }
  return value;
}

const config = readToml("supabase/config.toml");

function table(name: string): Map<string, TomlValue> {
  const found = config.get(name);
  if (!found) throw new Error(`supabase/config.toml has no [${name}] table`);
  return found;
}

const productionAuth = table("remotes.production.auth");
const PRODUCTION_ORIGIN = productionAuth.get("site_url") as string;

/** covers: spec 0018, AC-7, AC-8 */
describe("the auth settings config push sends", () => {
  it.each([
    ["auth", "enable_signup", true],
    ["auth", "minimum_password_length", 8],
    ["auth", "jwt_expiry", 600],
    ["auth.rate_limit", "sign_in_sign_ups", 30],
    ["auth.rate_limit", "token_refresh", 150],
    ["auth.email", "enable_confirmations", false],
    ["auth.email", "secure_password_change", false],
  ])("sets [%s] %s = %s", (name, key, expected) => {
    expect(table(name).get(key)).toBe(expected);
  });

  it("keeps the local stack on localhost, so the two stacks differ only in the remote block (AC-8)", () => {
    const auth = table("auth");

    expect(auth.get("site_url")).toBe("http://localhost:3000");
    expect(auth.get("additional_redirect_urls")).toEqual([
      "http://localhost:3000/auth/callback",
      "http://localhost:3000/**",
    ]);
  });
});

/** covers: spec 0018, AC-7, AC-8 */
describe("the production remote", () => {
  it("names the production project by its ref", () => {
    expect(table("remotes.production").get("project_id")).toMatch(
      /^[a-z]{20}$/,
    );
  });

  it("sets the site URL to an https origin with no trailing slash", () => {
    expect(PRODUCTION_ORIGIN).toMatch(/^https:\/\/[a-z0-9.-]+$/);
  });

  it("allows exactly the callback and the origin wildcard as redirects", () => {
    expect(productionAuth.get("additional_redirect_urls")).toEqual([
      `${PRODUCTION_ORIGIN}/auth/callback`,
      `${PRODUCTION_ORIGIN}/**`,
    ]);
  });

  it("overrides only the two origin dependent values", () => {
    expect([...productionAuth.keys()].sort()).toEqual([
      "additional_redirect_urls",
      "site_url",
    ]);
  });
});

/**
 * covers: spec 0018, AC-21
 *
 * Previews carry no Supabase variables, so no preview origin may sit in the
 * allow list: a `*.vercel.app` wildcard would let any Vercel deployment,
 * anyone's, receive a redirect carrying an auth code.
 */
describe("the redirect allow list", () => {
  const everyRedirect = [
    table("auth").get("site_url"),
    ...(table("auth").get("additional_redirect_urls") as string[]),
    PRODUCTION_ORIGIN,
    ...(productionAuth.get("additional_redirect_urls") as string[]),
  ] as string[];

  it("holds only localhost and the production origin", () => {
    for (const url of everyRedirect) {
      expect(
        url.startsWith("http://localhost:3000") ||
          url.startsWith(PRODUCTION_ORIGIN),
        url,
      ).toBe(true);
    }
  });

  it("holds no wildcard host, so no preview origin can match", () => {
    for (const url of everyRedirect) {
      expect(new URL(url.replace("/**", "/")).hostname, url).not.toContain("*");
    }
  });
});

/**
 * covers: spec 0018, AC-15
 *
 * Google waits for email delivery (a pre account takeover guard depends on
 * confirmed addresses), so no external provider may be switched on yet.
 */
describe("the external sign in providers", () => {
  it("leaves every external provider off", () => {
    const enabled = [...config.entries()]
      .filter(([name]) => name.startsWith("auth.external."))
      .filter(([, values]) => values.get("enabled") === true)
      .map(([name]) => name);

    expect(enabled).toEqual([]);
  });

  it("configures no Google provider at all", () => {
    expect(config.has("auth.external.google")).toBe(false);
  });

  it("turns off anonymous sign ins and manual linking", () => {
    expect(table("auth").get("enable_anonymous_sign_ins")).toBe(false);
    expect(table("auth").get("enable_manual_linking")).toBe(false);
  });
});

/**
 * The Vercel region beside each Supabase region production has used. A move to
 * another EU region adds its pair here, alongside the `vercel.json` change.
 */
const VERCEL_REGION_FOR_SUPABASE: Record<string, string> = {
  "eu-central-1": "fra1",
};

/**
 * covers: spec 0018, AC-1, AC-23
 *
 * Every Server Component and Server Action talks to Supabase, so functions
 * pinned far from the database pay a round trip on each request, and the
 * privacy policy promises the functions run in the matching EU region.
 */
describe("vercel.json", () => {
  const vercel = JSON.parse(
    readFileSync(join(ROOT, "vercel.json"), "utf8"),
  ) as { regions?: string[] };

  it("pins functions to one region", () => {
    expect(vercel.regions).toHaveLength(1);
  });

  it("pins them beside the Supabase region the privacy policy names", () => {
    expect(vercel.regions?.[0]).toBe(
      VERCEL_REGION_FOR_SUPABASE[SUPABASE_REGION.code],
    );
  });
});

/** covers: spec 0018, AC-6, AC-10 */
describe(".env.example", () => {
  const example = readFileSync(join(ROOT, ".env.example"), "utf8");
  const assigned = example
    .split("\n")
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => line.split("=")[0]);

  it("documents the email delivery flag, off by default", () => {
    expect(example).toMatch(/^NEXT_PUBLIC_AUTH_EMAIL_DELIVERY=off$/m);
  });

  it("lists every variable Vercel's Production environment holds", () => {
    expect(assigned).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "TMDB_READ_ACCESS_TOKEN",
        "NEXT_PUBLIC_SITE_URL",
        "NEXT_PUBLIC_AUTH_EMAIL_DELIVERY",
      ]),
    );
  });

  it("names no service role, secret key or database password", () => {
    expect(
      assigned.filter((name) => /SERVICE_ROLE|SECRET|DB_PASSWORD/.test(name)),
    ).toEqual([]);
  });
});
