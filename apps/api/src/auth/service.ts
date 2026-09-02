/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db/client";
import { withTenant } from "../db/tenant";
import { signToken } from "./jwt";
import { createRefreshToken, findRefreshToken, revokeRefreshToken } from "./refreshTokens";
import { findUserByEmail, findUserById, verifyPassword } from "./users";

export interface LoginRequest { email: string; password: string; orgId?: string; }
export interface SsoCallbackRequest { provider: string; code: string; email?: string; }
export interface AuthResult { token: string; refreshToken?: string; refreshTokenBody?: string; user: { id: string; orgId: string; email: string; name: string; role: string }; }
type UserRecord = { id: string; orgId: string; email: string; name: string; role: string; passwordHash?: string | null; ssoProvider?: string | null };
function authError(message: string, status = 401, code = "UNAUTHORIZED") { const e = new Error(message) as Error & { status?: number; code?: string }; e.status = status; e.code = code; return e; }
function issue(user: UserRecord, refreshToken?: string): AuthResult { console.error(`[AUTH-DEBUG] issue() called userId=${user.id} orgId=${user.orgId}`); return { token: signToken({ userId: user.id, orgId: user.orgId, role: user.role, email: user.email }), refreshToken, user: { id: user.id, orgId: user.orgId, email: user.email, name: user.name, role: user.role } }; }
function makeProductionRefreshToken(orgId: string) { return `${orgId}.${crypto.randomBytes(32).toString("hex")}`; }
function splitProductionRefreshToken(value: string) { const i = value.indexOf("."); if (i < 1) throw authError("Invalid refresh token"); return { orgId: value.slice(0, i), secret: value.slice(i + 1) }; }

async function productionUserByEmail(email: string, orgId: string): Promise<UserRecord | null> {
  console.error(`[AUTH-DEBUG] >>> productionUserByEmail ENTRY email=${email} orgId=${orgId}`);
  try {
    const result = await withTenant(prisma as never, orgId, async (tx: unknown) => {
      console.error(`[AUTH-DEBUG] CALLBACK START orgId=${orgId}`);
      const rows = await (tx as any).$queryRawUnsafe("SELECT id, org_id AS \"orgId\", email, name, role, password_hash AS \"passwordHash\", sso_provider AS \"ssoProvider\" FROM users WHERE org_id=$1::uuid AND lower(email)=lower($2) LIMIT 1", orgId, email);
      console.error(`[AUTH-DEBUG] query result rows=${rows?.length ?? 0}`);
      return rows[0] ?? null;
    });
    console.error(`[AUTH-DEBUG] productionUserByEmail result=${result ? 'found' : 'null'}`);
    return result;
  } catch (e) {
    console.error(`[AUTH-DEBUG] productionUserByEmail threw`, e);
    throw e;
  }
}

export async function login(req: LoginRequest): Promise<AuthResult> {
  console.error(`[AUTH-DEBUG-ENTRY] login called email=${req.email} orgId=${req.orgId} NODE_ENV=${process.env.NODE_ENV}`);
  if (!req.email || !req.password) throw authError("email and password required", 400, "BAD_REQUEST");
  if (process.env.NODE_ENV === "production") {
    if (!req.orgId) throw authError("orgId is required for tenant-scoped authentication", 400, "ORG_ID_REQUIRED");
    const user = await productionUserByEmail(req.email, req.orgId);
    if (!user || !user.passwordHash || !(await bcrypt.compare(req.password, user.passwordHash))) throw authError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    const refreshToken = makeProductionRefreshToken(req.orgId), secret = refreshToken.slice(req.orgId.length + 1), hash = crypto.createHash("sha256").update(secret).digest("hex");
    await withTenant(prisma as never, req.orgId, async (tx: unknown) => { await (tx as any).$executeRawUnsafe("INSERT INTO refresh_tokens (id,user_id,org_id,token_hash,expires_at) VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,now()+interval '7 days')", user.id, req.orgId, hash); });
    return issue(user, refreshToken);
  }
  // Test mode: try database first (for e2e tests with real DB), fallback to seed users
  if (req.orgId) {
    console.error(`[AUTH-DEBUG] about to call productionUserByEmail email=${req.email} orgId=${req.orgId}`);
    try {
      const user = await productionUserByEmail(req.email, req.orgId);
      console.error(`[AUTH-DEBUG] productionUserByEmail returned user=${user ? 'found' : 'null'} passwordHash=${user?.passwordHash ? 'exists' : 'missing'}`);
      if (user && user.passwordHash) {
        const pwMatch = await bcrypt.compare(req.password, user.passwordHash);
        console.error(`[AUTH-DEBUG] bcrypt.compare result=${pwMatch}`);
        if (pwMatch) {
          console.error(`[AUTH-DEBUG] About to return issue() token`);
          try {
            const result = issue(user, createRefreshToken(user.id).token);
            console.error(`[AUTH-DEBUG] issue() returned successfully`);
            return result;
          } catch (e) {
            console.error(`[AUTH-DEBUG] issue() threw`, e);
            throw e;
          }
        }
      }
      console.error(`[AUTH-DEBUG] DB lookup returned null or password mismatch for email=${req.email} orgId=${req.orgId} user=${JSON.stringify(user)}`);
    } catch (e) { console.error(`[AUTH-DEBUG] CATCH BLOCK TRIGGERED for email=${req.email} orgId=${req.orgId}`, e); }
  }
  console.error(`[AUTH-DEBUG] Reached seed user fallback for email=${req.email} orgId=${req.orgId}`);
  const user = findUserByEmail(req.email, req.orgId);
  if (!user || !(await verifyPassword(user, req.password))) throw authError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  return issue(user, createRefreshToken(user.id).token);
}

export async function ssoCallback(req: SsoCallbackRequest): Promise<AuthResult> {
  if (process.env.NODE_ENV === "production") throw authError("SSO is not configured for this deployment", 503, "SSO_NOT_CONFIGURED");
  if (!req.provider) throw authError("provider required", 400, "BAD_REQUEST");
  let email = req.email;
  if (!email && req.code) { try { const decoded = Buffer.from(req.code, "base64").toString("utf8"); email = decoded.includes("@") ? decoded : req.code; } catch { email = req.code; } }
  if (!email) throw authError("code/email required", 400, "BAD_REQUEST");
  const user = findUserByEmail(email); if (!user) throw authError("SSO user not found");
  if (user.ssoProvider && user.ssoProvider !== req.provider) throw authError("SSO provider mismatch");
  return issue(user, createRefreshToken(user.id).token);
}

export async function refreshAccessToken(refreshTokenStr: string): Promise<AuthResult> {
  if (process.env.NODE_ENV === "production") {
    const { orgId, secret } = splitProductionRefreshToken(refreshTokenStr);
    const hash = crypto.createHash("sha256").update(secret).digest("hex");
    return withTenant(prisma as never, orgId, async (tx: unknown) => {
      const p = tx as any;
      const rows = await p.$queryRawUnsafe("SELECT rt.id, rt.user_id AS \"userId\", rt.expires_at AS \"expiresAt\", u.org_id AS \"orgId\", u.email, u.name, u.role FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id WHERE rt.token_hash=$1 AND rt.org_id=$2::uuid AND rt.revoked_at IS NULL LIMIT 1", hash, orgId);
      const rt = rows[0]; if (!rt || new Date(rt.expiresAt) <= new Date()) throw authError("Refresh token expired or revoked");
      await p.$executeRawUnsafe("UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1::uuid AND revoked_at IS NULL", rt.id);
      const next = makeProductionRefreshToken(orgId), nextHash = crypto.createHash("sha256").update(next.slice(orgId.length + 1)).digest("hex");
      await p.$executeRawUnsafe("INSERT INTO refresh_tokens (id,user_id,org_id,token_hash,expires_at) VALUES (gen_random_uuid(),$1::uuid,$2::uuid,$3,now()+interval '7 days')", rt.userId, orgId, nextHash);
      return issue({ id: rt.userId, orgId: rt.orgId, email: rt.email, name: rt.name, role: rt.role }, next);
    });
  }
  const rt = findRefreshToken(refreshTokenStr); if (!rt || rt.revokedAt || rt.expiresAt <= new Date()) throw authError("Refresh token expired or revoked");
  // Try seed users first, then database
  let user = findUserById(rt.userId);
  if (!user) {
    try {
      const rows = await (prisma as any).$queryRawUnsafe("SELECT id, org_id AS \"orgId\", email, name, role, password_hash AS \"passwordHash\", sso_provider AS \"ssoProvider\" FROM users WHERE id=$1::uuid LIMIT 1", rt.userId);
      if (rows[0]) user = rows[0];
    } catch { /* ignore */ }
  }
  if (!user) throw authError("User not found");
  revokeRefreshToken(rt.id); return issue(user, createRefreshToken(user.id).token);
}

export async function logout(refreshTokenStr: string): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    const { orgId, secret } = splitProductionRefreshToken(refreshTokenStr), hash = crypto.createHash("sha256").update(secret).digest("hex");
    await withTenant(prisma as never, orgId, async (tx: unknown) => { await (tx as any).$executeRawUnsafe("UPDATE refresh_tokens SET revoked_at=now() WHERE token_hash=$1 AND org_id=$2::uuid AND revoked_at IS NULL", hash, orgId); });
    return;
  }
  const rt = findRefreshToken(refreshTokenStr); if (rt) revokeRefreshToken(rt.id);
}
export function getUserById(id: string) { return findUserById(id); }
