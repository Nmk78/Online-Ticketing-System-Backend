#!/usr/bin/env bash
set -euo pipefail

SENTRY_DIR="${SENTRY_DIR:-/opt/sentry-self-hosted}"
SENTRY_VERSION="${SENTRY_VERSION:-24.1.0}"

if [[ ! -d "${SENTRY_DIR}" ]]; then
  sudo git clone https://github.com/getsentry/self-hosted.git "${SENTRY_DIR}"
fi

cd "${SENTRY_DIR}"
sudo git fetch --tags
sudo git checkout "${SENTRY_VERSION}"

if [[ ! -f ".env.custom" ]]; then
  sudo cp .env .env.custom
fi

sudo ./install.sh --skip-user-prompt
sudo docker compose up -d

echo "Sentry self-hosted stack is running."
