"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { cn } from "cn";
import { SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { QUICK_LIMIT, QUICK_MIN_CHARS } from "@/lib/search/constants";
import { formatResultCount, mediaNoun } from "@/lib/search/count";
import type { SearchType } from "@/lib/search/params";
import {
  type QuickResult,
  type QuickSearchResponse,
  seeAllHref,
} from "@/lib/search/quick";

import { QuickSearchRow, QuickSearchRowSkeleton } from "./quick-search-row";
import { type QuickSearchState, useQuickSearch } from "./use-quick-search";

/** What the panel shows for the query in the field right now. */
type PanelView =
  | { kind: "loading"; previous: QuickSearchResponse | null }
  | { kind: "ok"; data: QuickSearchResponse }
  | { kind: "error" };

/**
 * Reads the hook's state against the field. A settled answer for another
 * query is never shown as current: until the new one lands it is only the
 * dimmed previous rows (spec 0010, AC-2, AC-5).
 */
function panelView(state: QuickSearchState, trimmed: string): PanelView {
  if (state.status === "ok" && state.query === trimmed) {
    return { kind: "ok", data: state.data };
  }
  if (state.status === "error" && state.query === trimmed) {
    return { kind: "error" };
  }
  if (state.status === "ok") return { kind: "loading", previous: state.data };
  if (state.status === "loading") {
    return { kind: "loading", previous: state.previous };
  }
  return { kind: "loading", previous: null };
}

/**
 * The navbar's quick search: a field whose results drop down as you type,
 * from `design/desktop-search-open.svg` (spec 0010, AC-2 to AC-5).
 *
 * Built on Base UI's `Autocomplete`, verified against the installed 1.8.0: with
 * `filter={null}` and `mode="none"` it lists the server's rows as they are,
 * and it supplies the WAI-ARIA combobox this needs (the `combobox` role,
 * `aria-expanded`, `aria-controls`, `aria-activedescendant`, arrow key
 * movement, Escape and outside press closing) rather than a hand rolled one.
 * Three behaviours are this component's own: Enter with no active row opens
 * the results page, a second Escape clears the field, and every navigation
 * clears it, so the field keeps no state across pages (AC-17).
 *
 * `navbar` floats the panel under the field; `overlay` lays it out inline for
 * the mobile full screen dialog (AC-6), which owns the scrolling.
 *
 * It reads no request state and calls only the public `/api/search`, so it
 * costs no route its prerendered shell.
 */
function QuickSearch({
  type,
  variant = "navbar",
  autoFocus = false,
  onNavigate,
  className,
}: {
  type: SearchType;
  variant?: "navbar" | "overlay";
  autoFocus?: boolean;
  /** Called before each navigation, so the mobile overlay can close. */
  onNavigate?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const highlighted = useRef<QuickResult | null>(null);
  // The panel lines up with the whole glass field, not just the text input.
  const field = useRef<HTMLDivElement>(null);
  const { state, retry } = useQuickSearch(type, query);

  const trimmed = query.trim();
  const active = trimmed.length >= QUICK_MIN_CHARS;
  const view = panelView(state, trimmed);
  const rows =
    view.kind === "ok"
      ? view.data.results
      : view.kind === "loading"
        ? (view.previous?.results ?? [])
        : [];
  const noun = mediaNoun(type);
  const allHref = seeAllHref(type, trimmed);
  const inline = variant === "overlay";
  const panelOpen = inline ? active : open && active;

  function navigate(href: string) {
    setQuery("");
    setOpen(false);
    highlighted.current = null;
    onNavigate?.();
    router.push(href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !highlighted.current && trimmed !== "") {
      // No active row: Enter means "show me everything" (AC-4).
      event.preventDefault();
      navigate(allHref);
    } else if (event.key === "Escape" && !panelOpen && query !== "") {
      // The first Escape closes the panel; the second clears the field.
      setQuery("");
    }
  }

  const empty = view.kind === "ok" && view.data.results.length === 0;

  const panel = (
    <div
      className="flex flex-col gap-2"
      aria-busy={view.kind === "loading" || undefined}
    >
      <p className="px-3 pt-1 text-xs font-semibold tracking-[0.1em] text-muted-foreground">
        RESULTS
      </p>

      {view.kind === "loading" && view.previous === null
        ? Array.from({ length: QUICK_LIMIT }, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
            <QuickSearchRowSkeleton key={index} />
          ))
        : null}

      <Autocomplete.List
        className={cn(
          "flex flex-col gap-1 transition-opacity",
          view.kind === "loading" && "opacity-50",
        )}
      >
        {(row: QuickResult) => (
          <Autocomplete.Item
            key={row.id}
            value={row}
            onClick={() => navigate(row.href)}
            className="flex cursor-pointer items-center gap-4 rounded-2xl px-3 py-2 select-none data-highlighted:glass-selected data-highlighted:glass-rim"
          >
            <QuickSearchRow result={row} />
          </Autocomplete.Item>
        )}
      </Autocomplete.List>

      <Autocomplete.Status className="px-3 text-[15px] text-muted-foreground empty:hidden">
        {empty ? `No ${noun} match “${trimmed}”` : null}
        {view.kind === "error" ? (
          <span className="block text-foreground">Couldn't reach TMDB</span>
        ) : null}
      </Autocomplete.Status>

      {view.kind === "error" ? (
        <div className="px-3">
          <Button size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : null}

      {empty ? null : (
        <div className="flex items-center justify-between gap-4 border-t border-border px-3 pt-3 pb-1 text-[15px]">
          <span className="text-muted-foreground tabular-nums">
            {view.kind === "ok"
              ? formatResultCount(view.data.totalResults, type, "search")
              : null}
          </span>
          <Link
            href={allHref}
            onClick={(event) => {
              event.preventDefault();
              navigate(allHref);
            }}
            className="rounded-sm font-semibold text-text-label underline underline-offset-4 hover:text-foreground"
          >
            See all
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <Autocomplete.Root
      items={rows}
      filter={null}
      mode="none"
      inline={inline}
      value={query}
      onValueChange={(value, details) => {
        // Choosing a row navigates; it must not write the title into the field.
        if (details.reason === "item-press") return;
        setQuery(value);
        setOpen(value.trim().length >= QUICK_MIN_CHARS);
      }}
      open={panelOpen}
      onOpenChange={(next) => setOpen(next)}
      openOnInputClick
      itemToStringValue={(row: QuickResult) => row.title}
      onItemHighlighted={(row) => {
        highlighted.current = row ?? null;
      }}
    >
      <div
        ref={field}
        className={cn(
          "glass glass-rim glass-plate glass-shadow flex h-12 items-center gap-3 rounded-full pr-2 pl-4",
          className,
        )}
      >
        <SearchIcon
          className="size-4 shrink-0 text-text-secondary"
          aria-hidden="true"
        />
        <Autocomplete.Input
          placeholder={`Search ${noun}`}
          aria-label={`Search ${noun}`}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none md:text-sm"
        />
        {query !== "" ? (
          <>
            <Autocomplete.Clear
              aria-label="Clear search"
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-secondary hover:text-foreground md:size-9"
            >
              <XIcon className="size-4" aria-hidden="true" />
            </Autocomplete.Clear>
            {inline ? null : (
              <span
                aria-hidden="true"
                className="glass glass-rim hidden h-7 items-center rounded-lg px-2 text-[11px] text-text-secondary md:flex"
              >
                ESC
              </span>
            )}
          </>
        ) : null}
      </div>

      {inline ? (
        panelOpen ? (
          <div className="mt-4">{panel}</div>
        ) : null
      ) : (
        <Autocomplete.Portal>
          <Autocomplete.Positioner
            anchor={field}
            side="bottom"
            align="start"
            sideOffset={10}
            collisionPadding={16}
            className="z-40"
          >
            <Autocomplete.Popup className="glass glass-rim glass-plate-panel glass-shadow w-[min(40rem,calc(100vw-2rem))] rounded-panel p-3 backdrop-blur-glass">
              {panel}
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      )}
    </Autocomplete.Root>
  );
}

export { QuickSearch };
