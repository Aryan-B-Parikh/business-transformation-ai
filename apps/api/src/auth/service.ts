import { signToken } from "./jwt";
import { findUserByEmail, findUserById, verifyPassword } from "./users";
import { createRefreshToken, findRefreshToken, revokeRefreshToken } from "./refreshTokens";

export interface LoginRequest { email: string; password: string; }
export interface SsoCallbackRequest { provider: string; code: string; email?: string; }
export interface AuthResult { token: string; refreshToken?: string; user: { id: string; orgId: string; email: string; name: string; role: string }; }

function authError(message: string, status = 401, code = "UNAUTHORIZED") {
  const err = new Error(message) as Error & { status?: number; code?: string };
  err.status = status; err.code = code; return err;
}

function issue(user: { id: string; orgId: string; email: string; name: string; role: string }) {
  const token = signToken({ userId: user.id, orgId: user.orgId, role: user.role, email: user.email });
  const { token: refreshToken } = createRefreshToken(user.id);
  return { token, refreshToken, user: { id: user.id, orgId: user.orgId, email: user.email, name: user.name, role: user.role } };
}

export async function login(req: LoginRequest): Promise<AuthResult> {
  if (!req.email || !req.password) throw authError("email and password required", 400, "BAD_REQUEST");
  const user = findUserByEmail(req.email);
  if (!user || !(await verifyPassword(user, req.password))) throw authError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  return issue(user);
}

export async function ssoCallback(req: SsoCallbackRequest): Promise<AuthResult> {
  // The repository currently contains a test/mock SSO provider, not a real OIDC exchange.
  // Never expose that trust model in production.
  if (process.env.NODE_ENV === "production") {
    throw authError("SSO is not configured for this deployment", 503, "SSO_NOT_CONFIGURED");
  }
  if (!req.provider) throw authError("provider required", 400, "BAD_REQUEST");
  let email = req.email;
  if (!email && req.code) {
    try {
      const decoded = Buffer.from(req.code, "base64").toString("utf8");
      email = decoded.includes("@") ? decoded : req.code;
    } catch { email = req.code; }
  }
  if (!email) throw authError("code/email required", 400, "BAD_REQUEST");
  const user = findUserByEmail(email);
  if (!user) throw authError("SSO user not found");
  if (user.ssoProvider && user.ssoProvider !== req.provider) throw authError("SSO provider mismatch");
  return issue(user);
}

export async function refreshAccessToken(refreshTokenStr: string): Promise<AuthResult> {
  const rt = findRefreshToken(refreshTokenStr);
  if (!rt || rt.revokedAt || rt.expiresAt <= new Date()) throw authError("Refresh token expired or revoked");
  const user = findUserById(rt.userId);
  if (!user) throw authError("User not found");
  // Rotate refresh tokens on every use. Reuse of the old token becomes invalid.
  revokeRefreshToken(rt.id);
  return issue(user);
}

export async function logout(refreshTokenStr: string): Promise<void> {
  const rt = findRefreshToken(refreshTokenStr);
  if (rt) revokeRefreshToken(rt.id);
}

export function getUserById(id: string) { return findUserById(id); }
