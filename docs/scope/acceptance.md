# Release acceptance

The behaviours to verify before a release or after a change to a core flow (root `AGENTS.md` section 13). Numbers are stable IDs; specs and reviews cite them, so add new ones at the end.

1. A signed-out visitor can browse, search, filter, and open title details.
2. Google and email/password flows work, including sign-out and password recovery.
3. Private routes and data are unavailable without a valid session.
4. Two test users cannot access or mutate each other's data.
5. Movie watchlist, watched state, and rating survive reload and sign-in from another session.
6. Episode and whole-season completion work without including future episodes or overwriting ratings.
7. Unrated episodes and seasons are excluded from averages; unequal season lengths do not change equal season weighting.
8. Specials can be tracked and rated without affecting overall TV progress or rating.
9. Each tracked show is on the one page its progress and air dates give, and Up next offers the correct aired episode.
10. Caught up shows move to Upcoming when a next episode is dated and to Watched when nothing is, labelled Finished or Caught up.
11. Stop tracking and its Undo preserve episode history and ratings.
12. Combined search filters apply correctly, pagination works, and result counts remain truthful.
13. Loading, failure, empty, and missing-metadata states remain usable on desktop and mobile.
14. The interface stays consistent with the existing UI and `/showcase`.
15. Secrets are absent from browser bundles, and private data is not served through shared caches.
16. An unreleased or undated movie can be planned but not marked watched or rated; existing marks and scores stay removable.
17. A movie is never both planned and watched, and a movie score exists only on a watched movie; planning or unmarking a watched movie offers an Undo that restores its mark and score.
18. Every library page is named for its tab: the nav, the heading and the title agree, and a games tab never reads Watchlist, Upcoming or Watched.
