/**
 * @bta/api — Core API Service
 * Owns: organizations, workspaces, projects, users, RBAC.
 */

import { API_BASE, requireOrgId } from "@bta/shared";
import { createApp as createExpressApp } from "./app";
import { prisma } from "./db/client";
import { initializeRepositories } from "./repositories";

export const SERVICE_NAME = "core-api";
export const SERVICE_VERSION = "0.1.0";

export interface HealthResponse {
  service: string;
  version: string;
  status: "ok";
}

export function getHealth(): HealthResponse {
  return { service: SERVICE_NAME, version: SERVICE_VERSION, status: "ok" };
}

export function tenantWhere(orgId: string | undefined, extra: Record<string, unknown> = {}) {
  const tenantId = requireOrgId(orgId);
  return { org_id: tenantId, ...extra };
}

export function createApp() {
  return createExpressApp();
}

export { createExpressApp };
export { openApiSpec } from "./openapi";

/**
 * Production startup is explicit: configure the persistence boundary before
 * accepting traffic. Tests may call createApp() without initializing Prisma.
 */
export function initializeProductionRuntime(): void {
  const production = process.env.NODE_ENV === "production";
  const backend = (process.env.STORAGE_BACKEND || (production ? "" : "memory")) as "postgres" | "memory";

  if (production && backend !== "postgres") {
    throw new Error("CRITICAL SECURITY INVARIANT VIOLATION: production requires STORAGE_BACKEND=postgres");
  }
  if (production && !process.env.DATABASE_URL) {
    throw new Error("CRITICAL PERSISTENCE VIOLATION: production requires DATABASE_URL");
  }
  if (production) {
    const secret = process.env.JWT_SECRET || process.env.JWT_PRIVATE_KEY;
    if (!secret || secret.length < 32 || secret === "dev-secret" || secret === "change-me") {
      throw new Error("CRITICAL SECURITY VIOLATION: production requires JWT_SECRET/JWT_PRIVATE_KEY >=32 chars and not a default value");
    }
    if (!process.env.JWT_ISSUER || !process.env.JWT_AUDIENCE) {
      throw new Error("CRITICAL SECURITY VIOLATION: production requires JWT_ISSUER and JWT_AUDIENCE");
    }
    if (!process.env.WEBHOOK_SIGNING_SECRET || process.env.WEBHOOK_SIGNING_SECRET.length < 16) {
      console.warn("[core-api] WARNING: WEBHOOK_SIGNING_SECRET not set or too short — webhook delivery will fail until configured");
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initializeRepositories(backend, backend === "postgres" ? (prisma as any) : undefined);
}

if (require.main === module) {
  initializeProductionRuntime();
  const app = createApp();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  const server = app.listen(port, () => {
    console.log(`[${SERVICE_NAME}] v${SERVICE_VERSION} — listening on :${port} basePath=${API_BASE}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[${SERVICE_NAME}] received ${signal}; shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
