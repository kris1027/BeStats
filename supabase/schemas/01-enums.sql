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
