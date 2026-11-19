import { imageUrlForWidth } from "@bestats/core/images/image-url";
import { PixelRatio } from "react-native";

/** The poster width on the movie screen, in points. */
export const DETAIL_POSTER_WIDTH = 110;

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
