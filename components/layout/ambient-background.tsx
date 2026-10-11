import { AmbientCanvas } from "@/components/layout/ambient-canvas";

/**
 * The ambient background behind every page (prompts/ambient-background.md):
 * a point wave, drifting outlined screens and dust in the personal score cyan,
 * under a vignette.
 *
 * A Server Component, so the vignette is in the prerendered HTML and the first
 * paint is the same black page as before, darkened at the edges; the animated
 * layer fades in under it once the browser is idle.
 *
 * Fixed behind the content at `-z-10`, which paints above the body's black
 * (propagated to the viewport) and below everything else, so nothing in the
 * shell needs its own stacking context. Sized to the large viewport height so
 * a phone toolbar collapsing on scroll never resizes it. Hidden from
 * assistive technology and from the pointer: it is decoration only.
 */
export function AmbientBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-lvh select-none"
    >
      <AmbientCanvas />
      <div className="absolute inset-0 backdrop-vignette" />
    </div>
  );
}
