interface Bucket {
  hits: number[];
}
const buckets = new Map<string, Bucket>();

/** Basic in-memory sliding-window limiter (per server instance). */
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    const retry = Math.ceil((windowMs - (now - b.hits[0])) / 1000);
    buckets.set(key, b);
    return { ok: false, retryAfterSec: Math.max(1, retry) };
  }
  b.hits.push(now);
  buckets.set(key, b);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.hits.length === 0 || now - v.hits[v.hits.length - 1] > windowMs) buckets.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}

export function resetRateLimits() {
  buckets.clear();
}
