# TMDB API Research Facts

**Date: 2026-09-20**

## 1. AUTH: Authentication Methods for v3 and v4

Yes, the v4 "API Read Access Token" with `Authorization: Bearer <token>` header is fully supported for v3 endpoints. The exact header form is:
```
Authorization: Bearer <access_token>
```

The legacy `api_key` query parameter (`?api_key=<key>`) is still supported as an alternative for v3 endpoints. Both methods provide identical access levels.

**Source:** https://developer.themoviedb.org/docs/authentication-application

## 2. RATE LIMITS: Current Rate Limit Policy

The old "40 requests per 10 seconds" limit has been replaced with "somewhere in the 40 requests per second range," though TMDB notes "This limit could change at any time."

TMDB does return HTTP 429 status codes when rate limits are exceeded and advises "respect the 429 if you receive one."

**Retry-After header:** UNCONFIRMED (documentation mentions 429 but does not explicitly mention Retry-After header inclusion).

**Source:** https://developer.themoviedb.org/docs/rate-limiting

## 3. ENDPOINTS: Exact Paths and Key Query Parameters

### Movie Details
- **Path:** `/3/movie/{movie_id}`
- **append_to_response:** Comma-separated list of endpoints, max 20 items
- **Key params:** language, include_image_language (UNCONFIRMED)

### TV Series Details  
- **Path:** `/3/tv/{series_id}`
- **append_to_response:** Comma-separated list of endpoints, max 20 items

### TV Season Details
- **Path:** `/3/tv/{series_id}/season/{season_number}`
- **append_to_response:** Comma-separated list of endpoints, max 20 items
- **language:** Optional, default "en-US"

### Movie Credits
- **Path:** `/3/movie/{movie_id}/credits`

### TV Credits/Aggregate Credits
- UNCONFIRMED: Exact distinction between `credits` and `aggregate_credits` endpoints not verified.

### Genre Lists
- **Path:** `/3/genre/movie/list` (for movies)
- **Path:** `/3/genre/tv/list` (for TV)

### Configuration Endpoint
- **Path:** `/3/configuration`
- Returns image base URLs, available sizes, languages, countries, timezones

**Source:** https://developer.themoviedb.org/reference/movie-details, /reference/tv-series-details, /reference/tv-season-details

## 4. SEARCH vs DISCOVER: Filter Capabilities

### /search/movie and /search/tv Accepted Parameters
- `query` (required)
- `year` / `primary_release_year`
- `page`
- `include_adult`
- `language`
- `region`

**Does NOT support:** `with_genres`, `vote_average.gte`, or other discover-style filters.

### /discover/movie Supported Filters
- **Genre:** `with_genres` (comma for AND, pipe for OR)
- **Release Year:** `primary_release_year` or `year`
- **Minimum Vote Average:** `vote_average.gte`
- Plus 30+ additional filters (certification, runtime, cast, crew, companies, keywords, etc.)

### /discover/tv
- UNCONFIRMED: Exact filter list not verified in documentation; presumed similar to /discover/movie.

**Source:** https://developer.themoviedb.org/reference/search-movie, /reference/discover-movie

## 5. PAGINATION: Maximum Page and Response Envelope

Response envelope includes fields: `page`, `results`, `total_pages`, `total_results`

**Maximum page number:** UNCONFIRMED (documentation does not explicitly state a cap; common industry practice suggests 500-1000 but not verified for TMDB).

**Source:** Response structure inferred from API references; explicit max page documentation not found.

## 6. IMAGES: Base URL and Available Sizes

### Base URLs
- **HTTP:** `http://image.tmdb.org/t/p/`
- **HTTPS:** `https://image.tmdb.org/t/p/`

### Available Sizes
- **Posters:** `w92`, `w154`, `w185`, `w342`, `w500`, `w780`, `original`
- **Backdrops:** `w300`, `w780`, `w1280`, `original`
- **Profiles:** `w45`, `w185`, `h632`, `original`

### Configuration Endpoint Requirement
Calling `/3/configuration` is recommended (not required) to stay aligned with current TMDB specifications, though hardcoding the base CDN URL is not explicitly prohibited.

**Source:** https://developer.themoviedb.org/reference/configuration-details

## 7. LANGUAGE: Fallback Behavior and include_image_language

**Overview fallback behavior:** UNCONFIRMED (documentation does not explicitly state whether missing translations return empty overview or fall back to original language).

**include_image_language parameter:** UNCONFIRMED (existence and syntax not verified in documentation).

**Standard language param:** `language=en-US` (or other ISO 639-1 codes with optional region)

**Source:** Partial information from /reference/tv-season-details; full details not found.

## 8. ATTRIBUTION: Current Terms of Use and Logo Requirements

**Required notice:**
> "This product uses the TMDB API but is not endorsed or certified by TMDB."

This notice must be placed prominently in your application's "About" or "Credits" section.

**Logo usage rules:**
- Use only approved TMDB logos
- Do not modify in color, aspect ratio, or flip/rotate (except where noted)
- Logo shall be less prominent than your application's own branding
- Logo use must not imply endorsement by TMDB

**Official logos available at:** https://www.themoviedb.org/about/logos-attribution

**Source:** https://www.themoviedb.org/api-terms-of-use, https://www.themoviedb.org/about/logos-attribution

## 9. BULK FETCH: Endpoint for Many Items by ID

**Status:** UNCONFIRMED (documentation search did not reveal a bulk fetch endpoint; standard practice suggests one request per ID is the only option, but this is not explicitly confirmed in official documentation).

---

## Summary of Unconfirmed Items
1. Retry-After header presence in 429 responses
2. Exact max pagination page number
3. Language fallback for missing translations
4. include_image_language parameter syntax
5. TV aggregate_credits vs credits endpoint distinction
6. Bulk fetch endpoint existence
7. Exact filter list for /discover/tv

All other findings are confirmed from official TMDB documentation.
