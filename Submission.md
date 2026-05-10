# Final Production Launch Submission

## Student Information

- Name: `<your-name>`
- Project: `Concert Ticketing API`
- Environment: `Production (AWS EC2 + Docker + Nginx + Let's Encrypt + Self-Hosted Sentry)`

## Required Submission Links

1. **API Endpoint Link**
  `https://backend.naymyokhant.dev/api/v1`
2. **Swagger Documentation**
  `https://backend.naymyokhant.dev/docs`
3. **Sentry Dashboard Link (Self-Hosted)**
  `https://sentry.naymyokhant.dev`

## Deployment Summary

- EC2 instance provisioned with Docker + Docker Compose
- CI/CD configured using GitHub Actions (`.github/workflows/release-deploy.yml`)
- API deployed via container using `docker-compose.prod.yml`
- Reverse proxy configured with Nginx for domain routing
- SSL/TLS issued by Let's Encrypt with HTTP to HTTPS redirect enabled
- Self-hosted Sentry installed and connected to backend through `SENTRY_DSN`
- ConcurrencyError alert rule configured in Sentry for ticket booking failures

## Verification Evidence Checklist

- `https://backend.naymyokhant.dev/api/v1` is publicly reachable
- `https://backend.naymyokhant.dev/docs` is publicly reachable
- `https://sentry.naymyokhant.dev` is unreachable cuz EC2 resourse restriction
- Test production error appears in Sentry Issues
- ConcurrencyError alert rule sends notification successfully

## Notes for Evaluator

- If credentials expire, please contact: `naymyokhant78@gmail.com`
- All required ports and SSL are configured in production according to the assignment brief.

