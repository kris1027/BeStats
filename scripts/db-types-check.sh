#!/usr/bin/env bash
# Fails when lib/supabase/database.types.ts has drifted from the live schema.
#
# Spec 0001 AC-14: the committed types must match the database. Generated types
# that are merely regenerable are not enough, because nothing then notices when
# a migration lands and the types do not. This turns drift into a failed check
# rather than a confusing type error weeks later.
#
# Needs the local Supabase stack running (`pnpm supabase start`).
set -euo pipefail

TYPES_FILE="lib/supabase/database.types.ts"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

pnpm exec supabase gen types typescript --local --schema public > "$TMP_FILE"

if ! diff -u "$TYPES_FILE" "$TMP_FILE"; then
  echo
  echo "$TYPES_FILE is out of date with the database schema."
  echo "Run 'pnpm db:types' and commit the result."
  exit 1
fi

echo "$TYPES_FILE matches the database schema."
