import crypto from "crypto";
import bcrypt from "bcryptjs";
import { signToken } from "./jwt";
import { findUserByEmail, findUserById, verifyPassword } from "./users";
import { createRefreshToken, findRefreshToken, revokeRefreshToken } from "./refreshTokens";
import { prisma } from "../db/client";
import { withTenant } from "../db/tenant";

export interface LoginRequest { email: string; password: string; }
export interface SsoCallbackRequest { provider: string; code: string; email?: string; }
export interface AuthResult { token: string; refreshToken?: string; user: { id: string; orgId: string; email: string; name: string; role: string }; }

type UserRecord = { id: string; orgId: string; email: string; name: string; role: string; passwordHash?: string | null; ssoProvider?: string | null };
function authError(message: string, status = 401, code = "UNAUTHORIZED") { const e = new Error(message) as Error & { status?: number; code?: string }; e.status = status; e.code = code; return e; }
function issue(user: UserRecord, refreshToken?: string): AuthResult { return { token: signToken({ userId: user.id, orgId: user.orgId, role: user.role, email: user.email }), refreshToken, user: { id: user.id, orgId: user.orgId, email: user.email, name: user.name, role: user.role } }; }

async function productionUserByEmail(email: string): Promise<UserRecord | null> {
  return withTenant(prisma as never, process.env.AUTH_ORG_ID || "", async (tx: unknown) => {
    const rows = await (tx as any).$queryRawUnsafe(
      "SELECT id, org_id AS \"orgId\", email, name, role, password_hash AS \"passwordHash\", sso_provider AS \"ssoProvider\" FROM users WHERE lower(email)=lower($1) LIMIT 1", email,
    );
    return rows[0] ?? null;
  });
}

export async function login(req: LoginRequest): Promise<AuthResult> {
  if (!req.email || !req.password) throw authError("email and password required", 400, "BAD_REQUEST");
  if (process.env.NODE_ENV === "production") {
    const orgId = process.env.AUTH_ORG_ID;
    if (!orgId) throw authError("Authentication tenant is not configured", 503, "AUTH_NOT_CONFIGURED");
    const user = await productionUserByEmail(req.email);
    if (!user || !user.passwordHash || !(await bcrypt.compare(req.password, user.passwordHash))) throw authError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    const refreshToken = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expires = new Date(Date.now() + 7 * 86400000);
    await withTenant(prisma as never, orgId, async (tx: unknown) => {
      await (tx as any).$executeRawUnsafe("INSERT INTO refresh_tokens (id,user_id,org_id,token_hash,expires_at) VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,$4)", user.id, orgId, hash, expires);
    });
    return issue(user, refreshToken);
  }
  const user = findUserByEmail(req.email);
  if (!user || !(await verifyPassword(user, req.password))) throw authError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  return issue(user, createRefreshToken(user.id).token);
}

export async function ssoCallback(req: SsoCallbackRequest): Promise<AuthResult> {
  if (process.env.NODE_ENV === "production") throw authError("SSO is not configured for this deployment", 503, "SSO_NOT_CONFIGURED");
  if (!req.provider) throw authError("provider required", 400, "BAD_REQUEST");
  let email = req.email;
  if (!email && req.code) { try { const decoded = Buffer.from(req.code, "base64").toString("utf8"); email = decoded.includes("@") ? decoded : req.code; } catch { email = req.code; } }
  if (!email) throw authError("code/email required", 400, "BAD_REQUEST");
  const user = findUserByEmail(email);
  if (!user) throw authError("SSO user not found");
  if (user.ssoProvider && user.ssoProvider !== req.provider) throw authError("SSO provider mismatch");
  return issue(user, createRefreshToken(user.id).token);
}

export async function refreshAccessToken(refreshTokenStr: string): Promise<AuthResult> {
  if (process.env.NODE_ENV === "production") {
    const hash = crypto.createHash("sha256").update(refreshTokenStr).digest("hex");
    const orgId = process.env.AUTH_ORG_ID;
    if (!orgId) throw authError("Authentication tenant is not configured", 503, "AUTH_NOT_CONFIGURED");
    return withTenant(prisma as never, orgId, async (tx: unknown) => {
      const p = tx as any;
      const rows = await p.$queryRawUnsafe("SELECT rt.id, rt.user_id AS \"userId\", rt.expires_at AS \"expiresAt\", u.org_id AS \"orgId\", u.email, u.name, u.role FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE rt.token_hash=$1 AND rt.org_id=$2::uuid AND rt.revoked_at IS NULL LIMIT 1", hash, orgId);
      const rt = rows[0];
      if (!rt || new Date(rt.expiresAt) <= new Date()) throw authError("Refresh token expired or revoked");
      await p.$executeRawUnsafe("UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1::uuid AND revoked_at IS NULL", rt.id);
      const next = crypto.randomBytes(32).toString("hex");
      const nextHash = crypto.createHash("sha256").update(next).digest("hex");
      await p.$executeRawUnsafe("INSERT INTO refresh_tokens (id,user_id,org_id,token_hash,expires_at) VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,now()+interval '7 days')", rt.userId, orgId, nextHash);
      return issue({ id: rt.userId, orgId: rt.orgId, email: rt.email, name: rt.name, role: rt.role }, next);
    });
  }
  const rt = findRefreshToken(refreshTokenStr);
  if (!rt || rt.revokedAt || rt.expiresAt <= new Date()) throw authError("Refresh token expired or revoked");
  const user = findUserById(rt.userId); if (!user) throw authError("User not found");
  revokeRefreshToken(rt.id);
  return issue(user, createRefreshToken(user.id).token);
}

export async function logout(refreshTokenStr: string): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    const orgId = process.env.AUTH_ORG_ID; if (!orgId) return;
    const hash = crypto.createHash("sha256").update(refreshTokenStr).digest("hex");
    await withTenant(prisma as never, orgId, async (tx: unknown) => { await (tx as any).$executeRawUnsafe("UPDATE refresh_tokens SET revoked_at=now() WHERE token_hash=$1 AND org_id=$2::uuid AND revoked_at IS NULL", hash, orgId); });
    return;
  }
  const rt = findRefreshToken(refreshTokenStr); if (rt) revokeRefreshToken(rt.id);
}
export function getUserById(id: string) { return findUserById(id); }
