/**
 * Audit logs store — TASK-023, TASK-028
 * Mirrors audit_logs table (03_DATA_MODEL.md)
 */

import { v4 as uuidv4 } from "uuid";

export interface AuditLog {
  id: string;
  orgId: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const logs = new Map<string, AuditLog>();
const byOrg = new Map<string, Set<string>>();

export function clearAuditLogs(): void {
  logs.clear();
  byOrg.clear();
}

export function createAuditLog(entry: Omit<AuditLog, "id" | "createdAt">): AuditLog {
  const id = uuidv4();
  const created: AuditLog = { ...entry, id, createdAt: new Date().toISOString() };
  logs.set(id, created);
  if (!byOrg.has(entry.orgId)) byOrg.set(entry.orgId, new Set());
  byOrg.get(entry.orgId)!.add(id);
  return created;
}

export function listAuditLogs(orgId: string, filters?: { actor?: string; action?: string; from?: string; to?: string }): AuditLog[] {
  const ids = byOrg.get(orgId);
  if (!ids) return [];
  const out: AuditLog[] = [];
  for (const id of ids) {
    const r = logs.get(id);
    if (!r) continue;
    if (filters?.actor && r.actorId !== filters.actor) continue;
    if (filters?.action && r.action !== filters.action) continue;
    if (filters?.from && r.createdAt < filters.from) continue;
    if (filters?.to && r.createdAt > filters.to) continue;
    out.push(r);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAuditLog(id: string): AuditLog | undefined {
  return logs.get(id);
}
