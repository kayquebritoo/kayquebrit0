// Integração do rate limit — Redis real, sem banco.
//   npm run test:int
// Sem KBOS_TEST_REDIS=1, tudo é pulado.
import { randomUUID } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type IORedis from "ioredis";

const RUN = !!process.env.KBOS_TEST_REDIS;

const { default: IORedisCtor } = await import("ioredis");
const { hitRateLimit } = await import("../rate-limit");

const redis = new IORedisCtor(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  lazyConnect: true,
}) as IORedis;

beforeAll(async () => {
  if (RUN) await redis.connect();
});

describe.skipIf(!RUN)("rate limit (redis)", () => {
  it("permite até o limite e bloqueia o excedente", async () => {
    const key = `test-rl:${randomUUID()}`;
    for (let i = 1; i <= 3; i++) {
      const s = await hitRateLimit(redis, key, 3, 60_000);
      expect(s.allowed).toBe(true);
      expect(s.remaining).toBe(3 - i);
    }
    const blocked = await hitRateLimit(redis, key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetMs).toBeGreaterThan(0);
    await redis.del(key);
  });

  it("chaves diferentes têm contadores independentes", async () => {
    const a = `test-rl:${randomUUID()}`;
    const b = `test-rl:${randomUUID()}`;
    await hitRateLimit(redis, a, 1, 60_000);
    expect((await hitRateLimit(redis, a, 1, 60_000)).allowed).toBe(false);
    expect((await hitRateLimit(redis, b, 1, 60_000)).allowed).toBe(true);
    await redis.del(a, b);
  });
});
