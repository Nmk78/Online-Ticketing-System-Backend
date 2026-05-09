import "reflect-metadata";
import express from "express";
import path from "path";
import { AppDataSource } from "./data-source";
import { startCleanupCron } from "./cron/cleanupJob";
import { correlationIdMiddleware } from "./middleware/correlationId";
import { globalErrorHandler } from "./middleware/globalErrorHandler";
import { logger } from "./middleware/logger";
import { initHardenedRoutes } from "./routes/hardenedReservations";
import swaggerSpec from "./middleware/swagger";
import swaggerUi from "swagger-ui-express";
import {
  initSentry,
  sentryRequestHandler,
  setupSentryExpressErrorHandler,
} from "./observability/sentry";

const app = express();
const PORT = process.env.PORT || 3000;
const API_PREFIXES = ["/api/v1", "/api/v2"] as const;

initSentry();

// ── Observability Middleware (first in chain) ─────────────────────────────────
app.use(correlationIdMiddleware);
app.use(sentryRequestHandler());
app.use((req, _res, next) => {
  logger.info(
    {
      method: req.method,
      path: req.originalUrl,
    },
    "Request received"
  );
  next();
});

// ── Standard middleware ───────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ── Swagger UI ────────────────────────────────────────────────────────────────
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────────
let server: ReturnType<typeof app.listen>;

async function bootstrap() {
  await AppDataSource.initialize();
  logger.info("Database connected and migrations verified");

  startCleanupCron();

  // Routes MUST be registered before the global error handler
  const hardenedRouter = await initHardenedRoutes();
  for (const apiPrefix of API_PREFIXES) {
    app.use(apiPrefix, hardenedRouter);
  }

  // Global error handler must be the VERY LAST middleware
  setupSentryExpressErrorHandler(app);
  app.use(globalErrorHandler);

  server = app.listen(PORT, () => {
    logger.info(`Concert Ticketing API running on http://localhost:${PORT}`);
    logger.info(`  GET  /docs            — Swagger documentation`);
    logger.info(`  GET  /api/v1/tickets  — List reservations (DTO serialized)`);
    logger.info(`  GET  /api/v2/tickets  — List reservations (DTO serialized)`);
    logger.info(`  POST /api/v1/reserve  — Reserve (optimistic locking)`);
    logger.info(`  POST /api/v2/reserve  — Reserve (optimistic locking)`);
    logger.info(`  POST /api/v2/reserve/pessimistic — Reserve (pessimistic locking)`);
    logger.info(`  POST /api/v2/reserve/atomic      — Reserve (atomic stock)`);
    logger.info(`  POST /api/v2/purchase — Confirm purchase`);
  });
}

function gracefulShutdown(signal: string) {
  logger.info(`${signal} received — starting graceful shutdown`);

  if (server) {
    server.close(async () => {
      logger.info("HTTP server closed — no longer accepting requests");

      await new Promise((resolve) => setTimeout(resolve, 5000));

      try {
        await AppDataSource.destroy();
        logger.info("Database connection pool drained");
      } catch (err) {
        logger.error({ err }, "Error during database shutdown");
      }

      logger.info("Graceful shutdown complete");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

bootstrap().catch((err) => {
  logger.error({ err }, "Failed to initialize application");
  process.exit(1);
});

export default app;
