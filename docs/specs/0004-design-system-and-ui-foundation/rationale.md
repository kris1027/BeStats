# 0004. Design system and UI foundation: rationale

The decision record for [index.md](index.md). `/develop` does not need this file.

## Context

> ⚠️ Premise note: this topic bundles three decisions that could each carry a spec: the theme and token layer, the primitive library, and the application shell. Kept as one here because they are mutually load bearing, a token set nobody consumes proves nothing, and the shell is the only honest first consumer. The split point, if this ever needs one, is between the token layer plus primitives (which every feature depends on) and the shell plus placeholder routes (which only the browse features depend on). A second concern: the shell links to `/shows` and `/movies`, and no scope feature owns those pages. Enrolling a browse feature was offered and declined, so the placeholders ship unowned and are recorded as a follow up rather than left silent.

BeStats has four foundation features done: the scaffold, the tooling, the database schema with its row level security, and the TMDB module. All of them are below the waterline. Nothing visible exists yet beyond the Next.js starter page, and Slice 1 is about to build three visible surfaces in a row (movie page, movie tracking, watchlist). Without a settled visual language those three would each invent one.

The constraint that shapes everything is `AGENTS.md` section 3: the references in `design/` are the source of truth for layout, spacing, typography, colour and visible states, and where no reference exists the approach is proposed and approved rather than invented. Sixteen SVG files now exist there, covering the navigation bar in four forms, the mobile menu, the sign in page in two sizes, the poster card, three library pages, the open search overlay, and a badge legend. They do not cover loading, empty, error, missing image, or signed out, which are exactly the states section 3 also requires.

Three forces push against a naive reading of those files. First, the current `app/globals.css` is the stock shadcn light first palette with a `.dark` override, while every reference is black only. Second, the references set type in Inter while `app/layout.tsx` loads Geist. Third, and least obvious, the design's central device is a translucent gradient, and translucency over poster artwork is a legibility problem that the drawings sidestep by always painting an opaque plate first. Whether that plate is decoration or a rule is the kind of thing that gets lost between a drawing and a build.

The technical envelope is fixed and not up for debate here: Next.js 16.3.5 App Router with `cacheComponents: true`, which means every route must prerender or explicitly opt out; React 19; Tailwind v4, where the theme lives in CSS under `@theme inline` and there is no config file; shadcn configured for the `base-nova` style over Base UI primitives with lucide icons; Biome; Vitest with Testing Library and jsdom.

The cost of not deciding is concrete. The first page feature would set the palette by accident, the second would copy it approximately, and by the fourth there would be no palette at all, only four of them.

## Options considered

### Option 1: Tokens and primitives only

Extract the theme into tokens, build the base primitives, and stop there. Each page feature brings its own layout and navigation.

**Pros**:

- Smallest surface now, and nothing is built before the feature that needs it.
- No placeholder routes and no unowned pages.

**Cons**:

- The shell is needed by literally every page, so the first page feature builds it anyway, under that feature's name, with no spec governing it.
- Tokens with no consumer are unproven. The plate rule in particular would not surface until something was drawn over a poster.

### Option 2: Token layer plus adapted shadcn primitives plus the app shell

Tokens and glass utilities, primitives generated with the shadcn CLI and restyled to the references, plus the sticky navigation shell, poster card, grid and the shared state patterns, with thin placeholder routes so the navigation works.

**Pros**:

- The thin end to end thread the project's Tracer Bullet approach asks for: tokens feed a utility, the utility feeds the shell, the shell renders a real route, and the whole path is verified in the running app before anything is thickened.
- Generating from the CLI inherits Base UI's keyboard and focus behaviour, which is the part that is expensive to get right and easy to get wrong.
- The poster card is the single most repeated element across four reference pages, so building it once here removes the most likely source of drift.

**Cons**:

- Ships placeholder routes with no owning feature.
- Generated shadcn components arrive with a default look that must be actively stripped back, which is more work than writing the markup directly and risks leaving stock styling in place by accident.

### Option 3: Build everything the references draw

Also build the sign in page, the search overlay, the signed in navigation, and the three library page grids.

**Pros**:

- Fastest route to a product that looks finished, and the references would be fully exercised.

**Cons**:

- It builds the user interface for features 6, 9 and 11 before their behaviour is designed, which is exactly backwards: the sign in page would be styled before the authentication flow is decided, and the search overlay before the TMDB search and filter behaviour is verified.
- It front loads four features into one, which breaks the thin thread and makes the first review enormous.

### Option 4: Loose interpretation, cleaner values

Treat the references as direction, and pick round numbers for spacing, radii and colour.

**Pros**:

- Faster, and produces a tidier token scale than values reverse engineered from artboards.

**Cons**:

- `AGENTS.md` section 3 makes the references the source of truth, and section 13 item 14 makes matching them an acceptance condition. This option fails both by construction.

## Rationale

Option 2 was chosen because it is the only one that matches the project's own build approach. Tracer Bullet means proving the whole pipe with one thin real thread, and for a design system the pipe runs from a CSS custom property through a utility through a component through a layout to a rendered route. Option 1 stops halfway down that pipe and calls it done; the tokens it produces are unfalsifiable until something consumes them. Option 3 builds the pipe several times over for features whose behaviour nobody has designed yet.

The contrast audit below is what settled the plate question, and it is the most useful thing this investigation produced. Every text colour the references use passes WCAG AA comfortably against its intended backdrop, with the worst case at 4.73:1 for the legend grey under the brightest part of the glass gradient over a plate. So no colour needs changing, which is a good outcome. But the same glass over a light poster patch drops white text to 1.59:1, which is unreadable. The opaque plate is therefore doing the legibility work, not the gradient, and the references' habit of painting `#101416` or `#17181A` before the glass is a correctness requirement rather than a stylistic flourish. Capturing that as an invariant with a demonstration in the showcase is worth more than any amount of prose about it.

Focus deliberately uses near white rather than the cyan. The design has only three saturated colours and all three carry meaning: amber is a TMDB community rating, cyan is the user's own score, green is Planned. `AGENTS.md` section 9 requires personal and community ratings to be clearly distinguished everywhere, so spending the cyan on a second, unrelated meaning would erode exactly the distinction that section protects. Near white is also the only choice guaranteed to stay visible over black, over glass and over an arbitrary poster.

**On the icon choice, where the engineer overrode the recommendation.** The recommendation was lucide for generic furniture and hand ported paths for the five marks that carry meaning, because those five are the badge legend and their geometry is deliberate: the bookmark with its inset check, the square in a circle, the play in a circle, and the two stars. The engineer chose lucide for everything. That is a defensible call, one icon source with no hand maintained SVG is genuinely simpler to live with, and the colours (which carry most of the meaning) are unaffected. The tradeoff being consciously accepted is that the shipped badge legend will not match `design/` shape for shape, so `AGENTS.md` section 13 item 14, "the interface matches supplied references", will be met in colour, geometry of the pill and layout but not in icon silhouette. If that gap looks wrong once rendered, porting the five marks later is a contained change, since they live behind the badge components.

Dark only with no light structure was chosen over keeping the `:root` and `.dark` split for future proofing. A half maintained light palette that nothing renders will drift silently and give false confidence that light mode nearly works. Deleting it makes the absence honest.

## Values settled after the cross check

An independent review of the first draft found twelve decisions the spec had left for the build to infer. They are now settled in the **Resolved values** table in `index.md`. The three worth explaining:

**The rounded gradient rim.** Every reference draws the rim as an SVG stroke using a gradient on a rounded rectangle or circle. The obvious CSS translation, `border-image`, does not respect `border-radius`, so it would produce a square rim on a rounded pill. The technique that works is a two layer background: the plate painted to `padding-box` and the rim gradient painted to `border-box`, with the border itself transparent. This matters more than it sounds, because the rim is the single most repeated device in the whole system.

**The home redirect.** The first draft put the `/` to `/shows` redirect in a Server Component, which then raised the question of whether a redirecting component counts as prerendered under `cacheComponents`. Moving it to the `redirects()` array in `next.config.ts` is simpler and removes the question entirely: Next resolves it in the routing layer and nothing renders. Temporary (307) rather than permanent, so that a future real home page is not fighting a redirect browsers have cached forever.

**Enforcing the plate rule.** The first draft claimed the glass utility would apply a plate "by construction", which contradicted the requirement that the showcase demonstrate the plate-less case. It cannot do both. The references themselves stack plate and glass as two separate shapes, so the honest answer is that the rule lives in the components that own a glass surface, and the raw utility stays composable. That keeps the broken case demonstrable, which is the point of showing it.

Also settled: the four plate tokens (the audit found six hexes, of which `#121416` and `#17181A` are within noise of `#101416`), fixed radius values in place of a proportional rule, a 16px blur (the drawings deliberately supply none), `:focus-visible` rather than `:focus`, the grid column counts, `fill` plus `aspect-[2/3]` instead of fixed image pixels, the Inter variable font with the latin subset, the `NODE_ENV` guard for the showcase route, and a concrete look for the state panel, which `AGENTS.md` section 3 requires to be proposed and approved rather than left open. The canonical pill geometry is the rating badge in `show-movie-card.svg`; `badge-legend.svg` draws its marks with no pill at all and is the source for icons and colours only.

## Evidence

### Contrast audit

Ratios computed from the exact values in `design/`. "Plated glass top" is the worst case: the backing plate composited with the `glass` gradient's brightest stop, 18% white, which is the lightest any plated surface gets.

| Foreground | Used for | On `#000000` | On plate `#101416` | On plated glass top `#3B3E40` |
|---|---|---|---|---|
| `#F6F7F8` | primary text, brand, focus ring | 19.58 | 17.27 | 10.05 |
| `#E2E5EF` | field labels | 16.69 | 14.72 | — |
| `#D7D9E0` | navigation links | 14.89 | 13.14 | — |
| `#CED1DC` | unselected tab label | 13.78 | 12.15 | 7.07 |
| `#A8ADBC` | muted copy, placeholders | 9.37 | 8.26 | 4.81 |
| `#A5ADB3` | badge legend text | 9.23 | 8.14 | 4.73 |
| `#A8B3B9` | TV icon stroke | 9.81 | 8.66 | — |

Every value passes AA for body text (4.5:1) in every position it is actually used, including the worst case. No adjustment is required. The margin on the two greys under plated glass is thin at 4.73 and 4.81, so any future darkening of a plate or brightening of the gradient must be rechecked.

The finding that matters:

| Situation | Effective backdrop | `#F6F7F8` on it |
|---|---|---|
| Glass over a plate | `#3B3E40` | 10.05 (passes) |
| Glass over a light poster patch `#C8B89A`, no plate | `#D2C5AC` | **1.59 (fails badly)** |

This is the basis for AC-5.

### Artboard scale audit

The `design/` files are exported at different scales, so their numbers cannot be read as CSS pixels directly.

| File | Artboard width | Apparent scale | Notes |
|---|---|---|---|
| `desktop-sign-in-page.svg` | 1440 | **1x** | True CSS scale; a 1440 viewport |
| `mobile-sign-in-page.svg` | 390 | **1x** | True CSS scale; a 390 viewport |
| `desktop-navbar-*.svg` | 2964 / 2968 | ~2.06x | Divide by 2 |
| `mobile-navbar-*.svg`, `mobile-menu-open.svg` | 808 | ~2.07x | Divide by 2 |
| `desktop-watchlist-page.svg` | viewBox 1632 | ~1.13x | Large but near true scale |
| `desktop-watched-page.svg`, `desktop-upcoming-page.svg` | 1932 / 1704 | ~1.2x to 1.35x | Normalise before use |
| `show-movie-card.svg` | 528 | card only | Poster 486 by 730, which is 2:3 |

Because the two sign in artboards are unambiguously 1x, they are the reference for the type scale: heading 36 with -1 tracking, subtitle 16, field label 15 at weight 600, field text 16, primary button 18 at weight 700, small link 14, divider label 13, all Inter. Values derived from the navbar artboards (brand about 16, tab label about 11.5, control height about 34.5) are inferences from the 2x assumption and are flagged for visual confirmation in the follow up list.

### Token inventory extracted from `design/`

**Surfaces**: page `#000000`. Plates, painted before glass: `#101416` and `#121416` (controls and badges), `#17181A` (round buttons), `#0C1419` (personal score badge), `#08090C` (sign in panel), `#090A0D` (mobile menu sheet, search results panel).

**Gradients**, identical in every file:

- `glass`: white at 18% opacity, to `#D5D9F1` at 5.5%, to `#B3BCD8` at 10%, along a near vertical axis.
- `glass-edge` (the rim stroke): white at 62%, to white at 10%, to `#E2E9FF` at 26%.
- `selected-glass` (active or selected): white at 38%, to `#EFF2FF` at 18%, to white at 26%.
- `glass-shadow`: drop shadow, offset y 5, blur 5, colour `#060A19` at 22%.

**Text**: `#F6F7F8` primary (`#F6F5F8` on the brand, effectively identical), `#E2E5EF` labels, `#D7DBE6` and `#D7D9E0` links, `#CED1DC` secondary, `#B6BAC8` and `#A8ADBC` and `#AFB4C2` muted, `#A5ADB3` legend.

**Accents**: `#FFC526` TMDB rating star. `#50C6E5` personal score star, also used as the score badge rim at 65% opacity. `#29CEA3` Planned bookmark fill with `#06251D` for the check inside it.

**Borders**: white at 12% for dividers and the legend rule, white at 14% for the sign in divider.

**Radii**. The references express radius as a share of element width, which survives the scale differences but cannot map onto shadcn's single `--radius`, from which the whole scale derives. Normalised to fixed values: pills and round buttons fully rounded; cards at 5.5% of width, which is 12px at a realistic card size, so `--radius` is `0.75rem`; panels and sheets at 6.7% of width, which is 24px for both the sign in panel and the mobile menu sheet, so `--radius-panel` is `1.5rem`.

**Type**: Inter throughout, weights 400, 600, 700 and 800. Negative tracking on headings and the brand, around -1. Positive tracking on small uppercase labels, 0.7 on tab labels and 2 on the RESULTS heading.

**Badge vocabulary**, from `badge-legend.svg` and the page files: TMDB rating (amber star plus value), Your Score (cyan star plus value), Planned (filled green bookmark with a check), Plan (outline bookmark), Stop watching (square in a circle), Watch again (play in a circle), Next episode (TV icon plus `S1E1`), Release date (calendar icon plus a date). Two ship with this feature; the rest ship with the features that own their behaviour.

## Build time contrast audit (AC-7)

Re-run by `/develop` against the pairs the shipped UI actually uses, rather
than the pairs `design/` draws, because the build introduced surfaces the
references never covered: the state panel's muted icon circle, the panel and
sheet plates under glass, and a destructive colour that has no reference value
at all.

Each glass backdrop below is the brightest point of the gradient (white at 18%)
composited over its own plate, which is the worst case for anything sitting on
it.

| Foreground | Backdrop | Ratio | Verdict |
|---|---|---|---|
| `#F6F7F8` foreground | plated glass, control `#3B3E40` | 10.05 | passes |
| `#F6F7F8` foreground | plated glass, panel `#343538` | 11.43 | passes |
| `#F6F7F8` foreground | plated glass, sheet `#353639` | 11.26 | passes |
| `#F6F7F8` foreground | plated glass, score `#383E42` | 10.11 | passes |
| `#A8ADBC` muted | plated glass, panel `#343538` | 5.47 | passes |
| `#A8ADBC` muted | `--muted` circle `#17181A` | 7.93 | passes |
| `#CED1DC` unselected tab | plated glass, control | 7.07 | passes |
| `#FFC526` TMDB star | plated glass, control | 6.81 | passes |
| `#50C6E5` score star | plated glass, score | 5.45 | passes |
| `#29CEA3` Planned mark | plated glass, control | 5.36 | passes |
| `#F6F7F8` focus ring | plated glass, control | 10.05 | passes |

**The one adjustment.** `--destructive` has no value in `design/`, which draws
no error state. The first pick, `#F87171`, measured **3.90:1** on plated glass
and failed AA for body text. It was raised to the nearest lighter red that
clears the bar, `#FB8A8A`, at **4.67:1** (11.06:1 on flat black). No value taken
from `design/` needed adjusting, which matches the original audit's finding.

## Values the build settled that the spec left as inferences

Recorded here so the next feature reads them rather than re-deriving them.

- **The navbar type scale.** The spec flagged the navbar artboards' 2x
  inference for visual confirmation. Confirmed at 1440 and 390 in the running
  app, with two corrections: the brand renders at 20px rather than the inferred
  16px (16px reads as body copy next to the tab control, not as a wordmark),
  and the tab labels at 12px rather than 11.5px.
- **Badge and control sizing does not scale with the card.** The artboards
  imply a badge at 25% of the poster's width, which at the AC-9 six column
  layout would be a 21px tall pill. Badges are fixed at 28px tall instead, and
  the poster caption at 14px, because a proportional rule produces unreadable
  text at the narrow end of the grid.
- **Touch heights diverge from the mobile artboards.** The mobile references
  draw 35px controls, below the 44px target AGENTS.md section 3 asks for. The
  shell uses 44px on mobile and 36px on desktop, which is the `touch` and `sm`
  split in `buttonVariants`.
- **Glass is not used at poster scale.** The glass gradient stretched over a
  2:3 frame reads as a deliberate ramp rather than an absence, so the missing
  poster fallback and the skeletons use the flat plate with the rim. This is
  what the `rim` utility exists for; `design/` only ever puts glass on short
  surfaces.
