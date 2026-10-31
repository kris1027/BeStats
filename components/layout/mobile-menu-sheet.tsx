"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { MenuIcon, XIcon } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";

import { BrandLink, BrandLinkView } from "@/components/layout/brand-link";
import { LibraryNavView } from "@/components/layout/library-nav";
import { QuickSearch } from "@/components/search/quick-search";
import { Button } from "@/components/ui/button";
import { defaultLibraryTypeAt } from "@/lib/catalog/library-list";
import { isLibraryPath, type LibraryType } from "@/lib/catalog/media-type";

import { WithPageMediaType } from "./page-media-type";

/** Tailwind's `md` and `xl`, the widths a menu button is hidden from. */
const BREAKPOINTS = {
  md: "(width >= 48rem)",
  xl: "(width >= 80rem)",
} as const;

/** Where the menu is opened, as it needs it: the path and the page's tab. */
type MenuPage = { pathname: string; type: LibraryType | null };

/**
 * The mobile menu: the navbar's one control below `md`, a full screen sheet
 * on the sheet plate holding everything the desktop bar shows in a row
 * (prompts/mobile-navigation.md): the search, the SHOWS | MOVIES | GAMES
 * tabs, the library pages and the account block.
 *
 * Every behaviour spec 0004, AC-15 names comes from Base UI's modal Dialog,
 * verified against the installed `@base-ui/react` 1.8.0 rather than assumed:
 * focus moves into the popup on open, is trapped while open, and returns to
 * the trigger on close; Escape dismisses; the page behind is scroll locked
 * and hidden from assistive technology. Nothing here reimplements any of it.
 *
 * It is on every page, signed in or out. `AccountSlot`, a Server Component,
 * renders the account block from the verified session and passes it in, and
 * says whether the library rows belong (`library`), so this client piece
 * never decides who is signed in.
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
 * @param page Where the menu stands, for `/showcase`; left out, it is read
 * from the URL when the menu opens.
 */
function MobileMenuSheet({
  account,
  library,
  page,
  hiddenFrom = "md",
  triggerLabel = "Open menu",
}: {
  account: React.ReactNode;
  library: boolean;
  page?: MenuPage;
  hiddenFrom?: keyof typeof BREAKPOINTS;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
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
      library={library}
      account={account}
      onClose={close}
      popup={popup}
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
          ref={popup}
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
              fallback={(pathname) =>
                body({
                  pathname,
                  type: isLibraryPath(pathname)
                    ? defaultLibraryTypeAt(pathname)
                    : "tv",
                })
              }
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
 * tab starts from the page's own every time.
 *
 * The tabs here are a preview, not page selection: tapping one changes which
 * library rows show and which catalog the search reads, and nothing
 * navigates until a row, the wordmark or a result is chosen. The page's lit
 * tab still comes only from the URL, and a row is lit only on its own tab.
 *
 * Focusing the field starts search mode, which gives the results the whole
 * screen: the rows and the account block step aside, the tabs stay under the
 * field so the type can change without retyping, and Cancel clears the field
 * and brings the menu back. On a page about neither catalog there is no
 * search, no tabs and no rows (prompts/hide-tabs-without-type.md).
 */
function MenuBody({
  page,
  library,
  account,
  onClose,
  popup,
}: {
  page: MenuPage;
  library: boolean;
  account: React.ReactNode;
  onClose: () => void;
  popup: React.RefObject<HTMLDivElement | null>;
}) {
  const [preview, setPreview] = useState<LibraryType>(page.type ?? "tv");
  const [searching, setSearching] = useState(false);
  // Bumped by Cancel, so the field remounts empty rather than keeping a query.
  const [searchKey, setSearchKey] = useState(0);

  function cancel() {
    setSearching(false);
    setSearchKey((key) => key + 1);
    popup.current?.focus();
  }

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between gap-4">
        {page.type === null ? <BrandLink /> : <BrandLinkView type={preview} />}
        <DialogPrimitive.Close
          render={<Button size="icon-touch" aria-label="Close menu" />}
        >
          <XIcon className="size-5" aria-hidden="true" />
        </DialogPrimitive.Close>
      </div>

      {page.type === null ? null : (
        <QuickSearch
          key={searchKey}
          type={preview}
          variant="overlay"
          onNavigate={onClose}
          onFocus={() => setSearching(true)}
          besideField={
            searching ? (
              <Button size="touch" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
            ) : null
          }
          belowField={
            <MenuTabs
              selected={preview}
              onSelect={setPreview}
              className="mt-4"
            />
          }
        />
      )}

      {library && page.type !== null && !searching ? (
        <LibraryNavView
          variant="sheet"
          pathname={preview === page.type ? page.pathname : null}
          type={preview}
        />
      ) : null}

      {searching ? null : (
        <>
          <div className="flex-1" />
          <div className="flex flex-col gap-3">{account}</div>
        </>
      )}
    </>
  );
}

const TABS = [
  { type: "tv", label: "SHOWS" },
  { type: "movie", label: "MOVIES" },
  { type: "game", label: "GAMES" },
] as const satisfies readonly { type: LibraryType; label: string }[];

/**
 * The menu's tab preview, drawn as the navbar's segmented pill stretched to
 * the sheet's width. Toggle buttons with `aria-pressed`, not links, because
 * choosing one changes what the menu shows rather than the page.
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
    // biome-ignore lint/a11y/useSemanticElements: a group of toggles, not a form fieldset.
    <div
      role="group"
      aria-label="Media type"
      className={cn(
        "glass glass-rim glass-plate glass-shadow flex items-center gap-1 rounded-full p-[4.5px]",
        className,
      )}
    >
      {TABS.map((tab) => {
        const isSelected = tab.type === selected;

        return (
          <button
            key={tab.type}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(tab.type)}
            className={cn(
              "hit-area-tab flex h-9 flex-1 cursor-pointer items-center justify-center rounded-full text-[13px] font-bold tracking-[0.08em] transition-[filter,color]",
              isSelected
                ? "glass-selected-personal glass-rim text-text-on-personal"
                : "text-text-secondary hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export { MobileMenuSheet };
