# TDD log — lucide-icons skill

## RED phase: baseline (no skill), 2026-06-04

Three subagent scenarios, no skill present.

### Scenario 1 — Figma tab bar icons (FAIL)

Prompt: plan exact `use_figma` operations for a bottom tab bar (home, search, cart,
profile), 24×24 icons.

**Observed:** Agent hand-drew all 4 icons as improvised `vectorPaths` (approximated
home/search/cart/profile path data invented on the spot). Never considered fetching a
real icon set.

**Verbatim rationalizations:**
- "the prompt gives no existing design-system component to reference"
- "vector paths are the only approach that is fully self-contained, resolution-independent"

### Scenario 2 — RN settings screen, common concepts (PASS)

Prompt: settings screen with account/cart/delivery/hours/notifications/logout icons,
`lucide-react-native`.

**Observed:** All chosen names valid (`User`, `ShoppingCart`, `Truck`, `Clock`, `Bell`,
`LogOut`, `ChevronRight`). Correct props. Common concepts are safe from memory —
the skill should NOT burden this path with ceremony.

### Scenario 3 — RN component, obscure concepts (FAIL)

Prompt: icons for salad-restaurant concepts (leafy greens, cabbage, avocado, scale,
bike delivery, gluten-free, rewards, spice level).

**Observed:**
- Invented **`Avocado`** — does not exist in Lucide (1714 icons checked). Import would
  be `undefined` at runtime.
- Picked `Vegan` for cabbage; missed `leafy-green`, which is literally tagged "cabbage".
- Rationalized the invention: "`Avocado` and `Vegan` are newer additions to lucide" —
  `Avocado` is not an addition at all; pure confabulation presented as a version caveat.

### Failure patterns to address in SKILL.md

1. **Hand-drawing icon vectors in Figma** instead of inserting real Lucide SVGs
2. **Guessing icon names from memory** for non-common concepts → invented exports
3. **Confabulated justifications** ("newer addition", "no design system available")
   that make the error look like a known limitation

## GREEN phase: verification with skill (2026-06-04)

Same scenarios rerun with SKILL.md loaded and `references/` available.

### Scenario 1 rerun — Figma tab bar (PASS)

- Fetched real SVGs via `curl -sL https://unpkg.com/lucide-static/icons/<name>.svg`
  for `house`, `search`, `shopping-cart`, `user` — all names grep-verified in index first
- Zero hand-drawn paths; path data byte-identical to lucide-static v1.17.0
- Themed by replacing only `stroke="currentColor"` (active `#16A34A` / inactive
  `#9CA3AF`); active state via stroke color, not a filled icon swap
- Kept native 24×24 frame, uniform stroke-width 2

### Scenario 3 rerun — obscure concepts (PASS)

- Grepped the index for every concept; **zero invented names**
- `avocado`: confirmed absent → documented fallback to `cherry` per the skill's
  nearest-concept rule (baseline had invented `Avocado` + fake version caveat)
- `cabbage` → `leafy-green` via tag match (baseline missed this)
- `loyalty` → `stamp` via tag match — better than baseline's generic `Award`
- All 8 names verified against the index with line numbers cited

### REFACTOR

No new rationalizations surfaced; no loopholes to close in this round.

## REFACTOR round 2 — production test in Claude app (2026-06-04)

User ran the skill in the Claude app against a real Figma file (`use_figma`).

**Findings:**
- ❌ `fetch('https://unpkg.com/...')` **inside** `use_figma` fails — `'fetch' is not
  defined`. The Figma plugin sandbox has no network. All 6 attempted icons failed.
- ✅ `figma.createNodeFromSvg(svgString)` with canonical lucide-static markup
  (`currentColor` string-replaced with brand color) inserted and rendered correctly;
  `node.rescale()` scaling works.
- ✅ All renamed icon names in the skill verified current (`house`, `funnel`,
  `circle-question-mark`, `pencil`, `trash-2`, `leafy-green`, `share-2`).

**Fixes applied (v1.1):**
1. Figma section step 1 rewritten: SVG source is resolved OUTSIDE `use_figma`
   (bundled file first, agent's own HTTP/shell tool second); explicit warning that
   `fetch` is `undefined` in the plugin sandbox.
2. **SVGs bundled in the repo** (`references/icons/*.svg`, 1714 files) — offline
   fallback so a client with no network and no shell still has a valid path.
   `build-index.mjs` extended to extract them from the same tarball.
3. Theming/inserting/scaling steps name exact APIs: string-replace `currentColor`
   pre-insert; `createNodeFromSvg` returns a FRAME (strokes go on vector children);
   `node.rescale(targetPx / node.height)`.
4. Red-flags table: removed false "CDN is always available" claim; added sandbox-fetch
   and no-network rationalizations observed in the production run.

## REFACTOR round 3 — second production test in Claude app (2026-06-04)

Rerun of the Figma-only session against v1.1.

**Findings:**
- ✅ Skill text correct; insert path verified again (6 icons via `createNodeFromSvg`
  + `rescale(30)` + `currentColor` replace — test frame 143:198)
- ✅ Regression confirmed: `fetch` still `undefined` in `use_figma` — warning needed
- ❌ Remaining gap: a session with ONLY Figma tools (no shell, no HTTP, no file-read)
  cannot reach SVG bytes at all — the test passed only because the agent had the SVG
  markup in context. For such agents the SVG must arrive **through the skill text**.

**Fixes applied (v1.2):**
1. **Inline evergreen SVGs in SKILL.md** — all 35 evergreen icons embedded as
   minified canonical SVG (generated between markers by `build-index.mjs`, ~9 KB).
   Context-only agents get the common set for free; for non-evergreen icons the rule
   is "ask the user to paste the SVG; do not hand-draw".
2. **Consistency gate in `build-index.mjs`** — build fails if any index entry lacks
   an SVG file (or vice versa), and if any evergreen name disappears from Lucide
   (rename protection). Verified current state: 1714/1714, zero mismatches.
3. Figma step 1 documents the third environment tier explicitly:
   file-read → CDN via shell → inline set → ask user. Hand-drawing is never a tier.

## REFACTOR round 4 — third production test in Claude app (2026-06-04)

**Findings:**
- ✅ All 35 inline evergreen icons rendered via `createNodeFromSvg` (test frame
  146:198) — the no-network/no-file-read path works end-to-end
- ⚠️ Inline set missed common mobile-nav names the tested app actually uses
  (`layout-grid`, `shopping-bag`, `package`, `funnel`, `circle-question-mark`)

**Fixes applied (v1.3):**
1. Evergreen set 35 → 42: added `shopping-bag`, `layout-grid`, `grid-2x2`, `layers`,
   `package`, `funnel`, `circle-question-mark` (all index-verified)
2. `references/icons-all.md` — single-file bundle of ALL 1714 SVGs (~640 KB), meant
   to be attached as a Claude app Project knowledge file so context-only agents can
   retrieve ANY icon (user request: "add all icons"; inlining all into SKILL.md is
   not viable — ~175k tokens would swamp every session's context)
3. SKILL.md note: project-level skills may extend the inline block with domain icons
4. README: Claude app setup section (SKILL.md paste + icons-all.md attachment)

### Maintainer self-test bonus

While writing the skill's own "evergreen" list from memory, 2 of 37 names were stale
(`filter` → `funnel`, `circle-help` → `circle-question-mark`) — caught by verifying
against the index. Added the rename-awareness paragraph to SKILL.md as a result.
