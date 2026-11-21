import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * covers: spec 0033, AC-14 (the About screen's logos are the official files)
 *
 * TMDB's and IGDB's terms forbid altering their logos. The app's copies sit
 * in `assets/legal/` and must stay byte for byte the files the web serves;
 * these are the same hashes `apps/web/components/layout/tmdb-logo.test.ts`
 * and `igdb-logo.test.ts` record, so a recolour or a reformat fails here.
 */
const LOGOS = {
  "tmdb-logo.svg":
    "8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c",
  "igdb-logo.svg":
    "5269511c541a125f7dd8c71990e0c86ff4a6881be29ad8bd81e1ae4fe83527df",
};

test.each(Object.entries(LOGOS))("%s is the official file", (name, hash) => {
  const path = fileURLToPath(
    new URL(`../../assets/legal/${name}`, import.meta.url),
  );
  expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(
    hash,
  );
});
