#!/usr/bin/env bash
# Runs `next dev` against the local Supabase stack in Docker instead of the
# project `.env.local` points at.
#
# `.env.local` holds the cloud project's keys, but migrations, the seed users
# and the pgTAP suite all live on the local stack, so that is where runtime
# checks belong. Next.js lets a real environment variable win over any `.env*`
# file, so the two public Supabase values and the site URL are exported here
# and `.env.local` is never edited. Everything else (the TMDB token) still
# comes from `.env.local`.
#
# The site URL is pinned to the one origin the local stack allows
# (`site_url` and `additional_redirect_urls` in `supabase/config.toml`), so
# confirmation and recovery links never point at the cloud origin. For the
# same reason a port other than 3000 is refused rather than silently breaking
# those links.
#
# Starts the stack if it is not running. Extra arguments go to `next dev`.
set -euo pipefail

LOCAL_PORT=3000
port="${PORT:-$LOCAL_PORT}"
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  case "${args[i]}" in
    -p | --port) port="${args[i + 1]:-}" ;;
    --port=*) port="${args[i]#--port=}" ;;
  esac
done
if [[ "$port" != "$LOCAL_PORT" ]]; then
  echo "The local Supabase redirect allow list only covers port $LOCAL_PORT (supabase/config.toml)." >&2
  echo "Run without a custom port, or add the new origin to site_url and additional_redirect_urls first." >&2
  exit 1
fi

if ! pnpm exec supabase status >/dev/null 2>&1; then
  echo "Local Supabase stack is not running. Starting it..."
  pnpm exec supabase start
fi

# `status -o env` prints KEY="value" lines; read only the two we need rather
# than sourcing the whole output, which also carries the secret key.
STATUS="$(pnpm exec supabase status -o env 2>/dev/null)"
read_value() {
  printf '%s\n' "$STATUS" | sed -n "s/^$1=\"\(.*\)\"$/\1/p"
}

NEXT_PUBLIC_SUPABASE_URL="$(read_value API_URL)"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(read_value PUBLISHABLE_KEY)"

if [[ -z "$NEXT_PUBLIC_SUPABASE_URL" || -z "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ]]; then
  echo "Could not read the local API URL and publishable key from 'supabase status'." >&2
  exit 1
fi

NEXT_PUBLIC_SITE_URL="http://localhost:$LOCAL_PORT"

export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY NEXT_PUBLIC_SITE_URL
echo "Using local Supabase at $NEXT_PUBLIC_SUPABASE_URL (Studio: http://127.0.0.1:54323, Mailpit: http://127.0.0.1:54324)"

exec pnpm exec next dev "$@"
