import type { Redis } from "ioredis";
import type { RateLimiter } from "@omnimcp/core-application";

/**
 * Fixed-window token bucket in Redis: INCR a per-key-per-minute counter, set it to
 * expire at the end of that window on first use. Simpler than a sliding-window
 * algorithm and precise enough for per-tenant API throttling.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly limitPerMinute: number,
  ) {}

  async consume(key: string, cost = 1): Promise<boolean> {
    const windowKey = `ratelimit:${key}:${Math.floor(Date.now() / 60_000)}`;
    const count = await this.redis.incrby(windowKey, cost);
    if (count === cost) {
      await this.redis.expire(windowKey, 60);
    }
    return count <= this.limitPerMinute;
  }
}
