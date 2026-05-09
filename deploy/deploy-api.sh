#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/concert-ticketing-api}"
RELEASE_TAG="${RELEASE_TAG:-unknown}"

mkdir -p "${APP_DIR}"
cd "${APP_DIR}"

if [[ ! -d .git ]]; then
  echo "Repository is not initialized in ${APP_DIR}."
  exit 1
fi

git fetch --all --tags --prune
git checkout "${RELEASE_TAG}"

if [[ ! -f .env ]]; then
  echo ".env is required at ${APP_DIR}/.env before deploy."
  exit 1
fi

docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker image prune -f

echo "Deployment completed for tag ${RELEASE_TAG}."
