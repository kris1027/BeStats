"use client";

import { cn } from "cn";
import {
  ChevronDownIcon,
  LoaderCircleIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  StarIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type * as React from "react";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CATALOG_SOURCES, typedHref } from "@/lib/catalog/media-type";
import { SEARCH_CATALOGS } from "@/lib/search/catalogs";
import {
  FILTER_DEBOUNCE_MS,
  GAME_MIN_RATING_COUNT,
  MAX_QUERY_LENGTH,
  MIN_VOTE_COUNT,
  RATING_STEPS,
  type RatingStep,
} from "@/lib/search/constants";
import { mediaNoun } from "@/lib/search/count";
import {
  type CatalogRef,
  emptySearchParams,
  minYear,
  type SearchParams,
  type SearchType,
  searchHref,
} from "@/lib/search/params";

/** Each type's genre list, or null when its catalog could not supply it. */
type Genres = Record<SearchType, CatalogRef[] | null>;

/** The shared look of every control in the bar: a glass pill, 44px on touch. */
const CONTROL =
  "glass glass-rim glass-plate h-11 rounded-full text-sm text-foreground md:h-9";

/**
 * The `/search` filter bar (spec 0010, AC-8, AC-9, AC-24).
 *
 * It is a real `GET` form to `/search`, so it works before JavaScript loads:
 * every control is a native input with the URL parameter's name, and a
 * visible Apply button submits it. Once hydrated, Apply goes away and each
 * change applies at once instead, replacing the URL (not pushing it, so Back
 * leaves the page rather than undoing each tweak) with `page` reset to 1. The
 * text field waits for a 400 ms pause, or for Enter. The results boundary is
 * keyed on the URL, so it shows its skeleton, while `useTransition` drives the
 * pending indicator here.
 *
 * The URL stays the source of truth. The bar keeps local state only so typing
 * and clicking feel immediate; when the page is rendered for a URL this bar
 * did not produce (a quick search `See all`, Back, a pasted link), it resets
 * to that URL.
 *
 * Genre and platform checkboxes live in popovers, which only exist once
 * hydrated, so the selected ids also travel as hidden inputs and a submit
 * before hydration keeps them. The type has no control here: it is the
 * navbar's SHOWS | MOVIES | GAMES tab (feature 22), so it travels as a hidden
 * input too, and a switch arrives as a new URL this bar did not produce.
 *
 * On `type=game` the bar adds `Platforms`, labels the rating as IGDB's, and
 * waits 400 ms after the last genre or platform toggle before it applies, so
 * several quick clicks make one IGDB read (spec 0029, AC-9 to AC-11).
 */
function FilterBar({
  initial,
  genres,
  platforms = null,
  currentYear,
}: {
  initial: SearchParams;
  genres: Genres;
  /** IGDB's platforms, or null when they could not be read (spec 0029). */
  platforms?: CatalogRef[] | null;
  currentYear: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const [values, setValues] = useState(initial);
  const [text, setText] = useState(initial.q ?? "");

  // Every URL this bar has asked for. A render for one of them is the echo of
  // our own change and must not reset what the person has typed since.
  const produced = useRef(new Set<string>());
  const incoming = searchHref(initial);
  const [seen, setSeen] = useState(incoming);
  if (incoming !== seen) {
    setSeen(incoming);
    if (!produced.current.has(incoming)) {
      setValues(initial);
      setText(initial.q ?? "");
    }
  }

  // The last URL this bar navigated to, so a delayed list toggle that an
  // earlier change already carried is not sent twice.
  const applied = useRef(incoming);

  function apply(next: SearchParams) {
    const params = { ...next, page: 1 };
    const href = searchHref(params);
    produced.current.add(href);
    applied.current = href;
    setValues(params);
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  // A games genre or platform toggle shows at once and applies after a pause
  // (spec 0029, AC-9). Each toggle bumps this, restarting the timer.
  const [listEdits, setListEdits] = useState(0);
  const flushLists = useEffectEvent(() => {
    const next = { ...values, q: text.trim() || null, page: 1 };
    if (searchHref(next) !== applied.current) apply(next);
  });

  useEffect(() => {
    if (listEdits === 0) return;
    const timer = setTimeout(() => flushLists(), FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [listEdits]);

  const applyText = useEffectEvent((q: string | null) => {
    if (q !== values.q) apply({ ...values, q });
  });

  useEffect(() => {
    const q = text.trim() || null;
    const timer = setTimeout(() => applyText(q), FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const current = { ...values, q: text.trim() || null };
  const isGame = values.type === "game";
  const typeGenres = genres[values.type];
  const source = CATALOG_SOURCES[values.type];
  const anySet =
    current.q !== null ||
    current.genreIds.length > 0 ||
    current.platformIds.length > 0 ||
    current.year !== null ||
    current.rating !== null;

  function toggled(ids: number[], id: number) {
    return ids.includes(id)
      ? ids.filter((value) => value !== id)
      : [...ids, id].sort((a, b) => a - b);
  }

  function applyList(next: SearchParams) {
    if (!isGame) {
      apply(next);
      return;
    }
    setValues(next);
    setListEdits((count) => count + 1);
  }

  const years = Array.from(
    { length: currentYear + 1 - minYear(values.type) + 1 },
    (_, index) => currentYear + 1 - index,
  );

  return (
    <form
      action="/search"
      method="get"
      aria-label="Search filters"
      onSubmit={(event) => {
        if (!hydrated) return;
        event.preventDefault();
        apply(current);
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="type" value={values.type} />
      {values.genreIds.map((id) => (
        <input key={id} type="hidden" name="genre" value={id} />
      ))}
      {values.platformIds.map((id) => (
        <input key={id} type="hidden" name="platform" value={id} />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            CONTROL,
            "flex w-full items-center gap-2 pr-2 pl-4 md:w-80",
          )}
        >
          <SearchIcon
            className="size-4 shrink-0 text-text-secondary"
            aria-hidden="true"
          />
          <input
            type="search"
            name="q"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_QUERY_LENGTH}
            placeholder={`Search ${mediaNoun(values.type)} by title`}
            aria-label="Title"
            enterKeyHint="search"
            className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-none md:text-sm"
          />
        </div>

        <GenrePicker
          genres={typeGenres}
          selected={values.genreIds}
          max={SEARCH_CATALOGS[values.type].maxFilterIds ?? undefined}
          onToggle={(id) =>
            applyList({ ...current, genreIds: toggled(values.genreIds, id) })
          }
        />

        {isGame ? (
          <PlatformPicker
            platforms={platforms}
            selected={values.platformIds}
            onToggle={(id) =>
              applyList({
                ...current,
                platformIds: toggled(values.platformIds, id),
              })
            }
          />
        ) : null}

        <SelectControl
          name="year"
          label="Year"
          value={values.year === null ? "" : String(values.year)}
          onChange={(value) =>
            apply({ ...current, year: value === "" ? null : Number(value) })
          }
        >
          <option value="">Any year</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </SelectControl>

        <SelectControl
          name="rating"
          label={`Minimum ${source} rating`}
          icon={
            <StarIcon
              className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 fill-rating-tmdb text-rating-tmdb"
              aria-hidden="true"
            />
          }
          value={values.rating === null ? "" : String(values.rating)}
          onChange={(value) =>
            apply({
              ...current,
              rating: value === "" ? null : (Number(value) as RatingStep),
            })
          }
        >
          <option value="">Any {source} rating</option>
          {RATING_STEPS.map((step) => (
            <option key={step} value={step}>
              {step}+
            </option>
          ))}
        </SelectControl>

        {values.rating !== null ? (
          <p className="text-xs text-muted-foreground">
            {isGame
              ? `Only games with at least ${GAME_MIN_RATING_COUNT} IGDB ratings`
              : `Only titles with at least ${MIN_VOTE_COUNT} TMDB votes`}
          </p>
        ) : null}

        {hydrated ? null : (
          <Button type="submit" size="touch" className="md:h-9 md:text-[13px]">
            Apply
          </Button>
        )}

        {anySet ? (
          <Link
            href={typedHref("/search", values.type)}
            onClick={(event) => {
              event.preventDefault();
              setText("");
              apply(emptySearchParams(values.type));
            }}
            className="flex h-11 items-center rounded-full px-2 text-sm text-text-link underline-offset-4 hover:text-foreground hover:underline md:h-9"
          >
            Clear filters
          </Link>
        ) : null}

        <span
          role="status"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          {isPending ? (
            <>
              <LoaderCircleIcon
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Updating results
            </>
          ) : null}
        </span>
      </div>
    </form>
  );
}

/** A picker whose list could not be read: disabled, saying so (AC-19). */
function UnavailablePicker({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled
        className={cn(CONTROL, "flex items-center gap-2 px-4 opacity-50")}
      >
        <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
        {label}
      </button>
      <p className="text-xs text-muted-foreground">{label} unavailable</p>
    </div>
  );
}

/** The popover trigger of both pickers: `Genres` or `Genres · 2`. */
function PickerTrigger({ label, count }: { label: string; count: number }) {
  return (
    <PopoverTrigger
      className={cn(
        CONTROL,
        "flex cursor-pointer items-center gap-2 px-4 hover:brightness-125",
      )}
    >
      <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
      {count > 0 ? `${label} · ${count}` : label}
      <ChevronDownIcon className="size-4" aria-hidden="true" />
    </PopoverTrigger>
  );
}

/**
 * One checkbox row, a 44px target on touch. Once `max` are checked, every
 * unchecked row is disabled, so the bar never builds a URL over the cap
 * (spec 0029, AC-10).
 */
function CheckboxRow({
  entry,
  checked,
  full,
  onToggle,
}: {
  entry: CatalogRef;
  checked: boolean;
  full: boolean;
  onToggle: (id: number) => void;
}) {
  const disabled = full && !checked;
  return (
    <label
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm md:min-h-9",
        disabled ? "opacity-50" : "cursor-pointer hover:bg-muted",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={() => onToggle(entry.id)}
        className="size-4 shrink-0 accent-foreground"
      />
      {entry.name}
    </label>
  );
}

/** `Up to 20`, shown once a picker is full. */
function CapHint({ max }: { max: number }) {
  return <p className="text-xs text-muted-foreground">Up to {max}</p>;
}

/**
 * The genres popover: one checkbox per genre of the selected type (AC-8). A
 * title must have every genre ticked (AC-10). When the genre list could not
 * be read, the control is disabled and says so; the rest of the bar still
 * works (AC-19). A games search stops at 20 (spec 0029, AC-10).
 */
function GenrePicker({
  genres,
  selected,
  max,
  onToggle,
}: {
  genres: CatalogRef[] | null;
  selected: number[];
  max?: number;
  onToggle: (id: number) => void;
}) {
  if (genres === null) return <UnavailablePicker label="Genres" />;
  const full = max !== undefined && selected.length >= max;

  return (
    <Popover>
      <PickerTrigger label="Genres" count={selected.length} />
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))]">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-xs font-semibold tracking-[0.1em] text-muted-foreground">
            MUST HAVE ALL OF
          </legend>
          <div className="grid max-h-[min(22rem,60vh)] grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto">
            {genres.map((genre) => (
              <CheckboxRow
                key={genre.id}
                entry={genre}
                checked={selected.includes(genre.id)}
                full={full}
                onToggle={onToggle}
              />
            ))}
          </div>
          {full && max !== undefined ? <CapHint max={max} /> : null}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The platforms popover of a games search (spec 0029, AC-10): a game must be
 * on any platform ticked. About 220 platforms, so a text box that gets focus
 * on open narrows the list by a case insensitive match anywhere in the name;
 * a ticked platform hidden by it stays ticked. Disabled with
 * `Platforms unavailable` when IGDB's list could not be read (AC-11).
 */
function PlatformPicker({
  platforms,
  selected,
  onToggle,
}: {
  platforms: CatalogRef[] | null;
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const filterBox = useRef<HTMLInputElement>(null);

  if (platforms === null) return <UnavailablePicker label="Platforms" />;

  return (
    <Popover>
      <PickerTrigger label="Platforms" count={selected.length} />
      <PopoverContent
        align="start"
        initialFocus={filterBox}
        className="w-[min(26rem,calc(100vw-2rem))]"
      >
        <PlatformList
          platforms={platforms}
          selected={selected}
          filter={filter}
          onFilter={setFilter}
          onToggle={onToggle}
          filterBox={filterBox}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The inside of the platforms popover: the legend, the filter box and the
 * rows the filter leaves, or `No platforms match`. Apart from the popover so
 * `/showcase` can show it open (spec 0029, AC-21).
 */
function PlatformList({
  platforms,
  selected,
  filter,
  onFilter,
  onToggle,
  filterBox,
}: {
  platforms: CatalogRef[];
  selected: number[];
  filter: string;
  onFilter: (filter: string) => void;
  onToggle: (id: number) => void;
  filterBox?: React.Ref<HTMLInputElement>;
}) {
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? platforms.filter((platform) =>
        platform.name.toLowerCase().includes(needle),
      )
    : platforms;
  const max = SEARCH_CATALOGS.game.maxFilterIds;
  const full = selected.length >= max;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-xs font-semibold tracking-[0.1em] text-muted-foreground">
        ON ANY OF
      </legend>
      <input
        ref={filterBox}
        type="search"
        value={filter}
        onChange={(event) => onFilter(event.target.value)}
        placeholder="Filter platforms"
        aria-label="Filter platforms"
        className={cn(
          CONTROL,
          "w-full px-4 text-base placeholder:text-muted-foreground focus-visible:outline-none md:text-sm",
        )}
      />
      {shown.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          No platforms match
        </p>
      ) : (
        <div className="grid max-h-[min(22rem,50vh)] grid-cols-1 gap-y-1 overflow-y-auto sm:grid-cols-2 sm:gap-x-4">
          {shown.map((platform) => (
            <CheckboxRow
              key={platform.id}
              entry={platform}
              checked={selected.includes(platform.id)}
              full={full}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
      {full ? <CapHint max={max} /> : null}
    </fieldset>
  );
}

/** A native select in the glass pill, which works before hydration too. */
function SelectControl({
  name,
  label,
  value,
  onChange,
  icon,
  children,
}: {
  name: string;
  label: string;
  value: string;
  /** A mark drawn inside the pill before the value, such as the TMDB star. */
  icon?: React.ReactNode;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {icon}
      <select
        name={name}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          CONTROL,
          "cursor-pointer appearance-none pr-9 hover:brightness-125",
          icon ? "pl-9" : "pl-4",
        )}
      >
        {children}
      </select>
      <ChevronDownIcon
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-secondary"
        aria-hidden="true"
      />
    </div>
  );
}

export { FilterBar, PlatformList, PlatformPicker };
