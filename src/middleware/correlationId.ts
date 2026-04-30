import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { asyncLocalStore, RequestContext } from "./asyncLocalStore";

export const correlationIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const correlationId = req.headers["x-correlation-id"] as string | undefined;
  const id = correlationId || uuidv4();

  res.setHeader("X-Correlation-ID", id);

  const context: RequestContext = {
    correlationId: id,
    requestStarted: Date.now(),
  };

  asyncLocalStore.run(context, () => {
    next();
  });
};
