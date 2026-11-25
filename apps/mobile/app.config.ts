import { execFileSync } from "node:child_process";
import type { ConfigContext, ExpoConfig } from "expo/config";

/** The bundle ID a free Apple ID signs for the owner's own phone. */
const PERSONAL_BUNDLE_ID = "com.kris1027.bestats.personal";

/**
 * The short commit SHA this build is made from, or `undefined` where git is
 * unavailable. The app adds it to the query cache's buster, so a build of the
 * same `version` from a newer commit never reads an older build's saved
 * answers, whose shape it may not expect (prompts/mobile-cache-buster-build-id.md).
 * A commit SHA is public repository metadata, not a secret (AGENTS.md
 * section 11).
 */
export function gitBuildId(): string | undefined {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha === "" ? undefined : sha;
  } catch {
    return undefined;
  }
}

/**
 * Starts from `app.json` and, only when `APP_VARIANT=personal`, swaps its iOS
 * bundle ID for a personal one. The home screen name stays "BeStats", since
 * the owner wants the app named as the product; only the hidden ID differs.
 *
 * Why: `com.kris1027.bestats` is permanent once it reaches the store
 * (apps/mobile/AGENTS.md, Building with EAS), and a free personal team that
 * registers it could keep the paid team from claiming it. A separate ID lets a
 * personal Release build sit beside the store app (prompts/
 * mobile-personal-release-build.md). Without the variable the config is
 * `app.json` plus `extra.buildId` (`gitBuildId`), so the simulator, EAS and
 * the tests are otherwise unchanged.
 * `APP_VARIANT` is not a secret and never reaches the bundle (AGENTS.md
 * section 11).
 *
 * The personal variant also drops `associatedDomains`: a free Apple team
 * cannot sign that entitlement, so the build would fail, and Universal Links
 * only verify for the store app ID anyway (prompts/mobile-deep-links.md,
 * decision 4).
 *
 * It also turns EAS Update off: Xcode builds it, not EAS, so it carries no
 * channel and could never receive an update, and with updates off it never
 * calls Expo's servers at all (prompts/mobile-release-prep.md, decision 4).
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const configured = config as ExpoConfig;
  const buildId = gitBuildId();
  const base: ExpoConfig =
    buildId === undefined
      ? configured
      : { ...configured, extra: { ...configured.extra, buildId } };
  if (process.env.APP_VARIANT !== "personal") return base;
  return {
    ...base,
    ios: {
      ...base.ios,
      bundleIdentifier: PERSONAL_BUNDLE_ID,
      associatedDomains: undefined,
    },
    updates: { ...base.updates, enabled: false },
  };
};
