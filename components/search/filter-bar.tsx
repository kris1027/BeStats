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
import {
  FILTER_DEBOUNCE_MS,
  MAX_QUERY_LENGTH,
  MIN_VOTE_COUNT,
  MIN_YEAR,
  RATING_STEPS,
  type RatingStep,
} from "@/lib/search/constants";
import { mediaNoun } from "@/lib/search/count";
import { mapGenresAcrossTypes } from "@/lib/search/genres";
import {
  emptySearchParams,
  type SearchParams,
  type SearchType,
  searchHref,
} from "@/lib/search/params";
import type { Genre } from "@/lib/tmdb/types";

type Genres = { tv: Genre[] | null; movie: Genre[] | null };

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
 * Genre checkboxes live in a popover, which only exists once hydrated, so the
 * selected genres also travel as hidden inputs and a submit before hydration
 * keeps them.
 */
function FilterBar({
  initial,
  genres,
  currentYear,
}: {
  initial: SearchParams;
  genres: Genres;
  currentYear: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const [values, setValues] = useState(initial);
  const [text, setText] = useState(initial.q ?? "");
  const [removed, setRemoved] = useState<string[]>([]);

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
      setRemoved([]);
    }
  }

  function apply(next: SearchParams, dropped: string[] = []) {
    const params = { ...next, page: 1 };
    const href = searchHref(params);
    produced.current.add(href);
    setValues(params);
    setRemoved(dropped);
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  const applyText = useEffectEvent((q: string | null) => {
    if (q !== values.q) apply({ ...values, q });
  });

  useEffect(() => {
    const q = text.trim() || null;
    const timer = setTimeout(() => applyText(q), FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const current = { ...values, q: text.trim() || null };
  const typeGenres = genres[values.type];
  const anySet =
    current.q !== null ||
    current.genreIds.length > 0 ||
    current.year !== null ||
    current.rating !== null;

  function switchType(type: SearchType) {
    if (type === values.type) return;
    const { kept, dropped } = mapGenresAcrossTypes(
      values.genreIds,
      genres[values.type] ?? [],
      genres[type] ?? [],
    );
    apply({ ...current, type, genreIds: kept }, dropped);
  }

  function toggleGenre(id: number) {
    const genreIds = values.genreIds.includes(id)
      ? values.genreIds.filter((value) => value !== id)
      : [...values.genreIds, id].sort((a, b) => a - b);
    apply({ ...current, genreIds });
  }

  const years = Array.from(
    { length: currentYear + 1 - MIN_YEAR + 1 },
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
      {values.genreIds.map((id) => (
        <input key={id} type="hidden" name="genre" value={id} />
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

        <fieldset
          className={cn(CONTROL, "glass-shadow flex items-center gap-1 p-1")}
        >
          <legend className="sr-only">Type</legend>
          <TypeOption
            value="tv"
            label="Shows"
            checked={values.type === "tv"}
            onSelect={switchType}
          />
          <TypeOption
            value="movie"
            label="Movies"
            checked={values.type === "movie"}
            onSelect={switchType}
          />
        </fieldset>

        <GenrePicker
          genres={typeGenres}
          selected={values.genreIds}
          onToggle={toggleGenre}
        />

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
          label="Minimum TMDB rating"
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
          <option value="">Any TMDB rating</option>
          {RATING_STEPS.map((step) => (
            <option key={step} value={step}>
              {step}+
            </option>
          ))}
        </SelectControl>

        {values.rating !== null ? (
          <p className="text-xs text-muted-foreground">
            Only titles with at least {MIN_VOTE_COUNT} TMDB votes
          </p>
        ) : null}

        {hydrated ? null : (
          <Button type="submit" size="touch" className="md:h-9 md:text-[13px]">
            Apply
          </Button>
        )}

        {anySet ? (
          <Link
            href={`/search?type=${values.type}`}
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

      {removed.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Removed: {removed.join(", ")}
        </p>
      ) : null}
    </form>
  );
}

/**
 * One half of the `Shows | Movies` switch: a native radio, so the form
 * submits `type` before hydration, dressed as the navbar's segmented control.
 */
function TypeOption({
  value,
  label,
  checked,
  onSelect,
}: {
  value: SearchType;
  label: string;
  checked: boolean;
  onSelect: (type: SearchType) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-9 cursor-pointer items-center rounded-full px-4 text-xs font-semibold tracking-[0.07em] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring md:h-7",
        checked
          ? "glass-selected glass-rim text-foreground"
          : "text-text-secondary hover:text-foreground",
      )}
    >
      <input
        type="radio"
        name="type"
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      {label.toUpperCase()}
    </label>
  );
}

/**
 * The genres popover: one checkbox per genre of the selected type (AC-8). A
 * title must have every genre ticked (AC-10). When TMDB's genre list could not
 * be read, the control is disabled and says so; the rest of the bar still
 * works (AC-19).
 */
function GenrePicker({
  genres,
  selected,
  onToggle,
}: {
  genres: Genre[] | null;
  selected: number[];
  onToggle: (id: number) => void;
}) {
  const label = selected.length > 0 ? `Genres · ${selected.length}` : "Genres";

  if (genres === null) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          className={cn(CONTROL, "flex items-center gap-2 px-4 opacity-50")}
        >
          <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
          Genres
        </button>
        <p className="text-xs text-muted-foreground">Genres unavailable</p>
      </div>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          CONTROL,
          "flex cursor-pointer items-center gap-2 px-4 hover:brightness-125",
        )}
      >
        <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
        {label}
        <ChevronDownIcon className="size-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))]">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-xs font-semibold tracking-[0.1em] text-muted-foreground">
            MUST HAVE ALL OF
          </legend>
          <div className="grid max-h-[min(22rem,60vh)] grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto">
            {genres.map((genre) => (
              <label
                key={genre.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted md:min-h-9"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(genre.id)}
                  onChange={() => onToggle(genre.id)}
                  className="size-4 shrink-0 accent-foreground"
                />
                {genre.name}
              </label>
            ))}
          </div>
        </fieldset>
      </PopoverContent>
    </Popover>
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

export { FilterBar };
