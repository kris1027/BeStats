"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { MenuIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { useEffect, useState } from "react";

import {
  BrandLinkView,
  rememberedLibraryType,
} from "@/components/layout/brand-link";
import { LibraryNavView } from "@/components/layout/library-nav";
import { MEDIA_TABS, mediaTabHref } from "@/components/layout/media-type-tabs";
import { QuickSearch } from "@/components/search/quick-search";
import { Button, ButtonLink } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { LibraryType } from "@/lib/catalog/media-type";

import { WithPageMediaType } from "./page-media-type";

/**
 * Tailwind's `md` and `xl`, the widths a menu button is hidden from. Media
 * queries in JS cannot read the theme, so they are restated here, and
 * `mobile-menu-sheet.test.tsx` fails if Tailwind's values or an override in
 * `app/globals.css` stop matching them.
 */
const BREAKPOINTS = {
  md: "(width >= 48rem)",
  xl: "(width >= 80rem)",
} as const;

/** Where the menu is opened, as it needs it: the path and the page's tab. */
type MenuPage = { pathname: string; type: LibraryType | null };

/**
 * The mobile menu: a full screen sheet on the sheet plate holding everything
 * the desktop bar shows in a row (prompts/mobile-navigation.md): the search,
 * the SHOWS | MOVIES | GAMES tabs, the library pages and the account block.
 * It is the navbar's one control below `md`, and signed in it also stands in
 * for the desktop bar's library links and account controls between `md` and
 * `xl`, where that row does not fit (decision 10).
 *
 * Every behaviour spec 0004, AC-15 names comes from Base UI's modal Dialog,
 * verified against the installed `@base-ui/react` 1.8.0 rather than assumed:
 * focus moves into the popup on open, is trapped while open, and returns to
 * the trigger on close; Escape dismisses; the page behind is scroll locked
 * and hidden from assistive technology. Nothing here reimplements any of it.
 *
 * It is on every page, signed in or out. `AccountSlot`, a Server Component,
 * renders the signed in account block from the verified session and passes
 * it in as `account`, or passes null, which shows Sign in and no library
 * rows. One prop rather than a block and a flag, so rows can never sit over
 * a Sign in, and this client piece never decides who is signed in.
 *
 * Choosing a link closes the sheet as it navigates, so the next page is not
 * hidden behind it. The dialog is controlled for that one reason: a click that
 * lands on any link inside the popup closes it, whatever the link, including
 * one to the page already open. The sheet shows no title, so `Menu` is kept
 * for screen readers only, which keeps the dialog named.
 *
 * Its button is hidden from `hiddenFrom` (`md` in the mobile bar, `xl` in
 * the desktop bar, which shows the full row from there), so a window
 * widened past it while the menu is open closes the menu rather than leaving
 * it over a bar that no longer offers it. Only the crossing closes it:
 * `/showcase` opens it at any width.
 *
 * @param searching Opens straight into search mode, for `/showcase`, which
 * otherwise could only show it after a tap.
 * @param page Where the menu stands, for `/showcase`; left out, it is read
 * from the URL when the menu opens.
 */
function MobileMenuSheet({
  account,
  page,
  hiddenFrom = "md",
  searching = false,
  triggerLabel = "Open menu",
}: {
  account: React.ReactNode | null;
  page?: MenuPage;
  searching?: boolean;
  hiddenFrom?: keyof typeof BREAKPOINTS;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia(BREAKPOINTS[hiddenFrom]);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, [open, hiddenFrom]);

  const body = (current: MenuPage) => (
    <MenuBody
      page={current}
      account={account}
      startSearching={searching}
      onClose={close}
    />
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        render={<Button size="icon-bar" aria-label={triggerLabel} />}
      >
        <MenuIcon className="size-5" aria-hidden="true" />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-background/60 duration-150 supports-backdrop-filter:backdrop-blur-glass data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />

        <DialogPrimitive.Popup
          className="glass-plate-sheet fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("a[href]")
            ) {
              close();
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            Menu
          </DialogPrimitive.Title>

          {page ? (
            body(page)
          ) : (
            <WithPageMediaType
              // Before the query is known the page's tab is too: `/search`
              // may be on movies. Previewing the last catalog viewed, with
              // nothing lit, guesses without claiming.
              fallback={(pathname) => body({ pathname, type: null })}
            >
              {(current) =>
                body({ pathname: current.pathname, type: current.libraryType })
              }
            </WithPageMediaType>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * The sheet's content. It mounts each time the menu opens, so the previewed
 * tab starts from the page's own every time, or on a page about neither
 * catalog (`/account`, `/privacy`) from the one viewed last, as the logo
 * does. The menu is the whole of mobile navigation, so it never hides the
 * search, tabs or rows; there nothing is lit (prompts/mobile-navigation.md,
 * decision 7).
 *
 * Tapping a tab changes the page, as the desktop tab does
 * (`mediaTabHref`; prompts/mobile-menu-tabs-navigate.md). Signed out the
 * menu then closes; signed in it stays open on the new tab's rows, which is
 * why the tab the menu shows is its own state, moved before the page's type
 * arrives. While searching, a tab only switches which catalog the search
 * reads, so the query is kept. A row is lit only on its own tab and page.
 *
 * Tapping or typing into the field starts search mode, which gives the
 * results the whole screen: the rows and the account block step aside, the
 * tabs stay under the field so the type can change without retyping, and
 * Cancel clears the field and brings the menu back with focus in the field.
 * Tabbing onto the field does not start it, so the keyboard still reaches the
 * rows and the account block past it (AC-6).
 */
function MenuBody({
  page,
  account,
  startSearching,
  onClose,
}: {
  page: MenuPage;
  account: React.ReactNode | null;
  startSearching: boolean;
  onClose: () => void;
}) {
  // A page with no tab starts from the catalog viewed last, as the logo does.
  const [preview, setPreview] = useState<LibraryType>(
    () => page.type ?? rememberedLibraryType() ?? "tv",
  );
  const [searching, setSearching] = useState(startSearching);
  const router = useRouter();
  // Bumped by Cancel, so the field remounts empty rather than keeping a query,
  // and takes focus back, since Cancel itself unmounts.
  const [searchKey, setSearchKey] = useState(0);

  function cancel() {
    setSearching(false);
    setSearchKey((key) => key + 1);
  }

  function selectTab(type: LibraryType) {
    setPreview(type);
    if (searching) return;
    // Read at the tap, not in render: reading the query while rendering would
    // take every page's shell out of its prerender (components/AGENTS.md).
    const current = new URLSearchParams(window.location.search);
    router.push(mediaTabHref(page.pathname, type, current));
    if (account === null) onClose();
  }

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between gap-4">
        <BrandLinkView type={preview} />
        <DialogPrimitive.Close
          render={<Button size="icon-touch" aria-label="Close menu" />}
        >
          <XIcon className="size-5" aria-hidden="true" />
        </DialogPrimitive.Close>
      </div>

      <QuickSearch
        key={searchKey}
        type={preview}
        variant="overlay"
        autoFocus={startSearching || searchKey > 0}
        onNavigate={onClose}
        onEngage={() => setSearching(true)}
        besideField={
          searching ? (
            <Button size="touch" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          ) : null
        }
        belowField={
          <MenuTabs selected={preview} onSelect={selectTab} className="mt-4" />
        }
      />

      {account !== null && !searching ? (
        <LibraryNavView
          variant="sheet"
          pathname={preview === page.type ? page.pathname : null}
          type={preview}
        />
      ) : null}

      {searching ? null : (
        <>
          <div className="flex-1" />
          <div className="flex flex-col gap-3">
            {account ?? (
              <ButtonLink size="touch" href="/sign-in" className="h-13 w-full">
                Sign in
              </ButtonLink>
            )}
          </div>
        </>
      )}
    </>
  );
}

/**
 * The menu's tabs: the shared `ToggleGroup`, single select, stretched to the
 * sheet's width and lit in the navbar tab's cyan. Toggles, not links, because
 * in search mode a tab changes only the search, and signed in it also keeps
 * the menu open on the tab it chose.
 */
function MenuTabs({
  selected,
  onSelect,
  className,
}: {
  selected: LibraryType;
  onSelect: (type: LibraryType) => void;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label="Media type"
      variant="personal"
      value={[selected]}
      onValueChange={(value) => {
        // Pressing the lit tab would empty the group; a preview always has one.
        const tab = MEDIA_TABS.find((candidate) => candidate.type === value[0]);
        if (tab) onSelect(tab.type);
      }}
      className={cn("w-full p-[4.5px]", className)}
    >
      {MEDIA_TABS.map((tab) => (
        <ToggleGroupItem
          key={tab.type}
          value={tab.type}
          className="hit-area-tab h-9 flex-1 px-0 text-[13px] font-bold tracking-[0.08em]"
        >
          {tab.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export { MobileMenuSheet };
