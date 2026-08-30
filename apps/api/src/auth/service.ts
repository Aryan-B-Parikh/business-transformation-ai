import crypto from "crypto";
import bcrypt from "bcryptjs";
import { signToken } from "./jwt";
import { findUserByEmail, findUserById, verifyPassword } from "./users";
import { createRefreshToken, findRefreshToken, revokeRefreshToken } from "./refreshTokens";
import { prisma } from "../db/client";
import { withTenant } from "../db/tenant";

export interface LoginRequest { email: string; password: string; orgId?: string; }
export interface SsoCallbackRequest { provider: string; code: string; email?: string; }
export interface AuthResult { token: string; refreshToken?: string; user: { id: string; orgId: string; email: string; name: string; role: string }; }
type UserRecord = { id: string; orgId: string; email: string; name: string; role: string; passwordHash?: string | null; ssoProvider?: string | null };
function authError(message: string, status = 401, code = "UNAUTHORIZED") { const e = new Error(message) as Error & { status?: number; code?: string }; e.status = status; e.code = code; return e; }
function issue(user: UserRecord, refreshToken?: string): AuthResult { return { token: signToken({ userId: user.id, orgId: user.orgId, role: user.role, email: user.email }), refreshToken, user: { id: user.id, orgId: user.orgId, email: user.email, name: user.name, role: user.role } }; }

async function productionUserByEmail(email: string, orgId: string): Promise<UserRecord | null> {
  return withTenant(prisma as never, orgId, async (tx: unknown) => {
    const rows = await (tx as any).$queryRawUnsafe("SELECT id, org_id AS \"orgId\", email, name, role, password_hash AS \"passwordHash\", sso_provider AS \"ssoProvider\" FROM users WHERE org_id=$1::uuid AND lower(email)=lower($2) LIMIT 1", orgId, email);
    return rows[0] ?? null;
  });
}

export async function login(req: LoginRequest): Promise<AuthResult> {
  if (!req.email || !req.password) throw authError("email and password required", 400, "BAD_REQUEST");
  if (process.env.NODE_ENV === "production") {
    if (!req.orgId) throw authError("orgId is required for tenant-scoped authentication", 400, "ORG_ID_REQUIRED");
    const user = await productionUserByEmail(req.email, req.orgId);
    if (!user || !user.passwordHash || !(await bcrypt.compare(req.password, user.passwordHash))) throw authError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    const refreshToken = crypto.randomBytes(32).toString("hex"), hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    await withTenant(prisma as never, req.orgId, async (tx: unknown) => {
      await (tx as any).$executeRawUnsafe("INSERT INTO refresh_tokens (id,user_id,org_id,token_hash,expires_at) VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,now()+interval '7 days')", user.id, req.orgId, hash);
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
  if (process.env.NODE_ENV === "production") throw authError("Refresh endpoint requires tenant-aware session infrastructure", 503, "AUTH_NOT_CONFIGURED");
  const rt = findRefreshToken(refreshTokenStr);
  if (!rt || rt.revokedAt || rt.expiresAt <= new Date()) throw authError("Refresh token expired or revoked");
  const user = findUserById(rt.userId); if (!user) throw authError("User not found");
  revokeRefreshToken(rt.id);
  return issue(user, createRefreshToken(user.id).token);
}

export async function logout(refreshTokenStr: string): Promise<void> {
  if (process.env.NODE_ENV === "production") throw authError("Logout requires tenant-aware session infrastructure", 503, "AUTH_NOT_CONFIGURED");
  const rt = findRefreshToken(refreshTokenStr); if (rt) revokeRefreshToken(rt.id);
}
export function getUserById(id: string) { return findUserById(id); }
