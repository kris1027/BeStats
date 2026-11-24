/**
 * The YouTube video key a trailer may carry (spec 0022, AC-11; spec 0031,
 * AC-4). TMDB's and IGDB's normalizers drop any other key before choosing a
 * trailer, and the app checks it again before building a URL, so a bad key
 * never reaches a link or an embed path.
 */
export const YOUTUBE_VIDEO_KEY = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * The YouTube watch page the app's Trailer button opens (prompts/
 * mobile-look-title-extras.md, decision 2): the phone hands it to the YouTube
 * app or the browser, so nothing reaches YouTube until the button is pressed.
 * Null for a key that fails `YOUTUBE_VIDEO_KEY`, so the caller shows no
 * button rather than a broken link.
 */
export function youtubeWatchUrl(key: string): string | null {
  if (!YOUTUBE_VIDEO_KEY.test(key)) return null;
  return `https://www.youtube.com/watch?v=${key}`;
}
