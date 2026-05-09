# Final Production Launch Runbook

## 1) EC2 Provisioning

1. Launch Ubuntu 24.04 EC2 and attach Elastic IP.
2. Add security group inbound rules:
   - TCP 22 (restricted to your IP)
   - TCP 80
   - TCP 443
   - TCP 3000 (optional, only for direct debugging)
3. Clone this repo on EC2 into `/opt/concert-ticketing-api`.
4. Run:

```bash
cd /opt/concert-ticketing-api
DEPLOY_USER=deploy \
SSH_PUBLIC_KEY="ssh-ed25519 AAAA...yourkey" \
API_PORT=3000 \
bash deploy/provision-ec2.sh
```

## 2) API Container Deployment

1. Create `/opt/concert-ticketing-api/.env` from `.env.production.example`.
2. Deploy manually once:

```bash
cd /opt/concert-ticketing-api
RELEASE_TAG=v1.0.0 bash deploy/deploy-api.sh
```

3. Verify:

```bash
curl http://127.0.0.1:3000/health
```

## 3) Self-Hosted Sentry

1. Install Sentry stack:

```bash
SENTRY_DIR=/opt/sentry-self-hosted bash deploy/install-sentry-self-hosted.sh
```

2. Create Sentry project for this API and copy DSN into API `.env`.
3. Configure ConcurrencyError alert:

```bash
SENTRY_BASE_URL="https://sentry.your-name.int.yt" \
SENTRY_TOKEN="sntrys_your_token" \
SENTRY_ORG_SLUG="your-org" \
SENTRY_PROJECT_SLUG="concert-ticketing-api" \
ALERT_EMAIL="you@example.com" \
bash deploy/setup-sentry-concurrency-alert.sh
```

## 4) DNS + Reverse Proxy + TLS

1. Point DNS:
   - `your-name.int.yt` -> EC2 Elastic IP
   - `sentry.your-name.int.yt` -> EC2 Elastic IP
2. Run:

```bash
cd /opt/concert-ticketing-api
API_DOMAIN="your-name.int.yt" \
SENTRY_DOMAIN="sentry.your-name.int.yt" \
EMAIL="you@example.com" \
bash deploy/setup-nginx-certbot.sh
```

3. Validate HTTPS:

```bash
curl -I https://your-name.int.yt/api/v1
curl -I https://your-name.int.yt/docs
curl -I https://sentry.your-name.int.yt
```

## 5) GitHub Actions (Tag-Based Deploy)

Required GitHub repository secrets:
- `EC2_HOST`
- `EC2_USER`
- `EC2_SSH_KEY`
- `EC2_APP_DIR` (example: `/opt/concert-ticketing-api`)

Create and push a release tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Workflow path: `.github/workflows/release-deploy.yml`

## 6) Production Verification

1. Trigger normal booking at `https://your-name.int.yt/api/v1/reserve`.
2. Trigger a concurrency conflict using parallel requests to generate `ConcurrencyError`.
3. Confirm event appears in self-hosted Sentry.
4. Confirm alert email is delivered.

## Submission Links Template

1. API Endpoint Link: `https://[your-subdomain].int.yt/api/v1`
2. Swagger Documentation: `https://[your-subdomain].int.yt/docs`
3. Sentry Dashboard Link: `https://sentry.[your-subdomain].int.yt`
