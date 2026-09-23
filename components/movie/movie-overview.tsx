import { languageName } from "@/lib/format";

/**
 * The overview text, honest about which language it is in (spec 0006, AC-5).
 *
 * When the module fell back to the original language, the paragraph carries
 * the matching `lang` so a screen reader switches voice, and a muted note says
 * why the text is not in English. No overview in either language is stated
 * plainly rather than left as an empty gap (AC-4).
 */
function MovieOverview({
  overview,
  language,
}: {
  overview: string | null;
  language: string | null;
}) {
  if (overview === null) {
    return (
      <p className="text-[15px] text-muted-foreground">
        No overview available.
      </p>
    );
  }

  const isEnglish = language === null || language === "en";

  return (
    <div className="flex max-w-[65ch] flex-col gap-2">
      <p
        lang={isEnglish ? undefined : language}
        className="text-base leading-relaxed text-text-secondary"
      >
        {overview}
      </p>
      {isEnglish ? null : (
        <p className="text-sm text-muted-foreground">
          Shown in the original language ({languageName(language)})
        </p>
      )}
    </div>
  );
}

export { MovieOverview };
