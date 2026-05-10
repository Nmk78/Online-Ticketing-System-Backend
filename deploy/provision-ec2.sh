#!/usr/bin/env bash
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SSH_PUBLIC_KEY="${SSH_PUBLIC_KEY:-}"
API_PORT="${API_PORT:-3000}"

if [[ -z "${SSH_PUBLIC_KEY}" ]]; then
  echo "Set SSH_PUBLIC_KEY env var before running this script."
  exit 1
fi

if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
else
  echo "Unable to detect operating system."
  exit 1
fi

install_docker_ubuntu() {
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg lsb-release ufw

  if ! command -v docker >/dev/null 2>&1; then
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  fi

  sudo ufw --force reset
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw allow "${API_PORT}"/tcp
  sudo ufw --force enable
}

install_docker_amazon_linux() {
  sudo dnf update -y
  sudo dnf install -y docker git curl tar
  sudo systemctl enable docker
  sudo systemctl start docker

  # Install latest Docker Compose plugin where distro package is unavailable.
  if ! docker compose version >/dev/null 2>&1; then
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -fSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  fi

  # Ensure buildx version is new enough for Sentry self-hosted images.
  if ! docker buildx version >/dev/null 2>&1; then
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    sudo curl -fSL https://github.com/docker/buildx/releases/download/v0.33.0/buildx-v0.33.0.linux-amd64 \
      -o /usr/local/lib/docker/cli-plugins/docker-buildx
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
  fi
}

case "${ID}" in
  ubuntu)
    install_docker_ubuntu
    ;;
  amzn)
    install_docker_amazon_linux
    ;;
  *)
    echo "Unsupported OS (${ID}). Supported: ubuntu, amzn."
    exit 1
    ;;
esac

if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
  sudo useradd -m -s /bin/bash "${DEPLOY_USER}"
fi

sudo usermod -aG docker "${DEPLOY_USER}"
sudo install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
echo "${SSH_PUBLIC_KEY}" | sudo tee "/home/${DEPLOY_USER}/.ssh/authorized_keys" >/dev/null
sudo chown "${DEPLOY_USER}:${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh/authorized_keys"
sudo chmod 600 "/home/${DEPLOY_USER}/.ssh/authorized_keys"
echo "Provisioning complete. Also ensure EC2 Security Group allows TCP 80, 443, and ${API_PORT}."
