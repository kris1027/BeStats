/**
 * Reads custom property values out of the `:root` block of a stylesheet, for
 * the site card, which renders outside the browser and cannot resolve
 * `var(--x)` (spec 0016, AC-19).
 *
 * `app/globals.css` is the only place a colour value may be written
 * (`AGENTS.md`, the Tailwind v4 note), so the card reads its colours from
 * there instead of repeating them. A missing token throws, which fails the
 * build rather than shipping a card in a guessed colour.
 *
 * @param css The stylesheet text.
 * @param names Custom property names, with their leading `--`.
 */
export function rootTokens<Name extends string>(
  css: string,
  names: readonly Name[],
): Record<Name, string> {
  const block = rootBlock(css);
  const tokens = {} as Record<Name, string>;
  for (const name of names) {
    const match = new RegExp(
      `(?:^|[;{\\s])${escapeRegExp(name)}\\s*:\\s*([^;]+);`,
    ).exec(block);
    const value = match?.[1].trim();
    if (!value) {
      throw new Error(
        `The :root block of the stylesheet has no ${name} token.`,
      );
    }
    tokens[name] = value;
  }
  return tokens;
}

/** The body of the first top level `:root { ... }` rule. */
function rootBlock(css: string): string {
  const match = /(?:^|\n)\s*:root\s*\{([^}]*)\}/.exec(css);
  if (!match) throw new Error("The stylesheet has no :root block.");
  return match[1];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
