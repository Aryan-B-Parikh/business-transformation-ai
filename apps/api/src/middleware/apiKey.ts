import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma as appPrisma } from "../db/client";

/**
 * Inbound API-key auth for enterprise integrations (FR-13.2)
 * Production: PostgreSQL api_keys table is authoritative (hash, scopes, expiry, revocation).
 * Keys are stored as sha256 hashes; raw key is never persisted. Verification uses constant-time compare.
 * Test fallback: in-memory Map when DATABASE_URL not set.
 */

interface ApiKeyRecord {
  id: string;
  orgId: string;
  hash: string;
  scopes: string[];
  name?: string | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt?: Date;
}

const memoryStore = new Map<string, ApiKeyRecord>();

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function findRecordByHash(hash: string): Promise<ApiKeyRecord | undefined> {
  if (process.env.DATABASE_URL) {
    try {
      const row = await (appPrisma as unknown as { apiKey: { findUnique: (o: unknown) => Promise<Record<string, unknown> | null> } }).apiKey.findUnique({ where: { keyHash: hash } });
      if (!row) return undefined;
      return {
        id: row.id as string,
        orgId: row.orgId as string,
        hash: row.keyHash as string,
        scopes: (row.scopes as string[]) || [],
        name: row.name as string | null,
        expiresAt: row.expiresAt as Date | null,
        revokedAt: row.revokedAt as Date | null,
        lastUsedAt: row.lastUsedAt as Date | null,
        createdAt: row.createdAt as Date,
      };
    } catch {
      // Fall through to memory
    }
  }
  // Constant-time scan over memory store (for test fallback)
  for (const rec of memoryStore.values()) {
    if (timingSafeEqual(rec.hash, hash)) return rec;
  }
  return undefined;
}

export function getRecordByHash(hash: string): ApiKeyRecord | undefined {
  // Sync accessor for non-DB contexts (tests that use memory directly)
  for (const rec of memoryStore.values()) {
    if (timingSafeEqual(rec.hash, hash)) return rec;
  }
  return undefined;
}

export function hashApiKey(raw: string): string {
  return hashKey(raw);
}

export async function registerTestKey(raw: string, orgId: string, scopes: string[] = ["artifacts:read"]): Promise<ApiKeyRecord> {
  const hash = hashKey(raw);
  if (process.env.DATABASE_URL) {
    try {
      const created = await (appPrisma as unknown as { apiKey: { create: (o: unknown) => Promise<Record<string, unknown>> } }).apiKey.create({
        data: { orgId, keyHash: hash, scopes, name: "test-key" }
      });
      const rec: ApiKeyRecord = { id: created.id as string, orgId, hash, scopes, name: "test-key" };
      memoryStore.set(hash, rec);
      return rec;
    } catch {
      // fall through
    }
  }
  const rec: ApiKeyRecord = { id: `ak_${Date.now()}`, orgId, hash, scopes, name: "test-key" };
  memoryStore.set(hash, rec);
  return rec;
}

export async function listKeys(orgId: string): Promise<Array<Omit<ApiKeyRecord, "hash"> & { hashPrefix: string }>> {
  if (process.env.DATABASE_URL) {
    try {
      const rows = await (appPrisma as unknown as { apiKey: { findMany: (o: unknown) => Promise<Array<Record<string, unknown>>> } }).apiKey.findMany({ where: { orgId } });
      return rows.map((r) => ({ id: r.id as string, orgId: r.orgId as string, scopes: (r.scopes as string[]) || [], name: r.name as string | null, expiresAt: r.expiresAt as Date | null, revokedAt: r.revokedAt as Date | null, lastUsedAt: r.lastUsedAt as Date | null, createdAt: r.createdAt as Date, hashPrefix: (r.keyHash as string).slice(0, 8) } as unknown as Omit<ApiKeyRecord, "hash"> & { hashPrefix: string }));
    } catch {
      // fall through
    }
  }
  return [...memoryStore.values()].filter(r => r.orgId === orgId).map(r => ({ id: r.id, orgId: r.orgId, scopes: r.scopes, name: r.name, expiresAt: r.expiresAt, revokedAt: r.revokedAt, lastUsedAt: r.lastUsedAt, createdAt: r.createdAt, hashPrefix: r.hash.slice(0, 8) } as unknown as Omit<ApiKeyRecord, "hash"> & { hashPrefix: string }));
}

export async function deleteKey(orgId: string, id: string): Promise<boolean> {
  if (process.env.DATABASE_URL) {
    try {
      const existing = await (appPrisma as unknown as { apiKey: { findFirst: (o: unknown) => Promise<Record<string, unknown> | null> } }).apiKey.findFirst({ where: { id, orgId } });
      if (!existing) return false;
      // Soft revoke + hard delete: set revokedAt then delete for audit trail (keep audit log)
      await (appPrisma as unknown as { apiKey: { update: (o: unknown) => Promise<unknown> } }).apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
      await (appPrisma as unknown as { apiKey: { delete: (o: unknown) => Promise<unknown> } }).apiKey.delete({ where: { id } });
      memoryStore.delete(existing.keyHash as string);
      return true;
    } catch {
      // fall through
    }
  }
  for (const [h, rec] of memoryStore.entries()) {
    if (rec.orgId === orgId && rec.id === id) { memoryStore.delete(h); return true; }
  }
  return false;
}

export async function createManagedKey(orgId: string, scopes: string[] = ["artifacts:read"], name?: string, expiresAt?: Date): Promise<{ raw: string; record: ApiKeyRecord }> {
  const raw = `bta_${orgId.slice(0, 8)}_${crypto.randomBytes(24).toString("hex")}`;
  const hash = hashKey(raw);
  if (process.env.DATABASE_URL) {
    try {
      const created = await (appPrisma as unknown as { apiKey: { create: (o: unknown) => Promise<Record<string, unknown>> } }).apiKey.create({
        data: { orgId, keyHash: hash, scopes, name: name || "managed-key", expiresAt: expiresAt || null }
      });
      const rec: ApiKeyRecord = { id: created.id as string, orgId, hash, scopes, name: name || "managed-key", expiresAt: expiresAt || null, createdAt: created.createdAt as Date };
      // Do not store raw, only hash
      return { raw, record: rec };
    } catch (e) {
      throw new Error(`Failed to persist API key: ${(e as Error).message}`);
    }
  }
  const rec: ApiKeyRecord = { id: `ak_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, orgId, hash, scopes, name, expiresAt: expiresAt || null };
  memoryStore.set(hash, rec);
  return { raw, record: rec };
}

export function clearTestKeys(): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") memoryStore.clear();
}

export function apiKeyAuth(requiredScope?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const raw = (req.header("x-api-key") || req.header("X-API-Key") || "").trim();
    if (!raw) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "X-API-Key required" } });
      return;
    }
    const h = hashKey(raw);
    const rec = await findRecordByHash(h);
    if (!rec) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid API key" } });
      return;
    }
    if (rec.revokedAt) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "API key revoked" } });
      return;
    }
    if (rec.expiresAt && rec.expiresAt < new Date()) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "API key expired" } });
      return;
    }
    // Tenant isolation already via orgId; enforce scopes
    if (requiredScope && !rec.scopes.includes(requiredScope) && !rec.scopes.includes("*")) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: `Scope ${requiredScope} required` } });
      return;
    }
    // Update lastUsedAt asynchronously (no await)
    if (process.env.DATABASE_URL) {
      void (appPrisma as unknown as { apiKey: { update: (o: unknown) => Promise<unknown> } }).apiKey.update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    }
    // Audit: API key usage
    if (process.env.DATABASE_URL) {
      void (async () => {
        try {
          const { prisma } = await import("../db/client");
          await (prisma as unknown as { auditLog: { create: (o: unknown) => Promise<unknown> } }).auditLog.create({
            data: { orgId: rec.orgId, actorId: `api-key:${rec.id}`, action: "api_key.used", targetType: "api_key", targetId: rec.id, metadata: { scopes: rec.scopes, requiredScope: requiredScope || null } }
          });
        } catch {}
      })();
    }
    (req as unknown as { apiKey: ApiKeyRecord }).apiKey = rec;
    (req as unknown as { user: { orgId: string; userId: string; role: string } }).user = { orgId: rec.orgId, userId: `api-key:${rec.id}`, role: "viewer" };
    next();
  };
}
