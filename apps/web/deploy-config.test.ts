import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SUPABASE_REGION } from "@bestats/core/legal/operator";
import { describe, expect, it } from "vitest";
import { WEBSITE_OFF_ALLOWED_PAGES } from "./proxy";

/**
 * The deployment is configured from the repo: `supabase config push` sends
 * `supabase/config.toml` to the hosted project, and Vercel reads `vercel.json`
 * (spec 0018, AC-7). So these files are the production auth settings, and a
 * stray edit here reaches the cloud on the next push. These tests pin the values
 * the spec fixed, so changing one is a deliberate act with a failing test, not
 * a quiet drift between the repo, `docs/deploy.md` and the hosted project.
 */

/**
 * The web app's folder, found from this file rather than the working directory.
 * `vercel.json` and `.env.example` live here; `supabase/` sits at the
 * workspace root, one level above `apps/` (spec 0034).
 */
const ROOT = fileURLToPath(new URL(".", import.meta.url));
const WORKSPACE_ROOT = join(ROOT, "..", "..");

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

  for (const raw of readFileSync(join(WORKSPACE_ROOT, path), "utf8").split(
    "\n",
  )) {
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

/**
 * The Netlify backup host's origin, which serves the same build and so may
 * receive auth redirects too (docs/deploy.md, section 13). It is a redirect
 * target only; the site URL stays on Vercel. Read from `config.toml` like the
 * production origin, so a site rename is one edit there; empty when no
 * `*.netlify.app` redirect exists, which the tests below then fail on.
 */
const BACKUP_ORIGIN = (
  (productionAuth.get("additional_redirect_urls") as string[]).find((url) =>
    /^https:\/\/[a-z0-9-]+\.netlify\.app\//.test(url),
  ) ?? ""
).replace(/^(https:\/\/[^/]+).*$/, "$1");

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

  it("names the backup host by its https netlify.app origin", () => {
    expect(BACKUP_ORIGIN).toMatch(/^https:\/\/[a-z0-9-]+\.netlify\.app$/);
  });

  it("allows exactly each host's callback and origin wildcard as redirects", () => {
    expect(productionAuth.get("additional_redirect_urls")).toEqual([
      `${PRODUCTION_ORIGIN}/auth/callback`,
      `${PRODUCTION_ORIGIN}/**`,
      `${BACKUP_ORIGIN}/auth/callback`,
      `${BACKUP_ORIGIN}/**`,
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

  it("holds only localhost, the production origin and the backup host", () => {
    for (const url of everyRedirect) {
      expect(
        url.startsWith("http://localhost:3000") ||
          url.startsWith(PRODUCTION_ORIGIN) ||
          url.startsWith(BACKUP_ORIGIN),
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
  ) as { regions?: string[]; git?: { deploymentEnabled?: boolean } };

  it("pins functions to one region", () => {
    expect(vercel.regions).toHaveLength(1);
  });

  it("pins them beside the Supabase region the privacy policy names", () => {
    expect(vercel.regions?.[0]).toBe(
      VERCEL_REGION_FOR_SUPABASE[SUPABASE_REGION.code],
    );
  });

  /**
   * Temporary, while Vercel's account is blocked and Netlify serves the app
   * (docs/deploy.md, section 13): Git pushes build nothing on Vercel, so no
   * pull request carries a failing Vercel check. Switching back to Vercel
   * removes the `git` block and this test together.
   */
  it("builds no Git push while Netlify is the primary host", () => {
    expect(vercel.git).toEqual({ deploymentEnabled: false });
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

  /**
   * The Twitch client secret behind IGDB is not a Supabase credential and
   * bypasses nothing; spec 0023 AC-1 requires it here. Named, so any other
   * `SECRET` still fails.
   */
  const ALLOWED_SECRETS = new Set(["IGDB_CLIENT_SECRET"]);

  it("names no service role, secret key or database password", () => {
    expect(
      assigned.filter(
        (name) =>
          /SERVICE_ROLE|SECRET|DB_PASSWORD/.test(name) &&
          !ALLOWED_SECRETS.has(name),
      ),
    ).toEqual([]);
  });
});

type NetlifyRule = Map<string, TomlValue> & {
  rateLimit?: Map<string, TomlValue>;
};

/**
 * Reads `netlify.toml`: its plain tables, plus the `[[redirects]]` array and
 * each rule's `[redirects.rate_limit]` table, the only nesting the file uses.
 * Values are one line and JSON compatible, as in `config.toml`.
 */
function readNetlify(): { tables: TomlTables; redirects: NetlifyRule[] } {
  const tables: TomlTables = new Map();
  const redirects: NetlifyRule[] = [];
  let current: Map<string, TomlValue> = new Map();

  for (const raw of readFileSync(join(ROOT, "netlify.toml"), "utf8").split(
    "\n",
  )) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line === "[[redirects]]") {
      current = new Map();
      redirects.push(current);
      continue;
    }
    if (line === "[redirects.rate_limit]") {
      const rule = redirects.at(-1) as NetlifyRule;
      current = new Map();
      rule.rateLimit = current;
      continue;
    }
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      current = new Map();
      tables.set(header[1], current);
      continue;
    }

    const pair = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (pair) current.set(pair[1], parseValue(pair[2]));
  }

  return { tables, redirects };
}

/** Whether a Netlify `from` pattern (exact, or a trailing `/*` splat) matches. */
function netlifyRuleMatches(from: string, path: string): boolean {
  return from.endsWith("/*")
    ? path.startsWith(from.slice(0, -1))
    : from === path;
}

/**
 * Every top-level URL the app answers, read from `app/`: each route folder
 * (route groups opened one level, as `(auth)` is), plus the metadata files
 * that answer at the root.
 */
function topLevelRoutes(): string[] {
  const APP = join(ROOT, "app");
  const ROOT_FILES: Record<string, string> = {
    "robots.ts": "/robots.txt",
    "sitemap.ts": "/sitemap.xml",
    "opengraph-image.tsx": "/opengraph-image",
    "favicon.ico": "/favicon.ico",
  };
  const folders = (dir: string) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => entry.name);

  const routes = readdirSync(APP)
    .filter((name) => name in ROOT_FILES)
    .map((name) => ROOT_FILES[name]);
  for (const name of folders(APP)) {
    if (name.startsWith("(")) {
      routes.push(...folders(join(APP, name)).map((child) => `/${child}`));
    } else {
      routes.push(`/${name}`);
    }
  }
  return routes.sort();
}

/**
 * covers: prompts/netlify-mirror.md, decisions 11 and 12
 *
 * Netlify, the backup host, must serve what Vercel serves: the website off and
 * the API on (docs/deploy.md, sections 5 and 13). Its rules deny each page
 * route by name, so a new route stays reachable on Netlify until it is listed
 * here, and these tests make that a failing test rather than a quiet gap.
 */
describe("netlify.toml", () => {
  const { tables, redirects } = readNetlify();
  const denied = redirects.filter((rule) => rule.get("status") === 403);
  const deniedFrom = denied.map((rule) => rule.get("from") as string);
  const isDenied = (path: string) =>
    deniedFrom.some((from) => netlifyRuleMatches(from, path));

  /** What Vercel's "Website off, API on" rule lets through. */
  const ALLOWED_ROUTES = [
    "/api",
    "/privacy",
    "/terms",
    "/robots.txt",
    "/favicon.ico",
  ];

  it("builds the web package on Node 22, like CI and Vercel", () => {
    expect(tables.get("build")?.get("command")).toBe(
      "pnpm --filter @bestats/web build",
    );
    expect(tables.get("build.environment")?.get("NODE_VERSION")).toBe("22");
  });

  it("rate limits the whole API with one rule, 300 per minute per IP", () => {
    const limited = redirects.filter((rule) => rule.rateLimit);

    expect(limited).toHaveLength(1);
    const [rule] = limited;
    expect(rule.get("from")).toBe("/api/*");
    expect(rule.get("to")).toBe("/api/:splat");
    expect(rule.get("status")).toBe(200);
    expect(rule.get("force")).toBe(true);
    expect(rule.rateLimit?.get("window_limit")).toBe(300);
    expect(rule.rateLimit?.get("window_size")).toBe(60);
    expect(rule.rateLimit?.get("aggregate_by")).toEqual(["ip", "domain"]);
  });

  it("forces every deny rule to the static 403 page, so no function runs", () => {
    expect(denied.length).toBeGreaterThan(0);
    for (const rule of denied) {
      expect(rule.get("to"), String(rule.get("from"))).toBe("/403.html");
      expect(rule.get("force"), String(rule.get("from"))).toBe(true);
    }
    expect(readdirSync(join(ROOT, "public"))).toContain("403.html");
  });

  /**
   * covers: prompts/netlify-private-pages-403.md, decision 3
   *
   * With `WEBSITE_OFF=on` the proxy answers 403 before these rules run, so it
   * must leave open the same pages they do. `/api` and the files never reach
   * the proxy, which skips them.
   */
  it("leaves open the same pages as the proxy's website off rule", () => {
    const pages = ALLOWED_ROUTES.filter(
      (route) => route !== "/api" && !route.includes("."),
    );
    expect([...WEBSITE_OFF_ALLOWED_PAGES].sort()).toEqual(pages.sort());
  });

  it("holds only the rate limit rule and deny rules", () => {
    expect(redirects).toHaveLength(denied.length + 1);
  });

  it("denies the root and every top-level route outside the allow list", () => {
    const routes = topLevelRoutes();
    const uncovered = routes.filter(
      (route) =>
        !ALLOWED_ROUTES.includes(route) &&
        !(
          isDenied(route) &&
          (route.includes(".") ||
            route === "/opengraph-image" ||
            isDenied(`${route}/x`))
        ),
    );

    expect(isDenied("/")).toBe(true);
    expect(uncovered).toEqual([]);
  });

  it.each([
    "/api/v1/config",
    "/api/v1/movies/550/extras",
    "/api/search",
    "/privacy",
    "/terms",
    "/robots.txt",
    "/favicon.ico",
    "/tmdb-logo.svg",
    "/igdb-logo.svg",
    "/_next/static/chunks/main.js",
    "/403.html",
  ])("lets %s through", (path) => {
    expect(isDenied(path)).toBe(false);
  });

  it.each([
    "/movies",
    "/movies/550",
    "/shows/1399/seasons/1",
    "/watchlist",
    "/sign-in",
    "/auth/callback",
    "/sitemap.xml",
    "/showcase",
  ])("denies %s", (path) => {
    expect(isDenied(path)).toBe(true);
  });
});
