import { PageBackgroundCanvas } from "@/components/layout/page-background-canvas";

/**
 * The background behind every page (prompts/film-strip-background.md): coiled
 * film strips and rising bokeh over a teal gradient, under a vignette.
 *
 * A Server Component, so the gradient and the vignette are in the
 * prerendered HTML and are the first paint; the animated layer between them
 * fades in once the browser is idle, and where WebGL2 is missing they are
 * the whole background.
 *
 * Fixed behind the content at `-z-10`, which paints above the body's black
 * (propagated to the viewport) and below everything else, so nothing in the
 * shell needs its own stacking context. Sized to the large viewport height so
 * a phone toolbar collapsing on scroll never resizes it. Hidden from
 * assistive technology and from the pointer: it is decoration only.
 */
export function PageBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh select-none page-gradient"
    >
      <PageBackgroundCanvas />
      <div className="absolute inset-0 page-vignette" />
    </div>
  );
}
