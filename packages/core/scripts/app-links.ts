import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { appleAppSiteAssociation, assetLinks } from "../src/links/app-links.ts";

/**
 * `pnpm app-links --apple-team-id <id> --android-sha256 <fp>`: writes the two
 * link verification files into the web's `public/.well-known/` (spec 0033,
 * child 0036). They are generated rather than hand written because their IDs
 * exist only after the Apple and Google accounts do (release step 6), and the
 * paths must stay the ones `isAppLinkPath` allows
 * (prompts/mobile-deep-links.md, decision 1). `src/links/app-links.test.ts`
 * checks that committed files still match the builders.
 */
export const WELL_KNOWN_DIR = fileURLToPath(
  new URL("../../../apps/web/public/.well-known", import.meta.url),
);

/** The Apple file has no extension; `next.config.ts` serves it as JSON. */
export const AASA_FILE = "apple-app-site-association";
export const ASSET_LINKS_FILE = "assetlinks.json";

/** Both files' text, two space JSON with a final newline. */
export function renderAppLinkFiles(
  teamId: string,
  fingerprints: readonly string[],
): Record<string, string> {
  return {
    [AASA_FILE]: `${JSON.stringify(appleAppSiteAssociation(teamId), null, 2)}\n`,
    [ASSET_LINKS_FILE]: `${JSON.stringify(assetLinks(fingerprints), null, 2)}\n`,
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      "apple-team-id": { type: "string" },
      "android-sha256": { type: "string", multiple: true },
      out: { type: "string" },
    },
  });
  const teamId = values["apple-team-id"];
  const fingerprints = values["android-sha256"] ?? [];
  if (!teamId || fingerprints.length === 0) {
    console.error(
      "Usage: pnpm app-links --apple-team-id <TEAMID> --android-sha256 <AA:BB:...> [--android-sha256 <...>] [--out <dir>]",
    );
    process.exit(1);
  }
  const out = values.out ?? WELL_KNOWN_DIR;
  mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(
    renderAppLinkFiles(teamId, fingerprints),
  )) {
    writeFileSync(join(out, name), text);
    console.log(`Wrote ${join(out, name)}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
