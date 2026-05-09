import * as Sentry from "@sentry/node";

let isInitialized = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || isInitialized) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
    release: process.env.SENTRY_RELEASE || process.env.GITHUB_REF_NAME,
    tracesSampleRate: 0.2,
  });

  isInitialized = true;
}

export function sentryRequestHandler() {
  return (_req: unknown, _res: unknown, next: () => void) => next();
}

export function setupSentryExpressErrorHandler(app: Parameters<typeof Sentry.setupExpressErrorHandler>[0]) {
  Sentry.setupExpressErrorHandler(app);
}

export { Sentry };
