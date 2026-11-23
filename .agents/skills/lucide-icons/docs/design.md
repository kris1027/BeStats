# lucide-icons skill — Design Document

**Date:** 2026-06-04
**Status:** Approved (brainstorming phase complete)
**Author:** Boris + Claude

## Problem

When AI agents (Claude Code, Claude app) generate UI designs in Figma or write frontend
code, icons are their weakest point. Without guidance, agents:

- draw improvised icon-like shapes from primitives (circles, lines) that look amateurish
- invent icon component names that don't exist in any library
- leave placeholder rectangles labeled "icon"
- mix icon styles (Material + Feather + emoji) within one design

Lucide (https://github.com/lucide-icons/lucide) is the de-facto standard open-source icon
set (~1600 icons, ISC license, `lucide-react`, `lucide-react-native`, `lucide-static`
packages). No existing Claude skill teaches systematic Lucide usage across design + code.

## Goal

A public Claude skill that makes agents use **real Lucide icons** consistently in:

1. **Figma design generation** — insert actual SVG vectors via Figma MCP (`use_figma`),
   themed to the design's palette
2. **Code** — correct imports/props for `lucide-react-native` (RN/Expo) and
   `lucide-react` (web)

One concept→icon mapping shared across all outputs.

## Non-goals

- Supporting other icon sets (Material, Heroicons) — single-set consistency is a feature
- Runtime helper scripts for the skill user (knowledge-only skill; the only script is the
  index generator, run by maintainers)

> **Decision reversed 2026-06-04 (v1.1):** SVGs ARE now bundled in `references/icons/`
> (1714 files, ~670 KB). A production test in the Claude app proved `fetch` is
> `undefined` inside the `use_figma` plugin sandbox, and some clients have no shell
> tool either — without a bundled copy the agent has no valid path and is forced to
> hand-draw, the exact failure the skill forbids. CDN remains the alternative.

## Architecture

```
lucide-icons/
├── SKILL.md                  # main instructions (English), loaded by agents
├── references/
│   └── icon-index.md         # generated catalog: name | tags | category (~1600 rows)
├── scripts/
│   └── build-index.mjs       # maintainer-only: regenerates icon-index.md from lucide repo
├── docs/
│   ├── design.md             # this document
│   └── testing.md            # TDD log: baseline failures + verification results
├── README.md                 # public docs, installation
└── LICENSE
```

### Data flow at usage time

1. Agent reads SKILL.md (triggered by icon-related design/code work)
2. Agent greps/reads `references/icon-index.md` to resolve concept → icon name
   (index includes official Lucide tags as synonyms, e.g. `shopping-cart | trolley,
   cart, basket, e-commerce, store, purchase | shopping`)
3. **Figma path:** fetch `https://unpkg.com/lucide-static/icons/<name>.svg`
   (HTTP redirect — must follow), insert SVG as vector via `use_figma`, set size/color
   from the design theme
4. **Code path:** import from `lucide-react-native` / `lucide-react` with PascalCase
   name (`shopping-cart` → `ShoppingCart`), use `size`/`color`/`strokeWidth` props

### Index generation (maintainer-only)

`scripts/build-index.mjs`:
- downloads `https://github.com/lucide-icons/lucide/archive/refs/heads/main.tar.gz` once
- parses every `icons/<name>.json` (fields: `tags[]`, `categories[]`)
- emits `references/icon-index.md` as pipe-delimited lines, grouped by category
- re-run on Lucide releases to refresh; output is committed

## Key technical facts (verified 2026-06-04)

- `icons/<name>.json` in the lucide repo contains `tags` (synonyms) and `categories`
- `unpkg.com/lucide-static/icons/<name>.svg` returns 302 → versioned URL; `curl -L` needed
- SVG format: 24×24 viewBox, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`,
  round caps/joins — recolorable by replacing `currentColor`
- Figma plugin API supports `createNodeFromSvg`; exposed through Figma MCP `use_figma`
  (verify in first implementation test)
- Lucide license: ISC — free use, attribution in LICENSE

## Testing plan (TDD for skills)

**RED (baseline, no skill):** subagent scenarios —
1. "Generate a Figma mobile screen with a bottom tab bar (home, search, cart, profile)"
2. "Write an RN settings screen component with icons"
Document verbatim failures (invented names, hand-drawn shapes, placeholders).

**GREEN:** write SKILL.md addressing the observed failures specifically.

**REFACTOR:** rerun scenarios with the skill; close loopholes (e.g. agent guesses icon
name without checking index → add explicit "never guess, always grep the index" rule).

**Edge cases:** concept with no matching icon ("avocado toaster") → fallback rules
(nearest concept or text label, never an invented name).

## Success criteria

- Figma output contains real Lucide vectors (not improvised shapes), themed correctly
- Code output imports real exports from lucide packages, compiles
- Agent never invents an icon name; unknown concepts hit the documented fallback
- Skill installs by copying the folder into `~/.claude/skills/` (or `npx skills add`)
