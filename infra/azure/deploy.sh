#!/usr/bin/env bash
# Deploy or update Atlas Ekonomi Sabah on Azure. Run from the repo root:
#   bash infra/azure/deploy.sh            # infrastructure + images
#   bash infra/azure/deploy.sh --seed-db  # also copy the local database (briefs, corpus, eval) up
# Needs: az (logged in), Docker running, uv, and a populated .env (see .env.example).
# Every step that creates or changes billable resources asks first.
set -euo pipefail

ask() { read -r -p "$1 [y/N] " a; [[ "$a" == "y" || "$a" == "Y" ]]; }
need() { command -v "$1" >/dev/null || { echo "Missing $1. $2"; exit 1; }; }
need az "Install: brew install azure-cli, then: az login"
need docker "Install Docker Desktop and start it"
need uv "Install: https://docs.astral.sh/uv/"

# Read .env with a real dotenv parser: `source .env` breaks on values like "KEY= value"
# and would echo secrets in its error messages.
env_get() { uv run --quiet python -c "from dotenv import dotenv_values as d; print(d('.env').get('$1') or '')"; }
RG=$(env_get ATLAS_RG); RG=${RG:-atlas-ekonomi-sabah}
LOC=$(env_get ATLAS_LOCATION); LOC=${LOC:-southeastasia}
EMAIL=$(env_get ATLAS_ALERT_EMAIL); [[ -n "$EMAIL" ]] || { echo "Set ATLAS_ALERT_EMAIL in .env"; exit 1; }
BUDGET=$(env_get ATLAS_MONTHLY_BUDGET); BUDGET=${BUDGET:-50}
for k in ATLAS_DB_PASSWORD ATLAS_REVIEW_TOKEN; do
  [[ -n "$(env_get $k)" ]] || { echo "Set $k in .env (a long random value)"; exit 1; }
done
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

echo "Subscription: $(az account show --query name -o tsv) ($(az account show --query id -o tsv))"
echo "Resource group $RG in $LOC; budget alerts at 50/80/100% of $BUDGET/month to $EMAIL."
echo "Creates/updates: Container Apps (api, web; scale to zero), PostgreSQL Flexible B1ms, Storage,"
echo "ACR Basic, Log Analytics + App Insights, weekly pipeline job, budget."
ask "Proceed?" || exit 0

params() {  # $1 = api image, $2 = web image
  # Keep custom domains bound outside Bicep (managed certificates need the DNS to exist first).
  az containerapp show -g "$RG" -n atlas-web --query properties.configuration.ingress.customDomains \
    -o json 2>/dev/null > "$TMP/domains.json" || echo "[]" > "$TMP/domains.json"
  uv run --quiet python - "$TMP/params.json" "$1" "$2" "$LOC" "$BUDGET" "$TMP/domains.json" <<'EOF'
import json, sys
from dotenv import dotenv_values
out, api, web, loc, budget, domains = sys.argv[1:]
v = dotenv_values(".env")
g = lambda k: v.get(k) or ""
p = {"prefix": "atlas", "location": loc, "alertEmail": g("ATLAS_ALERT_EMAIL"), "monthlyBudget": int(budget),
     "dbPassword": g("ATLAS_DB_PASSWORD"), "reviewToken": g("ATLAS_REVIEW_TOKEN"),
     "azureOpenAiEndpoint": g("AZURE_OPENAI_ENDPOINT"), "azureOpenAiKey": g("AZURE_OPENAI_API_KEY"),
     "llmDeployment": g("ATLAS_LLM_DEPLOYMENT"), "routerDeployment": g("ATLAS_LLM_ROUTER_DEPLOYMENT"),
     "briefDeployment": g("ATLAS_BRIEF_DEPLOYMENT"), "embedDeployment": g("ATLAS_EMBED_DEPLOYMENT"),
     "earthdataToken": g("EARTHDATA_TOKEN")}
p["webCustomDomains"] = json.load(open(domains)) or []
if api:
    p |= {"apiImage": api, "webImage": web}
json.dump({"contentVersion": "1.0.0.0", "parameters": {k: {"value": x} for k, x in p.items()}}, open(out, "w"))
EOF
  chmod 600 "$TMP/params.json"
}
out() { az deployment group show -g "$RG" -n main --query "properties.outputs.$1.value" -o tsv; }

az group create -n "$RG" -l "$LOC" -o none
# First run: placeholder images, so the URLs exist before the web image is built.
if az deployment group show -g "$RG" -n main -o none 2>/dev/null; then
  ACR=$(out acrLoginServer); params "$ACR/atlas-api:beta" "$ACR/atlas-web:beta"
else
  params "" ""
fi
az deployment group create -g "$RG" -n main -f infra/azure/main.bicep -p @"$TMP/params.json" -o none --only-show-errors
ACR=$(out acrLoginServer); API_URL=$(out apiUrl); WEB_URL=$(out webUrl); REL=$(out releasesUrl)
SITE=$(env_get ATLAS_SITE_URL); WEB_URL=${SITE:-$WEB_URL}  # public address, e.g. https://sabah-ku.com
STORAGE=$(out storageAccount); PG=$(out pgHost)

# Images are built locally: ACR Tasks (az acr build) is unavailable on free-credit subscriptions.
echo "Building images for linux/amd64 (the web image bakes in the public URLs)…"
az acr login -n "${ACR%%.*}" --only-show-errors
docker buildx build --platform linux/amd64 -t "$ACR/atlas-api:beta" -f apps/api/Dockerfile --push .
docker buildx build --platform linux/amd64 -t "$ACR/atlas-web:beta" \
  --build-arg ATLAS_API_URL="$API_URL" --build-arg NEXT_PUBLIC_SITE_URL="$WEB_URL" \
  --build-arg ATLAS_RELEASES_BASE_URL="$REL" --push apps/web

params "$ACR/atlas-api:beta" "$ACR/atlas-web:beta"
az deployment group create -g "$RG" -n main -f infra/azure/main.bicep -p @"$TMP/params.json" -o none --only-show-errors
# Same tag, new digest: force fresh revisions so the apps pick up the new images.
suffix=$(date +%m%d%H%M)
az containerapp update -g "$RG" -n atlas-api --image "$ACR/atlas-api:beta" --revision-suffix "r$suffix" -o none --only-show-errors
az containerapp update -g "$RG" -n atlas-web --image "$ACR/atlas-web:beta" --revision-suffix "r$suffix" -o none --only-show-errors

if [[ "${1:-}" == "--seed-db" ]] && ask "Replace the Azure database with your local one (briefs, corpus, eval)?"; then
  IP=$(curl -s https://api.ipify.org)
  az postgres flexible-server firewall-rule create -g "$RG" -s "${PG%%.*}" -n deploy-seed \
    --start-ip-address "$IP" --end-ip-address "$IP" -o none --only-show-errors
  docker compose exec -T db pg_dump -U atlas -d atlas -Fc -f /tmp/atlas.dump
  docker compose exec -T -e PGPASSWORD="$(env_get ATLAS_DB_PASSWORD)" db pg_restore --clean --if-exists \
    --no-owner --no-acl -d "host=$PG user=atlas dbname=atlas sslmode=require" /tmp/atlas.dump || true
  docker compose exec -T db rm -f /tmp/atlas.dump
  az postgres flexible-server firewall-rule delete -g "$RG" -s "${PG%%.*}" -n deploy-seed --yes -o none --only-show-errors
  az storage blob upload-batch --account-name "$STORAGE" -d releases -s data/releases \
    --auth-mode key --overwrite -o none --only-show-errors
fi

if ask "Run the pipeline job now (refreshes data from DOSM, ~2 min)?"; then
  az containerapp job start -g "$RG" -n atlas-pipeline -o none --only-show-errors
  echo "Follow it: az containerapp job execution list -g $RG -n atlas-pipeline -o table"
fi

echo
echo "Web: $WEB_URL"
echo "API: $API_URL/docs"
echo "The review token is ATLAS_REVIEW_TOKEN in your .env."
