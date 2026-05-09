import { Request, Response, NextFunction } from "express";
import { AppError, ConcurrencyError, ValidationError } from "./errors";
import { logger } from "./logger";
import { getCorrelationId } from "./asyncLocalStore";
import { Sentry } from "../observability/sentry";

export const globalErrorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const correlationId = getCorrelationId();

  if (err instanceof AppError) {
    if (err instanceof ConcurrencyError) {
      Sentry.withScope((scope) => {
        scope.setTag("error_type", "ConcurrencyError");
        scope.setTag("error_code", err.errorCode);
        scope.setTag("endpoint", _req.path);
        scope.setLevel("warning");
        scope.setContext("request", {
          method: _req.method,
          path: _req.path,
          body: _req.body as Record<string, unknown>,
        });
        Sentry.captureException(err);
      });
    }

    logger.warn(
      {
        error_code: err.errorCode,
        status: err.statusCode,
        stack: err.stack,
      },
      err.message
    );

    const responseBody: Record<string, unknown> = {
      error: err.errorCode,
      message: err.message,
      ref: correlationId,
    };

    if (err instanceof ValidationError) {
      responseBody.details = err.details;
    }

    res.status(err.statusCode).json(responseBody);
    return;
  }

  logger.error(
    {
      error_code: "INTERNAL_ERROR",
      stack: err.stack,
    },
    `Unhandled error: ${err.message}`
  );

  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    ref: correlationId,
  });
};
