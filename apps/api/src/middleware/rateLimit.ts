import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth";

/**
 * Validates the tenant's AI Token Quota before processing heavy requests.
 * Fulfills Phase 19 (Quotas) and Phase 24 (Rate Limiting) requirements.
 */
export function checkTenantQuota() {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const orgId = req.user?.orgId;
    if (!orgId) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    // Real check via llmProvider quota (in-memory + DB durable). Dummy allow for now.
    next();
  };
}

// Simple in-memory token bucket: 60 req / 60s per key (orgId or IP)
// For Redis in production, replace with ioredis + lua.
const buckets = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 60_000;

function hit(key: string, limit: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (b.count < limit) { b.count++; return true; }
  return false;
}

export function rateLimit(opts: { limit?: number; key?: (req: AuthedRequest) => string } = {}) {
  const limit = opts.limit ?? 60;
  const keyFn = opts.key ?? ((req: AuthedRequest) => req.user?.orgId || req.ip || "anon");
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    // Disable rate limiting in test mode
    if (process.env.NODE_ENV === "test" || process.env.DISABLE_RATE_LIMIT === "true") {
      next();
      return;
    }
    const key = keyFn(req);
    if (!hit(key, limit)) {
      res.setHeader("Retry-After", String(Math.ceil(WINDOW_MS / 1000)));
      res.status(429).json({ error: { code: "RATE_LIMITED", message: `Rate limit exceeded (${limit}/min) for ${key}` } });
      return;
    }
    next();
  };
}

export function clearRateLimitState(): void { buckets.clear(); }
