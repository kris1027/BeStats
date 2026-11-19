#!/usr/bin/env bash
# Runs the opt in `/api/v1` cross user suite (apps/web/app/api/v1/*.local.ts)
# against the local Supabase stack, the way `dev-docker.sh` points `next dev`
# at it: the two public values are read from `supabase status` and exported,
# so `.env.local` (the cloud project) is never read or edited, and the secret
# key is never read. It also exports the stack's legacy JWT secret as
# API_LOCAL_JWT_SECRET, so the suite can sign an expired token the stack
# itself accepts as well formed (spec 0035, AC Auth). That value exists only
# in the local stack, is never written to a file, and grants nothing in the
# cloud. Fails when the stack is not running.
set -euo pipefail

if ! pnpm exec supabase status >/dev/null 2>&1; then
  echo "Local Supabase stack is not running. Start it with: pnpm exec supabase start" >&2
  exit 1
fi

STATUS="$(pnpm exec supabase status -o env 2>/dev/null)"
read_value() {
  printf '%s\n' "$STATUS" | sed -n "s/^$1=\"\(.*\)\"$/\1/p"
}

NEXT_PUBLIC_SUPABASE_URL="$(read_value API_URL)"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$(read_value PUBLISHABLE_KEY)"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
API_LOCAL_JWT_SECRET="$(read_value JWT_SECRET)"

if [[ -z "$NEXT_PUBLIC_SUPABASE_URL" || -z "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" || -z "$API_LOCAL_JWT_SECRET" ]]; then
  echo "Could not read the local API URL, publishable key and JWT secret from 'supabase status'." >&2
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY NEXT_PUBLIC_SITE_URL API_LOCAL_JWT_SECRET
exec pnpm --filter @bestats/web exec vitest run --config vitest.api-local.mts "$@"
