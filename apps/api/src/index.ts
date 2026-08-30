/**
 * @bta/api — Core API Service
 * Owns: organizations, workspaces, projects, users, RBAC (02_TECHNICAL_ARCHITECTURE.md §2.1)
 * API surface documented in 04_API_SPEC.md
 */

import { API_BASE, requireOrgId } from "@bta/shared";
import { createApp as createExpressApp } from "./app";

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

// Tenant-scoped query helper — enforces org_id on every DB query (03_DATA_MODEL.md RLS note)
export function tenantWhere(orgId: string | undefined, extra: Record<string, unknown> = {}) {
  const tenantId = requireOrgId(orgId);
  return { org_id: tenantId, ...extra };
}

// Real Express app (TASK-003+) — also keep legacy placeholder shape for backwards compat
export function createApp() {
  return createExpressApp();
}

export { createExpressApp };
export { openApiSpec } from "./openapi";

if (require.main === module) {
  const app = createApp();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  app.listen(port, () => {
    console.log(`[${SERVICE_NAME}] v${SERVICE_VERSION} — listening on :${port} basePath=${API_BASE}`);
  });
}
