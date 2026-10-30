#!/usr/bin/env bash
# Copy the local database (briefs and their reviews, document corpus, eval report) up to Neon.
# Run once from the repo root after creating the Neon project, and again whenever you want
# Neon to match your local copy:
#   bash infra/neon/seed.sh
# Needs: Docker running with the local db up (docker compose up -d db), uv, and
# ATLAS_NEON_URL in .env (the same URL as the GitHub secret ATLAS_DATABASE_URL).
set -euo pipefail

ask() { read -r -p "$1 [y/N] " a; [[ "$a" == "y" || "$a" == "Y" ]]; }
# Read .env with a real dotenv parser: `source .env` breaks on values like "KEY= value"
# and would echo secrets in its error messages.
env_get() { uv run --quiet python -c "from dotenv import dotenv_values as d; print(d('.env').get('$1') or '')"; }

URL=$(env_get ATLAS_NEON_URL); [[ -n "$URL" ]] || { echo "Set ATLAS_NEON_URL in .env"; exit 1; }
URL=${URL/postgresql+psycopg:/postgresql:}  # pg_restore wants a plain libpq URL
ask "Replace the Neon database with your local one?" || exit 0

docker compose exec -T db pg_dump -U atlas -d atlas -Fc -f /tmp/atlas.dump
# The URL goes in through the environment so it never appears on a command line.
docker compose exec -T -e NEON_URL="$URL" db sh -c \
  'pg_restore --clean --if-exists --no-owner --no-acl -d "$NEON_URL" /tmp/atlas.dump' || true
docker compose exec -T db rm -f /tmp/atlas.dump
echo "Done. Run the Deploy workflow (Actions tab) to publish the site from it."
