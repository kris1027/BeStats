import {
  APP_BUNDLE_ID,
  APP_LINK_HOST,
  APP_LINK_TITLE_PREFIXES,
  APP_RESET_PATH,
} from "@bestats/core/links/app-links";
import type { ConfigContext, ExpoConfig } from "expo/config";
import appConfig from "../../app.config";
import appJson from "../../app.json";
import easJson from "../../eas.json";
import { redirectSystemPath } from "../app/+native-intent";

/** covers: spec 0033, AC-16 */
describe("redirectSystemPath", () => {
  it.each([
    ["bestats://movies/550", "/movies/550"],
    ["bestats://shows/1396/season/2", "/shows/1396/season/2"],
    ["bestats://games/1942", "/games/1942"],
    ["https://bestats-app.vercel.app/movies/550", "/movies/550"],
    ["/shows/1396", "/shows/1396"],
    [
      "https://bestats-app.vercel.app/reset-password/app?code=abc",
      "/reset-password/app?code=abc",
    ],
    ["bestats://reset-password/app?code=abc", "/reset-password/app?code=abc"],
  ])("opens %s at %s", (path, expected) => {
    expect(redirectSystemPath({ path })).toBe(expected);
  });

  it.each([
    "bestats://library",
    "bestats://up-next",
    "https://bestats-app.vercel.app/account",
    "/reset-password",
    "bestats://",
    "",
  ])("sends %j home", (path) => {
    expect(redirectSystemPath({ path })).toBe("/");
  });
});

/**
 * The OS opens only what `app.json` declares, and the router only what core
 * allows, so the two lists must be the same one (spec 0033, AC-16).
 */
describe("app.json link config", () => {
  it("uses core's bundle ID, which both link files name", () => {
    expect(appJson.expo.ios.bundleIdentifier).toBe(APP_BUNDLE_ID);
    expect(appJson.expo.android.package).toBe(APP_BUNDLE_ID);
  });

  it("associates the production host on iOS", () => {
    expect(appJson.expo.ios.associatedDomains).toEqual([
      `applinks:${APP_LINK_HOST}`,
    ]);
  });

  it("verifies exactly the core paths on Android", () => {
    const [filter] = appJson.expo.android.intentFilters;
    expect(filter.autoVerify).toBe(true);
    expect(filter.data).toEqual([
      ...APP_LINK_TITLE_PREFIXES.map((pathPrefix) => ({
        scheme: "https",
        host: APP_LINK_HOST,
        pathPrefix,
      })),
      { scheme: "https", host: APP_LINK_HOST, path: APP_RESET_PATH },
    ]);
  });
});

/**
 * Both config suites set `APP_VARIANT`, so each test gets back whatever the
 * shell started with.
 */
const startingVariant = process.env.APP_VARIANT;
afterEach(() => {
  if (startingVariant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = startingVariant;
});

/** The config `app.config.ts` returns for a variant, or for none. */
function configForVariant(variant?: "personal"): ExpoConfig {
  if (variant === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = variant;
  return appConfig({ config: appJson.expo } as unknown as ConfigContext);
}

/**
 * covers: prompts/mobile-deep-links.md, AC-1
 *
 * A free Apple team cannot sign the associated domains entitlement, so the
 * personal build must drop it while the store build keeps it.
 */
describe("app.config.ts variants", () => {
  it("keeps the associated domains without a variant", () => {
    expect(configForVariant().ios?.associatedDomains).toEqual([
      `applinks:${APP_LINK_HOST}`,
    ]);
  });

  it("carries the build's commit SHA in both variants", () => {
    // prompts/mobile-cache-buster-build-id.md: the query cache buster reads it
    expect(configForVariant().extra?.buildId).toMatch(/^[0-9a-f]{4,40}$/);
    expect(configForVariant("personal").extra?.buildId).toBe(
      configForVariant().extra?.buildId,
    );
    expect(configForVariant().extra?.eas).toEqual(appJson.expo.extra.eas);
  });

  it("has no associated domains in the personal variant", () => {
    const config = configForVariant("personal");
    expect(config.ios?.associatedDomains).toBeUndefined();
    expect(config.ios?.bundleIdentifier).not.toBe(APP_BUNDLE_ID);
  });
});

/**
 * covers: prompts/mobile-release-prep.md, AC-1 and AC-2
 *
 * An update reaches a build only through its channel, and only the store build
 * may call Expo, since the personal build has no channel and no EAS project.
 */
describe("EAS Update config", () => {
  it("checks EAS Update in the store build only", () => {
    const store = configForVariant();
    expect(store.updates?.url).toMatch(/^https:\/\/u\.expo\.dev\//);
    expect(store.updates?.enabled).not.toBe(false);
    expect(store.runtimeVersion).toEqual({ policy: "appVersion" });

    expect(configForVariant("personal").updates?.enabled).toBe(false);
  });

  it("gives every EAS build profile its own update channel", () => {
    for (const [name, profile] of Object.entries(easJson.build)) {
      expect({ name, channel: profile.channel }).toEqual({
        name,
        channel: name,
      });
    }
  });
});
