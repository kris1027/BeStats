import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * covers: prompts/mobile-web-parity-foundation.md, requirement 2 (every
 * glass surface goes through `GlassPlate`) and decision 8 (every text in
 * Inter). React Native has no style inheritance, so a screen that imports
 * `Text` straight from react-native draws in the system font, and one that
 * imports `BlurView` itself skips the Android and Reduce Transparency
 * fallback. Test files may do either.
 */
const SRC = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path),
  text: readFileSync(path, "utf8"),
}));

test("only components/glass imports expo-blur", () => {
  const offenders = FILES.filter(
    ({ path, text }) =>
      !path.startsWith("components/glass/") && /from "expo-blur"/.test(text),
  ).map(({ path }) => path);
  expect(offenders).toEqual([]);
});

test("only components/text.tsx imports Text or TextInput from react-native", () => {
  const offenders = FILES.filter(({ path, text }) => {
    if (path === "components/text.tsx") return false;
    return [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"react-native"/g)]
      .flatMap((match) => match[1].split(","))
      .map((name) => name.trim())
      .some((name) => name === "Text" || name === "TextInput");
  }).map(({ path }) => path);
  expect(offenders).toEqual([]);
});

/**
 * covers: decision 10. A screen that buzzes on its own would buzz on the
 * optimistic step or twice for one write; `lib/haptics.ts`, fired from
 * `useTrackingWrite`, is the one caller.
 */
test("only lib/haptics.ts imports expo-haptics", () => {
  const offenders = FILES.filter(
    ({ path, text }) =>
      path !== "lib/haptics.ts" && /from "expo-haptics"/.test(text),
  ).map(({ path }) => path);
  expect(offenders).toEqual([]);
});

/**
 * covers: decision 9. The app draws the web's icon set; `components/icons`
 * is the one place an icon enters, so a stray lucide import is caught here.
 */
test("only components/icons imports lucide-react-native", () => {
  const offenders = FILES.filter(
    ({ path, text }) =>
      !path.startsWith("components/icons/") &&
      /from "lucide-react-native"/.test(text),
  ).map(({ path }) => path);
  expect(offenders).toEqual([]);
});
