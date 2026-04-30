import pino from "pino";
import { getCorrelationId } from "../middleware/asyncLocalStore";

export const logger = pino({
  level: process.env.LOG_LEVEL || "debug",
  transport: {
    target: "pino/file",
    options: {
      destination: "logs/app.log",
      mkdir: true,
    },
  },
  mixin: () => ({
    correlation_id: getCorrelationId(),
  }),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export const httpLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: {
    target: "pino/file",
    options: {
      destination: "logs/http.log",
      mkdir: true,
    },
  },
  mixin: () => ({
    correlation_id: getCorrelationId(),
  }),
  timestamp: pino.stdTimeFunctions.isoTime,
});
