/**
 * Auth service — TASK-003
 * Implements POST /auth/login and POST /auth/sso/callback per 04_API_SPEC.md
 * JWT issuance with org_id/role claims; SSO via mock provider.
 */

import { signToken } from "./jwt";
import { findUserByEmail, findUserById, verifyPassword } from "./users";
import { createRefreshToken, findRefreshToken, revokeRefreshToken } from "./refreshTokens";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SsoCallbackRequest {
  provider: string; // e.g. azure_ad, okta
  code: string;     // OAuth code (mock: email encoded)
  email?: string;   // for tests, allow direct email
}

export interface AuthResult {
  token: string;
  refreshToken?: string;
  user: { id: string; orgId: string; email: string; name: string; role: string };
}

/**
 * Authenticate via email/password and return JWT.
 * Throws with status 401 on failure.
 */
export async function login(req: LoginRequest): Promise<AuthResult> {
  if (!req.email || !req.password) {
    const err = new Error("email and password required") as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const user = findUserByEmail(req.email);
  if (!user) {
    const err = new Error("Invalid credentials") as Error & { status?: number; code?: string };
    err.status = 401;
    err.code = "INVALID_CREDENTIALS";
    throw err;
  }
  const ok = await verifyPassword(user, req.password);
  if (!ok) {
    const err = new Error("Invalid credentials") as Error & { status?: number; code?: string };
    err.status = 401;
    err.code = "INVALID_CREDENTIALS";
    throw err;
  }
  const token = signToken({
    userId: user.id,
    orgId: user.orgId,
    role: user.role,
    email: user.email,
  });
  const { token: refreshTokenString } = createRefreshToken(user.id);
  
  return {
    token,
    refreshToken: refreshTokenString,
    user: { id: user.id, orgId: user.orgId, email: user.email, name: user.name, role: user.role },
  };
}

/**
 * SSO callback — mock: code is the user's email (or base64 email) for test simplicity.
 * Production would exchange code for provider profile via OIDC.
 */
export async function ssoCallback(req: SsoCallbackRequest): Promise<AuthResult> {
  if (!req.provider) {
    const err = new Error("provider required") as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  // Allow test to pass email directly, or decode code as email
  let email = req.email;
  if (!email && req.code) {
    try {
      // try base64
      const decoded = Buffer.from(req.code, "base64").toString("utf8");
      email = decoded.includes("@") ? decoded : req.code;
    } catch {
      email = req.code;
    }
  }
  if (!email) {
    const err = new Error("code/email required") as Error & { status?: number };
    err.status = 400;
    throw err;
  }
  const user = findUserByEmail(email);
  if (!user) {
    const err = new Error("SSO user not found") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  // Optionally validate ssoProvider matches, but allow any for test
  const token = signToken({
    userId: user.id,
    orgId: user.orgId,
    role: user.role,
    email: user.email,
  });
  const { token: refreshTokenString } = createRefreshToken(user.id);

  return {
    token,
    refreshToken: refreshTokenString,
    user: { id: user.id, orgId: user.orgId, email: user.email, name: user.name, role: user.role },
  };
}

/**
 * Refresh an access token using a valid refresh token.
 */
export async function refreshAccessToken(refreshTokenStr: string): Promise<AuthResult> {
  const rt = findRefreshToken(refreshTokenStr);
  if (!rt) {
    const err = new Error("Invalid refresh token") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  if (rt.revokedAt || rt.expiresAt < new Date()) {
    const err = new Error("Refresh token expired or revoked") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  
  const user = findUserById(rt.userId);
  if (!user) {
    const err = new Error("User not found") as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  const token = signToken({
    userId: user.id,
    orgId: user.orgId,
    role: user.role,
    email: user.email,
  });

  return {
    token,
    user: { id: user.id, orgId: user.orgId, email: user.email, name: user.name, role: user.role },
  };
}

/**
 * Revoke a refresh token (Logout)
 */
export async function logout(refreshTokenStr: string): Promise<void> {
  const rt = findRefreshToken(refreshTokenStr);
  if (rt) {
    revokeRefreshToken(rt.id);
  }
}

/** Helper for tests: get user by ID for sso */
export function getUserById(id: string) {
  return findUserById(id);
}
