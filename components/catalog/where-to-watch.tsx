import { ExternalLinkIcon } from "lucide-react";
import Image from "next/image";
import type * as React from "react";

import { Skeleton } from "@/components/skeleton";
import type { Region } from "@/lib/catalog/region";
import { JUSTWATCH_ATTRIBUTION } from "@/lib/legal/operator";
import type { Provider, RegionProviders } from "@/lib/tmdb";

import { SECTION_HEADING_CLASS, SectionErrorLine } from "./title-section";

/** The three groups in their AC-12 order, each with its label. */
const GROUPS = [
  { key: "stream", label: "Stream" },
  { key: "free", label: "Free" },
  { key: "rentOrBuy", label: "Rent or buy" },
] as const satisfies ReadonlyArray<{
  key: keyof Omit<RegionProviders, "link">;
  label: string;
}>;

/**
 * Where to watch a title in the visitor's country (spec 0022, AC-12): Stream,
 * Free and Rent or buy, each only when it has a provider, one link to TMDB's
 * watch page for that country, and the JustWatch credit TMDB's data asks
 * for. The heading names the country, because the region is a guess from
 * the connection (AC-9). With no providers there, it says so plainly and
 * never shows another country's.
 *
 * @param providers The region's entry from the extras, or undefined when
 * TMDB lists nothing for that country.
 */
function WhereToWatch({
  region,
  providers,
}: {
  region: Region;
  providers: RegionProviders | undefined;
}) {
  const groups = GROUPS.map((group) => ({
    ...group,
    providers: providers?.[group.key] ?? [],
  })).filter((group) => group.providers.length > 0);

  return (
    <WhereToWatchFrame region={region}>
      {groups.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">
          Not streaming in {region.name} right now.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <ProviderGroup
              key={group.key}
              label={group.label}
              providers={group.providers}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {groups.length > 0 && providers?.link ? (
          <a
            href={providers.link}
            target="_blank"
            rel="noopener noreferrer"
            className="hit-area inline-flex items-center gap-1 rounded-sm text-text-link underline-offset-4 hover:text-foreground hover:underline"
          >
            All options on TMDB
            <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}
        <p>{JUSTWATCH_ATTRIBUTION}</p>
      </div>
    </WhereToWatchFrame>
  );
}

/** One group: its label, then the providers' logos in a wrapping row. */
function ProviderGroup({
  label,
  providers,
}: {
  label: string;
  providers: Provider[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-bold text-text-label">{label}</h3>
      <ul aria-label={label} className="flex flex-wrap gap-2.5">
        {providers.map((provider) => (
          <li key={provider.id}>
            <ProviderLogo provider={provider} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A provider's square logo, named for assistive technology and on hover, or
 * its name in a pill of the same height when TMDB has no logo.
 */
function ProviderLogo({ provider }: { provider: Provider }) {
  if (provider.logoUrl === null) {
    return (
      <span className="glass glass-rim glass-plate inline-flex h-12 items-center rounded-lg px-3 text-sm font-semibold text-foreground">
        {provider.name}
      </span>
    );
  }
  return (
    <Image
      src={provider.logoUrl}
      alt={provider.name}
      title={provider.name}
      width={48}
      height={48}
      className="size-12 rounded-lg glass-shadow"
    />
  );
}

/**
 * The section and its heading, shared by every state, so loading, failure
 * and the loaded list sit under the same "Where to watch in {country}".
 */
function WhereToWatchFrame({
  region,
  children,
}: {
  region: Region | null;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby="where-to-watch-heading"
      className="flex flex-col gap-4"
    >
      <h2 id="where-to-watch-heading" className={SECTION_HEADING_CLASS}>
        {region === null
          ? "Where to watch"
          : `Where to watch in ${region.name}`}
      </h2>
      {children}
    </section>
  );
}

/**
 * The section while the extras load (AC-18): one group's label and a row of
 * logo tiles at their size, so the usual height is held.
 */
function WhereToWatchSkeleton() {
  return (
    <WhereToWatchFrame region={null}>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton shape="line" className="h-4 w-16" />
        <div className="flex gap-2.5">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton
              // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders with no identity.
              key={index}
              shape="line"
              className="size-12 rounded-lg"
            />
          ))}
        </div>
      </div>
      <p role="status" className="sr-only">
        Loading where to watch
      </p>
    </WhereToWatchFrame>
  );
}

/** The extras read failed (AC-18): one line and a full page Retry. */
function WhereToWatchError({ region, href }: { region: Region; href: string }) {
  return (
    <WhereToWatchFrame region={region}>
      <SectionErrorLine what="where to watch" href={href} />
    </WhereToWatchFrame>
  );
}

export { WhereToWatch, WhereToWatchError, WhereToWatchSkeleton };
