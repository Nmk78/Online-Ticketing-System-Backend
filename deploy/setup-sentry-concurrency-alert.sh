#!/usr/bin/env bash
set -euo pipefail

SENTRY_BASE_URL="${SENTRY_BASE_URL:?Set SENTRY_BASE_URL, e.g. https://sentry.your-name.int.yt}"
SENTRY_TOKEN="${SENTRY_TOKEN:?Set SENTRY_TOKEN with project:write scope}"
SENTRY_ORG_SLUG="${SENTRY_ORG_SLUG:?Set SENTRY_ORG_SLUG}"
SENTRY_PROJECT_SLUG="${SENTRY_PROJECT_SLUG:?Set SENTRY_PROJECT_SLUG}"
ALERT_EMAIL="${ALERT_EMAIL:?Set ALERT_EMAIL recipient}"

curl --fail --silent --show-error \
  -X POST "${SENTRY_BASE_URL}/api/0/projects/${SENTRY_ORG_SLUG}/${SENTRY_PROJECT_SLUG}/rules/" \
  -H "Authorization: Bearer ${SENTRY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "ConcurrencyError during ticket booking",
  "actionMatch": "any",
  "frequency": 5,
  "filterMatch": "all",
  "filters": [
    {
      "id": "sentry.rules.filters.TaggedEventFilter",
      "key": "error_code",
      "match": "eq",
      "value": "CONCURRENCY_ERROR"
    },
    {
      "id": "sentry.rules.filters.EventAttributeFilter",
      "attribute": "message",
      "match": "co",
      "value": "Concert data was modified by another request"
    }
  ],
  "actions": [
    {
      "id": "sentry.mail.actions.NotifyEmailAction",
      "targetType": "IssueOwners",
      "targetIdentifier": ""
    }
  ]
}
EOF

echo "Sentry issue alert created."
