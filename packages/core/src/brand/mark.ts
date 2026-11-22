/**
 * The BeStats mark: three bars rising left to right, white on black
 * (Claude Design option 3a, prompts/design/bestats-launch/).
 *
 * Every size and time the app icon, the native splash and the launch
 * animation use lives here, as plain numbers, so the PNGs the icon script
 * renders and the lockup the app animates can never drift apart
 * (prompts/mobile-app-icon-launch.md, decisions 3, 4, 6 and 7). Colours are
 * not here: they are the `color-background` and `color-brand-mark` tokens.
 */

/** A bar as drawn: its left edge, height and corner radius, bottom aligned. */
export interface BrandBar {
  x: number;
  width: number;
  height: number;
  radius: number;
}

/** A bar group: equal width bars of rising height, bottom aligned. */
export interface BrandBarSpec {
  width: number;
  gap: number;
  heights: readonly [number, number, number];
  radius: number;
}

/**
 * The app icon in a 120 unit square, the design's own numbers. Its tallest
 * bar sets the group's height and the group sits centred, so the mark takes
 * about 53% of the icon, inside Android's 66 dp adaptive safe zone.
 */
export const ICON_BARS: BrandBarSpec = {
  width: 15,
  gap: 9,
  heights: [26, 43, 64],
  radius: 4,
};

/** The design's icon square, in the units `ICON_BARS` is drawn in. */
export const ICON_UNITS = 120;

/**
 * Android's adaptive layer is 108 dp with the middle 72 dp visible, so the
 * same 120 unit icon spans 180 units across the whole layer.
 */
export const ADAPTIVE_UNITS = (ICON_UNITS * 108) / 72;

/**
 * The splash and launch lockup bars, in points. The design draws them at
 * 7, 4 and 12 to 30 px in a 300 px wide phone; times 4/3 they keep one fixed
 * size on every phone, so the native splash image (which iOS and Android
 * draw at a fixed point size) and the overlay's first frame line up exactly
 * (decision 6).
 */
const pt = (designPx: number) => (designPx * 4) / 3;
export const LAUNCH_BARS: BrandBarSpec = {
  width: pt(7),
  gap: pt(4),
  heights: [pt(12), pt(20), pt(30)],
  radius: pt(2),
};

/** The lockup's wordmark, bold system font, from the design's 34 px type. */
export const LAUNCH_WORDMARK = {
  fontSize: pt(34),
  letterSpacing: pt(-1),
  /** The space between the bars and "Be". */
  gap: pt(10),
} as const;

/**
 * The splash image's square side in points, `imageWidth` in `app.json`. Both
 * platforms draw the image in a square box of this side, centred, so a square
 * as tall as the bars puts the bars exactly where the overlay draws them.
 */
export const SPLASH_IMAGE_POINTS = barGroupHeight(LAUNCH_BARS);

/**
 * The launch animation, in milliseconds from the moment the overlay takes
 * over from the native splash. The design's first 500 ms are the icon
 * expanding into the splash, which the OS draws, so every design time here
 * has those 500 ms taken off (decision 7). Curves are cubic béziers as the
 * design's CSS gives them.
 */
export const LAUNCH_TIMELINE = {
  /** Each bar dips to 12% height and springs back, 120 ms apart. */
  bars: {
    delay: 100,
    stagger: 120,
    duration: 700,
    dip: 0.12,
    dipAt: 0.3,
    curve: [0.3, 1.5, 0.5, 1],
  },
  /**
   * The lockup grows to 1.8x centred on the bars by 35%, holds to 50%, then
   * glides to its own place at its final scale.
   */
  lockup: {
    delay: 0,
    duration: 1600,
    peakScale: 1.8,
    peakAt: 0.35,
    holdUntil: 0.5,
    maxScale: 1.3,
    /** The final lockup never spans more than this share of the screen. */
    maxWidthShare: 230 / 300,
    curve: [0.45, 0, 0.2, 1],
  },
  /** "Be", then "Stats", revealed left to right as they fade in. */
  be: { delay: 900, duration: 450, curve: [0.4, 0, 0.2, 1] },
  stats: { delay: 1150, duration: 600, curve: [0.4, 0, 0.2, 1] },
  /** The app fades in over the lockup, settling from 1.04x. */
  app: {
    delay: 2400,
    duration: 420,
    fromScale: 1.04,
    curve: [0.2, 0.8, 0.2, 1],
  },
} as const;

/** When the whole sequence has finished, the app fully shown. */
export const LAUNCH_TOTAL_MS =
  LAUNCH_TIMELINE.app.delay + LAUNCH_TIMELINE.app.duration;

/** The bar group's width: three bars and two gaps. */
export function barGroupWidth(spec: BrandBarSpec): number {
  return (
    spec.width * spec.heights.length + spec.gap * (spec.heights.length - 1)
  );
}

/** The bar group's height: its tallest bar. */
export function barGroupHeight(spec: BrandBarSpec): number {
  return Math.max(...spec.heights);
}

/** Each bar's left edge and size, in the spec's own units. */
export function barLayout(spec: BrandBarSpec): BrandBar[] {
  return spec.heights.map((height, i) => ({
    x: i * (spec.width + spec.gap),
    width: spec.width,
    height,
    radius: spec.radius,
  }));
}

/**
 * The lockup's final scale: the design's 1.3, shrunk on a narrow phone so
 * the lockup never spans more than 230/300 of the screen.
 */
export function finalLockupScale(
  lockupWidth: number,
  screenWidth: number,
): number {
  const { maxScale, maxWidthShare } = LAUNCH_TIMELINE.lockup;
  if (lockupWidth <= 0) return maxScale;
  return Math.min(maxScale, (maxWidthShare * screenWidth) / lockupWidth);
}

/** What the SVG of one mark image draws. */
export interface BrandSvgOptions {
  /** The square image's side in pixels. */
  size: number;
  /** The bars' colour. */
  mark: string;
  /** A solid square behind the bars, or none for a transparent image. */
  background?: string;
  /**
   * `icon`: the design's 120 unit icon. `adaptive`: the same bars on
   * Android's 108 dp adaptive layer, whose middle 72 dp is the visible icon,
   * so the canvas is 180 units. `splash`: a square as tall as the bars.
   */
  variant: "icon" | "adaptive" | "splash";
}

/**
 * The mark as an SVG string, for the icon script to render with `sharp`.
 * The icon variant is the design's 120 unit icon scaled to `size`; the splash
 * variant fills a square as tall as the bars, centred, so its `imageWidth` is
 * `SPLASH_IMAGE_POINTS`. The iOS icon gets a square background (iOS rounds
 * the corners itself and refuses transparency).
 */
export function brandMarkSvg({
  size,
  mark,
  background,
  variant,
}: BrandSvgOptions): string {
  const spec = variant === "splash" ? LAUNCH_BARS : ICON_BARS;
  const units =
    variant === "splash"
      ? SPLASH_IMAGE_POINTS
      : variant === "adaptive"
        ? ADAPTIVE_UNITS
        : ICON_UNITS;
  const left = (units - barGroupWidth(spec)) / 2;
  const bottom = (units + barGroupHeight(spec)) / 2;
  const bars = barLayout(spec)
    .map(
      (bar) =>
        `<rect x="${left + bar.x}" y="${bottom - bar.height}" width="${bar.width}" height="${bar.height}" rx="${bar.radius}" fill="${mark}"/>`,
    )
    .join("");
  const ground = background
    ? `<rect width="${units}" height="${units}" fill="${background}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${units} ${units}">${ground}${bars}</svg>`;
}
