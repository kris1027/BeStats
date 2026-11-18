import { jsonLdScript } from "@/lib/seo/json-ld";

/**
 * A title page's structured data (spec 0016, AC-21 to AC-23).
 *
 * The raw HTML is safe here because `jsonLdScript` escapes every `<` and the
 * two JavaScript line terminators, so TMDB text cannot close the tag. Render
 * it only in a page's found branch, never in its loading, failed or not found
 * states.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped by jsonLdScript (spec 0016, AC-23).
      dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }}
    />
  );
}
