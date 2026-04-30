import { ZodSchema } from "zod";
import { Request, Response, NextFunction } from "express";
import { ValidationError } from "./errors";
import { logger } from "./logger";

export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));

      logger.warn(
        {
          error_code: "VALIDATION_ERROR",
          status: 400,
          details,
          method: req.method,
          path: req.originalUrl,
        },
        "Request validation failed"
      );

      next(new ValidationError("Request validation failed", details));
      return;
    }

    req.body = result.data;
    next();
  };
};
