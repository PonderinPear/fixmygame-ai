// lib/redis.ts
import { createClient } from "redis";

declare global {
  // eslint-disable-next-line no-var
  var __redis: ReturnType<typeof createClient> | undefined;
}

export async function getRedis() {
  if (!process.env.REDIS_URL) {
    throw new Error("Missing REDIS_URL");
  }

  if (!global.__redis) {
    global.__redis = createClient({
      url: process.env.REDIS_URL,
    });

    global.__redis.on("error", (err) => console.error("Redis error:", err));
    await global.__redis.connect();
  }

  return global.__redis;
}