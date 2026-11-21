# Legal pages ready for the app

## Goal

The app's About now opens `/privacy` and `/terms` (prompts/mobile-about-legal-links.md). On production every other web page answers 403 ("Website off, API on"), but both pages still show the full navbar, whose logo, menu, Sign in and account links all lead to those 403s. The Terms also open with "BeStats is a free website for tracking the movies and TV shows you watch", which leaves out the app and games. Make both pages read right for someone arriving from the phone.

## Inspected

- `app/layout.tsx`: one root layout renders `Navbar` (with both account slots), `<main>`, `SiteFooter` for every route. `app/layout-purity.test.ts` forbids request scoped reads in that tree.
- `components/layout/navbar.tsx` and `brand-link.tsx`: on `/privacy` and `/terms` the tabs, search and Library links already render nothing (prompts/hide-tabs-without-type.md). What remains is the `BrandLink` (to the last catalog), the mobile slot (menu button and sheet) and the desktop slot (Sign in, or account and Sign out).
- `components/AGENTS.md`: the shell's client boundaries are a fixed list and "Adding a client boundary in the shell is a decision". On a dynamic route `usePathname` suspends at prerender time.
- `components/legal/legal-document.tsx`: `LegalDocument` wraps both legal pages.
- `app/terms/page.tsx`: the opening paragraph and the metadata description ("…a free movie and TV tracking website."). The rest of the page already covers the app ("Technical requirements", "Ending your account"). `/privacy` already covers the app and needs no text change.
- `LEGAL_LAST_UPDATED` is already `2026-11-21` (today), so the date rule is met without a change.
- `SiteFooter` links only to `/privacy`, `/terms` and external sites, all reachable.

## Skills used

None beyond the repo rules: no Supabase or cache change.

## Decisions and assumptions

1. **User's choice: wordmark only** on `/privacy` and `/terms`. The header shows "BeStats" as plain text (not a link), with no menu button and no account controls. Every other page keeps the full navbar, so reopening the website needs no code change here.
2. **CSS, not a new client boundary.** `LegalDocument` marks its root with `data-legal-page`. `globals.css` defines `@custom-variant legal-page (body:has([data-legal-page]) &);`. The navbar hides `BrandLink` and both account slot wrappers with `legal-page:hidden`, and shows a plain `<span>` wordmark (same `BRAND_CLASS`) only with `hidden legal-page:inline`. It works in the prerendered HTML with no JavaScript, adds nothing to the client boundary list, and doesn't touch Suspense on dynamic routes. `display: none` also hides the controls from screen readers and the tab order. The server still renders the account slot on these two pages, just not shown. That's acceptable: nothing about it is private to the page.
3. **User's choice: app and website.** The Terms opening becomes: "BeStats is a free app for iPhone and Android, with a website, for tracking the movies, TV shows and games you watch and play, run by {operator} as a non commercial personal project. It is not a streaming service and hosts no video." The metadata description becomes "The rules for using BeStats, a free app and website for tracking movies, TV shows and games." `/privacy` text is unchanged.
4. Lands on `feat/mobile-offline-about` (PR kris1027/BeStats#89) as one commit, not pushed until you say so. It reaches production only when the PR merges and Vercel deploys.

## Expected files

- `apps/web/app/globals.css`: the `legal-page` custom variant (no colour value).
- `apps/web/components/legal/legal-document.tsx`: `data-legal-page` on its root.
- `apps/web/components/layout/navbar.tsx`: `legal-page:hidden` on the brand link and both slot wrappers, plus the plain wordmark span. JSDoc says why.
- `apps/web/components/layout/navbar.test.tsx`: the wordmark span and the hiding classes are present. On a page with `data-legal-page` the controls carry the hidden variant (class level, since jsdom doesn't apply CSS).
- `apps/web/app/terms/page.tsx`, `apps/web/app/terms/page.test.tsx`: new opening and description, asserted.
- `apps/web/components/AGENTS.md`: one line in the navbar rules: on the legal pages the bar is the wordmark only, through the `legal-page` variant.

## Requirements

- On `/privacy` and `/terms`, at phone and desktop widths, the header is the BeStats wordmark only: not a link, no menu, no Sign in or account controls, and nothing focusable in the header.
- Every other route's navbar is unchanged.
- The Terms open with the agreed sentence. The description matches.
- Routes still prerender (no new dynamic read, no new client boundary).

## Security considerations

None: copy and layout only. No auth, data or network change.

## Acceptance criteria

- The navbar and terms tests cover the above. `layout-purity.test.ts` still passes.
- In the browser, `/terms` and `/privacy` show the wordmark only, and `/movies` still shows the full navbar.

## Automated checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (layout and route change).

## Manual test

1. With `pnpm dev:docker` running, open `http://localhost:3000/terms` at desktop width: the header shows only "BeStats" as text. Tab from the top: the first focus lands in the page content, not the header.
2. Resize to 375px: still the wordmark only, no menu button.
3. The first paragraph reads "BeStats is a free app for iPhone and Android, with a website, for tracking the movies, TV shows and games you watch and play…".
4. Open `/privacy`: same header. Open `/movies`: full navbar with tabs, search and Sign in.
5. On the simulator, About → Terms of Service opens the page with the wordmark-only header.
