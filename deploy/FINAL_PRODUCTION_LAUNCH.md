# Final Production Launch Runbook

Use this runbook to complete your final submission requirements end-to-end.

## 1) EC2 Provisioning

1. Launch an EC2 instance (Ubuntu 22.04 or Amazon Linux 2023).
2. Assign an Elastic IP.
3. In Security Group, allow inbound:
   - TCP `22` (your IP only)
   - TCP `80` (0.0.0.0/0)
   - TCP `443` (0.0.0.0/0)
   - TCP `3000` (optional; needed only if you want direct API port access)
4. SSH into the instance and run:

```bash
cd /opt
git clone <your-repo-url> concert-ticketing-api
cd concert-ticketing-api
export SSH_PUBLIC_KEY="<your local ~/.ssh/id_rsa.pub content>"
bash deploy/provision-ec2.sh
```

## 2) DNS + HTTPS + Reverse Proxy

Create DNS records:
- `A` record: `<your-name>.int.yt` -> `<EC2 Elastic IP>`
- `A` record: `sentry.<your-name>.int.yt` -> `<EC2 Elastic IP>`

Then on EC2:

```bash
cd /opt/concert-ticketing-api
export API_DOMAIN="<your-name>.int.yt"
export SENTRY_DOMAIN="sentry.<your-name>.int.yt"
export EMAIL="<your-email>"
bash deploy/setup-nginx-certbot.sh
```

## 3) CI/CD with GitHub Actions

Workflow already exists at `.github/workflows/release-deploy.yml`.

Set these GitHub repository secrets:
- `EC2_HOST` = EC2 public IP or domain
- `EC2_USER` = deploy user (default `deploy`)
- `EC2_APP_DIR` = `/opt/concert-ticketing-api`
- `EC2_SSH_KEY` = private key matching the public key added on server

Release deploy trigger:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 4) API Container Deployment

On EC2, create `.env` in `${EC2_APP_DIR}` with production values:
- `PORT=3000`
- `NODE_ENV=production`
- `SENTRY_DSN=https://<publicKey>@sentry.<your-name>.int.yt/<projectId>`
- `SENTRY_ENVIRONMENT=production`

Deploy manually once (or via CI):

```bash
cd /opt/concert-ticketing-api
bash deploy/deploy-api.sh
```

## 5) Self-Hosted Sentry

Important: self-hosted Sentry needs a bigger machine than tiny instances.
- Minimum: `4 vCPU`
- Minimum RAM: `8GB` (`16GB` recommended)

Install:

```bash
cd /opt/concert-ticketing-api
bash deploy/install-sentry-self-hosted.sh
```

The Sentry nginx config proxies to `127.0.0.1:9000`, so Sentry containers must be healthy.

## 6) ConcurrencyError Alert Rule

Generate an auth token in Sentry (project:write scope), then:

```bash
cd /opt/concert-ticketing-api
export SENTRY_BASE_URL="https://sentry.<your-name>.int.yt"
export SENTRY_TOKEN="<token>"
export SENTRY_ORG_SLUG="<org-slug>"
export SENTRY_PROJECT_SLUG="<project-slug>"
export ALERT_EMAIL="<your-email>"
bash deploy/setup-sentry-concurrency-alert.sh
```

## 7) Verification Checklist

API checks:

```bash
curl -I https://<your-name>.int.yt/api/v1
curl -I https://<your-name>.int.yt/docs
curl -I https://<your-name>.int.yt/health
```

Sentry checks:
1. Trigger a test error from production (or throw a controlled test error route once).
2. Open Sentry Issues page.
3. Confirm event appears with tags:
   - `error_type=ConcurrencyError`
   - `error_code=CONCURRENCY_ERROR`
4. Confirm your alert notification is delivered.

## 8) Submission Payload Template

Copy this into your final submission after replacing placeholders:

```text
1) API Endpoint Link:
https://<your-name>.int.yt/api/v1

2) Swagger Documentation:
https://<your-name>.int.yt/docs

3) Sentry Dashboard Link:
https://sentry.<your-name>.int.yt
Guest credentials (temporary):
username: <guest-username>
password: <temporary-password>
```
