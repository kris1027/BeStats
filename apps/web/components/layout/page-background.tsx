import { PageBackgroundMotion } from "@/components/layout/page-background-motion";

/**
 * The background behind every page (prompts/warm-page-background.md): a
 * warm red gradient fading to near black, three soft blobs, a faint
 * pinstripe, a dark wash, a vignette and film grain.
 *
 * Fixed behind the content at `-z-10`, which paints above the body's black
 * (propagated to the viewport) and below everything else, so nothing in the
 * shell needs its own stacking context. Sized to the large viewport height so
 * a phone toolbar collapsing on scroll never resizes it. Hidden from
 * assistive technology and from the pointer: it is decoration only.
 *
 * Every layer is server HTML, so the still background is the first paint;
 * `PageBackgroundMotion` is the one client piece, and only moves them.
 */
export function PageBackground() {
  return (
    <PageBackgroundMotion className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh overflow-hidden select-none">
      <PageBackgroundLayers />
    </PageBackgroundMotion>
  );
}

/**
 * The background's layers, in paint order, positioned against whatever box
 * holds them. The gradient is 140% tall and the stripes bleed 80px, so the
 * motion never shows an edge. `/showcase` renders them still, in a panel.
 */
export function PageBackgroundLayers() {
  return (
    <>
      <div
        data-page-bg
        className="absolute inset-x-0 top-[-10%] h-[140%] page-gradient"
      />
      <div
        data-page-blob="0.05,0,0"
        className="absolute top-[-20vh] left-[-15vw] size-[70vw] page-blob-red"
      />
      <div
        data-page-blob="0.12,2,1"
        className="absolute top-[20vh] right-[-20vw] size-[65vw] page-blob-amber"
      />
      <div
        data-page-blob="0.2,4,2"
        className="absolute top-[60vh] left-[10vw] size-[80vw] page-blob-deep"
      />
      <div
        data-page-stripes
        className="absolute -inset-x-20 -top-20 h-[calc(100%+10rem)] page-stripes"
      />
      <div className="absolute inset-0 page-wash" />
      <div className="absolute inset-0 page-vignette" />
      <div className="absolute -inset-1/2 page-grain" />
    </>
  );
}
