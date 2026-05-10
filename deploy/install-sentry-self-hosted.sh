#!/usr/bin/env bash
set -euo pipefail

SENTRY_DIR="${SENTRY_DIR:-/opt/sentry-self-hosted}"
SENTRY_VERSION="${SENTRY_VERSION:-24.1.0}"

CPU_CORES="$(nproc || echo 0)"
MEM_KB="$(awk '/MemTotal/ {print $2}' /proc/meminfo || echo 0)"
MEM_GB="$((MEM_KB / 1024 / 1024))"

if (( CPU_CORES < 4 )); then
  echo "Sentry self-hosted requires at least 4 vCPU. Found: ${CPU_CORES}."
  echo "Resize your EC2 instance before running this installer."
  exit 1
fi

if (( MEM_GB < 8 )); then
  echo "Sentry self-hosted requires at least 8GB RAM (16GB recommended). Found: ${MEM_GB}GB."
  echo "Resize your EC2 instance before running this installer."
  exit 1
fi

if [[ ! -d "${SENTRY_DIR}" ]]; then
  sudo git clone https://github.com/getsentry/self-hosted.git "${SENTRY_DIR}"
fi

cd "${SENTRY_DIR}"
sudo git fetch --tags
sudo git checkout "${SENTRY_VERSION}"

if [[ ! -f ".env.custom" ]]; then
  sudo cp .env .env.custom
fi

sudo ./install.sh --skip-user-prompt --no-report-self-hosted-issues
sudo docker compose up -d

echo "Sentry self-hosted stack is running."
