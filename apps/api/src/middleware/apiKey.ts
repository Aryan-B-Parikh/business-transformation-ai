import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Inbound API-key auth for enterprise integrations (FR-13.2)
 * Keys are stored as sha256 hashes; header X-API-Key contains raw key.
 * For now memory-backed; persist to DB via `api_keys` table when available.
 * Test-only: call registerTestKey() to seed.
 */

interface ApiKeyRecord {
  id: string;
  orgId: string;
  hash: string;
  scopes: string[];
  expiresAt?: Date;
}

const store = new Map<string, ApiKeyRecord>(); // hash -> record

function hashKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function getRecordByHash(hash: string): ApiKeyRecord | undefined {
  return store.get(hash);
}

export function hashApiKey(raw: string): string {
  return hashKey(raw);
}

export function registerTestKey(raw: string, orgId: string, scopes: string[] = ["artifacts:read"]): ApiKeyRecord {
  const rec: ApiKeyRecord = { id: `ak_${Date.now()}`, orgId, hash: hashKey(raw), scopes };
  store.set(rec.hash, rec);
  return rec;
}

export function listKeys(orgId: string): Array<Omit<ApiKeyRecord, "hash"> & { hashPrefix: string }> {
  return [...store.values()].filter(r => r.orgId === orgId).map(r => ({ id: r.id, orgId: r.orgId, scopes: r.scopes, expiresAt: r.expiresAt, hashPrefix: r.hash.slice(0, 8) } as unknown as Omit<ApiKeyRecord, "hash"> & { hashPrefix: string }));
}

export function deleteKey(orgId: string, id: string): boolean {
  for (const [h, rec] of store.entries()) {
    if (rec.orgId === orgId && rec.id === id) { store.delete(h); return true; }
  }
  return false;
}

export function createManagedKey(orgId: string, scopes: string[] = ["artifacts:read"]): { raw: string; record: ApiKeyRecord } {
  const raw = `bta_${orgId.slice(0, 8)}_${require("crypto").randomBytes(24).toString("hex")}`;
  const rec: ApiKeyRecord = { id: `ak_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, orgId, hash: hashKey(raw), scopes };
  store.set(rec.hash, rec);
  return { raw, record: rec };
}

export function clearTestKeys(): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST === "true") store.clear();
}

export function apiKeyAuth(requiredScope?: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const raw = (req.header("x-api-key") || req.header("X-API-Key") || "").trim();
    if (!raw) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "X-API-Key required" } });
      return;
    }
    const h = hashKey(raw);
    const rec = store.get(h);
    if (!rec) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid API key" } });
      return;
    }
    if (rec.expiresAt && rec.expiresAt < new Date()) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "API key expired" } });
      return;
    }
    if (requiredScope && !rec.scopes.includes(requiredScope) && !rec.scopes.includes("*")) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: `Scope ${requiredScope} required` } });
      return;
    }
    (req as unknown as { apiKey: ApiKeyRecord }).apiKey = rec;
    (req as unknown as { user: { orgId: string; userId: string; role: string } }).user = { orgId: rec.orgId, userId: `api-key:${rec.id}`, role: "viewer" };
    next();
  };
}
