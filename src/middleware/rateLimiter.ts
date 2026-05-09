import rateLimit, { MemoryStore } from "express-rate-limit";
import { RateLimitError } from "./errors";

let store: unknown = null;

async function getStore() {
  if (store) return store as InstanceType<typeof MemoryStore>;

  try {
    const { default: RedisStoreCtor } = await import("rate-limit-redis");
    const Redis = (await import("ioredis")).default;
    const redis = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT) || 6379,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    });

    redis.on("error", () => {});
    await redis.connect();

    const redisStore = new RedisStoreCtor({
      sendCommand: (...cmd: unknown[]) =>
        (redis as any).call(...cmd),
    });

    store = redisStore;
    console.log("[RATE_LIMIT] Using Redis-backed rate limiter");
    return store as InstanceType<typeof MemoryStore>;
  } catch {
    console.warn(
      "[RATE_LIMIT] Redis unavailable, falling back to in-memory store"
    );
    store = new MemoryStore();
    return store as InstanceType<typeof MemoryStore>;
  }
}

export async function createReserveRateLimiter() {
  const limiterStore = await getStore();

  return rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: limiterStore,
    handler: (_req, _res, next) => {
      next(new RateLimitError());
    },
  });
}
