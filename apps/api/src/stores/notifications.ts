/**
 * Notifications store — TASK-026
 * Mirrors notifications table (03_DATA_MODEL.md)
 */

import { v4 as uuidv4 } from "uuid";

export interface Notification {
  id: string;
  orgId: string;
  userId: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

const notifications = new Map<string, Notification>();
const byUser = new Map<string, Set<string>>();
const byOrg = new Map<string, Set<string>>();

export function clearNotifications(): void {
  notifications.clear();
  byUser.clear();
  byOrg.clear();
}

export function createNotification(n: Omit<Notification, "id" | "createdAt" | "read"> & { read?: boolean }): Notification {
  const id = uuidv4();
  const created: Notification = { ...n, id, read: n.read ?? false, createdAt: new Date().toISOString() };
  notifications.set(id, created);
  if (!byUser.has(n.userId)) byUser.set(n.userId, new Set());
  byUser.get(n.userId)!.add(id);
  if (!byOrg.has(n.orgId)) byOrg.set(n.orgId, new Set());
  byOrg.get(n.orgId)!.add(id);
  return created;
}

export function listNotifications(userId: string, orgId?: string): Notification[] {
  const ids = byUser.get(userId);
  if (!ids) return [];
  const out: Notification[] = [];
  for (const id of ids) {
    const r = notifications.get(id);
    if (!r) continue;
    if (orgId && r.orgId !== orgId) continue;
    out.push(r);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listNotificationsByOrg(orgId: string): Notification[] {
  const ids = byOrg.get(orgId);
  if (!ids) return [];
  const out: Notification[] = [];
  for (const id of ids) {
    const r = notifications.get(id);
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function markRead(notificationId: string, userId: string): Notification | undefined {
  const n = notifications.get(notificationId);
  if (!n || n.userId !== userId) return undefined;
  n.read = true;
  notifications.set(notificationId, n);
  return n;
}

export function getNotification(id: string): Notification | undefined {
  return notifications.get(id);
}
