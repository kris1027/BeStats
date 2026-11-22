import { isAppLinkPath } from "@bestats/core/links/app-links";

/**
 * Where an incoming link may land (spec 0033, AC-16).
 *
 * The OS hands the app only the paths its link files declare, but the
 * `bestats://` scheme accepts anything typed or stale, so the same core list
 * decides here: a title path or `/reset-password/app` passes through with its
 * query (the reset code rides in it), and anything else opens Home rather than
 * a half matched route. Never throws, since a throw here crashes the app.
 */
export function redirectSystemPath({ path }: { path: string }): string {
  try {
    const url = new URL(path, "https://app.invalid");
    // A `bestats://movies/550` link parses with `movies` as its host.
    const pathname =
      url.protocol === "bestats:" && url.host
        ? `/${url.host}${url.pathname === "/" ? "" : url.pathname}`
        : url.pathname;
    return isAppLinkPath(pathname) ? `${pathname}${url.search}` : "/";
  } catch {
    return "/";
  }
}
