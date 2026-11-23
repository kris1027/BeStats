#!/usr/bin/env node
/**
 * build-index.mjs — regenerates references/icon-index.md AND references/icons/*.svg
 * from the lucide repo.
 *
 * Maintainer-only script. Skill users never run this.
 * Dependency-free: fetch + zlib + a minimal tar reader.
 *
 * Usage: node scripts/build-index.mjs
 */
import { gunzipSync } from 'node:zlib';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARBALL_URL = 'https://github.com/lucide-icons/lucide/archive/refs/heads/main.tar.gz';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF_DIR = join(ROOT, 'references');
const OUT = join(REF_DIR, 'icon-index.md');
const ICONS_DIR = join(REF_DIR, 'icons');
const SKILL_MD = join(ROOT, 'SKILL.md');

// Inlined into SKILL.md for agents with no network AND no file-read tool
// (e.g. a Claude app session exposing only Figma MCP tools).
// Keep in sync with the evergreen list in SKILL.md §"Resolving".
const EVERGREEN = [
  'house', 'search', 'shopping-cart', 'shopping-bag', 'user', 'settings', 'bell',
  'heart', 'star', 'plus', 'minus', 'x', 'check', 'chevron-right', 'chevron-left',
  'chevron-down', 'chevron-up', 'arrow-right', 'arrow-left', 'menu', 'trash-2',
  'pencil', 'eye', 'lock', 'mail', 'phone', 'calendar', 'clock', 'map-pin', 'camera',
  'log-out', 'info', 'circle-alert', 'circle-question-mark', 'share-2', 'download',
  'upload', 'layout-grid', 'grid-2x2', 'layers', 'package', 'funnel',
];

console.log('Downloading lucide tarball...');
const res = await fetch(TARBALL_URL, { redirect: 'follow' });
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
const tar = gunzipSync(Buffer.from(await res.arrayBuffer()));
console.log(`Tarball extracted: ${(tar.length / 1024 / 1024).toFixed(1)} MB`);

// Minimal tar reader: 512-byte headers, name at 0..100, size (octal) at 124..136.
const icons = new Map(); // name -> { tags, categories }
const svgs = new Map();  // name -> svg source
let offset = 0;
while (offset + 512 <= tar.length) {
  const name = tar.subarray(offset, offset + 100).toString('utf8').replace(/\0.*$/, '');
  const sizeField = tar.subarray(offset + 124, offset + 136).toString('utf8').replace(/[\0 ]/g, '');
  const size = sizeField ? parseInt(sizeField, 8) : 0;
  offset += 512;
  if (name) {
    const m = name.match(/^[^/]+\/icons\/([a-z0-9-]+)\.(json|svg)$/);
    if (m && m[2] === 'json') {
      try {
        const meta = JSON.parse(tar.subarray(offset, offset + size).toString('utf8'));
        icons.set(m[1], {
          tags: Array.isArray(meta.tags) ? meta.tags : [],
          categories: Array.isArray(meta.categories) ? meta.categories : [],
        });
      } catch (e) {
        console.warn(`Skipping ${m[1]}: ${e.message}`);
      }
    } else if (m && m[2] === 'svg') {
      svgs.set(m[1], tar.subarray(offset, offset + size).toString('utf8'));
    }
  }
  offset += Math.ceil(size / 512) * 512;
}

if (icons.size < 1000) throw new Error(`Only ${icons.size} icons parsed — tarball layout changed?`);

// Consistency gate: every index entry must have an SVG and vice versa,
// otherwise grep finds a name with no file (or a file no one can discover).
const noSvg = [...icons.keys()].filter((n) => !svgs.has(n));
const noMeta = [...svgs.keys()].filter((n) => !icons.has(n));
if (noSvg.length || noMeta.length) {
  throw new Error(`Index/SVG mismatch — no SVG: [${noSvg}], no metadata: [${noMeta}]`);
}
const missingEvergreen = EVERGREEN.filter((n) => !svgs.has(n));
if (missingEvergreen.length) {
  throw new Error(`Evergreen names missing from Lucide (renamed?): [${missingEvergreen}]`);
}

const today = new Date().toISOString().slice(0, 10);
const lines = [
  '# Lucide icon index',
  '',
  `Generated ${today} from https://github.com/lucide-icons/lucide (${icons.size} icons).`,
  'Regenerate with: `node scripts/build-index.mjs`',
  '',
  'Format: `icon-name | synonyms/tags | categories`',
  '',
  'Resolve a concept by grepping this file for the concept word (English).',
  'The icon NAME is always the first column — tags are search aliases only.',
  'PascalCase for code imports: `shopping-cart` -> `ShoppingCart`, `a-arrow-down` -> `AArrowDown`.',
  '',
];
for (const name of [...icons.keys()].sort()) {
  const { tags, categories } = icons.get(name);
  lines.push(`${name} | ${tags.join(', ')} | ${categories.join(', ')}`);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`Wrote ${OUT} (${icons.size} icons)`);

// Bundle SVGs — offline fallback for environments with no network access
// (e.g. the Figma plugin sandbox has no fetch; some clients have no shell either).
mkdirSync(ICONS_DIR, { recursive: true });
let written = 0;
for (const [name, svg] of svgs) {
  writeFileSync(join(ICONS_DIR, `${name}.svg`), svg);
  written++;
}
console.log(`Wrote ${written} SVGs to ${ICONS_DIR}`);

// Single-file bundle of ALL icons — for Claude app Projects (attach as knowledge
// file so a no-file-read, no-network agent can retrieve any icon's SVG).
const minify = (svg) => svg.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
const allLines = [
  '# Lucide — all icon SVG sources',
  '',
  `Generated ${today} (${svgs.size} icons). One per line: \`name: <svg>\`.`,
  'Replace `stroke="currentColor"` with the design color before inserting.',
  '',
];
for (const name of [...svgs.keys()].sort()) allLines.push(`${name}: ${minify(svgs.get(name))}`);
writeFileSync(join(REF_DIR, 'icons-all.md'), allLines.join('\n') + '\n');
console.log(`Wrote references/icons-all.md (${svgs.size} icons)`);

// Regenerate the inline evergreen SVG block inside SKILL.md (between markers).
const block = EVERGREEN.map((n) => `${n}: ${minify(svgs.get(n))}`).join('\n');
const START = '<!-- EVERGREEN-SVGS:START (generated by scripts/build-index.mjs — do not edit by hand) -->';
const END = '<!-- EVERGREEN-SVGS:END -->';
const skill = readFileSync(SKILL_MD, 'utf8');
const si = skill.indexOf(START);
const ei = skill.indexOf(END);
if (si === -1 || ei === -1) throw new Error('EVERGREEN-SVGS markers not found in SKILL.md');
writeFileSync(SKILL_MD, skill.slice(0, si + START.length) + '\n```\n' + block + '\n```\n' + skill.slice(ei));
console.log(`Inlined ${EVERGREEN.length} evergreen SVGs into SKILL.md`);
