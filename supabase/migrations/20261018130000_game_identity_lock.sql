-- Game identity lock (spec 0024, AC-6 as amended on 2026-10-18): an update
-- that changes `user_id` or `game_id` on `user_game_state` is now refused with
-- `BS003` instead of having the stored values quietly put back, so a client
-- that tries sees a failed write, as it would on `user_movie_state`
-- (AGENTS.md section 11).
--
-- Written by hand from `supabase/schemas/03-triggers.sql`. It only replaces
-- the trigger function, keeping its signature, so the triggers, the revoked
-- execute and the app deployed before it are untouched; push it before
-- merging its PR (docs/deploy.md).

create or replace function public.set_game_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  else
    -- `BS003` is the app's own code, like `BS001` and `BS002`, so a caller
    -- can recognise it without reading the message.
    if new.user_id is distinct from old.user_id
       or new.game_id is distinct from old.game_id then
      raise exception 'game_identity_locked' using errcode = 'BS003';
    end if;
    new.created_at := old.created_at;
  end if;

  if coalesce(current_setting('bestats.restore_game', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.added_at := now();
    new.started_at := case when new.status = 'playing' then now() end;
    new.finished_at := case when new.status = 'finished' then now() end;
    return new;
  end if;

  new.added_at := old.added_at;
  new.started_at := old.started_at;
  new.finished_at := old.finished_at;

  if new.status is distinct from old.status then
    case new.status
      when 'want_to_play' then
        new.added_at := now();
      when 'playing' then
        new.started_at := coalesce(old.started_at, now());
      when 'finished' then
        new.finished_at := now();
    end case;
  end if;

  return new;
end;
$$;
