"use client";

import Image, { getImageProps } from "next/image";

/** Where the hero switches from the phone's poster to the backdrop: `lg`. */
const WIDE_ART_MEDIA = "(min-width: 64rem)";
const WIDE_ART_SIZES = "(min-width: 1600px) 1600px, 100vw";
const ART_CLASS = "object-cover object-top";
const LOAD_FIRST = { loading: "eager", fetchPriority: "high" } as const;

/**
 * The hero's artwork, decorative because the h2 names it: the portrait
 * poster below `lg`, which fills a phone's full height screen without being
 * blown up, and the 16:9 backdrop from it (prompts/mobile-landing-parallax.md,
 * decision 12). One `<picture>`, so the browser fetches only the one its
 * screen shows; with either missing, the other serves every width.
 *
 * A Client Component only because `getImageProps` calls the image loader,
 * which lives on the client; it still renders on the server, so the picture
 * is in the first HTML. It loads eagerly at high priority rather than through
 * `preload`, which cannot say which of two images a screen will use.
 */
function HeroPicture({
  backdrop,
  poster,
}: {
  backdrop: string | null;
  poster: string | null;
}) {
  if (backdrop === null || poster === null) {
    const src = backdrop ?? poster;
    if (src === null) return null;
    return (
      <Image
        src={src}
        alt=""
        fill
        sizes={backdrop === null ? "100vw" : WIDE_ART_SIZES}
        className={ART_CLASS}
        {...LOAD_FIRST}
      />
    );
  }

  const { srcSet: wide } = getImageProps({
    src: backdrop,
    alt: "",
    fill: true,
    sizes: WIDE_ART_SIZES,
  }).props;
  const { props } = getImageProps({
    src: poster,
    alt: "",
    fill: true,
    sizes: "100vw",
    className: ART_CLASS,
    ...LOAD_FIRST,
  });
  return (
    <picture>
      <source media={WIDE_ART_MEDIA} srcSet={wide} sizes={WIDE_ART_SIZES} />
      <img {...props} alt="" />
    </picture>
  );
}

export { HeroPicture };
