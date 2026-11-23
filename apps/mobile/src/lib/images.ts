import { imageUrlForWidth } from "@bestats/core/images/image-url";
import { PixelRatio } from "react-native";

/** The poster width in a title screen's hero and its skeleton, in points. */
export const DETAIL_POSTER_WIDTH = 110;

/** The poster width in the season screen's header and its skeleton. */
export const SEASON_HEADER_POSTER_WIDTH = 96;

/** The poster width on a show screen's season rows. */
export const SEASON_ROW_POSTER_WIDTH = 56;

/**
 * The height of 16:9 artwork drawn `width` points wide: a title's backdrop
 * and its skeleton share it, so the hero does not jump when the detail
 * arrives (AGENTS.md section 3, loading states).
 */
export function artworkHeight(width: number): number {
  return (width * 9) / 16;
}

/**
 * The image URL for a slot `points` wide on this screen: the catalog's
 * ceiling sized URL stepped down by core's `imageUrlForWidth`, with the pixel
 * width as points times the device's density, so a small tile never loads a
 * `w500` poster and a dense screen still gets a sharp one (spec 0035, Images).
 * The web's `next/image` loader uses the same core rule.
 */
export function sizedImageUri(url: string, points: number): string {
  return imageUrlForWidth(url, Math.ceil(points * PixelRatio.get()));
}
