# App screenshots for the README

## Goal
Run BeStats locally, capture real application screens, and add a compact screenshot gallery to the README.

## Inspected code and designs
- `README.md`: project introduction, development status, local setup, and commands; no screenshots currently.
- `package.json`: Next.js 16.3.5; `pnpm dev` starts the application.
- `app/`: public show and movie catalogs, title details, search, and sign-in screens.
- `design/desktop-navbar-signed-out.svg` and the design file inventory establish the existing visual references. Capture the implemented interface without redesigning it.
- Working tree was clean on `main`; no server was listening on port 3000.

## Skills, decisions, and assumptions
- Reviewed `next-dev-loop`; its app-code edit/verification workflow does not apply to this documentation-only task. Use available browser tooling for screenshots without installing additional tooling unless necessary.
- Use a `feat/readme-app-screenshots` branch.
- Start `pnpm dev` using existing local configuration. Do not print secrets or change provider configuration.
- Capture signed-out public pages: desktop catalog, a representative title detail, and a mobile catalog view. Choose an actual title from the rendered catalog.
- Save PNG screenshots under `docs/screenshots/` and embed them with repository-relative image links and descriptive alt text in a Screenshots section near the README introduction.
- Wait for real metadata, fonts, and poster images to load. Keep developer overlays out of the captures where browser controls allow it.
- No app code, database, deployment, or dependency changes. Report unavailable live metadata as a blocker rather than substituting fabricated content.

## Expected files
- `README.md`
- `docs/screenshots/catalog-desktop.png`
- `docs/screenshots/title-detail-desktop.png`
- `docs/screenshots/catalog-mobile.png`
- This implementation plan.

## Security considerations
Capture only public signed-out content. Exclude credentials, browser chrome containing private information, and private account data. Leave existing environment files intact.

## Acceptance criteria
1. The application runs locally and captured pages show loaded real content.
2. Three readable screenshots cover desktop browsing, title details, and mobile layout.
3. README images resolve to committed repository assets and have concise captions/alt text.
4. Existing README setup and development-status content remains intact.

## Automated checks
- Run `git diff --check`.
- Verify every new README image path exists and inspect image dimensions and file sizes.
- Run `pnpm lint:ci`; no typecheck or production build is needed for Markdown and image assets alone.

## Exact manual verification
1. Open the local app and wait for the catalog and posters to finish loading.
2. At a desktop viewport, capture the catalog, open a visible title, and capture its detail page.
3. At a mobile viewport, reload the catalog, check for clipped content, and capture it.
4. Open each saved image and verify legibility, loaded images, and absence of errors or private information.
5. Preview the README and confirm all three images render with useful captions.
6. Report actual checks and leave the app running for the user.
