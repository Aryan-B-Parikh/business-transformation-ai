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
