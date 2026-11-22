import type { ConfigContext, ExpoConfig } from "expo/config";

/** The bundle ID a free Apple ID signs for the owner's own phone. */
const PERSONAL_BUNDLE_ID = "com.kris1027.bestats.personal";

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
 * exactly `app.json`, so the simulator, EAS and the tests are unchanged.
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
  const base = config as ExpoConfig;
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
