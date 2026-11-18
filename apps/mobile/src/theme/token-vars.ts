import { TOKENS } from "@bestats/core/tokens.generated";

/**
 * The web's colour tokens as the CSS variables `src/global.css` points its
 * `@theme` names at (spec 0034, Design tokens). The values come only from
 * `tokens.generated.ts`, the copy `pnpm tokens` writes from the web's
 * `globals.css`, so the app never holds a colour of its own. React Native
 * cannot draw oklch, so those page wash tokens are left out here and in
 * `global.css` alike (`token-vars.test.ts` checks the two match).
 */
export const TOKEN_VARS: Record<`--${string}`, string> = Object.fromEntries(
  Object.entries(TOKENS)
    .filter(
      ([name, value]) => name.startsWith("color-") && !value.includes("oklch"),
    )
    .map(([name, value]) => [`--bs-${name}`, value]),
);

/**
 * A token's raw value, for the few props that take a colour, not a class
 * (such as `placeholderTextColor`). It reads the generated copy so no colour
 * value is ever written in the app (AGENTS.md section 3; Commands and repo
 * facts, the token rule).
 */
export function tokenColor(name: keyof typeof TOKENS): string {
  return TOKENS[name];
}
