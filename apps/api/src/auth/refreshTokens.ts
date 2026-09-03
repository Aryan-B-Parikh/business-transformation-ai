import crypto from "crypto";

export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

// In-memory store for tests — use globalThis to survive vitest module re-evaluation
declare global {
  // eslint-disable-next-line no-var
  var __bta_refresh_tokens: Map<string, RefreshToken> | undefined;
}
const store: Map<string, RefreshToken> = globalThis.__bta_refresh_tokens ?? new Map<string, RefreshToken>();
globalThis.__bta_refresh_tokens = store;

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
  if (process.env.CI || process.env.VITEST) console.error(`[REFRESH-CREATE] userId=${userId} tokenHash=${tokenHash.substring(0, 8)}... storeSize=${store.size}`);
  return { token, entity };
}

export function findRefreshToken(token: string): RefreshToken | null {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  if (process.env.CI || process.env.VITEST) console.error(`[REFRESH-FIND] looking for tokenHash=${tokenHash.substring(0, 8)}... storeSize=${store.size}`);
  for (const rt of store.values()) {
    if (process.env.CI || process.env.VITEST) console.error(`[REFRESH-FIND] checking tokenHash=${rt.tokenHash.substring(0, 8)}... match=${rt.tokenHash === tokenHash}`);
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
