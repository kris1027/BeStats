# lib/tracking

The signed in user's state for movies, episodes, shows and games: the reads behind the library pages and catalog cards, the intent helpers the Server Actions use, and the rules below. Root `AGENTS.md` sections 7 and 9 hold the summary; this file holds the detail. Governed by specs 0007, 0011, 0020 and 0026 to 0027 in `docs/specs/`.

## Movies

- A row is planned or watched, never both: marking it watched removes the plan, and planning a watched movie removes its watch mark and score, with Undo ([prompts/movie-plan-watched-exclusive.md](../../prompts/movie-plan-watched-exclusive.md)).
- A score needs a watch mark: removing the mark removes the score, with Undo; an unwatched movie cannot be scored; a watched movie may have no score.
- Release gate: watched and scored only from the TMDB release date (UTC day). Before it, or with no date, a movie can only be planned. Marks and scores stored earlier stay and stay removable ([prompts/movie-release-gate.md](../../prompts/movie-release-gate.md)).

## Episodes and seasons

- Watched mark and rating are independent; unmarking an episode keeps its rating.
- Marking a season watched marks only regular episodes that have aired, is idempotent, and preserves ratings. Episodes that air later arrive unwatched.
- Specials (season 0) can be marked and rated but count toward no progress, page placement or show rating.

## Show tracking

- A show is tracked while its `user_show_state` row exists; that row holds only `tracked_at`. Tracking is the only hand set choice: there is no Pause, Drop or hold (removed 2026-10-10). The show page control is a Plan to watch / Tracking toggle.
- Marking a regular episode or a season watched tracks an untracked show.
- Stop tracking deletes the row and keeps every mark and rating, with an Undo that restores its old place. It is idempotent: a show another tab already stopped is a quiet success with no Undo. Writes from any surface go through `components/tracking/use-show-tracking.ts`, which owns the Undo.

## Library placement

Placement is worked out per request and never stored. No page writes when it loads (spec 0020, AC-21).

- **Shows** (pure classifier `lib/tv/library-page.ts`): Up next when an aired regular episode comes after the furthest one watched, offering the first of them with Mark watched (earlier gaps are never offered). Upcoming when caught up with a next regular episode dated after today, or when nothing is watched and nothing is dated (Date TBA). Watched when caught up with nothing dated, labelled Finished if TMDB says Ended or Canceled, otherwise Caught up. Aired episodes come from the show details read: `last_episode_to_air`, plus a `next_episode_to_air` dated on or before today.
- **Movies** (`lib/catalog/movie-page.ts`): a planned movie is on Watchlist from its release day and on Coming soon before it or with no date; a watched movie is on Watched.
- **Games**: the stored status picks the page; Want to play splits by release date (`isGameReleased`) into Want to play and Coming soon, a view and not a status ([prompts/game-coming-soon.md](../../prompts/game-coming-soon.md)).

## Reads

Library tabs (`library-lists.ts`): a shows or movies tab classifies every tracked show or planned unwatched movie, at most 500 per media type, from one cached TMDB details read per title. The `/shows`, `/movies` and `/search` grids place their titles with the same classifiers so a card always matches its library page: one `cache()`d read per grid, and TMDB details only for the grid's tracked shows (`show-grid-status.ts`, `getMovieGridStates`; [prompts/catalog-card-status.md](../../prompts/catalog-card-status.md)). Games (`game-library.ts`): Playing and Finished read one counted `user_game_state` page of 24 plus one `getGamesByIds` batch, with no 500 limit; Want to play and Coming soon read up to 500 Want to play rows and one batch, split and paged in memory (`getWantToPlayTab`).

## Games

- Statuses Want to play, Playing, Finished, set by hand, one row per user and game, any status to any other in one click. Removing deletes the row, with Undo (`showGameUndo` in `components/tracking/use-game-undo.ts`). Nothing derives from progress; there is no Dropped or Paused.
- Release gate: before the UTC day of IGDB `first_release_date`, a game can only be Want to play; Playing, Finished and rating are disabled with a "Releases {date}" or "TBA" hint, and the Server Action checks it too.
- Ratings: 1 to 10, only on Playing or Finished. Moving back to Want to play clears the score, with Undo restoring status, score and timestamps; Playing to Finished and back keeps it.
- Timestamps: added, started (the first time Playing), finished (every time Finished). Want to play sorts by added, Playing by started, Finished by finished.
- Not tracked: platform, hours played, 100% completion.
- A hidden game (IGDB reclassified it) stays listed and removable through reads by ID; the game page answers it with a soft 404.
