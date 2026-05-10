#!/usr/bin/env bash
set -euo pipefail

API_DOMAIN="${API_DOMAIN:?Set API_DOMAIN (e.g. your-name.int.yt)}"
SENTRY_DOMAIN="${SENTRY_DOMAIN:?Set SENTRY_DOMAIN (e.g. sentry.your-name.int.yt)}"
EMAIL="${EMAIL:?Set EMAIL for Let's Encrypt notices}"

if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
else
  echo "Unable to detect operating system."
  exit 1
fi

case "${ID}" in
  ubuntu)
    sudo apt-get update
    sudo apt-get install -y nginx certbot python3-certbot-nginx
    ;;
  amzn)
    sudo dnf install -y nginx certbot python3-certbot-nginx
    ;;
  *)
    echo "Unsupported OS (${ID}). Supported: ubuntu, amzn."
    exit 1
    ;;
esac

sudo mkdir -p /var/www/certbot

if [[ "${ID}" == "amzn" ]]; then
  API_CONF_PATH="/etc/nginx/conf.d/${API_DOMAIN}.conf"
  SENTRY_CONF_PATH="/etc/nginx/conf.d/${SENTRY_DOMAIN}.conf"
else
  API_CONF_PATH="/etc/nginx/sites-available/${API_DOMAIN}"
  SENTRY_CONF_PATH="/etc/nginx/sites-available/${SENTRY_DOMAIN}"
fi

sudo cp deploy/nginx-api.conf "${API_CONF_PATH}"
sudo cp deploy/nginx-sentry.conf "${SENTRY_CONF_PATH}"

sudo sed -i "s/your-name.int.yt/${API_DOMAIN}/g" "${API_CONF_PATH}"
sudo sed -i "s/sentry.your-name.int.yt/${SENTRY_DOMAIN}/g" "${SENTRY_CONF_PATH}"

if [[ "${ID}" == "ubuntu" ]]; then
  sudo ln -sf "${API_CONF_PATH}" /etc/nginx/sites-enabled/"${API_DOMAIN}"
  sudo ln -sf "${SENTRY_CONF_PATH}" /etc/nginx/sites-enabled/"${SENTRY_DOMAIN}"
fi

sudo systemctl enable nginx
sudo systemctl start nginx
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d "${API_DOMAIN}" -d "${SENTRY_DOMAIN}" --agree-tos -m "${EMAIL}" --non-interactive --redirect
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

echo "Nginx and TLS setup complete."
