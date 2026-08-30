/**
 * Tenant isolation helpers — RLS enforcement (02_TECHNICAL_ARCHITECTURE.md §5, 03_DATA_MODEL.md §216)
 *
 * Every table except `organizations` carries `org_id`. Postgres RLS policies
 * compare `org_id = current_setting('app.current_org_id')::uuid`. The app must
 * set this GUC per transaction/request. Without it, RLS returns zero rows.
 *
 * This module provides:
 *  - withTenant<T>(prisma, orgId, fn) — sets GUC then runs fn inside a transaction
 *  - tenantWhere() — app-layer defense-in-depth filter (still required even with RLS)
 *  - assertTenant() — fail-fast if orgId missing
 */

import { requireOrgId } from "@bta/shared";

/** Fail-fast if tenant context missing */
export function assertTenant(orgId: string | undefined | null): string {
  return requireOrgId(orgId ?? undefined);
}

/** App-layer filter — defense in depth even though RLS also enforces */
export function tenantWhere(orgId: string | undefined, extra: Record<string, unknown> = {}) {
  const tenantId = assertTenant(orgId);
  return { org_id: tenantId, ...extra } as Record<string, unknown>;
}

/** SQL to set tenant GUC — use inside a transaction */
export function setTenantSql(orgId: string): string {
  // Use SET LOCAL so it only lives for the transaction
  const safe = orgId.replace(/'/g, "''");
  return `SELECT set_config('app.current_org_id', '${safe}', true)`;
}

/**
 * Run fn inside a transaction with the tenant GUC set.
 * Requires a Prisma client with $transaction and $executeRawUnsafe / $queryRaw.
 * Example:
 *   await withTenant(prisma, orgId, async (tx) => tx.workspace.findMany());
 */
export async function withTenant<T>(
  prisma: {
    $transaction: (fn: (tx: unknown) => Promise<T>) => Promise<T>;
    $executeRawUnsafe: (sql: string) => Promise<unknown>;
  },
  orgId: string,
  fn: (tx: unknown) => Promise<T>
): Promise<T> {
  const tenantId = assertTenant(orgId);
  return prisma.$transaction(async (tx: unknown) => {
    const p = tx as { $executeRawUnsafe: (sql: string) => Promise<unknown> };
    await p.$executeRawUnsafe(setTenantSql(tenantId));
    return fn(tx);
  });
}

/**
 * Client-side filtering simulation — used in unit tests to prove that without
 * tenant context, zero rows are returned (TASK-002 DoD).
 */
export function applyTenantFilter<T extends { org_id: string }>(
  rows: T[],
  orgId: string | undefined | null
): T[] {
  if (!orgId) return []; // RLS behaviour: no GUC => current_org_id() is null => zero rows
  return rows.filter((r) => r.org_id === orgId);
}

/** List of tables that MUST have RLS tenant_isolation policy */
export const RLS_TABLES = [
  "users",
  "workspaces",
  "projects",
  "project_members",
  "documents",
  "document_chunks",
  "conversations",
  "conversation_messages",
  "artifacts",
  "artifact_comments",
  "artifact_approvals",
  "roadmap_items",
  "effort_estimates",
  "maturity_snapshots",
  "audit_logs",
  "ai_model_configs",
  "notifications",
] as const;
