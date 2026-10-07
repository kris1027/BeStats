-- Enum types for TV tracking state.
--
-- Spec 0001 (AGENTS.md section 8) fixes these two vocabularies in the database
-- rather than in application code, so an invalid status is impossible to store
-- no matter which layer writes it.

-- The five TV statuses from AGENTS.md section 7. `want_to_watch` is the TV
-- watchlist state; there is deliberately no second TV watchlist flag that could
-- disagree with it.
create type public.tv_status as enum (
  'want_to_watch',
  'watching',
  'on_hold',
  'dropped',
  'completed'
);

-- Whether a status was chosen by the person or set automatically by the app.
-- AGENTS.md section 9 requires deliberate choices to survive metadata
-- refreshes, which is only possible if the two are told apart.
create type public.status_source as enum (
  'user',
  'system'
);

-- The one hand set part of tracking a show (spec 0020, AC-1): a tracked show
-- with no hold is placed on a library page by its progress, and a held one is
-- parked in the Paused & dropped section. Null in `user_show_state.hold_state`
-- means no hold, so there is no third value for it.
create type public.show_hold as enum (
  'paused',
  'dropped'
);
