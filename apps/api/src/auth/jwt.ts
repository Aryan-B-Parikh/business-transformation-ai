/**
 * JWT service — TASK-003
 * Issues JWTs with org_id / role claims per 04_API_SPEC.md § Auth
 * Tenant (org_id) resolved from JWT — never accepted as client-supplied parameter (02 §5 RLS)
 */

import jwt from "jsonwebtoken";

export interface JwtPayload {
  userId: string;
  orgId: string;
  role: string;
  email: string;
  iat?: number;
  exp?: number;
}

const DEFAULT_EXPIRES_IN = "8h";
const DEFAULT_DEV_SECRET = "dev_jwt_secret_change_in_production_32chars!";
export const CANONICAL_ISSUER = "https://auth.business-transformation-ai.com";
export const CANONICAL_AUDIENCE = "https://api.business-transformation-ai.com";

export function getJwtSecret(): string {
  if (process.env.NODE_ENV === "production") {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === DEFAULT_DEV_SECRET || secret.length < 32) {
      throw new Error(
        "CRITICAL SECURITY INVARIANT VIOLATION: Production requires a secure JWT_SECRET of at least 32 characters. Refusing to start."
      );
    }
    return secret;
  }
  return process.env.JWT_SECRET || DEFAULT_DEV_SECRET;
}

export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN;
}

/**
 * Sign a JWT for the given user. Must include org_id and role.
 * DoD: Integration test logs in a seeded user and receives a valid JWT
 */
export function signToken(payload: Omit<JwtPayload, "iat" | "exp">, expiresIn?: string): string {
  if (!payload.orgId) throw new Error("orgId is required in JWT");
  if (!payload.role) throw new Error("role is required in JWT");
  if (!payload.userId) throw new Error("userId is required in JWT");
  return jwt.sign(payload as object, getJwtSecret(), {
    algorithm: "HS256",
    issuer: CANONICAL_ISSUER,
    audience: CANONICAL_AUDIENCE,
    expiresIn: (expiresIn || getJwtExpiresIn()) as string & { _opaque?: never },
  } as jwt.SignOptions);
}

/**
 * Verify and decode a JWT. Throws if invalid, expired, or failed iss/aud.
 * DoD: expired/invalid tokens are rejected with 401
 */
export function verifyToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: CANONICAL_ISSUER,
      audience: CANONICAL_AUDIENCE,
    }) as JwtPayload;
    if (!decoded.orgId || !decoded.role || !decoded.userId) {
      throw new Error("Invalid token payload: missing orgId/role/userId");
    }
    return decoded;
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      const e = new Error("Token expired");
      (e as Error & { status?: number }).status = 401;
      (e as Error & { code?: string }).code = "TOKEN_EXPIRED";
      throw e;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      const e = new Error("Invalid token");
      (e as Error & { status?: number }).status = 401;
      (e as Error & { code?: string }).code = "INVALID_TOKEN";
      throw e;
    }
    const e = err as Error & { status?: number };
    if (!e.status) e.status = 401;
    throw e;
  }
}

/** Helper for tests: sign with custom expiry (e.g., 0s or already expired) */
export function signTokenWithExpiry(
  payload: Omit<JwtPayload, "iat" | "exp">,
  expiresIn: string | number
): string {
  return jwt.sign(payload as object, getJwtSecret(), {
    algorithm: "HS256",
    issuer: CANONICAL_ISSUER,
    audience: CANONICAL_AUDIENCE,
    expiresIn: expiresIn as unknown as string,
  } as jwt.SignOptions);
}

/** Create an already-expired token for testing */
export function signExpiredToken(payload: Omit<JwtPayload, "iat" | "exp">): string {
  // exp in the past
  return jwt.sign(
    {
      ...payload,
      iss: CANONICAL_ISSUER,
      aud: CANONICAL_AUDIENCE,
      exp: Math.floor(Date.now() / 1000) - 10,
    },
    getJwtSecret(),
    { algorithm: "HS256" }
  );
}
