import crypto from "crypto";

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

// In-memory store for tests
const store = new Map<string, RefreshToken>();

export function createRefreshToken(userId: string, expiresInDays = 7): { token: string; entity: RefreshToken } {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const entity: RefreshToken = {
    id: crypto.randomUUID(),
    userId,
    tokenHash,
    expiresAt,
    revokedAt: null,
  };

  store.set(entity.id, entity);
  return { token, entity };
}

export function findRefreshToken(token: string): RefreshToken | null {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  for (const rt of store.values()) {
    if (rt.tokenHash === tokenHash) return rt;
  }
  return null;
}

export function revokeRefreshToken(id: string): void {
  const rt = store.get(id);
  if (rt) {
    rt.revokedAt = new Date();
  }
}
