# lucide-icons — Claude skill

Teach AI agents (Claude Code, Claude app) to use **real [Lucide](https://lucide.dev) icons**
in generated Figma designs and frontend code — instead of hand-drawing icon shapes or
inventing icon names that don't exist.

## The problem

Without this skill, agents asked to produce UI with icons reliably fail in two ways
(reproduced in baseline tests, see [`docs/testing.md`](docs/testing.md)):

1. **Figma generation:** the agent improvises icon vector paths from scratch — the
   result looks amateurish and is inconsistent across icons.
2. **Code:** for anything beyond the ~30 most common concepts, the agent guesses
   icon names from memory — e.g. importing `Avocado` from `lucide-react-native`,
   which does not exist, and shipping a runtime error wrapped in a fake
   "version caveat".

## What the skill does

- **Verified name resolution:** ships `references/icon-index.md`, a generated catalog
  of all ~1700 Lucide icons with official tags (synonyms) and categories. The rule:
  *an icon name is only valid if it's in the index.* Concepts resolve via grep —
  "cabbage" finds `leafy-green` through its tags.
- **Figma:** insert the real SVG (bundled in `references/icons/`, or fetched from
  `unpkg.com/lucide-static/icons/<name>.svg`) via `figma.createNodeFromSvg` — never
  hand-draw, and never `fetch()` inside the plugin sandbox (it has no network).
- **Code:** correct packages (`lucide-react-native`, `lucide-react`, `lucide-static`),
  PascalCase conversion rules, theming via props.
- **Consistency rules:** one icon set per design, uniform stroke width, standard sizes.
- **Rename awareness:** Lucide renames icons over time (`filter` → `funnel`,
  `home` → `house`) — the index reflects the current truth.

## Setup — Claude Code

**Global (all projects on the machine) — recommended:**

```bash
git clone https://github.com/sandi763009/lucide-icons-skill ~/.claude/skills/lucide-icons
```

Windows (PowerShell):

```powershell
git clone https://github.com/sandi763009/lucide-icons-skill "$env:USERPROFILE\.claude\skills\lucide-icons"
```

**Per-project only** (checked into the repo, shared with the team):

```bash
git clone https://github.com/sandi763009/lucide-icons-skill .claude/skills/lucide-icons
```

That's it — no config, no dependencies. Claude Code discovers the skill automatically
and activates it whenever a task involves icons (Figma generation, UI screens,
lucide-react/-native imports). In Claude Code the agent has file access, so it uses
the full 1714-icon index and bundled SVGs; no network needed (the unpkg CDN is an
optional alternative source).

**Verify it works:** ask Claude Code for a component with icons for some obscure
concept (e.g. "cabbage" or "gluten-free") — it should grep the index and pick
`leafy-green` / `wheat-off` instead of inventing names.

**Update later:** `git -C ~/.claude/skills/lucide-icons pull`

## Structure

```
lucide-icons/
├── SKILL.md                  # the skill (what agents read)
├── references/
│   ├── icon-index.md         # generated: name | tags | categories (~1700 icons)
│   └── icons/                # generated: all SVG sources (offline fallback, ~670 KB)
├── scripts/
│   └── build-index.mjs       # maintainer-only regenerator (no deps, Node 18+)
└── docs/
    ├── design.md             # design document
    └── testing.md            # TDD log: baseline failures, verification, production fixes
```

## Setup — Claude app (claude.ai, no file access)

Claude app sessions that expose only MCP tools (e.g. Figma) can't read the skill's
files, so the skill content must arrive through Project instructions + knowledge:

1. **Create a Project** (left sidebar → Projects → New project) — requires a paid plan
   (Pro/Max/Team).
2. **Instructions:** open
   `https://raw.githubusercontent.com/sandi763009/lucide-icons-skill/main/SKILL.md`,
   copy the **entire content** and paste it into the Project's Instructions.
   ⚠️ Pasting just the URL does NOT work — the app never fetches links from
   instructions; the agent would see one line of text instead of the skill.
   The inline block at the bottom carries 42 common icons straight into context.
3. **Knowledge:** on the Project page, in the Files panel (right side) click **“+”** →
   either **GitHub** (connect this repo and select `references/icons-all.md` — stays
   in sync with updates) or **Upload from device** (`references/icons-all.md`, ~640 KB;
   rename to `.txt` if `.md` is rejected). Don't paste it as text — it usually exceeds
   the paste limit. This file carries **all ~1700 SVG sources** (one per line,
   `name: <svg>`), so the agent can retrieve any icon without network or file access.
4. Start every icon-related chat **inside that Project**.

**Verify it works:** in a new Project chat ask the agent to insert a row of icons
into Figma, mixing an inline name (`house`) with non-inline ones (`salad`, `citrus`,
`leafy-green`) — the latter must come from the knowledge file, with no request to
paste SVGs and no hand-drawn paths.

## Updating the index

When Lucide ships new icons:

```bash
node scripts/build-index.mjs
```

Downloads the current lucide repo tarball, parses every icon's metadata, regenerates
`references/icon-index.md` and `references/icons/*.svg`. Commit the result.

## License

Skill content: MIT. Lucide icons and metadata: [ISC](https://github.com/lucide-icons/lucide/blob/main/LICENSE),
© Lucide Contributors — this skill links to Lucide's CDN and republishes only icon
names/tags for search purposes.
