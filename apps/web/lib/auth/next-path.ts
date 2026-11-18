/**
 * The one place a redirect target is judged safe (spec 0005, AC-11).
 *
 * Every auth journey carries a `next` value through query strings, hidden form
 * fields and an email link, and each hop is a separate opportunity for an open
 * redirect. Validating once at the start of the journey would be worthless,
 * because the value is re-read from an attacker-reachable surface at every hop.
 * So this is called at each read, not once.
 *
 * The rule is deliberately narrow rather than clever: exactly one leading
 * forward slash, and a second character that is neither a slash nor a
 * backslash. That rejects an absolute URL (`https://evil.example`), a protocol
 * relative value (`//evil.example`), the backslash forms browsers normalise to
 * a protocol relative URL (`/\evil.example`, `\/\/evil.example`), and a bare
 * relative value (`shows`) which would resolve against whatever page is
 * current. Anything rejected falls back to `/shows` at the call site.
 *
 * Control characters are refused outright, before the slash checks. The URL
 * parser silently deletes tab, line feed and carriage return wherever they
 * appear, so `/\t/evil.example` passes a character by character check and
 * then resolves to `//evil.example`. No real BeStats path contains one.
 *
 * @param value The candidate path, usually straight off a query string.
 * @returns Whether it may be used as a redirect target.
 */
export function isSafeNextPath(
  value: string | null | undefined,
): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value[0] !== "/") return false;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
  if (/[\u0000-\u001F\u007F]/.test(value)) return false;

  // A single slash on its own is the site root, which is safe.
  if (value.length === 1) return true;

  const second = value[1];
  return second !== "/" && second !== "\\";
}

/** Where a person lands when no usable `next` value came along. */
export const DEFAULT_SIGNED_IN_PATH = "/shows";

/**
 * Resolves a `next` value to the path to actually redirect to.
 *
 * Wrapping the check and the fallback together is what stops a caller from
 * validating and then forgetting the else branch.
 *
 * @param value The candidate path.
 * @returns The candidate when it passes, otherwise `/shows`.
 */
export function safeNextPath(value: string | null | undefined): string {
  return isSafeNextPath(value) ? value : DEFAULT_SIGNED_IN_PATH;
}
