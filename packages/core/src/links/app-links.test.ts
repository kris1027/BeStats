import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AASA_FILE,
  ASSET_LINKS_FILE,
  renderAppLinkFiles,
  WELL_KNOWN_DIR,
} from "../../scripts/app-links";
import {
  APP_RESET_PATH,
  appleAppSiteAssociation,
  appResetRedirectUrl,
  assetLinks,
  isAppLinkPath,
} from "./app-links";

const FINGERPRINT = Array.from({ length: 32 }, () => "AB").join(":");

/** covers: spec 0033, AC-16 */
describe("isAppLinkPath", () => {
  it.each([
    "/movies/550",
    "/shows/1396",
    "/shows/1396/season/2",
    "/games/1942",
    "/movies/popular",
    "/reset-password/app",
  ])("keeps %s in the app", (path) => {
    expect(isAppLinkPath(path)).toBe(true);
  });

  it.each([
    "/",
    "/movies",
    "/movies/",
    "/watchlist",
    "/up-next",
    "/coming-soon",
    "/reset-password",
    "/reset-password/app/x",
    "/account",
  ])("leaves %s on the web", (path) => {
    expect(isAppLinkPath(path)).toBe(false);
  });
});

/** covers: spec 0033, AC-16; child 0036 */
describe("appleAppSiteAssociation", () => {
  it("names the store app and exactly the linked paths", () => {
    expect(appleAppSiteAssociation("ABCDE12345")).toEqual({
      applinks: {
        details: [
          {
            appIDs: ["ABCDE12345.com.kris1027.bestats"],
            components: [
              { "/": "/movies/*" },
              { "/": "/shows/*" },
              { "/": "/games/*" },
              { "/": "/reset-password/app" },
            ],
          },
        ],
      },
    });
  });

  it.each(["", "abcde12345", "ABCDE1234", "ABCDE123456", "ABCDE-1234"])(
    "refuses the Team ID %j",
    (teamId) => {
      expect(() => appleAppSiteAssociation(teamId)).toThrow();
    },
  );
});

/** covers: spec 0033, AC-16; child 0036 */
describe("assetLinks", () => {
  it("names the store package and the given fingerprints", () => {
    expect(assetLinks([FINGERPRINT])).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.kris1027.bestats",
          sha256_cert_fingerprints: [FINGERPRINT],
        },
      },
    ]);
  });

  it("refuses no fingerprint or a malformed one", () => {
    expect(() => assetLinks([])).toThrow();
    expect(() => assetLinks([FINGERPRINT.toLowerCase()])).toThrow();
    expect(() => assetLinks(["AB:CD"])).toThrow();
  });
});

/** covers: spec 0033, child 0036 (Password reset and deep links) */
describe("appResetRedirectUrl", () => {
  it("joins the site origin and the fixed app path", () => {
    expect(appResetRedirectUrl("https://bestats-app.vercel.app/api/v1")).toBe(
      `https://bestats-app.vercel.app${APP_RESET_PATH}`,
    );
    expect(appResetRedirectUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/reset-password/app",
    );
  });

  it.each(["", "not a url", "bestats://movies", "javascript:alert(1)"])(
    "refuses %j",
    (value) => {
      expect(appResetRedirectUrl(value)).toBeNull();
    },
  );
});

/**
 * The files are written by `pnpm app-links` in release step 6. Once they are
 * committed, they must still be exactly what the builders make from their own
 * IDs, so a path added to `isAppLinkPath` cannot be forgotten in them.
 */
describe("committed .well-known files", () => {
  const aasaPath = join(WELL_KNOWN_DIR, AASA_FILE);
  const assetPath = join(WELL_KNOWN_DIR, ASSET_LINKS_FILE);

  it("are both present or both absent", () => {
    expect(existsSync(aasaPath)).toBe(existsSync(assetPath));
  });

  it.runIf(existsSync(aasaPath) && existsSync(assetPath))(
    "match the builders (run `pnpm app-links` if this fails)",
    () => {
      const aasa = readFileSync(aasaPath, "utf8");
      const assets = readFileSync(assetPath, "utf8");
      const teamId =
        JSON.parse(aasa).applinks.details[0].appIDs[0].split(".")[0];
      const fingerprints =
        JSON.parse(assets)[0].target.sha256_cert_fingerprints;
      const expected = renderAppLinkFiles(teamId, fingerprints);
      expect(aasa).toBe(expected[AASA_FILE]);
      expect(assets).toBe(expected[ASSET_LINKS_FILE]);
    },
  );
});
