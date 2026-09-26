#!/usr/bin/env bash
# Deploy Atlas Ekonomi Sabah to Azure (public beta). Run from the repo root:
#   bash infra/azure/deploy.sh
# Needs: az CLI logged in (az login), an existing subscription with credits, and a
# populated .env (see .env.example). Every step asks before it spends money.
set -euo pipefail

ask() { read -r -p "$1 [y/N] " a; [[ "$a" == "y" || "$a" == "Y" ]]; }
need() { command -v "$1" >/dev/null || { echo "Missing $1. $2"; exit 1; }; }

need az "Install: brew install azure-cli, then: az login"
need uv "Install: https://docs.astral.sh/uv/"
set -a; [[ -f .env ]] && source .env; set +a

RG=${ATLAS_RG:-atlas-ekonomi-sabah}
LOC=${ATLAS_LOCATION:-southeastasia}
PREFIX=${ATLAS_PREFIX:-atlas}
EMAIL=${ATLAS_ALERT_EMAIL:?Set ATLAS_ALERT_EMAIL in .env for budget alerts}
BUDGET=${ATLAS_MONTHLY_BUDGET:-150}

echo "Subscription: $(az account show --query name -o tsv)"
echo "Resource group: $RG ($LOC) · budget alerts at 50/80/100% of $BUDGET/month to $EMAIL"
echo "Creates: Container Apps (api, web; scale to zero), PostgreSQL Flexible B1ms, Storage, ACR Basic,"
echo "         Log Analytics + App Insights, weekly pipeline job. Check current prices in the Azure"
echo "         Pricing Calculator; the database is the main fixed cost."
ask "Proceed with provisioning?" || exit 0

az group create -n "$RG" -l "$LOC" -o none
DB_PASS=${ATLAS_DB_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)}
REVIEW=${ATLAS_REVIEW_TOKEN:-$(openssl rand -hex 24)}

az deployment group create -g "$RG" -f infra/azure/main.bicep -o none -p \
  prefix="$PREFIX" location="$LOC" alertEmail="$EMAIL" monthlyBudget="$BUDGET" \
  dbPassword="$DB_PASS" reviewToken="$REVIEW" \
  azureOpenAiEndpoint="${AZURE_OPENAI_ENDPOINT:-}" azureOpenAiKey="${AZURE_OPENAI_API_KEY:-}" \
  llmDeployment="${ATLAS_LLM_DEPLOYMENT:-}" embedDeployment="${ATLAS_EMBED_DEPLOYMENT:-}" \
  earthdataToken="${EARTHDATA_TOKEN:-}"

out() { az deployment group show -g "$RG" -n main --query "properties.outputs.$1.value" -o tsv; }
ACR=$(out acrLoginServer); API_URL=$(out apiUrl); WEB_URL=$(out webUrl); REL=$(out releasesUrl)

echo "Building images in ACR (no local Docker needed)…"
az acr build -r "${ACR%%.*}" -t atlas-api:latest -f apps/api/Dockerfile . -o none
az acr build -r "${ACR%%.*}" -t atlas-web:latest apps/web -o none \
  --build-arg ATLAS_RELEASES_BASE_URL="$REL"

az containerapp update -g "$RG" -n "$PREFIX-api" --image "$ACR/atlas-api:latest" -o none
az containerapp update -g "$RG" -n "$PREFIX-web" --image "$ACR/atlas-web:latest" \
  --set-env-vars ATLAS_RELEASES_BASE_URL="$REL" -o none
az containerapp job update -g "$RG" -n "$PREFIX-pipeline" --image "$ACR/atlas-api:latest" -o none

if ask "Run the pipeline job now to load data (≈10 min)?"; then
  az containerapp job start -g "$RG" -n "$PREFIX-pipeline" -o none
  echo "Started. Follow it with: az containerapp job execution list -g $RG -n $PREFIX-pipeline -o table"
fi

echo
echo "Web: $WEB_URL"
echo "API: $API_URL/docs"
echo "Review token (store it in your password manager; it is not shown again): $REVIEW"
