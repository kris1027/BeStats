-- Local test fixture: two users with tracking state each.
--
-- Spec 0001 AC-3 needs two real owners to prove that one cannot reach the
-- other's rows. The ids are fixed rather than random so the pgTAP suite can
-- name them directly instead of looking them up.
--
-- This file runs on `supabase db reset` against the local stack only. It is
-- never applied to a deployed project.

-- User A: 11111111-1111-1111-1111-111111111111, password `password-a`
-- User B: 22222222-2222-2222-2222-222222222222, password `password-b`
--
-- Both can sign in to the app (`pnpm dev:docker`). That needs the eight token
-- columns written as empty strings: GoTrue scans them into plain strings and
-- fails every sign in with "converting NULL to string is unsupported" when
-- they are left NULL, which is what an insert that omits them produces.
insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token,
  created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'user-a@example.test',
    crypt('password-a', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '', '', '', '',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'user-b@example.test',
    crypt('password-b', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    '', '', '', '', '', '', '', '',
    now(), now()
  );

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
values
  (
    gen_random_uuid(),
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    'email',
    '{"sub":"11111111-1111-1111-1111-111111111111","email":"user-a@example.test","email_verified":true,"phone_verified":false}',
    now(), now(), now()
  ),
  (
    gen_random_uuid(),
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    'email',
    '{"sub":"22222222-2222-2222-2222-222222222222","email":"user-b@example.test","email_verified":true,"phone_verified":false}',
    now(), now(), now()
  );

-- Movie state. 603 is The Matrix, 27205 is Inception: real TMDB ids, so a
-- manual check in the running app shows a real title rather than a placeholder.
insert into public.user_movie_state (user_id, movie_id, in_watchlist, watched_at, rating)
values
  ('11111111-1111-1111-1111-111111111111', 603, false, now(), 9),
  ('11111111-1111-1111-1111-111111111111', 27205, true, null, null),
  ('22222222-2222-2222-2222-222222222222', 603, true, null, null);

-- Show state. 1396 is Breaking Bad, 1399 is Game of Thrones.
insert into public.user_show_state (user_id, show_id, status, status_source)
values
  ('11111111-1111-1111-1111-111111111111', 1396, 'watching', 'user'),
  ('11111111-1111-1111-1111-111111111111', 1399, 'want_to_watch', 'user'),
  ('22222222-2222-2222-2222-222222222222', 1396, 'completed', 'system');

-- Episode state. Breaking Bad season 1 for user A, including one special
-- (season 0) to prove specials are storable, and one episode row for a show
-- user B has no status row for, which AC-13 requires to be legal.
insert into public.user_episode_state (user_id, episode_id, show_id, season_number, episode_number, watched_at, rating)
values
  ('11111111-1111-1111-1111-111111111111', 62085, 1396, 1, 1, now(), 10),
  ('11111111-1111-1111-1111-111111111111', 62086, 1396, 1, 2, now(), 8),
  ('11111111-1111-1111-1111-111111111111', 62087, 1396, 1, 3, null, null),
  ('11111111-1111-1111-1111-111111111111', 62119, 1396, 0, 1, now(), 7),
  ('22222222-2222-2222-2222-222222222222', 63056, 1399, 1, 1, now(), 9);
