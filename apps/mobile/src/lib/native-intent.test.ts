import {
  APP_LINK_HOST,
  APP_LINK_TITLE_PREFIXES,
  APP_RESET_PATH,
} from "@bestats/core/links/app-links";
import appJson from "../../app.json";
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
