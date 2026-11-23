/**
 * A corner radius past any control's half height, so a plate reads as fully
 * rounded like the web's `rounded-full` pills. `Rim` caps it at half the
 * shorter side, so the stroke stays a rounded rectangle, never an ellipse.
 */
export const PILL_RADIUS = 999;

/**
 * How far Dynamic Type may grow a pill-shaped control's label before it would
 * clip in its fixed height or cut into the round ends: the pills, the tab-like
 * toggles and `GlassButton` (apps/mobile/AGENTS.md, Styling; the plan's
 * decision 8, amended after the largest text pass in the simulator).
 */
export const PILL_FONT_SCALE_CAP = 1.4;
