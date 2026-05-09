#!/usr/bin/env bash
set -euo pipefail

API_DOMAIN="${API_DOMAIN:?Set API_DOMAIN (e.g. your-name.int.yt)}"
SENTRY_DOMAIN="${SENTRY_DOMAIN:?Set SENTRY_DOMAIN (e.g. sentry.your-name.int.yt)}"
EMAIL="${EMAIL:?Set EMAIL for Let's Encrypt notices}"

sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot

sudo cp deploy/nginx-api.conf /etc/nginx/sites-available/"${API_DOMAIN}"
sudo cp deploy/nginx-sentry.conf /etc/nginx/sites-available/"${SENTRY_DOMAIN}"

sudo sed -i "s/your-name.int.yt/${API_DOMAIN}/g" /etc/nginx/sites-available/"${API_DOMAIN}"
sudo sed -i "s/sentry.your-name.int.yt/${SENTRY_DOMAIN}/g" /etc/nginx/sites-available/"${SENTRY_DOMAIN}"

sudo ln -sf /etc/nginx/sites-available/"${API_DOMAIN}" /etc/nginx/sites-enabled/"${API_DOMAIN}"
sudo ln -sf /etc/nginx/sites-available/"${SENTRY_DOMAIN}" /etc/nginx/sites-enabled/"${SENTRY_DOMAIN}"
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d "${API_DOMAIN}" -d "${SENTRY_DOMAIN}" --agree-tos -m "${EMAIL}" --non-interactive --redirect
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

echo "Nginx and TLS setup complete."
