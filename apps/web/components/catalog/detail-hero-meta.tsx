import { GlassPill } from "@/components/glass-pill";

/**
 * Facts joined with a decorative ` · `, so a missing part takes its separator
 * with it. Shared by the movie, show and game heroes and the season header
 * (spec 0009, AC-7 reuses the separator; spec 0025, AC-2).
 */
function MetaLine({ parts }: { parts: string[] }) {
  return (
    <p className="text-sm text-text-secondary md:text-base">
      {parts.map((part, index) => (
        <span key={part}>
          {index > 0 ? (
            <span aria-hidden="true" className="px-1.5">
              ·
            </span>
          ) : null}
          {part}
        </span>
      ))}
    </p>
  );
}

/**
 * Genre labels, not controls: there is no genre page to open. A TMDB genre and
 * an IGDB one share the `{ id, name }` shape, so every hero uses this list.
 */
function GenreChips({ genres }: { genres: { id: number; name: string }[] }) {
  return (
    <ul aria-label="Genres" className="flex flex-wrap gap-2">
      {genres.map((genre) => (
        <li key={genre.id}>
          <GlassPill className="font-semibold">{genre.name}</GlassPill>
        </li>
      ))}
    </ul>
  );
}

export { GenreChips, MetaLine };
