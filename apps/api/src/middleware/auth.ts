/**
 * Auth middleware — TASK-003 + TASK-004
 * Extracts Bearer JWT, verifies, attaches req.user.
 * Tenant (orgId) is resolved from JWT — never from client params (02 §5).
 * Returns 401 with { error: { code, message } } on failure per 04_API_SPEC.md § Conventions.
 */

import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../auth/jwt";
import { getRecordByHash, hashApiKey } from "./apiKey";

export interface AuthedRequest extends Request {
  user?: JwtPayload;
}

export function authenticate(req: AuthedRequest, res: Response, next: NextFunction): void {
  // Allow X-API-Key as alternative to Bearer JWT (enterprise integration FR-13.2)
  const apiKeyRaw = (req.header("x-api-key") || req.header("X-API-Key") || "").trim();
  if (apiKeyRaw) {
    const h = hashApiKey(apiKeyRaw);
    const rec = getRecordByHash(h);
    if (rec) {
      req.user = { userId: `api-key:${rec.id}`, orgId: rec.orgId, role: "viewer", iss: "api-key", aud: "bta-api" } as unknown as JwtPayload;
      next();
      return;
    }
  }
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    // If API key was provided but not found, return 401 with API-key specific message
    if (apiKeyRaw) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid API key" } });
      return;
    }
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing Authorization header" } });
    return;
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing token" } });
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err: unknown) {
    const e = err as Error & { status?: number; code?: string };
    const code = e.code || "UNAUTHORIZED";
    const message = e.message || "Invalid token";
    const status = e.status || 401;
    if (process.env.CI || process.env.VITEST) console.error(`[AUTH-REJECT] ${status} ${code}: ${message}`);
    res.status(status).json({ error: { code, message } });
  }
}

/** Optional auth: attaches user if token present, but doesn't reject if missing */
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    try {
      req.user = verifyToken(token);
    } catch {
      // ignore
    }
  }
  next();
}
