// RALD Config — Rate Limiter
// LILCKY STUDIO LIMITED
import type { KVNamespace } from "./cache";

export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const now   = Math.floor(Date.now() / 1000);
    const start = now - windowSeconds;
    const raw   = await kv.get(`rl:${key}`);
    const hits: number[] = raw ? JSON.parse(raw) : [];
    const recent = hits.filter((t) => t > start);
    if (recent.length >= limit) return { allowed: false, remaining: 0 };
    recent.push(now);
    await kv.put(`rl:${key}`, JSON.stringify(recent), { expirationTtl: windowSeconds + 60 });
    return { allowed: true, remaining: limit - recent.length };
  } catch { return { allowed: true, remaining: limit }; }
}
