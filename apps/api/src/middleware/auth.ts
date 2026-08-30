/**
 * Auth middleware — TASK-003 + TASK-004
 * Extracts Bearer JWT, verifies, attaches req.user.
 * Tenant (orgId) is resolved from JWT — never from client params (02 §5).
 * Returns 401 with { error: { code, message } } on failure per 04_API_SPEC.md § Conventions.
 */

import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../auth/jwt";

export interface AuthedRequest extends Request {
  user?: JwtPayload;
}

export function authenticate(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
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
